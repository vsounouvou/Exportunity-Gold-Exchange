import { resolveApiUrl } from "@/lib/runtimeConfig";

function authHeaders(input?: HeadersInit, formData = false) {
  const headers = new Headers(input);
  const token = localStorage.getItem("ece_session");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!formData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function readError(response: Response) {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.message || `La demande a échoué (${response.status}).`);
}

export async function chatApi<T = any>(path: string, input: RequestInit = {}): Promise<T> {
  const formData = input.body instanceof FormData;
  const response = await fetch(resolveApiUrl(path), {
    ...input,
    headers: authHeaders(input.headers, formData),
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function uploadChatAttachment(channelId: number, file: File | Blob, name?: string) {
  const form = new FormData();
  form.append("file", file, name || (file instanceof File ? file.name : "message-vocal.webm"));
  return chatApi<{ ok: boolean; item: any }>(
    `/api/agoojye/chat/member/channels/${channelId}/attachments`,
    { method: "POST", body: form },
  );
}

type StreamCallbacks = {
  onUserMessage?: (payload: any) => void;
  onStatus?: (payload: any) => void;
  onDelta?: (payload: { text: string }) => void;
  onComplete?: (payload: any) => void;
};

export async function streamAssistantMessage(
  conversationId: string,
  body: { query: string; parentMessageId?: string | null },
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const response = await fetch(
    resolveApiUrl(`/api/agoojye/chat/member/ai/conversations/${conversationId}/stream`),
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: authHeaders(),
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) throw await readError(response);
  if (!response.body) throw new Error("Le flux de réponse n'est pas disponible.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";
  let currentData = "";
  const dispatch = () => {
    if (!currentData) return;
    const payload = JSON.parse(currentData);
    if (currentEvent === "user_message") callbacks.onUserMessage?.(payload);
    if (currentEvent === "status") callbacks.onStatus?.(payload);
    if (currentEvent === "delta") callbacks.onDelta?.(payload);
    if (currentEvent === "complete") callbacks.onComplete?.(payload);
    currentEvent = "message";
    currentData = "";
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line) {
        dispatch();
      } else if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        currentData += line.slice(5).trim();
      }
    }
    if (done) break;
  }
  if (buffer.trim()) currentData += buffer.replace(/^data:\s*/, "");
  dispatch();
}
