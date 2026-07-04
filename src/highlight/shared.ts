import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Claim = { start: number; end: number; className: string };
export type GapFill = (text: string) => string;

const ESCAPE_RE = /[&<>]/g;
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

export function escapeHtml(text: string): string {
  return text.replace(ESCAPE_RE, (char) => ESCAPE_MAP[char]);
}

export function token(className: string, text: string): string {
  return `<span class="token ${className}">${escapeHtml(text)}</span>`;
}

// Reads a CSS file co-located with the calling grammar module — `moduleUrl` is that
// module's own `import.meta.url`, since resolving the directory here would resolve
// against this file's location instead.
export function readGrammarCss(moduleUrl: string, filename: string): string {
  const dirname = path.dirname(fileURLToPath(moduleUrl));
  return fs.readFileSync(path.join(dirname, filename), "utf-8");
}

// Styling for the token classes emitted from this file (`gapFill`'s punctuation/operator
// fallback) plus the classes every grammar-specific highlighter claims for the same
// meaning (keyword/comment/function/string/number/boolean) — colocated here, rather than
// duplicated per grammar, because their meaning doesn't change across grammars. A grammar
// module only needs its own `styles` export for classes unique to (or recolored for) that
// grammar; see e.g. `./typescript.js`'s `.language-typescript` overrides.
export const baseTokenStyles: string = readGrammarCss(
  import.meta.url,
  "shared.css",
);

// Renders `claims` (absolute offsets into `source`) in order, filling every span
// between/around them with `gapFill`. Claims are expected to be non-overlapping leaf
// spans (e.g. a single string literal or keyword) rather than nested containers — a
// later claim that starts before the previous one ended is dropped rather than nested.
export function renderClaims(
  source: string,
  claims: Claim[],
  gapFill: GapFill,
): string {
  const sorted = [...claims].sort((a, b) => a.start - b.start || b.end - a.end);
  let html = "";
  let cursor = 0;

  for (const claim of sorted) {
    if (claim.start < cursor) continue;
    if (claim.start > cursor)
      html += gapFill(source.slice(cursor, claim.start));
    const text = source.slice(claim.start, claim.end);
    // An empty `className` marks text that's deliberately exempted from `gapFill`
    // (e.g. literal HTML text content) without actually being restyled.
    html += claim.className ? token(claim.className, text) : escapeHtml(text);
    cursor = claim.end;
  }

  if (cursor < source.length) html += gapFill(source.slice(cursor));

  return html;
}

const PUNCTUATION_RE = /[{}()[\],;:."']/;
const OPERATOR_RE = /[+\-*/%&|^!~<>=?]/;
const WHITESPACE_RE = /\s/;

// A generic fallback tokenizer for whatever an AST/line-based walk didn't already
// classify: whitespace, punctuation, and operator runs. It never needs to reason about
// strings/comments/identifiers because callers only ever hand it the leftover gaps
// between claims that already covered those.
export function gapFill(text: string): string {
  let html = "";
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (WHITESPACE_RE.test(char)) {
      let j = i + 1;
      while (j < text.length && WHITESPACE_RE.test(text[j])) j++;
      html += escapeHtml(text.slice(i, j));
      i = j;
    } else if (char === "." && text[i + 1] === "." && text[i + 2] === ".") {
      html += token("punctuation", "...");
      i += 3;
    } else if (PUNCTUATION_RE.test(char)) {
      html += token("punctuation", char);
      i++;
    } else if (OPERATOR_RE.test(char)) {
      let j = i + 1;
      while (j < text.length && OPERATOR_RE.test(text[j])) j++;
      html += token("operator", text.slice(i, j));
      i = j;
    } else {
      let j = i + 1;
      while (
        j < text.length &&
        !WHITESPACE_RE.test(text[j]) &&
        !PUNCTUATION_RE.test(text[j]) &&
        !OPERATOR_RE.test(text[j])
      )
        j++;
      html += escapeHtml(text.slice(i, j));
      i = j;
    }
  }

  return html;
}
