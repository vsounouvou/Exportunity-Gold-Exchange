import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@db";
import { eceUsers } from "@db/schema";

function getArgValue(flag: string) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function normalizeMetadata(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

async function main() {
  const email = String(process.env.ADMIN_EMAIL || getArgValue("--email") || "")
    .trim()
    .toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || getArgValue("--password") || "");

  if (!email || !password) {
    console.error("Missing ADMIN_EMAIL/ADMIN_PASSWORD (or --email/--password).");
    process.exit(1);
  }

  const existing = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.email, email),
  });

  if (!existing) {
    console.error(`[admin-reset-password] No user found for ${email}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existingMetadata = normalizeMetadata((existing as any).metadata);
  const nowIso = new Date().toISOString();
  await db
    .update(eceUsers)
    .set({
      passwordHash,
      metadata: { ...existingMetadata, mustChangePassword: true, passwordResetAt: nowIso },
      updatedAt: new Date(),
    })
    .where(eq(eceUsers.id, existing.id));

  console.log(`[admin-reset-password] Updated password for ${email}`);
}

main().catch((err) => {
  console.error("[admin-reset-password] Failed:", err);
  process.exit(1);
});
