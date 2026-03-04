import { Router } from "express";
import { db } from "@db";
import { agentAuditLog, agentJobs } from "@db/schema";
import { desc, eq } from "drizzle-orm";
import { runAgentTask } from "../lib/agent-os/router";
import { AgentOsError } from "../lib/agent-os/errors";
import { AiConsentRequiredError } from "../lib/ai-consent";

const router = Router();

router.post("/run", async (req, res, next) => {
  try {
    const result = await runAgentTask(req.body);
    res.json(result);
  } catch (error) {
    if (error instanceof AiConsentRequiredError) return next(error);
    const status = error instanceof AgentOsError ? error.status : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/jobs/:jobId", async (req, res) => {
  const jobId = req.params.jobId;
  const job = await db.query.agentJobs.findFirst({ where: eq(agentJobs.jobId, jobId) });
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

router.get("/jobs/:jobId/audit", async (req, res) => {
  const jobId = req.params.jobId;
  const logs = await db
    .select()
    .from(agentAuditLog)
    .where(eq(agentAuditLog.jobId, jobId))
    .orderBy(desc(agentAuditLog.logId))
    .limit(200);
  res.json({ jobId, logs });
});

export default router;
