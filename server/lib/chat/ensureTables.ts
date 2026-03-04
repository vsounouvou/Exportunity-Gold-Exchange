import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureChatMessageIdempotencyColumns() {
  await db.execute(sql`alter table messages add column if not exists client_message_id text;`);
  await db.execute(sql`alter table messages add column if not exists in_reply_to_client_message_id text;`);

  await db.execute(sql`
    create unique index if not exists messages_conversation_client_message_id_unique
      on messages (conversation_id, client_message_id);
  `);

  await db.execute(sql`
    create unique index if not exists messages_conversation_in_reply_to_client_message_id_from_agent_unique
      on messages (conversation_id, in_reply_to_client_message_id, from_agent_id);
  `);

  await db.execute(sql`
    create index if not exists messages_conversation_in_reply_to_client_message_id_idx
      on messages (conversation_id, in_reply_to_client_message_id, created_at desc);
  `);
}

