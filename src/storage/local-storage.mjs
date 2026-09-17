import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export class PrivateLocalStorage {
  constructor({ root = "./.datalink-storage" } = {}) {
    this.root = resolve(root);
  }

  async put({ tenantId, key, data }) {
    const safeKey = String(key).replaceAll("\\", "/");
    if (safeKey.includes("..") || safeKey.startsWith("/")) throw new Error("Invalid storage key");
    const path = resolve(join(this.root, tenantId, safeKey));
    if (!path.startsWith(resolve(join(this.root, tenantId)) + "/")) throw new Error("Storage path escape");
    await mkdir(join(this.root, tenantId, safeKey.split("/").slice(0, -1).join("/")), { recursive: true });
    await writeFile(path, data, { flag: "wx" });
    return { storage_provider: "local-private", storage_key: `${tenantId}/${safeKey}`, size_bytes: data.length };
  }

  async get({ tenantId, key }) {
    const safeKey = String(key).replaceAll("\\", "/");
    if (safeKey.includes("..") || safeKey.startsWith("/")) throw new Error("Invalid storage key");
    return readFile(resolve(join(this.root, tenantId, safeKey)));
  }

  async info({ tenantId, key }) {
    const safeKey = String(key).replaceAll("\\", "/");
    const s = await stat(resolve(join(this.root, tenantId, safeKey)));
    return { size_bytes: s.size };
  }
}
