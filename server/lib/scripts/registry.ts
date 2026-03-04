import { z } from "zod";
import { db } from "@db";
import { tasks, knowledgeDocuments, knowledgeSpaces } from "@db/schema";
import { and, eq } from "drizzle-orm";

export type ScriptExecutionMode = "script" | "rules" | "llm_assist" | "hybrid";

export type ScriptRunContext = {
  companyId: number;
  agentId?: number | null;
};

export type ScriptDefinition<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> = {
  scriptKey: string;
  name: string;
  description: string;
  version: string;
  executionMode: ScriptExecutionMode;
  inputSchema: TInput;
  outputSchema: TOutput;
  run: (ctx: ScriptRunContext, input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
};

const tasksSetStatusInput = z.object({
  taskId: z.number().int().positive(),
  status: z.enum(["backlog", "in_progress", "blocked", "done", "canceled", "pending", "completed"]),
});

const tasksSetStatusOutput = z.object({
  taskId: z.number().int().positive(),
  status: z.string(),
});

const kbCreateNoteInput = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  spaceName: z.string().min(1).max(80).optional().default("Operations"),
  tags: z.array(z.string().min(1).max(40)).optional().default([]),
});

const kbCreateNoteOutput = z.object({
  documentId: z.number().int().positive(),
  spaceId: z.number().int().positive(),
});

export const INTERNAL_SCRIPTS = [
  {
    scriptKey: "tasks.set_status",
    name: "Set task status",
    description: "Deterministically update a task status (no AI).",
    version: "1.0.0",
    executionMode: "script",
    inputSchema: tasksSetStatusInput,
    outputSchema: tasksSetStatusOutput,
    run: async (_ctx, input) => {
      const [updated] = await db
        .update(tasks)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(tasks.id, input.taskId))
        .returning({ id: tasks.id, status: tasks.status });

      if (!updated) throw new Error("Task not found");
      return { taskId: updated.id, status: String(updated.status ?? input.status) };
    },
  } satisfies ScriptDefinition<typeof tasksSetStatusInput, typeof tasksSetStatusOutput>,
  {
    scriptKey: "kb.create_note",
    name: "Create Knowledge Base note",
    description: "Write a note into the company Knowledge Base (no AI).",
    version: "1.0.0",
    executionMode: "script",
    inputSchema: kbCreateNoteInput,
    outputSchema: kbCreateNoteOutput,
    run: async (ctx, input) => {
      const now = new Date();
      let space = await db.query.knowledgeSpaces.findFirst({
        where: and(eq(knowledgeSpaces.companyId, ctx.companyId), eq(knowledgeSpaces.name, input.spaceName)),
      });

      if (!space) {
        const [created] = await db
          .insert(knowledgeSpaces)
          .values({
            companyId: ctx.companyId,
            name: input.spaceName,
            description: `Auto-created space: ${input.spaceName}`,
            color: "blue",
            icon: "book",
            metadata: {},
            createdBy: ctx.agentId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        space = created;
      }

      if (!space) throw new Error("Failed to resolve knowledge space");

      const [doc] = await db
        .insert(knowledgeDocuments)
        .values({
          companyId: ctx.companyId,
          spaceId: space.id,
          title: input.title,
          type: "note",
          content: input.content,
          tags: input.tags,
          metadata: { source: "script", scriptKey: "kb.create_note" },
          createdBy: ctx.agentId ?? null,
          createdByType: ctx.agentId ? "agent" : "human",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: knowledgeDocuments.id });

      return { documentId: doc.id, spaceId: space.id };
    },
  } satisfies ScriptDefinition<typeof kbCreateNoteInput, typeof kbCreateNoteOutput>,
] as const;

export type InternalScript = (typeof INTERNAL_SCRIPTS)[number];

export function getInternalScript(scriptKey: string): InternalScript | undefined {
  return INTERNAL_SCRIPTS.find((script) => script.scriptKey === scriptKey);
}
