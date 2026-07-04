import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const github_css = fs.readFileSync(
  path.join(
    process.cwd(),
    "./node_modules/github-markdown-css/github-markdown.css",
  ),
  "utf-8",
);

const REMOVED_SELECTOR =
  /(^\.f6|\.bg-|\.text-|\.lh-|\.tab-size|\.task-list|\.mb|\.py|\.my|\.px|\.py|\.pl|commit|blob-|octicon|border|rounded)/;

const plugin = postcss.plugin("postcss-plugin", () => {
  return (root) => {
    root.walkRules((node) => {
      node.selector = node.selector
        .replace(/\.markdown-body /g, "")
        .replace(/^\.markdown-body/g, "main");
      if (REMOVED_SELECTOR.test(node.selector)) {
        node.remove();
      }
    });
  };
});

const custom_css = `
  p { min-height: 28px; }
  pre { margin-bottom: 48px; }
`;

postcss(plugin)
  .process(github_css, { from: undefined })
  .then((result) => {
    fs.writeFileSync(
      "src/style.ts",
      `export const css = \`${result.css}${custom_css}\`;\n`,
    );
  });
