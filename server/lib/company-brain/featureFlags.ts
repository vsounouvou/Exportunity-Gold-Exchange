export const COMPANY_BRAIN_FEATURE_FLAGS = {
  companyBrain: "FEATURE_COMPANY_BRAIN",
  contextPacks: "FEATURE_COMPANY_BRAIN_CONTEXT_PACKS",
  workspaceConnectors: "FEATURE_GOOGLE_WORKSPACE_CONNECTORS",
  gmailRead: "FEATURE_GOOGLE_WORKSPACE_GMAIL_READ",
  driveRead: "FEATURE_GOOGLE_WORKSPACE_DRIVE_READ",
  contactsRead: "FEATURE_GOOGLE_WORKSPACE_CONTACTS_READ",
  externalCommunications: "FEATURE_EXTERNAL_COMMUNICATIONS",
} as const;

export type CompanyBrainFeature = keyof typeof COMPANY_BRAIN_FEATURE_FLAGS;

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

export function readBooleanFeatureFlag(envName: string, defaultValue = false) {
  const raw = process.env[envName];
  if (typeof raw !== "string" || !raw.trim()) return defaultValue;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}

export function isCompanyBrainFeatureEnabled(feature: CompanyBrainFeature) {
  return readBooleanFeatureFlag(COMPANY_BRAIN_FEATURE_FLAGS[feature], false);
}

export type ExternalCommunicationAuthorization = {
  approvalId?: string | number | null;
  approvedByUserId?: string | number | null;
  approvedAt?: string | Date | null;
};

export function canPerformExternalCommunication(
  authorization: ExternalCommunicationAuthorization | null | undefined,
) {
  if (!isCompanyBrainFeatureEnabled("externalCommunications")) return false;
  if (!authorization?.approvalId || !authorization.approvedByUserId || !authorization.approvedAt) return false;
  const approvedAt = new Date(authorization.approvedAt);
  return Number.isFinite(approvedAt.getTime());
}

export function assertExternalCommunicationAuthorized(
  authorization: ExternalCommunicationAuthorization | null | undefined,
) {
  if (!canPerformExternalCommunication(authorization)) {
    throw new Error(
      "External communication is disabled or lacks a recorded human approval. Drafting remains available internally.",
    );
  }
}

export function getCompanyBrainFeatureStatus() {
  return Object.fromEntries(
    Object.entries(COMPANY_BRAIN_FEATURE_FLAGS).map(([feature, envName]) => [
      feature,
      {
        envName,
        enabled: readBooleanFeatureFlag(envName, false),
      },
    ]),
  ) as Record<CompanyBrainFeature, { envName: string; enabled: boolean }>;
}
