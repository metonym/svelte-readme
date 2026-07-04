import fs, { watch } from "node:fs";
import path from "node:path";
import { $, build } from "bun";

const isWatchMode =
  process.argv.includes("-w") || process.argv.includes("--watch");

// `svelte`, `vite`, `@sveltejs/vite-plugin-svelte` must resolve to the consumer's
// own installed versions.
const external = ["svelte", "vite", "@sveltejs/vite-plugin-svelte"];

const HASH_FILE = "dist/.build-hash";
const OUTPUT_FILES = ["index.js", "index.d.ts", "style.css"];

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

// Hashes everything that can change the build output: every non-test source file
// (bun's bundler only pulls in ./src/index.ts's own dependency graph, which for this
// package is all of ./src), the root tsconfig (drives declaration emit), and this
// script itself (so editing the build logic invalidates the cache too). Test files
// are excluded on purpose — they're not part of the published output, so editing one
// shouldn't force a rebuild.
async function hashInputs(): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  const glob = new Bun.Glob("**/*.{ts,css}");
  const files = [...glob.scanSync({ cwd: "./src" })]
    .filter((file) => !file.endsWith(".test.ts"))
    .sort();

  const contents = await Promise.all(
    files.map((file) => Bun.file(path.join("./src", file)).arrayBuffer()),
  );

  files.forEach((file, i) => {
    hasher.update(file);
    hasher.update(contents[i]);
  });

  hasher.update(await Bun.file("./tsconfig.json").arrayBuffer());
  hasher.update(await Bun.file("./scripts/build.ts").arrayBuffer());

  return hasher.digest("hex");
}

function distIsComplete(): boolean {
  return OUTPUT_FILES.every((file) => fs.existsSync(path.join("dist", file)));
}

async function emitTypeDeclarations(): Promise<boolean> {
  try {
    await $`tsgo -p tsconfig.json`;
    return true;
  } catch {
    if (!isWatchMode) process.exit(1);
    return false;
  }
}

async function buildProject() {
  const hash = await hashInputs();
  const cachedHash = await Bun.file(HASH_FILE)
    .text()
    .catch(() => null);

  if (cachedHash === hash && distIsComplete()) {
    console.log("✓ Build skipped (inputs unchanged)");
    return;
  }

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

  const typesOk = await emitTypeDeclarations();
  copyCssFiles();

  // Only cache the hash once the declarations actually succeeded — otherwise a
  // failed tsgo run in watch mode would be "forgotten" and never retried.
  if (typesOk) await Bun.write(HASH_FILE, hash);

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
