export type MindbaseAgentRuntimeLimits = {
  maxSteps: number;
  maxRetries: number;
  timeoutMs: number;
  maxCostUsd: number;
};

export const DEFAULT_MINDBASE_AGENT_LIMITS: MindbaseAgentRuntimeLimits = {
  maxSteps: 8,
  maxRetries: 2,
  timeoutMs: 45_000,
  maxCostUsd: 3,
};

export function resolveMindbaseAgentRuntimeLimits(overrides?: Partial<MindbaseAgentRuntimeLimits> | null) {
  return {
    maxSteps: Math.max(1, Number(overrides?.maxSteps ?? DEFAULT_MINDBASE_AGENT_LIMITS.maxSteps)),
    maxRetries: Math.max(0, Number(overrides?.maxRetries ?? DEFAULT_MINDBASE_AGENT_LIMITS.maxRetries)),
    timeoutMs: Math.max(5_000, Number(overrides?.timeoutMs ?? DEFAULT_MINDBASE_AGENT_LIMITS.timeoutMs)),
    maxCostUsd: Math.max(0, Number(overrides?.maxCostUsd ?? DEFAULT_MINDBASE_AGENT_LIMITS.maxCostUsd)),
  } satisfies MindbaseAgentRuntimeLimits;
}
