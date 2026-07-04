import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "vite";
import createConfig from "./createConfig.js";

// `createConfig` reads `package.json` from `process.cwd()`, so each test runs
// against a throwaway fixture directory rather than this package's own package.json
// (which has no `svelte` entry).
const originalCwd = process.cwd();
let fixtureDir: string;

function writeFixturePackageJson(pkg: Record<string, unknown>) {
  fs.writeFileSync(path.join(fixtureDir, "package.json"), JSON.stringify(pkg));
}

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "svelte-readme-"));
  writeFixturePackageJson({
    name: "my-svelte-component",
    svelte: "./src/index.js",
  });
  process.chdir(fixtureDir);

  // createConfig() logs its resolved options on every call, and writeBundle's SSR pass
  // warns when it falls back to CSR (expected here — fixtures have no real README.md
  // to server-render). Keep test output focused.
  spyOn(console, "log").mockImplementation(() => {});
  spyOn(console, "group").mockImplementation(() => {});
  spyOn(console, "groupEnd").mockImplementation(() => {});
  spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

function isPlugin(value: unknown): value is Plugin {
  return typeof value === "object" && value !== null && "name" in value;
}

function getHtmlPlugin(
  config: Awaited<ReturnType<ReturnType<typeof createConfig>>>,
) {
  const plugin = config.plugins
    ?.filter(isPlugin)
    .find((p) => p.name === "svelte-readme-html");
  if (!plugin) throw new Error("svelte-readme-html plugin not found");
  return plugin as Required<Pick<Plugin, "writeBundle">>;
}

function getVirtualEntriesPlugin(
  config: Awaited<ReturnType<ReturnType<typeof createConfig>>>,
) {
  const plugin = config.plugins
    ?.filter(isPlugin)
    .find((p) => p.name === "svelte-readme-virtual-entries");
  if (!plugin)
    throw new Error("svelte-readme-virtual-entries plugin not found");
  return plugin as Required<Pick<Plugin, "resolveId" | "load">>;
}

describe("createConfig", () => {
  test("defaults to a dist output dir", async () => {
    const config = await createConfig()({
      command: "build",
      mode: "production",
    });
    expect(config.build?.outDir).toBe("dist");
  });

  test("respects an explicit outDir override", async () => {
    const config = await createConfig({ outDir: "public" })({
      command: "serve",
      mode: "development",
    });
    expect(config.build?.outDir).toBe("public");
  });

  test("uses the hydrate entry module as the rollup input", async () => {
    const config = await createConfig()({
      command: "build",
      mode: "production",
    });
    expect(config.build?.rollupOptions?.input).toBe(
      "virtual:svelte-readme-hydrate-entry",
    );
  });

  test("resolves and loads the hydrate entry as a README-backed Svelte component", async () => {
    const config = await createConfig()({
      command: "build",
      mode: "production",
    });
    const virtualEntriesPlugin = getVirtualEntriesPlugin(config);

    // biome-ignore lint/suspicious/noExplicitAny: Vite's hook types allow a plain function or a `{ handler }` object; createConfig defines these as plain functions, so cast past the union.
    const resolved = (virtualEntriesPlugin.resolveId as any)(
      "virtual:svelte-readme-hydrate-entry",
    );
    expect(resolved).toBeTruthy();

    // biome-ignore lint/suspicious/noExplicitAny: see above
    const loaded = (virtualEntriesPlugin.load as any)(resolved) as string;
    expect(loaded).toContain('import App from "./README.md"');
    expect(loaded).toContain("hydrate(App, { target: document.body })");
  });

  test("writeBundle emits an index.html using package name/description and the entry chunk", async () => {
    writeFixturePackageJson({
      name: "my-svelte-component",
      svelte: "./src/index.js",
      description: "A demo component",
    });
    const config = await createConfig({ outDir: "out" })({
      command: "build",
      mode: "production",
    });
    const htmlPlugin = getHtmlPlugin(config);

    await htmlPlugin.writeBundle(
      undefined as never,
      {
        "s-abc123.js": { isEntry: true, fileName: "s-abc123.js" },
      } as never,
    );

    const html = fs.readFileSync(
      path.join(fixtureDir, "out", "index.html"),
      "utf-8",
    );
    expect(html).toContain("<title>my-svelte-component</title>");
    expect(html).toContain('content="A demo component"');
    expect(html).toContain('<script type="module" src="./s-abc123.js">');
  });

  test("falls back to a generic meta description when package.json has none", async () => {
    const config = await createConfig()({
      command: "build",
      mode: "production",
    });
    const htmlPlugin = getHtmlPlugin(config);

    await htmlPlugin.writeBundle(
      undefined as never,
      {
        "s-abc123.js": { isEntry: true, fileName: "s-abc123.js" },
      } as never,
    );

    const html = fs.readFileSync(
      path.join(fixtureDir, "dist", "index.html"),
      "utf-8",
    );
    expect(html).toContain('content="my-svelte-component demo"');
  });

  test("disableDefaultCSS omits the bundled GitHub styles, custom style is still appended", async () => {
    const config = await createConfig({
      disableDefaultCSS: true,
      style: ".custom { color: blue; }",
    })({
      command: "build",
      mode: "production",
    });
    const htmlPlugin = getHtmlPlugin(config);

    await htmlPlugin.writeBundle(
      undefined as never,
      {
        "s-abc123.js": { isEntry: true, fileName: "s-abc123.js" },
      } as never,
    );

    const html = fs.readFileSync(
      path.join(fixtureDir, "dist", "index.html"),
      "utf-8",
    );
    expect(html).not.toContain(".anchor");
    expect(html).toContain(".custom { color: blue; }");
  });

  test("exits with a non-zero status when package.json is missing required fields", () => {
    writeFixturePackageJson({ name: "my-svelte-component" }); // missing required `svelte` entry

    const runnerPath = path.join(fixtureDir, "run.ts");
    const createConfigSrc = path.join(originalCwd, "src", "createConfig.ts");
    fs.writeFileSync(
      runnerPath,
      `import createConfig from ${JSON.stringify(createConfigSrc)};\ncreateConfig()({ command: "build", mode: "production" });\n`,
    );

    const result = Bun.spawnSync({
      cmd: ["bun", "run", runnerPath],
      cwd: fixtureDir,
    });
    expect(result.exitCode).toBe(1);
  });
});
