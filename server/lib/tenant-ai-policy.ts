import { sanitizeBdoText } from "./bdo/policy";

export type TenantAiPolicy = "bdo" | "exportunity" | "none";

type TenantAiPolicyInput = {
  tenantKey?: unknown;
  companyName?: unknown;
  companyContext?: unknown;
};

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function resolveTenantAiPolicy(input: TenantAiPolicyInput): TenantAiPolicy {
  const tenantKey = normalized(input.tenantKey);
  if (tenantKey === "bdo") return "bdo";
  if (tenantKey === "exportunity") return "exportunity";

  const companyName = String(input.companyName || "").trim();
  const companyContext = String(input.companyContext || "").trim();
  if (/bourse\s+de\s+l['’]?or/i.test(companyName) || /bourse\s+de\s+l['’]?or/i.test(companyContext)) {
    return "bdo";
  }
  if (/^exportunity(?:\s+machinery)?$/i.test(companyName) || /\bExportunity\b/i.test(companyContext)) {
    return "exportunity";
  }

  // Shared and unknown contexts must never inherit a tenant-specific policy.
  return "none";
}

export function applyTenantResponsePolicy(response: string, input: TenantAiPolicyInput) {
  const policy = resolveTenantAiPolicy(input);
  if (policy !== "bdo") {
    return { policy, text: response, violated: false, violations: [] as string[] };
  }

  const sanitized = sanitizeBdoText(response);
  return { policy, ...sanitized };
}
