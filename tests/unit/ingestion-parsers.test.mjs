import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseFile } from "../../src/ingestion/parsers.mjs";
import { validateFileMetadata } from "../../src/ingestion/file-policy.mjs";

test("CSV parser preserves values and rejects duplicate headers", () => {
  const rows=parseFile({buffer:Buffer.from("Ref,Name\n A-01 ,Produit\n"),filename:"x.csv",mimeType:"text/csv"});
  assert.deepEqual(rows,[{Ref:" A-01 ",Name:"Produit"}]);
  assert.throws(()=>parseFile({buffer:Buffer.from("A,A\n1,2\n"),filename:"x.csv",mimeType:"text/csv"}),/Duplicate header/);
});

test("TSV parser", () => {
  assert.deepEqual(parseFile({buffer:Buffer.from("A\tB\n1\t2\n"),filename:"x.tsv",mimeType:"text/tab-separated-values"}),[{A:"1",B:"2"}]);
});

test("JSON object and array", () => {
  assert.deepEqual(parseFile({buffer:Buffer.from('{"a":1}'),filename:"x.json",mimeType:"application/json"}),[{a:1}]);
  assert.deepEqual(parseFile({buffer:Buffer.from('[{"a":1},{"a":2}]'),filename:"x.json",mimeType:"application/json"}),[{a:1},{a:2}]);
});

test("XLSX reads first worksheet without executing anything", async () => {
  const buffer=await readFile("tests/fixtures/minimal.xlsx");
  const rows=parseFile({buffer,filename:"x.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  assert.deepEqual(rows,[{reference:"A-01",designation:"Produit"}]);
});

test("XLSM follows same data-only parser path and never executes macros", async () => {
  const buffer=await readFile("tests/fixtures/minimal.xlsx");
  const rows=parseFile({buffer,filename:"x.xlsm",mimeType:"application/vnd.ms-excel.sheet.macroEnabled.12"});
  assert.equal(rows[0].reference,"A-01");
});

test("PDF remains artifact-level input", () => {
  const rows=parseFile({buffer:Buffer.from("PDF artifact bytes"),filename:"x.pdf",mimeType:"application/pdf"});
  assert.equal(rows[0].extracted_text,"PDF artifact bytes");
});

test("file policy rejects unsupported extension and oversized file", () => {
  assert.throws(()=>validateFileMetadata({name:"x.exe",sizeBytes:1,mimeType:"application/octet-stream"}),/Unsupported/);
  assert.throws(()=>validateFileMetadata({name:"x.csv",sizeBytes:26*1024*1024,mimeType:"text/csv"}),/size/);
});
