import { Router } from "express";
import dns from "node:dns/promises";
import multer from "multer";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeContentBlocks,
  agoojyeCrmActivities,
  agoojyeCrmContacts,
  agoojyeCrmOrganizations,
  agoojyeAgentResearchRecords,
  agoojyeBackgroundJobs,
  agoojyeDocuments,
  agoojyeEmailTemplates,
  agoojyeEmailIdentities,
  agoojyeImportBatches,
  agoojyeInternalMessageRecipients,
  agoojyeInternalMessages,
  agoojyeMailMessages,
  agoojyeMailThreads,
  agoojyeMediaAssets,
  agoojyeMilestones,
  agoojyeOutreachApprovals,
  agoojyeOutreachSequences,
  agoojyeSequenceEnrollments,
  agoojyeParticipants,
  agoojyePartners,
  agoojyePermissions,
  agoojyePipelineStages,
  agoojyeProjectUsers,
  agoojyeRoles,
  agoojyeSponsorCategories,
  agoojyeSponsorLeads,
  agoojyeSponsorOpportunities,
  agoojyeSuppressionEntries,
  agoojyeTasks,
  agoojyeTeams,
  agoojyeTenantEmailSettings,
  agoojyeToolboxAssets,
} from "@db/schema";

import { ensureTenantAdmin } from "./utils/auth";
import { runMailIndexer } from "../lib/mail/indexer";
import { ensureAgoojiyeHumanMailProfiles, syncAgoojiyeUnifiedInbox } from "../lib/agoojye/mailBridge";
import {
  hasForbiddenAgoojiyeSmtpSecret,
  sanitizeAgoojiyeEmailSettingsRow,
} from "../lib/agoojye/emailSettingsPolicy";
import {
  AGOOJIYE_IMPORT_FIELDS,
  importDedupeKey,
  inferAgoojiyeImportMapping,
  isAgoojiyeImportTarget,
  normalizeAgoojiyeImportRows,
  parseAgoojiyeImportFile,
  parseAgoojiyeImportMapping,
  type AgoojiyeImportTarget,
} from "../lib/agoojye/pipelineImport";
import { deliverApprovedAgoojiyeOutreach } from "../lib/agoojye/outreachDelivery";
import {
  enqueueAgoojiyeJob,
  isAgoojiyeJobType,
  runAgoojiyeJobWorkerOnce,
} from "../lib/agoojye/jobWorker";
import { runAgoojiyePublicSourceResearch } from "../lib/agoojye/publicSourceResearch";
import {
  buildAgoojiyeResearchDraft,
  buildAgoojiyeResearchSummary,
  scoreAgoojiyeResearch,
} from "../lib/agoojye/researchPolicy";
import {
  activateAgoojiyeSequence,
  AgoojiyeSequenceError,
  enrollAgoojiyeSequence,
  stopAgoojiyeSequenceEnrollment,
} from "../lib/agoojye/sequenceService";

const router = Router();
const publicApi = Router();
const adminApi = Router();
const pipelineImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const seededTenants = new Set<number>();
const publicRateBuckets = new Map<string, { count: number; resetAt: number }>();

const PERMISSIONS = [
  "view_public_content",
  "edit_public_content",
  "manage_users",
  "manage_teams",
  "manage_partners",
  "manage_sponsors",
  "manage_documents",
  "manage_media",
  "manage_tasks",
  "manage_emails",
  "send_internal_messages",
  "view_internal_messages",
  "create_announcements",
  "approve_participants",
  "assign_official_roles",
  "provision_email_identity",
  "view_audit_logs",
];

const ROLES = [
  ["super-admin", "Super Admin", PERMISSIONS],
  ["tenant-admin", "Tenant Admin", PERMISSIONS],
  ["project-director", "Project Director", PERMISSIONS],
  ["project-coordinator", "Project Coordinator", PERMISSIONS.filter((key) => key !== "view_audit_logs")],
  ["team-lead", "Team Lead", ["manage_tasks", "send_internal_messages", "view_internal_messages", "approve_participants"]],
  ["contributor", "Contributor", ["view_internal_messages", "send_internal_messages"]],
  ["participant", "Participant", ["view_internal_messages"]],
  ["sponsor", "Sponsor", ["view_public_content"]],
  ["partner", "Partner", ["view_public_content"]],
  ["media", "Media", ["view_public_content"]],
  ["viewer", "Viewer", ["view_public_content"]],
] as const;

const TEAMS = [
  ["leadership-coordination", "Direction & coordination", "Coordonner les décisions, la cadence, les arbitrages et les relations institutionnelles."],
  ["engineering", "Ingénierie", "Concevoir, valider et assembler les systèmes mécaniques, électriques et de sécurité du prototype."],
  ["design", "Design", "Définir l'identité produit, les interfaces, l'expérience passager et les supports visuels."],
  ["software-ai", "Logiciel & IA", "Construire les outils numériques, la documentation technique et les workflows d'intelligence opérationnelle."],
  ["communication-media", "Communication & médias", "Produire la narration, la presse, le documentaire et la visibilité publique du mouvement."],
  ["legal-governance", "Juridique & gouvernance", "Structurer les accords, la gouvernance, les risques, les NDA et la conformité."],
  ["sponsorship-partnerships", "Sponsoring & partenariats", "Organiser les sponsors, partenaires, prospects, packages et suivis commerciaux."],
  ["industrial-supply-chain", "Industrie & chaîne d'approvisionnement", "Piloter les fournisseurs, pièces, BOM, logistique, atelier et trajectoire d'industrialisation."],
  ["schools-talent", "Écoles & talents", "Mobiliser les écoles, les profils techniques et le pipeline de talents."],
] as const;

const EMAIL_ALIASES = [
  "contact@agoojiye.com",
  "hello@agoojiye.com",
  "team@agoojiye.com",
  "admin@agoojiye.com",
  "engineering@agoojiye.com",
  "software@agoojiye.com",
  "design@agoojiye.com",
  "careers@agoojiye.com",
  "media@agoojiye.com",
  "sponsors@agoojiye.com",
  "partners@agoojiye.com",
  "investors@agoojiye.com",
  "legal@agoojiye.com",
  "privacy@agoojiye.com",
  "press@agoojiye.com",
] as const;

const AGOOJIYE_MAIL_DNS_EXPECTED = {
  domain: "agoojiye.com",
  mailHost: "mail.agoojiye.com",
  ipv4: "51.254.143.30",
  mxHost: "mail.agoojiye.com",
  mxPriority: 10,
  spf: "v=spf1 mx ip4:51.254.143.30 -all",
  dmarc: "v=DMARC1; p=none; rua=mailto:dmarc@agoojiye.com; adkim=s; aspf=s",
  dkimHost: "mail._domainkey.agoojiye.com",
  dkimSelector: "mail",
} as const;

const PARTNERS = [
  {
    name: "Exportunity Machinery",
    category: "Initiator",
    status: "Confirmed",
    description: "Initiateur et porteur de la vision industrielle de mobilité électrique.",
  },
  {
    name: "Future Studio",
    category: "Co-lead / Accelerator Partner",
    status: "Confirmed",
    description: "Partenaire co-lead pour l'accélération, le digital, le design et la coordination innovation.",
  },
  {
    name: "GDIZ",
    category: "Industrial Partners",
    status: "Institutional stakeholder",
    description: "Écosystème industriel et ambition de production locale à structurer.",
  },
  {
    name: "Écoles techniques",
    category: "Schools & Universities",
    status: "Technical contributor",
    description: "Viviers de talents techniques, étudiants, encadreurs et contributeurs.",
  },
  {
    name: "Sponsors",
    category: "Sponsors",
    status: "Sponsor prospect",
    description: "Entreprises et institutions appelées à soutenir le Challenge Véhicule Électrique.",
  },
  {
    name: "Partenaires institutionnels",
    category: "Institutional Partners",
    status: "Institutional stakeholder",
    description: "Acteurs publics et institutionnels à mobiliser autour du mouvement industriel.",
  },
] as const;

const MILESTONES = [
  ["Préparation du projet", "Préparation du projet, cadrage et mobilisation initiale.", "2026-06-01T00:00:00.000Z", "in_progress", "Exportunity Machinery", "public"],
  ["Formation des équipes", "Formation des équipes techniques et opérationnelles.", "2026-06-15T00:00:00.000Z", "planned", "Coordination", "public"],
  ["Validation technique", "Validation technique, fournisseurs, BOM et faisabilité.", "2026-07-01T00:00:00.000Z", "planned", "Ingénierie", "public"],
  ["Assemblage du prototype", "Assemblage du prototype avant la phase publique.", "2026-07-08T00:00:00.000Z", "planned", "Ingénierie", "private"],
  ["Assemblage public", "Assemblage public cible du bus électrique.", "2026-07-15T00:00:00.000Z", "planned", "AGOOJIYE Team", "public"],
  ["Reveal gala", "Gala de révélation cible et présentation institutionnelle.", "2026-07-25T00:00:00.000Z", "planned", "Communication & médias", "public"],
  ["Production documentaire", "Production documentaire fin juillet.", "2026-07-28T00:00:00.000Z", "planned", "Média", "public"],
  ["Sortie publique de la vidéo", "Publication publique cible de la vidéo documentaire.", "2026-08-01T00:00:00.000Z", "planned", "Média", "public"],
  ["Exposition du bus et collecte d'intérêts", "Exposition du bus et collecte d'intérêts commerciaux après révélation.", "2026-08-05T00:00:00.000Z", "planned", "Partenariats", "public"],
  ["Mobilisation de capital", "Mobilisation de capital pour la société de véhicules électriques.", "2026-08-15T00:00:00.000Z", "planned", "Leadership", "private"],
] as const;

const DOCUMENTS = [
  ["Plan stratégique", "Strategy", "Plan directeur industriel et narratif."],
  ["Dossier sponsor", "Sponsorship", "Offres de visibilité sponsors."],
  ["NDA", "NDA", "Accord de confidentialité participants et partenaires."],
  ["Accord participant", "Legal", "Engagement des contributeurs du challenge."],
  ["Organigramme des équipes", "Strategy", "Structure des équipes et rôles confirmés."],
  ["Nomenclature technique", "Technical", "BOM et liste technique du prototype."],
  ["Liste fournisseurs", "Partner documents", "Fournisseurs et statuts de discussion."],
  ["Note conceptuelle du gala", "Communication", "Concept note du reveal gala."],
  ["Concept documentaire", "Media", "Note de production documentaire."],
  ["Note de structuration juridique", "Legal", "Structuration juridique de la future société."],
  ["Plan d'homologation", "Technical", "Plan d'homologation et sécurité."],
] as const;

const MEDIA_ASSETS = [
  {
    title: "Logo horizontal officiel AGOOJIYE",
    description: "Wordmark et embleme officiels pour le site, les documents et les signatures. Ne pas redessiner.",
    mediaType: "brand_asset",
    fileUrl: "/brand/agoojiye/logo/agoojiye-logo-horizontal.png",
    thumbnailUrl: "/brand/agoojiye/logo/agoojiye-logo-horizontal.png",
    category: "brand",
    tags: ["logo", "wordmark", "officiel"],
  },
  {
    title: "Logo principal officiel AGOOJIYE",
    description: "Composition principale officielle avec embleme et wordmark, a utiliser comme source de marque.",
    mediaType: "brand_asset",
    fileUrl: "/brand/agoojiye/logo/agoojiye-logo-primary.png",
    thumbnailUrl: "/brand/agoojiye/logo/agoojiye-logo-primary.png",
    category: "brand",
    tags: ["logo", "embleme", "officiel"],
  },
  {
    title: "Hero shuttle AGOOJIYE",
    description: "Bannière principale du shuttle électrique, optimisée pour la page d'accueil.",
    mediaType: "image",
    fileUrl: "/brand/agoojiye/vehicle/hero/agoojiye-shuttle-hero-1280.webp",
    thumbnailUrl: "/brand/agoojiye/vehicle/hero/agoojiye-shuttle-hero-640.webp",
    category: "vehicle",
    tags: ["shuttle", "hero", "vehicule"],
  },
  {
    title: "Profil lateral du shuttle",
    description: "Vue de profil du shuttle pour les supports de vision, produit et dossier sponsor.",
    mediaType: "image",
    fileUrl: "/brand/agoojiye/vehicle/sections/agoojiye-shuttle-side-profile-1280.webp",
    thumbnailUrl: "/brand/agoojiye/vehicle/sections/agoojiye-shuttle-side-profile-1280.webp",
    category: "vehicle",
    tags: ["shuttle", "profil", "vehicule"],
  },
  {
    title: "Atelier et construction",
    description: "Image de contexte industriel pour les pages média, documentaire et communication.",
    mediaType: "documentary",
    fileUrl: "/brand/agoojiye/vehicle/sections/agoojiye-shuttle-factory-1280.webp",
    thumbnailUrl: "/brand/agoojiye/vehicle/sections/agoojiye-shuttle-factory-1280.webp",
    category: "documentary",
    tags: ["atelier", "documentaire", "industrie"],
  },
  {
    title: "Detail badge avant",
    description: "Detail automobile sobre du badge AGOOJIYE pour les usages de marque et produit.",
    mediaType: "image",
    fileUrl: "/brand/agoojiye/vehicle/details/agoojiye-shuttle-front-badge-detail-960.webp",
    thumbnailUrl: "/brand/agoojiye/vehicle/details/agoojiye-shuttle-front-badge-detail-960.webp",
    category: "vehicle",
    tags: ["badge", "detail", "marque"],
  },
  {
    title: "Image sociale AGOOJIYE",
    description: "Image Open Graph pour le partage public du site AGOOJIYE.",
    mediaType: "press_release",
    fileUrl: "/brand/agoojiye/og/agoojiye-og-image.webp",
    thumbnailUrl: "/brand/agoojiye/og/agoojiye-og-image.webp",
    category: "press",
    tags: ["og", "presse", "partage"],
  },
] as const;

const SPONSOR_CATEGORIES = [
  ["founding-partner", "Partenaire fondateur", "Association stratégique de long terme, visibilité de lancement et reconnaissance fondatrice."],
  ["talent-partner", "Partenaire talents", "Formation, stages, mobilisation des écoles et développement des compétences."],
  ["industrial-partner", "Partenaire industriel", "Composants, outillage, fabrication, expertise technique et capacité industrielle locale."],
  ["energy-partner", "Partenaire énergie", "Recharge, batteries, infrastructure énergétique et support opérationnel."],
  ["media-partner", "Partenaire média", "Documentaire, presse, histoires des constructeurs, Demo Day et amplification publique."],
] as const;

const PIPELINE_STAGES = [
  ["target-identified", "Cible identifiée", "active", false],
  ["research-in-progress", "Recherche en cours", "active", false],
  ["contact-identified", "Contact identifié", "active", false],
  ["contact-verified", "Contact vérifié", "active", false],
  ["qualified", "Qualifié", "active", false],
  ["draft-prepared", "Brouillon préparé", "active", false],
  ["awaiting-approval", "En attente d'approbation", "approval", false],
  ["initial-contact-sent", "Premier contact envoyé", "outreach", false],
  ["follow-up-due", "Relance à faire", "outreach", false],
  ["reply-received", "Réponse reçue", "reply", false],
  ["meeting-scheduled", "Réunion planifiée", "meeting", false],
  ["proposal-requested", "Proposition demandée", "proposal", false],
  ["proposal-sent", "Proposition envoyée", "proposal", false],
  ["due-diligence", "Due diligence", "proposal", false],
  ["negotiation", "Négociation", "proposal", false],
  ["committed", "Engagé", "closed_positive", false],
  ["won", "Gagné", "closed_positive", true],
  ["paused", "En pause", "closed_neutral", false],
  ["lost", "Perdu", "closed_negative", true],
  ["do-not-contact", "Ne pas contacter", "closed_negative", true],
] as const;

const TOOLBOX_ASSETS = [
  ["AGOOJIYE project one-page summary", "Core", "document"],
  ["Project presentation deck", "Core", "deck"],
  ["Vehicle fact sheet", "Core", "document"],
  ["Approved project timeline", "Core", "document"],
  ["Approved team overview", "Core", "document"],
  ["Brand and logo package", "Brand", "asset_package"],
  ["Approved vehicle images", "Brand", "image_set"],
  ["Website banners", "Brand", "image_set"],
  ["Press kit", "Media", "press_kit"],
  ["Frequently asked questions", "Core", "document"],
  ["Approved public claims", "Governance", "claim_register"],
  ["Prohibited or unverified claims", "Governance", "claim_register"],
  ["Meeting preparation checklist", "Sales", "checklist"],
  ["Meeting notes template", "Sales", "template"],
  ["Sponsor proposal template", "Sales", "template"],
  ["Follow-up templates", "Sales", "template"],
  ["Email signature templates", "Communications", "template"],
  ["Due-diligence document checklist", "Governance", "checklist"],
] as const;

const TEMPLATE_GROUPS = [
  "Initial introduction",
  "Warm introduction",
  "Referral request",
  "Follow-up 1",
  "Follow-up 2",
  "Meeting confirmation",
  "Meeting follow-up",
  "Information package delivery",
  "Proposal delivery",
  "Thank-you message",
  "Pause message",
  "Decline acknowledgment",
  "Media introduction",
] as const;

const CONTENT_BLOCKS = [
  {
    page: "home",
    section: "hero",
    key: "main",
    titleFr: "AGOOJIYE",
    titleEn: "AGOOJIYE",
    contentFr:
      "Fait au Bénin. Conçu pour l'Afrique. Regardé par le monde. Un mouvement industriel de mobilité électrique inspiré par l'héritage des Amazones du Dahomey.",
    contentEn: "Made in Benin. Built for Africa. Watched by the World.",
    imageUrl: "/brand/agoojiye/vehicle/hero/agoojiye-shuttle-hero-1280.webp",
  },
  {
    page: "vision",
    section: "statement",
    key: "industrial-movement",
    titleFr: "L'Afrique ne fera pas que consommer le futur. Elle le construira.",
    titleEn: "Africa will not only consume the future. Africa will build it.",
    contentFr:
      "AGOOJIYE pose les bases d'une capacite industrielle beninoise pour concevoir, assembler et industrialiser des solutions de transport propres adaptees au continent.",
    contentEn:
      "AGOOJIYE lays the foundation for Beninese industrial capacity in clean transport solutions adapted to Africa.",
  },
  {
    page: "challenge",
    section: "dates",
    key: "editable-project-dates",
    titleFr: "Dates cibles du Challenge Véhicule Électrique",
    titleEn: "Electric Vehicle Challenge target dates",
    contentFr: "Preparation en juin 2026, assemblage public le 15 juillet 2026, reveal gala le 25 juillet 2026.",
    contentEn: "Preparation in June 2026, live assembly on July 15, 2026, reveal gala on July 25, 2026.",
    metadataJson: {
      preChallenge: "June 2026",
      liveAssembly: "2026-07-15",
      revealGala: "2026-07-25",
      documentary: "late July 2026",
      publicRelease: "2026-08-01",
    },
  },
];

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDnsName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.]$/g, "");
}

function normalizeTxtValue(value: unknown) {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

function flattenTxtRecords(records: string[][]) {
  return records.map((parts) => parts.join("").trim()).filter(Boolean);
}

async function resolveDnsSafe<T>(lookup: () => Promise<T>, fallback: T) {
  try {
    return await lookup();
  } catch {
    return fallback;
  }
}

function slugify(value: unknown, fallback = "item") {
  const slug = normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function parseDate(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseList(value: unknown) {
  if (Array.isArray(value)) return Array.from(new Set(value.map((entry) => normalizeText(entry)).filter(Boolean)));
  const raw = normalizeText(value);
  if (!raw) return [];
  return Array.from(new Set(raw.split(",").map((entry) => normalizeText(entry)).filter(Boolean)));
}

function splitContactName(value: unknown) {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function inferSponsorCategorySlug(value: unknown) {
  const raw = normalizeText(value).toLowerCase();
  if (/media|press|documentary|presse/.test(raw)) return "media-partner";
  if (/talent|school|student|university|ecole|formation|stage/.test(raw)) return "talent-partner";
  if (/energy|charging|battery|recharge|energie/.test(raw)) return "energy-partner";
  if (/industrial|supplier|manufact|component|industrie|fournisseur|technique/.test(raw)) return "industrial-partner";
  return "founding-partner";
}

async function upsertSponsorCrmFromLead(
  tenantId: number,
  input: {
    companyName: string;
    contactPerson: string;
    email: string;
    phone?: string | null;
    interest?: string | null;
    message?: string | null;
    source: string;
    leadId?: number | null;
  },
) {
  const now = new Date();
  const categorySlug = inferSponsorCategorySlug(input.interest || input.message || input.source);
  const [category] = await db.select().from(agoojyeSponsorCategories).where(and(eq(agoojyeSponsorCategories.tenantId, tenantId), eq(agoojyeSponsorCategories.slug, categorySlug))).limit(1);
  const [stage] = await db.select().from(agoojyePipelineStages).where(and(eq(agoojyePipelineStages.tenantId, tenantId), eq(agoojyePipelineStages.slug, "target-identified"))).limit(1);
  const [organization] = await db
    .insert(agoojyeCrmOrganizations)
    .values({
      tenantId,
      name: input.companyName,
      sponsorCategoryId: category?.id || null,
      sponsorCategory: category?.name || "Founding Partner",
      priority: "medium",
      pipelineStageId: stage?.id || null,
      source: input.source,
      lastActivityAt: now,
      nextAction: "Vérifier le contact et qualifier l'opportunité.",
      internalNotes: input.message || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [agoojyeCrmOrganizations.tenantId, agoojyeCrmOrganizations.name],
      set: {
        sponsorCategoryId: category?.id || null,
        sponsorCategory: category?.name || "Founding Partner",
        pipelineStageId: stage?.id || null,
        source: input.source,
        lastActivityAt: now,
        nextAction: "Vérifier le contact et qualifier l'opportunité.",
        internalNotes: input.message || null,
        updatedAt: now,
      },
    })
    .returning();

  const split = splitContactName(input.contactPerson);
  const [contact] = await db
    .insert(agoojyeCrmContacts)
    .values({
      tenantId,
      organizationId: organization?.id || null,
      firstName: split.firstName,
      lastName: split.lastName,
      email: input.email,
      phone: input.phone || null,
      preferredLanguage: "fr",
      verificationStatus: "unverified",
      confidenceScore: 50,
      lawfulContactNote: "Soumission volontaire via formulaire public AGOOJIYE.",
      notes: input.message || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [agoojyeCrmContacts.tenantId, agoojyeCrmContacts.email],
      set: {
        organizationId: organization?.id || null,
        firstName: split.firstName,
        lastName: split.lastName,
        phone: input.phone || null,
        lawfulContactNote: "Soumission volontaire via formulaire public AGOOJIYE.",
        notes: input.message || null,
        updatedAt: now,
      },
    })
    .returning();

  const opportunityTitle = `${input.companyName} - ${category?.name || "Sponsor"} opportunity`;
  const [opportunity] = await db
    .insert(agoojyeSponsorOpportunities)
    .values({
      tenantId,
      organizationId: Number(organization?.id),
      contactId: contact?.id || null,
      sponsorCategoryId: category?.id || null,
      stageId: stage?.id || null,
      title: opportunityTitle,
      priority: "medium",
      source: input.source,
      status: "active",
      nextAction: "Vérifier le contact, classifier le besoin et préparer un brouillon approuvable.",
      nextActionDate: now,
      lastActivityAt: now,
      internalNotes: input.message || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [agoojyeSponsorOpportunities.tenantId, agoojyeSponsorOpportunities.title],
      set: {
        contactId: contact?.id || null,
        sponsorCategoryId: category?.id || null,
        stageId: stage?.id || null,
        source: input.source,
        lastActivityAt: now,
        internalNotes: input.message || null,
        updatedAt: now,
      },
    })
    .returning();

  await db.insert(agoojyeCrmActivities).values({
    tenantId,
    organizationId: organization?.id || null,
    contactId: contact?.id || null,
    opportunityId: opportunity?.id || null,
    activityType: "public_form",
    channel: "website",
    subject: input.interest || "Public AGOOJIYE inquiry",
    body: input.message || null,
    outcome: "crm_record_created",
    metadata: { leadId: input.leadId || null, source: input.source },
    createdAt: now,
    updatedAt: now,
  });

  return { organizationId: organization?.id || null, contactId: contact?.id || null, opportunityId: opportunity?.id || null };
}

async function createInboxRecordFromPublicLead(
  tenantId: number,
  input: {
    source: string;
    subject: string;
    senderName: string;
    senderEmail: string;
    targetEmail: string;
    body?: string | null;
    tags?: string[];
    organizationId?: number | null;
    contactId?: number | null;
    opportunityId?: number | null;
    leadId?: number | null;
  },
) {
  const now = new Date();
  const preview = normalizeText(input.body).slice(0, 220);
  const [thread] = await db
    .insert(agoojyeMailThreads)
    .values({
      tenantId,
      organizationId: input.organizationId || null,
      contactId: input.contactId || null,
      opportunityId: input.opportunityId || null,
      direction: "inbound",
      subject: normalizeText(input.subject) || "Message public AGOOJIYE",
      status: "open",
      source: input.source,
      lastMessageAt: now,
      tags: input.tags || [],
      internalNotes: input.leadId ? `Lead public #${input.leadId}` : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const [message] = await db
    .insert(agoojyeMailMessages)
    .values({
      tenantId,
      threadId: Number(thread.id),
      fromEmail: normalizeText(input.senderEmail).toLowerCase(),
      toEmails: [normalizeText(input.targetEmail).toLowerCase()].filter(Boolean),
      subject: normalizeText(input.subject) || "Message public AGOOJIYE",
      bodyText: normalizeText(input.body) || null,
      bodyPreview: preview || null,
      direction: "inbound",
      deliveryStatus: "received",
      receivedAt: now,
      attachmentMetadata: {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return { threadId: Number(thread.id), messageId: Number(message.id) };
}

function actor(req: any) {
  return normalizeText(req.adminUser?.email || req.adminUser?.displayName || "admin");
}

function actorUserId(req: any) {
  const value = Number(req.adminUser?.id || req.tenantUser?.id || req.staffUser?.id || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function ensureAgoojyeTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant || String(tenant.key || "").trim().toLowerCase() !== "agoojye") {
    res.status(404).json({ message: "Les routes AGOOJIYE ne sont pas disponibles sur ce tenant." });
    return null;
  }
  return tenant;
}

function checkPublicRate(req: any, res: any) {
  const key = normalizeText(req.ip || req.headers["x-forwarded-for"] || "unknown").slice(0, 120);
  const nowMs = Date.now();
  const bucket = publicRateBuckets.get(key);
  if (!bucket || bucket.resetAt <= nowMs) {
    publicRateBuckets.set(key, { count: 1, resetAt: nowMs + 10 * 60_000 });
    return true;
  }
  if (bucket.count >= 12) {
    res.status(429).json({ message: "Trop de soumissions. Reessayez dans quelques minutes." });
    return false;
  }
  bucket.count += 1;
  return true;
}

async function audit(tenantId: number, input: { actor?: string; action: string; entityType: string; entityId?: number | null; metadata?: Record<string, unknown> }) {
  await db.insert(agoojyeAuditLogs).values({
    tenantId,
    actor: input.actor || "system",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function existingAgoojiyeImportKeys(tenantId: number, target: AgoojiyeImportTarget, executor: any = db) {
  if (target === "organizations") {
    const rows = await executor.select({ value: agoojyeCrmOrganizations.name }).from(agoojyeCrmOrganizations).where(eq(agoojyeCrmOrganizations.tenantId, tenantId));
    return new Set(rows.map((row: any) => normalizeText(row.value).toLowerCase()).filter(Boolean));
  }
  if (target === "contacts") {
    const rows = await executor.select({ value: agoojyeCrmContacts.email }).from(agoojyeCrmContacts).where(eq(agoojyeCrmContacts.tenantId, tenantId));
    return new Set(rows.map((row: any) => normalizeText(row.value).toLowerCase()).filter(Boolean));
  }
  if (target === "opportunities") {
    const rows = await executor.select({ value: agoojyeSponsorOpportunities.title }).from(agoojyeSponsorOpportunities).where(eq(agoojyeSponsorOpportunities.tenantId, tenantId));
    return new Set(rows.map((row: any) => normalizeText(row.value).toLowerCase()).filter(Boolean));
  }
  const rows = await executor.select({ value: agoojyeToolboxAssets.title }).from(agoojyeToolboxAssets).where(eq(agoojyeToolboxAssets.tenantId, tenantId));
  return new Set(rows.map((row: any) => normalizeText(row.value).toLowerCase()).filter(Boolean));
}

async function findOrCreateImportedOrganization(tx: any, tenantId: number, name: string) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) return null;
  const [existing] = await tx
    .select({ id: agoojyeCrmOrganizations.id })
    .from(agoojyeCrmOrganizations)
    .where(and(eq(agoojyeCrmOrganizations.tenantId, tenantId), sql`lower(${agoojyeCrmOrganizations.name}) = ${normalizedName.toLowerCase()}`))
    .limit(1);
  if (existing?.id) return Number(existing.id);
  const [created] = await tx
    .insert(agoojyeCrmOrganizations)
    .values({ tenantId, name: normalizedName, source: "pipeline_import", priority: "medium", currency: "XOF", createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: agoojyeCrmOrganizations.id });
  if (created?.id) return Number(created.id);
  const [raced] = await tx
    .select({ id: agoojyeCrmOrganizations.id })
    .from(agoojyeCrmOrganizations)
    .where(and(eq(agoojyeCrmOrganizations.tenantId, tenantId), eq(agoojyeCrmOrganizations.name, normalizedName)))
    .limit(1);
  return raced?.id ? Number(raced.id) : null;
}

async function importAgoojiyePipelineRows(input: {
  tenantId: number;
  target: AgoojiyeImportTarget;
  fileName: string;
  sourceType: string;
  mapping: Record<string, string>;
  rows: Array<{ sourceRow: number; data: Record<string, string> }>;
  warnings: Array<{ row: number; message: string }>;
  createdBy: string;
}) {
  const now = new Date();
  const [batch] = await db
    .insert(agoojyeImportBatches)
    .values({
      tenantId: input.tenantId,
      fileName: input.fileName,
      sourceType: input.sourceType,
      targetResource: input.target,
      status: "importing",
      rowCount: input.rows.length + input.warnings.length,
      importedCount: 0,
      skippedCount: input.warnings.length,
      duplicateCount: 0,
      warnings: { rows: input.warnings.slice(0, 100) },
      mappingJson: input.mapping,
      createdBy: input.createdBy,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  try {
    const result = await db.transaction(async (tx) => {
      const existingKeys = await existingAgoojiyeImportKeys(input.tenantId, input.target, tx);
      let importedCount = 0;
      let duplicateCount = 0;

      for (const row of input.rows) {
        const data = row.data;
        const dedupeKey = importDedupeKey(input.target, data);
        if (existingKeys.has(dedupeKey)) {
          duplicateCount += 1;
          continue;
        }

        let inserted: Array<{ id: number }> = [];
        if (input.target === "organizations") {
          inserted = await tx
            .insert(agoojyeCrmOrganizations)
            .values({
              tenantId: input.tenantId,
              name: data.name,
              website: data.website || null,
              country: data.country || null,
              industry: data.industry || null,
              sponsorCategory: data.sponsorCategory || null,
              companySize: data.companySize || null,
              publicDescription: data.publicDescription || null,
              priority: data.priority || "medium",
              estimatedValue: data.estimatedValue || null,
              currency: data.currency || "XOF",
              source: "pipeline_import",
              nextAction: data.nextAction || null,
              internalNotes: data.internalNotes || null,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: agoojyeCrmOrganizations.id });
        } else if (input.target === "contacts") {
          const organizationId = await findOrCreateImportedOrganization(tx, input.tenantId, data.organizationName);
          inserted = await tx
            .insert(agoojyeCrmContacts)
            .values({
              tenantId: input.tenantId,
              organizationId,
              firstName: data.firstName || null,
              lastName: data.lastName || null,
              jobTitle: data.jobTitle || null,
              email: data.email.toLowerCase(),
              phone: data.phone || null,
              country: data.country || null,
              preferredLanguage: data.preferredLanguage || "fr",
              publicSourceUrl: data.publicSourceUrl || null,
              verificationStatus: data.verificationStatus || "unverified",
              confidenceScore: 0,
              lawfulContactNote: data.lawfulContactNote || null,
              notes: data.notes || null,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: agoojyeCrmContacts.id });
        } else if (input.target === "opportunities") {
          const organizationId = await findOrCreateImportedOrganization(tx, input.tenantId, data.organizationName);
          if (!organizationId) throw new Error(`Organisation introuvable a la ligne ${row.sourceRow}.`);
          const [contact] = data.contactEmail
            ? await tx
                .select({ id: agoojyeCrmContacts.id })
                .from(agoojyeCrmContacts)
                .where(and(eq(agoojyeCrmContacts.tenantId, input.tenantId), eq(agoojyeCrmContacts.email, data.contactEmail.toLowerCase())))
                .limit(1)
            : [];
          const [stage] = await tx
            .select({ id: agoojyePipelineStages.id })
            .from(agoojyePipelineStages)
            .where(and(eq(agoojyePipelineStages.tenantId, input.tenantId), eq(agoojyePipelineStages.slug, "target-identified")))
            .limit(1);
          inserted = await tx
            .insert(agoojyeSponsorOpportunities)
            .values({
              tenantId: input.tenantId,
              organizationId,
              contactId: contact?.id || null,
              stageId: stage?.id || null,
              title: data.title,
              priority: data.priority || "medium",
              estimatedValue: data.estimatedValue || null,
              currency: data.currency || "XOF",
              source: "pipeline_import",
              status: "active",
              nextAction: data.nextAction || null,
              internalNotes: data.internalNotes || null,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: agoojyeSponsorOpportunities.id });
        } else {
          inserted = await tx
            .insert(agoojyeToolboxAssets)
            .values({
              tenantId: input.tenantId,
              title: data.title,
              category: data.category || "Core",
              description: data.description || null,
              fileUrl: data.fileUrl || null,
              assetType: data.assetType || "document",
              status: data.status || "needed",
              version: data.version || "1.0",
              tags: parseList(data.tags),
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: agoojyeToolboxAssets.id });
        }

        if (inserted.length) {
          importedCount += 1;
          existingKeys.add(dedupeKey);
        } else {
          duplicateCount += 1;
        }
      }

      return { importedCount, duplicateCount };
    });

    const [completed] = await db
      .update(agoojyeImportBatches)
      .set({
        status: "completed",
        importedCount: result.importedCount,
        duplicateCount: result.duplicateCount,
        skippedCount: input.warnings.length,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(agoojyeImportBatches.tenantId, input.tenantId), eq(agoojyeImportBatches.id, batch.id)))
      .returning();
    return completed;
  } catch (error: any) {
    await db
      .update(agoojyeImportBatches)
      .set({ status: "failed", warnings: { rows: input.warnings.slice(0, 100), error: normalizeText(error?.message || error) }, completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agoojyeImportBatches.tenantId, input.tenantId), eq(agoojyeImportBatches.id, batch.id)));
    throw error;
  }
}

async function ensureAgoojyeSeed(tenantId: number) {
  if (!Number.isFinite(tenantId) || tenantId <= 0) return;
  await ensureAgoojiyeHumanMailProfiles(tenantId);
  if (seededTenants.has(tenantId)) return;
  const now = new Date();
  const legacyBrandMisspelling = ["AGOO", "JYE"].join("");

  await db
    .insert(agoojyePermissions)
    .values(PERMISSIONS.map((key) => ({ tenantId, key, label: key.replace(/_/g, " "), createdAt: now, updatedAt: now })))
    .onConflictDoNothing();

  await db
    .insert(agoojyeRoles)
    .values(
      ROLES.map(([slug, name, permissions]) => ({
        tenantId,
        slug,
        name,
        description: `${name} AGOOJIYE`,
        permissions: [...permissions],
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [agoojyeRoles.tenantId, agoojyeRoles.slug],
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        permissions: sql`excluded.permissions`,
        updatedAt: now,
      },
    });

  await db
    .insert(agoojyeTeams)
    .values(
      TEAMS.map(([slug, name, mission]) => ({
        tenantId,
        slug,
        name,
        mission,
        description: mission,
        status: "active",
        visibility: "public",
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [agoojyeTeams.tenantId, agoojyeTeams.slug],
      set: {
        name: sql`excluded.name`,
        mission: sql`excluded.mission`,
        description: sql`excluded.description`,
        status: sql`excluded.status`,
        visibility: sql`excluded.visibility`,
        updatedAt: now,
      },
    });

  await db
    .insert(agoojyeEmailIdentities)
    .values(
      EMAIL_ALIASES.map((emailAddress) => ({
        tenantId,
        emailAddress,
        displayName: emailAddress.split("@")[0],
        emailType: emailAddress.includes("team@") || emailAddress.includes("admin@") ? "system" : "alias",
        provider: "manual",
        status: "active",
        canSend: true,
        canReceive: true,
        createdBy: "seed",
        notes: "Alias officiel AGOOJIYE. Provisionne sur docker-mailserver ou le fournisseur mail actif.",
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [agoojyeEmailIdentities.tenantId, agoojyeEmailIdentities.emailAddress],
      set: {
        displayName: sql`excluded.display_name`,
        emailType: sql`excluded.email_type`,
        provider: sql`excluded.provider`,
        status: sql`excluded.status`,
        canSend: sql`excluded.can_send`,
        canReceive: sql`excluded.can_receive`,
        notes: sql`excluded.notes`,
        updatedAt: now,
      },
    });

  await db
    .update(agoojyeEmailIdentities)
    .set({
      notes: sql`replace(${agoojyeEmailIdentities.notes}, ${legacyBrandMisspelling}, 'AGOOJIYE')`,
      updatedAt: now,
    })
    .where(and(eq(agoojyeEmailIdentities.tenantId, tenantId), sql`${agoojyeEmailIdentities.notes} like ${`%${legacyBrandMisspelling}%`}`));

  await db
    .insert(agoojyePartners)
    .values(PARTNERS.map((partner) => ({ tenantId, ...partner, visibility: "public", createdAt: now, updatedAt: now })))
    .onConflictDoUpdate({
      target: [agoojyePartners.tenantId, agoojyePartners.name],
      set: {
        category: sql`excluded.category`,
        status: sql`excluded.status`,
        description: sql`excluded.description`,
        visibility: sql`excluded.visibility`,
        updatedAt: now,
      },
    });

  await db
    .insert(agoojyeMilestones)
    .values(
      MILESTONES.map(([title, description, date, status, owner, visibility], index) => ({
        tenantId,
        title,
        description,
        date: parseDate(date),
        status,
        owner,
        visibility,
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [agoojyeMilestones.tenantId, agoojyeMilestones.title],
      set: {
        description: sql`excluded.description`,
        date: sql`excluded.date`,
        status: sql`excluded.status`,
        owner: sql`excluded.owner`,
        visibility: sql`excluded.visibility`,
        sortOrder: sql`excluded.sort_order`,
        updatedAt: now,
      },
    });

  await db
    .insert(agoojyeDocuments)
    .values(
      DOCUMENTS.map(([title, category, description]) => ({
        tenantId,
        title,
        category,
        description,
        status: "draft",
        visibility: "private",
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [agoojyeDocuments.tenantId, agoojyeDocuments.title],
      set: {
        category: sql`excluded.category`,
        description: sql`excluded.description`,
        status: sql`excluded.status`,
        visibility: sql`excluded.visibility`,
        updatedAt: now,
      },
    });

  for (const asset of MEDIA_ASSETS) {
    const [existing] = await db
      .select({ id: agoojyeMediaAssets.id })
      .from(agoojyeMediaAssets)
      .where(and(eq(agoojyeMediaAssets.tenantId, tenantId), eq(agoojyeMediaAssets.title, asset.title)))
      .limit(1);

    const values = {
      tenantId,
      title: asset.title,
      description: asset.description,
      mediaType: asset.mediaType,
      fileUrl: asset.fileUrl,
      thumbnailUrl: asset.thumbnailUrl,
      category: asset.category,
      status: "published",
      visibility: "public",
      tags: [...asset.tags],
      updatedAt: now,
    };

    if (existing?.id) {
      await db.update(agoojyeMediaAssets).set(values).where(eq(agoojyeMediaAssets.id, existing.id));
    } else {
      await db.insert(agoojyeMediaAssets).values({ ...values, createdAt: now });
    }
  }

  await db
    .insert(agoojyeSponsorCategories)
    .values(
      SPONSOR_CATEGORIES.map(([slug, name, description], index) => ({
        tenantId,
        slug,
        name,
        description,
        status: "active",
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [agoojyeSponsorCategories.tenantId, agoojyeSponsorCategories.slug],
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        status: sql`excluded.status`,
        sortOrder: sql`excluded.sort_order`,
        updatedAt: now,
      },
    });

  await db
    .insert(agoojyePipelineStages)
    .values(
      PIPELINE_STAGES.map(([slug, name, stageGroup, isTerminal], index) => ({
        tenantId,
        slug,
        name,
        description: `CRM sponsor: ${name}`,
        stageGroup,
        status: "active",
        isTerminal,
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [agoojyePipelineStages.tenantId, agoojyePipelineStages.slug],
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        stageGroup: sql`excluded.stage_group`,
        status: sql`excluded.status`,
        isTerminal: sql`excluded.is_terminal`,
        sortOrder: sql`excluded.sort_order`,
        updatedAt: now,
      },
    });

  await db
    .insert(agoojyeToolboxAssets)
    .values(
      TOOLBOX_ASSETS.map(([title, category, assetType]) => ({
        tenantId,
        title,
        category,
        assetType,
        description: "Checklist item for the AGOOJIYE sponsor toolbox. Attach approved material before using it externally.",
        status: "needed",
        version: "1.0",
        tags: [category],
        approvedClaims: [],
        prohibitedClaims: ["Do not invent vehicle specifications, partner commitments, or sponsorship values."],
        visibility: "admin_only",
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [agoojyeToolboxAssets.tenantId, agoojyeToolboxAssets.title],
      set: {
        category: sql`excluded.category`,
        assetType: sql`excluded.asset_type`,
        description: sql`excluded.description`,
        status: sql`excluded.status`,
        tags: sql`excluded.tags`,
        prohibitedClaims: sql`excluded.prohibited_claims`,
        updatedAt: now,
      },
    });

  await db
    .insert(agoojyeEmailTemplates)
    .values(
      TEMPLATE_GROUPS.map((group) => ({
        tenantId,
        name: `AGOOJIYE ${group}`,
        templateGroup: group,
        language: "fr",
        subject: `AGOOJIYE - ${group} - {{organization_name}}`,
        body:
          "Bonjour {{contact_first_name}},\n\nCe modèle est un brouillon contrôlé pour une communication AGOOJIYE. Complétez la personnalisation, vérifiez les sources publiques et faites approuver le premier message avant tout envoi.\n\nCordialement,\n{{sender_name}}\n{{sender_title}}",
        signature: "{{sender_name}}\nAGOOJIYE",
        status: "draft",
        version: "1.0",
        variables: ["contact_first_name", "organization_name", "sender_name", "sender_title"],
        attachmentIds: [],
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing();

  for (const block of CONTENT_BLOCKS) {
    await db
      .insert(agoojyeContentBlocks)
      .values({
        tenantId,
        page: block.page,
        section: block.section,
        key: block.key,
        titleFr: block.titleFr,
        titleEn: block.titleEn,
        contentFr: block.contentFr,
        contentEn: block.contentEn,
        imageUrl: block.imageUrl || null,
        metadataJson: block.metadataJson || {},
        updatedBy: "seed",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [agoojyeContentBlocks.tenantId, agoojyeContentBlocks.page, agoojyeContentBlocks.section, agoojyeContentBlocks.key],
        set: {
          titleFr: block.titleFr,
          titleEn: block.titleEn,
          contentFr: block.contentFr,
          contentEn: block.contentEn,
          imageUrl: block.imageUrl || null,
          metadataJson: block.metadataJson || {},
          updatedBy: "seed",
          updatedAt: now,
        },
      });
  }

  await db
    .insert(agoojyeTenantEmailSettings)
    .values({
      tenantId,
      providerName: "manual",
      status: "not_configured",
      fromName: "AGOOJIYE",
      fromEmail: "contact@agoojiye.com",
      replyToEmail: "contact@agoojiye.com",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agoojyeTenantEmailSettings.tenantId,
      set: {
        smtpPasswordEncrypted: null,
        fromName: "AGOOJIYE",
        fromEmail: "contact@agoojiye.com",
        replyToEmail: "contact@agoojiye.com",
        updatedAt: now,
      },
    });

  seededTenants.add(tenantId);
}

async function bootstrapPayload(tenantId: number, publicOnly = true) {
  await ensureAgoojyeSeed(tenantId);
  const [teams, partners, milestones, media, content, aliases] = await Promise.all([
    db.select().from(agoojyeTeams).where(eq(agoojyeTeams.tenantId, tenantId)).orderBy(asc(agoojyeTeams.id)),
    db
      .select()
      .from(agoojyePartners)
      .where(publicOnly ? and(eq(agoojyePartners.tenantId, tenantId), eq(agoojyePartners.visibility, "public")) : eq(agoojyePartners.tenantId, tenantId))
      .orderBy(asc(agoojyePartners.id)),
    db
      .select()
      .from(agoojyeMilestones)
      .where(publicOnly ? and(eq(agoojyeMilestones.tenantId, tenantId), eq(agoojyeMilestones.visibility, "public")) : eq(agoojyeMilestones.tenantId, tenantId))
      .orderBy(asc(agoojyeMilestones.sortOrder), asc(agoojyeMilestones.id)),
    db
      .select()
      .from(agoojyeMediaAssets)
      .where(
        publicOnly
          ? and(eq(agoojyeMediaAssets.tenantId, tenantId), eq(agoojyeMediaAssets.visibility, "public"), eq(agoojyeMediaAssets.status, "published"))
          : eq(agoojyeMediaAssets.tenantId, tenantId),
      )
      .orderBy(desc(agoojyeMediaAssets.updatedAt)),
    db.select().from(agoojyeContentBlocks).where(eq(agoojyeContentBlocks.tenantId, tenantId)).orderBy(asc(agoojyeContentBlocks.page), asc(agoojyeContentBlocks.section)),
    db.select().from(agoojyeEmailIdentities).where(eq(agoojyeEmailIdentities.tenantId, tenantId)).orderBy(asc(agoojyeEmailIdentities.emailAddress)),
  ]);

  return { teams, partners, milestones, media, content, aliases };
}

publicApi.use(async (req: any, res, next) => {
  try {
    const tenant = ensureAgoojyeTenant(req, res);
    if (!tenant) return;
    await ensureAgoojyeSeed(Number(tenant.id));
    next();
  } catch (error) {
    next(error);
  }
});

publicApi.get("/public/bootstrap", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const payload = await bootstrapPayload(tenantId, true);
    return res.json({ ok: true, ...payload });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de charger AGOOJIYE." });
  }
});

publicApi.post("/public/sponsors", async (req: any, res) => {
  try {
    if (!checkPublicRate(req, res)) return;
    if (normalizeText(req.body?.website)) return res.status(204).end();
    const tenantId = Number(req.tenant.id);
    const companyName = normalizeText(req.body?.companyName);
    const contactPerson = normalizeText(req.body?.contactPerson);
    const email = normalizeText(req.body?.email).toLowerCase();
    if (!companyName || !contactPerson || !email) {
      return res.status(400).json({ message: "Entreprise, contact et email sont requis." });
    }
    await ensureAgoojyeSeed(tenantId);
    const [item] = await db
      .insert(agoojyeSponsorLeads)
      .values({
        tenantId,
        companyName,
        contactPerson,
        email,
        phone: normalizeText(req.body?.phone) || null,
        interest: normalizeText(req.body?.interest || req.body?.sponsorshipInterest) || "Demande sponsoring",
        budgetRange: normalizeText(req.body?.budgetRange) || null,
        message: normalizeText(req.body?.message) || null,
        source: "public.sponsors",
        status: "New",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const crm = await upsertSponsorCrmFromLead(tenantId, {
      companyName,
      contactPerson,
      email,
      phone: normalizeText(req.body?.phone) || null,
      interest: normalizeText(req.body?.interest || req.body?.sponsorshipInterest) || "Demande sponsoring",
      message: normalizeText(req.body?.message) || null,
      source: "public.sponsors",
      leadId: item.id,
    });
    const inbox = await createInboxRecordFromPublicLead(tenantId, {
      source: "public.sponsors",
      subject: `Demande sponsor - ${companyName}`,
      senderName: contactPerson,
      senderEmail: email,
      targetEmail: "sponsors@agoojiye.com",
      body: normalizeText(req.body?.message) || null,
      tags: ["website", "sponsor"],
      organizationId: crm.organizationId,
      contactId: crm.contactId,
      opportunityId: crm.opportunityId,
      leadId: item.id,
    });
    await audit(tenantId, { action: "create", entityType: "sponsor_lead", entityId: item.id, metadata: { source: "public.sponsors", crm, inbox } });
    return res.status(201).json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible d'enregistrer la demande sponsor." });
  }
});

publicApi.post("/public/contact", async (req: any, res) => {
  try {
    if (!checkPublicRate(req, res)) return;
    if (normalizeText(req.body?.website)) return res.status(204).end();
    const tenantId = Number(req.tenant.id);
    const fullName = normalizeText(req.body?.fullName || req.body?.contactPerson);
    const email = normalizeText(req.body?.email).toLowerCase();
    const inquiryType = normalizeText(req.body?.inquiryType) || "Demande générale";
    if (!fullName || !email) return res.status(400).json({ message: "Nom et email sont requis." });
    await ensureAgoojyeSeed(tenantId);
    const [item] = await db
      .insert(agoojyeSponsorLeads)
      .values({
        tenantId,
        companyName: normalizeText(req.body?.companyName) || fullName,
        contactPerson: fullName,
        email,
        phone: normalizeText(req.body?.phone) || null,
        interest: inquiryType,
        budgetRange: normalizeText(req.body?.budgetRange) || null,
        message: normalizeText(req.body?.message) || null,
        source: `public.contact.${slugify(inquiryType)}`,
        status: "New",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const crm = await upsertSponsorCrmFromLead(tenantId, {
      companyName: normalizeText(req.body?.companyName) || fullName,
      contactPerson: fullName,
      email,
      phone: normalizeText(req.body?.phone) || null,
      interest: inquiryType,
      message: normalizeText(req.body?.message) || null,
      source: `public.contact.${slugify(inquiryType)}`,
      leadId: item.id,
    });
    const route = inferSponsorCategorySlug(inquiryType);
    const targetEmail =
      route === "media-partner"
        ? "press@agoojiye.com"
        : route === "industrial-partner"
          ? "partners@agoojiye.com"
          : route === "talent-partner"
            ? "careers@agoojiye.com"
            : "contact@agoojiye.com";
    const inbox = await createInboxRecordFromPublicLead(tenantId, {
      source: `public.contact.${slugify(inquiryType)}`,
      subject: `${inquiryType} - ${fullName}`,
      senderName: fullName,
      senderEmail: email,
      targetEmail,
      body: normalizeText(req.body?.message) || null,
      tags: ["website", "contact", route],
      organizationId: crm.organizationId,
      contactId: crm.contactId,
      opportunityId: crm.opportunityId,
      leadId: item.id,
    });
    await audit(tenantId, { action: "create", entityType: "contact_lead", entityId: item.id, metadata: { inquiryType, crm, inbox } });
    return res.status(201).json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible d'enregistrer le message." });
  }
});

adminApi.use(ensureTenantAdmin);
adminApi.use(async (req: any, res, next) => {
  try {
    const tenant = ensureAgoojyeTenant(req, res);
    if (!tenant) return;
    await ensureAgoojyeSeed(Number(tenant.id));
    next();
  } catch (error) {
    next(error);
  }
});

adminApi.get("/email-dns-status", async (_req: any, res) => {
  const expected = AGOOJIYE_MAIL_DNS_EXPECTED;
  const mxRecords = (
    await resolveDnsSafe(() => dns.resolveMx(expected.domain), [] as Array<{ exchange: string; priority: number }>)
  )
    .map((record) => ({
      exchange: normalizeDnsName(record.exchange),
      priority: Number(record.priority),
    }))
    .filter((record) => record.exchange)
    .sort((a, b) => a.priority - b.priority || a.exchange.localeCompare(b.exchange));
  const mailARecords = await resolveDnsSafe(() => dns.resolve4(expected.mailHost), [] as string[]);
  const rootTxtRecords = flattenTxtRecords(await resolveDnsSafe(() => dns.resolveTxt(expected.domain), [] as string[][]));
  const dmarcRecords = flattenTxtRecords(await resolveDnsSafe(() => dns.resolveTxt(`_dmarc.${expected.domain}`), [] as string[][]));
  const dkimRecords = flattenTxtRecords(await resolveDnsSafe(() => dns.resolveTxt(expected.dkimHost), [] as string[][]));
  const spfRecords = rootTxtRecords.filter((record) => normalizeTxtValue(record).startsWith("v=spf1"));

  const mailAOk = mailARecords.includes(expected.ipv4);
  const mxOk = mxRecords.some(
    (record) => record.priority === expected.mxPriority && normalizeDnsName(record.exchange) === expected.mxHost,
  );
  const legacyOvhMxPresent = mxRecords.some((record) => /(^|\.)mail\.ovh\.net$/i.test(record.exchange));
  const spfOk = spfRecords.some((record) => normalizeTxtValue(record) === normalizeTxtValue(expected.spf));
  const legacyOvhSpfPresent = spfRecords.some((record) => normalizeTxtValue(record).includes("include:mx.ovh.com"));
  const dmarcOk = dmarcRecords.some((record) => normalizeTxtValue(record) === normalizeTxtValue(expected.dmarc));
  const dkimOk = dkimRecords.some((record) => {
    const normalized = normalizeTxtValue(record);
    return normalized.startsWith("v=dkim1;") && /\bp=/.test(normalized);
  });

  const checks = {
    mailAOk,
    mxOk,
    legacyOvhMxPresent,
    spfOk,
    legacyOvhSpfPresent,
    dmarcOk,
    dkimOk,
    cutoverReady: mailAOk && mxOk && spfOk && dmarcOk && dkimOk && !legacyOvhMxPresent && !legacyOvhSpfPresent,
  };
  const warnings = [
    !checks.mailAOk ? "mail_a_missing_or_mismatch" : null,
    !checks.mxOk ? "mx_not_cut_over" : null,
    checks.legacyOvhMxPresent ? "legacy_ovh_mx_present" : null,
    !checks.spfOk ? "spf_missing_or_mismatch" : null,
    checks.legacyOvhSpfPresent ? "legacy_ovh_spf_present" : null,
    !checks.dmarcOk ? "dmarc_missing_or_mismatch" : null,
    !checks.dkimOk ? "dkim_missing" : null,
  ].filter(Boolean);

  return res.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    expected,
    records: {
      mx: mxRecords,
      mailA: mailARecords,
      spf: spfRecords,
      dmarc: dmarcRecords,
      dkim: {
        host: expected.dkimHost,
        selector: expected.dkimSelector,
        present: dkimOk,
        recordCount: dkimRecords.length,
      },
    },
    checks,
    warnings,
  });
});

const resources = {
  users: {
    table: agoojyeProjectUsers,
    entity: "project_user",
    create: (tenantId: number, body: any) => ({
      tenantId,
      firstName: normalizeText(body.firstName) || "Prénom",
      lastName: normalizeText(body.lastName) || "Nom",
      displayName: normalizeText(body.displayName) || `${normalizeText(body.firstName)} ${normalizeText(body.lastName)}`.trim() || "Participant",
      email: normalizeText(body.email).toLowerCase(),
      phone: normalizeText(body.phone) || null,
      role: normalizeText(body.role) || "Participant",
      teamId: Number(body.teamId) || null,
      status: normalizeText(body.status) || "Invited",
      profilePhotoUrl: normalizeText(body.profilePhotoUrl) || null,
      bio: normalizeText(body.bio) || null,
      confirmedRole: Boolean(body.confirmedRole),
      emailAccountCreated: Boolean(body.emailAccountCreated),
    }),
    fields: ["firstName", "lastName", "displayName", "email", "phone", "role", "teamId", "status", "profilePhotoUrl", "bio", "confirmedRole", "emailAccountCreated"],
  },
  teams: {
    table: agoojyeTeams,
    entity: "team",
    create: (tenantId: number, body: any) => ({
      tenantId,
      name: normalizeText(body.name),
      slug: slugify(body.slug || body.name),
      description: normalizeText(body.description) || null,
      mission: normalizeText(body.mission) || null,
      leadUserId: Number(body.leadUserId) || null,
      status: normalizeText(body.status) || "active",
      visibility: normalizeText(body.visibility) || "public",
    }),
    fields: ["name", "slug", "description", "mission", "leadUserId", "status", "visibility"],
  },
  participants: {
    table: agoojyeParticipants,
    entity: "participant",
    create: (tenantId: number, body: any) => ({
      tenantId,
      userId: Number(body.userId) || null,
      teamId: Number(body.teamId) || null,
      roleTitle: normalizeText(body.roleTitle) || null,
      confirmedRole: Boolean(body.confirmedRole),
      participantType: normalizeText(body.participantType) || "student",
      bio: normalizeText(body.bio) || null,
      skills: parseList(body.skills),
      phone: normalizeText(body.phone) || null,
      schoolOrCompany: normalizeText(body.schoolOrCompany) || null,
      status: normalizeText(body.status) || "Pending",
      certificateEligible: Boolean(body.certificateEligible),
      shareEligibilityStatus: normalizeText(body.shareEligibilityStatus) || null,
      notes: normalizeText(body.notes) || null,
    }),
    fields: ["userId", "teamId", "roleTitle", "confirmedRole", "participantType", "bio", "skills", "phone", "schoolOrCompany", "status", "certificateEligible", "shareEligibilityStatus", "notes"],
  },
  "email-identities": {
    table: agoojyeEmailIdentities,
    entity: "email_identity",
    create: (tenantId: number, body: any, req: any) => ({
      tenantId,
      userId: Number(body.userId) || null,
      emailAddress: normalizeText(body.emailAddress).toLowerCase(),
      displayName: normalizeText(body.displayName) || normalizeText(body.emailAddress).split("@")[0],
      emailType: normalizeText(body.emailType) || "individual",
      provider: normalizeText(body.provider) || "manual",
      status: normalizeText(body.status) || "requested",
      canSend: body.canSend !== false,
      canReceive: body.canReceive !== false,
      forwardingAddress: normalizeText(body.forwardingAddress) || null,
      createdBy: actor(req),
      notes: normalizeText(body.notes) || null,
    }),
    fields: ["userId", "emailAddress", "displayName", "emailType", "provider", "status", "canSend", "canReceive", "forwardingAddress", "notes"],
  },
  messages: {
    table: agoojyeInternalMessages,
    entity: "internal_message",
    create: (tenantId: number, body: any) => ({
      tenantId,
      senderUserId: Number(body.senderUserId) || null,
      teamId: Number(body.teamId) || null,
      subject: normalizeText(body.subject) || "Message AGOOJIYE",
      body: normalizeText(body.body),
      messageType: normalizeText(body.messageType) || "direct",
      attachments: parseList(body.attachments),
    }),
    fields: ["senderUserId", "teamId", "subject", "body", "messageType", "attachments"],
  },
  tasks: {
    table: agoojyeTasks,
    entity: "task",
    create: (tenantId: number, body: any) => ({
      tenantId,
      teamId: Number(body.teamId) || null,
      assignedTo: Number(body.assignedTo) || null,
      createdBy: Number(body.createdBy) || null,
      title: normalizeText(body.title),
      description: normalizeText(body.description) || null,
      priority: normalizeText(body.priority) || "medium",
      status: normalizeText(body.status) || "todo",
      dueDate: parseDate(body.dueDate),
      milestoneId: Number(body.milestoneId) || null,
      attachments: parseList(body.attachments),
    }),
    fields: ["teamId", "assignedTo", "createdBy", "title", "description", "priority", "status", "dueDate", "milestoneId", "attachments"],
  },
  milestones: {
    table: agoojyeMilestones,
    entity: "milestone",
    create: (tenantId: number, body: any) => ({
      tenantId,
      title: normalizeText(body.title),
      description: normalizeText(body.description) || null,
      date: parseDate(body.date),
      status: normalizeText(body.status) || "planned",
      owner: normalizeText(body.owner) || null,
      visibility: normalizeText(body.visibility) || "public",
      sortOrder: Number(body.sortOrder) || 0,
    }),
    fields: ["title", "description", "date", "status", "owner", "visibility", "sortOrder"],
  },
  documents: {
    table: agoojyeDocuments,
    entity: "document",
    create: (tenantId: number, body: any) => ({
      tenantId,
      title: normalizeText(body.title),
      description: normalizeText(body.description) || null,
      category: normalizeText(body.category) || "Strategy",
      teamId: Number(body.teamId) || null,
      uploadedBy: Number(body.uploadedBy) || null,
      fileUrl: normalizeText(body.fileUrl) || null,
      version: normalizeText(body.version) || "1.0",
      status: normalizeText(body.status) || "draft",
      visibility: normalizeText(body.visibility) || "private",
    }),
    fields: ["title", "description", "category", "teamId", "uploadedBy", "fileUrl", "version", "status", "visibility"],
  },
  partners: {
    table: agoojyePartners,
    entity: "partner",
    create: (tenantId: number, body: any) => ({
      tenantId,
      name: normalizeText(body.name),
      category: normalizeText(body.category) || "Technical Partner",
      status: normalizeText(body.status) || "In discussion",
      logoUrl: normalizeText(body.logoUrl) || null,
      description: normalizeText(body.description) || null,
      contactPerson: normalizeText(body.contactPerson) || null,
      contactEmail: normalizeText(body.contactEmail) || null,
      contactPhone: normalizeText(body.contactPhone) || null,
      website: normalizeText(body.website) || null,
      notes: normalizeText(body.notes) || null,
      visibility: normalizeText(body.visibility) || "public",
    }),
    fields: ["name", "category", "status", "logoUrl", "description", "contactPerson", "contactEmail", "contactPhone", "website", "notes", "visibility"],
  },
  sponsors: {
    table: agoojyeSponsorLeads,
    entity: "sponsor_lead",
    create: (tenantId: number, body: any) => ({
      tenantId,
      companyName: normalizeText(body.companyName),
      contactPerson: normalizeText(body.contactPerson),
      email: normalizeText(body.email).toLowerCase(),
      phone: normalizeText(body.phone) || null,
      interest: normalizeText(body.interest) || null,
      budgetRange: normalizeText(body.budgetRange) || null,
      message: normalizeText(body.message) || null,
      source: normalizeText(body.source) || "admin",
      status: normalizeText(body.status) || "New",
      assignedTo: Number(body.assignedTo) || null,
      notes: normalizeText(body.notes) || null,
    }),
    fields: ["companyName", "contactPerson", "email", "phone", "interest", "budgetRange", "message", "source", "status", "assignedTo", "notes"],
  },
  "sponsor-categories": {
    table: agoojyeSponsorCategories,
    entity: "sponsor_category",
    create: (tenantId: number, body: any) => ({
      tenantId,
      name: normalizeText(body.name),
      slug: slugify(body.slug || body.name),
      description: normalizeText(body.description) || null,
      status: normalizeText(body.status) || "active",
      sortOrder: Number(body.sortOrder) || 0,
    }),
    fields: ["name", "slug", "description", "status", "sortOrder"],
  },
  "pipeline-stages": {
    table: agoojyePipelineStages,
    entity: "pipeline_stage",
    create: (tenantId: number, body: any) => ({
      tenantId,
      name: normalizeText(body.name),
      slug: slugify(body.slug || body.name),
      description: normalizeText(body.description) || null,
      stageGroup: normalizeText(body.stageGroup) || "active",
      status: normalizeText(body.status) || "active",
      isTerminal: Boolean(body.isTerminal),
      sortOrder: Number(body.sortOrder) || 0,
    }),
    fields: ["name", "slug", "description", "stageGroup", "status", "isTerminal", "sortOrder"],
  },
  organizations: {
    table: agoojyeCrmOrganizations,
    entity: "crm_organization",
    create: (tenantId: number, body: any) => ({
      tenantId,
      name: normalizeText(body.name),
      website: normalizeText(body.website) || null,
      country: normalizeText(body.country) || null,
      industry: normalizeText(body.industry) || null,
      sponsorCategoryId: Number(body.sponsorCategoryId) || null,
      sponsorCategory: normalizeText(body.sponsorCategory) || null,
      companySize: normalizeText(body.companySize) || null,
      publicDescription: normalizeText(body.publicDescription) || null,
      strategicRelevance: normalizeText(body.strategicRelevance) || null,
      priority: normalizeText(body.priority) || "medium",
      pipelineStageId: Number(body.pipelineStageId) || null,
      opportunityOwner: Number(body.opportunityOwner) || null,
      estimatedValue: normalizeText(body.estimatedValue) || null,
      currency: normalizeText(body.currency) || "XOF",
      source: normalizeText(body.source) || "admin",
      nextAction: normalizeText(body.nextAction) || null,
      nextActionDate: parseDate(body.nextActionDate),
      internalNotes: normalizeText(body.internalNotes) || null,
      publicNotes: normalizeText(body.publicNotes) || null,
      doNotContact: Boolean(body.doNotContact),
    }),
    fields: ["name", "website", "country", "industry", "sponsorCategoryId", "sponsorCategory", "companySize", "publicDescription", "strategicRelevance", "priority", "pipelineStageId", "opportunityOwner", "estimatedValue", "currency", "source", "nextAction", "nextActionDate", "internalNotes", "publicNotes", "doNotContact"],
  },
  contacts: {
    table: agoojyeCrmContacts,
    entity: "crm_contact",
    create: (tenantId: number, body: any) => ({
      tenantId,
      organizationId: Number(body.organizationId) || null,
      firstName: normalizeText(body.firstName) || null,
      lastName: normalizeText(body.lastName) || null,
      jobTitle: normalizeText(body.jobTitle) || null,
      email: normalizeText(body.email).toLowerCase(),
      phone: normalizeText(body.phone) || null,
      country: normalizeText(body.country) || null,
      preferredLanguage: normalizeText(body.preferredLanguage) || "fr",
      publicSourceUrl: normalizeText(body.publicSourceUrl) || null,
      verificationStatus: normalizeText(body.verificationStatus) || "unverified",
      confidenceScore: Number(body.confidenceScore) || 0,
      relationshipOwner: Number(body.relationshipOwner) || null,
      lawfulContactNote: normalizeText(body.lawfulContactNote) || null,
      lastContactedAt: parseDate(body.lastContactedAt),
      lastRepliedAt: parseDate(body.lastRepliedAt),
      doNotContact: Boolean(body.doNotContact),
      notes: normalizeText(body.notes) || null,
    }),
    fields: ["organizationId", "firstName", "lastName", "jobTitle", "email", "phone", "country", "preferredLanguage", "publicSourceUrl", "verificationStatus", "confidenceScore", "relationshipOwner", "lawfulContactNote", "lastContactedAt", "lastRepliedAt", "doNotContact", "notes"],
  },
  opportunities: {
    table: agoojyeSponsorOpportunities,
    entity: "sponsor_opportunity",
    create: (tenantId: number, body: any) => ({
      tenantId,
      organizationId: Number(body.organizationId) || null,
      contactId: Number(body.contactId) || null,
      sponsorCategoryId: Number(body.sponsorCategoryId) || null,
      stageId: Number(body.stageId) || null,
      title: normalizeText(body.title),
      priority: normalizeText(body.priority) || "medium",
      ownerUserId: Number(body.ownerUserId) || null,
      estimatedValue: normalizeText(body.estimatedValue) || null,
      currency: normalizeText(body.currency) || "XOF",
      source: normalizeText(body.source) || "admin",
      status: normalizeText(body.status) || "active",
      nextAction: normalizeText(body.nextAction) || null,
      nextActionDate: parseDate(body.nextActionDate),
      internalNotes: normalizeText(body.internalNotes) || null,
      publicNotes: normalizeText(body.publicNotes) || null,
      doNotContact: Boolean(body.doNotContact),
    }),
    fields: ["organizationId", "contactId", "sponsorCategoryId", "stageId", "title", "priority", "ownerUserId", "estimatedValue", "currency", "source", "status", "nextAction", "nextActionDate", "internalNotes", "publicNotes", "doNotContact"],
  },
  activities: {
    table: agoojyeCrmActivities,
    entity: "crm_activity",
    create: (tenantId: number, body: any) => ({
      tenantId,
      organizationId: Number(body.organizationId) || null,
      contactId: Number(body.contactId) || null,
      opportunityId: Number(body.opportunityId) || null,
      actorUserId: Number(body.actorUserId) || null,
      activityType: normalizeText(body.activityType) || "note",
      channel: normalizeText(body.channel) || "admin",
      subject: normalizeText(body.subject) || null,
      body: normalizeText(body.body) || null,
      outcome: normalizeText(body.outcome) || null,
      dueDate: parseDate(body.dueDate),
      completedAt: parseDate(body.completedAt),
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    }),
    fields: ["organizationId", "contactId", "opportunityId", "actorUserId", "activityType", "channel", "subject", "body", "outcome", "dueDate", "completedAt", "metadata"],
  },
  "email-templates": {
    table: agoojyeEmailTemplates,
    entity: "email_template",
    create: (tenantId: number, body: any) => ({
      tenantId,
      name: normalizeText(body.name),
      templateGroup: normalizeText(body.templateGroup) || "Initial introduction",
      sponsorCategoryId: Number(body.sponsorCategoryId) || null,
      language: normalizeText(body.language) || "fr",
      subject: normalizeText(body.subject),
      body: normalizeText(body.body),
      senderIdentityId: Number(body.senderIdentityId) || null,
      signature: normalizeText(body.signature) || null,
      status: normalizeText(body.status) || "draft",
      version: normalizeText(body.version) || "1.0",
      approvedBy: normalizeText(body.approvedBy) || null,
      approvedAt: parseDate(body.approvedAt),
      variables: parseList(body.variables),
      attachmentIds: parseList(body.attachmentIds).map((entry) => Number(entry)).filter((value) => Number.isFinite(value) && value > 0),
    }),
    fields: ["name", "templateGroup", "sponsorCategoryId", "language", "subject", "body", "senderIdentityId", "signature", "status", "version", "approvedBy", "approvedAt", "variables", "attachmentIds"],
  },
  toolbox: {
    table: agoojyeToolboxAssets,
    entity: "toolbox_asset",
    create: (tenantId: number, body: any) => ({
      tenantId,
      title: normalizeText(body.title),
      category: normalizeText(body.category) || "Core",
      sponsorCategoryId: Number(body.sponsorCategoryId) || null,
      description: normalizeText(body.description) || null,
      fileUrl: normalizeText(body.fileUrl) || null,
      assetType: normalizeText(body.assetType) || "document",
      status: normalizeText(body.status) || "needed",
      version: normalizeText(body.version) || "1.0",
      tags: parseList(body.tags),
      approvedClaims: parseList(body.approvedClaims),
      prohibitedClaims: parseList(body.prohibitedClaims),
      visibility: normalizeText(body.visibility) || "admin_only",
    }),
    fields: ["title", "category", "sponsorCategoryId", "description", "fileUrl", "assetType", "status", "version", "tags", "approvedClaims", "prohibitedClaims", "visibility"],
  },
  suppression: {
    table: agoojyeSuppressionEntries,
    entity: "suppression_entry",
    create: (tenantId: number, body: any, req: any) => ({
      tenantId,
      email: normalizeText(body.email).toLowerCase(),
      organizationId: Number(body.organizationId) || null,
      contactId: Number(body.contactId) || null,
      reason: normalizeText(body.reason) || "manual",
      source: normalizeText(body.source) || "admin",
      status: normalizeText(body.status) || "active",
      notes: normalizeText(body.notes) || null,
      createdBy: actor(req),
    }),
    fields: ["email", "organizationId", "contactId", "reason", "source", "status", "notes"],
  },
  approvals: {
    table: agoojyeOutreachApprovals,
    entity: "outreach_approval",
    create: (tenantId: number, body: any) => ({
      tenantId,
      opportunityId: Number(body.opportunityId) || null,
      contactId: Number(body.contactId) || null,
      templateId: Number(body.templateId) || null,
      requesterUserId: Number(body.requesterUserId) || null,
      reviewerUserId: Number(body.reviewerUserId) || null,
      senderIdentityId: Number(body.senderIdentityId) || null,
      subject: normalizeText(body.subject),
      body: normalizeText(body.body),
      status: "awaiting_approval",
      scheduledAt: parseDate(body.scheduledAt),
      approvedAt: null,
      rejectedAt: null,
      sentAt: null,
      decisionNotes: normalizeText(body.decisionNotes) || null,
      agentResearchJson: body.agentResearchJson && typeof body.agentResearchJson === "object" ? body.agentResearchJson : {},
    }),
    fields: ["opportunityId", "contactId", "templateId", "requesterUserId", "reviewerUserId", "senderIdentityId", "subject", "body", "status", "scheduledAt", "approvedAt", "rejectedAt", "sentAt", "decisionNotes", "agentResearchJson"],
  },
  "inbox-threads": {
    table: agoojyeMailThreads,
    entity: "mail_thread",
    create: (tenantId: number, body: any) => ({
      tenantId,
      providerThreadId: normalizeText(body.providerThreadId) || null,
      mailboxIdentityId: Number(body.mailboxIdentityId) || null,
      organizationId: Number(body.organizationId) || null,
      contactId: Number(body.contactId) || null,
      opportunityId: Number(body.opportunityId) || null,
      assignedTo: Number(body.assignedTo) || null,
      direction: normalizeText(body.direction) || "inbound",
      subject: normalizeText(body.subject) || "(Sans sujet)",
      status: normalizeText(body.status) || "open",
      source: normalizeText(body.source) || "manual",
      lastMessageAt: parseDate(body.lastMessageAt),
      tags: parseList(body.tags),
      internalNotes: normalizeText(body.internalNotes) || null,
    }),
    fields: ["providerThreadId", "mailboxIdentityId", "organizationId", "contactId", "opportunityId", "assignedTo", "direction", "subject", "status", "source", "lastMessageAt", "tags", "internalNotes"],
  },
  "mail-messages": {
    table: agoojyeMailMessages,
    entity: "mail_message",
    create: (tenantId: number, body: any) => ({
      tenantId,
      threadId: Number(body.threadId) || null,
      providerMessageId: normalizeText(body.providerMessageId) || null,
      messageIdHeader: normalizeText(body.messageIdHeader) || null,
      inReplyTo: normalizeText(body.inReplyTo) || null,
      referencesHeader: normalizeText(body.referencesHeader) || null,
      fromEmail: normalizeText(body.fromEmail).toLowerCase() || null,
      toEmails: parseList(body.toEmails).map((entry) => entry.toLowerCase()),
      ccEmails: parseList(body.ccEmails).map((entry) => entry.toLowerCase()),
      subject: normalizeText(body.subject) || "(Sans sujet)",
      bodyText: normalizeText(body.bodyText) || null,
      bodyPreview: normalizeText(body.bodyPreview) || normalizeText(body.bodyText).slice(0, 220) || null,
      direction: normalizeText(body.direction) || "inbound",
      deliveryStatus: normalizeText(body.deliveryStatus) || "received",
      receivedAt: parseDate(body.receivedAt),
      sentAt: parseDate(body.sentAt),
      attachmentMetadata: body.attachmentMetadata && typeof body.attachmentMetadata === "object" ? body.attachmentMetadata : {},
    }),
    fields: ["threadId", "providerMessageId", "messageIdHeader", "inReplyTo", "referencesHeader", "fromEmail", "toEmails", "ccEmails", "subject", "bodyText", "bodyPreview", "direction", "deliveryStatus", "receivedAt", "sentAt", "attachmentMetadata"],
  },
  sequences: {
    table: agoojyeOutreachSequences,
    entity: "outreach_sequence",
    create: (tenantId: number, body: any) => ({
      tenantId,
      name: normalizeText(body.name),
      sponsorCategoryId: Number(body.sponsorCategoryId) || null,
      ownerUserId: Number(body.ownerUserId) || null,
      status: "draft",
      templateIds: parseList(body.templateIds).map((entry) => Number(entry)).filter((value) => Number.isFinite(value) && value > 0),
      maxSteps: Number(body.maxSteps) || 3,
      minDelayHours: Number(body.minDelayHours) || 72,
      dailyLimit: Number(body.dailyLimit) || 10,
      businessHours: normalizeText(body.businessHours) || null,
      stopOnReply: body.stopOnReply !== false,
      stopOnBounce: body.stopOnBounce !== false,
      notes: normalizeText(body.notes) || null,
    }),
    fields: ["name", "sponsorCategoryId", "ownerUserId", "status", "templateIds", "maxSteps", "minDelayHours", "dailyLimit", "businessHours", "stopOnReply", "stopOnBounce", "notes"],
  },
  imports: {
    table: agoojyeImportBatches,
    entity: "import_batch",
    create: (tenantId: number, body: any, req: any) => ({
      tenantId,
      fileName: normalizeText(body.fileName),
      sourceType: normalizeText(body.sourceType) || "csv",
      targetResource: normalizeText(body.targetResource) || "organizations",
      status: normalizeText(body.status) || "draft",
      rowCount: Number(body.rowCount) || 0,
      importedCount: Number(body.importedCount) || 0,
      skippedCount: Number(body.skippedCount) || 0,
      duplicateCount: Number(body.duplicateCount) || 0,
      warnings: body.warnings && typeof body.warnings === "object" ? body.warnings : {},
      mappingJson: body.mappingJson && typeof body.mappingJson === "object" ? body.mappingJson : {},
      rollbackNotes: normalizeText(body.rollbackNotes) || null,
      createdBy: actor(req),
      confirmedAt: parseDate(body.confirmedAt),
      completedAt: parseDate(body.completedAt),
    }),
    fields: ["fileName", "sourceType", "targetResource", "status", "rowCount", "importedCount", "skippedCount", "duplicateCount", "warnings", "mappingJson", "rollbackNotes", "confirmedAt", "completedAt"],
  },
  "agent-research": {
    table: agoojyeAgentResearchRecords,
    entity: "agent_research",
    create: (tenantId: number, body: any) => ({
      tenantId,
      organizationId: Number(body.organizationId) || null,
      contactId: Number(body.contactId) || null,
      opportunityId: Number(body.opportunityId) || null,
      requestedByUserId: Number(body.requestedByUserId) || null,
      approvalId: Number(body.approvalId) || null,
      researchStatus: normalizeText(body.researchStatus) || "draft",
      sourceUrls: parseList(body.sourceUrls),
      sourceRecordsJson: Array.isArray(body.sourceRecordsJson) ? body.sourceRecordsJson : [],
      summary: normalizeText(body.summary) || null,
      sponsorCategoryGuess: normalizeText(body.sponsorCategoryGuess) || null,
      relevanceScore: Number(body.relevanceScore) || 0,
      confidenceScore: Number(body.confidenceScore) || 0,
      recommendedTemplateId: Number(body.recommendedTemplateId) || null,
      recommendedToolboxAssetIds: parseList(body.recommendedToolboxAssetIds).map((entry) => Number(entry)).filter((value) => Number.isFinite(value) && value > 0),
      draftSubject: normalizeText(body.draftSubject) || null,
      draftBody: normalizeText(body.draftBody) || null,
      guardrailNotes: normalizeText(body.guardrailNotes) || null,
    }),
    fields: ["organizationId", "contactId", "opportunityId", "requestedByUserId", "approvalId", "researchStatus", "sourceUrls", "sourceRecordsJson", "summary", "sponsorCategoryGuess", "relevanceScore", "confidenceScore", "recommendedTemplateId", "recommendedToolboxAssetIds", "draftSubject", "draftBody", "guardrailNotes"],
  },
  jobs: {
    table: agoojyeBackgroundJobs,
    entity: "background_job",
    create: (tenantId: number, body: any, req: any) => ({
      tenantId,
      jobType: normalizeText(body.jobType),
      status: "queued",
      attemptCount: 0,
      scheduledAt: parseDate(body.scheduledAt) || new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      relatedEntityType: normalizeText(body.relatedEntityType) || null,
      relatedEntityId: Number(body.relatedEntityId) || null,
      createdBy: actor(req),
      payloadJson: body.payloadJson && typeof body.payloadJson === "object" ? body.payloadJson : {},
      resultJson: {},
    }),
    fields: ["jobType", "status", "attemptCount", "scheduledAt", "startedAt", "completedAt", "error", "relatedEntityType", "relatedEntityId", "payloadJson", "resultJson"],
  },
  media: {
    table: agoojyeMediaAssets,
    entity: "media_asset",
    create: (tenantId: number, body: any) => ({
      tenantId,
      title: normalizeText(body.title),
      description: normalizeText(body.description) || null,
      mediaType: normalizeText(body.mediaType) || "image",
      fileUrl: normalizeText(body.fileUrl) || null,
      thumbnailUrl: normalizeText(body.thumbnailUrl) || null,
      category: normalizeText(body.category) || "gallery",
      status: normalizeText(body.status) || "draft",
      visibility: normalizeText(body.visibility) || "public",
      tags: parseList(body.tags),
    }),
    fields: ["title", "description", "mediaType", "fileUrl", "thumbnailUrl", "category", "status", "visibility", "tags"],
  },
  content: {
    table: agoojyeContentBlocks,
    entity: "content_block",
    create: (tenantId: number, body: any) => ({
      tenantId,
      page: normalizeText(body.page) || "home",
      section: normalizeText(body.section) || "section",
      key: normalizeText(body.key) || slugify(body.titleFr || body.titleEn || "block"),
      titleFr: normalizeText(body.titleFr) || null,
      titleEn: normalizeText(body.titleEn) || null,
      contentFr: normalizeText(body.contentFr) || null,
      contentEn: normalizeText(body.contentEn) || null,
      imageUrl: normalizeText(body.imageUrl) || null,
      metadataJson: body.metadataJson && typeof body.metadataJson === "object" ? body.metadataJson : {},
      updatedBy: "admin",
    }),
    fields: ["page", "section", "key", "titleFr", "titleEn", "contentFr", "contentEn", "imageUrl", "metadataJson"],
  },
  "email-settings": {
    table: agoojyeTenantEmailSettings,
    entity: "email_settings",
    create: (tenantId: number, body: any) => ({
      tenantId,
      smtpHost: normalizeText(body.smtpHost) || null,
      smtpPort: Number(body.smtpPort) || null,
      smtpUsername: normalizeText(body.smtpUsername) || null,
      smtpPasswordEncrypted: null,
      fromName: normalizeText(body.fromName) || "AGOOJIYE",
      fromEmail: normalizeText(body.fromEmail) || "contact@agoojiye.com",
      replyToEmail: normalizeText(body.replyToEmail) || "contact@agoojiye.com",
      providerName: normalizeText(body.providerName) || "manual",
      status: normalizeText(body.status) || "not_configured",
    }),
    fields: ["smtpHost", "smtpPort", "smtpUsername", "fromName", "fromEmail", "replyToEmail", "providerName", "status"],
  },
  audit: {
    table: agoojyeAuditLogs,
    entity: "audit_log",
    create: (tenantId: number, body: any, req: any) => ({
      tenantId,
      actor: actor(req),
      action: normalizeText(body.action) || "manual",
      entityType: normalizeText(body.entityType) || "note",
      entityId: Number(body.entityId) || null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    }),
    fields: ["actor", "action", "entityType", "entityId", "metadata"],
  },
} as const;

function getResource(key: string): any {
  return (resources as any)[key];
}

function sanitizePatch(resource: any, body: any) {
  const patch: Record<string, unknown> = {};
  const listFields = new Set(["skills", "attachments", "tags", "variables", "attachmentIds", "approvedClaims", "prohibitedClaims", "toEmails", "ccEmails", "sourceUrls", "templateIds", "recommendedToolboxAssetIds"]);
  const numericListFields = new Set(["attachmentIds", "templateIds", "recommendedToolboxAssetIds"]);
  const dateFields = new Set(["date", "dueDate", "nextActionDate", "lastContactedAt", "lastRepliedAt", "completedAt", "approvedAt", "scheduledAt", "rejectedAt", "sentAt", "lastMessageAt", "receivedAt", "confirmedAt", "startedAt"]);
  const booleanFields = new Set(["confirmedRole", "emailAccountCreated", "certificateEligible", "canSend", "canReceive", "isTerminal", "doNotContact", "stopOnReply", "stopOnBounce"]);
  const jsonFields = new Set(["metadataJson", "metadata", "agentResearchJson", "attachmentMetadata", "warnings", "mappingJson", "payloadJson", "resultJson"]);
  const zeroDefaultNumberFields = new Set(["sortOrder", "confidenceScore", "relevanceScore", "maxSteps", "minDelayHours", "dailyLimit", "rowCount", "importedCount", "skippedCount", "duplicateCount", "attemptCount"]);
  const nullableNumberFields = new Set(["teamId", "userId", "assignedTo", "createdBy", "uploadedBy", "entityId", "smtpPort", "opportunityOwner", "relationshipOwner", "relatedEntityId"]);
  for (const field of resource.fields || []) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    if (numericListFields.has(field)) {
      patch[field] = parseList(body[field])
        .map((entry) => Number(entry))
        .filter((value) => Number.isFinite(value) && value > 0);
    } else if (listFields.has(field)) {
      patch[field] = parseList(body[field]);
    } else if (dateFields.has(field)) {
      patch[field] = parseDate(body[field]);
    } else if (zeroDefaultNumberFields.has(field)) {
      patch[field] = Number.isFinite(Number(body[field])) ? Number(body[field]) : 0;
    } else if (field.endsWith("Id") || nullableNumberFields.has(field)) {
      const value = Number(body[field]);
      patch[field] = Number.isFinite(value) && value > 0 ? value : null;
    } else if (booleanFields.has(field)) {
      patch[field] = Boolean(body[field]);
    } else if (jsonFields.has(field)) {
      patch[field] = body[field] && typeof body[field] === "object" ? body[field] : {};
    } else if (field === "email" || field === "emailAddress") {
      patch[field] = normalizeText(body[field]).toLowerCase();
    } else if (field === "smtpPassword") {
      continue;
    } else {
      patch[field] = normalizeText(body[field]) || null;
    }
  }
  patch.updatedAt = new Date();
  return patch;
}

adminApi.get("/dashboard", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const count = async (table: any) => {
      const [row] = await db.select({ value: sql<number>`count(*)::int` }).from(table).where(eq(table.tenantId, tenantId));
      return Number(row?.value || 0);
    };
    const [
      participants,
      confirmedRoles,
      emails,
      teams,
      tasks,
      milestones,
      sponsors,
      partners,
      documents,
      media,
      sponsorCategories,
      pipelineStages,
      crmOrganizations,
      crmContacts,
      sponsorOpportunities,
      crmActivities,
      emailTemplates,
      toolboxAssets,
      suppressionEntries,
      outreachApprovals,
      mailThreads,
      mailMessages,
      outreachSequences,
      sequenceEnrollments,
      importBatches,
      agentResearchRecords,
      backgroundJobs,
    ] = await Promise.all([
      count(agoojyeParticipants),
      db.select({ value: sql<number>`count(*)::int` }).from(agoojyeParticipants).where(and(eq(agoojyeParticipants.tenantId, tenantId), eq(agoojyeParticipants.confirmedRole, true))),
      count(agoojyeEmailIdentities),
      count(agoojyeTeams),
      db.select({ value: sql<number>`count(*)::int` }).from(agoojyeTasks).where(and(eq(agoojyeTasks.tenantId, tenantId), sql`${agoojyeTasks.status} <> 'done'`)),
      count(agoojyeMilestones),
      count(agoojyeSponsorLeads),
      count(agoojyePartners),
      db.select({ value: sql<number>`count(*)::int` }).from(agoojyeDocuments).where(and(eq(agoojyeDocuments.tenantId, tenantId), sql`${agoojyeDocuments.status} <> 'approved'`)),
      count(agoojyeMediaAssets),
      count(agoojyeSponsorCategories),
      count(agoojyePipelineStages),
      count(agoojyeCrmOrganizations),
      count(agoojyeCrmContacts),
      count(agoojyeSponsorOpportunities),
      count(agoojyeCrmActivities),
      count(agoojyeEmailTemplates),
      count(agoojyeToolboxAssets),
      count(agoojyeSuppressionEntries),
      count(agoojyeOutreachApprovals),
      count(agoojyeMailThreads),
      count(agoojyeMailMessages),
      count(agoojyeOutreachSequences),
      count(agoojyeSequenceEnrollments),
      count(agoojyeImportBatches),
      count(agoojyeAgentResearchRecords),
      count(agoojyeBackgroundJobs),
    ]);

    return res.json({
      ok: true,
      metrics: {
        totalParticipants: participants,
        confirmedRoles: Number(confirmedRoles[0]?.value || 0),
        emailsCreated: emails,
        activeTeams: teams,
        openTasks: Number(tasks[0]?.value || 0),
        upcomingMilestones: milestones,
        sponsorLeads: sponsors,
        partnerLeads: partners,
        documentsPendingReview: Number(documents[0]?.value || 0),
        mediaAssets: media,
        sponsorCategories,
        pipelineStages,
        crmOrganizations,
        crmContacts,
        sponsorOpportunities,
        crmActivities,
        emailTemplates,
        toolboxAssets,
        suppressionEntries,
        outreachApprovals,
        mailThreads,
        mailMessages,
        outreachSequences,
        sequenceEnrollments,
        importBatches,
        agentResearchRecords,
        backgroundJobs,
      },
      bootstrap: await bootstrapPayload(tenantId, false),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de charger le tableau de bord AGOOJIYE." });
  }
});

adminApi.post("/mail/sync", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const profiles = await ensureAgoojiyeHumanMailProfiles(tenantId);
    const indexed = await runMailIndexer({ tenantId, agentKey: null, limitPerMailbox: 500 });
    const mirrored = await syncAgoojiyeUnifiedInbox(tenantId);
    await audit(tenantId, {
      actor: actor(req),
      action: "mail_sync",
      entityType: "unified_inbox",
      metadata: { profiles, indexed: indexed.indexed, skipped: indexed.skipped, mirrored },
    });
    return res.json({ ok: true, profiles, indexed, mirrored });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de synchroniser les boites AGOOJIYE." });
  }
});

adminApi.post("/imports/preview", pipelineImportUpload.single("file"), async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const target = normalizeText(req.body?.target);
    if (!isAgoojiyeImportTarget(target)) {
      return res.status(400).json({ message: "Cible d'import invalide." });
    }
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "Selectionnez un fichier CSV ou XLSX." });

    const parsed = parseAgoojiyeImportFile({ fileName: file.originalname, buffer: file.buffer });
    const requestedMapping = parseAgoojiyeImportMapping(req.body?.mapping);
    const inferredMapping = inferAgoojiyeImportMapping(target, parsed.headers);
    const mapping = Object.keys(requestedMapping).length ? requestedMapping : inferredMapping;
    const invalidColumns = Object.values(mapping).filter((column) => column && !parsed.headers.includes(column));
    if (invalidColumns.length) return res.status(400).json({ message: `Colonnes inconnues: ${invalidColumns.join(", ")}.` });

    const normalized = normalizeAgoojiyeImportRows(target, parsed.rows, mapping);
    const existingKeys = await existingAgoojiyeImportKeys(tenantId, target);
    const existingDuplicateRows = normalized.validRows
      .filter((row) => existingKeys.has(importDedupeKey(target, row.data)))
      .map((row) => row.sourceRow);

    return res.json({
      ok: true,
      fileName: file.originalname,
      sourceType: parsed.sourceType,
      target,
      rowCount: parsed.rows.length,
      validCount: normalized.validRows.length,
      invalidCount: normalized.warnings.length,
      duplicateCount: normalized.duplicateKeys.length + existingDuplicateRows.length,
      existingDuplicateRows: existingDuplicateRows.slice(0, 100),
      warnings: normalized.warnings.slice(0, 100),
      headers: parsed.headers,
      fields: AGOOJIYE_IMPORT_FIELDS[target].map(({ aliases: _aliases, ...field }) => field),
      mapping,
      preview: normalized.validRows.slice(0, 10),
    });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Impossible de previsualiser cet import." });
  }
});

adminApi.post("/imports/confirm", pipelineImportUpload.single("file"), async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const target = normalizeText(req.body?.target);
    if (!isAgoojiyeImportTarget(target)) {
      return res.status(400).json({ message: "Cible d'import invalide." });
    }
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "Le fichier doit etre renvoye pour confirmer l'import." });

    const parsed = parseAgoojiyeImportFile({ fileName: file.originalname, buffer: file.buffer });
    const mapping = parseAgoojiyeImportMapping(req.body?.mapping);
    if (!Object.keys(mapping).length) return res.status(400).json({ message: "Previsualisez et mappez les colonnes avant de confirmer." });
    const invalidColumns = Object.values(mapping).filter((column) => column && !parsed.headers.includes(column));
    if (invalidColumns.length) return res.status(400).json({ message: `Colonnes inconnues: ${invalidColumns.join(", ")}.` });
    const normalized = normalizeAgoojiyeImportRows(target, parsed.rows, mapping);
    if (!normalized.validRows.length) return res.status(400).json({ message: "Aucune ligne valide a importer." });

    const batch = await importAgoojiyePipelineRows({
      tenantId,
      target,
      fileName: file.originalname,
      sourceType: parsed.sourceType,
      mapping,
      rows: normalized.validRows,
      warnings: normalized.warnings,
      createdBy: actor(req),
    });
    await audit(tenantId, {
      actor: actor(req),
      action: "pipeline_import_completed",
      entityType: "import_batch",
      entityId: Number(batch?.id || 0) || null,
      metadata: {
        target,
        fileName: file.originalname,
        rowCount: parsed.rows.length,
        importedCount: Number(batch?.importedCount || 0),
        duplicateCount: Number(batch?.duplicateCount || 0),
        skippedCount: Number(batch?.skippedCount || 0),
      },
    });
    return res.status(201).json({ ok: true, item: batch });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Impossible de confirmer cet import." });
  }
});

adminApi.post("/agent-research/run", async (req: any, res) => {
  const tenantId = Number(req.tenant.id);
  const organizationId = Number(req.body?.organizationId || 0);
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    return res.status(400).json({ message: "Selectionnez une organisation CRM." });
  }

  try {
    const [organization] = await db
      .select()
      .from(agoojyeCrmOrganizations)
      .where(and(eq(agoojyeCrmOrganizations.tenantId, tenantId), eq(agoojyeCrmOrganizations.id, organizationId)))
      .limit(1);
    if (!organization) return res.status(404).json({ message: "Organisation introuvable pour ce tenant." });
    if (organization.doNotContact) return res.status(409).json({ message: "Cette organisation est marquee ne pas contacter." });

    const contactId = Number(req.body?.contactId || 0) || null;
    const [contact] = contactId
      ? await db
          .select()
          .from(agoojyeCrmContacts)
          .where(and(eq(agoojyeCrmContacts.tenantId, tenantId), eq(agoojyeCrmContacts.id, contactId)))
          .limit(1)
      : [];
    if (contactId && !contact) return res.status(404).json({ message: "Contact introuvable pour ce tenant." });
    if (contact?.organizationId && contact.organizationId !== organizationId) {
      return res.status(409).json({ message: "Le contact n'appartient pas a l'organisation selectionnee." });
    }
    if (contact?.doNotContact) return res.status(409).json({ message: "Ce contact est marque ne pas contacter." });

    const opportunityId = Number(req.body?.opportunityId || 0) || null;
    const [opportunity] = opportunityId
      ? await db
          .select()
          .from(agoojyeSponsorOpportunities)
          .where(and(eq(agoojyeSponsorOpportunities.tenantId, tenantId), eq(agoojyeSponsorOpportunities.id, opportunityId)))
          .limit(1)
      : [];
    if (opportunityId && !opportunity) return res.status(404).json({ message: "Opportunite introuvable pour ce tenant." });
    if (opportunity && opportunity.organizationId !== organizationId) {
      return res.status(409).json({ message: "L'opportunite n'appartient pas a l'organisation selectionnee." });
    }
    if (opportunity?.doNotContact) return res.status(409).json({ message: "Cette opportunite est marquee ne pas contacter." });

    const sourceUrls = Array.isArray(req.body?.sourceUrls) ? req.body.sourceUrls : parseList(req.body?.sourceUrls);
    const sourceRecords = await runAgoojiyePublicSourceResearch(sourceUrls);
    const score = scoreAgoojiyeResearch({
      organizationName: organization.name,
      industry: organization.industry,
      strategicRelevance: organization.strategicRelevance,
      sources: sourceRecords,
    });
    const summary = buildAgoojiyeResearchSummary({
      organizationName: organization.name,
      sources: sourceRecords,
      category: score.sponsorCategoryGuess,
      matchedThemes: score.matchedThemes,
    });

    const requestedTemplateId = Number(req.body?.templateId || 0) || null;
    const templateWhere = requestedTemplateId
      ? and(
          eq(agoojyeEmailTemplates.tenantId, tenantId),
          eq(agoojyeEmailTemplates.id, requestedTemplateId),
          eq(agoojyeEmailTemplates.status, "approved"),
        )
      : and(eq(agoojyeEmailTemplates.tenantId, tenantId), eq(agoojyeEmailTemplates.status, "approved"));
    const [template] = await db
      .select()
      .from(agoojyeEmailTemplates)
      .where(templateWhere)
      .orderBy(desc(agoojyeEmailTemplates.approvedAt), desc(agoojyeEmailTemplates.updatedAt))
      .limit(1);
    if (requestedTemplateId && !template) {
      return res.status(409).json({ message: "Le modele demande n'existe pas ou n'est pas approuve." });
    }

    const senderIdentityId = Number(req.body?.senderIdentityId || template?.senderIdentityId || 0) || null;
    if (senderIdentityId) {
      const [sender] = await db
        .select({ id: agoojyeEmailIdentities.id })
        .from(agoojyeEmailIdentities)
        .where(
          and(
            eq(agoojyeEmailIdentities.tenantId, tenantId),
            eq(agoojyeEmailIdentities.id, senderIdentityId),
            eq(agoojyeEmailIdentities.status, "active"),
            eq(agoojyeEmailIdentities.canSend, true),
          ),
        )
        .limit(1);
      if (!sender) return res.status(409).json({ message: "Identite expediteur inactive ou non autorisee." });
    }

    const [category] = await db
      .select({ id: agoojyeSponsorCategories.id })
      .from(agoojyeSponsorCategories)
      .where(
        and(
          eq(agoojyeSponsorCategories.tenantId, tenantId),
          sql`lower(${agoojyeSponsorCategories.name}) = lower(${score.sponsorCategoryGuess})`,
        ),
      )
      .limit(1);
    const toolboxRows = await db
      .select({ id: agoojyeToolboxAssets.id })
      .from(agoojyeToolboxAssets)
      .where(
        category?.id
          ? and(
              eq(agoojyeToolboxAssets.tenantId, tenantId),
              eq(agoojyeToolboxAssets.status, "approved"),
              eq(agoojyeToolboxAssets.sponsorCategoryId, category.id),
            )
          : and(eq(agoojyeToolboxAssets.tenantId, tenantId), eq(agoojyeToolboxAssets.status, "approved")),
      )
      .orderBy(desc(agoojyeToolboxAssets.updatedAt))
      .limit(5);

    const draft = buildAgoojiyeResearchDraft({
      organizationName: organization.name,
      contactFirstName: contact?.firstName,
      contactTitle: contact?.jobTitle,
      category: score.sponsorCategoryGuess,
      matchedThemes: score.matchedThemes,
      templateSubject: template?.subject,
      templateBody: template?.body,
    });
    const successfulSources = sourceRecords.filter((source) => source.status === "fetched");
    const requestedByUserId = Number(req.body?.requestedByUserId || 0) || null;
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      let approval: any = null;
      if (successfulSources.length) {
        [approval] = await tx
          .insert(agoojyeOutreachApprovals)
          .values({
            tenantId,
            opportunityId,
            contactId,
            templateId: template?.id || null,
            requesterUserId: requestedByUserId,
            reviewerUserId: null,
            senderIdentityId,
            subject: draft.subject,
            body: draft.body,
            status: "awaiting_approval",
            scheduledAt: null,
            approvedAt: null,
            rejectedAt: null,
            sentAt: null,
            decisionNotes: "Brouillon cree par le workflow de recherche publique. Verification humaine obligatoire.",
            agentResearchJson: {
              organizationId,
              sourceRecords,
              scoreBreakdown: score.breakdown,
              automatedAssistance: true,
            },
            createdAt: now,
            updatedAt: now,
          })
          .returning();
      }

      const [research] = await tx
        .insert(agoojyeAgentResearchRecords)
        .values({
          tenantId,
          organizationId,
          contactId,
          opportunityId,
          requestedByUserId,
          approvalId: approval?.id || null,
          researchStatus: successfulSources.length ? "ready_for_review" : "needs_verification",
          sourceUrls: sourceRecords.map((source) => source.url),
          sourceRecordsJson: sourceRecords,
          summary,
          sponsorCategoryGuess: score.sponsorCategoryGuess,
          relevanceScore: score.relevanceScore,
          confidenceScore: score.confidenceScore,
          recommendedTemplateId: template?.id || null,
          recommendedToolboxAssetIds: toolboxRows.map((asset) => asset.id),
          draftSubject: draft.subject,
          draftBody: draft.body,
          guardrailNotes: "Sources publiques uniquement. Score explicable. Aucune relation, intention ou specification technique inventee. Envoi interdit sans approbation humaine.",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return { research, approval };
    });

    await audit(tenantId, {
      actor: actor(req),
      action: "agent_public_research_completed",
      entityType: "agent_research",
      entityId: result.research.id,
      metadata: {
        organizationId,
        approvalId: result.approval?.id || null,
        successfulSources: successfulSources.length,
        failedSources: sourceRecords.length - successfulSources.length,
        relevanceScore: score.relevanceScore,
        confidenceScore: score.confidenceScore,
      },
    });
    return res.status(201).json({ ok: true, item: result.research, approval: result.approval, scoreBreakdown: score.breakdown });
  } catch (error: any) {
    return res.status(400).json({ message: normalizeText(error?.message || error || "Recherche impossible").slice(0, 1_000) });
  }
});

adminApi.get("/sequence-enrollments", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const items = await db
      .select({
        id: agoojyeSequenceEnrollments.id,
        tenantId: agoojyeSequenceEnrollments.tenantId,
        sequenceId: agoojyeSequenceEnrollments.sequenceId,
        sequenceName: agoojyeOutreachSequences.name,
        opportunityId: agoojyeSequenceEnrollments.opportunityId,
        opportunityTitle: agoojyeSponsorOpportunities.title,
        contactId: agoojyeSequenceEnrollments.contactId,
        contactFirstName: agoojyeCrmContacts.firstName,
        contactLastName: agoojyeCrmContacts.lastName,
        contactEmail: agoojyeCrmContacts.email,
        senderIdentityId: agoojyeSequenceEnrollments.senderIdentityId,
        senderEmail: agoojyeEmailIdentities.emailAddress,
        currentApprovalId: agoojyeSequenceEnrollments.currentApprovalId,
        status: agoojyeSequenceEnrollments.status,
        currentStep: agoojyeSequenceEnrollments.currentStep,
        nextRunAt: agoojyeSequenceEnrollments.nextRunAt,
        lastSentAt: agoojyeSequenceEnrollments.lastSentAt,
        activatedBy: agoojyeSequenceEnrollments.activatedBy,
        activatedAt: agoojyeSequenceEnrollments.activatedAt,
        stopReason: agoojyeSequenceEnrollments.stopReason,
        completedAt: agoojyeSequenceEnrollments.completedAt,
        createdAt: agoojyeSequenceEnrollments.createdAt,
        updatedAt: agoojyeSequenceEnrollments.updatedAt,
      })
      .from(agoojyeSequenceEnrollments)
      .innerJoin(
        agoojyeOutreachSequences,
        and(
          eq(agoojyeOutreachSequences.tenantId, agoojyeSequenceEnrollments.tenantId),
          eq(agoojyeOutreachSequences.id, agoojyeSequenceEnrollments.sequenceId),
        ),
      )
      .innerJoin(
        agoojyeSponsorOpportunities,
        and(
          eq(agoojyeSponsorOpportunities.tenantId, agoojyeSequenceEnrollments.tenantId),
          eq(agoojyeSponsorOpportunities.id, agoojyeSequenceEnrollments.opportunityId),
        ),
      )
      .innerJoin(
        agoojyeCrmContacts,
        and(
          eq(agoojyeCrmContacts.tenantId, agoojyeSequenceEnrollments.tenantId),
          eq(agoojyeCrmContacts.id, agoojyeSequenceEnrollments.contactId),
        ),
      )
      .innerJoin(
        agoojyeEmailIdentities,
        and(
          eq(agoojyeEmailIdentities.tenantId, agoojyeSequenceEnrollments.tenantId),
          eq(agoojyeEmailIdentities.id, agoojyeSequenceEnrollments.senderIdentityId),
        ),
      )
      .where(eq(agoojyeSequenceEnrollments.tenantId, tenantId))
      .orderBy(desc(agoojyeSequenceEnrollments.updatedAt))
      .limit(500);
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de lister les inscriptions aux sequences." });
  }
});

adminApi.post("/sequences/:id/activate", async (req: any, res) => {
  const tenantId = Number(req.tenant.id);
  const sequenceId = Number(req.params.id);
  if (!Number.isFinite(sequenceId) || sequenceId <= 0) return res.status(400).json({ message: "ID de sequence invalide." });
  try {
    const item = await activateAgoojiyeSequence({ tenantId, sequenceId });
    await audit(tenantId, {
      actor: actor(req),
      action: "outreach_sequence_activated",
      entityType: "outreach_sequence",
      entityId: sequenceId,
      metadata: { humanApproval: true },
    });
    return res.json({ ok: true, item });
  } catch (error: any) {
    const status = error instanceof AgoojiyeSequenceError ? error.statusCode : 500;
    return res.status(status).json({ message: normalizeText(error?.message || error || "Activation impossible").slice(0, 1_000) });
  }
});

adminApi.post("/sequences/:id/enroll", async (req: any, res) => {
  const tenantId = Number(req.tenant.id);
  const sequenceId = Number(req.params.id);
  const opportunityId = Number(req.body?.opportunityId);
  const contactId = Number(req.body?.contactId);
  const senderIdentityId = Number(req.body?.senderIdentityId);
  if (![sequenceId, opportunityId, contactId, senderIdentityId].every((value) => Number.isFinite(value) && value > 0)) {
    return res.status(400).json({ message: "Sequence, opportunite, contact et expediteur sont obligatoires." });
  }
  try {
    const result = await enrollAgoojiyeSequence({
      tenantId,
      sequenceId,
      opportunityId,
      contactId,
      senderIdentityId,
      actor: actor(req),
      requesterUserId: null,
    });
    await audit(tenantId, {
      actor: actor(req),
      action: "outreach_sequence_contact_enrolled",
      entityType: "sequence_enrollment",
      entityId: result.enrollment.id,
      metadata: { sequenceId, opportunityId, contactId, approvalId: result.approval.id, initialHumanApprovalRequired: true },
    });
    return res.status(201).json({ ok: true, ...result });
  } catch (error: any) {
    const status = error instanceof AgoojiyeSequenceError ? error.statusCode : 500;
    return res.status(status).json({ message: normalizeText(error?.message || error || "Inscription impossible").slice(0, 1_000) });
  }
});

adminApi.post("/sequence-enrollments/:id/stop", async (req: any, res) => {
  const tenantId = Number(req.tenant.id);
  const enrollmentId = Number(req.params.id);
  if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) return res.status(400).json({ message: "ID d'inscription invalide." });
  const reason = normalizeText(req.body?.reason) || "manual_stop";
  const item = await stopAgoojiyeSequenceEnrollment({ tenantId, enrollmentId, reason });
  if (!item) return res.status(404).json({ message: "Inscription introuvable pour ce tenant." });
  await audit(tenantId, {
    actor: actor(req),
    action: "outreach_sequence_enrollment_stopped",
    entityType: "sequence_enrollment",
    entityId: enrollmentId,
    metadata: { reason },
  });
  return res.json({ ok: true, item });
});

adminApi.post("/approvals/:id/send", async (req: any, res) => {
  const tenantId = Number(req.tenant.id);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "ID d'approbation invalide." });
  try {
    const delivered = await deliverApprovedAgoojiyeOutreach({
      tenantId,
      approvalId: id,
      actor: actor(req),
      actorUserId: actorUserId(req),
    });
    return res.json({ ok: true, ...delivered });
  } catch (error: any) {
    const message = normalizeText(error?.message || error || "Envoi impossible").slice(0, 1_000);
    return res.status(400).json({ message });
  }
});

adminApi.post("/jobs/run-due", async (req: any, res) => {
  const result = await runAgoojiyeJobWorkerOnce(Math.min(Math.max(Number(req.body?.maxBatch) || 5, 1), 25));
  await audit(Number(req.tenant.id), {
    actor: actor(req),
    action: "background_jobs_run_due",
    entityType: "background_job",
    metadata: result,
  });
  return res.json({ ok: true, result });
});

adminApi.post("/jobs/:id/retry", async (req: any, res) => {
  const tenantId = Number(req.tenant.id);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "ID de job invalide." });
  const now = new Date();
  const [item] = await db
    .update(agoojyeBackgroundJobs)
    .set({ status: "queued", scheduledAt: now, startedAt: null, completedAt: null, error: null, updatedAt: now })
    .where(
      and(
        eq(agoojyeBackgroundJobs.tenantId, tenantId),
        eq(agoojyeBackgroundJobs.id, id),
        inArray(agoojyeBackgroundJobs.status, ["failed", "dead_letter", "cancelled"]),
      ),
    )
    .returning();
  if (!item) return res.status(409).json({ message: "Seuls les jobs echoues, annules ou dead-letter peuvent etre relances." });
  await audit(tenantId, { actor: actor(req), action: "background_job_retried", entityType: "background_job", entityId: id });
  return res.json({ ok: true, item });
});

adminApi.post("/jobs/:id/cancel", async (req: any, res) => {
  const tenantId = Number(req.tenant.id);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "ID de job invalide." });
  const now = new Date();
  const [item] = await db
    .update(agoojyeBackgroundJobs)
    .set({ status: "cancelled", completedAt: now, updatedAt: now })
    .where(
      and(
        eq(agoojyeBackgroundJobs.tenantId, tenantId),
        eq(agoojyeBackgroundJobs.id, id),
        eq(agoojyeBackgroundJobs.status, "queued"),
      ),
    )
    .returning();
  if (!item) return res.status(409).json({ message: "Seul un job en attente peut etre annule." });
  await audit(tenantId, { actor: actor(req), action: "background_job_cancelled", entityType: "background_job", entityId: id });
  return res.json({ ok: true, item });
});

adminApi.get("/:resource", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const resource = getResource(req.params.resource);
    if (!resource) return res.status(404).json({ message: "Ressource AGOOJIYE inconnue." });
    const table: any = resource.table;
    const limit = Math.min(Math.max(Number(req.query.limit) || 250, 1), 500);
    const rows = await db.select().from(table).where(eq(table.tenantId, tenantId)).orderBy(desc(table.updatedAt), desc(table.createdAt)).limit(limit);
    const items = req.params.resource === "email-settings" ? rows.map(sanitizeAgoojiyeEmailSettingsRow) : rows;
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de lister la ressource AGOOJIYE." });
  }
});

adminApi.post("/:resource", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const resource = getResource(req.params.resource);
    if (!resource) return res.status(404).json({ message: "Ressource AGOOJIYE inconnue." });
    if (req.params.resource === "imports") {
      return res.status(405).json({ message: "Utilisez la previsualisation CSV/XLSX puis la confirmation securisee de l'import." });
    }
    if (req.params.resource === "agent-research") {
      return res.status(405).json({ message: "Utilisez le workflow de recherche publique controle." });
    }
    if (req.params.resource === "email-settings" && hasForbiddenAgoojiyeSmtpSecret(req.body)) {
      return res.status(400).json({
        message: "Les mots de passe SMTP ne sont jamais acceptes par cette API. Configurez les secrets dans l'environnement serveur.",
      });
    }
    const table: any = resource.table;
    const values = resource.create(tenantId, req.body || {}, req);
    if ("email" in values && !normalizeText((values as any).email)) return res.status(400).json({ message: "email is required" });
    if ("emailAddress" in values && !normalizeText((values as any).emailAddress)) return res.status(400).json({ message: "emailAddress is required" });
    if ("title" in values && !normalizeText((values as any).title)) return res.status(400).json({ message: "title is required" });
    if ("name" in values && !normalizeText((values as any).name)) return res.status(400).json({ message: "name is required" });
    if (req.params.resource === "opportunities" && !(values as any).organizationId) return res.status(400).json({ message: "organizationId is required" });
    if (req.params.resource === "mail-messages" && !(values as any).threadId) return res.status(400).json({ message: "threadId is required" });
    if (req.params.resource === "imports" && !normalizeText((values as any).fileName)) return res.status(400).json({ message: "fileName is required" });
    if (req.params.resource === "jobs" && !isAgoojiyeJobType((values as any).jobType)) {
      return res.status(400).json({ message: "Type de job AGOOJIYE inconnu." });
    }
    if ((req.params.resource === "approvals" || req.params.resource === "email-templates") && !normalizeText((values as any).subject)) return res.status(400).json({ message: "subject is required" });
    if ((req.params.resource === "approvals" || req.params.resource === "email-templates") && !normalizeText((values as any).body)) return res.status(400).json({ message: "body is required" });

    if (req.params.resource === "email-identities" && (values as any).emailType === "individual" && (values as any).userId) {
      const user = await db.query.agoojyeProjectUsers.findFirst({
        where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.id, Number((values as any).userId))),
      });
      if (!user?.confirmedRole) {
        return res.status(400).json({ message: "Seuls les participants confirmés peuvent recevoir une identité email individuelle AGOOJIYE." });
      }
    }

    const inserted = (await db
      .insert(table)
      .values({ ...values, createdAt: new Date(), updatedAt: new Date() })
      .returning()) as any[];
    const item = inserted[0];

    if (req.params.resource === "email-identities" && (item as any)?.userId) {
      await db
        .update(agoojyeProjectUsers)
        .set({ emailAccountCreated: true, updatedAt: new Date() })
        .where(and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.id, Number((item as any).userId))));
    }

    if (req.params.resource === "messages") {
      const recipientUserIds = parseList(req.body?.recipientUserIds).map((entry) => Number(entry)).filter((value) => Number.isFinite(value) && value > 0);
      if (recipientUserIds.length) {
        await db.insert(agoojyeInternalMessageRecipients).values(
          recipientUserIds.map((userId) => ({
            tenantId,
            messageId: Number((item as any).id),
            userId,
            teamId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        );
      }
    }

    await audit(tenantId, { actor: actor(req), action: "create", entityType: resource.entity, entityId: Number((item as any).id) || null });
    return res.status(201).json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de créer la ressource AGOOJIYE." });
  }
});

adminApi.patch("/:resource/:id", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
    const resource = getResource(req.params.resource);
    if (!resource) return res.status(404).json({ message: "Ressource AGOOJIYE inconnue." });
    if (req.params.resource === "email-settings" && hasForbiddenAgoojiyeSmtpSecret(req.body)) {
      return res.status(400).json({
        message: "Les mots de passe SMTP ne sont jamais acceptes par cette API. Configurez les secrets dans l'environnement serveur.",
      });
    }
    if (req.params.resource === "imports") {
      return res.status(405).json({ message: "Les resultats d'import sont calcules par le serveur et ne peuvent pas etre modifies manuellement." });
    }
    if (req.params.resource === "jobs" && ["running", "completed", "failed", "dead_letter"].includes(normalizeText(req.body?.status))) {
      return res.status(400).json({ message: "Le statut d'execution d'un job ne peut pas etre simule depuis l'interface." });
    }

    const table: any = resource.table;
    let patchBody = { ...(req.body || {}) };
    if (req.params.resource === "sequences") {
      const [current] = await db
        .select()
        .from(agoojyeOutreachSequences)
        .where(and(eq(agoojyeOutreachSequences.tenantId, tenantId), eq(agoojyeOutreachSequences.id, id)))
        .limit(1);
      if (!current) return res.status(404).json({ message: "Sequence introuvable pour ce tenant." });

      const requestedStatus = Object.prototype.hasOwnProperty.call(patchBody, "status")
        ? normalizeText(patchBody.status)
        : current.status;
      if (requestedStatus === "active") {
        return res.status(400).json({ message: "Utilisez l'action Activer apres la revue et l'approbation de la sequence." });
      }
      const allowedTransitions: Record<string, string[]> = {
        draft: ["draft", "under_review", "archived"],
        under_review: ["under_review", "draft", "approved", "archived"],
        approved: ["approved", "draft", "archived"],
        active: ["active", "paused"],
        paused: ["paused", "draft", "approved", "archived"],
        archived: ["archived"],
      };
      if (!(allowedTransitions[current.status] || []).includes(requestedStatus)) {
        return res.status(409).json({ message: `Transition de sequence invalide depuis ${current.status} vers ${requestedStatus}.` });
      }
      const configFields = ["templateIds", "maxSteps", "minDelayHours", "dailyLimit", "businessHours", "stopOnReply", "stopOnBounce"];
      const changesConfiguration = configFields.some(
        (field) =>
          Object.prototype.hasOwnProperty.call(patchBody, field) &&
          JSON.stringify((patchBody as any)[field]) !== JSON.stringify((current as any)[field]),
      );
      if (current.status === "active" && changesConfiguration) {
        return res.status(409).json({ message: "Mettez la sequence en pause avant de modifier sa cadence ou ses modeles." });
      }
      if (changesConfiguration && ["under_review", "approved", "paused"].includes(current.status)) {
        patchBody.status = "draft";
      }
    }
    if (req.params.resource === "agent-research") {
      const status = normalizeText(patchBody.researchStatus);
      if (!["needs_verification", "ready_for_review", "approved", "rejected", "archived"].includes(status)) {
        return res.status(400).json({ message: "Seul un statut de revue valide peut etre modifie." });
      }
      patchBody = { researchStatus: status };
    }
    if (req.params.resource === "approvals") {
      const [current] = await db
        .select()
        .from(agoojyeOutreachApprovals)
        .where(and(eq(agoojyeOutreachApprovals.tenantId, tenantId), eq(agoojyeOutreachApprovals.id, id)))
        .limit(1);
      if (!current) return res.status(404).json({ message: "Approbation introuvable pour ce tenant." });

      const requestedStatus = normalizeText(patchBody.status);
      if (["sent", "sending", "failed"].includes(requestedStatus)) {
        return res.status(400).json({ message: "Le statut d'envoi est gere exclusivement par l'action serveur Envoyer maintenant." });
      }
      const protectedFields = ["subject", "body", "contactId", "senderIdentityId", "templateId"];
      const changesApprovedContent = protectedFields.some(
        (field) => Object.prototype.hasOwnProperty.call(patchBody, field) && String((patchBody as any)[field] ?? "") !== String((current as any)[field] ?? ""),
      );
      if (changesApprovedContent && ["approved", "scheduled", "failed"].includes(current.status) && requestedStatus !== "approved") {
        patchBody.status = "awaiting_approval";
        patchBody.approvedAt = null;
        patchBody.reviewerUserId = null;
        patchBody.scheduledAt = null;
      } else if (requestedStatus === "approved") {
        if (!["awaiting_approval", "rejected", "failed"].includes(current.status)) {
          return res.status(409).json({ message: `Transition d'approbation invalide depuis ${current.status}.` });
        }
        patchBody.approvedAt = new Date().toISOString();
        patchBody.rejectedAt = null;
        patchBody.reviewerUserId = actorUserId(req);
      } else if (requestedStatus === "rejected") {
        patchBody.rejectedAt = new Date().toISOString();
        patchBody.approvedAt = null;
        patchBody.reviewerUserId = actorUserId(req);
      } else if (requestedStatus === "scheduled") {
        if (current.status !== "approved") {
          return res.status(409).json({ message: "Un message doit etre approuve avant sa programmation." });
        }
        const scheduledAt = parseDate(patchBody.scheduledAt);
        if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
          return res.status(400).json({ message: "Choisissez une date d'envoi future." });
        }
      }
    }

    const patch = sanitizePatch(resource, patchBody);
    if (Object.keys(patch).length <= 1) return res.status(400).json({ message: "No supported fields to update" });
    const [item] = await db.update(table).set(patch).where(and(eq(table.tenantId, tenantId), eq(table.id, id))).returning();
    if (!item) return res.status(404).json({ message: "Resource not found for tenant" });
    if (req.params.resource === "approvals" && (item as any).status === "scheduled") {
      await enqueueAgoojiyeJob({
        tenantId,
        jobType: "scheduled_send",
        scheduledAt: (item as any).scheduledAt,
        relatedEntityType: "outreach_approval",
        relatedEntityId: id,
        payloadJson: { approvalId: id, maxAttempts: 3 },
        createdBy: actor(req),
        dedupe: true,
      });
    }
    if (req.params.resource === "approvals" && ["rejected", "cancelled"].includes((item as any).status)) {
      const approvalMetadata =
        (item as any).agentResearchJson && typeof (item as any).agentResearchJson === "object"
          ? (item as any).agentResearchJson
          : {};
      const enrollmentId = Number(approvalMetadata.sequenceEnrollmentId || 0);
      if (Number.isFinite(enrollmentId) && enrollmentId > 0) {
        await stopAgoojiyeSequenceEnrollment({
          tenantId,
          enrollmentId,
          reason: (item as any).status === "rejected" ? "approval_rejected" : "approval_cancelled",
        });
      }
    }
    if (req.params.resource === "sequences" && (item as any).status === "paused") {
      const enrollments = await db
        .select({ id: agoojyeSequenceEnrollments.id })
        .from(agoojyeSequenceEnrollments)
        .where(
          and(
            eq(agoojyeSequenceEnrollments.tenantId, tenantId),
            eq(agoojyeSequenceEnrollments.sequenceId, id),
            inArray(agoojyeSequenceEnrollments.status, ["awaiting_initial_approval", "active"]),
          ),
        );
      for (const enrollment of enrollments) {
        // eslint-disable-next-line no-await-in-loop
        await stopAgoojiyeSequenceEnrollment({ tenantId, enrollmentId: enrollment.id, reason: "sequence_paused" });
      }
    }
    if (req.params.resource === "participants" && Object.prototype.hasOwnProperty.call(req.body || {}, "confirmedRole") && (item as any).userId) {
      await db
        .update(agoojyeProjectUsers)
        .set({ confirmedRole: Boolean((item as any).confirmedRole), updatedAt: new Date() })
        .where(and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.id, Number((item as any).userId))));
    }
    await audit(tenantId, { actor: actor(req), action: "update", entityType: resource.entity, entityId: id, metadata: { fields: Object.keys(patch) } });
    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de mettre à jour la ressource AGOOJIYE." });
  }
});

router.use("/api/agoojye", publicApi);
router.use("/api/admin/agoojye", adminApi);

export default router;
