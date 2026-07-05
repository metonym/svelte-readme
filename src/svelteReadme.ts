import fsPromises from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  svelte,
  type Options as VitePluginSvelteOptions,
} from "@sveltejs/vite-plugin-svelte";
import { type Plugin, build as viteBuild } from "vite";
import { styles as bashStyles } from "./highlight/bash.js";
import { styles as jsonStyles } from "./highlight/json.js";
import { baseTokenStyles } from "./highlight/shared.js";
import { styles as svelteStyles } from "./highlight/svelte.js";
import { styles as typescriptStyles } from "./highlight/typescript.js";
import { styles as yamlStyles } from "./highlight/yaml.js";
import { preprocessReadme } from "./preprocessReadme.js";
import { defaultStyles, layoutStyles } from "./styles/index.js";
import { purgeUnusedCss } from "./utils/purgeCss.js";
import {
  collapseWhitespace,
  getPackageJSON,
  logSSRFallback,
  toArray,
} from "./utils/utils.js";

// Each grammar's own token colors are colocated with its highlighter under `./highlight`
// (see `baseTokenStyles`'s doc comment in `./highlight/shared.js` for why); this only
// composes them plus the page-layout CSS that isn't specific to any grammar.
const custom_css = [
  baseTokenStyles,
  typescriptStyles,
  svelteStyles,
  jsonStyles,
  yamlStyles,
  bashStyles,
  layoutStyles,
].join("\n");

interface SvelteReadmeOptions {
  /**
   * set the folder to emit the files
   * @default "dist"
   */
  outDir: string;

  /**
   * custom CSS appended to the <style> block
   * @default ""
   */
  style: string;

  /**
   * set to `true` to omit the default GitHub styles
   * @default false
   */
  disableDefaultCSS: boolean;

  /**
   * value to prepend to relative URLs (i.e. GitHub repo URL)
   * @default undefined
   */
  prefixUrl: string;

  /**
   * Called with the source of each `svelte` code fence before it's highlighted for display,
   * so it can be pretty-printed with your own formatter (e.g. Prettier). The code fence is
   * displayed unformatted if this is omitted or its result rejects/throws.
   * @default undefined
   */
  format: (source: string) => string | Promise<string>;

  /**
   * `@sveltejs/vite-plugin-svelte` options
   * @default {}
   */
  svelte: VitePluginSvelteOptions;

  /**
   * Append content to the `head` element in `index.html`
   */
  head: string;

  /**
   * Favicon to use: either inline `<svg>` markup, or an href (absolute/relative path,
   * `http(s)://` URL, or `data:` URI) pointing at an existing icon file
   * @default the svelte-readme logo
   */
  favicon: string;
}

const DEFAULT_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 99 118" fill="none"><g clip-path="url(#a)"><path fill="#393939" d="M91.8 15.6C80.9-.1 59.2-4.7 43.6 5.2L16.1 22.8C8.6 27.5 3.4 35.2 1.9 43.9c-1.3 7.3-.2 14.8 3.3 21.3-2.4 3.6-4 7.6-4.7 11.8-1.6 8.9.5 18.1 5.7 25.4 11 15.7 32.6 20.3 48.2 10.4l27.5-17.5c7.5-4.7 12.7-12.4 14.2-21.1 1.3-7.3.2-14.8-3.3-21.3 2.4-3.6 4-7.6 4.7-11.8 1.7-9-.4-18.2-5.7-25.5Z"/><path fill="#fff" d="M40.9 103.9c-8.9 2.3-18.2-1.2-23.4-8.7-3.2-4.4-4.4-9.9-3.5-15.3.2-.9.4-1.7.6-2.6l.5-1.6 1.4 1c3.3 2.4 6.9 4.2 10.8 5.4l1 .3-.1 1c-.1 1.4.3 2.9 1.1 4.1 1.6 2.3 4.4 3.4 7.1 2.7.6-.2 1.2-.4 1.7-.7L65.5 72c1.4-.9 2.3-2.2 2.6-3.8.3-1.6-.1-3.3-1-4.6-1.6-2.3-4.4-3.3-7.1-2.6-.6.2-1.2.4-1.7.7l-10.5 6.7c-1.7 1.1-3.6 1.9-5.6 2.4-8.9 2.3-18.2-1.2-23.4-8.7-3.1-4.4-4.4-9.9-3.4-15.3.9-5.2 4.1-9.9 8.6-12.7l27.5-17.5c1.7-1.1 3.6-1.9 5.6-2.5 8.9-2.3 18.2 1.2 23.4 8.7 3.2 4.4 4.4 9.9 3.5 15.3-.2.9-.4 1.7-.7 2.6l-.5 1.6-1.4-1c-3.3-2.4-6.9-4.2-10.8-5.4l-1-.3.1-1c.1-1.4-.3-2.9-1.1-4.1-1.6-2.3-4.4-3.3-7.1-2.6-.6.2-1.2.4-1.7.7L32.4 46.1c-1.4.9-2.3 2.2-2.6 3.8-.3 1.6.1 3.3 1 4.6 1.6 2.3 4.4 3.3 7.1 2.6.6-.2 1.2-.4 1.7-.7l10.5-6.7c1.7-1.1 3.6-1.9 5.6-2.5 8.9-2.3 18.2 1.2 23.4 8.7 3.2 4.4 4.4 9.9 3.5 15.3-.9 5.2-4.1 9.9-8.6 12.7l-27.5 17.5c-1.7 1.1-3.6 1.9-5.6 2.5Z"/></g><defs><clipPath id="a"><path fill="#fff" d="M0 0h98.1v118H0z"/></clipPath></defs></svg>`;

function faviconHref(favicon: string): string {
  return favicon.trim().startsWith("<svg")
    ? `data:image/svg+xml,${encodeURIComponent(favicon)}`
    : favicon;
}

const VIRTUAL_HYDRATE_ENTRY_ID = "virtual:svelte-readme-hydrate-entry";
const RESOLVED_VIRTUAL_HYDRATE_ENTRY_ID = `\0${VIRTUAL_HYDRATE_ENTRY_ID}`;
const VIRTUAL_SSR_ENTRY_ID = "virtual:svelte-readme-ssr-entry";
const RESOLVED_VIRTUAL_SSR_ENTRY_ID = `\0${VIRTUAL_SSR_ENTRY_ID}`;

// Demo scripts often touch `document`/`window` directly (e.g. `document.body.className = ...`)
// without guarding for SSR. Stub these globals during the SSR-only render pass so plain
// property reads/writes no-op instead of throwing; the real values apply once hydrated in
// the browser. Anything that isn't a simple property access (a thrown error from a real
// browser-only API) still surfaces via the try/catch around render() and falls back to CSR.
const SSR_GLOBAL_STUBS = `function __svelteReadmeStub() {
  const handler = {
    get(target, prop) {
      if (prop === "then" || typeof prop === "symbol") return undefined;
      if (!(prop in target)) target[prop] = __svelteReadmeStub();
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  };
  return new Proxy(function () {}, handler);
}
if (typeof globalThis.document === "undefined") globalThis.document = __svelteReadmeStub();
if (typeof globalThis.window === "undefined") globalThis.window = __svelteReadmeStub();
if (typeof globalThis.localStorage === "undefined") globalThis.localStorage = __svelteReadmeStub();
if (typeof globalThis.navigator === "undefined") globalThis.navigator = __svelteReadmeStub();`;

// Runs synchronously, before the `<style>` block below is parsed, so `data-sr-theme` is
// already set on `<html>` by the time anything paints — deferring this to the hydrated
// Svelte component (like the rest of the theme toggle's wiring in `preprocessReadme.ts`)
// would flash the light theme first. Reads an explicit choice from `localStorage` if the
// toggle button has ever been used; otherwise follows the OS-level preference live, so a
// system theme change is reflected immediately without a reload.
const THEME_INIT_SCRIPT = `<script>(function () {
        try {
          var storageKey = "sr-theme";
          var stored = localStorage.getItem(storageKey);
          var media = window.matchMedia("(prefers-color-scheme: dark)");
          var apply = function (theme) {
            document.documentElement.setAttribute("data-sr-theme", theme);
          };
          apply(stored || (media.matches ? "dark" : "light"));
          if (!stored) {
            media.addEventListener("change", function (event) {
              apply(event.matches ? "dark" : "light");
            });
          }
        } catch (_e) {}
      })();</script>`;

// Runs synchronously alongside `THEME_INIT_SCRIPT` above, for the same reason: so
// `data-sr-code-lang` is set on `<html>` before anything paints, and a TS-authored
// `svelte` fence's TS/JS toggle (wired up in `preprocessReadme.ts`) shows the reader's
// remembered choice immediately instead of flashing the "ts" default first. Unlike the
// theme, there's no OS-level signal to fall back to — TS is simply the default until a
// reader has toggled at least once.
const CODE_LANG_INIT_SCRIPT = `<script>(function () {
        try {
          var stored = localStorage.getItem("sr-code-lang");
          document.documentElement.setAttribute(
            "data-sr-code-lang",
            stored === "js" ? "js" : "ts",
          );
        } catch (_e) {}
      })();</script>`;

const virtualEntriesPlugin: Plugin = {
  name: "svelte-readme-virtual-entries",
  resolveId(id) {
    if (id === VIRTUAL_HYDRATE_ENTRY_ID)
      return RESOLVED_VIRTUAL_HYDRATE_ENTRY_ID;
    if (id === VIRTUAL_SSR_ENTRY_ID) return RESOLVED_VIRTUAL_SSR_ENTRY_ID;
  },
  load(id) {
    if (id === RESOLVED_VIRTUAL_HYDRATE_ENTRY_ID) {
      return `import { hydrate } from "svelte";
              import App from "./README.md";
              hydrate(App, { target: document.body });`;
    }

    if (id === RESOLVED_VIRTUAL_SSR_ENTRY_ID) {
      return `${SSR_GLOBAL_STUBS}
              import { render } from "svelte/server";
              import App from "./README.md";
              export function renderApp() { return render(App); }`;
    }
  },
};

export function svelteReadme(
  opts: Partial<SvelteReadmeOptions> = {},
): Plugin[] {
  const pkg = getPackageJSON();
  const output_dir = opts.outDir || "dist";
  const svelteOptions: Partial<VitePluginSvelteOptions> = {
    emitCss: opts.svelte?.emitCss ?? false,
    compilerOptions: {
      hmr: false,
      ...opts.svelte?.compilerOptions,
    },
    extensions: [".svelte", ".md", ...(opts.svelte?.extensions ?? [])],
    preprocess: [
      ...toArray(opts.svelte?.preprocess),
      preprocessReadme({
        ...pkg,
        prefixUrl: opts.prefixUrl,
        format: opts.format,
      }),
    ],
  };

  function renderTemplate(
    scriptSrc: string,
    ssr?: { head: string; body: string },
  ) {
    // Rules that can't match anything in the rendered README are dropped, so the served
    // stylesheet only carries what this particular README actually uses. Only runs when SSR
    // succeeded (real markup to check against); on SSR failure the unpurged CSS ships as-is,
    // same fallback-to-safe behavior as the rest of this file's SSR handling. `opts.style` is
    // left untouched — it's consumer-authored and may target markup that only exists after
    // hydration (e.g. state toggled in `onMount`), which purging can't see. `sr-toc-active`,
    // `sr-copy-copied`, and `sr-mobile-header-title-visible` are our own such classes (toggled
    // by the TOC scroll-spy, copy-button, and mobile-header-title scripts, respectively), `open`
    // is the attribute a native `<details>` only gains once a user expands it, `data-sr-theme`,
    // `data-sr-code-lang`, and `data-sr-toc-open` are set on `<html>` itself — outside the
    // `ssr.body`/`ssr.head` this purge checks against — by `THEME_INIT_SCRIPT`/
    // `CODE_LANG_INIT_SCRIPT` below and `TOC_DRAWER_SCRIPT` in `preprocessReadme.ts`, and
    // `data-sr-overflow-left`/`-right` are toggled on each `.sr-table-wrapper` by
    // `TABLE_SCROLL_SHADOW_SCRIPT` as its table is scrolled, so all nine are explicitly
    // allowlisted rather than silently stripped.
    const html = ssr ? `${ssr.head}${ssr.body}` : undefined;
    const purge = (input: string) =>
      html
        ? purgeUnusedCss(input, html, [
            "sr-toc-active",
            "sr-copy-copied",
            "sr-mobile-header-title-visible",
            "open",
            "data-sr-theme",
            "data-sr-code-lang",
            "data-sr-toc-open",
            "data-sr-overflow-left",
            "data-sr-overflow-right",
          ])
        : input;

    const template = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          ${THEME_INIT_SCRIPT}
          ${CODE_LANG_INIT_SCRIPT}
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta name="description" content="${pkg.description || `${pkg.name} demo`}" />
          <title>${pkg.name}</title>
          <link rel="icon" href="${faviconHref(opts.favicon || DEFAULT_FAVICON)}" />
          <style>
            ${!opts.disableDefaultCSS ? purge(defaultStyles) : ""}
            ${purge(custom_css)}
            ${opts.style || ""}
          </style>
          ${opts?.head ?? ""}
          ${ssr?.head ?? ""}
        </head>
        <body>
          <noscript>You need to enable JavaScript to run this app.</noscript>
          ${ssr?.body ?? ""}
          <script type="module" src="${scriptSrc}"></script>
        </body>
      </html>
    `;

    return collapseWhitespace(template);
  }

  async function renderSSR(): Promise<{ head: string; body: string }> {
    const ssrOutDir = path.join(
      process.cwd(),
      output_dir,
      ".svelte-readme-ssr",
    );

    await viteBuild({
      configFile: false,
      logLevel: "warn",
      build: {
        ssr: true,
        outDir: ssrOutDir,
        emptyOutDir: true,
        rollupOptions: {
          input: VIRTUAL_SSR_ENTRY_ID,
          output: { entryFileNames: "entry-server.js" },
        },
      },
      plugins: [...svelte(svelteOptions), virtualEntriesPlugin],
    });

    const entryPath = path.join(ssrOutDir, "entry-server.js");
    const mod = await import(pathToFileURL(entryPath).href);

    await fsPromises.rm(ssrOutDir, { recursive: true, force: true });

    return mod.renderApp();
  }

  const htmlPlugin: Plugin = {
    name: "svelte-readme-html",
    config() {
      return {
        appType: "custom",
        build: {
          outDir: output_dir,
          rollupOptions: {
            input: VIRTUAL_HYDRATE_ENTRY_ID,
            output: { entryFileNames: "s-[hash].js" },
          },
        },
      };
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" || !req.headers.accept?.includes("text/html"))
          return next();

        let ssr: { head: string; body: string } | undefined;

        try {
          const { renderApp } =
            await server.ssrLoadModule(VIRTUAL_SSR_ENTRY_ID);
          ssr = renderApp();
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          logSSRFallback(error);
        }

        const html = await server.transformIndexHtml(
          req.url ?? "/",
          renderTemplate(`/@id/${VIRTUAL_HYDRATE_ENTRY_ID}`, ssr),
        );
        res.setHeader("Content-Type", "text/html");
        res.end(html);
      });
    },
    configurePreviewServer(server) {
      // `vite preview` serves the already-built output_dir as static files and
      // never runs `writeBundle`, so just hand back the index.html written there.
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" || !req.headers.accept?.includes("text/html"))
          return next();

        try {
          const html = await fsPromises.readFile(
            path.join(output_dir, "index.html"),
            "utf-8",
          );
          res.setHeader("Content-Type", "text/html");
          res.end(html);
        } catch {
          next();
        }
      });
    },
    async writeBundle(_, bundle) {
      const entryChunk = Object.values(bundle).find(
        (chunk): chunk is typeof chunk & { fileName: string } =>
          "isEntry" in chunk && chunk.isEntry,
      );

      if (!entryChunk) return;

      let ssr: { head: string; body: string } | undefined;

      try {
        ssr = await renderSSR();
      } catch (error) {
        logSSRFallback(error);
      }

      await fsPromises.mkdir(output_dir, { recursive: true });
      await fsPromises.writeFile(
        path.join(output_dir, "index.html"),
        renderTemplate(`./${entryChunk.fileName}`, ssr),
      );
    },
  };

  return [...svelte(svelteOptions), virtualEntriesPlugin, htmlPlugin];
}
