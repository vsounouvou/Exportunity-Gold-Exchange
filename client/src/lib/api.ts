import type { Agent, Message } from "@db/schema";

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface CreateAgentRequest {
  name: string;
  role: string;
  parentId?: number | null;
}

export interface SendMessageRequest {
  content: string;
  fromAgentId: number;
  toAgentId: number;
  type?: string;
  contextId?: string;
}

export type GetAgentsResponse = ApiResponse<Agent[]>;
export type GetMessagesResponse = ApiResponse<Message[]>;