# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
