import { walk } from "estree-walker";
import { parse } from "svelte/compiler";
import {
  type Claim,
  escapeHtml,
  readGrammarCss,
  renderClaims,
  token,
} from "./shared.js";
import { codeGapFill, collectLeafClaims } from "./typescript.js";

// Classes unique to this highlighter: markup (tag/attr-name/attr-value) and the CSS it
// claims inside a fence's own `<style>` block (selector/property). Everything else this
// module emits (keyword, punctuation, comment, string, number, ...) is shared with the
// script-content highlighter it delegates to (`./typescript.js`) and styled in `./shared.js`.
export const styles: string = readGrammarCss(import.meta.url, "svelte.css");

// `{#if ...}` / `{:else}` / `{/each}` etc. — the block-keyword text right after the
// sigil is matched greedily so e.g. `{:else` comes back as one span.
const BLOCK_MARKER_RE = /\{[#:/]\w*/g;
const AT_WORD_RE = /^@\w+/;

function markupGapFill(text: string): string {
  let html = "";
  let cursor = 0;

  for (const match of text.matchAll(BLOCK_MARKER_RE)) {
    if (match.index > cursor)
      html += codeGapFill(text.slice(cursor, match.index));
    html += token("keyword", match[0]);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) html += codeGapFill(text.slice(cursor));

  return html;
}

// Claims the `{`/`}` (or `{@word`) delimiters of an `ExpressionTag`/`HtmlTag`/`ConstTag`/
// `DebugTag`/`RenderTag`/`AttachTag`/`SpreadAttribute` — the tag's own JS content is
// already covered separately by `collectLeafClaims`.
function claimBraceTag(node: Node_, claims: Claim[], source: string) {
  claims.push({
    start: node.start,
    end: node.start + 1,
    className: "punctuation",
  });
  claims.push({ start: node.end - 1, end: node.end, className: "punctuation" });

  const atWord = AT_WORD_RE.exec(source.slice(node.start + 1, node.end - 1));
  if (atWord) {
    const start = node.start + 1;
    claims.push({ start, end: start + atWord[0].length, className: "keyword" });
  }
}

function claimElementTag(
  node: Node_,
  claims: Claim[],
  source: string,
  name: string,
) {
  claims.push({
    start: node.start,
    end: node.start + 1,
    className: "punctuation",
  });

  const nameStart = node.start + 1;
  const nameEnd = nameStart + name.length;
  if (source.slice(nameStart, nameEnd) === name) {
    claims.push({ start: nameStart, end: nameEnd, className: "tag" });
  }

  const attributes: Node_[] = node.attributes ?? [];
  const lastAttr = attributes[attributes.length - 1];
  const openTagEnd = source.indexOf(">", lastAttr ? lastAttr.end : nameEnd);

  if (openTagEnd !== -1) {
    const selfClosing = source[openTagEnd - 1] === "/";
    claims.push({
      start: selfClosing ? openTagEnd - 1 : openTagEnd,
      end: openTagEnd + 1,
      className: "punctuation",
    });
  }

  const closingTag = `</${name}>`;
  const closingStart = node.end - closingTag.length;

  if (
    closingStart >= node.start &&
    source.slice(closingStart, node.end) === closingTag
  ) {
    claims.push({
      start: closingStart,
      end: closingStart + 2,
      className: "punctuation",
    });
    claims.push({
      start: closingStart + 2,
      end: node.end - 1,
      className: "tag",
    });
    claims.push({
      start: node.end - 1,
      end: node.end,
      className: "punctuation",
    });
  }
}

// `name_loc` is an ESTree `SourceLocation` (1-based line + 0-based column), not a byte
// offset, so it needs converting against a precomputed table of line-start offsets
// before it can be used to slice `source`.
function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function positionToOffset(
  lineStarts: number[],
  position: { line: number; column: number },
): number {
  return lineStarts[position.line - 1] + position.column;
}

// Claims the whole `on:click` / `bind:value` / `href` span (prefix + name together) as
// `attr-name`, resolving `name_loc` via `lineStarts` since it's line/column, not offsets.
function claimAttrName(node: Node_, claims: Claim[], lineStarts: number[]) {
  const end = node.name_loc
    ? positionToOffset(lineStarts, node.name_loc.end)
    : node.start + node.name.length;
  claims.push({ start: node.start, end, className: "attr-name" });
}

function claimAttributeValue(value: unknown, claims: Claim[]) {
  if (!Array.isArray(value)) return;

  for (const part of value as Node_[]) {
    if (part.type === "Text") {
      claims.push({
        start: part.start,
        end: part.end,
        className: "attr-value",
      });
    }
    // `ExpressionTag` children are picked up generically by the walk below.
  }
}

// biome-ignore lint/suspicious/noExplicitAny: Svelte's AST has no shared types with estree-walker's Node
type Node_ = Record<string, any> & { start: number; end: number; type: string };

const BLOCK_TYPES = new Set([
  "IfBlock",
  "EachBlock",
  "AwaitBlock",
  "KeyBlock",
  "SnippetBlock",
]);
const BRACE_TAG_TYPES = new Set([
  "ExpressionTag",
  "HtmlTag",
  "ConstTag",
  "DebugTag",
  "RenderTag",
  "AttachTag",
  "SpreadAttribute",
]);
const ELEMENT_TYPES = new Set([
  "RegularElement",
  "Component",
  "TitleElement",
  "SlotElement",
  "SvelteBody",
  "SvelteComponent",
  "SvelteDocument",
  "SvelteElement",
  "SvelteFragment",
  "SvelteBoundary",
  "SvelteHead",
  "SvelteSelf",
  "SvelteWindow",
]);
const DIRECTIVE_TYPES = new Set([
  "AnimateDirective",
  "BindDirective",
  "ClassDirective",
  "LetDirective",
  "OnDirective",
  "StyleDirective",
  "TransitionDirective",
  "UseDirective",
]);
const SELECTOR_TYPES = new Set([
  "ClassSelector",
  "IdSelector",
  "TypeSelector",
  "PseudoClassSelector",
  "PseudoElementSelector",
]);

function walkMarkupAndCss(root: Node_, source: string): Claim[] {
  const claims: Claim[] = [];
  const lineStarts = buildLineStarts(source);

  walk(
    // biome-ignore lint/suspicious/noExplicitAny: estree-walker's types don't match Svelte's AST (see `Node_` above)
    root as any,
    {
      // biome-ignore lint/suspicious/noExplicitAny: estree-walker's types don't match Svelte's AST (see `Node_` above)
      enter(node: any, parent: any, key: any) {
        if (BLOCK_TYPES.has(node.type) || BRACE_TAG_TYPES.has(node.type)) {
          if (BRACE_TAG_TYPES.has(node.type))
            claimBraceTag(node, claims, source);
          return;
        }

        switch (node.type) {
          case "Comment":
            claims.push({
              start: node.start,
              end: node.end,
              className: "comment",
            });
            break;
          case "Text": {
            const inAttributeValue =
              key === "value" &&
              (parent?.type === "Attribute" ||
                parent?.type === "StyleDirective");
            claims.push({
              start: node.start,
              end: node.end,
              className: inAttributeValue ? "attr-value" : "",
            });
            break;
          }
          case "Attribute":
            claimAttrName(node, claims, lineStarts);
            claimAttributeValue(node.value, claims);
            break;
          case "Script":
            claimElementTag(node, claims, source, "script");
            break;
          case "StyleSheet":
            claimElementTag(node, claims, source, "style");
            break;
          default:
            if (ELEMENT_TYPES.has(node.type)) {
              claimElementTag(node, claims, source, node.name);
            } else if (DIRECTIVE_TYPES.has(node.type)) {
              claimAttrName(node, claims, lineStarts);
              if (node.type === "StyleDirective")
                claimAttributeValue(node.value, claims);
            } else if (SELECTOR_TYPES.has(node.type)) {
              claims.push({
                start: node.start,
                end: node.end,
                className: "selector",
              });
            } else if (node.type === "Declaration") {
              const propEnd = node.start + node.property.length;
              if (source.slice(node.start, propEnd) === node.property) {
                claims.push({
                  start: node.start,
                  end: propEnd,
                  className: "property",
                });
              }
            } else if (node.type === "Atrule") {
              const end = node.start + 1 + node.name.length;
              if (source.slice(node.start + 1, end) === node.name) {
                claims.push({ start: node.start, end, className: "atrule" });
              }
            }
        }
      },
    },
  );

  return claims;
}

export function highlightSvelte(source: string): string {
  let root: Node_;

  try {
    root = parse(source, { modern: true }) as unknown as Node_;
  } catch {
    return escapeHtml(source);
  }

  const claims = collectLeafClaims(root, 0);
  claims.push(...walkMarkupAndCss(root, source));

  for (const comment of root.comments ?? []) {
    claims.push({
      start: comment.start,
      end: comment.end,
      className: "comment",
    });
  }

  return renderClaims(source, claims, markupGapFill);
}
