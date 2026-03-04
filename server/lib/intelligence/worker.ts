import { db } from "@db";
import { intelligenceTasks } from "@db/schema";
import { eq } from "drizzle-orm";
import { getInternalScript } from "../scripts/registry";
import {
  claimQueuedGovernedTask,
  completeGovernedTaskRun,
  failGovernedTaskRun,
  recordIntelligenceAuditEvent,
  recordTaskTokenConsumption,
  releaseGovernedTaskLease,
  verifyTaskWorkflowSignature,
} from "./service";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asPositiveInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export async function runGovernedExecutionWorkerOnce(input?: { workerId?: string; leaseSeconds?: number }) {
  const workerId = String(input?.workerId || process.env.GOVERNED_EXECUTION_WORKER_ID || `governed-worker:${process.pid}`);
  const claimed = await claimQueuedGovernedTask({ workerId, leaseSeconds: input?.leaseSeconds ?? 180 });
  if (!claimed) return { ok: true as const, processed: 0 as const };

  const taskId = Number(claimed.id);
  const tenantId = Number(claimed.tenant_id);

  try {
    const verified = await verifyTaskWorkflowSignature(taskId);
    if (!verified.ok) {
      await failGovernedTaskRun({
        taskId,
        actorType: "EXECUTION",
        actorId: workerId,
        errorCode: "SIGNATURE_INVALID",
        errorMessage: verified.reason,
        payload: { reason: verified.reason },
      });
      return { ok: false as const, processed: 1 as const, id: taskId, error: verified.reason };
    }

    const metadata = asRecord(claimed.metadata);
    const companyId =
      asPositiveInt((metadata as any).companyId, 0) ||
      asPositiveInt((metadata as any).company_id, 0) ||
      tenantId;
    const executionAgentId = asPositiveInt(claimed.execution_agent_id, 0) || null;

    const stepOutputs: Array<Record<string, unknown>> = [];

    for (const step of verified.workflow.steps) {
      const script = getInternalScript(step.scriptKey);
      if (!script) {
        throw new Error(`UNSUPPORTED_SCRIPT: ${step.scriptKey}. Worker allows internal deterministic scripts only.`);
      }

      const parsedInput = script.inputSchema.parse({
        ...(step.input || {}),
        taskId,
        tenantId,
      });

      const output = await script.run(
        {
          companyId,
          agentId: executionAgentId,
        },
        parsedInput as any,
      );

      const parsedOutput = script.outputSchema.parse(output) as Record<string, unknown>;
      stepOutputs.push({
        stepId: step.stepId,
        scriptKey: step.scriptKey,
        output: parsedOutput,
      });

      await recordTaskTokenConsumption({
        taskId,
        tokensUsed: 1,
        actorTier: "EXECUTION",
        reason: `script_step:${step.scriptKey}`,
      });

      await recordIntelligenceAuditEvent({
        tenantId,
        taskId,
        cronJobId: claimed.cron_job_id ?? null,
        actorType: "EXECUTION",
        actorId: workerId,
        eventType: "SCRIPT_STEP_COMPLETED",
        beforeState: "RUNNING",
        afterState: "RUNNING",
        payload: {
          stepId: step.stepId,
          scriptKey: step.scriptKey,
        },
      });
    }

    const [updatedTask] = await db
      .update(intelligenceTasks)
      .set({
        metadata: {
          ...metadata,
          lastRunBy: workerId,
          lastRunAt: new Date().toISOString(),
          stepOutputs,
        },
        updatedAt: new Date(),
      })
      .where(eq(intelligenceTasks.id, taskId))
      .returning();

    await completeGovernedTaskRun({
      taskId,
      actorType: "EXECUTION",
      actorId: workerId,
      payload: {
        stepsCompleted: stepOutputs.length,
      },
    });

    await recordIntelligenceAuditEvent({
      tenantId,
      taskId,
      cronJobId: claimed.cron_job_id ?? null,
      actorType: "EXECUTION",
      actorId: workerId,
      eventType: "TASK_EXECUTION_COMPLETED",
      beforeState: "RUNNING",
      afterState: "REPORTED",
      payload: {
        stepsCompleted: stepOutputs.length,
      },
    });

    return {
      ok: true as const,
      processed: 1 as const,
      id: taskId,
      task: updatedTask,
      steps: stepOutputs.length,
    };
  } catch (error: any) {
    const message = String(error?.message || error || "task execution failed");
    await failGovernedTaskRun({
      taskId,
      actorType: "EXECUTION",
      actorId: workerId,
      errorCode: "RUN_FAILED",
      errorMessage: message,
      payload: {
        workerId,
      },
    });

    return {
      ok: false as const,
      processed: 1 as const,
      id: taskId,
      error: message,
    };
  } finally {
    await releaseGovernedTaskLease(taskId);
  }
}
