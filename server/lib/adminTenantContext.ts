import type { Request } from "express";
import { eq } from "drizzle-orm";

import { db } from "@db";
import { eceSessions, eceUsers, tenants } from "@db/schema";

type ActiveTenantContext = {
  tenantId: number;
  updatedAt: number;
};

const activeTenantBySessionToken = new Map<string, ActiveTenantContext>();

function normalizeRoleLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/["'’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isChairmanUser(user: any): boolean {
  const role = typeof user?.role === "string" ? user.role : "";
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const candidates = [role, ...roles].map((entry) => normalizeRoleLabel(String(entry || "")));
  return candidates.some(
    (entry) =>
      entry === "chairman assistant" ||
      entry === "chairmans assistant" ||
      entry === "terminal assistant" ||
      entry === "chairman",
  );
}

function readBearerToken(req: Request) {
  const raw = String(req.headers.authorization || "").trim();
  if (!raw) return null;
  return raw.replace(/^Bearer\s+/i, "").trim() || null;
}

async function resolveSessionUser(token: string | null) {
  if (!token) return null;
  const session = await db.query.eceSessions.findFirst({
    where: eq(eceSessions.token, token),
  });
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  return db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, session.userId),
  });
}

export function setSessionActiveTenant(token: string, tenantId: number) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return;
  activeTenantBySessionToken.set(normalizedToken, {
    tenantId: Number(tenantId),
    updatedAt: Date.now(),
  });
}

export function clearSessionActiveTenant(token: string | null | undefined) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return;
  activeTenantBySessionToken.delete(normalizedToken);
}

export function getSessionActiveTenantId(token: string | null | undefined) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return null;
  const ctx = activeTenantBySessionToken.get(normalizedToken);
  if (!ctx || !Number.isFinite(ctx.tenantId) || ctx.tenantId <= 0) return null;
  return Number(ctx.tenantId);
}

function pathSupportsAdminTenantOverride(pathname: string) {
  const path = String(pathname || "").toLowerCase();
  if (!path.startsWith("/api/")) return false;
  return (
    path.startsWith("/api/admin") ||
    path.startsWith("/api/v2/") ||
    path === "/api/v2" ||
    path.startsWith("/api/agent-economy") ||
    path.startsWith("/api/notifications") ||
    path.startsWith("/api/actions")
  );
}

export async function resolveActiveTenantForRequest(req: Request) {
  if (!pathSupportsAdminTenantOverride(req.path)) return null;
  const token = readBearerToken(req);
  const activeTenantId = getSessionActiveTenantId(token);
  if (!activeTenantId) return null;

  const user = await resolveSessionUser(token);
  if (!user || !isChairmanUser(user)) {
    clearSessionActiveTenant(token);
    return null;
  }

  const targetTenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, activeTenantId),
  });

  if (!targetTenant) {
    clearSessionActiveTenant(token);
    return null;
  }

  return targetTenant;
}
