import { db } from "@db";
import { actionRequests, tenants } from "@db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getSmtpRuntimeHealth } from "../mail/smtpProbe";
import { getMessagingHealth } from "../messaging/config";
import {
  evaluateOutboundCommunicationPolicy,
  type OutboundCommitmentRisk,
  type OutboundCommunicationChannel,
  type OutboundCommunicationPolicyResult,
  type OutboundCommunicationPurpose,
  type OutboundContactBasis,
} from "./outboundPolicy";
import { authorizeExportunityOwnerTest } from "../exportunity/outreach/ownerTestPolicy";

const PURPOSES = new Set<OutboundCommunicationPurpose>([
  "authentication",
  "support_response",
  "transactional_update",
  "service_update",
  "supplier_rfq",
  "customer_offer",
  "negotiation",
  "relationship_follow_up",
  "regulatory_alert",
  "meeting_invite",
  "marketing",
  "unspecified",
]);

const CONTACT_BASES = new Set<OutboundContactBasis>([
  "explicit_opt_in",
  "service_requested",
  "existing_business_relationship",
  "public_b2b_relevance",
  "institutional_introduction",
  "legal_obligation",
  "unknown",
]);

const COMMITMENT_RISKS = new Set<OutboundCommitmentRisk>([
  "none",
  "commercial_discussion",
  "pricing",
  "payment",
  "contractual",
  "legal",
  "regulatory",
  "sanctions",
]);

const COUNTRY_TIME_ZONES: Record<string, string> = {
  BJ: "Africa/Porto-Novo",
  CI: "Africa/Abidjan",
  GH: "Africa/Accra",
  NG: "Africa/Lagos",
  SN: "Africa/Dakar",
  TG: "Africa/Lome",
  BF: "Africa/Ouagadougou",
  ML: "Africa/Bamako",
  GN: "Africa/Conakry",
  KE: "Africa/Nairobi",
  ZA: "Africa/Johannesburg",
  MA: "Africa/Casablanca",
  EG: "Africa/Cairo",
};

type RecipientGovernance = {
  suppressionChecked: boolean;
  matchedContactCount: number;
  consentStatus: "unknown" | "opt_in" | "opt_out";
  doNotContact: boolean;
  suppressed: boolean;
  contactPreference: "preferred" | "allowed" | "unknown" | "not_allowed";
};

export type OutboundActionPolicyEvaluation =
  OutboundCommunicationPolicyResult & {
    evaluatedAt: string;
    tenantKey: string | null;
    recipientCount: number;
    matchedContactCount: number;
    evidenceSource: "tenant_contact_registry" | "legacy_tenant_policy";
    providerReadiness?: OutboundProviderReadiness;
    ownerTest?: {
      authorized: boolean;
      channelEnabled: boolean;
      reason: string;
    };
  };

export type OutboundProviderReadiness = {
  providerConfigured: boolean;
  channelEnabled: boolean;
  senderVerified: boolean;
  channelReleaseFlag: string;
  senderVerificationFlag: string;
};

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rowsFromResult<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const value = result as { rows?: T[] } | null;
  return Array.isArray(value?.rows) ? value.rows : [];
}

function enabled(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(
    String(value || "").trim().toLowerCase(),
  );
}

function normalizedEmail(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function normalizedPhone(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? `+${digits}` : "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function outboundChannelForActionType(
  actionType: unknown,
): OutboundCommunicationChannel | null {
  const normalized = String(actionType || "").trim().toUpperCase();
  if (normalized === "SEND_EMAIL" || normalized === "SEND_MEETING_INVITE") {
    return "email";
  }
  if (normalized === "SEND_SMS") return "sms";
  if (normalized === "SEND_WHATSAPP") return "whatsapp";
  if (normalized === "PLACE_VOICE_CALL") return "voice";
  return null;
}

export function outboundRecipientsForPayload(
  channel: OutboundCommunicationChannel,
  payloadValue: unknown,
) {
  const payload = safeRecord(payloadValue);
  if (channel === "email") {
    const direct = Array.isArray(payload.to)
      ? payload.to
      : Array.isArray(payload.recipients)
        ? payload.recipients
        : [];
    const attendeeEmails = Array.isArray(payload.attendees)
      ? payload.attendees.map((entry) =>
          typeof entry === "string"
            ? entry
            : safeRecord(entry).email,
        )
      : [];
    return unique(
      [...direct, ...attendeeEmails].map((value) => normalizedEmail(value)),
    );
  }
  const value =
    payload.toE164 ??
    payload.to_e164 ??
    payload.to ??
    payload.phone ??
    payload.recipient;
  return unique([normalizedPhone(value)]);
}

function normalizePreference(
  metadataValue: unknown,
  channel: OutboundCommunicationChannel,
) {
  const metadata = safeRecord(metadataValue);
  const preferences = safeRecord(metadata.preferences);
  const blocked = Array.isArray(preferences.blockedChannels)
    ? preferences.blockedChannels
    : Array.isArray(preferences.optOutChannels)
      ? preferences.optOutChannels
      : [];
  if (
    blocked.some(
      (entry) => String(entry || "").trim().toLowerCase() === channel,
    )
  ) {
    return "not_allowed" as const;
  }
  const preferred = Array.isArray(preferences.notificationChannels)
    ? preferences.notificationChannels
    : Array.isArray(preferences.preferredChannels)
      ? preferences.preferredChannels
      : [];
  if (
    preferred.some(
      (entry) => String(entry || "").trim().toLowerCase() === channel,
    )
  ) {
    return "preferred" as const;
  }
  return "unknown" as const;
}

async function loadRecipientGovernance(input: {
  tenantId: number;
  channel: OutboundCommunicationChannel;
  recipients: string[];
}): Promise<RecipientGovernance> {
  const matched: Array<{
    consent_status?: unknown;
    is_dnc?: unknown;
    crm_status?: unknown;
    metadata?: unknown;
  }> = [];
  try {
    for (const recipient of input.recipients.slice(0, 25)) {
      const result =
        input.channel === "email"
          ? await db.execute(sql`
              select
                coalesce(tc.consent_status::text, c.consent_status::text, 'unknown') as consent_status,
                (coalesce(tc.is_dnc, false) or coalesce(c.is_dnc, false) or coalesce(tc.crm_status::text, '') = 'dnc') as is_dnc,
                coalesce(tc.crm_status::text, c.status::text, 'lead') as crm_status,
                coalesce(c.metadata, '{}'::jsonb) as metadata
              from tenant_contacts tc
              join contacts c on c.id = tc.contact_id
              where tc.tenant_id = ${input.tenantId}
                and tc.status::text = 'active'
                and (
                  lower(coalesce(c.primary_email, '')) = ${recipient}
                  or lower(coalesce(c.email, '')) = ${recipient}
                  or exists (
                    select 1
                    from jsonb_array_elements_text(coalesce(c.emails, '[]'::jsonb)) address(value)
                    where lower(trim(address.value)) = ${recipient}
                  )
                  or exists (
                    select 1
                    from contact_identities identity
                    where identity.tenant_id = ${input.tenantId}
                      and identity.contact_id = c.id
                      and identity.kind::text = 'email'
                      and lower(identity.value_normalized) = ${recipient}
                  )
                )
              limit 20
            `)
          : await db.execute(sql`
              select
                coalesce(tc.consent_status::text, c.consent_status::text, 'unknown') as consent_status,
                (coalesce(tc.is_dnc, false) or coalesce(c.is_dnc, false) or coalesce(tc.crm_status::text, '') = 'dnc') as is_dnc,
                coalesce(tc.crm_status::text, c.status::text, 'lead') as crm_status,
                coalesce(c.metadata, '{}'::jsonb) as metadata
              from tenant_contacts tc
              join contacts c on c.id = tc.contact_id
              where tc.tenant_id = ${input.tenantId}
                and tc.status::text = 'active'
                and (
                  regexp_replace(coalesce(c.primary_phone_e164, ''), '[^0-9+]', '', 'g') = ${recipient}
                  or regexp_replace(coalesce(c.phone_normalized, c.phone, ''), '[^0-9+]', '', 'g') = ${recipient}
                  or exists (
                    select 1
                    from jsonb_array_elements_text(coalesce(c.phones, '[]'::jsonb)) address(value)
                    where regexp_replace(address.value, '[^0-9+]', '', 'g') = ${recipient}
                  )
                  or exists (
                    select 1
                    from contact_identities identity
                    where identity.tenant_id = ${input.tenantId}
                      and identity.contact_id = c.id
                      and identity.kind::text = 'phone'
                      and regexp_replace(identity.value_normalized, '[^0-9+]', '', 'g') = ${recipient}
                  )
                )
              limit 20
            `);
      matched.push(...rowsFromResult(result));
    }
  } catch {
    return {
      suppressionChecked: false,
      matchedContactCount: 0,
      consentStatus: "unknown",
      doNotContact: false,
      suppressed: false,
      contactPreference: "unknown",
    };
  }

  const consentStatus = matched.some(
    (row) => String(row.consent_status || "").toLowerCase() === "opt_out",
  )
    ? "opt_out"
    : matched.some(
          (row) => String(row.consent_status || "").toLowerCase() === "opt_in",
        )
      ? "opt_in"
      : "unknown";
  const preferences = matched.map((row) =>
    normalizePreference(row.metadata, input.channel),
  );
  const contactPreference = preferences.includes("not_allowed")
    ? "not_allowed"
    : preferences.includes("preferred")
      ? "preferred"
      : "unknown";
  const doNotContact = matched.some(
    (row) =>
      Boolean(row.is_dnc) ||
      String(row.crm_status || "").trim().toLowerCase() === "dnc",
  );

  return {
    suppressionChecked: true,
    matchedContactCount: matched.length,
    consentStatus,
    doNotContact,
    suppressed: doNotContact || contactPreference === "not_allowed",
    contactPreference,
  };
}

function parsedEnum<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fallback: T,
) {
  const normalized = String(value || "").trim().toLowerCase() as T;
  return allowed.has(normalized) ? normalized : fallback;
}

function inferPurpose(
  actionType: unknown,
  payload: Record<string, unknown>,
): OutboundCommunicationPurpose {
  const explicit = parsedEnum(
    payload.communicationPurpose ?? payload.communication_purpose,
    PURPOSES,
    "unspecified",
  );
  if (explicit !== "unspecified") return explicit;
  const action = String(actionType || "").trim().toUpperCase();
  if (action === "SEND_MEETING_INVITE") return "meeting_invite";
  if (payload.supplierProfileId || payload.supplier_profile_id) {
    return "supplier_rfq";
  }
  if (payload.notificationId || payload.notification_id) return "service_update";
  return "unspecified";
}

function inferContactBasis(
  purpose: OutboundCommunicationPurpose,
  payload: Record<string, unknown>,
): OutboundContactBasis {
  const explicit = parsedEnum(
    payload.contactBasis ?? payload.contact_basis,
    CONTACT_BASES,
    "unknown",
  );
  if (explicit !== "unknown") return explicit;
  if (purpose === "supplier_rfq") return "public_b2b_relevance";
  if (
    purpose === "authentication" ||
    purpose === "support_response" ||
    purpose === "transactional_update" ||
    purpose === "service_update"
  ) {
    return "service_requested";
  }
  return "unknown";
}

function inferCommitmentRisk(
  purpose: OutboundCommunicationPurpose,
  payload: Record<string, unknown>,
): OutboundCommitmentRisk {
  const explicit = parsedEnum(
    payload.commitmentRisk ?? payload.commitment_risk,
    COMMITMENT_RISKS,
    "none",
  );
  if (explicit !== "none") return explicit;
  if (purpose === "supplier_rfq" || purpose === "relationship_follow_up") {
    return "commercial_discussion";
  }
  if (purpose === "customer_offer" || purpose === "negotiation") {
    return "pricing";
  }
  if (purpose === "regulatory_alert") return "regulatory";
  return "none";
}

function resolveBusinessHours(
  payload: Record<string, unknown>,
  evaluatedAt: Date,
) {
  const requestedTimeZone = String(
    payload.recipientTimeZone ?? payload.recipient_time_zone ?? "",
  ).trim();
  const countryCode = String(
    payload.recipientCountryCode ?? payload.recipient_country_code ?? "",
  )
    .trim()
    .toUpperCase();
  const timeZone = requestedTimeZone || COUNTRY_TIME_ZONES[countryCode] || "";
  if (!timeZone) {
    return { known: false, within: false, timeZone: null };
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(evaluatedAt);
    const weekday = parts.find((part) => part.type === "weekday")?.value || "";
    const hour = Number(parts.find((part) => part.type === "hour")?.value || -1);
    const workingDay = !["Sat", "Sun"].includes(weekday);
    return {
      known: true,
      within: workingDay && hour >= 8 && hour < 18,
      timeZone,
    };
  } catch {
    return { known: false, within: false, timeZone: null };
  }
}

async function tenantKeyFor(tenantId: number) {
  const row = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { key: true },
  });
  return String(row?.key || "").trim().toLowerCase() || null;
}

const CHANNEL_RELEASE_FLAGS: Record<OutboundCommunicationChannel, string> = {
  email: "FEATURE_EXPORTUNITY_EMAIL_OUTBOUND",
  sms: "FEATURE_EXPORTUNITY_SMS_OUTBOUND",
  whatsapp: "FEATURE_EXPORTUNITY_WHATSAPP_OUTBOUND",
  voice: "FEATURE_EXPORTUNITY_VOICE_OUTBOUND",
};

const SENDER_VERIFICATION_FLAGS: Record<OutboundCommunicationChannel, string> = {
  email: "EXPORTUNITY_EMAIL_SENDER_VERIFIED",
  sms: "EXPORTUNITY_SMS_SENDER_VERIFIED",
  whatsapp: "EXPORTUNITY_WHATSAPP_SENDER_VERIFIED",
  voice: "EXPORTUNITY_VOICE_CALLER_ID_VERIFIED",
};

export function resolveOutboundProviderReadiness(input: {
  tenantKey?: string | null;
  channel: OutboundCommunicationChannel;
}): OutboundProviderReadiness {
  const tenantKey = String(input.tenantKey || "").trim().toLowerCase();
  const channelReleaseFlag = CHANNEL_RELEASE_FLAGS[input.channel];
  const senderVerificationFlag = SENDER_VERIFICATION_FLAGS[input.channel];
  if (tenantKey !== "exportunity") {
    return {
      providerConfigured: true,
      channelEnabled: true,
      senderVerified: true,
      channelReleaseFlag,
      senderVerificationFlag,
    };
  }

  let providerConfigured = false;
  if (input.channel === "email") {
    providerConfigured = getSmtpRuntimeHealth().configured;
  } else {
    const messaging = getMessagingHealth(tenantKey);
    if (input.channel === "sms") {
      providerConfigured = messaging.configured && messaging.sms.enabled;
    } else if (input.channel === "whatsapp") {
      providerConfigured =
        messaging.configured &&
        (/^MG[a-z0-9]{32}$/i.test(
          String(messaging.resolved.messagingServiceSid || ""),
        ) ||
          /^whatsapp:\+[1-9]\d{6,14}$/i.test(
            String(messaging.resolved.whatsappFrom || ""),
          ));
    } else {
      providerConfigured =
        messaging.configured &&
        /^\+[1-9]\d{6,14}$/.test(
          String(messaging.resolved.voiceFrom || ""),
        );
    }
  }

  return {
    providerConfigured,
    channelEnabled: enabled(process.env[channelReleaseFlag]),
    senderVerified: enabled(process.env[senderVerificationFlag]),
    channelReleaseFlag,
    senderVerificationFlag,
  };
}

export async function evaluateOutboundActionPolicy(input: {
  tenantId: number;
  tenantKey?: string | null;
  actionType: string;
  payload: Record<string, unknown>;
  executionRequested: boolean;
  approvalGranted: boolean;
  requestedByUserId?: number | null;
  requestedByAgentKey?: string | null;
  externalCommunicationsEnabled: boolean;
  providerConfigured?: boolean;
  channelEnabled?: boolean;
  senderVerified?: boolean;
  sentToday?: number;
  dailyLimit?: number | null;
  evaluatedAt?: Date;
}): Promise<OutboundActionPolicyEvaluation | null> {
  const channel = outboundChannelForActionType(input.actionType);
  if (!channel) return null;
  const evaluatedAt = input.evaluatedAt || new Date();
  const tenantKey = input.tenantKey ?? (await tenantKeyFor(input.tenantId));
  const recipients = outboundRecipientsForPayload(channel, input.payload);
  if (tenantKey !== "exportunity") {
    const legacy = evaluateOutboundCommunicationPolicy({
      tenantKey,
      strictGovernance: false,
      channel,
      executionRequested: input.executionRequested,
      approvalGranted: input.approvalGranted,
      externalCommunicationsEnabled: input.externalCommunicationsEnabled,
      recipientAddressPresent: recipients.length > 0,
    });
    return {
      ...legacy,
      evaluatedAt: evaluatedAt.toISOString(),
      tenantKey,
      recipientCount: recipients.length,
      matchedContactCount: 0,
      evidenceSource: "legacy_tenant_policy",
    };
  }

  const purpose = inferPurpose(input.actionType, input.payload);
  const ownerTest =
    channel === "email" || channel === "sms" || channel === "whatsapp"
      ? authorizeExportunityOwnerTest({
          tenantKey,
          channel,
          payload: input.payload,
          recipients,
        })
      : null;
  const providerReadiness = resolveOutboundProviderReadiness({
    tenantKey,
    channel,
  });
  const contactBasis = inferContactBasis(purpose, input.payload);
  const commitmentRisk = inferCommitmentRisk(purpose, input.payload);
  const governance = await loadRecipientGovernance({
    tenantId: input.tenantId,
    channel,
    recipients,
  });
  const businessHours = resolveBusinessHours(input.payload, evaluatedAt);
  const recipientProvenance = safeRecord(input.payload.recipientProvenance);
  const verificationStatus = String(
    recipientProvenance.verificationStatus ||
      input.payload.recipientVerificationStatus ||
      "",
  )
    .trim()
    .toLowerCase();
  const explicitOptInEvidence = String(
    input.payload.whatsappOptInEvidence ??
      input.payload.optInEvidence ??
      input.payload.opt_in_evidence ??
      "",
  ).trim();
  const actorType = input.requestedByUserId
    ? "human"
    : input.requestedByAgentKey
      ? "agent"
      : "system";
  const result = evaluateOutboundCommunicationPolicy({
    tenantKey,
    strictGovernance: true,
    channel,
    purpose: ownerTest?.authorized ? "service_update" : purpose,
    contactBasis: ownerTest?.authorized ? "explicit_opt_in" : contactBasis,
    commitmentRisk,
    actorType,
    executionRequested: input.executionRequested,
    approvalGranted: input.approvalGranted,
    autonomousLowRiskAuthorized:
      ownerTest?.authorized ||
      enabled(process.env.FEATURE_EXPORTUNITY_AUTONOMOUS_LOW_RISK_OUTBOUND),
    externalCommunicationsEnabled:
      ownerTest?.authorized || input.externalCommunicationsEnabled,
    providerConfigured:
      providerReadiness.providerConfigured &&
      (input.providerConfigured ?? true),
    channelEnabled: ownerTest?.authorized
      ? ownerTest.channelEnabled
      : providerReadiness.channelEnabled && (input.channelEnabled ?? true),
    senderVerified: ownerTest?.authorized
      ? ownerTest.channelEnabled
      : providerReadiness.senderVerified && (input.senderVerified ?? true),
    recipientAddressPresent: recipients.length > 0,
    recipientVerified:
      ownerTest?.authorized ||
      governance.matchedContactCount > 0 ||
      ["verified", "approved", "active"].includes(verificationStatus),
    consentStatus: ownerTest?.authorized ? "opt_in" : governance.consentStatus,
    doNotContact: governance.doNotContact,
    suppressionChecked:
      ownerTest?.authorized || governance.suppressionChecked,
    suppressed: governance.suppressed,
    contactPreference: ownerTest?.authorized
      ? "allowed"
      : governance.contactPreference,
    explicitOptInEvidence:
      ownerTest?.authorized || explicitOptInEvidence.length >= 12,
    businessHoursKnown: ownerTest?.authorized || businessHours.known,
    withinBusinessHours: ownerTest?.authorized || businessHours.within,
    quietHoursExempt: ownerTest?.authorized || purpose === "authentication",
    sentToday: input.sentToday,
    dailyLimit: input.dailyLimit,
    whatsappTemplateApproved: Boolean(
      input.payload.contentSid ?? input.payload.content_sid,
    ),
    whatsappSessionActive: Boolean(
      input.payload.whatsappSessionActive ??
        input.payload.whatsapp_session_active,
    ),
  });
  return {
    ...result,
    evaluatedAt: evaluatedAt.toISOString(),
    tenantKey,
    recipientCount: recipients.length,
    matchedContactCount: governance.matchedContactCount,
    evidenceSource: "tenant_contact_registry",
    providerReadiness,
    ...(ownerTest?.requested
      ? {
          ownerTest: {
            authorized: ownerTest.authorized,
            channelEnabled: ownerTest.channelEnabled,
            reason: ownerTest.reason,
          },
        }
      : {}),
  };
}

export class OutboundCommunicationPolicyError extends Error {
  code: string;
  status: number;
  evaluation: OutboundActionPolicyEvaluation;

  constructor(evaluation: OutboundActionPolicyEvaluation) {
    super(
      `OUTBOUND_COMMUNICATION_${evaluation.decision}: ${evaluation.reasons.join("|")}`,
    );
    this.name = "OutboundCommunicationPolicyError";
    this.code = `OUTBOUND_COMMUNICATION_${evaluation.decision}`;
    this.status = evaluation.decision === "BLOCK" ? 403 : 409;
    this.evaluation = evaluation;
  }
}

function normalizedRecipientSet(
  channel: OutboundCommunicationChannel,
  values: string[],
) {
  return unique(
    values.map((value) =>
      channel === "email" ? normalizedEmail(value) : normalizedPhone(value),
    ),
  ).sort();
}

export async function assertOutboundActionExecutionAllowed(input: {
  tenantId: number;
  actionRequestId?: number | null;
  channel: OutboundCommunicationChannel;
  recipients: string[];
  directPayload?: Record<string, unknown>;
  evaluatedAt?: Date;
}) {
  const tenantKey = await tenantKeyFor(input.tenantId);
  if (tenantKey !== "exportunity") {
    return evaluateOutboundActionPolicy({
      tenantId: input.tenantId,
      tenantKey,
      actionType:
        input.channel === "email"
          ? "SEND_EMAIL"
          : input.channel === "sms"
            ? "SEND_SMS"
            : input.channel === "whatsapp"
              ? "SEND_WHATSAPP"
              : "PLACE_VOICE_CALL",
      payload: input.directPayload || {},
      executionRequested: true,
      approvalGranted: false,
      externalCommunicationsEnabled: true,
      evaluatedAt: input.evaluatedAt,
    });
  }

  const actionRequestId = Number(input.actionRequestId || 0);
  const action = actionRequestId
    ? await db.query.actionRequests.findFirst({
        where: and(
          eq(actionRequests.tenantId, input.tenantId),
          eq(actionRequests.id, actionRequestId),
        ),
      })
    : null;
  const actionType = action
    ? String(action.actionType || "")
    : input.channel === "email"
      ? "SEND_EMAIL"
      : input.channel === "sms"
        ? "SEND_SMS"
        : input.channel === "whatsapp"
          ? "SEND_WHATSAPP"
          : "PLACE_VOICE_CALL";
  const payload = action
    ? safeRecord(action.payload)
    : {
        ...(input.directPayload || {}),
        ...(input.channel === "email"
          ? { to: input.recipients }
          : { toE164: input.recipients[0] }),
      };
  const expectedChannel = outboundChannelForActionType(actionType);
  const expectedRecipients = expectedChannel
    ? normalizedRecipientSet(
        expectedChannel,
        outboundRecipientsForPayload(expectedChannel, payload),
      )
    : [];
  const actualRecipients = normalizedRecipientSet(
    input.channel,
    input.recipients,
  );

  const mismatchedAction =
    Boolean(action) &&
    (expectedChannel !== input.channel ||
      JSON.stringify(expectedRecipients) !== JSON.stringify(actualRecipients));
  const actionNotRunning =
    Boolean(action) && String(action?.status || "").trim().toUpperCase() !== "RUNNING";
  const evaluation = await evaluateOutboundActionPolicy({
    tenantId: input.tenantId,
    tenantKey,
    actionType,
    payload,
    executionRequested: true,
    approvalGranted: Boolean(action?.approvedByUserId && action?.approvedAt),
    requestedByUserId: action?.requestedByUserId ?? null,
    requestedByAgentKey: action?.requestedByAgentKey ?? null,
    externalCommunicationsEnabled: enabled(
      process.env.FEATURE_EXTERNAL_COMMUNICATIONS,
    ),
    evaluatedAt: input.evaluatedAt,
  });
  if (!evaluation) {
    throw new Error("OUTBOUND_COMMUNICATION_BLOCK: unsupported action type");
  }
  if (!action || mismatchedAction || actionNotRunning) {
    const reason = !action
      ? "visible_action_request_required"
      : mismatchedAction
        ? "action_channel_or_recipient_mismatch"
        : "action_must_be_running_in_canonical_worker";
    const blocked: OutboundActionPolicyEvaluation = {
      ...evaluation,
      decision: "BLOCK",
      mayExecute: false,
      reasons: [reason],
      blockers: [reason],
    };
    throw new OutboundCommunicationPolicyError(blocked);
  }

  await db.execute(sql`
    update action_requests
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'outboundExecutionPolicy', ${JSON.stringify(evaluation)}::jsonb
        ),
        updated_at = now()
    where tenant_id = ${input.tenantId}
      and id = ${actionRequestId}
  `);
  if (!evaluation.mayExecute) {
    throw new OutboundCommunicationPolicyError(evaluation);
  }
  return evaluation;
}
