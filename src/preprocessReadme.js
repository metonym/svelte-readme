import { walk, parse } from "svelte/compiler";
import Markdown from "markdown-it";
import prettier from "prettier";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prism-svelte";
import isRelativeUrl from "is-relative-url";

const aliases = {
  sh: "bash",
  js: "javascript",
};

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
          const alias_lang = aliases[lang] || lang;
          return `<pre class="language-${alias_lang}">{@html \`${Prism.highlight(
            source,
            Prism.languages[alias_lang],
            alias_lang
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
              const relative_path = new URL(value.raw, opts.prefixUrl).href;
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
            <style>${style_content}</style>
            <main class="markdown-body">${result}</main>`,
      };
    },
  };
}
