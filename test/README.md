# my-svelte-component

<!-- TOC -->

Relative URL: [Readme](./)

Relative URL (anchor): [Usage](#usage)

Absolute URL: [svelte-readme](https://github.com/metonym/svelte-readme)

Check out my cool component library.

- level 1
  - level 1a
  - level 1b

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

<Button attribute="value" on:click={() => { count++; }}>
  Increment the count
</Button>

<button type="button">Button</button>

<h1>{count}</h1>

{#each items as item}
  {item}
{/each}
```
<!-- prettier-ignore-end -->

### Usage with X

## Local storage

**Note**

```js
localStorage.getItem("custom-theme-key");
```

## [rollup.config.js](rollup.config.js)

[package.json](package.json)

## License

[MIT](../LICENSE)
