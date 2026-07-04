import { type Claim, gapFill, renderClaims } from "./shared.js";

// `keyword`/`string`/`function`/`comment` are already styled in `./shared.js`; `variable`
// and `parameter` have no dedicated color of their own. Exported for parity with the
// other grammar modules — see `./shared.js`'s `baseTokenStyles` doc comment.
export const styles = "";

// True shell reserved words (control-flow syntax), not just common builtin commands —
// `export`/`cd`/`echo`/etc. are ordinary commands and get `function` styling instead,
// via `atCommandStart` below, the same way any other command name would.
const KEYWORDS = new Set([
  "if",
  "then",
  "elif",
  "else",
  "fi",
  "for",
  "in",
  "do",
  "done",
  "while",
  "until",
  "case",
  "esac",
  "function",
  "select",
  "time",
  "coproc",
  "return",
]);

const WORD_CHAR_RE = /[A-Za-z0-9_./~-]/;
const FLAG_RE = /^--?[A-Za-z]/;
const WHITESPACE_RE = /\s/;
const VARIABLE_NAME_RE = /[A-Za-z0-9_]/;

// A line-agnostic scan: strings/comments/variables are resolved first (so their
// contents never get misread as command words or flags), then whatever's left is
// walked char-by-char, tracking whether the current word sits in "command position"
// (start of input, or right after `;`/`|`/`&`/`(`/a newline) to color command names
// distinctly from their arguments — mirroring how a real shell parses them, without
// needing a full grammar for the parts READMEs actually show (installs, simple CLI
// invocations, short scripts).
export function highlightBash(source: string): string {
  const claims: Claim[] = [];
  let i = 0;
  let atCommandStart = true;

  while (i < source.length) {
    const char = source[i];

    if (WHITESPACE_RE.test(char)) {
      let j = i;
      let sawNewline = false;
      while (j < source.length && WHITESPACE_RE.test(source[j])) {
        if (source[j] === "\n") sawNewline = true;
        j++;
      }
      if (sawNewline) atCommandStart = true;
      i = j;
      continue;
    }

    if (char === "#") {
      const end = source.indexOf("\n", i);
      claims.push({
        start: i,
        end: end === -1 ? source.length : end,
        className: "comment",
      });
      i = end === -1 ? source.length : end;
      continue;
    }

    if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== char) {
        if (char === '"' && source[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, source.length);
      claims.push({ start: i, end: j, className: "string" });
      i = j;
      atCommandStart = false;
      continue;
    }

    if (char === "`") {
      const end = source.indexOf("`", i + 1);
      const j = end === -1 ? source.length : end + 1;
      claims.push({ start: i, end: j, className: "variable" });
      i = j;
      atCommandStart = false;
      continue;
    }

    if (char === "$") {
      let j = i + 1;
      if (source[j] === "(") {
        let depth = 1;
        j++;
        while (j < source.length && depth > 0) {
          if (source[j] === "(") depth++;
          else if (source[j] === ")") depth--;
          j++;
        }
      } else if (source[j] === "{") {
        const end = source.indexOf("}", j);
        j = end === -1 ? source.length : end + 1;
      } else {
        const start = j;
        while (j < source.length && VARIABLE_NAME_RE.test(source[j])) j++;
        if (j === start) j++; // special vars like `$?`, `$!`, `$@`, `$#`, `$$`, `$1`
      }
      claims.push({ start: i, end: j, className: "variable" });
      i = j;
      atCommandStart = false;
      continue;
    }

    if (char === ";" || char === "|" || char === "&" || char === "(") {
      let j = i + 1;
      if (
        (char === "|" && source[j] === "|") ||
        (char === "&" && source[j] === "&")
      )
        j++;
      i = j;
      atCommandStart = true;
      continue;
    }

    if (WORD_CHAR_RE.test(char)) {
      let j = i;
      while (j < source.length && WORD_CHAR_RE.test(source[j])) j++;
      const word = source.slice(i, j);
      let className = "";

      if (KEYWORDS.has(word)) className = "keyword";
      else if (FLAG_RE.test(word)) className = "parameter";
      else if (atCommandStart) className = "function";

      // Always claimed, even with an empty (unstyled) className — otherwise a plain
      // word like `svelte-readme` falls through to `gapFill`, which would misread
      // its hyphen as an operator and split the word in two.
      claims.push({ start: i, end: j, className });
      i = j;
      atCommandStart = false;
      continue;
    }

    i++;
  }

  return renderClaims(source, claims, gapFill);
}
