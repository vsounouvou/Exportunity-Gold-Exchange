import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@db";
import { clues } from "@db/schema";
import type { AgentPolicy, AgentOsScope } from "./registry";
import { embedText } from "./openai-gateway";
import { logAgentAuditEvent } from "./audit";

type ClueRow = typeof clues.$inferSelect;

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

function keywordScore(query: string, content: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const c = content.toLowerCase();
  if (c.includes(q)) return 2;

  const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
  if (!tokens.length) return 0;
  let score = 0;
  for (const token of tokens) {
    if (c.includes(token)) score += 1;
  }
  return score / tokens.length;
}

function scopesToConditions(params: {
  scopes: AgentOsScope[];
  agentId?: number | null;
  companyId?: number | null;
  departmentId?: number | null;
  entityId?: string | null;
}) {
  const conditions: any[] = [];

  if (params.scopes.includes("personal") && params.agentId) {
    conditions.push(and(eq(clues.scope, "personal"), eq(clues.agentId, params.agentId)));
  }
  if (params.scopes.includes("department") && params.departmentId) {
    const base = and(eq(clues.scope, "department"), eq(clues.departmentId, params.departmentId));
    conditions.push(params.companyId ? and(base, eq(clues.companyId, params.companyId)) : base);
  }
  if (params.scopes.includes("company") && params.companyId) {
    conditions.push(and(eq(clues.scope, "company"), eq(clues.companyId, params.companyId)));
  }
  if (params.scopes.includes("entity") && params.companyId && params.entityId) {
    conditions.push(and(eq(clues.scope, "entity"), eq(clues.companyId, params.companyId), eq(clues.entityId, params.entityId)));
  }

  return conditions;
}

export async function addClue(params: {
  jobId: string;
  policy: AgentPolicy;
  scope: AgentOsScope;
  type: ClueRow["type"];
  content: string;
  tags?: string[];
  confidence?: number;
  entityId?: string | null;
  expiresAt?: Date | null;
  evidenceRef?: string | null;
  pinned?: boolean;
  embed?: boolean;
}) {
  const startedAt = Date.now();
  const content = params.content.trim().slice(0, 2000);
  let embedding: number[] | null = null;
  let embeddingError: string | null = null;

  if (params.embed) {
    try {
      const embedded = await embedText({
        jobId: params.jobId,
        policy: params.policy,
        input: content,
        purpose: "memory_clue_embedding",
      });
      embedding = embedded.embedding;
    } catch (error) {
      embeddingError = error instanceof Error ? error.message : String(error);
      embedding = null;
    }
  }

  const [row] = await db
    .insert(clues)
    .values({
      scope: params.scope,
      agentId: params.policy.agentId,
      companyId: params.policy.companyId,
      departmentId: params.policy.departmentId,
      entityId: params.entityId ?? null,
      type: params.type,
      content,
      tags: params.tags ?? [],
      confidence: params.confidence !== undefined ? params.confidence.toFixed(2) : "0.50",
      pinned: !!params.pinned,
      expiresAt: params.expiresAt ?? null,
      evidenceRef: params.evidenceRef ?? null,
      embedding,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ clueId: clues.clueId });

  await logAgentAuditEvent({
    jobId: params.jobId,
    agentId: params.policy.agentId,
    actionType: "memory_write",
    status: "ok",
    inputs: { scope: params.scope, type: params.type, tags: params.tags ?? [], embed: !!params.embed, embeddingError },
    outputs: { clueId: row.clueId },
    latencyMs: Date.now() - startedAt,
  });

  return row.clueId;
}

export async function searchClues(params: {
  jobId: string;
  policy: AgentPolicy;
  query: string;
  scopes?: AgentOsScope[];
  entityId?: string | null;
  tags?: string[];
  limit?: number;
  useEmbeddings?: boolean;
}) {
  const startedAt = Date.now();
  const scopes = params.scopes ?? params.policy.memoryScopes;
  const limit = Math.max(1, Math.min(params.limit ?? 8, 25));

  const orScopes = scopesToConditions({
    scopes,
    agentId: params.policy.agentId,
    companyId: params.policy.companyId,
    departmentId: params.policy.departmentId,
    entityId: params.entityId ?? null,
  });

  const where = and(
    orScopes.length ? or(...orScopes) : undefined,
    or(isNull(clues.expiresAt), gt(clues.expiresAt, new Date())),
  );

  const candidates = await db.select().from(clues).where(where).limit(200);

  const useEmbeddings = params.useEmbeddings !== false;
  let queryEmbedding: number[] | null = null;
  let embeddingError: string | null = null;

  if (useEmbeddings) {
    try {
      queryEmbedding = (
        await embedText({
          jobId: params.jobId,
          policy: params.policy,
          input: params.query,
          purpose: "memory_search_query",
        })
      ).embedding;
    } catch (error) {
      embeddingError = error instanceof Error ? error.message : String(error);
      queryEmbedding = null;
    }
  }

  const tagFilter = params.tags?.length ? new Set(params.tags) : null;

  const scored = candidates
    .filter((c) => {
      if (!tagFilter) return true;
      const tags = Array.isArray(c.tags) ? (c.tags as any as string[]) : [];
      return tags.some((t) => tagFilter.has(t));
    })
    .map((c) => {
      const k = keywordScore(params.query, c.content);
      const e =
        queryEmbedding && Array.isArray(c.embedding) && (c.embedding as any as number[]).length === queryEmbedding.length
          ? cosineSimilarity(queryEmbedding, c.embedding as any as number[])
          : 0;
      const score = Math.max(0, 0.55 * e + 0.45 * k);
      return { clue: c, score, keyword: k, embedding: e };
    })
    .sort((a, b) => {
      if (a.clue.pinned !== b.clue.pinned) return a.clue.pinned ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, limit);

  await logAgentAuditEvent({
    jobId: params.jobId,
    agentId: params.policy.agentId,
    actionType: "memory_read",
    status: "ok",
    inputs: { query: params.query, scopes, tags: params.tags ?? [], limit, useEmbeddings, embeddingError },
    outputs: { clueIds: scored.map((s) => s.clue.clueId) },
    latencyMs: Date.now() - startedAt,
  });

  return scored;
}
