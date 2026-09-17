import { inflateRawSync } from "node:zlib";
import { extensionOf } from "./file-policy.mjs";

function detectDelimiter(line) {
  const candidates = [",", "\t", ";"];
  return candidates.sort((a,b) => line.split(b).length - line.split(a).length)[0];
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i=0; i<text.length; i++) {
    const c=text[i], n=text[i+1];
    if (c === '"' && quoted && n === '"') { cell += '"'; i++; continue; }
    if (c === '"') { quoted=!quoted; continue; }
    if (c === delimiter && !quoted) { row.push(cell); cell=""; continue; }
    if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && n === "\n") i++;
      row.push(cell); cell="";
      if (row.some(v => v !== "")) rows.push(row);
      row=[]; continue;
    }
    cell += c;
  }
  if (quoted) throw new Error("Unclosed quoted field");
  row.push(cell);
  if (row.some(v => v !== "")) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0];
  const seen = new Set();
  for (const h of headers) {
    if (seen.has(h)) throw new Error(`Duplicate header: ${h}`);
    seen.add(h);
  }
  return rows.slice(1).map(values => Object.fromEntries(headers.map((h,i)=>[h, values[i] ?? null])));
}

function parseJson(text) {
  const value = JSON.parse(text);
  if (Array.isArray(value)) return value.map(v => (v && typeof v === "object" && !Array.isArray(v)) ? v : { value: v });
  if (value && typeof value === "object") return [value];
  return [{ value }];
}

// Minimal OOXML reader: reads shared strings + first worksheet.
// No macros are executed. Complex workbook features are intentionally outside P1/P0 scope.
function parseXlsx(buffer) {
  const zip = readZip(buffer);
  const shared = zip.get("xl/sharedStrings.xml");
  const workbook = zip.get("xl/workbook.xml");
  if (!workbook) throw new Error("Invalid XLSX: workbook.xml missing");
  const rels = zip.get("xl/_rels/workbook.xml.rels") || "";
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*r:id="([^"]+)"[^>]*>/g)];
  if (!sheets.length) throw new Error("XLSX contains no sheet");
  const rid=sheets[0][1];
  const relMatch = rels.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`));
  const target = relMatch ? relMatch[1].replace(/^\/+/, "") : "worksheets/sheet1.xml";
  const sheet = zip.get(target.startsWith("xl/") ? target : `xl/${target}`);
  if (!sheet) throw new Error("XLSX worksheet missing");
  const strings = shared ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>xmlDecode(x[1])).join("")) : [];
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells=[];
    for (const cm of rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs=cm[1], body=cm[2], ref=(attrs.match(/r="([^"]+)"/)||[])[1]||"";
      const type=(attrs.match(/t="([^"]+)"/)||[])[1]||"";
      const v=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1] ?? "";
      let value=xmlDecode(v);
      if (type==="s") value=strings[Number(v)] ?? "";
      if (type==="inlineStr") {
        const inline=[...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>xmlDecode(x[1])).join("");
        value=inline;
      }
      cells.push([columnNumber(ref), value]);
    }
    rows.push(cells);
  }
  const matrix=rows.map(r => {
    const max=Math.max(0,...r.map(x=>x[0]));
    const a=Array(max).fill(null); for(const [i,v] of r)a[i-1]=v; return a;
  });
  const headers=(matrix[0]||[]).map(v=>String(v??""));
  if (headers.some((h,i)=>headers.indexOf(h)!==i)) throw new Error("Duplicate header");
  return matrix.slice(1).filter(r=>r.some(v=>v!==null && v!=="")).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??null])));
}
function columnNumber(ref){let m=String(ref).match(/^([A-Z]+)/i);if(!m)return 1;let n=0;for(const c of m[1].toUpperCase())n=n*26+c.charCodeAt(0)-64;return n}
function xmlDecode(s){return String(s).replaceAll("&amp;","&").replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&quot;",'"').replaceAll("&apos;","'")}
function readZip(buffer){
  const b=Buffer.from(buffer), out=new Map(), sig=Buffer.from([0x50,0x4b,0x03,0x04]); let pos=0;
  while((pos=b.indexOf(sig,pos))>=0){
    const method=b.readUInt16LE(pos+8), compSize=b.readUInt32LE(pos+18), nameLen=b.readUInt16LE(pos+26), extraLen=b.readUInt16LE(pos+28);
    const name=b.subarray(pos+30,pos+30+nameLen).toString(), start=pos+30+nameLen+extraLen, data=b.subarray(start,start+compSize);
    out.set(name, method===8?inflateRawSync(data).toString("utf8"):data.toString("utf8"));
    pos=start+compSize;
  }
  return out;
}

export function parseFile({ buffer, filename, mimeType }) {
  const ext=extensionOf(filename);
  const text=Buffer.from(buffer).toString("utf8").replace(/^\uFEFF/,"");
  if(ext===".csv" || ext===".tsv") return parseDelimited(text, ext===".tsv" ? "\t" : detectDelimiter(text.split(/\r?\n/,1)[0]));
  if(ext===".json") return parseJson(text);
  if(ext===".xlsx" || ext===".xlsm") {
    if(ext===".xlsm") { /* [PROPOSITION V6] macros are never executed. */ }
    return parseXlsx(buffer);
  }
  if(ext===".pdf") return [{ extracted_text: text }]; // Artifact-level fallback; OCR/PDF extraction remains separate.
  throw new Error(`Unsupported parser: ${ext}`);
}
