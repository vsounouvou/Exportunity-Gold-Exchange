import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeContentBlocks,
  agoojyeDocuments,
  agoojyeEmailIdentities,
  agoojyeInternalMessageRecipients,
  agoojyeInternalMessages,
  agoojyeMediaAssets,
  agoojyeMilestones,
  agoojyeParticipants,
  agoojyePartners,
  agoojyePermissions,
  agoojyeProjectUsers,
  agoojyeRoles,
  agoojyeSponsorLeads,
  agoojyeTasks,
  agoojyeTeams,
  agoojyeTenantEmailSettings,
} from "@db/schema";

import { ensureTenantAdmin } from "./utils/auth";

const router = Router();
const publicApi = Router();
const adminApi = Router();

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
  "media@agoojiye.com",
  "sponsors@agoojiye.com",
  "partners@agoojiye.com",
  "investors@agoojiye.com",
  "legal@agoojiye.com",
  "press@agoojiye.com",
] as const;

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
  ["Assemblage public", "Assemblage public cible du bus électrique.", "2026-07-15T00:00:00.000Z", "planned", "AGOOJYE Team", "public"],
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

const CONTENT_BLOCKS = [
  {
    page: "home",
    section: "hero",
    key: "main",
    titleFr: "AGOOJYE",
    titleEn: "AGOOJYE",
    contentFr:
      "Fait au Bénin. Conçu pour l'Afrique. Regardé par le monde. Un mouvement industriel de mobilité électrique inspiré par l'héritage des Amazones du Dahomey.",
    contentEn: "Made in Benin. Built for Africa. Watched by the World.",
    imageUrl: "/tenants/agoojye/hero-bus.svg",
  },
  {
    page: "vision",
    section: "statement",
    key: "industrial-movement",
    titleFr: "L'Afrique ne fera pas que consommer le futur. Elle le construira.",
    titleEn: "Africa will not only consume the future. Africa will build it.",
    contentFr:
      "AGOOJYE pose les bases d'une capacite industrielle beninoise pour concevoir, assembler et industrialiser des solutions de transport propres adaptees au continent.",
    contentEn:
      "AGOOJYE lays the foundation for Beninese industrial capacity in clean transport solutions adapted to Africa.",
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

function actor(req: any) {
  return normalizeText(req.adminUser?.email || req.adminUser?.displayName || "admin");
}

function ensureAgoojyeTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant || String(tenant.key || "").trim().toLowerCase() !== "agoojye") {
    res.status(404).json({ message: "Les routes AGOOJYE ne sont pas disponibles sur ce tenant." });
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

async function ensureAgoojyeSeed(tenantId: number) {
  if (!Number.isFinite(tenantId) || tenantId <= 0) return;
  if (seededTenants.has(tenantId)) return;
  const now = new Date();

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
        description: `${name} AGOOJYE`,
        permissions: [...permissions],
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing();

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
        status: "requested",
        canSend: true,
        canReceive: true,
        createdBy: "seed",
        notes: "Alias officiel seed. Provisionner manuellement via Google Workspace, Zoho, Proton ou SMTP.",
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing();

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
      .onConflictDoNothing();
  }

  await db
    .insert(agoojyeTenantEmailSettings)
    .values({
      tenantId,
      providerName: "manual",
      status: "not_configured",
      fromName: "AGOOJYE",
      fromEmail: "contact@agoojiye.com",
      replyToEmail: "contact@agoojiye.com",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

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
      .where(publicOnly ? and(eq(agoojyeMediaAssets.tenantId, tenantId), eq(agoojyeMediaAssets.visibility, "public")) : eq(agoojyeMediaAssets.tenantId, tenantId))
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
    return res.status(500).json({ message: error?.message || "Impossible de charger AGOOJYE." });
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
    await audit(tenantId, { action: "create", entityType: "sponsor_lead", entityId: item.id, metadata: { source: "public.sponsors" } });
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
    await audit(tenantId, { action: "create", entityType: "contact_lead", entityId: item.id, metadata: { inquiryType } });
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

const resources = {
  users: {
    table: agoojyeProjectUsers,
    entity: "project_user",
    create: (tenantId: number, body: any) => ({
      tenantId,
      firstName: normalizeText(body.firstName) || "Prenom",
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
      subject: normalizeText(body.subject) || "Message AGOOJYE",
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
      smtpPasswordEncrypted: normalizeText(body.smtpPasswordEncrypted || body.smtpPassword) || null,
      fromName: normalizeText(body.fromName) || "AGOOJYE",
      fromEmail: normalizeText(body.fromEmail) || "contact@agoojiye.com",
      replyToEmail: normalizeText(body.replyToEmail) || "contact@agoojiye.com",
      providerName: normalizeText(body.providerName) || "manual",
      status: normalizeText(body.status) || "not_configured",
    }),
    fields: ["smtpHost", "smtpPort", "smtpUsername", "smtpPasswordEncrypted", "fromName", "fromEmail", "replyToEmail", "providerName", "status"],
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
  for (const field of resource.fields || []) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    if (field === "skills" || field === "attachments" || field === "tags") {
      patch[field] = parseList(body[field]);
    } else if (field === "date" || field === "dueDate") {
      patch[field] = parseDate(body[field]);
    } else if (
      field.endsWith("Id") ||
      field === "teamId" ||
      field === "userId" ||
      field === "assignedTo" ||
      field === "createdBy" ||
      field === "uploadedBy" ||
      field === "assignedTo" ||
      field === "sortOrder" ||
      field === "smtpPort"
    ) {
      patch[field] = Number(body[field]) || null;
    } else if (field === "confirmedRole" || field === "emailAccountCreated" || field === "certificateEligible" || field === "canSend" || field === "canReceive") {
      patch[field] = Boolean(body[field]);
    } else if (field === "metadataJson" || field === "metadata") {
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
    const [participants, confirmedRoles, emails, teams, tasks, milestones, sponsors, partners, documents, media] = await Promise.all([
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
      },
      bootstrap: await bootstrapPayload(tenantId, false),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de charger le tableau de bord AGOOJYE." });
  }
});

adminApi.get("/:resource", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const resource = getResource(req.params.resource);
    if (!resource) return res.status(404).json({ message: "Ressource AGOOJYE inconnue." });
    const table: any = resource.table;
    const limit = Math.min(Math.max(Number(req.query.limit) || 250, 1), 500);
    const rows = await db.select().from(table).where(eq(table.tenantId, tenantId)).orderBy(desc(table.updatedAt), desc(table.createdAt)).limit(limit);
    const items =
      req.params.resource === "email-settings"
        ? rows.map((row: any) => ({
            ...row,
            smtpPasswordEncrypted: row.smtpPasswordEncrypted ? "********" : null,
          }))
        : rows;
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de lister la ressource AGOOJYE." });
  }
});

adminApi.post("/:resource", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const resource = getResource(req.params.resource);
    if (!resource) return res.status(404).json({ message: "Ressource AGOOJYE inconnue." });
    const table: any = resource.table;
    const values = resource.create(tenantId, req.body || {}, req);
    if ("email" in values && !normalizeText((values as any).email)) return res.status(400).json({ message: "email is required" });
    if ("emailAddress" in values && !normalizeText((values as any).emailAddress)) return res.status(400).json({ message: "emailAddress is required" });
    if ("title" in values && !normalizeText((values as any).title)) return res.status(400).json({ message: "title is required" });
    if ("name" in values && !normalizeText((values as any).name)) return res.status(400).json({ message: "name is required" });

    if (req.params.resource === "email-identities" && (values as any).emailType === "individual" && (values as any).userId) {
      const user = await db.query.agoojyeProjectUsers.findFirst({
        where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.id, Number((values as any).userId))),
      });
      if (!user?.confirmedRole) {
        return res.status(400).json({ message: "Seuls les participants confirmés peuvent recevoir une identité email individuelle AGOOJYE." });
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
    return res.status(500).json({ message: error?.message || "Impossible de créer la ressource AGOOJYE." });
  }
});

adminApi.patch("/:resource/:id", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
    const resource = getResource(req.params.resource);
    if (!resource) return res.status(404).json({ message: "Ressource AGOOJYE inconnue." });
    const table: any = resource.table;
    const patch = sanitizePatch(resource, req.body || {});
    if (Object.keys(patch).length <= 1) return res.status(400).json({ message: "No supported fields to update" });
    const [item] = await db.update(table).set(patch).where(and(eq(table.tenantId, tenantId), eq(table.id, id))).returning();
    if (!item) return res.status(404).json({ message: "Resource not found for tenant" });
    if (req.params.resource === "participants" && Object.prototype.hasOwnProperty.call(req.body || {}, "confirmedRole") && (item as any).userId) {
      await db
        .update(agoojyeProjectUsers)
        .set({ confirmedRole: Boolean((item as any).confirmedRole), updatedAt: new Date() })
        .where(and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.id, Number((item as any).userId))));
    }
    await audit(tenantId, { actor: actor(req), action: "update", entityType: resource.entity, entityId: id, metadata: { fields: Object.keys(patch) } });
    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Impossible de mettre à jour la ressource AGOOJYE." });
  }
});

router.use("/api/agoojye", publicApi);
router.use("/api/admin/agoojye", adminApi);

export default router;
