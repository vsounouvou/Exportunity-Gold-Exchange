import { Router } from "express";
import { ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";
import { normalizeAgentKey } from "../lib/mail/agentSlugs";
import { createActionRequest } from "../lib/actions/ActionRouter";

const router = Router();
router.use(ensureTenantStaff);

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function isAdminUser(user: any) {
  if (!user) return false;
  const currentMode = (user as any).currentMode;
  const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
  const perms = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  return (
    currentMode === "admin" ||
    roles.includes("admin") ||
    perms.includes("*") ||
    perms.includes("admin:*") ||
    isChairmanAssistantUser(user)
  );
}

router.post("/send", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = (req as any).staffUser;

    const agentKey = normalizeAgentKey(
      String(req.body?.agent_id ?? req.body?.agentKey ?? req.body?.agent ?? ""),
    );
    if (!agentKey) return res.status(400).json({ message: "agent_id (agent key) required" });

    const to = parseStringArray(req.body?.to);
    if (!to.length) return res.status(400).json({ message: "to[] required" });

    const subject = String(req.body?.subject || "").trim();
    if (!subject) return res.status(400).json({ message: "subject required" });

    const text = req.body?.body?.text ?? req.body?.text ?? null;
    const html = req.body?.body?.html ?? req.body?.html ?? null;
    const textBody = typeof text === "string" ? text : null;
    const htmlBody = typeof html === "string" ? html : null;
    if (!textBody && !htmlBody) {
      return res.status(400).json({ message: "body.text or body.html required" });
    }

    const bypassApproval = isAdminUser(staffUser);

    // Email sending is an Action (single source of truth).
    const actionRequest = await createActionRequest({
      tenantId: tenant.id,
      requestedByUserId: staffUser?.id ?? null,
      requestedByAgentKey: agentKey,
      actionType: "SEND_EMAIL",
      payload: {
        agentKey,
        to,
        subject,
        body: { text: textBody, html: htmlBody },
        source: "api.email.send",
      },
      priority: 0,
      idempotencyKey: null,
      relatedConversationId: null,
      relatedThreadId: null,
      isAdmin: bypassApproval,
    });

    res.status(201).json({
      ok: true,
      actionRequest,
      queued: actionRequest.status === "QUEUED",
      requiresApproval: actionRequest.status === "REQUIRES_APPROVAL",
    });
  } catch (err: any) {
    const msg = err?.message || "Failed to send email";
    const status = (() => {
      if (msg.includes("Approval required")) return 403;
      if (msg.includes("Daily send limit")) return 429;
      if (msg.includes("Mailbox not provisioned")) return 404;
      if (msg.includes("Mailbox disabled")) return 423;
      if (
        msg.includes("MAIL_PLATFORM_SIGNATURE_SECRET") ||
        msg.includes("MAIL_SMTP") ||
        msg.includes("SMTP not configured")
      )
        return 503;
      return 500;
    })();
    res.status(status).json({ message: msg });
  }
});

export default router;
