import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
import { purgeUnusedCss } from "./purgeCss.js";
import {
  collapseWhitespace,
  getPackageJSON,
  logSSRFallback,
  toArray,
} from "./utils.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const github_styles: string = fs.readFileSync(
  path.join(dirname, "style.css"),
  "utf-8",
);

// Each grammar's own token colors are colocated with its highlighter under `./highlight`
// (see `baseTokenStyles`'s doc comment in `./highlight/shared.js` for why); this only
// composes them plus the page-layout CSS that isn't specific to any grammar.
const custom_css = `
  ${baseTokenStyles}
  ${typescriptStyles}
  ${svelteStyles}
  ${jsonStyles}
  ${yamlStyles}
  ${bashStyles}

  .code-fence { padding: 24px 15px; border: 1px solid #eaecef; border-bottom: 0; }

  main {
    box-sizing: border-box;
    max-width: 980px;
    margin: 0 auto;
    padding: 45px;
  }

  @media (max-width: 767px) {
    main { padding: 15px; }
  }


`;

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

  let DEV = false;
  let css = github_styles;

  if (!opts.disableDefaultCSS) {
    css += `/**
      * GitHub Primer button CSS
      * https://primer.style/css/components/buttons
      **/
    .code-fence button {
      font-family: inherit;
      text-transform: none;
      position: relative;
      display: inline-block;
      padding: 5px 16px;
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
      white-space: nowrap;
      vertical-align: middle;
      cursor: pointer;
      user-select: none;
      border: 1px solid;
      border-radius: 6px;
      appearance: none;
      color: #24292e;
      background-color: #fafbfc;
      border-color: rgba(27,31,35,0.15);
      box-shadow: 0 1px 0 rgba(27,31,35,0.04), inset 0 1px 0 rgba(255,255,255,0.25);
      transition: background-color 0.2s cubic-bezier(0.3, 0, 0.5, 1);
    }`;
  }

  function renderTemplate(
    scriptSrc: string,
    ssr?: { head: string; body: string },
  ) {
    // Rules that can't match anything in the rendered README are dropped, so the served
    // stylesheet only carries what this particular README actually uses. Only runs when SSR
    // succeeded (real markup to check against); on SSR failure the unpurged CSS ships as-is,
    // same fallback-to-safe behavior as the rest of this file's SSR handling. `opts.style` is
    // left untouched — it's consumer-authored and may target markup that only exists after
    // hydration (e.g. state toggled in `onMount`), which purging can't see.
    const html = ssr ? `${ssr.head}${ssr.body}` : undefined;
    const purge = (input: string) =>
      html ? purgeUnusedCss(input, html) : input;

    const template = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta name="description" content="${pkg.description || `${pkg.name} demo`}" />
          <title>${pkg.name}</title>
          <style>
            ${!opts.disableDefaultCSS ? purge(css) : ""}
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
    config(_, env) {
      DEV = env.command === "serve" && !env.isPreview;

      console.log(
        `[svelteReadme] Running in ${DEV ? "development" : "production"}`,
      );
      console.log("[svelteReadme] options:");
      console.group();
      console.log("outDir:", output_dir);
      console.log("svelte:", svelteOptions);
      console.groupEnd();

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
