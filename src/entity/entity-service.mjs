import { DataLinkError, ERROR_CODES } from "../core/errors.mjs";
export class EntityService{
 constructor({repository}){this.r=repository;}
 create(c,input){if(!c?.user_id||!c?.tenant_id)throw new DataLinkError(ERROR_CODES.AUTHORIZATION_ERROR,"Security Context required",{status:403});for(const k of ["source_id","source_file_id","source_record_id","run_id","entity_type"])if(!input[k])throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR,`${k} required`,{status:400});
 const raw=this.r.find("raw_records",input.source_record_id);const run=this.r.find("runs",input.run_id);if(!raw||!run||raw.tenant_id!==c.tenant_id||run.tenant_id!==c.tenant_id)throw new DataLinkError(ERROR_CODES.AUTHORIZATION_ERROR,"Entity provenance context invalid",{status:403});
 return this.r.insert("entities",{tenant_id:c.tenant_id,...input,version:input.version??1,status:"ACTIVE",created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 }
}
