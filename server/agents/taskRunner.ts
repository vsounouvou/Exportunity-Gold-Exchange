import { db } from "@db";
import { and, desc, eq } from "drizzle-orm";
import { agentActionLogs, agentTasks, geoTerritories, seoIssues, seoPatches, seoRecommendations, tenants, territoryBudgets, territoryKpis } from "@db/schema";
import { getAgentPlaybook } from "./index";
import type { AgentKey } from "./types";
import { runSeoSnapshotScan } from "../lib/seo/snapshot";

function parseAgentKey(value: unknown): AgentKey | null {
  const raw = String(value ?? "").trim();
  if (raw === "marketing") return "marketing";
  if (raw === "client_hunter") return "client_hunter";
  if (raw === "media") return "media";
  if (raw === "ops") return "ops";
  if (raw === "compliance") return "compliance";
  if (raw === "data") return "data";
  if (raw === "seo_autopilot") return "seo_autopilot";
  return null;
}

function toInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function toMoney(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeNow(value?: Date) {
  return value ?? new Date();
}

function pickLanguage(constraints: any): string {
  const raw = String(constraints?.language || "").trim().toLowerCase();
  if (raw.startsWith("fr")) return "fr";
  if (raw.startsWith("en")) return "en";
  return "fr";
}

function syntheticLeadName(seed: number) {
  const adjectives = ["Prime", "Vertex", "Atlas", "Cedar", "Nexus", "Bright", "Harbor", "Summit", "Orchid", "Delta"];
  const nouns = ["Trading", "Commodities", "Logistics", "Exports", "Supply", "Partners", "Holdings", "Brokerage"];
  return `${adjectives[seed % adjectives.length]} ${nouns[(seed >> 3) % nouns.length]}`;
}

export async function runAgentTaskById(input: {
  tenantId: number;
  taskId: number;
  requestedByUserId?: number | null;
  dryRun?: boolean;
}) {
  const dryRun = Boolean(input.dryRun);
  const now = safeNow();

  const task = await db.query.agentTasks.findFirst({
    where: and(eq(agentTasks.id, input.taskId), eq(agentTasks.tenantId, input.tenantId)),
  });
  if (!task) {
    return { ok: false, error: "Task not found" as const };
  }

  const agent = parseAgentKey(task.agent);
  if (!agent) {
    return { ok: false, error: "Unknown agent key" as const };
  }

  const playbook = getAgentPlaybook(agent);
  const constraints = (task.constraints as any) || {};

  const budgetUsdCap = toMoney(task.budgetUsdCap);
  const budgetMaxCalls = toInt(task.budgetMaxCalls) ?? 0;
  const budgetMaxTokens = toInt(task.budgetMaxTokens) ?? 0;

  const plannedActions: Array<{ action: string; estimatedCostUsd: number }> = [];

  const pushPlan = (action: string, estimatedCostUsd = 0) => {
    plannedActions.push({ action, estimatedCostUsd });
  };

  pushPlan("task.start", 0);
  if (agent === "ops") pushPlan("territory.audit.kpis", 0);
  if (agent === "compliance") pushPlan("compliance.kyc.checklist", 0);
  if (agent === "marketing") pushPlan("marketing.plan.draft", 0);
  if (agent === "client_hunter") pushPlan("client_hunter.synthetic_leads", 0);
  if (agent === "media") pushPlan("media.image_brief", 0);
  if (agent === "data") pushPlan("data.admin.ia.audit", 0);
  if (agent === "seo_autopilot") pushPlan("seo.snapshot.scan", 0);

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      task,
      playbook: { agent: playbook.agent, allowedActions: playbook.allowedActions, stopRules: playbook.stopRules },
      plan: plannedActions,
    };
  }

  const startedAtMs = Date.now();
  let stepsExecuted = 0;

  const startedAt = now;
  await db
    .update(agentTasks)
    .set({ status: "running", startedAt, updatedAt: now })
    .where(eq(agentTasks.id, task.id));

  let callsUsed = toInt(task.callsUsed) ?? 0;
  let tokensUsed = toInt(task.tokensUsed) ?? 0;
  let budgetUsedUsd = toMoney(task.budgetUsedUsd);

  const logs: any[] = [];

  const commitProgress = async () => {
    await db
      .update(agentTasks)
      .set({
        callsUsed,
        tokensUsed,
        budgetUsedUsd: budgetUsedUsd.toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(agentTasks.id, task.id));
  };

  const ensureBudget = (stepCostUsd: number, stepTokens: number) => {
    if (stepsExecuted >= playbook.stopRules.maxSteps) return { ok: false, reason: "max_steps" as const };
    if (Date.now() - startedAtMs > playbook.stopRules.maxMs) return { ok: false, reason: "time" as const };
    if (budgetMaxCalls > 0 && callsUsed >= budgetMaxCalls) return { ok: false, reason: "max_calls" as const };
    if (budgetUsdCap > 0 && budgetUsedUsd + stepCostUsd > budgetUsdCap) return { ok: false, reason: "max_usd" as const };
    if (budgetMaxTokens > 0 && tokensUsed + stepTokens > budgetMaxTokens) return { ok: false, reason: "max_tokens" as const };
    return { ok: true as const };
  };

  const writeLog = async (entry: {
    action: string;
    status: "ok" | "error" | "skipped";
    outputSummary?: string | null;
    estimatedCostUsd?: number;
    metadata?: Record<string, any>;
  }) => {
    const [row] = await db
      .insert(agentActionLogs)
      .values({
        tenantId: input.tenantId,
        agent,
        taskId: task.id,
        action: entry.action,
        estimatedCostUsd: (entry.estimatedCostUsd ?? 0).toFixed(4),
        status: entry.status,
        outputSummary: entry.outputSummary ?? null,
        metadata: entry.metadata ?? {},
        createdAt: new Date(),
      })
      .returning();
    logs.push(row);
    return row;
  };

  const fail = async (reason: string) => {
    const finishedAt = new Date();
    await writeLog({ action: "task.stop", status: "error", outputSummary: reason });
    await db.update(agentTasks).set({ status: "error", finishedAt, updatedAt: finishedAt }).where(eq(agentTasks.id, task.id));
    return { ok: false as const, error: reason, taskId: task.id, logs };
  };

  // Step: task.start
  const startBudget = ensureBudget(0, 0);
  if (!startBudget.ok) return await fail(`Stop condition hit: ${startBudget.reason}`);
  callsUsed += 1;
  stepsExecuted += 1;
  await writeLog({ action: "task.start", status: "ok", outputSummary: `Started (${agent})` });
  await commitProgress();

  // Agent-specific action
  if (agent === "ops") {
    const guard = ensureBudget(0, 0);
    if (!guard.ok) return await fail(`Stop condition hit: ${guard.reason}`);
    const territoryId = toInt(constraints?.territoryId);
    if (!territoryId) {
      await writeLog({
        action: "territory.audit.kpis",
        status: "skipped",
        outputSummary: "No constraints.territoryId provided",
      });
    } else {
      const territory = await db.query.geoTerritories.findFirst({
        where: and(eq(geoTerritories.tenantId, input.tenantId), eq(geoTerritories.id, territoryId)),
      });
      if (!territory) {
        await writeLog({
          action: "territory.audit.kpis",
          status: "error",
          outputSummary: "Territory not found",
          metadata: { territoryId },
        });
      } else {
        const [budget] = await db
          .select()
          .from(territoryBudgets)
          .where(eq(territoryBudgets.territoryId, territoryId))
          .orderBy(desc(territoryBudgets.month))
          .limit(1);
        const [kpi] = await db
          .select()
          .from(territoryKpis)
          .where(eq(territoryKpis.territoryId, territoryId))
          .orderBy(desc(territoryKpis.month))
          .limit(1);

        await writeLog({
          action: "territory.audit.kpis",
          status: "ok",
          outputSummary: `Territory ${territory.name}: GMV ${kpi?.gmv ?? 0}, sellers ${kpi?.activeSellers ?? 0}, buyers ${kpi?.activeBuyers ?? 0}`,
          metadata: { territoryId, territory, budget: budget ?? null, kpi: kpi ?? null },
        });
      }
    }
    callsUsed += 1;
    stepsExecuted += 1;
    await commitProgress();
  }

  if (agent === "compliance") {
    const guard = ensureBudget(0, 0);
    if (!guard.ok) return await fail(`Stop condition hit: ${guard.reason}`);
    const lang = pickLanguage(constraints);
    const template = playbook.defaultTemplates.find((t) => t.category === "kyc" && t.language === lang) ?? playbook.defaultTemplates[0];
    await writeLog({
      action: "compliance.kyc.checklist",
      status: "ok",
      outputSummary: template?.templateText ?? "KYC checklist unavailable",
      metadata: { language: lang },
    });
    callsUsed += 1;
    stepsExecuted += 1;
    await commitProgress();
  }

  if (agent === "marketing") {
    const guard = ensureBudget(0, 0);
    if (!guard.ok) return await fail(`Stop condition hit: ${guard.reason}`);
    const territoryId = toInt(constraints?.territoryId);
    const lang = pickLanguage(constraints);
    const summary = [
      "Marketing plan (low-cost):",
      "1) Define 1 offer + 1 CTA",
      "2) Prepare 2 template messages",
      "3) Start with WhatsApp template-first outreach",
      "4) Track replies + handoff to ops on intent",
    ].join("\n");
    await writeLog({
      action: "marketing.plan.draft",
      status: "ok",
      outputSummary: summary,
      metadata: { territoryId: territoryId ?? null, language: lang, goal: task.goal },
    });
    callsUsed += 1;
    stepsExecuted += 1;
    await commitProgress();
  }

  if (agent === "seo_autopilot") {
    const guard = ensureBudget(0, 0);
    if (!guard.ok) return await fail(`Stop condition hit: ${guard.reason}`);

    const env = String(process.env.APP_ENV || process.env.NODE_ENV || "prod").trim().toLowerCase();
    const normalizedEnv = env === "production" ? "prod" : env === "development" ? "dev" : env || "prod";
    const port = parseInt(String(process.env.PORT || "5000"), 10);
    const baseUrl = String(process.env.SEO_SNAPSHOT_BASE_URL || `http://127.0.0.1:${port}`);

    const tenantRow = await db.query.tenants.findFirst({
      where: eq(tenants.id, input.tenantId),
      columns: { domains: true, key: true, name: true },
    });

    const domains = (tenantRow?.domains ?? []).map((d) => String(d || "").trim()).filter(Boolean);
    const host =
      String(constraints?.host || constraints?.domain || "").trim() ||
      domains.find((d) => d && d !== "localhost" && d !== "127.0.0.1" && !/^\d+\.\d+\.\d+\.\d+$/.test(d)) ||
      domains.find((d) => d && d !== "127.0.0.1") ||
      "localhost";

    const maxPages = toInt(constraints?.maxPages) ?? 60;
    const paths = Array.isArray(constraints?.paths) ? constraints.paths.map((p: any) => String(p || "")).filter(Boolean) : undefined;

    const scan = await runSeoSnapshotScan({
      tenantId: input.tenantId,
      env: normalizedEnv,
      host,
      baseUrl,
      paths,
      maxPages,
    });

    const recentIssues = await db.query.seoIssues.findMany({
      where: and(eq(seoIssues.tenantId, input.tenantId), eq(seoIssues.env, normalizedEnv), eq(seoIssues.status, "open")),
      orderBy: [desc(seoIssues.severity), desc(seoIssues.lastSeenAt)],
      limit: 50,
    });

    const existingRecs = await db.query.seoRecommendations.findMany({
      where: and(eq(seoRecommendations.tenantId, input.tenantId), eq(seoRecommendations.env, normalizedEnv), eq(seoRecommendations.status, "proposed")),
      orderBy: desc(seoRecommendations.updatedAt),
      limit: 500,
      columns: { actionType: true, targetPath: true, updatedAt: true },
    });
    const cutoff = Date.now() - 24 * 60 * 60_000;
    const recentSet = new Set(
      existingRecs
        .filter((r) => r.updatedAt && new Date(r.updatedAt).getTime() >= cutoff)
        .map((r) => `${r.actionType}::${r.targetPath}`),
    );

    const existingPatches = await db.query.seoPatches.findMany({
      where: and(eq(seoPatches.tenantId, input.tenantId), eq(seoPatches.env, normalizedEnv), eq(seoPatches.status, "proposed")),
      orderBy: desc(seoPatches.updatedAt),
      limit: 800,
      columns: { featureFlag: true },
    });
    const patchFlagSet = new Set(existingPatches.map((p) => String(p.featureFlag || "")));

    const crypto = await import("crypto");
    const hash10 = (raw: string) =>
      crypto.createHash("sha1").update(raw).digest("hex").slice(0, 10);

    const prettyFromPath = (path: string) => {
      const clean = String(path || "/").split("?")[0];
      const seg = clean.split("/").filter(Boolean).slice(-1)[0] || "Home";
      const spaced = seg.replace(/[-_]+/g, " ").trim();
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    };

    const fullTenantTitle = tenantRow?.key === "exportunity" ? "Exportunity" : "BOURSE DE L'OR";

    let created = 0;
    let patchesCreated = 0;
    for (const issue of recentIssues) {
      const actionType =
        issue.issueType === "missing_canonical" || issue.issueType === "wrong_canonical_host"
          ? "CANONICAL_FIX"
          : issue.issueType === "missing_title" || issue.issueType === "duplicate_title"
            ? "META_TITLE"
            : issue.issueType === "missing_meta_description" || issue.issueType === "duplicate_meta_description"
              ? "META_DESCRIPTION"
              : "TECHNICAL_SEO";

      const key = `${actionType}::${issue.path}`;
      if (recentSet.has(key)) continue;
      recentSet.add(key);

      await db.insert(seoRecommendations).values({
        tenantId: input.tenantId,
        siteId: issue.siteId ?? null,
        env: normalizedEnv,
        actionType,
        targetPath: issue.path,
        proposedChange: { issueType: issue.issueType },
        expectedImpact: { notes: "Generated by SEO autopilot (rules-first)" },
        severity: issue.severity ?? 2,
        confidence: 60,
        status: "proposed",
        evidence: issue.evidence ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      created += 1;

      // Generate a versioned, feature-flagged patch suggestion (not applied by default).
      const patchType = actionType === "CANONICAL_FIX" ? "CANONICAL" : actionType.startsWith("META_") ? "META" : "TECHNICAL";
      const flag = `seo_patch_${input.tenantId}_${hash10(`${normalizedEnv}:${patchType}:${issue.path}`)}`;
      if (!patchFlagSet.has(flag)) {
        patchFlagSet.add(flag);

        const patch: Record<string, unknown> = {};
        if (patchType === "META") {
          if (actionType === "META_TITLE") patch.title = `${prettyFromPath(issue.path)} | ${fullTenantTitle}`;
          if (actionType === "META_DESCRIPTION") patch.description = `Learn more about ${prettyFromPath(issue.path)} on ${fullTenantTitle}.`;
        }

        await db.insert(seoPatches).values({
          tenantId: input.tenantId,
          siteId: issue.siteId ?? null,
          env: normalizedEnv,
          patchType,
          targetPath: issue.path,
          featureFlag: flag,
          requiresApproval: false,
          status: "proposed",
          patch,
          guardrails: { x_drop_sessions: 15, y_drop_conversions: 10, z_bounce_increase: 12, window_days: 7 },
          evidence: issue.evidence ?? {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        patchesCreated += 1;
      }
    }

    await writeLog({
      action: "seo.snapshot.scan",
      status: "ok",
      outputSummary: `Scan complete: ${scan.pages} pages, ${scan.issues} issues, ${created} recommendations, ${patchesCreated} patches`,
      metadata: { env: normalizedEnv, host, scan, recommendationsCreated: created, patchesCreated },
    });

    callsUsed += 1;
    stepsExecuted += 1;
    await commitProgress();
  }

  if (agent === "client_hunter") {
    const guard = ensureBudget(0, 0);
    if (!guard.ok) return await fail(`Stop condition hit: ${guard.reason}`);
    const city = typeof constraints?.city === "string" ? constraints.city : "Abidjan";
    const leads = Array.from({ length: 10 }, (_, idx) => ({
      name: syntheticLeadName(task.id * 31 + idx),
      cityTag: city,
      note: "Synthetic lead (no real business data).",
    }));
    await writeLog({
      action: "client_hunter.synthetic_leads",
      status: "ok",
      outputSummary: `Generated ${leads.length} synthetic leads for ${city}.`,
      metadata: { leads },
    });
    callsUsed += 1;
    stepsExecuted += 1;
    await commitProgress();
  }

  if (agent === "media") {
    const guard = ensureBudget(0, 0);
    if (!guard.ok) return await fail(`Stop condition hit: ${guard.reason}`);
    const productId = toInt(constraints?.productId);
    const summary = productId
      ? `Media brief ready for productId=${productId}. Use multi-angle generation (base prompt constant, vary angle).`
      : "Media brief ready. Provide constraints.productId to generate a product image set.";
    await writeLog({
      action: "media.image_brief",
      status: "ok",
      outputSummary: summary,
      metadata: { productId: productId ?? null },
    });
    callsUsed += 1;
    stepsExecuted += 1;
    await commitProgress();
  }

  if (agent === "data") {
    const guard = ensureBudget(0, 0);
    if (!guard.ok) return await fail(`Stop condition hit: ${guard.reason}`);
    await writeLog({
      action: "data.admin.ia.audit",
      status: "ok",
      outputSummary: "Use /api/admin/ia/audit to review duplicate admin pages and redirects.",
    });
    callsUsed += 1;
    stepsExecuted += 1;
    await commitProgress();
  }

  const finishedAt = new Date();
  await db.update(agentTasks).set({ status: "completed", finishedAt, updatedAt: finishedAt }).where(eq(agentTasks.id, task.id));

  return { ok: true, taskId: task.id, status: "completed", logs };
}
