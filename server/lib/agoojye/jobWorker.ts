import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeBackgroundJobs,
  agoojyeCrmContacts,
  agoojyeEmailIdentities,
  agoojyeMailMessages,
  agoojyeOutreachApprovals,
  agoojyeSponsorOpportunities,
  agoojyeSuppressionEntries,
  agoojyeTasks,
  tenants,
} from "@db/schema";

import { runMailIndexer } from "../mail/indexer";
import { ensureAgoojiyeHumanMailProfiles, syncAgoojiyeUnifiedInbox } from "./mailBridge";
import { deliverApprovedAgoojiyeOutreach } from "./outreachDelivery";
import {
  classifyAgoojiyeReply,
  isAgoojiyeJobType,
  nextAgoojiyeRetry,
  type AgoojiyeJobType,
} from "./jobPolicy";

export { isAgoojiyeJobType } from "./jobPolicy";

type ClaimedJob = {
  id: number;
  tenantId: number;
  jobType: AgoojiyeJobType;
  attemptCount: number;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  payloadJson: Record<string, unknown>;
};

class PermanentJobError extends Error {}

function truthy(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function integer(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rowsOf<T = any>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

function normalizedEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PermanentJobError("Adresse email invalide.");
  return email;
}

export async function enqueueAgoojiyeJob(input: {
  tenantId: number;
  jobType: AgoojiyeJobType;
  scheduledAt?: Date | null;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  payloadJson?: Record<string, unknown>;
  createdBy?: string | null;
  dedupe?: boolean;
}) {
  if (!isAgoojiyeJobType(input.jobType)) throw new Error("Type de job AGOOJIYE invalide.");
  const tenantId = Number(input.tenantId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) throw new Error("Tenant AGOOJIYE invalide.");

  if (input.dedupe && input.relatedEntityType && input.relatedEntityId) {
    const [existing] = await db
      .select()
      .from(agoojyeBackgroundJobs)
      .where(
        and(
          eq(agoojyeBackgroundJobs.tenantId, tenantId),
          eq(agoojyeBackgroundJobs.jobType, input.jobType),
          eq(agoojyeBackgroundJobs.relatedEntityType, input.relatedEntityType),
          eq(agoojyeBackgroundJobs.relatedEntityId, input.relatedEntityId),
          sql`${agoojyeBackgroundJobs.status} in ('queued', 'running')`,
        ),
      )
      .limit(1);
    if (existing) return existing;
  }

  const now = new Date();
  const [job] = await db
    .insert(agoojyeBackgroundJobs)
    .values({
      tenantId,
      jobType: input.jobType,
      status: "queued",
      attemptCount: 0,
      scheduledAt: input.scheduledAt ?? now,
      startedAt: null,
      completedAt: null,
      error: null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      createdBy: input.createdBy || "system",
      payloadJson: input.payloadJson || {},
      resultJson: {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return job;
}

async function ensureRecurringJob(input: {
  tenantId: number;
  jobType: AgoojiyeJobType;
  minimumIntervalMs: number;
}) {
  const since = new Date(Date.now() - input.minimumIntervalMs);
  const [recent] = await db
    .select({ id: agoojyeBackgroundJobs.id })
    .from(agoojyeBackgroundJobs)
    .where(
      and(
        eq(agoojyeBackgroundJobs.tenantId, input.tenantId),
        eq(agoojyeBackgroundJobs.jobType, input.jobType),
        sql`${agoojyeBackgroundJobs.createdAt} >= ${since}`,
        sql`${agoojyeBackgroundJobs.status} in ('queued', 'running', 'completed')`,
      ),
    )
    .limit(1);
  if (recent) return recent;
  return enqueueAgoojiyeJob({
    tenantId: input.tenantId,
    jobType: input.jobType,
    createdBy: "agoojye-job-scheduler",
    payloadJson: { recurring: true, maxAttempts: 3 },
  });
}

async function ensureRecurringJobs() {
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.key, "agoojye"))
    .limit(1);
  if (!tenant?.id) return;
  await ensureRecurringJob({ tenantId: tenant.id, jobType: "mailbox_health", minimumIntervalMs: 6 * 60 * 60_000 });
  await ensureRecurringJob({ tenantId: tenant.id, jobType: "pipeline_summary", minimumIntervalMs: 24 * 60 * 60_000 });
  await ensureRecurringJob({ tenantId: tenant.id, jobType: "overdue_task_notifications", minimumIntervalMs: 24 * 60 * 60_000 });
}

async function claimDueJobs(maxBatch: number): Promise<ClaimedJob[]> {
  const result = await db.execute(sql`
    with candidates as (
      select jobs.id
      from agoojye_background_jobs jobs
      join tenants tenant on tenant.id = jobs.tenant_id
      where jobs.status = 'queued'
        and lower(tenant.key) = 'agoojye'
        and coalesce(jobs.scheduled_at, jobs.created_at) <= now()
      order by coalesce(jobs.scheduled_at, jobs.created_at), jobs.id
      for update skip locked
      limit ${maxBatch}
    )
    update agoojye_background_jobs jobs
    set status = 'running',
        attempt_count = jobs.attempt_count + 1,
        started_at = now(),
        completed_at = null,
        error = null,
        updated_at = now()
    from candidates
    where jobs.id = candidates.id
    returning jobs.id,
      jobs.tenant_id,
      jobs.job_type,
      jobs.attempt_count,
      jobs.related_entity_type,
      jobs.related_entity_id,
      jobs.payload_json
  `);
  return rowsOf<any>(result).map((row) => ({
    id: Number(row.id),
    tenantId: Number(row.tenant_id),
    jobType: String(row.job_type) as AgoojiyeJobType,
    attemptCount: Number(row.attempt_count || 0),
    relatedEntityType: row.related_entity_type ? String(row.related_entity_type) : null,
    relatedEntityId: row.related_entity_id == null ? null : Number(row.related_entity_id),
    payloadJson: record(row.payload_json),
  }));
}

async function processSuppression(job: ClaimedJob, reason: "hard_bounce" | "spam_complaint" | "explicit_opt_out") {
  const email = normalizedEmail(job.payloadJson.email);
  const now = new Date();
  const [entry] = await db
    .insert(agoojyeSuppressionEntries)
    .values({
      tenantId: job.tenantId,
      email,
      reason,
      source: "background_job",
      status: "active",
      notes: String(job.payloadJson.reason || "").trim().slice(0, 1_000) || null,
      createdBy: "agoojye-job-worker",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [agoojyeSuppressionEntries.tenantId, agoojyeSuppressionEntries.email],
      set: { reason, source: "background_job", status: "active", updatedAt: now },
    })
    .returning();
  await db
    .update(agoojyeCrmContacts)
    .set({ doNotContact: true, updatedAt: now })
    .where(and(eq(agoojyeCrmContacts.tenantId, job.tenantId), eq(agoojyeCrmContacts.email, email)));
  return { suppressed: true, email, suppressionId: entry?.id ?? null, reason };
}

async function shouldStopFollowUp(job: ClaimedJob, approvalId: number) {
  const [approval] = await db
    .select()
    .from(agoojyeOutreachApprovals)
    .where(and(eq(agoojyeOutreachApprovals.tenantId, job.tenantId), eq(agoojyeOutreachApprovals.id, approvalId)))
    .limit(1);
  if (!approval) throw new PermanentJobError("Approbation de suivi introuvable.");
  if (!approval.approvedAt) throw new PermanentJobError("Le suivi ne possede pas d'approbation humaine.");

  const [contact] = approval.contactId
    ? await db
        .select()
        .from(agoojyeCrmContacts)
        .where(and(eq(agoojyeCrmContacts.tenantId, job.tenantId), eq(agoojyeCrmContacts.id, approval.contactId)))
        .limit(1)
    : [];
  if (!contact?.email) throw new PermanentJobError("Contact de suivi introuvable.");
  if (contact.doNotContact) return "contact_do_not_contact";

  if (approval.opportunityId) {
    const [opportunity] = await db
      .select()
      .from(agoojyeSponsorOpportunities)
      .where(
        and(
          eq(agoojyeSponsorOpportunities.tenantId, job.tenantId),
          eq(agoojyeSponsorOpportunities.id, approval.opportunityId),
        ),
      )
      .limit(1);
    if (opportunity?.doNotContact) return "opportunity_do_not_contact";
    if (["paused", "won", "lost", "cancelled"].includes(String(opportunity?.status || "").toLowerCase())) {
      return `opportunity_${opportunity?.status}`;
    }
  }

  const [suppression] = await db
    .select({ id: agoojyeSuppressionEntries.id })
    .from(agoojyeSuppressionEntries)
    .where(
      and(
        eq(agoojyeSuppressionEntries.tenantId, job.tenantId),
        eq(agoojyeSuppressionEntries.email, contact.email.toLowerCase()),
        eq(agoojyeSuppressionEntries.status, "active"),
      ),
    )
    .limit(1);
  if (suppression) return "suppressed";

  const [reply] = await db
    .select({ id: agoojyeMailMessages.id })
    .from(agoojyeMailMessages)
    .where(
      and(
        eq(agoojyeMailMessages.tenantId, job.tenantId),
        eq(agoojyeMailMessages.direction, "inbound"),
        eq(agoojyeMailMessages.fromEmail, contact.email.toLowerCase()),
        sql`coalesce(${agoojyeMailMessages.receivedAt}, ${agoojyeMailMessages.createdAt}) >= ${approval.createdAt}`,
      ),
    )
    .orderBy(desc(agoojyeMailMessages.createdAt))
    .limit(1);
  if (reply) return "recipient_replied";
  return null;
}

async function executeJob(job: ClaimedJob): Promise<Record<string, unknown>> {
  if (!isAgoojiyeJobType(job.jobType)) throw new PermanentJobError(`Type de job non pris en charge: ${job.jobType}`);

  if (job.jobType === "mail_sync") {
    const profiles = await ensureAgoojiyeHumanMailProfiles(job.tenantId);
    const indexed = await runMailIndexer({ tenantId: job.tenantId, agentKey: null, limitPerMailbox: 500 });
    const mirrored = await syncAgoojiyeUnifiedInbox(job.tenantId);
    return { profiles, indexed: indexed.indexed, skipped: indexed.skipped, mirrored };
  }

  if (job.jobType === "mailbox_health") {
    await ensureAgoojiyeHumanMailProfiles(job.tenantId);
    const identities = await db
      .select({ status: agoojyeEmailIdentities.status, canSend: agoojyeEmailIdentities.canSend })
      .from(agoojyeEmailIdentities)
      .where(eq(agoojyeEmailIdentities.tenantId, job.tenantId));
    return {
      identities: identities.length,
      active: identities.filter((identity) => identity.status === "active").length,
      sendEnabled: identities.filter((identity) => identity.status === "active" && identity.canSend).length,
    };
  }

  if (job.jobType === "scheduled_send" || job.jobType === "follow_up") {
    const approvalId = Number(job.payloadJson.approvalId || job.relatedEntityId || 0);
    if (!Number.isFinite(approvalId) || approvalId <= 0) throw new PermanentJobError("approvalId manquant.");
    if (job.jobType === "follow_up") {
      const stopReason = await shouldStopFollowUp(job, approvalId);
      if (stopReason) return { sent: false, stopped: true, stopReason, approvalId };
    }
    const delivered = await deliverApprovedAgoojiyeOutreach({
      tenantId: job.tenantId,
      approvalId,
      actor: "agoojye-job-worker",
      actorUserId: null,
    });
    return { sent: true, approvalId, delivery: delivered.delivery };
  }

  if (job.jobType === "bounce_processing") return processSuppression(job, "hard_bounce");
  if (job.jobType === "complaint_processing") return processSuppression(job, "spam_complaint");

  if (job.jobType === "reply_classification") {
    const messageId = Number(job.payloadJson.messageId || job.relatedEntityId || 0);
    if (!Number.isFinite(messageId) || messageId <= 0) throw new PermanentJobError("messageId manquant.");
    const [message] = await db
      .select()
      .from(agoojyeMailMessages)
      .where(and(eq(agoojyeMailMessages.tenantId, job.tenantId), eq(agoojyeMailMessages.id, messageId)))
      .limit(1);
    if (!message) throw new PermanentJobError("Message entrant introuvable.");
    if (message.direction !== "inbound") throw new PermanentJobError("Seuls les messages entrants peuvent etre classes.");
    const classification = classifyAgoojiyeReply(message.bodyText || message.bodyPreview || message.subject);
    if (classification.classification === "opt_out" && message.fromEmail) {
      await processSuppression({ ...job, payloadJson: { email: message.fromEmail, reason: "Opt-out detecte dans la reponse." } }, "explicit_opt_out");
    }
    return { messageId, ...classification };
  }

  if (job.jobType === "pipeline_summary") {
    const result = await db.execute(sql`
      select
        (select count(*)::int from agoojye_sponsor_opportunities where tenant_id = ${job.tenantId} and status = 'active') as active_opportunities,
        (select count(*)::int from agoojye_outreach_approvals where tenant_id = ${job.tenantId} and status = 'awaiting_approval') as awaiting_approval,
        (select count(*)::int from agoojye_crm_contacts where tenant_id = ${job.tenantId} and verification_status not in ('verified', 'approved')) as contacts_to_verify,
        (select count(*)::int from agoojye_tasks where tenant_id = ${job.tenantId} and status not in ('completed', 'cancelled') and due_date < now()) as overdue_tasks
    `);
    return record(rowsOf(result)[0]);
  }

  if (job.jobType === "overdue_task_notifications") {
    const tasks = await db
      .select({ id: agoojyeTasks.id, title: agoojyeTasks.title, assignedTo: agoojyeTasks.assignedTo, dueDate: agoojyeTasks.dueDate })
      .from(agoojyeTasks)
      .where(
        and(
          eq(agoojyeTasks.tenantId, job.tenantId),
          sql`${agoojyeTasks.status} not in ('completed', 'cancelled')`,
          sql`${agoojyeTasks.dueDate} < now()`,
        ),
      )
      .limit(100);
    return { overdueCount: tasks.length, taskIds: tasks.map((task) => task.id), notificationAdapter: "not_configured" };
  }

  if (job.jobType === "webhook_processing") {
    const eventType = String(job.payloadJson.eventType || "").trim();
    if (!eventType) throw new PermanentJobError("eventType manquant dans le webhook.");
    return { accepted: true, eventType, normalizedAt: new Date().toISOString() };
  }

  if (job.jobType === "attachment_processing") {
    throw new PermanentJobError("Le scanner antivirus externe n'est pas configure; la piece jointe reste bloquee.");
  }

  throw new PermanentJobError(`Aucun processeur pour ${job.jobType}.`);
}

async function finishJob(job: ClaimedJob, resultJson: Record<string, unknown>) {
  const now = new Date();
  await db
    .update(agoojyeBackgroundJobs)
    .set({ status: "completed", completedAt: now, error: null, resultJson, updatedAt: now })
    .where(and(eq(agoojyeBackgroundJobs.id, job.id), eq(agoojyeBackgroundJobs.status, "running")));
}

async function failJob(job: ClaimedJob, error: unknown) {
  const message = String((error as any)?.message || error || "Job failed").trim().slice(0, 2_000);
  const maxAttempts = integer(job.payloadJson.maxAttempts, 1, 10, 3);
  const permanent = error instanceof PermanentJobError || /suppression|ne pas contacter|invalide|introuvable|manquant/i.test(message);
  const deadLetter = permanent || job.attemptCount >= maxAttempts;
  const now = new Date();
  await db
    .update(agoojyeBackgroundJobs)
    .set({
      status: deadLetter ? "dead_letter" : "queued",
      scheduledAt: deadLetter ? null : nextAgoojiyeRetry(job.attemptCount, now),
      completedAt: deadLetter ? now : null,
      error: message,
      resultJson: { permanent, maxAttempts },
      updatedAt: now,
    })
    .where(and(eq(agoojyeBackgroundJobs.id, job.id), eq(agoojyeBackgroundJobs.status, "running")));
}

export async function runAgoojiyeJobWorkerOnce(maxBatch = 5) {
  const jobs = await claimDueJobs(integer(maxBatch, 1, 25, 5));
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      // Deliberately sequential: outbound limits apply per mailbox and every job remains auditable.
      // eslint-disable-next-line no-await-in-loop
      const result = await executeJob(job);
      // eslint-disable-next-line no-await-in-loop
      await finishJob(job, result);
      completed += 1;
    } catch (error) {
      // eslint-disable-next-line no-await-in-loop
      await failJob(job, error);
      failed += 1;
    }
  }
  return { claimed: jobs.length, completed, failed };
}

async function recoverStaleJobs() {
  await db.execute(sql`
    update agoojye_background_jobs
    set status = case when attempt_count >= 3 then 'dead_letter' else 'queued' end,
        scheduled_at = case when attempt_count >= 3 then null else now() end,
        completed_at = case when attempt_count >= 3 then now() else null end,
        error = coalesce(error, 'Execution interrompue; job recupere apres redemarrage.'),
        updated_at = now()
    where status = 'running'
      and started_at < now() - interval '15 minutes'
      and exists (
        select 1 from tenants tenant
        where tenant.id = agoojye_background_jobs.tenant_id
          and lower(tenant.key) = 'agoojye'
      )
  `);
}

export function startAgoojiyeJobWorkerScheduler() {
  const deployTenant = String(process.env.DEPLOY_TENANT || process.env.TENANT_DEFAULT || "").trim().toLowerCase();
  const enabled = truthy(process.env.AGOOJIYE_JOB_WORKER_ENABLED) && ["agoojye", "agoojiye"].includes(deployTenant);
  if (!enabled) return null;

  const intervalMs = integer(process.env.AGOOJIYE_JOB_WORKER_INTERVAL_MS, 5_000, 15 * 60_000, 30_000);
  const maxBatch = integer(process.env.AGOOJIYE_JOB_WORKER_MAX_BATCH, 1, 25, 5);
  let running = false;

  const runOnce = async () => {
    if (running) return;
    running = true;
    try {
      await ensureRecurringJobs();
      const result = await runAgoojiyeJobWorkerOnce(maxBatch);
      if (result.claimed > 0) {
        console.log(`[agoojye:jobs] claimed=${result.claimed} completed=${result.completed} failed=${result.failed}`);
      }
    } catch (error: any) {
      console.warn(`[agoojye:jobs] worker failed: ${String(error?.message || error || "unknown_error")}`);
    } finally {
      running = false;
    }
  };

  void recoverStaleJobs().then(() => runOnce()).catch((error: any) => {
    console.warn(`[agoojye:jobs] stale recovery failed: ${String(error?.message || error || "unknown_error")}`);
  });
  const timer = setInterval(() => void runOnce(), intervalMs);
  return { intervalMs, maxBatch, stop: () => clearInterval(timer), runOnce };
}
