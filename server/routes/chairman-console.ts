import { Router } from "express";
import QRCode from "qrcode";
import { db } from "@db";
import { eceUsers } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { resolveChairmanAssistant } from "../lib/chairman-assistant";
import { createQuickToken, redeemQuickToken } from "../lib/chairman-quick-tokens";
import { getCompanyBrainFeatureStatus } from "../lib/company-brain/featureFlags";
import {
  EXPORTUNITY_ROLE_SEAT_DEPARTMENTS,
  EXPORTUNITY_ROLE_SEAT_TOTAL,
} from "../lib/company-brain/roleSeatCatalog";
import { resolveChairmanConsoleActor } from "./utils/chairman-console-auth";

const router = Router();

function asNumber(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function rowsOf<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

function countOf(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function getPublicBaseUrl(req: any) {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").trim();
  const proto = forwardedProto || req.protocol || "https";
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.headers?.host || "").trim();
  return host ? `${proto}://${host}` : "";
}

router.get("/tenants/:tenantId/terminal-agent", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = asNumber(req.params.tenantId) ?? Number(req.tenant?.id);
  if (!tenantId || tenantId <= 0) return res.status(400).json({ message: "Invalid tenant id" });

  if (Number(req.tenant?.id) !== tenantId && !auth.adminOverride) {
    return res.status(403).json({ message: "Tenant mismatch" });
  }

  const assistant = await resolveChairmanAssistant(tenantId);

  res.json({
    ok: true,
    agent: {
      id: assistant.id,
      name: assistant.name,
      displayName: assistant.displayName ?? assistant.name,
      role: assistant.role,
      status: assistant.status,
      avatarUrl: assistant.avatarUrl ?? assistant.avatar ?? null,
      isTerminalDefault: assistant.isTerminalDefault,
    },
  });
});

router.get("/chairman/executive-truth", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });

  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  try {
    const [brainResult, sourceSecurityResult, contextResult, organizationResult, workforceResult] =
      await Promise.all([
        db.execute(sql`
          select
            (select count(*)::int from company_brain_sources where tenant_id = ${tenantId}) as sources,
            (select count(*)::int from company_brain_sources where tenant_id = ${tenantId} and status = 'active') as active_sources,
            (select count(*)::int from company_brain_claims where tenant_id = ${tenantId}) as claims,
            (select count(*)::int from company_brain_claims where tenant_id = ${tenantId} and status in ('verified', 'verified_internal_only')) as verified_internal_claims,
            (select count(*)::int from company_brain_claims where tenant_id = ${tenantId} and status = 'approved_external') as approved_external_claims,
            (select count(*)::int
               from company_brain_claim_conflicts cc
               join company_brain_claims c on c.id = cc.claim_id
              where c.tenant_id = ${tenantId} and cc.status = 'open') as open_conflicts,
            (select count(*)::int
               from company_brain_claim_approvals a
               join company_brain_claims c on c.id = a.claim_id
              where c.tenant_id = ${tenantId} and a.status = 'pending') as pending_approvals
        `),
        db.execute(sql`
          select sv.security_status as status, count(*)::int as count
          from company_brain_source_versions sv
          join company_brain_sources s on s.id = sv.source_id
          where s.tenant_id = ${tenantId}
          group by sv.security_status
          order by sv.security_status
        `),
        db.execute(sql`
          select
            id,
            task_key,
            purpose,
            status,
            jsonb_array_length(coalesce(source_citations, '[]'::jsonb))::int as citation_count,
            jsonb_array_length(coalesce(conflict_summaries, '[]'::jsonb))::int as conflict_count,
            created_at,
            expires_at
          from company_brain_context_packs
          where tenant_id = ${tenantId}
          order by created_at desc
          limit 1
        `),
        db.execute(sql`
          select
            t.department_key,
            max(t.organization_version) as organization_version,
            count(*)::int as total,
            count(*) filter (where t.runtime_agent_id is null)::int as available,
            count(*) filter (where t.runtime_agent_id is not null)::int as linked_runtime,
            count(*) filter (where a.status::text = 'active')::int as active_runtime,
            count(*) filter (
              where exists (
                select 1
                from agents_production ap
                where ap.tenant_id = ${tenantId}
                  and ap.agent_id = t.runtime_agent_id
                  and ap.is_enabled = true
              )
            )::int as production_enabled
          from ece_agent_templates t
          left join agents a
            on a.id = t.runtime_agent_id
           and a.tenant_id = ${tenantId}
          where t.tenant_id = ${tenantId}
            and t.seat_type = 'role_seat'
          group by t.department_key
          order by t.department_key
        `),
        db.execute(sql`
          select status::text as status, count(*)::int as count
          from industrial_agent_staffing_requests
          where tenant_id = ${tenantId}
          group by status
          order by status
        `),
      ]);

    const brainRow = rowsOf<any>(brainResult)[0] || {};
    const contextRow = rowsOf<any>(contextResult)[0] || null;
    const organizationRows = rowsOf<any>(organizationResult);
    const departmentCatalog = new Map(
      EXPORTUNITY_ROLE_SEAT_DEPARTMENTS.map((department) => [department.key, department]),
    );
    const departments = organizationRows.map((row) => {
      const catalog = departmentCatalog.get(String(row.department_key || ""));
      return {
        key: String(row.department_key || "unassigned"),
        name: catalog?.name || String(row.department_key || "Unassigned"),
        total: countOf(row.total),
        available: countOf(row.available),
        linkedRuntime: countOf(row.linked_runtime),
        activeRuntime: countOf(row.active_runtime),
        productionEnabled: countOf(row.production_enabled),
      };
    });
    const organizationSummary = departments.reduce(
      (summary, department) => ({
        total: summary.total + department.total,
        available: summary.available + department.available,
        linkedRuntime: summary.linkedRuntime + department.linkedRuntime,
        activeRuntime: summary.activeRuntime + department.activeRuntime,
        productionEnabled: summary.productionEnabled + department.productionEnabled,
      }),
      { total: 0, available: 0, linkedRuntime: 0, activeRuntime: 0, productionEnabled: 0 },
    );
    const workforce = Object.fromEntries(
      rowsOf<any>(workforceResult).map((row) => [String(row.status || "unknown"), countOf(row.count)]),
    );

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      brain: {
        flags: getCompanyBrainFeatureStatus(),
        counts: {
          sources: countOf(brainRow.sources),
          activeSources: countOf(brainRow.active_sources),
          claims: countOf(brainRow.claims),
          verifiedInternalClaims: countOf(brainRow.verified_internal_claims),
          approvedExternalClaims: countOf(brainRow.approved_external_claims),
          openConflicts: countOf(brainRow.open_conflicts),
          pendingApprovals: countOf(brainRow.pending_approvals),
        },
        sourceSecurity: rowsOf<any>(sourceSecurityResult).map((row) => ({
          status: String(row.status || "unknown"),
          count: countOf(row.count),
        })),
        latestContextPack: contextRow
          ? {
              id: countOf(contextRow.id),
              taskKey: String(contextRow.task_key || ""),
              purpose: String(contextRow.purpose || ""),
              status: String(contextRow.status || "unknown"),
              citationCount: countOf(contextRow.citation_count),
              conflictCount: countOf(contextRow.conflict_count),
              createdAt: contextRow.created_at || null,
              expiresAt: contextRow.expires_at || null,
            }
          : null,
      },
      organization: {
        organizationVersion:
          organizationRows.find((row) => row.organization_version)?.organization_version || null,
        baseline: EXPORTUNITY_ROLE_SEAT_TOTAL,
        summary: organizationSummary,
        departments,
      },
      workforce: {
        total: Object.values(workforce).reduce((sum, value) => sum + countOf(value), 0),
        monitoring: countOf(workforce.monitoring),
        proposed: countOf(workforce.proposed),
        approved: countOf(workforce.approved),
        provisioned: countOf(workforce.provisioned),
        active: countOf(workforce.active),
        paused: countOf(workforce.paused),
      },
      controls: {
        readOnly: true,
        approvalsAvailable: false,
        agentLifecycleMutationAvailable: false,
        externalActionsStarted: false,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Executive truth could not be loaded",
    });
  }
});

router.post("/chairman/quick-token", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const expiresInMinutes = asNumber(req.body?.expiresInMinutes ?? req.body?.expires_in_minutes) ?? 10;

  const token = await createQuickToken({
    tenantId,
    userId: auth.user.id,
    expiresInMinutes,
    metadata: {
      createdBy: auth.user.id,
      createdByRole: auth.user.role ?? null,
    },
  });

  const baseUrl = getPublicBaseUrl(req);
  const redeemUrl = `${baseUrl}/a/quick?token=${token.token}`;
  const qrCodeDataUrl = await QRCode.toDataURL(redeemUrl, { margin: 1, width: 240 });

  res.status(201).json({
    ok: true,
    token: token.token,
    tokenPrefix: token.tokenPrefix,
    expiresAt: token.expiresAt,
    redeemUrl,
    qrCodeDataUrl,
  });
});

router.post("/chairman/quick-token/redeem", async (req, res) => {
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }
  const token = String(req.body?.token || req.query?.token || "").trim();
  if (!token) return res.status(400).json({ message: "token is required" });

  const redeemed = await redeemQuickToken({
    tenantId,
    token,
    metadata: {
      ip: String(req.ip || ""),
      userAgent: String(req.headers?.["user-agent"] || ""),
    },
  });

  if (!redeemed.ok) {
    return res.status(401).json({ message: "Token invalid or expired" });
  }

  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, redeemed.userId),
  });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({
    ok: true,
    sessionToken: redeemed.sessionToken,
    sessionExpiresAt: redeemed.sessionExpiresAt,
    user: {
      id: user.id,
      displayName: user.displayName,
      roles: user.roles ?? [],
      role: user.role,
    },
  });
});

export default router;
