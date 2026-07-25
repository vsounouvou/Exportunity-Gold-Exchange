export type OsPermissionMember = {
  accessLevel?: number | null;
  permissions?: unknown;
  teamId?: number | null;
};

export type OsInvitationState = {
  status?: string | null;
  expiresAt: Date | string;
  useCount?: number | null;
  maxUses?: number | null;
  allowedEmails?: unknown;
};

export const AGOOJIYE_DATA_CLASSES = [
  "PUBLIC",
  "INTERNAL",
  "DEPARTMENT_ONLY",
  "PROJECT_RESTRICTED",
  "MANAGEMENT_CONFIDENTIAL",
  "LEGAL_FINANCIAL_RESTRICTED",
  "SUPER_ADMIN_RESTRICTED",
] as const;

const DATA_CLASS_MIN_LEVEL: Record<(typeof AGOOJIYE_DATA_CLASSES)[number], number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  DEPARTMENT_ONLY: 2,
  PROJECT_RESTRICTED: 3,
  MANAGEMENT_CONFIDENTIAL: 5,
  LEGAL_FINANCIAL_RESTRICTED: 6,
  SUPER_ADMIN_RESTRICTED: 7,
};

export function canAccessAgoojiyeDataClass(input: {
  member: OsPermissionMember;
  classification?: string | null;
  resourceTeamId?: number | null;
  resourceProjectId?: number | null;
  projectMembershipIds?: Set<number>;
}) {
  const classification = String(input.classification || "INTERNAL").toUpperCase() as keyof typeof DATA_CLASS_MIN_LEVEL;
  const requiredLevel = DATA_CLASS_MIN_LEVEL[classification];
  if (requiredLevel === undefined) return false;
  const accessLevel = Number(input.member.accessLevel || 0);
  if (accessLevel < requiredLevel) return false;
  if (accessLevel >= 7) return true;
  if (classification === "DEPARTMENT_ONLY") {
    return Boolean(input.resourceTeamId) && Number(input.resourceTeamId) === Number(input.member.teamId || -1);
  }
  if (classification === "PROJECT_RESTRICTED") {
    return Boolean(input.resourceProjectId) && Boolean(input.projectMembershipIds?.has(Number(input.resourceProjectId)));
  }
  return true;
}

export function hasAgoojiyeOsPermission(member: OsPermissionMember, permission: string) {
  const permissions = Array.isArray(member.permissions)
    ? member.permissions.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  return Number(member.accessLevel || 0) >= 6 || permissions.includes("*") || permissions.includes(permission);
}

export function canAccessAgoojiyeOsChannel(input: {
  member: OsPermissionMember;
  channel: { id: number; teamId?: number | null; projectId?: number | null; confidentiality?: number | null };
  memberChannelIds?: Set<number>;
}) {
  const accessLevel = Number(input.member.accessLevel || 1);
  if (Number(input.channel.confidentiality || 1) > accessLevel) return false;
  if (accessLevel >= 6) return true;
  if (input.memberChannelIds?.has(Number(input.channel.id))) return true;
  if (input.channel.teamId && Number(input.channel.teamId) === Number(input.member.teamId || -1)) return true;
  return !input.channel.teamId && !input.channel.projectId && Number(input.channel.confidentiality || 1) <= 2;
}

export function evaluateAgoojiyeOsInvitation(invitation: OsInvitationState | null | undefined, email: string, now = Date.now()) {
  if (!invitation) return { ok: false as const, reason: "not_found" as const };
  if (String(invitation.status || "").toLowerCase() !== "active") return { ok: false as const, reason: "inactive" as const };
  const expiry = new Date(invitation.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= now) return { ok: false as const, reason: "expired" as const };
  if (Number(invitation.useCount || 0) >= Number(invitation.maxUses || 0)) return { ok: false as const, reason: "fully_used" as const };
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const allowedEmails = Array.isArray(invitation.allowedEmails)
    ? invitation.allowedEmails.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (!normalizedEmail || !allowedEmails.includes(normalizedEmail)) return { ok: false as const, reason: "email_not_allowed" as const };
  return { ok: true as const, remainingUses: Math.max(0, Number(invitation.maxUses || 0) - Number(invitation.useCount || 0)) };
}
