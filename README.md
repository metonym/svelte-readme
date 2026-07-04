# svelte-readme

> A Vite plugin and Svelte preprocessor for developing and demoing your Svelte components in your README.md.

## Readme Driven Development

This project embraces the concept of [Readme Driven Development](https://tom.preston-werner.com/2010/08/23/readme-driven-development.html) (RDD), or more generally, documentation driven development.

This module enables the `README.md` to be used for:

- developing a Svelte component
- demoing a Svelte component
- documentation
  - installation
  - usage
  - API
  - metadata
    - links to Changelog, License etc.

## How it works

At its core, this library is a simple Svelte preprocessor.

1. Use the `svelte` entry defined in your project `package.json`
2. Use `README.md` as the Svelte source code
3. Parse Markdown using [Markdown It](https://github.com/markdown-it/markdown-it)
4. Highlight code with a built-in highlighter (`svelte`, `typescript`/`javascript`, `json`, `yaml`, `bash`) and run `svelte` code fence blocks so that demos are juxtaposed with code
5. Style the result with [GitHub Markdown CSS](https://github.com/sindresorhus/github-markdown-css) to maintain a consistent look with [github.com](https://github.com/)

## Installation

```sh
npm install svelte-readme
```

## Usage

This library exports two methods:

- `svelteReadme`: creates a Vite plugin for you
- `preprocessReadme`: standalone Svelte markup preprocessor

`svelteReadme` requires Svelte 5+ as a peer dependency. `preprocessReadme` has no such constraint. At a minimum, `package.json#svelte` and `package.json#name` are required.

**package.json**

```json
{
  "name": "my-svelte-component",
  "svelte": "./src/index.js",
  "type": "module",
  "exports": {
    ".": "./src/index.js"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "homepage": "https://github.com/metonym/svelte-readme"
}
```

**vite.config.ts**

`svelteReadme` is a standard Vite plugin factory: it returns `Plugin[]`, so it composes with the rest of your Vite config instead of replacing it.

```ts
import { svelteReadme } from "svelte-readme";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelteReadme()],
  server: { port: 3000 }, // passes through untouched
});
```

## API

All properties are optional.

> [!NOTE]
> `svelteReadme` owns `build.outDir` (set via the `outDir` option below, not `build.outDir`) and `build.rollupOptions.input`/`appType`. If you set your own `build.rollupOptions` in `vite.config.ts`, the outcome depends on Vite's plugin `config` hook merge order — this is composable for fields `svelteReadme` doesn't touch, but not fully composable for the fields it does.

```ts
interface SvelteReadmeOptions {
  /**
   * set the folder to emit the files
   * @default "dist"
   */
  outDir?: string;

  /**
   * custom CSS appended to the <style> block
   * @default ""
   */
  style?: string;

  /**
   * set to `true` to omit the default GitHub styles
   * @default false
   */
  disableDefaultCSS?: boolean;

  /**
   * value to prepend to relative URLs (i.e. GitHub repo URL)
   * @default undefined
   */
  prefixUrl?: string;

  /**
   * Called with the source of each `svelte` code fence before it's highlighted for display,
   * so it can be pretty-printed with your own formatter (e.g. Prettier). The code fence is
   * displayed unformatted if this is omitted or its result rejects/throws.
   * @default undefined
   */
  format?: (source: string) => string | Promise<string>;

  /**
   * `@sveltejs/vite-plugin-svelte` options
   * @default {}
   */
  svelte?: VitePluginSvelteOptions;

  /**
   * Append content to the `head` element in `index.html`
   * @default undefined
   */
  head?: string;
}
```

## Changelog

[CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE)
