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
import { hasTypeScriptLang, stripTypeScript } from "./utils/stripTypeScript.js";

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
const HAS_TABLE_TAG = /<table[\s>]/;

// Strips everything between a `<!-- HIDE_START -->`/`<!-- HIDE_END -->` pair (including the
// markers themselves) before markdown parsing, so README authors can wrap content that should
// stay in the raw README (e.g. npm/GitHub badges) but never reach the live app. Operates on the
// raw markdown text — rather than the parsed AST — so a hidden block can span arbitrary
// structure (headings, code fences, images) without needing to be balanced HTML/markdown itself.
// Non-greedy so adjacent pairs don't merge into one hidden span; unterminated/nested markers
// aren't supported.
const HIDE_BLOCK = /<!--\s*HIDE_START\s*-->[\s\S]*?<!--\s*HIDE_END\s*-->/g;

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

// Shared by every snippet below that needs `onMount` (TOC scroll-spy, theme toggle,
// copy-button wiring): each snippet is concatenated directly into the final <script> tag rather
// than merged through `script_content`'s line-level Set dedup, so importing `onMount`
// separately in each one would double-declare the binding when more than one snippet
// is present on the same page. Aliased so it can't collide with a demo's own import
// of the same name either.
const SVELTE_README_ON_MOUNT_IMPORT = `import { onMount as __svelteReadmeOnMount } from "svelte";`;

// Underlines whichever `.sr-toc-sidebar` link points at the heading currently
// scrolled into the top portion of the viewport (the `.sr-toc-inline` copy shown
// on mobile has no sticky position to track against, so it's excluded).
const TOC_SCROLL_SPY_SCRIPT = `__svelteReadmeOnMount(() => {
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

// Toggles `data-sr-theme` on `<html>` between "light" and "dark", persisting the choice
// to `localStorage` under the same key the synchronous head script (`THEME_INIT_SCRIPT`
// in `svelteReadme.ts`) reads on the next load. Rendered once per TOC variant (sidebar
// and inline — see `THEME_TOGGLE_MARKUP` below), so every button on the page is wired
// and kept in sync here rather than just the first one found.
const THEME_TOGGLE_SCRIPT = `__svelteReadmeOnMount(() => {
  const __svelteReadmeThemeKey = "sr-theme";
  const __svelteReadmeThemeButtons = document.querySelectorAll(".sr-theme-toggle");

  const __svelteReadmeApplyTheme = (theme) => {
    document.documentElement.setAttribute("data-sr-theme", theme);
    for (const button of __svelteReadmeThemeButtons) {
      button.setAttribute("aria-pressed", String(theme === "dark"));
    }
  };

  __svelteReadmeApplyTheme(
    document.documentElement.getAttribute("data-sr-theme") || "light",
  );

  for (const button of __svelteReadmeThemeButtons) {
    button.addEventListener("click", () => {
      const __svelteReadmeNextTheme =
        document.documentElement.getAttribute("data-sr-theme") === "dark"
          ? "light"
          : "dark";
      try {
        localStorage.setItem(__svelteReadmeThemeKey, __svelteReadmeNextTheme);
      } catch (_e) {}
      __svelteReadmeApplyTheme(__svelteReadmeNextTheme);
    });
  }
});`;

// Toggles `data-sr-code-lang` on `<html>` between "ts" and "js", persisting the choice to
// `localStorage` under the same key the synchronous head script (`CODE_LANG_INIT_SCRIPT`
// in `svelteReadme.ts`) reads on the next load. One content-switch pair of TS/JS option
// buttons is rendered per TS-authored `svelte` fence (see `LANG_TOGGLE_MARKUP`), all
// sharing this single page-wide preference — same pattern as `THEME_TOGGLE_SCRIPT` above,
// but each click sets the language its own button names rather than flipping to whatever
// the current one isn't.
const CODE_LANG_TOGGLE_SCRIPT = `__svelteReadmeOnMount(() => {
  const __svelteReadmeCodeLangKey = "sr-code-lang";
  const __svelteReadmeCodeLangOptions = document.querySelectorAll(".sr-code-lang-option");

  const __svelteReadmeApplyCodeLang = (lang) => {
    document.documentElement.setAttribute("data-sr-code-lang", lang);
    for (const option of __svelteReadmeCodeLangOptions) {
      option.setAttribute(
        "aria-pressed",
        String(option.dataset.srCodeLangOption === lang),
      );
    }
  };

  __svelteReadmeApplyCodeLang(
    document.documentElement.getAttribute("data-sr-code-lang") === "js" ? "js" : "ts",
  );

  for (const option of __svelteReadmeCodeLangOptions) {
    option.addEventListener("click", () => {
      const __svelteReadmeNextCodeLang = option.dataset.srCodeLangOption;
      try {
        localStorage.setItem(__svelteReadmeCodeLangKey, __svelteReadmeNextCodeLang);
      } catch (_e) {}
      __svelteReadmeApplyCodeLang(__svelteReadmeNextCodeLang);
    });
  }
});`;

// Rendered as the first child of each `.sr-toc` nav (see `tocSidebar`/`tocInline` below),
// so it sits directly above the TOC content in both the sticky sidebar (desktop) and
// inline (mobile) variants. Sun/moon icons are drawn with basic shapes rather than path
// data so there's no risk of a mis-transcribed curve; the moon's crescent is carved out
// by painting a second circle in `--sr-color-canvas` (the toggle's own background) over
// the first, offset just enough to leave a sliver showing.
const THEME_TOGGLE_MARKUP = `<button type="button" class="sr-theme-toggle" aria-label="Toggle dark mode" title="Toggle dark mode" aria-pressed="false"><svg class="sr-theme-icon-sun" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><circle cx="8" cy="8" r="3.25" fill="currentColor" stroke="none"></circle><line x1="8" y1="0.5" x2="8" y2="2.25"></line><line x1="8" y1="13.75" x2="8" y2="15.5"></line><line x1="0.5" y1="8" x2="2.25" y2="8"></line><line x1="13.75" y1="8" x2="15.5" y2="8"></line><line x1="2.34" y1="2.34" x2="3.58" y2="3.58"></line><line x1="12.42" y1="12.42" x2="13.66" y2="13.66"></line><line x1="2.34" y1="13.66" x2="3.58" y2="12.42"></line><line x1="12.42" y1="3.58" x2="13.66" y2="2.34"></line></svg><svg class="sr-theme-icon-moon" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="6" fill="currentColor"></circle><circle cx="11" cy="6" r="5" fill="var(--sr-color-canvas)"></circle></svg></button>`;

// Rendered as the last child of the `<pre>` it copies (see the two `highlight()` return
// templates below) so it visually overlays that `<pre>`'s corner via `position: absolute`
// without needing a wrapper element — which would break markdown-it's fence renderer (it
// only skips its own `<pre><code>` wrapping when `highlight()`'s return starts with `<pre`).
const COPY_BUTTON_MARKUP = `<button type="button" class="sr-copy-button" aria-label="Copy code" title="Copy code"><svg class="sr-copy-icon" aria-hidden="true" viewBox="0 0 16 16" width="12" height="12"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg><svg class="sr-copy-check" aria-hidden="true" viewBox="0 0 16 16" width="12" height="12"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg></button>`;

// Rendered only for a `svelte` fence authored with `<script lang="ts">` that was
// successfully type-stripped (see `hasCodeLangToggle` in `preprocessReadme`), as a
// sibling of `COPY_BUTTON_MARKUP` inside the same `<pre>`. A content switch rather than a
// single toggle button: both "TS" and "JS" are always visible, and a sliding highlight
// (`.sr-code-lang-thumb`) animates behind whichever one `data-sr-code-lang` on `<html>`
// currently names — see `.sr-code-lang-toggle`/`-thumb`/`-option` in `style.css`.
const LANG_TOGGLE_MARKUP = `<div class="sr-code-lang-toggle" role="group" aria-label="Toggle TypeScript/JavaScript"><span class="sr-code-lang-thumb" aria-hidden="true"></span><button type="button" class="sr-code-lang-option sr-code-lang-option-ts" data-sr-code-lang-option="ts" aria-pressed="true">TS</button><button type="button" class="sr-code-lang-option sr-code-lang-option-js" data-sr-code-lang-option="js" aria-pressed="false">JS</button></div>`;

// Copies the enclosing `<pre>`'s source to the clipboard when its copy button is
// clicked, swapping the button's icon to a checkmark for 2s of feedback. The timeout
// is tracked per-button (rather than toggled) so repeated clicks within that window
// reset the timer instead of flickering the icon back to "copy" and re-triggering
// the swap.
const COPY_BUTTON_SCRIPT = `__svelteReadmeOnMount(() => {
  const __svelteReadmeCopyTimeouts = new WeakMap();

  for (const __svelteReadmeCopyButton of document.querySelectorAll(
    ".sr-copy-button",
  )) {
    __svelteReadmeCopyButton.addEventListener("click", () => {
      const __svelteReadmeCodePre = __svelteReadmeCopyButton.closest("pre");

      if (!__svelteReadmeCodePre) return;

      // A dual TS/JS fence renders both highlighted variants at once (see
      // \`LANG_TOGGLE_MARKUP\`'s markup in the \`highlight()\` return below) and hides
      // one via CSS, so \`<pre>\`'s own \`textContent\` would concatenate both — copy
      // whichever variant \`data-sr-code-lang\` currently shows instead. Fences with
      // only one variant have no \`.sr-code-variant-*\` children, so this falls back
      // to the whole \`<pre>\`'s text exactly as before.
      const __svelteReadmeActiveVariant = __svelteReadmeCodePre.querySelector(
        document.documentElement.getAttribute("data-sr-code-lang") === "js"
          ? ".sr-code-variant-js"
          : ".sr-code-variant-ts",
      );

      navigator.clipboard
        .writeText(
          (__svelteReadmeActiveVariant ?? __svelteReadmeCodePre).textContent ?? "",
        )
        .then(() => {
          __svelteReadmeCopyButton.classList.add("sr-copy-copied");

          const __svelteReadmeExistingTimeout =
            __svelteReadmeCopyTimeouts.get(__svelteReadmeCopyButton);
          if (__svelteReadmeExistingTimeout !== undefined) {
            clearTimeout(__svelteReadmeExistingTimeout);
          }

          __svelteReadmeCopyTimeouts.set(
            __svelteReadmeCopyButton,
            setTimeout(() => {
              __svelteReadmeCopyButton.classList.remove("sr-copy-copied");
              __svelteReadmeCopyTimeouts.delete(__svelteReadmeCopyButton);
            }, 2000),
          );
        });
    });
  }
});`;

// Toggles `data-sr-overflow-left`/`-right` on each table's `sr-table-wrapper` (see the
// wrapping pass above) to reveal a `pointer-events: none` fade gradient over whichever
// edge still has more to scroll toward — both attributes clear on their own once a
// table doesn't overflow at all, since neither `scrollLeft > 0` nor the right-edge
// check below can be true for a table too narrow to scroll.
const TABLE_SCROLL_SHADOW_SCRIPT = `__svelteReadmeOnMount(() => {
  const __svelteReadmeTables = Array.from(
    document.querySelectorAll(".sr-table-wrapper > table"),
  );

  const __svelteReadmeUpdateTable = (__svelteReadmeTable) => {
    const __svelteReadmeWrapper = __svelteReadmeTable.parentElement;
    if (!__svelteReadmeWrapper) return;

    __svelteReadmeWrapper.toggleAttribute(
      "data-sr-overflow-left",
      __svelteReadmeTable.scrollLeft > 0,
    );
    __svelteReadmeWrapper.toggleAttribute(
      "data-sr-overflow-right",
      __svelteReadmeTable.scrollLeft + __svelteReadmeTable.clientWidth <
        __svelteReadmeTable.scrollWidth,
    );
  };

  const __svelteReadmeUpdateAllTables = () => {
    for (const table of __svelteReadmeTables) __svelteReadmeUpdateTable(table);
  };

  for (const table of __svelteReadmeTables) {
    table.addEventListener("scroll", () => __svelteReadmeUpdateTable(table), {
      passive: true,
    });
  }

  // Resizing (or rotating) can cross the mobile breakpoint, where the table's
  // available width changes and a table that fit before may now overflow (or
  // vice versa) — re-check all of them rather than just the one that was scrolled.
  window.addEventListener("resize", __svelteReadmeUpdateAllTables);
  __svelteReadmeUpdateAllTables();
});`;

export function preprocessReadme(
  opts: Pick<PreprocessReadmeOptions, "name" | "svelte"> &
    Partial<PreprocessReadmeOptions>,
): Pick<PreprocessorGroup, "markup"> {
  const prefixUrl = opts.prefixUrl || `${opts.homepage}/tree/master/`;

  let script_content: string[] = [];
  let pending_format: { placeholder: string; source: string }[] = [];
  let hasCodeBlock = false;
  let hasCodeLangToggle = false;
  let hasTable = false;
  const declared_variables = new Map<string, string>();
  const reserved_names = new Set<string>();
  const name_regex = new RegExp(escapeRegExp(opts.name), "g");
  const quoted_name_regex = new RegExp(`"${escapeRegExp(opts.name)}"`, "g");

  const md = new Markdown({
    html: true,
    highlight(source, lang, attrs) {
      hasCodeBlock = true;

      if (lang === "svelte") {
        const noEval = NO_EVAL_ATTR.test(attrs);
        const noDisplay = NO_DISPLAY_ATTR.test(attrs);
        const parsedSource = parse(source);

        // A `<script lang="ts">` fence displays as authored, but the shared `<script>`
        // every fence's code is merged into below has no TS support of its own — so if
        // stripping this fence down to plain JS succeeds (and the result still parses
        // cleanly), that stripped source drives the eval/live-demo path instead of the
        // original, and both variants are shown via `LANG_TOGGLE_MARKUP`'s reader
        // toggle. A non-erasable TS construct (e.g. `enum`) makes the stripped result
        // fail to parse, which silently falls back to today's single-(TS-as-authored)-
        // variant behavior for just that fence.
        let evalSource = source;
        let jsDisplaySource: string | undefined;

        if (
          parsedSource.instance !== undefined &&
          hasTypeScriptLang(source, parsedSource.instance)
        ) {
          try {
            const stripped = stripTypeScript(source, parsedSource.instance);
            parse(stripped);
            evalSource = stripped;
            jsDisplaySource = stripped;
          } catch (_e) {
            // fall through: `evalSource` stays `source`, no JS variant is offered
          }
        }

        const { instance, html } =
          evalSource === source ? parsedSource : parse(evalSource);

        // Different code fences share a single merged `<script>` once rendered, so a variable
        // declared identically in two fences (e.g. `let count = 0;`) is fine, but a name reused
        // for something different would collide. Detect that and rename the later occurrence
        // (in both its script and markup) before it's merged in.
        let renamedSource = evalSource;

        if (instance !== undefined && !noEval) {
          const declarations = collectTopLevelDeclarations(instance.content);
          const renameMap = computeRenameMap(
            declarations,
            evalSource,
            declared_variables,
            reserved_names,
          );

          if (renameMap.size > 0) {
            const ranges = [
              ...collectIdentifierRanges(instance.content, renameMap),
              ...collectIdentifierRanges(html, renameMap),
            ];
            renamedSource = applyRenames(evalSource, ranges, renameMap);
          }
        }

        const renamedInstance =
          renamedSource === evalSource
            ? instance
            : parse(renamedSource).instance;

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
        if (jsDisplaySource !== undefined) {
          hasCodeLangToggle = true;

          const tsPlaceholder = `__SVELTE_README_FORMAT_${pending_format.length}__`;
          pending_format.push({ placeholder: tsPlaceholder, source });

          const jsPlaceholder = `__SVELTE_README_FORMAT_${pending_format.length}__`;
          pending_format.push({
            placeholder: jsPlaceholder,
            source: jsDisplaySource,
          });

          // Both variants are always rendered (one hidden via CSS keyed off
          // `data-sr-code-lang`, see `.sr-code-variant-ts`/`-js` in `style.css`) rather
          // than swapped client-side, so the right one is already present for SSR/no-JS.
          return `<pre class="language-${lang}" ${
            noEval || noDisplay ? "" : `data-svelte="${modifiedSource}"`
          }><span class="sr-code-variant-ts">{@html \`${tsPlaceholder}\`}</span><span class="sr-code-variant-js">{@html \`${jsPlaceholder}\`}</span>${LANG_TOGGLE_MARKUP}${COPY_BUTTON_MARKUP}</pre>`;
        }

        const placeholder = `__SVELTE_README_FORMAT_${pending_format.length}__`;
        pending_format.push({ placeholder, source });

        // The copy button is a child of `<pre>` itself (not a wrapper around it) for two
        // reasons: markdown-it's fence renderer only skips its own `<pre><code>` wrapping
        // when `highlight()`'s return starts with a literal `<pre`, and the `data-svelte`
        // attribute needs to stay directly on `<pre>` for the walker below (which locates
        // its containing element to splice the live demo in as a preceding sibling).
        return `<pre class="language-${lang}" ${
          noEval || noDisplay ? "" : `data-svelte="${modifiedSource}"`
        }>{@html \`${placeholder}\`}${COPY_BUTTON_MARKUP}</pre>`;
      }

      try {
        const alias_lang = aliases[lang] || lang;
        const highlighted = escapeForTemplateLiteral(
          highlightCode(source, alias_lang),
        );
        return `<pre class="language-${alias_lang}">{@html \`${highlighted}\`}${COPY_BUTTON_MARKUP}</pre>`;
      } catch (_e) {
        console.error(`Could not highlight language "${lang}".`);
        return `<pre class="language-${lang}">{@html \`${escapeForTemplateLiteral(source)}\`}${COPY_BUTTON_MARKUP}</pre>`;
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
    hasCodeBlock = false;
    hasCodeLangToggle = false;
    hasTable = false;

    content = content.replace(HIDE_BLOCK, "");

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

    // Wraps each highlighted `<pre>` in a non-scrolling `<div class="sr-code-block">`
    // so the copy button (already rendered as `<pre>`'s last child, to satisfy
    // markdown-it's fence renderer — see `COPY_BUTTON_MARKUP`) can anchor its
    // `position: absolute` to that wrapper instead of to `<pre>` itself. `<pre>` has
    // its own `overflow: auto` for long lines, and an absolutely positioned
    // descendant anchored via `right` drifts with that internal horizontal scroll —
    // anchoring to a non-scrolling ancestor instead keeps the button pinned to the
    // visible corner. Run as a second pass (fresh parse, its own cursor) rather than
    // folded into the walk above: that walk's `cursor` model assumes each edit nets
    // out to a single insertion point, but wrapping a node needs an insertion both
    // before its start and after its end, which would throw off the position math
    // for anything nested inside it (e.g. the `data-svelte` attribute handled above).
    if (hasCodeBlock) {
      const codeBlockAst = parse(result) as unknown as Node;
      let codeBlockCursor = 0;

      walk(
        // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
        codeBlockAst as any,
        {
          // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
          enter(node: any) {
            if (node.type !== "Element" || node.name !== "pre") return;

            const classAttr = node.attributes.find(
              // biome-ignore lint/suspicious/noExplicitAny: see above
              (attr: any) => attr.name === "class",
            );
            if (!classAttr?.value?.[0]?.raw?.startsWith("language-")) return;

            const preSource = result.slice(
              node.start + codeBlockCursor,
              node.end + codeBlockCursor,
            );
            const wrapped = `<div class="sr-code-block">${preSource}</div>`;
            result = result.replace(preSource, wrapped);
            codeBlockCursor += wrapped.length - preSource.length;
          },
        },
      );
    }

    // Wraps each `<table>` in a non-scrolling `<div class="sr-table-wrapper">` so the
    // scroll-shadow gradients (`TABLE_SCROLL_SHADOW_SCRIPT` below) can be positioned
    // against a stationary ancestor — `<table>` itself scrolls horizontally, so an
    // overlay anchored to it would drift with that scroll instead of staying pinned
    // to the visible edges (same reasoning as the copy button's `sr-code-block`
    // wrapper above, and again run as its own pass for the same insertion-math
    // reason: wrapping needs an edit both before and after the node).
    hasTable = HAS_TABLE_TAG.test(result);

    if (hasTable) {
      const tableAst = parse(result) as unknown as Node;
      let tableCursor = 0;

      walk(
        // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
        tableAst as any,
        {
          // biome-ignore lint/suspicious/noExplicitAny: estree-walker's real types don't match Svelte's AST (see `Node` above)
          enter(node: any) {
            if (node.type !== "Element" || node.name !== "table") return;

            const tableSource = result.slice(
              node.start + tableCursor,
              node.end + tableCursor,
            );
            const wrapped = `<div class="sr-table-wrapper">${tableSource}</div>`;
            result = result.replace(tableSource, wrapped);
            tableCursor += wrapped.length - tableSource.length;
          },
        },
      );
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
      ? `<nav class="sr-toc sr-toc-sidebar">${THEME_TOGGLE_MARKUP}${tocContent}</nav>`
      : "";

    if (tocContent) {
      const tocInline = `<nav class="sr-toc sr-toc-inline">${THEME_TOGGLE_MARKUP}${tocContent}</nav>`;
      result = result.includes("<!-- TOC -->")
        ? result.replaceAll("<!-- TOC -->", tocInline)
        : `${result}${tocInline}`;
    }

    return {
      code: `<script>${[...new Set(script_content)].join("\n")}
               ${headings.length || hasCodeBlock || hasTable ? SVELTE_README_ON_MOUNT_IMPORT : ""}
               ${headings.length ? TOC_SCROLL_SPY_SCRIPT : ""}
               ${headings.length ? THEME_TOGGLE_SCRIPT : ""}
               ${hasCodeBlock ? COPY_BUTTON_SCRIPT : ""}
               ${hasCodeLangToggle ? CODE_LANG_TOGGLE_SCRIPT : ""}
               ${hasTable ? TABLE_SCROLL_SHADOW_SCRIPT : ""}</script>
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
