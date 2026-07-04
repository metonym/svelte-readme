import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export const githubStyles: string = fs.readFileSync(
  path.join(dirname, "style.css"),
  "utf-8",
);

export const layoutStyles: string = fs.readFileSync(
  path.join(dirname, "layout.css"),
  "utf-8",
);

export const buttonStyles: string = fs.readFileSync(
  path.join(dirname, "button.css"),
  "utf-8",
);
