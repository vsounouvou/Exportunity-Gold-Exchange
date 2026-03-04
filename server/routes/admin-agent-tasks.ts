import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { agentActionLogs, agentMailboxes, agentTasks } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { AGENT_KEYS } from "../agents";

const router = Router();

router.use(ensureTenantAdmin);

function parseMoney(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function parseIntSafe(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

router.post("/", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const requestedTenant = String(req.body?.tenant || "").trim().toLowerCase();
    const normalizedTenant = requestedTenant === "bourse" ? "bdo" : requestedTenant;
    if (normalizedTenant && normalizedTenant !== String(tenant.key).toLowerCase()) {
      return res.status(409).json({ message: `Tenant mismatch (host=${tenant.key}, body=${requestedTenant})` });
    }

    const agentRaw = String(req.body?.agent || "").trim();
    if (!AGENT_KEYS.includes(agentRaw as any)) {
      return res.status(400).json({ message: "Invalid agent" });
    }

    const mailbox = await db.query.agentMailboxes.findFirst({
      where: and(eq(agentMailboxes.tenantId, tenant.id), eq(agentMailboxes.agentKey, agentRaw)),
      columns: { id: true, isEnabled: true },
    });
    if (!mailbox) {
      return res.status(409).json({
        message: "Agent mailbox missing. Provision it in Agents \u2192 Email before running tasks.",
      });
    }
    if (mailbox.isEnabled === false) {
      return res.status(409).json({
        message: "Agent mailbox is disabled. Re-enable/provision it in Agents \u2192 Email before running tasks.",
      });
    }

    const goal = String(req.body?.goal || "").trim();
    if (!goal) return res.status(400).json({ message: "goal required" });

    const budgetUsd = parseMoney(req.body?.budget?.usd);
    const budgetMaxCalls = parseIntSafe(req.body?.budget?.maxCalls);
    const budgetMaxTokens = parseIntSafe(req.body?.budget?.maxTokens ?? req.body?.budget?.tokens);
    const constraints = req.body?.constraints && typeof req.body.constraints === "object" ? req.body.constraints : {};

    const now = new Date();
    const [task] = await db
      .insert(agentTasks)
      .values({
        tenantId: tenant.id,
        agent: agentRaw as any,
        goal,
        budgetUsdCap: budgetUsd.toFixed(2),
        budgetMaxCalls,
        budgetMaxTokens,
        constraints,
        createdByUserId: req.adminUser?.id ?? null,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, task });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create task" });
  }
});

router.get("/", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit), 1), 200) || 50;
    const items = await db.query.agentTasks.findMany({
      where: eq(agentTasks.tenantId, tenant.id),
      orderBy: desc(agentTasks.createdAt),
      limit,
    });
    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list tasks" });
  }
});

router.get("/agents/status", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const recent = await db.query.agentTasks.findMany({
      where: eq(agentTasks.tenantId, tenant.id),
      orderBy: desc(agentTasks.updatedAt),
      limit: 500,
    });

    const byAgent = new Map<string, any>();
    for (const row of recent) {
      const key = String(row.agent);
      if (!AGENT_KEYS.includes(key as any)) continue;
      if (!byAgent.has(key)) byAgent.set(key, row);
    }

    const agents = AGENT_KEYS.map((agent) => {
      const t = byAgent.get(agent) ?? null;
      const status =
        t?.status === "running" ? "running" : t?.status === "error" ? "error" : "idle";
      const budget = t
        ? {
            usd: Number(t.budgetUsdCap || 0),
            maxCalls: Number(t.budgetMaxCalls || 0),
            maxTokens: Number(t.budgetMaxTokens || 0),
          }
        : null;
      return { agent, status, budget, taskId: t?.id ?? null, updatedAt: t?.updatedAt ?? null };
    });

    res.json({ ok: true, agents });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load agent status" });
  }
});

router.get("/:id", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const id = parseIntSafe(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const task = await db.query.agentTasks.findFirst({
      where: and(eq(agentTasks.id, id), eq(agentTasks.tenantId, tenant.id)),
    });
    if (!task) return res.status(404).json({ message: "Task not found" });

    const logs = await db.query.agentActionLogs.findMany({
      where: eq(agentActionLogs.taskId, task.id),
      orderBy: desc(agentActionLogs.createdAt),
      limit: 500,
    });

    res.json({ ok: true, task, logs: logs.reverse() });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load task" });
  }
});

router.post("/:id/pause", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const id = parseIntSafe(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const task = await db.query.agentTasks.findFirst({
      where: and(eq(agentTasks.id, id), eq(agentTasks.tenantId, tenant.id)),
    });
    if (!task) return res.status(404).json({ message: "Task not found" });

    if (task.status === "completed" || task.status === "cancelled") {
      return res.status(409).json({ message: "Task already finished" });
    }

    await db.update(agentTasks).set({ status: "paused", updatedAt: new Date() }).where(eq(agentTasks.id, task.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Pause failed" });
  }
});

router.post("/:id/resume", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const id = parseIntSafe(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const task = await db.query.agentTasks.findFirst({
      where: and(eq(agentTasks.id, id), eq(agentTasks.tenantId, tenant.id)),
    });
    if (!task) return res.status(404).json({ message: "Task not found" });

    if (task.status !== "paused") {
      return res.status(409).json({ message: "Task is not paused" });
    }

    await db.update(agentTasks).set({ status: "queued", updatedAt: new Date() }).where(eq(agentTasks.id, task.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Resume failed" });
  }
});

export default router;
