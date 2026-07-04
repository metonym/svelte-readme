import { describe, expect, test } from "bun:test";
import { css } from "./style.js";

describe("style", () => {
  test("exports a promise resolving to a non-empty CSS string", async () => {
    expect(css).toBeInstanceOf(Promise);

    const resolved = await css;

    expect(typeof resolved).toBe("string");
    expect(resolved.length).toBeGreaterThan(0);
  });

  test("includes the base GitHub markdown selectors", async () => {
    const resolved = await css;
    expect(resolved).toContain("main {");
    expect(resolved).toContain(".anchor {");
  });

  test("strips scoped .markdown-body classes emitted by postcss preprocessing", async () => {
    const resolved = await css;
    expect(resolved).not.toContain(".markdown-body ");
  });
});
