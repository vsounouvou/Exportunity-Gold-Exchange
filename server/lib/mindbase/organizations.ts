import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@db";
import {
  mindbaseOrgWallets,
  mindbaseOrgWidgets,
  mindbaseOrganizationPlatforms,
  mindbaseOrganizations,
  mindbaseOrganizationUsers,
  mindbaseTenantPlatforms,
  mindbaseWidgetRegistry,
  mindbaseWorkspaces,
  mindbaseWorkspaceMembers,
  tenants,
} from "@db/schema";

import { emitMindbaseEvent, recordMindbaseBrainEvent } from "./eventBus";

const DEFAULT_WIDGETS = [
  { widgetType: "operations_summary", layoutZone: "top", orderIndex: 0 },
  { widgetType: "inbox", layoutZone: "left", orderIndex: 0 },
  { widgetType: "agenda", layoutZone: "left", orderIndex: 1 },
  { widgetType: "tasks", layoutZone: "center", orderIndex: 0 },
  { widgetType: "objectives", layoutZone: "center", orderIndex: 1 },
  { widgetType: "live_activity", layoutZone: "right", orderIndex: 0 },
  { widgetType: "wallet_summary", layoutZone: "right", orderIndex: 1 },
  { widgetType: "agent_activity", layoutZone: "right", orderIndex: 2 },
  { widgetType: "knowledge", layoutZone: "bottom", orderIndex: 0 },
  { widgetType: "marketplace", layoutZone: "bottom", orderIndex: 1 },
] as const;

function slugify(input: string) {
  const normalized = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "organization";
}

function buildPlatformBaseUrl(domains: string[] | null | undefined) {
  const host = Array.isArray(domains) ? String(domains[0] || "").trim() : "";
  return host ? `https://${host}` : null;
}

export async function seedMindbasePlatformCatalog(tenantId: number) {
  const rows = await db.query.tenants.findMany({
    orderBy: [asc(tenants.id)],
  });

  for (const row of rows) {
    if (String(row.key || "") === "mindbase") continue;
    await db
      .insert(mindbaseTenantPlatforms)
      .values({
        tenantId,
        platformTenantId: Number(row.id),
        slug: String(row.key || `tenant-${row.id}`),
        name: String(row.name || row.key || `Tenant ${row.id}`),
        baseUrl: buildPlatformBaseUrl((row as any).domains),
        status: "active",
        metadata: {
          domains: Array.isArray((row as any).domains) ? (row as any).domains : [],
          featureFlags: row.featureFlags || {},
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [mindbaseTenantPlatforms.tenantId, mindbaseTenantPlatforms.platformTenantId],
        set: {
          slug: String(row.key || `tenant-${row.id}`),
          name: String(row.name || row.key || `Tenant ${row.id}`),
          baseUrl: buildPlatformBaseUrl((row as any).domains),
          status: "active",
          metadata: {
            domains: Array.isArray((row as any).domains) ? (row as any).domains : [],
            featureFlags: row.featureFlags || {},
          },
          updatedAt: new Date(),
        },
      });
  }
}

function pickDefaultPlatform(rows: Array<any>) {
  if (!rows.length) return null;
  return rows.find((row) => String(row.slug || "") === "bdo") || rows[0];
}

async function ensureOrganizationWidgets(tenantId: number, organizationId: string) {
  const existing = await db.query.mindbaseOrgWidgets.findMany({
    where: and(eq(mindbaseOrgWidgets.tenantId, tenantId), eq(mindbaseOrgWidgets.organizationId, organizationId)),
    columns: { id: true },
    limit: 1,
  });
  if (existing.length) return;

  await db.insert(mindbaseOrgWidgets).values(
    DEFAULT_WIDGETS.map((item) => ({
      tenantId,
      organizationId,
      widgetType: item.widgetType,
      layoutZone: item.layoutZone,
      orderIndex: item.orderIndex,
      configJson: {},
      widgetPermissions: [],
      visibility: "visible" as const,
      widgetState: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
}

async function ensureOrganizationWallet(tenantId: number, organizationId: string) {
  const existing = await db.query.mindbaseOrgWallets.findFirst({
    where: and(eq(mindbaseOrgWallets.tenantId, tenantId), eq(mindbaseOrgWallets.organizationId, organizationId)),
  });
  if (existing) return existing;
  const [wallet] = await db
    .insert(mindbaseOrgWallets)
    .values({
      tenantId,
      organizationId,
      balance: "0",
      currency: "USD",
      status: "active",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return wallet;
}

async function ensurePrimaryPlatformLink(tenantId: number, organizationId: string) {
  const existing = await db.query.mindbaseOrganizationPlatforms.findFirst({
    where: and(
      eq(mindbaseOrganizationPlatforms.tenantId, tenantId),
      eq(mindbaseOrganizationPlatforms.organizationId, organizationId),
      eq(mindbaseOrganizationPlatforms.isPrimary, true),
    ),
  });
  if (existing) return existing;

  const platforms = await db.query.mindbaseTenantPlatforms.findMany({
    where: eq(mindbaseTenantPlatforms.tenantId, tenantId),
    orderBy: [asc(mindbaseTenantPlatforms.slug)],
  });
  const candidate = pickDefaultPlatform(platforms);
  if (!candidate) return null;

  const [link] = await db
    .insert(mindbaseOrganizationPlatforms)
    .values({
      tenantId,
      organizationId,
      tenantPlatformId: candidate.id,
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [mindbaseOrganizationPlatforms.organizationId, mindbaseOrganizationPlatforms.tenantPlatformId],
      set: {
        isPrimary: true,
        updatedAt: new Date(),
      },
    })
    .returning();
  return link;
}

async function ensureDefaultWorkspace(tenantId: number, userId: number, organizationId: string, organizationName: string) {
  const organization = await db.query.mindbaseOrganizations.findFirst({
    where: and(eq(mindbaseOrganizations.tenantId, tenantId), eq(mindbaseOrganizations.id, organizationId)),
  });
  if (organization?.defaultWorkspaceId) return organization.defaultWorkspaceId;

  const [workspace] = await db
    .insert(mindbaseWorkspaces)
    .values({
      tenantId,
      ownerUserId: userId,
      name: `${organizationName} HQ`,
      description: "Draft command center workspace for the MindBase guide and AI team.",
      status: "draft",
      companyBrainProgress: 18,
      personaReadiness: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await db.insert(mindbaseWorkspaceMembers).values({
    tenantId,
    workspaceId: workspace.id,
    userId,
    role: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db
    .update(mindbaseOrganizations)
    .set({ defaultWorkspaceId: workspace.id, updatedAt: new Date() })
    .where(eq(mindbaseOrganizations.id, organizationId));

  return workspace.id;
}

export async function bootstrapMindbaseOrganizationForUser(input: {
  tenantId: number;
  user: { id: number; displayName?: string | null; email?: string | null };
  name?: string | null;
}) {
  await seedMindbasePlatformCatalog(input.tenantId);

  const existingMembership = await db.query.mindbaseOrganizationUsers.findFirst({
    where: and(
      eq(mindbaseOrganizationUsers.tenantId, input.tenantId),
      eq(mindbaseOrganizationUsers.userId, input.user.id),
      inArray(mindbaseOrganizationUsers.role, ["owner", "admin", "manager", "member", "agent"]),
    ),
    orderBy: [desc(mindbaseOrganizationUsers.updatedAt)],
  });

  if (existingMembership) {
    const existingOrg = await db.query.mindbaseOrganizations.findFirst({
      where: and(
        eq(mindbaseOrganizations.tenantId, input.tenantId),
        eq(mindbaseOrganizations.id, existingMembership.organizationId),
      ),
    });
    if (existingOrg) {
      await ensureDefaultWorkspace(input.tenantId, input.user.id, existingOrg.id, existingOrg.name);
      await ensureOrganizationWidgets(input.tenantId, existingOrg.id);
      await ensureOrganizationWallet(input.tenantId, existingOrg.id);
      await ensurePrimaryPlatformLink(input.tenantId, existingOrg.id);
      return existingOrg;
    }
  }

  const baseName =
    String(input.name || "").trim() ||
    (String(input.user.displayName || "").trim() ? `${String(input.user.displayName).trim()} HQ` : "My Organization");
  const baseSlug = slugify(baseName);
  let slug = baseSlug;
  let step = 1;
  while (true) {
    const conflict = await db.query.mindbaseOrganizations.findFirst({
      where: and(eq(mindbaseOrganizations.tenantId, input.tenantId), eq(mindbaseOrganizations.slug, slug)),
      columns: { id: true },
    });
    if (!conflict) break;
    step += 1;
    slug = `${baseSlug}-${step}`;
  }

  const [organization] = await db
    .insert(mindbaseOrganizations)
    .values({
      tenantId: input.tenantId,
      ownerUserId: input.user.id,
      name: baseName,
      slug,
      status: "draft",
      plan: "starter",
      chairmanAssistantName: "Chairman Assistant",
      metadata: {
        ownerEmail: String(input.user.email || "").trim() || null,
        chairmanAssistant: {
          name: "Chairman Assistant",
          role: "system_orchestrator",
          alwaysPresent: true,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await db.insert(mindbaseOrganizationUsers).values({
    tenantId: input.tenantId,
    organizationId: organization.id,
    userId: input.user.id,
    role: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await ensureDefaultWorkspace(input.tenantId, input.user.id, organization.id, organization.name);
  await ensureOrganizationWidgets(input.tenantId, organization.id);
  await ensureOrganizationWallet(input.tenantId, organization.id);
  await ensurePrimaryPlatformLink(input.tenantId, organization.id);
  await emitMindbaseEvent({
    tenantId: input.tenantId,
    organizationId: organization.id,
    actorUserId: input.user.id,
    eventType: "organization.created",
    payload: { name: organization.name, slug: organization.slug },
  });
  await recordMindbaseBrainEvent({
    tenantId: input.tenantId,
    organizationId: organization.id,
    eventType: "organization.created",
    entityType: "organization",
    entityId: organization.id,
    payload: { name: organization.name, slug: organization.slug },
  });

  return organization;
}

export async function listMindbaseOrganizationsForUser(tenantId: number, userId: number) {
  const memberships = await db.query.mindbaseOrganizationUsers.findMany({
    where: and(eq(mindbaseOrganizationUsers.tenantId, tenantId), eq(mindbaseOrganizationUsers.userId, userId)),
    orderBy: [desc(mindbaseOrganizationUsers.updatedAt)],
  });
  if (!memberships.length) return [];
  const organizations = await db.query.mindbaseOrganizations.findMany({
    where: and(
      eq(mindbaseOrganizations.tenantId, tenantId),
      inArray(
        mindbaseOrganizations.id,
        memberships.map((membership) => membership.organizationId) as any,
      ),
    ),
    orderBy: [desc(mindbaseOrganizations.updatedAt)],
  });
  const roles = new Map(memberships.map((membership) => [String(membership.organizationId), String(membership.role)]));
  return organizations.map((organization) => ({
    ...organization,
    membershipRole: roles.get(String(organization.id)) || "member",
  }));
}

export async function getMindbaseOrganizationForUser(input: { tenantId: number; userId: number; slug: string }) {
  const membership = await db.query.mindbaseOrganizationUsers.findFirst({
    where: and(eq(mindbaseOrganizationUsers.tenantId, input.tenantId), eq(mindbaseOrganizationUsers.userId, input.userId)),
    orderBy: [desc(mindbaseOrganizationUsers.updatedAt)],
  });

  const organization = await db.query.mindbaseOrganizations.findFirst({
    where: and(eq(mindbaseOrganizations.tenantId, input.tenantId), eq(mindbaseOrganizations.slug, input.slug)),
  });
  if (!organization) return null;

  const allowed = await db.query.mindbaseOrganizationUsers.findFirst({
    where: and(
      eq(mindbaseOrganizationUsers.tenantId, input.tenantId),
      eq(mindbaseOrganizationUsers.organizationId, organization.id),
      eq(mindbaseOrganizationUsers.userId, input.userId),
    ),
  });
  if (!allowed && membership) return null;
  if (!allowed && !membership) return null;

  await ensureDefaultWorkspace(input.tenantId, input.userId, organization.id, organization.name);
  await ensureOrganizationWidgets(input.tenantId, organization.id);
  await ensureOrganizationWallet(input.tenantId, organization.id);
  await ensurePrimaryPlatformLink(input.tenantId, organization.id);

  const [platformLinks, wallet, widgets] = await Promise.all([
    db.query.mindbaseOrganizationPlatforms.findMany({
      where: and(eq(mindbaseOrganizationPlatforms.tenantId, input.tenantId), eq(mindbaseOrganizationPlatforms.organizationId, organization.id)),
      orderBy: [desc(mindbaseOrganizationPlatforms.isPrimary), desc(mindbaseOrganizationPlatforms.updatedAt)],
    }),
    db.query.mindbaseOrgWallets.findFirst({
      where: and(eq(mindbaseOrgWallets.tenantId, input.tenantId), eq(mindbaseOrgWallets.organizationId, organization.id)),
    }),
    db.query.mindbaseOrgWidgets.findMany({
      where: and(eq(mindbaseOrgWidgets.tenantId, input.tenantId), eq(mindbaseOrgWidgets.organizationId, organization.id)),
      orderBy: [asc(mindbaseOrgWidgets.layoutZone), asc(mindbaseOrgWidgets.orderIndex)],
    }),
  ]);

  const platformRows = platformLinks.length
    ? await db.query.mindbaseTenantPlatforms.findMany({
        where: and(
          eq(mindbaseTenantPlatforms.tenantId, input.tenantId),
          inArray(
            mindbaseTenantPlatforms.id,
            platformLinks.map((link) => link.tenantPlatformId) as any,
          ),
        ),
      })
    : [];
  const platformsById = new Map(platformRows.map((item) => [String(item.id), item]));

  return {
    organization,
    wallet,
    widgets,
    platforms: platformLinks.map((link) => ({
      ...link,
      platform: platformsById.get(String(link.tenantPlatformId)) || null,
    })),
  };
}

export async function createMindbaseOrganization(input: {
  tenantId: number;
  user: { id: number; displayName?: string | null; email?: string | null };
  name: string;
}) {
  return bootstrapMindbaseOrganizationForUser({
    tenantId: input.tenantId,
    user: input.user,
    name: input.name,
  });
}

export async function listMindbasePlatformOptions(tenantId: number) {
  await seedMindbasePlatformCatalog(tenantId);
  return db.query.mindbaseTenantPlatforms.findMany({
    where: eq(mindbaseTenantPlatforms.tenantId, tenantId),
    orderBy: [asc(mindbaseTenantPlatforms.slug)],
  });
}

export async function connectMindbaseOrganizationPlatform(input: {
  tenantId: number;
  organizationId: string;
  tenantPlatformId: string;
  isPrimary?: boolean;
}) {
  if (input.isPrimary) {
    await db
      .update(mindbaseOrganizationPlatforms)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(
          eq(mindbaseOrganizationPlatforms.tenantId, input.tenantId),
          eq(mindbaseOrganizationPlatforms.organizationId, input.organizationId),
        ),
      );
  }

  const [row] = await db
    .insert(mindbaseOrganizationPlatforms)
    .values({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      tenantPlatformId: input.tenantPlatformId,
      isPrimary: Boolean(input.isPrimary),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [mindbaseOrganizationPlatforms.organizationId, mindbaseOrganizationPlatforms.tenantPlatformId],
      set: {
        isPrimary: Boolean(input.isPrimary),
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function listMindbaseWidgetCatalog() {
  return db.query.mindbaseWidgetRegistry.findMany({
    orderBy: [asc(mindbaseWidgetRegistry.type)],
  });
}
