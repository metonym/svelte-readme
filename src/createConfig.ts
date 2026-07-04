import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { svelte, type Options as VitePluginSvelteOptions } from "@sveltejs/vite-plugin-svelte";
import htmlminifier from "html-minifier";
import type { PreprocessorGroup } from "svelte/compiler";
import { type ConfigEnv, type Plugin, type UserConfig, build as viteBuild } from "vite";
import { preprocessReadme } from "./preprocessReadme.js";
import { css as github_styles } from "./style.js";

const require = createRequire(import.meta.url);

function getSvelteMajorVersion(): number {
  const svelte_pkg = require("svelte/package.json");
  return Number.parseInt(svelte_pkg.version.split(".")[0], 10);
}

function getPackageJSON() {
  try {
    const path_pkg = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(path_pkg, "utf-8"));

    if (!pkg.name) throw Error(`Package name is required as "name".`);
    if (!pkg.svelte) throw Error(`Svelte code entry is required as "svelte".`);

    return {
      name: pkg.name,
      svelte: pkg.svelte,
      description: pkg.description,
      homepage: pkg.homepage,
      repoUrl: pkg.repository?.url,
    };
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

const custom_css = `
  .language-yaml { color: #0550ae; }
  .language-typescript { color: #0550ae; }
  .language-typescript .string { color: #0a3069; }
  .language-typescript .number { color: #005cc5; }
  .language-typescript .class-name { color: #24292f; }
  .token.keyword { color: #d73a49; }

  .token.language-javascript { color: #24292e; }
  .token.language-javascript .function { color: #005cc5; }
  .token.language-javascript .string { color: #032f62; }
  .token.language-javascript .number { color: #005cc5; }
  .token.language-javascript .keyword { color: #d73a49; }
  .token.each { color: #d73a49; }
  .token.punctuation { color: #24292e }
  .token.tag { color: #22863a; }
  .token.attr-name { color: #6f42c1; }
  .token.attr-value { color: #032f62; }
  .token.operator { color: #d73a49; }
  .token.comment { color: #6a737d; }
  .token.function { color: #6f42c1; }
  .token.string { color: #032f62; }

  .token.each .language-javascript:last-child { color: #e36209; }

  .language-css { color: #032f62; }
  .language-css .selector { color: #22863a; }
  .language-css .property { color: #005cc5; }

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

interface CreateConfigOptions {
  /**
   * set to `true` to minify the HTML/JS
   * @default false in dev, true in build
   */
  minify: boolean;

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
   * `@sveltejs/vite-plugin-svelte` options
   * @default {}
   */
  svelte: VitePluginSvelteOptions;

  /**
   * Vite plugins
   * @default {[]}
   */
  plugins: Plugin[];

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
    if (id === VIRTUAL_HYDRATE_ENTRY_ID) return RESOLVED_VIRTUAL_HYDRATE_ENTRY_ID;
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

function logSSRFallback(error: unknown) {
  console.warn(
    "[svelte-readme] Failed to server-render README.md — falling back to client-only rendering.\n" +
      "If this happens outside a simple `document`/`window` property access, guard the browser-only " +
      'code (e.g. `if (typeof document !== "undefined")`) or move it into `onMount`.',
  );
  console.warn(error);
}

export default function createConfig(opts: Partial<CreateConfigOptions> = {}): (env: ConfigEnv) => UserConfig {
  return (env) => {
    const DEV = env.command === "serve" && !env.isPreview;
    const minify = opts.minify === true || !DEV;
    const pkg = getPackageJSON();
    const output_dir = opts.outDir || "dist";
    const svelteOptions: Partial<VitePluginSvelteOptions> = {
      emitCss: opts.svelte?.emitCss ?? false,
      compilerOptions: {
        ...(getSvelteMajorVersion() >= 5 ? { hmr: false } : {}),
        ...opts.svelte?.compilerOptions,
      },
      extensions: [".svelte", ".md", ...(opts.svelte?.extensions ?? [])],
      preprocess: [
        ...((opts.svelte?.preprocess as PreprocessorGroup[]) ?? []),
        preprocessReadme({ ...pkg, prefixUrl: opts.prefixUrl }),
      ],
    };

    console.log(`[createConfig] Running in ${DEV ? "development" : "production"}`);
    console.log("[createConfig] options:");
    console.group();
    console.log("minify:", minify);
    console.log("outDir:", output_dir);
    console.log("svelte:", svelteOptions);
    console.groupEnd();

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

    function renderTemplate(scriptSrc: string, ssr?: { head: string; body: string }) {
      const template = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta name="description" content="${pkg.description || `${pkg.name} demo`}" />
          <title>${pkg.name}</title>
          <style>
            ${!opts.disableDefaultCSS ? css : ""}
            ${custom_css}
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

      return minify
        ? htmlminifier.minify(template, {
            collapseWhitespace: true,
            conservativeCollapse: true,
            minifyCSS: true,
            removeEmptyAttributes: true,
          })
        : template;
    }

    async function renderSSR(): Promise<{ head: string; body: string }> {
      const ssrOutDir = path.join(process.cwd(), output_dir, ".svelte-readme-ssr");

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
        plugins: [...svelte(svelteOptions as VitePluginSvelteOptions), virtualEntriesPlugin],
      });

      const entryPath = path.join(ssrOutDir, "entry-server.js");
      const mod = await import(pathToFileURL(entryPath).href);

      await fsPromises.rm(ssrOutDir, { recursive: true, force: true });

      return mod.renderApp();
    }

    const htmlPlugin: Plugin = {
      name: "svelte-readme-html",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== "GET" || !req.headers.accept?.includes("text/html")) return next();

          let ssr: { head: string; body: string } | undefined;

          try {
            const { renderApp } = await server.ssrLoadModule(VIRTUAL_SSR_ENTRY_ID);
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
          if (req.method !== "GET" || !req.headers.accept?.includes("text/html")) return next();

          try {
            const html = await fsPromises.readFile(path.join(output_dir, "index.html"), "utf-8");
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          } catch {
            next();
          }
        });
      },
      async writeBundle(_, bundle) {
        const entryChunk = Object.values(bundle).find(
          (chunk): chunk is typeof chunk & { fileName: string } => "isEntry" in chunk && chunk.isEntry,
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

    return {
      appType: "custom",
      build: {
        outDir: output_dir,
        minify,
        rollupOptions: {
          input: VIRTUAL_HYDRATE_ENTRY_ID,
          output: { entryFileNames: "s-[hash].js" },
        },
      },
      plugins: [
        ...svelte(svelteOptions as VitePluginSvelteOptions),
        virtualEntriesPlugin,
        htmlPlugin,
        ...(opts.plugins || []),
      ].filter(Boolean) as Plugin[],
    };
  };
}
