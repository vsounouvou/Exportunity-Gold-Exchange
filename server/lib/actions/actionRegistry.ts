export type ActionRiskLevel = "LOW" | "MED" | "HIGH" | "CRITICAL";
export type ActionCategory =
  | "NAVIGATION"
  | "CREATION"
  | "UPDATE"
  | "DELETION"
  | "EXECUTION"
  | "APPROVAL"
  | "SYSTEM";

export type ActionMode = "LIVE" | "SIMULATE";

export type ActionRegistryEntry = {
  actionKey: string;
  category: ActionCategory;
  description: string;
  riskLevel: ActionRiskLevel;
  requiredPermissions: string[];
  approvalRequired: boolean;
  requiresObjective?: boolean;
  requiresSession?: boolean;
  requiresEvidence?: boolean;
};

function normalizeActionKey(input: string) {
  return String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toPermissionKey(actionKey: string) {
  return `actions.${normalizeActionKey(actionKey).toLowerCase()}`;
}

function makeEntry(
  actionKey: string,
  category: ActionCategory,
  description: string,
  riskLevel: ActionRiskLevel,
  options: {
    approvalRequired?: boolean;
    requiredPermissions?: string[];
    requiresObjective?: boolean;
    requiresSession?: boolean;
    requiresEvidence?: boolean;
  } = {},
): ActionRegistryEntry {
  return {
    actionKey: normalizeActionKey(actionKey),
    category,
    description,
    riskLevel,
    approvalRequired: options.approvalRequired ?? (riskLevel === "HIGH" || riskLevel === "CRITICAL"),
    requiredPermissions: options.requiredPermissions?.length ? options.requiredPermissions : [toPermissionKey(actionKey)],
    requiresObjective: options.requiresObjective ?? false,
    requiresSession: options.requiresSession ?? false,
    requiresEvidence: options.requiresEvidence ?? false,
  };
}

const coreEntries: ActionRegistryEntry[] = [
  makeEntry("PAGE_OPEN", "NAVIGATION", "Open page", "LOW"),
  makeEntry("TAB_SWITCH", "NAVIGATION", "Switch tab", "LOW"),
  makeEntry("PANEL_EXPAND", "NAVIGATION", "Expand panel", "LOW"),
  makeEntry("PANEL_CLOSE", "NAVIGATION", "Close panel", "LOW"),
  makeEntry("FILTER_APPLY", "NAVIGATION", "Apply filter", "LOW"),
  makeEntry("SORT_CHANGE", "NAVIGATION", "Change sort", "LOW"),
  makeEntry("SEARCH_QUERY", "NAVIGATION", "Execute search query", "LOW"),
  makeEntry("VIEW_ENTITY", "NAVIGATION", "View single entity", "LOW"),
  makeEntry("VIEW_LIST", "NAVIGATION", "View entity list", "LOW"),

  makeEntry("OBJECTIVE_CREATE", "CREATION", "Create objective", "MED", { requiresObjective: false }),
  makeEntry("OBJECTIVE_VIEW", "NAVIGATION", "View objective", "LOW"),
  makeEntry("OBJECTIVE_SEARCH", "NAVIGATION", "Search objectives", "LOW"),
  makeEntry("OBJECTIVE_UPDATE", "UPDATE", "Update objective", "MED", { requiresObjective: true }),
  makeEntry("OBJECTIVE_CLOSE", "UPDATE", "Close objective", "MED", { requiresObjective: true }),
  makeEntry("OBJECTIVE_DELETE", "DELETION", "Delete objective", "HIGH", { requiresObjective: true }),
  makeEntry("AGENDA_EVENT_CREATE", "CREATION", "Create agenda event", "MED", { requiresObjective: true }),
  makeEntry("AGENDA_EVENT_UPDATE", "UPDATE", "Update agenda event", "MED", { requiresObjective: true }),
  makeEntry("BACKGROUND_SESSION_CREATE", "CREATION", "Create background session", "MED", {
    requiresObjective: true,
    requiresSession: true,
  }),
  makeEntry("BRAINSTORM_START", "EXECUTION", "Start brainstorm session", "MED", {
    requiresSession: true,
    requiresObjective: true,
  }),
  makeEntry("BRAINSTORM_EXTEND", "EXECUTION", "Extend brainstorm session", "MED", { requiresSession: true }),
  makeEntry("BRAINSTORM_STOP", "EXECUTION", "Stop brainstorm session", "LOW", { requiresSession: true }),
  makeEntry("DECISION_CREATE", "CREATION", "Create decision", "MED", { requiresObjective: true, requiresSession: true }),
  makeEntry("DECISION_APPROVE", "APPROVAL", "Approve decision", "HIGH", { requiresObjective: true }),
  makeEntry("TASK_CREATE", "CREATION", "Create task", "MED", { requiresObjective: true }),
  makeEntry("TASK_UPDATE_STATUS", "UPDATE", "Update task status", "LOW", { requiresObjective: true }),
  makeEntry("ACTION_PROPOSE", "CREATION", "Propose operational action", "MED", { requiresObjective: true }),
  makeEntry("ACTION_APPROVE", "APPROVAL", "Approve action", "HIGH", { requiresObjective: true }),
  makeEntry("ACTION_EXECUTE", "EXECUTION", "Execute action", "HIGH", { requiresObjective: true }),
  makeEntry("AUTOMATION_CREATE", "CREATION", "Create automation", "HIGH", { requiresObjective: true }),
  makeEntry("AUTOMATION_RUN_NOW", "EXECUTION", "Run automation now", "HIGH", { requiresObjective: true }),
  makeEntry("AUTOMATION_ENABLE", "UPDATE", "Enable automation", "MED", { requiresObjective: true }),
  makeEntry("AUTOMATION_DISABLE", "UPDATE", "Disable automation", "MED", { requiresObjective: true }),

  makeEntry("CONTACT_CREATE", "CREATION", "Create contact", "LOW"),
  makeEntry("CONTACT_UPDATE", "UPDATE", "Update contact", "LOW"),
  makeEntry("SHOP_CREATE", "CREATION", "Create shop", "MED"),
  makeEntry("SHOP_UPDATE", "UPDATE", "Update shop", "MED"),
  makeEntry("PRODUCT_CREATE", "CREATION", "Create product", "MED"),
  makeEntry("PRODUCT_UPDATE", "UPDATE", "Update product", "MED"),
  makeEntry("PRODUCT_LISTING_APPROVE", "APPROVAL", "Approve product listing", "HIGH"),

  makeEntry("SEND_EMAIL", "EXECUTION", "Send email", "MED"),
  makeEntry("SEND_SMS", "EXECUTION", "Send SMS", "MED"),
  makeEntry("SEND_WHATSAPP", "EXECUTION", "Send WhatsApp", "MED"),
  makeEntry("TRANSCRIBE_VOICE_NOTE", "EXECUTION", "Transcribe voice note", "LOW"),
  makeEntry("GENERATE_AGENT_IMAGE", "EXECUTION", "Generate agent profile image", "MED"),

  makeEntry("SETTLEMENT_EXECUTE", "EXECUTION", "Execute settlement", "CRITICAL", { requiresEvidence: true }),
  makeEntry("REFUND_EXECUTE", "EXECUTION", "Execute refund", "CRITICAL", { requiresEvidence: true }),
  makeEntry("WALLET_LOCK", "UPDATE", "Lock wallet", "CRITICAL", { requiresEvidence: true }),
  makeEntry("PERMISSION_UPDATE", "UPDATE", "Update permissions", "CRITICAL", { requiresEvidence: true }),
  makeEntry("API_KEY_CREATE", "CREATION", "Create API key", "CRITICAL"),
  makeEntry("MIGRATION_EXECUTE", "EXECUTION", "Run migration", "CRITICAL", { requiresEvidence: true }),
  makeEntry("FEATURE_FLAG_UPDATE", "UPDATE", "Update feature flag", "HIGH"),
  makeEntry("SCHEDULE_BACKUP", "SYSTEM", "Schedule backup", "HIGH"),
  makeEntry("SYSTEM_HEALTH_CHECK", "SYSTEM", "Run health check", "LOW"),
  makeEntry("AUDIT_EXPORT", "SYSTEM", "Export audit logs", "HIGH"),
  makeEntry("EMERGENCY_STOP_ENABLE", "SYSTEM", "Enable emergency stop", "CRITICAL", { requiresEvidence: true }),
  makeEntry("EMERGENCY_STOP_DISABLE", "SYSTEM", "Disable emergency stop", "CRITICAL", { requiresEvidence: true }),
];

export const ACTIONS_REGISTRY: ActionRegistryEntry[] = Array.from(
  new Map(coreEntries.map((entry) => [entry.actionKey, entry])).values(),
).sort((left, right) => left.actionKey.localeCompare(right.actionKey));

export const ACTIONS_REGISTRY_MAP = new Map(ACTIONS_REGISTRY.map((entry) => [entry.actionKey, entry]));

export function getActionRegistryEntry(actionKey: string) {
  return ACTIONS_REGISTRY_MAP.get(normalizeActionKey(actionKey));
}

function normalizeRoleLabel(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveActorRoles(actor: any): string[] {
  const role = normalizeRoleLabel(actor?.role);
  const roles = Array.isArray(actor?.roles) ? actor.roles.map(normalizeRoleLabel) : [];
  const unique = new Set([role, ...roles].filter(Boolean));
  return Array.from(unique);
}

export function resolveActorPermissions(actor: any): string[] {
  const perms = Array.isArray(actor?.permissions) ? actor.permissions : [];
  return Array.from(new Set(perms.map((permission: any) => String(permission || "").trim().toLowerCase()).filter(Boolean)));
}

export function isPrivilegedActor(actor: any) {
  const mode = String(actor?.currentMode || "").toLowerCase();
  const roles = resolveActorRoles(actor);
  const permissions = resolveActorPermissions(actor);
  return (
    isMasterActor(actor) ||
    mode === "admin" ||
    permissions.includes("*") ||
    permissions.includes("admin:*") ||
    roles.includes("admin") ||
    roles.includes("owner") ||
    roles.includes("chairman") ||
    roles.includes("super admin") ||
    roles.includes("platform admin")
  );
}

export function isMasterActor(actor: any) {
  const roles = resolveActorRoles(actor);
  const permissions = resolveActorPermissions(actor);
  const agentKey = String(actor?.agentKey || actor?.agent_key || actor?.actorAgentKey || "").trim().toLowerCase();
  return (
    roles.includes("master") ||
    roles.includes("terminal assistant") ||
    permissions.includes("actions.master") ||
    agentKey === "terminal_assistant" ||
    agentKey === "terminal-assistant"
  );
}

export function hasActionPermission(actionKey: string, actor: any) {
  if (isPrivilegedActor(actor)) return true;
  const entry = getActionRegistryEntry(actionKey);
  if (!entry) return false;
  const permissions = resolveActorPermissions(actor);
  return entry.requiredPermissions.some((permission) => permissions.includes(permission.toLowerCase()));
}

export function deriveDefaultRisk(actionKey: string): ActionRiskLevel {
  const key = normalizeActionKey(actionKey);
  if (/(SETTLEMENT|REFUND|WALLET|PERMISSION|MIGRATION|API_KEY|EMERGENCY_STOP)/.test(key)) return "CRITICAL";
  if (/(EXECUTE|APPROVE|DELETE|AUTOMATION|FEATURE_FLAG|BACKUP)/.test(key)) return "HIGH";
  if (/(CREATE|UPDATE|START|STOP|EXTEND|ATTACH)/.test(key)) return "MED";
  return "LOW";
}
