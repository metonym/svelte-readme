import resolve from "@rollup/plugin-node-resolve";
import rollupPluginSvelte from "rollup-plugin-svelte";
import virtual from "@rollup/plugin-virtual";
import { terser } from "rollup-plugin-terser";
import { preprocessReadme } from "./preprocessReadme";
import fs from "fs";
import path from "path";

function getPackageJSON() {
  try {
    const path_pkg = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(path_pkg, "utf-8"));
    if (!pkg.name) throw Error(`Package name is required as "name".`);
    if (!pkg.svelte) throw Error(`Svelte code entry is required as "svelte".`);

    return {
      name: pkg.name,
      svelte: pkg.svelte,
    };
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

export default function createConfig(opts) {
  return {
    watch: { clearScreen: false },
    input: "entry",
    output: {
      format: "iife",
      name: "app",
      file: "public/bundle.js",
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
        preprocess: [preprocessReadme({ ...getPackageJSON(), prefixUrl: opts.prefixUrl })],
      }),
      resolve(),
      opts.minify === true && terser(),
    ].filter(Boolean),
  };
}
