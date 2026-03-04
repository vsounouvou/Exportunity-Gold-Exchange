export const CADASTRE_STATUS_COLOR: Record<string, string> = {
  VERIFIED: "#16a34a",
  PENDING: "#f59e0b",
  INACTIVE: "#6b7280",
};

export const CADASTRE_TYPE_COLOR: Record<string, string> = {
  ARTISANAL: "#0ea5e9",
  SEMI_INDUSTRIAL: "#8b5cf6",
  INDUSTRIAL: "#111827",
  UNKNOWN: "#94a3b8",
};

export const CADASTRE_RISK_COLOR: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f97316",
  HIGH: "#ef4444",
};

function normalizeKey(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export function getCadastreStatusColor(status: unknown) {
  const key = normalizeKey(status);
  return CADASTRE_STATUS_COLOR[key] || CADASTRE_STATUS_COLOR.PENDING;
}

export function getCadastreTypeColor(siteType: unknown) {
  const key = normalizeKey(siteType);
  return CADASTRE_TYPE_COLOR[key] || CADASTRE_TYPE_COLOR.UNKNOWN;
}

export function getCadastreRiskColor(risk: unknown) {
  const key = normalizeKey(risk);
  return CADASTRE_RISK_COLOR[key] || CADASTRE_RISK_COLOR.MEDIUM;
}

