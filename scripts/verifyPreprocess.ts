import assert from "node:assert";
import { preprocessReadme } from "../dist/preprocessReadme.js";
import { version as svelteVersion } from "svelte/package.json";

const pre = preprocessReadme({
  name: "my-svelte-component",
  svelte: "./src/index.js",
  homepage: "https://github.com/metonym/svelte-readme",
});

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

Promise.resolve(pre.markup({ content, filename: "README.md" })).then((result) => {
  assert(result.code.includes("Table of Contents"), "table of contents missing");
  assert(result.code.includes('class="code-fence"'), "code-fence markup missing");
  assert(result.code.includes("$state(0)"), "extracted script content missing");
  assert(/id="section-one"/.test(result.code), "h2 anchor id missing");
  assert(/id="sub-section"/.test(result.code), "h3 anchor id missing");

  console.log(`[verifyPreprocess] OK against svelte@${svelteVersion}`);
});
