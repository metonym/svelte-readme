import { walk } from "estree-walker";
import type { Node } from "./preprocessReadme.utils.js";

interface Edit {
  start: number;
  end: number;
  replacement: string;
}

const LANG_TS_ATTR = /\blang\s*=\s*(["']?)(?:ts|typescript)\1/;

// Accessibility/`readonly`/`abstract`/`override`/`declare` share a modifier-prefix span
// with plain JS keywords (`static`, `async`, `get`, `set`) that must survive, so only
// these are stripped out of that prefix rather than deleting it wholesale.
const TS_ONLY_MODIFIERS =
  /\b(?:public|private|protected|readonly|abstract|override|declare)\b\s*/g;

const AS_OR_SATISFIES = /\bas\b|\bsatisfies\b/;

// Deleting a whole-line statement (an interface, a `declare`, ...) leaves its own
// now-empty line behind, which reads as an extra blank line wherever the statement
// wasn't already flanked by one of its own. Collapses any run of 2+ blank-or-
// whitespace-only lines down to a single blank line; a single existing blank line
// matches too, but replaces with itself, so normal spacing is untouched.
const EXTRA_BLANK_LINES = /\n(?:[ \t]*\n)+/g;

// Declarations that exist purely for the type checker and have no runtime
// representation at all — the whole statement (including a wrapping `export`)
// is dropped rather than edited in place. `enum`/non-`declare` `namespace` are
// deliberately not supported (erasing them isn't a text-only operation — they
// still carry runtime code/values), so a fence that uses either one falls back
// to `preprocessReadme.ts`'s existing single-variant behavior once `stripTypeScript`'s
// caller re-parses the result and finds it still isn't valid JS.
const TYPE_ONLY_DECLARATIONS = new Set([
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSDeclareFunction",
  "TSModuleDeclaration",
]);

function statementNode(node: Node, parent: Node | undefined): Node {
  return parent?.type === "ExportNamedDeclaration" &&
    parent.declaration === node
    ? parent
    : node;
}

function stripImportSpecifier(
  specifiers: Node[],
  specifier: Node,
  edits: Edit[],
  source: string,
): void {
  const index = specifiers.indexOf(specifier);
  let start = specifier.start;
  let end = specifier.end;

  if (index < specifiers.length - 1) {
    // Not the last specifier: consume its own trailing comma (and following
    // whitespace) so removing it doesn't leave a dangling `, ,`.
    const commaIndex = source.indexOf(",", end);
    if (commaIndex !== -1) end = commaIndex + 1;
    while (source[end] === " ") end += 1;
  } else if (index > 0) {
    // Last specifier: consume the *preceding* comma instead, since there's no
    // trailing one to claim.
    const previousEnd = specifiers[index - 1].end;
    const commaIndex = source.lastIndexOf(",", start);
    if (commaIndex >= previousEnd) start = commaIndex;
  }

  edits.push({ start, end, replacement: "" });
}

function collectTypeEdits(root: Node, edits: Edit[], source: string): void {
  walk(
    // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
    root as any,
    {
      // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
      enter(node: any, parent: any) {
        if (TYPE_ONLY_DECLARATIONS.has(node.type)) {
          const target = statementNode(node, parent);
          edits.push({ start: target.start, end: target.end, replacement: "" });
          this.skip();
          return;
        }

        if (node.declare === true) {
          const target = statementNode(node, parent);
          edits.push({ start: target.start, end: target.end, replacement: "" });
          this.skip();
          return;
        }

        if (node.type === "ImportDeclaration") {
          if (node.importKind === "type") {
            edits.push({ start: node.start, end: node.end, replacement: "" });
            this.skip();
            return;
          }

          // Only brace-wrapped named specifiers are comma-separated from each other —
          // a leading default/namespace specifier is joined to that `{ ... }` block by
          // its own comma, not a list one, so it's excluded from the neighbor search
          // `stripImportSpecifier` does below.
          const namedSpecifiers: Node[] = (node.specifiers ?? []).filter(
            (specifier: Node) => specifier.type === "ImportSpecifier",
          );
          for (const specifier of namedSpecifiers) {
            if (specifier.importKind === "type") {
              stripImportSpecifier(namedSpecifiers, specifier, edits, source);
            }
          }
        }

        if (
          node.type === "TSAsExpression" ||
          node.type === "TSSatisfiesExpression"
        ) {
          // Both wrap `<expr> as Type`/`<expr> satisfies Type`; any parens grouping
          // `expr` sit in the gap between `expression.end` and this node's own `end`
          // too, so only the `as`/`satisfies` keyword onward is deleted, not the gap
          // itself — that keeps a leading paren balanced against its closer.
          const gapStart = node.expression.end;
          const match = AS_OR_SATISFIES.exec(source.slice(gapStart, node.end));
          if (match) {
            edits.push({
              start: gapStart + match.index,
              end: node.end,
              replacement: "",
            });
          }
        }

        if (
          node.type === "TSNonNullExpression" &&
          source[node.end - 1] === "!"
        ) {
          edits.push({ start: node.end - 1, end: node.end, replacement: "" });
        }

        // Old-style `<Type>expr` cast — the type+brackets prefix is everything
        // before the wrapped expression starts.
        if (node.type === "TSTypeAssertion") {
          edits.push({
            start: node.start,
            end: node.expression.start,
            replacement: "",
          });
        }

        // `constructor(public y: number)` parameter properties — the accessibility/
        // `readonly` modifiers are a plain prefix before the real parameter, which
        // keeps its own `typeAnnotation` handled generically below.
        if (node.type === "TSParameterProperty") {
          edits.push({
            start: node.start,
            end: node.parameter.start,
            replacement: "",
          });
        }

        // Colon-style annotations: `name: Type` (vars, params, class fields) and
        // `(): Type` return types. `typeAnnotation.start` sits exactly at the `:`
        // when the binding isn't optional — when it is, a single `?` occupies the
        // character right before it (`name?: Type`), so that's included too.
        if (node.typeAnnotation?.type === "TSTypeAnnotation") {
          const ta = node.typeAnnotation;
          const start = node.optional ? ta.start - 1 : ta.start;
          edits.push({ start, end: ta.end, replacement: "" });
        } else if (node.optional === true && source[node.end - 1] === "?") {
          // A bare optional parameter with no annotation of its own (`function f(x?) {}`) —
          // `node.end` extends through the `?` the same way it extends through a
          // `typeAnnotation` above, so it's the same trailing character either way.
          edits.push({ start: node.end - 1, end: node.end, replacement: "" });
        }

        if (node.returnType?.type === "TSTypeAnnotation") {
          edits.push({
            start: node.returnType.start,
            end: node.returnType.end,
            replacement: "",
          });
        }

        // Generic type parameters/arguments: `<T>` on declarations, calls, `new`,
        // and a class's `extends`. Each node's own range already spans the
        // surrounding angle brackets, so deleting it is enough.
        for (const key of [
          "typeParameters",
          "typeArguments",
          "superTypeArguments",
        ]) {
          const value = node[key];
          if (
            value?.type === "TSTypeParameterDeclaration" ||
            value?.type === "TSTypeParameterInstantiation"
          ) {
            edits.push({ start: value.start, end: value.end, replacement: "" });
          }
        }

        // Class member modifiers (`private`/`readonly`/... before the key) — see
        // `TS_ONLY_MODIFIERS` above for why this is a targeted replace, not a delete.
        if (
          (node.type === "PropertyDefinition" ||
            node.type === "MethodDefinition") &&
          node.key &&
          node.start < node.key.start
        ) {
          const prefix = source.slice(node.start, node.key.start);
          const cleaned = prefix.replace(TS_ONLY_MODIFIERS, "");
          if (cleaned !== prefix) {
            edits.push({
              start: node.start,
              end: node.key.start,
              replacement: cleaned,
            });
          }
        }
      },
    },
  );
}

// Applies non-overlapping edits to `source`. Edits nested inside a larger one already
// applied (e.g. a generic's own inner type reference, when the whole generic argument
// list is already being deleted) are discarded rather than double-processed.
function applyEdits(source: string, edits: Edit[]): string {
  if (edits.length === 0) return source;

  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Edit[] = [];
  let cursor = -1;

  for (const edit of sorted) {
    if (edit.start < cursor) continue;
    kept.push(edit);
    cursor = edit.end;
  }

  let result = "";
  let pos = 0;
  for (const edit of kept) {
    result += source.slice(pos, edit.start) + edit.replacement;
    pos = edit.end;
  }
  result += source.slice(pos);

  return result;
}

// Whether a parsed `svelte` fence's `<script>` opts into TypeScript (`lang="ts"`, with or
// without quotes, or the `typescript` spelling). Checked against the opening tag's own
// text (`instance.start` to `instance.content.start`) rather than the whole fence, so a
// coincidental "lang=ts"-shaped string elsewhere in the fence can't produce a false match.
export function hasTypeScriptLang(source: string, instance: Node): boolean {
  return LANG_TS_ATTR.test(
    source.slice(instance.start, instance.content.start),
  );
}

// Best-effort TypeScript-to-JavaScript eraser for a single `svelte` fence: drops the
// `<script>` tag's `lang="ts"` attribute and deletes every type-only construct from its
// content (annotations, interfaces/type aliases, generics, `as`/`satisfies`, non-null
// assertions, `import type`, and accessibility/`readonly` modifiers), leaving everything
// else — including formatting — untouched. Only covers TypeScript's *erasable* subset;
// constructs with real runtime semantics of their own (`enum`, non-`declare` `namespace`,
// decorators) are left as-is, which the caller detects by re-parsing the result.
export function stripTypeScript(source: string, instance: Node): string {
  const edits: Edit[] = [];

  const tagText = source.slice(instance.start, instance.content.start);
  const langMatch = LANG_TS_ATTR.exec(tagText);

  if (langMatch) {
    let start = instance.start + langMatch.index;
    const end = start + langMatch[0].length;
    if (source[start - 1] === " ") start -= 1;
    edits.push({ start, end, replacement: "" });
  }

  collectTypeEdits(instance.content, edits, source);

  return applyEdits(source, edits).replace(EXTRA_BLANK_LINES, "\n\n");
}
