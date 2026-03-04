import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "@db";
import { scriptRegistry, scriptRuns, taskScriptBindings, tasks } from "@db/schema";
import { eq } from "drizzle-orm";
import { getInternalScript, INTERNAL_SCRIPTS } from "../lib/scripts/registry";

const router = Router();

function schemaNotReady(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return /relation .* does not exist|does not exist/i.test(msg);
}

router.get("/", async (_req, res) => {
  const internal = INTERNAL_SCRIPTS.map((script) => ({
    scriptKey: script.scriptKey,
    name: script.name,
    description: script.description,
    version: script.version,
    executionMode: script.executionMode,
    handlerType: "internal" as const,
    isActive: true,
  }));

  try {
    const dbScripts = await db.select().from(scriptRegistry).where(eq(scriptRegistry.isActive, true)).limit(500);
    const merged = [
      ...internal,
      ...dbScripts
        .filter((row) => !internal.some((s) => s.scriptKey === row.scriptKey))
        .map((row) => ({
          scriptKey: row.scriptKey,
          name: row.name,
          description: row.description,
          version: row.version,
          executionMode: row.executionMode,
          handlerType: row.handlerType,
          isActive: row.isActive,
        })),
    ];
    return res.json({ scripts: merged });
  } catch (error) {
    return res.json({ scripts: internal, warning: "Script registry table not available; showing built-ins only." });
  }
});

router.post("/sync", async (_req, res) => {
  try {
    const now = new Date();
    for (const script of INTERNAL_SCRIPTS) {
      await db
        .insert(scriptRegistry)
        .values({
          scriptKey: script.scriptKey,
          name: script.name,
          description: script.description,
          version: script.version,
          executionMode: script.executionMode,
          handlerType: "internal",
          handlerConfig: {},
          inputSchema: {},
          outputSchema: {},
          permissions: {},
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: scriptRegistry.scriptKey,
          set: {
            name: script.name,
            description: script.description,
            version: script.version,
            executionMode: script.executionMode,
            handlerType: "internal",
            isActive: true,
            updatedAt: now,
          },
        });
    }
    res.json({ ok: true, count: INTERNAL_SCRIPTS.length });
  } catch (error) {
    if (schemaNotReady(error)) {
      return res.status(501).json({
        error: "Script registry tables not available. Run `npm run db:push` to apply schema changes.",
      });
    }
    throw error;
  }
});

router.get("/bindings/task/:taskId", async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: "Invalid taskId" });
    const binding = await db.query.taskScriptBindings.findFirst({
      where: eq(taskScriptBindings.taskId, taskId),
      orderBy: [eq(taskScriptBindings.id, taskScriptBindings.id)],
    });
    res.json({ binding: binding ?? null });
  } catch (error) {
    if (schemaNotReady(error)) {
      return res.status(501).json({
        error: "Script binding tables not available. Run `npm run db:push` to apply schema changes.",
      });
    }
    throw error;
  }
});

router.put("/bindings/task/:taskId", async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: "Invalid taskId" });

    const scriptKey = typeof req.body?.scriptKey === "string" ? req.body.scriptKey.trim() : "";
    if (!scriptKey) return res.status(400).json({ error: "scriptKey is required" });
    if (!getInternalScript(scriptKey)) {
      return res.status(404).json({ error: `Unknown scriptKey: ${scriptKey}` });
    }

    const boundByAgentId =
      typeof req.body?.boundByAgentId === "number" && Number.isInteger(req.body.boundByAgentId)
        ? req.body.boundByAgentId
        : null;
    const inputs = typeof req.body?.inputs === "object" && req.body.inputs ? req.body.inputs : {};

    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!task.companyId) return res.status(400).json({ error: "Task is missing companyId; cannot bind scripts" });

    const existing = await db.query.taskScriptBindings.findFirst({ where: eq(taskScriptBindings.taskId, taskId) });
    const now = new Date();

    if (existing) {
      const [updated] = await db
        .update(taskScriptBindings)
        .set({
          scriptKey,
          inputs,
          status: "proposed",
          boundByAgentId,
          updatedAt: now,
        })
        .where(eq(taskScriptBindings.id, existing.id))
        .returning();
      return res.json({ binding: updated });
    }

    const [created] = await db
      .insert(taskScriptBindings)
      .values({
        taskId,
        companyId: task.companyId,
        scriptKey,
        inputs,
        status: "proposed",
        boundByAgentId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.json({ binding: created });
  } catch (error) {
    if (schemaNotReady(error)) {
      return res.status(501).json({
        error: "Script binding tables not available. Run `npm run db:push` to apply schema changes.",
      });
    }
    throw error;
  }
});

router.post("/bindings/task/:taskId/confirm", async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: "Invalid taskId" });

    const approvedByAgentId =
      typeof req.body?.approvedByAgentId === "number" && Number.isInteger(req.body.approvedByAgentId)
        ? req.body.approvedByAgentId
        : null;
    if (!approvedByAgentId) return res.status(400).json({ error: "approvedByAgentId is required" });

    const binding = await db.query.taskScriptBindings.findFirst({ where: eq(taskScriptBindings.taskId, taskId) });
    if (!binding) return res.status(404).json({ error: "No binding found for task" });

    const now = new Date();
    const [updated] = await db
      .update(taskScriptBindings)
      .set({ status: "confirmed", approvedByAgentId, approvedAt: now, updatedAt: now })
      .where(eq(taskScriptBindings.id, binding.id))
      .returning();

    res.json({ binding: updated });
  } catch (error) {
    if (schemaNotReady(error)) {
      return res.status(501).json({
        error: "Script binding tables not available. Run `npm run db:push` to apply schema changes.",
      });
    }
    throw error;
  }
});

router.post("/bindings/task/:taskId/run", async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: "Invalid taskId" });

    const binding = await db.query.taskScriptBindings.findFirst({ where: eq(taskScriptBindings.taskId, taskId) });
    if (!binding) return res.status(404).json({ error: "No binding found for task" });

    if (binding.status !== "confirmed") {
      return res.status(428).json({
        error: "Script binding not confirmed",
        requiresConfirmation: true,
        next: `POST /api/scripts/bindings/task/${taskId}/confirm`,
      });
    }

    const script = getInternalScript(binding.scriptKey);
    if (!script) return res.status(404).json({ error: `Unknown scriptKey: ${binding.scriptKey}` });

    const runId = nanoid();
    const now = new Date();

    const [run] = await db
      .insert(scriptRuns)
      .values({
        id: runId,
        scriptKey: binding.scriptKey,
        bindingId: binding.id,
        taskId: binding.taskId,
        companyId: binding.companyId,
        status: "running",
        inputs: binding.inputs,
        outputs: {},
        logs: null,
        error: null,
        startedAt: now,
        finishedAt: null,
        createdByAgentId: binding.boundByAgentId ?? binding.approvedByAgentId ?? null,
        createdAt: now,
      })
      .returning();

    await db.update(taskScriptBindings).set({ status: "running", lastRunId: runId, updatedAt: now }).where(eq(taskScriptBindings.id, binding.id));

    const parsedInputs = script.inputSchema.parse({ ...(binding.inputs || {}), taskId });
    const output = await script.run({ companyId: binding.companyId, agentId: binding.boundByAgentId }, parsedInputs as any);

    const finishedAt = new Date();
    const parsedOutput = script.outputSchema.parse(output);

    await db
      .update(scriptRuns)
      .set({
        status: "succeeded",
        outputs: parsedOutput as any,
        finishedAt,
      })
      .where(eq(scriptRuns.id, runId));

    await db.update(taskScriptBindings).set({ status: "succeeded", updatedAt: finishedAt }).where(eq(taskScriptBindings.id, binding.id));

    res.json({ run: { ...run, status: "succeeded", finishedAt }, output: parsedOutput });
  } catch (error) {
    if (schemaNotReady(error)) {
      return res.status(501).json({
        error: "Script execution tables not available. Run `npm run db:push` to apply schema changes.",
      });
    }
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

export default router;

