import { Router } from "express";
import { randomBytes, randomUUID, createHash } from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { db } from "@db";
import { eq, sql } from "drizzle-orm";
import { agents } from "@db/schema";
import { ensureTenantStaff } from "./utils/auth";
import {
  createDockerWorkstationProvider,
  type IWorkstationProvider,
  type WorkstationRuntimeStatus,
} from "../lib/workstations/provider";

type WorkstationRow = {
  id: string;
  tenant_id: number;
  agent_id: number;
  owner_user_id: number | null;
  provider: string;
  provider_ref: string | null;
  status: WorkstationRuntimeStatus;
  workspace_type: "EPHEMERAL" | "PERSISTENT";
  ide_url: string | null;
  terminal_url: string | null;
  desktop_url: string | null;
  cpu: number;
  ram_mb: number;
  disk_mb: number;
  network_policy_id: string | null;
  network_policy_mode: "DEFAULT_DENY" | "ALLOWLIST" | "FULL_EGRESS";
  repo_url: string | null;
  repo_branch: string | null;
  task_id: number | null;
  objective_id: number | null;
  metadata: any;
  created_at: string;
  updated_at: string;
};

type AgentCapabilityRow = {
  tenant_id: number;
  agent_id: number;
  workstation_enabled: boolean | string | number | null;
  internet_enabled: boolean | string | number | null;
  allowed_domains: string[] | string | null;
  downloads_allowed: boolean | string | number | null;
  clipboard_allowed: boolean | string | number | null;
  requires_approval: boolean | string | number | null;
  max_session_minutes: number | string | null;
  updated_at: string | null;
};

type AgentCapability = {
  tenantId: number;
  agentId: number;
  workstationEnabled: boolean;
  internetEnabled: boolean;
  allowedDomains: string[];
  downloadsAllowed: boolean;
  clipboardAllowed: boolean;
  requiresApproval: boolean;
  maxSessionMinutes: number;
  updatedAt: string | null;
};

type StaffUser = {
  id?: number;
  role?: string;
  roles?: string[];
  permissions?: string[];
  currentMode?: string;
};

const router = Router();
let providerPromise: Promise<IWorkstationProvider> | null = null;
const VIEW_TOKEN_TTL_MINUTES = 30;
const MAX_MONITOR_EVENTS = 200;

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asInt(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return Math.min(max, Math.max(min, normalized));
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [] as string[];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((item) => item.replace(/^"+|"+$/g, ""))
        .map((item) => asString(item))
        .filter(Boolean);
    }
    return trimmed
      .split(",")
      .map((item) => asString(item))
      .filter(Boolean);
  }
  return [] as string[];
}

function asBool(value: unknown) {
  if (typeof value === "boolean") return value;
  return isTruthy(value);
}

function getRows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function toJson(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value ?? "{}"));
  } catch {
    return null;
  }
}

function isTruthy(value: unknown) {
  const raw = asString(value).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function normalizeRole(role: unknown) {
  return asString(role)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidOperationalAgentName(name: unknown) {
  const normalized = asString(name).toLowerCase();
  if (!normalized) return true;
  return !normalized.includes("test") && !normalized.includes("demo");
}

function hasPermission(user: StaffUser | undefined | null, permission: string) {
  const perms = Array.isArray(user?.permissions) ? user!.permissions!.map((p) => asString(p)) : [];
  if (perms.includes("*") || perms.includes("admin:*")) return true;
  return perms.includes(permission);
}

function isAdminLike(user: StaffUser | undefined | null) {
  const roles = Array.isArray(user?.roles) ? user!.roles!.map((r) => normalizeRole(r)) : [];
  const role = normalizeRole(user?.role);
  const mode = normalizeRole(user?.currentMode);
  return (
    mode === "admin" ||
    role === "admin" ||
    role === "super admin" ||
    role === "platform admin" ||
    roles.includes("admin") ||
    roles.includes("super admin") ||
    roles.includes("platform admin") ||
    roles.includes("devops") ||
    roles.includes("security")
  );
}

function canCreateWorkstation(user: StaffUser | undefined | null) {
  return isAdminLike(user) || hasPermission(user, "WORKSTATION_CREATE");
}

function canControlWorkstation(user: StaffUser | undefined | null) {
  return isAdminLike(user) || hasPermission(user, "WORKSTATION_CONTROL");
}

function canViewOwnWorkstation(user: StaffUser | undefined | null) {
  return isAdminLike(user) || hasPermission(user, "WORKSTATION_VIEW_OWN") || hasPermission(user, "WORKSTATION_VIEW");
}

function canViewMonitor(user: StaffUser | undefined | null) {
  return isAdminLike(user) || hasPermission(user, "WORKSTATION_MONITOR_VIEW");
}

function canViewLive(user: StaffUser | undefined | null) {
  return isAdminLike(user) || hasPermission(user, "WORKSTATION_MONITOR_LIVE");
}

function canEditNetwork(user: StaffUser | undefined | null) {
  return isAdminLike(user) || hasPermission(user, "WORKSTATION_NETWORK_EDIT");
}

function featuresEnabled() {
  const resolveFlag = (envKey: string, defaultValue: boolean) => {
    const raw = asString((process.env as Record<string, string | undefined>)[envKey]);
    if (!raw) return defaultValue;
    return isTruthy(raw);
  };
  const resolveAliasFlag = (keys: string[], defaultValue: boolean) => {
    for (const key of keys) {
      const raw = asString((process.env as Record<string, string | undefined>)[key]);
      if (!raw) continue;
      return isTruthy(raw);
    }
    return defaultValue;
  };
  return {
    workstations: resolveAliasFlag(["FEATURE_WORKSTATIONS", "FEATURE_AGENT_WORKSTATIONS"], true),
    monitoring: resolveAliasFlag(["FEATURE_WORKSTATION_MONITORING"], true),
    internet: resolveAliasFlag(["FEATURE_WORKSTATION_INTERNET"], true),
  };
}

async function provider() {
  if (!providerPromise) providerPromise = createDockerWorkstationProvider();
  return providerPromise;
}

function resolveTenantId(req: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;
  return tenantId;
}

async function findWorkstation(tenantId: number, workstationId: string) {
  const result = await db.execute(sql`
    select w.*
    from agent_workstations w
    where w.tenant_id = ${tenantId}
      and w.id = ${workstationId}
    limit 1
  `);
  return getRows<WorkstationRow>(result)[0] || null;
}

async function findWorkstationByAgent(tenantId: number, agentId: number) {
  const result = await db.execute(sql`
    select w.*
    from agent_workstations w
    where w.tenant_id = ${tenantId}
      and w.agent_id = ${agentId}
      and w.status <> 'DESTROYED'
    order by w.updated_at desc
    limit 1
  `);
  return getRows<WorkstationRow>(result)[0] || null;
}

async function ensureAgentCapabilitiesForTenant(tenantId: number) {
  await db.execute(sql`
    insert into agent_capabilities (tenant_id, agent_id)
    select a.tenant_id, a.id
    from agents a
    where a.tenant_id = ${tenantId}
      and coalesce(a.domain, 'INTERNAL') = 'INTERNAL'
      and coalesce(a.is_test, false) = false
      and coalesce(a.is_visible, true) = true
      and lower(coalesce(a.status, 'active')) not in ('archived', 'inactive')
      and lower(coalesce(a.name, '')) not like '%test%'
      and lower(coalesce(a.name, '')) not like '%demo%'
    on conflict (tenant_id, agent_id) do nothing
  `);
}

async function ensureWorkstationsForTenant(tenantId: number) {
  await db.execute(sql`
    insert into agent_workstations (
      id,
      tenant_id,
      agent_id,
      provider,
      status,
      workspace_type,
      network_policy_mode,
      metadata,
      created_at,
      updated_at
    )
    select
      concat('ws_', substr(md5(random()::text || clock_timestamp()::text || a.id::text), 1, 16)),
      a.tenant_id,
      a.id,
      'DOCKER',
      'STOPPED',
      'EPHEMERAL',
      'DEFAULT_DENY',
      jsonb_build_object('autoProvisioned', true, 'autoProvisionedAt', now()),
      now(),
      now()
    from agents a
    where a.tenant_id = ${tenantId}
      and coalesce(a.domain, 'INTERNAL') = 'INTERNAL'
      and coalesce(a.is_test, false) = false
      and coalesce(a.is_visible, true) = true
      and lower(coalesce(a.status, 'active')) not in ('archived', 'inactive')
      and lower(coalesce(a.name, '')) not like '%test%'
      and lower(coalesce(a.name, '')) not like '%demo%'
      and not exists (
        select 1
        from agent_workstations w
        where w.tenant_id = a.tenant_id
          and w.agent_id = a.id
          and w.status <> 'DESTROYED'
      );
  `);
}

async function ensureWorkstationForAgent(tenantId: number, agentId: number) {
  await db.execute(sql`
    insert into agent_workstations (
      id,
      tenant_id,
      agent_id,
      provider,
      status,
      workspace_type,
      network_policy_mode,
      metadata,
      created_at,
      updated_at
    )
    select
      concat('ws_', substr(md5(random()::text || clock_timestamp()::text || a.id::text), 1, 16)),
      a.tenant_id,
      a.id,
      'DOCKER',
      'STOPPED',
      'EPHEMERAL',
      'DEFAULT_DENY',
      jsonb_build_object('autoProvisioned', true, 'autoProvisionedAt', now()),
      now(),
      now()
    from agents a
    where a.tenant_id = ${tenantId}
      and a.id = ${agentId}
      and coalesce(a.domain, 'INTERNAL') = 'INTERNAL'
      and coalesce(a.is_test, false) = false
      and coalesce(a.is_visible, true) = true
      and lower(coalesce(a.status, 'active')) not in ('archived', 'inactive')
      and lower(coalesce(a.name, '')) not like '%test%'
      and lower(coalesce(a.name, '')) not like '%demo%'
      and not exists (
        select 1
        from agent_workstations w
        where w.tenant_id = a.tenant_id
          and w.agent_id = a.id
          and w.status <> 'DESTROYED'
      );
  `);
}

async function ensureProviderRefForWorkstation(params: {
  tenantId: number;
  workstation: WorkstationRow;
  actorUserId: number | null;
  actorAgentId: number | null;
  allowedDomains?: string[];
  correlationId?: string;
}) {
  const { tenantId, workstation, actorUserId, actorAgentId, allowedDomains = [], correlationId = "" } = params;
  if (workstation.provider_ref) return workstation;

  const runtime = await (await provider()).create({
    workstationId: workstation.id,
    tenantId,
    agentId: Number(workstation.agent_id),
    workspaceType: workstation.workspace_type,
    cpu: asInt(workstation.cpu, 1, 1, 8),
    ramMb: asInt(workstation.ram_mb, 2048, 512, 16384),
    diskMb: asInt(workstation.disk_mb, 10240, 2048, 102400),
    networkPolicyMode: workstation.network_policy_mode,
    allowedDomains: Array.isArray(allowedDomains) ? allowedDomains : [],
    repoUrl: workstation.repo_url || null,
    repoBranch: workstation.repo_branch || null,
  });

  await db.execute(sql`
    update agent_workstations
    set
      provider_ref = ${runtime.providerId},
      status = ${runtime.status},
      ide_url = ${runtime.urls.ideUrl || null},
      desktop_url = ${runtime.urls.desktopUrl || null},
      terminal_url = ${runtime.urls.terminalUrl || null},
      metadata = coalesce(agent_workstations.metadata, '{}'::jsonb) || ${JSON.stringify(runtime.metadata || {})}::jsonb,
      updated_at = now()
    where tenant_id = ${tenantId}
      and id = ${workstation.id}
  `);

  await insertEvent({
    tenantId,
    workstationId: workstation.id,
    eventType: "WORKSTATION_CREATED",
    actorUserId,
    actorAgentId,
    origin: "system",
    correlationId,
    payload: {
      source: "lazy_provider_provision",
      providerRef: runtime.providerId,
      status: runtime.status,
    },
  });

  const refreshed = await findWorkstation(tenantId, workstation.id);
  return refreshed || workstation;
}

function mapCapabilityRow(row: AgentCapabilityRow): AgentCapability {
  return {
    tenantId: Number(row.tenant_id),
    agentId: Number(row.agent_id),
    workstationEnabled: asBool(row.workstation_enabled),
    internetEnabled: asBool(row.internet_enabled),
    allowedDomains: asStringArray(row.allowed_domains),
    downloadsAllowed: asBool(row.downloads_allowed),
    clipboardAllowed: asBool(row.clipboard_allowed),
    requiresApproval: asBool(row.requires_approval),
    maxSessionMinutes: asInt(row.max_session_minutes, 30, 5, 600),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

async function getAgentCapability(tenantId: number, agentId: number) {
  await ensureAgentCapabilitiesForTenant(tenantId);
  const result = await db.execute(sql`
    select
      tenant_id,
      agent_id,
      workstation_enabled,
      internet_enabled,
      allowed_domains,
      downloads_allowed,
      clipboard_allowed,
      requires_approval,
      max_session_minutes,
      updated_at
    from agent_capabilities
    where tenant_id = ${tenantId}
      and agent_id = ${agentId}
    limit 1
  `);
  const row = getRows<AgentCapabilityRow>(result)[0];
  if (!row) return null;
  return mapCapabilityRow(row);
}

function coerceScope(raw: unknown): "IDE" | "DESKTOP" | "TERMINAL" {
  const value = asString(raw).toUpperCase();
  if (value === "DESKTOP") return "DESKTOP";
  if (value === "TERMINAL") return "TERMINAL";
  return "IDE";
}

function eventTypeForScope(scope: "IDE" | "DESKTOP" | "TERMINAL") {
  if (scope === "DESKTOP") return "DESKTOP_OPENED";
  if (scope === "TERMINAL") return "TERMINAL_OPENED";
  return "IDE_OPENED";
}

function resolveScopeUrl(workstation: WorkstationRow, scope: "IDE" | "DESKTOP" | "TERMINAL") {
  if (scope === "DESKTOP") return workstation.desktop_url || workstation.ide_url || null;
  if (scope === "TERMINAL") return workstation.terminal_url || workstation.ide_url || null;
  return workstation.ide_url || workstation.terminal_url || workstation.desktop_url || null;
}

async function issueViewToken(params: {
  req: any;
  tenantId: number;
  workstation: WorkstationRow;
  staffUser: StaffUser | undefined;
  scope: "IDE" | "DESKTOP" | "TERMINAL";
}) {
  const { req, tenantId, workstation, staffUser, scope } = params;
  const scopeUrl = resolveScopeUrl(workstation, scope);
  if (!scopeUrl) throw new Error(`${scope} URL not available`);

  const userId = staffUser?.id ? Number(staffUser.id) : null;
  const correlationId = asString(req.headers?.["x-correlation-id"] || req.body?.correlationId || req.body?.correlation_id || "");

  const sessionId = await createSession({
    tenantId,
    workstationId: workstation.id,
    sessionType: scope,
    userId,
    ip: asString(req.headers["x-forwarded-for"] || req.ip || "").slice(0, 128) || null,
    userAgent: asString(req.headers["user-agent"] || "").slice(0, 512) || null,
  });

  await upsertAgentWorkstationSession({
    sessionId,
    tenantId,
    agentId: Number(workstation.agent_id),
    workstationId: workstation.id,
    status: "RUNNING",
    activeTab: scope,
    metadata: {
      source: "view_token",
      scope,
    },
  });

  const token = randomBytes(32).toString("hex");
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + VIEW_TOKEN_TTL_MINUTES * 60_000);
  await db.execute(sql`
    insert into workstation_view_tokens (
      id,
      tenant_id,
      workstation_id,
      viewer_user_id,
      viewer_agent_id,
      session_id,
      token,
      scope,
      expires_at,
      created_at
    )
    values (
      ${tokenId},
      ${tenantId},
      ${workstation.id},
      ${userId},
      null,
      ${sessionId},
      ${token},
      ${scope},
      ${expiresAt},
      now()
    )
  `);

  await insertEvent({
    tenantId,
    workstationId: workstation.id,
    eventType: "WORKSTATION_SESSION_STARTED",
    actorUserId: userId,
    actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
    sessionId,
    origin: "system",
    correlationId,
    payload: {
      scope,
      view: true,
    },
  });

  emitWorkstationRealtime(req, "workstation:session-started", {
    tenantId,
    workstationId: workstation.id,
    agentId: workstation.agent_id,
    userId,
    sessionId,
    scope,
    startedAt: new Date().toISOString(),
  });

  await insertEvent({
    tenantId,
    workstationId: workstation.id,
    eventType: eventTypeForScope(scope),
    actorUserId: userId,
    sessionId,
    origin: "system",
    correlationId,
    payload: { scope, ttlMinutes: VIEW_TOKEN_TTL_MINUTES },
  });

  return {
    scope,
    sessionId,
    expiresAt,
    url: `/w/${encodeURIComponent(workstation.id)}/${scope.toLowerCase()}?token=${encodeURIComponent(token)}`,
  };
}

async function createSession(input: {
  tenantId: number;
  workstationId: string;
  sessionType: "IDE" | "DESKTOP" | "TERMINAL" | "API";
  userId?: number | null;
  agentId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const sessionId = randomUUID();
  await db.execute(sql`
    insert into workstation_sessions (
      id,
      tenant_id,
      workstation_id,
      user_id,
      agent_id,
      session_type,
      started_at,
      ip,
      user_agent,
      metadata
    )
    values (
      ${sessionId},
      ${input.tenantId},
      ${input.workstationId},
      ${input.userId || null},
      ${input.agentId || null},
      ${input.sessionType},
      now(),
      ${input.ip || null},
      ${input.userAgent || null},
      '{}'::jsonb
    )
  `);
  return sessionId;
}

function canAccessWorkstation(staffUser: StaffUser | undefined | null, workstation: WorkstationRow) {
  if (isAdminLike(staffUser)) return true;
  const viewerId = staffUser?.id ? Number(staffUser.id) : null;
  if (!viewerId || viewerId <= 0) return false;
  if (!canViewOwnWorkstation(staffUser)) return false;
  return workstation.owner_user_id === viewerId;
}

async function insertEvent(input: {
  tenantId: number;
  workstationId: string;
  eventType: string;
  actorUserId?: number | null;
  actorAgentId?: number | null;
  sessionId?: string | null;
  command?: string | null;
  origin?: string | null;
  correlationId?: string | null;
  payload?: Record<string, unknown>;
}) {
  await db.execute(sql`
    insert into workstation_events (
      id,
      tenant_id,
      workstation_id,
      session_id,
      actor_user_id,
      actor_agent_id,
      event_type,
      command,
      origin,
      correlation_id,
      event_payload_json,
      created_at
    )
    values (
      ${randomUUID()},
      ${input.tenantId},
      ${input.workstationId},
      ${input.sessionId || null},
      ${input.actorUserId || null},
      ${input.actorAgentId || null},
      ${input.eventType},
      ${input.command || null},
      ${input.origin || null},
      ${input.correlationId || null},
      ${JSON.stringify(input.payload || {})}::jsonb,
      now()
    )
  `);
}

async function upsertAgentWorkstationSession(input: {
  sessionId: string;
  tenantId: number;
  workstationId: string;
  agentId: number;
  startedAt?: Date | null;
  status?: "RUNNING" | "CLOSED" | "CRASHED";
  activeTab?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.execute(sql`
    insert into agent_workstation_sessions (
      id,
      tenant_id,
      agent_id,
      workstation_id,
      started_at,
      status,
      active_tab,
      last_activity_at,
      metadata
    )
    values (
      ${input.sessionId},
      ${input.tenantId},
      ${input.agentId},
      ${input.workstationId},
      ${input.startedAt || new Date()},
      ${input.status || "RUNNING"},
      ${input.activeTab || null},
      now(),
      ${JSON.stringify(input.metadata || {})}::jsonb
    )
    on conflict (id)
    do update set
      status = excluded.status,
      active_tab = excluded.active_tab,
      last_activity_at = now(),
      metadata = coalesce(agent_workstation_sessions.metadata, '{}'::jsonb) || excluded.metadata
  `);
}

async function closeAgentWorkstationSessions(input: {
  tenantId: number;
  workstationId: string;
  status?: "CLOSED" | "CRASHED";
}) {
  await db.execute(sql`
    update agent_workstation_sessions
    set
      status = ${input.status || "CLOSED"},
      ended_at = coalesce(ended_at, now()),
      last_activity_at = now()
    where tenant_id = ${input.tenantId}
      and workstation_id = ${input.workstationId}
      and ended_at is null
  `);
}

function emitWorkstationRealtime(req: any, eventName: string, payload: Record<string, unknown>) {
  const io = req?.app?.get?.("io");
  if (!io || typeof io.emit !== "function") return;
  try {
    io.emit(eventName, payload);
  } catch {
    // best effort only
  }
}

router.get("/api/workstations/health", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

    const feature = featuresEnabled();
    const providerClient = await provider();
    const providerHealthy = Boolean((providerClient as any)?.healthy);
    const providerName = String((providerClient as any)?.provider || "unknown");

    const imagePrimary = asString(process.env.WORKSTATION_IMAGE || "exportunity/workstation:latest");
    const imageFallback = asString(process.env.WORKSTATION_IMAGE_FALLBACK || "codercom/code-server:latest");
    const reverseProxyBase = asString(process.env.WORKSTATION_PUBLIC_HOST || process.env.WORKSTATION_PROXY_URL || "");

    const sample = {
      canCreateDryRun: feature.workstations && providerHealthy,
      reason: providerHealthy ? null : "provider_unhealthy",
    };

    return res.json({
      ok: true,
      tenantId,
      feature,
      provider: {
        name: providerName,
        healthy: providerHealthy,
        socketPath: asString(process.env.DOCKER_SOCKET_PATH || process.env.DOCKER_HOST || "/var/run/docker.sock"),
      },
      image: {
        configured: Boolean(imagePrimary),
        primary: imagePrimary || null,
        fallback: imageFallback || null,
      },
      reverseProxy: {
        configured: Boolean(reverseProxyBase),
        base: reverseProxyBase || null,
      },
      sample,
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to check workstation health" });
  }
});

router.use((req, res, next) => {
  if (!featuresEnabled().workstations) {
    return res.status(404).json({ message: "Workstations feature disabled" });
  }
  next();
});

router.post("/api/agents/:agentId/workstation", ensureTenantStaff, async (req: any, res) => {
  let wsId: string | null = null;
  let tenantIdForFailure: number | null = null;
  let agentIdForFailure: number | null = null;
  let actorUserIdForFailure: number | null = null;
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    tenantIdForFailure = tenantId;
    const staffUser = req.staffUser as StaffUser | undefined;
    actorUserIdForFailure = staffUser?.id ? Number(staffUser.id) : null;
    if (!canCreateWorkstation(staffUser)) return res.status(403).json({ message: "Forbidden" });

    const agentId = asInt(req.params.agentId, 0, 1);
    agentIdForFailure = agentId;
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const existingResult = await db.execute(sql`
      select w.*
      from agent_workstations w
      where w.tenant_id = ${tenantId}
        and w.agent_id = ${agentId}
        and w.status <> 'DESTROYED'
      order by w.updated_at desc
      limit 1
    `);
    const existing = getRows<WorkstationRow>(existingResult)[0] || null;
    if (existing && (existing.status === "RUNNING" || existing.status === "CREATING" || existing.status === "STOPPED")) {
      return res.json({ workstation: existing, reused: true });
    }

    wsId = randomUUID();
    const workspaceType = asString(req.body?.workspaceType).toUpperCase() === "PERSISTENT" ? "PERSISTENT" : "EPHEMERAL";
    const cpu = asInt(req.body?.cpu, 1, 1, 8);
    const ramMb = asInt(req.body?.ramMb, 2048, 512, 16384);
    const diskMb = asInt(req.body?.diskMb, 10240, 2048, 102400);
    const requestedMode = asString(req.body?.networkPolicyMode).toUpperCase();
    const networkPolicyMode = requestedMode === "FULL_EGRESS" || requestedMode === "ALLOWLIST" ? requestedMode : "DEFAULT_DENY";
    const allowedDomains = Array.isArray(req.body?.allowedDomains)
      ? req.body.allowedDomains.map((x: any) => asString(x)).filter(Boolean).slice(0, 200)
      : [];

    await db.execute(sql`
      insert into agent_workstations (
        id, tenant_id, agent_id, owner_user_id, provider, provider_ref, status, workspace_type,
        ide_url, terminal_url, desktop_url, cpu, ram_mb, disk_mb, network_policy_mode,
        repo_url, repo_branch, task_id, objective_id, metadata, created_at, updated_at
      )
      values (
        ${wsId}, ${tenantId}, ${agentId}, ${staffUser?.id ? Number(staffUser.id) : null},
        ${"DOCKER"},
        ${null},
        ${"CREATING"},
        ${workspaceType},
        ${null},
        ${null},
        ${null},
        ${cpu},
        ${ramMb},
        ${diskMb},
        ${networkPolicyMode},
        ${asString(req.body?.repoUrl) || null},
        ${asString(req.body?.repoBranch) || null},
        ${req.body?.taskId ? Number(req.body.taskId) : null},
        ${req.body?.objectiveId ? Number(req.body.objectiveId) : null},
        ${JSON.stringify({
          requestedByUserId: staffUser?.id ? Number(staffUser.id) : null,
          requestedAt: new Date().toISOString(),
        })}::jsonb,
        now(),
        now()
      )
    `);

    const runtime = await (await provider()).create({
      workstationId: wsId,
      tenantId,
      agentId,
      workspaceType,
      cpu,
      ramMb,
      diskMb,
      networkPolicyMode: networkPolicyMode as any,
      allowedDomains,
      repoUrl: asString(req.body?.repoUrl) || null,
      repoBranch: asString(req.body?.repoBranch) || null,
    });

    await db.execute(sql`
      update agent_workstations
      set
        provider_ref = ${runtime.providerId},
        status = ${runtime.status},
        ide_url = ${runtime.urls.ideUrl || null},
        terminal_url = ${runtime.urls.terminalUrl || null},
        desktop_url = ${runtime.urls.desktopUrl || null},
        metadata = ${JSON.stringify(runtime.metadata || {})}::jsonb,
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${wsId}
    `);

    await insertEvent({
      tenantId,
      workstationId: wsId,
      eventType: "WORKSTATION_CREATED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      payload: {
        agentId,
        workspaceType,
        networkPolicyMode,
        providerRef: runtime.providerId,
        correlationId: asString(req.headers?.["x-correlation-id"] || ""),
      },
    });

    const inserted = await findWorkstation(tenantId, wsId);
    return res.json({ workstation: inserted, reused: false });
  } catch (error: any) {
    if (tenantIdForFailure && wsId) {
      try {
        await db.execute(sql`
          update agent_workstations
          set
            status = 'FAILED',
            metadata = jsonb_set(
              coalesce(metadata, '{}'::jsonb),
              '{provisioningError}',
              ${JSON.stringify({
                message: String(error?.message || error || "unknown_error"),
                at: new Date().toISOString(),
              })}::jsonb,
              true
            ),
            updated_at = now()
          where tenant_id = ${tenantIdForFailure}
            and id = ${wsId}
        `);
        await insertEvent({
          tenantId: tenantIdForFailure,
          workstationId: wsId,
          eventType: "WORKSTATION_FAILED",
          actorUserId: actorUserIdForFailure,
          actorAgentId: agentIdForFailure,
          payload: { error: String(error?.message || error || "unknown_error") },
        });
      } catch {
        // ignore fallback failure
      }
    }
    return res.status(500).json({ message: error?.message || "Failed to create workstation" });
  }
});

router.get("/api/agents/:agentId/workstation", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;
    const agentId = asInt(req.params.agentId, 0, 1);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    await ensureWorkstationForAgent(tenantId, agentId);

    const rowResult = await db.execute(sql`
      select w.*
      from agent_workstations w
      where w.tenant_id = ${tenantId}
        and w.agent_id = ${agentId}
        and w.status <> 'DESTROYED'
      order by w.updated_at desc
      limit 1
    `);
    const workstation = getRows<WorkstationRow>(rowResult)[0] || null;
    if (!workstation) return res.status(404).json({ message: "No workstation found" });
    if (!canAccessWorkstation(staffUser, workstation)) return res.status(403).json({ message: "Forbidden" });

    return res.json({ workstation });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch workstation" });
  }
});

router.post("/api/workstations/agents/:agentId/permissions/request", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;
    const agentId = asInt(req.params.agentId, 0, 1);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    await ensureWorkstationForAgent(tenantId, agentId);

    const workstation = await findWorkstationByAgent(tenantId, agentId);
    const capability = await getAgentCapability(tenantId, agentId);
    const correlationId = asString(req.headers?.["x-correlation-id"] || req.body?.correlationId || req.body?.correlation_id || "");
    const reason = asString(req.body?.reason || "Permission requested by agent workflow");

    if (workstation) {
      await insertEvent({
        tenantId,
        workstationId: workstation.id,
        eventType: "WORKSTATION_PERMISSION_REQUESTED",
        actorUserId: staffUser?.id ? Number(staffUser.id) : null,
        actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
        origin: "agent",
        correlationId,
        payload: {
          reason,
          capability,
        },
      });
      emitWorkstationRealtime(req, "workstation:permission-requested", {
        tenantId,
        workstationId: workstation.id,
        agentId,
        reason,
        requestedAt: new Date().toISOString(),
      });
    }

    return res.status(202).json({
      ok: true,
      status: "NEEDS_PERMISSION",
      reason,
      workstationId: workstation?.id || null,
      capability,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to request workstation permission" });
  }
});

router.post("/api/workstations/agents/:agentId/start", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canControlWorkstation(staffUser)) return res.status(403).json({ message: "Forbidden" });

    const agentId = asInt(req.params.agentId, 0, 1);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    await ensureWorkstationForAgent(tenantId, agentId);
    let workstation = await findWorkstationByAgent(tenantId, agentId);
    if (!workstation) return res.status(404).json({ message: "Workstation not found for agent" });

    const capability = await getAgentCapability(tenantId, agentId);
    if (!capability?.workstationEnabled) {
      return res.status(403).json({ message: "Workstation disabled for this agent", code: "WORKSTATION_DISABLED" });
    }

    const requiresInternet = isTruthy(req.body?.requiresInternet || req.body?.internet || req.body?.internet_enabled);
    if (requiresInternet && (!capability.internetEnabled || !capability.allowedDomains.length)) {
      return res.status(403).json({
        message: "Internet access policy blocks this workstation session",
        code: "INTERNET_POLICY_BLOCKED",
        allowedDomains: capability.allowedDomains,
      });
    }

    if (capability.requiresApproval && !isAdminLike(staffUser)) {
      const reason = asString(req.body?.reason || "Capability requires approval before start");
      await insertEvent({
        tenantId,
        workstationId: workstation.id,
        eventType: "WORKSTATION_PERMISSION_REQUESTED",
        actorUserId: staffUser?.id ? Number(staffUser.id) : null,
        actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
        origin: "agent",
        correlationId: asString(req.headers?.["x-correlation-id"] || req.body?.correlationId || req.body?.correlation_id || ""),
        payload: {
          reason,
          requiresApproval: true,
        },
      });
      emitWorkstationRealtime(req, "workstation:permission-requested", {
        tenantId,
        workstationId: workstation.id,
        agentId,
        reason,
        requestedAt: new Date().toISOString(),
      });
      return res.status(202).json({ ok: true, status: "NEEDS_PERMISSION", reason, capability });
    }

    workstation = await ensureProviderRefForWorkstation({
      tenantId,
      workstation,
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
      allowedDomains: capability.allowedDomains,
      correlationId: asString(req.headers?.["x-correlation-id"] || req.body?.correlationId || req.body?.correlation_id || ""),
    });
    if (!workstation.provider_ref) return res.status(400).json({ message: "Provider reference missing" });

    const runtime = await (await provider()).start(workstation.provider_ref);
    await db.execute(sql`
      update agent_workstations
      set
        status = ${runtime.status},
        ide_url = ${runtime.urls.ideUrl || null},
        desktop_url = ${runtime.urls.desktopUrl || null},
        terminal_url = ${runtime.urls.terminalUrl || null},
        metadata = ${JSON.stringify(runtime.metadata || {})}::jsonb,
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${workstation.id}
    `);

    const sessionId = await createSession({
      tenantId,
      workstationId: workstation.id,
      sessionType: "API",
      userId: staffUser?.id ? Number(staffUser.id) : null,
      agentId,
      ip: asString(req.headers["x-forwarded-for"] || req.ip || "").slice(0, 128) || null,
      userAgent: asString(req.headers["user-agent"] || "").slice(0, 512) || null,
    });

    await upsertAgentWorkstationSession({
      sessionId,
      tenantId,
      agentId,
      workstationId: workstation.id,
      status: "RUNNING",
      activeTab: "API",
      metadata: {
        source: "agent_start_endpoint",
      },
    });

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      sessionId,
      eventType: "WORKSTATION_SESSION_STARTED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
      origin: "system",
      payload: {
        source: "agent_start_endpoint",
        status: runtime.status,
      },
    });

    emitWorkstationRealtime(req, "workstation:session-started", {
      tenantId,
      workstationId: workstation.id,
      agentId,
      sessionId,
      startedAt: new Date().toISOString(),
    });

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      sessionId,
      eventType: "WORKSTATION_STARTED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      payload: { status: runtime.status },
    });

    const updated = await findWorkstation(tenantId, workstation.id);
    return res.json({ ok: true, workstation: updated, sessionId, capability });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to start workstation for agent" });
  }
});

router.post("/api/workstations/agents/:agentId/stop", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canControlWorkstation(staffUser)) return res.status(403).json({ message: "Forbidden" });

    const agentId = asInt(req.params.agentId, 0, 1);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    const workstation = await findWorkstationByAgent(tenantId, agentId);
    if (!workstation) return res.status(404).json({ message: "Workstation not found for agent" });
    if (!workstation.provider_ref) return res.status(400).json({ message: "Provider reference missing" });

    const runtime = await (await provider()).stop(workstation.provider_ref);
    await db.execute(sql`
      update agent_workstations
      set
        status = ${runtime.status},
        ide_url = ${runtime.urls.ideUrl || null},
        desktop_url = ${runtime.urls.desktopUrl || null},
        terminal_url = ${runtime.urls.terminalUrl || null},
        metadata = ${JSON.stringify(runtime.metadata || {})}::jsonb,
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${workstation.id}
    `);

    await db.execute(sql`
      update workstation_sessions
      set ended_at = now()
      where tenant_id = ${tenantId}
        and workstation_id = ${workstation.id}
        and ended_at is null
    `);
    await closeAgentWorkstationSessions({ tenantId, workstationId: workstation.id, status: "CLOSED" });

    emitWorkstationRealtime(req, "workstation:session-stopped", {
      tenantId,
      workstationId: workstation.id,
      agentId: workstation.agent_id,
      stoppedAt: new Date().toISOString(),
    });

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType: "WORKSTATION_STOPPED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      payload: { status: runtime.status },
    });

    emitWorkstationRealtime(req, "workstation:session-stopped", {
      tenantId,
      workstationId: workstation.id,
      agentId,
      stoppedAt: new Date().toISOString(),
    });

    const updated = await findWorkstation(tenantId, workstation.id);
    return res.json({ ok: true, workstation: updated });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to stop workstation for agent" });
  }
});

router.get("/api/workstations/agents/:agentId/status", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

    const staffUser = req.staffUser as StaffUser | undefined;
    const agentId = asInt(req.params.agentId, 0, 1);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    await ensureWorkstationForAgent(tenantId, agentId);
    const workstation = await findWorkstationByAgent(tenantId, agentId);
    if (!workstation) return res.status(404).json({ message: "Workstation not found for agent" });
    if (!canAccessWorkstation(staffUser, workstation) && !canViewMonitor(staffUser)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const capability = await getAgentCapability(tenantId, agentId);
    let updated = workstation;

    if (workstation.provider_ref) {
      const runtime = await (await provider()).status(workstation.provider_ref);
      await db.execute(sql`
        update agent_workstations
        set
          status = ${runtime.status},
          ide_url = ${runtime.urls.ideUrl || null},
          desktop_url = ${runtime.urls.desktopUrl || null},
          terminal_url = ${runtime.urls.terminalUrl || null},
          metadata = ${JSON.stringify(runtime.metadata || {})}::jsonb,
          updated_at = now()
        where tenant_id = ${tenantId}
          and id = ${workstation.id}
      `);
      const refreshed = await findWorkstation(tenantId, workstation.id);
      if (refreshed) updated = refreshed;
    }

    const sessionRow = getRows<any>(
      await db.execute(sql`
        select id, session_type, started_at
        from workstation_sessions
        where tenant_id = ${tenantId}
          and workstation_id = ${workstation.id}
          and ended_at is null
        order by started_at desc
        limit 1
      `),
    )[0];

    const needsPermission = Boolean(capability?.requiresApproval && !isAdminLike(staffUser));
    const permissionState = !capability?.workstationEnabled
      ? "DISABLED"
      : needsPermission
        ? "NEEDS_PERMISSION"
        : "READY";

    return res.json({
      ok: true,
      workstation: updated,
      capability,
      permissionState,
      activeSession: sessionRow
        ? {
            id: sessionRow.id,
            type: sessionRow.session_type,
            startedAt: sessionRow.started_at,
          }
        : null,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch agent workstation status" });
  }
});

router.get("/api/admin/workstations", ensureTenantStaff, async (req: any, res) => {
  try {
    const feature = featuresEnabled();
    if (!feature.monitoring) return res.status(404).json({ message: "Workstation monitoring disabled" });

    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canViewMonitor(staffUser)) return res.status(403).json({ message: "Forbidden" });
    await ensureWorkstationsForTenant(tenantId);

    const statusFilter = asString(req.query?.status).toUpperCase();
    const hasStatusFilter = ["CREATING", "RUNNING", "STOPPED", "FAILED", "DESTROYED"].includes(statusFilter);

    const listResult = await db.execute(sql`
      select
        w.*,
        a.name as agent_name,
        a.role as agent_role,
        a.department_key as agent_department_key,
        a.manager_id as agent_manager_id,
        m.name as agent_manager_name,
        m.role as agent_manager_role,
        coalesce(a.status, 'active') as agent_status,
        s.id as active_session_id,
        s.session_type as active_session_type,
        s.started_at as active_session_started_at,
        e.event_type as last_event_type,
        e.created_at as last_event_at
      from agent_workstations w
      left join agents a on a.id = w.agent_id
      left join agents m on m.id = a.manager_id
      left join lateral (
        select ws.id, ws.session_type, ws.started_at
        from workstation_sessions ws
        where ws.tenant_id = w.tenant_id
          and ws.workstation_id = w.id
          and ws.ended_at is null
        order by ws.started_at desc
        limit 1
      ) s on true
      left join lateral (
        select we.event_type, we.created_at
        from workstation_events we
        where we.tenant_id = w.tenant_id
          and we.workstation_id = w.id
        order by we.created_at desc
        limit 1
      ) e on true
      where w.tenant_id = ${tenantId}
        and coalesce(a.is_test, false) = false
        and coalesce(a.is_visible, true) = true
        and lower(coalesce(a.status, 'active')) not in ('archived', 'inactive')
        and lower(coalesce(a.name, '')) not like '%test%'
        and lower(coalesce(a.name, '')) not like '%demo%'
        and (${hasStatusFilter ? sql`w.status = ${statusFilter}` : sql`true`})
      order by w.updated_at desc
      limit 200
    `);

    const items = getRows<any>(listResult)
      .filter((row) => isValidOperationalAgentName(row.agent_name))
      .map((row) => ({
        ...row,
        metadata: toJson(row.metadata) || {},
        failureReason:
          asString((toJson(row.metadata) || {})?.provisioningError?.message || (toJson(row.metadata) || {})?.error || "") || null,
      }));

    const countsResult = await db.execute(sql`
      select w.status, count(*)::int as total
      from agent_workstations w
      left join agents a on a.id = w.agent_id
      where w.tenant_id = ${tenantId}
        and coalesce(a.is_test, false) = false
        and coalesce(a.is_visible, true) = true
        and lower(coalesce(a.status, 'active')) not in ('archived', 'inactive')
        and lower(coalesce(a.name, '')) not like '%test%'
        and lower(coalesce(a.name, '')) not like '%demo%'
      group by w.status
    `);
    const statusCounts: Record<string, number> = {
      ALL: 0,
      CREATING: 0,
      RUNNING: 0,
      STOPPED: 0,
      FAILED: 0,
      DESTROYED: 0,
    };
    for (const row of getRows<any>(countsResult)) {
      const key = asString(row.status).toUpperCase();
      const total = asInt(row.total, 0, 0, Number.MAX_SAFE_INTEGER);
      if (!key) continue;
      statusCounts[key] = total;
      statusCounts.ALL += total;
    }

    return res.json({ items, statusCounts });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch workstation list" });
  }
});

router.get("/api/workstations/:id", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    if (!canAccessWorkstation(staffUser, workstation) && !canViewMonitor(staffUser)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const artifactsResult = await db.execute(sql`
      select id, type, url, storage_key, sha256, created_at, metadata
      from workstation_artifacts
      where tenant_id = ${tenantId}
        and workstation_id = ${workstation.id}
      order by created_at desc
      limit 50
    `);

    return res.json({
      workstation: {
        ...workstation,
        metadata: toJson(workstation.metadata) || {},
      },
      artifacts: getRows<any>(artifactsResult).map((artifact) => ({
        ...artifact,
        metadata: toJson(artifact.metadata) || {},
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch workstation" });
  }
});

router.get("/api/workstations/:id/events", ensureTenantStaff, async (req: any, res) => {
  try {
    const feature = featuresEnabled();
    if (!feature.monitoring) return res.status(404).json({ message: "Workstation monitoring disabled" });

    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

    const staffUser = req.staffUser as StaffUser | undefined;
    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    if (!canAccessWorkstation(staffUser, workstation) && !canViewMonitor(staffUser)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const limit = asInt(req.query?.limit, 100, 1, MAX_MONITOR_EVENTS);
    const eventsResult = await db.execute(sql`
      select
        id,
        session_id,
        actor_user_id,
        actor_agent_id,
        event_type,
        command,
        origin,
        correlation_id,
        event_payload_json,
        created_at
      from workstation_events
      where tenant_id = ${tenantId}
        and workstation_id = ${workstation.id}
      order by created_at desc
      limit ${limit}
    `);

    return res.json({
      items: getRows<any>(eventsResult).map((row) => ({
        ...row,
        event_payload_json: toJson(row.event_payload_json) || {},
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch workstation events" });
  }
});

router.get("/api/workstations/:id/sessions", ensureTenantStaff, async (req: any, res) => {
  try {
    const feature = featuresEnabled();
    if (!feature.monitoring) return res.status(404).json({ message: "Workstation monitoring disabled" });

    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

    const staffUser = req.staffUser as StaffUser | undefined;
    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    if (!canAccessWorkstation(staffUser, workstation) && !canViewMonitor(staffUser)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const limit = asInt(req.query?.limit, 100, 1, 500);
    const sessionsResult = await db.execute(sql`
      select id, user_id, agent_id, session_type, started_at, ended_at, ip, user_agent, metadata
      from workstation_sessions
      where tenant_id = ${tenantId}
        and workstation_id = ${workstation.id}
      order by started_at desc
      limit ${limit}
    `);

    return res.json({
      items: getRows<any>(sessionsResult).map((row) => ({
        ...row,
        metadata: toJson(row.metadata) || {},
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch workstation sessions" });
  }
});

router.get("/api/workstations/:id/artifacts", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

    const staffUser = req.staffUser as StaffUser | undefined;
    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    if (!canAccessWorkstation(staffUser, workstation) && !canViewMonitor(staffUser)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const artifactsResult = await db.execute(sql`
      select id, agent_id, task_id, type, storage_key, url, sha256, metadata, created_at
      from workstation_artifacts
      where tenant_id = ${tenantId}
        and workstation_id = ${workstation.id}
      order by created_at desc
      limit 200
    `);

    return res.json({
      items: getRows<any>(artifactsResult).map((row) => ({
        ...row,
        metadata: toJson(row.metadata) || {},
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch artifacts" });
  }
});

router.post("/api/workstations/:id/artifacts/docx", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    if (!canAccessWorkstation(staffUser, workstation) && !canViewMonitor(staffUser)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const title = asString(req.body?.title) || "Workstation Report";
    const content = asString(req.body?.content) || "Generated from workstation.";
    const now = new Date();
    const yyyy = `${now.getUTCFullYear()}`;
    const mm = `${now.getUTCMonth() + 1}`.padStart(2, "0");
    const dd = `${now.getUTCDate()}`.padStart(2, "0");
    const root = path.resolve(process.cwd(), "attached_assets", "workstations", String(tenantId), String(workstation.id));
    await mkdir(root, { recursive: true });

    const safeBase = `${title.replace(/[^\w.-]+/g, "_").slice(0, 48) || "workstation_report"}_${Date.now()}`;
    const filename = `${safeBase}.docx`;
    const absoluteFile = path.join(root, filename);

    const body = [
      title,
      "",
      `Tenant: ${tenantId}`,
      `Workstation: ${workstation.id}`,
      `Agent: ${workstation.agent_id}`,
      `GeneratedAt: ${now.toISOString()}`,
      "",
      content,
      "",
    ].join("\n");

    await writeFile(absoluteFile, body, "utf8");
    const fileBuffer = Buffer.from(body, "utf8");
    const hash = createHash("sha256").update(fileBuffer).digest("hex");
    const artifactId = randomUUID();
    const storageKey = `workstations/${tenantId}/${workstation.id}/${yyyy}/${mm}/${dd}/${filename}`;
    const relativeUrl = `/attached_assets/workstations/${tenantId}/${workstation.id}/${filename}`;

    await db.execute(sql`
      insert into workstation_artifacts (
        id, tenant_id, workstation_id, agent_id, task_id, type, storage_key, url, sha256, metadata, created_at
      )
      values (
        ${artifactId},
        ${tenantId},
        ${workstation.id},
        ${workstation.agent_id},
        ${req.body?.taskId ? Number(req.body.taskId) : null},
        'DOCX',
        ${storageKey},
        ${relativeUrl},
        ${hash},
        ${JSON.stringify({
          title,
          generatedBy: staffUser?.id || null,
          note: "MVP artifact writer",
        })}::jsonb,
        now()
      )
    `);

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType: "ARTIFACT_CREATED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      payload: { artifactId, type: "DOCX", storageKey },
    });

    return res.json({
      artifact: {
        id: artifactId,
        type: "DOCX",
        url: relativeUrl,
        storageKey,
        sha256: hash,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to create artifact" });
  }
});

router.post("/api/workstations/:id/events/command", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const feature = featuresEnabled();
    if (!feature.monitoring) return res.status(404).json({ message: "Workstation monitoring disabled" });

    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canViewMonitor(staffUser) && !canControlWorkstation(staffUser)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });

    const command = asString(req.body?.command || req.body?.cmd || "").slice(0, 4000);
    if (!command) return res.status(400).json({ message: "command required" });
    const originRaw = asString(req.body?.origin || "agent").toUpperCase();
    const origin = originRaw === "SYSTEM" ? "system" : "agent";
    const eventType = asString(req.body?.eventType || req.body?.event_type || "COMMAND_EXECUTED").toUpperCase();
    const correlationId = asString(req.body?.correlationId || req.body?.correlation_id || req.headers?.["x-correlation-id"] || "");

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType,
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
      command,
      origin,
      correlationId,
      payload: req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {},
    });

    return res.status(201).json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to log workstation command event" });
  }
});

router.post("/api/workstations/:id/tools/create-document", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    if (!canAccessWorkstation(staffUser, workstation) && !canViewMonitor(staffUser)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const template = asString(req.body?.template || "generic");
    const fileNameRaw = asString(req.body?.fileName || req.body?.filename || "").slice(0, 120);
    const fileBase = (fileNameRaw || `document_${Date.now()}`).replace(/[^\w.-]+/g, "_");
    const fileName = fileBase.endsWith(".md") || fileBase.endsWith(".txt") ? fileBase : `${fileBase}.md`;
    const content = asString(req.body?.content || "").slice(0, 200_000);
    if (!content) return res.status(400).json({ message: "content required" });
    const correlationId = asString(req.body?.correlationId || req.body?.correlation_id || req.headers?.["x-correlation-id"] || "");

    const now = new Date();
    const yyyy = `${now.getUTCFullYear()}`;
    const mm = `${now.getUTCMonth() + 1}`.padStart(2, "0");
    const dd = `${now.getUTCDate()}`.padStart(2, "0");
    const root = path.resolve(process.cwd(), "attached_assets", "workstations", String(tenantId), String(workstation.id));
    await mkdir(root, { recursive: true });
    const absoluteFile = path.join(root, fileName);
    const fullBody = [
      `# ${template || "Document"}`,
      ``,
      `GeneratedAt: ${now.toISOString()}`,
      `Workstation: ${workstation.id}`,
      `Agent: ${workstation.agent_id}`,
      ``,
      content,
      ``,
    ].join("\n");
    await writeFile(absoluteFile, fullBody, "utf8");
    const hash = createHash("sha256").update(Buffer.from(fullBody, "utf8")).digest("hex");

    const artifactId = randomUUID();
    const storageKey = `workstations/${tenantId}/${workstation.id}/${yyyy}/${mm}/${dd}/${fileName}`;
    const relativeUrl = `/attached_assets/workstations/${tenantId}/${workstation.id}/${fileName}`;

    await db.execute(sql`
      insert into workstation_artifacts (
        id, tenant_id, workstation_id, agent_id, task_id, type, storage_key, url, sha256, metadata, created_at
      )
      values (
        ${artifactId},
        ${tenantId},
        ${workstation.id},
        ${workstation.agent_id},
        ${req.body?.taskId ? Number(req.body.taskId) : null},
        'LOG',
        ${storageKey},
        ${relativeUrl},
        ${hash},
        ${JSON.stringify({
          template,
          fileName,
          generatedBy: staffUser?.id ? Number(staffUser.id) : null,
          tool: "createDocument",
        })}::jsonb,
        now()
      )
    `);

    const actionRunIdRaw = Number(req.body?.actionRunId || req.body?.action_run_id || 0);
    if (Number.isInteger(actionRunIdRaw) && actionRunIdRaw > 0) {
      await db.execute(sql`
        insert into action_receipts (
          id,
          tenant_id,
          action_run_id,
          receipt_type,
          entity_type,
          entity_ids_json,
          affected_rows,
          external_ref,
          evidence_url,
          created_at
        )
        values (
          ${randomUUID()},
          ${tenantId},
          ${actionRunIdRaw},
          'FILE_ARTIFACT',
          'workstation_artifact',
          ${JSON.stringify([artifactId])}::jsonb,
          1,
          ${artifactId},
          ${relativeUrl},
          now()
        )
      `);
    }

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType: "DOCUMENT_CREATED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
      command: `createDocument:${fileName}`,
      origin: "agent",
      correlationId,
      payload: {
        template,
        fileName,
        artifactId,
        storageKey,
      },
    });

    return res.status(201).json({
      ok: true,
      artifact: {
        id: artifactId,
        type: "LOG",
        storageKey,
        url: relativeUrl,
        sha256: hash,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to create document artifact" });
  }
});

router.post("/api/workstations/:id/start", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canControlWorkstation(staffUser)) return res.status(403).json({ message: "Forbidden" });

    let workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    workstation = await ensureProviderRefForWorkstation({
      tenantId,
      workstation,
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
      correlationId: asString(req.headers?.["x-correlation-id"] || req.body?.correlationId || req.body?.correlation_id || ""),
    });
    if (!workstation.provider_ref) return res.status(400).json({ message: "Provider reference missing" });

    const runtime = await (await provider()).start(workstation.provider_ref);
    await db.execute(sql`
      update agent_workstations
      set
        status = ${runtime.status},
        ide_url = ${runtime.urls.ideUrl || null},
        desktop_url = ${runtime.urls.desktopUrl || null},
        terminal_url = ${runtime.urls.terminalUrl || null},
        metadata = ${JSON.stringify(runtime.metadata || {})}::jsonb,
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${workstation.id}
    `);

    const sessionId = await createSession({
      tenantId,
      workstationId: workstation.id,
      sessionType: "API",
      userId: staffUser?.id ? Number(staffUser.id) : null,
      agentId: workstation.agent_id ? Number(workstation.agent_id) : null,
      ip: asString(req.headers["x-forwarded-for"] || req.ip || "").slice(0, 128) || null,
      userAgent: asString(req.headers["user-agent"] || "").slice(0, 512) || null,
    });

    await upsertAgentWorkstationSession({
      sessionId,
      tenantId,
      agentId: Number(workstation.agent_id),
      workstationId: workstation.id,
      status: "RUNNING",
      activeTab: "API",
      metadata: {
        source: "workstation_start_endpoint",
      },
    });

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      sessionId,
      eventType: "WORKSTATION_SESSION_STARTED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
      origin: "system",
      payload: {
        status: runtime.status,
      },
    });

    emitWorkstationRealtime(req, "workstation:session-started", {
      tenantId,
      workstationId: workstation.id,
      agentId: workstation.agent_id,
      sessionId,
      startedAt: new Date().toISOString(),
    });

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType: "WORKSTATION_STARTED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      payload: { status: runtime.status },
    });

    const updated = await findWorkstation(tenantId, workstation.id);
    return res.json({ workstation: updated, sessionId });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to start workstation" });
  }
});

router.post("/api/workstations/:id/stop", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canControlWorkstation(staffUser)) return res.status(403).json({ message: "Forbidden" });

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    if (!workstation.provider_ref) return res.status(400).json({ message: "Provider reference missing" });

    const runtime = await (await provider()).stop(workstation.provider_ref);
    await db.execute(sql`
      update agent_workstations
      set
        status = ${runtime.status},
        ide_url = ${runtime.urls.ideUrl || null},
        desktop_url = ${runtime.urls.desktopUrl || null},
        terminal_url = ${runtime.urls.terminalUrl || null},
        metadata = ${JSON.stringify(runtime.metadata || {})}::jsonb,
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${workstation.id}
    `);

    await db.execute(sql`
      update workstation_sessions
      set ended_at = now()
      where tenant_id = ${tenantId}
        and workstation_id = ${workstation.id}
        and ended_at is null
    `);
    await closeAgentWorkstationSessions({ tenantId, workstationId: workstation.id, status: "CLOSED" });

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType: "WORKSTATION_STOPPED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      payload: { status: runtime.status },
    });

    const updated = await findWorkstation(tenantId, workstation.id);
    return res.json({ workstation: updated });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to stop workstation" });
  }
});

router.post("/api/workstations/:id/terminate-session", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canControlWorkstation(staffUser)) return res.status(403).json({ message: "Forbidden" });

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });

    await db.execute(sql`
      update workstation_sessions
      set ended_at = now()
      where tenant_id = ${tenantId}
        and workstation_id = ${workstation.id}
        and ended_at is null
    `);
    await closeAgentWorkstationSessions({ tenantId, workstationId: workstation.id, status: "CLOSED" });

    let runtime = null as Awaited<ReturnType<IWorkstationProvider["stop"]>> | null;
    if (workstation.provider_ref && String(workstation.status || "").toUpperCase() === "RUNNING") {
      runtime = await (await provider()).stop(workstation.provider_ref);
      await db.execute(sql`
        update agent_workstations
        set
          status = ${runtime.status},
          ide_url = ${runtime.urls.ideUrl || null},
          desktop_url = ${runtime.urls.desktopUrl || null},
          terminal_url = ${runtime.urls.terminalUrl || null},
          metadata = ${JSON.stringify(runtime.metadata || {})}::jsonb,
          updated_at = now()
        where tenant_id = ${tenantId}
          and id = ${workstation.id}
      `);
    }

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType: "WORKSTATION_SESSION_TERMINATED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      actorAgentId: workstation.agent_id ? Number(workstation.agent_id) : null,
      origin: "system",
      payload: {
        status: runtime?.status || workstation.status,
      },
    });

    const updated = await findWorkstation(tenantId, workstation.id);
    return res.json({ workstation: updated });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to terminate session" });
  }
});

router.post("/api/workstations/:id/reassign", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canControlWorkstation(staffUser)) return res.status(403).json({ message: "Forbidden" });

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });

    const targetAgentId = asInt(req.body?.agentId, 0, 1, Number.MAX_SAFE_INTEGER);
    if (!targetAgentId) return res.status(400).json({ message: "agentId required" });
    if (Number(workstation.agent_id) === targetAgentId) {
      return res.status(200).json({ ok: true, workstation });
    }

    if (["RUNNING", "CREATING"].includes(String(workstation.status || "").toUpperCase())) {
      return res.status(409).json({ message: "Stop or terminate the current session before reassigning." });
    }

    const targetRows = await db.execute(sql`
      select a.id, a.name
      from agents a
      where a.id = ${targetAgentId}
        and a.tenant_id = ${tenantId}
        and coalesce(a.domain, 'INTERNAL') = 'INTERNAL'
        and coalesce(a.is_test, false) = false
        and coalesce(a.is_visible, true) = true
        and lower(coalesce(a.status, 'active')) not in ('archived', 'inactive')
        and lower(coalesce(a.name, '')) not like '%test%'
        and lower(coalesce(a.name, '')) not like '%demo%'
      limit 1
    `);
    const targetAgent = getRows<any>(targetRows)[0];
    if (!targetAgent) return res.status(404).json({ message: "Target agent not found or inactive" });

    const fromAgentId = Number(workstation.agent_id);

    await db.execute(sql`
      update agent_workstations
      set
        agent_id = ${targetAgentId},
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'reassignedAt', now(),
          'reassignedByUserId', ${staffUser?.id ? Number(staffUser.id) : null}
        )
      where tenant_id = ${tenantId}
        and id = ${workstation.id}
    `);

    await ensureWorkstationForAgent(tenantId, targetAgentId);

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType: "WORKSTATION_REASSIGNED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      actorAgentId: targetAgentId,
      origin: "system",
      payload: {
        fromAgentId,
        toAgentId: targetAgentId,
      },
    });

    const updated = await findWorkstation(tenantId, workstation.id);
    return res.json({ ok: true, workstation: updated, targetAgent });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to reassign workstation" });
  }
});

router.delete("/api/workstations/:id", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canControlWorkstation(staffUser)) return res.status(403).json({ message: "Forbidden" });

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });

    if (workstation.provider_ref) {
      await (await provider()).destroy(workstation.provider_ref);
    }

    await db.execute(sql`
      update agent_workstations
      set status = 'DESTROYED', updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${workstation.id}
    `);

    await db.execute(sql`
      update workstation_sessions
      set ended_at = now()
      where tenant_id = ${tenantId}
        and workstation_id = ${workstation.id}
        and ended_at is null
    `);
    await closeAgentWorkstationSessions({ tenantId, workstationId: workstation.id, status: "CLOSED" });

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType: "WORKSTATION_DESTROYED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      payload: {},
    });

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to destroy workstation" });
  }
});

router.get("/api/workstations/:id/status", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

    const staffUser = req.staffUser as StaffUser | undefined;
    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });
    if (!canAccessWorkstation(staffUser, workstation) && !canViewMonitor(staffUser)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!workstation.provider_ref) return res.status(400).json({ message: "Provider reference missing" });

    const runtime = await (await provider()).status(workstation.provider_ref);

    await db.execute(sql`
      update agent_workstations
      set
        status = ${runtime.status},
        ide_url = ${runtime.urls.ideUrl || null},
        desktop_url = ${runtime.urls.desktopUrl || null},
        terminal_url = ${runtime.urls.terminalUrl || null},
        metadata = ${JSON.stringify(runtime.metadata || {})}::jsonb,
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${workstation.id}
    `);

    const updated = await findWorkstation(tenantId, workstation.id);
    return res.json({ workstation: updated });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to get workstation status" });
  }
});

router.get("/api/workstations/:id/live-url", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const feature = featuresEnabled();
    if (!feature.monitoring) return res.status(404).json({ message: "Workstation monitoring disabled" });

    const staffUser = req.staffUser as StaffUser | undefined;
    if (!isAdminLike(staffUser) && !canViewLive(staffUser)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });

    const scopeRaw = asString(req.query?.scope || req.query?.mode || "DESKTOP").toUpperCase();
    const scope = scopeRaw === "IDE" || scopeRaw === "TERMINAL" ? (scopeRaw as "IDE" | "TERMINAL") : "DESKTOP";

    const token = await issueViewToken({
      req,
      tenantId,
      workstation,
      staffUser,
      scope,
    });

    return res.json({
      ok: true,
      workstationId: workstation.id,
      scope: token.scope,
      liveUrl: token.url,
      expiresAt: token.expiresAt.toISOString(),
      sessionId: token.sessionId,
    });
  } catch (error: any) {
    const msg = String(error?.message || error || "Failed to generate live URL");
    const status = msg.includes("URL not available") ? 400 : 500;
    return res.status(status).json({ message: msg });
  }
});

router.post("/api/workstations/:id/view-token", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const feature = featuresEnabled();
    if (!feature.monitoring) return res.status(404).json({ message: "Workstation monitoring disabled" });

    const staffUser = req.staffUser as StaffUser | undefined;
    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });

    const scope = coerceScope(req.body?.scope);
    const isOwn = canAccessWorkstation(staffUser, workstation);
    if (!isOwn && !(scope === "IDE" ? canViewMonitor(staffUser) : canViewLive(staffUser))) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const token = await issueViewToken({
      req,
      tenantId,
      workstation,
      staffUser,
      scope,
    });

    return res.json({
      scope: token.scope,
      expiresAt: token.expiresAt.toISOString(),
      url: token.url,
      sessionId: token.sessionId,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to generate view token" });
  }
});

router.get("/w/:workstationId/:scope", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

    const workstationId = asString(req.params.workstationId);
    const scope = coerceScope(req.params.scope);
    const token = asString(req.query?.token);
    if (!token) return res.status(400).json({ message: "Missing token" });

    const tokenResult = await db.execute(sql`
      select *
      from workstation_view_tokens
      where tenant_id = ${tenantId}
        and workstation_id = ${workstationId}
        and token = ${token}
      limit 1
    `);
    const tokenRow = getRows<any>(tokenResult)[0] || null;
    if (!tokenRow) return res.status(404).json({ message: "View token not found" });
    if (String(tokenRow.scope || "").toUpperCase() !== scope) return res.status(400).json({ message: "Scope mismatch" });

    const expiry = new Date(tokenRow.expires_at || "");
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      return res.status(410).json({ message: "View token expired" });
    }

    const workstation = await findWorkstation(tenantId, workstationId);
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });

    const target = resolveScopeUrl(workstation, scope);
    if (!target) return res.status(400).json({ message: `${scope} URL unavailable` });

    await db.execute(sql`
      update workstation_view_tokens
      set used_at = now()
      where tenant_id = ${tenantId}
        and id = ${tokenRow.id}
    `);

    const sessionId = asString(tokenRow.session_id);
    if (sessionId) {
      await db.execute(sql`
        update workstation_sessions
        set
          ip = coalesce(${asString(req.headers["x-forwarded-for"] || req.ip || "").slice(0, 128) || null}, ip),
          user_agent = coalesce(${asString(req.headers["user-agent"] || "").slice(0, 512) || null}, user_agent)
        where tenant_id = ${tenantId}
          and id = ${sessionId}
      `);

      await db.execute(sql`
        update agent_workstation_sessions
        set
          active_tab = ${scope},
          last_activity_at = now()
        where tenant_id = ${tenantId}
          and id = ${sessionId}
      `);
    }

    return res.redirect(target);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to open workstation view" });
  }
});

router.post("/api/workstations/:id/network-policy", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });
    const feature = featuresEnabled();
    if (!feature.internet) return res.status(404).json({ message: "Workstation internet controls disabled" });

    const staffUser = req.staffUser as StaffUser | undefined;
    if (!canEditNetwork(staffUser)) return res.status(403).json({ message: "Forbidden" });

    const workstation = await findWorkstation(tenantId, asString(req.params.id));
    if (!workstation) return res.status(404).json({ message: "Workstation not found" });

    const modeRaw = asString(req.body?.mode).toUpperCase();
    const mode = modeRaw === "ALLOWLIST" || modeRaw === "FULL_EGRESS" ? modeRaw : "DEFAULT_DENY";
    const allowedDomains = Array.isArray(req.body?.allowedDomains)
      ? req.body.allowedDomains.map((x: any) => asString(x).toLowerCase()).filter(Boolean).slice(0, 300)
      : [];
    const allowedIpRanges = Array.isArray(req.body?.allowedIpRanges)
      ? req.body.allowedIpRanges.map((x: any) => asString(x).toLowerCase()).filter(Boolean).slice(0, 300)
      : [];
    const notes = asString(req.body?.notes || null) || null;

    const policyId = randomUUID();
    await db.execute(sql`
      insert into workstation_network_policies (
        id,
        tenant_id,
        mode,
        allowed_domains,
        allowed_ip_ranges,
        notes,
        updated_by_user_id,
        updated_at,
        created_at
      )
      values (
        ${policyId},
        ${tenantId},
        ${mode},
        ${JSON.stringify(allowedDomains)}::jsonb,
        ${JSON.stringify(allowedIpRanges)}::jsonb,
        ${notes},
        ${staffUser?.id ? Number(staffUser.id) : null},
        now(),
        now()
      )
    `);

    await db.execute(sql`
      update agent_workstations
      set
        network_policy_id = ${policyId},
        network_policy_mode = ${mode},
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${workstation.id}
    `);

    await insertEvent({
      tenantId,
      workstationId: workstation.id,
      eventType: "INTERNET_POLICY_CHANGED",
      actorUserId: staffUser?.id ? Number(staffUser.id) : null,
      payload: { mode, allowedDomains: allowedDomains.slice(0, 30), count: allowedDomains.length },
    });

    const updated = await findWorkstation(tenantId, workstation.id);
    return res.json({ workstation: updated });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update network policy" });
  }
});

export default router;
