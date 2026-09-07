import type { DisposalMailItem } from "@/types/email-disposal";
import { recipientActionLabelKey } from "@/lib/email-log-action";
import { formatDate } from "@/lib/utils";
import { mailTypeLabelKey } from "./detail-helpers";
import {
  formatListReason,
  formatMultiBasisListReason,
  groupsFromSummaries,
  hasStructuredBasisFacts,
  type DisposalLang,
} from "./disposal-basis-config";

type Translate = (key: string) => string;

export const DISPOSAL_TABLE_COLUMNS = [
  "time",
  "direction",
  "subject",
  "senderIp",
  "sender",
  "recipient",
  "disposalBasis",
  "mailType",
  "similarity",
  "action",
  "status",
] as const;

export type DisposalTableColumn = (typeof DISPOSAL_TABLE_COLUMNS)[number];

export function visibleDisposalColumns(
  hiddenColumns: ReadonlySet<string>,
  includeSimilarity: boolean,
): DisposalTableColumn[] {
  return DISPOSAL_TABLE_COLUMNS.filter(
    (column) =>
      (column !== "similarity" || includeSimilarity) &&
      !hiddenColumns.has(column),
  );
}

interface DisposalCsvOptions {
  t: Translate;
  lang: DisposalLang;
  formatTimestamp?: (value: string) => string;
}

function translatedOr(t: Translate, key: string, fallback: string): string {
  const translated = t(key);
  return translated && translated !== key ? translated : fallback;
}

function formatDisposalBasis(
  item: DisposalMailItem,
  lang: DisposalLang,
): string {
  const groups = groupsFromSummaries(
    item.disposalBasis,
    item.disposalBasisGroups,
  );
  if (groups.length === 0) {
    if (item.reason?.trim().toLowerCase() === "no rules matched") return "-";
    if (!item.reason || hasStructuredBasisFacts(item.disposalBasis)) return "—";
    return item.reason;
  }
  if (groups.length === 1) {
    const entry = groups[0]?.entries[0] ?? item.disposalBasis;
    return (entry && formatListReason(entry, lang)) || item.reason || "—";
  }
  return formatMultiBasisListReason(groups, lang) || item.reason || "—";
}

function formatAction(item: DisposalMailItem, t: Translate): string {
  if (!item.action) return "—";
  return translatedOr(t, `filters.actions.${item.action}`, item.action);
}

function formatStatuses(item: DisposalMailItem, t: Translate): string {
  const entries = item.displayStatuses ?? [];
  if (entries.length === 0) return "—";
  return entries
    .map((entry) => {
      const label = translatedOr(
        t,
        `filters.statuses.${entry.status}`,
        entry.status,
      );
      return entries.length === 1 ? label : `${label}×${entry.count}`;
    })
    .join("; ");
}

function columnValue(
  item: DisposalMailItem,
  column: DisposalTableColumn,
  options: Required<DisposalCsvOptions>,
): string | number {
  const { t, lang, formatTimestamp } = options;
  switch (column) {
    case "time":
      return formatTimestamp(item.timestamp);
    case "direction":
      return translatedOr(t, `filters.${item.direction}`, item.direction || "—");
    case "subject":
      return item.subject || "—";
    case "senderIp":
      return item.clientIp || "—";
    case "sender":
      return item.sender || "—";
    case "recipient":
      return (item.recipientList ?? (item.recipient ? [item.recipient] : []))
        .join(", ") || "—";
    case "disposalBasis":
      return formatDisposalBasis(item, lang);
    case "mailType":
      return item.emailType
        ? translatedOr(t, mailTypeLabelKey(item.emailType), item.emailType)
        : "—";
    case "similarity":
      return item.similarity == null ? "—" : `${item.similarity}%`;
    case "action":
      return formatAction(item, t);
    case "status":
      return formatStatuses(item, t);
  }
}

/**
 * Build rows from the table's actual visible-column model. The recipient-detail
 * column is intentionally appended: GT-12923 added it after GT-12763 so mixed
 * recipient outcomes remain available without making it a display column.
 */
export function buildDisposalCsvRows(
  items: DisposalMailItem[],
  columns: readonly DisposalTableColumn[],
  options: DisposalCsvOptions,
): Array<Array<string | number>> {
  const resolvedOptions: Required<DisposalCsvOptions> = {
    ...options,
    formatTimestamp: options.formatTimestamp ?? formatDate,
  };
  return [
    [
      ...columns.map((column) => options.t(`table.${column}`)),
      options.t("batch.csvRecipientDetail"),
    ],
    ...items.map((item) => [
      ...columns.map((column) =>
        columnValue(item, column, resolvedOptions),
      ),
      formatRecipientDetail(item, options.t),
    ]),
  ];
}

export function buildDisposalCsv(
  items: DisposalMailItem[],
  columns: readonly DisposalTableColumn[],
  options: DisposalCsvOptions,
): string {
  const escapeCsv = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF${buildDisposalCsvRows(items, columns, options)
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n")}`;
}

/**
 * Mixed messages need an explicit recipient-to-action mapping in exports;
 * the existing recipient/action/status columns only describe the aggregate.
 */
export function formatRecipientDetail(
  item: DisposalMailItem,
  t: Translate,
): string {
  if (item.action !== "mixed" || !item.recipientDispositions?.length) {
    return "";
  }
  return item.recipientDispositions
    .map((disposition) => {
      const rawAction = (
        disposition.final_action ||
        disposition.original_action ||
        ""
      ).toLowerCase();
      const label = t(recipientActionLabelKey(rawAction));
      return `${disposition.recipient}: ${label}`;
    })
    .join("; ");
}
