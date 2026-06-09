export type MindbaseLlmTier = "none" | "cheap" | "medium" | "premium";

export type MindbaseLlmRouteInput = {
  taskType?: string | null;
  complexity?: "low" | "medium" | "high" | null;
  confidence?: number | null;
  budgetRemainingUsd?: number | null;
  riskLevel?: "low" | "medium" | "high" | null;
  userTier?: "starter" | "growth" | "enterprise" | null;
};

export function routeMindbaseLlm(input: MindbaseLlmRouteInput): MindbaseLlmTier {
  const taskType = String(input.taskType || "").trim().toLowerCase();
  const complexity = String(input.complexity || "low").trim().toLowerCase();
  const confidence = Number.isFinite(input.confidence) ? Number(input.confidence) : 1;
  const budgetRemainingUsd = Number.isFinite(input.budgetRemainingUsd) ? Number(input.budgetRemainingUsd) : 0;
  const riskLevel = String(input.riskLevel || "low").trim().toLowerCase();
  const userTier = String(input.userTier || "starter").trim().toLowerCase();

  if (
    taskType === "classification" ||
    taskType === "routing" ||
    taskType === "dedupe" ||
    taskType === "known_action"
  ) {
    return confidence >= 0.9 ? "none" : "cheap";
  }

  if (riskLevel === "high" || complexity === "high") {
    if (budgetRemainingUsd >= 5 || userTier === "enterprise") return "premium";
    return "medium";
  }

  if (taskType === "draft_reply" || taskType === "summary" || complexity === "medium") {
    return budgetRemainingUsd >= 1 ? "medium" : "cheap";
  }

  if (confidence < 0.6) return "cheap";
  return "none";
}
