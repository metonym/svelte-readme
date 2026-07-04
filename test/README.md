# my-svelte-component

[![NPM][npm]][npm-url] [![License][license]][license-url] [![Downloads][downloads]][downloads-url]

> Accessible, dependency-free button components for Svelte 5 — no runtime CSS-in-JS, no global reset required.

<!-- REPO_URL -->

This package ships a single `Button` component. Every demo below uses that real component — nothing here is a mockup.

Relative URL: [Readme](./)

Relative URL (anchor): [Usage](#usage)

Absolute URL: [svelte-readme](https://github.com/metonym/svelte-readme)

<!-- TOC -->

## Features

- Zero runtime dependencies
  - Tree-shakeable named exports
  - No global CSS reset required
- Accessible by default
  - Full keyboard support
  - `aria-pressed` wired up automatically
- Strictly typed
  - Autocomplete for every prop
  - No `any` in the public API

## Installation

```bash
bun add my-svelte-component
# OR
npm i my-svelte-component
```

## Usage

### Basic

```svelte
<script>
  import Button from "my-svelte-component";

  let count = 0; // single line comment
  let items = ["Apple", "Banana", "Cherry"];

  $: label = count === 1 ? "like" : "likes";
</script>

<Button
  attribute="value"
  on:click={() => {
    count++;
  }}
>
  👍 {count} {label}
</Button>

<button type="button">Button</button>

<h1>{count}</h1>

{#each items as item}
  {item}
{/each}
```

Second script block, binding `toggled` to drive an accordion:

```svelte
<script>
  import Button from "my-svelte-component";

  let expanded; // single line comment
</script>

<Button
  bind:toggled={expanded}
  attribute="value"
  on:click={() => {
    console.log("hello world");
  }}>{expanded ? "Hide" : "Show"} details</Button
>

{#if expanded}
  <p>Extra detail revealed when expanded.</p>
{/if}
```

### Handling name collisions

Every `svelte` code fence on this page is merged into a single `<script>` block when the demo renders, so duplicate variable names have to be reconciled. A variable declared identically in two fences (e.g. `let count = 0;` above) is left alone, but a name reused for something different — like `count` below, now a string — is automatically renamed internally so it doesn't collide with the block above:

```svelte
<script>
  let count = "duplicate";
</script>

<p>{count}</p>
```

### Lifecycle hooks

Evaluated on mount, alongside every other live demo on this page:

```svelte eval
<script>
  import { onMount } from "svelte";

  onMount(() => {
    console.log('mounted: analytics.track("pageview")');
  });
</script>
```

Server-only code shown for reference — never evaluated in the browser:

```svelte no-eval
<script>
  import fs from "node:fs";

  const contents = fs.readFileSync("./data.json", "utf-8");
</script>

<pre>{contents}</pre>
```

Runs on mount, but produces no visible output:

```svelte no-display
<script>
  import { onMount } from "svelte";

  onMount(() => {
    document.title = "my-svelte-component — Kitchen Sink";
  });
</script>
```

## Styling

### Component options

```ts
interface ButtonProps {
  /**
   * Bindable pressed/expanded state
   * @default false
   */
  toggled?: boolean;

  /**
   * Visual style
   * @default "solid"
   */
  variant?: "solid" | "outline" | "ghost";

  /**
   * Padding and font scale
   * @default "md"
   */
  size?: "sm" | "md" | "lg";
}
```

### `truncate` action

Pair the component with a small action when its label needs to fit a fixed-width column:

```svelte no-eval
<script>
  /** @type {import("svelte/action").Action<HTMLElement, number>} */
  function truncate(node, maxWidth) {
    node.style.maxWidth = maxWidth + "px";
    node.style.overflow = "hidden";
    node.style.textOverflow = "ellipsis";
    node.style.whiteSpace = "nowrap";
  }
</script>

<span use:truncate={160}>A label long enough to need truncation</span>
```

### Options

| Option    | Type                              | Default   | Description               |
| --------- | --------------------------------- | --------- | -------------------------- |
| `variant` | `"solid" \| "outline" \| "ghost"` | `"solid"` | Visual style                |
| `size`    | `"sm" \| "md" \| "lg"`             | `"md"`    | Padding and font scale      |
| `toggled` | `boolean`                          | `false`   | Bindable pressed state      |

Pass a config object like `{ variant: "ghost", size: "sm" }` to override the defaults per instance.

## Typography

### Headings

Every heading level renders distinctly, down to:

#### Level four

##### Level five

###### Level six

### Emphasis

Plain text, *italic*, **bold**, ***bold italic***, ~~strikethrough~~, and `inline code`.

### Keyboard shortcuts

Press <kbd>Ctrl</kbd> + <kbd>K</kbd> (<kbd>⌘</kbd> + <kbd>K</kbd> on macOS) to focus the demo, and note that E = mc<sup>2</sup>, while water is H<sub>2</sub>O.

### Blockquotes

> A single-level quote about the component.
>
> > A nested quote — useful for quoting a reply inside a quote.

### Lists

Ordered, unordered, and mixed nesting:

1. Install the package
2. Import the component
   1. Named export
   2. Default export
3. Render it

- Buttons
  - Primary
  - Secondary
- Inputs
  - Text
  - Checkbox

### Tables

| Browser | Minimum version |
| ------- | ---------------- |
| Chrome  | 90                |
| Firefox | 88                |
| Safari  | 14                |
| Edge    | 90                |

### Code blocks

An indented code block (four spaces, no fence):

    { legacyOption: true }

### Horizontal rule

Content above a rule.

---

Content below a rule.

## Configuration

### YAML highlighting

```yaml
- ul [data-accordion] # Accordion
  - li [data-accordion-item] # AccordionItem
    - button
    - [role="region"]
```

### Options

| Flag        | Type      | Default   |
| ----------- | --------- | --------- |
| `--watch`   | `boolean` | `false`   |
| `--outDir`  | `string`  | `"dist"`  |

## Persisting a user preference

**Note**

```js
localStorage.getItem("custom-theme-key");
```

```ts
interface Interface {
  key: "value";
}
```

## FAQ

<details>
<summary>Does this work with SvelteKit?</summary>

Yes — import the component the same way you would in any Svelte 5 project.

</details>

<details>
<summary>Can I disable the default styles?</summary>

Yes, pass `disableDefaultCSS: true` to `createConfig`.

</details>

## Related files

- [vite.config.ts](vite.config.ts)
- [package.json](package.json)

## Changelog

[CHANGELOG.md](../CHANGELOG.md)

## License

[MIT](../LICENSE)

[npm]: https://img.shields.io/npm/v/svelte-readme.svg?color=%23ff3e00&style=for-the-badge
[npm-url]: https://npmjs.com/package/svelte-readme
[license]: https://img.shields.io/npm/l/svelte-readme.svg?color=%23ff3e00&style=for-the-badge
[license-url]: https://github.com/metonym/svelte-readme/blob/master/LICENSE
[downloads]: https://img.shields.io/npm/dm/svelte-readme.svg?color=%23ff3e00&style=for-the-badge
[downloads-url]: https://npmjs.com/package/svelte-readme
