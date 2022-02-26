# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.6.3](https://github.com/metonym/svelte-readme/releases/tag/v3.6.3) - 2022-02-25

- patch dependencies to resolve security warnings

## [3.6.2](https://github.com/metonym/svelte-readme/releases/tag/v3.6.2) - 2021-12-29

- remove deprecated `svelteBracketNewLine` prettier option

## [3.6.1](https://github.com/metonym/svelte-readme/releases/tag/v3.6.1) - 2021-11-14

- correctly render `h3` node text in table of contents

## [3.6.0](https://github.com/metonym/svelte-readme/releases/tag/v3.6.0) - 2021-10-27

- evaluate but omit result if `no-display` attribute is present in Svelte code fence block

## [3.5.0](https://github.com/metonym/svelte-readme/releases/tag/v3.5.0) - 2021-10-26

- omit evaluating Svelte code if `no-eval` attribute is present in Svelte code fence block

## [3.4.1](https://github.com/metonym/svelte-readme/releases/tag/v3.4.1) - 2021-10-25

- check if `instance` is undefined

## [3.4.0](https://github.com/metonym/svelte-readme/releases/tag/v3.4.0) - 2021-10-25

- allow duplicate imports in `script` block

## [3.3.1](https://github.com/metonym/svelte-readme/releases/tag/v3.3.1) - 2021-08-28

- escape back ticks in toc headings

## [3.3.0](https://github.com/metonym/svelte-readme/releases/tag/v3.3.0) - 2021-08-23

- support yaml/yml Prism.js syntax highlighting

## [3.2.0](https://github.com/metonym/svelte-readme/releases/tag/v3.2.0) - 2021-07-20

**Features**

- support typescript/jsx Prism.js syntax highlighting

**Fixes**

- render code source as HTML if highlighting fails

## [3.1.0](https://github.com/metonym/svelte-readme/releases/tag/v3.1.0) - 2021-03-20

- add `28px` minimum height to `p` tags
- add `48px` margin bottom to `pre` tags

## [3.0.0](https://github.com/metonym/svelte-readme/releases/tag/v3.0.0) - 2021-01-18

- Upgrade `prettier-plugin-svelte` version from ^1.4.2 to ^2.1.0

## [2.3.1](https://github.com/metonym/svelte-readme/releases/tag/v2.3.1) - 2021-01-17

- Append code-fence button only if `disableDefaultCSS` is false

## [2.3.0](https://github.com/metonym/svelte-readme/releases/tag/v2.3.0) - 2021-01-17

- Support head option in `createConfig`

## [2.2.0](https://github.com/metonym/svelte-readme/releases/tag/v2.2.0) - 2021-01-02

- Add ability to link to git repo url if `package.json#repository.url` is specified
- Style button by default

## [2.1.2](https://github.com/metonym/svelte-readme/releases/tag/v2.1.2) - 2020-12-31

- Initialize default parameter value in `createConfig`

## [2.1.1](https://github.com/metonym/svelte-readme/releases/tag/v2.1.1) - 2020-12-30

- Default `svelte.emitCss` to `false`

## [2.1.0](https://github.com/metonym/svelte-readme/releases/tag/v2.1.0) - 2020-12-30

- Infer development mode if `process.env.ROLLUP_WATCH` is `true`
- Automatically set `svelte.compilerOptions.dev`
- Default `svelte.compilerOptions.immutable` to `true`

## [2.0.0](https://github.com/metonym/svelte-readme/releases/tag/v2.0.0) - 2020-12-30

- Upgrade `rollup-plugin-svelte` to ^v7.0.0

## [1.3.1](https://github.com/metonym/svelte-readme/releases/tag/v1.3.1) - 2020-12-22

**Fixes**

- Add heading to TOC if text is defined

## [1.3.0](https://github.com/metonym/svelte-readme/releases/tag/v1.3.0) - 2020-12-21

**Features**

- Add option to inject auto-generated table of contents from the `h2` and `h3` headings

## [1.2.0](https://github.com/metonym/svelte-readme/releases/tag/v1.2.0) - 2020-12-21

**Features**

- Infer `prefixUrl` from `package.json#homepage`
- Slugify headings
- Add `disableDefaultCSS` option to omit default GitHub styles

**Fixes**

- Do not prefix anchor links that start with `#`

## [1.1.0](https://github.com/metonym/svelte-readme/releases/tag/v1.1.0) - 2020-11-28

**Features**

- Alias "sh", "js" languages to "bash," "javascript" for Prism syntax highlighting
- Improve syntax highlighting colors (HTML, JS)
- Optimize github CSS even more

## [1.0.0](https://github.com/metonym/svelte-readme/releases/tag/v1.0.0) - 2020-11-24

**Features**

- Preprocess `github-markdown-css` to reduce number of unused selectors, decrease CSS specificity, move to development dependencies
- Make output directory configurable through `outDir`

**Breaking Changes**

- The default output directory is changed from "public" to "dist"
- The output directory will first be deleted when building for production

## [0.4.1](https://github.com/metonym/svelte-readme/releases/tag/v0.4.1) - 2020-11-23

**Fixes**

- Remove `public/bundle.js` when building for production

## [0.4.0](https://github.com/metonym/svelte-readme/releases/tag/v0.4.0) - 2020-11-23

**Features**

- Autogenerate `public/index.html`; inject title/description in template HTML
- Consume `github-markdown-css` from NPM, not CDN; inject styles in template HTML
- Append optional `style` in `createConfig` method to template style block
- Minify template HTML if `minify` is `true`
- Hash `bundle.js` if `minify` is `true`

## [0.3.1](https://github.com/metonym/svelte-readme/releases/tag/v0.3.1) - 2020-11-23

**Fixes**

- Use URL API to resolve `prefixUrl` with relative URL

## [0.3.0](https://github.com/metonym/svelte-readme/releases/tag/v0.3.0) - 2020-11-23

**Features**

- Allow Rollup plugins in `createConfig`

**Fixes**

- Only prefix URL if value is relative

## [0.2.1](https://github.com/metonym/svelte-readme/releases/tag/v0.2.1) - 2020-11-23

**Fixes**

- Fix cursor setting when replacing anchor link URLs

## [0.2.0](https://github.com/metonym/svelte-readme/releases/tag/v0.2.0) - 2020-11-23

**Features**

- Automatically read "name", "svelte" fields from `package.json`
- Prefix relative anchor link URLs with optional `prefixUrl` option

## [0.1.2](https://github.com/metonym/svelte-readme/releases/tag/v0.1.2) - 2020-11-22

**Fixes**

- Use the correct dependency "prismjs", not "prism"

## [0.1.1](https://github.com/metonym/svelte-readme/releases/tag/v0.1.1) - 2020-11-22

**Fixes**

- Add "markdown-body" class so that `github-markdown-css` styles are applied

## [0.1.0](https://github.com/metonym/svelte-readme/releases/tag/v0.1.0) - 2020-11-22

- Initial release
