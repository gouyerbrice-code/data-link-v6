import { createHash } from "node:crypto";
import { validateFileMetadata, FILE_POLICY } from "./file-policy.mjs";
import { sha256 } from "./checksum.mjs";
import { parseFile } from "./parsers.mjs";
import { DataLinkError, ERROR_CODES } from "../core/errors.mjs";

export class PipelineService {
  constructor({ repository, storage, securityContext, versions }) {
    this.repository = repository;
    this.storage = storage;
    this.security = securityContext;
    this.versions = versions;
    this.idempotency = new Map();
  }

  assertContext(ctx) {
    if (!ctx?.user_id || !ctx?.tenant_id) throw new DataLinkError(ERROR_CODES.AUTHORIZATION_ERROR, "Security Context required", { status: 403 });
  }

  async createSource(ctx, { name, source_type = "FILE", metadata = {} }) {
    this.assertContext(ctx);
    if (!name) throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, "Source name required", { status: 400 });
    return this.repository.insert("sources", {
      tenant_id: ctx.tenant_id, name, source_type, status: "ACTIVE", metadata,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
  }

  async ingestFile(ctx, { source_id, filename, mime_type, buffer, metadata = {}, idempotency_key = null }) {
    this.assertContext(ctx);
    if (!Buffer.isBuffer(buffer)) throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, "File buffer is required", { status: 400 });

    const key = idempotency_key == null ? null : String(idempotency_key).trim();
    if (key !== null) {
      if (!key || key.length > 255) throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, "Invalid Idempotency-Key", { status: 400 });
      const previous = this.idempotency.get(`${ctx.tenant_id}:${key}`);
      if (previous) return { ...previous, idempotent_replay: true };
    }

    const source = await this.repository.find("sources", source_id);
    if (!source || source.tenant_id !== ctx.tenant_id) throw new DataLinkError(ERROR_CODES.NOT_FOUND, "Source not found", { status: 404 });

    let meta;
    try {
      meta = validateFileMetadata({ name: filename, sizeBytes: buffer.length, mimeType: mime_type });
    } catch (error) {
      throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, error.message, { status: 400 });
    }

    filename = meta.filename;
    const checksum = sha256(buffer);
    const dup = (await this.repository.findBy("source_files", x => x.tenant_id === ctx.tenant_id && x.checksum_sha256 === checksum))[0];
    if (dup) {
      const result = { duplicate: true, source_file: dup };
      if (key) this.idempotency.set(`${ctx.tenant_id}:${key}`, result);
      return result;
    }

    const now = new Date().toISOString();
    const sourceFile = await this.repository.insert("source_files", {
      tenant_id: ctx.tenant_id, source_id, original_name: filename, size_bytes: buffer.length,
      mime_type, extension: meta.extension, checksum_sha256: checksum, status: "RECEIVED",
      metadata, created_at: now, updated_at: now,
    });
    const storageKey = `sources/${sourceFile.id}/${filename.replaceAll("/", "_")}`;
    const artifact = await this.storage.put({ tenantId: ctx.tenant_id, key: storageKey, data: buffer });
    const artifactRow = await this.repository.insert("artifacts", {
      tenant_id: ctx.tenant_id, source_file_id: sourceFile.id, storage_provider: artifact.storage_provider,
      storage_key: artifact.storage_key, mime_type, size_bytes: buffer.length, checksum_sha256: checksum,
      version: 1, created_at: now,
    });
    const verified = await this.repository.update("source_files", sourceFile.id, { status: "VERIFIED", updated_at: now });
    const result = { duplicate: false, source_file: verified, artifact: artifactRow };
    if (key) this.idempotency.set(`${ctx.tenant_id}:${key}`, result);
    return result;
  }

  async createRawSnapshot(ctx, { source_file_id, buffer, filename, mime_type, parser_version = "v6-parser-1" }) {
    this.assertContext(ctx);
    const sf = await this.repository.find("source_files", source_file_id);
    if (!sf || sf.tenant_id !== ctx.tenant_id) throw new DataLinkError(ERROR_CODES.NOT_FOUND, "Source file not found", { status: 404 });

    const rows = parseFile({ buffer, filename, mimeType: mime_type });
    if (rows.length > FILE_POLICY.maxRawRecords) throw new DataLinkError(ERROR_CODES.INGESTION_ERROR, "RAW record limit exceeded", { status: 413 });

    const prior = await this.repository.findBy("raw_snapshots", x => x.source_file_id === source_file_id && x.tenant_id === ctx.tenant_id);
    const version = prior.length + 1;
    const columns = [...new Set(rows.flatMap(r => Object.keys(r)))].sort();
    const schema_hash = createHash("sha256").update(JSON.stringify(columns)).digest("hex");
    const now = new Date().toISOString();
    const snapshot = await this.repository.insert("raw_snapshots", {
      tenant_id: ctx.tenant_id, source_file_id, snapshot_version: version, record_count: rows.length,
      schema_hash, parser_version, status: "CREATED", created_at: now,
    });

    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map((payload, offset) => ({
        tenant_id: ctx.tenant_id, snapshot_id: snapshot.id, record_number: i + offset + 1, payload, created_at: now,
      }));
      const { error } = await this.repository.db.from("v6_raw_records").insert(batch);
      if (error) throw error;
    }

    return this.repository.update("raw_snapshots", snapshot.id, { status: "COMPLETE" });
  }
}
