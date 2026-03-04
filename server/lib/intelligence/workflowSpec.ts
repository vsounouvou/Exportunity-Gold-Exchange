import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const workflowStepSchema = z.object({
  stepId: z.string().trim().min(1).max(120),
  scriptKey: z.string().trim().min(1).max(200),
  input: jsonRecordSchema.default({}),
  expectedOutput: jsonRecordSchema.optional(),
  onFailure: z.enum(["STOP", "RETRY", "ESCALATE"]).default("STOP"),
  retries: z.number().int().min(0).max(10).default(0),
});

export const workflowSpecSchema = z.object({
  version: z.literal("1.0"),
  workflowId: z.string().trim().min(3).max(120),
  tenantId: z.number().int().positive(),
  moduleId: z.string().trim().min(1).max(120),
  managerTier: z.enum(["SUPER", "MANAGER"]).default("MANAGER"),
  executionTier: z.literal("EXECUTION").default("EXECUTION"),
  metadata: jsonRecordSchema.default({}),
  steps: z.array(workflowStepSchema).min(1).max(25),
});

export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowSpec = z.infer<typeof workflowSpecSchema>;

export function parseWorkflowSpec(input: unknown): WorkflowSpec {
  const parsed = workflowSpecSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") || "root";
    const message = issue?.message || "invalid workflow spec";
    throw new Error(`INVALID_WORKFLOW_SPEC: ${path} ${message}`);
  }
  return parsed.data;
}
