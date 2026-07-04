import { walk } from "estree-walker";
import Markdown from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import prettier from "prettier";
import Prism from "prismjs";
import { parse } from "svelte/compiler";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-yaml.js";
import "prism-svelte";
import { URL } from "node:url";
import type { PreprocessorGroup } from "svelte/compiler";

// Svelte's markup/script AST has no official types, and shares no common shape with the
// ESTree nodes `estree-walker` expects — this loose record covers both.
// biome-ignore lint/suspicious/noExplicitAny: see above
type Node = Record<string, any> & { start: number; end: number; type: string };

const aliases: Record<string, string> = {
  sh: "bash",
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
};

interface PreprocessReadmeOptions {
  name: string;
  svelte: string;
  prefixUrl: string;
  homepage: string;
  repoUrl: string;
}

const WINDOWS_PATH = /^[a-zA-Z]:\\/;
const URL_SCHEME = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
const NO_EVAL_ATTR = /no-eval/;
const NO_DISPLAY_ATTR = /no-display/;
const NODE_MODULES_PATH = /node_modules/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRelativeUrl(url: string): boolean {
  // Windows paths (e.g. "c:\foo") aren't absolute URLs, so they're treated as relative.
  if (WINDOWS_PATH.test(url)) return true;
  return !URL_SCHEME.test(url);
}

const getChildNodeText = (node: Node) => {
  return node.children
    .flatMap((child: Node) =>
      child.type === "Element" ? child.children : child,
    )
    .filter((child: Node) => child.type === "Text")
    .map((child: Node) => child.raw)
    .join("");
};

type Declaration = { name: string; start: number; end: number };
type IdentifierRange = { start: number; end: number; name: string };

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
const collectTopLevelDeclarations = (program: Node): Declaration[] => {
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
const computeRenameMap = (
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
const collectIdentifierRanges = (
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

const applyRenames = (
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

export function preprocessReadme(
  opts: Pick<PreprocessReadmeOptions, "name" | "svelte"> &
    Partial<PreprocessReadmeOptions>,
): Pick<PreprocessorGroup, "markup"> {
  const prefixUrl = opts.prefixUrl || `${opts.homepage}/tree/master/`;

  let script_content: string[] = [];
  const declared_variables = new Map<string, string>();
  const reserved_names = new Set<string>();
  const name_regex = new RegExp(escapeRegExp(opts.name), "g");
  const quoted_name_regex = new RegExp(`"${escapeRegExp(opts.name)}"`, "g");

  const md = new Markdown({
    html: true,
    linkify: true,
    typographer: true,
    highlight(source, lang, attrs) {
      if (lang === "svelte") {
        const noEval = NO_EVAL_ATTR.test(attrs);
        const noDisplay = NO_DISPLAY_ATTR.test(attrs);
        const { instance, html } = parse(source);

        // Different code fences share a single merged `<script>` once rendered, so a variable
        // declared identically in two fences (e.g. `let count = 0;`) is fine, but a name reused
        // for something different would collide. Detect that and rename the later occurrence
        // (in both its script and markup) before it's merged in.
        let renamedSource = source;

        if (instance !== undefined && !noEval) {
          const declarations = collectTopLevelDeclarations(instance.content);
          const renameMap = computeRenameMap(
            declarations,
            source,
            declared_variables,
            reserved_names,
          );

          if (renameMap.size > 0) {
            const ranges = [
              ...collectIdentifierRanges(instance.content, renameMap),
              ...collectIdentifierRanges(html, renameMap),
            ];
            renamedSource = applyRenames(source, ranges, renameMap);
          }
        }

        const renamedInstance =
          renamedSource === source ? instance : parse(renamedSource).instance;

        if (renamedInstance !== undefined && !noEval) {
          script_content = [
            ...script_content,
            ...renamedSource
              .slice(renamedInstance.start, renamedInstance.end)
              .split("\n")
              .slice(1, -1)
              .map((line) => line.trim().replace(name_regex, opts.svelte)),
          ];
        }

        const modifiedSource = encodeURI(
          renamedSource.replace(quoted_name_regex, `"${opts.svelte}"`),
        );

        let formattedCode = source;
        try {
          formattedCode = prettier.format(source, { parser: "svelte" });
        } catch (_e) {
          console.error(
            "Could not format svelte code block; displaying it unformatted.",
          );
        }

        const svelteCode = Prism.highlight(
          formattedCode,
          Prism.languages.svelte,
          "svelte",
        );
        return `<pre class="language-${lang}" ${
          noEval || noDisplay ? "" : `data-svelte="${modifiedSource}"`
        }>{@html \`${svelteCode}\`}</pre>`;
      }

      try {
        const alias_lang = aliases[lang] || lang;
        return `<pre class="language-${alias_lang}">{@html \`${Prism.highlight(
          source,
          Prism.languages[alias_lang],
          alias_lang,
        )}\`}</pre>`;
      } catch (_e) {
        console.error(`Could not highlight language "${lang}".`);
        return `<pre class="language-${lang}">{@html \`${source}\`}</pre>`;
      }
    },
  });

  md.use(markdownItAnchor);

  // Prose and inline/indented code are rendered as literal text and later re-parsed as Svelte
  // markup, so a stray `{`/`}` (e.g. `` `{ color: "red" }` ``) would be misread as a mustache
  // tag. Code fences aren't affected: their highlighted output is wrapped in a `{@html \`...\`}`
  // template literal, where curly braces are just template-string content.
  const escapeCurlyBraces = (html: string) =>
    html.replace(/{/g, "&lbrace;").replace(/}/g, "&rbrace;");

  for (const ruleName of ["text", "code_inline", "code_block"] as const) {
    const defaultRule = md.renderer.rules[ruleName];
    if (!defaultRule) continue;
    md.renderer.rules[ruleName] = (tokens, idx, options, env, self) =>
      escapeCurlyBraces(defaultRule(tokens, idx, options, env, self));
  }

  return {
    // @ts-expect-error
    markup: ({ content, filename }) => {
      if (
        filename &&
        (NODE_MODULES_PATH.test(filename) || !filename.endsWith(".md"))
      )
        return null;

      script_content = [];

      if (opts.repoUrl) {
        content = content.replace(
          "<!-- REPO_URL -->",
          `[GitHub repo](${opts.repoUrl})`,
        );
      }

      content = content.replace(
        "<!-- TOC -->",
        `
## Table of Contents
      `,
      );

      let style_content = "";
      let result = md.render(content);
      let cursor = 0;

      const ast = parse(result) as unknown as Node;

      const headings = [];
      let prev: undefined | "h2" | "h3";

      walk(
        // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
        ast as any,
        {
          // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
          enter(node: any, parent: any) {
            if (node.type === "Attribute" && node.name === "href") {
              const value = node.value[0];

              if (
                value &&
                !value.raw.startsWith("#") &&
                isRelativeUrl(value.raw)
              ) {
                const relative_path = new URL(value.raw, prefixUrl).href;
                result = result.replace(value.raw, relative_path);
                cursor += relative_path.length - value.raw.length;
              }
            }

            if (node.type === "Style") {
              style_content += result.slice(
                node.content.start,
                node.content.end,
              );
              const replace_style = result.slice(
                node.start + cursor,
                node.end + cursor,
              );
              result = result.replace(replace_style, "");
              cursor -= replace_style.length;
            }

            if (node.type === "Element" && node.name === "h2") {
              // @ts-expect-error
              const id = node.attributes.find((attr) => attr.name === "id")
                .value[0].raw;

              if (id === "table-of-contents") return;

              const text = getChildNodeText(node);

              if (text !== undefined) {
                if (prev === "h3") {
                  headings.push(`</ul><li><a href="#${id}">${text}</a></li>`);
                } else {
                  headings.push(`<li><a href="#${id}">${text}</a></li>`);
                }

                prev = "h2";
              }
            }

            if (node.type === "Element" && node.name === "h3") {
              // @ts-expect-error
              const id = node.attributes.find((attr) => attr.name === "id")
                .value[0].raw;
              const text = getChildNodeText(node);

              if (text !== undefined) {
                if (prev === "h2") {
                  headings.push(`<ul><li><a href="#${id}">${text}</a></li>`);
                } else {
                  headings.push(`<li><a href="#${id}">${text}</a></li>`);
                }

                prev = "h3";
              }
            }

            if (
              node.type === "Attribute" &&
              node.name === "data-svelte" &&
              parent
            ) {
              const raw_value = node.value[0].raw;
              const value = decodeURI(raw_value);
              const value_ast = parse(value) as unknown as Node;
              const markup = `<div class="code-fence">${value.slice(value_ast.html.start, value_ast.html.end)}</div>`;
              const replace = result.slice(
                parent.start + cursor,
                parent.end + cursor,
              );
              result = result.replace(
                replace,
                markup + replace.replace(raw_value, ""),
              );
              cursor += markup.length - raw_value.length;
            }
          },
        },
      );

      if (prev === "h3") {
        headings.push("</ul>");
      }

      result = result.replace(
        `<h2 id="table-of-contents">Table of Contents</h2>`,
        `<p><strong>Table of Contents</strong></p><ul>${headings.join("\n")}</ul>`,
      );

      return {
        code: `<script>${[...new Set(script_content)].join("\n")}</script>
               <style>${style_content}</style>
               <main class="markdown-body">${result}</main>`,
      };
    },
  };
}
