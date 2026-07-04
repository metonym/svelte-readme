import { URL } from "node:url";
import { walk } from "estree-walker";
import Markdown from "markdown-it";
import type { PreprocessorGroup } from "svelte/compiler";
import { parse } from "svelte/compiler";
import { highlightSvelte } from "./highlight/svelte.js";
import {
  aliases,
  applyRenames,
  collectIdentifierRanges,
  collectTopLevelDeclarations,
  computeRenameMap,
  escapeForTemplateLiteral,
  escapeRegExp,
  getChildNodeText,
  highlightCode,
  isRelativeUrl,
  type Node,
} from "./utils/preprocessReadme.utils.js";

interface PreprocessReadmeOptions {
  name: string;
  svelte: string;
  prefixUrl: string;
  homepage: string;
  repoUrl: string;
  /**
   * Called with the source of each `svelte` code fence before it's highlighted for display,
   * so the consumer can pretty-print it with their own formatter (e.g. Prettier). The code
   * fence is displayed unformatted if this is omitted or its result rejects/throws.
   */
  format: (source: string) => string | Promise<string>;
}

const NO_EVAL_ATTR = /no-eval/;
const NO_DISPLAY_ATTR = /no-display/;
const NODE_MODULES_PATH = /node_modules/;

// Appends a heading's TOC entry, opening/closing the nested `<ul>` when transitioning
// between h2 and h3 siblings (h3s nest under the preceding h2; h2s close it back out).
function pushHeadingToToc(
  level: "h2" | "h3",
  node: Node,
  prev: "h2" | "h3" | undefined,
  headings: string[],
): "h2" | "h3" | undefined {
  // @ts-expect-error — Svelte's markup AST has no official types (see `Node` above)
  const id = node.attributes.find((attr) => attr.name === "id").value[0].raw;
  const text = getChildNodeText(node);

  if (text === undefined) return prev;

  const prefix =
    level === "h2" && prev === "h3"
      ? "</ul>"
      : level === "h3" && prev === "h2"
        ? "<ul>"
        : "";
  headings.push(`${prefix}<li><a href="#${id}">${text}</a></li>`);

  return level;
}

// Underlines whichever `.sr-toc-sidebar` link points at the heading currently
// scrolled into the top portion of the viewport (the `.sr-toc-inline` copy shown
// on mobile has no sticky position to track against, so it's excluded).
// Concatenated directly into the final <script> tag (not merged through
// `script_content`'s line-level Set dedup),
// since a generic line here — e.g. a bare `onMount(() => {` — could otherwise
// collide with an identical line from an unrelated demo fence and get dropped,
// leaving the rest of this function's body dangling outside any function. The
// `onMount` import is aliased so it can't collide with a demo's own import of
// the same name either.
const TOC_SCROLL_SPY_SCRIPT = `import { onMount as __svelteReadmeOnMount } from "svelte";

__svelteReadmeOnMount(() => {
  // \`href\` and the heading's \`id\` are both the same slug produced by the
  // preprocessor, so this looks it up verbatim (no decode/encode step).
  const __svelteReadmeTocEntries = Array.from(
    document.querySelectorAll(".sr-toc-sidebar a[href^='#']"),
  )
    .map((link) => ({
      link,
      target: document.getElementById(link.getAttribute("href").slice(1)),
    }))
    .filter((entry) => entry.target);

  if (!__svelteReadmeTocEntries.length) return;

  const __svelteReadmeUpdateActive = () => {
    const __svelteReadmeOffset = 96;
    let __svelteReadmeCurrent = null;

    for (const entry of __svelteReadmeTocEntries) {
      if (entry.target.getBoundingClientRect().top - __svelteReadmeOffset <= 0) {
        __svelteReadmeCurrent = entry;
      } else {
        break;
      }
    }

    for (const entry of __svelteReadmeTocEntries) {
      entry.link.classList.toggle(
        "sr-toc-active",
        entry === __svelteReadmeCurrent,
      );
    }
  };

  let __svelteReadmeTicking = false;
  const __svelteReadmeOnScroll = () => {
    if (__svelteReadmeTicking) return;
    __svelteReadmeTicking = true;
    requestAnimationFrame(() => {
      __svelteReadmeTicking = false;
      __svelteReadmeUpdateActive();
    });
  };

  // The TOC isn't sticky below the layout's 900px mobile breakpoint (it's a
  // static block after the content instead), so scroll-spy only runs above it —
  // and re-syncs on resize/orientation change in case that crosses the breakpoint.
  const __svelteReadmeMobileQuery = window.matchMedia("(max-width: 900px)");
  const __svelteReadmeSyncScrollSpy = () => {
    window.removeEventListener("scroll", __svelteReadmeOnScroll);
    if (__svelteReadmeMobileQuery.matches) {
      for (const entry of __svelteReadmeTocEntries) {
        entry.link.classList.remove("sr-toc-active");
      }
    } else {
      window.addEventListener("scroll", __svelteReadmeOnScroll, {
        passive: true,
      });
      __svelteReadmeUpdateActive();
    }
  };

  __svelteReadmeMobileQuery.addEventListener(
    "change",
    __svelteReadmeSyncScrollSpy,
  );
  __svelteReadmeSyncScrollSpy();
});`;

export function preprocessReadme(
  opts: Pick<PreprocessReadmeOptions, "name" | "svelte"> &
    Partial<PreprocessReadmeOptions>,
): Pick<PreprocessorGroup, "markup"> {
  const prefixUrl = opts.prefixUrl || `${opts.homepage}/tree/master/`;

  let script_content: string[] = [];
  let pending_format: { placeholder: string; source: string }[] = [];
  const declared_variables = new Map<string, string>();
  const reserved_names = new Set<string>();
  const name_regex = new RegExp(escapeRegExp(opts.name), "g");
  const quoted_name_regex = new RegExp(`"${escapeRegExp(opts.name)}"`, "g");

  const md = new Markdown({
    html: true,
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

        // `opts.format` may be async, but markdown-it's `highlight` must return synchronously,
        // so formatting is deferred: a placeholder is emitted here and swapped for the
        // formatted+highlighted code once `md.render()` returns (see `markup` below).
        const placeholder = `__SVELTE_README_FORMAT_${pending_format.length}__`;
        pending_format.push({ placeholder, source });

        return `<pre class="language-${lang}" ${
          noEval || noDisplay ? "" : `data-svelte="${modifiedSource}"`
        }>{@html \`${placeholder}\`}</pre>`;
      }

      try {
        const alias_lang = aliases[lang] || lang;
        const highlighted = escapeForTemplateLiteral(
          highlightCode(source, alias_lang),
        );
        return `<pre class="language-${alias_lang}">{@html \`${highlighted}\`}</pre>`;
      } catch (_e) {
        console.error(`Could not highlight language "${lang}".`);
        return `<pre class="language-${lang}">{@html \`${escapeForTemplateLiteral(source)}\`}</pre>`;
      }
    },
  });

  // Assigns each heading an `id` slug, mirroring markdown-it-anchor's default `slugify`
  // (`encodeURIComponent(text.trim().toLowerCase().replace(/\s+/g, "-"))`) and its dedupe
  // scheme (repeat headings get `-1`, `-2`, ... suffixes).
  md.core.ruler.push("heading_id", (state) => {
    const seen = new Set<string>();

    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type !== "heading_open") continue;

      const text = (state.tokens[i + 1].children ?? [])
        .filter(
          (child) => child.type === "text" || child.type === "code_inline",
        )
        .map((child) => child.content)
        .join("");

      const slug = encodeURIComponent(
        text.trim().toLowerCase().replace(/\s+/g, "-"),
      );

      let id = slug;
      let suffix = 1;
      while (seen.has(id)) {
        id = `${slug}-${suffix}`;
        suffix += 1;
      }
      seen.add(id);

      token.attrSet("id", id);
    }
  });

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

  async function processMarkup(content: string) {
    script_content = [];
    pending_format = [];

    if (opts.repoUrl) {
      content = content.replaceAll(
        "<!-- REPO_URL -->",
        `[GitHub repo](${opts.repoUrl})`,
      );
    }

    const tokens = md.parse(content, {});

    let style_content = "";
    let result = md.renderer.render(tokens, md.options, {});
    let cursor = 0;

    const ast = parse(result) as unknown as Node;

    const headings: string[] = [];
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
            style_content += result.slice(node.content.start, node.content.end);
            const replace_style = result.slice(
              node.start + cursor,
              node.end + cursor,
            );
            result = result.replace(replace_style, "");
            cursor -= replace_style.length;
          }

          if (
            node.type === "Element" &&
            (node.name === "h2" || node.name === "h3")
          ) {
            prev = pushHeadingToToc(node.name, node, prev, headings);
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

    const formattedBlocks = await Promise.all(
      pending_format.map(async ({ source }) => {
        if (!opts.format) return source;

        try {
          return await opts.format(source);
        } catch (_e) {
          console.error(
            "Could not format svelte code block; displaying it unformatted.",
          );
          return source;
        }
      }),
    );

    pending_format.forEach(({ placeholder }, i) => {
      const svelteCode = escapeForTemplateLiteral(
        highlightSvelte(formattedBlocks[i]),
      );
      // A function replacer (rather than a string) so a `$&`/`$1`/etc.-shaped
      // substring in the highlighted code isn't misread as a `replace()` pattern.
      result = result.replace(placeholder, () => svelteCode);
    });

    const tocContent = headings.length
      ? `<p><strong>On this page</strong></p><ul>${headings.join("\n")}</ul>`
      : "";

    // The sidebar (desktop) copy is always a fixed sibling of `<main>`. The inline
    // copy (shown on mobile, where there's no sidebar column to stick it in) goes
    // wherever the README author placed the `<!-- TOC -->` marker, falling back to
    // right after the content when no marker is present.
    const tocSidebar = tocContent
      ? `<nav class="sr-toc sr-toc-sidebar">${tocContent}</nav>`
      : "";

    if (tocContent) {
      const tocInline = `<nav class="sr-toc sr-toc-inline">${tocContent}</nav>`;
      result = result.includes("<!-- TOC -->")
        ? result.replaceAll("<!-- TOC -->", tocInline)
        : `${result}${tocInline}`;
    }

    return {
      code: `<script>${[...new Set(script_content)].join("\n")}
               ${headings.length ? TOC_SCROLL_SPY_SCRIPT : ""}</script>
               ${style_content.trim() ? `<style>${style_content}</style>` : ""}
               <div class="sr-layout"><main class="markdown-body">${result}</main>${tocSidebar}</div>`,
    };
  }

  return {
    // @ts-expect-error
    markup: async ({ content, filename }) => {
      if (
        filename &&
        (NODE_MODULES_PATH.test(filename) || !filename.endsWith(".md"))
      )
        return null;

      return processMarkup(content);
    },
  };
}
