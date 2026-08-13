export type ChannelMessageIdentity = {
  id: number | string;
  clientMessageId?: string | null;
  isBackgroundMessage?: boolean;
};

export function mergeChannelMessages<T extends ChannelMessageIdentity>(existing: T[], incoming: T[]) {
  const merged = existing.slice();
  const seenById = new Set(existing.map((message) => `${message.isBackgroundMessage ? "bg" : "chat"}:${String(message.id)}`));
  const indexByClientMessageId = new Map<string, number>();

  for (let index = 0; index < existing.length; index += 1) {
    const message = existing[index];
    const scope = message.isBackgroundMessage ? "bg" : "chat";
    const clientMessageId = typeof message.clientMessageId === "string" ? message.clientMessageId.trim() : "";
    if (clientMessageId) indexByClientMessageId.set(`${scope}:${clientMessageId}`, index);
  }

  for (const message of incoming) {
    const scope = message.isBackgroundMessage ? "bg" : "chat";
    const idKey = `${scope}:${String(message.id)}`;
    if (seenById.has(idKey)) continue;

    const clientMessageId = typeof message.clientMessageId === "string" ? message.clientMessageId.trim() : "";
    const clientMessageKey = clientMessageId ? `${scope}:${clientMessageId}` : "";
    const existingIndex = clientMessageKey ? indexByClientMessageId.get(clientMessageKey) : undefined;

    if (existingIndex != null) {
      merged[existingIndex] = { ...merged[existingIndex], ...message };
      seenById.add(idKey);
      continue;
    }

    seenById.add(idKey);
    merged.push(message);
    if (clientMessageKey) indexByClientMessageId.set(clientMessageKey, merged.length - 1);
  }

  return merged;
}
