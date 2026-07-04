import assert from "node:assert";
import sveltePackage from "svelte/package.json" with { type: "json" };
import { preprocessReadme } from "../dist/preprocessReadme.js";

const pre = preprocessReadme({
  name: "my-svelte-component",
  svelte: "./src/index.js",
  homepage: "https://github.com/metonym/svelte-readme",
});

const markup = pre.markup;
assert(markup, "markup preprocessor missing");

const content = `
# Title

<!-- TOC -->

## Section One

\`\`\`svelte
<script>
  let count = $state(0);
</script>

<button on:click={() => count++}>{count}</button>
\`\`\`

### Sub Section
`;

const H2_ANCHOR_ID = /id="section-one"/;
const H3_ANCHOR_ID = /id="sub-section"/;

Promise.resolve(markup({ content, filename: "README.md" })).then((result) => {
  assert(result, "markup preprocessor returned no result");
  assert(
    result.code.includes("Table of Contents"),
    "table of contents missing",
  );
  assert(
    result.code.includes('class="code-fence"'),
    "code-fence markup missing",
  );
  assert(result.code.includes("$state(0)"), "extracted script content missing");
  assert(H2_ANCHOR_ID.test(result.code), "h2 anchor id missing");
  assert(H3_ANCHOR_ID.test(result.code), "h3 anchor id missing");

  console.log(`[verifyPreprocess] OK against svelte@${sveltePackage.version}`);
});
