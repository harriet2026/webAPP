import type { useTranslations } from "next-intl";
import type { DisposalMailItem } from "@/types/email-disposal";
import { actionCategory, labelKeyFor } from "../components/recipient-status-badges";

// 跟项目里其他 t 参数（如 threat-summary-card.tsx）保持同样的类型写法，
// 而不是自己定义一个偏窄的函数签名类型——next-intl 的 Translator 类型有
// 重载和更严格的参数类型，用简化签名会在调用处报类型不兼容。
type Translate = ReturnType<typeof useTranslations>;

// GT-12923 阶段五（任务20）：CSV 导出此前把"收件人"列直接 join 成一个字符
// 串、"状态"列只输出 item.displayStatus——对 mixed 记录（同一封邮件不同
// 收件人执行了不同处置动作）而言，这两列合起来看不出"哪个收件人对应哪个
// 动作"，跟阶段四已经在列表页/详情抽屉里做到的收件人级粒度不一致（同类
// 粒度错位）。这里新增一列"收件人明细"，只在 mixed 记录上填充
// "收件人:动作" 的列表，非 mixed 记录留空（该记录的状态列已经能代表全部
// 收件人，不需要重复）。
//
// 动作文案复用 recipient-status-badges.tsx 的 actionCategory + labelKeyFor，
// 保证列表页徽章、详情抽屉、CSV 导出三处对同一个原始动作值的展示文案永远
// 一致，不需要在这里再维护一份影子映射表。
function formatRecipientDetail(item: DisposalMailItem, t: Translate): string {
  if (item.action !== "mixed" || !item.recipientDispositions?.length) return "";
  return item.recipientDispositions
    .map((d) => {
      const rawAction = (d.final_action || d.original_action || "").toLowerCase();
      const label = t(labelKeyFor("action", actionCategory(rawAction)));
      return `${d.recipient}:${label}`;
    })
    .join("; ");
}

export interface DisposalCsvTable {
  headers: string[];
  rows: string[][];
}

/**
 * 把 DisposalMailItem 列表转成 CSV 的表头 + 行数据（纯函数，不涉及
 * Blob/DOM，方便单测覆盖 mixed 记录的收件人明细拼接逻辑）。调用方
 * （email-disposal-center-page.tsx 的 exportToCsv）负责把返回值序列化成
 * CSV 字符串并触发下载。
 */
export function buildDisposalCsvTable(
  items: DisposalMailItem[],
  t: Translate,
): DisposalCsvTable {
  const headers = [
    "ID",
    t("table.time"),
    t("table.sender"),
    t("table.recipient"),
    t("table.subject"),
    t("table.mailType"),
    t("table.status"),
    t("batch.csvRecipientDetail"),
  ];
  const rows = items.map((item) => [
    String(item.id),
    item.timestamp,
    item.sender,
    item.recipientList?.join("; ") ?? item.recipient,
    item.subject,
    item.emailType ?? "",
    item.displayStatus,
    formatRecipientDetail(item, t),
  ]);
  return { headers, rows };
}
