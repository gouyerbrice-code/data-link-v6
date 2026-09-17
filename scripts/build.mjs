import { mkdir, cp } from "node:fs/promises";
import { join } from "node:path";

await mkdir("dist", { recursive: true });
await cp("src", join("dist", "src"), { recursive: true });
await cp("package.json", join("dist", "package.json"));
console.log("Build OK: runtime source copied to dist/.");
