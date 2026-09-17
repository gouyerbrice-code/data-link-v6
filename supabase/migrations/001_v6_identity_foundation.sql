-- DATA LINK V6 — P1 Identity Foundation
-- [PROPOSITION V6]
-- This migration is intentionally limited to identity/context foundations.
-- Full authorization/RLS is P2.
--
-- V5 reference concepts observed: tenants, tenant memberships, roles,
-- bases, companies and groups. V6 does not copy V5 migrations.

create extension if not exists pgcrypto;

create table if not exists public.v6_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v6_roles_code_nonempty check (length(trim(code)) > 0)
);

create table if not exists public.v6_permissions (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  action text not null,
  description text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v6_permissions_resource_nonempty check (length(trim(resource)) > 0),
  constraint v6_permissions_action_nonempty check (length(trim(action)) > 0),
  constraint v6_permissions_resource_action_unique unique (resource, action)
);

create table if not exists public.v6_role_permissions (
  role_id uuid not null references public.v6_roles(id) on delete restrict,
  permission_id uuid not null references public.v6_permissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.v6_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v6_tenants_name_nonempty check (length(trim(name)) > 0),
  constraint v6_tenants_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

create table if not exists public.v6_tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  user_id uuid not null,
  role_id uuid not null references public.v6_roles(id) on delete restrict,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'INVITED', 'REMOVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v6_tenant_memberships_tenant_user_unique unique (tenant_id, user_id)
);

create table if not exists public.v6_bases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  name text not null,
  slug text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v6_bases_name_nonempty check (length(trim(name)) > 0),
  constraint v6_bases_tenant_slug_unique unique (tenant_id, slug),
  constraint v6_bases_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

create table if not exists public.v6_companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  name text not null,
  external_reference text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v6_companies_name_nonempty check (length(trim(name)) > 0)
);

create unique index if not exists v6_companies_tenant_external_reference_uq
  on public.v6_companies (tenant_id, external_reference)
  where external_reference is not null;

create table if not exists public.v6_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v6_tenants(id) on delete restrict,
  name text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  constraint v6_groups_name_nonempty check (length(trim(name)) > 0),
  constraint v6_groups_tenant_name_unique unique (tenant_id, name)
);

create table if not exists public.v6_group_companies (
  group_id uuid not null references public.v6_groups(id) on delete restrict,
  company_id uuid not null references public.v6_companies(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (group_id, company_id)
);

create index if not exists v6_memberships_user_idx
  on public.v6_tenant_memberships (user_id);

create index if not exists v6_memberships_tenant_idx
  on public.v6_tenant_memberships (tenant_id);

create index if not exists v6_bases_tenant_idx
  on public.v6_bases (tenant_id);

create index if not exists v6_companies_tenant_idx
  on public.v6_companies (tenant_id);

create index if not exists v6_groups_tenant_idx
  on public.v6_groups (tenant_id);

create index if not exists v6_group_companies_company_idx
  on public.v6_group_companies (company_id);

-- Seed only the four role concepts already observed in V5.
insert into public.v6_roles (code, name)
values
  ('OWNER', 'Owner'),
  ('ADMIN', 'Administrator'),
  ('REVIEWER', 'Reviewer'),
  ('USER', 'User')
on conflict (code) do nothing;

-- P1 mechanism only: no complete business permission matrix.
insert into public.v6_permissions (resource, action, description)
values
  ('tenant', 'read', 'Read tenant context'),
  ('base', 'read', 'Read base context'),
  ('company', 'read', 'Read company context'),
  ('group', 'read', 'Read group context')
on conflict (resource, action) do nothing;

-- Deliberately no role-permission assignments here.
-- Complete authorization matrix is P2.
