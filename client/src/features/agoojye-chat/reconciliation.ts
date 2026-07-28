import type { InfiniteData } from "@tanstack/react-query";

import type { ChatMessage, MessagePagePayload } from "./types";

export function reconcileIncomingMessage(
  data: InfiniteData<MessagePagePayload> | undefined,
  incoming: ChatMessage,
) {
  if (!data) return data;

  let reconciled = false;
  const pages = data.pages.map((page) => {
    const items: ChatMessage[] = [];
    for (const current of page.items) {
      const sameServerMessage = current.id === incoming.id;
      const sameClientMessage = Boolean(
        incoming.clientMessageId &&
          current.clientMessageId === incoming.clientMessageId,
      );
      if (sameServerMessage || sameClientMessage) {
        if (!reconciled) {
          items.push(incoming);
          reconciled = true;
        }
        continue;
      }
      items.push(current);
    }
    return { ...page, items };
  });

  if (!reconciled && pages.length) {
    pages[0] = { ...pages[0], items: [...pages[0].items, incoming] };
  }

  return { ...data, pages };
}
