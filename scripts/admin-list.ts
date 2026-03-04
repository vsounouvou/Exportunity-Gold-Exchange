import { asc, eq, or, sql } from "drizzle-orm";
import { db } from "@db";
import { eceUsers } from "@db/schema";

async function main() {
  const admins = await db
    .select({
      id: eceUsers.id,
      email: eceUsers.email,
      displayName: eceUsers.displayName,
      role: eceUsers.role,
      roles: eceUsers.roles,
      permissions: eceUsers.permissions,
      isActive: eceUsers.isActive,
      currentMode: eceUsers.currentMode,
      lastLoginAt: eceUsers.lastLoginAt,
    })
    .from(eceUsers)
    .where(
      or(
        eq(eceUsers.role, "admin"),
        sql`${eceUsers.roles} ? 'admin'`,
        sql`${eceUsers.permissions} ? 'admin:*'`,
        sql`${eceUsers.permissions} ? '*'`,
      ),
    )
    .orderBy(asc(eceUsers.email));

  if (!admins.length) {
    console.log("[admin-list] No admin users found.");
    return;
  }

  console.log(`[admin-list] ${admins.length} admin user(s):`);
  for (const admin of admins) {
    const roles = Array.isArray(admin.roles) ? admin.roles.join(",") : "";
    const perms = Array.isArray(admin.permissions) ? admin.permissions.join(",") : "";
    console.log(
      `- id=${admin.id} email=${admin.email} name=${admin.displayName} active=${admin.isActive} roles=${roles} perms=${perms}`,
    );
  }
}

main().catch((err) => {
  console.error("[admin-list] Failed:", err);
  process.exit(1);
});
