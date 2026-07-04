import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walk } from "estree-walker";
import { parse } from "svelte/compiler";
import {
  type Claim,
  escapeHtml,
  gapFill,
  renderClaims,
  token,
} from "./shared.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const WRAPPER_OPEN = '<script lang="ts">';

// This highlighter also renders `javascript` fences (see `preprocessReadme`'s dispatch),
// which keep their own `.language-javascript` wrapper class rather than being relabeled
// `typescript`, so both selectors are targeted here.
export const styles: string = fs.readFileSync(
  path.join(dirname, "typescript.css"),
  "utf-8",
);

// Every reserved/contextual JS+TS keyword. Applied only to text that fell outside every
// AST leaf claim below (see `codeGapFill`) — since real identifiers, member/property
// names, and literals are always resolved to their own node by the parser first, any
// keyword-shaped text left over structurally *is* a keyword, not a misclassified name.
const KEYWORDS = [
  "abstract",
  "any",
  "as",
  "asserts",
  "async",
  "await",
  "bigint",
  "boolean",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "infer",
  "instanceof",
  "interface",
  "is",
  "keyof",
  "let",
  "module",
  "namespace",
  "never",
  "new",
  "number",
  "object",
  "of",
  "out",
  "override",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "set",
  "static",
  "string",
  "super",
  "switch",
  "symbol",
  "then",
  "this",
  "throw",
  "try",
  "type",
  "typeof",
  "undefined",
  "unique",
  "unknown",
  "using",
  "var",
  "void",
  "while",
  "with",
  "yield",
];
const KEYWORD_RE = new RegExp(`\\b(?:${KEYWORDS.join("|")})\\b`, "g");

export function codeGapFill(text: string): string {
  let html = "";
  let cursor = 0;

  KEYWORD_RE.lastIndex = 0;
  for (const match of text.matchAll(KEYWORD_RE)) {
    if (match.index > cursor) html += gapFill(text.slice(cursor, match.index));
    html += token("keyword", match[0]);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) html += gapFill(text.slice(cursor));

  return html;
}

// Parent (node-type, property-key) pairs where an Identifier names a type/class rather
// than a value binding, so it gets `class-name` instead of `identifier` (matching the
// `.language-typescript .class-name` CSS hook).
const TYPE_NAME_PARENTS = new Set([
  "NewExpression:callee",
  "TSTypeReference:typeName",
  "ClassDeclaration:id",
  "ClassDeclaration:superClass",
  "ClassExpression:id",
  "ClassExpression:superClass",
  "TSInterfaceDeclaration:id",
  "TSTypeAliasDeclaration:id",
]);

// biome-ignore lint/suspicious/noExplicitAny: acorn/estree nodes have no shared TS types here
function isTypeNamePosition(node: any, parent: any): boolean {
  if (!parent) return false;
  for (const key of Object.keys(parent)) {
    if (parent[key] !== node) continue;
    if (TYPE_NAME_PARENTS.has(`${parent.type}:${key}`)) return true;
  }
  return false;
}

// Walks a parsed Program (or any ESTree-shaped subtree) and returns leaf-level claims:
// exact spans for literals, identifiers, comments, and `this`/`super`. Everything else
// (keywords, punctuation, operators) is deliberately left unclaimed for `codeGapFill`.
// biome-ignore lint/suspicious/noExplicitAny: acorn/estree nodes have no shared TS types here
export function collectLeafClaims(root: any, offset: number): Claim[] {
  const claims: Claim[] = [];

  walk(root, {
    // biome-ignore lint/suspicious/noExplicitAny: estree-walker's types don't match acorn-typescript's augmented nodes
    enter(node: any, parent: any) {
      const start = node.start - offset;
      const end = node.end - offset;

      switch (node.type) {
        case "Literal":
          if (node.regex) claims.push({ start, end, className: "regex" });
          else if (typeof node.value === "string")
            claims.push({ start, end, className: "string" });
          else if (
            typeof node.value === "number" ||
            typeof node.value === "bigint"
          )
            claims.push({ start, end, className: "number" });
          else if (typeof node.value === "boolean")
            claims.push({ start, end, className: "boolean" });
          else if (node.value === null)
            claims.push({ start, end, className: "keyword" });
          break;
        case "TemplateElement":
          claims.push({ start, end, className: "string" });
          break;
        case "TemplateLiteral":
          // The backticks themselves aren't part of any `TemplateElement`'s span.
          claims.push({ start, end: start + 1, className: "string" });
          claims.push({ start: end - 1, end, className: "string" });
          break;
        case "ThisExpression":
        case "Super":
          claims.push({ start, end, className: "keyword" });
          break;
        case "Identifier":
        case "PrivateIdentifier": {
          const isCallee =
            parent?.type === "CallExpression" && parent.callee === node;
          // A parameter/declarator `Identifier`'s own `end` extends through its
          // `typeAnnotation` (a quirk of the TS-flavored ESTree this parser produces),
          // so the identifier's real span stops where the annotation begins.
          const realEnd = node.typeAnnotation
            ? node.typeAnnotation.start - offset
            : end;
          claims.push({
            start,
            end: realEnd,
            className: isCallee
              ? "function"
              : isTypeNamePosition(node, parent)
                ? "class-name"
                : "identifier",
          });
          break;
        }
      }
    },
  });

  return claims;
}

export function highlightTypeScript(source: string): string {
  const wrapped = `${WRAPPER_OPEN}${source}</script>`;
  const offset = WRAPPER_OPEN.length;
  const root = parse(wrapped, { modern: true });
  const program = root.instance?.content;

  if (!program) return escapeHtml(source);

  const claims = collectLeafClaims(program, offset);

  for (const comment of root.comments ?? []) {
    claims.push({
      start: comment.start - offset,
      end: comment.end - offset,
      className: "comment",
    });
  }

  return renderClaims(source, claims, codeGapFill);
}
