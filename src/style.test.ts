import { describe, expect, test } from "bun:test";
import { css } from "./style.js";

const WHITESPACE_AFTER_PUNCTUATION = /[{;:,]\s/;
const WHITESPACE_BEFORE_PUNCTUATION = /\s[{}:;,]/;

describe("style", () => {
  test("exports a promise resolving to a non-empty CSS string", async () => {
    expect(css).toBeInstanceOf(Promise);

    const resolved = await css;

    expect(typeof resolved).toBe("string");
    expect(resolved.length).toBeGreaterThan(0);
  });

  test("includes the base GitHub markdown selectors", async () => {
    const resolved = await css;
    expect(resolved).toContain("main{");
    expect(resolved).toContain(".anchor{");
  });

  test("strips scoped .markdown-body classes emitted by postcss preprocessing", async () => {
    const resolved = await css;
    expect(resolved).not.toContain(".markdown-body ");
  });

  test("is minified: no comments, no unnecessary whitespace", async () => {
    const resolved = await css;
    expect(resolved).not.toContain("/*");
    expect(resolved).not.toMatch(WHITESPACE_AFTER_PUNCTUATION);
    expect(resolved).not.toMatch(WHITESPACE_BEFORE_PUNCTUATION);
  });
});
