import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collapseWhitespace,
  getPackageJSON,
  logSSRFallback,
  toArray,
} from "./utils.js";

describe("toArray", () => {
  test("returns an empty array for undefined", () => {
    expect(toArray(undefined)).toEqual([]);
  });

  test("wraps a single value in an array", () => {
    expect(toArray("a")).toEqual(["a"]);
  });

  test("passes through an existing array unchanged", () => {
    expect(toArray(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("getPackageJSON", () => {
  const originalCwd = process.cwd();
  let fixtureDir: string;

  function writeFixturePackageJson(pkg: Record<string, unknown>) {
    fs.writeFileSync(
      path.join(fixtureDir, "package.json"),
      JSON.stringify(pkg),
    );
  }

  beforeEach(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "svelte-readme-"));
    process.chdir(fixtureDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  test("reads name/svelte/description/homepage/repoUrl from package.json", () => {
    writeFixturePackageJson({
      name: "my-svelte-component",
      svelte: "./src/index.js",
      description: "A demo component",
      homepage: "https://example.com",
      repository: { url: "https://example.com/repo.git" },
    });

    expect(getPackageJSON()).toEqual({
      name: "my-svelte-component",
      svelte: "./src/index.js",
      description: "A demo component",
      homepage: "https://example.com",
      repoUrl: "https://example.com/repo.git",
    });
  });

  test("exits with a non-zero status when name is missing", () => {
    writeFixturePackageJson({ svelte: "./src/index.js" });
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => {}) as never,
    );

    getPackageJSON();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalled();
  });

  test("exits with a non-zero status when svelte entry is missing", () => {
    writeFixturePackageJson({ name: "my-svelte-component" });
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => {}) as never,
    );

    getPackageJSON();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalled();
  });
});

describe("collapseWhitespace", () => {
  test("collapses runs of whitespace down to a single space", () => {
    expect(collapseWhitespace("a\n\n  b   c")).toBe("a b c");
  });

  test("trims leading and trailing whitespace", () => {
    expect(collapseWhitespace("  \n a \n  ")).toBe("a");
  });

  test("leaves <pre> contents untouched", () => {
    const html = "before <pre>  keep\n  this  </pre> after";
    expect(collapseWhitespace(html)).toBe(
      "before <pre>  keep\n  this  </pre> after",
    );
  });

  test("leaves <script> contents untouched", () => {
    const html = "<script>\n  // a comment\n  const x = 1;\n</script>";
    expect(collapseWhitespace(html)).toBe(html);
  });
});

describe("logSSRFallback", () => {
  test("warns with a fallback message and the error", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const error = new Error("boom");

    logSSRFallback(error);

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      "Failed to server-render README.md",
    );
    expect(warnSpy.mock.calls[1]?.[0]).toBe(error);
  });
});
