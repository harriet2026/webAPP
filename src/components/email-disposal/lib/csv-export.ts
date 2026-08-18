import type { DisposalMailItem } from "@/types/email-disposal";
import { recipientActionLabelKey } from "@/lib/email-log-action";

type Translate = (key: string) => string;

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
