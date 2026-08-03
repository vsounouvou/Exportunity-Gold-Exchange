import { Router } from "express";
import { db } from "@db";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";
import { getDepartmentByPageKey, DEPARTMENT_REGISTRY } from "../src/departments/DepartmentRegistry";
import { generateAgentResponse } from "../lib/ai-provider";

const router = Router();

const SKILL_CATEGORIES = [
  {
    key: "operations",
    label: "Operations",
    skills: ["SLA enforcement", "Task triage", "Escalation handling", "Execution tracking"],
  },
  {
    key: "analytics",
    label: "Analytics",
    skills: ["KPI interpretation", "Trend analysis", "Root cause analysis", "Report synthesis"],
  },
  {
    key: "customer",
    label: "Customer",
    skills: ["Issue resolution", "Empathetic communication", "Policy explanation", "Follow-up discipline"],
  },
  {
    key: "compliance",
    label: "Compliance",
    skills: ["Policy checks", "Audit logging", "Risk flagging", "Approval gating"],
  },
  {
    key: "automation",
    label: "Automation",
    skills: ["Workflow design", "Action orchestration", "Idempotent retries", "System integration"],
  },
] as const;

const MEMORY_TEMPLATES = [
  {
    key: "customer_voice",
    label: "Customer Voice",
    type: "customer",
    tags: ["customer", "tone", "communication"],
    content: "Preferred customer communication style, red flags, and escalation expectations.",
  },
  {
    key: "department_sop",
    label: "Department SOP",
    type: "operations",
    tags: ["sop", "operations", "policy"],
    content: "Department operating procedure with required checkpoints and approval gates.",
  },
  {
    key: "risk_guardrail",
    label: "Risk Guardrail",
    type: "compliance",
    tags: ["risk", "compliance", "guardrail"],
    content: "Non-negotiable guardrail the agent must enforce before any completion claim.",
  },
  {
    key: "sales_playbook",
    label: "Sales Playbook",
    type: "marketplace",
    tags: ["sales", "marketplace", "conversion"],
    content: "Commercial playbook with qualification, objection handling, and close criteria.",
  },
  {
    key: "incident_postmortem",
    label: "Incident Postmortem",
    type: "security",
    tags: ["incident", "postmortem", "learning"],
    content: "Incident learnings, failed assumptions, and prevention checklist for future runs.",
  },
] as const;

function isFeatureEnabled(name: string, defaultValue = true) {
  const raw = String((process.env as Record<string, string | undefined>)[name] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw);
}

function tenantIdFromReq(req: any) {
  const value = Number(req?.tenant?.id || 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function parsePositiveInt(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function parsePositiveLimit(value: unknown, fallback = 50, max = 200) {
  const parsed = parsePositiveInt(value);
  if (!parsed) return fallback;
  return Math.min(parsed, max);
}

function parseBooleanInput(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function normalizeStringList(input: unknown, max = 50) {
  if (!Array.isArray(input)) return [];
  const set = new Set<string>();
  for (const raw of input) {
    const value = String(raw || "").trim();
    if (!value) continue;
    set.add(value);
    if (set.size >= max) break;
  }
  return Array.from(set);
}

function normalizeMemoryType(input: unknown) {
  const value = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/\s+/g, "_");
  if (!value) return "note";
  return value.slice(0, 40);
}

function extractAgentToolsEnabled(agent: any) {
  if (Array.isArray(agent?.tools_enabled_json)) {
    return agent.tools_enabled_json.map((item: unknown) => String(item || "").trim()).filter(Boolean);
  }
  if (Array.isArray(agent?.toolsEnabled)) {
    return agent.toolsEnabled.map((item: unknown) => String(item || "").trim()).filter(Boolean);
  }
  if (Array.isArray(agent?.metadata?.toolsEnabled)) {
    return agent.metadata.toolsEnabled.map((item: unknown) => String(item || "").trim()).filter(Boolean);
  }
  return [];
}

async function getTenantAgent(tenantId: number, agentId: number) {
  const result = await db.execute(sql`
    select a.*
    from agents a
    where a.id = ${agentId}
      and ${tenantAgentScopePredicate(tenantId)}
    limit 1
  `);
  return rows<any>(result)[0] || null;
}

function normalizeHistoryEntryType(input: unknown) {
  const value = String(input || "").trim().toUpperCase();
  if (value === "TEST") return "TEST";
  if (value === "CHAT") return "CHAT";
  return null;
}

function decodeSessionId(input: unknown) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizePromptHistory(input: unknown, maxPairs = 20) {
  if (!Array.isArray(input)) return [] as Array<{ role: "user" | "assistant"; content: string }>;
  return input
    .map((row) => ({
      role: String((row as any)?.role || "user").trim().toLowerCase() === "assistant" ? "assistant" : "user",
      content: String((row as any)?.content || "").trim(),
    }))
    .filter((row) => row.content.length > 0)
    .slice(-(maxPairs * 2));
}

function normalizeDomain(input: unknown) {
  const value = String(input || "").trim().toUpperCase();
  if (value === "MARKETPLACE") return "MARKETPLACE";
  return "INTERNAL";
}

function normalizeStatus(input: unknown) {
  const value = String(input || "").trim().toUpperCase();
  if (value === "PAUSED") return "PAUSED";
  if (value === "ARCHIVED") return "ARCHIVED";
  return "ACTIVE";
}

function toStatusV2(agentStatus: unknown) {
  const raw = String(agentStatus || "").trim().toLowerCase();
  if (raw === "paused") return "PAUSED";
  if (raw === "archived") return "ARCHIVED";
  if (raw === "inactive") return "PAUSED";
  return "ACTIVE";
}

function tenantAgentScopePredicate(tenantId: number) {
  const tenantIdText = String(tenantId);
  return sql`
    (
      a.tenant_id = ${tenantId}
      or coalesce(a.metadata->>'tenantId', '') = ${tenantIdText}
    )
  `;
}

router.use(ensureTenantStaff);

router.get("/agents", async (req: any, res, next) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return next();
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });

    const domain = String(req.query?.domain || "").trim().toUpperCase();
    const departmentKey = String(req.query?.departmentKey || req.query?.department_key || "")
      .trim()
      .toLowerCase();
    const statusRaw = String(req.query?.status || "").trim();
    const status = normalizeStatus(statusRaw);

    const whereDomain =
      domain === "MARKETPLACE" || domain === "INTERNAL"
        ? sql`upper(trim(coalesce(a.domain, 'INTERNAL'))) = ${domain}`
        : sql`true`;
    const whereDepartment = departmentKey ? sql`lower(coalesce(a.department_key, '')) = ${departmentKey}` : sql`true`;
    const whereStatus = !statusRaw
      ? sql`true`
      : status === "PAUSED"
        ? sql`lower(coalesce(a.status, 'active')) in ('paused', 'inactive')`
        : status === "ARCHIVED"
          ? sql`lower(coalesce(a.status, 'active')) = 'archived'`
          : sql`lower(coalesce(a.status, 'active')) = 'active'`;

    const result = await db.execute(sql`
      select
        a.*,
        coalesce((
          select count(*)
          from tasks t
          where t.agent_id = a.id
            and lower(coalesce(t.status, '')) not in ('completed', 'cancelled')
        ), 0)::int as open_tasks_count,
        null::timestamptz as last_workstation_started_at,
        null::timestamptz as last_action_at
      from agents a
      where ${tenantAgentScopePredicate(tenantId)}
        and ${whereDomain}
        and ${whereDepartment}
        and ${whereStatus}
      order by coalesce(a.updated_at, a.created_at) desc
      limit 500
    `);

    const items = rows<any>(result).map((row) => ({
      ...row,
      domain: normalizeDomain(row.domain),
      statusV2: toStatusV2(row.status),
      reliabilityScore: null,
    }));
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list agents" });
  }
});

router.get("/agents/:id/profile", async (req: any, res, next) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return next();
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    const agentRows = await db.execute(sql`
      select a.*
      from agents a
      where a.id = ${agentId}
        and ${tenantAgentScopePredicate(tenantId)}
      limit 1
    `);
    const agent = rows<any>(agentRows)[0];
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const [actionsSummary] = rows<any>(
      await db.execute(sql`
        select
          count(*)::int as total,
          count(*) filter (where upper(coalesce(outcome, '')) = 'SUCCESS')::int as success_count,
          count(*) filter (where upper(coalesce(outcome, '')) = 'FAILED')::int as failed_count,
          count(*) filter (where upper(coalesce(outcome, '')) = 'NO_EFFECT')::int as no_effect_count
        from agent_action_runs
        where tenant_id = ${tenantId}
          and agent_id = ${agentId}
      `),
    ) || [{ total: 0, success_count: 0, failed_count: 0, no_effect_count: 0 }];

    const actionRuns = rows<any>(
      await db.execute(sql`
        select id, action_key, status, outcome, mode, correlation_id, created_at
        from agent_action_runs
        where tenant_id = ${tenantId}
          and agent_id = ${agentId}
        order by created_at desc
        limit 20
      `),
    );

    const meetings = rows<any>(
      await db.execute(sql`
        select id, meeting_id, role, status, attended_at
        from agent_meeting_attendance
        where tenant_id = ${tenantId}
          and agent_id = ${agentId}
        order by attended_at desc
        limit 20
      `),
    );

    const tasks = rows<any>(
      await db.execute(sql`
        select id, status, priority, created_at, updated_at
        from agent_task_assignments
        where agent_id = ${agentId}
        order by updated_at desc
        limit 20
      `),
    );

    const workstations = rows<any>(
      await db.execute(sql`
        select id, workstation_id, started_at, ended_at, status, active_tab, last_activity_at
        from agent_workstation_sessions
        where tenant_id = ${tenantId}
          and agent_id = ${agentId}
        order by started_at desc
        limit 20
      `),
    );

    const manager = rows<any>(
      await db.execute(sql`
        select dm.page_key, dm.manager_agent_id, a2.name as manager_name
        from department_managers dm
        join agents a2 on a2.id = dm.manager_agent_id
        where dm.tenant_id = ${tenantId}
          and dm.manager_agent_id = ${agentId}
      `),
    );

    return res.json({
      ok: true,
      overview: {
        ...agent,
        domain: normalizeDomain(agent.domain),
        statusV2: toStatusV2(agent.status),
        toolsEnabled: extractAgentToolsEnabled(agent),
      },
      performance: {
        total: Number(actionsSummary.total || 0),
        successCount: Number(actionsSummary.success_count || 0),
        failedCount: Number(actionsSummary.failed_count || 0),
        noEffectCount: Number(actionsSummary.no_effect_count || 0),
      },
      activity: {
        actionRuns,
        meetings,
        tasks,
        workstations,
      },
      managerOfPages: manager,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch agent profile" });
  }
});

router.get("/agents/:id/activity", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const rangeRaw = String(req.query?.range || "30d").trim().toLowerCase();
    const days = Number.parseInt(rangeRaw.replace(/[^\d]/g, ""), 10);
    const windowDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;

    const result = await db.execute(sql`
      with window_start as (
        select now() - (${windowDays} || ' days')::interval as ts
      )
      select 'action' as source, ar.id::text as source_id, ar.created_at as ts, jsonb_build_object(
        'action_key', ar.action_key,
        'status', ar.status,
        'outcome', ar.outcome,
        'correlation_id', ar.correlation_id
      ) as payload
      from agent_action_runs ar, window_start ws
      where ar.tenant_id = ${tenantId}
        and ar.agent_id = ${agentId}
        and ar.created_at >= ws.ts
      union all
      select 'meeting' as source, am.id::text as source_id, am.attended_at as ts, jsonb_build_object(
        'meeting_id', am.meeting_id,
        'role', am.role,
        'status', am.status
      ) as payload
      from agent_meeting_attendance am, window_start ws
      where am.tenant_id = ${tenantId}
        and am.agent_id = ${agentId}
        and am.attended_at >= ws.ts
      union all
      select 'task' as source, at.id::text as source_id, at.updated_at as ts, jsonb_build_object(
        'status', at.status,
        'priority', at.priority
      ) as payload
      from agent_task_assignments at, window_start ws
      where at.agent_id = ${agentId}
        and at.updated_at >= ws.ts
      union all
      select 'workstation' as source, aws.id::text as source_id, aws.started_at as ts, jsonb_build_object(
        'workstation_id', aws.workstation_id,
        'status', aws.status,
        'ended_at', aws.ended_at
      ) as payload
      from agent_workstation_sessions aws, window_start ws
      where aws.tenant_id = ${tenantId}
        and aws.agent_id = ${agentId}
        and aws.started_at >= ws.ts
      order by ts desc
      limit 500
    `);

    return res.json({ ok: true, items: rows(result), rangeDays: windowDays });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch activity" });
  }
});

router.get("/agents/:id/meetings", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const result = await db.execute(sql`
      select *
      from agent_meeting_attendance
      where tenant_id = ${tenantId}
        and agent_id = ${agentId}
      order by attended_at desc
      limit 200
    `);
    return res.json({ ok: true, items: rows(result) });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch meetings" });
  }
});

router.get("/agents/:id/tasks", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const result = await db.execute(sql`
      select *
      from agent_task_assignments
      where agent_id = ${agentId}
      order by updated_at desc
      limit 200
    `);
    return res.json({ ok: true, items: rows(result) });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch tasks" });
  }
});

router.get("/agents/:id/action-runs", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const result = await db.execute(sql`
      select *
      from agent_action_runs
      where tenant_id = ${tenantId}
        and agent_id = ${agentId}
      order by created_at desc
      limit 200
    `);
    return res.json({ ok: true, items: rows(result) });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch action runs" });
  }
});

router.get("/agents/:id/workstations", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const result = await db.execute(sql`
      select *
      from agent_workstation_sessions
      where tenant_id = ${tenantId}
        and agent_id = ${agentId}
      order by started_at desc
      limit 200
    `);
    return res.json({ ok: true, items: rows(result) });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch workstation sessions" });
  }
});

router.get("/agents/catalog/skills", async (_req: any, res) => {
  return res.json({ ok: true, items: SKILL_CATEGORIES });
});

router.get("/agents/catalog/memory-templates", async (_req: any, res) => {
  return res.json({ ok: true, items: MEMORY_TEMPLATES });
});

router.get("/agents/:id/history", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const type = normalizeHistoryEntryType(req.query?.type || req.query?.entryType);
    const sessionIdRaw = String(req.query?.sessionId || "").trim();
    const sessionId = sessionIdRaw.length > 0 ? sessionIdRaw : null;
    const limit = parsePositiveLimit(req.query?.limit, 80, 300);
    const includeMetadata = String(req.query?.includeMetadata || "").trim().toLowerCase() === "true";

    const whereType = type ? sql`h.entry_type = ${type}` : sql`true`;
    const whereSession = sessionId ? sql`h.session_id = ${sessionId}` : sql`true`;
    const result = await db.execute(sql`
      select
        h.id,
        h.entry_type,
        h.session_id,
        h.prompt,
        h.response,
        h.analysis,
        h.history_json,
        h.metadata,
        h.created_by_user_id,
        h.created_by_agent_id,
        h.created_at
      from agent_profile_history h
      where h.tenant_id = ${tenantId}
        and h.agent_id = ${agentId}
        and ${whereType}
        and ${whereSession}
      order by h.created_at desc
      limit ${limit}
    `);
    const items = rows<any>(result).map((row) =>
      includeMetadata
        ? row
        : {
            ...row,
            metadata: {},
          },
    );
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch agent history" });
  }
});

router.get("/agents/:id/chat-sessions", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const includeArchived = String(req.query?.includeArchived || "").trim().toLowerCase() === "true";
    const limit = parsePositiveLimit(req.query?.limit, 100, 300);

    const historyAgg = rows<any>(
      await db.execute(sql`
        select
          h.session_id,
          max(h.created_at) as last_message_at,
          count(*)::int as entry_count
        from agent_profile_history h
        where h.tenant_id = ${tenantId}
          and h.agent_id = ${agentId}
          and h.entry_type = 'CHAT'
          and h.session_id is not null
        group by h.session_id
      `),
    );

    const sessions = rows<any>(
      await db.execute(sql`
        select
          s.session_id,
          s.title,
          s.archived,
          s.metadata,
          s.last_message_at,
          s.created_at,
          s.updated_at
        from agent_profile_chat_sessions s
        where s.tenant_id = ${tenantId}
          and s.agent_id = ${agentId}
        order by s.last_message_at desc
        limit ${limit}
      `),
    );

    const byId = new Map<
      string,
      {
        session_id: string;
        title: string | null;
        archived: boolean;
        metadata: Record<string, unknown>;
        last_message_at: string | null;
        created_at: string | null;
        updated_at: string | null;
        entry_count: number;
      }
    >();

    for (const row of historyAgg) {
      const id = String(row?.session_id || "").trim();
      if (!id) continue;
      byId.set(id, {
        session_id: id,
        title: `Thread ${id.slice(0, 8)}`,
        archived: false,
        metadata: {},
        last_message_at: row?.last_message_at || null,
        created_at: null,
        updated_at: null,
        entry_count: Number(row?.entry_count || 0),
      });
    }

    for (const row of sessions) {
      const id = String(row?.session_id || "").trim();
      if (!id) continue;
      const existing = byId.get(id);
      byId.set(id, {
        session_id: id,
        title: String(row?.title || "").trim() || existing?.title || `Thread ${id.slice(0, 8)}`,
        archived: Boolean(row?.archived),
        metadata: (row?.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>,
        last_message_at: (row?.last_message_at || existing?.last_message_at || null) as string | null,
        created_at: (row?.created_at || existing?.created_at || null) as string | null,
        updated_at: (row?.updated_at || existing?.updated_at || null) as string | null,
        entry_count: Number(existing?.entry_count || 0),
      });
    }

    const items = Array.from(byId.values())
      .filter((row) => includeArchived || !row.archived)
      .sort((a, b) => {
        const aTs = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bTs = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bTs - aTs;
      })
      .slice(0, limit);

    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch chat sessions" });
  }
});

router.patch("/agents/:id/chat-sessions/:sessionId", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const sessionId = decodeSessionId(req.params?.sessionId);
    if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, "title");
    const hasArchived = Object.prototype.hasOwnProperty.call(req.body || {}, "archived");
    if (!hasTitle && !hasArchived) {
      return res.status(400).json({ message: "title or archived required" });
    }

    const requestedTitle = hasTitle ? String(req.body?.title || "").trim().slice(0, 120) : null;
    const archivedInput = hasArchived ? parseBooleanInput(req.body?.archived) : null;
    if (hasArchived && archivedInput == null) {
      return res.status(400).json({ message: "Invalid archived value" });
    }

    const existing = rows<any>(
      await db.execute(sql`
        select *
        from agent_profile_chat_sessions s
        where s.tenant_id = ${tenantId}
          and s.agent_id = ${agentId}
          and s.session_id = ${sessionId}
        limit 1
      `),
    )[0];

    const historyExists = rows<any>(
      await db.execute(sql`
        select 1
        from agent_profile_history h
        where h.tenant_id = ${tenantId}
          and h.agent_id = ${agentId}
          and h.entry_type = 'CHAT'
          and h.session_id = ${sessionId}
        limit 1
      `),
    )[0];

    if (!existing && !historyExists) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (!existing) {
      await db.execute(sql`
        insert into agent_profile_chat_sessions (
          tenant_id,
          agent_id,
          session_id,
          title,
          archived,
          metadata,
          last_message_at,
          created_by_user_id,
          created_at,
          updated_at
        )
        values (
          ${tenantId},
          ${agentId},
          ${sessionId},
          ${requestedTitle || `Thread ${sessionId.slice(0, 8)}`},
          ${Boolean(archivedInput)},
          '{}'::jsonb,
          now(),
          ${req.adminUser?.id ? Number(req.adminUser.id) : null},
          now(),
          now()
        )
      `);
    } else {
      await db.execute(sql`
        update agent_profile_chat_sessions
        set
          title = ${hasTitle ? requestedTitle || `Thread ${sessionId.slice(0, 8)}` : existing.title},
          archived = ${hasArchived ? Boolean(archivedInput) : Boolean(existing.archived)},
          updated_at = now()
        where tenant_id = ${tenantId}
          and agent_id = ${agentId}
          and session_id = ${sessionId}
      `);
    }

    const updated = rows<any>(
      await db.execute(sql`
        select
          s.session_id,
          s.title,
          s.archived,
          s.metadata,
          s.last_message_at,
          s.created_at,
          s.updated_at
        from agent_profile_chat_sessions s
        where s.tenant_id = ${tenantId}
          and s.agent_id = ${agentId}
          and s.session_id = ${sessionId}
        limit 1
      `),
    )[0];

    return res.json({ ok: true, item: updated || null });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update chat session" });
  }
});

router.get("/agents/:id/memory", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const includeInactive = String(req.query?.includeInactive || "").trim().toLowerCase() === "true";
    const memoryRows = rows<any>(
      await db.execute(sql`
        select
          c.clue_id as id,
          c.scope,
          c.type,
          c.content,
          c.tags,
          c.confidence,
          c.pinned,
          c.evidence_ref,
          c.expires_at,
          c.created_at,
          c.updated_at,
          (c.expires_at is null or c.expires_at > now()) as is_active
        from clues c
        where c.agent_id = ${agentId}
          and c.scope = 'personal'
          and (${includeInactive}::boolean = true or c.expires_at is null or c.expires_at > now())
        order by c.updated_at desc, c.created_at desc
        limit 500
      `),
    );

    return res.json({ ok: true, items: memoryRows });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch agent memory" });
  }
});

router.post("/agents/:id/memory", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ message: "content required" });
    const type = normalizeMemoryType(req.body?.type || req.body?.category);
    const tags = normalizeStringList(req.body?.tags, 25);
    const confidenceRaw = Number.parseFloat(String(req.body?.confidence ?? ""));
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0.7;
    const pinned = Boolean(req.body?.pinned);
    const evidenceRef = String(req.body?.source || req.body?.evidenceRef || "manual_profile_entry").trim().slice(0, 200) || null;

    const inserted = rows<any>(
      await db.execute(sql`
        insert into clues (
          scope,
          agent_id,
          company_id,
          department_id,
          type,
          content,
          tags,
          confidence,
          pinned,
          evidence_ref,
          created_at,
          updated_at
        )
        values (
          'personal',
          ${agentId},
          ${agent.company_id || null},
          ${agent.department_id || null},
          ${type},
          ${content},
          ${JSON.stringify(tags)}::jsonb,
          ${confidence},
          ${pinned},
          ${evidenceRef},
          now(),
          now()
        )
        returning
          clue_id as id,
          scope,
          type,
          content,
          tags,
          confidence,
          pinned,
          evidence_ref,
          expires_at,
          created_at,
          updated_at,
          (expires_at is null or expires_at > now()) as is_active
      `),
    )[0];

    return res.status(201).json({ ok: true, item: inserted || null });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to create memory entry" });
  }
});

router.patch("/agents/:id/memory/:memoryId", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    const memoryId = parsePositiveInt(req.params?.memoryId);
    if (!agentId || !memoryId) return res.status(400).json({ message: "Invalid id" });

    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const current = rows<any>(
      await db.execute(sql`
        select *
        from clues
        where clue_id = ${memoryId}
          and agent_id = ${agentId}
          and scope = 'personal'
        limit 1
      `),
    )[0];
    if (!current) return res.status(404).json({ message: "Memory entry not found" });

    const content =
      typeof req.body?.content === "string"
        ? req.body.content.trim()
        : String(current.content || "");
    const type =
      req.body?.type != null || req.body?.category != null
        ? normalizeMemoryType(req.body?.type || req.body?.category)
        : String(current.type || "note");
    const tags =
      req.body?.tags != null
        ? normalizeStringList(req.body?.tags, 25)
        : Array.isArray(current.tags)
          ? current.tags
          : [];
    const confidenceRaw =
      req.body?.confidence != null
        ? Number.parseFloat(String(req.body?.confidence))
        : Number.parseFloat(String(current.confidence || ""));
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0.7;
    const pinned = req.body?.pinned != null ? Boolean(req.body?.pinned) : Boolean(current.pinned);
    const hasActive = req.body?.active != null;
    const expiresAt = hasActive ? (Boolean(req.body?.active) ? null : new Date()) : current.expires_at || null;

    const updated = rows<any>(
      await db.execute(sql`
        update clues
        set
          type = ${type},
          content = ${content},
          tags = ${JSON.stringify(tags)}::jsonb,
          confidence = ${confidence},
          pinned = ${pinned},
          expires_at = ${expiresAt},
          updated_at = now()
        where clue_id = ${memoryId}
          and agent_id = ${agentId}
          and scope = 'personal'
        returning
          clue_id as id,
          scope,
          type,
          content,
          tags,
          confidence,
          pinned,
          evidence_ref,
          expires_at,
          created_at,
          updated_at,
          (expires_at is null or expires_at > now()) as is_active
      `),
    )[0];

    return res.json({ ok: true, item: updated || null });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update memory entry" });
  }
});

router.delete("/agents/:id/memory/:memoryId", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    const memoryId = parsePositiveInt(req.params?.memoryId);
    if (!agentId || !memoryId) return res.status(400).json({ message: "Invalid id" });

    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const deleted = rows<any>(
      await db.execute(sql`
        delete from clues
        where clue_id = ${memoryId}
          and agent_id = ${agentId}
          and scope = 'personal'
        returning clue_id as id
      `),
    )[0];
    if (!deleted) return res.status(404).json({ message: "Memory entry not found" });

    return res.json({ ok: true, deletedId: Number(deleted.id || memoryId) });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to delete memory entry" });
  }
});

router.get("/agents/:id/skills", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const skills = Array.isArray(agent.skills)
      ? agent.skills.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [];

    return res.json({ ok: true, skills });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch agent skills" });
  }
});

router.patch("/agents/:id/skills", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const action = String(req.body?.action || "set").trim().toLowerCase();
    const current = Array.isArray(agent.skills)
      ? agent.skills.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [];
    let nextSkills = [...current];
    if (action === "add") {
      const added = String(req.body?.skill || "").trim();
      if (!added) return res.status(400).json({ message: "skill required for add" });
      nextSkills = normalizeStringList([...current, added], 100);
    } else if (action === "remove") {
      const removed = String(req.body?.skill || "").trim().toLowerCase();
      if (!removed) return res.status(400).json({ message: "skill required for remove" });
      nextSkills = current.filter((item: string) => item.toLowerCase() !== removed);
    } else {
      nextSkills = normalizeStringList(req.body?.skills, 100);
    }

    const updated = rows<any>(
      await db.execute(sql`
        update agents
        set skills = ${JSON.stringify(nextSkills)}::jsonb, updated_at = now()
        where id = ${agentId}
          and ${tenantAgentScopePredicate(tenantId)}
        returning id, skills, updated_at
      `),
    )[0];

    return res.json({ ok: true, skills: Array.isArray(updated?.skills) ? updated.skills : [] });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update skills" });
  }
});

async function runProfileAgentPrompt(input: {
  agent: any;
  prompt: string;
  history: Array<{ role: string; content: string }>;
}) {
  const metadata =
    input.agent?.metadata && typeof input.agent.metadata === "object" && !Array.isArray(input.agent.metadata)
      ? input.agent.metadata
      : {};
  const recentMessages = input.history
    .slice(-8)
    .map((item) => ({
      content: String(item.content || "").slice(0, 1200),
      fromAgent: {
        name: item.role === "assistant" ? String(input.agent.name || "Assistant") : "User",
        role: item.role === "assistant" ? String(input.agent.role || "Assistant") : "Human",
      },
      timestamp: new Date(),
    }));

  const start = Date.now();
  const result = await generateAgentResponse(input.prompt, {
    role: String(input.agent.role || "Assistant"),
    agentId: Number(input.agent.id),
    companyId: input.agent.company_id ? Number(input.agent.company_id) : null,
    context: {
      recentMessages,
      roomName: "Agent Profile Direct Chat",
      roomType: "direct_profile_chat",
      activeAgents: [String(input.agent.name || "Agent")],
      agentDirectory: [{ id: Number(input.agent.id), name: String(input.agent.name || "Agent"), role: String(input.agent.role || "Assistant") }],
      companyContext: String(metadata.companyContext || "").trim() || undefined,
      agentMission: String(input.agent.mission || "").trim() || undefined,
      agentResponsibilities: Array.isArray(input.agent.responsibilities)
        ? input.agent.responsibilities.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : undefined,
      approvalRules:
        input.agent.approvalRules && typeof input.agent.approvalRules === "object" && !Array.isArray(input.agent.approvalRules)
          ? input.agent.approvalRules
          : undefined,
    },
  });

  return {
    response: String(result?.response || "").trim(),
    analysis: String(result?.analysis || "").trim(),
    shouldContinue: Boolean(result?.shouldContinue),
    durationMs: Date.now() - start,
  };
}

async function loadChatSessionHistory(
  tenantId: number,
  agentId: number,
  sessionId: string,
  limit = 20,
) {
  if (!sessionId.trim()) return [] as Array<{ role: "user" | "assistant"; content: string }>;
  const rowsHistory = rows<any>(
    await db.execute(sql`
      select prompt, response
      from agent_profile_history
      where tenant_id = ${tenantId}
        and agent_id = ${agentId}
        and entry_type = 'CHAT'
        and session_id = ${sessionId}
      order by created_at asc
      limit ${Math.max(1, Math.min(limit, 50))}
    `),
  );
  const built: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const row of rowsHistory) {
    const prompt = String(row?.prompt || "").trim();
    const response = String(row?.response || "").trim();
    if (prompt) built.push({ role: "user", content: prompt });
    if (response) built.push({ role: "assistant", content: response });
  }
  return built.slice(-40);
}

async function insertAgentProfileHistoryEntry(input: {
  tenantId: number;
  agentId: number;
  entryType: "TEST" | "CHAT";
  sessionId?: string | null;
  prompt: string;
  response?: string | null;
  analysis?: string | null;
  historyJson?: unknown;
  metadata?: unknown;
  createdByUserId?: number | null;
  createdByAgentId?: number | null;
}) {
  const inserted = rows<any>(
    await db.execute(sql`
      insert into agent_profile_history (
        tenant_id,
        agent_id,
        entry_type,
        session_id,
        prompt,
        response,
        analysis,
        history_json,
        metadata,
        created_by_user_id,
        created_by_agent_id,
        created_at
      )
      values (
        ${input.tenantId},
        ${input.agentId},
        ${input.entryType},
        ${input.sessionId || null},
        ${input.prompt},
        ${input.response || null},
        ${input.analysis || null},
        ${JSON.stringify(input.historyJson ?? [])}::jsonb,
        ${JSON.stringify(input.metadata ?? {})}::jsonb,
        ${input.createdByUserId || null},
        ${input.createdByAgentId || null},
        now()
      )
      returning
        id,
        entry_type,
        session_id,
        prompt,
        response,
        analysis,
        history_json,
        metadata,
        created_by_user_id,
        created_by_agent_id,
        created_at
    `),
  )[0];
  return inserted || null;
}

router.post("/agents/:id/test", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) return res.status(400).json({ message: "prompt required" });

    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const history = normalizePromptHistory(req.body?.history, 12);

    const result = await runProfileAgentPrompt({ agent, prompt, history });
    const persistedEntry = await insertAgentProfileHistoryEntry({
      tenantId,
      agentId,
      entryType: "TEST",
      prompt,
      response: result.response,
      analysis: result.analysis,
      historyJson: history,
      metadata: {
        durationMs: result.durationMs,
        shouldContinue: result.shouldContinue,
        runtimeModel: agent.runtime_model || null,
        toolsEnabled: extractAgentToolsEnabled(agent),
      },
      createdByUserId: req.staffUser?.id ? Number(req.staffUser.id) : null,
    });

    return res.json({
      ok: true,
      result: {
        mode: "test",
        prompt,
        response: result.response,
        analysis: result.analysis,
        durationMs: result.durationMs,
        shouldContinue: result.shouldContinue,
        runtimeModel: agent.runtime_model || null,
        toolsEnabled: extractAgentToolsEnabled(agent),
      },
      historyEntry: persistedEntry,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to run ability test" });
  }
});

router.post("/agents/:id/chat", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const prompt = String(req.body?.message || req.body?.prompt || "").trim();
    if (!prompt) return res.status(400).json({ message: "message required" });

    const agent = await getTenantAgent(tenantId, agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const sessionIdRaw = String(req.body?.sessionId || req.body?.session_id || "").trim();
    const sessionId = sessionIdRaw || randomUUID();
    let history = normalizePromptHistory(req.body?.history, 20);
    if (history.length === 0 && sessionIdRaw) {
      history = await loadChatSessionHistory(tenantId, agentId, sessionIdRaw, 20);
    }
    const result = await runProfileAgentPrompt({ agent, prompt, history });
    const persistedEntry = await insertAgentProfileHistoryEntry({
      tenantId,
      agentId,
      entryType: "CHAT",
      sessionId,
      prompt,
      response: result.response,
      analysis: result.analysis,
      historyJson: history,
      metadata: {
        durationMs: result.durationMs,
        shouldContinue: result.shouldContinue,
      },
      createdByUserId: req.staffUser?.id ? Number(req.staffUser.id) : null,
    });

    await db.execute(sql`
      insert into agent_profile_chat_sessions (
        tenant_id,
        agent_id,
        session_id,
        title,
        archived,
        metadata,
        last_message_at,
        created_by_user_id,
        created_at,
        updated_at
      )
      values (
        ${tenantId},
        ${agentId},
        ${sessionId},
        ${`Thread ${sessionId.slice(0, 8)}`},
        false,
        '{}'::jsonb,
        now(),
        ${req.staffUser?.id ? Number(req.staffUser.id) : null},
        now(),
        now()
      )
      on conflict (tenant_id, agent_id, session_id)
      do update set
        title = coalesce(agent_profile_chat_sessions.title, excluded.title),
        last_message_at = excluded.last_message_at,
        updated_at = now()
    `);
    return res.json({
      ok: true,
      sessionId,
      reply: {
        role: "assistant",
        content: result.response,
        analysis: result.analysis,
        durationMs: result.durationMs,
      },
      historyEntry: persistedEntry,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to chat with agent" });
  }
});

router.patch("/agents/:id/runtime-model", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MODEL_SELECTOR", true)) {
      return res.status(403).json({ message: "FEATURE_AGENT_MODEL_SELECTOR disabled" });
    }
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const agentId = parsePositiveInt(req.params?.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    const runtimeModel = String(req.body?.runtimeModel || req.body?.runtime_model || "").trim();
    if (!runtimeModel) return res.status(400).json({ message: "runtimeModel required" });
    const toolsEnabled = Array.isArray(req.body?.toolsEnabled)
      ? req.body.toolsEnabled.map((item: any) => String(item || "").trim()).filter(Boolean).slice(0, 100)
      : [];
    const modelProvider = String(req.body?.modelProvider || "").trim().toLowerCase() || null;
    const temperatureRaw = Number.parseFloat(String(req.body?.temperature ?? ""));
    const temperature =
      Number.isFinite(temperatureRaw) && temperatureRaw >= 0 && temperatureRaw <= 2
        ? temperatureRaw
        : null;
    const hardMode = req.body?.hardMode == null ? null : Boolean(req.body?.hardMode);

    const beforeResult = await db.execute(sql`
      select id, runtime_model, tools_enabled_json, metadata
      from agents
      where id = ${agentId}
        and ${tenantAgentScopePredicate(tenantId)}
      limit 1
    `);
    const before = rows<any>(beforeResult)[0];
    if (!before) return res.status(404).json({ message: "Agent not found" });

    await db.execute(sql`
      update agents
      set
        runtime_model = ${runtimeModel},
        tools_enabled_json = ${JSON.stringify(toolsEnabled)}::jsonb,
        metadata = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  coalesce(metadata, '{}'::jsonb),
                  '{runtimeModel}',
                  to_jsonb(${runtimeModel}::text),
                  true
                ),
                '{toolsEnabled}',
                ${JSON.stringify(toolsEnabled)}::jsonb,
                true
              ),
              '{modelProvider}',
              case when ${modelProvider}::text is null then 'null'::jsonb else to_jsonb(${modelProvider}::text) end,
              true
            ),
            '{temperature}',
            case when ${temperature}::numeric is null then 'null'::jsonb else to_jsonb(${temperature}::numeric) end,
            true
          ),
          '{hardMode}',
          case when ${hardMode}::boolean is null then 'null'::jsonb else to_jsonb(${hardMode}::boolean) end,
          true
        ),
        updated_at = now()
      where id = ${agentId}
        and ${tenantAgentScopePredicate(tenantId)}
    `);

    await db.execute(sql`
      insert into agent_config_changes (
        tenant_id,
        agent_id,
        changed_by_user_id,
        before_json,
        after_json,
        reason,
        created_at
      )
      values (
        ${tenantId},
        ${agentId},
        ${req.adminUser?.id ? Number(req.adminUser.id) : null},
        ${JSON.stringify(before)}::jsonb,
        ${JSON.stringify({ runtimeModel, toolsEnabled, modelProvider, temperature, hardMode })}::jsonb,
        ${String(req.body?.reason || "runtime_model_update")},
        now()
      )
    `);

    const afterResult = await db.execute(sql`
      select *
      from agents
      where id = ${agentId}
        and ${tenantAgentScopePredicate(tenantId)}
      limit 1
    `);
    return res.json({ ok: true, agent: rows<any>(afterResult)[0] || null });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update runtime model" });
  }
});

router.post("/agents/internal/create", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_AGENT_MGMT_V2", true)) return res.status(404).json({ message: "Feature disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "name required" });

    const role = String(req.body?.role || "").trim() || "Operations Agent";
    const departmentKey = String(req.body?.departmentKey || req.body?.department_key || "operations").trim().toLowerCase();
    const runtimeModel = String(req.body?.runtimeModel || req.body?.runtime_model || "").trim() || null;
    const toolsEnabled = Array.isArray(req.body?.toolsEnabled)
      ? req.body.toolsEnabled.map((item: any) => String(item || "").trim()).filter(Boolean).slice(0, 200)
      : [];

    const result = await db.execute(sql`
      insert into agents (
        tenant_id,
        name,
        role,
        status,
        domain,
        department_key,
        runtime_model,
        tools_enabled_json,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${tenantId},
        ${name},
        ${role},
        'active',
        'INTERNAL',
        ${departmentKey},
        ${runtimeModel},
        ${JSON.stringify(toolsEnabled)}::jsonb,
        ${JSON.stringify({
          createdBy: req.adminUser?.id ? Number(req.adminUser.id) : null,
          source: "hr_chat_flow",
          feature: "FEATURE_AGENT_MGMT_V2",
        })}::jsonb,
        now(),
        now()
      )
      returning *
    `);
    return res.status(201).json({ ok: true, agent: rows<any>(result)[0] || null });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to create internal agent" });
  }
});

router.get("/departments/context/:pageKey", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_DEPARTMENT_MANAGER_CHAT", true)) {
      return res.status(404).json({ message: "FEATURE_DEPARTMENT_MANAGER_CHAT disabled" });
    }
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const pageKey = String(req.params?.pageKey || "").trim().toLowerCase();
    const department = getDepartmentByPageKey(pageKey);
    if (!department) return res.status(404).json({ message: "Unknown page key" });

    const managerResult = await db.execute(sql`
      select
        dm.page_key,
        dm.manager_agent_id,
        dm.updated_at,
        a.name as manager_name,
        a.role as manager_role,
        a.domain as manager_domain,
        (
          select count(*)
          from tasks t
          where t.agent_id = dm.manager_agent_id
            and lower(coalesce(t.status, '')) not in ('completed', 'cancelled')
        )::int as open_issues,
        (
          select max(ar.created_at)
          from agent_action_runs ar
          where ar.tenant_id = ${tenantId}
            and ar.agent_id = dm.manager_agent_id
        ) as last_report_at
      from department_managers dm
      join agents a on a.id = dm.manager_agent_id
      where dm.tenant_id = ${tenantId}
        and dm.page_key = ${pageKey}
      limit 1
    `);
    const manager = rows<any>(managerResult)[0] || null;

    return res.json({
      ok: true,
      item: manager,
      page: {
        key: department.pageKey,
        label: department.label,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch department context" });
  }
});

router.get("/departments/registry", async (_req: any, res) => {
  return res.json({ ok: true, items: DEPARTMENT_REGISTRY });
});

router.get("/departments/manager/:pageKey", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_DEPARTMENT_MANAGER_CHAT", true)) {
      return res.status(404).json({ message: "FEATURE_DEPARTMENT_MANAGER_CHAT disabled" });
    }
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const pageKey = String(req.params?.pageKey || "").trim().toLowerCase();
    if (!getDepartmentByPageKey(pageKey)) return res.status(404).json({ message: "Unknown page key" });

    const result = await db.execute(sql`
      select
        dm.page_key,
        dm.manager_agent_id,
        dm.updated_at,
        a.name as manager_name,
        a.role as manager_role,
        a.domain as manager_domain
      from department_managers dm
      join agents a on a.id = dm.manager_agent_id
      where dm.tenant_id = ${tenantId}
        and dm.page_key = ${pageKey}
      limit 1
    `);
    const row = rows<any>(result)[0] || null;
    return res.json({ ok: true, item: row });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch department manager" });
  }
});

router.put("/departments/manager/:pageKey", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_DEPARTMENT_MANAGER_CHAT", true)) {
      return res.status(404).json({ message: "FEATURE_DEPARTMENT_MANAGER_CHAT disabled" });
    }
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const pageKey = String(req.params?.pageKey || "").trim().toLowerCase();
    if (!getDepartmentByPageKey(pageKey)) return res.status(404).json({ message: "Unknown page key" });
    const managerAgentId = parsePositiveInt(req.body?.managerAgentId || req.body?.manager_agent_id);
    if (!managerAgentId) return res.status(400).json({ message: "managerAgentId required" });

    await db.execute(sql`
      insert into department_managers (tenant_id, page_key, manager_agent_id, created_at, updated_at)
      values (${tenantId}, ${pageKey}, ${managerAgentId}, now(), now())
      on conflict (tenant_id, page_key)
      do update set manager_agent_id = excluded.manager_agent_id, updated_at = now()
    `);

    const result = await db.execute(sql`
      select
        dm.page_key,
        dm.manager_agent_id,
        dm.updated_at,
        a.name as manager_name,
        a.role as manager_role,
        a.domain as manager_domain
      from department_managers dm
      join agents a on a.id = dm.manager_agent_id
      where dm.tenant_id = ${tenantId}
        and dm.page_key = ${pageKey}
      limit 1
    `);
    return res.json({ ok: true, item: rows<any>(result)[0] || null });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to save department manager" });
  }
});

export default router;
