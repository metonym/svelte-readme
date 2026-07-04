import { watch } from "node:fs";
import { $, build } from "bun";

const isWatchMode =
  process.argv.includes("-w") || process.argv.includes("--watch");

// `svelte`, `vite` must resolve to the consumer's own installed versions.
// `prismjs`/`prism-svelte` are dynamically imported by language, so they must stay
// resolvable at runtime rather than get inlined into this package's own bundle.
const external = ["svelte", "vite", "html-minifier", "prismjs", "prism-svelte"];

await $`rm -rf dist`;

async function emitTypeDeclarations() {
  try {
    await $`tsgo -p tsconfig.json`;
  } catch {
    if (!isWatchMode) process.exit(1);
  }
}

async function buildProject() {
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
