import { svelte } from "@sveltejs/vite-plugin-svelte";
import svelteReadme from "svelte-readme";
import { defineConfig } from "vite";
import pkg from "./package.json";

const BUNDLE = process.env.BUNDLE === "true";

export default defineConfig((env) => {
  if (!BUNDLE) return svelteReadme()(env);

  return {
    plugins: [svelte()],
    build: {
      outDir: "lib",
      lib: {
        entry: pkg.svelte,
        name: pkg.name,
        formats: ["es", "umd"],
        fileName: (format) => (format === "umd" ? "index.cjs" : "index.mjs"),
      },
      rollupOptions: {
        external: ["svelte"],
      },
    },
  };
});
