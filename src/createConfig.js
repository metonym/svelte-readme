import resolve from "@rollup/plugin-node-resolve";
import rollupPluginSvelte from "rollup-plugin-svelte";
import virtual from "@rollup/plugin-virtual";
import { terser } from "rollup-plugin-terser";
import { preprocessReadme } from "./preprocessReadme";
import fs from "fs-extra";
import path from "path";
import { createHash } from "crypto";

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

export default function createConfig(opts) {
  const minify = opts.minify === true;
  const pkg = getPackageJSON();
  const hash = minify ? hashREADME() : "";

  fs.ensureFileSync("public/index.html");
  fs.writeFileSync(
    "public/index.html",
    `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="${pkg.description || `${pkg.name} demo`}" />
      <title>${pkg.name}</title>
      <link
        href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/4.0.0/github-markdown.min.css"
        rel="stylesheet"
      />
    </head>
    <body>
      <noscript>You need to enable JavaScript to run this app.</noscript>
      <script src="bundle${hash}.js"></script>
    </body>
  </html>
`.trim()
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
