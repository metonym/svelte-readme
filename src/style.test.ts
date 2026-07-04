import { describe, expect, test } from "bun:test";
import { css } from "./style.js";

describe("style", () => {
  test("exports a non-empty CSS string", () => {
    expect(typeof css).toBe("string");
    expect(css.length).toBeGreaterThan(0);
  });

  test("includes the base GitHub markdown selectors", () => {
    expect(css).toContain("main {");
    expect(css).toContain(".anchor {");
  });

  test("strips scoped .markdown-body classes emitted by postcss preprocessing", () => {
    expect(css).not.toContain(".markdown-body ");
  });
});
