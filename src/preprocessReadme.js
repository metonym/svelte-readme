import { walk, parse } from "svelte/compiler";
import Markdown from "markdown-it";
import prettier from "prettier";
import Prism from "prismjs";
import path from "path";
import relativeUrl from "is-relative-url";
import "prismjs/components/prism-bash";
import "prism-svelte";
import isRelativeUrl from "is-relative-url";

let md;

export function preprocessReadme(opts) {
  if (!md) {
    md = new Markdown({
      html: true,
      linkify: true,
      typographer: true,
      highlight(source, lang) {
        if (lang === "svelte") {
          const regex = new RegExp('"' + opts.name + '"', "g");
          const modifiedSource = encodeURI(source.replace(regex, '"' + opts.svelte + '"'));
          const formattedCode = prettier.format(source, {
            parser: "svelte",
            // @ts-ignore
            svelteBracketNewLine: true,
          });
          const svelteCode = Prism.highlight(formattedCode, Prism.languages.svelte, "svelte");
          return `<pre class="language-${lang}" data-svelte="${modifiedSource}">{@html \`${svelteCode}\`}</pre>`;
        }

        try {
          return `<pre class="language-${lang}">{@html \`${Prism.highlight(
            source,
            Prism.languages[lang],
            lang
          )}\`}</pre>`;
        } catch (e) {
          console.error(`Could not highlight language "${lang}".`);
          return "";
        }
      },
    });
  }

  return {
    markup: ({ content, filename }) => {
      if (/node_modules/.test(filename) || !filename.endsWith(".md")) return null;
      let script_content = "";
      let style_content = "";
      let result = md.render(content);
      let cursor = 0;

      const ast = parse(result);

      walk(ast, {
        enter(node, parent) {
          if (opts.prefixUrl && node.type === "Attribute" && node.name === "href") {
            const value = node.value[0];

            if (value && isRelativeUrl(value.raw)) {
              const relative_path = path.join(opts.prefixUrl, value.raw);
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

          if (node.type === "Attribute" && node.name === "data-svelte") {
            const raw_value = node.value[0].raw;
            const value = decodeURI(raw_value);
            const value_ast = parse(value);
            const markup =
              `<div class="code-fence">` + value.slice(value_ast.html.start, value_ast.html.end) + "</div>";
            const replace = result.slice(parent.start + cursor, parent.end + cursor);
            result = result.replace(replace, markup + replace.replace(raw_value, ""));
            cursor += markup.length - raw_value.length;

            walk(value_ast, {
              enter(node) {
                if (node.type === "Script") {
                  script_content += value.slice(node.content.start, node.content.end);
                }
              },
            });
          }
        },
      });

      return {
        code: `
            <script>${script_content}</script>
            <style>
              :global(.token.language-javascript) { color: #24292e; }
              :global(.token.language-javascript .function) { color: #005cc5; }
              :global(.token.language-javascript .string) { color: #032f62; }
              :global(.token.language-javascript .number) { color: #005cc5; }
              :global(.token.language-javascript .keyword) { color: #d73a49; }
              :global(.token.each) { color: #d73a49; }
              :global(.token.punctuation) { color: #24292e }
              :global(.token.tag) { color: #22863a; }
              :global(.token.attr-name) { color: #6f42c1; }
              :global(.token.operator) { color: #d73a49; }
              :global(.token.comment) { color: #6a737d; }

              :global(.language-css) { color: #032f62; }
              :global(.language-css .selector) { color: #22863a; }
              :global(.language-css .property) { color: #005cc5; }

              .code-fence { padding: 45px 15px; border: 1px solid #eaecef; border-bottom: 0; }

              main {
                box-sizing: border-box;
                max-width: 980px;
                margin: 0 auto;
                padding: 45px;
              }
        
              @media (max-width: 767px) {
                main { padding: 15px; }
              }

              ${style_content}
            </style>
            <main class="markdown-body">${result}</main>`,
      };
    },
  };
}
