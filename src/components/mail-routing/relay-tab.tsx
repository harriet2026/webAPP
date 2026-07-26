"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, Loader2, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConditionTreeBuilder } from "@/components/rules/ConditionTreeBuilder";
import {
  getUnifiedRules,
  createUnifiedRule,
  updateUnifiedRule,
  deleteUnifiedRule,
  toggleUnifiedRule,
} from "@/lib/api/unified-rules";
import type {
  Rule,
  RuleNode,
  CreateRuleRequest,
  UpdateRuleRequest,
} from "@/types/unified-rules";
import { useScopedApiRequest } from "@/lib/api/client";
import { RelayGrantsCard } from "./relay-grants-card";

const RELAY_PAGE = "mail_routing_relay";
const RELAY_STAGE = "rcpt";
const RELAY_CLASS = "action";
const RELAY_ACTION = "accept";

const relaySchema = z.object({
  name: z.string().min(1, "nameRequired"),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(65535),
});
type RelayForm = z.infer<typeof relaySchema>;

const defaultTree: RuleNode = {
  type: "AND",
  // client_ip is an ip-typed field; its valid operators are eq/ne/cidr/match/within
  // (NOT `contain`, which is string-only and the backend rejects with 400). `cidr`
  // is the canonical operator for matching trusted-relay connecting IPs.
  children: [
    { type: "condition", field: "client_ip", operator: "cidr", value: "" },
  ],
};

function readSkipAntispam(metadata?: string): boolean {
  if (!metadata) return false;
  try {
    return Boolean(
      (JSON.parse(metadata) as { skip_antispam?: boolean }).skip_antispam,
    );
  } catch {
    return false;
  }
}

export function RelayTab({ tenantId }: { tenantId: number }) {
  const t = useTranslations("mailRouting.relay");
  const tGrants = useTranslations("mailRouting.relayGrants");
  const queryClient = useQueryClient();
  const { apiRequest } = useScopedApiRequest(tenantId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [conditionTree, setConditionTree] = useState<RuleNode>(defaultTree);
  const [skipAntispam, setSkipAntispam] = useState(false);
  const [active, setActive] = useState(true);

  const queryKey = ["unified-rules", RELAY_PAGE, tenantId];

  const { data: rules = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getUnifiedRules(
        { rule_class: RELAY_CLASS, stage: RELAY_STAGE, page: RELAY_PAGE },
        apiRequest,
      ),
  });

  const form = useForm<RelayForm>({
    resolver: zodResolver(relaySchema),
    defaultValues: { name: "", description: "", priority: 100 },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUnifiedRule(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t("deleted"));
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (r: Rule) => toggleUnifiedRule(r.id, !r.is_active, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t("updated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setConditionTree(defaultTree);
    setSkipAntispam(false);
    setActive(true);
    form.reset({ name: "", description: "", priority: 100 });
    setDialogOpen(true);
  }

  function openEdit(rule: Rule) {
    setEditing(rule);
    try {
      setConditionTree(
        rule.condition_tree
          ? (JSON.parse(rule.condition_tree) as RuleNode)
          : defaultTree,
      );
    } catch {
      setConditionTree(defaultTree);
    }
    setSkipAntispam(readSkipAntispam(rule.metadata));
    setActive(rule.is_active);
    form.reset({
      name: rule.name,
      description: rule.description ?? "",
      priority: rule.priority ?? 100,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: RelayForm) {
    setSubmitting(true);
    try {
      if (editing) {
        const payload: UpdateRuleRequest = {
          name: values.name,
          description: values.description ?? "",
          page: RELAY_PAGE,
          priority: values.priority,
          stage: RELAY_STAGE,
          action: RELAY_ACTION,
          condition_tree: conditionTree,
          metadata: { skip_antispam: skipAntispam },
          is_active: active,
        };
        await updateUnifiedRule(editing.id, payload, apiRequest);
        toast.success(t("updated"));
      } else {
        const payload: CreateRuleRequest = {
          name: values.name,
          description: values.description ?? "",
          page: RELAY_PAGE,
          rule_class: RELAY_CLASS,
          stage: RELAY_STAGE,
          action: RELAY_ACTION,
          priority: values.priority,
          condition_tree: conditionTree,
          metadata: { skip_antispam: skipAntispam },
          is_active: active,
        };
        await createUnifiedRule(payload, apiRequest);
        toast.success(t("created"));
      }
      queryClient.invalidateQueries({ queryKey });
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const columns: ColumnDef<Rule>[] = [
    { accessorKey: "name", header: t("columns.name") },
    { accessorKey: "priority", header: t("columns.priority") },
    {
      id: "skip",
      header: t("columns.skipAntispam"),
      cell: ({ row }) =>
        readSkipAntispam(row.original.metadata) ? t("yes") : t("no"),
    },
    {
      id: "status",
      header: t("columns.status"),
      cell: ({ row }) => (
        <StatusBadge
          status={
            row.original.is_active ? t("status.active") : t("status.inactive")
          }
          variant={row.original.is_active ? "success" : "default"}
        />
      ),
    },
    {
      id: "actions",
      header: t("columns.actions"),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleMutation.mutate(row.original)}
          >
            {row.original.is_active ? (
              <PowerOff className="h-4 w-4" />
            ) : (
              <Power className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => setDeleteId(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/*
        Two different things live on this tab, and conflating them is a security
        mistake: relay GRANTS decide whether a client may relay at all (no SMTP
        AUTH, gated by client IP AND sender domain), while the relay RULES below
        only decide whether an already-accepted mail skips anti-spam.
      */}
      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {tGrants("grantsCardSubtitle")}
        </p>
        <RelayGrantsCard tenantId={tenantId} />
      </section>

      <section className="space-y-2">
        <div className="flex items-end justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {t("rulesCardSubtitle")}
          </p>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t("add")}
          </Button>
        </div>
        {/* Persistent, not dialog-only: the strong "rules are NOT the relay
            authorization entry point" warning used to appear only after the
            operator had already opened the wrong dialog. */}
        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          data-testid="relay-rules-scope-banner"
        >
          {t("rulesScopeNotice")}
        </div>
      </section>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable columns={columns} data={rules} noDataText={t("empty")} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("edit") : t("add")}</DialogTitle>
            <div
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
              data-testid="relay-rules-scope-notice"
            >
              {t("rulesScopeNotice")}
            </div>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="relay-name">{t("fields.name")}</Label>
              <Input id="relay-name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {t("fields.nameRequired")}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="relay-desc">{t("fields.description")}</Label>
              <Input id="relay-desc" {...form.register("description")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="relay-priority">{t("fields.priority")}</Label>
              <Input
                id="relay-priority"
                type="number"
                {...form.register("priority", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                {t("priorityHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("fields.conditions")}</Label>
              <ConditionTreeBuilder
                value={conditionTree}
                onChange={setConditionTree}
                stage={RELAY_STAGE}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="relay-skip"
                checked={skipAntispam}
                onCheckedChange={setSkipAntispam}
              />
              <Label htmlFor="relay-skip">{t("fields.skipAntispam")}</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="relay-active"
                checked={active}
                onCheckedChange={setActive}
              />
              <Label htmlFor="relay-active">{t("fields.active")}</Label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("save")
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        onConfirm={() => {
          if (deleteId !== null) deleteMutation.mutate(deleteId);
        }}
        title={t("deleteConfirm.title")}
        description={t("deleteConfirm.description")}
        variant="destructive"
      />
    </div>
  );
}
