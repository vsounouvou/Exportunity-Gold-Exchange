import { eq, desc } from "drizzle-orm";
import { db } from "@db";
import { memories } from "@db/schema";
import type { Memory } from "@db/schema";
import OpenAI from "openai";

interface MemoryMetadata {
  merged_with?: number;
  merged_at?: string;
  merged_into?: number;
  compressed_at?: string;
  original_length?: number;
  compressed_length?: number;
  [key: string]: any;
}

type MemoryDataShape = {
  agentId?: number;
  content?: string;
  importance?: number;
  metadata?: MemoryMetadata;
  [key: string]: any;
};

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function getMemoryData(memory: Memory): MemoryDataShape {
  const data = (memory.data as any) || {};
  return typeof data === "object" && data ? data : {};
}

function getMemoryContent(memory: Memory): string {
  const data = getMemoryData(memory);
  return String(data.content ?? "");
}

function getMemoryImportance(memory: Memory): number {
  const data = getMemoryData(memory);
  const value = Number(data.importance);
  return Number.isFinite(value) ? value : 0.5;
}

function setMemoryData(memory: Memory, patch: Partial<MemoryDataShape>): MemoryDataShape {
  const data = getMemoryData(memory);
  return { ...data, ...patch };
}

/**
 * Compresses memory content using OpenAI to generate a concise summary.
 */
export async function compressMemoryContent(content: string): Promise<string> {
  if (!openai) return content;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "You are a highly efficient memory compression system. Compress the text while preserving essential meaning and key details. Remove redundancy.",
        },
        {
          role: "user",
          content: `Please compress and summarize the following text while maintaining its essential meaning and key information: ${content}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    return response.choices[0]?.message?.content || content;
  } catch (error) {
    console.error("Error compressing memory content:", error);
    return content;
  }
}

/**
 * Calculates semantic similarity between two memories using OpenAI embeddings.
 */
export async function calculateSimilarity(memory1: Memory, memory2: Memory): Promise<number> {
  if (!openai) return 0;

  try {
    const content1 = getMemoryContent(memory1);
    const content2 = getMemoryContent(memory2);
    if (!content1 || !content2) return 0;

    const [embedding1, embedding2] = await Promise.all([
      openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: content1,
      }),
      openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: content2,
      }),
    ]);

    return cosineSimilarity(embedding1.data[0].embedding, embedding2.data[0].embedding);
  } catch (error) {
    console.error("Error calculating memory similarity:", error);
    return 0;
  }
}

function cosineSimilarity(vector1: number[], vector2: number[]): number {
  const dotProduct = vector1.reduce((acc, val, i) => acc + val * vector2[i], 0);
  const magnitude1 = Math.sqrt(vector1.reduce((acc, val) => acc + val * val, 0));
  const magnitude2 = Math.sqrt(vector2.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Merges similar memories for an agent by reading/writing `memories.data`.
 */
export async function mergeSimilarMemories(agentId: number, similarityThreshold: number = 0.85): Promise<void> {
  console.log(`[Memory] Starting memory merge for agent ${agentId} with threshold ${similarityThreshold}`);
  try {
    const allMemories = await db.select().from(memories).orderBy(desc(memories.id));
    const agentMemories = allMemories
      .filter((m) => Number(getMemoryData(m).agentId) === agentId)
      .sort((a, b) => getMemoryImportance(b) - getMemoryImportance(a));

    console.log(`[Memory] Found ${agentMemories.length} memories to process`);

    for (let i = 0; i < agentMemories.length; i++) {
      for (let j = i + 1; j < agentMemories.length; j++) {
        const similarity = await calculateSimilarity(agentMemories[i], agentMemories[j]);
        if (similarity <= similarityThreshold) continue;

        const mergedContent = await compressMemoryContent(
          `${getMemoryContent(agentMemories[i])}\n${getMemoryContent(agentMemories[j])}`
        );

        const baseImportance = Math.max(getMemoryImportance(agentMemories[i]), getMemoryImportance(agentMemories[j]));

        const leftData = getMemoryData(agentMemories[i]);
        const rightData = getMemoryData(agentMemories[j]);

        await db.update(memories).set({
          data: {
            ...leftData,
            content: mergedContent,
            importance: baseImportance + 0.1,
            metadata: {
              ...(leftData.metadata || {}),
              merged_with: agentMemories[j].id,
              merged_at: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        }).where(eq(memories.id, agentMemories[i].id));

        await db.update(memories).set({
          data: {
            ...rightData,
            metadata: {
              ...(rightData.metadata || {}),
              merged_into: agentMemories[i].id,
              merged_at: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        }).where(eq(memories.id, agentMemories[j].id));
      }
    }

    console.log(`[Memory] Successfully completed memory merge for agent ${agentId}`);
  } catch (error) {
    console.error("[Memory] Error merging memories:", error);
    throw error;
  }
}

/**
 * Compress long memories for an agent by reading/writing `memories.data`.
 */
export async function compressLongMemories(agentId: number, lengthThreshold: number = 500): Promise<void> {
  console.log(`[Memory] Starting long memory compression for agent ${agentId}`);
  try {
    const allMemories = await db.select().from(memories).orderBy(desc(memories.id));
    const longMemories = allMemories.filter((m) => {
      const data = getMemoryData(m);
      if (Number(data.agentId) !== agentId) return false;
      if (getMemoryImportance(m) >= 0.8) return false;
      return getMemoryContent(m).length > lengthThreshold;
    });

    console.log(`[Memory] Found ${longMemories.length} memories to process`);

    for (const memory of longMemories) {
      const originalContent = getMemoryContent(memory);
      const compressedContent = await compressMemoryContent(originalContent);
      const data = getMemoryData(memory);

      await db.update(memories).set({
        data: setMemoryData(memory, {
          content: compressedContent,
          metadata: {
            ...(data.metadata || {}),
            compressed_at: new Date().toISOString(),
            original_length: originalContent.length,
            compressed_length: compressedContent.length,
          },
        }),
        updatedAt: new Date(),
      }).where(eq(memories.id, memory.id));
    }

    console.log(`[Memory] Successfully completed long memory compression for agent ${agentId}`);
  } catch (error) {
    console.error("[Memory] Error compressing long memories:", error);
    throw error;
  }
}

