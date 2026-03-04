export type AiConsentPlan = {
  what: string;
  why: string;
  forHowLong: string;
  resources: readonly string[];
  howToAuthorize: readonly string[];
  howToStop?: readonly string[];
  visibility?: string;
};

export class AiConsentRequiredError extends Error {
  status: number;
  plan: AiConsentPlan;

  constructor(plan: AiConsentPlan) {
    super("AI consent required");
    this.name = "AiConsentRequiredError";
    this.status = 428; // Precondition Required
    this.plan = plan;
  }
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

let runtimeAiBackgroundEnabledUntilMs: number | null = null;

export function enableAiBackgroundRuntime(durationMs: number) {
  const ms = Number(durationMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    runtimeAiBackgroundEnabledUntilMs = null;
    return { ok: true as const, enabled: false as const, until: null as string | null };
  }
  runtimeAiBackgroundEnabledUntilMs = Date.now() + Math.trunc(ms);
  return { ok: true as const, enabled: true as const, until: new Date(runtimeAiBackgroundEnabledUntilMs).toISOString() };
}

export function disableAiBackgroundRuntime() {
  runtimeAiBackgroundEnabledUntilMs = null;
  return { ok: true as const };
}

export function getAiBackgroundRuntimeOverride() {
  if (runtimeAiBackgroundEnabledUntilMs == null) return { enabled: false as const, until: null as string | null };
  if (Date.now() > runtimeAiBackgroundEnabledUntilMs) {
    runtimeAiBackgroundEnabledUntilMs = null;
    return { enabled: false as const, until: null as string | null };
  }
  return { enabled: true as const, until: new Date(runtimeAiBackgroundEnabledUntilMs).toISOString() };
}

export function isAiEnabled() {
  return parseBooleanEnv(process.env.AI_ENABLED, false);
}

export function isAiBackgroundEnabled() {
  const envEnabled = parseBooleanEnv(process.env.AI_BACKGROUND_ENABLED, false);
  if (envEnabled) return true;
  return getAiBackgroundRuntimeOverride().enabled;
}

export function isCfoAgentEnabled() {
  return parseBooleanEnv(process.env.AI_CFO_AGENT_ENABLED, false);
}

export function assertAiEnabled(plan?: Partial<AiConsentPlan>) {
  if (isAiEnabled()) return;
  throw new AiConsentRequiredError({
    what: plan?.what ?? "Run AI features",
    why: plan?.why ?? "This action would call an external AI model.",
    forHowLong: plan?.forHowLong ?? "Until the current request completes.",
    resources: plan?.resources ?? ["External AI API calls", "Compute/network usage"],
    howToAuthorize: plan?.howToAuthorize ?? [
      "Set `AI_ENABLED=true` in `.env` (or environment) and restart the server",
      "Or explicitly start the relevant AI process via `/api/ai/*` (if exposed)",
    ],
    howToStop: plan?.howToStop,
    visibility: plan?.visibility ?? "Use `GET /api/ai/status` to see what is running.",
  });
}

export function assertAiBackgroundEnabled(plan?: Partial<AiConsentPlan>) {
  assertAiEnabled(plan);
  if (isAiBackgroundEnabled()) return;
  throw new AiConsentRequiredError({
    what: plan?.what ?? "Run background AI conversations",
    why:
      plan?.why ??
      "This would run periodic AI-driven agent conversations without direct user prompts.",
    forHowLong: plan?.forHowLong ?? "Until explicitly stopped.",
    resources:
      plan?.resources ??
      ["External AI API calls", "Database reads/writes", "Background timers"],
    howToAuthorize: plan?.howToAuthorize ?? [
      "Set `AI_ENABLED=true` and `AI_BACKGROUND_ENABLED=true` and restart the server",
      "Or call `POST /api/ai/background/start` with explicit confirmation",
    ],
    howToStop: plan?.howToStop ?? [
      "Call `POST /api/ai/background/stop`",
      "Or stop the server process",
    ],
    visibility: plan?.visibility ?? "Use `GET /api/ai/status` to see running processes.",
  });
}

export function assertCfoAgentEnabled(plan?: Partial<AiConsentPlan>) {
  if (isCfoAgentEnabled()) return;
  throw new AiConsentRequiredError({
    what: plan?.what ?? "Run CFO agent monitoring loop",
    why:
      plan?.why ??
      "This starts periodic monitoring/automation that runs in the background.",
    forHowLong: plan?.forHowLong ?? "Until explicitly stopped.",
    resources: plan?.resources ?? ["Database reads/writes", "Background timers"],
    howToAuthorize: plan?.howToAuthorize ?? [
      "Set `AI_CFO_AGENT_ENABLED=true` and restart the server",
      "Or call `POST /api/ai/cfo/start` with explicit confirmation",
    ],
    howToStop: plan?.howToStop ?? [
      "Call `POST /api/ai/cfo/stop`",
      "Or stop the server process",
    ],
    visibility: plan?.visibility ?? "Use `GET /api/ai/status` to see running processes.",
  });
}
