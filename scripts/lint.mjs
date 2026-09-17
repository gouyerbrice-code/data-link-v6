import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

async function jsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await jsFiles(path));
    else if (entry.name.endsWith(".mjs")) files.push(path);
  }
  return files;
}

const targets = [
  ...(await jsFiles("src")),
  ...(await jsFiles("scripts")),
  ...(await jsFiles("tests")),
];

for (const file of targets) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Lint OK: ${targets.length} JavaScript modules checked.`);
