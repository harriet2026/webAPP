import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { sourceNamingExceptions } from "./naming.mjs";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const eslint = new ESLint({ cwd });
const namingRules = new Set([
  "osgateway/filename", "osgateway/no-issue-filename",
  "@typescript-eslint/naming-convention", "no-restricted-syntax",
]);

async function messages(filePath, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(cwd, filePath) });
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  return result.messages.filter((message) => namingRules.has(message.ruleId));
}

test("accepts local naming, constants, protocol fields, destructuring and issue comments", async () => {
  assert.deepEqual(await messages("src/lib/tenant_scope.ts", `
    interface ApiPayload { tenant_id: number }
    const API_BASE = '/api';
    // GT-13612: background belongs in a comment, not the function name.
    function matchesTenant(payload: ApiPayload, _unused: string) {
      const { tenant_id } = payload;
      const { tenant_id: _omitted, ...rest } = payload;
      void _omitted;
      return tenant_id;
    }
  `), []);
});

test("checks type, local variable and function formats as warnings", async () => {
  const result = await messages("src/lib/example.ts", `
    type bad_type = string;
    const bad_name = 1;
    function bad_function() { return bad_name; }
  `);
  assert.equal(result.length, 3);
  assert.ok(result.every((message) => message.ruleId === "@typescript-eslint/naming-convention" && message.severity === 1));
});

test("rejects issue numbers on declared functions, arrows and methods", async () => {
  for (const code of [
    "function fixGT13612() {}",
    "const fixGt13612 = () => {};",
    "const fixgt_13612 = function () {};",
    "const run = function fixGT13612() {};",
    "class Worker { fixGT13612() {} }",
    "class Worker { fixGT13612 = () => {}; }",
    "const worker = { fixGT13612() {} };",
    "const worker = { fixGT13612: () => {} };",
  ]) {
    const result = await messages("src/lib/worker.ts", code);
    assert.ok(result.some((message) => message.ruleId === "no-restricted-syntax"), code);
  }
});

test("checks issue numbers in test filenames without checking test scenario spelling", async () => {
  assert.deepEqual(await messages("tests/unit/tenant-scope.test.ts", "export {};"), []);
  for (const name of ["gt13612_scope", "scope_GT_13612", "scope_GT-13612"]) {
    const result = await messages(`tests/unit/${name}.test.ts`, "export {};");
    assert.deepEqual(result.map((message) => message.ruleId), ["osgateway/no-issue-filename"]);
  }
});

test("matches component names, including named default exports and React wrappers", async () => {
  for (const code of [
    "export function TenantCard() { return <div />; }",
    "export default function TenantCard() { return <div />; }",
    "const TenantCard = () => <div />; export default TenantCard;",
    "const TenantCard = memo(() => <div />); export { TenantCard };",
    "const TenantCard = React.forwardRef(() => <div />); export { TenantCard };",
  ]) {
    assert.deepEqual(await messages("src/components/TenantCard.tsx", code), []);
    const result = await messages("src/components/tenant-card.tsx", code);
    assert.equal(result.length, 1);
    assert.equal(result[0].messageId, "sameName");
    assert.match(result[0].message, /TenantCard\.tsx/);
  }
});

test("matches standalone hooks but uses snake_case for multi-hook and mixed modules", async () => {
  const single = "export function useTenant() { return 1; }";
  assert.deepEqual(await messages("src/hooks/useTenant.ts", single), []);
  assert.equal((await messages("src/hooks/use-tenant.ts", single))[0].messageId, "sameName");
  const multiple = `${single} export function usePolicy() { return 2; }`;
  assert.deepEqual(await messages("src/hooks/tenant_policy.ts", multiple), []);
  assert.equal((await messages("src/hooks/useTenant.ts", multiple))[0].messageId, "snakeCase");
  assert.deepEqual(await messages("src/lib/tenant_policy.ts", `${single} export function fetchPolicy() {}`), []);
});

test("checks ordinary modules but leaves framework files and ambiguous collections alone", async () => {
  assert.equal((await messages("src/types/mail-log.ts", "export type MailLog = string;"))[0].messageId, "snakeCase");
  assert.deepEqual(await messages("src/types/mail_log.ts", "export type MailLog = string;"), []);
  assert.deepEqual(await messages("src/app/[locale]/page.tsx", "export default function HomePage() { return <div />; }"), []);
  assert.deepEqual(await messages("src/app/api/status/route.ts", "export function GET() {}"), []);
  assert.deepEqual(await messages("src/components/state-banners.tsx", "export function Empty() { return null; } export function Failed() { return null; }"), []);
  assert.deepEqual(await messages("src/components/Reexports.tsx", "export { TenantCard } from './TenantCard';"), []);
});

test("exempts known source files without exempting new local UI components", async () => {
  for (const filename of sourceNamingExceptions) {
    assert.ok(fs.existsSync(path.join(cwd, filename)), filename);
  }
  const code = "export function LocalControl() { return <div />; }";
  assert.deepEqual(await messages("src/components/ui/button.tsx", code), []);
  assert.equal((await messages("src/components/ui/local-control.tsx", code))[0].messageId, "sameName");
});
