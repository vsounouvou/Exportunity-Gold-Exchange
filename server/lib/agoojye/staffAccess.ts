function normalizeRoleLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const AGOOJIYE_STAFF_ROLES = new Set([
  "admin",
  "agent",
  "controleur",
  "controller",
  "staff",
]);

export function hasAgoojiyeStaffAccess(user: any): boolean {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const currentMode = normalizeRoleLabel(String(user?.currentMode || ""));
  const normalizedRoles = roles.map((role: unknown) => normalizeRoleLabel(String(role || "")));

  return (
    currentMode === "admin" ||
    permissions.includes("*") ||
    normalizedRoles.some((role: string) => AGOOJIYE_STAFF_ROLES.has(role))
  );
}
