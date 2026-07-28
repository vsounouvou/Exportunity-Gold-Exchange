import { and, asc, desc, eq, ilike, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeDocuments,
  agoojyeOsDecisions,
  agoojyeOsMeetings,
  agoojyeOsMessages,
  agoojyeOsProjectMembers,
  agoojyeOsProjects,
  agoojyeProjectUsers,
  agoojyeTasks,
} from "@db/schema";

import {
  generateAgoojiyeAssistantAnswer,
  rankAgoojiyeAssistantMatches,
  type AgoojiyeAssistantMatch,
} from "./assistant";
import { listAccessibleAgoojiyeChatChannels } from "./chatAccess";
import { canAccessAgoojiyeDataClass } from "./osPolicy";

const clean = (value: unknown) => String(value ?? "").trim();

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    active: "actif",
    blocked: "bloqué",
    cancelled: "annulé",
    completed: "terminé",
    done: "terminé",
    draft: "brouillon",
    in_progress: "en cours",
    pending: "en attente",
    pending_approval: "validation requise",
    recorded: "enregistrée",
    scheduled: "planifiée",
    todo: "à faire",
    under_review: "en révision",
  };
  const normalized = clean(value).toLowerCase();
  return labels[normalized] || normalized.replaceAll("_", " ");
}

function assistantContextLabel(member: any, contextType: string, contextLabel: string) {
  const role = clean(member.role) || "membre";
  if (contextType === "project") return `${contextLabel}; projet autorisé; rôle ${role}`;
  if (contextType === "department") return `${contextLabel}; département autorisé; rôle ${role}`;
  if (contextType === "mobility") return `${contextLabel}; opérations mobilité; rôle ${role}`;
  if (contextType === "direction") return `${contextLabel}; direction; rôle ${role}`;
  return `${contextLabel}; espace personnel; rôle ${role}`;
}

export type AgoojiyeAssistantContextResult = {
  answer: string;
  matches: AgoojiyeAssistantMatch[];
  generation: Awaited<ReturnType<typeof generateAgoojiyeAssistantAnswer>>;
  contextLabel: string;
  recordsAccessed: Array<{ type: string; id: number }>;
  proposedActions: Array<{
    type: "create_task";
    label: string;
    payload: Record<string, unknown>;
    riskLevel: "low";
  }>;
};

export async function runAgoojiyeChatAssistant(input: {
  tenantId: number;
  member: any;
  query: string;
  contextType: string;
  contextId?: string | null;
  contextLabel: string;
}): Promise<AgoojiyeAssistantContextResult> {
  const query = clean(input.query);
  const normalizedQuery = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const search = query.replace(/[%_]/g, " ").trim().slice(0, 180);
  const broadSummary =
    /priorit|aujourd|retard|risque|blocage|synthese|synthèse|rapport|etat|état|prochaine reunion|prochaine réunion/.test(
      normalizedQuery,
    );
  const pattern = broadSummary ? "%" : `%${search || "___"}%`;
  const memberId = Number(input.member.id);
  const leadership = Number(input.member.accessLevel || 0) >= 6;
  const projectMemberships = await db.query.agoojyeOsProjectMembers.findMany({
    where: and(
      eq(agoojyeOsProjectMembers.tenantId, input.tenantId),
      eq(agoojyeOsProjectMembers.userId, memberId),
    ),
  });
  const projectMembershipIds = new Set(
    projectMemberships.map((entry) => Number(entry.projectId)),
  );
  const channels = await listAccessibleAgoojiyeChatChannels(input.tenantId, input.member);
  const channelIds = channels.map((channel) => Number(channel.id));

  const [taskRows, projectRows, documentRows, decisionRows, meetingRows, messageRows] =
    await Promise.all([
      db.query.agoojyeTasks.findMany({
        where: and(
          eq(agoojyeTasks.tenantId, input.tenantId),
          or(ilike(agoojyeTasks.title, pattern), ilike(agoojyeTasks.description, pattern)),
          leadership
            ? sql`true`
            : or(
                eq(agoojyeTasks.assignedTo, memberId),
                eq(agoojyeTasks.teamId, Number(input.member.teamId || -1)),
              ),
        ),
        orderBy: [asc(agoojyeTasks.dueDate), desc(agoojyeTasks.createdAt)],
        limit: 40,
      }),
      db.query.agoojyeOsProjects.findMany({
        where: and(
          eq(agoojyeOsProjects.tenantId, input.tenantId),
          lte(agoojyeOsProjects.confidentiality, Number(input.member.accessLevel || 1)),
          or(
            ilike(agoojyeOsProjects.name, pattern),
            ilike(agoojyeOsProjects.objective, pattern),
          ),
        ),
        orderBy: [desc(agoojyeOsProjects.updatedAt)],
        limit: 40,
      }),
      db.query.agoojyeDocuments.findMany({
        where: and(
          eq(agoojyeDocuments.tenantId, input.tenantId),
          or(
            ilike(agoojyeDocuments.title, pattern),
            ilike(agoojyeDocuments.description, pattern),
          ),
        ),
        orderBy: [desc(agoojyeDocuments.updatedAt)],
        limit: 40,
      }),
      db.query.agoojyeOsDecisions.findMany({
        where: and(
          eq(agoojyeOsDecisions.tenantId, input.tenantId),
          lte(agoojyeOsDecisions.confidentiality, Number(input.member.accessLevel || 1)),
          or(
            ilike(agoojyeOsDecisions.decision, pattern),
            ilike(agoojyeOsDecisions.context, pattern),
          ),
        ),
        orderBy: [desc(agoojyeOsDecisions.createdAt)],
        limit: 30,
      }),
      db.query.agoojyeOsMeetings.findMany({
        where: and(
          eq(agoojyeOsMeetings.tenantId, input.tenantId),
          lte(agoojyeOsMeetings.confidentiality, Number(input.member.accessLevel || 1)),
          or(
            ilike(agoojyeOsMeetings.title, pattern),
            ilike(agoojyeOsMeetings.agenda, pattern),
          ),
        ),
        orderBy: [asc(agoojyeOsMeetings.startsAt)],
        limit: 30,
      }),
      channelIds.length
        ? db
            .select({
              id: agoojyeOsMessages.id,
              channelId: agoojyeOsMessages.channelId,
              body: agoojyeOsMessages.body,
              createdAt: agoojyeOsMessages.createdAt,
              senderName: agoojyeProjectUsers.displayName,
            })
            .from(agoojyeOsMessages)
            .leftJoin(
              agoojyeProjectUsers,
              eq(agoojyeProjectUsers.id, agoojyeOsMessages.senderUserId),
            )
            .where(
              and(
                eq(agoojyeOsMessages.tenantId, input.tenantId),
                inArray(agoojyeOsMessages.channelId, channelIds),
                ilike(agoojyeOsMessages.body, pattern),
                sql`${agoojyeOsMessages.deletedAt} is null`,
              ),
            )
            .orderBy(desc(agoojyeOsMessages.createdAt))
            .limit(30)
        : Promise.resolve([]),
    ]);

  const scopedProjectRows = projectRows.filter((item) => {
    if (input.contextType === "project" && input.contextId) {
      return Number(item.id) === Number(input.contextId);
    }
    return canAccessAgoojiyeDataClass({
      member: input.member,
      classification: item.confidentialityClass,
      resourceTeamId: item.teamId,
      resourceProjectId: item.id,
      projectMembershipIds,
    });
  });
  const permittedTasks = taskRows.filter((item) =>
    canAccessAgoojiyeDataClass({
      member: input.member,
      classification: item.confidentialityClass,
      resourceTeamId: item.teamId,
    }),
  );
  const permittedDocuments = documentRows.filter((item) =>
    canAccessAgoojiyeDataClass({
      member: input.member,
      classification: item.confidentialityClass,
      resourceTeamId: item.teamId,
    }),
  );
  const permittedDecisions = decisionRows.filter((item) => {
    if (leadership) return true;
    const participants = Array.isArray(item.participantUserIds)
      ? item.participantUserIds.map(Number)
      : [];
    return (
      participants.includes(memberId) ||
      Number(item.decisionMakerUserId || 0) === memberId ||
      (item.projectId ? projectMembershipIds.has(Number(item.projectId)) : false)
    );
  });
  const permittedMeetings = meetingRows.filter((item) => {
    if (leadership) return true;
    const participants = Array.isArray(item.participantUserIds)
      ? item.participantUserIds.map(Number)
      : [];
    return participants.includes(memberId) || Number(item.organizerUserId || 0) === memberId;
  });

  const rawMatches: AgoojiyeAssistantMatch[] = [
    ...permittedTasks.map((item) => ({
      type: "Tâche",
      title: item.title,
      detail: `${statusLabel(item.status)} · priorité ${statusLabel(item.priority)}`,
      href: `/workspace/tasks?task=${item.id}`,
    })),
    ...permittedMeetings.map((item) => ({
      type: "Réunion",
      title: item.title,
      detail: new Intl.DateTimeFormat("fr-BJ", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Porto-Novo",
      }).format(item.startsAt),
      href: `/workspace/calendar?meeting=${item.id}`,
    })),
    ...scopedProjectRows.map((item) => ({
      type: "Projet",
      title: item.name,
      detail: `${item.progress}% · ${statusLabel(item.status)}`,
      href: `/workspace/projects?project=${item.id}`,
    })),
    ...permittedDocuments.map((item) => ({
      type: "Document",
      title: item.title,
      detail: `${item.category} · ${statusLabel(item.status)}`,
      href: `/workspace/files?document=${item.id}`,
    })),
    ...permittedDecisions.map((item) => ({
      type: "Décision",
      title: item.decision,
      detail: statusLabel(item.status),
      href: `/workspace/decisions?decision=${item.id}`,
    })),
    ...messageRows.map((item) => ({
      type: "Message",
      title: clean(item.body).slice(0, 90),
      detail: `${item.senderName || "AGOOJIYE"} · ${new Intl.DateTimeFormat("fr-BJ", {
        dateStyle: "medium",
      }).format(item.createdAt)}`,
      href: `/workspace/messages?channel=${item.channelId}&message=${item.id}`,
    })),
  ];
  const searchTokens = normalizedQuery
    .match(/[a-z0-9][a-z0-9-]{1,}/g)
    ?.filter((token) => token.length > 2)
    .slice(0, 10) || [];
  const matches = rankAgoojiyeAssistantMatches(
    rawMatches,
    searchTokens,
    (item) => `${item.type} ${item.title} ${item.detail}`,
  ).slice(0, 18);

  const asksOverdue = /retard|echeance depassee|échéance dépassée/.test(normalizedQuery);
  const asksRisk = /risque|critique|blocage/.test(normalizedQuery);
  const asksMeeting = /prochaine reunion|prochain rendez-vous|agenda/.test(normalizedQuery);
  const asksSummary = /priorit|aujourd|synthese|rapport|etat complet/.test(normalizedQuery);
  const relevantTasks = asksOverdue
    ? permittedTasks.filter(
        (item) =>
          item.dueDate &&
          new Date(item.dueDate).getTime() < Date.now() &&
          !["done", "cancelled"].includes(item.status),
      )
    : asksRisk
      ? permittedTasks.filter(
          (item) =>
            item.priority === "critical" || item.status === "blocked" || Boolean(item.blocker),
        )
      : permittedTasks.filter((item) => !["done", "cancelled"].includes(item.status));
  const deterministicAnswer = asksOverdue
    ? relevantTasks.length
      ? `${relevantTasks.length} tâche${relevantTasks.length > 1 ? "s sont en retard" : " est en retard"} dans votre périmètre autorisé.`
      : "Aucune tâche en retard n'est visible dans votre périmètre autorisé."
    : asksRisk
      ? relevantTasks.length
        ? `${relevantTasks.length} risque${relevantTasks.length > 1 ? "s ou blocages sont visibles" : " ou blocage est visible"} dans votre périmètre.`
        : "Aucun risque critique ni blocage n'est visible dans votre périmètre autorisé."
      : asksMeeting
        ? permittedMeetings.length
          ? `Votre prochaine réunion est « ${permittedMeetings[0].title} », le ${new Intl.DateTimeFormat(
              "fr-BJ",
              {
                dateStyle: "full",
                timeStyle: "short",
                timeZone: "Africa/Porto-Novo",
              },
            ).format(permittedMeetings[0].startsAt)}.`
          : "Aucune réunion à venir n'est visible dans votre agenda autorisé."
        : asksSummary
          ? `Votre synthèse autorisée contient ${relevantTasks.length} tâche${relevantTasks.length > 1 ? "s actives" : " active"}, ${permittedMeetings.length} réunion${permittedMeetings.length > 1 ? "s à venir" : " à venir"} et ${scopedProjectRows.length} projet${scopedProjectRows.length > 1 ? "s accessibles" : " accessible"}.`
          : matches.length
            ? `J'ai trouvé ${matches.length} élément${matches.length > 1 ? "s" : ""} correspondant à votre demande dans votre périmètre autorisé.`
            : "Je n'ai trouvé aucun élément autorisé correspondant exactement à cette demande. Précisez un projet, une tâche, un document, une décision ou un message.";

  const contextLabel = assistantContextLabel(
    input.member,
    input.contextType,
    input.contextLabel,
  );
  const generation = await generateAgoojiyeAssistantAnswer({
    query,
    deterministicAnswer,
    matches,
    contextLabel,
  });

  const proposedActions: AgoojiyeAssistantContextResult["proposedActions"] = [];
  if (/(cr[eé]e|ajoute|transforme).{0,30}(t[aâ]che|action)/i.test(query)) {
    const title = query
      .replace(/.*?(cr[eé]e|ajoute|transforme).{0,30}(t[aâ]che|action)\s*:?\s*/i, "")
      .trim()
      .slice(0, 180);
    proposedActions.push({
      type: "create_task",
      label: `Créer la tâche « ${title || "Nouvelle tâche"} »`,
      payload: {
        title: title || query.slice(0, 180),
        description: `Proposition issue de la conversation avec AGOOJIYE — Assistant IA.`,
        priority: /urgent|critique/i.test(query) ? "high" : "medium",
      },
      riskLevel: "low",
    });
  }

  return {
    answer: generation.answer,
    matches,
    generation,
    contextLabel,
    recordsAccessed: [
      ...relevantTasks.map((item) => ({ type: "task", id: Number(item.id) })),
      ...permittedMeetings.map((item) => ({ type: "meeting", id: Number(item.id) })),
      ...scopedProjectRows.map((item) => ({ type: "project", id: Number(item.id) })),
      ...permittedDocuments.map((item) => ({ type: "document", id: Number(item.id) })),
      ...permittedDecisions.map((item) => ({ type: "decision", id: Number(item.id) })),
      ...messageRows.map((item) => ({ type: "message", id: Number(item.id) })),
    ].slice(0, 60),
    proposedActions,
  };
}
