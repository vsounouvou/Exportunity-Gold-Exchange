import { db } from "@db";
import { agents, departments } from "@db/schema";
import { and, eq, isNull } from "drizzle-orm";

type StaffingResult = {
  companyId: number;
  departmentCreated: string[];
  agentsCreated: Array<{ id: number; name: string; role: string; departmentId: number | null }>;
  agentsUpdated: Array<{ id: number; name: string; role: string; updates: Record<string, any> }>;
};

function normalize(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

const CORE_NAMES: Record<string, string> = {
  CEO: "Zogué Sounouvou",
  "Operations Manager": "Mariam Koné",
  "Finance Manager": "Jean-Baptiste Ouattara",
  "HR Specialist": "Fatou Diop",
  Coordinator: "Awa Bamba",
};

const DEPT_DEFAULTS: Record<
  string,
  { description: string; color: string; order: number }
> = {
  executive: { description: "Company leadership and strategy", color: "#8B5CF6", order: 0 },
  sales: { description: "Revenue generation and client acquisition", color: "#10B981", order: 1 },
  marketing: { description: "Brand and demand generation", color: "#F59E0B", order: 2 },
  finance: { description: "Financial management and operations", color: "#3B82F6", order: 3 },
  operations: { description: "Business operations and processes", color: "#6B7280", order: 4 },
  legal: { description: "Legal and compliance", color: "#EF4444", order: 5 },
  it: { description: "Engineering, systems, and software delivery", color: "#14B8A6", order: 6 },
};

export async function ensureDepartment(companyId: number, name: string) {
  const existing = await db.query.departments.findFirst({
    where: and(eq(departments.companyId, companyId), eq(departments.name, name)),
    columns: { id: true, name: true },
  });
  if (existing) return { id: existing.id, created: false };

  const defaults = DEPT_DEFAULTS[normalize(name)] ?? {
    description: "",
    color: "#6B7280",
    order: 99,
  };

  const [created] = await db
    .insert(departments)
    .values({
      companyId,
      name,
      description: defaults.description,
      color: defaults.color,
      order: defaults.order,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: departments.id });

  return { id: created.id, created: true };
}

async function getDeptId(companyId: number, name: string) {
  const dept = await db.query.departments.findFirst({
    where: and(eq(departments.companyId, companyId), eq(departments.name, name)),
    columns: { id: true },
  });
  return dept?.id ?? null;
}

async function createAgent(params: {
  companyId: number;
  departmentId: number | null;
  managerId: number | null;
  name: string;
  role: string;
  isDepartmentHead?: boolean;
  country?: string;
  timezone?: string;
  mission?: string;
  skills?: string[];
  industryFocus?: string[];
  responsibilities?: string[];
  metadata?: Record<string, any>;
}) {
  const [created] = await db
    .insert(agents)
    .values({
      companyId: params.companyId,
      departmentId: params.departmentId,
      managerId: params.managerId,
      name: params.name,
      role: params.role,
      isDepartmentHead: !!params.isDepartmentHead,
      status: "active",
      country: params.country ?? null,
      timezone: params.timezone ?? "UTC",
      mission: params.mission ?? null,
      skills: params.skills ?? [],
      industryFocus: params.industryFocus ?? [],
      responsibilities: params.responsibilities ?? [],
      metadata: params.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: agents.id, name: agents.name, role: agents.role, departmentId: agents.departmentId });

  return created;
}

export async function ensureCompanyStaffed(companyId: number): Promise<StaffingResult> {
  const result: StaffingResult = {
    companyId,
    departmentCreated: [],
    agentsCreated: [],
    agentsUpdated: [],
  };

  // Ensure core departments exist + add IT
  for (const deptName of ["Executive", "Sales", "Marketing", "Finance", "Operations", "Legal", "IT"]) {
    const { created } = await ensureDepartment(companyId, deptName);
    if (created) result.departmentCreated.push(deptName);
  }

  const executiveDeptId = await getDeptId(companyId, "Executive");
  const financeDeptId = await getDeptId(companyId, "Finance");
  const operationsDeptId = await getDeptId(companyId, "Operations");
  const marketingDeptId = await getDeptId(companyId, "Marketing");
  const salesDeptId = await getDeptId(companyId, "Sales");
  const legalDeptId = await getDeptId(companyId, "Legal");
  const itDeptId = await getDeptId(companyId, "IT");

  // Fetch company agents once
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  const byRole = new Map<string, typeof companyAgents[number]>();
  for (const a of companyAgents) {
    if (!byRole.has(a.role)) byRole.set(a.role, a);
  }

  const ceo = byRole.get("CEO") ?? null;

  // Normalize core agent names + assign departments + reporting lines
  const coreUpdates: Array<{ role: string; updates: Record<string, any> }> = [
    {
      role: "CEO",
      updates: {
        name: CORE_NAMES.CEO,
        departmentId: executiveDeptId,
        isDepartmentHead: true,
        managerId: null,
      },
    },
    {
      role: "Operations Manager",
      updates: {
        name: CORE_NAMES["Operations Manager"],
        departmentId: operationsDeptId,
      },
    },
    {
      role: "Finance Manager",
      updates: {
        name: CORE_NAMES["Finance Manager"],
        departmentId: financeDeptId,
      },
    },
    {
      role: "HR Specialist",
      updates: {
        name: CORE_NAMES["HR Specialist"],
        departmentId: executiveDeptId,
      },
    },
    {
      role: "Coordinator",
      updates: {
        name: CORE_NAMES.Coordinator,
        departmentId: itDeptId ?? operationsDeptId,
        metadata: { softwareEditing: true },
      },
    },
  ];

  // Apply core updates if those roles exist
  for (const u of coreUpdates) {
    const agent = byRole.get(u.role);
    if (!agent) continue;

    const managerId = u.role === "CEO" ? null : ceo?.id ?? agent.managerId ?? null;
    const nextUpdates: Record<string, any> = { ...u.updates, managerId };

    // Merge metadata if provided
    if (nextUpdates.metadata) {
      const existingMeta = (agent.metadata as any) || {};
      nextUpdates.metadata = { ...existingMeta, ...(nextUpdates.metadata as any) };
    }

    const [updated] = await db
      .update(agents)
      .set({ ...nextUpdates, updatedAt: new Date() })
      .where(eq(agents.id, agent.id))
      .returning({ id: agents.id, name: agents.name, role: agents.role });

    result.agentsUpdated.push({ id: updated.id, name: updated.name, role: updated.role, updates: nextUpdates });
  }

  // Attach Chief-of-Staff under CEO if present
  if (ceo?.id) {
    const cos = companyAgents.find(
      (a) => (a.metadata as any)?.proposal?.id === "ege-core-v1" && (a.metadata as any)?.proposal?.key === "chairman-chief-of-staff"
    );
    if (cos && cos.managerId !== ceo.id) {
      const [updated] = await db
        .update(agents)
        .set({ managerId: ceo.id, updatedAt: new Date() })
        .where(eq(agents.id, cos.id))
        .returning({ id: agents.id, name: agents.name, role: agents.role });
      result.agentsUpdated.push({ id: updated.id, name: updated.name, role: updated.role, updates: { managerId: ceo.id } });
    }
  }

  // Ensure Chairman Assistant exists and appears in the org chart.
  if (ceo?.id) {
    const existingChairmanAssistant = companyAgents.find((a) => {
      const role = (a.role || "").toLowerCase();
      const meta = (a.metadata as any) || {};
      return role.includes("chairman assistant") || meta?.systemKey === "chairman-assistant";
    });

    if (!existingChairmanAssistant) {
      const created = await createAgent({
        companyId,
        departmentId: executiveDeptId,
        managerId: ceo.id,
        name: "Awa Bamba",
        role: "Chairman Assistant",
        country: "Côte d’Ivoire",
        timezone: "Africa/Abidjan",
        mission:
          "Support the Chairman with daily decision briefs, structured follow-ups, and clear summaries across marketplace and gold exchange modules.",
        skills: ["Executive support", "Decision briefs", "Structured writing", "Prioritization", "Follow-ups"],
        industryFocus: ["Marketplace operations", "Gold trade", "Company governance"],
        responsibilities: [
          "Turn meetings and chats into action items and owners",
          "Draft decision briefs (options, risks, recommendation)",
          "Maintain a weekly priorities and follow-up cadence",
        ],
        metadata: {
          systemKey: "chairman-assistant",
          persona: {
            lifeStory:
              "Raised in West Africa, built a career supporting founders and executives by turning ambiguity into clear next actions. Calm, detail-oriented, and relentlessly organized.",
            personalGoals:
              "Help the Chairman operate at maximum leverage by keeping context, decisions, and follow-ups transparent and on time.",
          },
        },
      });
      result.agentsCreated.push(created);
    }
  }

  // Ensure each department has at least one agent.
  const refreshAgents = await db.query.agents.findMany({ where: eq(agents.companyId, companyId) });
  const agentsByDept = new Map<number, number>();
  for (const a of refreshAgents) {
    if (!a.departmentId) continue;
    agentsByDept.set(a.departmentId, (agentsByDept.get(a.departmentId) ?? 0) + 1);
  }

  const ensureDeptHasAgent = async (deptId: number | null, create: () => Promise<any>) => {
    if (!deptId) return;
    if ((agentsByDept.get(deptId) ?? 0) > 0) return;
    const created = await create();
    result.agentsCreated.push(created);
    agentsByDept.set(deptId, (agentsByDept.get(deptId) ?? 0) + 1);
  };

  await ensureDeptHasAgent(marketingDeptId, async () =>
    createAgent({
      companyId,
      departmentId: marketingDeptId,
      managerId: ceo?.id ?? null,
      name: "Sira Kouassi",
      role: "Brand & Growth Lead",
      isDepartmentHead: true,
      country: "Côte d’Ivoire",
      timezone: "Africa/Abidjan",
      mission: "Build demand and trust for Exportunity Gold Exchange: brand, content, partnerships, and growth loops.",
      skills: ["Growth marketing", "Content strategy", "Partnerships", "Funnels", "Analytics"],
      industryFocus: ["Marketplace growth", "Gold trade trust", "B2B acquisition"],
      responsibilities: [
        "Define marketing strategy and weekly growth experiments",
        "Maintain brand guidelines and messaging",
        "Coordinate with Sales on pipeline and conversion improvements",
      ],
    })
  );

  // Ensure IT has at least 2 agents (so someone can actually edit the software)
  if (itDeptId) {
    const itCount = agentsByDept.get(itDeptId) ?? 0;
    if (itCount < 2) {
      const needed = 2 - itCount;
      const templates = [
        {
          name: "Samuel Mensah",
          role: "IT Lead (Platform)",
          isDepartmentHead: true,
          mission: "Own platform reliability and ship improvements fast with safe engineering practices.",
        },
        {
          name: "Aminata Touré",
          role: "Full-Stack Engineer",
          isDepartmentHead: false,
          mission: "Build and maintain the Exportunity web platform: marketplace, gold exchange, admin, and agent systems.",
        },
      ];

      for (let i = 0; i < needed; i++) {
        const t = templates[i] ?? templates[templates.length - 1];
        const created = await createAgent({
          companyId,
          departmentId: itDeptId,
          managerId: ceo?.id ?? null,
          name: t.name,
          role: t.role,
          isDepartmentHead: t.isDepartmentHead,
          country: "Côte d’Ivoire",
          timezone: "Africa/Abidjan",
          mission: t.mission,
          skills: ["TypeScript", "React", "Node.js", "SQL", "Debugging"],
          industryFocus: ["Marketplace platform", "Gold exchange platform", "Internal tooling"],
          responsibilities: [
            "Fix broken links and bugs",
            "Ship admin automation features",
            "Maintain database migrations and API contracts",
          ],
          metadata: { softwareEditing: true },
        });
        result.agentsCreated.push(created);
        agentsByDept.set(itDeptId, (agentsByDept.get(itDeptId) ?? 0) + 1);
      }
    }
  }

  // Assign any company-less agents to this company (safety) and assign unassigned to a sensible dept.
  await db.update(agents).set({ companyId }).where(isNull(agents.companyId));

  // If any unassigned remain, default them to Operations.
  if (operationsDeptId) {
    await db
      .update(agents)
      .set({ departmentId: operationsDeptId, updatedAt: new Date() })
      .where(and(eq(agents.companyId, companyId), isNull(agents.departmentId)));
  }

  return result;
}
