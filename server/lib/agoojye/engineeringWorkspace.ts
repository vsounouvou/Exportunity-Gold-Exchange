import { and, eq } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeDocuments,
  agoojyeOsChannelMembers,
  agoojyeOsChannels,
  agoojyeOsMeetings,
  agoojyeOsProjectMembers,
  agoojyeOsProjects,
  agoojyeProjectUsers,
  agoojyeTasks,
  agoojyeTeams,
} from "@db/schema";

import {
  ENGINEERING_COMPONENTS,
  ENGINEERING_MEETINGS,
  ENGINEERING_MILESTONES,
  ENGINEERING_ROSTER,
  ENGINEERING_SOURCE,
  ENGINEERING_TASKS,
  ENGINEERING_TEAMS,
  LAUNCH_COMMUNICATION_TASKS,
  type EngineeringTeamSlug,
} from "./engineeringTeam";

type TeamIdMap = Map<string, number>;

const PROTOTYPE_PROJECT_SLUG = "premier-bus-electrique";
const LAUNCH_PROJECT_SLUG = "lancement-national";

function taskChecklist(key: string, labels: string[]) {
  return labels.map((label, index) => ({
    id: `${key}-${index + 1}`,
    label,
    done: false,
  }));
}

export async function ensureEngineeringTeams(tenantId: number) {
  const definitions = [
    {
      slug: "engineering",
      name: "Ingénierie",
      mission: "Concevoir, intégrer, tester et documenter le prototype de bus électrique AGOOJIYE.",
      visibility: "private",
    },
    ...ENGINEERING_TEAMS.map((team) => ({
      slug: team.slug,
      name: team.name,
      mission: team.mission,
      visibility: "private",
    })),
    {
      slug: "communication-media",
      name: "Communication & médias",
      mission: "Organiser la communication, la presse et les actifs de marque AGOOJIYE.",
      visibility: "private",
    },
  ];

  const teamBySlug: TeamIdMap = new Map();
  for (const definition of definitions) {
    const [team] = await db
      .insert(agoojyeTeams)
      .values({
        tenantId,
        slug: definition.slug,
        name: definition.name,
        mission: definition.mission,
        description: definition.mission,
        status: "active",
        visibility: definition.visibility,
      })
      .onConflictDoUpdate({
        target: [agoojyeTeams.tenantId, agoojyeTeams.slug],
        set: {
          name: definition.name,
          mission: definition.mission,
          description: definition.mission,
          status: "active",
          visibility: definition.visibility,
          updatedAt: new Date(),
        },
      })
      .returning({ id: agoojyeTeams.id });
    teamBySlug.set(definition.slug, Number(team.id));
  }
  return teamBySlug;
}

async function findProfile(tenantId: number, emails: string[]) {
  for (const email of emails) {
    const profile = await db.query.agoojyeProjectUsers.findFirst({
      where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.email, email)),
    });
    if (profile) return profile;
  }
  return null;
}

export async function seedEngineeringWorkspace(input: {
  tenantId: number;
  teamBySlug: TeamIdMap;
  userByCorporateEmail: Map<string, number>;
}) {
  const { tenantId, teamBySlug, userByCorporateEmail } = input;
  const engineeringLead = await findProfile(tenantId, [
    "christian@agoojiye.com",
    "vital@agoojiye.com",
    "vs@agoojiye.com",
  ]);
  const executive = await findProfile(tenantId, ["vs@agoojiye.com", "vital@agoojiye.com"]);
  const communicationLead = await findProfile(tenantId, ["maryse@agoojiye.com", "vital@agoojiye.com"]);

  if (engineeringLead) {
    const engineeringTeamIds = [
      teamBySlug.get("engineering"),
      ...ENGINEERING_TEAMS.map((team) => teamBySlug.get(team.slug)),
    ].filter((id): id is number => Boolean(id));
    for (const teamId of engineeringTeamIds) {
      await db
        .update(agoojyeTeams)
        .set({ leadUserId: Number(engineeringLead.id), updatedAt: new Date() })
        .where(and(eq(agoojyeTeams.tenantId, tenantId), eq(agoojyeTeams.id, teamId)));
    }
  }

  const prototypeTeamId = teamBySlug.get("engineering") || null;
  const workstreams = ENGINEERING_TEAMS.map((team) => ({
    id: team.slug,
    name: team.name,
    progress: 0,
  }));
  const [prototypeProject] = await db
    .insert(agoojyeOsProjects)
    .values({
      tenantId,
      slug: PROTOTYPE_PROJECT_SLUG,
      name: "Premier bus électrique AGOOJIYE",
      objective:
        "Assembler, intégrer, tester et documenter un prototype prêt pour la présentation officielle de septembre 2026.",
      ownerUserId: engineeringLead?.id || executive?.id || null,
      teamId: prototypeTeamId,
      status: "active",
      progress: 5,
      deadline: new Date("2026-09-04T17:00:00+01:00"),
      confidentiality: 3,
      risks: [
        "Délais courts entre l'intégration et les essais",
        "Spécifications et approvisionnements encore incomplets",
        "Trois affectations techniques à confirmer",
      ],
      metadata: {
        source: ENGINEERING_SOURCE.workbookName,
        sourceHash: ENGINEERING_SOURCE.workbookSha256,
        demoOrPlaceholder: false,
        programPeriod: "2026-07-27/2026-09-04",
      },
      workstreams,
      milestones: ENGINEERING_MILESTONES.map((milestone) => ({ ...milestone })),
      startDate: new Date("2026-07-27T08:00:00+01:00"),
      nextAction: "Terminer la fabrication du châssis et synchroniser les cinq équipes d'ingénierie.",
      assignedAgent: "AGOOJIYE — Assistant IA",
      confidentialityClass: "PROJECT_RESTRICTED",
    })
    .onConflictDoUpdate({
      target: [agoojyeOsProjects.tenantId, agoojyeOsProjects.slug],
      set: {
        name: "Premier bus électrique AGOOJIYE",
        objective:
          "Assembler, intégrer, tester et documenter un prototype prêt pour la présentation officielle de septembre 2026.",
        ownerUserId: engineeringLead?.id || executive?.id || null,
        teamId: prototypeTeamId,
        status: "active",
        deadline: new Date("2026-09-04T17:00:00+01:00"),
        risks: [
          "Délais courts entre l'intégration et les essais",
          "Spécifications et approvisionnements encore incomplets",
          "Trois affectations techniques à confirmer",
        ],
        metadata: {
          source: ENGINEERING_SOURCE.workbookName,
          sourceHash: ENGINEERING_SOURCE.workbookSha256,
          demoOrPlaceholder: false,
          programPeriod: "2026-07-27/2026-09-04",
        },
        workstreams,
        milestones: ENGINEERING_MILESTONES.map((milestone) => ({ ...milestone })),
        startDate: new Date("2026-07-27T08:00:00+01:00"),
        nextAction: "Terminer la fabrication du châssis et synchroniser les cinq équipes d'ingénierie.",
        assignedAgent: "AGOOJIYE — Assistant IA",
        confidentialityClass: "PROJECT_RESTRICTED",
        updatedAt: new Date(),
      },
    })
    .returning();

  const [launchProject] = await db
    .insert(agoojyeOsProjects)
    .values({
      tenantId,
      slug: LAUNCH_PROJECT_SLUG,
      name: "Lancement national AGOOJIYE",
      objective: "Coordonner les 29 publications, les stories, les lives et la couverture du gala.",
      ownerUserId: communicationLead?.id || executive?.id || null,
      teamId: teamBySlug.get("communication-media") || null,
      status: "active",
      progress: 0,
      deadline: new Date("2026-09-04T17:00:00+01:00"),
      confidentiality: 3,
      risks: ["Publication d'une information technique non validée", "Dépendance aux actifs photo et vidéo du prototype"],
      metadata: {
        source: "Calendrier de communication",
        sourceDocumentId: ENGINEERING_SOURCE.communicationsDocumentId,
        plannedPosts: 29,
        campaignPeriod: "2026-08-01/2026-09-04",
      },
      workstreams: [
        { id: "teasing", name: "Teasing", progress: 0 },
        { id: "builders", name: "Builders", progress: 0 },
        { id: "construction", name: "Construction", progress: 0 },
        { id: "hype", name: "Hype", progress: 0 },
        { id: "gala", name: "Gala", progress: 0 },
        { id: "finale", name: "Amplification & finale", progress: 0 },
      ],
      startDate: new Date("2026-08-01T08:00:00+01:00"),
      nextAction: "Valider les actifs de la phase Teasing.",
      assignedAgent: "AGOOJIYE — Assistant IA",
      confidentialityClass: "DEPARTMENT_ONLY",
    })
    .onConflictDoUpdate({
      target: [agoojyeOsProjects.tenantId, agoojyeOsProjects.slug],
      set: {
        name: "Lancement national AGOOJIYE",
        objective: "Coordonner les 29 publications, les stories, les lives et la couverture du gala.",
        ownerUserId: communicationLead?.id || executive?.id || null,
        teamId: teamBySlug.get("communication-media") || null,
        status: "active",
        deadline: new Date("2026-09-04T17:00:00+01:00"),
        metadata: {
          source: "Calendrier de communication",
          sourceDocumentId: ENGINEERING_SOURCE.communicationsDocumentId,
          plannedPosts: 29,
          campaignPeriod: "2026-08-01/2026-09-04",
        },
        updatedAt: new Date(),
      },
    })
    .returning();

  const channelDefinitions = [
    {
      slug: "annonces-generales",
      name: "Annonces générales",
      description: "Annonces officielles visibles par toute l'équipe AGOOJIYE.",
      channelType: "announcement",
      teamId: null,
      projectId: null,
      confidentiality: 2,
    },
    {
      slug: "prototype-bus",
      name: "Prototype bus",
      description: "Coordination transversale du prototype, jalons, blocages et décisions.",
      channelType: "project",
      teamId: prototypeTeamId,
      projectId: Number(prototypeProject.id),
      confidentiality: 3,
    },
    ...ENGINEERING_TEAMS.map((team) => ({
      slug: team.channelSlug,
      name: team.channelName,
      description: team.mission,
      channelType: "department",
      teamId: teamBySlug.get(team.slug) || null,
      projectId: Number(prototypeProject.id),
      confidentiality: 3,
    })),
    {
      slug: "lancement-national",
      name: "Lancement national",
      description: "Calendrier éditorial, actifs, validations et couverture de la présentation.",
      channelType: "project",
      teamId: teamBySlug.get("communication-media") || null,
      projectId: Number(launchProject.id),
      confidentiality: 3,
    },
  ];

  const channelBySlug = new Map<string, number>();
  for (const channel of channelDefinitions) {
    const [row] = await db
      .insert(agoojyeOsChannels)
      .values({
        tenantId,
        ...channel,
        status: "active",
        createdBy: executive?.id || engineeringLead?.id || null,
      })
      .onConflictDoUpdate({
        target: [agoojyeOsChannels.tenantId, agoojyeOsChannels.slug],
        set: {
          name: channel.name,
          description: channel.description,
          channelType: channel.channelType,
          teamId: channel.teamId,
          projectId: channel.projectId,
          confidentiality: channel.confidentiality,
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning({ id: agoojyeOsChannels.id });
    channelBySlug.set(channel.slug, Number(row.id));
  }

  const rosterUserIds = [...userByCorporateEmail.values()];
  for (const rosterMember of ENGINEERING_ROSTER) {
    const userId = userByCorporateEmail.get(rosterMember.corporateEmail);
    if (!userId) continue;
    await db
      .insert(agoojyeOsProjectMembers)
      .values({ tenantId, projectId: Number(prototypeProject.id), userId, role: "contributor" })
      .onConflictDoNothing();
    for (const channelSlug of [
      "annonces-generales",
      "prototype-bus",
      ENGINEERING_TEAMS.find((team) => team.slug === rosterMember.teamSlug)?.channelSlug,
    ].filter((value): value is string => Boolean(value))) {
      const channelId = channelBySlug.get(channelSlug);
      if (!channelId) continue;
      await db
        .insert(agoojyeOsChannelMembers)
        .values({ tenantId, channelId, userId, role: "member" })
        .onConflictDoNothing();
    }
  }

  for (const sponsor of [engineeringLead, executive].filter(Boolean)) {
    await db
      .insert(agoojyeOsProjectMembers)
      .values({
        tenantId,
        projectId: Number(prototypeProject.id),
        userId: Number(sponsor!.id),
        role: "sponsor",
      })
      .onConflictDoNothing();
  }
  if (communicationLead) {
    await db
      .insert(agoojyeOsProjectMembers)
      .values({
        tenantId,
        projectId: Number(launchProject.id),
        userId: Number(communicationLead.id),
        role: "owner",
      })
      .onConflictDoNothing();
    const launchChannelId = channelBySlug.get("lancement-national");
    if (launchChannelId) {
      await db
        .insert(agoojyeOsChannelMembers)
        .values({ tenantId, channelId: launchChannelId, userId: Number(communicationLead.id), role: "owner" })
        .onConflictDoNothing();
    }
  }

  const existingTasks = await db.query.agoojyeTasks.findMany({
    where: eq(agoojyeTasks.tenantId, tenantId),
  });
  const taskBySeedKey = new Map(
    existingTasks
      .map((task) => [String((task.metadata as Record<string, unknown> | null)?.engineeringSeedKey || ""), task] as const)
      .filter(([key]) => Boolean(key)),
  );
  const usersByTeam = new Map<EngineeringTeamSlug, number[]>(
    ENGINEERING_TEAMS.map((team) => [
      team.slug,
      ENGINEERING_ROSTER.filter((entry) => entry.teamSlug === team.slug)
        .map((entry) => userByCorporateEmail.get(entry.corporateEmail))
        .filter((id): id is number => Boolean(id)),
    ]),
  );

  for (const taskSeed of [...ENGINEERING_TASKS, ...LAUNCH_COMMUNICATION_TASKS]) {
    const isCommunication = taskSeed.teamSlug === "communication-media";
    const teamId = teamBySlug.get(taskSeed.teamSlug) || null;
    const projectSlug = isCommunication ? LAUNCH_PROJECT_SLUG : PROTOTYPE_PROJECT_SLUG;
    const projectId = isCommunication ? Number(launchProject.id) : Number(prototypeProject.id);
    const contributorIds = isCommunication
      ? communicationLead
        ? [Number(communicationLead.id)]
        : []
      : usersByTeam.get(taskSeed.teamSlug as EngineeringTeamSlug) || [];
    const values = {
      teamId,
      assignedTo: isCommunication ? communicationLead?.id || null : engineeringLead?.id || null,
      createdBy: executive?.id || engineeringLead?.id || null,
      title: taskSeed.title,
      description: taskSeed.description,
      priority: taskSeed.priority,
      status: "todo",
      dueDate: new Date(taskSeed.dueAt),
      contributorIds,
      checklist: taskChecklist(taskSeed.key, taskSeed.checklist),
      progress: 0,
      nextAction: taskSeed.checklist[0] || null,
      approvalStatus: isCommunication ? "pending" : "not_required",
      confidentialityClass: isCommunication ? "DEPARTMENT_ONLY" : "INTERNAL",
      metadata: {
        engineeringSeedKey: taskSeed.key,
        projectId,
        projectSlug,
        phase: taskSeed.phase,
        source: isCommunication ? "communications_document" : ENGINEERING_SOURCE.workbookName,
        sourceHash: isCommunication
          ? ENGINEERING_SOURCE.communicationsDocumentId
          : ENGINEERING_SOURCE.workbookSha256,
      },
      updatedAt: new Date(),
    };
    const existing = taskBySeedKey.get(taskSeed.key);
    if (existing) {
      await db.update(agoojyeTasks).set(values).where(eq(agoojyeTasks.id, Number(existing.id)));
    } else {
      await db.insert(agoojyeTasks).values({ tenantId, ...values });
    }
  }

  const documents = [
    {
      title: "Planning prototype bus électrique - S1 à S6",
      description:
        "Planning opérationnel du 27 juillet au 4 septembre 2026 : châssis, sous-systèmes, intégration, premier roulage, essais et documentation.",
      category: "Engineering",
      teamId: prototypeTeamId,
      fileUrl: null,
      status: "approved",
      visibility: "internal",
      confidentialityClass: "INTERNAL",
    },
    {
      title: "Registre des composants - tableau de bord et traction HT",
      description: `Tableau de bord : ${ENGINEERING_COMPONENTS.dashboard.join(", ")}. Traction HT : ${ENGINEERING_COMPONENTS.highVoltageTraction.join(", ")}.`,
      category: "Engineering",
      teamId: teamBySlug.get("engineering") || null,
      fileUrl: null,
      status: "under_review",
      visibility: "internal",
      confidentialityClass: "INTERNAL",
    },
    {
      title: "Registre NDA - équipe véhicule électrique",
      description:
        "Registre de contrôle des NDA issu du classeur équipe. Les liens individuels restent réservés aux administrateurs autorisés.",
      category: "Legal",
      teamId: prototypeTeamId,
      fileUrl: null,
      status: "under_review",
      visibility: "private",
      confidentialityClass: "MANAGEMENT_CONFIDENTIAL",
    },
    {
      title: "Calendrier de communication - lancement AGOOJIYE",
      description:
        "Cadence quotidienne du 1er août au 1er septembre, 29 publications et séquences Teasing, Builders, Construction, Hype, Gala et Finale.",
      category: "Communication",
      teamId: teamBySlug.get("communication-media") || null,
      fileUrl: ENGINEERING_SOURCE.communicationsDocumentUrl,
      status: "under_review",
      visibility: "team_only",
      confidentialityClass: "DEPARTMENT_ONLY",
    },
  ];
  for (const document of documents) {
    await db
      .insert(agoojyeDocuments)
      .values({
        tenantId,
        ...document,
        uploadedBy: executive?.id || null,
        version: "1.0",
      })
      .onConflictDoUpdate({
        target: [agoojyeDocuments.tenantId, agoojyeDocuments.title],
        set: { ...document, updatedAt: new Date() },
      });
  }

  for (const meetingSeed of ENGINEERING_MEETINGS) {
    const startsAt = new Date(meetingSeed.startsAt);
    const existing = await db.query.agoojyeOsMeetings.findFirst({
      where: and(
        eq(agoojyeOsMeetings.tenantId, tenantId),
        eq(agoojyeOsMeetings.title, meetingSeed.title),
        eq(agoojyeOsMeetings.startsAt, startsAt),
      ),
    });
    const values = {
      agenda: "Avancement par équipe, preuves produites, blocages, décisions et prochaines actions.",
      projectId: Number(prototypeProject.id),
      organizerUserId: engineeringLead?.id || executive?.id || null,
      participantUserIds: Array.from(
        new Set([
          ...rosterUserIds,
          ...(engineeringLead ? [Number(engineeringLead.id)] : []),
          ...(executive ? [Number(executive.id)] : []),
        ]),
      ),
      startsAt,
      endsAt: new Date(meetingSeed.endsAt),
      videoUrl: "/workspace/meetings",
      notes: `Source: ${ENGINEERING_SOURCE.workbookName}. Réunion créée sans notification sortante.`,
      status: "scheduled",
      confidentiality: 3,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(agoojyeOsMeetings).set(values).where(eq(agoojyeOsMeetings.id, Number(existing.id)));
    } else {
      await db.insert(agoojyeOsMeetings).values({ tenantId, title: meetingSeed.title, ...values });
    }
  }

  return {
    teams: ENGINEERING_TEAMS.length,
    engineeringMembers: userByCorporateEmail.size,
    projects: 2,
    channels: channelDefinitions.length,
    tasks: ENGINEERING_TASKS.length + LAUNCH_COMMUNICATION_TASKS.length,
    documents: documents.length,
    meetings: ENGINEERING_MEETINGS.length,
  };
}

