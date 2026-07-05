# my-svelte-component

<!-- HIDE_START -->
[![NPM][npm]][npm-url] [![License][license]][license-url] [![Downloads][downloads]][downloads-url]
<!-- HIDE_END -->

> Accessible, dependency-free button components for Svelte 5. No runtime CSS-in-JS, no global reset required.

<!-- REPO_URL -->

This package ships a single `Button` component, built to cover the handful of interaction patterns most UIs actually need: a plain click handler, a toggled/pressed state for things like accordions and menu triggers, and a few visual variants for different contexts.

Every demo on this page renders that real component, not a mockup or a screenshot. If you change the component's source and rebuild, what you see here changes with it, which makes this README a live reference instead of documentation that quietly drifts out of sync with the code.

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

The examples below cover the common cases: a plain click handler, a toggled state wired up with `bind:toggled`, and a few edge cases worth calling out explicitly, like name collisions between demos and code that should never run in the browser.

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

Every `svelte` code fence on this page is merged into a single `<script>` block when the demo renders, so duplicate variable names have to be reconciled. A variable declared identically in two fences (e.g. `let count = 0;` above) is left alone, but a name reused for something different (like `count` below, now a string) is automatically renamed internally so it doesn't collide with the block above:

```svelte
<script>
  let count = "duplicate";
</script>

<p>{count}</p>
```

### TypeScript

A demo authored with `<script lang="ts">` shows a TS/JS toggle next to the copy button, letting a reader switch the displayed source between the original TypeScript and the type-stripped JavaScript that's actually evaluated below:

```svelte
<script lang="ts">
  import Button from "my-svelte-component";

  interface Greeting {
    label: string;
  }

  let toggled: boolean = false;
  let greeting: Greeting = { label: "Hello" };

  function announce(message: string): void {
    console.log(`${message}: ${toggled}`);
  }
</script>

<Button
  bind:toggled
  attribute="value"
  on:click={() => announce(greeting.label)}
>
  {greeting.label}, {toggled ? "on" : "off"}
</Button>
```

### Inline handlers with generic types

A `<script lang="ts">` fence's TS-aware parsing extends into markup mustache expressions too, so an inline handler's parameter can carry its own generic type reference (like a typed `CustomEvent`) without needing to be pulled out into a named function first:

```svelte
<script lang="ts">
  import Button from "my-svelte-component";
</script>

<Button
  attribute="value"
  on:click={(e: CustomEvent<string>) => console.log(e.type)}
>
  Inline handler with a generic type
</Button>
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

Server-only code shown for reference, never evaluated in the browser:

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
    document.title = "my-svelte-component: Kitchen Sink";
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

| Option    | Type                              | Default   | Required | Since   | Description               | CSS variable                                                |
| :-------- | :--------------------------------- | :-------- | :------- | :------ | :--------------------------- | :----------------------------------------------------------- |
| `variant` | `"solid" \| "outline" \| "ghost"` | `"solid"` | No       | `1.0.0` | Visual style                | `--my-svelte-component-button-variant-solid-background-color` |
| `size`    | `"sm" \| "md" \| "lg"`             | `"md"`    | No       | `1.0.0` | Padding and font scale      | `--my-svelte-component-button-size-md-padding-inline`         |
| `toggled` | `boolean`                          | `false`   | No       | `1.2.0` | Bindable pressed state      | `--my-svelte-component-button-toggled-outline-color`          |

Pass a config object like `{ variant: "ghost", size: "sm" }` to override the defaults per instance.

## Typography

### Headings

Every heading level renders distinctly, down to:

#### Level four

##### Level five

###### Level six

### Paragraphs

Body copy renders at the library's base font size, with a line height tuned for long-form reading rather than dense UI labels. This paragraph exists mainly to show what two or three sentences of real prose look like at that size, instead of a single short line that never wraps and never reveals how the line height actually feels.

A second paragraph follows directly below the first, separated by the block spacing unit rather than a full blank line's worth of margin stacked on both sides. Only bottom margin is set on paragraphs, so consecutive ones stack with even, predictable gaps no matter how many appear in a row.

A short closing paragraph, just to confirm the rhythm holds up even when the last block in a run is brief.

### Emphasis

This sentence mixes plain text with *italic emphasis*, **bold emphasis**, ***bold italic emphasis***, ~~a strikethrough for a superseded value~~, and `inline code` for a literal identifier.

### Keyboard shortcuts

Press <kbd>Ctrl</kbd> + <kbd>K</kbd> (<kbd>⌘</kbd> + <kbd>K</kbd> on macOS) to focus the demo, and note that E = mc<sup>2</sup>, while water is H<sub>2</sub>O.

### Blockquotes

> `Button` accepts every standard HTML button attribute in addition to its own props, so an existing `onclick`, `disabled`, or `aria-label` keeps working exactly as expected.
>
> > Nesting renders the same way GitHub does it: a reply quoted inside the quote it's replying to.

### Lists

Ordered, unordered, and mixed nesting:

1. Install the package
2. Import the component
   1. Named export
   2. Default export
3. Render it

A list sitting directly below the paragraph that introduces it (like this one) gets a tighter gap than the standard block spacing, since the pairing reads as one continuous thought rather than two independent blocks:

- Buttons
  - Primary
  - Secondary
- Inputs
  - Text
  - Checkbox

### Tables

| Browser | Minimum version |
| :------ | :--------------- |
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
| :---------- | :-------- | :-------- |
| `--watch`   | `boolean` | `false`   |
| `--outDir`  | `string`  | `"dist"`  |

## Persisting a user preference

**Note:** the component itself is stateless and holds no opinion about persistence. If a toggled state should survive a page reload, read and write it yourself, typically from the parent component's `onMount`.

```js
localStorage.getItem("custom-theme-key");
```

Typed consumers can describe the shape of whatever gets stored:

```ts
interface Interface {
  key: "value";
}
```

## FAQ

<details>
<summary>Does this work with SvelteKit?</summary>

Yes. Import the component the same way you would in any Svelte 5 project; SvelteKit doesn't require any special handling.

</details>

<details>
<summary>Can I disable the default styles with <code>disableDefaultCSS</code>?</summary>

Yes, pass `disableDefaultCSS: true` to `svelteReadme`.

</details>

<details>
<summary><code>IntersectionObserverEntry</code></summary>

```ts
interface IntersectionObserverEntry {
  target: HTMLElement;
  time: number;
  isIntersecting: boolean;
  isVisible: boolean;
  intersectionRatio: number;
  intersectionRect: {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
    x: number;
    y: number;
  };
  rootBounds: {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
    x: number;
    y: number;
  };
  boundingClientRect: {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
    x: number;
    y: number;
  };
}
```

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
