# svelte-readme

> Use the README.md file to document and demo your Svelte components.

The purpose of this project is to minimize additional set-up by using the README.md for component documentation and development.

It preprocesses the README.md using [Markdown It](https://github.com/markdown-it/markdown-it) and makes code within `svelte` code fence blocks into runnnable code. The code fence block is preserved and highlighted with [PrismJS](https://github.com/PrismJS/prism).

[GitHub Markdown CSS](https://github.com/sindresorhus/github-markdown-css) is used for styling.

## Usage

This library is tightly coupled with Rollup. You must provide the package name and svelte entry point.

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
  }
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
    return svelteReadme({
      minify: !process.env.ROLLUP_WATCH,
      svelte: {
        compilerOptions: {
          immutable: true,
        },
      },
    });
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

## Libraries

- [Markdown It](https://github.com/markdown-it/markdown-it)
- [PrismJS](https://github.com/PrismJS/prism)
- [GitHub Markdown CSS](https://github.com/sindresorhus/github-markdown-css)

## Prior art

This project is inspired by [MDsveX](https://github.com/pngwn/mdsvex).

## Changelog

[CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE)
