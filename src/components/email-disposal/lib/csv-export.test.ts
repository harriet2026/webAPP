import { describe, expect, it } from "vitest";
import type { DisposalMailItem } from "@/types/email-disposal";
import { formatRecipientDetail } from "./csv-export";

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
