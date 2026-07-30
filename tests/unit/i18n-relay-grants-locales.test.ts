import { describe, it, expect } from "vitest";
import { routing } from "@/i18n/routing";
import zh from "../../messages/zh.json";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import th from "../../messages/th.json";

// Review (GT-12235 relay-grant SPF): the relayGrants namespace shipped only in
// zh/en while the app enables zh/en/th/ru — /ru and /th rendered raw keys for
// the whole card. next-intl does NOT fall back per-key across locales, and the
// broader i18n-literal-keys test only scans zh/en, so this parity check is what
// keeps every ENABLED locale complete for this namespace. It is deliberately
// scoped to the relay area (ru/th trail zh elsewhere; a full-tree parity test
// would fail on pre-existing, unrelated gaps).
//
// Task 9 (mail-routing html_spec 对齐收尾): mailRouting.relayGrants.* was the
// old grants-card i18n namespace. Task 4's single-table rewrite (A7: grants
// advanced-capability UI moved out of this page, "另行安置，本次不做") already
// removed every renderer of it — grep across src/ turned up zero references
// (the only remaining consumer was this test file's own parity check on
// itself). Deleted the dead namespace from all four locale files; the
// relayGrants-specific sub-tests below go with it. The still-live SPF-key
// coverage (GT-12235's actual concern — SPF copy must exist in every enabled
// locale) now lives entirely in mailRouting.relay.fields.* and stays covered.

const messagesByLocale: Record<string, unknown> = { zh, en, ru, th };

type Tree = Record<string, unknown>;
const mailRouting = (m: unknown) => (m as { mailRouting: Tree }).mailRouting;

describe("relay SPF i18n coverage across enabled locales", () => {
  for (const locale of routing.locales) {
    // Task 4 (mail-routing html_spec 对齐): mailRouting.relay.* was rewritten
    // wholesale for the single-table redesign — "add"/"rulesScopeNotice"/
    // "rulesCardSubtitle" (the old grants-card + unified-rules regulation
    // split, A7) no longer exist. The SPF-parity concern this sub-test guards
    // (GT-12235: SPF-related copy must exist in every enabled locale, not just
    // zh/en) now lives in the new single-table drawer's SPF fields.
    it(`${locale}: relay SPF-related keys exist (post Task-4 single-table redesign)`, () => {
      const relay = mailRouting(messagesByLocale[locale]).relay as Tree;
      const fields = relay.fields as Tree;
      expect(relay.deleteDialogTitle, `mailRouting.relay.deleteDialogTitle missing in ${locale}`).toBeTruthy();
      for (const key of [
        "useSpf",
        "useSpfLabel",
        "useSpfHint",
        "fromDomainRequiredWithSpf",
        "fromDomainMustBeVerified",
        "sourceIpSpfHint",
      ]) {
        expect(fields[key], `mailRouting.relay.fields.${key} missing in ${locale}`).toBeTruthy();
      }
    });
  }
});
