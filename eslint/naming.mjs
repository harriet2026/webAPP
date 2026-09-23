import path from "node:path";

// Only known shadcn source files are exempt. New local UI components still lint.
export const sourceNamingExceptions = [
  ...[
    "accordion", "alert-dialog", "alert", "avatar", "badge", "breadcrumb",
    "button", "calendar", "card", "checkbox", "collapsible", "command",
    "dialog", "dropdown-menu", "form", "input", "input-group", "label", "navigation-menu",
    "pagination", "popover", "radio-group", "scroll-area",
    "select", "separator", "sheet", "sidebar", "skeleton", "slider",
    "sonner", "switch", "table", "tabs", "textarea", "tooltip",
  ].map((name) => `src/components/ui/${name}.tsx`),
  "src/hooks/use-mobile.ts",
];

const frameworkFiles = new Set([
  "page", "layout", "route", "loading", "error", "global-error", "not-found",
  "default", "template", "head", "opengraph-image", "twitter-image", "icon",
  "apple-icon", "sitemap", "robots", "manifest",
]);

function isCallable(node) {
  if (!node) return false;
  if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) {
    return true;
  }
  if (["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"].includes(node.type)) {
    return isCallable(node.expression);
  }
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  const name = callee.type === "Identifier" ? callee.name
    : callee.type === "MemberExpression" && !callee.computed ? callee.property.name : null;
  return name === "memo" || name === "forwardRef";
}

// Inspect only local exports; re-exports and ambiguous component collections
// require review rather than guessing a primary component from file order.
function exportedCallables(program) {
  const declarations = new Map();
  for (const statement of program.body) {
    const declaration = statement.declaration ?? statement;
    if (declaration.type === "FunctionDeclaration" && declaration.id) {
      declarations.set(declaration.id.name, declaration);
    } else if (declaration.type === "VariableDeclaration") {
      for (const item of declaration.declarations) {
        if (item.id.type === "Identifier") declarations.set(item.id.name, item.init);
      }
    }
  }
  const names = new Set();
  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration") {
      const value = statement.declaration;
      const name = value.type === "Identifier" ? value.name : value.id?.name;
      if (name && isCallable(declarations.get(name))) names.add(name);
    } else if (statement.type === "ExportNamedDeclaration" && !statement.source && statement.exportKind !== "type") {
      const declaration = statement.declaration;
      if (declaration?.type === "FunctionDeclaration" && declaration.id) {
        names.add(declaration.id.name);
      } else if (declaration?.type === "VariableDeclaration") {
        for (const item of declaration.declarations) {
          if (item.id.type === "Identifier" && isCallable(item.init)) names.add(item.id.name);
        }
      }
      for (const specifier of statement.specifiers) {
        if (specifier.exportKind === "type" || !isCallable(declarations.get(specifier.local.name))) continue;
        const name = specifier.exported.name ?? specifier.exported.value;
        names.add(name === "default" ? specifier.local.name : name);
      }
    }
  }
  return [...names];
}

const noIssueFilename = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: { issue: "Do not use issue IDs in filenames: '{{name}}'. Name files by responsibility or behavior, and put issue links in comments or commits." },
  },
  create(context) {
    return {
      Program(node) {
        const name = path.basename(context.filename);
        if (/gt[-_]?\d+/i.test(name)) context.report({ node, messageId: "issue", data: { name } });
      },
    };
  },
};

const filename = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      sameName: "The {{kind}} filename should match its primary export: '{{expected}}'. Update imports, mocks, and scripts when renaming.",
      snakeCase: "Module filename '{{name}}' should use snake_case. Name it by responsibility; a _hooks suffix is not required.",
    },
  },
  create(context) {
    return {
      Program(node) {
        const relative = path.relative(context.cwd, context.filename).split(path.sep).join("/");
        const name = path.basename(context.filename);
        const extension = path.extname(name);
        const stem = name.slice(0, -extension.length);
        if (!['.ts', '.tsx'].includes(extension) || name.endsWith('.d.ts')) return;
        // Test target/scene naming and framework entry names have separate semantics.
        if (/\.(test|spec)\.[^.]+$/.test(name) || relative.split('/').includes('__tests__')) return;
        if (relative.startsWith('src/app/') && frameworkFiles.has(stem)) return;

        const callables = exportedCallables(node);
        const components = extension === '.tsx' ? callables.filter((value) => /^[A-Z]/.test(value)) : [];
        if (components.length > 1) return;
        const hooks = callables.filter((value) => /^use[A-Z]/.test(value));
        const main = components[0] ?? (hooks.length === 1 && callables.length === 1 ? hooks[0] : null);
        if (main) {
          if (stem !== main) context.report({
            node, messageId: 'sameName',
            data: { kind: components.length ? 'component' : 'standalone Hook', expected: `${main}${extension}` },
          });
        } else if (extension === '.ts' && !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(stem)) {
          context.report({ node, messageId: 'snakeCase', data: { name } });
        }
      },
    };
  },
};

const naming = { rules: { 'no-issue-filename': noIssueFilename, filename } };
export default naming;
