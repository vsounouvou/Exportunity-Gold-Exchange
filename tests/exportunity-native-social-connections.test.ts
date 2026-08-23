import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("social and advertising schemas retain evidence while binding new work to Exportunity connections", async () => {
  const [schema, migration, ensure, ensureAdvertising] = await Promise.all([
    read("db/schema/territory-media-commerce.ts"),
    read("db/migrations/20270522_exportunity_native_social_connections.sql"),
    read("server/lib/territory-media/ensureTables.ts"),
    read("server/lib/territory-media/ensureAdvertisingTables.ts"),
  ]);

  for (const source of [schema, migration, ensure, ensureAdvertising]) {
    assert.match(source, /exportunity_integration_connection_id/);
    assert.match(source, /exportunity_integration_connections/);
  }
  assert.match(schema, /exportunityIntegrationConnectionId/);
  assert.match(migration, /legacy references remain nullable evidence only/i);
  assert.match(migration, /No legacy row is rebound automatically/i);
  assert.doesNotMatch(migration, /token_ciphertext|token_iv|token_auth_tag/);
  assert.doesNotMatch(migration, /UPDATE social_publication_targets/i);
  assert.doesNotMatch(migration, /delete from mindbase_integration_connections/i);
});

test("Meta social operations use the native vault and never fall back to Mindbase", async () => {
  const [
    readiness,
    discovery,
    officialPublication,
    webhook,
    advertising,
    providerAccess,
    metaAdapter,
    mediaAdmin,
  ] = await Promise.all([
    read("server/lib/territory-media/socialPublication.ts"),
    read("server/lib/territory-media/socialTargetDiscovery.ts"),
    read("server/lib/territory-media/officialSocialPublication.ts"),
    read("server/lib/territory-media/metaSocialWebhook.ts"),
    read("server/lib/territory-media/advertisingGovernance.ts"),
    read("server/lib/exportunity/integrations/providerAccess.ts"),
    read("server/lib/territory-media/metaSocialPublishingAdapter.ts"),
    read("client/src/pages/AdminMarketingMediaPage.tsx"),
  ]);

  for (const source of [
    readiness,
    discovery,
    officialPublication,
    webhook,
    advertising,
  ]) {
    assert.doesNotMatch(source, /mindbaseIntegrationConnections/);
    assert.doesNotMatch(source, /mindbase_integration_connections/);
    assert.doesNotMatch(source, /\/api\/mindbase\/integrations/);
  }

  assert.match(readiness, /credentialStorage: "exportunity_integration_connections"/);
  assert.match(readiness, /credentialsNamespace: "EXPORTUNITY_"/);
  assert.match(discovery, /loadExportunityProviderConnection/);
  assert.match(discovery, /accessTokenForExportunityProviderConnection/);
  assert.match(discovery, /EXPORTUNITY_YOUTUBE_INTEGRATION_ID/);
  assert.doesNotMatch(discovery, /YouTube authorization is not configured/);
  assert.match(discovery, /EXPORTUNITY_META_GRAPH_VERSION/);
  assert.match(officialPublication, /exportunityIntegrationConnections/);
  assert.match(officialPublication, /exportunityIntegrationConnectionId/);
  assert.match(webhook, /exportunityIntegrationConnections/);
  assert.match(webhook, /connectionIntegrationId !== "meta_business"/);
  assert.match(advertising, /connected Exportunity-native provider authorization/);
  assert.match(providerAccess, /authorizationReady: verification\.authorizationReady/);
  assert.match(metaAdapter, /EXPORTUNITY_META_APP_ID/);
  assert.match(metaAdapter, /EXPORTUNITY_META_APP_SECRET/);
  assert.match(metaAdapter, /EXPORTUNITY_META_GRAPH_VERSION/);
  assert.match(mediaAdmin, /Exportunity&(?:apos|#39);s native integration vault/);
  assert.doesNotMatch(mediaAdmin, /credentials remain encrypted in Mindbase/i);
});
