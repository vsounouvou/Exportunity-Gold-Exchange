import { and, eq } from "drizzle-orm";

import { db } from "@db";
import { mindbaseDashboardSummaries, mindbaseEvents, mindbaseOrgWallets, mindbaseOrganizationPlatforms, mindbaseTenantPlatforms } from "@db/schema";

import { withMindbaseCache } from "./cache";
import { getTenantAgents, getTenantMetrics } from "../tenant-bridge";

const SUMMARY_TTL_MS = 20_000;

export async function refreshMindbaseDashboardSummary(input: { tenantId: number; organizationId: string }) {
  return withMindbaseCache(`mindbase:summary:${input.tenantId}:${input.organizationId}`, SUMMARY_TTL_MS, async () => {
    const [wallet, links, recentEvents] = await Promise.all([
      db.query.mindbaseOrgWallets.findFirst({
        where: and(eq(mindbaseOrgWallets.tenantId, input.tenantId), eq(mindbaseOrgWallets.organizationId, input.organizationId)),
      }),
      db.query.mindbaseOrganizationPlatforms.findMany({
        where: and(
          eq(mindbaseOrganizationPlatforms.tenantId, input.tenantId),
          eq(mindbaseOrganizationPlatforms.organizationId, input.organizationId),
        ),
      }),
      db.query.mindbaseEvents.findMany({
        where: and(eq(mindbaseEvents.tenantId, input.tenantId), eq(mindbaseEvents.organizationId, input.organizationId)),
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
        limit: 10,
      }),
    ]);

    const primaryLink = links.find((link) => Boolean(link.isPrimary)) || links[0] || null;
    const primaryPlatform = primaryLink
      ? await db.query.mindbaseTenantPlatforms.findFirst({
          where: and(
            eq(mindbaseTenantPlatforms.tenantId, input.tenantId),
            eq(mindbaseTenantPlatforms.id, primaryLink.tenantPlatformId),
          ),
        })
      : null;

    const metrics = primaryPlatform ? await getTenantMetrics(Number(primaryPlatform.platformTenantId)) : null;
    const agents = primaryPlatform ? await getTenantAgents(Number(primaryPlatform.platformTenantId)) : [];

    const summary = {
      activeAgents: Number(metrics?.activeAgents || 0),
      newClientMessages: Number(metrics?.inboundToday || 0),
      pendingSupplierApprovals: Number(metrics?.pendingApprovals || 0),
      failedAgentTasks: Number(metrics?.failedRuns || 0),
      treasuryWalletBalance: wallet?.balance ?? "0",
      treasuryWalletCurrency: wallet?.currency || "USD",
      queuedTasks: Number(metrics?.queuedTasks || 0),
      inboxThreads: Number(metrics?.inboxThreads || 0),
      connectedChannels: Number(metrics?.connectedChannels || 0),
      primaryPlatform: primaryPlatform
        ? {
            id: primaryPlatform.id,
            slug: primaryPlatform.slug,
            name: primaryPlatform.name,
            baseUrl: primaryPlatform.baseUrl,
          }
        : null,
      chairmanNarrative: [
        `${Number(metrics?.inboundToday || 0)} new client messages`,
        `${Number(metrics?.pendingApprovals || 0)} pending approvals`,
        `${Number(metrics?.failedRuns || 0)} agent tasks failed`,
        `Treasury wallet balance: ${wallet?.balance ?? "0"} ${wallet?.currency || "USD"}`,
      ],
      agentPreview: agents.slice(0, 6).map((agent) => ({
        id: agent.id,
        name: agent.displayName || agent.name,
        role: agent.role,
        status: agent.status,
      })),
    };

    const live = recentEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      status: event.status,
      createdAt: event.createdAt,
      payload: event.payload,
    }));

    const existing = await db.query.mindbaseDashboardSummaries.findFirst({
      where: and(eq(mindbaseDashboardSummaries.tenantId, input.tenantId), eq(mindbaseDashboardSummaries.organizationId, input.organizationId)),
    });

    if (existing) {
      const [updated] = await db
        .update(mindbaseDashboardSummaries)
        .set({
          summaryJson: summary,
          liveJson: live,
          cachedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mindbaseDashboardSummaries.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(mindbaseDashboardSummaries)
      .values({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        summaryJson: summary,
        liveJson: live,
        cachedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return created;
  });
}

export async function getMindbaseDashboardSummary(input: { tenantId: number; organizationId: string }) {
  const current = await db.query.mindbaseDashboardSummaries.findFirst({
    where: and(eq(mindbaseDashboardSummaries.tenantId, input.tenantId), eq(mindbaseDashboardSummaries.organizationId, input.organizationId)),
  });
  if (current) return current;
  return refreshMindbaseDashboardSummary(input);
}
