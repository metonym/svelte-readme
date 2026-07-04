import fs, { watch } from "node:fs";
import path from "node:path";
import { $, build } from "bun";

const isWatchMode =
  process.argv.includes("-w") || process.argv.includes("--watch");

// `svelte`, `vite`, `@sveltejs/vite-plugin-svelte` must resolve to the consumer's
// own installed versions.
const external = ["svelte", "vite", "@sveltejs/vite-plugin-svelte"];

// Every `.css` file under `./src` is hand-authored (or, for `style.css`, generated) CSS
// that a runtime `fs.readFileSync` call composes into the served stylesheet — see the
// `dirname`-relative reads in `svelteReadme.ts` and `./highlight/*.ts`. Bun's bundler
// concatenates every module into a single `dist/index.js`, so `import.meta.url` — and
// thus `dirname` — resolves to `dist/` itself for all of them, regardless of how nested
// the source file was under `./src`. Copies are flattened to match (by basename, not
// full relative path); collisions aren't a concern since every CSS file here has a
// distinct name.
function copyCssFiles() {
  const glob = new Bun.Glob("**/*.css");

  for (const file of glob.scanSync({ cwd: "./src" })) {
    fs.copyFileSync(
      path.join("./src", file),
      path.join("dist", path.basename(file)),
    );
  }
}

async function emitTypeDeclarations(): Promise<void> {
  try {
    await $`tsgo -p tsconfig.json`;
  } catch {
    if (!isWatchMode) process.exit(1);
  }
}

async function buildProject() {
  await $`rm -rf dist`;

  const result = await build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    format: "esm",
    target: "node",
    minify: true,
    external,
  });

  if (!result.success) {
    console.error("Build failed");
    for (const log of result.logs) {
      console.error(log);
    }
    if (!isWatchMode) {
      process.exit(1);
    }
    return;
  }

  await emitTypeDeclarations();
  copyCssFiles();

  console.log("✓ Build completed");
}

if (isWatchMode) {
  console.log("Watching for changes...\n");

  await buildProject();

  let debounceTimer: Timer | null = null;
  let isBuilding = false;

  const watcher = watch(
    "./src",
    { recursive: true },
    (_eventType, filename) => {
      if (filename && !isBuilding) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(async () => {
          console.log(`\nFile changed: ${filename}`);
          isBuilding = true;
          await buildProject();
          isBuilding = false;
        }, 100);
      }
    },
  );

  process.on("SIGINT", () => {
    console.log("\nStopping watch mode...");
    watcher.close();
    process.exit(0);
  });
} else {
  await buildProject();
}
