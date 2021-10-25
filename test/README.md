# my-svelte-component

[![NPM][npm]][npm-url]

> Block quote

<!-- REPO_URL -->

Description text.

<!-- TOC -->

Relative URL: [Readme](./)

Relative URL (anchor): [Usage](#usage)

Absolute URL: [svelte-readme](https://github.com/metonym/svelte-readme)

Check out my cool component library.

- level 1
  - level 1a
  - level 1b

## Install

```bash
yarn add -D svelte-readme
# OR
npm i -D svelte-readme
```

## Usage

### Basic

<!-- prettier-ignore-start -->

```svelte
<script>
  import Button from "my-svelte-component";

  let count = 0;
  let items = [];

  $: document.body.className = count + "";
</script>

<Button
  attribute="value"
  on:click={() => {
    count++;
  }}
>Increment the count</Button
>

<button type="button">Button</button>

<h1>{count}</h1>

{#each items as item}
  {item}
{/each}

```

Second script block:

```svelte
<script>
  import Button from "my-svelte-component";
</script>

<Button
  attribute="value"
  on:click={() => {
    console.log("hello world");
  }}
>Print 'hello world'</Button>

```

### Usage with X

## Local storage

**Note**

```js
localStorage.getItem("custom-theme-key");
```

```ts
interface Interface {
  key: "value";
}
```

## YAML highlighting

```yaml
- ul [data-accordion] # Accordion
  - li [data-accordion-item] # AccordionItem
    - button
    - [role="region"]
```

## [rollup.config.js](rollup.config.js)

[package.json](package.json)

## Rendering with `svelte:component`

## License

[MIT](../LICENSE)

[npm]: https://img.shields.io/npm/v/svelte-readme.svg?color=%23ff3e00&style=for-the-badge
[npm-url]: https://npmjs.com/package/svelte-readme
