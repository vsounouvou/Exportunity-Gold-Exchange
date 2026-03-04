export const GOVERNED_TASK_STATES = [
  "CREATED",
  "PLANNED",
  "SCRIPTED",
  "QUEUED",
  "RUNNING",
  "VERIFIED",
  "REPORTED",
  "FAILED",
  "CANCELLED",
] as const;

export type GovernedTaskState = (typeof GOVERNED_TASK_STATES)[number];

const NEXT_STATES: Record<GovernedTaskState, GovernedTaskState[]> = {
  CREATED: ["PLANNED", "CANCELLED", "FAILED"],
  PLANNED: ["SCRIPTED", "CANCELLED", "FAILED"],
  SCRIPTED: ["QUEUED", "PLANNED", "CANCELLED", "FAILED"],
  QUEUED: ["RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["VERIFIED", "FAILED", "CANCELLED"],
  VERIFIED: ["REPORTED", "FAILED"],
  REPORTED: [],
  FAILED: ["PLANNED", "QUEUED", "CANCELLED"],
  CANCELLED: ["PLANNED"],
};

export function normalizeGovernedTaskState(value: unknown): GovernedTaskState | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return GOVERNED_TASK_STATES.includes(normalized as GovernedTaskState)
    ? (normalized as GovernedTaskState)
    : null;
}

export function getAllowedGovernedTransitions(fromState: GovernedTaskState): GovernedTaskState[] {
  return [...(NEXT_STATES[fromState] ?? [])];
}

export function canTransitionGovernedTaskState(fromState: GovernedTaskState, toState: GovernedTaskState): boolean {
  const allowed = NEXT_STATES[fromState] ?? [];
  return allowed.includes(toState);
}

export function assertGovernedTaskTransition(fromState: GovernedTaskState, toState: GovernedTaskState) {
  if (canTransitionGovernedTaskState(fromState, toState)) return;
  const allowed = getAllowedGovernedTransitions(fromState);
  throw new Error(
    `INVALID_TASK_TRANSITION: ${fromState} -> ${toState}. Allowed: ${allowed.length ? allowed.join(", ") : "none"}`,
  );
}
