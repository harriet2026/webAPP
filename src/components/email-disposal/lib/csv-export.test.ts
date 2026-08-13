// GT-12923 阶段五（任务20）：CSV 导出补充收件人级明细列的单测。
import { describe, it, expect } from "vitest";
import { buildDisposalCsvTable } from "./csv-export";
import type { DisposalMailItem } from "@/types/email-disposal";

// 极简 t mock：直接回显 key，方便断言"用了哪个 label key"而不用真的接
// i18n messages。批量键（batch.xxx）本身就是 key 的一部分，天然可读。
const t = ((key: string) => key) as any;

const baseItem: Omit<DisposalMailItem, "id" | "action" | "recipientDispositions"> = {
  timestamp: "2024-01-01T00:00:00Z",
  direction: "inbound",
  sender: "a@example.com",
  recipient: "b@example.com; c@example.com",
  subject: "Test",
  status: "delivered",
  displayStatus: "delivered" as DisposalMailItem["displayStatus"],
};

describe("buildDisposalCsvTable", () => {
  it("includes a recipient-detail header column", () => {
    const { headers } = buildDisposalCsvTable([], t);
    expect(headers).toContain("batch.csvRecipientDetail");
    expect(headers.length).toBe(8);
  });

  it("leaves the recipient-detail column empty for non-mixed records", () => {
    const item: DisposalMailItem = {
      ...baseItem,
      id: 1,
      action: "quarantine",
    };
    const { rows } = buildDisposalCsvTable([item], t);
    expect(rows[0][rows[0].length - 1]).toBe("");
  });

  it("fills recipient:action pairs for mixed records using final_action", () => {
    const item: DisposalMailItem = {
      ...baseItem,
      id: 2,
      action: "mixed",
      recipientDispositions: [
        { recipient: "alice@example.com", final_action: "accept", status: "delivered" },
        { recipient: "bob@example.com", final_action: "quarantine", status: "quarantined" },
      ],
    };
    const { rows } = buildDisposalCsvTable([item], t);
    const detailCol = rows[0][rows[0].length - 1];
    expect(detailCol).toBe(
      "alice@example.com:recipientStatusBar.delivered; bob@example.com:recipientStatusBar.quarantine",
    );
  });

  it("falls back to original_action when final_action is empty", () => {
    const item: DisposalMailItem = {
      ...baseItem,
      id: 3,
      action: "mixed",
      recipientDispositions: [
        {
          recipient: "dave@example.com",
          final_action: "",
          original_action: "sideline",
          status: "pending",
        },
      ],
    };
    const { rows } = buildDisposalCsvTable([item], t);
    expect(rows[0][rows[0].length - 1]).toBe(
      "dave@example.com:recipientStatusBar.sideline",
    );
  });

  it("leaves the recipient-detail column empty when a mixed record has no recipientDispositions", () => {
    const item: DisposalMailItem = {
      ...baseItem,
      id: 4,
      action: "mixed",
    };
    const { rows } = buildDisposalCsvTable([item], t);
    expect(rows[0][rows[0].length - 1]).toBe("");
  });

  it("keeps other columns untouched for a mixed record", () => {
    const item: DisposalMailItem = {
      ...baseItem,
      id: 5,
      action: "mixed",
      recipientDispositions: [
        { recipient: "alice@example.com", final_action: "accept", status: "delivered" },
      ],
    };
    const { rows } = buildDisposalCsvTable([item], t);
    expect(rows[0][0]).toBe("5");
    expect(rows[0][1]).toBe(baseItem.timestamp);
    expect(rows[0][2]).toBe(baseItem.sender);
    expect(rows[0][3]).toBe(baseItem.recipient);
  });
});
