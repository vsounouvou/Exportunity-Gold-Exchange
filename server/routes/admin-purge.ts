import { Router } from "express";
import { db } from "@db";
import { chatRooms, meetings, meetSessions, messages } from "@db/schema";
import { eq, inArray } from "drizzle-orm";
import { ensureTenantAdmin } from "./utils/auth";

const router = Router();

router.use(ensureTenantAdmin);

router.post("/meetings", async (req: any, res) => {
  try {
    const tenantId = Number(req?.tenant?.id);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });

    const confirm = String(req.body?.confirm ?? "").trim();
    if (confirm !== "PURGE_MEETINGS") {
      return res.status(400).json({
        message: 'Confirmation required. Provide body: { "confirm": "PURGE_MEETINGS" }',
      });
    }

    const meetingRows = await db
      .select({ id: meetings.id, conversationId: meetings.conversationId })
      .from(meetings)
      .where(eq(meetings.tenantId, tenantId));

    const conversationIds = meetingRows
      .map((row) => String(row.conversationId || "").trim())
      .filter((value) => value.length > 0);

    let deletedMessages = 0;
    let deletedChatRooms = 0;
    let deletedMeetings = 0;
    let deletedMeetSessions = 0;

    if (conversationIds.length) {
      deletedMessages = (
        await db.delete(messages).where(inArray(messages.conversationId, conversationIds)).returning({ id: messages.id })
      ).length;

      deletedChatRooms = (
        await db
          .delete(chatRooms)
          .where(inArray(chatRooms.conversationId, conversationIds))
          .returning({ id: chatRooms.id })
      ).length;
    }

    deletedMeetings = (
      await db.delete(meetings).where(eq(meetings.tenantId, tenantId)).returning({ id: meetings.id })
    ).length;

    deletedMeetSessions = (
      await db.delete(meetSessions).where(eq(meetSessions.tenantId, tenantId)).returning({ id: meetSessions.id })
    ).length;

    return res.json({
      ok: true,
      tenantId,
      conversationIds: conversationIds.length,
      deleted: {
        messages: deletedMessages,
        chatRooms: deletedChatRooms,
        meetings: deletedMeetings,
        meetSessions: deletedMeetSessions,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "purge failed" });
  }
});

export default router;

