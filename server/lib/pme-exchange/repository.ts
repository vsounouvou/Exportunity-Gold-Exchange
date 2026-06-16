import { db } from "@db";
import { sql } from "drizzle-orm";

import { normalizeE164, sendTemplateWhatsApp, TenantMessageError } from "../communications/twilio";
import { filterSeedPmeLeads, getSeedPmeLeads } from "./seed";

export type PmeLeadInput = {
  id?: string;
  source?: "google_places" | "manual" | "import" | "facebook" | "referral" | "seeded";
  name?: string;
  normalizedName?: string;
  description?: string;
  category?: string;
  primaryType?: string;
  types?: string[];
  address?: string | null;
  city?: string | null;
  country?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  businessStatus?: string | null;
  openingHours?: Record<string, unknown>;
  verificationStatus?: string | null;
  kind?: "marketplace" | "wholesale" | string;
  moq?: string | null;
  leadTime?: string | null;
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  whatsappPhone?: string | null;
  leadStatus?: string;
  qualificationScore?: number;
  investmentPotentialScore?: number;
  revenueVisibilityScore?: number;
  contactStatus?: string | null;
  metadata?: Record<string, unknown>;
};

let ensurePromise: Promise<void> | null = null;

function rows<T = any>(result: unknown): T[] {
  const value: any = result;
  if (Array.isArray(value?.rows)) return value.rows as T[];
  if (Array.isArray(value)) return value as T[];
  return [];
}

export function normalizePmeName(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function ensurePmeExchangeSchema() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_lead_source') THEN
          CREATE TYPE pme_lead_source AS ENUM ('google_places', 'manual', 'import', 'facebook', 'referral', 'seeded');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_lead_status') THEN
          CREATE TYPE pme_lead_status AS ENUM ('new', 'enriched', 'qualified', 'contact_ready', 'contacted', 'replied', 'interested', 'not_interested', 'onboarded', 'rejected', 'suppressed');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_campaign_status') THEN
          CREATE TYPE pme_campaign_status AS ENUM ('draft', 'test', 'running', 'paused', 'completed');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_outreach_channel') THEN
          CREATE TYPE pme_outreach_channel AS ENUM ('whatsapp', 'sms', 'email', 'call');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_message_direction') THEN
          CREATE TYPE pme_message_direction AS ENUM ('in', 'out');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_investment_readiness') THEN
          CREATE TYPE pme_investment_readiness AS ENUM ('none', 'early', 'review_ready', 'approved', 'listed');
        END IF;
      END $$;
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pme_leads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source pme_lead_source NOT NULL DEFAULT 'manual',
        google_place_id text,
        name text NOT NULL,
        normalized_name text NOT NULL,
        description text,
        category text,
        primary_type text,
        types jsonb DEFAULT '[]'::jsonb,
        address text,
        city text,
        country text,
        latitude numeric(10,7),
        longitude numeric(10,7),
        phone text,
        whatsapp_phone text,
        website text,
        google_maps_url text,
        rating numeric(3,2),
        review_count integer,
        business_status text,
        opening_hours jsonb DEFAULT '{}'::jsonb,
        lead_status pme_lead_status NOT NULL DEFAULT 'new',
        qualification_score integer NOT NULL DEFAULT 0,
        investment_potential_score integer NOT NULL DEFAULT 0,
        revenue_visibility_score integer NOT NULL DEFAULT 0,
        contact_status text DEFAULT 'not_contacted',
        last_contacted_at timestamp,
        last_enriched_at timestamp,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pme_leads_tenant_google_place_unique
      ON pme_leads(tenant_id, google_place_id)
      WHERE google_place_id IS NOT NULL
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pme_leads_tenant_city_status_idx ON pme_leads(tenant_id, city, lead_status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pme_leads_tenant_score_idx ON pme_leads(tenant_id, qualification_score)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pme_leads_tenant_normalized_name_idx ON pme_leads(tenant_id, normalized_name)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pme_outreach_campaigns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        target_city text,
        target_categories jsonb DEFAULT '[]'::jsonb,
        message_template_id text,
        status pme_campaign_status NOT NULL DEFAULT 'draft',
        daily_limit integer NOT NULL DEFAULT 10,
        agent_id integer,
        created_by integer REFERENCES ece_users(id) ON DELETE SET NULL,
        requires_approval boolean NOT NULL DEFAULT true,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pme_campaigns_tenant_status_idx ON pme_outreach_campaigns(tenant_id, status)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pme_outreach_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id uuid REFERENCES pme_outreach_campaigns(id) ON DELETE CASCADE,
        pme_lead_id uuid NOT NULL REFERENCES pme_leads(id) ON DELETE CASCADE,
        channel pme_outreach_channel NOT NULL,
        direction pme_message_direction NOT NULL DEFAULT 'out',
        twilio_sid text,
        template_name text,
        message_body text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        error_code text,
        error_message text,
        sent_at timestamp,
        delivered_at timestamp,
        replied_at timestamp,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pme_outreach_messages_lead_created_idx ON pme_outreach_messages(pme_lead_id, created_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pme_outreach_messages_campaign_status_idx ON pme_outreach_messages(campaign_id, status)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pme_agent_conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pme_lead_id uuid NOT NULL REFERENCES pme_leads(id) ON DELETE CASCADE,
        agent_id integer,
        thread_id text,
        summary text,
        next_step text,
        sentiment text,
        qualification_result jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pme_agent_conversations_lead_idx ON pme_agent_conversations(pme_lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pme_agent_conversations_thread_idx ON pme_agent_conversations(thread_id)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pme_exchange_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pme_lead_id uuid NOT NULL REFERENCES pme_leads(id) ON DELETE CASCADE,
        company_name text NOT NULL,
        verified_status text NOT NULL DEFAULT 'unverified',
        onboarding_status text NOT NULL DEFAULT 'not_started',
        products_count integer NOT NULL DEFAULT 0,
        monthly_revenue_estimate numeric(14,2),
        verified_monthly_revenue numeric(14,2),
        financing_need numeric(14,2),
        royalty_possible boolean NOT NULL DEFAULT false,
        investment_readiness pme_investment_readiness NOT NULL DEFAULT 'none',
        documents jsonb DEFAULT '[]'::jsonb,
        risk_score integer NOT NULL DEFAULT 0,
        agent_notes text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS pme_exchange_profiles_lead_unique ON pme_exchange_profiles(pme_lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pme_exchange_profiles_readiness_idx ON pme_exchange_profiles(investment_readiness)`);
  })();
  return ensurePromise;
}

export function scoreLead(input: Partial<PmeLeadInput>) {
  const rating = num(input.rating, 0);
  const reviewCount = num(input.reviewCount, 0);
  const hasPhone = Boolean(input.phone || input.whatsappPhone);
  const hasWebsite = Boolean(input.website);
  const category = String(input.category || input.primaryType || "").toLowerCase();
  const supplier = /supplier|wholesale|distributor|manufacturer|warehouse|logistics|materials|machinery|packaging|agri/.test(category);
  const qualificationScore = Math.min(98, Math.round(38 + rating * 9 + Math.min(reviewCount, 200) / 5 + (hasPhone ? 8 : 0) + (hasWebsite ? 4 : 0)));
  const investmentPotentialScore = Math.min(92, Math.max(0, qualificationScore - (supplier ? 4 : 14)));
  const revenueVisibilityScore = Math.min(90, Math.round((hasPhone ? 22 : 8) + (hasWebsite ? 22 : 8) + rating * 8 + Math.min(reviewCount, 150) / 4));
  return { qualificationScore, investmentPotentialScore, revenueVisibilityScore };
}

export async function upsertPmeLead(tenantId: number, input: PmeLeadInput) {
  await ensurePmeExchangeSchema();
  const scores = scoreLead(input);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Lead name is required");
  const normalized = normalizePmeName(input.normalizedName || `${name} ${input.address || ""} ${input.city || ""}`);
  const googlePlaceId = String(input.googlePlaceId || (input.source === "seeded" && input.id ? `seed:${input.id}` : "")).trim() || null;
  const source = String(input.source || "manual") as any;
  const metadata = {
    ...(input.metadata || {}),
    sourceKind: input.kind || null,
    district: input.district || null,
    moq: input.moq || null,
    leadTime: input.leadTime || null,
  };
  const result = await db.execute(sql`
    INSERT INTO pme_leads (
      tenant_id, source, google_place_id, name, normalized_name, description, category, primary_type, types, address,
      city, country, latitude, longitude, phone, whatsapp_phone, website, google_maps_url, rating, review_count,
      business_status, opening_hours, lead_status, qualification_score, investment_potential_score, revenue_visibility_score,
      contact_status, last_enriched_at, metadata, created_at, updated_at
    ) VALUES (
      ${tenantId}, ${source}::pme_lead_source, ${googlePlaceId}, ${name}, ${normalized}, ${input.description || null},
      ${input.category || null}, ${input.primaryType || null}, ${JSON.stringify(input.types || [])}::jsonb,
      ${input.address || null}, ${input.city || null}, ${input.country || null}, ${input.latitude ?? null},
      ${input.longitude ?? null}, ${input.phone || null}, ${input.whatsappPhone || null}, ${input.website || null},
      ${input.googleMapsUrl || null}, ${input.rating ?? null}, ${input.reviewCount ?? null}, ${input.businessStatus || null},
      ${JSON.stringify(input.openingHours || {})}::jsonb, ${input.leadStatus || "enriched"}::pme_lead_status,
      ${input.qualificationScore ?? scores.qualificationScore}, ${input.investmentPotentialScore ?? scores.investmentPotentialScore},
      ${input.revenueVisibilityScore ?? scores.revenueVisibilityScore}, ${input.contactStatus || "not_contacted"},
      now(), ${JSON.stringify(metadata)}::jsonb, now(), now()
    )
    ON CONFLICT (tenant_id, google_place_id) WHERE google_place_id IS NOT NULL
    DO UPDATE SET
      name = excluded.name,
      normalized_name = excluded.normalized_name,
      description = excluded.description,
      category = excluded.category,
      primary_type = excluded.primary_type,
      types = excluded.types,
      address = excluded.address,
      city = excluded.city,
      country = excluded.country,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      phone = excluded.phone,
      whatsapp_phone = excluded.whatsapp_phone,
      website = excluded.website,
      google_maps_url = excluded.google_maps_url,
      rating = excluded.rating,
      review_count = excluded.review_count,
      business_status = excluded.business_status,
      opening_hours = excluded.opening_hours,
      qualification_score = greatest(pme_leads.qualification_score, excluded.qualification_score),
      investment_potential_score = greatest(pme_leads.investment_potential_score, excluded.investment_potential_score),
      revenue_visibility_score = greatest(pme_leads.revenue_visibility_score, excluded.revenue_visibility_score),
      last_enriched_at = now(),
      metadata = pme_leads.metadata || excluded.metadata,
      updated_at = now()
    RETURNING *
  `);
  return rows(result)[0] || null;
}

export async function ensureSeedPmeLeads(tenantId: number) {
  await ensurePmeExchangeSchema();
  const existing = rows<{ count: number | string }>(
    await db.execute(sql`SELECT count(*)::int AS count FROM pme_leads WHERE tenant_id = ${tenantId}`),
  )[0];
  const count = Number(existing?.count || 0);
  if (count >= 100) return { inserted: 0, skipped: count };

  let inserted = 0;
  for (const lead of getSeedPmeLeads()) {
    await upsertPmeLead(tenantId, lead);
    inserted += 1;
  }
  return { inserted, skipped: count };
}

export async function listPmeLeads(tenantId: number, input?: { city?: string; status?: string; category?: string; q?: string; limit?: number }) {
  await ensurePmeExchangeSchema();
  await ensureSeedPmeLeads(tenantId);
  const limit = Math.min(Math.max(Number(input?.limit || 80), 1), 250);
  const city = String(input?.city || "").trim();
  const status = String(input?.status || "").trim();
  const category = String(input?.category || "").trim();
  const q = String(input?.q || "").trim();
  const result = await db.execute(sql`
    SELECT *
    FROM pme_leads
    WHERE tenant_id = ${tenantId}
      AND (${city || null}::text IS NULL OR lower(city) = lower(${city || null}))
      AND (${status || null}::text IS NULL OR lead_status::text = ${status || null})
      AND (${category || null}::text IS NULL OR category ILIKE ${category ? `%${category}%` : null})
      AND (${q || null}::text IS NULL OR normalized_name ILIKE ${q ? `%${normalizePmeName(q)}%` : null} OR category ILIKE ${q ? `%${q}%` : null})
    ORDER BY qualification_score DESC, updated_at DESC
    LIMIT ${limit}
  `);
  return rows(result);
}

export async function getPmeSummary(tenantId: number) {
  await ensurePmeExchangeSchema();
  await ensureSeedPmeLeads(tenantId);
  const [counts, byCity, byCategory, campaigns, messages] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE lead_status = 'new')::int AS new,
        count(*) FILTER (WHERE lead_status in ('qualified','contact_ready'))::int AS qualified,
        count(*) FILTER (WHERE lead_status = 'contacted')::int AS contacted,
        count(*) FILTER (WHERE lead_status = 'replied')::int AS replies,
        count(*) FILTER (WHERE lead_status = 'interested')::int AS interested,
        count(*) FILTER (WHERE lead_status = 'onboarded')::int AS onboarded,
        avg(qualification_score)::numeric(5,2) AS avg_score
      FROM pme_leads
      WHERE tenant_id = ${tenantId}
    `),
    db.execute(sql`
      SELECT city, count(*)::int AS count
      FROM pme_leads
      WHERE tenant_id = ${tenantId}
      GROUP BY city
      ORDER BY count DESC, city ASC
    `),
    db.execute(sql`
      SELECT category, count(*)::int AS count
      FROM pme_leads
      WHERE tenant_id = ${tenantId}
      GROUP BY category
      ORDER BY count DESC, category ASC
      LIMIT 12
    `),
    db.execute(sql`SELECT count(*)::int AS count FROM pme_outreach_campaigns WHERE tenant_id = ${tenantId}`),
    db.execute(sql`SELECT count(*)::int AS count FROM pme_outreach_messages m JOIN pme_leads l ON l.id = m.pme_lead_id WHERE l.tenant_id = ${tenantId}`),
  ]);
  return {
    counts: rows(counts)[0] || {},
    byCity: rows(byCity),
    byCategory: rows(byCategory),
    campaigns: rows(campaigns)[0] || { count: 0 },
    messages: rows(messages)[0] || { count: 0 },
  };
}

export async function previewPmeLeads(input: { city?: string; kind?: string; query?: string; limit?: number }) {
  return filterSeedPmeLeads({ city: input.city, kind: input.kind, query: input.query, limit: input.limit || 30 });
}

export async function savePreviewLeads(tenantId: number, leads: PmeLeadInput[]) {
  const saved = [];
  for (const lead of leads.slice(0, 250)) {
    const row = await upsertPmeLead(tenantId, { ...lead, source: lead.source || "import" });
    if (row) saved.push(row);
  }
  return saved;
}

export function renderPmeIntroMessage(businessName: string) {
  return `Bonjour ${businessName}, je suis l'assistant Exportunity. Nous aidons les PME locales a etre visibles en ligne, recevoir des clients et preparer des opportunites commerciales verifiees. Est-ce que vous etes la bonne personne pour echanger sur votre activite ? Repondez OUI pour continuer ou STOP pour ne plus recevoir de message.`;
}

function isPmeOutreachEnabled() {
  return String(process.env.PME_OUTREACH_ENABLED || "false").trim().toLowerCase() === "true";
}

function resolvePmeWhatsappTemplateContentSid(templateName?: string | null) {
  const direct = String(templateName || "").trim();
  if (/^H[XW][a-z0-9]{8,}$/i.test(direct)) return direct;
  return (
    String(
      process.env.PME_WHATSAPP_TEMPLATE_CONTENT_SID ||
        process.env.TWILIO_PME_INTRO_CONTENT_SID ||
        process.env.WHATSAPP_PME_INTRO_CONTENT_SID ||
        "",
    ).trim() || null
  );
}

function localContactHour() {
  const raw = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Abidjan",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : new Date().getUTCHours();
}

async function blockPmeOutreachMessage(input: {
  messageId: string;
  status: string;
  errorCode: string;
  errorMessage: string;
  metadata?: Record<string, unknown>;
}) {
  const item = rows(
    await db.execute(sql`
      UPDATE pme_outreach_messages
      SET
        status = ${input.status},
        error_code = ${input.errorCode},
        error_message = ${input.errorMessage},
        metadata = coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({
          blockedAt: new Date().toISOString(),
          ...(input.metadata || {}),
        })}::jsonb
      WHERE id::text = ${input.messageId}
      RETURNING *
    `),
  )[0];
  return {
    ok: false,
    sent: false,
    status: input.status,
    errorCode: input.errorCode,
    message: input.errorMessage,
    item,
  };
}

export async function approveAndSendPmeOutreachMessage(input: {
  tenantId: number;
  messageId: string;
  approvedBy?: number | null;
  forceContactWindow?: boolean;
}) {
  await ensurePmeExchangeSchema();
  const messageId = String(input.messageId || "").trim();
  if (!messageId) throw new Error("messageId is required");

  const record = rows<any>(
    await db.execute(sql`
      SELECT
        m.*,
        c.tenant_id,
        c.name AS campaign_name,
        c.status AS campaign_status,
        c.requires_approval,
        c.daily_limit,
        c.metadata AS campaign_metadata,
        l.name AS lead_name,
        l.phone AS lead_phone,
        l.whatsapp_phone AS lead_whatsapp_phone,
        l.lead_status,
        l.contact_status,
        l.last_contacted_at,
        l.metadata AS lead_metadata
      FROM pme_outreach_messages m
      JOIN pme_outreach_campaigns c ON c.id = m.campaign_id
      JOIN pme_leads l ON l.id = m.pme_lead_id
      WHERE c.tenant_id = ${input.tenantId}
        AND m.id::text = ${messageId}
      LIMIT 1
    `),
  )[0];

  if (!record) {
    const err: any = new Error("PME outreach message not found");
    err.status = 404;
    throw err;
  }

  const currentStatus = String(record.status || "").trim();
  const allowedStatuses = new Set(["draft", "approval_required", "setup_required", "send_blocked", "send_failed"]);
  if (!allowedStatuses.has(currentStatus)) {
    return blockPmeOutreachMessage({
      messageId,
      status: "send_blocked",
      errorCode: "message_not_pending_approval",
      errorMessage: `Message is already ${currentStatus || "processed"}.`,
    });
  }

  if (String(record.direction || "") !== "out") {
    return blockPmeOutreachMessage({
      messageId,
      status: "send_blocked",
      errorCode: "inbound_message_not_sendable",
      errorMessage: "Inbound PME messages cannot be approved for outbound delivery.",
    });
  }

  if (String(record.channel || "") !== "whatsapp") {
    return blockPmeOutreachMessage({
      messageId,
      status: "send_blocked",
      errorCode: "unsupported_pme_outreach_channel",
      errorMessage: "PME outreach approval currently supports WhatsApp only.",
    });
  }

  const suppressedStatuses = new Set(["suppressed", "dnc", "do_not_contact", "opted_out", "not_interested"]);
  const leadStatus = String(record.lead_status || "").trim().toLowerCase();
  const contactStatus = String(record.contact_status || "").trim().toLowerCase();
  if (suppressedStatuses.has(leadStatus) || suppressedStatuses.has(contactStatus)) {
    return blockPmeOutreachMessage({
      messageId,
      status: "suppressed",
      errorCode: "lead_suppressed",
      errorMessage: "This PME lead is suppressed or opted out. Future outreach is blocked.",
    });
  }

  const recentDuplicate = rows(
    await db.execute(sql`
      SELECT id
      FROM pme_outreach_messages
      WHERE pme_lead_id = ${record.pme_lead_id}
        AND id::text <> ${messageId}
        AND direction = 'out'
        AND status IN ('sent', 'queued', 'accepted', 'delivered')
        AND coalesce(sent_at, created_at) > now() - interval '30 days'
      LIMIT 1
    `),
  )[0];
  if (recentDuplicate) {
    return blockPmeOutreachMessage({
      messageId,
      status: "send_blocked",
      errorCode: "duplicate_outreach_30_days",
      errorMessage: "This PME was already contacted in the last 30 days.",
    });
  }

  const hour = localContactHour();
  if (!input.forceContactWindow && (hour < 8 || hour >= 20)) {
    return blockPmeOutreachMessage({
      messageId,
      status: "send_blocked",
      errorCode: "outside_contact_hours",
      errorMessage: "Outreach is blocked outside 08:00-20:00 Africa/Abidjan time.",
      metadata: { localHour: hour },
    });
  }

  if (!isPmeOutreachEnabled()) {
    return blockPmeOutreachMessage({
      messageId,
      status: "setup_required",
      errorCode: "pme_outreach_disabled",
      errorMessage: "PME_OUTREACH_ENABLED is not true. Enable outreach after Twilio templates and compliance approval are ready.",
    });
  }

  const toE164 = normalizeE164(record.lead_whatsapp_phone || record.lead_phone);
  if (!toE164) {
    return blockPmeOutreachMessage({
      messageId,
      status: "setup_required",
      errorCode: "missing_whatsapp_phone",
      errorMessage: "This PME lead has no valid E.164 WhatsApp or phone number.",
    });
  }

  const contentSid = resolvePmeWhatsappTemplateContentSid(record.template_name);
  if (!contentSid) {
    return blockPmeOutreachMessage({
      messageId,
      status: "setup_required",
      errorCode: "approved_template_required",
      errorMessage: "Approved WhatsApp template Content SID is required. Set PME_WHATSAPP_TEMPLATE_CONTENT_SID before sending business-initiated outreach.",
    });
  }

  try {
    const sendResult = await sendTemplateWhatsApp({
      tenantId: input.tenantId,
      agentKey: "pme-acquisition-agent",
      to: toE164,
      body: String(record.message_body || ""),
      templateName: record.template_name || "pme_intro_fr",
      templatePayload: {
        contentSid,
        contentVariables: {
          "1": String(record.lead_name || "PME"),
          business_name: String(record.lead_name || "PME"),
        },
        language: "fr",
      },
      metadata: {
        businessInitiated: true,
        requiresTemplate: true,
        pmeOutreach: true,
        campaignId: record.campaign_id,
        messageId,
        approvedBy: input.approvedBy || null,
        optOutKeywords: ["STOP", "NON", "ARRET", "DESINSCRIPTION"],
      },
    });

    const item = rows(
      await db.execute(sql`
        UPDATE pme_outreach_messages
        SET
          status = ${sendResult.status || "sent"},
          twilio_sid = ${sendResult.providerMessageId},
          error_code = null,
          error_message = null,
          sent_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({
            approvedAt: new Date().toISOString(),
            approvedBy: input.approvedBy || null,
            outboundLogId: sendResult.outboundLogId,
            fromAddress: sendResult.fromAddress,
            templateContentSid: contentSid,
          })}::jsonb
        WHERE id::text = ${messageId}
        RETURNING *
      `),
    )[0];

    await db.execute(sql`
      UPDATE pme_leads
      SET
        contact_status = 'contacted',
        lead_status = CASE
          WHEN lead_status IN ('interested','onboarded','suppressed','not_interested') THEN lead_status
          ELSE 'contacted'::pme_lead_status
        END,
        last_contacted_at = now(),
        updated_at = now()
      WHERE id = ${record.pme_lead_id}
        AND tenant_id = ${input.tenantId}
    `);

    return {
      ok: true,
      sent: true,
      status: sendResult.status || "sent",
      providerMessageId: sendResult.providerMessageId,
      message: "Approved WhatsApp outreach was sent through Twilio.",
      item,
    };
  } catch (err: any) {
    const code = err instanceof TenantMessageError ? err.code : String(err?.code || "twilio_send_failed");
    const message = String(err?.message || "Twilio send failed");
    return blockPmeOutreachMessage({
      messageId,
      status: "send_failed",
      errorCode: code,
      errorMessage: message,
    });
  }
}

export async function createPmeTestCampaign(input: {
  tenantId: number;
  createdBy?: number | null;
  leadIds: string[];
  name?: string;
  templateName?: string;
}) {
  await ensurePmeExchangeSchema();
  const leadIds = input.leadIds.slice(0, 20);
  if (!leadIds.length) throw new Error("At least one lead is required");
  if (leadIds.length > 20) throw new Error("Test campaigns are limited to 20 leads");
  const campaign = rows(
    await db.execute(sql`
      INSERT INTO pme_outreach_campaigns (
        tenant_id, name, target_categories, message_template_id, status, daily_limit, created_by, requires_approval, metadata, created_at, updated_at
      ) VALUES (
        ${input.tenantId},
        ${input.name || `PME test campaign ${new Date().toISOString().slice(0, 10)}`},
        ${JSON.stringify([])}::jsonb,
        ${input.templateName || "pme_intro_fr"},
        'test',
        ${Math.min(10, Math.max(1, leadIds.length))},
        ${input.createdBy || null},
        true,
        ${JSON.stringify({ testMode: true, approvalRequired: true, noDuplicateOutreachDays: 30 })}::jsonb,
        now(),
        now()
      )
      RETURNING *
    `),
  )[0] as any;

  const leads = rows<any>(
    await db.execute(sql`
      SELECT id, name
      FROM pme_leads
      WHERE tenant_id = ${input.tenantId}
        AND id::text IN (${sql.join(leadIds.map((id) => sql`${id}`), sql`, `)})
      LIMIT 20
    `),
  );

  const messages = [];
  for (const lead of leads) {
    const messageBody = renderPmeIntroMessage(String(lead.name || "PME"));
    const message = rows(
      await db.execute(sql`
        INSERT INTO pme_outreach_messages (
          campaign_id, pme_lead_id, channel, direction, template_name, message_body, status, metadata, created_at
        ) VALUES (
          ${campaign.id},
          ${lead.id},
          'whatsapp',
          'out',
          ${input.templateName || "pme_intro_fr"},
          ${messageBody},
          'approval_required',
          ${JSON.stringify({
            optOutKeywords: ["STOP", "NON", "ARRET", "DESINSCRIPTION"],
            noNightMessages: true,
            sendRequiresAdminApproval: true,
          })}::jsonb,
          now()
        )
        RETURNING *
      `),
    )[0];
    messages.push(message);
  }

  return { campaign, messages };
}

export async function getPmeCampaigns(tenantId: number) {
  await ensurePmeExchangeSchema();
  const result = await db.execute(sql`
    SELECT c.*, count(m.id)::int AS messages_count
    FROM pme_outreach_campaigns c
    LEFT JOIN pme_outreach_messages m ON m.campaign_id = c.id
    WHERE c.tenant_id = ${tenantId}
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 80
  `);
  return rows(result);
}

export async function getPmeConversations(tenantId: number) {
  await ensurePmeExchangeSchema();
  const result = await db.execute(sql`
    SELECT
      l.id AS lead_id,
      l.name,
      l.city,
      l.category,
      l.lead_status,
      l.contact_status,
      c.summary,
      c.next_step,
      c.sentiment,
      max(m.created_at) AS last_message_at,
      count(m.id)::int AS message_count
    FROM pme_leads l
    LEFT JOIN pme_agent_conversations c ON c.pme_lead_id = l.id
    LEFT JOIN pme_outreach_messages m ON m.pme_lead_id = l.id
    WHERE l.tenant_id = ${tenantId}
    GROUP BY l.id, c.summary, c.next_step, c.sentiment
    ORDER BY max(m.created_at) DESC NULLS LAST, l.updated_at DESC
    LIMIT 80
  `);
  return rows(result);
}

export async function getPmeProfiles(tenantId: number) {
  await ensurePmeExchangeSchema();
  const result = await db.execute(sql`
    SELECT p.*, l.name, l.city, l.category, l.qualification_score
    FROM pme_exchange_profiles p
    JOIN pme_leads l ON l.id = p.pme_lead_id
    WHERE l.tenant_id = ${tenantId}
    ORDER BY p.updated_at DESC
    LIMIT 80
  `);
  return rows(result);
}

export async function getPmeAudit(tenantId: number) {
  await ensurePmeExchangeSchema();
  const result = await db.execute(sql`
    SELECT
      m.id,
      m.campaign_id,
      m.channel,
      m.direction,
      m.template_name,
      m.message_body,
      m.status,
      m.error_code,
      m.error_message,
      m.sent_at,
      m.delivered_at,
      m.replied_at,
      m.created_at,
      l.name AS lead_name,
      l.city AS lead_city,
      c.name AS campaign_name
    FROM pme_outreach_messages m
    JOIN pme_leads l ON l.id = m.pme_lead_id
    LEFT JOIN pme_outreach_campaigns c ON c.id = m.campaign_id
    WHERE l.tenant_id = ${tenantId}
    ORDER BY m.created_at DESC
    LIMIT 120
  `);
  return rows(result);
}
