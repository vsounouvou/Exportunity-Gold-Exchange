import { and, eq } from "drizzle-orm";

import { db } from "@db";
import {
  chatRooms,
  companies,
  goals,
  meetingParticipants,
  meetingRooms,
  meetings,
  roomMemberships,
} from "@db/schema";

const OPERATING_PLAN_VERSION = "exportunity-industrial-plan-v2";

export const EXPORTUNITY_GLOBAL_MISSION =
  "Trade. Source. Expand. Operate. Exportunity is an AI-managed global B2B trade and operations network that helps companies express demand, source products and services, sell or export, manage supply chains, and enter new markets through governed workflows.";

export const EXPORTUNITY_INDUSTRIAL_MISSION =
  "Turn verified industrial demand across Cote d'Ivoire, Benin, and connected UAE supplier corridors into reliable sourcing, reverse engineering, local production, and export-ready supply through an accountable agent-led operating system.";

type AgentIds = Map<string, number>;

type ObjectiveSpec = {
  key: string;
  title: string;
  description: string;
  ownerKey: string;
  priority: "medium" | "high" | "critical";
  keyResults: string[];
  successCriteria: string[];
};

const INDUSTRIAL_OBJECTIVES: ObjectiveSpec[] = [
  {
    key: "demand-intelligence",
    title: "Build the verified industrial demand pipeline",
    description:
      "Capture and qualify real requirements from factories, agro-processors, workshops, mining and logistics operators, and export-ready producers across Cote d'Ivoire and Benin, with UAE supplier corridors available for qualified sourcing cases.",
    ownerKey: "data",
    priority: "critical",
    keyResults: [
      "Every active case identifies the buyer, site, requirement, urgency, evidence, and accountable next owner.",
      "Demand signals are separated from verified procurement requirements.",
      "The pipeline is reviewable by sector, territory, urgency, and operating stage.",
    ],
    successCriteria: [
      "No industrial request is lost in an unstructured conversation.",
      "Priority cases can be routed immediately to sourcing or technical review.",
    ],
  },
  {
    key: "supplier-network",
    title: "Establish the verified supplier and factory network",
    description:
      "Document factories, workshops, distributors, manufacturers, logistics providers, and qualified technical partners with evidence-backed capabilities and clear verification status.",
    ownerKey: "sourcing",
    priority: "critical",
    keyResults: [
      "Each supplier profile states what is verified, what is public information, and what still requires contact.",
      "Priority industrial categories have reviewable supplier shortlists.",
      "Supplier outreach remains approval-gated and auditable.",
    ],
    successCriteria: [
      "Buyers can understand who can supply, make, repair, or deliver each requirement.",
      "No unverified inventory or production claim is presented as confirmed.",
    ],
  },
  {
    key: "spare-parts-orders",
    title: "Convert urgent spare-parts needs into controlled orders",
    description:
      "Provide a reliable path from part reference, photo, drawing, sample, or machine context to technical review, sourcing, availability confirmation, quotation, payment, and delivery.",
    ownerKey: "technical",
    priority: "critical",
    keyResults: [
      "Every request preserves its technical evidence and compatibility assumptions.",
      "Make, buy, repair, and reverse-engineering routes are explicitly reviewed.",
      "Payment is enabled only after the supplier, price, availability, and delivery terms are confirmed.",
    ],
    successCriteria: [
      "A factory owner always sees the current case stage and next action.",
      "Orders cannot imply completion before commercial confirmation.",
    ],
  },
  {
    key: "local-manufacturing",
    title: "Operate the scan-to-manufacture and quality pipeline",
    description:
      "Route suitable industrial parts through measurement, CAD, reverse engineering, prototyping, local fabrication, assembly, quality evidence, and repeat-production learning.",
    ownerKey: "quality",
    priority: "high",
    keyResults: [
      "Manufacturing cases have a documented technical dossier and quality checklist.",
      "GDIZ and partner capabilities are matched to actual production requirements.",
      "Reusable part knowledge improves future lead time without exposing client-confidential evidence.",
    ],
    successCriteria: [
      "Each production handoff has an owner, evidence, and acceptance criteria.",
      "Non-conformances are visible and escalated before delivery.",
    ],
  },
  {
    key: "commercial-conversion",
    title: "Build a disciplined industrial commercial pipeline",
    description:
      "Turn qualified demand into reviewed quotations, follow-ups, buyer decisions, supplier responses, and measurable client outcomes without uncontrolled outreach.",
    ownerKey: "commercial",
    priority: "high",
    keyResults: [
      "Each opportunity has a next action, responsible owner, and evidence trail.",
      "External messages and campaigns remain draft-first until a human approves them.",
      "Buyer and supplier replies update the related case instead of creating disconnected inbox work.",
    ],
    successCriteria: [
      "The team can see what needs attention now and why.",
      "No contact is repeatedly approached without context, consent, and auditability.",
    ],
  },
  {
    key: "trade-readiness",
    title: "Make industrial supply and export execution reviewable",
    description:
      "Coordinate logistics, documentation, compliance, delivery planning, and export readiness for approved industrial transactions and producer opportunities.",
    ownerKey: "logistics",
    priority: "high",
    keyResults: [
      "Each cross-border case identifies required documents, route assumptions, risks, and approval gates.",
      "Delivery estimates are distinguished from confirmed carrier commitments.",
      "Compliance and finance review are invited when the case requires them.",
    ],
    successCriteria: [
      "Teams can trace a transaction from requirement to delivery evidence.",
      "No customs, financing, or legal outcome is promised before validation.",
    ],
  },
];

type AgendaSpec = {
  key: string;
  objectiveKey: string;
  title: string;
  description: string;
  weekday: number;
  participantKeys: string[];
};

const INDUSTRIAL_AGENDA: AgendaSpec[] = [
  {
    key: "demand-pipeline-review",
    objectiveKey: "demand-intelligence",
    title: "Industrial demand and opportunity review",
    description:
      "Review new buyer requirements, evidence quality, urgency, responsible owners, and the cases that must move to sourcing or technical review.",
    weekday: 1,
    participantKeys: ["ceo", "fenou", "data", "commercial", "tassi"],
  },
  {
    key: "supplier-production-review",
    objectiveKey: "supplier-network",
    title: "Supplier and production readiness review",
    description:
      "Review supplier evidence, technical routes, GDIZ or partner capacity, quality risks, and quote readiness for active industrial cases.",
    weekday: 3,
    participantKeys: ["ceo", "fenou", "sourcing", "technical", "quality"],
  },
  {
    key: "executive-approvals-review",
    objectiveKey: "commercial-conversion",
    title: "Executive decisions and approvals",
    description:
      "Resolve blocked commercial decisions, payment controls, compliance questions, logistics commitments, and external actions awaiting human approval.",
    weekday: 5,
    participantKeys: ["ceo", "fenou", "commercial", "finance", "compliance", "logistics"],
  },
];

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nextWeekdayUtc(weekday: number, hour = 8) {
  const now = new Date();
  const next = new Date(now.getTime());
  next.setUTCHours(hour, 0, 0, 0);
  let offset = (weekday - next.getUTCDay() + 7) % 7;
  if (offset === 0 && next <= now) offset = 7;
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

async function ensureObjectives(companyId: number, agentIds: AgentIds, dryRun: boolean) {
  const existingRows = await db.query.goals.findMany({ where: eq(goals.companyId, companyId) });
  const ids = new Map<string, number>();

  for (const spec of INDUSTRIAL_OBJECTIVES) {
    const existing = existingRows.find((row) => {
      const metadata = asRecord(row.metadata);
      return metadata.industrialPlanKey === spec.key || row.title === spec.title;
    });
    if (existing?.id) ids.set(spec.key, Number(existing.id));
    if (dryRun) continue;

    const metadata = {
      ...asRecord(existing?.metadata),
      industrialPlanKey: spec.key,
      operatingModel: "exportunity-industrial",
      operatingPlanVersion: OPERATING_PLAN_VERSION,
      keyResults: spec.keyResults,
      successCriteria: spec.successCriteria,
      notes: "Seeded as part of Exportunity's approved industrial operating plan. Human approval remains required for external commitments.",
    };
    const values = {
      title: spec.title,
      description: spec.description,
      ownerAgentId: agentIds.get(spec.ownerKey) ?? existing?.ownerAgentId ?? null,
      priority: spec.priority,
      metadata,
      updatedAt: new Date(),
    };

    if (existing?.id) {
      await db.update(goals).set(values).where(eq(goals.id, existing.id));
      continue;
    }

    const [created] = await db
      .insert(goals)
      .values({
        companyId,
        ...values,
        status: "in_progress",
        progress: 0,
        startDate: new Date(),
        createdAt: new Date(),
      })
      .returning({ id: goals.id });
    if (created?.id) ids.set(spec.key, Number(created.id));
  }

  return ids;
}

async function ensureOperationsRoom(tenantId: number, agentIds: AgentIds, dryRun: boolean) {
  const existing = await db.query.meetingRooms.findFirst({
    where: and(eq(meetingRooms.tenantId, tenantId), eq(meetingRooms.name, "Exportunity Operations Room")),
  });
  if (existing?.id || dryRun) return existing?.id ? Number(existing.id) : null;

  const [created] = await db
    .insert(meetingRooms)
    .values({
      tenantId,
      name: "Exportunity Operations Room",
      capacity: 20,
      capacityHumans: 8,
      location: "Exportunity Operations Center",
      locationLabel: "Virtual operations room",
      timezone: "Africa/Porto-Novo",
      isVirtual: true,
      defaultAgentsJson: {
        agentIds: [agentIds.get("fenou"), agentIds.get("ceo")].filter(Boolean),
      },
      features: { transcript: true, decisions: true, tasks: true, evidence: true },
      isAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: meetingRooms.id });
  return created?.id ? Number(created.id) : null;
}

async function ensureAgenda(input: {
  tenantId: number;
  companyId: number;
  companyUserId: number | null;
  roomId: number | null;
  objectiveIds: Map<string, number>;
  agentIds: AgentIds;
  dryRun: boolean;
}) {
  const existingMeetings = await db.query.meetings.findMany({
    where: and(eq(meetings.tenantId, input.tenantId), eq(meetings.companyId, input.companyId)),
  });
  const createdMeetingIds: number[] = [];

  for (const spec of INDUSTRIAL_AGENDA) {
    const existing = existingMeetings.find(
      (meeting) => asRecord(meeting.metadata).industrialAgendaKey === spec.key,
    );
    if (existing?.id || input.dryRun || !input.roomId) continue;

    const objectiveId = input.objectiveIds.get(spec.objectiveKey);
    if (!objectiveId) continue;
    const startTime = nextWeekdayUtc(spec.weekday);
    const endTime = new Date(startTime.getTime() + 30 * 60_000);
    const conversationId = `industrial-agenda:${input.tenantId}:${spec.key}`;
    const organizerId = input.agentIds.get("ceo") ?? null;
    const participantAgentIds = Array.from(
      new Set(spec.participantKeys.map((key) => input.agentIds.get(key)).filter((id): id is number => !!id)),
    );

    const [meeting] = await db
      .insert(meetings)
      .values({
        tenantId: input.tenantId,
        companyId: input.companyId,
        title: spec.title,
        description: spec.description,
        roomId: input.roomId,
        meetingType: "weekly_ops_sync",
        type: "scheduled",
        startTime,
        endTime,
        duration: 30,
        organizerId,
        status: "scheduled",
        conversationId,
        metadata: {
          industrialAgendaKey: spec.key,
          operatingPlanVersion: OPERATING_PLAN_VERSION,
          recurrenceRule: "FREQ=WEEKLY;INTERVAL=1;BYHOUR=8;BYMINUTE=0",
          createdVia: "industrial-operating-plan",
          goalId: objectiveId,
          objectiveId,
          createdByUserId: input.companyUserId,
          timezone: "Africa/Porto-Novo",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();
    if (!meeting?.id) continue;
    createdMeetingIds.push(Number(meeting.id));

    const [chatRoom] = await db
      .insert(chatRooms)
      .values({
        name: spec.title,
        currentTitle: spec.title,
        type: "meeting",
        description: spec.description,
        moderatorId: organizerId,
        ownerAgentId: organizerId,
        topicTags: ["industrial-operations", spec.objectiveKey],
        conversationId,
        metadata: {
          tenantId: input.tenantId,
          companyId: input.companyId,
          meetingId: meeting.id,
          goalId: objectiveId,
          objectiveId,
          industrialAgendaKey: spec.key,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: chatRooms.id });

    const participantRows: Array<typeof meetingParticipants.$inferInsert> = [];
    if (input.companyUserId) {
      participantRows.push({
        tenantId: input.tenantId,
        meetingId: meeting.id,
        participantType: "human",
        userId: input.companyUserId,
        role: "host",
        required: true,
        invitedAt: new Date(),
        status: "invited",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    participantRows.push(
      ...participantAgentIds.map((agentId) => ({
        tenantId: input.tenantId,
        meetingId: meeting.id,
        participantType: "agent" as const,
        agentId,
        role: agentId === input.agentIds.get("fenou") ? ("note_taker" as const) : ("participant" as const),
        required: true,
        invitedAt: new Date(),
        status: "invited" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    if (participantRows.length) await db.insert(meetingParticipants).values(participantRows);

    if (chatRoom?.id && participantAgentIds.length) {
      await db.insert(roomMemberships).values(
        participantAgentIds.map((agentId) => ({
          roomId: chatRoom.id,
          agentId,
          role: agentId === organizerId ? ("moderator" as const) : ("member" as const),
          isActive: true,
          joinedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }
  }

  return createdMeetingIds;
}

export async function ensureExportunityIndustrialOperatingPlan(input: {
  tenantId: number;
  companyId: number;
  companyUserId: number | null;
  companyMetadata?: unknown;
  agentIds: AgentIds;
  dryRun: boolean;
}) {
  if (!input.dryRun) {
    await db
      .update(companies)
      .set({
        description:
          "Exportunity | AI is an AI-managed global B2B trade and operations network for demand capture, sourcing, supplier and buyer intelligence, export, logistics, market entry, and governed company execution. Industrial equipment, spare parts, manufacturing, raw materials, commodities, agriculture, infrastructure, energy, mobility, mining, precious metals under compliance review, and export-ready products are sector capabilities within the wider network.",
        vision: EXPORTUNITY_GLOBAL_MISSION,
        currentGoals: INDUSTRIAL_OBJECTIVES.map((objective) => objective.title),
        primarySector: "trade_export",
        industryTags: [
          "industrial sourcing",
          "spare parts",
          "machinery",
          "industrial raw materials",
          "mining supply chains",
          "precious metals sourcing",
          "reverse engineering",
          "local manufacturing",
          "export readiness",
        ],
        metadata: {
          ...asRecord(input.companyMetadata),
          operatingModel: "exportunity-global-trade-os",
          operatingPlanVersion: OPERATING_PLAN_VERSION,
          masterBrand: "Exportunity | AI",
          operatingTerritories: ["Global network", "Cote d'Ivoire", "Benin", "United Arab Emirates"],
          activeOperatingCorridors: ["Cote d'Ivoire", "Benin", "United Arab Emirates"],
          industrialProgramMission: EXPORTUNITY_INDUSTRIAL_MISSION,
          specializedDivisions: ["Exportunity Machinery"],
          externalActions: "human_approval_required",
        },
        updatedAt: new Date(),
      })
      .where(eq(companies.id, input.companyId));
  }

  const objectiveIds = await ensureObjectives(input.companyId, input.agentIds, input.dryRun);
  const roomId = await ensureOperationsRoom(input.tenantId, input.agentIds, input.dryRun);
  const createdMeetingIds = await ensureAgenda({
    tenantId: input.tenantId,
    companyId: input.companyId,
    companyUserId: input.companyUserId,
    roomId,
    objectiveIds,
    agentIds: input.agentIds,
    dryRun: input.dryRun,
  });

  return {
    version: OPERATING_PLAN_VERSION,
    objectiveIds: Object.fromEntries(objectiveIds),
    roomId,
    createdMeetingIds,
  };
}
