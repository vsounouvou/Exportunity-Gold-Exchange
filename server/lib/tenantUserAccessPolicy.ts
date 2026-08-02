export type TenantMembership = {
  tenantId: number;
  role: string;
};

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function addUnique(values: string[], value: string) {
  if (!values.some((entry) => entry.toLowerCase() === value.toLowerCase())) values.push(value);
}

/**
 * Projects tenant-scoped authority into an in-memory session identity. It does
 * not mutate the account record: membership remains the source of truth.
 */
export function applyTenantMembershipAccess<T extends Record<string, any>>(
  user: T,
  memberships: TenantMembership[],
  tenantId?: number,
): T {
  const allMemberships = memberships.map((membership) => ({
    tenantId: Number(membership.tenantId),
    role: String(membership.role || "").trim().toUpperCase(),
  }));
  const scopedMemberships = Number.isFinite(Number(tenantId)) && Number(tenantId) > 0
    ? allMemberships.filter((membership) => membership.tenantId === Number(tenantId))
    : [];
  const isSuperAdmin = allMemberships.some((membership) => membership.role === "SUPER_ADMIN");
  const isTenantAdmin = scopedMemberships.some((membership) => membership.role === "TENANT_ADMIN");

  if (!isSuperAdmin && !isTenantAdmin) return user;

  const roles = asStringArray(user.roles);
  const permissions = asStringArray(user.permissions);
  addUnique(roles, "admin");
  if (isSuperAdmin) addUnique(roles, "super admin");
  addUnique(permissions, "admin:*");

  return {
    ...user,
    role: "admin",
    roles,
    permissions,
    currentMode: "admin",
  } as T;
}
