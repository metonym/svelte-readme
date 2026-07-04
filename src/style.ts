import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export const css: Promise<string> = fsPromises.readFile(
  path.join(dirname, "style.css"),
  "utf-8",
);
