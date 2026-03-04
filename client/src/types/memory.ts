import { z } from 'zod';

export const memorySchema = z.object({
  id: z.number(),
  content: z.string(),
  type: z.enum(['conversation', 'task', 'learning', 'decision', 'file', 'document']),
  importance: z.number().default(0.5),
  timestamp: z.string(),
  agentId: z.number().optional(),
  metadata: z.record(z.any()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Memory = z.infer<typeof memorySchema>;
export type MemoryType = Memory['type'];