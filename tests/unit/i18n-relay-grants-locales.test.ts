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

const messagesByLocale: Record<string, unknown> = { zh, en, ru, th };

type Tree = Record<string, unknown>;
const mailRouting = (m: unknown) => (m as { mailRouting: Tree }).mailRouting;

describe("relayGrants i18n coverage across enabled locales", () => {
  const reference = mailRouting(zh).relayGrants as Tree;
  const referenceKeys = Object.keys(reference);

  it("the reference namespace itself is non-trivial", () => {
    expect(referenceKeys.length).toBeGreaterThan(30);
  });

  for (const locale of routing.locales) {
    it(`${locale}: mailRouting.relayGrants has every key zh has`, () => {
      const messages = messagesByLocale[locale];
      expect(messages, `messages/${locale}.json must be imported here`).toBeDefined();
      const grants = mailRouting(messages).relayGrants as Tree | undefined;
      expect(grants, `mailRouting.relayGrants missing in ${locale}`).toBeDefined();
      const missing = referenceKeys.filter((k) => !(k in grants!));
      expect(missing, `keys missing in ${locale}`).toEqual([]);
    });

    it(`${locale}: relay scope-notice keys exist`, () => {
      const relay = mailRouting(messagesByLocale[locale]).relay as Tree;
      for (const key of ["add", "rulesScopeNotice", "rulesCardSubtitle"]) {
        expect(relay[key], `mailRouting.relay.${key} missing in ${locale}`).toBeTruthy();
      }
    });
  }
});
