import pkg from "./package.json";

export default {
  input: "src/index.js",
  external: [
    ...Object.keys(pkg.dependencies),
    "crypto",
    "fs",
    "path",
    "svelte/compiler",
    "prismjs/components/prism-bash",
  ],
  output: {
    format: "cjs",
    file: pkg.main,
    exports: "named",
  },
};
