import { sql } from "drizzle-orm";
import { db } from "@db";
import { ensureAgentsOsMarketplaceTables } from "../agent-os/ensureMarketplaceCatalog";
import { ensureTenants, getTenantByKey } from "../tenants";
import { EXPORTUNITY_ROLE_SEATS } from "./roleSeatCatalog";

export const EXPORTUNITY_ROLE_SEAT_ORGANIZATION_VERSION = "exportunity-global-role-seats-v2";

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

export async function ensureExportunityRoleSeatCatalog() {
  await ensureTenants();
  await ensureAgentsOsMarketplaceTables();
  const tenant = await getTenantByKey("exportunity" as any);
  if (!tenant?.id) throw new Error("Exportunity tenant is unavailable");
  const tenantId = Number(tenant.id);

  const codes = EXPORTUNITY_ROLE_SEATS.map((seat) => seat.immutableAgentId);
  const existingRows = rows<{
    id: number;
    code: string;
    organization_version: string | null;
  }>(
    await db.execute(sql`
      select id, code, organization_version
      from ece_agent_templates
      where tenant_id = ${tenantId}
        and code in (${sql.join(codes.map((code) => sql`${code}`), sql`, `)})
    `),
  );
  const existingByCode = new Map(existingRows.map((row) => [String(row.code), row]));
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const seat of EXPORTUNITY_ROLE_SEATS) {
    const existing = existingByCode.get(seat.immutableAgentId);
    const approvalPolicy = {
      source: "exportunity_global_role_library",
      activationState: "available",
      externalCommunication: "human_approval_required",
      payments: "human_approval_required",
      contracts: "human_approval_required",
      publicClaims: "human_approval_required",
      productionEnablement: "human_approval_required",
      backgroundAutonomy: "disabled",
    };
    const personalityProfile = {
      tone: "professional",
      warmth: "calm",
      riskTolerance: "conservative",
      evidenceBehavior: "cite_and_escalate_conflicts",
    };

    if (existing?.id) {
      if (existing.organization_version === EXPORTUNITY_ROLE_SEAT_ORGANIZATION_VERSION) {
        unchanged += 1;
        continue;
      }
      await db.execute(sql`
        update ece_agent_templates
        set
          seat_type = 'role_seat',
          seat_status = case when runtime_agent_id is null then 'available' else 'provisioned' end,
          organization_version = ${EXPORTUNITY_ROLE_SEAT_ORGANIZATION_VERSION},
          department_key = ${seat.departmentKey},
          role_profile = ${JSON.stringify(seat)}::jsonb || coalesce(role_profile, '{}'::jsonb),
          approval_policy = ${JSON.stringify(approvalPolicy)}::jsonb || coalesce(approval_policy, '{}'::jsonb),
          default_tools = case when jsonb_array_length(coalesce(default_tools, '[]'::jsonb)) = 0 then ${JSON.stringify(seat.permittedTools)}::jsonb else default_tools end,
          default_limits = ${JSON.stringify(seat.budget)}::jsonb || coalesce(default_limits, '{}'::jsonb),
          updated_at = now()
        where id = ${Number(existing.id)} and tenant_id = ${tenantId}
      `);
      updated += 1;
      continue;
    }

    await db.execute(sql`
      insert into ece_agent_templates (
        tenant_id, code, slug, title, description, category, role_title, short_pitch, long_description,
        default_tools, default_limits, base_model, personality_profile, autonomy_level, approval_policy,
        avatar_url, status, visibility, is_active, base_salary_monthly, seat_type, seat_status,
        organization_version, department_key, role_profile, runtime_agent_id, created_at, updated_at
      ) values (
        ${tenantId},
        ${seat.immutableAgentId},
        ${seat.immutableAgentId},
        ${seat.defaultDisplayName},
        ${seat.description},
        ${seat.departmentKey},
        ${seat.role},
        ${seat.description},
        ${seat.description},
        ${JSON.stringify(seat.permittedTools)}::jsonb,
        ${JSON.stringify(seat.budget)}::jsonb,
        'gpt-5',
        ${JSON.stringify(personalityProfile)}::jsonb,
        1,
        ${JSON.stringify(approvalPolicy)}::jsonb,
        null,
        'draft',
        'private',
        true,
        0,
        'role_seat',
        'available',
        ${EXPORTUNITY_ROLE_SEAT_ORGANIZATION_VERSION},
        ${seat.departmentKey},
        ${JSON.stringify(seat)}::jsonb,
        null,
        now(),
        now()
      )
    `);
    created += 1;
  }

  await db.execute(sql`
    insert into agent_marketplace_profiles (
      agent_id, tenant_id, is_visible, price_monthly, currency, tags, is_featured,
      sort_rank, availability, created_at, updated_at
    )
    select id, ${tenantId}, false, 0, 'USD', '[]'::jsonb, false, 0, 'paused', now(), now()
    from ece_agent_templates
    where tenant_id = ${tenantId} and seat_type = 'role_seat'
    on conflict (tenant_id, agent_id)
    do update set is_visible = false, availability = 'paused', updated_at = now()
  `);

  return {
    tenantId,
    organizationVersion: EXPORTUNITY_ROLE_SEAT_ORGANIZATION_VERSION,
    total: EXPORTUNITY_ROLE_SEATS.length,
    created,
    updated,
    unchanged,
    runtimeAgentsStarted: 0,
    externalCommunicationsStarted: 0,
  };
}
