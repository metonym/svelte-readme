import { svelteReadme } from "svelte-readme";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    svelteReadme({
      // Load custom fonts from a CDN (here, Google Fonts) via `head`, then point
      // the library's `--sr-font-sans`/`--sr-font-mono` custom properties at them via `style`.
      head: `
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      `,
      style: `
        :root {
          --sr-font-sans: "Public Sans", system-ui, sans-serif;
          --sr-font-mono: "JetBrains Mono", ui-monospace, monospace;
        }
      `,
    }),
  ],
});
