import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@db";
import { eceUsers } from "@db/schema";

function getArgValue(flag: string) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function uniqStrings(values: unknown[]): string[] {
  const out = new Set<string>();
  values.forEach((v) => {
    if (typeof v === "string" && v.trim()) out.add(v);
  });
  return Array.from(out);
}

function normalizeMetadata(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function truthy(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value ?? "").trim().toLowerCase());
}

async function main() {
  const email = String(process.env.ADMIN_EMAIL || getArgValue("--email") || "")
    .trim()
    .toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || getArgValue("--password") || "");
  const displayName = String(
    process.env.ADMIN_DISPLAY_NAME || getArgValue("--name") || "Admin",
  ).trim();
  const shouldForcePasswordChange = truthy(process.env.ADMIN_MUST_CHANGE_PASSWORD ?? "true");

  if (!email || !password) {
    console.error("Missing ADMIN_EMAIL/ADMIN_PASSWORD (or --email/--password).");
    process.exit(1);
  }

  const existing = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.email, email),
  });

  const passwordHash = await bcrypt.hash(password, 10);
  const nowIso = new Date().toISOString();

  if (existing) {
    const existingRoles = Array.isArray((existing as any).roles) ? (existing as any).roles : [];
    const existingPerms = Array.isArray((existing as any).permissions) ? (existing as any).permissions : [];
    const existingMetadata = normalizeMetadata((existing as any).metadata);

    await db
      .update(eceUsers)
      .set({
        passwordHash,
        displayName: displayName || existing.displayName,
        role: "admin",
        roles: uniqStrings(["admin", ...existingRoles]) as any,
        permissions: uniqStrings(["*", ...existingPerms]) as any,
        currentMode: "admin" as any,
        isActive: true,
        emailVerified: true,
        metadata: {
          ...existingMetadata,
          mustChangePassword: shouldForcePasswordChange,
          ...(shouldForcePasswordChange ? { passwordResetAt: nowIso } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(eceUsers.id, existing.id));

    console.log(`[admin-bootstrap] Updated existing user to admin: ${email}`);
    return;
  }

  await db.insert(eceUsers).values({
    email,
    passwordHash,
    displayName,
    role: "admin",
    roles: ["admin"] as any,
    permissions: ["*"] as any,
    isActive: true,
    emailVerified: true,
    currentMode: "admin" as any,
    buyerType: "retail" as any,
    metadata: {
      bootstrap: true,
      mustChangePassword: shouldForcePasswordChange,
      ...(shouldForcePasswordChange ? { passwordResetAt: nowIso } : {}),
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`[admin-bootstrap] Created admin user: ${email}`);
}

main().catch((err) => {
  console.error("[admin-bootstrap] Failed:", err);
  process.exit(1);
});
