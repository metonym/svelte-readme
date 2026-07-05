import { describe, expect, test } from "bun:test";
import { parse } from "svelte/compiler";
import { hasTypeScriptLang, stripTypeScript } from "./stripTypeScript.js";

const AS_KEYWORD = /\bas\b/;

function parseFence(source: string) {
  const { instance } = parse(source);
  if (!instance) throw new Error("expected a <script> block");
  return instance;
}

describe("hasTypeScriptLang", () => {
  test('detects a double-quoted lang="ts" attribute', () => {
    const source = '<script lang="ts">let a = 1;</script>';
    expect(hasTypeScriptLang(source, parseFence(source))).toBe(true);
  });

  test("detects a single-quoted lang='ts' attribute", () => {
    const source = "<script lang='ts'>let a = 1;</script>";
    expect(hasTypeScriptLang(source, parseFence(source))).toBe(true);
  });

  test("detects an unquoted lang=ts attribute", () => {
    const source = "<script lang=ts>let a = 1;</script>";
    expect(hasTypeScriptLang(source, parseFence(source))).toBe(true);
  });

  test("returns false for a plain <script> with no lang attribute", () => {
    const source = "<script>let a = 1;</script>";
    expect(hasTypeScriptLang(source, parseFence(source))).toBe(false);
  });

  test("is not fooled by a coincidental lang=ts string inside the script body", () => {
    const source = '<script>const s = "lang=ts";</script>';
    expect(hasTypeScriptLang(source, parseFence(source))).toBe(false);
  });
});

describe("stripTypeScript", () => {
  function strip(source: string) {
    return stripTypeScript(source, parseFence(source));
  }

  // Every case below is expected to produce source that re-parses as plain (non-TS)
  // Svelte — that re-parse is exactly the validity check `preprocessReadme.ts` runs
  // before trusting a stripped result, so it doubles as this suite's own assertion
  // that nothing was left half-erased.
  function expectValid(stripped: string) {
    expect(() => parse(stripped)).not.toThrow();
  }

  test('removes the lang="ts" attribute from the opening tag', () => {
    const stripped = strip('<script lang="ts">let a = 1;</script>');
    expect(stripped).toContain("<script>");
    expect(stripped).not.toContain("lang");
    expectValid(stripped);
  });

  test("strips a variable's colon type annotation", () => {
    const stripped = strip(
      '<script lang="ts">export let count: number = 0;</script>',
    );
    expect(stripped).toContain("export let count = 0;");
    expectValid(stripped);
  });

  test("strips an optional property's `?` along with its annotation", () => {
    const stripped = strip(
      '<script lang="ts">interface Props { label?: string; }\nexport let label = "hi";</script>',
    );
    expect(stripped).not.toContain("label?");
    expect(stripped).not.toContain("interface");
    expectValid(stripped);
  });

  test("strips a bare optional parameter with no type annotation", () => {
    const stripped = strip(
      '<script lang="ts">function f(x?) { return x; }</script>',
    );
    expect(stripped).toContain("function f(x) { return x; }");
    expectValid(stripped);
  });

  test("strips a function's parameter and return type annotations", () => {
    const stripped = strip(
      '<script lang="ts">function double(x: number): number { return x * 2; }</script>',
    );
    expect(stripped).toContain("function double(x) { return x * 2; }");
    expectValid(stripped);
  });

  test("removes an interface declaration entirely", () => {
    const stripped = strip(
      '<script lang="ts">interface Props { count: number; }\nexport let count = 0;</script>',
    );
    expect(stripped).not.toContain("interface");
    expect(stripped).not.toContain("Props");
    expectValid(stripped);
  });

  test("collapses the blank line left behind by a removed statement", () => {
    const stripped = strip(
      '<script lang="ts">\n  import x from "y";\n\n  interface Props {\n    count: number;\n  }\n\n  export let count = 0;\n</script>',
    );
    expect(stripped).toBe(
      '<script>\n  import x from "y";\n\n  export let count = 0;\n</script>',
    );
    expectValid(stripped);
  });

  test("removes an exported interface declaration, export keyword included", () => {
    const stripped = strip(
      '<script lang="ts">export interface Props { count: number; }\nexport let count = 0;</script>',
    );
    expect(stripped).not.toContain("interface");
    expectValid(stripped);
  });

  test("removes a type alias declaration entirely", () => {
    const stripped = strip(
      '<script lang="ts">type Alias = { a: number };\nconst x = 1;</script>',
    );
    expect(stripped).not.toContain("type Alias");
    expectValid(stripped);
  });

  test("strips generic type parameters from a function call", () => {
    const stripped = strip(
      '<script lang="ts">const generic = identity<string>("x");</script>',
    );
    expect(stripped).toContain('identity("x")');
    expectValid(stripped);
  });

  test("strips generic type parameters from a function declaration", () => {
    const stripped = strip(
      '<script lang="ts">function identity<T>(x: T): T { return x; }</script>',
    );
    expect(stripped).toContain("function identity(x) { return x; }");
    expectValid(stripped);
  });

  test("strips an `as` cast, keeping the underlying expression", () => {
    const stripped = strip(
      '<script lang="ts">const cast = foo as unknown as string;</script>',
    );
    expect(stripped).toContain("const cast = foo");
    expect(stripped).not.toMatch(AS_KEYWORD);
    expectValid(stripped);
  });

  test("strips a `satisfies` expression, keeping the underlying expression", () => {
    const stripped = strip(
      '<script lang="ts">const s = { a: 1 } satisfies Record<string, number>;</script>',
    );
    expect(stripped).toContain("const s = { a: 1 }");
    expect(stripped).not.toContain("satisfies");
    expectValid(stripped);
  });

  test("strips a non-null assertion", () => {
    const stripped = strip('<script lang="ts">const nn = maybeNull!;</script>');
    expect(stripped).toContain("const nn = maybeNull;");
    expectValid(stripped);
  });

  test("strips an old-style angle-bracket type assertion", () => {
    const stripped = strip(
      '<script lang="ts">const old = <string>someValue;</script>',
    );
    expect(stripped).toContain("const old = someValue;");
    expectValid(stripped);
  });

  test("removes a `declare` statement entirely", () => {
    const stripped = strip(
      '<script lang="ts">declare const win: any;\nconst x = 1;</script>',
    );
    expect(stripped).not.toContain("declare");
    expect(stripped).not.toContain("win");
    expectValid(stripped);
  });

  test("removes a `declare global` block entirely", () => {
    const stripped = strip(
      '<script lang="ts">declare global { interface Window { foo: string; } }\nconst x = 1;</script>',
    );
    expect(stripped).not.toContain("declare");
    expect(stripped).not.toContain("interface");
    expectValid(stripped);
  });

  test("removes a whole `import type` statement", () => {
    const stripped = strip(
      '<script lang="ts">import type { Foo } from "./foo";\nconst x = 1;</script>',
    );
    expect(stripped).not.toContain("import");
    expectValid(stripped);
  });

  test("removes only the type-only specifier from a mixed named import", () => {
    const stripped = strip(
      '<script lang="ts">import { type Bar, Baz } from "./bar";\nconsole.log(Baz);</script>',
    );
    expect(stripped).toContain('import { Baz } from "./bar";');
    expect(stripped).not.toContain("Bar");
    expectValid(stripped);
  });

  test("removes a type-only named specifier alongside a default import", () => {
    const stripped = strip(
      '<script lang="ts">import Qux, { type Quux } from "./qux";\nconsole.log(Qux);</script>',
    );
    expect(stripped).toContain("import Qux");
    expect(stripped).not.toContain("Quux");
    expectValid(stripped);
  });

  test("strips accessibility/readonly modifiers on class members, keeping `static`", () => {
    const stripped = strip(
      `<script lang="ts">
        class C {
          private x: number = 1;
          static readonly y = 2;
          constructor(public z: number) {}
        }
      </script>`,
    );
    expect(stripped).toContain("x = 1;");
    expect(stripped).toContain("static y = 2;");
    expect(stripped).toContain("constructor(z) {}");
    expect(stripped).not.toContain("private");
    expect(stripped).not.toContain("readonly");
    expect(stripped).not.toContain("public");
    expectValid(stripped);
  });

  test("strips a destructured parameter's object type annotation", () => {
    const stripped = strip(
      '<script lang="ts">function f({ a, b }: { a: number; b: string }) { return a; }</script>',
    );
    expect(stripped).toContain("function f({ a, b }) { return a; }");
    expectValid(stripped);
  });

  test("strips a type annotation on a Svelte 5 rune call", () => {
    const stripped = strip(
      '<script lang="ts">let count = $state<number>(0);</script>',
    );
    expect(stripped).toContain("let count = $state(0);");
    expectValid(stripped);
  });

  test("leaves an enum unmodified (unsupported construct, caller falls back)", () => {
    const stripped = strip(
      '<script lang="ts">enum Color { Red, Green }\nexport let c = Color.Red;</script>',
    );
    expect(stripped).toContain("enum Color");
    expect(() => parse(stripped)).toThrow();
  });

  test("leaves a plain (non-TS) script untouched aside from its own text", () => {
    const source = "<script>let count = 0;</script>";
    expect(strip(source)).toBe(source);
  });
});
