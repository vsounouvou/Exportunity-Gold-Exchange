-- Bourse de l'Or meetings/agenda purge (tenant key = 'bdo')
-- Deletes meetings, meet sessions, and their meeting chat rooms/messages.

DO $$
DECLARE
  bdo_tenant_id integer;
BEGIN
  SELECT id INTO bdo_tenant_id FROM tenants WHERE key = 'bdo' LIMIT 1;
  IF bdo_tenant_id IS NULL THEN
    RAISE NOTICE '[bdo_purge_meetings] tenant key=bdo not found; skipping.';
    RETURN;
  END IF;

  CREATE TEMP TABLE _bdo_meeting_conversation_ids(conversation_id text primary key) ON COMMIT DROP;
  INSERT INTO _bdo_meeting_conversation_ids(conversation_id)
  SELECT conversation_id
    FROM meetings
   WHERE tenant_id = bdo_tenant_id
     AND conversation_id IS NOT NULL;

  DELETE FROM messages
   WHERE conversation_id IN (SELECT conversation_id FROM _bdo_meeting_conversation_ids);

  DELETE FROM chat_rooms
   WHERE conversation_id IN (SELECT conversation_id FROM _bdo_meeting_conversation_ids);

  DELETE FROM meet_sessions
   WHERE tenant_id = bdo_tenant_id;

  DELETE FROM meetings
   WHERE tenant_id = bdo_tenant_id;

  RAISE NOTICE '[bdo_purge_meetings] complete for tenant_id=%', bdo_tenant_id;
END $$;

