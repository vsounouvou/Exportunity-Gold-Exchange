import { createHash, randomBytes } from "node:crypto";

import { db } from "@db";
import { agoojyeEngineeringNdaSessions } from "@db/schema";

export function hashEngineeringNdaSessionToken(rawToken: string) {
  return createHash("sha256")
    .update(String(rawToken || "").trim(), "utf8")
    .digest("hex");
}

export async function createEngineeringNdaSession(input: {
  tenantId: number;
  engineeringProfileId: number;
  userId: number;
  ttlHours?: number;
}) {
  const rawToken = randomBytes(32).toString("base64url");
  const ttlHours = Math.max(1, Math.min(48, Math.trunc(Number(input.ttlHours || 24))));
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await db.insert(agoojyeEngineeringNdaSessions).values({
    tenantId: Math.trunc(input.tenantId),
    engineeringProfileId: Math.trunc(input.engineeringProfileId),
    userId: Math.trunc(input.userId),
    tokenHash: hashEngineeringNdaSessionToken(rawToken),
    expiresAt,
  });
  return { token: rawToken, expiresAt };
}
