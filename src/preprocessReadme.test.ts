import { describe, expect, spyOn, test } from "bun:test";
import { parse } from "svelte/compiler";
import { preprocessReadme } from "./preprocessReadme.js";

const NAME = "my-svelte-component";
const SVELTE_ENTRY = "./src/index.js";
const EXTRACTED_STYLE = /<style>\s*h1 \{ color: red; \}\s*<\/style>/;
const EXTRACTED_SCRIPT = /^<script>([\s\S]*?)<\/script>/;

const pre = preprocessReadme({
  name: NAME,
  svelte: SVELTE_ENTRY,
  homepage: "https://github.com/metonym/svelte-readme",
});

async function markup(content: string, filename = "README.md") {
  const result = await pre.markup({ content, filename });
  return result?.code;
}

describe("preprocessReadme", () => {
  test("ignores files that are not markdown", async () => {
    const result = await pre.markup({
      content: "# Title",
      filename: "src/App.svelte",
    });
    expect(result).toBeNull();
  });

  test("ignores markdown files inside node_modules", async () => {
    const result = await pre.markup({
      content: "# Title",
      filename: "node_modules/some-pkg/README.md",
    });
    expect(result).toBeNull();
  });

  test("processes content when no filename is provided", async () => {
    const code = await markup("# Title", undefined as unknown as string);
    expect(code).toContain('<h1 id="title">Title</h1>');
  });

  test("replaces the REPO_URL marker with a link when repoUrl is set", async () => {
    const withRepoUrl = preprocessReadme({
      name: NAME,
      svelte: SVELTE_ENTRY,
      repoUrl: "https://github.com/metonym/svelte-readme",
    });
    const result = await withRepoUrl.markup({
      content: "<!-- REPO_URL -->",
      filename: "README.md",
    });
    expect(result?.code).toContain(
      '<a href="https://github.com/metonym/svelte-readme">GitHub repo</a>',
    );
  });

  test("leaves the REPO_URL marker untouched when repoUrl is not set", async () => {
    const code = await markup("<!-- REPO_URL -->");
    expect(code).toContain("<!-- REPO_URL -->");
  });

  test("replaces every REPO_URL marker, not just the first", async () => {
    const withRepoUrl = preprocessReadme({
      name: NAME,
      svelte: SVELTE_ENTRY,
      repoUrl: "https://github.com/metonym/svelte-readme",
    });
    const result = await withRepoUrl.markup({
      content: "<!-- REPO_URL -->\n\n<!-- REPO_URL -->",
      filename: "README.md",
    });

    expect(result?.code?.match(/GitHub repo/g)).toHaveLength(2);
  });

  test("strips content between HIDE_START and HIDE_END markers", async () => {
    const code = await markup(
      "before\n\n<!-- HIDE_START -->\n![badge](https://example.com/badge.svg)\n<!-- HIDE_END -->\n\nafter",
    );
    expect(code).not.toContain("badge");
    expect(code).toContain("before");
    expect(code).toContain("after");
  });

  test("removes the HIDE markers themselves", async () => {
    const code = await markup("<!-- HIDE_START -->hidden<!-- HIDE_END -->");
    expect(code).not.toContain("HIDE_START");
    expect(code).not.toContain("HIDE_END");
    expect(code).not.toContain("hidden");
  });

  test("strips multiple non-overlapping HIDE blocks independently", async () => {
    const code = await markup(
      "<!-- HIDE_START -->one<!-- HIDE_END -->keep<!-- HIDE_START -->two<!-- HIDE_END -->",
    );
    expect(code).not.toContain("one");
    expect(code).not.toContain("two");
    expect(code).toContain("keep");
  });

  test("rewrites relative links against the default prefix URL (homepage/tree/master)", async () => {
    const code = await markup("[rel](./foo.md)");
    expect(code).toContain(
      '<a href="https://github.com/metonym/svelte-readme/tree/master/foo.md">rel</a>',
    );
  });

  test("rewrites relative links against a custom prefixUrl", async () => {
    const withPrefix = preprocessReadme({
      name: NAME,
      svelte: SVELTE_ENTRY,
      prefixUrl: "https://example.com/base/",
    });
    const result = await withPrefix.markup({
      content: "[rel](./foo.md)",
      filename: "README.md",
    });
    expect(result?.code).toContain(
      '<a href="https://example.com/base/foo.md">rel</a>',
    );
  });

  test("leaves absolute links untouched", async () => {
    const code = await markup("[abs](https://example.com/bar)");
    expect(code).toContain('<a href="https://example.com/bar">abs</a>');
  });

  test("leaves hash-only anchor links untouched", async () => {
    const code = await markup("[anchor](#section-one)");
    expect(code).toContain('<a href="#section-one">anchor</a>');
  });

  test("extracts a top-level <style> block out of the markdown body", async () => {
    const code = await markup(
      "<style>\n  h1 { color: red; }\n</style>\n\n# Hi",
    );
    expect(code).toMatch(EXTRACTED_STYLE);
    expect(code).toContain('<main class="markdown-body">\n<h1 id="hi">Hi</h1>');
  });

  test("omits the <style> tag entirely when the markdown has no <style> block", async () => {
    const code = await markup("# Hi");
    expect(code).not.toContain("<style>");
  });

  test("builds a nested sidebar table of contents from h2/h3 headings", async () => {
    const content = `
## Section One

### Sub Section A

### Sub Section B

## Section Two
`;
    const code = await markup(content);
    expect(code).toContain('<nav class="sr-toc sr-toc-sidebar">');
    expect(code).toContain(
      '<nav class="sr-toc sr-toc-drawer" id="sr-toc-drawer" inert>',
    );
    expect(code).toContain("<p><strong>On this page</strong></p>");
    expect(code).toContain('<li><a href="#section-one">Section One</a></li>');
    expect(code).toContain(
      '<ul><li><a href="#sub-section-a">Sub Section A</a></li>',
    );
    expect(code).toContain(
      '<li><a href="#sub-section-b">Sub Section B</a></li>',
    );
    expect(code).toContain('<li><a href="#section-two">Section Two</a></li>');
    expect(code).toContain('<h2 id="section-one">Section One</h2>');
    expect(code).toContain('<h3 id="sub-section-a">Sub Section A</h3>');
  });

  test("renders a mobile sticky header with the page's h1 as its title, alongside the theme toggle and hamburger", async () => {
    const code = await markup("# My Package\n\n## Section One\n");
    expect(code).toContain('<header class="sr-mobile-header">');
    expect(code).toContain(
      '<span class="sr-mobile-header-title">My Package</span>',
    );
    expect(code).toContain('<div class="sr-mobile-header-actions">');
    expect(code).toContain(
      'aria-label="Toggle table of contents" aria-expanded="false" aria-controls="sr-toc-drawer"',
    );
  });

  test("renders the overlay and drawer for the off-canvas mobile TOC", async () => {
    const code = await markup("## Section One\n");
    expect(code).toContain('<div class="sr-toc-overlay"></div>');
    expect(code).toContain(
      '<nav class="sr-toc sr-toc-drawer" id="sr-toc-drawer" inert>',
    );
  });

  test("omits the mobile header, overlay, and drawer entirely when there are no headings", async () => {
    const code = await markup("# My Package\n\nJust a paragraph.\n");
    expect(code).not.toContain("sr-mobile-header");
    expect(code).not.toContain("sr-toc-overlay");
    expect(code).not.toContain("sr-toc-drawer");
  });

  test("strips a `<!-- TOC -->` marker instead of placing an inline copy there", async () => {
    const code = await markup("<!-- TOC -->\n\n## Section One\n");
    expect(code).not.toContain("<!-- TOC -->");
  });

  test("dedupes heading ids for repeated heading text with a numeric suffix", async () => {
    const code = await markup("## Usage\n\n## Usage\n");
    expect(code).toContain('<h2 id="usage">Usage</h2>');
    expect(code).toContain('<h2 id="usage-1">Usage</h2>');
  });

  test("percent-encodes non-alphanumeric characters in heading ids", async () => {
    const code = await markup("## API (v2)");
    expect(code).toContain('<h2 id="api-(v2)">API (v2)</h2>');
  });

  test("builds a heading id from text that includes inline code", async () => {
    const code = await markup("## `useEffect` Hook");
    expect(code).toContain('<h2 id="useeffect-hook">');
  });

  // A single `markup()` call merges every svelte fence in that README into one shared
  // `<script>`, so these three fence variants share one call to exercise that merge.
  test("handles svelte code fences: default demo, `no-eval`, and `no-display`", async () => {
    const content = [
      '```svelte\n<script>\n  import Button from "my-svelte-component";\n  let count = 0;\n</script>\n<button>{count}</button>\n```',
      '```svelte no-eval\n<script>\n  console.log("no eval");\n</script>\n```',
      '```svelte no-display\n<script>\n  console.log("no display");\n</script>\n```',
    ].join("\n\n");
    const code = await markup(content);

    const extractedScript = code?.match(EXTRACTED_SCRIPT)?.[1];

    // default fence: script extracted (with the package name swapped for the svelte
    // entry) and rendered as a live code-fence demo
    expect(extractedScript).toContain('import Button from "./src/index.js"');
    expect(extractedScript).toContain("let count = 0;");
    expect(code).toContain(
      '<div class="code-fence"><button>{count}</button></div>',
    );
    expect(code?.match(/data-svelte="/g)).toHaveLength(1);

    // no-eval: the source is still highlighted for display, but never extracted
    // into the evaluated top-level <script> block
    expect(extractedScript).not.toContain("no eval");

    // no-display: evaluated, but not rendered as a live demo
    expect(extractedScript).toContain('console.log("no display")');
  });

  // Simulates a dev server re-running `markup()` on the same README after an edit
  // (e.g. HMR): a re-render must not retain script lines removed by the edit.
  test("does not leak stale script content into a later markup() call on the same instance", async () => {
    const before = await markup(
      '```svelte\n<script>\n  console.log("before edit");\n</script>\n```',
    );
    expect(before).toContain('console.log("before edit")');

    const after = await markup(
      '```svelte\n<script>\n  console.log("after edit");\n</script>\n```',
    );
    expect(after).not.toContain('console.log("before edit")');
    expect(after).toContain('console.log("after edit")');
  });

  // Every svelte fence in a README is merged into one shared <script>, so a variable name
  // reused across fences for something different would collide once merged. The preprocessor
  // detects this and renames the later declaration (in both its script and markup) instead of
  // letting the second definition silently shadow/clobber the first.
  test("auto-renames a variable that collides with a differently-defined one from an earlier fence", async () => {
    const content = [
      "```svelte\n<script>\n  let count = 0;\n</script>\n<p>{count}</p>\n```",
      '```svelte\n<script>\n  let count = "duplicate";\n</script>\n<p>{count}</p>\n```',
    ].join("\n\n");
    const code = await markup(content);

    const extractedScript = code?.match(EXTRACTED_SCRIPT)?.[1];

    expect(extractedScript).toContain("let count = 0;");
    expect(extractedScript).toContain('let count2 = "duplicate";');

    // the first fence's markup still references the original name...
    expect(code).toContain('<div class="code-fence"><p>{count}</p></div>');
    // ...and the second fence's markup is rewritten to reference the renamed one
    expect(code).toContain('<div class="code-fence"><p>{count2}</p></div>');
  });

  // A `class:foo` directive's `foo` is a literal CSS class name, not (just) a variable
  // reference — but for the shorthand form, Svelte parses that same span as the directive's
  // `expression` too. Renaming it like any other identifier reference would silently rename
  // the class in the DOM, breaking any CSS written against `.foo`.
  test("preserves the CSS class name of a colliding variable used in a class: directive", async () => {
    const content = [
      "```svelte\n<script>\n  let intersecting = false;\n</script>\n<header class:intersecting>{intersecting}</header>\n```",
      '```svelte\n<script>\n  let intersecting = "other";\n</script>\n<header class:intersecting={intersecting}>{intersecting}</header>\n```',
    ].join("\n\n");
    const code = await markup(content);

    const extractedScript = code?.match(EXTRACTED_SCRIPT)?.[1];
    expect(extractedScript).toContain("let intersecting = false;");
    expect(extractedScript).toContain('let intersecting2 = "other";');

    // shorthand `class:intersecting` is rewritten to explicit form so the class name
    // itself (`intersecting`) survives, only the bound variable is renamed
    expect(code).toContain(
      '<div class="code-fence"><header class:intersecting>{intersecting}</header></div>',
    );
    expect(code).toContain(
      '<div class="code-fence"><header class:intersecting={intersecting2}>{intersecting2}</header></div>',
    );
  });

  test("does not rename a variable declared identically across fences", async () => {
    const content = [
      "```svelte\n<script>\n  let count = 0;\n</script>\n<p>{count}</p>\n```",
      "```svelte\n<script>\n  let count = 0;\n</script>\n<p>{count}</p>\n```",
    ].join("\n\n");
    const code = await markup(content);

    const extractedScript = code?.match(EXTRACTED_SCRIPT)?.[1];

    // identical declarations are deduplicated (as whole statements) via the Set in the
    // final script assembly
    expect(extractedScript?.match(/let count = 0;/g)).toHaveLength(1);
    expect(extractedScript).not.toContain("count2");
  });

  // Regression test: two unrelated multi-line statements that happen to share one
  // byte-identical interior line (e.g. the same `id: i + 1,` property in two separate
  // `Array.from(...)` calls) must not have that line dropped from either one. A
  // line-based (rather than statement-based) dedup would truncate the second
  // statement, leaving a dangling `({` with no matching close.
  test("does not corrupt an unrelated multi-line statement that shares a line of text with another fence", async () => {
    const content = [
      '```svelte\n<script>\n  let a = Array.from({ length: 3 }, (_, i) => ({\n    id: i + 1,\n    label: "hello",\n  }));\n</script>\n<p>{a.length}</p>\n```',
      '```svelte\n<script>\n  let b = Array.from({ length: 5 }, (_, i) => ({\n    id: i + 1,\n    label: "world",\n  }));\n</script>\n<p>{b.length}</p>\n```',
    ].join("\n\n");
    const code = await markup(content);

    const extractedScript = code?.match(EXTRACTED_SCRIPT)?.[1] ?? "";
    expect(extractedScript.match(/id: i \+ 1,/g)).toHaveLength(2);
    expect(extractedScript).toContain('label: "hello",');
    expect(extractedScript).toContain('label: "world",');

    // the merged script must still be syntactically valid
    expect(() => parse(`<script>${extractedScript}</script>`)).not.toThrow();
  });

  test("treats a package name containing regex metacharacters as a literal string", async () => {
    // "a.b" is a valid (if unusual) npm name; "." is also a regex wildcard, so an
    // unescaped pattern would incorrectly also match "aXb" below.
    const withDottedName = preprocessReadme({
      name: "a.b",
      svelte: SVELTE_ENTRY,
      homepage: "https://github.com/metonym/svelte-readme",
    });
    const content =
      '```svelte\n<script>\n  import x from "a.b";\n  console.log("aXb");\n</script>\n```';
    const result = await withDottedName.markup({
      content,
      filename: "README.md",
    });

    expect(result?.code).toContain(`import x from "${SVELTE_ENTRY}"`);
    expect(result?.code).toContain('console.log("aXb")');
  });

  test("falls back to unformatted source when the `format` callback throws on a svelte fence", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const withFailingFormat = preprocessReadme({
      name: NAME,
      svelte: SVELTE_ENTRY,
      homepage: "https://github.com/metonym/svelte-readme",
      format: () => {
        throw new Error("boom");
      },
    });

    const result = await withFailingFormat.markup({
      content:
        "```svelte\n<script>\n  let count = 0;\n</script>\n<button>{count}</button>\n```",
      filename: "README.md",
    });

    expect(result?.code).toContain("<button>{count}</button>");
    expect(errorSpy).toHaveBeenCalledWith(
      "Could not format svelte code block; displaying it unformatted.",
    );

    errorSpy.mockRestore();
  });

  test("formats svelte code fences for display with a custom (possibly async) `format` callback", async () => {
    const withFormat = preprocessReadme({
      name: NAME,
      svelte: SVELTE_ENTRY,
      homepage: "https://github.com/metonym/svelte-readme",
      format: async (source) => `${source}\n<!-- formatted-marker -->`,
    });

    const result = await withFormat.markup({
      content: "```svelte\n<script>\n  let count = 0;\n</script>\n```",
      filename: "README.md",
    });

    expect(result?.code).toContain("formatted-marker");
    // the callback only affects the highlighted display output, not the extracted/evaluated script
    expect(result?.code?.match(EXTRACTED_SCRIPT)?.[1]).not.toContain(
      "formatted-marker",
    );
  });

  test("highlights fenced code using language aliases", async () => {
    const ts = await markup("```ts\nconst a: number = 1;\n```");
    expect(ts).toContain('<pre class="language-typescript">');

    const sh = await markup("```sh\necho hi\n```");
    expect(sh).toContain('<pre class="language-bash">');

    const yml = await markup("```yml\nkey: value\n```");
    expect(yml).toContain('<pre class="language-yaml">');
  });

  test("falls back to raw output for a language with no highlighter", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const code = await markup("```made-up-lang\nplain text\n```");

    expect(code).toContain(
      '<pre class="language-made-up-lang">{@html `plain text',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Could not highlight language "made-up-lang".',
    );
    errorSpy.mockRestore();
  });

  test("escapes curly braces in prose so they aren't parsed as Svelte mustache tags", async () => {
    const code = await markup("This uses {foo} syntax in plain text.");
    expect(code).toContain(
      "This uses &lbrace;foo&rbrace; syntax in plain text.",
    );
  });

  test("escapes curly braces in inline code, including object-literal-shaped content that would otherwise fail to compile", async () => {
    const code = await markup("Use `background: { color: 'red' }` config.");
    expect(code).toContain(
      "<code>background: &lbrace; color: 'red' &rbrace;</code>",
    );
  });

  test("escapes curly braces in indented code blocks", async () => {
    const code = await markup("    const x = { a: 1 };\n");
    expect(code).toContain("const x = &lbrace; a: 1 &rbrace;;");
  });

  test("leaves curly braces inside fenced code blocks untouched (they're wrapped in a template literal, not parsed as markup)", async () => {
    const code = await markup("```js\nconst x = { a: 1 };\n```");
    expect(code).toContain('<span class="token punctuation">{</span>');
    expect(code).toContain('<span class="token punctuation">}</span>');
  });

  describe("TypeScript svelte fences", () => {
    test('renders a TS/JS toggle and both highlighted variants for a `<script lang="ts">` fence', async () => {
      const code = await markup(
        '```svelte\n<script lang="ts">\n  export let count: number = 0;\n</script>\n<button>{count}</button>\n```',
      );

      expect(code).toContain('<span class="sr-code-variant-ts">');
      expect(code).toContain('<span class="sr-code-variant-js">');
      expect(code).toContain('class="sr-code-lang-toggle"');
      // the TS-authored display keeps the annotation, unhighlighted-content-wise
      expect(code).toContain("count");
    });

    test("evaluates the type-stripped source, not the original TypeScript", async () => {
      const code = await markup(
        '```svelte\n<script lang="ts">\n  interface Props { label?: string; }\n  export let count: number = 0;\n</script>\n<button>{count}</button>\n```',
      );
      const extractedScript = code?.match(EXTRACTED_SCRIPT)?.[1];

      expect(extractedScript).toContain("export let count = 0;");
      expect(extractedScript).not.toContain("interface");
      expect(extractedScript).not.toContain(": number");
    });

    test("still renders the live demo markup using the original (unrenamed) identifiers", async () => {
      const code = await markup(
        '```svelte\n<script lang="ts">\n  export let count: number = 0;\n</script>\n<button on:click={() => count++}>{count}</button>\n```',
      );
      expect(code).toContain(
        '<div class="code-fence"><button on:click={() => count++}>{count}</button></div>',
      );
    });

    test("does not render a toggle for a plain (non-TS) svelte fence", async () => {
      const code = await markup(
        "```svelte\n<script>\n  let count = 0;\n</script>\n<button>{count}</button>\n```",
      );
      expect(code).not.toContain("sr-code-lang-toggle");
      expect(code).not.toContain('class="sr-code-variant');
    });

    test("falls back to single-variant (TS-as-authored) display when a construct can't be erased", async () => {
      const code = await markup(
        '```svelte\n<script lang="ts">\n  enum Color { Red, Green }\n  export let c = Color.Red;\n</script>\n<p>{c}</p>\n```',
      );
      const extractedScript = code?.match(EXTRACTED_SCRIPT)?.[1];

      expect(code).not.toContain("sr-code-lang-toggle");
      expect(code).not.toContain('class="sr-code-variant');
      // no stripping happened, so the raw (still TypeScript) fence is what's merged in
      expect(extractedScript).toContain("enum Color");
    });

    test("respects no-eval on a TS fence: displayed and stripped for the toggle, but never merged into the shared script", async () => {
      const code = await markup(
        '```svelte no-eval\n<script lang="ts">\n  const secret: string = "shh";\n</script>\n```',
      );
      const extractedScript = code?.match(EXTRACTED_SCRIPT)?.[1];

      expect(code).toContain('<span class="sr-code-variant-ts">');
      expect(code).toContain('<span class="sr-code-variant-js">');
      expect(extractedScript ?? "").not.toContain("secret");
    });
  });
});
