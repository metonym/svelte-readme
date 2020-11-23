# my-svelte-component

[Readme](./)

Check out my cool component library.

## Usage

```svelte
<script>
  import Button from "my-svelte-component";

  let count = 0;
</script>

<Button on:click={() => { count++; }}>
  Increment the count
</Button>

<h1>{count}</h1>
```

[package.json](package.json)

[MIT](../LICENSE)