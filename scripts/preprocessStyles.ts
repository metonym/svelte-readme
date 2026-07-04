import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss, { type Plugin } from "postcss";

const OUTPUT_PATH = "src/styles/style.css";

// Lives inside node_modules so it self-invalidates for free whenever dependencies
// are reinstalled — a bumped `github-markdown-css` version changes `github_css`'s
// content anyway, but this also means a fresh `npm install` doesn't linger on a
// hash computed against a node_modules tree that no longer exists.
const CACHE_PATH = path.join(
  process.cwd(),
  "node_modules/.cache/svelte-readme/style-hash",
);

const github_css = fs.readFileSync(
  path.join(
    process.cwd(),
    "./node_modules/github-markdown-css/github-markdown.css",
  ),
  "utf-8",
);

const REMOVED_SELECTOR =
  /(^\.f6|\.bg-|\.text-|\.lh-|\.tab-size|\.task-list|\.mb|\.py|\.my|\.px|\.py|\.pl|commit|blob-|octicon|border|rounded)/;

const plugin: Plugin = {
  postcssPlugin: "postcss-plugin",
  Once(root) {
    root.walkRules((node) => {
      node.selector = node.selector
        .replace(/\.markdown-body /g, "")
        .replace(/^\.markdown-body/g, "main");
      if (REMOVED_SELECTOR.test(node.selector)) {
        node.remove();
      }
    });
  },
};

const OVERRIDES_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "githubOverrides.css",
);
const custom_css = fs.readFileSync(OVERRIDES_PATH, "utf-8");

// Hand-rolled instead of pulling in a CSS minifier dependency: this only ever
// runs on the well-formed, comment-free stylesheets built here, so a simple
// comment strip + whitespace collapse is enough (no need to handle url()
// strings, escapes, etc. that a general-purpose minifier would).
function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

// Hashes the raw upstream CSS plus this script's own source and its override CSS, so a
// `github-markdown-css` version bump, an edit to the selector-stripping/minify logic here,
// or a hand-edit to `githubOverrides.css` all invalidate the cache — not just a change to
// the upstream CSS bytes.
function hashInputs(): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(github_css);
  hasher.update(fs.readFileSync(fileURLToPath(import.meta.url), "utf-8"));
  hasher.update(custom_css);
  return hasher.digest("hex");
}

const hash = hashInputs();
const cachedHash = fs.existsSync(CACHE_PATH)
  ? fs.readFileSync(CACHE_PATH, "utf-8")
  : null;

if (cachedHash === hash && fs.existsSync(OUTPUT_PATH)) {
  console.log("✓ Style preprocessing skipped (github-markdown-css unchanged)");
} else {
  postcss([plugin])
    .process(github_css, { from: undefined })
    .then((result) => {
      fs.writeFileSync(OUTPUT_PATH, minifyCss(`${result.css}${custom_css}`));
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_PATH, hash);
    });
}
