import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@db";
import { eceUsers, userTenantRoles } from "@db/schema";
import { buildPasswordSetupLink, createPasswordSetupToken, resolvePasswordSetupBaseUrl } from "../server/lib/password-setup";
import { ensureTenants, getTenantByKey } from "../server/lib/tenants";

function arg(flag: string) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function truthy(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

async function main() {
  const email = String(process.env.ADMIN_EMAIL || arg("--email") || "").trim().toLowerCase();
  if (!email) throw new Error("Missing --email");

  const displayName = String(process.env.ADMIN_NAME || arg("--name") || "Maison Admin").trim();
  const password = String(process.env.ADMIN_PASSWORD || arg("--password") || `TmpMet!${Date.now()}Aa`).trim();
  const forceChange = truthy(process.env.ADMIN_MUST_CHANGE_PASSWORD ?? arg("--must-change") ?? "true");

  await ensureTenants();
  const tenant = await getTenantByKey("met");
  if (!tenant?.id) throw new Error("Tenant 'met' not found");
  await db.execute(sql`create extension if not exists pgcrypto;`);
  await db.execute(sql`
    create table if not exists password_setup_tokens (
      id uuid primary key default gen_random_uuid(),
      user_id integer not null references ece_users(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamp not null,
      used_at timestamp,
      created_at timestamp default now()
    );
  `);

  let existing = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing?.id) {
    const currentRoles = Array.isArray(existing.roles) ? (existing.roles as unknown[]).map(String) : [];
    const currentPerms = Array.isArray(existing.permissions) ? (existing.permissions as unknown[]).map(String) : [];
    const currentMetadata =
      existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    await db
      .update(eceUsers)
      .set({
        displayName: displayName || existing.displayName,
        passwordHash,
        role: "admin" as any,
        roles: uniq(["admin", ...currentRoles]) as any,
        permissions: uniq(["*", ...currentPerms]) as any,
        currentMode: "admin" as any,
        isActive: true,
        emailVerified: true,
        metadata: {
          ...currentMetadata,
          mustChangePassword: forceChange,
          metAdmin: true,
          updatedBy: "grant-met-admin",
          ...(forceChange ? { passwordResetAt: now.toISOString() } : {}),
        },
        updatedAt: now,
      })
      .where(eq(eceUsers.id, existing.id));
  } else {
    const [created] = await db
      .insert(eceUsers)
      .values({
        email,
        passwordHash,
        displayName,
        role: "admin" as any,
        roles: ["admin"] as any,
        permissions: ["*"] as any,
        currentMode: "admin" as any,
        buyerType: "retail" as any,
        isActive: true,
        emailVerified: true,
        metadata: {
          mustChangePassword: forceChange,
          metAdmin: true,
          createdBy: "grant-met-admin",
          ...(forceChange ? { passwordResetAt: now.toISOString() } : {}),
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    existing = created || null;
  }

  const user = existing || (await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) }));
  if (!user?.id) throw new Error(`Unable to provision user for ${email}`);

  await db
    .insert(userTenantRoles)
    .values({
      tenantId: Number(tenant.id),
      userId: Number(user.id),
      role: "TENANT_ADMIN",
      createdAt: now,
    })
    .onConflictDoNothing({
      target: [userTenantRoles.tenantId, userTenantRoles.userId, userTenantRoles.role],
    });

  const setup = await createPasswordSetupToken({
    userId: Number(user.id),
    ttlHours: Number.parseInt(String(process.env.ADMIN_SETUP_TTL_HOURS || arg("--ttl") || "24"), 10) || 24,
    invalidateExisting: false,
  });
  const setupLink = buildPasswordSetupLink(resolvePasswordSetupBaseUrl(), setup.rawToken);

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant: "met",
        email,
        userId: Number(user.id),
        grantedRole: "TENANT_ADMIN",
        setupLink,
        temporaryPasswordApplied: true,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[grant-met-admin] failed", error);
    process.exit(1);
  });
