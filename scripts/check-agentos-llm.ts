import "../env";
import { nanoid } from "nanoid";
import { desc } from "drizzle-orm";

import { db } from "@db";
import { agentAuditLog, agentJobs, agents, companies } from "@db/schema";
import { runAgentTask } from "../server/lib/agent-os/router";
import { eq } from "drizzle-orm";

async function main() {
  process.env.AI_ENABLED = process.env.AI_ENABLED ?? "true";

  const company =
    (await db.query.companies.findFirst({ orderBy: desc(companies.id) })) ??
    (
      await db
        .insert(companies)
        .values({
          name: `Test Company ${nanoid(6)}`,
          metadata: { test: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
    )[0];

  const [createdAgent] = await db
    .insert(agents)
    .values({
      companyId: company.id,
      name: `LLM Test Agent ${nanoid(6)}`,
      role: "AgentOS LLM Tester",
      status: "active",
      permissions: { email: true, crm: true, webResearch: false },
      metadata: { test: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: agents.id });

  const result = await runAgentTask({
    agentId: createdAgent.id,
    companyId: company.id,
    task: "Draft a concise, professional reply to a client worried about delivery fraud and escrow. Provide 3 bullet steps.",
  });

  const message = String(result.output.message ?? "");
  const payload: any = {
    jobId: result.jobId,
    decision: result.decision.decision,
    provider: (result.output as any).provider ?? null,
    model: (result.output as any).model ?? null,
    messagePreview: message.slice(0, 180),
  };

  if ((result.output as any).error) {
    const job = await db.query.agentJobs.findFirst({ where: eq(agentJobs.jobId, result.jobId) });
    const logs = await db.select().from(agentAuditLog).where(eq(agentAuditLog.jobId, result.jobId));
    payload.jobStatus = job?.status ?? null;
    payload.jobError = job?.error ?? null;
    payload.auditSummary = logs.map((l) => ({
      actionType: l.actionType,
      status: l.status,
      error: l.error ?? null,
      tokenUsage: l.tokenUsage ?? null,
    }));
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
