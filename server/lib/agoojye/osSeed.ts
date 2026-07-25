import { createHash, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeDocuments,
  agoojyeOsChannelMembers,
  agoojyeOsChannels,
  agoojyeOsDecisions,
  agoojyeOsInvitations,
  agoojyeOsMeetings,
  agoojyeOsNotifications,
  agoojyeOsProjectMembers,
  agoojyeOsProjects,
  agoojyePartners,
  agoojyeProjectUsers,
  agoojyeTasks,
  agoojyeTeams,
  tenants,
} from "@db/schema";

const TEAM_DEFINITIONS = [
  ["direction-coordination", "Direction & coordination", "Piloter les priorités, arbitrages et relations institutionnelles."],
  ["operations-mobilite", "Opérations mobilité", "Piloter les bus, trajets, passagers, contrôles et incidents."],
  ["engineering", "Ingénierie", "Concevoir et valider les systèmes techniques AGOOJIYE."],
  ["software-ai", "Logiciel & IA", "Construire les plateformes, données et assistants AGOOJIYE."],
  ["communication-media", "Communication & médias", "Organiser la communication, la presse et les actifs de marque."],
  ["sponsorship-partnerships", "Partenariats & développement", "Structurer les partenaires, clients, sponsors et commandes."],
] as const;

const TEAM_MEMBERS = [
  {
    firstName: "Vital",
    lastName: "Sounouvou",
    email: "vital@agoojiye.com",
    role: "Fondateur / Direction",
    teamSlug: "direction-coordination",
    accessLevel: 6,
    permissions: ["*"],
  },
  {
    firstName: "Regis",
    lastName: "AGOOJIYE",
    email: "regis@agoojiye.com",
    role: "Membre AGOOJIYE",
    teamSlug: "operations-mobilite",
    accessLevel: 3,
    permissions: ["messages", "tasks", "projects", "mobility"],
  },
  {
    firstName: "Soriane",
    lastName: "AGOOJIYE",
    email: "soriane@agoojiye.com",
    role: "Membre AGOOJIYE",
    teamSlug: "sponsorship-partnerships",
    accessLevel: 3,
    permissions: ["messages", "tasks", "projects", "crm"],
  },
  {
    firstName: "Maryse",
    lastName: "AGOOJIYE",
    email: "maryse@agoojiye.com",
    role: "Membre AGOOJIYE",
    teamSlug: "communication-media",
    accessLevel: 3,
    permissions: ["messages", "tasks", "projects", "documents"],
  },
  {
    firstName: "Christian",
    lastName: "AGOOJIYE",
    email: "christian@agoojiye.com",
    role: "Membre AGOOJIYE",
    teamSlug: "engineering",
    accessLevel: 3,
    permissions: ["messages", "tasks", "projects", "documents"],
  },
] as const;

const PROJECTS = [
  ["premier-bus-electrique", "Premier bus électrique AGOOJIYE", "Coordonner la conception, l'assemblage et la validation du premier bus.", "engineering", 38],
  ["plateforme-billetterie", "Plateforme de billetterie", "Opérer la recherche de trajets, les réservations, paiements et billets.", "software-ai", 72],
  ["lancement-national", "Lancement national", "Préparer la démonstration publique, la presse et le parcours partenaires.", "communication-media", 24],
  ["partenariats-industriels", "Partenariats industriels", "Structurer les échanges industriels et commerciaux prioritaires.", "sponsorship-partnerships", 31],
  ["operations-mobilite", "Opérations mobilité", "Préparer les lignes, bus, contrôleurs, incidents et indicateurs de service.", "operations-mobilite", 46],
] as const;

const CHANNELS = [
  ["annonces-generales", "Annonces générales", "announcement", null, 2],
  ["direction", "Direction", "group", "direction-coordination", 5],
  ["gestion", "Gestion", "group", "direction-coordination", 4],
  ["technique", "Technique", "department", "engineering", 3],
  ["communication", "Communication", "department", "communication-media", 3],
  ["operations-mobilite", "Opérations mobilité", "department", "operations-mobilite", 3],
  ["site-web", "Site web", "project", "software-ai", 3],
  ["sponsors-partenaires", "Sponsors & partenaires", "department", "sponsorship-partnerships", 3],
  ["prototype-bus", "Prototype bus", "project", "engineering", 3],
  ["tickets-incidents", "Tickets & incidents", "operations", "operations-mobilite", 3],
] as const;

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function invitationHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function resolveAgoojiyeTenantId() {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, "agoojye") });
  if (!tenant) throw new Error("Tenant AGOOJIYE introuvable");
  return Number(tenant.id);
}

export async function seedAgoojiyeOs(tenantId: number) {
  const teamBySlug = new Map<string, number>();
  for (const [slug, name, mission] of TEAM_DEFINITIONS) {
    const [team] = await db
      .insert(agoojyeTeams)
      .values({
        tenantId,
        slug,
        name,
        mission,
        description: mission,
        status: "active",
        visibility: slug === "direction-coordination" ? "private" : "public",
      })
      .onConflictDoUpdate({
        target: [agoojyeTeams.tenantId, agoojyeTeams.slug],
        set: { name, mission, description: mission, updatedAt: new Date() },
      })
      .returning({ id: agoojyeTeams.id });
    teamBySlug.set(slug, Number(team.id));
  }

  const userByEmail = new Map<string, number>();
  for (const member of TEAM_MEMBERS) {
    const teamId = teamBySlug.get(member.teamSlug) || null;
    const [user] = await db
      .insert(agoojyeProjectUsers)
      .values({
        tenantId,
        firstName: member.firstName,
        lastName: member.lastName,
        displayName: member.firstName,
        email: member.email,
        role: member.role,
        teamId,
        status: "Invited",
        employmentType: "employee",
        responsibilities: [],
        availability: "available",
        onboardingProgress: 20,
        accessLevel: member.accessLevel,
        permissions: [...member.permissions],
        confirmedRole: member.accessLevel >= 6,
        emailAccountCreated: true,
      })
      .onConflictDoUpdate({
        target: [agoojyeProjectUsers.tenantId, agoojyeProjectUsers.email],
        set: {
          firstName: member.firstName,
          displayName: member.firstName,
          teamId,
          accessLevel: member.accessLevel,
          permissions: [...member.permissions],
          emailAccountCreated: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: agoojyeProjectUsers.id });
    userByEmail.set(member.email, Number(user.id));
  }

  const vitalId = userByEmail.get("vital@agoojiye.com") || null;
  const projectBySlug = new Map<string, number>();
  for (const [slug, name, objective, teamSlug, progress] of PROJECTS) {
    const teamId = teamBySlug.get(teamSlug) || null;
    const [project] = await db
      .insert(agoojyeOsProjects)
      .values({
        tenantId,
        slug,
        name,
        objective,
        ownerUserId: vitalId,
        teamId,
        status: "active",
        progress,
        confidentiality: 3,
        risks: [],
      })
      .onConflictDoUpdate({
        target: [agoojyeOsProjects.tenantId, agoojyeOsProjects.slug],
        set: { name, objective, teamId, progress, updatedAt: new Date() },
      })
      .returning({ id: agoojyeOsProjects.id });
    projectBySlug.set(slug, Number(project.id));
  }

  const channelBySlug = new Map<string, number>();
  for (const [slug, name, channelType, teamSlug, confidentiality] of CHANNELS) {
    const teamId = teamSlug ? teamBySlug.get(teamSlug) || null : null;
    const projectId =
      slug === "prototype-bus"
        ? projectBySlug.get("premier-bus-electrique") || null
        : slug === "site-web"
          ? projectBySlug.get("plateforme-billetterie") || null
          : null;
    const [channel] = await db
      .insert(agoojyeOsChannels)
      .values({
        tenantId,
        slug,
        name,
        description: `Canal ${name} d'AGOOJIYE OS.`,
        channelType,
        teamId,
        projectId,
        confidentiality,
        status: "active",
        createdBy: vitalId,
      })
      .onConflictDoUpdate({
        target: [agoojyeOsChannels.tenantId, agoojyeOsChannels.slug],
        set: { name, channelType, teamId, projectId, confidentiality, updatedAt: new Date() },
      })
      .returning({ id: agoojyeOsChannels.id });
    channelBySlug.set(slug, Number(channel.id));
  }

  for (const [email, userId] of userByEmail) {
    const member = TEAM_MEMBERS.find((entry) => entry.email === email);
    const memberTeamId = member ? teamBySlug.get(member.teamSlug) || null : null;
    for (const [channelSlug, channelId] of channelBySlug) {
      const channelDefinition = CHANNELS.find((entry) => entry[0] === channelSlug);
      const channelTeamId = channelDefinition?.[3] ? teamBySlug.get(channelDefinition[3]) || null : null;
      const isLeadership = (member?.accessLevel || 0) >= 6;
      const shouldJoin = channelSlug === "annonces-generales" || isLeadership || !channelTeamId || channelTeamId === memberTeamId;
      if (!shouldJoin) continue;
      await db
        .insert(agoojyeOsChannelMembers)
        .values({ tenantId, channelId, userId, role: isLeadership ? "owner" : "member" })
        .onConflictDoNothing();
    }

    for (const [projectSlug, projectId] of projectBySlug) {
      const projectDefinition = PROJECTS.find((entry) => entry[0] === projectSlug);
      const projectTeamId = projectDefinition ? teamBySlug.get(projectDefinition[3]) || null : null;
      const isLeadership = (member?.accessLevel || 0) >= 6;
      if (!isLeadership && projectTeamId !== memberTeamId) continue;
      await db
        .insert(agoojyeOsProjectMembers)
        .values({ tenantId, projectId, userId, role: isLeadership ? "sponsor" : "contributor" })
        .onConflictDoNothing();
    }
  }

  const taskSeeds = [
    ["Valider le manifeste de démonstration", "operations-mobilite", "high", 2],
    ["Finaliser la fiche technique publique", "engineering", "high", 4],
    ["Préparer le calendrier éditorial du lancement", "communication-media", "medium", 5],
    ["Relancer les partenaires industriels prioritaires", "sponsorship-partnerships", "high", 3],
    ["Vérifier le parcours de billetterie mobile", "software-ai", "critical", 1],
  ] as const;
  for (const [title, teamSlug, priority, days] of taskSeeds) {
    const teamId = teamBySlug.get(teamSlug) || null;
    const existing = await db.query.agoojyeTasks.findFirst({
      where: and(eq(agoojyeTasks.tenantId, tenantId), eq(agoojyeTasks.title, title)),
      columns: { id: true },
    });
    if (existing) continue;
    await db.insert(agoojyeTasks).values({
      tenantId,
      teamId,
      createdBy: vitalId,
      title,
      description: "Résultat attendu clairement documenté dans AGOOJIYE OS.",
      priority,
      status: "todo",
      dueDate: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      attachments: [],
    });
  }

  const documentSeeds = [
    ["Guide d'accueil AGOOJIYE OS", "HR", "approved", "internal", 2],
    ["Procédure de validation des billets", "Operations", "under_review", "team_only", 3],
    ["Charte de confidentialité interne", "Legal", "approved", "internal", 3],
  ] as const;
  for (const [title, category, status, visibility] of documentSeeds) {
    await db
      .insert(agoojyeDocuments)
      .values({
        tenantId,
        title,
        category,
        status,
        visibility,
        description: "Document opérationnel AGOOJIYE OS.",
        version: "1.0",
      })
      .onConflictDoUpdate({
        target: [agoojyeDocuments.tenantId, agoojyeDocuments.title],
        set: { category, status, visibility, updatedAt: new Date() },
      });
  }

  const partnerSeeds = [
    ["NSIA Banque", "Partenaire bancaire", "Active discussion"],
    ["EPAC", "Technical Partners", "In discussion"],
    ["GDIZ", "Industrial Partners", "Institutional stakeholder"],
  ] as const;
  for (const [name, category, status] of partnerSeeds) {
    await db
      .insert(agoojyePartners)
      .values({ tenantId, name, category, status, visibility: "private", description: "Relation suivie dans AGOOJIYE OS." })
      .onConflictDoUpdate({
        target: [agoojyePartners.tenantId, agoojyePartners.name],
        set: { category, status, updatedAt: new Date() },
      });
  }

  const nextMeetingTitle = "Point opérationnel AGOOJIYE";
  const meeting = await db.query.agoojyeOsMeetings.findFirst({
    where: and(eq(agoojyeOsMeetings.tenantId, tenantId), eq(agoojyeOsMeetings.title, nextMeetingTitle)),
  });
  if (!meeting) {
    await db.insert(agoojyeOsMeetings).values({
      tenantId,
      title: nextMeetingTitle,
      agenda: "Priorités, blocages, décisions et prochaines actions.",
      organizerUserId: vitalId,
      participantUserIds: [...userByEmail.values()],
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
      videoUrl: "/meetings",
      status: "scheduled",
      confidentiality: 3,
    });
  }

  const decisionText = "AGOOJIYE OS devient la mémoire institutionnelle principale de l'équipe.";
  const decision = await db.query.agoojyeOsDecisions.findFirst({
    where: and(eq(agoojyeOsDecisions.tenantId, tenantId), eq(agoojyeOsDecisions.decision, decisionText)),
  });
  if (!decision) {
    await db.insert(agoojyeOsDecisions).values({
      tenantId,
      decision: decisionText,
      context: "Réduire la dispersion des informations entre les outils informels.",
      decisionMakerUserId: vitalId,
      participantUserIds: [...userByEmail.values()],
      consequences: "Les tâches, décisions, documents et suivis importants doivent être enregistrés dans la plateforme.",
      assignedActions: ["Activer les comptes équipe", "Migrer les priorités", "Utiliser les canaux AGOOJIYE"],
      status: "recorded",
      confidentiality: 3,
    });
  }

  for (const userId of userByEmail.values()) {
    const existing = await db.query.agoojyeOsNotifications.findFirst({
      where: and(
        eq(agoojyeOsNotifications.tenantId, tenantId),
        eq(agoojyeOsNotifications.userId, userId),
        eq(agoojyeOsNotifications.title, "Bienvenue dans AGOOJIYE OS"),
      ),
    });
    if (existing) continue;
    await db.insert(agoojyeOsNotifications).values({
      tenantId,
      userId,
      type: "onboarding",
      title: "Bienvenue dans AGOOJIYE OS",
      body: "Votre espace de travail AGOOJIYE est prêt. Consultez vos priorités et votre équipe.",
      link: "/os",
    });
  }

  return {
    teams: teamBySlug.size,
    members: userByEmail.size,
    projects: projectBySlug.size,
    channels: channelBySlug.size,
  };
}

export async function createAgoojiyeTeamInvitation(input: {
  tenantId: number;
  allowedEmails?: string[];
  ttlDays?: number;
  maxUses?: number;
  createdBy?: number | null;
}) {
  const allowedEmails = (input.allowedEmails?.length ? input.allowedEmails : TEAM_MEMBERS.map((member) => member.email))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + Math.max(1, input.ttlDays || 30) * 24 * 60 * 60 * 1000);
  const [invitation] = await db
    .insert(agoojyeOsInvitations)
    .values({
      tenantId: input.tenantId,
      tokenHash: invitationHash(rawToken),
      label: "Invitation équipe fondatrice AGOOJIYE",
      allowedEmails,
      defaultRole: "Membre AGOOJIYE",
      maxUses: Math.max(input.maxUses || allowedEmails.length, allowedEmails.length),
      expiresAt,
      createdBy: input.createdBy || null,
      status: "active",
    })
    .returning({ id: agoojyeOsInvitations.id });
  return { id: Number(invitation.id), rawToken, expiresAt, allowedEmails };
}

export const AGOOJIYE_TEAM_EMAILS = TEAM_MEMBERS.map((member) => member.email);
export const hashAgoojiyeInvitationToken = invitationHash;
