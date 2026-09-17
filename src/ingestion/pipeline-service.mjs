import { randomUUID, createHash } from "node:crypto";
import { validateFileMetadata, extensionOf, FILE_POLICY } from "./file-policy.mjs";
import { sha256 } from "./checksum.mjs";
import { parseFile } from "./parsers.mjs";
import { DataLinkError, ERROR_CODES } from "../core/errors.mjs";

export class PipelineService {
  constructor({ repository, storage, securityContext, versions }) {
    this.repository=repository; this.storage=storage; this.security=securityContext; this.versions=versions;
  }
  assertContext(ctx){ if(!ctx?.user_id || !ctx?.tenant_id) throw new DataLinkError(ERROR_CODES.AUTHORIZATION_ERROR,"Security Context required",{status:403}); }
  async createSource(ctx,{name,source_type="FILE",metadata={}}){this.assertContext(ctx);if(!name)throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR,"Source name required",{status:400});return this.repository.insert("sources",{tenant_id:ctx.tenant_id,name,source_type,status:"ACTIVE",metadata,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});}
  async ingestFile(ctx,{source_id,filename,mime_type,buffer,metadata={}}){
    this.assertContext(ctx);
    const source = this.repository.find("sources", source_id);
    if(!source || source.tenant_id !== ctx.tenant_id) throw new DataLinkError(ERROR_CODES.NOT_FOUND,"Source not found",{status:404});
    const meta=validateFileMetadata({name:filename,sizeBytes:buffer.length,mimeType:mime_type});
    const checksum=sha256(buffer);
    const dup=this.repository.findBy("source_files",x=>x.tenant_id===ctx.tenant_id&&x.checksum_sha256===checksum)[0];
    if(dup) return {duplicate:true,source_file:dup};
    const sourceFile=this.repository.insert("source_files",{tenant_id:ctx.tenant_id,source_id,original_name:filename,size_bytes:buffer.length,mime_type:mime_type,extension:meta.extension,checksum_sha256:checksum,status:"RECEIVED",metadata,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    const key=`sources/${sourceFile.id}/${filename.replaceAll("/","_")}`;
    const artifact=await this.storage.put({tenantId:ctx.tenant_id,key,data:buffer});
    const artifactRow=this.repository.insert("artifacts",{tenant_id:ctx.tenant_id,source_file_id:sourceFile.id,storage_provider:artifact.storage_provider,storage_key:artifact.storage_key,mime_type:mime_type,size_bytes:buffer.length,checksum_sha256:checksum,version:1,created_at:new Date().toISOString()});
    this.repository.update("source_files",sourceFile.id,{status:"VERIFIED"});
    return {duplicate:false,source_file:this.repository.find("source_files",sourceFile.id),artifact:artifactRow};
  }
  async createRawSnapshot(ctx,{source_file_id,buffer,filename,mime_type,parser_version="v6-parser-1"}){
    this.assertContext(ctx);
    const sf=this.repository.find("source_files",source_file_id); if(!sf||sf.tenant_id!==ctx.tenant_id)throw new DataLinkError(ERROR_CODES.NOT_FOUND,"Source file not found",{status:404});
    const rows=parseFile({buffer,filename,mimeType:mime_type});
    if(rows.length>FILE_POLICY.maxRawRecords)throw new DataLinkError(ERROR_CODES.INGESTION_ERROR,"RAW record limit exceeded",{status:413});
    const prior=this.repository.findBy("raw_snapshots",x=>x.source_file_id===source_file_id);
    const version=prior.length+1;
    const columns=[...new Set(rows.flatMap(r=>Object.keys(r)))].sort();
    const schema_hash=createHash("sha256").update(JSON.stringify(columns)).digest("hex");
    const snapshot=this.repository.insert("raw_snapshots",{tenant_id:ctx.tenant_id,source_file_id,snapshot_version:version,record_count:rows.length,schema_hash,parser_version,status:"CREATED",created_at:new Date().toISOString()});
    rows.forEach((payload,i)=>this.repository.insert("raw_records",{tenant_id:ctx.tenant_id,snapshot_id:snapshot.id,record_number:i+1,payload,created_at:new Date().toISOString()}));
    this.repository.update("raw_snapshots",snapshot.id,{status:"COMPLETE"});
    return this.repository.find("raw_snapshots",snapshot.id);
  }
}
