import { type Claim, gapFill, readGrammarCss, renderClaims } from "./shared.js";

// Falls back to this default text color for unclaimed scalars (e.g. a bare `key:` with
// no recognized value type) and keys (`atrule`), which have no dedicated color of their
// own — everything else this module claims (string/number/boolean/comment) is styled
// in `./shared.js`.
export const styles: string = readGrammarCss(import.meta.url, "yaml.css");

const KEY_RE = /^(\s*(?:-\s+)?)([^\s:#][^:]*?)(:)(\s|$)/;
const QUOTED_RE = /^["'][\s\S]*["']$/;
const SCALAR_KEYWORD_RE = /^(true|false|null|~|yes|no)$/i;
const NUMBER_RE = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const ANCHOR_TAG_RE = /^[&*!]/;
const HASH_COMMENT_RE = /(^|\s)#/;

function highlightLine(line: string, lineOffset: number, claims: Claim[]) {
  const hashMatch = line.match(HASH_COMMENT_RE);
  const commentStart = hashMatch
    ? (hashMatch.index ?? 0) + (hashMatch[1] ? 1 : 0)
    : -1;
  const content = commentStart === -1 ? line : line.slice(0, commentStart);

  let valueStart = 0;
  const keyMatch = KEY_RE.exec(content);

  if (keyMatch) {
    const keyStart = keyMatch[1].length;
    const keyEnd = keyStart + keyMatch[2].length;
    claims.push({
      start: lineOffset + keyStart,
      end: lineOffset + keyEnd,
      className: "atrule",
    });
    valueStart = keyEnd + keyMatch[3].length;
  }

  const valueRaw = content.slice(valueStart);
  const leadingSpace = valueRaw.length - valueRaw.trimStart().length;
  const value = valueRaw.trim();

  if (value) {
    const start = lineOffset + valueStart + leadingSpace;
    const end = start + value.length;
    let className: string | undefined;

    if (QUOTED_RE.test(value)) className = "string";
    else if (SCALAR_KEYWORD_RE.test(value)) className = "boolean";
    else if (NUMBER_RE.test(value)) className = "number";
    else if (ANCHOR_TAG_RE.test(value)) className = "variable";
    // A bare scalar/list-item value with no `key:` on this line (e.g. `- foo`).
    else if (!keyMatch) className = "string";

    if (className) claims.push({ start, end, className });
  }

  if (commentStart !== -1) {
    claims.push({
      start: lineOffset + commentStart,
      end: lineOffset + line.length,
      className: "comment",
    });
  }
}

export function highlightYaml(source: string): string {
  const claims: Claim[] = [];
  let offset = 0;

  for (const line of source.split("\n")) {
    highlightLine(line, offset, claims);
    offset += line.length + 1;
  }

  return renderClaims(source, claims, gapFill);
}
