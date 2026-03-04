import { db } from "@db";
import { agents, departments } from "@db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

type AgentRole = "CEO" | "Operations Manager" | "Finance Manager" | "HR Specialist" | "Coordinator";

const DEFAULT_CEO_NAME = "Zogué Sounouvou";

async function findDepartmentId(companyId: number, departmentName: string) {
  const dept = await db.query.departments.findFirst({
    where: and(eq(departments.companyId, companyId), eq(departments.name, departmentName)),
    columns: { id: true },
  });
  return dept?.id ?? null;
}

export async function ensureAgentsInitialized(defaultCompanyId?: number) {
  console.log("[Init] Checking core and business agents initialization...");

  try {
    // Check for CEO Agent first since it's our primary agent
    const ceoAgent = await db.query.agents.findFirst({
      where: eq(agents.role, "CEO"),
    });

    if (!ceoAgent) {
      console.log("[Init] Creating initial business agents...");

      const executiveDeptId = defaultCompanyId ? await findDepartmentId(defaultCompanyId, "Executive") : null;
      const financeDeptId = defaultCompanyId ? await findDepartmentId(defaultCompanyId, "Finance") : null;
      const operationsDeptId = defaultCompanyId ? await findDepartmentId(defaultCompanyId, "Operations") : null;
      const itDeptId = defaultCompanyId ? await findDepartmentId(defaultCompanyId, "IT") : null;

      // Define initial core business agents
      const initialAgents = [
        {
          ...(defaultCompanyId ? { companyId: defaultCompanyId } : {}),
          ...(defaultCompanyId ? { departmentId: executiveDeptId } : {}),
          name: DEFAULT_CEO_NAME,
          role: "CEO",
          status: "active" as const,
          capabilities: {
            leadership: 0.9,
            decisionMaking: 0.9,
            strategicPlanning: 0.9
          },
          metadata: {
            responsibilities: [
              "Strategic decision-making",
              "Approving projects and tasks",
              "Monitoring overall performance"
            ],
            hierarchyLevel: 5,
            customPrompt: `You are ${DEFAULT_CEO_NAME}, CEO of Exportunity Gold Exchange. Make high-level strategic decisions and set company direction.`,
            persona: {
              lifeStory:
                "Founder/operator with a hands-on background in building systems and teams. Calm under pressure, decisive, and relentlessly focused on execution.",
              personalGoals:
                "Build Exportunity Gold Exchange into the most trusted gold and marketplace platform through automation, compliance, and predictable operations.",
            },
          },
          avatar: "👨‍💼",
        },
        {
          ...(defaultCompanyId ? { companyId: defaultCompanyId } : {}),
          ...(defaultCompanyId ? { departmentId: operationsDeptId } : {}),
          name: "Mariam Koné",
          role: "Operations Manager",
          status: "active" as const,
          ...(defaultCompanyId ? { managerId: null } : {}),
          capabilities: {
            taskManagement: 0.9,
            processOptimization: 0.8,
            teamCoordination: 0.9
          },
          metadata: {
            responsibilities: [
              "Assigning and delegating tasks",
              "Monitoring deadlines and productivity",
              "Overseeing workflows"
            ],
            hierarchyLevel: 4,
            customPrompt: "You are Mariam Koné, Operations Manager. Ensure smooth daily operations across marketplace, delivery, and gold exchange.",
            persona: {
              lifeStory:
                "Grew up around commerce and logistics. Built a career on making operations predictable by turning messy reality into clear playbooks.",
              personalGoals:
                "Reduce cycle time, eliminate recurring incidents, and keep delivery and seller SLAs stable.",
            },
          },
          avatar: "📋",
        },
        {
          ...(defaultCompanyId ? { companyId: defaultCompanyId } : {}),
          ...(defaultCompanyId ? { departmentId: financeDeptId } : {}),
          name: "Jean-Baptiste Ouattara",
          role: "Finance Manager",
          status: "active" as const,
          capabilities: {
            financialAnalysis: 0.9,
            budgeting: 0.9,
            riskManagement: 0.8
          },
          metadata: {
            responsibilities: [
              "Budgeting and forecasting",
              "Managing expenditures",
              "Financial reporting"
            ],
            hierarchyLevel: 4,
            customPrompt:
              "You are Jean-Baptiste Ouattara, Finance Manager. Oversee budgets, cash control, reconciliations, and reporting for Exportunity Gold Exchange.",
            persona: {
              lifeStory:
                "Accountant turned operator. Loves clean ledgers, tight controls, and simple dashboards that prevent surprises.",
              personalGoals:
                "Achieve daily reconciliation and enforce spend limits while improving margin visibility.",
            },
          },
          avatar: "💰",
        },
        {
          ...(defaultCompanyId ? { companyId: defaultCompanyId } : {}),
          ...(defaultCompanyId ? { departmentId: executiveDeptId } : {}),
          name: "Fatou Diop",
          role: "HR Specialist",
          status: "active" as const,
          capabilities: {
            recruitment: 0.9,
            performanceManagement: 0.8,
            conflictResolution: 0.8
          },
          metadata: {
            responsibilities: [
              "Agent recruitment",
              "Performance tracking",
              "Dispute resolution"
            ],
            hierarchyLevel: 3,
            customPrompt:
              "You are Fatou Diop, HR Specialist. Manage hiring, performance, and team health for the agent organization.",
            persona: {
              lifeStory:
                "People-ops specialist who believes high performance and strong culture can coexist. Strong on feedback loops and clear expectations.",
              personalGoals:
                "Build a stable org with clear roles, career paths, and measurable performance without burnout.",
            },
          },
          avatar: "👥",
        },
        {
          ...(defaultCompanyId ? { companyId: defaultCompanyId } : {}),
          ...(defaultCompanyId ? { departmentId: itDeptId ?? operationsDeptId } : {}),
          name: "Awa Bamba",
          role: "Coordinator",
          status: "active" as const,
          capabilities: {
            systemManagement: 0.9,
            taskOrchestration: 0.9,
            communication: 0.8
          },
          metadata: {
            responsibilities: [
              "System coordination",
              "Task distribution",
              "Process optimization"
            ],
            hierarchyLevel: 4,
            customPrompt:
              "You are Awa Bamba, System Coordinator. Ensure smooth operation of the multi-agent system and reliable handoffs between modules.",
            persona: {
              lifeStory:
                "Technically-minded coordinator who bridges product and operations. Obsessed with reliability, checklists, and clean integrations.",
              personalGoals:
                "Reduce operational friction by automating routine handoffs and surfacing the right alerts to the right owners.",
            },
            softwareEditing: true,
          },
          avatar: "🔄",
        }
      ];

      // Insert initial agents
      await db.insert(agents).values(initialAgents);
      // Ensure core reporting lines: everyone reports to the CEO.
      const createdCeo = await db.query.agents.findFirst({
        where: eq(agents.role, "CEO"),
        columns: { id: true, companyId: true },
      });
      const targetCompanyId = defaultCompanyId ?? createdCeo?.companyId ?? null;
      if (createdCeo?.id && targetCompanyId) {
        await db
          .update(agents)
          .set({ managerId: createdCeo.id, updatedAt: new Date() })
          .where(
            and(
              eq(agents.companyId, targetCompanyId),
              inArray(agents.role, ["Operations Manager", "Finance Manager", "HR Specialist", "Coordinator"]),
              isNull(agents.managerId),
            )
          );
      }
      console.log("[Init] Initial business agents created successfully");
    } else {
      console.log("[Init] Business agents already exist");
      // Update status to active + normalize CEO name
      await db.update(agents).set({ status: "active" }).where(eq(agents.role, "CEO"));
      if (ceoAgent.name === "CEO Agent") {
        await db.update(agents).set({ name: DEFAULT_CEO_NAME }).where(eq(agents.id, ceoAgent.id));
      }
    }

    if (defaultCompanyId) {
      await db.update(agents).set({ companyId: defaultCompanyId }).where(isNull(agents.companyId));
    }

    return true;
  } catch (error) {
    console.error("[Init Error] Failed to initialize agents:", error);
    throw error;
  }
}
