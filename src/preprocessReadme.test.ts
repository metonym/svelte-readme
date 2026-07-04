import { describe, expect, spyOn, test } from "bun:test";
import prettier from "prettier";
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
  test("ignores files that are not markdown", () => {
    const result = pre.markup({
      content: "# Title",
      filename: "src/App.svelte",
    });
    expect(result).toBeNull();
  });

  test("ignores markdown files inside node_modules", () => {
    const result = pre.markup({
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

  test("builds a nested table of contents from h2/h3 headings", async () => {
    const content = `
<!-- TOC -->

## Section One

### Sub Section A

### Sub Section B

## Section Two
`;
    const code = await markup(content);
    expect(code).toContain("<p><strong>Table of Contents</strong></p>");
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
      '```svelte\n<script>\n  let count = 0;\n</script>\n<p>{count}</p>\n```',
      '```svelte\n<script>\n  let count = "duplicate";\n</script>\n<p>{count}</p>\n```',
    ].join("\n\n");
    const code = await markup(content);

    const extractedScript = code?.match(/^<script>([\s\S]*?)<\/script>/)?.[1];

    expect(extractedScript).toContain("let count = 0;");
    expect(extractedScript).toContain('let count2 = "duplicate";');

    // the first fence's markup still references the original name...
    expect(code).toContain('<div class="code-fence"><p>{count}</p></div>');
    // ...and the second fence's markup is rewritten to reference the renamed one
    expect(code).toContain('<div class="code-fence"><p>{count2}</p></div>');
  });

  test("does not rename a variable declared identically across fences", async () => {
    const content = [
      '```svelte\n<script>\n  let count = 0;\n</script>\n<p>{count}</p>\n```',
      '```svelte\n<script>\n  let count = 0;\n</script>\n<p>{count}</p>\n```',
    ].join("\n\n");
    const code = await markup(content);

    const extractedScript = code?.match(/^<script>([\s\S]*?)<\/script>/)?.[1];

    // identical declarations are deduplicated via the Set in the final script assembly
    expect(extractedScript?.match(/let count = 0;/g)).toHaveLength(1);
    expect(extractedScript).not.toContain("count2");
  });

  test("treats a package name containing regex metacharacters as a literal string", async () => {
    // "a.b" is a valid (if unusual) npm name; "." is also a regex wildcard, so an
    // unescaped pattern would incorrectly also match "aXb" below.
    const withDottedName = preprocessReadme({
      name: "a.b",
      svelte: SVELTE_ENTRY,
      homepage: "https://github.com/metonym/svelte-readme",
    });
    const content = '```svelte\n<script>\n  import x from "a.b";\n  console.log("aXb");\n</script>\n```';
    const result = await withDottedName.markup({ content, filename: "README.md" });

    expect(result?.code).toContain(`import x from "${SVELTE_ENTRY}"`);
    expect(result?.code).toContain('console.log("aXb")');
  });

  test("falls back to unformatted source when prettier.format() throws on a svelte fence", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const formatSpy = spyOn(prettier, "format").mockImplementation(() => {
      throw new Error("boom");
    });

    const code = await markup('```svelte\n<script>\n  let count = 0;\n</script>\n<button>{count}</button>\n```');

    expect(code).toContain("<button>{count}</button>");
    expect(errorSpy).toHaveBeenCalledWith(
      "Could not format svelte code block; displaying it unformatted.",
    );

    formatSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("highlights fenced code using Prism language aliases", async () => {
    const ts = await markup("```ts\nconst a: number = 1;\n```");
    expect(ts).toContain('<pre class="language-typescript">');

    const sh = await markup("```sh\necho hi\n```");
    expect(sh).toContain('<pre class="language-bash">');

    const yml = await markup("```yml\nkey: value\n```");
    expect(yml).toContain('<pre class="language-yaml">');
  });

  test("falls back to raw output for a language Prism does not support", async () => {
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
});
