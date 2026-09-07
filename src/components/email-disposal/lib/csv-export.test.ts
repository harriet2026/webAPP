import { describe, expect, it } from "vitest";
import type { DisposalMailItem } from "@/types/email-disposal";
import {
  buildDisposalCsvRows,
  formatRecipientDetail,
  visibleDisposalColumns,
} from "./csv-export";

const baseItem = {
  id: 1,
  timestamp: "2026-08-16T00:00:00Z",
  direction: "incoming",
  sender: "sender@example.com",
  recipient: "a@example.com",
  subject: "subject",
  action: "mixed",
  status: "",
  displayStatuses: [],
} satisfies DisposalMailItem;

describe("formatRecipientDetail", () => {
  it("exports localized recipient-to-action mappings for mixed messages", () => {
    const detail = formatRecipientDetail(
      {
        ...baseItem,
        recipientDispositions: [
          { recipient: "a@example.com", final_action: "accept", status: "delivered" },
          { recipient: "b@example.com", final_action: "quarantine", status: "quarantined" },
        ],
      },
      (key) => ({
        "recipientStatusBar.delivered": "投递",
        "recipientStatusBar.quarantine": "隔离",
      })[key] ?? key,
    );
    expect(detail).toBe("a@example.com: 投递; b@example.com: 隔离");
  });

  it("leaves the appended column empty for non-mixed messages", () => {
    expect(formatRecipientDetail({ ...baseItem, action: "accept" }, (key) => key)).toBe("");
  });
});

describe("GT-12763 disposal CSV", () => {
  const translations: Record<string, string> = {
    "table.time": "时间",
    "table.direction": "收发类型",
    "table.subject": "主题",
    "table.senderIp": "发信 IP",
    "table.sender": "发信人",
    "table.recipient": "收信人",
    "table.disposalBasis": "处置依据",
    "table.mailType": "邮件类型",
    "table.similarity": "相似度",
    "table.action": "执行动作",
    "table.status": "邮件状态",
    "batch.csvRecipientDetail": "收件人明细",
    "filters.outgoing": "外发",
    "filters.actions.audit": "审核",
    "filters.statuses.audit_pending": "待审核",
    "detail.mailType.spam": "垃圾邮件",
  };
  const t = (key: string) => translations[key] ?? key;

  it("uses the current visible table columns in table order", () => {
    expect(
      visibleDisposalColumns(
        new Set(["direction", "sender", "mailType", "status"]),
        false,
      ),
    ).toEqual([
      "time",
      "subject",
      "senderIp",
      "recipient",
      "disposalBasis",
      "action",
    ]);
  });

  it("exports localized display values and a structured disposal basis", () => {
    const rows = buildDisposalCsvRows(
      [{
        ...baseItem,
        timestamp: "2026-08-11T04:05:06Z",
        direction: "outgoing",
        subject: "代表性邮件",
        clientIp: "192.0.2.8",
        recipientList: ["a@example.com", "b@example.com"],
        emailType: "spam",
        action: "audit",
        displayStatuses: [{ status: "audit_pending", count: 2 }],
        disposalBasis: {
          policy_key: "SBL",
          rule_name: "高风险发件人",
          rule_id: "SBL-42",
          action: "audit",
          hit_values: { sender: "bad@example.com" },
        },
      }],
      ["time", "direction", "subject", "senderIp", "recipient", "disposalBasis", "mailType", "action", "status"],
      {
        t,
        lang: "zh",
        formatTimestamp: () => "2026/08/11 12:05:06",
      },
    );

    expect(rows[0]).toEqual([
      "时间",
      "收发类型",
      "主题",
      "发信 IP",
      "收信人",
      "处置依据",
      "邮件类型",
      "执行动作",
      "邮件状态",
      "收件人明细",
    ]);
    expect(rows[1]).toEqual([
      "2026/08/11 12:05:06",
      "外发",
      "代表性邮件",
      "192.0.2.8",
      "a@example.com, b@example.com",
      "发件人黑白名单「高风险发件人」· bad@example.com 命中黑名单",
      "垃圾邮件",
      "审核",
      "待审核",
      "",
    ]);
  });

  it("does not reintroduce hidden columns or the historical ID column", () => {
    const rows = buildDisposalCsvRows(
      [baseItem],
      ["subject", "action"],
      { t, lang: "zh", formatTimestamp: (value) => value },
    );
    expect(rows[0]).toEqual(["主题", "执行动作", "收件人明细"]);
    expect(rows[1]).toHaveLength(3);
    expect(rows.flat()).not.toContain("ID");
  });
});
