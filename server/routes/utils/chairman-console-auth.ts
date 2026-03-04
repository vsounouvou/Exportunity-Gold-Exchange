import { db } from "@db";
import { eceSessions, eceUsers } from "@db/schema";
import { eq } from "drizzle-orm";
import { resolveQuickSession } from "../../lib/chairman-quick-tokens";

type ConsoleActorResult =
  | { ok: true; user: any; via: "quick" | "session"; adminOverride: boolean }
  | { ok: false; status: 401 | 403; message: string };

function normalizeRoleLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRole(user: any, target: string) {
  const role = typeof user?.role === "string" ? normalizeRoleLabel(user.role) : "";
  const roles = Array.isArray(user?.roles) ? user.roles.map((r: any) => normalizeRoleLabel(String(r))) : [];
  return role === target || roles.includes(target);
}

function isChairmanUser(user: any) {
  if (!user) return false;
  if (hasRole(user, "chairman")) return true;
  if (hasRole(user, "chairman assistant")) return true;
  if (hasRole(user, "chairman_assistant")) return true;
  if (hasRole(user, "terminal assistant")) return true;
  if (hasRole(user, "chairman assistant")) return true;
  return false;
}

function isAdminUser(user: any) {
  if (!user) return false;
  const mode = String(user?.currentMode || "").trim().toLowerCase();
  const roles = Array.isArray(user?.roles) ? user.roles.map((r: any) => normalizeRoleLabel(String(r))) : [];
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  return (
    mode === "admin" ||
    perms.includes("*") ||
    perms.includes("admin:*") ||
    roles.includes("admin") ||
    roles.includes("super admin") ||
    roles.includes("platform admin")
  );
}

function getBearerToken(req: any) {
  const header = req.headers?.authorization;
  if (typeof header !== "string") return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^Bearer\s+/i, "");
}

function adminOverrideRequested(req: any) {
  const header = String(req.headers?.["x-chairman-admin-override"] || "").trim();
  const query = String(req.query?.admin_override || req.query?.adminOverride || "").trim();
  return header === "1" || header.toLowerCase() === "true" || query === "1" || query.toLowerCase() === "true";
}

async function resolveSessionUser(token?: string) {
  if (!token) return null;
  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
  return user ?? null;
}

export async function resolveChairmanConsoleActor(
  req: any,
  options: { allowAdminOverride?: boolean } = {},
): Promise<ConsoleActorResult> {
  const tenantId = Number(req?.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return { ok: false, status: 401, message: "Tenant not resolved" };
  }

  const quickSession = String(req.headers?.["x-chairman-quick-session"] || "").trim();
  if (quickSession) {
    const resolved = await resolveQuickSession({ tenantId, sessionToken: quickSession });
    if (!resolved) return { ok: false, status: 401, message: "Quick session invalid" };
    return { ok: true, user: resolved.user, via: "quick", adminOverride: false };
  }

  const token = getBearerToken(req);
  const user = await resolveSessionUser(token);
  if (!user) return { ok: false, status: 401, message: "Authentication required" };

  if (isChairmanUser(user)) {
    return { ok: true, user, via: "session", adminOverride: false };
  }

  if (options.allowAdminOverride && adminOverrideRequested(req) && isAdminUser(user)) {
    return { ok: true, user, via: "session", adminOverride: true };
  }

  return { ok: false, status: 403, message: "Chairman access required" };
}
