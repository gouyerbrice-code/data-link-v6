import { createRequestContext } from "../core/request-context.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DataLinkError, ERROR_CODES, errorPayload } from "../core/errors.mjs";

export function createRouter({ config, logger, identityService = null, resolveAuthenticatedUser = null, pipelineService = null, profileService = null, matchingService = null, executionService = null }) {
  async function handle(request) {
    const url = new URL(request.url);
    const context = createRequestContext(Object.fromEntries(request.headers.entries()));

    try {
      if (request.method === "GET" && url.pathname === "/") {
        const html = await readFile(fileURLToPath(new URL("../../frontend/index.html", import.meta.url)), "utf8");
        return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "x-request-id": context.request_id } });
      }
      if (request.method === "GET" && url.pathname === "/config") {
        return json(200, { supabase_url: config.supabase.url, supabase_publishable_key: config.supabase.publishableKey }, context);
      }
      if (request.method === "GET" && url.pathname === "/platform") {
        return json(200, { name: config.app.name, version: config.version.product_version, engine_version: config.version.engine_version, status: "ready", modules: ["dashboard","imports","runs","matching","validation","master"] }, context);
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json(200, {
          status: "ok",
          service: config.app.name,
          request_id: context.request_id,
        }, context);
      }

      if (request.method === "GET" && url.pathname === "/ready") {
        return json(200, {
          status: "ready",
          service: config.app.name,
          environment: config.app.environment,
          request_id: context.request_id,
        }, context);
      }

      if (url.pathname.startsWith("/auth/") || url.pathname === "/tenants" ||
          url.pathname === "/bases" || url.pathname === "/companies" || url.pathname === "/groups") {
        if (!identityService || !resolveAuthenticatedUser) {
          throw new DataLinkError(
            ERROR_CODES.AUTHENTICATION_ERROR,
            "Identity authentication adapter is not configured",
            { status: 503 },
          );
        }

        const userId = await resolveAuthenticatedUser(request);
        const tenantId = request.headers.get("x-tenant-id");

        if (request.method === "GET" && url.pathname === "/auth/context") {
          return json(200, await identityService.getContext({ userId, tenantId }), context);
        }
        if (request.method === "GET" && url.pathname === "/tenants") {
          return json(200, await identityService.getTenants(userId), context);
        }
        if (request.method === "GET" && url.pathname === "/bases") {
          return json(200, await identityService.getBases(userId, requiredTenant(tenantId)), context);
        }
        if (request.method === "GET" && url.pathname === "/companies") {
          return json(200, await identityService.getCompanies(userId, requiredTenant(tenantId)), context);
        }
        if (request.method === "GET" && url.pathname === "/groups") {
          return json(200, await identityService.getGroups(userId, requiredTenant(tenantId)), context);
        }
      }

      if (identityService && resolveAuthenticatedUser && request.method === "GET" && ["/sources","/source-files","/profiles","/rules"].includes(url.pathname)) {
        const userId = await resolveAuthenticatedUser(request);
        const tenantId = request.headers.get("x-tenant-id");
        if (!tenantId) throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, "X-Tenant-Id is required", { status: 400 });
        await identityService.getContext({ userId, tenantId });
        if (url.pathname === "/sources") return json(200, await pipelineService.repository.findBy("sources", x => x.tenant_id === tenantId), context);
        if (url.pathname === "/source-files") return json(200, await pipelineService.repository.findBy("source_files", x => x.tenant_id === tenantId), context);
        if (url.pathname === "/profiles") return json(200, await profileService.list(), context);
        if (url.pathname === "/rules") return json(200, await pipelineService.repository.list("rules"), context);
      }

      if (pipelineService && identityService && resolveAuthenticatedUser && request.method === "GET") {
        const match = url.pathname.match(/^\/(raw|profiling|runs|entities)(?:\/([^/]+))?(?:\/steps)?$/);
        if (match) {
          const userId = await resolveAuthenticatedUser(request);
          const tenantId = request.headers.get("x-tenant-id");
          await identityService.getContext({ userId, tenantId });
          const kind = match[1], id = match[2];
          if (kind === "raw" && id) {
            const raw = await pipelineService.repository.find("raw_snapshots", id);
            if (!raw || raw.tenant_id !== tenantId) throw new DataLinkError(ERROR_CODES.NOT_FOUND, "RAW snapshot not found", {status:404});
            return json(200, raw, context);
          }
          if (kind === "profiling" && id) {
            const rows = await pipelineService.repository.findBy("profiling_results", x => x.run_id === id && x.tenant_id === tenantId);
            if (!rows.length) throw new DataLinkError(ERROR_CODES.NOT_FOUND, "Profiling result not found", {status:404});
            return json(200, rows[0], context);
          }
          if (kind === "runs" && id) {
            const run = await pipelineService.repository.find("runs", id);
            if (!run || run.tenant_id !== tenantId) throw new DataLinkError(ERROR_CODES.NOT_FOUND, "RUN not found", {status:404});
            if (url.pathname.endsWith("/steps")) return json(200, await pipelineService.repository.findBy("steps", x => x.run_id === id), context);
            return json(200, run, context);
          }
          if (kind === "entities" && id) {
            const entity = await pipelineService.repository.find("entities", id);
            if (!entity || entity.tenant_id !== tenantId) throw new DataLinkError(ERROR_CODES.NOT_FOUND, "Entity not found", {status:404});
            return json(200, entity, context);
          }
        }
      }

      if (pipelineService && identityService && resolveAuthenticatedUser && request.method === "POST" && url.pathname === "/sources") {
        const userId = await resolveAuthenticatedUser(request);
        const tenantId = request.headers.get("x-tenant-id");
        await identityService.getContext({ userId, tenantId });
        const body = await request.json();
        return json(201, await pipelineService.createSource({ user_id: userId, tenant_id: tenantId }, body), context);
      }

      if (matchingService && identityService && resolveAuthenticatedUser && request.method === "POST") {
        const executeMatch = url.pathname.match(/^\/runs\/([^/]+)\/matching$/);
        const decideMatch = url.pathname.match(/^\/matches\/([^/]+)\/decision$/);
        if (executeMatch || decideMatch) {
          const userId = await resolveAuthenticatedUser(request);
          const tenantId = requiredTenant(request.headers.get("x-tenant-id"));
          await identityService.getContext({ userId, tenantId });
          const body = await request.json();
          if (executeMatch) return json(201, await matchingService.execute({ user_id: userId, tenant_id: tenantId }, { ...body, runId: executeMatch[1] }), context);
          return json(201, await matchingService.decide({ user_id: userId, tenant_id: tenantId }, { ...body, matchId: decideMatch[1] }), context);
        }
      }

      if (executionService && identityService && resolveAuthenticatedUser && request.method === "POST") {
        const execute = url.pathname.match(/^\/source-files\/([^/]+)\/execute$/);
        if (execute) {
          const userId = await resolveAuthenticatedUser(request);
          const tenantId = requiredTenant(request.headers.get("x-tenant-id"));
          await identityService.getContext({ userId, tenantId });
          return json(201, await executionService.execute({ user_id: userId, tenant_id: tenantId }, { ...(await request.json()), sourceFileId: execute[1] }), context);
        }
      }


      if (pipelineService && executionService && matchingService && identityService && resolveAuthenticatedUser && request.method === "POST" && url.pathname === "/workflows/pmm-pmb") {
        const userId = await resolveAuthenticatedUser(request);
        const tenantId = requiredTenant(request.headers.get("x-tenant-id"));
        await identityService.getContext({ userId, tenantId });
        const form = await request.formData();
        const pmm = form.get("pmm");
        const pmb = form.get("pmb");
        if (!(pmm instanceof File) || !(pmb instanceof File)) throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, "PMM et PMB sont requis", {status:400});

        const now = new Date().toISOString();
        const job = await pipelineService.repository.insert("jobs", {
          tenant_id:tenantId, job_type:"PMM_PMB_WORKFLOW", status:"QUEUED", priority:100,
          idempotency_key:"pmm-pmb:"+Date.now()+":"+Math.random().toString(36).slice(2), created_at:now,
        });

        const run = async () => {
          try {
            await pipelineService.repository.update("jobs", job.id, {status:"RUNNING",started_at:new Date().toISOString()});
            const ingestOne = async (file, role) => {
              const sourceName = role === "PMB" ? "PMB — Référentiel" : "PMM — Source";
              const sources = await pipelineService.repository.findBy("sources", x => x.tenant_id === tenantId && x.name === sourceName);
              const source = sources[0] ?? await pipelineService.createSource({user_id:userId,tenant_id:tenantId},{name:sourceName,source_type:"FILE",metadata:{role,workflow:"PMM_PMB"}});
              const buffer = Buffer.from(await file.arrayBuffer());
              const ing = await pipelineService.ingestFile({user_id:userId,tenant_id:tenantId},{
                source_id:source.id,filename:file.name,mime_type:file.type||"application/octet-stream",buffer,
                metadata:{role,workflow:"PMM_PMB"},idempotency_key:job.id+":"+role+":"+file.name,
              });
              if (!ing.duplicate) ing.raw_snapshot = await pipelineService.createRawSnapshot({user_id:userId,tenant_id:tenantId},{
                source_file_id:ing.source_file.id,buffer,filename:file.name,mime_type:file.type||"application/octet-stream",
              });
              return ing.source_file;
            };

            const pmbFile = await ingestOne(pmb,"PMB");
            const pmmFile = await ingestOne(pmm,"PMM");
            const config = {
              entity_type:"ARTICLE",
              identity_fields:["Référence","Gencode","Réf Fourn"],
              field_rules:Object.fromEntries(["Référence","Gencode","Réf Fourn","Désignation","C.Fourn","Nom Fournisseur"].map(k=>[k,["trim","collapse_whitespace"]])),
            };
            const pmbExec = await executionService.execute({user_id:userId,tenant_id:tenantId},{sourceFileId:pmbFile.id,configuration:config});
            const pmmExec = await executionService.execute({user_id:userId,tenant_id:tenantId},{sourceFileId:pmmFile.id,configuration:config});
            const canonicalIds = pmbExec.entities.map(x=>x.id);
            const sourceIds = pmmExec.entities.map(x=>x.id);
            const match = await matchingService.execute({user_id:userId,tenant_id:tenantId},{
              runId:pmmExec.run.id,sourceEntityIds:sourceIds,canonicalEntityIds:canonicalIds,
              fields:{reference:"Référence",barcode:"Gencode",supplier_reference:"Réf Fourn",designation:"Désignation"},
              maxCandidates:50,scope:"GROUP",
            });
            await pipelineService.repository.update("jobs",job.id,{status:"COMPLETED",finished_at:new Date().toISOString(),request_fingerprint:JSON.stringify({pmm:pmmFile.id,pmb:pmbFile.id,pmm_run:pmmExec.run.id,pmb_run:pmbExec.run.id,matches:match.matches.length})});
          } catch (error) {
            await pipelineService.repository.update("jobs",job.id,{status:"FAILED",finished_at:new Date().toISOString(),error:{message:error.message,code:error.code??"WORKFLOW_ERROR"}});
          }
        };
        setImmediate(run);
        return json(202,{workflow_id:job.id,status:"QUEUED",message:"Analyse PMM / PMB lancée"},context);
      }

      if (pipelineService && identityService && resolveAuthenticatedUser && request.method === "POST" && url.pathname === "/ingestion/files") {
        const userId = await resolveAuthenticatedUser(request);
        const tenantId = request.headers.get("x-tenant-id");

        await identityService.getContext({ userId, tenantId });

        const contentType = request.headers.get("content-type") ?? "";

        if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
          throw new DataLinkError(
            ERROR_CODES.VALIDATION_ERROR,
            "multipart/form-data is required",
            { status:400 },
          );
        }

        let form;

        try {
          form = await request.formData();
        } catch {
          throw new DataLinkError(
            ERROR_CODES.VALIDATION_ERROR,
            "Invalid multipart/form-data payload",
            { status:400 },
          );
        }

        const file = form.get("file");
        const sourceId = form.get("source_id");
        const metadataValue = form.get("metadata");
        const idempotencyKey = request.headers.get("idempotency-key");

        if (!(file instanceof File)) {
          throw new DataLinkError(
            ERROR_CODES.VALIDATION_ERROR,
            "file is required",
            { status:400 },
          );
        }

        if (typeof sourceId !== "string" || !sourceId.trim()) {
          throw new DataLinkError(
            ERROR_CODES.VALIDATION_ERROR,
            "source_id is required",
            { status:400 },
          );
        }

        let metadata = {};

        if (metadataValue) {
          try {
            metadata = JSON.parse(String(metadataValue));
          } catch {
            throw new DataLinkError(
              ERROR_CODES.VALIDATION_ERROR,
              "metadata must be valid JSON",
              { status:400 },
            );
          }
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        const ingestion = await pipelineService.ingestFile(
          { user_id:userId, tenant_id:tenantId },
          {
            source_id:sourceId,
            filename:file.name,
            mime_type:file.type || "application/octet-stream",
            buffer,
            metadata,
            idempotency_key:idempotencyKey,
          },
        );
        if (!ingestion.duplicate) {
          ingestion.raw_snapshot = await pipelineService.createRawSnapshot(
            { user_id:userId, tenant_id:tenantId },
            {
              source_file_id:ingestion.source_file.id,
              buffer,
              filename:file.name,
              mime_type:file.type || "application/octet-stream",
            },
          );
        }
        return json(201, ingestion, context);
      }

      return json(404, {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: "Route not found",
          request_id: context.request_id,
        },
      }, context);
    } catch (error) {
      logger.error("api.request_failed", {
        request_id: context.request_id,
        module: "api",
        error_code: error?.code,
      });
      return json(error?.status ?? 500, errorPayload(error, context.request_id), context);
    }
  }

  return { handle };
}

function requiredTenant(value) {
  if (!value) {
    throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, "X-Tenant-Id is required", { status: 400 });
  }
  return value;
}

function csvCell(value) {
  return '"' + String(value ?? "").replaceAll('"','""').replaceAll("\r"," ").replaceAll("\n"," ") + '"';
}

function json(status, body, context) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": context.request_id,
    },
  });
}
