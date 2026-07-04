import fs from "node:fs";
import path from "node:path";

export function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function getPackageJSON() {
  try {
    const path_pkg = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(path_pkg, "utf-8"));

    if (!pkg.name) throw Error(`Package name is required as "name".`);
    if (!pkg.svelte) throw Error(`Svelte code entry is required as "svelte".`);

    return {
      name: pkg.name,
      svelte: pkg.svelte,
      description: pkg.description,
      homepage: pkg.homepage,
      repoUrl: pkg.repository?.url,
    };
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

// Hand-rolled instead of pulling in an HTML minifier: collapses runs of
// insignificant whitespace (template indentation, blank lines from empty
// interpolations) down to a single space. `<pre>`/`<script>` contents are
// left untouched — `<pre>` because its whitespace is meaningful (rendered
// code samples), `<script>` because collapsing a `//` line comment's
// trailing newline into a space would swallow the rest of the line.
export function collapseWhitespace(html: string): string {
  const preserved: string[] = [];

  const withPlaceholders = html.replace(
    /<(pre|script)[^>]*>[\s\S]*?<\/\1>/gi,
    (match) => {
      preserved.push(match);
      return `\0${preserved.length - 1}\0`;
    },
  );

  return withPlaceholders
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\0(\d+)\0/g, (_, i) => preserved[Number(i)]);
}

export function logSSRFallback(error: unknown) {
  console.warn(
    "[svelte-readme] Failed to server-render README.md — falling back to client-only rendering.\n" +
      "If this happens outside a simple `document`/`window` property access, guard the browser-only " +
      'code (e.g. `if (typeof document !== "undefined")`) or move it into `onMount`.',
  );
  console.warn(error);
}
