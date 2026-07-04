import svelteReadme from "svelte-readme";
import { defineConfig } from "vite";

export default defineConfig((env) => svelteReadme()(env));
