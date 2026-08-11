import { db } from "@db";
import { eq, sql } from "drizzle-orm";
import {
  actionReceipts,
  actionResults,
  actionRequests,
  agents,
  auditLogs,
  chatRooms,
  companies,
  eceUsers,
  meetings,
  messages,
  roomMemberships,
  sellers,
  tasks,
  users,
} from "@db/schema";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { nanoid } from "nanoid";
import { randomUUID } from "crypto";
import { sendEmailAsAgent } from "../mail/sender";
import { sendCommunicationAsStaff } from "../communications/sendAsStaff";
import { handleNotificationActionFailure, handleNotificationActionSuccess } from "../notifications";
import { generateMeetingSummary } from "../meet/aiWorker";
import { createMeetSession, getMeetSession, getUserDisplayName, issueMeetInvite, upsertParticipantJoin } from "../meet/service";
import { isAgentRunnableStatus } from "../agents/visibility";
import { startBackgroundConversationEngine } from "../backgroundConversationEngine";
import { startOpsCommsAutopilot } from "../ops-comms/autopilot";
import { enableAiBackgroundRuntime } from "../ai-consent";
import { setSetting } from "../settings";
import { isVoiceTranscriptionConfigured, transcribeAudioFile } from "../voice/transcriber";
import { ensureTenantContactLink, upsertCanonicalContact } from "../contact/tenantContacts";
import {
  appendActionEvent,
  ensureActionPublicId,
  formatPublicActionLabel,
  inferActionErrorCode,
} from "./lifecycle";

type ActionRequestRow = typeof actionRequests.$inferSelect;
type ActionRunOutcome = "SUCCESS" | "FAILED" | "NO_EFFECT" | "APPROVAL_PENDING";
type ActionMode = "REAL" | "SIMULATED";

type ActionReceiptInput = {
  receiptType: "DB_MUTATION" | "HTTP_CALL" | "FILE_ARTIFACT" | "WORKSTATION_EVENT";
  entityType?: string | null;
  entityIds?: Array<string | number> | null;
  affectedRows?: number | null;
  beforeHash?: string | null;
  afterHash?: string | null;
  externalRef?: string | null;
  evidenceUrl?: string | null;
};

const TRANSCRIBE_MAX_ATTEMPTS = 4; // initial attempt + 3 retries
const ACTION_CLAIM_TTL_SECONDS = Math.max(
  15,
  Number.parseInt(String(process.env.ACTIONS_RUNNER_CLAIM_TTL_SECONDS || "90"), 10) || 90,
);
const ACTIONS_RUNNER_ID = `${
  String(process.env.ACTIONS_RUNNER_ID || process.env.HOSTNAME || os.hostname()).trim() || "runner"
}:${process.pid}`;

function nowIso() {
  return new Date().toISOString();
}

async function logAudit(input: {
  tenantId: number;
  userId: number | null;
  action: string;
  entityId: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.userId,
      userRole: "staff",
      action: input.action,
      entityType: "action_request",
      entityId: input.entityId,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    });
  } catch {
    // ignore
  }
}

function safeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function safeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  return [];
}

function normalizeRoleLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTenantAdminUser(user: any): boolean {
  if (!user) return false;
  const currentMode = String(user.currentMode || "").toLowerCase();
  if (currentMode === "admin") return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes("*") || permissions.includes("admin:*")) return true;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const normalized = roles.map((r: any) => normalizeRoleLabel(String(r)));
  return (
    normalized.includes("admin") ||
    normalized.includes("chairman") ||
    normalized.includes("super admin") ||
    normalized.includes("platform admin") ||
    normalized.includes("chairman assistant") ||
    normalized.includes("chairmans assistant")
  );
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function normalizeAgentRuntimeModel(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, 200);
}

function normalizeAgentTools(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const tool = String(entry ?? "").trim();
    if (!tool) continue;
    const key = tool.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tool.slice(0, 120));
  }
  return out.slice(0, 100);
}

function normalizeAgentStatus(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "inactive") return "inactive";
  if (normalized === "paused") return "paused";
  if (normalized === "archived") return "archived";
  return "active";
}

function normalizeActionMode(value: unknown): ActionMode {
  const mode = String(value || "").trim().toUpperCase();
  return mode === "SIMULATED" ? "SIMULATED" : "REAL";
}

function normalizeActionOutcome(value: unknown): ActionRunOutcome {
  const outcome = String(value || "").trim().toUpperCase();
  if (outcome === "SUCCESS" || outcome === "FAILED" || outcome === "NO_EFFECT") return outcome;
  return "APPROVAL_PENDING";
}

function uniqueEntityIds(values: Array<string | number> | null | undefined) {
  if (!Array.isArray(values)) return [] as Array<string | number>;
  const seen = new Set<string>();
  const out: Array<string | number> = [];
  for (const value of values) {
    if (value == null) continue;
    const asText = String(value).trim();
    if (!asText) continue;
    const key = `${typeof value}:${asText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(typeof value === "number" ? Number(value) : asText);
  }
  return out;
}

function inferReceiptsFromResult(actionType: string, result: Record<string, unknown> | undefined): ActionReceiptInput[] {
  const payload = safeObject(result);
  const receipts: ActionReceiptInput[] = [];

  const dbEntityId = (
    payload.contactId ??
    payload.shopId ??
    payload.taskId ??
    payload.meetingId ??
    payload.agentId ??
    payload.conversationParticipantId
  ) as number | string | null | undefined;

  if (dbEntityId != null) {
    const entityType =
      (typeof payload.entityType === "string" && payload.entityType) ||
      (actionType === "CREATE_CONTACT"
        ? "contact"
        : actionType === "CREATE_SHOP"
          ? "shop"
          : actionType === "CREATE_TASK"
            ? "task"
            : actionType === "CREATE_AGENT" || actionType === "UPDATE_AGENT_MODEL"
              ? "agent"
              : actionType === "ASSIGN_AGENT_TO_CONVERSATION"
                ? "conversation_participant"
                : "entity");
    receipts.push({
      receiptType: "DB_MUTATION",
      entityType,
      entityIds: [dbEntityId],
      affectedRows: 1,
    });
  }

  const createdAgentIds = Array.isArray(payload.agentIds) ? payload.agentIds : [];
  if (createdAgentIds.length) {
    receipts.push({
      receiptType: "DB_MUTATION",
      entityType: "agent",
      entityIds: uniqueEntityIds(createdAgentIds as Array<string | number>),
      affectedRows: uniqueEntityIds(createdAgentIds as Array<string | number>).length,
    });
  }

  const messageId = payload.messageId ?? payload.providerMessageId;
  if (messageId != null && (actionType === "SEND_EMAIL" || actionType === "SEND_SMS" || actionType === "SEND_WHATSAPP")) {
    receipts.push({
      receiptType: "HTTP_CALL",
      externalRef: String(messageId),
      entityType: actionType.toLowerCase(),
      entityIds: [],
      affectedRows: 1,
    });
  }

  if (payload.artifactId != null) {
    receipts.push({
      receiptType: "FILE_ARTIFACT",
      entityType: "artifact",
      entityIds: [payload.artifactId as string | number],
      affectedRows: 1,
      evidenceUrl: typeof payload.url === "string" ? payload.url : null,
    });
  }

  return receipts;
}

function buildSellerSlug(shopName: string) {
  const base = String(shopName || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);
  const prefix = base || "shop";
  return `${prefix}-${nanoid(6).toLowerCase()}`;
}

function normalizePhoneForLookup(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

async function findUserIdByIdentity(input: { email?: string | null; phone?: string | null }) {
  const email = String(input.email || "").trim().toLowerCase();
  const phone = normalizePhoneForLookup(input.phone ?? null);

  if (email) {
    const rows = getResultRows(
      await db.execute(sql`
        select id
        from users
        where lower(coalesce(email, '')) = ${email}
        order by id asc
        limit 1
      `),
    );
    const userId = parseOptionalNumber(rows[0]?.id);
    if (userId) return userId;
  }

  if (phone) {
    const rows = getResultRows(
      await db.execute(sql`
        select id
        from users
        where regexp_replace(coalesce(phone_number, ''), '[^0-9+]', '', 'g') = ${phone}
        order by id asc
        limit 1
      `),
    );
    const userId = parseOptionalNumber(rows[0]?.id);
    if (userId) return userId;
  }

  return null;
}

async function findTenantFallbackUserId(tenantId: number) {
  const rows = getResultRows(
    await db.execute(sql`
      select u.id
      from users u
      join user_tenant_roles utr on utr.user_id = u.id
      where utr.tenant_id = ${tenantId}
      order by
        case
          when lower(coalesce(utr.role::text, '')) in ('owner', 'admin', 'chairman') then 0
          else 1
        end,
        utr.id asc
      limit 1
    `),
  );
  return parseOptionalNumber(rows[0]?.id);
}

async function findFallbackCompanyId() {
  const rows = getResultRows(
    await db.execute(sql`
      select id
      from companies
      order by updated_at desc nulls last, created_at desc nulls last, id desc
      limit 1
    `),
  );
  return parseOptionalNumber(rows[0]?.id);
}

async function resolveDepartmentId(input: { companyId: number | null; payload: Record<string, unknown> }) {
  const explicitDepartmentId = parseOptionalNumber(
    (input.payload as any).departmentId ?? (input.payload as any).department_id,
  );
  if (explicitDepartmentId && explicitDepartmentId > 0) return explicitDepartmentId;
  if (!input.companyId || input.companyId <= 0) return null;

  const departmentName = firstNonEmptyString((input.payload as any).department, (input.payload as any).team);
  if (!departmentName) return null;

  const rows = getResultRows(
    await db.execute(sql`
      select id
      from departments
      where company_id = ${input.companyId}
        and lower(name) = lower(${departmentName})
      order by id asc
      limit 1
    `),
  );
  return parseOptionalNumber(rows[0]?.id);
}

async function upsertAgentRuntimeMetadata(input: {
  agentId: number;
  runtimeModel: string | null;
  toolsEnabled: string[];
  tenantId: number;
}) {
  const rows = getResultRows(
    await db.execute(sql`
      select coalesce(metadata, '{}'::jsonb) as metadata
      from agents
      where id = ${input.agentId}
      limit 1
    `),
  );
  const existing = safeObject(rows[0]?.metadata);
  const next = {
    ...existing,
    tenantId: input.tenantId,
    runtimeModel: input.runtimeModel,
    toolsEnabled: input.toolsEnabled,
  };

  await db.execute(sql`
    update agents
    set
      runtime_model = ${input.runtimeModel},
      tools_enabled_json = ${JSON.stringify(input.toolsEnabled)}::jsonb,
      metadata = ${JSON.stringify(next)}::jsonb,
      updated_at = now()
    where id = ${input.agentId}
  `);
}

async function resolveShopContactSnapshot(input: {
  tenantId: number;
  payload: Record<string, unknown>;
  conversationId: string | null;
  requestedByUserId: number | null;
}) {
  const explicitOwnerContactId =
    parseOptionalNumber((input.payload as any).ownerContactId ?? (input.payload as any).owner_contact_id) ?? null;
  const ownerContactRef = firstNonEmptyString(
    (input.payload as any).ownerContactRef,
    (input.payload as any).owner_contact_ref,
    (input.payload as any).ownerContactId,
    (input.payload as any).owner_contact_id,
  );

  let resolvedContactId = explicitOwnerContactId;

  if (!resolvedContactId && ownerContactRef) {
    const lowerRef = ownerContactRef.toLowerCase();
    const wantsLastCreated = lowerRef.includes("last_created_contact_id") || lowerRef.includes("last_contact_id");
    if (wantsLastCreated) {
      const rows = getResultRows(
        await db.execute(sql`
          select (ar_result.result->>'contactId')::int as contact_id
          from action_requests ar
          join action_results ar_result on ar_result.action_request_id = ar.id and ar_result.tenant_id = ar.tenant_id
          where ar.tenant_id = ${input.tenantId}
            and ar.action_type = 'CREATE_CONTACT'
            and ar.status = 'DONE'
            and (
              ${input.conversationId ? sql`coalesce(ar.related_conversation_id, '') = ${input.conversationId}` : sql`false`}
              or ${input.requestedByUserId ? sql`coalesce(ar.requested_by_user_id, 0) = ${input.requestedByUserId}` : sql`false`}
            )
          order by ar_result.created_at desc
          limit 1
        `),
      );
      resolvedContactId = parseOptionalNumber(rows[0]?.contact_id);
    } else {
      resolvedContactId = parseOptionalNumber(ownerContactRef);
    }
  }

  if (!resolvedContactId) {
    return {
      contactId: null,
      displayName: null as string | null,
      email: null as string | null,
      phone: null as string | null,
    };
  }

  const rows = getResultRows(
    await db.execute(sql`
      select
        c.id,
        coalesce(
          nullif(trim(coalesce(c.display_name, '')), ''),
          nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '')
        ) as display_name,
        coalesce(nullif(trim(c.primary_email), ''), nullif(trim(c.email), '')) as email,
        coalesce(
          nullif(trim(c.primary_phone_e164), ''),
          nullif(trim(c.phone_normalized), ''),
          nullif(trim(c.phone), '')
        ) as phone
      from contacts c
      join tenant_contacts tc on tc.contact_id = c.id and tc.tenant_id = ${input.tenantId}
      where c.id = ${resolvedContactId}
      limit 1
    `),
  );
  const row = rows[0];
  if (!row) {
    return {
      contactId: resolvedContactId,
      displayName: null as string | null,
      email: null as string | null,
      phone: null as string | null,
    };
  }

  return {
    contactId: parseOptionalNumber(row.id),
    displayName: firstNonEmptyString(row.display_name),
    email: firstNonEmptyString(row.email),
    phone: firstNonEmptyString(row.phone),
  };
}

type RecurringAutomationPlan = {
  intervalMinutes: number;
  maxRuns: number;
  runIndex: number;
};

function resolveRecurringAutomationPlan(payload: Record<string, unknown>, meta: Record<string, unknown>) {
  const recurringPayload = safeObject((payload as any).recurring);
  const recurringMeta = safeObject((meta as any).recurring);
  const enabled =
    parseOptionalBoolean(
      recurringPayload.enabled ??
        recurringPayload.active ??
        (payload as any).recurringEnabled ??
        recurringMeta.enabled ??
        recurringMeta.active,
    ) ?? false;

  if (!enabled) return null;

  const intervalMinutesRaw = parseOptionalNumber(
    recurringPayload.intervalMinutes ??
      recurringPayload.everyMinutes ??
      (payload as any).intervalMinutes ??
      recurringMeta.intervalMinutes ??
      recurringMeta.everyMinutes,
  );
  const intervalMinutes = Number.isFinite(intervalMinutesRaw) && (intervalMinutesRaw as number) > 0 ? Math.trunc(intervalMinutesRaw as number) : 60;

  const maxRunsRaw = parseOptionalNumber(
    recurringPayload.maxRuns ??
      recurringPayload.max_iterations ??
      (payload as any).maxRuns ??
      recurringMeta.maxRuns ??
      recurringMeta.max_iterations,
  );
  const maxRuns = Number.isFinite(maxRunsRaw) && (maxRunsRaw as number) > 0 ? Math.min(500, Math.trunc(maxRunsRaw as number)) : 20;

  const runIndexRaw = parseOptionalNumber(recurringMeta.runIndex ?? recurringMeta.iteration ?? recurringPayload.runIndex);
  const runIndex = Number.isFinite(runIndexRaw) && (runIndexRaw as number) > 0 ? Math.trunc(runIndexRaw as number) : 1;

  return {
    intervalMinutes: Math.min(24 * 60, Math.max(1, intervalMinutes)),
    maxRuns,
    runIndex,
  } as RecurringAutomationPlan;
}

function getResultRows(result: any) {
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result)) return result;
  return [];
}

function resolveAssetAbsolutePathCandidates(inputUrl: string) {
  const baseRoots = [
    process.env.ASSET_BASE_PATH,
    process.env.ASSET_ROOT,
    "/data/assets",
    path.resolve(process.cwd(), "uploads"),
    path.resolve(process.cwd(), "data", "assets"),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const uniqueRoots = Array.from(new Set(baseRoots));

  const publicPath = String(process.env.ASSET_PUBLIC_PATH || "/assets")
    .trim()
    .replace(/\/+$/, "");

  let pathname = String(inputUrl || "").trim();
  if (!pathname) return [];

  try {
    if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
  } catch {
    // ignore
  }

  const candidates: string[] = [];
  const pushCandidate = (candidate: string | null | undefined) => {
    const normalized = String(candidate || "").trim();
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  const isAbsolutePath =
    pathname.startsWith("/") ||
    /^[a-z]:\\/i.test(pathname) ||
    pathname.startsWith("\\\\");

  if (isAbsolutePath) {
    pushCandidate(pathname);
  }

  const normalizedPublicPrefix = publicPath ? pathname.startsWith(publicPath) : false;
  const normalizedDataAssetsPrefix = pathname.startsWith("/data/assets");
  let relativePath = pathname;
  if (normalizedPublicPrefix) relativePath = pathname.slice(publicPath.length);
  if (normalizedDataAssetsPrefix) relativePath = pathname.slice("/data/assets".length);
  relativePath = relativePath.replace(/^\/+/, "");

  if (relativePath) {
    for (const root of uniqueRoots) {
      pushCandidate(path.join(root, relativePath));
    }
  }

  return candidates;
}

async function resolveReadableAssetPath(inputUrls: Array<string | null | undefined>) {
  const candidates = Array.from(
    new Set(
      inputUrls
        .flatMap((inputUrl) => resolveAssetAbsolutePathCandidates(String(inputUrl || "")))
        .filter(Boolean),
    ),
  );

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return { path: candidate, checkedPaths: candidates };
    } catch {
      // try next
    }
  }

  return { path: null as string | null, checkedPaths: candidates };
}

function inferAudioExtensionFromHint(value: string | null | undefined) {
  const input = String(value || "").toLowerCase();
  if (!input) return ".webm";
  if (input.includes(".ogg") || input.includes("audio/ogg")) return ".ogg";
  if (input.includes(".wav") || input.includes("audio/wav")) return ".wav";
  if (input.includes(".mp3") || input.includes("audio/mpeg")) return ".mp3";
  if (input.includes(".m4a") || input.includes("audio/mp4")) return ".m4a";
  if (input.includes(".webm") || input.includes("audio/webm")) return ".webm";
  return ".webm";
}

function resolveFetchableAssetUrls(inputUrls: Array<string | null | undefined>) {
  const urls = new Set<string>();
  const baseCandidates = [
    process.env.PUBLIC_BASE_URL,
    process.env.APP_BASE_URL,
    process.env.EXTERNAL_BASE_URL,
    process.env.SITE_URL,
    process.env.INTERNAL_BASE_URL,
    process.env.INTERNAL_APP_URL,
    process.env.INTERNAL_API_URL,
    `http://127.0.0.1:${Number.parseInt(String(process.env.PORT || process.env.SERVER_PORT || "5000"), 10) || 5000}`,
    `http://localhost:${Number.parseInt(String(process.env.PORT || process.env.SERVER_PORT || "5000"), 10) || 5000}`,
  ]
    .map((value) => String(value || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);

  for (const raw of inputUrls) {
    const value = String(raw || "").trim();
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) {
      urls.add(value);
      continue;
    }
    if (value.startsWith("/")) {
      for (const base of baseCandidates) {
        urls.add(`${base}${value}`);
      }
    }
  }

  return Array.from(urls);
}

async function downloadRemoteAssetToTemp(inputUrls: Array<string | null | undefined>) {
  const triedUrls: string[] = [];
  const errors: string[] = [];
  const candidates = resolveFetchableAssetUrls(inputUrls);

  for (const candidate of candidates) {
    triedUrls.push(candidate);
    try {
      const response = await fetch(candidate, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
      });
      if (!response.ok) {
        errors.push(`${candidate} -> HTTP ${response.status}`);
        continue;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) {
        errors.push(`${candidate} -> empty body`);
        continue;
      }

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const ext = inferAudioExtensionFromHint(contentType || candidate);
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "voice-transcribe-"));
      const tmpPath = path.join(tmpDir, `input${ext}`);
      await fs.writeFile(tmpPath, bytes);
      return { path: tmpPath, triedUrls, errors };
    } catch (error: any) {
      errors.push(`${candidate} -> ${String(error?.message || error || "request failed")}`);
    }
  }

  return { path: null as string | null, triedUrls, errors };
}

function computeTranscribeBackoffMs(attemptNumber: number) {
  const attempt = Math.max(1, Math.trunc(attemptNumber));
  const baseMs = 15_000;
  const exp = Math.pow(2, Math.min(10, attempt - 1));
  const jitter = Math.floor(Math.random() * 2500);
  return Math.min(10 * 60_000, baseMs * exp + jitter);
}

async function assertActionActorRunnable(input: {
  actionId: number;
  candidateAgentId: number | null;
  actionType: string;
}) {
  if (!input.candidateAgentId) return;
  const agent = await db.query.agents.findFirst({
    where: sql`${agents.id} = ${input.candidateAgentId}`,
    columns: {
      id: true,
      name: true,
      status: true,
      isTest: true,
      isVisible: true,
    },
  });
  if (!agent) return;
  if (!isAgentRunnableStatus(agent.status) || agent.isTest || !agent.isVisible) {
    throw new Error(
      `Action blocked: agent ${agent.id} (${agent.name}) is not runnable (status=${String(agent.status)}, is_test=${Boolean(
        agent.isTest,
      )}, is_visible=${Boolean(agent.isVisible)})`,
    );
  }
}

async function postActionOutcomeMessage(opts: {
  action: ActionRequestRow;
  actionType: string;
  correlationId: string | null;
  conversationId: string | null;
  success: boolean;
  detail: string;
}) {
  if (!opts.conversationId) return;

  const actionId = Number((opts.action as any)?.id ?? 0) || 0;
  const actionLabel = formatPublicActionLabel(opts.action);
  const suffix = opts.detail ? ` ${opts.detail}` : "";
  const content = (() => {
    if (opts.actionType === "SEND_EMAIL") {
      return opts.success
        ? `Email accepted by mail server (${actionLabel}).${suffix}`
        : `Email delivery failed (${actionLabel}).${suffix}`;
    }
    if (opts.actionType === "CREATE_MEETING_LINK") {
      return opts.success ? `Meeting link created (${actionLabel}).${suffix}` : `Meeting link failed (${actionLabel}).${suffix}`;
    }
    if (opts.actionType === "SEND_MEETING_INVITE") {
      return opts.success ? `Meeting invite sent (${actionLabel}).${suffix}` : `Meeting invite failed (${actionLabel}).${suffix}`;
    }
    if (opts.actionType === "CREATE_CONTACT") {
      return opts.success ? `Contact created (${actionLabel}).${suffix}` : `Contact creation failed (${actionLabel}).${suffix}`;
    }
    if (opts.actionType === "CREATE_SHOP") {
      return opts.success ? `Shop created (${actionLabel}).${suffix}` : `Shop creation failed (${actionLabel}).${suffix}`;
    }
    return opts.success ? `Action completed (${actionLabel}).${suffix}` : `Action failed (${actionLabel}).${suffix}`;
  })();

  try {
    const tenantId = Number((opts.action as any)?.tenant_id ?? (opts.action as any)?.tenantId ?? 0) || null;
    await db.insert(messages).values({
      tenantId,
      content,
      fromAgentId: null,
      toAgentId: null,
      type: "system",
      status: "sent",
      deliveredAt: new Date(),
      conversationId: opts.conversationId,
      metadata: {
        kind: "action_outcome",
        actionRequestId: Number(opts.action.id),
        actionType: opts.actionType,
        correlationId: opts.correlationId,
        success: opts.success,
      },
    });
  } catch (error: any) {
    const message = String(error?.message || error);
    console.warn(
      `[actions:worker] skipped action outcome message actionId=${Number(opts.action.id)} conversationId=${String(
        opts.conversationId,
      )} reason=${message}`,
    );
  }
}

async function dequeueNextQueuedAction(): Promise<ActionRequestRow | null> {
  // Atomic lease claim: QUEUED -> RUNNING, pick highest priority first, oldest first.
  const rows = await db.execute(sql`
    with next as (
      select id, coalesce(attempt_count, 0) + 1 as next_attempt
      from action_requests
      where status = 'QUEUED'
        and coalesce(lifecycle_state, 'QUEUED') = 'QUEUED'
        and (claimed_until is null or claimed_until < now())
        and (next_retry_at is null or next_retry_at <= now())
        and (
          (metadata->>'runAt') is null
          or (metadata->>'runAt')::timestamptz <= now()
        )
      order by priority desc, created_at asc
      limit 1
      for update skip locked
    )
    update action_requests ar
    set
      status = 'RUNNING',
      lifecycle_state = 'RUNNING',
      started_at = coalesce(ar.started_at, now()),
      updated_at = now(),
      attempt_count = next.next_attempt,
      claimed_until = now() + make_interval(secs => ${ACTION_CLAIM_TTL_SECONDS}),
      claimed_by = ${ACTIONS_RUNNER_ID},
      error_code = null,
      error_message = null
    from next
    where ar.id = next.id
    returning ar.*;
  `);

  const row = Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0];
  if (!row) return null;
  return row as ActionRequestRow;
}

async function finalize(opts: {
  action: ActionRequestRow;
  status: "DONE" | "FAILED";
  actionType?: string;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
  receipts?: ActionReceiptInput[];
  outcome?: ActionRunOutcome;
}) {
  const tenantId = Number((opts.action as any).tenant_id ?? opts.action.tenantId);
  const actionId = Number(opts.action.id);
  const correlationId = firstNonEmptyString((opts.action as any)?.correlation_id, (opts.action as any)?.correlationId);
  const mode = normalizeActionMode((opts.action as any).mode);
  const finishedAt = new Date();
  const inferredReceipts = inferReceiptsFromResult(opts.actionType || String((opts.action as any).action_type || ""), opts.result);
  const normalizedReceipts = (opts.receipts && opts.receipts.length ? opts.receipts : inferredReceipts).map((receipt) => ({
    id: randomUUID(),
    tenantId,
    actionRunId: actionId,
    receiptType: receipt.receiptType,
    entityType: receipt.entityType || null,
    entityIdsJson: uniqueEntityIds(receipt.entityIds),
    affectedRows: Number.isFinite(Number(receipt.affectedRows)) ? Math.trunc(Number(receipt.affectedRows)) : null,
    beforeHash: receipt.beforeHash || null,
    afterHash: receipt.afterHash || null,
    externalRef: receipt.externalRef || null,
      evidenceUrl: receipt.evidenceUrl || null,
      createdAt: finishedAt,
    }));

  const receiptSummary = normalizedReceipts.map((receipt) => ({
    id: receipt.id,
    receiptType: receipt.receiptType,
    entityType: receipt.entityType,
    entityIds: receipt.entityIdsJson,
    affectedRows: receipt.affectedRows,
    externalRef: receipt.externalRef,
    evidenceUrl: receipt.evidenceUrl,
    createdAt: receipt.createdAt,
  }));

  const computedOutcome: ActionRunOutcome =
    opts.outcome ||
    (opts.status === "FAILED"
      ? "FAILED"
      : mode === "SIMULATED"
        ? "NO_EFFECT"
        : normalizedReceipts.length > 0
          ? "SUCCESS"
          : "NO_EFFECT");

  const lifecycleState = opts.status === "DONE" ? "SUCCEEDED" : "FAILED";
  const evidenceRequired = Boolean((opts.action as any).evidence_required ?? (opts.action as any).evidenceRequired);
  const evidenceStatus = evidenceRequired ? (normalizedReceipts.length > 0 ? "SATISFIED" : "PENDING") : "NONE";
  const errorCode =
    opts.status === "FAILED"
      ? inferActionErrorCode({
          errorCode: (opts.error as any)?.code,
          message: (opts.error as any)?.message,
        })
      : null;
  const errorMessage = opts.status === "FAILED" ? firstNonEmptyString((opts.error as any)?.message) : null;
  const publicActionId = await ensureActionPublicId({
    tenantId,
    actionId,
    existingPublicActionId: (opts.action as any)?.public_action_id ?? (opts.action as any)?.publicActionId,
  });

  await db
    .update(actionRequests)
    .set({
      status: opts.status,
      lifecycleState: lifecycleState as any,
      outcome: computedOutcome,
      finishedAt,
      updatedAt: finishedAt,
      claimedUntil: null,
      claimedBy: null,
      nextRetryAt: null,
      evidenceStatus: evidenceStatus as any,
      errorCode,
      errorMessage,
    } as any)
    .where(sql`${actionRequests.id} = ${opts.action.id}`);

  await db.insert(actionResults).values({
    tenantId,
    actionRequestId: actionId,
    result: {
      ...(opts.result ?? {}),
      action_run_id: actionId,
      public_action_id: publicActionId,
      outcome: computedOutcome,
      receipt_count: receiptSummary.length,
      receipts: receiptSummary,
    },
    error: opts.error,
    createdAt: finishedAt,
  });

  if (normalizedReceipts.length > 0) {
    await db.insert(actionReceipts).values(normalizedReceipts as any);
  }

  await appendActionEvent({
    actionId,
    correlationId,
    eventType: lifecycleState,
    payload: {
      outcome: computedOutcome,
      publicActionId,
      receiptCount: normalizedReceipts.length,
      errorCode,
      errorMessage,
    },
  });
}

async function queueRecurringFollowup(opts: {
  action: ActionRequestRow;
  actionType: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  tenantId: number;
  plan: RecurringAutomationPlan | null;
}) {
  if (!opts.plan) return null;
  const nextRunIndex = opts.plan.runIndex + 1;
  if (nextRunIndex > opts.plan.maxRuns) return null;

  const now = new Date();
  const runAt = new Date(now.getTime() + opts.plan.intervalMinutes * 60_000);
  const nextMetadata = {
    ...opts.metadata,
    runAt: runAt.toISOString(),
    runReason: "recurring_automation",
    recurring: {
      ...safeObject((opts.metadata as any).recurring),
      enabled: true,
      intervalMinutes: opts.plan.intervalMinutes,
      maxRuns: opts.plan.maxRuns,
      runIndex: nextRunIndex,
      previousActionId: Number(opts.action.id),
      scheduledAt: now.toISOString(),
    },
  } as Record<string, unknown>;

  const [nextRow] = await db
    .insert(actionRequests)
    .values({
      tenantId: opts.tenantId,
      createdByUserId:
        parseOptionalNumber((opts.action as any).requested_by_user_id ?? (opts.action as any).requestedByUserId) ?? null,
      requestedByAgentKey: firstNonEmptyString((opts.action as any).requested_by_agent_key, (opts.action as any).requestedByAgentKey),
      requestedByUserId:
        parseOptionalNumber((opts.action as any).requested_by_user_id ?? (opts.action as any).requestedByUserId) ?? null,
      actionType: opts.actionType as any,
      payload: opts.payload,
      status: "QUEUED",
      lifecycleState: "QUEUED" as any,
      priority: parseOptionalNumber((opts.action as any).priority) ?? 0,
      idempotencyKey: null,
      relatedConversationId: firstNonEmptyString(
        (opts.action as any).related_conversation_id,
        (opts.action as any).relatedConversationId,
      ),
      relatedThreadId: parseOptionalNumber((opts.action as any).related_thread_id ?? (opts.action as any).relatedThreadId),
      metadata: nextMetadata,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: actionRequests.id });

  const nextActionId = Number(nextRow?.id || 0);
  if (!Number.isFinite(nextActionId) || nextActionId <= 0) return null;
  const publicActionId = await ensureActionPublicId({ tenantId: opts.tenantId, actionId: nextActionId });
  await appendActionEvent({
    actionId: nextActionId,
    correlationId: firstNonEmptyString((opts.action as any).correlation_id, (opts.action as any).correlationId),
    eventType: "CREATED",
    payload: { sourceActionId: Number((opts.action as any).id || 0), publicActionId, recurring: true },
  });
  await appendActionEvent({
    actionId: nextActionId,
    correlationId: firstNonEmptyString((opts.action as any).correlation_id, (opts.action as any).correlationId),
    eventType: "QUEUED",
    payload: { reason: "recurring_automation", publicActionId },
  });
  return nextActionId;
}

type RecurringMeetingPlan = {
  title: string;
  topic: string | null;
  intervalMinutes: number;
  recurrenceRule: string;
  byHour?: number;
  byMinute?: number;
};

function parseUtcClockFromText(text: string) {
  const amPmMatch = text.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\s*utc\b/i);
  if (amPmMatch) {
    const rawHour = Number(amPmMatch[1]);
    const rawMinute = amPmMatch[2] ? Number(amPmMatch[2]) : 0;
    if (rawHour >= 1 && rawHour <= 12 && rawMinute >= 0 && rawMinute <= 59) {
      const suffix = String(amPmMatch[3] || "").toLowerCase();
      const byHour = suffix === "pm" ? (rawHour % 12) + 12 : rawHour % 12;
      return { byHour, byMinute: rawMinute };
    }
  }

  const twentyFourHourMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*utc\b/i);
  if (twentyFourHourMatch) {
    return {
      byHour: Number(twentyFourHourMatch[1]),
      byMinute: Number(twentyFourHourMatch[2]),
    };
  }

  return null as { byHour: number; byMinute: number } | null;
}

function inferRecurringMeetingTitle(text: string, fallback: string, keywordRegex: RegExp) {
  const match = text.match(keywordRegex);
  if (!match?.[1]) return fallback;
  const raw = String(match[1] || "")
    .replace(/\b(schedule|set(?:\s+up)?|create|configure|meeting|meetings|sync|calendar)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return fallback;
  return raw
    .replace(/\b(today|tomorrow|utc|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function buildRecurringMeetingPlansFromTask(title: string, description: string) {
  const text = `${title}\n${description}`.trim();
  if (!text) return [] as RecurringMeetingPlan[];
  if (!/\b(meeting|meetings|agenda|calendar|sync|sprint|check[- ]?in)\b/i.test(text)) return [] as RecurringMeetingPlan[];
  if (!/\b(recurring|daily|weekly|bi[- ]?weekly|fortnightly|every day|every week|every 2 weeks?)\b/i.test(text)) {
    return [] as RecurringMeetingPlan[];
  }

  const clock = parseUtcClockFromText(text);
  const withClock = (freq: "DAILY" | "WEEKLY", interval: number) =>
    `${`FREQ=${freq}`};INTERVAL=${interval}${clock ? `;BYHOUR=${clock.byHour};BYMINUTE=${clock.byMinute}` : ""}`;

  const wantsDaily = /\b(daily|every day|daily sprint)\b/i.test(text);
  const wantsBiWeekly = /\b(bi[- ]?weekly|every 2 weeks?|fortnightly|bi[- ]?weekly strategic)\b/i.test(text);
  const wantsWeekly = /\b(weekly|every week|weekly supplier ops|supplier ops)\b/i.test(text);
  const wantsThreeRecurringMeetings =
    /\b(all three|three|3)\b/i.test(text) &&
    /\b(recurring)\b/i.test(text) &&
    /\b(meetings?)\b/i.test(text);
  const inferredDaily = wantsDaily || wantsThreeRecurringMeetings;
  const inferredWeekly = wantsWeekly || wantsThreeRecurringMeetings;
  const inferredBiWeekly = wantsBiWeekly || wantsThreeRecurringMeetings;

  const plans: RecurringMeetingPlan[] = [];
  if (inferredDaily) {
    plans.push({
      title: "Daily Sprint",
      topic: "daily sprint",
      intervalMinutes: 24 * 60,
      recurrenceRule: withClock("DAILY", 1),
      ...(clock ? { byHour: clock.byHour, byMinute: clock.byMinute } : {}),
    });
  }

  if (inferredBiWeekly) {
    plans.push({
      title: "Bi-weekly Strategic",
      topic: "bi-weekly strategic",
      intervalMinutes: 14 * 24 * 60,
      recurrenceRule: withClock("WEEKLY", 2),
      ...(clock ? { byHour: clock.byHour, byMinute: clock.byMinute } : {}),
    });
  }

  if (inferredWeekly) {
    plans.push({
      title: "Weekly Supplier Ops",
      topic: "weekly supplier ops",
      intervalMinutes: 7 * 24 * 60,
      recurrenceRule: withClock("WEEKLY", 1),
      ...(clock ? { byHour: clock.byHour, byMinute: clock.byMinute } : {}),
    });
  }

  if (!plans.length && /\b(recurring)\b/i.test(text) && /\b(meetings?)\b/i.test(text)) {
    plans.push(
      {
        title: "Daily Sprint",
        topic: "daily sprint",
        intervalMinutes: 24 * 60,
        recurrenceRule: withClock("DAILY", 1),
        ...(clock ? { byHour: clock.byHour, byMinute: clock.byMinute } : {}),
      },
      {
        title: "Weekly Supplier Ops",
        topic: "weekly supplier ops",
        intervalMinutes: 7 * 24 * 60,
        recurrenceRule: withClock("WEEKLY", 1),
        ...(clock ? { byHour: clock.byHour, byMinute: clock.byMinute } : {}),
      },
      {
        title: "Bi-weekly Strategic",
        topic: "bi-weekly strategic",
        intervalMinutes: 14 * 24 * 60,
        recurrenceRule: withClock("WEEKLY", 2),
        ...(clock ? { byHour: clock.byHour, byMinute: clock.byMinute } : {}),
      },
    );
  }

  const dedupe = new Map<string, RecurringMeetingPlan>();
  for (const plan of plans) {
    const key = `${plan.intervalMinutes}:${plan.title.toLowerCase()}:${plan.recurrenceRule}`;
    if (!dedupe.has(key)) dedupe.set(key, plan);
  }
  return Array.from(dedupe.values());
}

async function queueRecurringMeetingActionsFromTask(opts: {
  action: ActionRequestRow;
  tenantId: number;
  requestedByUserId: number | null;
  title: string;
  description: string;
  companyId: number | null;
}) {
  const recurringRunIndex = parseOptionalNumber((opts.action as any)?.metadata?.recurring?.runIndex);
  if (recurringRunIndex && recurringRunIndex > 1) return [] as number[];

  const plans = buildRecurringMeetingPlansFromTask(opts.title, opts.description);
  if (!plans.length) return [] as number[];

  let effectiveRequestedByUserId = opts.requestedByUserId;
  if (!effectiveRequestedByUserId) {
    effectiveRequestedByUserId = await findTenantFallbackUserId(opts.tenantId);
  }

  const relatedConversationId = firstNonEmptyString(
    (opts.action as any).related_conversation_id,
    (opts.action as any).relatedConversationId,
  );
  const relatedThreadId = parseOptionalNumber((opts.action as any).related_thread_id ?? (opts.action as any).relatedThreadId);
  const requestedByAgentKey = firstNonEmptyString(
    (opts.action as any).requested_by_agent_key,
    (opts.action as any).requestedByAgentKey,
  );
  const priority = parseOptionalNumber((opts.action as any).priority) ?? 0;
  const now = new Date();
  const queuedIds: number[] = [];

  for (const plan of plans) {
    const existing = getResultRows(
      await db.execute(sql`
        select id
        from meetings
        where tenant_id = ${opts.tenantId}
          and lower(title) = lower(${plan.title})
          and coalesce(metadata->>'createdVia', '') = 'actions.worker.recurring'
          and status in ('scheduled', 'in_progress')
        order by id desc
        limit 1
      `),
    )[0];
    if (existing?.id) continue;

    const actionPayload: Record<string, unknown> = {
      enabled: true,
      title: plan.title,
      topic: plan.topic,
      intervalMinutes: plan.intervalMinutes,
      recurrenceRule: plan.recurrenceRule,
      startAt: now.toISOString(),
      ...(plan.byHour !== undefined ? { byHour: plan.byHour } : {}),
      ...(plan.byMinute !== undefined ? { byMinute: plan.byMinute } : {}),
      ...(opts.companyId && opts.companyId > 0 ? { companyId: opts.companyId } : {}),
    };

    const [queued] = await db
      .insert(actionRequests)
      .values({
        tenantId: opts.tenantId,
        createdByUserId: effectiveRequestedByUserId ?? null,
        requestedByAgentKey: requestedByAgentKey || null,
        requestedByUserId: effectiveRequestedByUserId ?? null,
        actionType: "CONFIGURE_RECURRING_MEETING" as any,
        payload: actionPayload,
        status: effectiveRequestedByUserId ? "QUEUED" : "REQUIRES_APPROVAL",
        lifecycleState: (effectiveRequestedByUserId ? "QUEUED" : "CREATED") as any,
        priority,
        idempotencyKey: null,
        relatedConversationId: relatedConversationId || null,
        relatedThreadId: relatedThreadId ?? null,
        metadata: {
          runReason: "task_recurring_meeting_autowire",
          sourceTaskActionId: Number((opts.action as any).id || 0),
          sourceTaskTitle: opts.title,
          requestedByUserFallback: !opts.requestedByUserId && !!effectiveRequestedByUserId,
          fallbackRequestedByUserId: effectiveRequestedByUserId ?? null,
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: actionRequests.id });

    const actionId = Number(queued?.id || 0);
    if (actionId > 0) {
      queuedIds.push(actionId);
      const publicActionId = await ensureActionPublicId({ tenantId: opts.tenantId, actionId });
      await appendActionEvent({
        actionId,
        correlationId: firstNonEmptyString((opts.action as any).correlation_id, (opts.action as any).correlationId),
        eventType: "CREATED",
        payload: {
          publicActionId,
          actionType: "CONFIGURE_RECURRING_MEETING",
          sourceTaskActionId: Number((opts.action as any).id || 0),
        },
      });
      if (effectiveRequestedByUserId) {
        await appendActionEvent({
          actionId,
          correlationId: firstNonEmptyString((opts.action as any).correlation_id, (opts.action as any).correlationId),
          eventType: "QUEUED",
          payload: { reason: "task_recurring_meeting_autowire", publicActionId },
        });
      }
    }
  }

  return queuedIds;
}

export async function runActionWorkerOnce() {
  const next = await dequeueNextQueuedAction();
  if (!next) return { ok: true, processed: 0 } as const;

  const tenantId = Number((next as any).tenant_id ?? (next as any).tenantId);
  const actionId = Number((next as any).id || 0);
  const claimedCorrelationId = firstNonEmptyString(
    (next as any).correlation_id,
    (next as any).correlationId,
    safeObject((next as any).payload).correlationId,
  );
  const publicActionId = await ensureActionPublicId({
    tenantId,
    actionId,
    existingPublicActionId: (next as any).public_action_id ?? (next as any).publicActionId,
  });
  await appendActionEvent({
    actionId,
    correlationId: claimedCorrelationId,
    eventType: "RUNNING",
    payload: {
      publicActionId,
      claimedBy: ACTIONS_RUNNER_ID,
      claimTtlSeconds: ACTION_CLAIM_TTL_SECONDS,
    },
  });

  const requestedByUserId = (next as any).requested_by_user_id ?? (next as any).requestedByUserId ?? null;

  await logAudit({
    tenantId,
    userId: requestedByUserId ? Number(requestedByUserId) : null,
    action: "action_request.started",
    entityId: Number(next.id),
    metadata: { actionType: (next as any).action_type ?? (next as any).actionType, startedAt: nowIso() },
  });

  const actionType = String(((next as any).action_type ?? (next as any).actionType) ?? "").trim();
  const payload = safeObject((next as any).payload);
  const meta = safeObject((next as any).metadata);
  const mode = normalizeActionMode((next as any).mode ?? payload.mode ?? meta.mode);
  const recurringPlan = resolveRecurringAutomationPlan(payload, meta);
  const correlationId = firstNonEmptyString(
    (next as any).correlation_id,
    (next as any).correlationId,
    payload.correlationId,
    meta.correlationId,
    meta.traceId,
  );
  const conversationId = firstNonEmptyString(
    payload.conversationId,
    payload.relatedConversationId,
    (next as any).related_conversation_id,
    (next as any).relatedConversationId,
  );
  const modelUsed = firstNonEmptyString(
    (next as any).model_used,
    (next as any).modelUsed,
    payload.modelUsed,
    payload.model_used,
    payload.runtimeModel,
    payload.runtime_model,
    payload.model,
    meta.modelUsed,
    meta.runtimeModel,
    meta.runtime_model,
    meta.model,
  );
  try {
    await db
      .update(actionRequests)
      .set({
        modelUsed: modelUsed || null,
        correlationId: correlationId || null,
        updatedAt: new Date(),
      } as any)
      .where(eq(actionRequests.id, Number(next.id)));
  } catch {
    // non-fatal audit enrichment
  }
  const agentId = firstNonEmptyString(payload.agentId, meta.agentId, (next as any).requested_by_agent_key, (next as any).requestedByAgentKey);
  const actionLogPrefix = `[actions-worker] tenantId=${tenantId} actionId=${publicActionId || Number(next.id)} actionType=${actionType} mode=${mode} correlationId=${correlationId || "n/a"} conversationId=${conversationId || "n/a"} agent=${agentId || "n/a"}`;
  console.log(`${actionLogPrefix} status=RUNNING`);

  if (mode === "SIMULATED") {
    await finalize({
      action: next,
      status: "DONE",
      actionType,
      result: {
        actionType,
        simulated: true,
        reason: "SIMULATED mode requested; no side effects executed.",
      },
      outcome: "NO_EFFECT",
    });
    await logAudit({
      tenantId,
      userId: requestedByUserId ? Number(requestedByUserId) : null,
      action: "action_request.simulated",
      entityId: Number(next.id),
      metadata: { actionType, mode, correlationId, finishedAt: nowIso() },
    });
    console.log(`${actionLogPrefix} status=DONE outcome=NO_EFFECT simulated=true`);
    return { ok: true, processed: 1, id: Number(next.id), simulated: true } as const;
  }

  const actionActorId = parseOptionalNumber(payload.agentId ?? payload.agent_id ?? meta.agentId ?? meta.agent_id);
  await assertActionActorRunnable({
    actionId: Number(next.id),
    candidateAgentId: actionActorId,
    actionType,
  });

  const notificationIdRaw = payload.notificationId ?? payload.notification_id ?? null;
  const notificationId =
    typeof notificationIdRaw === "number" || typeof notificationIdRaw === "string" ? Number(notificationIdRaw) : null;

  const notificationDeliveryIdRaw = payload.notificationDeliveryId ?? payload.notification_delivery_id ?? null;
  const notificationDeliveryId =
    typeof notificationDeliveryIdRaw === "number" || typeof notificationDeliveryIdRaw === "string"
      ? Number(notificationDeliveryIdRaw)
      : null;

  const notificationChannelIndexRaw = payload.notificationChannelIndex ?? payload.notification_channel_index ?? 0;
  const notificationChannelIndex =
    typeof notificationChannelIndexRaw === "number" || typeof notificationChannelIndexRaw === "string"
      ? Number(notificationChannelIndexRaw)
      : 0;

  const notificationAttemptRaw = payload.notificationAttempt ?? payload.notification_attempt ?? 1;
  const notificationAttempt =
    typeof notificationAttemptRaw === "number" || typeof notificationAttemptRaw === "string" ? Number(notificationAttemptRaw) : 1;

  const notificationMaxAttemptsRaw = payload.notificationMaxAttempts ?? payload.notification_max_attempts ?? 3;
  const notificationMaxAttempts =
    typeof notificationMaxAttemptsRaw === "number" || typeof notificationMaxAttemptsRaw === "string"
      ? Number(notificationMaxAttemptsRaw)
      : 3;

  try {
    if (actionType === "SEND_EMAIL") {
      const agentKey = String(payload.agentKey ?? payload.agent ?? "").trim();
      const to = safeStringArray(payload.to);
      const subject = String(payload.subject ?? "").trim();
      const body = safeObject(payload.body);
      const textBody = typeof body.text === "string" ? body.text : typeof payload.text === "string" ? payload.text : null;
      const htmlBody = typeof body.html === "string" ? body.html : typeof payload.html === "string" ? payload.html : null;
      const actorAgentIdRaw = payload.agentId ?? payload.agent_id ?? null;
      const actorAgentId =
        typeof actorAgentIdRaw === "number" || typeof actorAgentIdRaw === "string" ? Number(actorAgentIdRaw) : null;
      const actorType = Number.isFinite(actorAgentId)
        ? "agent"
        : requestedByUserId
          ? "human"
          : "system";

      const sent = await sendEmailAsAgent({
        tenantId,
        agentKey,
        to,
        subject,
        textBody,
        htmlBody,
        actionRequestId: Number(next.id),
        requestedByUserId: requestedByUserId ? Number(requestedByUserId) : null,
        actorType,
        actorAgentId: Number.isFinite(actorAgentId) ? Number(actorAgentId) : null,
        correlationId: correlationId ?? null,
        bypassApproval: true,
      });

      if (notificationId && notificationDeliveryId) {
        await handleNotificationActionSuccess({
          tenantId,
          notificationId,
          deliveryId: notificationDeliveryId,
          status: "sent",
          providerMessageId: (sent as any)?.message?.messageId ? String((sent as any).message.messageId) : null,
        });
      }

      await finalize({
        action: next,
        status: "DONE",
        result: { actionType, sent },
      });

      const providerMessageId = firstNonEmptyString((sent as any)?.message?.messageId, (sent as any)?.messageId);
      const fromEmail = firstNonEmptyString((sent as any)?.message?.from, (sent as any)?.from);
      const queueId = firstNonEmptyString((sent as any)?.message?.queueId, (sent as any)?.queueId);
      const deliveryStatus = firstNonEmptyString((sent as any)?.message?.status, (sent as any)?.status);
      const detailParts = [`to ${to.join(", ") || "recipient"}`];
      if (fromEmail) detailParts.push(`from ${fromEmail}`);
      if (deliveryStatus) detailParts.push(`delivery ${deliveryStatus}`);
      if (queueId) detailParts.push(`queue ${queueId}`);
      if (providerMessageId) detailParts.push(`msgid ${providerMessageId}`);
      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: detailParts.join(" | "),
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE`);

      return { ok: true, processed: 1, id: Number(next.id) } as const;
    }

    if (actionType === "SEND_SMS" || actionType === "SEND_WHATSAPP") {
      const agentKey = String(payload.agentKey ?? payload.agent ?? "").trim();
      const toE164 = String(payload.toE164 ?? payload.to_e164 ?? payload.to ?? "").trim();
      const modeRaw = String(payload.mode ?? (payload.contentSid ? "template" : "text")).trim().toLowerCase();
      const mode = modeRaw === "template" ? "template" : "text";

      const body = typeof payload.body === "string" ? payload.body : typeof payload.message === "string" ? payload.message : "";
      const contentSid = typeof payload.contentSid === "string" ? payload.contentSid : typeof payload.content_sid === "string" ? payload.content_sid : null;
      const contentVariables =
        payload.contentVariables && typeof payload.contentVariables === "object" && !Array.isArray(payload.contentVariables)
          ? (payload.contentVariables as Record<string, string>)
          : null;
      const clientMessageId = typeof payload.clientMessageId === "string" ? payload.clientMessageId : null;
      const mediaUrls = Array.isArray(payload.mediaUrls) ? payload.mediaUrls.map((v) => String(v || "").trim()).filter(Boolean) : null;
      const adminOverride = Boolean(payload.adminOverride || payload.admin_override || meta.adminOverride);

      const out = await sendCommunicationAsStaff({
        tenantId,
        agentKey,
        channel: actionType === "SEND_SMS" ? "sms" : "whatsapp",
        toE164,
        mode,
        body,
        ...(mode === "template" ? { contentSid, contentVariables } : {}),
        clientMessageId,
        mediaUrls,
        requestedByUserId: requestedByUserId ? Number(requestedByUserId) : null,
        admin: adminOverride,
        source: "actions.worker",
        ackOnly: false,
      });

      if (!out.ok) {
        const error = new Error(out.errorMessage || "Send failed");
        (error as any).code = String((out as any).errorCode || "");
        throw error;
      }

      if (notificationId && notificationDeliveryId && Number.isFinite(notificationDeliveryId)) {
        await handleNotificationActionSuccess({
          tenantId,
          notificationId,
          deliveryId: notificationDeliveryId,
          status: String(out.status || "sent"),
          providerMessageId: out.providerMessageId || null,
        });
      }

      await finalize({
        action: next,
        status: "DONE",
        result: { actionType, out },
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `to ${String(payload.toE164 ?? payload.to ?? "recipient")} status=${String(out.status || "sent")}`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE`);

      return { ok: true, processed: 1, id: Number(next.id) } as const;
    }

    if (actionType === "CREATE_MEETING_LINK") {
      const title = String(payload.title ?? payload.meetingTitle ?? "").trim() || "Meeting";
      const startsAtRaw = firstNonEmptyString(payload.startsAt, payload.startAt);
      const endsAtRaw = firstNonEmptyString(payload.endsAt, payload.endAt);
      const recordingEnabled = Boolean(payload.recordingEnabled ?? payload.recording_enabled);

      const meeting = await createMeetSession({
        tenantId,
        title,
        createdByUserId: requestedByUserId ? Number(requestedByUserId) : null,
        createdByAgentId: Number.isFinite(Number(payload.createdByAgentId ?? 0)) ? Number(payload.createdByAgentId) : null,
        startsAt: startsAtRaw ? new Date(startsAtRaw) : null,
        endsAt: endsAtRaw ? new Date(endsAtRaw) : null,
        recordingEnabled,
        metadata: {
          source: "actions.worker",
          correlationId: correlationId ?? null,
        },
      });

      const hostUserId = requestedByUserId ? Number(requestedByUserId) : null;
      const hostSub = hostUserId ? `user:${hostUserId}` : `guest:host`;
      const hostDisplayName = hostUserId ? await getUserDisplayName(hostUserId) : "Host";
      if (hostUserId) {
        await upsertParticipantJoin({
          tenantId,
          meetingId: meeting.id,
          role: "host",
          userId: hostUserId,
          displayName: hostDisplayName,
        });
      }

      const hostInvite = await issueMeetInvite({
        meetingId: meeting.id,
        tenantId,
        role: "host",
        issuedTo: hostUserId ? String(payload.hostEmail ?? "") || null : null,
        sub: hostSub,
        expiresAt: new Date(Date.now() + Number(process.env.MEET_INVITE_TTL_MS || 2 * 60 * 60 * 1000)),
        createdByUserId: hostUserId,
        metadata: {
          source: "actions.worker",
          actionRequestId: Number(next.id),
        },
      });

      await finalize({
        action: next,
        status: "DONE",
        result: {
          actionType,
          meetingId: meeting.id,
          link: hostInvite.link,
          token: hostInvite.token,
          expiresAt: hostInvite.expiresAt,
        },
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `meetingId=${meeting.id} link=${hostInvite.link}`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, meetingId: meeting.id, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE`);
      return { ok: true, processed: 1, id: Number(next.id) } as const;
    }

    if (actionType === "SEND_MEETING_INVITE") {
      const meetingId = String(payload.meetingId ?? "").trim();
      if (!meetingId) throw new Error("meetingId is required");
      const meeting = await getMeetSession({ tenantId, meetingId });
      if (!meeting) throw new Error("Meeting not found");

      const recipients = safeStringArray(payload.recipients);
      if (!recipients.length) throw new Error("recipients[] is required");
      const role = String(payload.role ?? "attendee").trim().toLowerCase();
      const expiresAt = new Date(Date.now() + Number(process.env.MEET_INVITE_TTL_MS || 2 * 60 * 60 * 1000));

      const invites = [];
      for (const recipient of recipients) {
        const normalized = recipient.toLowerCase();
        const isUserRef = /^user:\d+$/i.test(normalized);
        const sub = isUserRef ? normalized : `guest:${normalized}`;
        const invite = await issueMeetInvite({
          meetingId,
          tenantId,
          role: role === "host" || role === "cohost" || role === "observer" ? (role as any) : "attendee",
          issuedTo: isUserRef ? null : normalized,
          sub,
          expiresAt,
          createdByUserId: requestedByUserId ? Number(requestedByUserId) : null,
          metadata: {
            source: "actions.worker",
            actionRequestId: Number(next.id),
          },
        });
        invites.push({ recipient: normalized, ...invite });
      }

      const sendNow = Boolean(payload.sendNow ?? payload.send_now);
      let sendResult: Record<string, unknown> | null = null;
      if (sendNow) {
        const channel = String(payload.channel ?? "email").trim().toLowerCase();
        if (channel === "email") {
          const to = invites.map((i: any) => String(i.recipient || "")).filter((value) => value.includes("@"));
          if (to.length) {
            const subject = String(payload.subject || `Meeting invite: ${meeting.title}`).trim();
            const bodyText =
              String(payload.body || "").trim() ||
              `You are invited to "${meeting.title}". Join link: ${String(invites[0]?.link || "")}`;
            const sent = await sendEmailAsAgent({
              tenantId,
              agentKey: String(payload.agentKey ?? payload.agent ?? "").trim(),
              to,
              subject,
              textBody: bodyText,
              htmlBody: null,
              actionRequestId: Number(next.id),
              requestedByUserId: requestedByUserId ? Number(requestedByUserId) : null,
              actorType: "agent",
              actorAgentId: Number.isFinite(Number(payload.agentId ?? 0)) ? Number(payload.agentId) : null,
              correlationId: correlationId ?? null,
              bypassApproval: true,
            });
            sendResult = { channel: "email", sent };
          }
        }
      }

      await finalize({
        action: next,
        status: "DONE",
        result: {
          actionType,
          meetingId,
          invites,
          sendResult,
        },
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `meetingId=${meetingId} invites=${invites.length}`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, meetingId, inviteCount: invites.length, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE`);
      return { ok: true, processed: 1, id: Number(next.id) } as const;
    }

    if (actionType === "REQUEST_MEETING_SUMMARY") {
      const meetingId = String(payload.meetingId ?? "").trim();
      if (!meetingId) throw new Error("meetingId is required");
      const summary = await generateMeetingSummary({
        tenantId,
        meetingId,
        requestedByUserId: requestedByUserId ? Number(requestedByUserId) : null,
        trigger: "action_request",
      });

      await finalize({
        action: next,
        status: "DONE",
        result: {
          actionType,
          meetingId,
          summary,
        },
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `meetingId=${meetingId} summary generated`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, meetingId, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE`);
      return { ok: true, processed: 1, id: Number(next.id) } as const;
    }

    if (actionType === "START_BACKGROUND_SESSION") {
      const rawDurationMinutes = parseOptionalNumber(payload.durationMinutes ?? payload.duration_minutes) ?? 10;
      const durationMinutes = Math.min(24 * 60, Math.max(1, rawDurationMinutes));
      const durationMs = durationMinutes * 60 * 1000;
      const visibilityRaw = String(payload.visibility ?? "admin").trim().toLowerCase();
      const visibility = visibilityRaw === "public" || visibilityRaw === "internal" ? visibilityRaw : "admin";

      // Allow explicit action-driven runtime for a bounded window.
      enableAiBackgroundRuntime(durationMs + 30_000);
      startBackgroundConversationEngine({ durationMs });
      startOpsCommsAutopilot({ durationMs });

      await finalize({
        action: next,
        status: "DONE",
        result: {
          actionType,
          started: true,
          durationMinutes,
          visibility,
        },
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `duration=${durationMinutes}m visibility=${visibility}`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, durationMinutes, visibility, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE`);
      return { ok: true, processed: 1, id: Number(next.id) } as const;
    }

    if (actionType === "CONFIGURE_RECURRING_MEETING") {
      const enabled = parseOptionalBoolean(payload.enabled) ?? true;
      const rawInterval = parseOptionalNumber(payload.intervalMinutes ?? payload.interval_minutes) ?? 30;
      const intervalMinutes = Math.min(31 * 24 * 60, Math.max(1, rawInterval));
      const topic = typeof payload.topic === "string" && payload.topic.trim() ? payload.topic.trim() : null;
      const companyId = parseOptionalNumber(payload.companyId ?? payload.company_id);
      const scope = `tenant:${tenantId}:ops.background`;
      let recurringAgendaEventId: number | null = null;

      // Bourse de l'Or directive: no silent/agent-driven recurring meeting creation.
      // Allow only when explicitly initiated by an admin user (user session), otherwise block.
      const tenantKeyRow = getResultRows(
        await db.execute(sql`select key from tenants where id = ${tenantId} limit 1`),
      )[0];
      const tenantKey = String((tenantKeyRow as any)?.key ?? "").trim().toLowerCase();
      if (tenantKey === "bdo") {
        if (!requestedByUserId) {
          await finalize({
            action: next,
            status: "FAILED",
            error: {
              code: "PROCESS_BLOCKED",
              message: "Recurring meetings require an explicit admin-initiated request for this tenant.",
            },
            result: { actionType, enabled, intervalMinutes, topic, companyId },
          });

          await postActionOutcomeMessage({
            action: next,
            actionType,
            correlationId,
            conversationId,
            success: false,
            detail: "PROCESS_BLOCKED admin_required tenant=bdo",
          });

          console.warn(`${actionLogPrefix} status=FAILED process_blocked recurring_meeting_admin_required tenant=bdo`);
          return { ok: false, processed: 1, id: Number(next.id), error: "PROCESS_BLOCKED" } as const;
        }

        const requester = await db.query.eceUsers.findFirst({
          where: eq(eceUsers.id, Number(requestedByUserId)),
          columns: { id: true, roles: true, permissions: true, currentMode: true },
        });

        if (!isTenantAdminUser(requester)) {
          await finalize({
            action: next,
            status: "FAILED",
            error: {
              code: "PROCESS_BLOCKED",
              message: "Recurring meetings require admin privileges for this tenant.",
            },
            result: { actionType, enabled, intervalMinutes, topic, companyId, requestedByUserId: Number(requestedByUserId) },
          });

          await postActionOutcomeMessage({
            action: next,
            actionType,
            correlationId,
            conversationId,
            success: false,
            detail: "PROCESS_BLOCKED admin_required tenant=bdo",
          });

          console.warn(
            `${actionLogPrefix} status=FAILED process_blocked recurring_meeting_admin_required tenant=bdo userId=${Number(
              requestedByUserId,
            )}`,
          );
          return { ok: false, processed: 1, id: Number(next.id), error: "PROCESS_BLOCKED" } as const;
        }
      }

      if (enabled) {
        const meetingTitle =
          firstNonEmptyString(payload.title, payload.meetingTitle, payload.meeting_title, topic) || "Recurring sync";
        const startAtRaw = firstNonEmptyString(payload.startAt, payload.start_at, payload.startsAt);
        const parsedStartAt = startAtRaw ? new Date(startAtRaw) : new Date();
        const startAt =
          Number.isFinite(parsedStartAt.getTime())
            ? parsedStartAt
            : new Date();

        const byHour = parseOptionalNumber(payload.byHour ?? payload.by_hour);
        const byMinute = parseOptionalNumber(payload.byMinute ?? payload.by_minute);
        if (byHour !== null && byHour >= 0 && byHour <= 23) startAt.setUTCHours(byHour);
        if (byMinute !== null && byMinute >= 0 && byMinute <= 59) startAt.setUTCMinutes(byMinute);
        startAt.setUTCSeconds(0, 0);

        const durationMinutes = Math.min(
          480,
          Math.max(
            5,
            parseOptionalNumber(payload.durationMinutes ?? payload.duration_minutes ?? payload.duration) ?? 30,
          ),
        );
        const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

        const recurrenceRuleInput = firstNonEmptyString(payload.recurrenceRule, payload.recurrence_rule);
        const dailyInterval =
          intervalMinutes >= 24 * 60 ? Math.max(1, Math.floor(intervalMinutes / (24 * 60))) : 1;
        const recurrenceRule =
          recurrenceRuleInput ||
          `FREQ=DAILY;INTERVAL=${dailyInterval};BYHOUR=${startAt.getUTCHours()};BYMINUTE=${startAt.getUTCMinutes()}`;

        const existingRow = getResultRows(
          await db.execute(sql`
            select id
            from meetings
            where tenant_id = ${tenantId}
              and lower(title) = lower(${meetingTitle})
              and coalesce(metadata->>'createdVia', '') = 'actions.worker.recurring'
              and status in ('scheduled', 'in_progress')
            order by id desc
            limit 1
          `),
        )[0];

        const existingMeetingId = Number(existingRow?.id || 0);
        const metadata = {
          createdVia: "actions.worker.recurring",
          recurrenceRule,
          intervalMinutes,
          topic,
          actionRequestId: Number(next.id),
          updatedAt: nowIso(),
        };

        let meetingConversationId: string | null = null;

        if (Number.isFinite(existingMeetingId) && existingMeetingId > 0) {
          const updated = await db
            .update(meetings)
            .set({
              companyId: companyId && companyId > 0 ? companyId : null,
              title: meetingTitle,
              description: topic ? `Recurring meeting: ${topic}` : "Recurring meeting",
              meetingType: "general",
              type: "scheduled",
              startTime: startAt,
              endTime: endAt,
              duration: durationMinutes,
              status: "scheduled",
              metadata,
              updatedAt: new Date(),
            } as any)
            .where(sql`${meetings.id} = ${existingMeetingId}`)
            .returning();
          recurringAgendaEventId = Number((updated[0] as any)?.id || existingMeetingId);
          meetingConversationId = String((updated[0] as any)?.conversationId || "") || null;
        } else {
          const inserted = await db
            .insert(meetings)
            .values({
              tenantId,
              companyId: companyId && companyId > 0 ? companyId : null,
              title: meetingTitle,
              description: topic ? `Recurring meeting: ${topic}` : "Recurring meeting",
              roomId: null,
              meetingType: "general",
              type: "scheduled",
              startTime: startAt,
              endTime: endAt,
              duration: durationMinutes,
              actualStartAt: null,
              actualEndAt: null,
              organizerId: null,
              status: "scheduled",
              conversationId: `meeting:${tenantId}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`,
              metadata,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any)
            .returning();
          recurringAgendaEventId = Number((inserted[0] as any)?.id || 0) || null;
          meetingConversationId = String((inserted[0] as any)?.conversationId || "") || null;
        }

        // Ensure a meeting chat room exists so the agenda can open it directly.
        if (recurringAgendaEventId && meetingConversationId) {
          const existingRoom = await db.query.chatRooms.findFirst({
            where: eq(chatRooms.conversationId, meetingConversationId),
            columns: { id: true },
          });

          let roomId: number | null = existingRoom?.id ? Number(existingRoom.id) : null;
          if (!roomId) {
            const createdRoom = await db
              .insert(chatRooms)
              .values({
                name: meetingTitle,
                type: "meeting",
                description: topic ? `Recurring meeting: ${topic}` : "Recurring meeting",
                moderatorId: null,
                conversationId: meetingConversationId,
                metadata: {
                  meetingId: recurringAgendaEventId,
                  tenantId,
                  companyId: companyId && companyId > 0 ? companyId : null,
                  meetingType: "general",
                  createdVia: "actions.worker.recurring",
                },
                createdAt: new Date(),
                updatedAt: new Date(),
              } as any)
              .returning();
            roomId = Number((createdRoom[0] as any)?.id || 0) || null;
          }

          // Best-effort: auto-attach a small set of active company agents to the room (so it isn't "empty").
          if (roomId && companyId && companyId > 0) {
            const candidateAgents = await db.query.agents.findMany({
              where: sql`${agents.companyId} = ${Number(companyId)} and ${agents.status} = 'active' and ${agents.isVisible} = true and ${agents.isTest} = false`,
              columns: { id: true },
              limit: 12,
            });
            const agentIds = candidateAgents
              .map((row: any) => Number(row.id))
              .filter((id: number) => Number.isFinite(id) && id > 0);
            if (agentIds.length) {
              const existingMemberships = await db.query.roomMemberships.findMany({
                where: eq(roomMemberships.roomId, roomId),
                columns: { agentId: true },
              });
              const existingAgentIds = new Set(
                existingMemberships.map((row: any) => Number(row.agentId)).filter((value: number) => value > 0),
              );
              const missing = agentIds.filter((id) => !existingAgentIds.has(id));
              if (missing.length) {
                await db.insert(roomMemberships).values(
                  missing.map((agentId) => ({
                    roomId,
                    agentId,
                    joinedAt: new Date(),
                    role: "member",
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  })) as any,
                );
              }
            }
          }
        }
      }

      const settingValue = {
        enabled,
        intervalMinutes,
        topic,
        companyId,
        agendaEventId: recurringAgendaEventId,
        updatedAt: nowIso(),
        actionRequestId: Number(next.id),
      };

      await setSetting(scope, "recurring_meeting", settingValue, `action:${Number(next.id)}`);

      await finalize({
        action: next,
        status: "DONE",
        result: {
          actionType,
          recurringMeeting: settingValue,
          agendaEventId: recurringAgendaEventId,
        },
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `${enabled ? "enabled" : "disabled"} every ${intervalMinutes}m${topic ? ` topic=${topic}` : ""}${recurringAgendaEventId ? ` agendaEventId=${recurringAgendaEventId}` : ""}`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, recurringMeeting: settingValue, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE`);
      return { ok: true, processed: 1, id: Number(next.id) } as const;
    }

    if (actionType === "TRANSCRIBE_VOICE_NOTE") {
      const messageId = parseOptionalNumber(payload.messageId ?? payload.message_id);
      if (!messageId) throw new Error("messageId is required");

      const existingRow = await db.query.messages.findFirst({
        where: sql`${messages.id} = ${messageId}`,
        columns: {
          id: true,
          conversationId: true,
          metadata: true,
        },
      });

      if (!existingRow) {
        await finalize({
          action: next,
          status: "FAILED",
          error: { message: "Message not found" },
          result: { actionType, messageId },
        });
        console.error(`${actionLogPrefix} status=FAILED voice_note_missing messageId=${messageId}`);
        return { ok: false, processed: 1, id: Number(next.id), error: "Message not found" } as const;
      }

      const existingMetadata = safeObject((existingRow as any).metadata);
      const existingVoiceNote = safeObject((existingMetadata as any).voiceNote);
      const existingStatus = firstNonEmptyString(existingVoiceNote.transcriptionStatus);
      const existingText = firstNonEmptyString(existingVoiceNote.transcriptionText);

      if (existingStatus && existingStatus.toLowerCase() === "done" && existingText) {
        await finalize({
          action: next,
          status: "DONE",
          result: { actionType, messageId, alreadyDone: true },
        });
        console.log(`${actionLogPrefix} status=DONE alreadyDone messageId=${messageId}`);
        return { ok: true, processed: 1, id: Number(next.id), messageId } as const;
      }

      if (!isVoiceTranscriptionConfigured()) {
        const failedMeta = {
          ...existingMetadata,
          voiceNote: {
            ...existingVoiceNote,
            transcriptionStatus: "failed",
            transcriptionError: "Transcription not configured (set WHISPER_SERVICE_URL; OpenAI only if OPENAI_TRANSCRIPTION_ENABLED=true).",
          },
        };
        await db.update(messages).set({ metadata: failedMeta }).where(sql`${messages.id} = ${messageId}`);

        await finalize({
          action: next,
          status: "FAILED",
          error: { message: "Transcription not configured (set WHISPER_SERVICE_URL; OpenAI only if OPENAI_TRANSCRIPTION_ENABLED=true)." },
          result: { actionType, messageId },
        });

        console.error(`${actionLogPrefix} status=FAILED transcription_not_configured messageId=${messageId}`);
        return { ok: false, processed: 1, id: Number(next.id), messageId, error: "Transcription not configured" } as const;
      }

      const storagePath = firstNonEmptyString(payload.storagePath, payload.storage_path, existingVoiceNote.storagePath);
      const storageUrl = firstNonEmptyString(payload.storageUrl, payload.storage_url, existingVoiceNote.storageUrl);
      const audioUrl = firstNonEmptyString(payload.audioUrl, payload.audio_url, existingVoiceNote.audioUrl);
      const resolvedPath = await resolveReadableAssetPath([storagePath, storageUrl, audioUrl]);
      let absPath = resolvedPath.path;
      let downloadedTempPath: string | null = null;
      let remoteResolution: { path: string | null; triedUrls: string[]; errors: string[] } | null = null;

      if (!absPath) {
        remoteResolution = await downloadRemoteAssetToTemp([audioUrl, storageUrl]);
        absPath = remoteResolution.path;
        downloadedTempPath = remoteResolution.path;
      }

      if (!absPath) {
        const remoteErrors = remoteResolution?.errors || [];
        const failedMeta = {
          ...existingMetadata,
          voiceNote: {
            ...existingVoiceNote,
            transcriptionStatus: "failed",
            transcriptionError: remoteErrors.length
              ? `Audio asset not reachable (${remoteErrors[0]})`
              : "Audio asset not found in storage.",
          },
        };
        await db.update(messages).set({ metadata: failedMeta }).where(sql`${messages.id} = ${messageId}`);

        await finalize({
          action: next,
          status: "FAILED",
          error: { message: "Audio asset not found in storage." },
          result: {
            actionType,
            messageId,
            storagePath,
            storageUrl,
            audioUrl,
            checkedPaths: resolvedPath.checkedPaths,
            remoteCheckedUrls: remoteResolution?.triedUrls || [],
            remoteErrors,
          },
        });

        console.error(
          `${actionLogPrefix} status=FAILED audio_missing messageId=${messageId} checkedPaths=${JSON.stringify(
            resolvedPath.checkedPaths,
          )} remoteUrls=${JSON.stringify(remoteResolution?.triedUrls || [])}`,
        );
        return {
          ok: false,
          processed: 1,
          id: Number(next.id),
          messageId,
          error: "Audio asset not found in storage.",
        } as const;
      }

      const processingMeta = {
        ...existingMetadata,
        voiceNote: {
          ...existingVoiceNote,
          transcriptionStatus: "processing",
          transcriptionError: null,
        },
      };

      await db.update(messages).set({ metadata: processingMeta }).where(sql`${messages.id} = ${messageId}`);

      try {
        const transcription = await transcribeAudioFile({
          filePath: absPath,
          fileName:
            firstNonEmptyString(existingVoiceNote.fileName, existingVoiceNote.name) ||
            path.basename(absPath),
          mimeType: firstNonEmptyString(existingVoiceNote.mime, (payload as any).mimeType) || "audio/webm",
        });
        const text = String(transcription.text || "").trim();

        const doneMeta = {
          ...processingMeta,
          voiceNote: {
            ...existingVoiceNote,
            transcriptionStatus: "done",
            transcriptionText: text || null,
            transcriptionError: null,
          },
        };

        await db.update(messages).set({ metadata: doneMeta }).where(sql`${messages.id} = ${messageId}`);

        let transcriptMessageId: number | null = null;
        const conversationIdForTranscript =
          firstNonEmptyString((existingRow as any)?.conversationId, payload.conversationId, payload.relatedConversationId) || null;
        if (conversationIdForTranscript && text) {
          const existingTranscript = getResultRows(
            await db.execute(sql`
              select id
              from messages
              where conversation_id = ${conversationIdForTranscript}
                and coalesce(metadata->>'voiceTranscriptSourceMessageId', '') = ${String(messageId)}
              order by id desc
              limit 1
            `),
          )[0];

          if (existingTranscript?.id) {
            transcriptMessageId = Number(existingTranscript.id);
          } else {
            const insertedTranscript = await db
              .insert(messages)
              .values({
                content: text,
                fromAgentId: null,
                toAgentId: null,
                type: "chat",
                status: "sent",
                deliveredAt: new Date(),
                conversationId: conversationIdForTranscript,
                metadata: {
                  channelId: (existingMetadata as any)?.channelId ?? null,
                  companyId: (existingMetadata as any)?.companyId ?? null,
                  contextTags: ["user-message", "voice-transcription"],
                  source: "voice_transcription",
                  voiceTranscriptSourceMessageId: messageId,
                },
                createdAt: new Date(),
              } as any)
              .returning();
            transcriptMessageId = Number((insertedTranscript[0] as any)?.id || 0) || null;
          }
        }

        await finalize({
          action: next,
          status: "DONE",
          result: {
            actionType,
            messageId,
            model: transcription.model,
            provider: transcription.provider,
            chars: text.length,
            transcriptMessageId,
          },
        });

        await logAudit({
          tenantId,
          userId: requestedByUserId ? Number(requestedByUserId) : null,
          action: "action_request.done",
          entityId: Number(next.id),
          metadata: { actionType, messageId, finishedAt: nowIso() },
        });

        console.log(
          `${actionLogPrefix} status=DONE messageId=${messageId} chars=${text.length} provider=${transcription.provider}`,
        );
        return { ok: true, processed: 1, id: Number(next.id), messageId } as const;
      } catch (error: any) {
        const message = String(error?.message || error || "transcription_failed");
        const attemptRaw = parseOptionalNumber(meta.attempt ?? (payload as any).attempt) ?? 0;
        const nextAttempt = attemptRaw + 1;
        const maxAttempts =
          Math.max(1, parseOptionalNumber(meta.maxAttempts ?? (payload as any).maxAttempts ?? TRANSCRIBE_MAX_ATTEMPTS) ?? TRANSCRIBE_MAX_ATTEMPTS) ||
          TRANSCRIBE_MAX_ATTEMPTS;

        if (nextAttempt < maxAttempts) {
          const delayMs = computeTranscribeBackoffMs(nextAttempt);
          const runAt = new Date(Date.now() + delayMs).toISOString();
          const queuedMeta = {
            ...meta,
            attempt: nextAttempt,
            maxAttempts,
            runAt,
            lastError: message,
          };

          await db
            .update(actionRequests)
            .set({
              status: "QUEUED",
              lifecycleState: "QUEUED" as any,
              startedAt: null,
              nextRetryAt: new Date(runAt),
              claimedUntil: null,
              claimedBy: null,
              errorCode: "RETRY_SCHEDULED",
              errorMessage: message,
              updatedAt: new Date(),
              metadata: queuedMeta,
            })
            .where(sql`${actionRequests.id} = ${next.id}`);

          await appendActionEvent({
            actionId: Number(next.id),
            correlationId,
            eventType: "RETRY_SCHEDULED",
            payload: {
              attempt: nextAttempt,
              maxAttempts,
              runAt,
              errorMessage: message,
            },
          });

          const pendingMeta = {
            ...processingMeta,
            voiceNote: {
              ...existingVoiceNote,
              transcriptionStatus: "pending",
              transcriptionError: message,
            },
          };

          await db.update(messages).set({ metadata: pendingMeta }).where(sql`${messages.id} = ${messageId}`);

          console.warn(
            `${actionLogPrefix} status=RETRY attempt=${nextAttempt}/${maxAttempts} runAt=${runAt} messageId=${messageId} error=${message}`,
          );
          return { ok: true, processed: 1, id: Number(next.id), messageId, retry: true } as const;
        }

        const failedMeta = {
          ...processingMeta,
          voiceNote: {
            ...existingVoiceNote,
            transcriptionStatus: "failed",
            transcriptionError: message,
          },
        };
        await db.update(messages).set({ metadata: failedMeta }).where(sql`${messages.id} = ${messageId}`);

        await finalize({
          action: next,
          status: "FAILED",
          error: { message },
          result: { actionType, messageId },
        });

        await logAudit({
          tenantId,
          userId: requestedByUserId ? Number(requestedByUserId) : null,
          action: "action_request.failed",
          entityId: Number(next.id),
          metadata: { actionType, messageId, error: { message }, finishedAt: nowIso() },
        });

        console.error(`${actionLogPrefix} status=FAILED messageId=${messageId} error=${message}`);
        return { ok: false, processed: 1, id: Number(next.id), messageId, error: message } as const;
      } finally {
        if (downloadedTempPath) {
          try {
            await fs.unlink(downloadedTempPath);
          } catch {
            // ignore
          }
          try {
            await fs.rm(path.dirname(downloadedTempPath), { recursive: true, force: true });
          } catch {
            // ignore
          }
        }
      }
    }

    if (actionType === "CREATE_CONTACT") {
      const displayName = firstNonEmptyString(payload.displayName, payload.name, payload.fullName, payload.contactName);
      const company = firstNonEmptyString(payload.company, payload.companyName);
      const jobTitle = firstNonEmptyString(payload.jobTitle, payload.role, payload.title);
      const notes = firstNonEmptyString(payload.notes, payload.note);
      const emailCandidates = safeStringArray(payload.emails);
      const phoneCandidates = safeStringArray(payload.phones);

      const emailSingles = [
        firstNonEmptyString(payload.email, payload.primaryEmail),
      ].filter((value): value is string => Boolean(value));
      const phoneSingles = [
        firstNonEmptyString(payload.phone, payload.phoneNumber, payload.whatsapp),
      ].filter((value): value is string => Boolean(value));

      const emails = Array.from(new Set([...emailCandidates, ...emailSingles].map((value) => String(value || "").trim()).filter(Boolean)));
      const phones = Array.from(new Set([...phoneCandidates, ...phoneSingles].map((value) => String(value || "").trim()).filter(Boolean)));

      if (!displayName && emails.length === 0 && phones.length === 0) {
        throw new Error("CREATE_CONTACT requires at least a name, email, or phone.");
      }

      const contactResult = await db.transaction(async (tx) => {
        const contact = await upsertCanonicalContact(tx, {
          displayName: displayName || null,
          company: company || null,
          jobTitle: jobTitle || null,
          emails,
          phones,
          source: "agent_action",
          sourceSystem: "agent_action",
          createdByUserId: requestedByUserId ? Number(requestedByUserId) : null,
        });

        await ensureTenantContactLink(tx, {
          tenantId,
          contactId: contact.contactId,
          createdByUserId: requestedByUserId ? Number(requestedByUserId) : null,
        });

        if (notes) {
          await tx.execute(sql`
            update tenant_contacts
            set notes = ${notes}, updated_at = now()
            where tenant_id = ${tenantId} and contact_id = ${contact.contactId}
          `);
        }

        return contact;
      });

      const recurringPayload: Record<string, unknown> = {
        ...payload,
      };
      recurringPayload.contactId = contactResult.contactId;
      recurringPayload.contact_id = contactResult.contactId;

      const recurringNextActionId = await queueRecurringFollowup({
        action: next,
        actionType,
        payload: recurringPayload,
        metadata: meta,
        tenantId,
        plan: recurringPlan,
      });

      await finalize({
        action: next,
        status: "DONE",
        result: {
          actionType,
          contactId: contactResult.contactId,
          created: contactResult.created,
          updated: contactResult.updated,
          dedupeKey: contactResult.dedupeKey,
          recurringNextActionId,
        },
      });

      const detailParts = [`contactId=${contactResult.contactId}`];
      if (displayName) detailParts.push(`name=${displayName}`);
      if (emails.length) detailParts.push(`email=${emails[0]}`);
      if (phones.length) detailParts.push(`phone=${phones[0]}`);
      if (recurringNextActionId) detailParts.push(`nextActionId=${recurringNextActionId}`);

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: detailParts.join(" | "),
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, contactId: contactResult.contactId, recurringNextActionId, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE contactId=${contactResult.contactId}`);
      return { ok: true, processed: 1, id: Number(next.id), contactId: contactResult.contactId } as const;
    }

    if (actionType === "CREATE_AGENT") {
      const name = firstNonEmptyString(payload.name, payload.displayName, payload.agentName);
      if (!name) throw new Error("CREATE_AGENT requires name.");

      const role = firstNonEmptyString(payload.role, payload.title, payload.jobTitle, payload.department, "Agent");
      const companyId = parseOptionalNumber(payload.companyId ?? payload.company_id ?? meta.companyId) ?? (await findFallbackCompanyId());
      const departmentId = await resolveDepartmentId({ companyId, payload });
      const runtimeModel = normalizeAgentRuntimeModel(
        payload.runtimeModel ?? payload.runtime_model ?? payload.model ?? meta.runtimeModel,
      );
      const toolsEnabled = normalizeAgentTools(
        (payload as any).toolsEnabled ?? (payload as any).tools_enabled ?? (meta as any).toolsEnabled ?? [],
      );
      const status = normalizeAgentStatus(payload.status);

      const insertedRows = getResultRows(
        await db.execute(sql`
          insert into agents (
            tenant_id,
            company_id,
            department_id,
            name,
            role,
            status,
            runtime_model,
            tools_enabled_json,
            metadata,
            created_at,
            updated_at
          )
          values (
            ${tenantId},
            ${companyId ?? null},
            ${departmentId ?? null},
            ${name},
            ${role},
            ${status},
            ${runtimeModel},
            ${JSON.stringify(toolsEnabled)}::jsonb,
            ${JSON.stringify({
              tenantId,
              source: "action_worker",
              runtimeModel,
              toolsEnabled,
              department: firstNonEmptyString(payload.department, payload.team),
            })}::jsonb,
            now(),
            now()
          )
          returning id
        `),
      );

      const agentId = parseOptionalNumber(insertedRows[0]?.id);
      if (!agentId) throw new Error("CREATE_AGENT failed to insert agent row.");

      await finalize({
        action: next,
        status: "DONE",
        actionType,
        result: {
          actionType,
          agentId,
          name,
          role,
          runtimeModel,
          toolsEnabled,
        },
        receipts: [
          {
            receiptType: "DB_MUTATION",
            entityType: "agent",
            entityIds: [agentId],
            affectedRows: 1,
          },
        ],
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `agentId=${agentId} name=${name} role=${role}`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, agentId, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE agentId=${agentId}`);
      return { ok: true, processed: 1, id: Number(next.id), agentId } as const;
    }

    if (actionType === "BULK_CREATE_AGENTS") {
      const entriesRaw = Array.isArray((payload as any).agents) ? ((payload as any).agents as unknown[]) : [];
      if (!entriesRaw.length) throw new Error("BULK_CREATE_AGENTS requires non-empty agents array.");

      const createdAgentIds: number[] = [];
      const companyId =
        parseOptionalNumber(payload.companyId ?? payload.company_id ?? meta.companyId) ?? (await findFallbackCompanyId());

      for (const entry of entriesRaw.slice(0, 100)) {
        const item = safeObject(entry);
        const name = firstNonEmptyString(item.name, item.displayName, item.agentName);
        if (!name) continue;

        const role = firstNonEmptyString(item.role, item.title, item.jobTitle, item.department, "Agent");
        const departmentId = await resolveDepartmentId({ companyId, payload: item });
        const runtimeModel = normalizeAgentRuntimeModel(item.runtimeModel ?? item.runtime_model ?? item.model);
        const toolsEnabled = normalizeAgentTools(item.toolsEnabled ?? item.tools_enabled ?? []);
        const status = normalizeAgentStatus(item.status);

        const rows = getResultRows(
          await db.execute(sql`
            insert into agents (
              tenant_id,
              company_id,
              department_id,
              name,
              role,
              status,
              runtime_model,
              tools_enabled_json,
              metadata,
              created_at,
              updated_at
            )
            values (
              ${tenantId},
              ${companyId ?? null},
              ${departmentId ?? null},
              ${name},
              ${role},
              ${status},
              ${runtimeModel},
              ${JSON.stringify(toolsEnabled)}::jsonb,
              ${JSON.stringify({
                tenantId,
                source: "action_worker",
                runtimeModel,
                toolsEnabled,
                department: firstNonEmptyString(item.department, item.team),
              })}::jsonb,
              now(),
              now()
            )
            returning id
          `),
        );

        const id = parseOptionalNumber(rows[0]?.id);
        if (id && id > 0) createdAgentIds.push(id);
      }

      if (!createdAgentIds.length) {
        await finalize({
          action: next,
          status: "DONE",
          actionType,
          result: { actionType, agentIds: [] },
          outcome: "NO_EFFECT",
        });
        await postActionOutcomeMessage({
          action: next,
          actionType,
          correlationId,
          conversationId,
          success: false,
          detail: "No valid agent payload entries; no rows inserted.",
        });
        return { ok: true, processed: 1, id: Number(next.id), agentIds: [] } as const;
      }

      await finalize({
        action: next,
        status: "DONE",
        actionType,
        result: {
          actionType,
          agentIds: createdAgentIds,
          count: createdAgentIds.length,
        },
        receipts: [
          {
            receiptType: "DB_MUTATION",
            entityType: "agent",
            entityIds: createdAgentIds,
            affectedRows: createdAgentIds.length,
          },
        ],
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `created=${createdAgentIds.length} ids=${createdAgentIds.join(",")}`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, createdAgentIds, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE createdAgents=${createdAgentIds.length}`);
      return { ok: true, processed: 1, id: Number(next.id), agentIds: createdAgentIds } as const;
    }

    if (actionType === "UPDATE_AGENT_MODEL") {
      const agentId = parseOptionalNumber(payload.agentId ?? payload.agent_id);
      const runtimeModel = normalizeAgentRuntimeModel(payload.runtimeModel ?? payload.runtime_model ?? payload.model);
      if (!agentId || !runtimeModel) {
        throw new Error("UPDATE_AGENT_MODEL requires agentId and runtimeModel.");
      }
      const toolsEnabled = normalizeAgentTools((payload as any).toolsEnabled ?? (payload as any).tools_enabled ?? []);

      const existsRows = getResultRows(
        await db.execute(sql`
          select id
          from agents
          where id = ${agentId}
          limit 1
        `),
      );
      if (!existsRows.length) throw new Error(`Agent ${agentId} not found.`);

      await upsertAgentRuntimeMetadata({
        agentId,
        runtimeModel,
        toolsEnabled,
        tenantId,
      });

      await finalize({
        action: next,
        status: "DONE",
        actionType,
        result: {
          actionType,
          agentId,
          runtimeModel,
          toolsEnabled,
        },
        receipts: [
          {
            receiptType: "DB_MUTATION",
            entityType: "agent",
            entityIds: [agentId],
            affectedRows: 1,
          },
        ],
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `agentId=${agentId} model=${runtimeModel}`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, agentId, runtimeModel, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE agentId=${agentId} model=${runtimeModel}`);
      return { ok: true, processed: 1, id: Number(next.id), agentId } as const;
    }

    if (actionType === "ASSIGN_AGENT_TO_CONVERSATION") {
      const agentId = parseOptionalNumber(payload.agentId ?? payload.agent_id);
      const conversationIdToAssign = firstNonEmptyString(
        payload.conversationId,
        payload.relatedConversationId,
        conversationId,
      );
      if (!agentId || !conversationIdToAssign) {
        throw new Error("ASSIGN_AGENT_TO_CONVERSATION requires agentId and conversationId.");
      }

      const roomRows = getResultRows(
        await db.execute(sql`
          select id
          from chat_rooms
          where conversation_id = ${conversationIdToAssign}
          limit 1
        `),
      );
      const roomId = parseOptionalNumber(roomRows[0]?.id);
      if (!roomId) throw new Error(`Conversation room not found: ${conversationIdToAssign}`);

      const existingRows = getResultRows(
        await db.execute(sql`
          select id, is_active
          from room_memberships
          where room_id = ${roomId}
            and agent_id = ${agentId}
          limit 1
        `),
      );

      let membershipId = parseOptionalNumber(existingRows[0]?.id);
      let affectedRows = 0;

      if (!membershipId) {
        const inserted = getResultRows(
          await db.execute(sql`
            insert into room_memberships (
              room_id,
              agent_id,
              joined_at,
              role,
              is_active,
              created_at,
              updated_at
            )
            values (
              ${roomId},
              ${agentId},
              now(),
              'member',
              true,
              now(),
              now()
            )
            returning id
          `),
        );
        membershipId = parseOptionalNumber(inserted[0]?.id);
        affectedRows = membershipId ? 1 : 0;
      } else if (!Boolean(existingRows[0]?.is_active)) {
        await db.execute(sql`
          update room_memberships
          set is_active = true, updated_at = now()
          where id = ${membershipId}
        `);
        affectedRows = 1;
      }

      if (!membershipId) throw new Error("Failed to create conversation membership.");

      await finalize({
        action: next,
        status: "DONE",
        actionType,
        result: {
          actionType,
          conversationId: conversationIdToAssign,
          roomId,
          agentId,
          conversationParticipantId: membershipId,
        },
        receipts: [
          {
            receiptType: "DB_MUTATION",
            entityType: "conversation_participant",
            entityIds: [membershipId],
            affectedRows: affectedRows || 1,
          },
        ],
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `conversationId=${conversationIdToAssign} agentId=${agentId}`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, agentId, conversationId: conversationIdToAssign, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE roomId=${roomId} agentId=${agentId}`);
      return { ok: true, processed: 1, id: Number(next.id), conversationParticipantId: membershipId } as const;
    }

    if (actionType === "CREATE_SHOP") {
      const shopName = firstNonEmptyString(payload.shopName, payload.shop_name, payload.name);
      if (!shopName) throw new Error("CREATE_SHOP requires shopName.");

      const actionConversationId = firstNonEmptyString(
        payload.conversationId,
        payload.relatedConversationId,
        (next as any).related_conversation_id,
        (next as any).relatedConversationId,
      );
      const contactSnapshot = await resolveShopContactSnapshot({
        tenantId,
        payload,
        conversationId: actionConversationId,
        requestedByUserId: requestedByUserId ? Number(requestedByUserId) : null,
      });

      const ownerEmail = firstNonEmptyString(payload.email, payload.ownerEmail, payload.owner_email, contactSnapshot.email);
      const ownerPhone = firstNonEmptyString(
        payload.phoneNumber,
        payload.phone,
        payload.ownerPhone,
        payload.owner_phone,
        payload.whatsapp,
        contactSnapshot.phone,
      );
      const ownerDisplayName = firstNonEmptyString(
        payload.ownerName,
        payload.owner_name,
        payload.contactName,
        payload.displayName,
        contactSnapshot.displayName,
        `${shopName} Owner`,
      );

      let ownerUserId =
        parseOptionalNumber(payload.ownerUserId ?? payload.owner_user_id ?? payload.userId ?? payload.user_id) ??
        null;
      if (!ownerUserId) ownerUserId = await findUserIdByIdentity({ email: ownerEmail, phone: ownerPhone });
      if (!ownerUserId && requestedByUserId) ownerUserId = Number(requestedByUserId);
      if (!ownerUserId) ownerUserId = await findTenantFallbackUserId(tenantId);
      if (!ownerUserId) {
        const [createdOwner] = await db
          .insert(users)
          .values({
            displayName: ownerDisplayName || `${shopName} Owner`,
            email: ownerEmail,
            phoneNumber: ownerPhone,
            role: "investor",
            accountType: "Seller",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: users.id });
        ownerUserId = parseOptionalNumber(createdOwner?.id);
      }
      if (!ownerUserId) throw new Error("CREATE_SHOP could not resolve or create owner user.");

      const sellerTypeRaw = String(
        firstNonEmptyString(payload.sellerType, payload.seller_type) || "retail_shop",
      )
        .trim()
        .toLowerCase();
      const allowedSellerTypes = new Set(["mine", "bureau_d_achat", "trader", "jeweler", "retail_shop"]);
      const sellerType = allowedSellerTypes.has(sellerTypeRaw) ? sellerTypeRaw : "retail_shop";
      const productionType = firstNonEmptyString(payload.productionType, payload.production_type) || null;

      const [seller] = await db
        .insert(sellers)
        .values({
          tenantId,
          userId: ownerUserId,
          shopName,
          slug: buildSellerSlug(shopName),
          description: firstNonEmptyString(payload.description, payload.notes, payload.note),
          phoneNumber: ownerPhone,
          email: ownerEmail,
          businessRegistration: firstNonEmptyString(
            payload.legalEntity,
            payload.legal_entity,
            payload.businessRegistration,
            payload.business_registration,
          ),
          personalId: firstNonEmptyString(payload.taxId, payload.tax_id, payload.personalId, payload.personal_id),
          sellerType: sellerType as any,
          productionType: productionType || (sellerType === "mine" ? "gold_mining" : "gold_retail"),
          status: "pending",
          isProducer: sellerType === "mine",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const recurringPayload: Record<string, unknown> = {
        ...payload,
        ownerUserId,
        owner_user_id: ownerUserId,
      };
      if (contactSnapshot.contactId) {
        recurringPayload.ownerContactId = contactSnapshot.contactId;
        recurringPayload.owner_contact_id = contactSnapshot.contactId;
      }
      if (ownerEmail) recurringPayload.email = ownerEmail;
      if (ownerPhone) {
        recurringPayload.phoneNumber = ownerPhone;
        recurringPayload.phone = ownerPhone;
      }
      delete (recurringPayload as any).ownerContactRef;
      delete (recurringPayload as any).ownerUserRef;

      const recurringNextActionId = await queueRecurringFollowup({
        action: next,
        actionType,
        payload: recurringPayload,
        metadata: meta,
        tenantId,
        plan: recurringPlan,
      });

      await finalize({
        action: next,
        status: "DONE",
        result: {
          actionType,
          sellerId: seller.id,
          shopName: seller.shopName,
          ownerUserId,
          ownerContactId: contactSnapshot.contactId,
          recurringNextActionId,
        },
      });

      const detailParts = [`shopId=${seller.id}`, `name=${seller.shopName}`];
      if (seller.email) detailParts.push(`email=${seller.email}`);
      if (seller.phoneNumber) detailParts.push(`phone=${seller.phoneNumber}`);
      if (recurringNextActionId) detailParts.push(`nextActionId=${recurringNextActionId}`);

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: detailParts.join(" | "),
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: { actionType, sellerId: seller.id, ownerUserId, ownerContactId: contactSnapshot.contactId, recurringNextActionId, finishedAt: nowIso() },
      });

      console.log(`${actionLogPrefix} status=DONE sellerId=${seller.id}`);
      return { ok: true, processed: 1, id: Number(next.id), sellerId: seller.id } as const;
    }

    if (actionType === "CREATE_TASK") {
      const title = String(payload.title ?? "").trim();
      if (!title) throw new Error("task title is required");

      const description = String(payload.description ?? payload.body ?? "").trim() || title;
      const existingTaskId = parseOptionalNumber(payload.existingTaskId ?? payload.existing_task_id);
      const taskAgentId = parseOptionalNumber(payload.agentId ?? payload.assigneeId ?? payload.agent_id);
      const companyIdRaw = parseOptionalNumber(payload.companyId ?? payload.company_id ?? meta.companyId);
      const goalId = parseOptionalNumber(payload.goalId ?? payload.goal_id);
      const objectiveId = parseOptionalNumber(payload.objectiveId ?? payload.objective_id ?? goalId);
      const priority = String(payload.priority ?? "medium").trim().toLowerCase();
      const status = String(payload.status ?? "backlog").trim().toLowerCase();
      const dueDateRaw = firstNonEmptyString(payload.dueDate, payload.due_date);
      const isAutomated = Boolean(payload.isAutomated ?? payload.is_automated ?? true);
      const sourceMeetingId = parseOptionalNumber(payload.sourceMeetingId ?? payload.source_meeting_id ?? meta.meetingId);
      const sourceMessageId = parseOptionalNumber(payload.sourceMessageId ?? payload.source_message_id ?? meta.messageId);
      const normalizedPriority = ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium";
      const normalizedStatus = ["backlog", "ready", "in_progress", "blocked", "completed", "cancelled"].includes(status)
        ? status
        : "backlog";

      let createdTask: any;
      if (companyIdRaw) {
        const taskCompany = await db.query.companies.findFirst({
          where: eq(companies.id, companyIdRaw),
          columns: { id: true, tenantId: true },
        });
        if (!taskCompany || Number(taskCompany.tenantId || 0) !== tenantId) {
          throw new Error(`company ${companyIdRaw} is outside the action tenant`);
        }
      }
      if (existingTaskId) {
        const existingTask = await db.query.tasks.findFirst({ where: eq(tasks.id, existingTaskId) });
        if (!existingTask) throw new Error(`task ${existingTaskId} not found`);
        if (companyIdRaw && existingTask.companyId && Number(existingTask.companyId) !== companyIdRaw) {
          throw new Error(`task ${existingTaskId} does not belong to company ${companyIdRaw}`);
        }

        [createdTask] = await db
          .update(tasks)
          .set({
            agentId: taskAgentId ?? existingTask.agentId,
            companyId: companyIdRaw ?? existingTask.companyId,
            goalId: goalId ?? existingTask.goalId,
            objectiveId: objectiveId ?? existingTask.objectiveId,
            title,
            description,
            priority: normalizedPriority,
            status: normalizedStatus,
            dueDate: dueDateRaw ? new Date(dueDateRaw) : existingTask.dueDate,
            approvalStatus: "approved",
            isAutomated,
            sourceMeetingId: sourceMeetingId ?? existingTask.sourceMeetingId,
            sourceMessageId: sourceMessageId ?? existingTask.sourceMessageId,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, existingTaskId))
          .returning();
      } else {
        [createdTask] = await db.insert(tasks).values({
          agentId: taskAgentId,
          companyId: companyIdRaw,
          goalId,
          objectiveId,
          title,
          description,
          priority: normalizedPriority,
          status: normalizedStatus,
          dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
          isAutomated,
          sourceMeetingId,
          sourceMessageId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();
      }

      const recurringNextActionId = await queueRecurringFollowup({
        action: next,
        actionType,
        payload,
        metadata: meta,
        tenantId,
        plan: recurringPlan,
      });
      const recurringMeetingActionIds = await queueRecurringMeetingActionsFromTask({
        action: next,
        tenantId,
        requestedByUserId: requestedByUserId ? Number(requestedByUserId) : null,
        title,
        description,
        companyId: companyIdRaw,
      });

      await finalize({
        action: next,
        status: "DONE",
        result: {
          actionType,
          taskId: createdTask.id,
          title: createdTask.title,
          assignedTo: taskAgentId,
          existingTask: Boolean(existingTaskId),
          recurringNextActionId,
          recurringMeetingActionIds,
        },
      });

      await postActionOutcomeMessage({
        action: next,
        actionType,
        correlationId,
        conversationId,
        success: true,
        detail: `taskId=${createdTask.id} title="${createdTask.title}" assignee=${taskAgentId || "unassigned"}${
          recurringNextActionId ? ` nextActionId=${recurringNextActionId}` : ""
        }${
          recurringMeetingActionIds.length ? ` recurringMeetingsQueued=${recurringMeetingActionIds.join(",")}` : ""
        }`,
      });

      await logAudit({
        tenantId,
        userId: requestedByUserId ? Number(requestedByUserId) : null,
        action: "action_request.done",
        entityId: Number(next.id),
        metadata: {
          actionType,
          taskId: createdTask.id,
          recurringNextActionId,
          recurringMeetingActionIds,
          finishedAt: nowIso(),
        },
      });

      console.log(`${actionLogPrefix} status=DONE taskId=${createdTask.id}`);
      return { ok: true, processed: 1, id: Number(next.id), taskId: createdTask.id } as const;
    }

    throw new Error(`Unsupported action_type: ${actionType}`);
  } catch (err: any) {
    if (notificationId && notificationDeliveryId) {
      try {
        await handleNotificationActionFailure({
          tenantId,
          notificationId,
          deliveryId: notificationDeliveryId,
          channelIndex: Number.isFinite(notificationChannelIndex) ? notificationChannelIndex : 0,
          attempt: Number.isFinite(notificationAttempt) ? notificationAttempt : 1,
          maxAttempts: Number.isFinite(notificationMaxAttempts) ? notificationMaxAttempts : 3,
          errorMessage: String(err?.message || err),
        });
      } catch {
        // ignore (avoid masking the original action failure)
      }
    }

    const message = String(err?.message || err || "action_failed");
    const errorCode = inferActionErrorCode({
      errorCode: err?.code,
      message,
    });
    const errorObj = {
      code: errorCode,
      message,
      stack: err?.stack ? String(err.stack) : undefined,
    };
    await finalize({
      action: next,
      status: "FAILED",
      error: errorObj,
      result: { actionType },
    });

    await postActionOutcomeMessage({
      action: next,
      actionType,
      correlationId,
      conversationId,
      success: false,
      detail: errorObj.message,
    });

    await logAudit({
      tenantId,
      userId: requestedByUserId ? Number(requestedByUserId) : null,
      action: "action_request.failed",
      entityId: Number(next.id),
      metadata: { actionType, error: errorObj, errorCode, finishedAt: nowIso() },
    });

    console.error(`${actionLogPrefix} status=FAILED code=${errorCode} error=${errorObj.message}`);

    return { ok: false, processed: 1, id: Number(next.id), error: errorObj.message, errorCode } as const;
  }
}
