import { DataLinkError, ERROR_CODES } from "../../core/errors.mjs";

export class IdentityService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async getContext({ userId, tenantId = null }) {
    if (!userId) {
      throw new DataLinkError(ERROR_CODES.AUTHENTICATION_ERROR, "Authenticated user is required", { status: 401 });
    }

    const memberships = await this.repository.getTenantsForUser(userId);

    if (!tenantId) {
      return {
        user_id: userId,
        tenant_id: null,
        membership: null,
        tenants: memberships,
      };
    }

    const membership = memberships.find(
      (item) => item.tenant?.id === tenantId && item.status === "ACTIVE",
    );

    if (!membership) {
      throw new DataLinkError(
        ERROR_CODES.TENANT_ACCESS_ERROR,
        "User has no active membership for the requested tenant",
        { status: 403 },
      );
    }

    return {
      user_id: userId,
      tenant_id: tenantId,
      membership,
      tenants: memberships,
    };
  }

  async getTenants(userId) {
    return this.repository.getTenantsForUser(userId);
  }

  async getBases(userId, tenantId) {
    await this.getContext({ userId, tenantId });
    return this.repository.getBasesForTenant(tenantId);
  }

  async getCompanies(userId, tenantId) {
    await this.getContext({ userId, tenantId });
    return this.repository.getCompaniesForTenant(tenantId);
  }

  async getGroups(userId, tenantId) {
    await this.getContext({ userId, tenantId });
    return this.repository.getGroupsForTenant(tenantId);
  }
}
