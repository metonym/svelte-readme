import { walk } from "estree-walker";
import Markdown from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import prettier from "prettier";
import Prism from "prismjs";
import { parse } from "svelte/compiler";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-yaml.js";
import "prism-svelte";
import { URL } from "node:url";
import type { PreprocessorGroup } from "svelte/compiler";

type Node = Record<string, any> & { start: number; end: number; type: string };

const aliases: Record<string, string> = {
  sh: "bash",
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
};

let md: Markdown;

interface PreprocessReadmeOptions {
  name: string;
  svelte: string;
  prefixUrl: string;
  homepage: string;
  repoUrl: string;
}

function isRelativeUrl(url: string): boolean {
  // Windows paths (e.g. "c:\foo") aren't absolute URLs, so they're treated as relative.
  if (/^[a-zA-Z]:\\/.test(url)) return true;
  return !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
}

const getChildNodeText = (node: any) => {
  return node.children
    .flatMap((child: any) => (child.type === "Element" ? child.children : child))
    .filter((child: any) => child.type === "Text")
    .map((child: any) => child.raw)
    .join("");
};

export function preprocessReadme(opts: Partial<PreprocessReadmeOptions>): Pick<PreprocessorGroup, "markup"> {
  const prefixUrl = opts.prefixUrl || `${opts.homepage}/tree/master/`;

  let script_content: string[] = [];

  if (!md) {
    md = new Markdown({
      html: true,
      linkify: true,
      typographer: true,
      highlight(source, lang, attrs) {
        if (lang === "svelte") {
          const noEval = /no-eval/.test(attrs);
          const noDisplay = /no-display/.test(attrs);
          const { instance } = parse(source);

          if (instance !== undefined && !noEval) {
            script_content = [
              ...script_content,
              ...source
                .slice(instance.start, instance.end)
                .split("\n")
                .slice(1, -1)
                .map((line) => line.trim().replace(new RegExp(opts.name!, "g"), opts.svelte!)),
            ];
          }

          const regex = new RegExp(`"${opts.name}"`, "g");
          const modifiedSource = encodeURI(source.replace(regex, `"${opts.svelte}"`));
          const formattedCode = prettier.format(source, {
            parser: "svelte",
          });
          const svelteCode = Prism.highlight(formattedCode, Prism.languages.svelte, "svelte");
          return `<pre class="language-${lang}" ${
            noEval || noDisplay ? "" : `data-svelte="${modifiedSource}"`
          }>{@html \`${svelteCode}\`}</pre>`;
        }

        try {
          const alias_lang = aliases[lang] || lang;
          return `<pre class="language-${alias_lang}">{@html \`${Prism.highlight(
            source,
            Prism.languages[alias_lang],
            alias_lang,
          )}\`}</pre>`;
        } catch (_e) {
          console.error(`Could not highlight language "${lang}".`);
          return `<pre class="language-${lang}">{@html \`${source}\`}</pre>`;
        }
      },
    });

    md.use(markdownItAnchor);
  }

  return {
    // @ts-expect-error
    markup: ({ content, filename }) => {
      if (filename && (/node_modules/.test(filename) || !filename.endsWith(".md"))) return null;

      if (opts.repoUrl) {
        content = content.replace("<!-- REPO_URL -->", `[GitHub repo](${opts.repoUrl})`);
      }

      content = content.replace(
        "<!-- TOC -->",
        `
## Table of Contents
      `,
      );

      let style_content = "";
      let result = md.render(content);
      let cursor = 0;

      const ast = parse(result) as unknown as Node;

      const headings = [];
      let prev: undefined | "h2" | "h3";

      walk(ast as any, {
        enter(node: any, parent: any) {
          if (node.type === "Attribute" && node.name === "href") {
            const value = node.value[0];

            if (value && !value.raw.startsWith("#") && isRelativeUrl(value.raw)) {
              const relative_path = new URL(value.raw, prefixUrl).href;
              result = result.replace(value.raw, relative_path);
              cursor += relative_path.length - value.raw.length;
            }
          }

          if (node.type === "Style") {
            style_content += result.slice(node.content.start, node.content.end);
            const replace_style = result.slice(node.start + cursor, node.end + cursor);
            result = result.replace(replace_style, "");
            cursor -= replace_style.length;
          }

          if (node.type === "Element" && node.name === "h2") {
            // @ts-expect-error
            const id = node.attributes.find((attr) => attr.name === "id").value[0].raw;

            if (id === "table-of-contents") return;

            const text = getChildNodeText(node);

            if (text !== undefined) {
              if (prev === "h3") {
                headings.push(`</ul><li><a href="#${id}">${text}</a></li>`);
              } else {
                headings.push(`<li><a href="#${id}">${text}</a></li>`);
              }

              prev = "h2";
            }
          }

          if (node.type === "Element" && node.name === "h3") {
            // @ts-expect-error
            const id = node.attributes.find((attr) => attr.name === "id").value[0].raw;
            const text = getChildNodeText(node);

            if (text !== undefined) {
              if (prev === "h2") {
                headings.push(`<ul><li><a href="#${id}">${text}</a></li>`);
              } else {
                headings.push(`<li><a href="#${id}">${text}</a></li>`);
              }

              prev = "h3";
            }
          }

          if (node.type === "Attribute" && node.name === "data-svelte") {
            const raw_value = node.value[0].raw;
            const value = decodeURI(raw_value);
            const value_ast = parse(value) as unknown as Node;
            const markup = `<div class="code-fence">${value.slice(value_ast.html.start, value_ast.html.end)}</div>`;
            const replace = result.slice(parent!.start + cursor, parent!.end + cursor);
            result = result.replace(replace, markup + replace.replace(raw_value, ""));
            cursor += markup.length - raw_value.length;
          }
        },
      });

      if (prev === "h3") {
        headings.push("</ul>");
      }

      result = result.replace(
        `<h2 id="table-of-contents">Table of Contents</h2>`,
        `<p><strong>Table of Contents</strong></p><ul>${headings.join("\n")}</ul>`,
      );

      return {
        code: `<script>${[...new Set(script_content)].join("")}</script>
               <style>${style_content}</style>
               <main class="markdown-body">${result}</main>`,
      };
    },
  };
}
