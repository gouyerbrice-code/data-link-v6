export class IdentityRepository {
  constructor({ supabase }) {
    if (!supabase?.client) throw new Error("IdentityRepository requires a Supabase adapter");
    this.supabase = supabase.client;
  }

  async getTenantMembershipsForUser(userId) {
    const { data, error } = await this.supabase
      .from("v6_tenant_memberships")
      .select("id, tenant_id, user_id, role_id, status, created_at, updated_at")
      .eq("user_id", userId);

    if (error) throw error;
    return data ?? [];
  }

  async getTenantsForUser(userId) {
    const { data, error } = await this.supabase
      .from("v6_tenant_memberships")
      .select("tenant:v6_tenants(id,name,slug,status), role:v6_roles(id,code,name), status")
      .eq("user_id", userId);

    if (error) throw error;
    return data ?? [];
  }

  async getBasesForTenant(tenantId) {
    const { data, error } = await this.supabase
      .from("v6_bases")
      .select("id,tenant_id,name,slug,status,created_at,updated_at")
      .eq("tenant_id", tenantId);

    if (error) throw error;
    return data ?? [];
  }

  async getCompaniesForTenant(tenantId) {
    const { data, error } = await this.supabase
      .from("v6_companies")
      .select("id,tenant_id,name,external_reference,status,created_at,updated_at")
      .eq("tenant_id", tenantId);

    if (error) throw error;
    return data ?? [];
  }

  async getGroupsForTenant(tenantId) {
    const { data, error } = await this.supabase
      .from("v6_groups")
      .select("id,tenant_id,name,status,created_at,updated_at")
      .eq("tenant_id", tenantId);

    if (error) throw error;
    return data ?? [];
  }
}
