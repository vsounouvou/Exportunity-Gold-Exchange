import { Router } from "express";
import QRCode from "qrcode";
import { db } from "@db";
import { eceUsers } from "@db/schema";
import { eq } from "drizzle-orm";
import { resolveChairmanAssistant } from "../lib/chairman-assistant";
import { createQuickToken, redeemQuickToken } from "../lib/chairman-quick-tokens";
import { resolveChairmanConsoleActor } from "./utils/chairman-console-auth";

const router = Router();

function asNumber(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function getPublicBaseUrl(req: any) {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").trim();
  const proto = forwardedProto || req.protocol || "https";
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.headers?.host || "").trim();
  return host ? `${proto}://${host}` : "";
}

router.get("/tenants/:tenantId/terminal-agent", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = asNumber(req.params.tenantId) ?? Number(req.tenant?.id);
  if (!tenantId || tenantId <= 0) return res.status(400).json({ message: "Invalid tenant id" });

  if (Number(req.tenant?.id) !== tenantId && !auth.adminOverride) {
    return res.status(403).json({ message: "Tenant mismatch" });
  }

  const assistant = await resolveChairmanAssistant(tenantId);

  res.json({
    ok: true,
    agent: {
      id: assistant.id,
      name: assistant.name,
      displayName: assistant.displayName ?? assistant.name,
      role: assistant.role,
      status: assistant.status,
      avatarUrl: assistant.avatarUrl ?? assistant.avatar ?? null,
      isTerminalDefault: assistant.isTerminalDefault,
    },
  });
});

router.post("/chairman/quick-token", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const expiresInMinutes = asNumber(req.body?.expiresInMinutes ?? req.body?.expires_in_minutes) ?? 10;

  const token = await createQuickToken({
    tenantId,
    userId: auth.user.id,
    expiresInMinutes,
    metadata: {
      createdBy: auth.user.id,
      createdByRole: auth.user.role ?? null,
    },
  });

  const baseUrl = getPublicBaseUrl(req);
  const redeemUrl = `${baseUrl}/a/quick?token=${token.token}`;
  const qrCodeDataUrl = await QRCode.toDataURL(redeemUrl, { margin: 1, width: 240 });

  res.status(201).json({
    ok: true,
    token: token.token,
    tokenPrefix: token.tokenPrefix,
    expiresAt: token.expiresAt,
    redeemUrl,
    qrCodeDataUrl,
  });
});

router.post("/chairman/quick-token/redeem", async (req, res) => {
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }
  const token = String(req.body?.token || req.query?.token || "").trim();
  if (!token) return res.status(400).json({ message: "token is required" });

  const redeemed = await redeemQuickToken({
    tenantId,
    token,
    metadata: {
      ip: String(req.ip || ""),
      userAgent: String(req.headers?.["user-agent"] || ""),
    },
  });

  if (!redeemed.ok) {
    return res.status(401).json({ message: "Token invalid or expired" });
  }

  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, redeemed.userId),
  });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({
    ok: true,
    sessionToken: redeemed.sessionToken,
    sessionExpiresAt: redeemed.sessionExpiresAt,
    user: {
      id: user.id,
      displayName: user.displayName,
      roles: user.roles ?? [],
      role: user.role,
    },
  });
});

export default router;
