import { describe, expect, test } from "bun:test";
import { purgeUnusedCss } from "./purgeCss.js";

describe("purgeUnusedCss", () => {
  test("drops a rule whose tag never appears in the html", () => {
    const css = "table{border-collapse:collapse}kbd{padding:3px}";
    const html = "<main><p>hello</p></main>";
    expect(purgeUnusedCss(css, html)).toBe("");
  });

  test("keeps a rule whose tag appears in the html", () => {
    const css = "table{border-collapse:collapse}kbd{padding:3px}";
    const html = "<main><table><tr><td>1</td></tr></table></main>";
    expect(purgeUnusedCss(css, html)).toBe("table{border-collapse:collapse}");
  });

  test("keeps a rule when its class appears in the html", () => {
    const css = ".anchor{float:left}.footnote{font-size:12px}";
    const html = '<main><a class="anchor" href="#x"></a></main>';
    expect(purgeUnusedCss(css, html)).toBe(".anchor{float:left}");
  });

  test("keeps a rule when its id appears in the html", () => {
    const css = "#toc{list-style:none}";
    const html = '<main><ul id="toc"></ul></main>';
    expect(purgeUnusedCss(css, html)).toBe(css);
  });

  test("keeps a rule if any selector in a comma list is used", () => {
    const css = "h1,h2,h3{margin:0}";
    const html = "<main><h2>Title</h2></main>";
    expect(purgeUnusedCss(css, html)).toBe(css);
  });

  test("keeps an attribute selector only when the attribute is present", () => {
    const css = "[type=checkbox]{margin:0}";
    const usedHtml = '<main><input type="checkbox" /></main>';
    const unusedHtml = "<main><input /></main>";
    expect(purgeUnusedCss(css, usedHtml)).toBe(css);
    expect(purgeUnusedCss(css, unusedHtml)).toBe("");
  });

  test("keeps rules that can't be verified (universal selector, pseudo-only)", () => {
    const css = "*{box-sizing:border-box}:root{--x:1}";
    const html = "<main></main>";
    expect(purgeUnusedCss(css, html)).toBe(css);
  });

  test("filters an unused rule out of a @media block, dropping the block if it empties out", () => {
    const css = "@media (max-width: 767px){main{padding:15px}kbd{padding:3px}}";
    const html = "<main></main>";
    expect(purgeUnusedCss(css, html)).toBe(
      "@media (max-width: 767px){main{padding:15px}}",
    );
  });

  test("drops an @media block entirely once every inner rule is filtered out", () => {
    const css = "@media (max-width: 767px){kbd{padding:3px}}";
    const html = "<main></main>";
    expect(purgeUnusedCss(css, html)).toBe("");
  });

  test("keeps @font-face and @keyframes blocks verbatim", () => {
    const css =
      "@font-face{font-family:x;src:url(x.woff)}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(1turn)}}";
    const html = "<main></main>";
    expect(purgeUnusedCss(css, html)).toBe(css);
  });

  test("ignores selectors inside :not()/:nth-child() when extracting requirements", () => {
    const css = "a:not([href]){color:inherit}";
    const html = "<main><a>link</a></main>";
    expect(purgeUnusedCss(css, html)).toBe(css);
  });

  test("keeps a rule targeting an always-keep attribute even when absent from the html", () => {
    const css = "details[open]>summary{border-bottom:1px solid #ececef}";
    const html = "<main><details><summary>x</summary></details></main>";
    expect(purgeUnusedCss(css, html, ["open"])).toBe(css);
    expect(purgeUnusedCss(css, html)).toBe("");
  });

  test("strips comments before scanning so they don't get misread as selectors", () => {
    const css =
      "/** GitHub Primer button CSS **/\n.code-fence button{padding:5px}";
    const html =
      '<main><div class="code-fence"><button>x</button></div></main>';
    expect(purgeUnusedCss(css, html)).toContain(
      ".code-fence button{padding:5px}",
    );
  });
});
