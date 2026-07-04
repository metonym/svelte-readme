import fs from "node:fs";
import path from "node:path";
import postcss, { type Plugin } from "postcss";

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

const custom_css = `
  p { min-height: 28px; }
  pre { margin-bottom: 48px; }
`;

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

postcss([plugin])
  .process(github_css, { from: undefined })
  .then((result) => {
    fs.writeFileSync("src/style.css", minifyCss(`${result.css}${custom_css}`));
  });
