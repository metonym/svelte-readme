import resolve from "@rollup/plugin-node-resolve";
import rollupPluginSvelte from "rollup-plugin-svelte";
import virtual from "@rollup/plugin-virtual";
import { terser } from "rollup-plugin-terser";
import { preprocessReadme } from "./preprocessReadme";
import fs from "fs-extra";
import path from "path";
import { createHash } from "crypto";
import htmlminifier from "html-minifier";

function hashREADME() {
  try {
    const path_readme = path.join(process.cwd(), "README.md");
    const readme = fs.readFileSync(path_readme);
    return "." + createHash("md5").update(readme).digest("hex").slice(0, 8);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
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
    };
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

const github_css = fs.readFileSync(
  path.join(process.cwd(), "./node_modules/github-markdown-css/github-markdown.css"),
  "utf-8"
);

const custom_css = `
  .token.language-javascript { color: #24292e; }
  .token.language-javascript .function { color: #005cc5; }
  .token.language-javascript .string { color: #032f62; }
  .token.language-javascript .number { color: #005cc5; }
  .token.language-javascript .keyword { color: #d73a49; }
  .token.each { color: #d73a49; }
  .token.punctuation { color: #24292e }
  .token.tag { color: #22863a; }
  .token.attr-name { color: #6f42c1; }
  .token.operator { color: #d73a49; }
  .token.comment { color: #6a737d; }

  .language-css { color: #032f62; }
  .language-css .selector { color: #22863a; }
  .language-css .property { color: #005cc5; }

  .code-fence { padding: 30px 15px; border: 1px solid #eaecef; border-bottom: 0; }

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

export default function createConfig(opts) {
  const minify = opts.minify === true;
  const pkg = getPackageJSON();
  const hash = minify ? hashREADME() : "";
  const template = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="${pkg.description || `${pkg.name} demo`}" />
      <title>${pkg.name}</title>
      <style>
        ${github_css}
        ${custom_css}
        ${opts.style || ""}
      </style>
    </head>
    <body>
      <noscript>You need to enable JavaScript to run this app.</noscript>
      <script src="bundle${hash}.js"></script>
    </body>
  </html>
`;

  fs.ensureFileSync("public/index.html");
  fs.writeFileSync(
    "public/index.html",
    minify
      ? htmlminifier.minify(template, {
          collapseWhitespace: true,
          conservativeCollapse: true,
          minifyCSS: true,
          removeEmptyAttributes: true,
        })
      : template
  );

  return {
    watch: { clearScreen: false },
    input: "entry",
    output: {
      format: "iife",
      name: "app",
      file: `public/bundle${hash}.js`,
      ...(opts.output || {}),
    },
    plugins: [
      virtual({
        entry: `import App from "./README.md";
                const app = new App({ target: document.body });
                export default app;`,
      }),
      rollupPluginSvelte({
        ...(opts.svelte || {}),
        extensions: [".svelte", ".md"],
        preprocess: [preprocessReadme({ ...pkg, prefixUrl: opts.prefixUrl })],
      }),
      resolve(),
      ...(opts.plugins || []),
      minify && terser(),
    ].filter(Boolean),
  };
}
