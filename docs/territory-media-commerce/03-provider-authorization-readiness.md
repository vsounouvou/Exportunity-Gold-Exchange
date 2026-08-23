# Provider Authorization Truth and Release Readiness

Date: 2026-08-17
Status: implemented in source; private-console configuration and provider receipts remain open.

## Truth boundary

An OAuth token exchange proves that an authorization response completed. It does not, by itself, prove that every requested permission was granted, that a business-owned publication target is selected, or that any external action is ready.

Mindbase now records these fields separately in the encrypted connection record and its non-secret metadata:

- `requestedScopes`: the permissions named in the signed connection request;
- `grantedScopes`: only permissions evidenced by the provider;
- `missingScopes`: requested permissions absent from provider evidence;
- `declinedScopes`: permissions the provider explicitly reports as not granted;
- `scopeEvidenceSource`: `google_token_response`, `meta_permissions_edge`, or `provider_scope_unavailable`;
- `scopeEvidenceVerified`: whether an authoritative provider response was parsed;
- `authorizationReady`: true only when evidence is verified and no requested permission is missing.

Requested permissions are never copied into `grantedScopes` as a fallback. Legacy connections without this evidence remain `provider_permission_evidence_required` until they are reconnected and verified.

The signed integration ID is also bound to its provider callback. Google integration state cannot complete on the Meta callback, and Meta integration state cannot complete on the Google callback.

## Exact callback manifest

Register these exact HTTPS redirect URIs in the intended private provider consoles:

| Provider use | Redirect URI |
| --- | --- |
| Mindbase Google account integrations | `https://exportunity.net/api/mindbase/integrations/google/callback` |
| Mindbase Meta business integrations | `https://exportunity.net/api/mindbase/integrations/meta/callback` |
| Company Brain read-only Google Workspace | `https://exportunity.net/api/admin/company-brain/workspace/google/callback` |

Do not add wildcard redirects. Confirm the deployed origin and reverse-proxy headers produce these exact values before a controlled authorization test.

Register Twilio callbacks only on the intended Exportunity-owned senders or applications, using the exact HTTPS endpoints below. The configured message-status default is the short `/status` alias; `/message/status` is also implemented, but one canonical value should be used consistently in the provider console and deployment configuration.

| Twilio use | Callback URI |
| --- | --- |
| Message delivery status (`TWILIO_WEBHOOK_PATH` default) | `https://exportunity.net/api/webhooks/twilio/status` |
| SMS inbound | `https://exportunity.net/api/webhooks/twilio/sms/inbound` |
| WhatsApp inbound | `https://exportunity.net/api/webhooks/twilio/whatsapp/inbound` |
| Voice inbound TwiML | `https://exportunity.net/api/webhooks/twilio/voice/inbound` |
| Outbound-call TwiML | `https://exportunity.net/api/webhooks/twilio/voice/outbound` |
| Voice status | `https://exportunity.net/api/webhooks/twilio/voice/status` |
| Voice recording status | `https://exportunity.net/api/webhooks/twilio/voice/recording` |

Every Twilio endpoint above fails closed when its signing secret is absent and validates `X-Twilio-Signature` against the externally visible callback URL. Confirm `PUBLIC_BASE_URL`, proxy forwarding, query strings, and the registered URI together before retaining a controlled callback receipt.

The feature-gated Facebook Page / Instagram comments-and-DM callback is `https://exportunity.net/api/webhooks/meta/social` for both GET verification and signed POST notifications. It exists in source but is disabled by default. Do **not** register it in Meta until migration `20270421_exportunity_meta_social_webhook_receipts.sql` is applied, `META_WEBHOOK_VERIFY_TOKEN` and `META_APP_SECRET` are present in the deployment secret manager, the reviewed inbound permissions are provider-evidenced, exactly one tenant-owned business target is eligible, `FEATURE_META_SOCIAL_WEBHOOK_INGESTION=true` is deliberately released, and a controlled signed notification produces a durable receipt.

The existing `https://exportunity.net/api/webhooks/meta-whatsapp` GET/POST pair is a separately gated Meta WhatsApp Cloud boundary, not the current Exportunity WhatsApp rail. It now fails closed: GET verification requires the dedicated configured verify token, and POST requires a valid raw-body `X-Hub-Signature-256` HMAC-SHA256 signature. Do not register or exercise it unless Meta WhatsApp Cloud is intentionally released; the current governed WhatsApp callback is the Twilio endpoint listed above.

## Requested scope manifest

| Integration | Requested permissions |
| --- | --- |
| Gmail | `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly` |
| Calendar | `openid`, `email`, `profile`, `https://www.googleapis.com/auth/calendar.readonly` |
| Drive | `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.readonly` |
| YouTube | `openid`, `email`, `profile`, `https://www.googleapis.com/auth/youtube.readonly` |
| Facebook Page | `pages_show_list`, `pages_manage_engagement`, `pages_manage_posts`, `pages_read_engagement`, `pages_read_user_engagement` |
| Instagram professional account | `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` |

Google grants are taken only from the token response `scope` field. Meta grants and declined permissions are taken from the version-pinned Graph `/me/permissions` response. If either source is absent or unparsable, the authorization is stored as evidence-incomplete and remains blocked for external action.

The Exportunity-native provider vault maintains Google Workspace and YouTube as
two separate, exact grants. It does not set Google's cumulative
`include_granted_scopes` option. The Workspace grant is limited to Gmail,
Calendar, and Drive read-only scopes; the YouTube grant is limited to owned
channel read access. A token response containing a write, upload, or other
unexpected scope fails closed and is not stored. Because the earlier live Google
grant contains Gmail modify, Calendar event, and Drive file permissions, the
Google project grant must be explicitly revoked before either replacement
read-only consent is completed. Revocation and each new persistent authorization
remain action-time owner decisions.

When and only when `FEATURE_META_SOCIAL_WEBHOOK_INGESTION=true`, a new Facebook OAuth request also asks for `pages_manage_metadata`, `pages_read_user_content`, and `pages_messaging`; a new Instagram OAuth request also asks for `pages_manage_metadata`, `instagram_manage_comments`, and `instagram_manage_messages`. Existing connections are not assumed to have them and must be reconnected. Every channel checks its exact evidenced inbound scopes again before projecting a receipt into the tenant inbox.

## Governed publication-target discovery

The media administration console now turns an evidence-verified OAuth connection into a selectable, non-secret business destination through two separate confirmed actions:

1. `POST /api/admin/marketing/social/targets/discover` performs one read-only provider catalogue request. It supports Facebook Pages, Instagram professional accounts linked to accessible Pages, and the authorized user's YouTube channels.
2. `POST /api/admin/marketing/social/targets/select` accepts only a candidate from a successful tenant-scoped discovery Action Run plus a non-secret authority reference. It creates or updates the internal `social_publication_targets` binding.

Meta discovery uses a version-pinned `GET /me/accounts` request and asks only for Page identity, label, tasks, and the linked `instagram_business_account` identity. YouTube discovery uses the official [`channels.list`](https://developers.google.com/youtube/v3/docs/channels/list) operation with `mine=true`. Provider access tokens are sent only in authorization headers (or the encrypted Google refresh exchange), never as URL parameters, UI data, Action payloads, audit metadata, or discovery evidence.

The discovery parser deliberately reconstructs a safe candidate object instead of passing through raw provider payloads. Each receipt records the connection ID, platform, external account ID and label, parent Page reference when applicable, evidenced permissions, capabilities, and these explicit assertions:

- `providerReadPerformed: true`;
- `providerMutationPerformed: false`;
- `externalPublicationPerformed: false`;
- `credentialsExcluded: true` / `credentialsExposed: false`.

A discovered target alone does not make official publication ready. The source adapter becomes available only when its separate release flag, provider application configuration, current provider-evidenced connection, exact tenant target, current permissions/tasks, current rights and consents, public asset, and action-time administrator confirmation all pass. Discovery itself still does not create a post, upload media, send a message, create an ad, change account settings, or spend funds.

## Official Meta publication adapter (source, disabled by default)

`FEATURE_META_SOCIAL_PUBLICATION_ADAPTER=true` is the separate release flag for the source adapter. It must remain false until the app, business, permissions, target, deployment, migration, asset hosting, rollback, and controlled-receipt checks below are complete.

The first bounded release supports only:

- one immediate Facebook Page image or link post;
- one Instagram professional-account JPEG image post through `/{ig-user-id}/media` and `/{ig-user-id}/media_publish`;
- one explicit foreground continuation when an Instagram container is still processing.

The adapter does not support Meta video/carousel/story/reel publication, scheduling, comments, DMs, replies, metrics, advertising, catalog mutation, spend, deletion, takedown execution, a worker, a timer, or automatic retry. It creates the durable `official_api` attempt before the first provider mutation. A network-ambiguous outcome is retained as failed/ambiguous and cannot be silently retried. Public asset, thumbnail, destination, and returned provider URLs reject embedded or query-parameter credentials. An Instagram continuation atomically claims the exact processing attempt before any provider call, so concurrent confirmations cannot both publish the container. `PUBLISHED` is recorded only after the returned Facebook/Instagram object is read back through the pinned Graph version with provider identity and timestamps retained in credential-free Action evidence. If secondary Action-evidence finalization fails after that provider truth is persisted, the Action run records the local failure without downgrading the provider-confirmed attempt.

Meta's current Page documentation requires a Page access token plus `CREATE_CONTENT`, `MANAGE`, and `MODERATE` Page tasks for the Page-post flow. The OAuth exchange now replaces the short-lived user credential with the documented long-lived user credential, while the exact Page credential is resolved from `/me/accounts` only inside the foreground request and is never stored in the target, Action, audit, attempt, provider receipt, UI, or logs.

Meta's current Instagram documentation states that Facebook Login for Business uses a Facebook Page access token and the base permissions in the manifest above. It also states that `ads_management` and `ads_read` can be required when the app user received the connected Page role through Business Manager. Those high-impact advertising permissions are deliberately **not** added to the base publication manifest merely to make a test pass. Verify the intended Page-role assignment and App Review result in the private console; if Meta proves they are necessary, treat that as a separate permission-expansion review before reconnecting.

## Twilio read-only verification

Tenant admins can explicitly call `POST /api/admin/twilio/verify-account`. The handler performs one provider read of the configured Account resource and returns only:

- a masked Account SID and masked owner SID;
- friendly name, account status, and account type;
- provider evidence source and verification timestamp;
- explicit `messageSent: false`, `externalActionPerformed: false`, and `credentialsExposed: false` assertions.

The response never includes the Auth Token, a raw provider object, or a full Account SID. This check does not create an SMS, WhatsApp message, Verify attempt, voice call, sender, or subaccount. The separate **Send test** control remains consequential and requires action-time authorization.

## Signed webhook receipt adapter

The source now keeps provider trust boundaries separate:

- canonical Twilio callbacks use Twilio URL/form signature validation;
- Meta verification challenges compare a dedicated random token without returning configuration values;
- Meta POST callbacks require the unmodified raw request body and `X-Hub-Signature-256` in the exact `sha256=<hex>` format;
- missing signing configuration returns unavailable instead of allowing unsigned development traffic;
- readiness responses expose only booleans and environment-variable names, never tokens or app secrets.

The feature-gated Meta social adapter adds these source guarantees:

- the signed payload is reduced to bounded, credential-redacted receipts and durably stored before a success response;
- documented Facebook/Instagram text comments and direct messages use stable provider identity for deduplication and provider timestamps for ordering;
- outbound echoes and business self-comments are retained as `ignored_outbound` and never enter the customer inbox;
- unsupported payloads, missing targets, cross-tenant ambiguity, ineligible targets, projection failures, and terminal conflicts remain visible as `unsupported_payload`, `unmatched_target`, `ambiguous_target`, `ineligible_target`, `ingestion_failed`, or `dead_letter` instead of being acknowledged and discarded;
- projection occurs only when exactly one provider-evidenced, tenant-owned target and connected Meta authorization satisfy the channel's scopes;
- tenant administrators can run an explicit, foreground target reconciliation; no scheduler, hidden retry loop, provider subscription, post, reply, or provider mutation was added.

Successful projection creates only the existing canonical Team Inbox message, governed CRM lead where eligible, paused zero-budget review task, and audit evidence. Social replies remain unavailable.

## Live private-console observation (2026-08-17)

An explicit foreground, read-only Edge review was completed against the intended Exportunity administration session and private provider consoles. No password, one-time code, passkey, API key value, OAuth client secret, Meta app secret, Twilio Auth Token, message, post, ad, permission grant, key creation, import, sync, or provider configuration change was entered or performed.

### Google

- Google Cloud is authenticated to the existing `Exportunity AI` project (`exportunity-ai`).
- Google Auth Platform reports **not configured yet**. There is no OAuth 2.0 client, no completed consent branding/audience/data-access configuration, and therefore no client ID or client secret for the application.
- The credential inventory contains existing API keys and Firebase service accounts. One legacy API key is provider-flagged with no restriction summary visible; its value was not revealed. Restriction review and rotation remain separate security work and must not be combined with OAuth activation.
- The enabled-service inventory contains 68 existing cloud, Firebase, and Maps services. Gmail API, Google Drive API, People API, Calendar API, and YouTube Data API were not present in the observed enabled list.
- The live Exportunity Google Maps control reports a browser Maps key present. Its built-in foreground test returned **Browser Maps key accepted** for `exportunity.net`.
- The same control reports the server Places key missing, official Places import disabled, and no optional Cloud Map ID. Curated city data therefore remains the business-data source.
- The live Company Brain Workspace control reports `GOOGLE_WORKSPACE_CLIENT_ID` and `GOOGLE_WORKSPACE_CLIENT_SECRET` missing, all Workspace connector flags off, Drive/Gmail/Contacts connect controls disabled, and no prior sync.
- The OAuth project-configuration wizard is open at its unsaved App Information step. Creating the branding configuration, enabling account-data APIs, creating a web client, or transmitting a support/contact email still requires action-time authorization.

### Twilio

- The live Exportunity Twilio Control Center reports green runtime indicators for Account SID, Auth Token, SMS, WhatsApp, Verify, and production-first mode. Its tenant messaging profile is active and sandbox fallback is off.
- The Twilio provider console itself is not authenticated in Edge, so provider-owned Account identity, sender ownership, Verify service ownership, callback registration, and account status remain unverified.
- The deployed Exportunity page does not yet expose the source package's **Verify account (read-only)** control. The masked provider receipt cannot be captured until the current package is deployed or an equivalent approved provider-console review is completed.

### Meta

- The live Mindbase integration inventory reports both Facebook and Instagram as setup-needed because `META_APP_ID` and `META_APP_SECRET` are absent.
- Meta for Developers is authenticated in the intended Edge session. The account administers four development-mode apps; none is named Exportunity. Two existing Maison en Terre apps are attached to the Exportunity business portfolio. One is configured around Messenger and WhatsApp, while the other contains a broad mixture of advertising, catalog, Page, Instagram, Messenger, Threads, and other use cases. Neither existing app was repurposed or changed.
- The Exportunity business portfolio is visible but provider-labelled **Unverified business**. This does not block creation, but Meta states that verification is required for access to third-party user or business data and for publishing the app.
- A dedicated `Exportunity` app is staged at the final creation review with the Exportunity business portfolio and only the source package's presently implemented provider surfaces: **Manage everything on your Page**, **Manage messaging & content on Instagram**, and **Engage with customers on Messenger from Meta**. Meta reports no additional creation requirements for that selection.
- The final **Create app** action was not executed because it creates persistent provider state and accepts Meta Platform Terms and Developer Policies. No app ID, app secret, permission grant, callback, webhook subscription, supported Graph version, Facebook Page, Instagram professional account, post, message, or ad has been created or selected.
- The source now contains the disabled-by-default official Page/Instagram publication adapter described above. No live provider call or publication receipt has been produced, and `FEATURE_META_SOCIAL_PUBLICATION_ADAPTER` must remain false through app creation, business verification, App Review, deployment, migrations, OAuth reconnect, target discovery/selection, and a separately approved controlled test.

#### Current Exportunity-native production evidence — 2026-08-23

The following production evidence supersedes the earlier absence claims for the
native Exportunity integration. It does not alter the historical private-console
snapshot above and does not assert Meta business verification or App Review:

- The isolated `/api/exportunity/integrations` runtime is fully configured for
  Meta OAuth with a pinned Graph `v25.0`, a dedicated Exportunity integration
  vault, and no credential exposure. This is the Exportunity-native connection;
  the Mindbase integration inventory is not its operational namespace.
- One active `meta_business` connection is stored for Exportunity under account
  label `Vital Sounouvou`. Meta has granted all five required native scopes:
  `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`,
  `instagram_basic`, and `instagram_manage_comments`. The grant expires on
  2026-10-20 and had no missing required scope at the read-only audit.
- A governed Graph `GET /me/accounts` discovery recorded canonical Action runs
  `1` (Facebook) and `2` (Instagram). It returned two authorized Pages:
  `On by Exportunity` and `Exportunity`; neither call changed Meta. No linked
  Instagram professional account was returned.
- Public Page metadata identified `Exportunity` as the published zero-follower
  restart Page. The inaccessible hacked legacy Page was not returned by the
  authorized account. `On by Exportunity` remains a separate empty App Page.
- Canonical selection Action run `3` bound only the restart `Exportunity` Page
  as social-publication target `1`. The target is `authorized`, `healthy`, and
  linked to `exportunity_integration_connections`; no Mindbase credential or
  legacy connection is used.
- `FEATURE_META_SOCIAL_PUBLICATION_ADAPTER=false` and
  `FEATURE_META_SOCIAL_WEBHOOK_INGESTION=false` remain in force. Social webhook
  verification/signature configuration is still incomplete. No Page role,
  post, message, ad, webhook subscription, provider setting, or Instagram target
  was created or changed by discovery or selection.

### Deployment truth

The live version endpoint returned build `1786840027930` at Git SHA `0775d8354c26`; the latest verified local production bundle is build `1787000081961` at the same committed SHA. The differing build IDs plus the absent Twilio verification control prove that the live bundle does not contain the current uncommitted source package even though both builds inherit the same repository HEAD identifier.

The private-console evidence above therefore distinguishes current production from the newer source package. Production has working Twilio runtime configuration and a valid browser Maps key, but it does not yet contain the source package's Twilio account-verification control or the migrations and provider-evidence surfaces introduced through `20270423_exportunity_canonical_commerce_attribution.sql`. Passing source tests does not substitute for deployment, migration, or provider receipts.

## Production evidence still required

| Evidence | Current status |
| --- | --- |
| Intended Google Cloud project and OAuth consent configuration | Project `exportunity-ai` observed; Google Auth Platform and OAuth client remain unconfigured |
| Google Maps browser key | Present and accepted by the live Exportunity foreground key test; raw value not revealed |
| Google Workspace APIs, OAuth client, deployment variables, and connector grants | Gmail/Drive/People APIs not observed enabled; client/secret missing; connector flags off; no grant or sync receipt |
| Google Places server import | Server Places key missing, import disabled, optional Map ID missing; curated data remains active |
| Intended Meta business, app, pinned supported Graph version, app-review status | Native production OAuth configuration is present and pinned to Graph `v25.0`; the connected identity is `Vital Sounouvou`. Exact provider-app identity, business verification, company-account administration, and App Review still require private-console evidence. |
| Intended Facebook Page and Instagram professional-account ownership/selection receipt | Facebook discovery Action `1` returned two manageable Pages; selection Action `3` bound the zero-follower restart `Exportunity` Page as healthy native target `1`. Instagram discovery Action `2` returned no linked professional account. |
| Intended YouTube channel ownership/selection receipt | `UNKNOWN_REQUIRES_PRODUCTION_ACCESS`; governed discovery/selection is implemented in source |
| Twilio application runtime | Live Exportunity UI reports Account SID/Auth Token/SMS/WhatsApp/Verify/production-first ready; no message sent |
| Twilio account identity/status through the read-only check | Pending deployment of the source verification control and a masked provider receipt |
| Twilio SMS/WhatsApp/Verify/voice sender ownership and callback registration | Runtime configuration is present; provider-console ownership and callback receipts remain unverified |
| Meta social callback migration, feature flag, verification/signature configuration, reviewed inbound scopes, subscription, and controlled receipt | Publication and webhook-ingestion flags are confirmed off; webhook verification/signature configuration is incomplete and no subscription or controlled receipt exists. |
| Deployment secret-manager values and deployed callback receipts | Exportunity-native Meta OAuth/vault values are present without disclosure. Meta webhook verification remains incomplete; controlled publication and callback receipts remain open. |

No post, message, ad, charge, booking, refund, settlement, or other live side effect is an acceptable connectivity test. Private-console OAuth completion and target-selection receipts remain open production evidence; the source Meta adapter is implemented but disabled, and a controlled publication receipt remains a separate release action with its own action-time approval.
