// The existing server remains the authority for every user, tenant and thread.
const headers = Object.freeze({ "x-chairman-admin-override": "1" });

function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError("Invalid conversation identity");
  return id;
}

export function conversationQueryKey(tenantId, userId, threadId = 0) {
  const key = ["tassi-conversation", positiveId(tenantId), positiveId(userId)];
  return threadId ? [...key, positiveId(threadId)] : key;
}

export function createTassiConversationApi(request) {
  if (typeof request !== "function") throw new TypeError("A request implementation is required");
  return {
    // Opening or refreshing the workspace never provisions a thread or an agent.
    list: () => request("/api/assistant/threads?limit=50", { method: "GET", headers }),
    messages: (threadId) => request(
      "/api/assistant/thread/" + positiveId(threadId) + "/messages?limit=200",
      { method: "GET", headers },
    ),
    send: (content, threadId = null) => {
      const text = String(content || "").trim();
      if (!text) throw new TypeError("Message content is required");
      const body = { content: text, ...(threadId == null ? {} : { threadId: positiveId(threadId) }) };
      return request("/api/assistant/message", { method: "POST", headers, body: JSON.stringify(body) });
    },
  };
}
