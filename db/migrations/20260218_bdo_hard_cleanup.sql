-- Bourse de l'Or hard cleanup (tenant key = 'bdo')
-- - Remove fake/test partner jewellers (keep only LE RUBIS SERTISSEUR)
-- - Reassign/clear items that point to removed jewellers
-- - Purge all meetings + meeting chats for tenant (Agenda reset)

DO $$
DECLARE
  bdo_tenant_id integer;
  authorized_partner_id uuid;
BEGIN
  SELECT id INTO bdo_tenant_id FROM tenants WHERE key = 'bdo' LIMIT 1;
  IF bdo_tenant_id IS NULL THEN
    RAISE NOTICE '[bdo_hard_cleanup] tenant key=bdo not found; skipping.';
    RETURN;
  END IF;

  -- Ensure the single authorized partner jeweller exists and is active.
  SELECT id
    INTO authorized_partner_id
    FROM partner_jewellers
   WHERE tenant_id = bdo_tenant_id
     AND lower(name) = lower('LE RUBIS SERTISSEUR')
   LIMIT 1;

  IF authorized_partner_id IS NULL THEN
    INSERT INTO partner_jewellers(tenant_id, name, is_active, created_at, updated_at)
    VALUES (bdo_tenant_id, 'LE RUBIS SERTISSEUR', true, now(), now())
    RETURNING id INTO authorized_partner_id;
  ELSE
    UPDATE partner_jewellers
       SET is_active = true,
           updated_at = now()
     WHERE id = authorized_partner_id;
  END IF;

  -- Identify fake/test partner jewellers for deletion (must disappear from UI).
  CREATE TEMP TABLE _bdo_doomed_partner_jewellers(id uuid primary key) ON COMMIT DROP;
  INSERT INTO _bdo_doomed_partner_jewellers(id)
  SELECT id
    FROM partner_jewellers
   WHERE tenant_id = bdo_tenant_id
     AND lower(name) <> lower('LE RUBIS SERTISSEUR');

  -- Remove user mappings to deleted partner jewellers.
  DELETE FROM partner_jeweller_users
   WHERE tenant_id = bdo_tenant_id
     AND partner_jeweller_id IN (SELECT id FROM _bdo_doomed_partner_jewellers);

  -- Reassign legitimately in-production items (ASSIGNED/ENGRAVED/SEALED) to the authorized partner.
  UPDATE stamped_gold_items
     SET current_location_type = 'JEWELLER_PARTNER',
         current_location_id = authorized_partner_id,
         partner_jeweller_id = authorized_partner_id,
         updated_at = now()
   WHERE tenant_id = bdo_tenant_id
     AND (
       current_location_id IN (SELECT id FROM _bdo_doomed_partner_jewellers) OR
       partner_jeweller_id IN (SELECT id FROM _bdo_doomed_partner_jewellers)
     )
     AND status IN ('ASSIGNED', 'ENGRAVED', 'SEALED');

  -- Clear any other items pointing to removed partners back to VAULT/CREATED (do not touch delivered/voided items).
  UPDATE stamped_gold_items
     SET current_location_type = 'VAULT',
         current_location_id = NULL,
         partner_jeweller_id = NULL,
         status = 'CREATED',
         updated_at = now()
   WHERE tenant_id = bdo_tenant_id
     AND (
       current_location_id IN (SELECT id FROM _bdo_doomed_partner_jewellers) OR
       partner_jeweller_id IN (SELECT id FROM _bdo_doomed_partner_jewellers)
     )
     AND status NOT IN ('ASSIGNED', 'ENGRAVED', 'SEALED', 'DELIVERED', 'OPENED_VOID');

  -- Ensure certificates do not reference removed pickup partners.
  UPDATE stamped_gold_certificates
     SET pickup_partner_id = authorized_partner_id
   WHERE tenant_id = bdo_tenant_id
     AND pickup_partner_id IN (SELECT id FROM _bdo_doomed_partner_jewellers);

  -- Delete fake/test partner jewellers.
  DELETE FROM partner_jewellers
   WHERE id IN (SELECT id FROM _bdo_doomed_partner_jewellers);

  -- ==========================================================
  -- Meetings / Agenda purge for tenant (wipe everything)
  -- ==========================================================
  CREATE TEMP TABLE _bdo_meeting_conversation_ids(conversation_id text primary key) ON COMMIT DROP;
  INSERT INTO _bdo_meeting_conversation_ids(conversation_id)
  SELECT conversation_id
    FROM meetings
   WHERE tenant_id = bdo_tenant_id
     AND conversation_id IS NOT NULL;

  -- Delete meeting chat messages first (FK to chat_rooms.conversation_id).
  DELETE FROM messages
   WHERE conversation_id IN (SELECT conversation_id FROM _bdo_meeting_conversation_ids);

  -- Delete meeting chat rooms (room_memberships cascade by room_id).
  DELETE FROM chat_rooms
   WHERE conversation_id IN (SELECT conversation_id FROM _bdo_meeting_conversation_ids);

  -- Purge Meet (self-hosted) session records for tenant.
  DELETE FROM meet_sessions
   WHERE tenant_id = bdo_tenant_id;

  -- Purge Meetings records for tenant (meeting_participants + meeting_decisions cascade).
  DELETE FROM meetings
   WHERE tenant_id = bdo_tenant_id;

  RAISE NOTICE '[bdo_hard_cleanup] complete for tenant_id=%', bdo_tenant_id;
END $$;
