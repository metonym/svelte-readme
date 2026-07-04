import { describe, expect, test } from "bun:test";
import { parse } from "svelte/compiler";
import {
  applyRenames,
  collectIdentifierRanges,
  collectTopLevelDeclarations,
  computeRenameMap,
  escapeForTemplateLiteral,
  escapeRegExp,
  getChildNodeText,
  highlightCode,
  isRelativeUrl,
} from "./preprocessReadme.utils.js";

function parseScriptContent(source: string) {
  const { instance } = parse(source);
  if (!instance) throw new Error("expected a <script> block");
  // biome-ignore lint/suspicious/noExplicitAny: Svelte's script AST has no official types
  return instance.content as any;
}

describe("highlightCode", () => {
  test("highlights typescript", () => {
    expect(highlightCode("const a = 1;", "typescript")).toContain("const");
  });

  test("highlights javascript using the typescript highlighter", () => {
    expect(highlightCode("const a = 1;", "javascript")).toContain("const");
  });

  test("highlights json", () => {
    expect(highlightCode('{"a": 1}', "json")).toContain("a");
  });

  test("highlights yaml", () => {
    expect(highlightCode("a: 1", "yaml")).toContain("a");
  });

  test("highlights bash", () => {
    expect(highlightCode("echo hi", "bash")).toContain("echo");
  });

  test("throws for an unsupported language", () => {
    expect(() => highlightCode("<div></div>", "jsx")).toThrow(
      'no highlighter for language "jsx"',
    );
  });
});

describe("escapeForTemplateLiteral", () => {
  test("escapes backslashes, backticks, and template interpolations", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the raw (unescaped) input/output strings, not a template literal
    expect(escapeForTemplateLiteral("a\\b`c${d}")).toBe("a\\\\b\\`c\\${d}");
  });

  test("escapes backslashes before the characters they introduce", () => {
    expect(escapeForTemplateLiteral("`")).toBe("\\`");
  });
});

describe("escapeRegExp", () => {
  test("escapes regex special characters", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });

  test("leaves plain text untouched", () => {
    expect(escapeRegExp("abc")).toBe("abc");
  });
});

describe("isRelativeUrl", () => {
  test("treats a plain path as relative", () => {
    expect(isRelativeUrl("./foo/bar.md")).toBe(true);
  });

  test("treats a Windows path as relative", () => {
    expect(isRelativeUrl("c:\\foo\\bar")).toBe(true);
  });

  test("treats an absolute URL as not relative", () => {
    expect(isRelativeUrl("https://example.com")).toBe(false);
  });

  test("treats a mailto URL as not relative", () => {
    expect(isRelativeUrl("mailto:foo@example.com")).toBe(false);
  });
});

describe("getChildNodeText", () => {
  test("collects text from an element's children, including nested elements", () => {
    // biome-ignore lint/suspicious/noExplicitAny: Svelte's markup AST has no official types
    const { html } = parse("<h2>Hello <strong>world</strong></h2>") as any;
    expect(getChildNodeText(html.children[0])).toBe("Hello world");
  });
});

describe("collectTopLevelDeclarations", () => {
  test("collects let/const/var, function, class, and export let bindings", () => {
    const program = parseScriptContent(`<script>
      let count = 0;
      const name = "hi";
      function greet() {}
      class Thing {}
      export let value;
    </script>`);
    const declarations = collectTopLevelDeclarations(program);
    expect(declarations.map((d) => d.name).sort()).toEqual(
      ["Thing", "count", "greet", "name", "value"].sort(),
    );
  });

  test("collects names from destructured object/array patterns", () => {
    const program = parseScriptContent(`<script>
      let { a, b: renamed, ...rest } = obj;
      let [first, second] = list;
    </script>`);
    const declarations = collectTopLevelDeclarations(program);
    expect(declarations.map((d) => d.name).sort()).toEqual(
      ["a", "first", "rest", "renamed", "second"].sort(),
    );
  });
});

describe("computeRenameMap", () => {
  test("does not rename a declaration that's identical to the earlier one", () => {
    const declaredVariables = new Map<string, string>();
    const reservedNames = new Set<string>();
    const source = "let count = 0;";
    const declarations = [{ name: "count", start: 0, end: source.length }];

    computeRenameMap(declarations, source, declaredVariables, reservedNames);
    const renameMap = computeRenameMap(
      declarations,
      source,
      declaredVariables,
      reservedNames,
    );

    expect(renameMap.size).toBe(0);
  });

  test("renames a same-named but differently defined binding", () => {
    const declaredVariables = new Map<string, string>();
    const reservedNames = new Set<string>();
    const firstSource = "let count = 0;";
    computeRenameMap(
      [{ name: "count", start: 0, end: firstSource.length }],
      firstSource,
      declaredVariables,
      reservedNames,
    );

    const secondSource = "let count = 1;";
    const renameMap = computeRenameMap(
      [{ name: "count", start: 0, end: secondSource.length }],
      secondSource,
      declaredVariables,
      reservedNames,
    );

    expect(renameMap.get("count")).toBe("count2");
  });

  test("skips already-reserved candidate names", () => {
    const declaredVariables = new Map<string, string>([
      ["count", "let count = 0;"],
      ["count2", "let count2 = 0;"],
    ]);
    const reservedNames = new Set(["count", "count2"]);
    const source = "let count = 1;";

    const renameMap = computeRenameMap(
      [{ name: "count", start: 0, end: source.length }],
      source,
      declaredVariables,
      reservedNames,
    );

    expect(renameMap.get("count")).toBe("count3");
  });
});

describe("collectIdentifierRanges", () => {
  test("finds identifier references but skips property/member keys", () => {
    const program = parseScriptContent(`<script>
      count.count = count;
      const obj = { count: 1 };
    </script>`);
    const ranges = collectIdentifierRanges(
      program,
      new Map([["count", "count2"]]),
    );

    // `count.count = count`: the object (first `count`) and the RHS are references;
    // the `.count` member access and the `{ count: 1 }` shorthand-less key are not.
    expect(ranges.length).toBe(2);
  });

  test("rewrites a shorthand class: directive to explicit form instead of renaming the class name", () => {
    const { html } = parse("<div class:intersecting>{intersecting}</div>");
    const ranges = collectIdentifierRanges(
      html,
      new Map([["intersecting", "intersecting2"]]),
    );

    // one range for the `class:intersecting` directive (expanded to explicit form) and
    // one for the `{intersecting}` expression tag
    expect(ranges.length).toBe(2);

    const directiveRange = ranges.find((r) => r.replacement !== undefined);
    expect(directiveRange?.replacement).toBe(
      "class:intersecting={intersecting2}",
    );
  });

  test("leaves an explicit class: directive's class name untouched", () => {
    const { html } = parse(
      "<div class:intersecting={intersecting}>{intersecting}</div>",
    );
    const ranges = collectIdentifierRanges(
      html,
      new Map([["intersecting", "intersecting2"]]),
    );

    // both ranges are plain identifier renames (the class name literal is never visited)
    expect(ranges.every((r) => r.replacement === undefined)).toBe(true);
    expect(ranges.length).toBe(2);
  });
});

describe("applyRenames", () => {
  test("returns the source unchanged when there are no ranges", () => {
    expect(applyRenames("let count = 0;", [], new Map())).toBe(
      "let count = 0;",
    );
  });

  test("replaces every identifier range with its renamed counterpart", () => {
    const source = "count + count";
    const ranges = [
      { start: 0, end: 5, name: "count" },
      { start: 8, end: 13, name: "count" },
    ];
    const renameMap = new Map([["count", "count2"]]);

    expect(applyRenames(source, ranges, renameMap)).toBe("count2 + count2");
  });

  test("uses a range's explicit replacement instead of the rename map when provided", () => {
    const source = "class:count";
    const ranges = [
      {
        start: 0,
        end: 11,
        name: "count",
        replacement: "class:count={count2}",
      },
    ];
    const renameMap = new Map([["count", "count2"]]);

    expect(applyRenames(source, ranges, renameMap)).toBe(
      "class:count={count2}",
    );
  });
});
