# svelte-readme

> Develop and demo your Svelte components in your README.md.

## Readme Driven Development

This project embraces the concept of [Readme Driven Development](https://tom.preston-werner.com/2010/08/23/readme-driven-development.html) (RDD) – or more generally, documentation driven development.

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
4. Run code within `svelte` code fence blocks so that demos are juxtaposed with code

[GitHub Markdown CSS](https://github.com/sindresorhus/github-markdown-css) is used for styling to maintain a consistent style with [github.com](https://github.com/).

### Libraries

- [Markdown It](https://github.com/markdown-it/markdown-it)
- [PrismJS](https://github.com/PrismJS/prism)
- [GitHub Markdown CSS](https://github.com/sindresorhus/github-markdown-css)

## Usage

This library exports two methods:

- `createConfig` (default export): creates a Rollup InputOptions object for you
- `preprocessReadme`: standalone Svelte markup preprocessor

`createConfig` is tightly coupled with Rollup. At a minimum, `package.json#svelte` and `package.json#name` are required.

**package.json**

```json
{
  "name": "my-svelte-component",
  "svelte": "./src/index.js",
  "main": "./lib/index.js",
  "module": "./lib/index.mjs",
  "scripts": {
    "dev": "rollup -cw",
    "build": "rollup -c",
    "prepack": "BUNDLE=true rollup -c"
  },
  "homepage": "https://github.com/metonym/svelte-readme"
}
```

**rollup.config.js**

The default export from "svelte-readme" will create a Rollup configuration used to develop and generate the demo.

```js
import resolve from "@rollup/plugin-node-resolve";
import svelte from "rollup-plugin-svelte";
import svelteReadme from "svelte-readme";
import pkg from "./package.json";

export default () => {
  if (process.env.BUNDLE !== "true") {
    return svelteReadme();
  }

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
```

### API

```ts
interface CreateConfigOptions {
  /**
   * set to `true` to minify the HTML/JS
   * @default false
   */
  minify: boolean;

  /**
   * set the folder to emit the files
   * @default "dist"
   */
  outDir: string;

  /**
   * custom CSS appended to the <style> block
   * @default ""
   */
  style: string;

  /**
   * set to `true` to omit the default GitHub styles
   * @default false
   */
  disableDefaultCSS: boolean;

  /**
   * value to prepend to relative URLs (i.e. GitHub repo URL)
   * @default undefined
   */
  prefixUrl: string;

  /**
   * `rollup-plugin-svelte` options
   * @default {}
   */
  svelte: RollupPluginSvelteOptions;

  /**
   * Rollup plugins
   * @default {[]}
   */
  plugins: Plugin[];

  /**
   * Rollup output options
   * @default {{}}
   */
  output: OutputOptions;
}
```

## Limitations

### Comments in script blocks

Single line comments in Svelte script blocks are not supported.

Use multi-line comments instead.

```diff
- let toggled; // comment
+ let toggled; /** comment */
```

## Prior art

This project is inspired by [MDsveX](https://github.com/pngwn/mdsvex).

## Changelog

[CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE)
