import resolve from "@rollup/plugin-node-resolve";
import svelte from "rollup-plugin-svelte";
import virtual from "@rollup/plugin-virtual";
import { terser } from "rollup-plugin-terser";
import Rollup from "rollup";
import { preprocessReadme } from "./preprocessReadme";

interface Options {
  output?: Rollup.RollupOptions;
  svelte?: object;
  minify?: boolean;
  pkg: { name: string; svelte: string };
}

export default function createConfig(opts: Options): Rollup.RollupOptions {
  if (!opts?.pkg?.name) throw Error(`Package name is required as "name".`);
  if (!opts?.pkg?.svelte) throw Error(`Svelte code entry is required as "svelte".`);

  const rollupOutputOpts: Rollup.OutputOptions = {
    format: "iife",
    name: "app",
    file: "public/bundle.js",
    ...(opts.output || {}),
  };

  const svelteOpts = {
    ...(opts.svelte || {}),
    extensions: [".svelte", ".md"],
    preprocess: [preprocessReadme({ name: opts.pkg.name, svelte: opts.pkg.svelte })],
  };

  const minify = opts.minify === true;

  return {
    watch: { clearScreen: false },
    input: "entry",
    output: rollupOutputOpts,
    // @ts-expect-error
    plugins: [
      virtual({
        entry: `import App from "./README.md";
                const app = new App({ target: document.body });
                export default app;`,
      }),
      svelte(svelteOpts),
      resolve(),
      minify && terser(),
    ].filter(Boolean),
  };
}
