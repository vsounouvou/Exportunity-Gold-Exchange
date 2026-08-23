import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  continueApprovedInstagramPublication,
  createMetaGraphTransport,
  META_SOCIAL_PUBLICATION_FEATURE_FLAG,
  metaSocialPublicationFeatureStatus,
  MetaGraphRequestError,
  publishApprovedMetaPackage,
  type MetaGraphRequest,
  type MetaGraphResponse,
  type MetaGraphTransport,
} from "../server/lib/territory-media/metaSocialPublishingAdapter";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function approvedPackage(platform: "facebook" | "instagram") {
  return {
    packageVersion: 1,
    status: "APPROVED",
    mode: "official_api",
    platform,
    channel: platform,
    title: "Verified producer profile",
    caption: "Meet a verified producer.",
    hashtags: ["#Exportunity", "#MadeInAfrica"],
    altText: "A producer presenting a packaged product.",
    finalAsset: {
      url: "https://cdn.exportunity.net/media/verified-producer.jpg",
      type: "image/jpeg",
    },
    thumbnail: null,
    destinationLink: "https://exportunity.net/products/verified-producer",
    trackingCode: "exp_1234567890abcdef",
    attributionText: "Source: Verified creator",
    approvedAt: "2026-08-17T12:00:00.000Z",
    externalPublicationClaimed: false,
  } as const;
}

function queuedTransport(responses: MetaGraphResponse[]) {
  const requests: MetaGraphRequest[] = [];
  const transport: MetaGraphTransport = async (request) => {
    requests.push(request);
    const response = responses.shift();
    if (!response) throw new Error(`Unexpected Meta request: ${request.method} ${request.path}`);
    return response;
  };
  return { transport, requests };
}

test("Meta publication adapter is disabled by default and advertises no retries, ads, or messages", () => {
  const prior = process.env[META_SOCIAL_PUBLICATION_FEATURE_FLAG];
  const priorAppId = process.env.EXPORTUNITY_META_APP_ID;
  const priorAppSecret = process.env.EXPORTUNITY_META_APP_SECRET;
  const priorVersion = process.env.EXPORTUNITY_META_GRAPH_VERSION;
  try {
    delete process.env[META_SOCIAL_PUBLICATION_FEATURE_FLAG];
    process.env.EXPORTUNITY_META_APP_ID = "configured-in-test";
    process.env.EXPORTUNITY_META_APP_SECRET = "configured-in-test";
    process.env.EXPORTUNITY_META_GRAPH_VERSION = "v26.0";
    const status = metaSocialPublicationFeatureStatus();
    assert.equal(status.enabled, false);
    assert.equal(status.configured, true);
    assert.equal(status.automaticRetry, false);
    assert.equal(status.backgroundExecution, false);
    assert.equal(status.advertisementExecution, false);
    assert.equal(status.outboundMessaging, false);
    assert.equal(status.credentialsExposed, false);
  } finally {
    if (prior === undefined) delete process.env[META_SOCIAL_PUBLICATION_FEATURE_FLAG];
    else process.env[META_SOCIAL_PUBLICATION_FEATURE_FLAG] = prior;
    if (priorAppId === undefined) delete process.env.EXPORTUNITY_META_APP_ID;
    else process.env.EXPORTUNITY_META_APP_ID = priorAppId;
    if (priorAppSecret === undefined) delete process.env.EXPORTUNITY_META_APP_SECRET;
    else process.env.EXPORTUNITY_META_APP_SECRET = priorAppSecret;
    if (priorVersion === undefined) delete process.env.EXPORTUNITY_META_GRAPH_VERSION;
    else process.env.EXPORTUNITY_META_GRAPH_VERSION = priorVersion;
  }
});

test("Facebook Page publication resolves a transient Page credential and requires provider read-back", async () => {
  const { transport, requests } = queuedTransport([
    {
      payload: {
        data: [{
          id: "123",
          name: "Exportunity",
          tasks: ["CREATE_CONTENT", "MANAGE", "MODERATE"],
          access_token: "page-credential-secret",
        }],
      },
      requestId: "lookup-1",
    },
    {
      payload: { id: "photo-456", post_id: "123_456" },
      requestId: "create-1",
    },
    {
      payload: {
        id: "123_456",
        permalink_url: "https://www.facebook.com/123/posts/456",
        created_time: "2026-08-17T12:05:00+0000",
        is_published: true,
      },
      requestId: "verify-1",
    },
  ]);

  const result = await publishApprovedMetaPackage({
    transport,
    userAccessToken: "user-credential-secret",
    target: { platform: "facebook", externalAccountId: "123" },
    publication: approvedPackage("facebook"),
  });

  assert.equal(result.status, "PUBLISHED");
  assert.equal(result.providerObjectId, "123_456");
  assert.equal(result.providerUrl, "https://www.facebook.com/123/posts/456");
  assert.equal(result.evidence.providerConfirmationVerified, true);
  assert.equal(result.evidence.credentialsExcluded, true);
  assert.deepEqual(
    requests.map(({ method, path }) => ({ method, path })),
    [
      { method: "GET", path: "/me/accounts" },
      { method: "POST", path: "/123/photos" },
      { method: "GET", path: "/123_456" },
    ],
  );
  assert.equal(requests[0].accessToken, "user-credential-secret");
  assert.equal(requests[1].accessToken, "page-credential-secret");
  assert.doesNotMatch(JSON.stringify(result), /page-credential-secret|user-credential-secret/);
  assert.equal(requests.some((request) => Object.keys(request.query || {}).some((key) => /token|secret/i.test(key))), false);
});

test("Instagram JPEG publication creates a container, verifies readiness, publishes, and reads back the media", async () => {
  const { transport, requests } = queuedTransport([
    {
      payload: {
        data: [{
          id: "321",
          tasks: ["CREATE_CONTENT"],
          access_token: "page-credential-secret",
          instagram_business_account: { id: "987" },
        }],
      },
      requestId: "lookup-ig",
    },
    { payload: { id: "container-1" }, requestId: "container-create" },
    { payload: { id: "container-1", status_code: "FINISHED" }, requestId: "container-status" },
    { payload: { id: "media-1" }, requestId: "media-publish" },
    {
      payload: {
        id: "media-1",
        permalink: "https://www.instagram.com/p/example/",
        timestamp: "2026-08-17T12:10:00+0000",
        media_type: "IMAGE",
      },
      requestId: "media-verify",
    },
  ]);

  const result = await publishApprovedMetaPackage({
    transport,
    userAccessToken: "user-credential-secret",
    target: { platform: "instagram", externalAccountId: "987", parentAccountId: "321" },
    publication: approvedPackage("instagram"),
  });

  assert.equal(result.status, "PUBLISHED");
  assert.equal(result.providerContainerId, "container-1");
  assert.equal(result.providerObjectId, "media-1");
  assert.equal(result.providerUrl, "https://www.instagram.com/p/example/");
  assert.deepEqual(
    requests.map(({ method, path }) => ({ method, path })),
    [
      { method: "GET", path: "/me/accounts" },
      { method: "POST", path: "/987/media" },
      { method: "GET", path: "/container-1" },
      { method: "POST", path: "/987/media_publish" },
      { method: "GET", path: "/media-1" },
    ],
  );
  assert.doesNotMatch(JSON.stringify(result), /page-credential-secret|user-credential-secret/);
});

test("an unfinished Instagram container remains PROCESSING and starts no hidden retry", async () => {
  const { transport, requests } = queuedTransport([
    {
      payload: {
        data: [{
          id: "321",
          tasks: ["CREATE_CONTENT"],
          access_token: "page-credential-secret",
          instagram_business_account: { id: "987" },
        }],
      },
      requestId: "lookup-ig",
    },
    { payload: { id: "container-2" }, requestId: "container-create" },
    { payload: { id: "container-2", status_code: "IN_PROGRESS" }, requestId: "container-status" },
  ]);
  const result = await publishApprovedMetaPackage({
    transport,
    userAccessToken: "user-credential-secret",
    target: { platform: "instagram", externalAccountId: "987", parentAccountId: "321" },
    publication: approvedPackage("instagram"),
  });
  assert.equal(result.status, "PROCESSING");
  assert.equal(result.providerContainerId, "container-2");
  assert.equal(result.evidence.externalPublicationPerformed, false);
  assert.equal(result.evidence.automaticRetryStarted, false);
  assert.equal(result.evidence.explicitForegroundContinuationRequired, true);
  assert.equal(requests.length, 3);
});

test("an unfinished foreground continuation performs only reads and remains PROCESSING", async () => {
  const { transport, requests } = queuedTransport([
    {
      payload: {
        data: [{
          id: "321",
          tasks: ["CREATE_CONTENT"],
          access_token: "page-credential-secret",
          instagram_business_account: { id: "987" },
        }],
      },
      requestId: "lookup-ig",
    },
    { payload: { id: "container-2", status_code: "IN_PROGRESS" }, requestId: "container-status" },
  ]);
  const result = await continueApprovedInstagramPublication({
    transport,
    userAccessToken: "user-credential-secret",
    target: { platform: "instagram", externalAccountId: "987", parentAccountId: "321" },
    providerContainerId: "container-2",
  });
  assert.equal(result.status, "PROCESSING");
  assert.equal(result.evidence.providerMutationPerformed, false);
  assert.equal(result.evidence.providerContainerCreated, false);
  assert.deepEqual(
    requests.map(({ method, path }) => ({ method, path })),
    [
      { method: "GET", path: "/me/accounts" },
      { method: "GET", path: "/container-2" },
    ],
  );
});

test("foreground Instagram continuation publishes only after a fresh FINISHED receipt", async () => {
  const { transport, requests } = queuedTransport([
    {
      payload: {
        data: [{
          id: "321",
          tasks: ["CREATE_CONTENT"],
          access_token: "page-credential-secret",
          instagram_business_account: { id: "987" },
        }],
      },
      requestId: "lookup-ig",
    },
    { payload: { id: "container-2", status_code: "FINISHED" }, requestId: "container-status" },
    { payload: { id: "media-2" }, requestId: "media-publish" },
    {
      payload: {
        id: "media-2",
        permalink: "https://www.instagram.com/p/example-two/",
        timestamp: "2026-08-17T12:12:00+0000",
        media_type: "IMAGE",
      },
      requestId: "media-verify",
    },
  ]);
  const result = await continueApprovedInstagramPublication({
    transport,
    userAccessToken: "user-credential-secret",
    target: { platform: "instagram", externalAccountId: "987", parentAccountId: "321" },
    providerContainerId: "container-2",
  });
  assert.equal(result.status, "PUBLISHED");
  assert.deepEqual(
    requests.map(({ method, path }) => ({ method, path })),
    [
      { method: "GET", path: "/me/accounts" },
      { method: "GET", path: "/container-2" },
      { method: "POST", path: "/987/media_publish" },
      { method: "GET", path: "/media-2" },
    ],
  );
});

test("fixed-host transport keeps provider credentials out of URLs and sanitizes provider errors", async () => {
  let observedUrl = "";
  let observedAuthorization = "";
  const transport = createMetaGraphTransport({
    graphVersion: "v26.0",
    fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
      observedUrl = String(url);
      observedAuthorization = String((init?.headers as Record<string, string>)?.authorization || "");
      return new Response(JSON.stringify({
        error: {
          message: "Rejected access_token=provider-secret-value",
          type: "OAuthException",
          code: 190,
          error_subcode: 463,
        },
      }), {
        status: 400,
        headers: { "content-type": "application/json", "x-fb-trace-id": "trace-123" },
      });
    }) as typeof fetch,
  });

  await assert.rejects(
    () => transport({
      method: "GET",
      path: "/me/accounts",
      accessToken: "provider-secret-value",
      query: { fields: "id,name", limit: "100" },
      label: "test request",
    }),
    (error: unknown) => {
      assert.ok(error instanceof MetaGraphRequestError);
      assert.equal(error.httpStatus, 400);
      assert.equal(error.outcomeAmbiguous, false);
      assert.doesNotMatch(error.message, /provider-secret-value/);
      assert.doesNotMatch(JSON.stringify(error.evidence), /provider-secret-value/);
      return true;
    },
  );
  assert.doesNotMatch(observedUrl, /provider-secret-value|access_token=/i);
  assert.equal(observedAuthorization, "Bearer provider-secret-value");

  const ambiguousTransport = createMetaGraphTransport({
    graphVersion: "v26.0",
    fetcher: (async () => new Response(JSON.stringify({
      error: { type: "OAuthException", code: 2, is_transient: true },
    }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })) as typeof fetch,
  });
  await assert.rejects(
    () => ambiguousTransport({
      method: "POST",
      path: "/321/feed",
      accessToken: "provider-secret-value",
      body: { message: "Example" },
      label: "ambiguous post",
    }),
    (error: unknown) => {
      assert.ok(error instanceof MetaGraphRequestError);
      assert.equal(error.outcomeAmbiguous, true);
      return true;
    },
  );
});

test("source service, routes, Actions, OAuth hardening, constraints, and UI expose one-shot governed execution", async () => {
  const [adapter, service, routes, actions, mindbase, ensure, ui, envExample] = await Promise.all([
    read("server/lib/territory-media/metaSocialPublishingAdapter.ts"),
    read("server/lib/territory-media/officialSocialPublication.ts"),
    read("server/routes/admin-marketing.ts"),
    read("server/lib/actions/actionDefinitions.ts"),
    read("server/routes/mindbase.ts"),
    read("server/lib/territory-media/ensureTables.ts"),
    read("client/src/pages/AdminMarketingMediaPage.tsx"),
    read(".env.example"),
  ]);
  assert.match(adapter, /FEATURE_META_SOCIAL_PUBLICATION_ADAPTER/);
  assert.match(adapter, /class MetaSocialPublishingAdapter implements SocialPlatformAdapter/);
  assert.match(adapter, /pageCredentialPersisted: false/);
  assert.match(adapter, /automaticRetryStarted: false/);
  assert.doesNotMatch(adapter, /setInterval\(|setTimeout\([^)]*publish/i);
  assert.match(service, /actionKey: "SOCIAL_PUBLICATION_EXECUTE"/);
  assert.match(service, /status: "UPLOADING"/);
  assert.match(service, /providerConfirmedAt/);
  assert.match(service, /externalPublicationPerformed: providerResult\.status === "PUBLISHED"/);
  assert.match(service, /claimInstagramContinuation/);
  assert.match(service, /finalizeProviderActionPreservingProviderTruth/);
  assert.match(service, /withProviderMutationAmbiguity/);
  assert.match(service, /existing\.targetId !== input\.targetId/);
  assert.match(service, /replay changed the bound hashtags/);
  assert.match(routes, /publications\/official/);
  assert.match(routes, /publications\/:attemptId\/continue/);
  assert.match(actions, /SOCIAL_PUBLICATION_EXECUTE/);
  assert.match(actions, /action_time_human_confirmation_required/);
  assert.match(mindbase, /fb_exchange_token/);
  assert.match(mindbase, /metaLongLivedUserToken: true/);
  assert.match(mindbase, /authorization: `Bearer \$\{asText\(tokenPayload\.access_token\)\}`/);
  assert.match(ensure, /social_publication_attempts_manual_not_published_check/);
  assert.match(ensure, /social_publication_attempts_provider_confirmation_check/);
  assert.match(ui, /Official Meta publication · consequential action/);
  assert.match(ui, /Publish once to verified/);
  assert.match(ui, /Continue this Instagram publication once/);
  assert.match(envExample, /FEATURE_META_SOCIAL_PUBLICATION_ADAPTER=false/);
});
