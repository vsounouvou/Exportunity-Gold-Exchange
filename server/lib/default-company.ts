import { db } from "@db";
import { agents, companies, departments } from "@db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";

const DEFAULT_COMPANY_NAME = "Exportunity Gold Exchange";

type EnsureDefaultCompanyInput = {
  tenantId?: number | null;
  tenantKey?: string | null;
  tenantName?: string | null;
  attachUnassignedAgents?: boolean;
};

type TenantCompanyPreset = {
  name: string;
  description: string;
  primarySector:
    | "trade_export"
    | "gold_metals"
    | "education"
    | "logistics"
    | "construction"
    | "architecture"
    | "technology"
    | "retail"
    | "media"
    | "agriculture"
    | "real_estate"
    | "other";
  country: string;
};

const TENANT_COMPANY_PRESETS: Record<string, TenantCompanyPreset> = {
  bdo: {
    name: "Bourse de l'Or",
    description: "Bourse de l'Or",
    primarySector: "gold_metals",
    country: "CI",
  },
  exportunity: {
    name: "Exportunity",
    description: "Exportunity",
    primarySector: "trade_export",
    country: "BJ",
  },
  zone: {
    name: "Exportunity Zone",
    description: "Exportunity Zone",
    primarySector: "trade_export",
    country: "BJ",
  },
  mindbase: {
    name: "MindBase",
    description: "MindBase",
    primarySector: "technology",
    country: "US",
  },
  met: {
    name: "Maison en Terre",
    description: "Maison en Terre",
    primarySector: "construction",
    country: "BJ",
  },
  vs: {
    name: "Vital Sounouvou",
    description: "Vital Sounouvou",
    primarySector: "media",
    country: "BJ",
  },
  hoz: {
    name: "House of Zogue",
    description: "House of Zogue",
    primarySector: "media",
    country: "BJ",
  },
};

function normalizeCompanyName(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function toTenantId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function resolvePreset(input: EnsureDefaultCompanyInput): TenantCompanyPreset {
  const tenantKey = String(input.tenantKey || "").trim().toLowerCase();
  const byKey = tenantKey ? TENANT_COMPANY_PRESETS[tenantKey] : null;
  if (byKey) return byKey;

  const tenantName = String(input.tenantName || "").trim();
  if (tenantName) {
    return {
      name: tenantName,
      description: tenantName,
      primarySector: "technology",
      country: "US",
    };
  }

  return {
    name: DEFAULT_COMPANY_NAME,
    description: "Exportunity Gold Exchange",
    primarySector: "gold_metals",
    country: "CI",
  };
}

export async function ensureDefaultCompany(input: EnsureDefaultCompanyInput = {}) {
  const tenantId = toTenantId(input.tenantId);
  const preset = resolvePreset(input);
  const target = normalizeCompanyName(preset.name);

  const existing = await db.query.companies.findMany({
    where: tenantId ? eq(companies.tenantId, tenantId) : undefined,
    columns: { id: true, name: true },
    orderBy: [desc(companies.createdAt)],
    limit: 100,
  });

  const match = existing.find((c) => normalizeCompanyName(c.name) === target);

  let companyId: number | null = match?.id ?? (existing[0]?.id ?? null);

  // Adopt a legacy unscoped company with matching name before creating a new one.
  if (!companyId && tenantId) {
    const legacy = await db.query.companies.findMany({
      where: isNull(companies.tenantId),
      columns: { id: true, name: true, metadata: true },
      orderBy: [desc(companies.createdAt)],
      limit: 200,
    });
    const legacyMatch = legacy.find((c) => normalizeCompanyName(c.name) === target);
    if (legacyMatch) {
      const mergedMetadata = {
        ...(legacyMatch.metadata && typeof legacyMatch.metadata === "object" ? legacyMatch.metadata : {}),
        systemDefault: true,
        tenantKey: String(input.tenantKey || "").trim().toLowerCase() || undefined,
      };
      const [adopted] = await db
        .update(companies)
        .set({
          tenantId,
          metadata: mergedMetadata,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, legacyMatch.id))
        .returning({ id: companies.id });
      companyId = adopted?.id ?? null;
    }
  }

  if (!companyId) {
    const metadata: Record<string, unknown> = {
      systemDefault: true,
    };
    const tenantKey = String(input.tenantKey || "").trim().toLowerCase();
    if (tenantKey) metadata.tenantKey = tenantKey;

    const [created] = await db
      .insert(companies)
      .values({
        tenantId,
        name: preset.name,
        description: preset.description,
        primarySector: preset.primarySector,
        country: preset.country,
        status: "active",
        metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: companies.id });
    companyId = created!.id;
  }
  const ensuredCompanyId = Number(companyId);

  const anyDept = await db.query.departments.findFirst({
    where: eq(departments.companyId, ensuredCompanyId),
    columns: { id: true },
  });

  if (!anyDept) {
    const defaultDepartments = [
      { name: "Executive", description: "Company leadership and strategy", color: "#8B5CF6", order: 0 },
      { name: "Sales", description: "Revenue generation and client acquisition", color: "#10B981", order: 1 },
      { name: "Marketing", description: "Brand and demand generation", color: "#F59E0B", order: 2 },
      { name: "Finance", description: "Financial management and operations", color: "#3B82F6", order: 3 },
      { name: "Operations", description: "Business operations and processes", color: "#6B7280", order: 4 },
      { name: "Legal", description: "Legal and compliance", color: "#EF4444", order: 5 },
      { name: "IT", description: "Engineering, systems, and software delivery", color: "#14B8A6", order: 6 },
    ];

    await db.insert(departments).values(
      defaultDepartments.map((dept) => ({
        companyId: ensuredCompanyId,
        ...dept,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
  }

  // Ensure IT exists even on older DBs with only the original 6 departments.
  const itDept = await db.query.departments.findFirst({
    where: and(eq(departments.companyId, ensuredCompanyId), eq(departments.name, "IT")),
    columns: { id: true },
  });
  if (!itDept) {
    await db.insert(departments).values({
      companyId: ensuredCompanyId,
      name: "IT",
      description: "Engineering, systems, and software delivery",
      color: "#14B8A6",
      order: 6,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Optionally attach unassigned agents to the tenant's default company.
  if (input.attachUnassignedAgents) {
    if (tenantId) {
      await db
        .update(agents)
        .set({ companyId: ensuredCompanyId, tenantId })
        .where(and(isNull(agents.companyId), or(eq(agents.tenantId, tenantId), isNull(agents.tenantId))));
    } else {
      await db.update(agents).set({ companyId: ensuredCompanyId }).where(isNull(agents.companyId));
    }
  }

  return ensuredCompanyId;
}
