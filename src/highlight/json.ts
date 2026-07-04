import { type Claim, gapFill, renderClaims } from "./shared.js";

const JSON_TOKEN_RE =
  /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g;
const KEY_LOOKAHEAD_RE = /^\s*:/;

export function highlightJson(source: string): string {
  const claims: Claim[] = [];

  for (const match of source.matchAll(JSON_TOKEN_RE)) {
    const text = match[0];
    const start = match.index;
    const end = start + text.length;

    if (text[0] === '"') {
      const isKey = KEY_LOOKAHEAD_RE.test(source.slice(end));
      claims.push({ start, end, className: isKey ? "property" : "string" });
    } else if (text === "true" || text === "false") {
      claims.push({ start, end, className: "boolean" });
    } else if (text === "null") {
      claims.push({ start, end, className: "keyword" });
    } else {
      claims.push({ start, end, className: "number" });
    }
  }

  return renderClaims(source, claims, gapFill);
}
