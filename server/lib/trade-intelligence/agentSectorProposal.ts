import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@db";
import {
  actionRequests,
  activityLog,
  agents,
  companies,
  industrialAuditLogs,
  tasks,
  tradeDemandEvents,
  tradeIndustrySectors,
  tradeResearchMissions,
} from "@db/schema";
import { createActionRequest } from "../actions/ActionRouter";
import { runAgentTask } from "../agent-os/router";
import { isAgentRunnableStatus } from "../agents/visibility";
import { INDUSTRIAL_TAXONOMY } from "../industrial/taxonomy";
import {
  createTradeIndustrySectorProposal,
  createTradeResearchMission,
  updateTradeResearchMission,
} from "./service";
import {
  buildTradeSectorProposalInstruction,
  parseTradeSectorProposalOutput,
  TRADE_SECTOR_PROPOSAL_EXECUTION_SCOPE,
  TRADE_SECTOR_PROPOSAL_EXECUTION_TYPE,
  TRADE_SECTOR_PROPOSAL_INTENT,
  TRADE_SECTOR_PROPOSAL_MISSION_TYPE,
} from "./agentSectorProposalFoundation";

const TENANT_SCOPED_AGENT_WORK_RUN_AT = "2100-01-01T00:00:00.000Z";
const ACTIVE_ACTION_STATUSES = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "REQUIRES_APPROVAL",
] as const;
const REUSABLE_MISSION_STATUSES = [
  "proposed",
  "queued",
  "in_progress",
  "awaiting_review",
  "blocked",
] as const;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function tenantScopedAgentWorkMetadata(tenantId: number) {
  return {
    workerScope: "tenant",
    workerTenantId: tenantId,
    workerTenantKey:
      process.env.DEPLOY_TENANT || process.env.TENANT_DEFAULT || "exportunity",
    runAt: TENANT_SCOPED_AGENT_WORK_RUN_AT,
    runReason: "explicit_visible_trade_sector_proposal",
    externalCommunicationAllowed: false,
  };
}

function organizationKey(agent: typeof agents.$inferSelect) {
  const metadata =
    agent.metadata &&
    typeof agent.metadata === "object" &&
    !Array.isArray(agent.metadata)
      ? (agent.metadata as Record<string, unknown>)
      : {};
  return cleanText(metadata.organizationKey).toLowerCase();
}

function hasIndustrialIntelligenceCapability(agent: typeof agents.$inferSelect) {
  const capabilities = Array.isArray(agent.capabilities)
    ? agent.capabilities
    : [];
  return capabilities.some(
    (capability) => cleanText(capability).toLowerCase() === "industrial_intelligence",
  );
}

async function resolveTradeSectorProposalAgent(tenantId: number) {
  const tenantAgents = await db.query.agents.findMany({
    where: eq(agents.tenantId, tenantId),
  });
  const eligible = tenantAgents.filter(
    (agent) =>
      Boolean(agent.companyId) &&
      !agent.isTest &&
      agent.isVisible &&
      isAgentRunnableStatus(agent.status),
  );
  const agent =
    eligible.find((candidate) => organizationKey(candidate) === "data") ||
    eligible.find(hasIndustrialIntelligenceCapability);
  if (!agent?.companyId) {
    throw new Error(
      "No visible Exportunity data-intelligence employee is available for this proposal.",
    );
  }
  const company = await db.query.companies.findFirst({
    where: and(
      eq(companies.id, Number(agent.companyId)),
      eq(companies.tenantId, tenantId),
    ),
  });
  if (!company) {
    throw new Error("The assigned employee is outside the Exportunity company tenant.");
  }
  return { agent, company };
}

async function findTradeSectorProposalAction(input: {
  tenantId: number;
  missionId: string;
}) {
  return db.query.actionRequests.findFirst({
    where: and(
      eq(actionRequests.tenantId, input.tenantId),
      eq(actionRequests.actionType, "RUN_AGENT_TASK"),
      inArray(actionRequests.status, [...ACTIVE_ACTION_STATUSES]),
      eq(
        sql<string>`${actionRequests.payload}->>'missionId'`,
        input.missionId,
      ),
    ),
    orderBy: [desc(actionRequests.id)],
  });
}

export async function queueTradeSectorProposalFromDemand(input: {
  tenantId: number;
  demandEventId: string;
  requestedByUserId?: number | null;
}) {
  const event = await db.query.tradeDemandEvents.findFirst({
    where: and(
      eq(tradeDemandEvents.tenantId, input.tenantId),
      eq(tradeDemandEvents.id, input.demandEventId),
    ),
  });
  if (!event) throw new Error("The demand event is unavailable.");

  if (event.sectorCode) {
    const knownSector = await db.query.tradeIndustrySectors.findFirst({
      where: and(
        eq(tradeIndustrySectors.tenantId, input.tenantId),
        eq(tradeIndustrySectors.code, event.sectorCode),
        eq(tradeIndustrySectors.status, "active"),
      ),
    });
    if (knownSector) {
      throw new Error(
        "This demand is already mapped to an active governed industry sector.",
      );
    }
  }

  const { agent, company } = await resolveTradeSectorProposalAgent(
    input.tenantId,
  );
  let mission = await db.query.tradeResearchMissions.findFirst({
    where: and(
      eq(tradeResearchMissions.tenantId, input.tenantId),
      eq(tradeResearchMissions.triggeredByDemandEventId, event.id),
      eq(
        tradeResearchMissions.missionType,
        TRADE_SECTOR_PROPOSAL_MISSION_TYPE,
      ),
      inArray(tradeResearchMissions.status, [
        ...REUSABLE_MISSION_STATUSES,
      ]),
    ),
    orderBy: [desc(tradeResearchMissions.createdAt)],
  });
  const reusedMission = Boolean(mission);

  if (!mission) {
    const demandLabel =
      cleanText(event.normalizedProduct) ||
      cleanText(event.queryText) ||
      "unclassified demand";
    mission = await createTradeResearchMission({
      tenantId: input.tenantId,
      userId: input.requestedByUserId || null,
      companyId: Number(company.id),
      assignedAgentId: Number(agent.id),
      missionType: TRADE_SECTOR_PROPOSAL_MISSION_TYPE,
      title: `Propose governed sector for ${demandLabel}`.slice(0, 500),
      objective:
        "Prepare a structured industry-sector taxonomy draft from this recorded demand signal. Keep missing evidence explicit; do not publish, activate coverage, or contact anyone.",
      countryCode: event.destinationCountryCode || null,
      sectorCode: null,
      priority: event.resultCount === 0 ? "high" : "medium",
      triggeredByDemandEventId: event.id,
      evidenceRequirements: [
        "Recorded demand event",
        "Mapping to one or more canonical Industrial OS categories",
        "Human review before sector activation",
      ],
      metadata: {
        agentPreparedDraft: true,
        sourceSurface: event.sourceSurface,
        externalCommunicationAllowed: false,
        activationRequiresHumanApproval: true,
      },
      executionType: TRADE_SECTOR_PROPOSAL_EXECUTION_TYPE,
      initialStatus: "queued",
      approvalStatus: "approved",
    });
  }

  const activeAction = await findTradeSectorProposalAction({
    tenantId: input.tenantId,
    missionId: mission.id,
  });
  if (activeAction || ["in_progress", "awaiting_review"].includes(mission.status)) {
    return {
      mission,
      actionRequest: activeAction || null,
      agent: { id: agent.id, name: agent.name },
      reused: true,
      workerStarted: false,
    };
  }

  if (mission.status !== "queued") {
    mission = await updateTradeResearchMission({
      tenantId: input.tenantId,
      missionId: mission.id,
      userId: input.requestedByUserId || null,
      status: "queued",
      approvalStatus: "approved",
      assignedAgentId: Number(agent.id),
    });
  }

  if (mission.canonicalTaskId) {
    await db
      .update(tasks)
      .set({
        companyId: Number(company.id),
        agentId: Number(agent.id),
        approvalStatus: "approved",
        isAutomated: true,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, mission.canonicalTaskId));
  }

  let actionRequest: typeof actionRequests.$inferSelect;
  try {
    actionRequest = await createActionRequest({
      tenantId: input.tenantId,
      requestedByUserId: input.requestedByUserId || null,
      requestedByAgentKey: "data",
      actionType: "RUN_AGENT_TASK",
      payload: {
        agentId: Number(agent.id),
        companyId: Number(company.id),
        taskId: Number(mission.canonicalTaskId),
        missionId: mission.id,
        demandEventId: event.id,
        executionScope: TRADE_SECTOR_PROPOSAL_EXECUTION_SCOPE,
      },
      mode: "REAL",
      priority: event.resultCount === 0 ? 75 : 55,
      idempotencyKey: `trade-sector-proposal:${mission.id}:v1`,
      correlationId: `trade-demand:${event.id}`,
      relatedConversationId: event.sourceConversationId || null,
      metadata: tenantScopedAgentWorkMetadata(input.tenantId),
      isAdmin: true,
    });
  } catch (error) {
    await updateTradeResearchMission({
      tenantId: input.tenantId,
      missionId: mission.id,
      userId: input.requestedByUserId || null,
      status: "blocked",
      approvalStatus: "approved",
      assignedAgentId: Number(agent.id),
      resultSummary:
        error instanceof Error
          ? `Agent OS queue creation failed: ${error.message}`
          : "Agent OS queue creation failed.",
    });
    throw error;
  }

  await Promise.all([
    db.insert(activityLog).values({
      companyId: Number(company.id),
      agentId: Number(agent.id),
      eventType: "trade_sector_proposal_queued",
      eventCategory: "operations",
      title: `${agent.name} assigned to an industry-sector proposal`,
      description:
        "A visible internal Agent OS task was queued for taxonomy preparation. No worker, outreach, publication, or sector activation was started by this request.",
      metadata: {
        taskId: mission.canonicalTaskId || undefined,
        missionId: mission.id,
        demandEventId: event.id,
        actionRequestId: actionRequest.id,
        externalActionStarted: false,
        workerStarted: false,
      } as any,
      createdAt: new Date(),
    }),
    db.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.requestedByUserId || null,
      action: "trade_intelligence.sector_proposal_agent_queued",
      entityType: "trade_research_mission",
      entityId: mission.id,
      nextValue: {
        status: mission.status,
        taskId: mission.canonicalTaskId,
        actionRequestId: actionRequest.id,
        assignedAgentId: agent.id,
      },
      metadata: {
        demandEventId: event.id,
        externalCommunicationAllowed: false,
        workerStarted: false,
      },
    }),
  ]);

  return {
    mission,
    actionRequest,
    agent: { id: agent.id, name: agent.name },
    reused: reusedMission,
    workerStarted: false,
  };
}

async function loadTradeSectorProposalContext(input: {
  tenantId: number;
  missionId: string;
  taskId: number;
  payloadAgentId?: number | null;
}) {
  const mission = await db.query.tradeResearchMissions.findFirst({
    where: and(
      eq(tradeResearchMissions.tenantId, input.tenantId),
      eq(tradeResearchMissions.id, input.missionId),
    ),
  });
  if (
    !mission ||
    mission.missionType !== TRADE_SECTOR_PROPOSAL_MISSION_TYPE ||
    mission.canonicalTaskId !== input.taskId ||
    !mission.triggeredByDemandEventId
  ) {
    throw new Error("The queued task is not a governed trade-sector proposal.");
  }
  const [task, event] = await Promise.all([
    db.query.tasks.findFirst({ where: eq(tasks.id, input.taskId) }),
    db.query.tradeDemandEvents.findFirst({
      where: and(
        eq(tradeDemandEvents.tenantId, input.tenantId),
        eq(tradeDemandEvents.id, mission.triggeredByDemandEventId),
      ),
    }),
  ]);
  if (!task || task.executionType !== TRADE_SECTOR_PROPOSAL_EXECUTION_TYPE) {
    throw new Error("The canonical task has an invalid execution boundary.");
  }
  if (!event) throw new Error("The proposal demand event is unavailable.");
  const assignedAgentId = Number(mission.assignedAgentId || task.agentId || 0);
  if (!assignedAgentId || (input.payloadAgentId && assignedAgentId !== input.payloadAgentId)) {
    throw new Error("The queued employee does not match the proposal assignment.");
  }
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, assignedAgentId),
  });
  if (
    !agent ||
    Number(agent.tenantId || 0) !== input.tenantId ||
    Number(agent.companyId || 0) !== Number(task.companyId || 0) ||
    agent.isTest ||
    !agent.isVisible ||
    !isAgentRunnableStatus(agent.status)
  ) {
    throw new Error("The assigned data-intelligence employee is not runnable.");
  }
  return { mission, task, event, agent };
}

export async function executeTradeSectorProposalAgentWork(input: {
  tenantId: number;
  actionRequestId: number;
  missionId: string;
  taskId: number;
  payloadAgentId?: number | null;
  correlationId?: string | null;
  conversationId?: string | null;
}) {
  const context = await loadTradeSectorProposalContext(input);
  if (!["queued", "in_progress"].includes(context.mission.status)) {
    throw new Error("Only a queued trade-sector proposal can be executed.");
  }

  if (context.mission.status === "queued") {
    await updateTradeResearchMission({
      tenantId: input.tenantId,
      missionId: input.missionId,
      status: "in_progress",
      approvalStatus: "approved",
      assignedAgentId: Number(context.agent.id),
    });
  }

  try {
    const canonicalCategories = INDUSTRIAL_TAXONOMY.map((category) => ({
      code: category.code,
      label: category.label.en,
    }));
    const instruction = buildTradeSectorProposalInstruction({
      demandEventId: context.event.id,
      normalizedProduct: context.event.normalizedProduct,
      queryText: context.event.queryText,
      productCategory: context.event.productCategory,
      destinationCountryCode: context.event.destinationCountryCode,
      commercialIntent: context.event.commercialIntent,
      resultCount: context.event.resultCount,
      canonicalCategories,
    });
    const result = await runAgentTask({
      agentId: Number(context.agent.id),
      companyId: Number(context.agent.companyId),
      task: instruction,
      intent: TRADE_SECTOR_PROPOSAL_INTENT,
      entityId: `trade_demand:${context.event.id}`,
      conversationId: input.conversationId || null,
      correlationId: input.correlationId || `trade-demand:${context.event.id}`,
      vars: {
        missionId: context.mission.id,
        demandEventId: context.event.id,
        taskId: context.task.id,
      },
    });
    const error = cleanText(result.output.error);
    const message = cleanText(result.output.message);
    if (error || !message) {
      throw new Error(error || "The assigned employee produced no taxonomy proposal.");
    }
    const proposal = parseTradeSectorProposalOutput(
      message,
      INDUSTRIAL_TAXONOMY.map((category) => category.code),
    );

    let sector = await db.query.tradeIndustrySectors.findFirst({
      where: and(
        eq(tradeIndustrySectors.tenantId, input.tenantId),
        eq(tradeIndustrySectors.code, proposal.code),
      ),
    });
    let sectorCreated = false;
    if (!sector) {
      sector = await createTradeIndustrySectorProposal({
        tenantId: input.tenantId,
        code: proposal.code,
        name: proposal.name,
        nameFr: proposal.nameFr,
        description: proposal.description,
        rationale: proposal.rationale,
        canonicalCategoryCodes: proposal.canonicalCategoryCodes,
        metadata: {
          proposedByAgentId: context.agent.id,
          canonicalTaskId: context.task.id,
          researchMissionId: context.mission.id,
          sourceDemandEventId: context.event.id,
          agentJobId: result.jobId,
          agentGeneratedDraft: true,
          activationRequiresHumanApproval: true,
        },
      });
      sectorCreated = true;
    }

    const resultSummary = [
      `${sectorCreated ? "Drafted" : "Matched"} governed sector ${proposal.name} (${proposal.code}).`,
      proposal.description,
      `Rationale: ${proposal.rationale}`,
      `Canonical categories: ${proposal.canonicalCategoryCodes.join(", ")}.`,
    ].join("\n\n");
    await updateTradeResearchMission({
      tenantId: input.tenantId,
      missionId: context.mission.id,
      status: "awaiting_review",
      approvalStatus: "approved",
      assignedAgentId: Number(context.agent.id),
      resultSummary: resultSummary.slice(0, 20_000),
      recommendedActions: [
        `Review draft sector ${proposal.code} and its Industrial OS mappings.`,
        "Submit the draft for review or retire it; activation remains a separate human decision.",
      ],
      confidence: proposal.confidence,
    });
    await db
      .update(tradeResearchMissions)
      .set({
        metadata: {
          ...(context.mission.metadata || {}),
          sectorId: sector.id,
          sectorCreated,
          agentJobId: result.jobId,
          actionRequestId: input.actionRequestId,
          agentOutput: message.slice(0, 20_000),
          reviewRequired: true,
          externalCommunicationAllowed: false,
        },
        updatedAt: new Date(),
      })
      .where(eq(tradeResearchMissions.id, context.mission.id));
    await Promise.all([
      db.insert(activityLog).values({
        companyId: Number(context.agent.companyId),
        agentId: Number(context.agent.id),
        eventType: "trade_sector_proposal_completed",
        eventCategory: "operations",
        title: `${context.agent.name} prepared ${proposal.name} for review`,
        description: resultSummary.slice(0, 5_000),
        metadata: {
          taskId: context.task.id,
          missionId: context.mission.id,
          demandEventId: context.event.id,
          sectorId: sector.id,
          agentJobId: result.jobId,
          reviewRequired: true,
          externalActionStarted: false,
        } as any,
        createdAt: new Date(),
      }),
      db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        action: "trade_intelligence.sector_proposal_agent_completed",
        entityType: "trade_research_mission",
        entityId: context.mission.id,
        nextValue: {
          status: "awaiting_review",
          sectorId: sector.id,
          sectorStatus: sector.status,
          agentJobId: result.jobId,
        },
        metadata: {
          taskId: context.task.id,
          actionRequestId: input.actionRequestId,
          agentId: context.agent.id,
          reviewRequired: true,
          externalCommunicationAllowed: false,
        },
      }),
    ]);

    return {
      jobId: result.jobId,
      agentId: Number(context.agent.id),
      missionId: context.mission.id,
      taskId: context.task.id,
      sectorId: sector.id,
      sectorCreated,
      reviewRequired: true,
      externalActionStarted: false,
    };
  } catch (error) {
    await updateTradeResearchMission({
      tenantId: input.tenantId,
      missionId: context.mission.id,
      status: "blocked",
      approvalStatus: "approved",
      assignedAgentId: Number(context.agent.id),
      resultSummary:
        error instanceof Error
          ? `Agent proposal blocked: ${error.message}`
          : "Agent proposal blocked for review.",
    });
    throw error;
  }
}
