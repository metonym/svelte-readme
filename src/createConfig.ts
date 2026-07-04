import { svelte, Options as VitePluginSvelteOptions } from "@sveltejs/vite-plugin-svelte";
import { preprocessReadme } from "./preprocessReadme.js";
import fs from "fs-extra";
import path from "path";
import { createRequire } from "module";
import htmlminifier from "html-minifier";
import { css as github_styles } from "./style.js";
import { Plugin, UserConfig, ConfigEnv } from "vite";
import { PreprocessorGroup } from "svelte/compiler";

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

const VIRTUAL_ENTRY_ID = "virtual:svelte-readme-entry";
const RESOLVED_VIRTUAL_ENTRY_ID = "\0" + VIRTUAL_ENTRY_ID;

export default function createConfig(opts: Partial<CreateConfigOptions> = {}): (env: ConfigEnv) => UserConfig {
  return (env) => {
    const DEV = env.command === "serve" && !env.isPreview;
    const minify = opts.minify === true || !DEV;
    const pkg = getPackageJSON();
    const output_dir = opts.outDir || "dist";
    const svelteOptions: Partial<VitePluginSvelteOptions> = {
      emitCss: opts.svelte?.emitCss ?? false,
      compilerOptions: {
        // Svelte 5 requires this to keep supporting the `new App({ target })`
        // instantiation pattern used by the virtual entry below.
        ...(getSvelteMajorVersion() >= 5 ? { compatibility: { componentApi: 4 }, hmr: false } : {}),
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

    function renderTemplate(scriptSrc: string) {
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
        </head>
        <body>
          <noscript>You need to enable JavaScript to run this app.</noscript>
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

    const htmlPlugin: Plugin = {
      name: "svelte-readme-html",
      resolveId(id) {
        if (id === VIRTUAL_ENTRY_ID) return RESOLVED_VIRTUAL_ENTRY_ID;
      },
      load(id) {
        if (id === RESOLVED_VIRTUAL_ENTRY_ID) {
          return `import App from "./README.md";
                  const app = new App({ target: document.body });
                  export default app;`;
        }
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== "GET" || !req.headers.accept?.includes("text/html")) return next();

          const html = await server.transformIndexHtml(req.url ?? "/", renderTemplate(`/@id/${VIRTUAL_ENTRY_ID}`));
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
            const html = await fs.readFile(path.join(output_dir, "index.html"), "utf-8");
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

        await fs.ensureFile(path.join(output_dir, "index.html"));
        await fs.writeFile(path.join(output_dir, "index.html"), renderTemplate(`./${entryChunk.fileName}`));
      },
    };

    return {
      appType: "custom",
      build: {
        outDir: output_dir,
        minify: minify ? "esbuild" : false,
        rollupOptions: {
          input: VIRTUAL_ENTRY_ID,
          output: { entryFileNames: "s-[hash].js" },
        },
      },
      plugins: [...svelte(svelteOptions as VitePluginSvelteOptions), htmlPlugin, ...(opts.plugins || [])].filter(
        Boolean,
      ) as Plugin[],
    };
  };
}
