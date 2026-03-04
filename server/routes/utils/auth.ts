import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@db";
import { eceSessions, eceUsers } from "@db/schema";
import { eq } from "drizzle-orm";

function normalizeRoleLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/["'’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TERMINAL_ASSISTANT_ALIASES = new Set(["terminal assistant", "chairman assistant", "chairmans assistant"]);

function hasTerminalAssistantRole(user: any): boolean {
  const role = typeof user?.role === "string" ? user.role : "";
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const candidates = [role, ...roles].filter(Boolean).map((r) => normalizeRoleLabel(String(r)));
  return candidates.some((candidate) => TERMINAL_ASSISTANT_ALIASES.has(candidate));
}

export function isTerminalAssistantUser(user: any): boolean {
  return hasTerminalAssistantRole(user);
}

export function isChairmanAssistantUser(user: any): boolean {
  // Backward-compatible alias.
  return hasTerminalAssistantRole(user);
}

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^Bearer\s+/i, "");
}

function isStaffUser(user: any): boolean {
  const roles = Array.isArray((user as any)?.roles) ? (user as any).roles : [];
  const perms = Array.isArray((user as any)?.permissions) ? (user as any).permissions : [];
  const currentMode = (user as any)?.currentMode;
  const normalizedRoles = roles.map((r: any) => normalizeRoleLabel(String(r)));

  return (
    currentMode === "admin" ||
    perms.includes("*") ||
    isChairmanAssistantUser(user) ||
    normalizedRoles.includes("admin") ||
    normalizedRoles.includes("staff") ||
    normalizedRoles.includes("agent")
  );
}

async function verifySession(token?: string) {
  if (!token) return null;
  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
  return user;
}

export async function ensureTenantUser(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    (req as any).tenantUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function ensureTenantAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
    const perms = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
    const currentMode = (user as any).currentMode;
    const normalizedRoles = roles.map((role: any) => normalizeRoleLabel(String(role)));
    const isAdmin =
      currentMode === "admin" ||
      perms.includes("*") ||
      perms.includes("admin:*") ||
      normalizedRoles.includes("admin") ||
      normalizedRoles.includes("chairman") ||
      normalizedRoles.includes("super admin") ||
      normalizedRoles.includes("platform admin") ||
      isChairmanAssistantUser(user);
    if (!isAdmin) return res.status(403).json({ message: "Admin access required" });
    (req as any).adminUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function resolveTenantStaffFromRequest(req: Request) {
  const token = getBearerToken(req);
  const user = await verifySession(token);
  if (!user) return null;
  if (!isStaffUser(user)) return null;
  return user;
}

export async function ensureTenantStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Authentication required" });

    if (!isStaffUser(user)) return res.status(403).json({ message: "Staff access required" });

    (req as any).staffUser = user;
    next();
  } catch (err) {
    next(err);
  }
}
