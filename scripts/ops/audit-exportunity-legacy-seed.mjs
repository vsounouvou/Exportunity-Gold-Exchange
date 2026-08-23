import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import pg from "pg";

const { Pool } = pg;

export const TENANT_KEY = "exportunity";
export const LEGACY_SEED_KEY = "exportunity_agent_economy_seed_v1";
export const LEGACY_TERRITORY_SOURCE = "SEED_EXPORTUNITY_AGENT_ECONOMY";

export const LEGACY_STAFF = Object.freeze([
  { email: "ops.super@exportunity.net", roles: ["SUPER_ADMIN", "TENANT_ADMIN"] },
  { email: "regional.south@exportunity.net", roles: ["TENANT_ADMIN", "OPS"] },
  { email: "regional.east@exportunity.net", roles: ["OPS"] },
  { email: "territory.cotonou@exportunity.net", roles: ["OPS"] },
  { email: "territory.portonovo@exportunity.net", roles: ["OPS"] },
  { email: "support.analytics@exportunity.net", roles: ["SUPPORT"] },
]);

export const LEGACY_TERRITORY_REFS = Object.freeze([
  "BJ",
  "BJ-LIT",
  "BJ-OUE",
  "BJ-COT",
  "BJ-PN",
  "BJ-COT-GANHI",
  "BJ-COT-AKPAKPA",
  "BJ-PN-DJASSIN",
]);

export const LEGACY_AGENT_NAMES = Object.freeze([
  "EXO Super Orchestrator",
  "EXO Director Operations",
  "EXO Director Finance",
  "EXO Director Territories",
  "EXO Regional Manager South",
  "EXO Regional Manager East",
  "EXO Territory Manager Cotonou",
  "EXO Territory Manager Porto-Novo",
  "EXO CRM Bot",
  "EXO Payment Reconciliation Bot",
  "EXO Gold Flow Controller Bot",
  "EXO Contract Follow-up Bot",
  "EXO Outreach Scheduler Bot",
  "EXO Reputation Monitor Bot",
  "EXO Warehouse Sync Bot",
  "EXO Logistics Signal Bot",
  "EXO Compliance Sentinel Bot",
  "EXO Dashboard Refresh Bot",
  "EXO SEO Pulse Bot",
  "EXO Media Outreach Bot",
]);

const AUDITED_TABLES = Object.freeze([
  "tenants",
  "ece_users",
  "user_tenant_roles",
  "geo_territories",
  "agents",
  "economy_wallets",
  "agent_tasks",
  "agent_token_usage",
  "cron_registry",
  "ece_audit_logs",
]);

const EXPECTED_USER_REFERENCE_KEYS = new Set([
  "ece_audit_logs.user_id",
  "user_tenant_roles.user_id",
  "agent_tasks.created_by_user_id",
]);

const EXPECTED_AGENT_REFERENCE_KEYS = new Set([
  "agents.manager_id",
  "economy_wallets.agent_id",
  "agent_tasks.agent_id",
  "agent_token_usage.agent_id",
  "cron_registry.agent_id",
]);

const EXPECTED_TERRITORY_REFERENCE_KEYS = new Set([
  "geo_territories.parent_territory_id",
  "ece_users.primary_territory_id",
]);

function usage() {
  return [
    "Usage:",
    "  node scripts/ops/audit-exportunity-legacy-seed.mjs",
    "  node scripts/ops/audit-exportunity-legacy-seed.mjs --compact",
    "",
    "Runs a repeatable-read, read-only production-compatible audit for the fixed",
    `legacy marker ${LEGACY_SEED_KEY}. No database changes are permitted.`,
  ].join("\n");
}

export function parseOptions(argv = process.argv.slice(2)) {
  const options = { compact: false, help: false };
  for (const arg of argv) {
    if (arg === "--compact") options.compact = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unsupported option: ${arg}`);
  }
  return options;
}

export function quoteIdentifier(value) {
  const normalized = String(value || "");
  if (!normalized) throw new Error("Cannot quote an empty SQL identifier");
  return `"${normalized.replaceAll('"', '""')}"`;
}

function asArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = String(row?.[key] ?? "unknown");
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function hashIdentity(value) {
  return createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex").slice(0, 16);
}

function dependencyRowsForId(dependencies, targetId) {
  const rows = [];
  for (const dependency of dependencies) {
    const hit = dependency.byId.find((entry) => Number(entry.targetId) === Number(targetId));
    if (hit) rows.push({ ...dependency, rowCount: hit.rowCount, byId: undefined });
  }
  return rows;
}

export function classifySeededStaff({ row, firstSeedAuditAt = null, dependencies = [] }) {
  const reasons = [];
  const marked = String(row?.seed_key || "") === LEGACY_SEED_KEY;
  const expected = LEGACY_STAFF.some((staff) => staff.email === String(row?.email || "").toLowerCase());
  const createdAt = row?.created_at ? new Date(row.created_at) : null;
  const firstAudit = firstSeedAuditAt ? new Date(firstSeedAuditAt) : null;

  if (!marked) reasons.push("fixed_identity_without_current_seed_marker");
  if (!expected) reasons.push("unexpected_identity_with_seed_marker");
  if (row?.last_login_at) reasons.push("account_has_login_history");
  if (
    createdAt &&
    firstAudit &&
    !Number.isNaN(createdAt.getTime()) &&
    !Number.isNaN(firstAudit.getTime()) &&
    createdAt.getTime() < firstAudit.getTime() - 5 * 60_000
  ) {
    reasons.push("account_predates_first_retained_seed_audit");
  }
  const unexpectedReferences = dependencies.filter(
    (entry) => !EXPECTED_USER_REFERENCE_KEYS.has(`${entry.table}.${entry.column}`),
  );
  if (unexpectedReferences.length) reasons.push("account_has_non_seed_graph_references");

  return {
    classification:
      marked && expected && reasons.length === 0
        ? "likely_seed_created_review_before_change"
        : "manual_review_required",
    reasons,
  };
}

function sanitizeError(error) {
  let message = error instanceof Error ? error.message : String(error || "Unknown failure");
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (databaseUrl) message = message.split(databaseUrl).join("[redacted]");
  return message.replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+@/gi, "$1[redacted]@");
}

async function presentTables(client) {
  const result = await client.query(
    `select requested.table_name,
            to_regclass('public.' || requested.table_name) is not null as present
       from unnest($1::text[]) as requested(table_name)
      order by requested.table_name`,
    [AUDITED_TABLES],
  );
  return new Map(result.rows.map((row) => [String(row.table_name), row.present === true]));
}

async function foreignKeyReferences(client, targetTable, targetIds) {
  if (!targetIds.length) return [];
  const catalog = await client.query(
    `select source_ns.nspname as schema_name,
            source_table.relname as table_name,
            source_column.attname as column_name
       from pg_constraint constraint_row
       join pg_class source_table on source_table.oid = constraint_row.conrelid
       join pg_namespace source_ns on source_ns.oid = source_table.relnamespace
       join pg_attribute source_column
         on source_column.attrelid = constraint_row.conrelid
        and source_column.attnum = constraint_row.conkey[1]
      where constraint_row.contype = 'f'
        and constraint_row.confrelid = to_regclass($1)
        and array_length(constraint_row.conkey, 1) = 1
        and array_length(constraint_row.confkey, 1) = 1
      order by source_ns.nspname, source_table.relname, source_column.attname`,
    [`public.${targetTable}`],
  );

  const references = [];
  for (const relation of catalog.rows) {
    const schema = String(relation.schema_name);
    const table = String(relation.table_name);
    const column = String(relation.column_name);
    const sql = `select ${quoteIdentifier(column)}::int as target_id, count(*)::int as row_count
                   from ${quoteIdentifier(schema)}.${quoteIdentifier(table)}
                  where ${quoteIdentifier(column)} = any($1::int[])
                  group by ${quoteIdentifier(column)}
                  order by ${quoteIdentifier(column)}`;
    const usage = await client.query(sql, [targetIds]);
    if (!usage.rows.length) continue;
    references.push({
      schema,
      table,
      column,
      rowCount: usage.rows.reduce((sum, row) => sum + Number(row.row_count || 0), 0),
      byId: usage.rows.map((row) => ({
        targetId: Number(row.target_id),
        rowCount: Number(row.row_count || 0),
      })),
    });
  }
  return references;
}

function unexpectedReferenceSummary(references, expectedKeys) {
  return references
    .filter((entry) => !expectedKeys.has(`${entry.table}.${entry.column}`))
    .map((entry) => ({
      schema: entry.schema,
      table: entry.table,
      column: entry.column,
      rowCount: entry.rowCount,
      targetIds: entry.byId.map((hit) => hit.targetId),
    }));
}

export async function auditLegacySeed(pool) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("begin isolation level repeatable read read only");
    transactionOpen = true;
    await client.query("set local statement_timeout = '30s'");
    await client.query("set local lock_timeout = '2s'");

    const transactionState = await client.query(
      "select current_setting('transaction_read_only') as read_only, current_setting('transaction_isolation') as isolation",
    );
    const state = transactionState.rows[0] || {};
    if (state.read_only !== "on") throw new Error("Database transaction is not read-only; audit aborted");

    const tableMap = await presentTables(client);
    const missingTables = AUDITED_TABLES.filter((table) => tableMap.get(table) !== true);
    if (missingTables.includes("tenants")) throw new Error("Required table tenants is missing");

    const tenantResult = await client.query(
      "select id, key from tenants where lower(key) = $1 limit 1",
      [TENANT_KEY],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant?.id) throw new Error(`Tenant ${TENANT_KEY} was not found`);
    const tenantId = Number(tenant.id);

    const staffEmails = LEGACY_STAFF.map((staff) => staff.email);
    const staffRows = tableMap.get("ece_users")
      ? (
          await client.query(
            `select id, email, display_name, role::text, roles, permissions, current_mode,
                    is_active, email_verified, primary_territory_id, last_login_at,
                    created_at, updated_at, metadata ->> 'seed_key' as seed_key
               from ece_users
              where metadata ->> 'seed_key' = $1
                 or lower(email) = any($2::text[])
              order by id`,
            [LEGACY_SEED_KEY, staffEmails],
          )
        ).rows
      : [];

    const territoryRows = tableMap.get("geo_territories")
      ? (
          await client.query(
            `select id, parent_territory_id, name, country_code, city, territory_type,
                    source, source_ref, status, created_at, updated_at
               from geo_territories
              where tenant_id = $1
                and (source = $2 or source_ref = any($3::text[]))
              order by id`,
            [tenantId, LEGACY_TERRITORY_SOURCE, LEGACY_TERRITORY_REFS],
          )
        ).rows
      : [];

    const agentRows = tableMap.get("agents")
      ? (
          await client.query(
            `select id, manager_id, company_id, name, role, hierarchy_level, env,
                    is_test, is_visible, status, created_at, updated_at,
                    metadata ->> 'seed_key' as seed_key
               from agents
              where tenant_id = $1
                and (metadata ->> 'seed_key' = $2 or name = any($3::text[]))
              order by id`,
            [tenantId, LEGACY_SEED_KEY, LEGACY_AGENT_NAMES],
          )
        ).rows
      : [];

    const walletRows = tableMap.get("economy_wallets")
      ? (
          await client.query(
            `select id, agent_id, status, created_at, updated_at
               from economy_wallets
              where metadata ->> 'seed_key' = $1
              order by id`,
            [LEGACY_SEED_KEY],
          )
        ).rows
      : [];

    const taskRows = tableMap.get("agent_tasks")
      ? (
          await client.query(
            `select id, agent_id, created_by_user_id, task_type, task_source,
                    status::text, execution_status, created_at, updated_at
               from agent_tasks
              where tenant_id = $1 and constraints ->> 'seed_key' = $2
              order by id`,
            [tenantId, LEGACY_SEED_KEY],
          )
        ).rows
      : [];

    const tokenRows = tableMap.get("agent_token_usage")
      ? (
          await client.query(
            `select id, agent_id, task_id, "timestamp" as event_at
               from agent_token_usage
              where tenant_id = $1 and metadata ->> 'seed_key' = $2
              order by id`,
            [tenantId, LEGACY_SEED_KEY],
          )
        ).rows
      : [];

    const cronRows = tableMap.get("cron_registry")
      ? (
          await client.query(
            `select id, agent_id, cron_type, is_active, created_at, updated_at
               from cron_registry
              where tenant_id = $1 and metadata ->> 'seed_key' = $2
              order by id`,
            [tenantId, LEGACY_SEED_KEY],
          )
        ).rows
      : [];

    const auditRows = tableMap.get("ece_audit_logs")
      ? (
          await client.query(
            `select id, user_id, action, entity_type, entity_id, created_at
               from ece_audit_logs
              where tenant_id = $1 and metadata ->> 'seed_key' = $2
              order by id`,
            [tenantId, LEGACY_SEED_KEY],
          )
        ).rows
      : [];

    const staffIds = staffRows.map((row) => Number(row.id)).filter((id) => id > 0);
    const territoryIds = territoryRows.map((row) => Number(row.id)).filter((id) => id > 0);
    const agentIds = agentRows.map((row) => Number(row.id)).filter((id) => id > 0);

    const tenantRoleRows = tableMap.get("user_tenant_roles") && staffIds.length
      ? (
          await client.query(
            `select id, user_id, role::text, created_at
               from user_tenant_roles
              where tenant_id = $1 and user_id = any($2::int[])
              order by user_id, role`,
            [tenantId, staffIds],
          )
        ).rows
      : [];

    const [staffReferences, territoryReferences, agentReferences] = await Promise.all([
      tableMap.get("ece_users") ? foreignKeyReferences(client, "ece_users", staffIds) : [],
      tableMap.get("geo_territories") ? foreignKeyReferences(client, "geo_territories", territoryIds) : [],
      tableMap.get("agents") ? foreignKeyReferences(client, "agents", agentIds) : [],
    ]);

    const firstSeedAuditAt = auditRows.length ? auditRows[0].created_at : null;
    const staff = staffRows.map((row) => {
      const email = String(row.email || "").toLowerCase();
      const expected = LEGACY_STAFF.find((entry) => entry.email === email);
      const dependencies = dependencyRowsForId(staffReferences, row.id);
      return {
        id: Number(row.id),
        identity: expected ? email : `unexpected-seed-marker:${hashIdentity(email)}`,
        expectedIdentity: Boolean(expected),
        displayName: expected ? String(row.display_name || "") : null,
        seedMarkerPresent: row.seed_key === LEGACY_SEED_KEY,
        globalRole: String(row.role || ""),
        roles: asArray(row.roles),
        hasWildcardPermission: asArray(row.permissions).includes("*"),
        currentMode: row.current_mode,
        active: row.is_active === true,
        emailVerified: row.email_verified === true,
        primaryTerritoryId: row.primary_territory_id ? Number(row.primary_territory_id) : null,
        hasLoginHistory: Boolean(row.last_login_at),
        lastLoginAt: iso(row.last_login_at),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        tenantRoles: tenantRoleRows
          .filter((role) => Number(role.user_id) === Number(row.id))
          .map((role) => String(role.role)),
        references: dependencies.map((entry) => ({
          schema: entry.schema,
          table: entry.table,
          column: entry.column,
          rowCount: entry.rowCount,
        })),
        ...classifySeededStaff({ row, firstSeedAuditAt, dependencies }),
      };
    });

    const agents = agentRows.map((row) => {
      const dependencies = dependencyRowsForId(agentReferences, row.id);
      const unexpected = dependencies.filter(
        (entry) => !EXPECTED_AGENT_REFERENCE_KEYS.has(`${entry.table}.${entry.column}`),
      );
      return {
        id: Number(row.id),
        name: String(row.name || ""),
        role: String(row.role || ""),
        hierarchy: String(row.hierarchy_level || ""),
        managerId: row.manager_id ? Number(row.manager_id) : null,
        companyId: row.company_id ? Number(row.company_id) : null,
        seedMarkerPresent: row.seed_key === LEGACY_SEED_KEY,
        status: String(row.status || ""),
        environment: String(row.env || ""),
        isTest: row.is_test === true,
        visible: row.is_visible === true,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        classification: unexpected.length
          ? "manual_review_required_due_to_non_seed_graph_references"
          : "synthetic_candidate_review_before_change",
        unexpectedReferences: unexpected.map((entry) => ({
          schema: entry.schema,
          table: entry.table,
          column: entry.column,
          rowCount: entry.rowCount,
        })),
      };
    });

    const totalMarked =
      staffRows.filter((row) => row.seed_key === LEGACY_SEED_KEY).length +
      territoryRows.filter((row) => row.source === LEGACY_TERRITORY_SOURCE).length +
      agentRows.filter((row) => row.seed_key === LEGACY_SEED_KEY).length +
      walletRows.length +
      taskRows.length +
      tokenRows.length +
      cronRows.length +
      auditRows.length;

    const result = {
      ok: true,
      mode: "read_only",
      generatedAt: new Date().toISOString(),
      transaction: {
        readOnly: state.read_only === "on",
        isolation: state.isolation,
      },
      scope: {
        tenantKey: TENANT_KEY,
        tenantId,
        seedKey: LEGACY_SEED_KEY,
        territorySource: LEGACY_TERRITORY_SOURCE,
      },
      schema: {
        auditedTables: AUDITED_TABLES.map((table) => ({ table, present: tableMap.get(table) === true })),
        missingTables,
      },
      summary: {
        totalDirectlyMarkedRows: totalMarked,
        staffCandidates: staffRows.length,
        staffMarked: staffRows.filter((row) => row.seed_key === LEGACY_SEED_KEY).length,
        territoryCandidates: territoryRows.length,
        territoriesMarkedBySource: territoryRows.filter((row) => row.source === LEGACY_TERRITORY_SOURCE).length,
        agentCandidates: agentRows.length,
        agentsMarked: agentRows.filter((row) => row.seed_key === LEGACY_SEED_KEY).length,
        walletsMarked: walletRows.length,
        tasksMarked: taskRows.length,
        tokenUsageMarked: tokenRows.length,
        cronEntriesMarked: cronRows.length,
        auditLogsMarked: auditRows.length,
        tenantRolesOnStaffCandidates: tenantRoleRows.length,
      },
      staff,
      territories: territoryRows.map((row) => ({
        id: Number(row.id),
        parentTerritoryId: row.parent_territory_id ? Number(row.parent_territory_id) : null,
        name: String(row.name || ""),
        countryCode: String(row.country_code || ""),
        city: row.city,
        type: String(row.territory_type || ""),
        source: row.source,
        sourceRef: row.source_ref,
        status: row.status,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
      })),
      agents,
      markedRecordIds: {
        wallets: walletRows.map((row) => Number(row.id)),
        tasks: taskRows.map((row) => Number(row.id)),
        tokenUsage: tokenRows.map((row) => Number(row.id)),
        cronEntries: cronRows.map((row) => Number(row.id)),
        auditLogs: auditRows.map((row) => Number(row.id)),
      },
      markedRecordBreakdown: {
        taskStatus: countBy(taskRows, "status"),
        taskExecutionStatus: countBy(taskRows, "execution_status"),
        cronActive: countBy(cronRows, "is_active"),
        auditAction: countBy(auditRows, "action"),
        firstSeedAuditAt: iso(firstSeedAuditAt),
        lastSeedAuditAt: iso(auditRows.at(-1)?.created_at),
      },
      dependencyReview: {
        staff: staffReferences,
        territories: territoryReferences,
        agents: agentReferences,
        unexpectedStaffReferences: unexpectedReferenceSummary(
          staffReferences,
          EXPECTED_USER_REFERENCE_KEYS,
        ),
        unexpectedTerritoryReferences: unexpectedReferenceSummary(
          territoryReferences,
          EXPECTED_TERRITORY_REFERENCE_KEYS,
        ),
        unexpectedAgentReferences: unexpectedReferenceSummary(
          agentReferences,
          EXPECTED_AGENT_REFERENCE_KEYS,
        ),
      },
      remediation: {
        databaseChanged: false,
        decision: totalMarked > 0 ? "review_required_before_any_change" : "no_direct_seed_marker_found",
        rules: [
          "Do not bulk-remove staff identities: the retired seed could overwrite a pre-existing account.",
          "Review login history, creation time, tenant roles, and all foreign-key references per staff candidate.",
          "Review non-seed graph references before changing agents or territories.",
          "If cleanup is approved later, use a separately reviewed migration or operations script with a fresh production backup.",
        ],
        childFirstCandidateOrder: [
          "agent_token_usage",
          "cron_registry",
          "agent_tasks",
          "economy_wallets",
          "agents",
          "geo_territories",
          "user_tenant_roles",
          "ece_users",
        ],
      },
    };

    await client.query("rollback");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const options = parseOptions();
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
    application_name: "exportunity-legacy-seed-read-only-audit",
  });
  try {
    const result = await auditLegacySeed(pool);
    console.log(JSON.stringify(result, null, options.compact ? 0 : 2));
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[audit-exportunity-legacy-seed] failed: ${sanitizeError(error)}`);
    process.exitCode = 1;
  });
}
