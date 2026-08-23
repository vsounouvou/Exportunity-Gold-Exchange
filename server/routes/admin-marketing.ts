import crypto from "node:crypto";
import { Router } from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@db";
import {
  marketingAssets,
  marketingLibrary,
  marketingMediaItems,
  marketingMediaRuns,
  marketingMediaSources,
  marketingPosts,
  marketingPress,
  marketingScreenshots,
} from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import {
  getMediaRightsState,
  grantMediaRights,
  MediaPublicationBlockedError,
  publishMediaItemWithRights,
  revokeMediaRights,
  setMediaSourceTakedownState,
} from "../lib/territory-media/mediaRights";
import {
  getSocialPublicationReadiness,
  listSocialPublicationAttempts,
  prepareManualSocialPublication,
  SocialPublicationBlockedError,
} from "../lib/territory-media/socialPublication";
import {
  discoverSocialTargetsReadOnly,
  selectVerifiedSocialTarget,
} from "../lib/territory-media/socialTargetDiscovery";
import {
  continueOfficialSocialPublication,
  executeOfficialSocialPublication,
  OfficialSocialPublicationBlockedError,
} from "../lib/territory-media/officialSocialPublication";
import {
  ingestVerifiedSocialInboxEvent,
  listSocialInboxEvents,
  SocialInboxConflictError,
  SocialInboxVerificationError,
} from "../lib/territory-media/socialInbox";
import {
  listMetaSocialWebhookReceipts,
  reconcileMetaSocialWebhookTarget,
} from "../lib/territory-media/metaSocialWebhook";
import {
  approveAdBudgetEnvelope,
  approveAdvertisingMediaPlan,
  approveSpendAuthorization,
  listAdvertisingGovernance,
  prepareAdBudgetEnvelope,
  prepareAdvertisingMediaPlan,
  prepareSpendAuthorization,
  recordVerifiedAdAccountConnection,
} from "../lib/territory-media/advertisingGovernance";
import {
  CanonicalCommerceAttributionBlockedError,
  reconcileCanonicalFulfilledOrderAttribution,
} from "../lib/territory-media/canonicalCommerceAttribution";
import {
  addMediaStudioAsset,
  approveMediaInterview,
  approveMediaStudioVersion,
  cancelPreparedMediaRenderJob,
  createMediaInterview,
  createMediaStudioProject,
  createMediaStudioVersion,
  getMediaInterviewState,
  getMediaStudioWorkspace,
  MediaRenderPreparationBlockedError,
  prepareMediaRenderJob,
  submitMediaInterviewForReview,
  upsertMediaInterviewClaim,
} from "../lib/territory-media/mediaStudio";

const router = Router();
router.use(ensureTenantAdmin);

type MarketingRecordStatus = "draft" | "published" | "archived";
type MarketingMediaStatus = "discovered" | "reviewed" | "published" | "rejected";
type MarketingMediaType = "article" | "video" | "profile" | "press_release" | "podcast" | "post";

router.get("/marketing/studio/workspace", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const workspace = await getMediaStudioWorkspace({
      tenantId: tenant.id,
      limit: parseLimit(req.query?.limit, 100, 200),
    });
    res.json({ ok: true, ...workspace });
  } catch (error: any) {
    res.status(500).json({ message: String(error?.message || "Failed to load media studio workspace") });
  }
});

router.get("/marketing/studio/interviews/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const sessionId = String(req.params?.id || "").trim();
    if (!sessionId) return res.status(400).json({ message: "Interview id is required" });
    const state = await getMediaInterviewState({ tenantId: tenant.id, sessionId });
    res.json({ ok: true, ...state });
  } catch (error: any) {
    const message = String(error?.message || "Failed to load interview");
    res.status(message === "Interview session not found" ? 404 : 400).json({ message });
  }
});

router.post("/marketing/studio/interviews", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await createMediaInterview({
      tenantId: tenant.id,
      actorUserId,
      confirmed: req.body?.confirmed === true,
      idempotencyKey: req.body?.idempotencyKey,
      mode: req.body?.mode,
      intervieweeName: req.body?.intervieweeName,
      intervieweeRole: req.body?.intervieweeRole,
      organizationName: req.body?.organizationName,
      language: req.body?.language,
      territoryId: Number(req.body?.territoryId || 0) || null,
      contactId: Number(req.body?.contactId || 0) || null,
      sourceReferenceId: Number(req.body?.sourceReferenceId || 0) || null,
      intendedUses: req.body?.intendedUses,
      recordingConsentStatus: req.body?.recordingConsentStatus,
      publicationConsentStatus: req.body?.publicationConsentStatus,
      aiProcessingConsentStatus: req.body?.aiProcessingConsentStatus,
      consentEvidence: req.body?.consentEvidence,
      questionPlan: req.body?.questionPlan,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to prepare interview"), externalContactPerformed: false, recordingStarted: false });
  }
});

router.put("/marketing/studio/interviews/:id/claims", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await upsertMediaInterviewClaim({
      tenantId: tenant.id,
      actorUserId,
      sessionId: String(req.params?.id || "").trim(),
      confirmed: req.body?.confirmed === true,
      questionKey: req.body?.questionKey,
      questionText: req.body?.questionText,
      answerText: req.body?.answerText,
      claimCategory: req.body?.claimCategory,
      factStatus: req.body?.factStatus,
      isMaterial: req.body?.isMaterial !== false,
      confidenceBps: req.body?.confidenceBps,
      evidenceReferences: req.body?.evidenceReferences,
      evidence: req.body?.evidence,
      correctionNotes: req.body?.correctionNotes,
      intervieweeApproved: req.body?.intervieweeApproved === true,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to record interview claim") });
  }
});

router.post("/marketing/studio/interviews/:id/submit", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const result = await submitMediaInterviewForReview({
      tenantId: tenant.id,
      actorUserId: Number(req.user?.id || req.adminUser?.id || 0) || null,
      sessionId: String(req.params?.id || "").trim(),
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(409).json({ message: String(error?.message || "Failed to submit interview") });
  }
});

router.post("/marketing/studio/interviews/:id/approve", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const result = await approveMediaInterview({
      tenantId: tenant.id,
      actorUserId: Number(req.user?.id || req.adminUser?.id || 0) || null,
      sessionId: String(req.params?.id || "").trim(),
      confirmed: req.body?.confirmed === true,
      approvalEvidence: req.body?.approvalEvidence,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(409).json({ message: String(error?.message || "Failed to approve interview") });
  }
});

router.post("/marketing/studio/projects", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const result = await createMediaStudioProject({
      tenantId: tenant.id,
      actorUserId: Number(req.user?.id || req.adminUser?.id || 0) || null,
      confirmed: req.body?.confirmed === true,
      idempotencyKey: req.body?.idempotencyKey,
      interviewSessionId: String(req.body?.interviewSessionId || "").trim(),
      sourceReferenceId: Number(req.body?.sourceReferenceId || 0) || null,
      rightsGrantId: Number(req.body?.rightsGrantId || 0),
      sourceMediaItemId: String(req.body?.sourceMediaItemId || "").trim() || null,
      title: req.body?.title,
      storyAngle: req.body?.storyAngle,
      language: req.body?.language,
      outputFormats: req.body?.outputFormats,
      contentPlan: req.body?.contentPlan,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    res.status(409).json({ message: String(error?.message || "Failed to prepare studio project"), externalRenderExecuted: false });
  }
});

router.post("/marketing/studio/projects/:id/assets", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const result = await addMediaStudioAsset({
      tenantId: tenant.id,
      actorUserId: Number(req.user?.id || req.adminUser?.id || 0) || null,
      projectId: String(req.params?.id || "").trim(),
      confirmed: req.body?.confirmed === true,
      assetRole: req.body?.assetRole,
      storageReference: req.body?.storageReference,
      originalSource: req.body?.originalSource,
      ownerName: req.body?.ownerName,
      sourceMediaItemId: String(req.body?.sourceMediaItemId || "").trim() || null,
      mimeType: req.body?.mimeType,
      sha256: req.body?.sha256,
      generationProvider: req.body?.generationProvider,
      generationPrompt: req.body?.generationPrompt,
      aiGenerated: req.body?.aiGenerated === true,
      rightsStatus: req.body?.rightsStatus,
      subjectConsentStatus: req.body?.subjectConsentStatus,
      musicLicenseStatus: req.body?.musicLicenseStatus,
      modifications: req.body?.modifications,
      metadata: req.body?.metadata,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to record studio asset") });
  }
});

router.post("/marketing/studio/projects/:id/versions", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const result = await createMediaStudioVersion({
      tenantId: tenant.id,
      actorUserId: Number(req.user?.id || req.adminUser?.id || 0) || null,
      projectId: String(req.params?.id || "").trim(),
      confirmed: req.body?.confirmed === true,
      storyboard: req.body?.storyboard,
      editDecisionList: req.body?.editDecisionList,
      naturalLanguageCommands: req.body?.naturalLanguageCommands,
      outputSpecifications: req.body?.outputSpecifications,
      claimIds: req.body?.claimIds,
      reviewComments: req.body?.reviewComments,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error: any) {
    res.status(409).json({ message: String(error?.message || "Failed to create studio version") });
  }
});

router.post("/marketing/studio/projects/:projectId/versions/:versionId/approve", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const result = await approveMediaStudioVersion({
      tenantId: tenant.id,
      actorUserId: Number(req.user?.id || req.adminUser?.id || 0) || null,
      projectId: String(req.params?.projectId || "").trim(),
      versionId: String(req.params?.versionId || "").trim(),
      confirmed: req.body?.confirmed === true,
      approvalEvidence: req.body?.approvalEvidence,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(409).json({ message: String(error?.message || "Failed to approve studio version"), externalRenderExecuted: false });
  }
});

router.post("/marketing/studio/renders/prepare", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const result = await prepareMediaRenderJob({
      tenantId: tenant.id,
      actorUserId: Number(req.user?.id || req.adminUser?.id || 0) || null,
      projectId: String(req.body?.projectId || "").trim(),
      versionId: String(req.body?.versionId || "").trim(),
      confirmed: req.body?.confirmed === true,
      idempotencyKey: req.body?.idempotencyKey,
      outputFormat: req.body?.outputFormat,
      renderSpecification: req.body?.renderSpecification,
      costEstimateMinor: req.body?.costEstimateMinor,
      currencyCode: req.body?.currencyCode,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    if (error instanceof MediaRenderPreparationBlockedError) {
      return res.status(409).json({ message: error.message, blockers: error.blockers, providerSubmissionExecuted: false, externalRenderExecuted: false });
    }
    res.status(400).json({ message: String(error?.message || "Failed to prepare render"), providerSubmissionExecuted: false, externalRenderExecuted: false });
  }
});

router.post("/marketing/studio/renders/:id/cancel", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const result = await cancelPreparedMediaRenderJob({
      tenantId: tenant.id,
      actorUserId: Number(req.user?.id || req.adminUser?.id || 0) || null,
      renderJobId: String(req.params?.id || "").trim(),
      confirmed: req.body?.confirmed === true,
      reason: req.body?.reason,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(409).json({ message: String(error?.message || "Failed to cancel prepared render") });
  }
});

async function checkUrlOk(url: string): Promise<{ ok: boolean; status: number }> {
  const raw = String(url || "").trim();
  if (!raw) return { ok: false, status: 0 };
  if (!/^https?:\/\//i.test(raw)) return { ok: false, status: 0 };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  const headers = { "user-agent": "ExportunityAdminLinkCheck/1.0" };

  try {
    const head = await fetch(raw, { method: "HEAD", redirect: "follow", signal: controller.signal, headers });
    if (head.status === 405 || head.status === 403) {
      const getRes = await fetch(raw, { method: "GET", redirect: "follow", signal: controller.signal, headers });
      return { ok: getRes.status >= 200 && getRes.status < 400, status: getRes.status };
    }
    return { ok: head.status >= 200 && head.status < 400, status: head.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

function parseLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(1, Math.trunc(parsed)), max);
}

function parseOffset(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
}

function slugify(value: unknown, fallback = "item") {
  const base = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => String(entry || "").trim())
          .filter(Boolean),
      ),
    );
  }
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function parseStatus(value: unknown, fallback: MarketingRecordStatus = "draft"): MarketingRecordStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "draft" || raw === "published" || raw === "archived") return raw as MarketingRecordStatus;
  return fallback;
}

function parseMediaStatus(value: unknown, fallback: MarketingMediaStatus = "discovered") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "discovered" || raw === "reviewed" || raw === "published" || raw === "rejected") return raw as MarketingMediaStatus;
  return fallback;
}

function parseMediaType(value: unknown, fallback: MarketingMediaType = "article") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "article" || raw === "video" || raw === "profile" || raw === "press_release" || raw === "podcast" || raw === "post") {
    return raw as MarketingMediaType;
  }
  return fallback;
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function scrubLegacyBranding(value: unknown) {
  return String(value ?? "")
    .replace(/https?:\/\/(?:www\.)?rayon\.world\/?/gi, "https://exportunity.net/")
    .replace(/(?:www\.)?rayon\.world/gi, "exportunity.net")
    .replace(/\brayOn\b/g, "Exportunity Platform");
}

function ensureTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function hasBodyField(body: any, key: string) {
  return Boolean(body && Object.prototype.hasOwnProperty.call(body, key));
}

function parseSortOrder(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function parseScore(value: unknown, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function readFeatured(raw: unknown) {
  if (!raw || typeof raw !== "object") return false;
  return parseBoolean((raw as Record<string, unknown>).featured, false);
}

function withFeaturedRaw(raw: unknown, featured: boolean | undefined) {
  const next = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  if (typeof featured === "boolean") next.featured = featured;
  return next;
}

router.get("/marketing/posts", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 60, 300);
    const offset = parseOffset(req.query?.offset);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();

    const conditions = [eq(marketingPosts.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(marketingPosts.status, parseStatus(status) as any));
    if (q) {
      conditions.push(
        or(ilike(marketingPosts.title, `%${q}%`), ilike(marketingPosts.slug, `%${q}%`), ilike(marketingPosts.excerpt, `%${q}%`)) as any,
      );
    }

    const items = await db
      .select()
      .from(marketingPosts)
      .where(and(...conditions))
      .orderBy(desc(marketingPosts.updatedAt), desc(marketingPosts.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items, limit, offset, hasMore: items.length === limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list posts" });
  }
});

router.post("/marketing/posts", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const title = scrubLegacyBranding(req.body?.title).trim();
    if (!title) return res.status(400).json({ message: "title required" });

    const slug = slugify(req.body?.slug || title, "post");
    const publishedAt = normalizeDate(req.body?.publishedAt ?? req.body?.published_at);
    const now = new Date();

    const [item] = await db
      .insert(marketingPosts)
      .values({
        tenantId: tenant.id,
        slug,
        title,
        excerpt: scrubLegacyBranding(req.body?.excerpt).trim() || null,
        contentMarkdown: scrubLegacyBranding(req.body?.contentMarkdown ?? req.body?.content_markdown).trim() || null,
        contentHtml: scrubLegacyBranding(req.body?.contentHtml ?? req.body?.content_html).trim() || null,
        coverImageLocal: String((req.body?.coverImageLocal ?? req.body?.cover_image_local) || "").trim() || null,
        tags: parseTags(req.body?.tags),
        externalUrl: scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null,
        status: parseStatus(req.body?.status),
        sortOrder: Number.parseInt(String(req.body?.sortOrder ?? req.body?.sort_order ?? "0"), 10) || 0,
        publishedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to create post" });
  }
});

router.patch("/marketing/posts/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingPosts.findFirst({
      where: and(eq(marketingPosts.id, id), eq(marketingPosts.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "post not found" });

    const titleInput = scrubLegacyBranding(req.body?.title).trim();
    const nextTitle = titleInput || current.title;
    const slug = slugify(req.body?.slug || nextTitle || current.slug || `post-${id}`, "post");
    const publishedAt =
      hasBodyField(req.body, "publishedAt") || hasBodyField(req.body, "published_at")
        ? normalizeDate(req.body?.publishedAt ?? req.body?.published_at)
        : current.publishedAt;
    const nextStatus = hasBodyField(req.body, "status") ? parseStatus(req.body?.status, current.status) : current.status;
    const nextSortOrder =
      hasBodyField(req.body, "sortOrder") || hasBodyField(req.body, "sort_order")
        ? parseSortOrder(req.body?.sortOrder ?? req.body?.sort_order, current.sortOrder)
        : current.sortOrder;
    const nextTags = hasBodyField(req.body, "tags") ? parseTags(req.body?.tags) : current.tags;

    const [item] = await db
      .update(marketingPosts)
      .set({
        slug,
        title: nextTitle,
        excerpt: hasBodyField(req.body, "excerpt") ? scrubLegacyBranding(req.body?.excerpt).trim() || null : current.excerpt,
        contentMarkdown:
          hasBodyField(req.body, "contentMarkdown") || hasBodyField(req.body, "content_markdown")
            ? scrubLegacyBranding(req.body?.contentMarkdown ?? req.body?.content_markdown).trim() || null
            : current.contentMarkdown,
        contentHtml:
          hasBodyField(req.body, "contentHtml") || hasBodyField(req.body, "content_html")
            ? scrubLegacyBranding(req.body?.contentHtml ?? req.body?.content_html).trim() || null
            : current.contentHtml,
        coverImageLocal:
          hasBodyField(req.body, "coverImageLocal") || hasBodyField(req.body, "cover_image_local")
            ? String((req.body?.coverImageLocal ?? req.body?.cover_image_local) || "").trim() || null
            : current.coverImageLocal,
        tags: nextTags,
        externalUrl:
          hasBodyField(req.body, "externalUrl") || hasBodyField(req.body, "external_url")
            ? scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null
            : current.externalUrl,
        status: nextStatus as any,
        sortOrder: nextSortOrder,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(marketingPosts.id, id), eq(marketingPosts.tenantId, tenant.id)))
      .returning();

    if (!item) return res.status(404).json({ message: "post not found" });
    res.json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to update post" });
  }
});

router.delete("/marketing/posts/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const rows = await db
      .delete(marketingPosts)
      .where(and(eq(marketingPosts.id, id), eq(marketingPosts.tenantId, tenant.id)))
      .returning({ id: marketingPosts.id });
    if (!rows.length) return res.status(404).json({ message: "post not found" });
    res.json({ ok: true, deletedId: rows[0].id });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete post" });
  }
});

router.get("/marketing/press", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 80, 300);
    const offset = parseOffset(req.query?.offset);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();

    const conditions = [eq(marketingPress.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(marketingPress.status, parseStatus(status) as any));
    if (q) conditions.push(or(ilike(marketingPress.title, `%${q}%`), ilike(marketingPress.outlet, `%${q}%`)) as any);

    const items = await db
      .select()
      .from(marketingPress)
      .where(and(...conditions))
      .orderBy(desc(marketingPress.updatedAt), desc(marketingPress.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items, limit, offset, hasMore: items.length === limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list press" });
  }
});

router.post("/marketing/press", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const title = scrubLegacyBranding(req.body?.title).trim();
    if (!title) return res.status(400).json({ message: "title required" });
    const slug = slugify(req.body?.slug || title, "press");
    const publishedAt = normalizeDate(req.body?.publishedAt ?? req.body?.published_at);
    const now = new Date();

    const [item] = await db
      .insert(marketingPress)
      .values({
        tenantId: tenant.id,
        slug,
        title,
        outlet: scrubLegacyBranding(req.body?.outlet).trim() || null,
        excerpt: scrubLegacyBranding(req.body?.excerpt).trim() || null,
        externalUrl: scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null,
        thumbnailLocal: String((req.body?.thumbnailLocal ?? req.body?.thumbnail_local) || "").trim() || null,
        tags: parseTags(req.body?.tags),
        status: parseStatus(req.body?.status),
        sortOrder: Number.parseInt(String(req.body?.sortOrder ?? req.body?.sort_order ?? "0"), 10) || 0,
        publishedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to create press item" });
  }
});

router.patch("/marketing/press/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingPress.findFirst({
      where: and(eq(marketingPress.id, id), eq(marketingPress.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "press item not found" });

    const titleInput = scrubLegacyBranding(req.body?.title).trim();
    const nextTitle = titleInput || current.title;
    const slug = slugify(req.body?.slug || nextTitle || current.slug || `press-${id}`, "press");
    const publishedAt =
      hasBodyField(req.body, "publishedAt") || hasBodyField(req.body, "published_at")
        ? normalizeDate(req.body?.publishedAt ?? req.body?.published_at)
        : current.publishedAt;
    const nextStatus = hasBodyField(req.body, "status") ? parseStatus(req.body?.status, current.status) : current.status;
    const nextSortOrder =
      hasBodyField(req.body, "sortOrder") || hasBodyField(req.body, "sort_order")
        ? parseSortOrder(req.body?.sortOrder ?? req.body?.sort_order, current.sortOrder)
        : current.sortOrder;
    const nextTags = hasBodyField(req.body, "tags") ? parseTags(req.body?.tags) : current.tags;

    const [item] = await db
      .update(marketingPress)
      .set({
        slug,
        title: nextTitle,
        outlet: hasBodyField(req.body, "outlet") ? scrubLegacyBranding(req.body?.outlet).trim() || null : current.outlet,
        excerpt: hasBodyField(req.body, "excerpt") ? scrubLegacyBranding(req.body?.excerpt).trim() || null : current.excerpt,
        externalUrl:
          hasBodyField(req.body, "externalUrl") || hasBodyField(req.body, "external_url")
            ? scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null
            : current.externalUrl,
        thumbnailLocal:
          hasBodyField(req.body, "thumbnailLocal") || hasBodyField(req.body, "thumbnail_local")
            ? String((req.body?.thumbnailLocal ?? req.body?.thumbnail_local) || "").trim() || null
            : current.thumbnailLocal,
        tags: nextTags,
        status: nextStatus as any,
        sortOrder: nextSortOrder,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(marketingPress.id, id), eq(marketingPress.tenantId, tenant.id)))
      .returning();

    if (!item) return res.status(404).json({ message: "press item not found" });
    res.json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to update press item" });
  }
});

router.delete("/marketing/press/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const rows = await db
      .delete(marketingPress)
      .where(and(eq(marketingPress.id, id), eq(marketingPress.tenantId, tenant.id)))
      .returning({ id: marketingPress.id });
    if (!rows.length) return res.status(404).json({ message: "press item not found" });
    res.json({ ok: true, deletedId: rows[0].id });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete press item" });
  }
});

router.get("/marketing/library", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 120, 400);
    const offset = parseOffset(req.query?.offset);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();

    const conditions = [eq(marketingLibrary.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(marketingLibrary.status, parseStatus(status) as any));
    if (q) {
      conditions.push(
        or(ilike(marketingLibrary.title, `%${q}%`), ilike(marketingLibrary.description, `%${q}%`), ilike(marketingLibrary.category, `%${q}%`)) as any,
      );
    }

    const items = await db
      .select()
      .from(marketingLibrary)
      .where(and(...conditions))
      .orderBy(desc(marketingLibrary.updatedAt), desc(marketingLibrary.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items, limit, offset, hasMore: items.length === limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list library items" });
  }
});

router.get("/marketing/screenshots", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const limit = parseLimit(req.query?.limit, 200, 500);
    const query = String(req.query?.q || "").trim();
    const moduleFilter = String(req.query?.module || "").trim();
    const status = String(req.query?.status || "all").trim().toLowerCase();

    const conditions: any[] = [eq(marketingScreenshots.tenantId, tenant.id)];
    if (status !== "all") conditions.push(eq(marketingScreenshots.status, parseStatus(status, "draft") as any));
    if (moduleFilter) conditions.push(eq(marketingScreenshots.module, moduleFilter));
    if (query) {
      conditions.push(
        or(
          ilike(marketingScreenshots.title, `%${query}%`),
          ilike(marketingScreenshots.caption, `%${query}%`),
          ilike(marketingScreenshots.module, `%${query}%`),
          ilike(marketingScreenshots.slug, `%${query}%`),
        ) as any,
      );
    }

    const items = await db
      .select()
      .from(marketingScreenshots)
      .where(and(...conditions))
      .orderBy(marketingScreenshots.sortOrder, desc(marketingScreenshots.updatedAt))
      .limit(limit);

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list screenshots" });
  }
});

router.post("/marketing/screenshots", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const title = scrubLegacyBranding(req.body?.title);
    const imageLocalPath = String(req.body?.imageLocalPath || "").trim();
    if (!title) return res.status(400).json({ message: "title required" });
    if (!imageLocalPath) return res.status(400).json({ message: "imageLocalPath required" });

    const slug = slugify(req.body?.slug, slugify(title, `shot-${crypto.randomUUID().slice(0, 8)}`));
    const module = scrubLegacyBranding(req.body?.module) || "platform";
    const caption = scrubLegacyBranding(req.body?.caption) || null;
    const tags = parseTags(req.body?.tags);
    const status = parseStatus(req.body?.status, "draft");
    const sortOrder = parseSortOrder(req.body?.sortOrder, 0);

    const [row] = await db
      .insert(marketingScreenshots)
      .values({
        tenantId: tenant.id,
        slug,
        title,
        module,
        caption,
        imageLocalPath,
        tags,
        status: status as any,
        sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json({ ok: true, item: row });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to create screenshot" });
  }
});

router.patch("/marketing/screenshots/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const patch: any = { updatedAt: new Date() };
    if (hasBodyField(req.body, "title")) patch.title = scrubLegacyBranding(req.body?.title);
    if (hasBodyField(req.body, "slug")) patch.slug = slugify(req.body?.slug, `shot-${id}`);
    if (hasBodyField(req.body, "module")) patch.module = scrubLegacyBranding(req.body?.module) || "platform";
    if (hasBodyField(req.body, "caption")) patch.caption = scrubLegacyBranding(req.body?.caption) || null;
    if (hasBodyField(req.body, "imageLocalPath")) patch.imageLocalPath = String(req.body?.imageLocalPath || "").trim();
    if (hasBodyField(req.body, "tags")) patch.tags = parseTags(req.body?.tags);
    if (hasBodyField(req.body, "status")) patch.status = parseStatus(req.body?.status, "draft");
    if (hasBodyField(req.body, "sortOrder")) patch.sortOrder = parseSortOrder(req.body?.sortOrder, 0);

    const [updated] = await db
      .update(marketingScreenshots)
      .set(patch)
      .where(and(eq(marketingScreenshots.tenantId, tenant.id), eq(marketingScreenshots.id, id)))
      .returning();

    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true, item: updated });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update screenshot" });
  }
});

router.delete("/marketing/screenshots/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const deleted = await db
      .delete(marketingScreenshots)
      .where(and(eq(marketingScreenshots.tenantId, tenant.id), eq(marketingScreenshots.id, id)))
      .returning();

    if (!deleted.length) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete screenshot" });
  }
});

router.post("/marketing/library", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const title = scrubLegacyBranding(req.body?.title).trim();
    if (!title) return res.status(400).json({ message: "title required" });
    const slug = slugify(req.body?.slug || title, "library");
    const publishedAt = normalizeDate(req.body?.publishedAt ?? req.body?.published_at);
    const now = new Date();

    const [item] = await db
      .insert(marketingLibrary)
      .values({
        tenantId: tenant.id,
        slug,
        title,
        description: scrubLegacyBranding(req.body?.description).trim() || null,
        category: scrubLegacyBranding(req.body?.category).trim() || null,
        language: String(req.body?.language || "").trim() || null,
        duration: String(req.body?.duration || "").trim() || null,
        externalUrl: scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null,
        embedUrl: String((req.body?.embedUrl ?? req.body?.embed_url) || "").trim() || null,
        thumbnailLocal: String((req.body?.thumbnailLocal ?? req.body?.thumbnail_local) || "").trim() || null,
        tags: parseTags(req.body?.tags),
        status: parseStatus(req.body?.status),
        sortOrder: Number.parseInt(String(req.body?.sortOrder ?? req.body?.sort_order ?? "0"), 10) || 0,
        publishedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to create library item" });
  }
});

router.patch("/marketing/library/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingLibrary.findFirst({
      where: and(eq(marketingLibrary.id, id), eq(marketingLibrary.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "library item not found" });

    const titleInput = scrubLegacyBranding(req.body?.title).trim();
    const nextTitle = titleInput || current.title;
    const slug = slugify(req.body?.slug || nextTitle || current.slug || `library-${id}`, "library");
    const publishedAt =
      hasBodyField(req.body, "publishedAt") || hasBodyField(req.body, "published_at")
        ? normalizeDate(req.body?.publishedAt ?? req.body?.published_at)
        : current.publishedAt;
    const nextStatus = hasBodyField(req.body, "status") ? parseStatus(req.body?.status, current.status) : current.status;
    const nextSortOrder =
      hasBodyField(req.body, "sortOrder") || hasBodyField(req.body, "sort_order")
        ? parseSortOrder(req.body?.sortOrder ?? req.body?.sort_order, current.sortOrder)
        : current.sortOrder;
    const nextTags = hasBodyField(req.body, "tags") ? parseTags(req.body?.tags) : current.tags;

    const [item] = await db
      .update(marketingLibrary)
      .set({
        slug,
        title: nextTitle,
        description:
          hasBodyField(req.body, "description") ? scrubLegacyBranding(req.body?.description).trim() || null : current.description,
        category: hasBodyField(req.body, "category") ? scrubLegacyBranding(req.body?.category).trim() || null : current.category,
        language: hasBodyField(req.body, "language") ? String(req.body?.language || "").trim() || null : current.language,
        duration: hasBodyField(req.body, "duration") ? String(req.body?.duration || "").trim() || null : current.duration,
        externalUrl:
          hasBodyField(req.body, "externalUrl") || hasBodyField(req.body, "external_url")
            ? scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null
            : current.externalUrl,
        embedUrl:
          hasBodyField(req.body, "embedUrl") || hasBodyField(req.body, "embed_url")
            ? String((req.body?.embedUrl ?? req.body?.embed_url) || "").trim() || null
            : current.embedUrl,
        thumbnailLocal:
          hasBodyField(req.body, "thumbnailLocal") || hasBodyField(req.body, "thumbnail_local")
            ? String((req.body?.thumbnailLocal ?? req.body?.thumbnail_local) || "").trim() || null
            : current.thumbnailLocal,
        tags: nextTags,
        status: nextStatus as any,
        sortOrder: nextSortOrder,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(marketingLibrary.id, id), eq(marketingLibrary.tenantId, tenant.id)))
      .returning();

    if (!item) return res.status(404).json({ message: "library item not found" });
    res.json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to update library item" });
  }
});

router.delete("/marketing/library/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const rows = await db
      .delete(marketingLibrary)
      .where(and(eq(marketingLibrary.id, id), eq(marketingLibrary.tenantId, tenant.id)))
      .returning({ id: marketingLibrary.id });
    if (!rows.length) return res.status(404).json({ message: "library item not found" });
    res.json({ ok: true, deletedId: rows[0].id });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete library item" });
  }
});

router.get("/marketing/media", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 120, 300);
    const offset = parseOffset(req.query?.offset);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();
    const type = String(req.query?.type || "").trim().toLowerCase();

    const conditions = [eq(marketingMediaItems.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(marketingMediaItems.status, parseMediaStatus(status) as any));
    if (type && type !== "all") conditions.push(eq(marketingMediaItems.type, parseMediaType(type) as any));
    if (q) {
      conditions.push(or(ilike(marketingMediaItems.title, `%${q}%`), ilike(marketingMediaItems.outlet, `%${q}%`), ilike(marketingMediaItems.url, `%${q}%`)) as any);
    }

    const items = await db
      .select()
      .from(marketingMediaItems)
      .where(and(...conditions))
      .orderBy(desc(marketingMediaItems.updatedAt), desc(marketingMediaItems.createdAt))
      .limit(limit)
      .offset(offset);
    const mapped = items.map((item: any) => ({
      ...item,
      featured: readFeatured(item.raw),
    }));
    res.json({ ok: true, items: mapped, limit, offset, hasMore: items.length === limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list media items" });
  }
});

router.get("/marketing/media/:id/rights", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });
    const usageType = String(req.query?.usageType || "organic_publication").trim() as any;
    const channel = String(req.query?.channel || "web").trim();
    const territoryId = Number(req.query?.territoryId || 0) || null;
    const state = await getMediaRightsState({
      tenantId: tenant.id,
      mediaItemId: id,
      usageType,
      channel,
      territoryId,
    });
    res.json({ ok: true, ...state });
  } catch (error: any) {
    const message = String(error?.message || "Failed to load media rights");
    res.status(message === "Media item not found" ? 404 : 400).json({ message });
  }
});

router.get("/marketing/social/readiness", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const readiness = await getSocialPublicationReadiness({
      tenantId: tenant.id,
    });
    res.json({ ok: true, ...readiness });
  } catch (error: any) {
    res.status(500).json({ message: String(error?.message || "Failed to load social publication readiness") });
  }
});

router.post("/marketing/social/targets/discover", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await discoverSocialTargetsReadOnly({
      tenantId: tenant.id,
      actorUserId,
      connectionId: String(req.body?.connectionId || "").trim(),
      platform: req.body?.platform,
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || "Failed to discover provider targets");
    const status = /connected integration|permission evidence|requires provider permission|expired|reconnect/i.test(message)
      ? 409
      : 400;
    res.status(status).json({
      message,
      providerMutationPerformed: false,
      externalPublicationPerformed: false,
      credentialsExposed: false,
    });
  }
});

router.post("/marketing/social/targets/select", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const discoveryActionRunId = Number(req.body?.discoveryActionRunId || 0);
    if (!Number.isInteger(discoveryActionRunId) || discoveryActionRunId <= 0) {
      return res.status(400).json({ message: "A valid discoveryActionRunId is required" });
    }
    const result = await selectVerifiedSocialTarget({
      tenantId: tenant.id,
      actorUserId,
      discoveryActionRunId,
      candidateKey: String(req.body?.candidateKey || "").trim(),
      authorityReference: req.body?.authorityReference,
      confirmed: req.body?.confirmed === true,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || "Failed to select provider target");
    const status = /receipt|not present|connected integration|permission evidence|requires provider permission/i.test(message)
      ? 409
      : 400;
    res.status(status).json({
      message,
      providerMutationPerformed: false,
      externalPublicationPerformed: false,
      credentialsExposed: false,
    });
  }
});

router.get("/marketing/social/inbox/events", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const classification = String(req.query?.classification || "").trim().toLowerCase() || null;
    const items = await listSocialInboxEvents({
      tenantId: tenant.id,
      limit: parseLimit(req.query?.limit, 100, 200),
      classification,
    });
    res.json({
      ok: true,
      items,
      source: "verified_social_inbox_events",
      credentialsExposed: false,
      externalReplyPerformed: false,
    });
  } catch (error: any) {
    res.status(500).json({ message: String(error?.message || "Failed to list social inbox events") });
  }
});

router.post("/marketing/social/inbox/ingest", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ message: "Accountable ingestion confirmation is required" });
    }
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await ingestVerifiedSocialInboxEvent({
      tenantId: tenant.id,
      actorUserId,
      targetId: Number(req.body?.targetId || 0),
      provider: req.body?.provider,
      platform: req.body?.platform,
      channel: req.body?.channel,
      eventType: req.body?.eventType,
      providerEventId: req.body?.providerEventId,
      externalAccountId: req.body?.externalAccountId,
      externalActorId: req.body?.externalActorId,
      externalActorLabel: req.body?.externalActorLabel,
      externalThreadId: req.body?.externalThreadId,
      parentContentId: req.body?.parentContentId,
      parentContentUrl: req.body?.parentContentUrl,
      body: req.body?.body,
      receivedAt: req.body?.receivedAt,
      verificationEvidence: req.body?.verificationEvidence,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    if (error instanceof SocialInboxVerificationError || error instanceof SocialInboxConflictError) {
      return res.status(409).json({
        message: error.message,
        code: error.code,
        externalReplyPerformed: false,
      });
    }
    res.status(400).json({
      message: String(error?.message || "Failed to ingest social inbox event"),
      externalReplyPerformed: false,
    });
  }
});

router.get("/marketing/social/inbox/meta/receipts", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const targetId = Number(req.query?.targetId || 0) || null;
    const items = await listMetaSocialWebhookReceipts({
      tenantId: tenant.id,
      targetId,
      limit: parseLimit(req.query?.limit, 100, 200),
    });
    res.json({
      ok: true,
      items,
      source: "signed_meta_webhook_receipts",
      sanitizedPayloadReturned: false,
      credentialsExposed: false,
      externalReplyPerformed: false,
    });
  } catch (error: any) {
    res.status(500).json({
      message: String(error?.message || "Failed to list Meta webhook receipts"),
    });
  }
});

router.post("/marketing/social/inbox/meta/reconcile-target", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await reconcileMetaSocialWebhookTarget({
      tenantId: tenant.id,
      targetId: Number(req.body?.targetId || 0),
      actorUserId,
      confirmed: req.body?.confirmed === true,
      limit: parseLimit(req.body?.limit, 100, 200),
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(400).json({
      message: String(error?.message || "Failed to reconcile Meta webhook receipts"),
      automaticBackgroundRetry: false,
      externalReplyPerformed: false,
      credentialsExposed: false,
    });
  }
});

router.get("/marketing/ads/governance", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const result = await listAdvertisingGovernance({
      tenantId: tenant.id,
      limit: parseLimit(req.query?.limit, 100, 200),
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(500).json({ message: String(error?.message || "Failed to load advertising governance") });
  }
});

router.post("/marketing/ads/conversions/reconcile-fulfilled-order", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await reconcileCanonicalFulfilledOrderAttribution({
      tenantId: tenant.id,
      actorUserId,
      confirmed: req.body?.confirmed === true,
      idempotencyKey: req.body?.idempotencyKey,
      orderId: req.body?.orderId,
      paymentId: req.body?.paymentId,
      fulfillmentPlanId: req.body?.fulfillmentPlanId,
      sourceKind: req.body?.sourceKind,
      campaignId: req.body?.campaignId,
      creativeId: req.body?.creativeId,
      publicationAttemptId: req.body?.publicationAttemptId,
      attributionEvidence: req.body?.attributionEvidence,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    const blockers = error instanceof CanonicalCommerceAttributionBlockedError
      ? error.blockers
      : undefined;
    res.status(error instanceof CanonicalCommerceAttributionBlockedError ? 409 : 400).json({
      message: String(error?.message || "Failed to reconcile canonical commerce attribution"),
      ...(blockers ? { blockers } : {}),
      externalActionPerformed: false,
      backgroundExecutionStarted: false,
      credentialsExposed: false,
    });
  }
});

router.post("/marketing/ads/accounts/record-verification", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await recordVerifiedAdAccountConnection({
      tenantId: tenant.id,
      actorUserId,
      confirmed: req.body?.confirmed === true,
      provider: req.body?.provider,
      platform: req.body?.platform,
      externalAdAccountId: req.body?.externalAdAccountId,
      externalAdAccountLabel: req.body?.externalAdAccountLabel,
      businessOwnerReference: req.body?.businessOwnerReference,
      publicationTargetId: Number(req.body?.publicationTargetId || 0) || null,
      integrationConnectionId: String(req.body?.integrationConnectionId || "").trim() || null,
      authorizationStatus: req.body?.authorizationStatus,
      healthStatus: req.body?.healthStatus,
      restrictionStatus: req.body?.restrictionStatus,
      capabilities: req.body?.capabilities,
      permissions: req.body?.permissions,
      verificationEvidence: req.body?.verificationEvidence,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to record ad-account verification") });
  }
});

router.post("/marketing/ads/budget-envelopes", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await prepareAdBudgetEnvelope({
      tenantId: tenant.id,
      actorUserId,
      confirmed: req.body?.confirmed === true,
      idempotencyKey: req.body?.idempotencyKey,
      parentEnvelopeId: String(req.body?.parentEnvelopeId || "").trim() || null,
      adAccountConnectionId: String(req.body?.adAccountConnectionId || "").trim() || null,
      territoryId: Number(req.body?.territoryId || 0) || null,
      name: req.body?.name,
      scopeType: req.body?.scopeType,
      scopeReferenceId: req.body?.scopeReferenceId,
      currencyCode: req.body?.currencyCode,
      periodStart: req.body?.periodStart,
      periodEnd: req.body?.periodEnd,
      totalCapMinor: req.body?.totalCapMinor,
      dailyCapMinor: req.body?.dailyCapMinor,
      weeklyCapMinor: req.body?.weeklyCapMinor,
      monthlyCapMinor: req.body?.monthlyCapMinor,
      maximumCacMinor: req.body?.maximumCacMinor,
      minimumMarginBps: req.body?.minimumMarginBps,
      agentReallocationAllowed: req.body?.agentReallocationAllowed === true,
      maximumReallocationBps: req.body?.maximumReallocationBps,
      stoppingConditions: req.body?.stoppingConditions,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to prepare ad budget envelope") });
  }
});

router.post("/marketing/ads/budget-envelopes/:id/approve", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await approveAdBudgetEnvelope({
      tenantId: tenant.id,
      actorUserId,
      envelopeId: String(req.params?.id || "").trim(),
      confirmed: req.body?.confirmed === true,
      authorityReference: req.body?.authorityReference,
      rationale: req.body?.rationale,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(409).json({ message: String(error?.message || "Failed to approve ad budget envelope") });
  }
});

router.post("/marketing/ads/media-plans/prepare", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await prepareAdvertisingMediaPlan({
      tenantId: tenant.id,
      actorUserId,
      confirmed: req.body?.confirmed === true,
      idempotencyKey: req.body?.idempotencyKey,
      envelopeId: String(req.body?.envelopeId || "").trim(),
      adAccountConnectionId: String(req.body?.adAccountConnectionId || "").trim(),
      territoryId: Number(req.body?.territoryId || 0),
      mediaItemId: String(req.body?.mediaItemId || "").trim(),
      platform: String(req.body?.platform || "").trim(),
      title: req.body?.title,
      objective: req.body?.objective,
      eligibleProducts: req.body?.eligibleProducts,
      stockCapacityEvidence: req.body?.stockCapacityEvidence,
      deliveryCoverageEvidence: req.body?.deliveryCoverageEvidence,
      landingPageUrl: req.body?.landingPageUrl,
      landingPageEvidence: req.body?.landingPageEvidence,
      trackingPlan: req.body?.trackingPlan,
      marginBps: req.body?.marginBps,
      maximumCacMinor: req.body?.maximumCacMinor,
      policyStatus: req.body?.policyStatus,
      requestedBudgetMinor: req.body?.requestedBudgetMinor,
      stoppingConditions: req.body?.stoppingConditions,
      creative: req.body?.creative,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to prepare advertising media plan") });
  }
});

router.post("/marketing/ads/media-plans/:id/approve", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await approveAdvertisingMediaPlan({
      tenantId: tenant.id,
      actorUserId,
      mediaPlanId: String(req.params?.id || "").trim(),
      confirmed: req.body?.confirmed === true,
      factsStillCurrent: req.body?.factsStillCurrent === true,
      creativeApproved: req.body?.creativeApproved === true,
      approvalReference: req.body?.approvalReference,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(409).json({ message: String(error?.message || "Failed to approve advertising media plan") });
  }
});

router.post("/marketing/ads/spend-authorizations/prepare", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await prepareSpendAuthorization({
      tenantId: tenant.id,
      actorUserId,
      confirmed: req.body?.confirmed === true,
      idempotencyKey: req.body?.idempotencyKey,
      mediaPlanId: String(req.body?.mediaPlanId || "").trim(),
      campaignId: String(req.body?.campaignId || "").trim(),
      amountMinor: req.body?.amountMinor,
      validFrom: req.body?.validFrom,
      validUntil: req.body?.validUntil,
      purpose: req.body?.purpose,
      authorityBounds: req.body?.authorityBounds,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to prepare spend authorization") });
  }
});

router.post("/marketing/ads/spend-authorizations/:id/approve", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await approveSpendAuthorization({
      tenantId: tenant.id,
      actorUserId,
      authorizationId: String(req.params?.id || "").trim(),
      confirmed: req.body?.confirmed === true,
      approvalReference: req.body?.approvalReference,
      rationale: req.body?.rationale,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(409).json({ message: String(error?.message || "Failed to approve spend authorization") });
  }
});

router.get("/marketing/media/:id/publications", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });
    const items = await listSocialPublicationAttempts({
      tenantId: tenant.id,
      mediaItemId: id,
      limit: parseLimit(req.query?.limit, 30, 100),
    });
    res.json({ ok: true, items, externalPublicationClaimed: false });
  } catch (error: any) {
    res.status(500).json({ message: String(error?.message || "Failed to list social publication attempts") });
  }
});

router.post("/marketing/media/:id/publications/prepare", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await prepareManualSocialPublication({
      tenantId: tenant.id,
      mediaItemId: id,
      actorUserId,
      platform: String(req.body?.platform || ""),
      channel: String(req.body?.channel || "") || null,
      territoryId: Number(req.body?.territoryId || req.body?.territory_id || 0) || null,
      integrationConnectionId:
        String(req.body?.integrationConnectionId || req.body?.integration_connection_id || "").trim() || null,
      targetId: Number(req.body?.targetId || req.body?.target_id || 0) || null,
      idempotencyKey: String(req.body?.idempotencyKey || req.body?.idempotency_key || ""),
      confirmed: req.body?.confirmed === true,
      package: req.body?.package && typeof req.body.package === "object" ? req.body.package : {},
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    if (error instanceof SocialPublicationBlockedError) {
      return res.status(409).json({
        message: error.message,
        code: error.code,
        publicationStatus: error.publicationStatus,
        blockers: error.blockers,
        externalPublicationClaimed: false,
      });
    }
    res.status(400).json({
      message: String(error?.message || "Failed to prepare social publication"),
      externalPublicationClaimed: false,
    });
  }
});

router.post("/marketing/media/:id/publications/official", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await executeOfficialSocialPublication({
      tenantId: tenant.id,
      mediaItemId: id,
      actorUserId,
      platform: req.body?.platform,
      channel: String(req.body?.channel || "") || null,
      territoryId: Number(req.body?.territoryId || req.body?.territory_id || 0) || null,
      integrationConnectionId:
        String(req.body?.integrationConnectionId || req.body?.integration_connection_id || "").trim(),
      targetId: Number(req.body?.targetId || req.body?.target_id || 0),
      idempotencyKey: req.body?.idempotencyKey || req.body?.idempotency_key,
      confirmed: req.body?.confirmed === true,
      package: req.body?.package && typeof req.body.package === "object" ? req.body.package : {},
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error: any) {
    const blocked = error instanceof OfficialSocialPublicationBlockedError;
    res.status(blocked ? 409 : 400).json({
      message: String(error?.message || "Official social publication failed"),
      code: blocked ? error.code : "OFFICIAL_SOCIAL_PUBLICATION_FAILED",
      ...(blocked ? { blockers: error.blockers } : {}),
      automaticRetryStarted: false,
      credentialsExposed: false,
    });
  }
});

router.post("/marketing/media/:id/publications/:attemptId/continue", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    const attemptId = String(req.params?.attemptId || "").trim();
    if (!id || !attemptId) return res.status(400).json({ message: "media id and attempt id are required" });
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const result = await continueOfficialSocialPublication({
      tenantId: tenant.id,
      mediaItemId: id,
      attemptId,
      actorUserId,
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    const blocked = error instanceof OfficialSocialPublicationBlockedError;
    res.status(blocked ? 409 : 400).json({
      message: String(error?.message || "Official social publication continuation failed"),
      code: blocked ? error.code : "OFFICIAL_SOCIAL_PUBLICATION_FAILED",
      ...(blocked ? { blockers: error.blockers } : {}),
      automaticRetryStarted: false,
      credentialsExposed: false,
    });
  }
});

router.post("/marketing/media/:id/rights/grants", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const state = await grantMediaRights({
      tenantId: tenant.id,
      mediaItemId: id,
      actorUserId,
      confirmed: req.body?.confirmed === true,
      source: req.body?.source && typeof req.body.source === "object" ? req.body.source : {},
      grant: req.body?.grant && typeof req.body.grant === "object" ? req.body.grant : {},
    });
    res.status(201).json({ ok: true, ...state });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to grant media rights") });
  }
});

router.post("/marketing/media/:id/rights/grants/:grantId/revoke", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    const grantId = Number(req.params?.grantId);
    if (!id || !Number.isFinite(grantId)) return res.status(400).json({ message: "invalid id" });
    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const state = await revokeMediaRights({
      tenantId: tenant.id,
      mediaItemId: id,
      grantId,
      actorUserId,
      reason: String(req.body?.reason || ""),
    });
    res.json({ ok: true, ...state });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to revoke media rights") });
  }
});

router.post("/marketing/media/:id/rights/takedown", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });

    const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
    const state = await setMediaSourceTakedownState({
      tenantId: tenant.id,
      mediaItemId: id,
      actorUserId,
      action: req.body?.action,
      reason: req.body?.reason || req.body?.takedownReason || null,
      evidence: req.body?.evidence || {
        reference: req.body?.evidenceReference || null,
        notes: req.body?.notes || req.body?.evidenceNotes || null,
      },
      confirmed: req.body?.confirmed === true,
    });
    res.status(state.sourceReference ? 200 : 201).json({ ok: true, ...state });
  } catch (error: any) {
    res.status(400).json({ message: String(error?.message || "Failed to update media source takedown state") });
  }
});

router.post("/marketing/media", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const title = scrubLegacyBranding(req.body?.title).trim();
    const url = scrubLegacyBranding(req.body?.url).trim();
    if (!title) return res.status(400).json({ message: "title required" });
    if (!url) return res.status(400).json({ message: "url required" });
    const requestedStatus = parseMediaStatus(req.body?.status, "discovered");
    if (requestedStatus === "published") {
      return res.status(409).json({
        message: "Create the source reference and rights grant, then use the governed Publish action.",
        code: "MEDIA_PUBLICATION_BLOCKED",
        blockers: ["source_content_reference_required", "active_rights_grant_required"],
      });
    }

    const now = new Date();
    const id = String(req.body?.id || crypto.randomUUID());
    const featured = hasBodyField(req.body, "featured") ? parseBoolean(req.body?.featured, false) : undefined;
    const rawPayload = withFeaturedRaw(req.body?.raw && typeof req.body.raw === "object" ? req.body.raw : {}, featured);
    const [item] = await db
      .insert(marketingMediaItems)
      .values({
        id,
        tenantId: tenant.id,
        type: parseMediaType(req.body?.type),
        title,
        outlet: scrubLegacyBranding(req.body?.outlet).trim() || null,
        url,
        canonicalUrl: scrubLegacyBranding(req.body?.canonicalUrl ?? req.body?.canonical_url).trim() || null,
        publishedAt: normalizeDate(req.body?.publishedAt ?? req.body?.published_at),
        language: String(req.body?.language || "").trim() || null,
        excerpt: scrubLegacyBranding(req.body?.excerpt).trim() || null,
        summaryBullets: parseTags(req.body?.summaryBullets ?? req.body?.summary_bullets),
        summaryParagraph: scrubLegacyBranding(req.body?.summaryParagraph ?? req.body?.summary_paragraph).trim() || null,
        summaryQuality: String((req.body?.summaryQuality ?? req.body?.summary_quality) || "low").trim() || "low",
        tags: parseTags(req.body?.tags),
        thumbnailRemoteUrl: String((req.body?.thumbnailRemoteUrl ?? req.body?.thumbnail_remote_url) || "").trim() || null,
        thumbnailLocalPath: String((req.body?.thumbnailLocalPath ?? req.body?.thumbnail_local_path) || "").trim() || null,
        mediaEmbedUrl: String((req.body?.mediaEmbedUrl ?? req.body?.media_embed_url) || "").trim() || null,
        author: scrubLegacyBranding(req.body?.author).trim() || null,
        sourceQueries: parseTags(req.body?.sourceQueries ?? req.body?.source_queries),
        relevanceScore: Number.isFinite(Number(req.body?.relevanceScore)) ? Number(req.body.relevanceScore) : 0.5,
        confidenceScore: Number.isFinite(Number(req.body?.confidenceScore)) ? Number(req.body.confidenceScore) : 0.5,
        duplicateOf: String((req.body?.duplicateOf ?? req.body?.duplicate_of) || "").trim() || null,
        status: requestedStatus,
        raw: rawPayload,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, item: { ...item, featured: readFeatured(item.raw) } });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "URL already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to create media item" });
  }
});

router.patch("/marketing/media/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingMediaItems.findFirst({
      where: and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "media item not found" });

    const titleInput = scrubLegacyBranding(req.body?.title).trim();
    const nextTitle = titleInput || current.title;
    const nextUrl =
      hasBodyField(req.body, "url")
        ? scrubLegacyBranding(req.body?.url).trim() || current.url
        : current.url;
    const nextPublishedAt =
      hasBodyField(req.body, "publishedAt") || hasBodyField(req.body, "published_at")
        ? normalizeDate(req.body?.publishedAt ?? req.body?.published_at)
        : current.publishedAt;
    const nextStatus = hasBodyField(req.body, "status") ? parseMediaStatus(req.body?.status, current.status) : current.status;
    if (current.status !== "published" && nextStatus === "published") {
      return res.status(409).json({
        message: "Save the review first, then use the governed Publish action so rights evidence is evaluated and audited.",
        code: "MEDIA_PUBLICATION_ACTION_REQUIRED",
      });
    }
    const nextType = hasBodyField(req.body, "type") ? parseMediaType(req.body?.type, current.type) : current.type;
    const nextFeatured = hasBodyField(req.body, "featured") ? parseBoolean(req.body?.featured, readFeatured(current.raw)) : undefined;
    const nextRawBase =
      hasBodyField(req.body, "raw") && req.body?.raw && typeof req.body.raw === "object" ? req.body.raw : current.raw;
    const nextRaw = withFeaturedRaw(nextRawBase, nextFeatured);

    const [item] = await db
      .update(marketingMediaItems)
      .set({
        type: nextType as any,
        title: nextTitle,
        outlet: hasBodyField(req.body, "outlet") ? scrubLegacyBranding(req.body?.outlet).trim() || null : current.outlet,
        url: nextUrl,
        canonicalUrl:
          hasBodyField(req.body, "canonicalUrl") || hasBodyField(req.body, "canonical_url")
            ? scrubLegacyBranding(req.body?.canonicalUrl ?? req.body?.canonical_url).trim() || null
            : current.canonicalUrl,
        publishedAt: nextPublishedAt,
        language: hasBodyField(req.body, "language") ? String(req.body?.language || "").trim() || null : current.language,
        excerpt: hasBodyField(req.body, "excerpt") ? scrubLegacyBranding(req.body?.excerpt).trim() || null : current.excerpt,
        summaryBullets:
          hasBodyField(req.body, "summaryBullets") || hasBodyField(req.body, "summary_bullets")
            ? parseTags(req.body?.summaryBullets ?? req.body?.summary_bullets)
            : current.summaryBullets,
        summaryParagraph:
          hasBodyField(req.body, "summaryParagraph") || hasBodyField(req.body, "summary_paragraph")
            ? scrubLegacyBranding(req.body?.summaryParagraph ?? req.body?.summary_paragraph).trim() || null
            : current.summaryParagraph,
        summaryQuality:
          hasBodyField(req.body, "summaryQuality") || hasBodyField(req.body, "summary_quality")
            ? String((req.body?.summaryQuality ?? req.body?.summary_quality) || "low").trim() || "low"
            : current.summaryQuality,
        tags: hasBodyField(req.body, "tags") ? parseTags(req.body?.tags) : current.tags,
        thumbnailRemoteUrl:
          hasBodyField(req.body, "thumbnailRemoteUrl") || hasBodyField(req.body, "thumbnail_remote_url")
            ? String((req.body?.thumbnailRemoteUrl ?? req.body?.thumbnail_remote_url) || "").trim() || null
            : current.thumbnailRemoteUrl,
        thumbnailLocalPath:
          hasBodyField(req.body, "thumbnailLocalPath") || hasBodyField(req.body, "thumbnail_local_path")
            ? String((req.body?.thumbnailLocalPath ?? req.body?.thumbnail_local_path) || "").trim() || null
            : current.thumbnailLocalPath,
        mediaEmbedUrl:
          hasBodyField(req.body, "mediaEmbedUrl") || hasBodyField(req.body, "media_embed_url")
            ? String((req.body?.mediaEmbedUrl ?? req.body?.media_embed_url) || "").trim() || null
            : current.mediaEmbedUrl,
        author: hasBodyField(req.body, "author") ? scrubLegacyBranding(req.body?.author).trim() || null : current.author,
        sourceQueries:
          hasBodyField(req.body, "sourceQueries") || hasBodyField(req.body, "source_queries")
            ? parseTags(req.body?.sourceQueries ?? req.body?.source_queries)
            : current.sourceQueries,
        relevanceScore: hasBodyField(req.body, "relevanceScore") ? parseScore(req.body?.relevanceScore, current.relevanceScore) : current.relevanceScore,
        confidenceScore:
          hasBodyField(req.body, "confidenceScore") ? parseScore(req.body?.confidenceScore, current.confidenceScore) : current.confidenceScore,
        duplicateOf:
          hasBodyField(req.body, "duplicateOf") || hasBodyField(req.body, "duplicate_of")
            ? String((req.body?.duplicateOf ?? req.body?.duplicate_of) || "").trim() || null
            : current.duplicateOf,
        status: nextStatus as any,
        raw: nextRaw,
        updatedAt: new Date(),
      })
      .where(and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)))
      .returning();

    res.json({ ok: true, item: { ...item, featured: readFeatured(item.raw) } });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "URL already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to update media item" });
  }
});

router.post("/marketing/media/:id/verify", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingMediaItems.findFirst({
      where: and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "media item not found" });

    const target = String(current.canonicalUrl || current.url || "").trim();
    const result = await checkUrlOk(target);

    const rawNext = current.raw && typeof current.raw === "object" ? { ...(current.raw as Record<string, unknown>) } : {};
    (rawNext as any).linkCheck = { ok: result.ok, status: result.status, checkedAt: new Date().toISOString() };

    await db
      .update(marketingMediaItems)
      .set({ raw: rawNext as any, updatedAt: new Date() })
      .where(and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)));

    res.json({ ok: true, id, verified: result.ok, status: result.status });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to verify url" });
  }
});

router.delete("/marketing/media/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });

    const rows = await db
      .delete(marketingMediaItems)
      .where(and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)))
      .returning({ id: marketingMediaItems.id });
    if (!rows.length) return res.status(404).json({ message: "media item not found" });
    res.json({ ok: true, deletedId: rows[0].id });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete media item" });
  }
});

router.post("/marketing/media/bulk", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((item: any) => String(item || "").trim()).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ message: "ids required" });

    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!action) return res.status(400).json({ message: "action required" });

    if (action === "publish") {
      const states = await Promise.all(
        ids.map((mediaItemId: string) =>
          getMediaRightsState({
            tenantId: tenant.id,
            mediaItemId,
            usageType: "organic_publication",
            channel: "web",
            territoryId: null,
          }),
        ),
      );
      const blocked = states
        .filter((state) => state.item.status !== "published" && !state.eligibility.eligible)
        .map((state) => ({ mediaItemId: state.item.id, blockers: state.eligibility.blockers }));
      if (blocked.length) {
        return res.status(409).json({
          message: "Publication blocked by source-rights or consent policy.",
          code: "MEDIA_PUBLICATION_BLOCKED",
          blocked,
        });
      }

      const actorUserId = Number(req.user?.id || req.adminUser?.id || 0) || null;
      const published = [];
      for (const mediaItemId of ids) {
        published.push(
          await publishMediaItemWithRights({
            tenantId: tenant.id,
            mediaItemId,
            actorUserId,
            usageType: "organic_publication",
            channel: "web",
            territoryId: null,
          }),
        );
      }
      return res.json({ ok: true, updated: published.length, status: "published", published });
    }

    if (action === "review" || action === "reject") {
      const status = action === "review" ? "reviewed" : "rejected";
      const items = await db
        .update(marketingMediaItems)
        .set({ status: status as any, updatedAt: new Date() })
        .where(and(eq(marketingMediaItems.tenantId, tenant.id), inArray(marketingMediaItems.id, ids)))
        .returning();
      return res.json({ ok: true, updated: items.length, status });
    }

    if (action === "tag") {
      const tag = String(req.body?.tag || "").trim();
      if (!tag) return res.status(400).json({ message: "tag required" });
      const rows = await db.query.marketingMediaItems.findMany({
        where: and(eq(marketingMediaItems.tenantId, tenant.id), inArray(marketingMediaItems.id, ids)),
      });

      const updates = await Promise.all(
        rows.map((row) => {
          const tags = Array.isArray(row.tags) ? new Set(row.tags.map((item) => String(item || "").trim()).filter(Boolean)) : new Set<string>();
          tags.add(tag);
          return db
            .update(marketingMediaItems)
            .set({ tags: Array.from(tags), updatedAt: new Date() })
            .where(and(eq(marketingMediaItems.id, row.id), eq(marketingMediaItems.tenantId, tenant.id)))
            .returning();
        }),
      );

      const updated = updates.reduce((acc, rows) => acc + rows.length, 0);
      return res.json({ ok: true, updated, tag });
    }

    if (action === "mark_duplicate") {
      const duplicateOf = String(req.body?.duplicateOf || "").trim();
      if (!duplicateOf) return res.status(400).json({ message: "duplicateOf required" });
      const items = await db
        .update(marketingMediaItems)
        .set({ duplicateOf, updatedAt: new Date() })
        .where(and(eq(marketingMediaItems.tenantId, tenant.id), inArray(marketingMediaItems.id, ids)))
        .returning();
      return res.json({ ok: true, updated: items.length, duplicateOf });
    }

    if (action === "feature" || action === "unfeature") {
      const featured = action === "feature";
      const rows = await db.query.marketingMediaItems.findMany({
        where: and(eq(marketingMediaItems.tenantId, tenant.id), inArray(marketingMediaItems.id, ids)),
      });
      const updates = await Promise.all(
        rows.map((row) =>
          db
            .update(marketingMediaItems)
            .set({ raw: withFeaturedRaw(row.raw, featured), updatedAt: new Date() })
            .where(and(eq(marketingMediaItems.id, row.id), eq(marketingMediaItems.tenantId, tenant.id)))
            .returning({ id: marketingMediaItems.id }),
        ),
      );
      const updated = updates.reduce((acc, batch) => acc + batch.length, 0);
      return res.json({ ok: true, updated, featured });
    }

    return res.status(400).json({ message: "unsupported action" });
  } catch (error: any) {
    if (error instanceof MediaPublicationBlockedError) {
      return res.status(409).json({
        message: "Publication blocked by source-rights or consent policy.",
        code: "MEDIA_PUBLICATION_BLOCKED",
        gate: error.gate,
      });
    }
    res.status(500).json({ message: error?.message || "Failed bulk update" });
  }
});

router.get("/marketing/media/runs", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 20, 100);
    const items = await db.query.marketingMediaRuns.findMany({
      where: eq(marketingMediaRuns.tenantId, tenant.id),
      orderBy: [desc(marketingMediaRuns.startedAt)],
      limit,
    });
    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list media runs" });
  }
});

router.get("/marketing/media/sources", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 40, 200);
    const runId = String(req.query?.runId || "").trim();
    const conditions = [eq(marketingMediaSources.tenantId, tenant.id)];
    if (runId) conditions.push(eq(marketingMediaSources.runId, runId));

    const items = await db
      .select()
      .from(marketingMediaSources)
      .where(and(...conditions))
      .orderBy(desc(marketingMediaSources.fetchedAt))
      .limit(limit);
    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list media sources" });
  }
});

router.get("/marketing/assets", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 100, 400);
    const q = String(req.query?.q || "").trim();
    const conditions = [eq(marketingAssets.tenantId, tenant.id)];
    if (q) conditions.push(or(ilike(marketingAssets.title, `%${q}%`), ilike(marketingAssets.key, `%${q}%`), ilike(marketingAssets.localPath, `%${q}%`)) as any);

    const items = await db
      .select()
      .from(marketingAssets)
      .where(and(...conditions))
      .orderBy(desc(marketingAssets.updatedAt))
      .limit(limit);

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list marketing assets" });
  }
});

export default router;
