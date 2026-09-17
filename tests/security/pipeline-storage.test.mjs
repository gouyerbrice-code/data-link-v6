import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivateLocalStorage } from "../../src/storage/local-storage.mjs";

test("private storage is tenant-rooted and blocks path traversal", async()=>{
  const root=await mkdtemp(join(tmpdir(),"datalink-storage-"));
  const storage=new PrivateLocalStorage({root});
  const key="sources/file.bin";
  await storage.put({tenantId:"tenant-a",key,data:Buffer.from("A")});
  assert.equal((await storage.get({tenantId:"tenant-a",key})).toString(),"A");
  await assert.rejects(storage.get({tenantId:"tenant-b",key}));
  await assert.rejects(storage.put({tenantId:"tenant-a",key:"../escape",data:Buffer.from("x")}));
});
