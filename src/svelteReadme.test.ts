import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigEnv, Plugin, UserConfig } from "vite";
import { resolveConfig } from "vite";
import { svelteReadme } from "./svelteReadme.js";

// `svelteReadme` reads `package.json` from `process.cwd()`, so each test runs
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

  // svelteReadme()'s `config` hook logs its resolved options every time it's invoked, and
  // writeBundle's SSR pass warns when it falls back to CSR (expected here — fixtures have
  // no real README.md to server-render). Keep test output focused.
  spyOn(console, "log").mockImplementation(() => {});
  spyOn(console, "group").mockImplementation(() => {});
  spyOn(console, "groupEnd").mockImplementation(() => {});
  spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(fixtureDir, { recursive: true, force: true });

  // Restore the console spies so a leftover mock (and its accumulated call count)
  // doesn't leak into whichever test file bun runs next.
  mock.restore();
});

const buildEnv: ConfigEnv = { command: "build", mode: "production" };

function getHtmlPlugin(plugins: Plugin[]) {
  const plugin = plugins.find((p) => p.name === "svelte-readme-html");
  if (!plugin) throw new Error("svelte-readme-html plugin not found");
  return plugin as Required<Pick<Plugin, "config" | "writeBundle">>;
}

function getVirtualEntriesPlugin(plugins: Plugin[]) {
  const plugin = plugins.find(
    (p) => p.name === "svelte-readme-virtual-entries",
  );
  if (!plugin)
    throw new Error("svelte-readme-virtual-entries plugin not found");
  return plugin as Required<Pick<Plugin, "resolveId" | "load">>;
}

describe("svelteReadme", () => {
  test("defaults to a dist output dir", () => {
    const htmlPlugin = getHtmlPlugin(svelteReadme());

    // biome-ignore lint/suspicious/noExplicitAny: Vite's hook types allow a plain function or a `{ handler }` object; svelteReadme defines these as plain functions, so cast past the union.
    const config = (htmlPlugin.config as any)({}, buildEnv) as UserConfig;
    expect(config.build?.outDir).toBe("dist");
  });

  test("respects an explicit outDir override", () => {
    const htmlPlugin = getHtmlPlugin(svelteReadme({ outDir: "public" }));

    // biome-ignore lint/suspicious/noExplicitAny: see above
    const config = (htmlPlugin.config as any)(
      {},
      { command: "serve", mode: "development" },
    ) as UserConfig;
    expect(config.build?.outDir).toBe("public");
  });

  test("uses the hydrate entry module as the rollup input", () => {
    const htmlPlugin = getHtmlPlugin(svelteReadme());

    // biome-ignore lint/suspicious/noExplicitAny: see above
    const config = (htmlPlugin.config as any)({}, buildEnv) as UserConfig;
    expect(config.build?.rollupOptions?.input).toBe(
      "virtual:svelte-readme-hydrate-entry",
    );
  });

  test("resolves and loads the hydrate entry as a README-backed Svelte component", () => {
    const virtualEntriesPlugin = getVirtualEntriesPlugin(svelteReadme());

    // biome-ignore lint/suspicious/noExplicitAny: see above
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
    const htmlPlugin = getHtmlPlugin(svelteReadme({ outDir: "out" }));

    // biome-ignore lint/suspicious/noExplicitAny: see above
    (htmlPlugin.config as any)({}, buildEnv);

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
    const htmlPlugin = getHtmlPlugin(svelteReadme());

    // biome-ignore lint/suspicious/noExplicitAny: see above
    (htmlPlugin.config as any)({}, buildEnv);

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
    const htmlPlugin = getHtmlPlugin(
      svelteReadme({
        disableDefaultCSS: true,
        style: ".custom { color: blue; }",
      }),
    );

    // biome-ignore lint/suspicious/noExplicitAny: see above
    (htmlPlugin.config as any)({}, buildEnv);

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
    const svelteReadmeSrc = path.join(originalCwd, "src", "svelteReadme.ts");
    fs.writeFileSync(
      runnerPath,
      `import { svelteReadme } from ${JSON.stringify(svelteReadmeSrc)};\nsvelteReadme();\n`,
    );

    const result = Bun.spawnSync({
      cmd: ["bun", "run", runnerPath],
      cwd: fixtureDir,
    });
    expect(result.exitCode).toBe(1);
  });

  test("composes with arbitrary Vite config instead of replacing it", async () => {
    const resolved = await resolveConfig(
      { configFile: false, plugins: svelteReadme(), server: { port: 4321 } },
      "build",
    );
    expect(resolved.server.port).toBe(4321);
    expect(resolved.build.rollupOptions.input).toBe(
      "virtual:svelte-readme-hydrate-entry",
    );
  });
});
