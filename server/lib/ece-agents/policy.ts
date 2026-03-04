export type TenantScope = "platform_admin" | "tenant_owner" | "tenant_member" | "agent_operator";

function normalizeLabel(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readRoles(user: any): string[] {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.map((item: unknown) => normalizeLabel(item)).filter(Boolean);
}

function readPermissions(user: any): string[] {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.map((item: unknown) => String(item ?? "").trim()).filter(Boolean);
}

export function resolveTenantScope(user: any): TenantScope {
  const roles = readRoles(user);
  const permissions = readPermissions(user);
  const currentMode = normalizeLabel(user?.currentMode);

  if (permissions.includes("*") || roles.includes("super admin") || roles.includes("platform admin")) {
    return "platform_admin";
  }

  if (
    currentMode === "admin" ||
    roles.includes("admin") ||
    roles.includes("owner") ||
    roles.includes("investor") ||
    roles.includes("mine owner") ||
    roles.includes("authorized gold buyer") ||
    roles.includes("shop owner") ||
    roles.includes("seller") ||
    roles.includes("buyer") ||
    roles.includes("delivery")
  ) {
    return "tenant_owner";
  }

  if (
    roles.includes("operator") ||
    roles.includes("agent operator") ||
    permissions.includes("manage_orders") ||
    permissions.includes("manage_shop")
  ) {
    return "agent_operator";
  }

  return "tenant_member";
}

export function canManageAgents(scope: TenantScope) {
  return scope === "platform_admin" || scope === "tenant_owner";
}

export function canOperateAgents(scope: TenantScope) {
  return canManageAgents(scope) || scope === "agent_operator";
}

const HIGH_IMPACT_ACTION_PATTERNS = [
  /\b(send|envoyer)\b.{0,40}\b(email|mail|whatsapp|sms)\b/i,
  /\b(publish|publier|post)\b/i,
  /\b(pay|payer|transfer|virement)\b/i,
  /\b(create|creer|launch|lancer)\b.{0,40}\b(campaign|campagne)\b/i,
  /\b(contact|reach out|prospect)\b/i,
];

export function detectsHighImpactAction(text: string) {
  const content = String(text || "").trim();
  if (!content) return false;
  return HIGH_IMPACT_ACTION_PATTERNS.some((pattern) => pattern.test(content));
}
