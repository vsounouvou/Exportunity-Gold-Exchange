import { db } from "@db";
import {
  agentSenderProfiles,
  agentsProduction,
  communicationsRoutingMap,
  tenantCommunicationProfiles,
  tenants,
} from "@db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { normalizeTenantKey } from "../../../tenants/registry";
import { resolveMessagingEnv, type MessagingResolvedEnv } from "../messaging/config";
import { normalizeAgentKey } from "../mail/agentSlugs";

export type ResolvableTwilioChannel = "sms" | "whatsapp" | "verify_sms" | "verify_whatsapp";
export type SenderResolutionSource = "agent_profile" | "tenant_profile" | "global_env";

type TenantCommunicationProfileRow = typeof tenantCommunicationProfiles.$inferSelect;
type AgentSenderProfileRow = typeof agentSenderProfiles.$inferSelect;

export type ResolvedSender = {
  tenantId: number;
  tenantKey: string | null;
  agentId: number | null;
  agentKey: string | null;
  channel: ResolvableTwilioChannel;
  fromAddress: string | null;
  verifyServiceSid: string | null;
  messagingServiceSid: string | null;
  senderLabel: string | null;
  signature: string | null;
  isSandbox: boolean;
  resolutionSource: SenderResolutionSource;
  whatsappSenderStatus: string | null;
  useSandboxForDev: boolean;
  agentChannelAllowed: boolean;
  tenantProfileId: number | null;
  agentProfileId: number | null;
};

export type ResolveSenderInput = {
  tenantId: number;
  channel: ResolvableTwilioChannel;
  agentId?: number | null;
  agentKey?: string | null;
};

export type ResolvedInboundTwilioContext = {
  tenantId: number | null;
  tenantKey: string | null;
  agentId: number | null;
  agentKey: string | null;
  resolutionSource: "tenant_profile" | "routing_map" | "host_fallback" | "unknown";
};

export class SenderResolutionError extends Error {
  status: number;
  code: string;

  constructor(message: string, code = "sender_resolution_failed", status = 400) {
    super(message);
    this.name = "SenderResolutionError";
    this.status = status;
    this.code = code;
  }
}

function normalizeOptional(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeE164Local(value: unknown) {
  const normalized = normalizeOptional(value)?.replace(/\s+/g, "") || null;
  if (!normalized) return null;
  return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : null;
}

function normalizeWhatsAppAddressLocal(value: unknown) {
  const raw = normalizeOptional(value);
  if (!raw) return null;
  if (!/^whatsapp:/i.test(raw)) return null;
  const e164 = normalizeE164Local(raw.slice("whatsapp:".length));
  return e164 ? `whatsapp:${e164}` : null;
}

function normalizeSenderAddressForChannel(channel: ResolvableTwilioChannel, value: unknown) {
  if (channel === "sms" || channel === "verify_sms") {
    return normalizeE164Local(value);
  }
  const normalized = normalizeOptional(value);
  if (!normalized) return null;
  if (/^whatsapp:/i.test(normalized)) return normalizeWhatsAppAddressLocal(normalized);
  const e164 = normalizeE164Local(normalized);
  return e164 ? `whatsapp:${e164}` : null;
}

function normalizeAllowedChannels(value: unknown): ResolvableTwilioChannel[] {
  if (!Array.isArray(value)) return ["sms", "whatsapp"];
  const allowed = value
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(
      (entry): entry is ResolvableTwilioChannel =>
        entry === "sms" || entry === "whatsapp" || entry === "verify_sms" || entry === "verify_whatsapp",
    );
  return allowed.length ? allowed : ["sms", "whatsapp"];
}

export function isSandboxWhatsAppSender(value: unknown) {
  return String(value || "").trim().toLowerCase() === "whatsapp:+14155238886";
}

function buildFallbackResolution(args: {
  tenantId: number;
  tenantKey?: string | null;
  agentId?: number | null;
  agentKey?: string | null;
  channel: ResolvableTwilioChannel;
  fallbackEnv?: MessagingResolvedEnv;
}) {
  const fallbackEnv = args.fallbackEnv || resolveMessagingEnv();
  const fromAddress =
    args.channel === "sms" || args.channel === "verify_sms"
      ? normalizeSenderAddressForChannel(args.channel, fallbackEnv.smsFrom)
      : normalizeSenderAddressForChannel(args.channel, fallbackEnv.whatsappFrom);
  return {
    tenantId: Number(args.tenantId),
    tenantKey: normalizeOptional(args.tenantKey),
    agentId: Number.isInteger(Number(args.agentId)) ? Number(args.agentId) : null,
    agentKey: normalizeOptional(args.agentKey),
    channel: args.channel,
    fromAddress,
    verifyServiceSid: normalizeOptional(fallbackEnv.verifyServiceSid),
    messagingServiceSid: normalizeOptional(fallbackEnv.messagingServiceSid),
    senderLabel: null,
    signature: null,
    isSandbox: args.channel === "whatsapp" || args.channel === "verify_whatsapp" ? isSandboxWhatsAppSender(fromAddress) : false,
    resolutionSource: "global_env" as const,
    whatsappSenderStatus: null,
    useSandboxForDev: false,
    agentChannelAllowed: true,
    tenantProfileId: null,
    agentProfileId: null,
  };
}

export function resolveSenderFromProfiles(args: {
  tenantId: number;
  tenantKey?: string | null;
  tenantName?: string | null;
  channel: ResolvableTwilioChannel;
  tenantProfile?: TenantCommunicationProfileRow | null;
  agentProfile?: AgentSenderProfileRow | null;
  fallbackEnv?: MessagingResolvedEnv;
  agentId?: number | null;
  agentKey?: string | null;
}) {
  const fallback = buildFallbackResolution(args);
  const tenantProfile = args.tenantProfile || null;
  const agentProfile = args.agentProfile || null;
  const fallbackEnv = args.fallbackEnv || resolveMessagingEnv();

  const tenantDefaultFrom =
    tenantProfile &&
    normalizeSenderAddressForChannel(
      args.channel,
      args.channel === "sms" || args.channel === "verify_sms" ? tenantProfile.smsFrom : tenantProfile.whatsappFrom,
    );

  const agentAllowedChannels = normalizeAllowedChannels(agentProfile?.allowedChannels);
  const agentChannelAllowed = agentProfile ? agentAllowedChannels.includes(args.channel) : true;
  const agentSenderFrom =
    agentProfile && agentChannelAllowed
      ? normalizeSenderAddressForChannel(
          args.channel,
          args.channel === "sms" || args.channel === "verify_sms" ? agentProfile.smsFrom : agentProfile.whatsappFrom,
        )
      : null;

  const useTenantDefaultsForAgent =
    !!agentProfile && agentChannelAllowed && agentProfile.fallbackToTenantDefault !== false;

  const fromAddress =
    agentSenderFrom ||
    (useTenantDefaultsForAgent ? tenantDefaultFrom : null) ||
    (useTenantDefaultsForAgent ? fallback.fromAddress : null) ||
    tenantDefaultFrom ||
    fallback.fromAddress;

  const senderLabel =
    normalizeOptional(agentProfile?.displayName) ||
    normalizeOptional(tenantProfile?.senderLabel) ||
    normalizeOptional(args.tenantName) ||
    null;

  const signature =
    (agentProfile && agentChannelAllowed ? normalizeOptional(agentProfile.signature) : null) ||
    normalizeOptional(tenantProfile?.defaultSignature) ||
    null;

  const verifyServiceSid = normalizeOptional(tenantProfile?.verifyServiceSid) || normalizeOptional(fallbackEnv.verifyServiceSid);
  const messagingServiceSid =
    normalizeOptional(tenantProfile?.messagingServiceSid) || normalizeOptional(fallbackEnv.messagingServiceSid);
  const useSandboxForDev = Boolean(tenantProfile?.useSandboxForDev);
  const sandboxSender = args.channel === "whatsapp" || args.channel === "verify_whatsapp" ? isSandboxWhatsAppSender(fromAddress) : false;
  const isSandbox = sandboxSender && useSandboxForDev;

  const resolutionSource: SenderResolutionSource =
    agentProfile && agentChannelAllowed
      ? "agent_profile"
      : tenantProfile
        ? "tenant_profile"
        : "global_env";

  return {
    tenantId: Number(args.tenantId),
    tenantKey: normalizeOptional(args.tenantKey),
    agentId: Number.isInteger(Number(args.agentId)) ? Number(args.agentId) : null,
    agentKey: normalizeOptional(args.agentKey),
    channel: args.channel,
    fromAddress,
    verifyServiceSid,
    messagingServiceSid,
    senderLabel,
    signature,
    isSandbox,
    resolutionSource,
    whatsappSenderStatus: normalizeOptional(tenantProfile?.whatsappSenderStatus),
    useSandboxForDev,
    agentChannelAllowed,
    tenantProfileId: tenantProfile?.id ?? null,
    agentProfileId: agentProfile?.id ?? null,
  };
}

export async function resolveAgentIdentityForTenant(args: {
  tenantId: number;
  agentId?: number | null;
  agentKey?: string | null;
}) {
  const tenantId = Number(args.tenantId);
  const requestedAgentId = Number(args.agentId);
  if (Number.isInteger(requestedAgentId) && requestedAgentId > 0) {
    const agentRow = await db.query.agentsProduction.findFirst({
      where: and(eq(agentsProduction.tenantId, tenantId), eq(agentsProduction.agentId, requestedAgentId)),
      columns: { agentId: true, agentKey: true },
    });
    return {
      agentId: agentRow?.agentId ? Number(agentRow.agentId) : requestedAgentId,
      agentKey: normalizeOptional(agentRow?.agentKey || args.agentKey),
    };
  }

  const normalizedAgentKey = normalizeAgentKey(String(args.agentKey || ""));
  if (!normalizedAgentKey) return { agentId: null, agentKey: null };

  const agentRow = await db.query.agentsProduction.findFirst({
    where: and(eq(agentsProduction.tenantId, tenantId), eq(agentsProduction.agentKey, normalizedAgentKey)),
    columns: { agentId: true, agentKey: true },
  });

  return {
    agentId: agentRow?.agentId ? Number(agentRow.agentId) : null,
    agentKey: normalizeOptional(agentRow?.agentKey || normalizedAgentKey),
  };
}

export async function resolveSender(input: ResolveSenderInput): Promise<ResolvedSender> {
  const tenantId = Number(input.tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new SenderResolutionError("tenantId is required", "tenant_required", 400);
  }

  const tenantRow = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true, key: true, name: true },
  });

  const agentIdentity = await resolveAgentIdentityForTenant({
    tenantId,
    agentId: input.agentId ?? null,
    agentKey: input.agentKey ?? null,
  });

  const [tenantProfile, agentProfile] = await Promise.all([
    db.query.tenantCommunicationProfiles.findFirst({
      where: and(eq(tenantCommunicationProfiles.tenantId, tenantId), eq(tenantCommunicationProfiles.isActive, true)),
    }),
    agentIdentity.agentId
      ? db.query.agentSenderProfiles.findFirst({
          where: and(
            eq(agentSenderProfiles.tenantId, tenantId),
            eq(agentSenderProfiles.agentId, agentIdentity.agentId),
            eq(agentSenderProfiles.isActive, true),
          ),
        })
      : Promise.resolve(null),
  ]);

  const resolved = resolveSenderFromProfiles({
    tenantId,
    tenantKey: tenantRow?.key ?? null,
    tenantName: tenantRow?.name ?? null,
    tenantProfile,
    agentProfile,
    fallbackEnv: resolveMessagingEnv(),
    channel: input.channel,
    agentId: agentIdentity.agentId,
    agentKey: agentIdentity.agentKey,
  });

  if (agentProfile && !resolved.agentChannelAllowed && agentProfile.fallbackToTenantDefault === false) {
    throw new SenderResolutionError(
      `Channel ${input.channel} is not allowed for this agent sender profile`,
      "channel_not_allowed_for_agent",
      403,
    );
  }

  return resolved;
}

function pickUniqueTenant<T extends { tenantId: number | null }>(rows: T[]) {
  const tenantIds = Array.from(new Set(rows.map((row) => Number(row.tenantId)).filter((value) => Number.isInteger(value) && value > 0)));
  return tenantIds.length === 1 ? tenantIds[0] : null;
}

export async function resolveInboundTwilioContext(args: {
  channel: "sms" | "whatsapp";
  toAddress: string;
  hostTenant?: { id: number; key: string } | null;
}) {
  const normalizedTo =
    args.channel === "sms"
      ? normalizeE164Local(args.toAddress)
      : normalizeSenderAddressForChannel("whatsapp", args.toAddress);

  if (!normalizedTo) {
    return {
      tenantId: args.hostTenant?.id ?? null,
      tenantKey: args.hostTenant?.key ?? null,
      agentId: null,
      agentKey: null,
      resolutionSource: args.hostTenant ? ("host_fallback" as const) : ("unknown" as const),
    };
  }

  const tenantProfileMatches = await db
    .select({
      tenantId: tenantCommunicationProfiles.tenantId,
      tenantKey: tenants.key,
    })
    .from(tenantCommunicationProfiles)
    .innerJoin(tenants, eq(tenants.id, tenantCommunicationProfiles.tenantId))
    .where(
      and(
        eq(tenantCommunicationProfiles.isActive, true),
        args.channel === "sms"
          ? eq(tenantCommunicationProfiles.smsFrom, normalizedTo)
          : eq(tenantCommunicationProfiles.whatsappFrom, normalizedTo),
      ),
    );

  const profileTenantId = pickUniqueTenant(tenantProfileMatches);
  if (profileTenantId) {
    const row = tenantProfileMatches.find((entry) => Number(entry.tenantId) === profileTenantId) || null;
    return {
      tenantId: profileTenantId,
      tenantKey: row?.tenantKey ?? null,
      agentId: null,
      agentKey: null,
      resolutionSource: "tenant_profile" as const,
    };
  }

  const routeMatches = await db
    .select({
      tenantId: communicationsRoutingMap.tenantId,
      agentKey: communicationsRoutingMap.agentKey,
      tenantKey: tenants.key,
    })
    .from(communicationsRoutingMap)
    .innerJoin(tenants, eq(tenants.id, communicationsRoutingMap.tenantId))
    .where(
      and(
        eq(communicationsRoutingMap.provider, "twilio"),
        eq(communicationsRoutingMap.channel, args.channel),
        eq(communicationsRoutingMap.toAddress, args.channel === "sms" ? normalizedTo : normalizeE164Local(normalizedTo.slice("whatsapp:".length)) || ""),
        eq(communicationsRoutingMap.isEnabled, true),
      ),
    );

  const routeTenantId = pickUniqueTenant(routeMatches);
  if (routeTenantId) {
    const route = routeMatches.find((entry) => Number(entry.tenantId) === routeTenantId) || null;
    const agentIdentity = await resolveAgentIdentityForTenant({
      tenantId: routeTenantId,
      agentKey: route?.agentKey ?? null,
    });
    return {
      tenantId: routeTenantId,
      tenantKey: route?.tenantKey ?? null,
      agentId: agentIdentity.agentId,
      agentKey: agentIdentity.agentKey || normalizeOptional(route?.agentKey),
      resolutionSource: "routing_map" as const,
    };
  }

  return {
    tenantId: args.hostTenant?.id ?? null,
    tenantKey: args.hostTenant?.key ?? null,
    agentId: null,
    agentKey: null,
    resolutionSource: args.hostTenant ? ("host_fallback" as const) : ("unknown" as const),
  };
}

const DEFAULT_SEED_KEYS = ["exportunity", "maisonenterre", "houseofzogue", "vitalsounouvou", "rayon1km"];

export async function seedTenantCommunicationProfiles() {
  const normalizedKeys = Array.from(new Set(DEFAULT_SEED_KEYS.map((key) => normalizeTenantKey(key)).filter(Boolean))) as string[];
  if (!normalizedKeys.length) return [];

  const tenantRows = await db.query.tenants.findMany({
    where: inArray(tenants.key, normalizedKeys),
    columns: { id: true, key: true, name: true },
  });
  if (!tenantRows.length) return [];

  const existing = await db.query.tenantCommunicationProfiles.findMany({
    where: inArray(
      tenantCommunicationProfiles.tenantId,
      tenantRows.map((row) => row.id),
    ),
    columns: { tenantId: true },
  });
  const existingTenantIds = new Set(existing.map((row) => Number(row.tenantId)).filter((value) => Number.isInteger(value)));

  const fallbackEnv = resolveMessagingEnv();
  const seededRows = tenantRows
    .filter((row) => !existingTenantIds.has(Number(row.id)))
    .map((row) => ({
      tenantId: row.id,
      isActive: true,
      defaultChannel: (fallbackEnv.whatsappFrom ? "whatsapp" : "sms") as "whatsapp" | "sms",
      smsFrom: normalizeOptional(fallbackEnv.smsFrom),
      whatsappFrom: normalizeOptional(fallbackEnv.whatsappFrom),
      verifyServiceSid: normalizeOptional(fallbackEnv.verifyServiceSid),
      senderLabel: normalizeOptional(row.name),
      defaultSignature: normalizeOptional(row.name),
      messagingServiceSid: normalizeOptional(fallbackEnv.messagingServiceSid),
      whatsappSenderStatus: normalizeOptional(fallbackEnv.whatsappFrom) ? "configured" : null,
      useSandboxForDev: isSandboxWhatsAppSender(fallbackEnv.whatsappFrom),
      metadata: {
        seededFromEnv: true,
        seededAt: new Date().toISOString(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

  if (!seededRows.length) return [];
  return await db.insert(tenantCommunicationProfiles).values(seededRows).onConflictDoNothing().returning();
}
