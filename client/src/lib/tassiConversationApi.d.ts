export interface TassiThread {
  id: number;
  assistantDisplayName?: string | null;
  assistantRole?: string | null;
}
export interface TassiMessage {
  id: number;
  senderType: "user" | "assistant" | "system";
  senderName?: string | null;
  content: string;
  createdAt: string;
}
export function conversationQueryKey(tenantId: number, userId: number, threadId?: number): (string | number)[];
export function createTassiConversationApi(request: (url: string, options: RequestInit) => Promise<any>): {
  list(): Promise<{ threads: TassiThread[] }>;
  messages(threadId: number): Promise<{ messages: TassiMessage[] }>;
  send(content: string, threadId?: number | null): Promise<{ thread: TassiThread; assistantMessage?: TassiMessage }>;
};
