import { escapeRegExp } from "./preprocessReadme.utils.js";

interface Token {
  type: "tag" | "class" | "id" | "attr";
  name: string;
}

const AT_RULE_NAME = /^@([-\w]+)/;

// Extracts the identifiers a selector requires an element to have in order to match:
// tag names, classes, ids, and attribute names. Pseudo-classes/elements (`:hover`,
// `::before`, `:first-child`, ...) and anything inside a pseudo-function's parens
// (`:not(...)`, `:nth-child(...)`) carry no verifiable static markup, so they're
// dropped rather than turned into (possibly wrong) requirements. A selector that
// reduces to no identifiers (e.g. `*`, `:root`) returns `[]`, which callers treat
// as "can't verify — keep".
function extractTokens(selector: string): Token[] {
  let s = selector;
  const attrs: string[] = [];

  s = s.replace(/:[-\w]+\([^)]*\)/g, " ");
  s = s.replace(/\[([-\w]+)[^\]]*\]/g, (_match, name: string) => {
    attrs.push(name);
    return " ";
  });
  s = s.replace(/::?[-\w]+/g, " ");
  s = s.replace(/[>+~]/g, " ");

  const tokens: Token[] = attrs.map((name) => ({ type: "attr", name }));

  for (const match of s.matchAll(/[.#]?[-\w]+/g)) {
    const raw = match[0];
    if (raw.startsWith(".")) tokens.push({ type: "class", name: raw.slice(1) });
    else if (raw.startsWith("#"))
      tokens.push({ type: "id", name: raw.slice(1) });
    else tokens.push({ type: "tag", name: raw });
  }

  return tokens;
}

// Whole-html substring checks — a false positive (token "found" when it isn't actually
// reachable by the selector) only means an unused rule survives, never that a used one
// is dropped, so this stays deliberately loose rather than parsing the DOM.
function isTokenPresent(token: Token, html: string): boolean {
  const escaped = escapeRegExp(token.name);

  switch (token.type) {
    case "tag":
      return new RegExp(`<${escaped}(?=[\\s/>])`, "i").test(html);
    case "attr":
      return new RegExp(`\\b${escaped}\\s*=`, "i").test(html);
    default:
      return new RegExp(`\\b${escaped}\\b`).test(html);
  }
}

function isSelectorUsed(
  selectorList: string,
  html: string,
  alwaysKeepClasses: Set<string>,
): boolean {
  return selectorList.split(",").some((selector) => {
    const tokens = extractTokens(selector);
    return (
      tokens.length === 0 ||
      tokens.some(
        (token) => token.type === "class" && alwaysKeepClasses.has(token.name),
      ) ||
      tokens.every((token) => isTokenPresent(token, html))
    );
  });
}

function findMatchingBrace(css: string, openIndex: number): number {
  let depth = 1;

  for (let i = openIndex + 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return css.length;
}

// Drops rules whose selector can't possibly match anything in `html`, so the served
// stylesheet only carries the subset of the static CSS blob that this particular
// README's rendered markup can actually use. Assumes well-formed, comment-free input
// (no `{`/`}`/`;` inside strings) — true for the generated stylesheet and the
// hand-written blocks this runs against — so a manual brace-depth scan is enough
// without a full CSS parser.
//
// `alwaysKeepClasses` covers classes that only ever get added client-side after
// hydration (e.g. `sr-toc-active`, toggled by scroll-spy JS) — they never appear in
// the server-rendered `html` this purge checks against, so without an explicit
// allowlist their rules would look unused and get stripped from every build.
export function purgeUnusedCss(
  rawCss: string,
  html: string,
  alwaysKeepClasses: string[] = [],
): string {
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  return purgeStrippedCss(css, html, new Set(alwaysKeepClasses));
}

// Recurses on `@media`/`@supports` bodies without redoing the comment strip (already
// comment-free, having been sliced out of an already-stripped parent) or rebuilding
// `alwaysKeep` (it doesn't change across the recursion).
function purgeStrippedCss(
  css: string,
  html: string,
  alwaysKeep: Set<string>,
): string {
  let result = "";
  let i = 0;

  while (i < css.length) {
    const braceIndex = css.indexOf("{", i);

    if (braceIndex === -1) {
      result += css.slice(i);
      break;
    }

    const header = css.slice(i, braceIndex);
    const blockEnd = findMatchingBrace(css, braceIndex);
    const block = css.slice(braceIndex + 1, blockEnd);
    const atRule = header.trim().match(AT_RULE_NAME)?.[1];

    if (atRule === "media" || atRule === "supports") {
      const filteredBlock = purgeStrippedCss(block, html, alwaysKeep);
      if (filteredBlock.trim().length > 0) {
        result += `${header}{${filteredBlock}}`;
      }
    } else if (atRule !== undefined) {
      // `@font-face`, `@keyframes`, etc. have no element selector to check — keep as-is.
      result += `${header}{${block}}`;
    } else if (isSelectorUsed(header, html, alwaysKeep)) {
      result += `${header}{${block}}`;
    }

    i = blockEnd + 1;
  }

  return result;
}
