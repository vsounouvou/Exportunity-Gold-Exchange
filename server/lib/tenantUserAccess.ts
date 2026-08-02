import { eq } from "drizzle-orm";

import { db } from "@db";
import { userTenantRoles } from "@db/schema";
import { applyTenantMembershipAccess } from "./tenantUserAccessPolicy";

export { applyTenantMembershipAccess } from "./tenantUserAccessPolicy";

export async function hydrateTenantUserAccess<T extends Record<string, any>>(
  user: T | null | undefined,
  tenantId?: number,
): Promise<T | null> {
  if (!user || !Number.isFinite(Number(user.id)) || Number(user.id) <= 0) return null;

  const memberships = await db.query.userTenantRoles.findMany({
    where: eq(userTenantRoles.userId, Number(user.id)),
    columns: {
      tenantId: true,
      role: true,
    },
  });

  return applyTenantMembershipAccess(user, memberships, tenantId);
}
