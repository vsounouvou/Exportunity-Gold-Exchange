export type IntelligenceTier = "SUPER" | "MANAGER" | "EXECUTION";
export type IntelligenceCronKind = "TIME" | "EVENT" | "MONITOR" | "REGENERATION";

export type PolicyDefaults = {
  tier: IntelligenceTier;
  maxContext: number;
  maxReasoningDepth: number;
  maxTokenBudgetPerTask: number;
  maxTasksPerHour: number;
  allowCrossTenant: boolean;
  allowLlm: boolean;
};

export const DEFAULT_POLICY_MATRIX: PolicyDefaults[] = [
  {
    tier: "SUPER",
    maxContext: -1,
    maxReasoningDepth: 10,
    maxTokenBudgetPerTask: -1,
    maxTasksPerHour: -1,
    allowCrossTenant: true,
    allowLlm: true,
  },
  {
    tier: "MANAGER",
    maxContext: 16000,
    maxReasoningDepth: 5,
    maxTokenBudgetPerTask: 8000,
    maxTasksPerHour: 40,
    allowCrossTenant: false,
    allowLlm: true,
  },
  {
    tier: "EXECUTION",
    maxContext: 1200,
    maxReasoningDepth: 1,
    maxTokenBudgetPerTask: 300,
    maxTasksPerHour: 500,
    allowCrossTenant: false,
    allowLlm: false,
  },
];

export type WorkerRouteDefault = {
  modulePattern: string;
  cronKind: IntelligenceCronKind;
  preferredQueue: string;
  preferredTier: IntelligenceTier;
  concurrencyLimit: number;
  maxRetry: number;
};

export const DEFAULT_WORKER_ROUTES: WorkerRouteDefault[] = [
  {
    modulePattern: "gold.*",
    cronKind: "TIME",
    preferredQueue: "execution-gold",
    preferredTier: "EXECUTION",
    concurrencyLimit: 8,
    maxRetry: 4,
  },
  {
    modulePattern: "wallet.*",
    cronKind: "EVENT",
    preferredQueue: "execution-wallet",
    preferredTier: "EXECUTION",
    concurrencyLimit: 10,
    maxRetry: 5,
  },
  {
    modulePattern: "tenant.monitor.*",
    cronKind: "MONITOR",
    preferredQueue: "monitoring",
    preferredTier: "MANAGER",
    concurrencyLimit: 4,
    maxRetry: 2,
  },
  {
    modulePattern: "rebuild.*",
    cronKind: "REGENERATION",
    preferredQueue: "regeneration",
    preferredTier: "EXECUTION",
    concurrencyLimit: 6,
    maxRetry: 3,
  },
];

export function parseIntelligenceTier(value: unknown, fallback: IntelligenceTier = "EXECUTION"): IntelligenceTier {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "SUPER" || normalized === "MANAGER" || normalized === "EXECUTION") return normalized;
  return fallback;
}

export function parseIntelligenceCronKind(value: unknown, fallback: IntelligenceCronKind = "TIME"): IntelligenceCronKind {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "TIME" || normalized === "EVENT" || normalized === "MONITOR" || normalized === "REGENERATION") {
    return normalized;
  }
  return fallback;
}
