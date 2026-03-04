import { and, eq } from "drizzle-orm";
import { agents } from "@db/schema";

export type AgentRuntimeEnv = "prod" | "staging" | "dev";
export type AgentLifecycleStatus = "active" | "inactive" | "paused" | "archived";

export function normalizeAgentEnv(raw: unknown): AgentRuntimeEnv {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "production" || value === "prod") return "prod";
  if (value === "staging" || value === "stage") return "staging";
  if (value === "development" || value === "dev") return "dev";
  return "prod";
}

export function resolveAgentRuntimeEnv(): AgentRuntimeEnv {
  return normalizeAgentEnv(process.env.APP_ENV || process.env.NODE_ENV || "prod");
}

export function isProductionAgentRuntime(env: AgentRuntimeEnv) {
  return env === "prod";
}

export function buildVisibleAgentWhereClause(env: AgentRuntimeEnv) {
  return and(
    eq(agents.status, "active"),
    eq(agents.isTest, false),
    eq(agents.isVisible, true),
    eq(agents.env, env),
  );
}

export function shouldTreatAgentAsTest(input: {
  explicitIsTest?: unknown;
  name?: unknown;
  role?: unknown;
  metadata?: unknown;
}) {
  if (Boolean(input.explicitIsTest)) return true;
  const name = String(input.name || "").trim().toLowerCase();
  const role = String(input.role || "").trim().toLowerCase();
  if (name.includes("test") || role.includes("test")) return true;
  const metadata = input.metadata && typeof input.metadata === "object" ? (input.metadata as Record<string, unknown>) : {};
  const metaFlag = String(metadata.test ?? metadata.isTest ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(metaFlag);
}

export function normalizeAgentLifecycleStatus(raw: unknown): AgentLifecycleStatus {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "inactive") return "inactive";
  if (value === "paused") return "paused";
  if (value === "archived") return "archived";
  return "active";
}

export function sanitizeAgentVisibilityInput(input: {
  status?: unknown;
  env?: unknown;
  isTest?: unknown;
  isVisible?: unknown;
  name?: unknown;
  role?: unknown;
  metadata?: unknown;
}) {
  const env = normalizeAgentEnv(input.env);
  const isTest = shouldTreatAgentAsTest({
    explicitIsTest: input.isTest,
    name: input.name,
    role: input.role,
    metadata: input.metadata,
  });
  const requestedStatus = normalizeAgentLifecycleStatus(input.status);
  const requestedVisible = input.isVisible == null ? true : Boolean(input.isVisible);
  const status = isTest ? "archived" : requestedStatus || "active";
  const isVisible = isTest ? false : requestedVisible;
  return { env, isTest, isVisible, status };
}

export function isAgentRunnableStatus(status: unknown) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "active" || normalized === "testing";
}
