# my-svelte-component

Relative URL: [Readme](./) 

Absolute URL: [svelte-readme](https://github.com/metonym/svelte-readme)

Check out my cool component library.

## Usage

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

<h1>{count}</h1>

{#each items as item}
{item}
{/each}
```

```js
localStorage.getItem("custom-theme-key");
```

[package.json](package.json)

[MIT](../LICENSE)