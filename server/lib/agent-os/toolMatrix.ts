import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@db";
import { agents } from "@db/schema";
import { createAgentJob } from "./audit";
import { getAgentPolicy } from "./registry";
import { executeTool, type ToolName } from "./tools";

const TOOL_NAMES: ToolName[] = [
  "send_message",
  "search_web",
  "create_lead",
  "update_crm",
  "create_job",
  "log_event",
  "get_entity",
  "attach_document",
];

const REPORT_FILENAME = "tools_matrix_report.json";

type ToolRunResult = {
  tool: ToolName;
  allowed: boolean;
  status: "ok" | "blocked" | "error";
  reason?: string;
};

function samplePayload(tool: ToolName): Record<string, unknown> {
  switch (tool) {
    case "send_message":
      return { channel: "in_app", to: "ops@example.test", content: "tool-matrix smoke test" };
    case "search_web":
      return { query: "gold buyer west africa" };
    case "create_lead":
      return {
        lead: {
          companyName: "Tool Matrix Lead",
          contactName: "Smoke Test",
          contactEmail: "matrix@example.test",
          country: "BJ",
          tags: ["tool-matrix"],
        },
      };
    case "update_crm":
      return { leadId: -1, fields: { notes: "smoke" } };
    case "create_job":
      return { title: "Tool Matrix Child Job" };
    case "log_event":
      return { event: "tool_matrix_smoke" };
    case "get_entity":
      return { leadId: -1 };
    case "attach_document":
      return { entityType: "lead", entityId: -1, fileId: "matrix-smoke" };
    default:
      return {};
  }
}

async function runToolSmokeForAgent(agentId: number, companyId: number | null, tool: ToolName): Promise<ToolRunResult> {
  const policy = await getAgentPolicy(agentId);
  const allowed = policy.permissions.includes(tool);
  const jobId = await createAgentJob({
    title: `Tool matrix smoke: ${tool}`,
    agentId,
    companyId,
    payload: { source: "tool_matrix" },
  });

  try {
    await executeTool({
      agentId,
      jobId,
      toolName: tool,
      args: samplePayload(tool),
      idempotencyKey: `tool-matrix:${agentId}:${tool}:${new Date().toISOString().slice(0, 10)}`,
      maxRetries: 0,
    });
    return { tool, allowed, status: allowed ? "ok" : "error", reason: allowed ? undefined : "forbidden tool unexpectedly executed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!allowed) return { tool, allowed, status: "blocked", reason: message };
    return { tool, allowed, status: "error", reason: message };
  }
}

export type ToolMatrixAgentReport = {
  agentId: number;
  name: string;
  role: string;
  companyId: number | null;
  results: ToolRunResult[];
};

export type ToolMatrixReport = {
  generatedAt: string;
  runtimeEnv: string;
  totalAgents: number;
  failures: number;
  blockedForbiddenChecks: number;
  agents: ToolMatrixAgentReport[];
};

export async function runToolMatrixReport(input?: { limit?: number }) {
  const limit = Math.max(1, Math.min(200, Number(input?.limit ?? 25)));
  const runtimeEnv = String(process.env.APP_ENV || process.env.NODE_ENV || "prod").trim().toLowerCase();
  const rows = await db.query.agents.findMany({
    where: and(eq(agents.status, "active"), eq(agents.isVisible, true), eq(agents.isTest, false)),
    orderBy: [asc(agents.id)],
    limit,
  });

  const reports: ToolMatrixAgentReport[] = [];
  let failures = 0;
  let blockedForbiddenChecks = 0;

  for (const row of rows) {
    const results: ToolRunResult[] = [];
    for (const tool of TOOL_NAMES) {
      const result = await runToolSmokeForAgent(Number(row.id), row.companyId ?? null, tool);
      results.push(result);
      if (result.status === "error") failures += 1;
      if (!result.allowed && result.status === "blocked") blockedForbiddenChecks += 1;
    }
    reports.push({
      agentId: Number(row.id),
      name: String(row.name || ""),
      role: String(row.role || ""),
      companyId: row.companyId ?? null,
      results,
    });
  }

  const payload: ToolMatrixReport = {
    generatedAt: new Date().toISOString(),
    runtimeEnv,
    totalAgents: reports.length,
    failures,
    blockedForbiddenChecks,
    agents: reports,
  };

  const reportDir = path.resolve(process.cwd(), "reports");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, REPORT_FILENAME);
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), "utf8");

  return { reportPath, payload };
}

export async function readLatestToolMatrixReport() {
  const reportPath = path.resolve(process.cwd(), "reports", REPORT_FILENAME);
  try {
    const raw = await fs.readFile(reportPath, "utf8");
    return { reportPath, payload: JSON.parse(raw) as ToolMatrixReport };
  } catch {
    return null;
  }
}
