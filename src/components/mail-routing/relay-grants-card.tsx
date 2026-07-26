"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useScopedApiRequest } from "@/lib/api/client";
import {
  getRelayGrants,
  getRelayGrantPolicy,
  setRelayGrantPolicyEnabled,
  createRelayGrant,
  updateRelayGrant,
  deleteRelayGrant,
  type RelayGrant,
  type RelayGrantPayload,
} from "@/lib/api/relay-grants";
import { getTenantDomains } from "@/lib/api/tenants";

const ANY_SENDER = "__any__";

interface RelayGrantsCardProps {
  tenantId?: number;
}

/**
 * Unauthenticated relay authorization.
 *
 * The card exists to make the security model visible: a grant only works when the
 * client IP AND the sender domain both match, so operators can see at a glance who
 * may relay as which domain. The "any sender domain" option IS an open relay for
 * that network, so it is system-admin-only and confirmed separately.
 */
export function RelayGrantsCard({ tenantId }: RelayGrantsCardProps) {
  const t = useTranslations("mailRouting.relayGrants");
  const { apiRequest } = useScopedApiRequest(tenantId ?? null);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RelayGrant | null>(null);
  // Non-null while the dialog edits an existing grant (in-place PUT keeps the
  // grant id — deleting and recreating would briefly revoke the authorization
  // and orphan any log/rate-limit references to the old id).
  const [editTarget, setEditTarget] = useState<RelayGrant | null>(null);

  const [clientCidr, setClientCidr] = useState("");
  const [domainId, setDomainId] = useState<string>("");
  const [allowNullSender, setAllowNullSender] = useState(false);
  const [skipAntispam, setSkipAntispam] = useState(false);
  const [useSpf, setUseSpf] = useState(false);
  // The operator's own privileged choice, kept separate from the SPF/any-sender
  // derivation so un-toggling those can never leave a quietly-privileged grant
  // behind (GT-12235) while an out-of-pool CIDR grant stays expressible.
  const [manualPrivileged, setManualPrivileged] = useState(false);
  const [rateLimit, setRateLimit] = useState("");
  const [note, setNote] = useState("");
  const [privilegedConfirm, setPrivilegedConfirm] = useState("");

  const { data: grants = [], isLoading } = useQuery({
    queryKey: ["relay-grants", tenantId],
    queryFn: () => getRelayGrants(apiRequest),
  });

  const { data: policy } = useQuery({
    queryKey: ["relay-grant-policy", tenantId],
    queryFn: () => getRelayGrantPolicy(apiRequest),
  });

  const { data: domains = [] } = useQuery({
    queryKey: ["tenant-domains", tenantId],
    queryFn: () =>
      tenantId ? getTenantDomains(tenantId) : Promise.resolve([]),
    enabled: !!tenantId,
  });

  const verifiedDomains = domains.filter(
    (d) => d.verify_status === "verified" && d.is_active,
  );

  const resetForm = () => {
    setClientCidr("");
    setDomainId("");
    setAllowNullSender(false);
    setSkipAntispam(false);
    setUseSpf(false);
    setManualPrivileged(false);
    setRateLimit("");
    setNote("");
    setPrivilegedConfirm("");
  };

  const openCreate = () => {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (g: RelayGrant) => {
    setClientCidr(g.client_cidr);
    setDomainId(
      g.tenant_domain_id === null ? ANY_SENDER : String(g.tenant_domain_id),
    );
    setAllowNullSender(g.allow_null_sender);
    setSkipAntispam(g.skip_antispam);
    setUseSpf(g.use_spf);
    // Recover the operator's explicit choice: privileged that is NOT explained
    // by SPF / any-sender is a manually privileged (out-of-pool) grant.
    setManualPrivileged(
      g.privileged && !g.use_spf && g.tenant_domain_id !== null,
    );
    setRateLimit(g.rate_limit_per_hour ? String(g.rate_limit_per_hour) : "");
    setNote(g.note);
    // Editing an any-sender grant re-requires the CONFIRM phrase: it stays an
    // open relay for that network, so saving it must stay a deliberate act.
    setPrivilegedConfirm("");
    setEditTarget(g);
    setDialogOpen(true);
  };

  const buildPayload = (): RelayGrantPayload => ({
    tenant_id: tenantId,
    tenant_domain_id: domainId === ANY_SENDER ? null : Number(domainId),
    client_cidr: clientCidr.trim(),
    use_spf: useSpf,
    privileged,
    allow_null_sender: allowNullSender,
    skip_antispam: skipAntispam,
    rate_limit_per_hour: rateLimit ? Number(rateLimit) : null,
    note,
    // PUT is a full update: without echoing these back, editing a grant would
    // silently clear its expiry and re-activate a disabled one.
    ...(editTarget
      ? { is_active: editTarget.is_active, expires_at: editTarget.expires_at }
      : {}),
  });

  const onSaved = (msg: string) => {
    toast.success(msg);
    setDialogOpen(false);
    setEditTarget(null);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["relay-grants"] });
  };

  const createMutation = useMutation({
    mutationFn: () => createRelayGrant(buildPayload(), apiRequest),
    onSuccess: () => onSaved(t("created")),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (id: number) => updateRelayGrant(id, buildPayload(), apiRequest),
    onSuccess: () => onSaved(t("updated")),
    onError: (e: Error) => toast.error(e.message),
  });

  // GT-12140: the master switch had no control anywhere in the product. Grants
  // could be created and listed while the policy service answered DUNNO forever,
  // so every unauthenticated relay got 554 and the card only said "switch is off"
  // without offering any way to turn it on.
  const masterSwitchMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setRelayGrantPolicyEnabled(enabled, apiRequest),
    onSuccess: (policy) => {
      toast.success(
        policy.enabled ? t("masterSwitchEnabled") : t("masterSwitchDisabled"),
      );
      queryClient.invalidateQueries({ queryKey: ["relay-grant-policy"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRelayGrant(id, apiRequest),
    onSuccess: () => {
      toast.success(t("deleted"));
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["relay-grants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAnySender = domainId === ANY_SENDER;
  // "Any sender domain" is a real open relay for that network; require the operator
  // to type CONFIRM so it cannot be enabled by a stray click.
  const privilegedBlocked =
    isAnySender && privilegedConfirm.trim().toUpperCase() !== "CONFIRM";
  // System-admin gate: the policy's `can_privilege` flag mirrors the API's own
  // authorization for privileged/SPF/any-sender grants. Tenant admins see the
  // SPF toggle rendered disabled so the security model is visible but cannot
  // be bypassed from the UI.
  const isSystemAdmin = !!policy?.can_privilege;
  // GT-12235: the SPF / any-sender contribution to privileged is DERIVED, never
  // sticky. An SPF grant's effective scope is whatever the domain's DNS
  // publishes (outside the trusted pool), and an any-sender grant is an open
  // relay for its network — both are privileged by construction, and un-toggling
  // them drops that contribution immediately. On top of that sits the operator's
  // own explicit switch (manualPrivileged): the API's long-standing escape hatch
  // for authorizing a concrete domain from a network OUTSIDE the trusted pool
  // (e.g. a customer mail system on a public IP), which the derivation alone
  // made unreachable from the UI.
  const privilegedForced = useSpf || isAnySender;
  const privileged = privilegedForced || manualPrivileged;
  // Once SPF is on, the source IP is no longer required — the domain's DNS
  // record authorizes the source on its own.
  const cidrRequired = !useSpf;
  const canSubmit =
    (!cidrRequired || clientCidr.trim() !== "") &&
    domainId !== "" &&
    // SPF needs a concrete sender domain (there is no record to look up for
    // "any sender"); the option pair is disabled in the UI, this is the belt.
    !(useSpf && isAnySender) &&
    !privilegedBlocked;

  function onToggleUseSpf(next: boolean) {
    setUseSpf(next);
  }

  function onClientCidrChange(value: string) {
    setClientCidr(value);
    // A null-sender grant matches by IP alone; without a CIDR the API rejects
    // the combination (400). Drop the flag rather than letting a disabled
    // switch hold an invalid hidden state.
    if (value.trim() === "") setAllowNullSender(false);
  }

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{t("title")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("description")}
          </p>
          {policy && !policy.enabled && (
            <p
              className="mt-2 text-xs font-medium text-amber-600"
              data-testid="relay-master-switch-off"
            >
              {policy.can_privilege
                ? t("masterSwitchOffActionable")
                : t("masterSwitchOff")}
            </p>
          )}
          {policy && policy.trusted_cidrs.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("pool", { cidrs: policy.trusted_cidrs.join(", ") })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* System-admin only: this gate governs every tenant's grants, so a
              tenant admin sees its state but cannot flip it (also enforced by
              the API, which is the authority). */}
          {policy?.can_privilege && (
            <div className="flex items-center gap-2">
              <Label
                htmlFor="relay-master-switch"
                className="text-xs font-medium"
              >
                {t("masterSwitch")}
              </Label>
              <Switch
                id="relay-master-switch"
                data-testid="relay-master-switch"
                checked={policy.enabled}
                disabled={masterSwitchMutation.isPending}
                onCheckedChange={(v) => masterSwitchMutation.mutate(v)}
              />
            </div>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t("add")}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!isLoading && grants.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        )}
        {grants.map((g) => (
          <div
            key={g.id}
            className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
            data-testid={`relay-grant-${g.id}`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono">
                  {g.client_cidr === "" ? "—" : g.client_cidr}
                </span>
                {g.use_spf && (
                  <span
                    className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    data-testid="relay-grant-spf-badge"
                  >
                    {t("spfBadge")}
                  </span>
                )}
                <span className="text-muted-foreground">&rarr;</span>
                <span className="font-mono">
                  {g.tenant_domain_id === null
                    ? t("anySender")
                    : g.sender_domain}
                </span>
                {g.privileged && (
                  <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                    <ShieldAlert className="h-3 w-3" />
                    {t("privileged")}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {g.rate_limit_per_hour
                  ? t("rateLimited", { n: g.rate_limit_per_hour })
                  : t("noRateLimit")}
                {g.allow_null_sender && ` · ${t("allowNullSender")}`}
                {g.skip_antispam && ` · ${t("skipAntispam")}`}
                {g.note && ` · ${g.note}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEdit(g)}
                aria-label={t("edit")}
                data-testid="relay-grant-edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteTarget(g)}
                aria-label={t("delete")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditTarget(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? t("editTitle") : t("add")}</DialogTitle>
            <DialogDescription>{t("formHint")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="relay-cidr">{t("clientCidr")}</Label>
              <Input
                id="relay-cidr"
                placeholder="192.168.201.86/32"
                value={clientCidr}
                onChange={(e) => onClientCidrChange(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="relay-domain">{t("senderDomain")}</Label>
              <Select
                value={domainId}
                onValueChange={(v) => setDomainId(v ?? "")}
              >
                <SelectTrigger id="relay-domain">
                  <SelectValue placeholder={t("selectDomain")} />
                </SelectTrigger>
                <SelectContent>
                  {verifiedDomains.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.domain}
                    </SelectItem>
                  ))}
                  {policy?.can_privilege && (
                    <SelectItem value={ANY_SENDER} disabled={useSpf}>
                      {t("anySender")}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("senderDomainHint")}
              </p>
            </div>

            {isAnySender && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                  <ShieldAlert className="h-4 w-4" />
                  {t("anySenderWarningTitle")}
                </div>
                <p className="mt-1 text-xs text-red-700/90 dark:text-red-300/90">
                  {t("anySenderWarningBody")}
                </p>
                <Input
                  className="mt-2"
                  placeholder="CONFIRM"
                  value={privilegedConfirm}
                  onChange={(e) => setPrivilegedConfirm(e.target.value)}
                  aria-label={t("anySenderConfirm")}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="relay-rate">{t("rateLimit")}</Label>
                <Input
                  id="relay-rate"
                  type="number"
                  min={1}
                  placeholder={t("rateLimitPlaceholder")}
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="relay-note">{t("note")}</Label>
                <Input
                  id="relay-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="relay-null-sender">
                  {t("allowNullSender")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("allowNullSenderHint")}
                </p>
                {clientCidr.trim() === "" && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("allowNullSenderNeedsCidr")}
                  </p>
                )}
              </div>
              <Switch
                id="relay-null-sender"
                checked={allowNullSender}
                disabled={clientCidr.trim() === ""}
                onCheckedChange={setAllowNullSender}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="relay-skip-antispam">{t("skipAntispam")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("skipAntispamHint")}
                </p>
              </div>
              <Switch
                id="relay-skip-antispam"
                checked={skipAntispam}
                onCheckedChange={setSkipAntispam}
              />
            </div>

            {isSystemAdmin && (
              <div className="flex items-center justify-between">
                <div className="max-w-[80%]">
                  <Label htmlFor="relay-privileged">
                    {t("privilegedToggle")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("privilegedToggleHint")}
                  </p>
                  {privilegedForced && (
                    <p
                      className="mt-1 text-xs text-muted-foreground"
                      data-testid="relay-privileged-forced-notice"
                    >
                      {t("privilegedForcedNotice")}
                    </p>
                  )}
                </div>
                <Switch
                  id="relay-privileged"
                  data-testid="relay-privileged"
                  aria-label={t("privilegedToggle")}
                  checked={privileged}
                  disabled={privilegedForced}
                  onCheckedChange={setManualPrivileged}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="max-w-[80%]">
                <Label
                  htmlFor="relay-use-spf"
                  data-testid="relay-use-spf-label"
                >
                  {t("useSpf")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("useSpfHint")}
                </p>
                {useSpf && (
                  <p
                    className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400"
                    data-testid="relay-use-spf-privileged-notice"
                  >
                    {t("useSpfPrivilegedNotice")}
                  </p>
                )}
                {useSpf && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("useSpfCidrOptional")}
                  </p>
                )}
                {!isSystemAdmin && (
                  <p
                    className="mt-1 text-xs text-muted-foreground"
                    data-testid="relay-use-spf-tenant-admin-notice"
                  >
                    {t("useSpfTenantAdminNotice")}
                  </p>
                )}
                {isSystemAdmin && isAnySender && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("useSpfAnySenderExclusive")}
                  </p>
                )}
              </div>
              <Switch
                id="relay-use-spf"
                data-testid="relay-use-spf"
                aria-label={t("useSpf")}
                checked={useSpf}
                disabled={!isSystemAdmin || isAnySender}
                onCheckedChange={onToggleUseSpf}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setEditTarget(null);
                resetForm();
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={() =>
                editTarget
                  ? updateMutation.mutate(editTarget.id)
                  : createMutation.mutate()
              }
              disabled={
                !canSubmit ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteTitle")}
        description={t("deleteConfirm", {
          // A pure-SPF grant has no CIDR; identify it by its sender domain so
          // the confirm sentence never renders an empty blank.
          cidr: deleteTarget
            ? deleteTarget.client_cidr || deleteTarget.sender_domain || "—"
            : "",
        })}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
