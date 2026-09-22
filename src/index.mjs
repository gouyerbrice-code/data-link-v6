import { createHttpServer } from "./api/server.mjs";
import { loadConfig } from "./core/configuration.mjs";
import { createLogger } from "./core/logger.mjs";
import { createSupabaseAdapter } from "./infrastructure/supabase/client.mjs";
import { IdentityRepository } from "./identity/repository/identity-repository.mjs";
import { IdentityService } from "./identity/service/identity-service.mjs";
import { SupabasePipelineRepository } from "./pipeline/supabase-repository.mjs";
import { PipelineService } from "./ingestion/pipeline-service.mjs";
import { PrivateLocalStorage } from "./storage/local-storage.mjs";
import { ProfileService } from "./profiles/profile-service.mjs";
import { RunService } from "./runs/run-service.mjs";
import { PipelineExecutionService } from "./pipeline/execution-service.mjs";
import { SupabaseMatchingRepository } from "./matching/supabase-matching-repository.mjs";
import { MatchingService } from "./matching/matching-service.mjs";
import { VERSION } from "./core/version.mjs";

const config=loadConfig();
const logger=createLogger({level:config.logging.level,environment:config.app.environment});
const supabase=createSupabaseAdapter({url:config.supabase.url,secretKey:config.supabase.secretKey});
const identityRepository=new IdentityRepository({supabase});
const identityService=new IdentityService({repository:identityRepository});
const pipelineRepository=new SupabasePipelineRepository({supabase});
const matchingRepository=new SupabaseMatchingRepository({supabase});
const storage=new PrivateLocalStorage({root:process.env.DATALINK_STORAGE_ROOT??"./.datalink-storage"});
const pipelineService=new PipelineService({repository:pipelineRepository,storage,securityContext:{},versions:VERSION});
const profileService=new ProfileService({repository:pipelineRepository});
const runService=new RunService({repository:pipelineRepository,versions:VERSION});
const executionService=new PipelineExecutionService({repository:pipelineRepository,runService,profileService,versions:VERSION});
const matchingService=new MatchingService({repository:matchingRepository});

const server=createHttpServer({
  config,logger,identityService,
  resolveAuthenticatedUser:(request)=>supabase.getUser(request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")),
  pipelineService,profileService,matchingService,executionService,
});
server.listen(config.app.port,config.app.host,()=>logger.info("runtime.started",{module:"runtime",service:config.app.name,host:config.app.host,port:config.app.port,product_version:config.version.product_version}));
