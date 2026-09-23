import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import naming, { sourceNamingExceptions } from "./eslint/naming.mjs";

const issueFunctionSelector = [
  'FunctionDeclaration[id.name=/[Gg][Tt]_?[0-9]+/]',
  'FunctionExpression[id.name=/[Gg][Tt]_?[0-9]+/]',
  'VariableDeclarator[id.name=/[Gg][Tt]_?[0-9]+/][init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]',
  'MethodDefinition[computed=false][key.name=/[Gg][Tt]_?[0-9]+/]',
  'Property[computed=false][key.name=/[Gg][Tt]_?[0-9]+/][value.type=/^(ArrowFunctionExpression|FunctionExpression)$/]',
  'PropertyDefinition[computed=false][key.name=/[Gg][Tt]_?[0-9]+/][value.type=/^(ArrowFunctionExpression|FunctionExpression)$/]',
].join(", ");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "osgateway/naming-preview",
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    ignores: ["**/*.d.ts", ...sourceNamingExceptions],
    plugins: { osgateway: naming },
    rules: {
      // Preview warnings apply to existing code too; no automatic file renames.
      "osgateway/no-issue-filename": "warn",
      "osgateway/filename": "warn",
      "no-restricted-syntax": ["warn", {
        selector: issueFunctionSelector,
        message: "Do not use issue IDs in function names. Name functions by responsibility or behavior, and put issue links in comments or commits.",
      }],
      "@typescript-eslint/naming-convention": [
        "warn",
        // Properties/imports may belong to wire formats or third-party APIs.
        { selector: "default", format: null },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "function", format: ["camelCase", "PascalCase"] },
        // Local underscore bindings also cover omissions consumed with `void`.
        { selector: "variable", format: ["camelCase", "PascalCase", "UPPER_CASE"], leadingUnderscore: "allow" },
        { selector: "variable", modifiers: ["destructured"], format: null },
        { selector: "parameter", format: ["camelCase", "PascalCase"], leadingUnderscore: "allow" },
        { selector: "parameter", modifiers: ["destructured"], format: null },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
