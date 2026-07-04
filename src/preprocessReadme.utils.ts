import { walk } from "estree-walker";
import { highlightBash } from "./highlight/bash.js";
import { highlightJson } from "./highlight/json.js";
import { highlightTypeScript } from "./highlight/typescript.js";
import { highlightYaml } from "./highlight/yaml.js";

// Svelte's markup/script AST has no official types, and shares no common shape with the
// ESTree nodes `estree-walker` expects — this loose record covers both.
// biome-ignore lint/suspicious/noExplicitAny: see above
export type Node = Record<string, any> & {
  start: number;
  end: number;
  type: string;
};

export const aliases: Record<string, string> = {
  sh: "bash",
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
};

// Dispatches to this package's own hand-rolled highlighters (see `./highlight`); any
// other language (there's no general-purpose fallback, e.g. no `jsx` support) throws,
// so the caller's existing fallback-to-raw-text handling takes over.
export function highlightCode(source: string, langId: string): string {
  switch (langId) {
    case "typescript":
    // Plain JS is valid TS, so the same AST-driven highlighter covers it — there's no
    // TS-specific syntax to trip over, and it's the only highlighter registered that
    // understands JS at all now that Prism is gone.
    case "javascript":
      return highlightTypeScript(source);
    case "json":
      return highlightJson(source);
    case "yaml":
      return highlightYaml(source);
    case "bash":
      return highlightBash(source);
    default:
      throw new Error(`no highlighter for language "${langId}"`);
  }
}

// Highlighted (or, on the fallback path, raw) fence content gets embedded in a
// `` {@html `...`} `` template literal (see the `highlight`/`svelteCode` call sites
// in `preprocessReadme`), so any backslash/backtick/`${` that survived from the
// original source — e.g. a JSDoc comment containing a backtick, or a `\n`/regex
// escape sequence — must be neutralized first. Otherwise it either terminates that
// literal early (breaking the Svelte compiler) or gets silently reinterpreted as an
// escape/interpolation by it. Order matters: backslashes are escaped first so the
// backslashes the later steps introduce aren't themselves re-escaped.
export function escapeForTemplateLiteral(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

const WINDOWS_PATH = /^[a-zA-Z]:\\/;
const URL_SCHEME = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isRelativeUrl(url: string): boolean {
  // Windows paths (e.g. "c:\foo") aren't absolute URLs, so they're treated as relative.
  if (WINDOWS_PATH.test(url)) return true;
  return !URL_SCHEME.test(url);
}

export const getChildNodeText = (node: Node) => {
  return node.children
    .flatMap((child: Node) =>
      child.type === "Element" ? child.children : child,
    )
    .filter((child: Node) => child.type === "Text")
    .map((child: Node) => child.raw)
    .join("");
};

export type Declaration = { name: string; start: number; end: number };
export type IdentifierRange = { start: number; end: number; name: string };

const collectPatternNames = (
  pattern: Node | undefined,
  names: string[],
): void => {
  if (!pattern) return;

  switch (pattern.type) {
    case "Identifier":
      names.push(pattern.name);
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        collectPatternNames(
          prop.type === "RestElement" ? prop.argument : prop.value,
          names,
        );
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements)
        collectPatternNames(element, names);
      break;
    case "AssignmentPattern":
      collectPatternNames(pattern.left, names);
      break;
    case "RestElement":
      collectPatternNames(pattern.argument, names);
      break;
  }
};

// Collects `let`/`const`/`var`, `function`, and `class` bindings declared at the top level of a
// `<script>` block (including `export let ...` props), so duplicate names across separate code
// fences can be detected and renamed before they're merged into a single shared `<script>`.
export const collectTopLevelDeclarations = (program: Node): Declaration[] => {
  const declarations: Declaration[] = [];

  const visit = (stmt: Node) => {
    if (stmt.type === "ExportNamedDeclaration" && stmt.declaration) {
      visit(stmt.declaration);
      return;
    }

    if (stmt.type === "VariableDeclaration") {
      for (const declarator of stmt.declarations) {
        const names: string[] = [];
        collectPatternNames(declarator.id, names);
        for (const name of names)
          declarations.push({
            name,
            start: declarator.start,
            end: declarator.end,
          });
      }
    } else if (
      (stmt.type === "FunctionDeclaration" ||
        stmt.type === "ClassDeclaration") &&
      stmt.id
    ) {
      declarations.push({
        name: stmt.id.name,
        start: stmt.start,
        end: stmt.end,
      });
    }
  };

  for (const stmt of program.body) visit(stmt);

  return declarations;
};

// Determines which top-level names collide with a same-named (but differently defined) binding
// from an earlier code fence, and assigns each a unique replacement name (e.g. `count` -> `count2`).
export const computeRenameMap = (
  declarations: Declaration[],
  source: string,
  declaredVariables: Map<string, string>,
  reservedNames: Set<string>,
): Map<string, string> => {
  const renameMap = new Map<string, string>();
  const namesInBlock = new Set(
    declarations.map((declaration) => declaration.name),
  );

  for (const { name, start, end } of declarations) {
    const text = source.slice(start, end).replace(/\s+/g, " ").trim();
    const existingText = declaredVariables.get(name);

    if (existingText === undefined) {
      declaredVariables.set(name, text);
      reservedNames.add(name);
      continue;
    }

    if (existingText === text || renameMap.has(name)) continue;

    let suffix = 2;
    let candidate = `${name}${suffix}`;

    while (reservedNames.has(candidate) || namesInBlock.has(candidate)) {
      suffix += 1;
      candidate = `${name}${suffix}`;
    }

    renameMap.set(name, candidate);
    reservedNames.add(candidate);
    declaredVariables.set(candidate, text);
  }

  return renameMap;
};

// Finds every reference to a renamed identifier within a script or markup AST, skipping
// positions where the name is a property/member key rather than a variable reference.
export const collectIdentifierRanges = (
  root: Node,
  renameMap: Map<string, string>,
): IdentifierRange[] => {
  const ranges: IdentifierRange[] = [];

  walk(
    // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
    root as any,
    {
      // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
      enter(node: any, parent: any) {
        if (node.type !== "Identifier" || !renameMap.has(node.name)) return;

        if (parent) {
          if (
            parent.type === "MemberExpression" &&
            parent.property === node &&
            !parent.computed
          )
            return;
          if (
            parent.type === "Property" &&
            parent.key === node &&
            !parent.shorthand &&
            !parent.computed
          )
            return;
          if (
            parent.type === "MethodDefinition" &&
            parent.key === node &&
            !parent.computed
          )
            return;
          if (
            parent.type === "ImportSpecifier" &&
            parent.imported === node &&
            parent.imported !== parent.local
          )
            return;
          if (
            parent.type === "ExportSpecifier" &&
            parent.exported === node &&
            parent.exported !== parent.local
          )
            return;
        }

        ranges.push({ start: node.start, end: node.end, name: node.name });
      },
    },
  );

  return ranges;
};

export const applyRenames = (
  source: string,
  ranges: IdentifierRange[],
  renameMap: Map<string, string>,
): string => {
  if (ranges.length === 0) return source;

  let result = source;

  for (const { start, end, name } of [...ranges].sort(
    (a, b) => b.start - a.start,
  )) {
    result = result.slice(0, start) + renameMap.get(name) + result.slice(end);
  }

  return result;
};
