const fs = require("fs");
const path = require("path");
const postcss = require("postcss");

const github_css = fs.readFileSync(
  path.join(process.cwd(), "./node_modules/github-markdown-css/github-markdown.css"),
  "utf-8"
);

const plugin = postcss.plugin("postcss-plugin", () => {
  return (root) => {
    root.walkRules((node) => {
      node.selector = node.selector.replace(/\.markdown-body /g, "").replace(/^\.markdown-body/g, "main");
      if (
        /(^\.f6|\.bg-|\.text-|\.lh-|\.tab-size|\.task-list|\.mb|\.py|\.my|\.px|\.py|\.pl|commit|blob-|octicon|border|rounded)/.test(
          node.selector
        )
      ) {
        node.remove();
      }
    });
  };
});

postcss(plugin)
  .process(github_css, { from: undefined })
  .then((result) => {
    fs.writeFileSync("src/style.ts", `export const css = \`${result.css}\`;`);
  });
