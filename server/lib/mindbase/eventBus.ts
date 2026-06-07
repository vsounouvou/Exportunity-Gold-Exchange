import { db } from "@db";
import { mindbaseBrainEvents, mindbaseEvents } from "@db/schema";

export async function emitMindbaseEvent(input: {
  tenantId: number;
  organizationId: string;
  eventType: string;
  workspaceId?: string | null;
  actorUserId?: number | null;
  payload?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(mindbaseEvents)
    .values({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId || null,
      actorUserId: input.actorUserId || null,
      eventType: input.eventType,
      payload: input.payload || {},
      status: "pending",
      createdAt: new Date(),
    })
    .returning();
  return row;
}

export async function recordMindbaseBrainEvent(input: {
  tenantId: number;
  organizationId: string;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(mindbaseBrainEvents)
    .values({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      eventType: input.eventType,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      payload: input.payload || {},
      createdAt: new Date(),
    })
    .returning();
  return row;
}
