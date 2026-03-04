-- Bourse de l'Or partner jewellers cleanup (tenant key = 'bdo')
-- Keeps only: LE RUBIS SERTISSEUR
-- Deletes fake/test jewellers and fixes stamped_gold_items references.

DO $$
DECLARE
  bdo_tenant_id integer;
  authorized_partner_id uuid;
BEGIN
  SELECT id INTO bdo_tenant_id FROM tenants WHERE key = 'bdo' LIMIT 1;
  IF bdo_tenant_id IS NULL THEN
    RAISE NOTICE '[bdo_partner_cleanup] tenant key=bdo not found; skipping.';
    RETURN;
  END IF;

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

  CREATE TEMP TABLE _bdo_doomed_partner_jewellers(id uuid primary key) ON COMMIT DROP;
  INSERT INTO _bdo_doomed_partner_jewellers(id)
  SELECT id
    FROM partner_jewellers
   WHERE tenant_id = bdo_tenant_id
     AND lower(name) <> lower('LE RUBIS SERTISSEUR');

  DELETE FROM partner_jeweller_users
   WHERE tenant_id = bdo_tenant_id
     AND partner_jeweller_id IN (SELECT id FROM _bdo_doomed_partner_jewellers);

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

  UPDATE stamped_gold_certificates
     SET pickup_partner_id = authorized_partner_id
   WHERE tenant_id = bdo_tenant_id
     AND pickup_partner_id IN (SELECT id FROM _bdo_doomed_partner_jewellers);

  DELETE FROM partner_jewellers
   WHERE id IN (SELECT id FROM _bdo_doomed_partner_jewellers);

  RAISE NOTICE '[bdo_partner_cleanup] complete for tenant_id=%', bdo_tenant_id;
END $$;
