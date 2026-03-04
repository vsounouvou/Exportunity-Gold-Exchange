import { randomUUID } from "crypto";
import { db } from "@db";
import { sql } from "drizzle-orm";

export type ForgeRequestRow = {
  id: string;
  tenant_id: number;
  requested_by_user_id: number | null;
  requested_by_agent_id: number | null;
  desired_action_key: string;
  desired_description: string | null;
  desired_entity: string | null;
  status: string;
  pr_url: string | null;
  error_log: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export function isFeatureEnabled(name: string, defaultValue = false) {
  const raw = String((process.env as Record<string, string | undefined>)[name] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw);
}

export function normalizeRoleLabel(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDevAgentActor(user: any) {
  const role = normalizeRoleLabel(user?.role);
  const roles = Array.isArray(user?.roles) ? user.roles.map(normalizeRoleLabel) : [];
  const perms = Array.isArray(user?.permissions)
    ? user.permissions.map((p: any) => String(p || "").trim().toLowerCase())
    : [];
  return (
    role === "dev agent" ||
    role === "developer agent" ||
    roles.includes("dev agent") ||
    roles.includes("developer agent") ||
    roles.includes("devops") ||
    perms.includes("action_forge:create") ||
    perms.includes("action_forge:*") ||
    perms.includes("admin:*") ||
    perms.includes("*")
  );
}

export function normalizeActionKey(input: string) {
  return String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

export async function countForgeRequestsToday(tenantId: number) {
  const result = await db.execute(sql`
    select count(*)::int as total
    from action_forge_requests
    where tenant_id = ${tenantId}
      and created_at >= date_trunc('day', now())
  `);
  return Number(rows<any>(result)[0]?.total || 0);
}

export async function createActionForgeRequest(input: {
  tenantId: number;
  requestedByUserId?: number | null;
  requestedByAgentId?: number | null;
  desiredActionKey: string;
  desiredDescription?: string | null;
  desiredEntity?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const id = randomUUID();
  const desiredActionKey = normalizeActionKey(input.desiredActionKey);
  const metadata = input.metadata || {};
  await db.execute(sql`
    insert into action_forge_requests (
      id,
      tenant_id,
      requested_by_user_id,
      requested_by_agent_id,
      desired_action_key,
      desired_description,
      desired_entity,
      status,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${id},
      ${input.tenantId},
      ${input.requestedByUserId ?? null},
      ${input.requestedByAgentId ?? null},
      ${desiredActionKey},
      ${input.desiredDescription ?? null},
      ${input.desiredEntity ?? null},
      'REQUESTED',
      ${JSON.stringify(metadata)}::jsonb,
      now(),
      now()
    )
  `);

  await db.execute(sql`
    insert into action_forge_events (request_id, status_from, status_to, notes, created_at)
    values (${id}, null, 'REQUESTED', 'Forge request created', now())
  `);

  const rowResult = await db.execute(sql`
    select *
    from action_forge_requests
    where id = ${id}
    limit 1
  `);
  return rows<ForgeRequestRow>(rowResult)[0] || null;
}

export async function updateForgeRequestStatus(input: {
  requestId: string;
  statusTo: string;
  notes?: string | null;
  patch?: Record<string, unknown>;
  prUrl?: string | null;
  errorLog?: string | null;
}) {
  const beforeResult = await db.execute(sql`
    select status, metadata
    from action_forge_requests
    where id = ${input.requestId}
    limit 1
  `);
  const before = rows<any>(beforeResult)[0];
  if (!before) return null;

  const mergedMetadata = {
    ...(before.metadata && typeof before.metadata === "object" ? before.metadata : {}),
    ...(input.patch || {}),
  };

  await db.execute(sql`
    update action_forge_requests
    set
      status = ${input.statusTo},
      pr_url = coalesce(${input.prUrl ?? null}, pr_url),
      error_log = coalesce(${input.errorLog ?? null}, error_log),
      metadata = ${JSON.stringify(mergedMetadata)}::jsonb,
      updated_at = now()
    where id = ${input.requestId}
  `);

  await db.execute(sql`
    insert into action_forge_events (request_id, status_from, status_to, notes, created_at)
    values (${input.requestId}, ${String(before.status)}, ${input.statusTo}, ${input.notes ?? null}, now())
  `);

  const rowResult = await db.execute(sql`
    select *
    from action_forge_requests
    where id = ${input.requestId}
    limit 1
  `);
  return rows<ForgeRequestRow>(rowResult)[0] || null;
}

export function resolveProtectedTables(): string[] {
  const fromJson = String(process.env.PROTECTED_TABLES || "").trim();
  if (fromJson) {
    try {
      const parsed = JSON.parse(fromJson);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      // fallback to csv parser below
    }
  }
  const csv = fromJson || "users,wallets,payments,ledger_entries";
  return csv
    .split(",")
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);
}

