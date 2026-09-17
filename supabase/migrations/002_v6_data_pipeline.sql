-- DATA LINK V6 — 6C Data Pipeline
-- [PROPOSITION V6] Pipeline persistence. Full authorization/RLS remains P2.
create table if not exists public.v6_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  name text not null,
  source_type text not null check (source_type in ('FILE','SYSTEM','IMPORT','API','ERP')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v6_sources_tenant_id_unique unique (tenant_id, id)
);

create table if not exists public.v6_source_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  source_id uuid not null references public.v6_sources(id) on delete restrict,
  original_name text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text,
  extension text,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'RECEIVED' check (status in ('RECEIVED','VERIFIED','REJECTED','PROCESSED','FAILED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, checksum_sha256),
  constraint v6_source_files_tenant_id_unique unique (tenant_id, id)
);

create table if not exists public.v6_source_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  source_file_id uuid not null references public.v6_source_files(id) on delete restrict,
  storage_provider text not null,
  storage_key text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, storage_provider, storage_key, version)
);

create table if not exists public.v6_raw_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  source_file_id uuid not null references public.v6_source_files(id) on delete restrict,
  snapshot_version integer not null,
  record_count integer not null default 0 check (record_count >= 0),
  schema_hash text,
  parser_version text not null,
  status text not null default 'CREATED' check (status in ('CREATED','COMPLETE','FAILED')),
  created_at timestamptz not null default now(),
  unique (source_file_id, snapshot_version),
  constraint v6_raw_snapshots_tenant_id_unique unique (tenant_id, id)
);

create table if not exists public.v6_raw_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  snapshot_id uuid not null references public.v6_raw_snapshots(id) on delete restrict,
  record_number integer not null check (record_number > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (snapshot_id, record_number)
);

create table if not exists public.v6_profiles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  entity_type text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v6_profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.v6_profiles(id) on delete restrict,
  version integer not null check (version > 0),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, version)
);

create table if not exists public.v6_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v6_rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.v6_rules(id) on delete restrict,
  version integer not null check (version > 0),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (rule_id, version)
);

create table if not exists public.v6_synonyms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.v6_tenants(id) on delete restrict,
  profile_id uuid references public.v6_profiles(id) on delete restrict,
  source_value text not null,
  normalized_value text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.v6_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  source_file_id uuid references public.v6_source_files(id) on delete restrict,
  job_type text not null,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  priority integer not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error jsonb,
  unique (tenant_id, idempotency_key),
  constraint v6_jobs_tenant_id_unique unique (tenant_id, id)
);

create table if not exists public.v6_runs (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique,
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  job_id uuid not null references public.v6_processing_jobs(id) on delete restrict,
  mission_id uuid,
  engine_mode text not null default 'V6_NATIVE',
  engine_version text not null,
  profile_version_id uuid references public.v6_profile_versions(id) on delete restrict,
  rule_version_id uuid references public.v6_rule_versions(id) on delete restrict,
  configuration_version text,
  configuration_hash text,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  worker text,
  heartbeat_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  statistics jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint v6_runs_tenant_id_unique unique (tenant_id, id)
);

create table if not exists public.v6_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.v6_runs(id) on delete restrict,
  step_type text not null,
  sequence integer not null check (sequence > 0),
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED','CANCELLED')),
  idempotency_key text not null,
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  started_at timestamptz,
  finished_at timestamptz,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, sequence),
  unique (run_id, idempotency_key)
);

create table if not exists public.v6_profiling_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  run_id uuid not null references public.v6_runs(id) on delete restrict,
  raw_snapshot_id uuid not null references public.v6_raw_snapshots(id) on delete restrict,
  domain text not null,
  confidence text not null check (confidence in ('HIGH','MEDIUM','LOW')),
  row_count integer not null default 0,
  column_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.v6_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  entity_type text not null,
  base_id uuid references public.v6_bases(id) on delete restrict,
  company_id uuid references public.v6_companies(id) on delete restrict,
  group_id uuid references public.v6_groups(id) on delete restrict,
  source_id uuid not null references public.v6_sources(id) on delete restrict,
  source_file_id uuid not null references public.v6_source_files(id) on delete restrict,
  source_record_id uuid not null references public.v6_raw_records(id) on delete restrict,
  run_id uuid not null references public.v6_runs(id) on delete restrict,
  normalized_payload jsonb not null default '{}'::jsonb,
  identity_payload jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUPERSEDED','INVALID')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, source_record_id, version)
);

alter table public.v6_source_files
  add constraint v6_source_files_source_tenant_fk
  foreign key (tenant_id, source_id) references public.v6_sources(tenant_id, id) on delete restrict;

alter table public.v6_source_artifacts
  add constraint v6_artifacts_file_tenant_fk
  foreign key (tenant_id, source_file_id) references public.v6_source_files(tenant_id, id) on delete restrict;

alter table public.v6_raw_snapshots
  add constraint v6_raw_snapshots_file_tenant_fk
  foreign key (tenant_id, source_file_id) references public.v6_source_files(tenant_id, id) on delete restrict;

alter table public.v6_raw_records
  add constraint v6_raw_records_snapshot_tenant_fk
  foreign key (tenant_id, snapshot_id) references public.v6_raw_snapshots(tenant_id, id) on delete restrict;

alter table public.v6_processing_jobs
  add constraint v6_jobs_file_tenant_fk
  foreign key (tenant_id, source_file_id) references public.v6_source_files(tenant_id, id) on delete restrict;

alter table public.v6_profiling_results
  add constraint v6_profiling_raw_tenant_fk
  foreign key (tenant_id, raw_snapshot_id) references public.v6_raw_snapshots(tenant_id, id) on delete restrict;

alter table public.v6_entities
  add constraint v6_entities_source_tenant_fk
  foreign key (tenant_id, source_id) references public.v6_sources(tenant_id, id) on delete restrict,
  add constraint v6_entities_file_tenant_fk
  foreign key (tenant_id, source_file_id) references public.v6_source_files(tenant_id, id) on delete restrict,
  add constraint v6_entities_record_tenant_fk
  foreign key (tenant_id, source_record_id) references public.v6_raw_records(tenant_id, id) on delete restrict,
  add constraint v6_entities_run_tenant_fk
  foreign key (tenant_id, run_id) references public.v6_runs(tenant_id, id) on delete restrict,
  add constraint v6_entities_base_tenant_fk
  foreign key (tenant_id, base_id) references public.v6_bases(tenant_id, id) on delete restrict,
  add constraint v6_entities_company_tenant_fk
  foreign key (tenant_id, company_id) references public.v6_companies(tenant_id, id) on delete restrict,
  add constraint v6_entities_group_tenant_fk
  foreign key (tenant_id, group_id) references public.v6_groups(tenant_id, id) on delete restrict;

create index if not exists v6_source_files_tenant_source_idx on public.v6_source_files(tenant_id, source_id);
create index if not exists v6_artifacts_tenant_file_idx on public.v6_source_artifacts(tenant_id, source_file_id);
create index if not exists v6_raw_snapshots_file_idx on public.v6_raw_snapshots(source_file_id, snapshot_version);
create index if not exists v6_raw_records_snapshot_idx on public.v6_raw_records(snapshot_id, record_number);
create index if not exists v6_jobs_tenant_status_idx on public.v6_processing_jobs(tenant_id, status);
create index if not exists v6_runs_tenant_status_idx on public.v6_runs(tenant_id, status);
create index if not exists v6_run_steps_run_sequence_idx on public.v6_run_steps(run_id, sequence);
create index if not exists v6_profiling_tenant_idx on public.v6_profiling_results(tenant_id);
create index if not exists v6_entities_tenant_type_idx on public.v6_entities(tenant_id, entity_type);
create index if not exists v6_entities_source_record_idx on public.v6_entities(source_record_id);

-- Seed only generic profile mechanism; no domain matching logic.
insert into public.v6_profiles(code, name, entity_type)
values ('GENERIC','Generic data','GENERIC')
on conflict (code) do nothing;

insert into public.v6_profile_versions(profile_id, version, configuration)
select id, 1, '{}'::jsonb from public.v6_profiles where code='GENERIC'
on conflict (profile_id, version) do nothing;
