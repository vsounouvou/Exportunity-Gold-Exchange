import { and, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialFactories,
  industrialFactoryLeads,
} from "@db/schema";

import {
  canConvertIndustrialFactoryLead,
  factoryLeadDeduplicationLabel,
  type IndustrialFactoryLeadCandidate,
  type IndustrialFactoryLeadStatus,
} from "./factoryLeadIntake";

export type IndustrialFactoryLeadFilters = {
  query?: string | null;
  city?: string | null;
  countryCode?: string | null;
  industry?: string | null;
  leadStatus?: IndustrialFactoryLeadStatus | null;
  limit?: number;
};

export type IndustrialFactoryLeadReview = {
  leadStatus: Exclude<IndustrialFactoryLeadStatus, "converted">;
  screeningNotes?: string | null;
};

export type IndustrialFactoryLeadConversion = {
  legalName?: string | null;
  displayName?: string | null;
  primaryIndustry: string;
  countryCode: string;
  city?: string | null;
  region?: string | null;
  industrialZone?: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function decimal(value: number | null) {
  return value === null || value === undefined ? null : String(value);
}

function safeLimit(value: number | undefined, fallback = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function leadSourceLabel(source: IndustrialFactoryLeadCandidate["source"]) {
  if (source === "official_registry") return "Official registry";
  if (source === "industry_directory") return "Industry directory";
  return "Google Places";
}

export function normalizeIndustrialFactoryLeadFilters(
  filters: IndustrialFactoryLeadFilters = {},
) {
  return {
    query: String(filters.query || "").trim(),
    city: String(filters.city || "").trim(),
    countryCode: String(filters.countryCode || "")
      .trim()
      .toUpperCase(),
    industry: String(filters.industry || "").trim(),
  };
}

export function industrialFactoryLeadSummary(row: any) {
  const metadata = record(row.metadata);
  return {
    id: row.id,
    source: row.source,
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    primaryIndustry: row.primaryIndustry,
    googleTypes: Array.isArray(row.googleTypes) ? row.googleTypes : [],
    address: row.address,
    city: row.city,
    countryCode: row.countryCode,
    latitude:
      row.latitude === null || row.latitude === undefined
        ? null
        : Number(row.latitude),
    longitude:
      row.longitude === null || row.longitude === undefined
        ? null
        : Number(row.longitude),
    phone: row.phone,
    website: row.website,
    googleMapsUrl: row.googleMapsUrl,
    rating:
      row.rating === null || row.rating === undefined
        ? null
        : Number(row.rating),
    reviewCount: row.reviewCount,
    businessStatus: row.businessStatus,
    leadStatus: row.leadStatus,
    qualificationScore: Number(row.qualificationScore || 0),
    screeningNotes: row.screeningNotes,
    contactStatus: row.contactStatus,
    publicListing: Boolean(metadata.publicListing),
    verificationRequired: Boolean(metadata.verificationRequired),
    sourceProspectId: metadata.sourceProspectId || null,
    sourceName: metadata.sourceName || null,
    sourceTitle: metadata.sourceTitle || null,
    sourceUrl: metadata.sourceUrl || null,
    sourceCheckedAt: metadata.sourceCheckedAt || null,
    sourceStatus: metadata.sourceStatus || null,
    evidenceSummary: metadata.evidenceSummary || null,
    roles: Array.isArray(metadata.roles) ? metadata.roles : [],
    publicEmail: metadata.publicEmail || null,
    approvedInvestmentFcfa: metadata.approvedInvestmentFcfa || null,
    opportunityHypotheses: Array.isArray(metadata.opportunityHypotheses)
      ? metadata.opportunityHypotheses
      : [],
    outreachAllowed: metadata.outreachAllowed === true,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    convertedFactoryId: row.convertedFactoryId,
    lastEnrichedAt: row.lastEnrichedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listIndustrialFactoryLeads(
  tenantId: number,
  filters: IndustrialFactoryLeadFilters = {},
) {
  const { query, city, countryCode, industry } =
    normalizeIndustrialFactoryLeadFilters(filters);
  const like = `%${query}%`;
  const rows = await db
    .select()
    .from(industrialFactoryLeads)
    .where(
      and(
        eq(industrialFactoryLeads.tenantId, tenantId),
        filters.leadStatus
          ? eq(industrialFactoryLeads.leadStatus, filters.leadStatus)
          : undefined,
        city ? ilike(industrialFactoryLeads.city, `%${city}%`) : undefined,
        countryCode
          ? eq(industrialFactoryLeads.countryCode, countryCode)
          : undefined,
        industry
          ? ilike(industrialFactoryLeads.primaryIndustry, `%${industry}%`)
          : undefined,
        query
          ? or(
              ilike(industrialFactoryLeads.name, like),
              ilike(industrialFactoryLeads.primaryIndustry, like),
              ilike(industrialFactoryLeads.city, like),
              ilike(industrialFactoryLeads.address, like),
            )
          : undefined,
      ),
    )
    .orderBy(
      desc(industrialFactoryLeads.qualificationScore),
      desc(industrialFactoryLeads.updatedAt),
    )
    .limit(safeLimit(filters.limit));

  return rows.map(industrialFactoryLeadSummary);
}

async function findDuplicateLead(
  tx: any,
  tenantId: number,
  candidate: IndustrialFactoryLeadCandidate,
) {
  if (candidate.googlePlaceId) {
    const byGooglePlace = await tx.query.industrialFactoryLeads.findFirst({
      where: and(
        eq(industrialFactoryLeads.tenantId, tenantId),
        eq(industrialFactoryLeads.googlePlaceId, candidate.googlePlaceId),
      ),
    });
    if (byGooglePlace) return byGooglePlace;
  }

  return tx.query.industrialFactoryLeads.findFirst({
    where: and(
      eq(industrialFactoryLeads.tenantId, tenantId),
      eq(industrialFactoryLeads.normalizedName, candidate.normalizedName),
      candidate.city
        ? eq(industrialFactoryLeads.city, candidate.city)
        : undefined,
    ),
  });
}

export async function importIndustrialFactoryLeads(input: {
  tenantId: number;
  actorUserId: number | null;
  candidates: IndustrialFactoryLeadCandidate[];
  query: string;
  city?: string | null;
  countryCode?: string | null;
}) {
  const seen = new Set<string>();
  const candidates = input.candidates.filter((candidate) => {
    const key = factoryLeadDeduplicationLabel(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = await db.transaction(async (tx) => {
    const imported: any[] = [];
    let created = 0;
    let refreshed = 0;

    for (const candidate of candidates) {
      const existing = await findDuplicateLead(tx, input.tenantId, candidate);
      const now = new Date();
      const intakeMetadata = {
        ...candidate.metadata,
        lastImportedAt: now.toISOString(),
        lastImportQuery: input.query,
        lastImportCity: input.city || null,
        lastImportCountryCode: input.countryCode || null,
      };
      const sourceLabel = leadSourceLabel(candidate.source);

      if (existing) {
        const [updated] = await tx
          .update(industrialFactoryLeads)
          .set({
            source:
              existing.source === "manual" ? existing.source : candidate.source,
            googlePlaceId: candidate.googlePlaceId || existing.googlePlaceId,
            name: candidate.name,
            normalizedName: candidate.normalizedName,
            primaryIndustry:
              candidate.primaryIndustry || existing.primaryIndustry,
            googleTypes: candidate.googleTypes,
            address: candidate.address || existing.address,
            city: candidate.city || existing.city,
            countryCode: candidate.countryCode || existing.countryCode,
            latitude: decimal(candidate.latitude) || existing.latitude,
            longitude: decimal(candidate.longitude) || existing.longitude,
            phone: candidate.phone || existing.phone,
            website: candidate.website || existing.website,
            googleMapsUrl: candidate.googleMapsUrl || existing.googleMapsUrl,
            rating: decimal(candidate.rating),
            reviewCount: candidate.reviewCount,
            businessStatus: candidate.businessStatus || existing.businessStatus,
            openingHours: candidate.openingHours,
            qualificationScore: Math.max(
              Number(existing.qualificationScore || 0),
              candidate.qualificationScore,
            ),
            lastEnrichedAt: now,
            metadata: { ...record(existing.metadata), ...intakeMetadata },
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialFactoryLeads.id, existing.id),
              eq(industrialFactoryLeads.tenantId, input.tenantId),
            ),
          )
          .returning();
        refreshed += 1;
        imported.push(updated);

        await tx.insert(industrialAuditLogs).values({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: "industrial_factory_lead.refreshed",
          entityType: "industrial_factory_lead",
          entityId: existing.id,
          reason: `${sourceLabel} lead intake refresh`,
          previousValue: {
            leadStatus: existing.leadStatus,
            qualificationScore: Number(existing.qualificationScore || 0),
          },
          nextValue: {
            leadStatus: updated.leadStatus,
            qualificationScore: Number(updated.qualificationScore || 0),
          },
          metadata: {
            source: candidate.source,
            googlePlaceId: candidate.googlePlaceId,
            publicListing: candidate.metadata.publicListing === true,
            verificationRequired:
              candidate.metadata.verificationRequired !== false,
          },
        });
        continue;
      }

      const [createdLead] = await tx
        .insert(industrialFactoryLeads)
        .values({
          tenantId: input.tenantId,
          source: candidate.source,
          googlePlaceId: candidate.googlePlaceId,
          name: candidate.name,
          normalizedName: candidate.normalizedName,
          primaryIndustry: candidate.primaryIndustry,
          googleTypes: candidate.googleTypes,
          address: candidate.address,
          city: candidate.city,
          countryCode: candidate.countryCode,
          latitude: decimal(candidate.latitude),
          longitude: decimal(candidate.longitude),
          phone: candidate.phone,
          website: candidate.website,
          googleMapsUrl: candidate.googleMapsUrl,
          rating: decimal(candidate.rating),
          reviewCount: candidate.reviewCount,
          businessStatus: candidate.businessStatus,
          openingHours: candidate.openingHours,
          leadStatus: "new",
          qualificationScore: candidate.qualificationScore,
          contactStatus: "not_contacted",
          lastEnrichedAt: now,
          metadata: intakeMetadata,
          updatedAt: now,
        })
        .returning();
      created += 1;
      imported.push(createdLead);

      await tx.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_factory_lead.imported",
        entityType: "industrial_factory_lead",
        entityId: createdLead.id,
        reason: `${sourceLabel} lead intake`,
        nextValue: {
          leadStatus: createdLead.leadStatus,
          qualificationScore: Number(createdLead.qualificationScore || 0),
        },
        metadata: {
          source: candidate.source,
          googlePlaceId: candidate.googlePlaceId,
          publicListing: candidate.metadata.publicListing === true,
          verificationRequired: candidate.metadata.verificationRequired !== false,
        },
      });
    }

    return {
      created,
      refreshed,
      leads: imported.map(industrialFactoryLeadSummary),
    };
  });

  return result;
}

export async function reviewIndustrialFactoryLead(input: {
  tenantId: number;
  leadId: string;
  actorUserId: number | null;
  review: IndustrialFactoryLeadReview;
}) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.industrialFactoryLeads.findFirst({
      where: and(
        eq(industrialFactoryLeads.id, input.leadId),
        eq(industrialFactoryLeads.tenantId, input.tenantId),
      ),
    });
    if (!existing) return null;
    if (existing.leadStatus === "converted") {
      throw new Error("lead_converted");
    }

    const now = new Date();
    const [updated] = await tx
      .update(industrialFactoryLeads)
      .set({
        leadStatus: input.review.leadStatus,
        screeningNotes: input.review.screeningNotes || null,
        reviewedByUserId: input.actorUserId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialFactoryLeads.id, existing.id),
          eq(industrialFactoryLeads.tenantId, input.tenantId),
        ),
      )
      .returning();

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "industrial_factory_lead.reviewed",
      entityType: "industrial_factory_lead",
      entityId: existing.id,
      reason: input.review.screeningNotes || null,
      previousValue: { leadStatus: existing.leadStatus },
      nextValue: { leadStatus: updated.leadStatus },
      metadata: {
        source: existing.source,
        publicListing: true,
        verificationRequired: true,
        publicProfileCreated: false,
      },
    });

    return industrialFactoryLeadSummary(updated);
  });
}

export async function convertIndustrialFactoryLead(input: {
  tenantId: number;
  leadId: string;
  actorUserId: number | null;
  conversion: IndustrialFactoryLeadConversion;
}) {
  return db.transaction(async (tx) => {
    const lead = await tx.query.industrialFactoryLeads.findFirst({
      where: and(
        eq(industrialFactoryLeads.id, input.leadId),
        eq(industrialFactoryLeads.tenantId, input.tenantId),
      ),
    });
    if (!lead) throw new Error("lead_not_found");
    if (lead.convertedFactoryId || lead.leadStatus === "converted") {
      throw new Error("lead_converted");
    }
    if (!canConvertIndustrialFactoryLead(lead.leadStatus)) {
      throw new Error("lead_not_qualified");
    }

    const existingFactory = await tx.query.industrialFactories.findFirst({
      where: and(
        eq(industrialFactories.tenantId, input.tenantId),
        eq(industrialFactories.normalizedName, lead.normalizedName),
      ),
    });
    if (existingFactory) throw new Error("factory_already_exists");

    const now = new Date();
    const legalName = String(input.conversion.legalName || lead.name).trim();
    const displayName = String(
      input.conversion.displayName || lead.name,
    ).trim();
    const primaryIndustry = String(
      input.conversion.primaryIndustry || "",
    ).trim();
    const countryCode = String(input.conversion.countryCode || "")
      .trim()
      .toUpperCase();
    if (!legalName || !displayName || !primaryIndustry || !countryCode) {
      throw new Error("factory_profile_missing_data");
    }

    const [factory] = await tx
      .insert(industrialFactories)
      .values({
        tenantId: input.tenantId,
        legalName,
        displayName,
        normalizedName: lead.normalizedName,
        factoryStatus: "under_review",
        verificationStatus: "under_review",
        publicVisibility: "exportunity_internal",
        countryCode,
        region: input.conversion.region || null,
        city: input.conversion.city || lead.city || null,
        industrialZone: input.conversion.industrialZone || null,
        publicAddress: lead.address,
        latitude: lead.latitude,
        longitude: lead.longitude,
        primaryIndustry,
        industries: Array.isArray(lead.googleTypes) ? lead.googleTypes : [],
        privateProfile: {
          discoveryLead: {
            leadId: lead.id,
            source: lead.source,
            googlePlaceId: lead.googlePlaceId,
            importedAt: lead.createdAt?.toISOString?.() || null,
            phone: lead.phone,
            website: lead.website,
            googleMapsUrl: lead.googleMapsUrl,
            qualificationScore: Number(lead.qualificationScore || 0),
            verificationRequired: true,
          },
        },
        updatedAt: now,
      })
      .returning();

    const [updatedLead] = await tx
      .update(industrialFactoryLeads)
      .set({
        leadStatus: "converted",
        convertedFactoryId: factory.id,
        reviewedByUserId: input.actorUserId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialFactoryLeads.id, lead.id),
          eq(industrialFactoryLeads.tenantId, input.tenantId),
        ),
      )
      .returning();

    await tx.insert(industrialAuditLogs).values([
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_factory_lead.converted",
        entityType: "industrial_factory_lead",
        entityId: lead.id,
        reason:
          "Qualified lead converted into an internal factory verification dossier",
        previousValue: { leadStatus: lead.leadStatus },
        nextValue: {
          leadStatus: updatedLead.leadStatus,
          factoryId: factory.id,
        },
        metadata: {
          publicProfileCreated: false,
          verificationRequired: true,
          source: lead.source,
        },
      },
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "industrial_factory.created_from_private_lead",
        entityType: "industrial_factory",
        entityId: factory.id,
        reason: "Internal verification dossier created from a qualified lead",
        nextValue: {
          factoryStatus: factory.factoryStatus,
          verificationStatus: factory.verificationStatus,
          publicVisibility: factory.publicVisibility,
        },
        metadata: {
          leadId: lead.id,
          publicProfileCreated: false,
        },
      },
    ]);

    return {
      lead: industrialFactoryLeadSummary(updatedLead),
      factory: {
        id: factory.id,
        displayName: factory.displayName,
        factoryStatus: factory.factoryStatus,
        verificationStatus: factory.verificationStatus,
        publicVisibility: factory.publicVisibility,
      },
    };
  });
}
