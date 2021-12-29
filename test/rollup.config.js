import resolve from "@rollup/plugin-node-resolve";
import svelte from "rollup-plugin-svelte";
import svelteReadme from "svelte-readme";
import serve from "rollup-plugin-serve";
import pkg from "./package.json";

const DEV = process.env.ROLLUP_WATCH;
const BUNDLE = process.env.BUNDLE === "true";

export default () => {
  if (!BUNDLE)
    return svelteReadme({
      plugins: [
        DEV &&
          serve({
            contentBase: "dist",
            port: 5000,
          }),
      ],
    });

  return ["es", "umd"].map((format) => {
    const UMD = format === "umd";

    return {
      input: pkg.svelte,
      output: {
        format,
        file: UMD ? pkg.main : pkg.module,
        name: UMD ? pkg.name : undefined,
      },
      plugins: [svelte(), resolve()],
    };
  });
};
