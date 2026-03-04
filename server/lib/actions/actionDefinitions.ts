import { db } from "@db";
import { actionDefinitions } from "@db/schema";
import { and, eq } from "drizzle-orm";
import { ACTIONS_REGISTRY, type ActionRegistryEntry } from "./actionRegistry";

type ActionDefinitionTemplate = {
  actionKey: string;
  name: string;
  description: string;
  category: string;
  schema: Record<string, unknown>;
  defaultAssigneeRole?: string | null;
};

const DEFAULT_ASSIGNEE_ROLE = "CHAIRMAN_ASSISTANT";

function normalizeActionKey(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const REQUIRED_ACTION_TEMPLATES: ActionDefinitionTemplate[] = [
  {
    actionKey: "NAVIGATE_OPEN_PAGE",
    name: "Navigate Open Page",
    description: "Open a page or route in the app.",
    category: "NAVIGATION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string" },
        label: { type: "string" },
        newTab: { type: "boolean" },
      },
    },
  },
  {
    actionKey: "AGENT_ASK",
    name: "Agent Ask",
    description: "Ask an agent to investigate or respond.",
    category: "EXECUTION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: ["question"],
      properties: {
        agentId: { type: "number" },
        question: { type: "string" },
        context: { type: "string" },
      },
    },
  },
  {
    actionKey: "OBJECTIVE_CREATE",
    name: "Objective Create",
    description: "Create a new objective.",
    category: "CREATION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: ["companyId", "title"],
      properties: {
        companyId: { type: "number" },
        title: { type: "string" },
        description: { type: "string" },
        ownerAgentId: { type: "number" },
        deadline: { type: "string" },
        priority: { type: "string" },
      },
    },
  },
  {
    actionKey: "REMINDER_CREATE",
    name: "Reminder Create",
    description: "Create a reminder.",
    category: "CREATION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        dueAt: { type: "string" },
      },
    },
  },
  {
    actionKey: "DAILY_BRIEFING_GENERATE",
    name: "Daily Briefing Generate",
    description: "Generate a daily briefing.",
    category: "EXECUTION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: [],
      properties: {
        date: { type: "string" },
        focus: { type: "string" },
      },
    },
  },
];

function fromRegistry(entry: ActionRegistryEntry): ActionDefinitionTemplate {
  const key = normalizeActionKey(entry.actionKey);
  return {
    actionKey: key,
    name: toTitleCase(key),
    description: entry.description,
    category: entry.category,
    schema: {},
    defaultAssigneeRole: null,
  };
}

function buildTemplates() {
  const templates = new Map<string, ActionDefinitionTemplate>();

  for (const entry of ACTIONS_REGISTRY) {
    const template = fromRegistry(entry);
    templates.set(template.actionKey, template);
  }

  for (const template of REQUIRED_ACTION_TEMPLATES) {
    templates.set(normalizeActionKey(template.actionKey), {
      ...template,
      actionKey: normalizeActionKey(template.actionKey),
    });
  }

  return Array.from(templates.values());
}

const ACTION_TEMPLATES = buildTemplates();

export function getActionDefinitionTemplates() {
  return ACTION_TEMPLATES;
}

export async function ensureActionDefinitionsForTenant(tenantId: number) {
  const now = new Date();
  for (const def of ACTION_TEMPLATES) {
    await db
      .insert(actionDefinitions)
      .values({
        tenantId,
        actionKey: def.actionKey,
        name: def.name,
        description: def.description,
        category: def.category,
        schema: def.schema ?? {},
        defaultAssigneeRole: def.defaultAssigneeRole ?? null,
        isActive: true,
        version: 1,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [actionDefinitions.tenantId, actionDefinitions.actionKey],
        set: {
          name: def.name,
          description: def.description,
          category: def.category,
          schema: def.schema ?? {},
          defaultAssigneeRole: def.defaultAssigneeRole ?? null,
          isActive: true,
          updatedAt: now,
        },
      });
  }
}

export async function ensureActionDefinitions() {
  const tenantRows = await db.query.tenants.findMany({ columns: { id: true } });
  for (const tenant of tenantRows) {
    const tenantId = Number(tenant.id);
    if (!Number.isFinite(tenantId) || tenantId <= 0) continue;
    await ensureActionDefinitionsForTenant(tenantId);
  }
}

export async function getActionDefinitionForTenant(tenantId: number, actionKey: string) {
  const key = normalizeActionKey(actionKey);
  return db.query.actionDefinitions.findFirst({
    where: and(eq(actionDefinitions.tenantId, tenantId), eq(actionDefinitions.actionKey, key)),
  });
}
