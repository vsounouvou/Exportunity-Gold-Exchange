import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import mammoth from "mammoth";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agents,
  creatorProfiles,
  eceSessions,
  eceUsers,
  mindbaseApiKeys,
  mindbaseBrainEvents,
  mindbaseCreditsLedger,
  mindbaseEmailMessages,
  mindbaseEmailThreads,
  mindbaseMindbases,
  mindbaseOrganizationUsers,
  mindbaseOrganizations,
  mindbaseProfileDrafts,
  mindbaseUserRoles,
  intellectConversations,
  intellectKnowledgeChunks,
  intellectKnowledgeFiles,
  intellectMessages,
  intellects,
  mindbaseUsageEvents,
  mindbaseWorkspaceAgents,
  mindbaseWorkspaceMembers,
  mindbaseWorkspaces,
  payments,
} from "@db/schema";

import type { TenantKey } from "../lib/tenants";
import { getOpenAIClient } from "../lib/openai";
import {
  getFlutterwaveKeys,
  getFlutterwaveMode,
  getFlutterwaveKeyEnvVarNames,
  verifyFlutterwaveWebhookSignature,
} from "../lib/flutterwave/config";
import {
  buildFlutterwaveTxRef,
  flutterwaveInitPayment,
  flutterwaveVerifyTransaction,
} from "../lib/flutterwave/service";
import {
  getKkiapayConfig,
  getKkiapayPublicKeyEnvVarNames,
  getRequestOrigin,
  parseKkiapayWebhook,
  verifyKkiapayWebhookSignature,
} from "../lib/kkiapay/config";
import { kkiapayVerifyTransaction } from "../lib/kkiapay/push";
import { ensureMindbaseTables, isMindbaseVectorEnabled } from "../lib/mindbase/ensureTables";
import { listPublicMindbaseMarketplaceAssets } from "../lib/mindbase/intelligenceMarketplace";
import { signMindbaseToken, verifyMindbaseToken } from "../lib/mindbase/jwt";
import { createMindbaseOrganization } from "../lib/mindbase/organizations";
import {
  buildMindbaseSystemPrompt,
  chunkKnowledgeText,
  computeCreditsCostPerMessage,
  selectWorkspaceAgentRoute,
} from "../lib/mindbase/prompting";
import { creditWallet, debitWallet, getWalletBalance } from "../lib/wallet/ledger";
import { getOrCreateWalletAccount } from "../lib/wallet/wallet";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";

const router = Router();

type SessionUser = {
  id: number;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  currentMode?: string | null;
};

type MindbaseRole = "admin" | "creator" | "client";

const MAX_UPLOAD_FILE_SIZE = Math.max(
  1,
  Number.parseInt(String(process.env.MINDBASE_UPLOAD_MAX_BYTES || 20 * 1024 * 1024), 10) || 20 * 1024 * 1024,
);
const knowledgeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_FILE_SIZE } });
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const ACCESS_TOKEN_TTL = Math.max(300, Number.parseInt(String(process.env.MINDBASE_JWT_ACCESS_TTL_SEC || 3600), 10) || 3600);
const REFRESH_TOKEN_TTL = Math.max(
  3600,
  Number.parseInt(String(process.env.MINDBASE_JWT_REFRESH_TTL_SEC || 7 * 24 * 3600), 10) || 7 * 24 * 3600,
);
const REQUESTS_PER_MINUTE_DEFAULT = Math.max(
  5,
  Number.parseInt(String(process.env.MINDBASE_RATE_LIMIT_PER_MINUTE || 90), 10) || 90,
);

function getBearerToken(req: any) {
  const header = String(req?.headers?.authorization || "").trim();
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timingSafeEqualHex(a: string, b: string) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function consumeRateLimit(input: { key: string; limit?: number; windowMs?: number }) {
  const now = Date.now();
  const limit = Math.max(1, input.limit || REQUESTS_PER_MINUTE_DEFAULT);
  const windowMs = Math.max(1000, input.windowMs || 60_000);
  const current = rateLimitBuckets.get(input.key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(input.key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }
  current.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

function checkRateLimit(req: any, res: any, key: string, limit?: number, windowMs?: number) {
  const identity =
    String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown";
  const bucket = consumeRateLimit({
    key: `${key}:${identity}`,
    limit,
    windowMs,
  });
  if (bucket.allowed) return true;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({ ok: false, message: "Rate limit exceeded", retry_after_sec: retryAfter });
  return false;
}

async function ensureMindbaseRole(input: { tenantId: number; userId: number; role: MindbaseRole }) {
  const existing = await db.query.mindbaseUserRoles.findFirst({
    where: and(
      eq(mindbaseUserRoles.tenantId, input.tenantId),
      eq(mindbaseUserRoles.userId, input.userId),
      eq(mindbaseUserRoles.role, input.role),
    ),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(mindbaseUserRoles)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      role: input.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

async function listMindbaseRoles(tenantId: number, userId: number): Promise<MindbaseRole[]> {
  const rows = await db.query.mindbaseUserRoles.findMany({
    where: and(eq(mindbaseUserRoles.tenantId, tenantId), eq(mindbaseUserRoles.userId, userId)),
    columns: { role: true },
    limit: 10,
  });
  const values = rows.map((row) => String(row.role || "").trim() as MindbaseRole).filter(Boolean);
  return Array.from(new Set(values));
}

function asText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function envPresent(key: string) {
  return Boolean(String(process.env[key] || "").trim());
}

function envTruthy(key: string) {
  return ["1", "true", "yes", "y", "on"].includes(String(process.env[key] || "").trim().toLowerCase());
}

function missingEnv(keys: string[]) {
  return keys.filter((key) => !envPresent(key));
}

function integrationStatus(input: {
  id: string;
  provider: string;
  requiredEnv?: string[];
  enabled?: boolean;
  statusWhenEnabled?: string;
  disabledReason?: string;
  adminPath?: string;
  connectUrl?: string;
}) {
  const requiredEnv = input.requiredEnv || [];
  const missing = missingEnv(requiredEnv);
  const enabled = Boolean(input.enabled) && missing.length === 0;
  return {
    id: input.id,
    provider: input.provider,
    enabled,
    configured: missing.length === 0,
    status: enabled ? input.statusWhenEnabled || "Ready to connect" : "Not enabled",
    missingEnv: missing,
    message: enabled
      ? `${input.provider} is configured for this environment.`
      : input.disabledReason || "This integration is not enabled yet in this environment.",
    adminPath: input.adminPath || "/admin/mindbase/integrations",
    connectUrl: input.connectUrl,
  };
}

function firstPresentEnv(keys: string[]) {
  return keys.find((key) => envPresent(key)) || null;
}

function envGroupMissing(keys: string[]) {
  return keys.filter((key) => !envPresent(key));
}

function envAlternativesConfigured(groups: string[][]) {
  return groups.some((group) => group.every((key) => envPresent(key)));
}

function configuredEmailProvider() {
  if (envPresent("RESEND_API_KEY")) return { provider: "Resend", configured: true, missingEnv: [] as string[] };
  if (envPresent("SENDGRID_API_KEY")) return { provider: "SendGrid", configured: true, missingEnv: [] as string[] };
  if (envPresent("MAILGUN_API_KEY")) return { provider: "Mailgun", configured: true, missingEnv: [] as string[] };
  if (envTruthy("MAIL_SMTP_SENDMAIL")) return { provider: "sendmail", configured: true, missingEnv: [] as string[] };
  if (
    envPresent("MAIL_SMTP_HOST") &&
    (envTruthy("MAIL_SMTP_ALLOW_NO_AUTH") || (envPresent("MAIL_SMTP_USER") && envPresent("MAIL_SMTP_PASS")))
  ) {
    return { provider: "SMTP", configured: true, missingEnv: [] as string[] };
  }
  if (envPresent("SMTP_HOST") && envPresent("SMTP_USER") && envPresent("SMTP_PASS")) {
    return { provider: "SMTP", configured: true, missingEnv: [] as string[] };
  }
  return { provider: "SMTP", configured: false, missingEnv: ["MAIL_SMTP_HOST", "MAIL_SMTP_USER", "MAIL_SMTP_PASS"] };
}

const MINDBASE_PAYMENT_PLANS = [
  {
    id: "free",
    name: "Free",
    monthlyXof: 0,
    limits: ["1 workspace", "1 guide agent", "limited messages", "limited uploads"],
    checkoutRequired: false,
  },
  {
    id: "starter",
    name: "Starter",
    monthlyXof: 15000,
    limits: ["1 workspace", "5 agents", "basic integrations", "small usage limit"],
    checkoutRequired: true,
  },
  {
    id: "team",
    name: "Team",
    monthlyXof: 49000,
    limits: ["multiple users", "15 agents", "Gmail/Drive/Calendar", "tasks and workflows"],
    checkoutRequired: true,
  },
  {
    id: "business",
    name: "Business",
    monthlyXof: 149000,
    limits: ["50+ agents", "WhatsApp", "advanced automations", "audit logs", "priority support"],
    checkoutRequired: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyXof: null,
    limits: ["custom deployment", "custom agents", "custom compliance", "dedicated support"],
    checkoutRequired: false,
  },
];

function normalizePaymentProvider() {
  const provider = String(process.env.PAYMENT_PROVIDER || process.env.MINDBASE_PAYMENT_PROVIDER || "").trim().toLowerCase();
  if (provider === "flutterwave" || provider === "flw") return "flutterwave";
  if (provider === "kkiapay" || provider === "kiki" || provider === "kkiapay") return "kkiapay";
  if (provider === "manual" || provider === "free" || provider === "none") return "manual";
  return "manual";
}

function buildPaymentStatus(tenantKeyInput: string) {
  const tenantKey = (tenantKeyInput || "mindbase") as TenantKey;
  const selectedProvider = normalizePaymentProvider();

  const flutterwave = (() => {
    const mode = getFlutterwaveMode(tenantKey);
    const keys = getFlutterwaveKeys(tenantKey);
    const names = getFlutterwaveKeyEnvVarNames(tenantKey, mode);
    const requiredEnv =
      keys.version === "v4"
        ? ["FLUTTERWAVE_CLIENT_ID", "FLUTTERWAVE_CLIENT_SECRET", "FLUTTERWAVE_ENCRYPTION_KEY", "FLUTTERWAVE_WEBHOOK_SECRET"]
        : ["FLUTTERWAVE_SECRET_KEY", "FLUTTERWAVE_WEBHOOK_SECRET"];
    const publicKeyPresent = Boolean(keys.publicKey || firstPresentEnv(names.publicKey));
    const webhookPresent = Boolean(keys.webhookHash || envPresent("FLUTTERWAVE_WEBHOOK_SECRET") || envPresent("FLW_WEBHOOK_SECRET"));
    const configured =
      keys.version === "v4"
        ? Boolean(keys.clientId && keys.clientSecret && keys.encryptionKey && webhookPresent)
        : Boolean(keys.secretKey && webhookPresent);
    const missingEnv =
      keys.version === "v4"
        ? [
            ...(keys.clientId ? [] : ["FLUTTERWAVE_CLIENT_ID"]),
            ...(keys.clientSecret ? [] : ["FLUTTERWAVE_CLIENT_SECRET"]),
            ...(keys.encryptionKey ? [] : ["FLUTTERWAVE_ENCRYPTION_KEY"]),
            ...(webhookPresent ? [] : ["FLUTTERWAVE_WEBHOOK_SECRET"]),
          ]
        : [
            ...(keys.secretKey ? [] : ["FLUTTERWAVE_SECRET_KEY"]),
            ...(webhookPresent ? [] : ["FLUTTERWAVE_WEBHOOK_SECRET"]),
          ];
    return {
      id: "flutterwave",
      provider: "Flutterwave",
      mode,
      apiVersion: keys.version,
      configured,
      publicKeyPresent,
      webhookConfigured: webhookPresent,
      missingEnv,
      requiredEnv,
      message: configured
        ? "Flutterwave keys and webhook secret are configured."
        : "Flutterwave checkout is not ready. Add the missing keys and verify the webhook secret before enabling paid access.",
    };
  })();

  const kkiapay = (() => {
    const keys = getKkiapayConfig(tenantKey);
    const publicKeyNames = getKkiapayPublicKeyEnvVarNames(tenantKey, keys.mode);
    const publicKeyPresent = Boolean(keys.publicKey || firstPresentEnv(publicKeyNames));
    const configured = Boolean(keys.publicKey && keys.privateKey && keys.secret);
    const missingEnv = [
      ...(keys.publicKey ? [] : ["KKIAPAY_PUBLIC_KEY"]),
      ...(keys.privateKey ? [] : ["KKIAPAY_PRIVATE_KEY"]),
      ...(keys.secret ? [] : ["KKIAPAY_SECRET_KEY"]),
    ];
    return {
      id: "kkiapay",
      provider: "Kkiapay",
      mode: keys.mode,
      configured,
      publicKeyPresent,
      webhookConfigured: Boolean(keys.secret),
      missingEnv,
      requiredEnv: ["KKIAPAY_PUBLIC_KEY", "KKIAPAY_PRIVATE_KEY", "KKIAPAY_SECRET_KEY", "KKIAPAY_SANDBOX"],
      message: configured
        ? "Kkiapay keys are configured."
        : "Kkiapay checkout is not ready. Add public, private, and secret keys before enabling paid access.",
    };
  })();

  const selected =
    selectedProvider === "flutterwave" ? flutterwave : selectedProvider === "kkiapay" ? kkiapay : null;
  const checkoutEnabled = Boolean(selected?.configured);
  return {
    provider: selectedProvider,
    checkoutEnabled,
    manualFallbackEnabled: true,
    status: checkoutEnabled
      ? `${selected?.provider} checkout configured`
      : selectedProvider === "manual"
        ? "Manual/free plan only"
        : `${selected?.provider || selectedProvider} checkout not configured`,
    message: checkoutEnabled
      ? "Paid checkout can start, but paid entitlements must still be granted only after server-side verification and webhook processing."
      : selectedProvider === "manual"
        ? "MindBase can run Free/manual plans, but paid checkout is not enabled in this environment."
        : "Paid checkout is gated until the selected provider is fully configured.",
    providers: {
      flutterwave,
      kkiapay,
      manual: {
        id: "manual",
        provider: "Manual/free fallback",
        configured: true,
        missingEnv: [] as string[],
        message: "Users can continue on the Free plan or be handled manually without fake payment success.",
      },
    },
    plans: MINDBASE_PAYMENT_PLANS,
    missingEnv: selected?.missingEnv || [],
  };
}

type MindbasePaymentPlan = (typeof MINDBASE_PAYMENT_PLANS)[number];
type MindbasePaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "cancelled" | "refunded";

const MINDBASE_PAYMENT_PURPOSE = "MINDBASE_PLAN";

function getMindbasePlan(planIdInput: unknown): MindbasePaymentPlan | null {
  const planId = String(planIdInput ?? "")
    .trim()
    .toLowerCase();
  return MINDBASE_PAYMENT_PLANS.find((plan) => plan.id === planId) || null;
}

function normalizeCurrency(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw && /^[A-Z]{3}$/.test(raw) ? raw : "XOF";
}

function mapMindbasePlanToOrganizationPlan(planId: string) {
  if (planId === "enterprise") return "enterprise";
  if (planId === "team" || planId === "business") return "growth";
  return "starter";
}

function buildMindbasePlanEntitlement(plan: MindbasePaymentPlan) {
  return {
    planId: plan.id,
    planName: plan.name,
    limits: plan.limits,
    checkoutRequired: plan.checkoutRequired,
    monthlyXof: plan.monthlyXof,
  };
}

function paymentMetadata(row: typeof payments.$inferSelect | null | undefined) {
  return ((row as any)?.metadata && typeof (row as any).metadata === "object" ? ((row as any).metadata as Record<string, any>) : {}) || {};
}

function organizationMetadata(row: typeof mindbaseOrganizations.$inferSelect | null | undefined) {
  return ((row as any)?.metadata && typeof (row as any).metadata === "object" ? ((row as any).metadata as Record<string, any>) : {}) || {};
}

function normalizeGatewayPaymentStatus(value: unknown): MindbasePaymentStatus | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("success") || raw.includes("paid") || raw.includes("complete")) return "succeeded";
  if (raw.includes("refund")) return "refunded";
  if (raw.includes("cancel")) return "cancelled";
  if (raw.includes("fail") || raw.includes("error")) return "failed";
  if (raw.includes("process")) return "processing";
  if (raw.includes("pend")) return "pending";
  return null;
}

function getWebhookHashForFlutterwave(keys: ReturnType<typeof getFlutterwaveKeys>) {
  return (
    keys.webhookHash ||
    String(process.env.FLUTTERWAVE_WEBHOOK_SECRET || "").trim() ||
    String(process.env.FLW_WEBHOOK_SECRET || "").trim() ||
    null
  );
}

function getMindbasePublicOrigin(req: any) {
  return (
    getRequestOrigin(req) ||
    asText(process.env.MINDBASE_PUBLIC_URL) ||
    asText(process.env.PUBLIC_BASE_URL) ||
    asText(process.env.APP_BASE_URL) ||
    "http://localhost:5000"
  );
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ unserializable: true });
  }
}

function rowsFromSqlResult<T = any>(result: unknown): T[] {
  const rows = (result as any)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function serializeMindbasePayment(row: typeof payments.$inferSelect | null | undefined) {
  if (!row) return null;
  const metadata = paymentMetadata(row);
  return {
    id: row.id,
    provider: row.provider,
    purpose: row.purpose,
    targetType: row.targetType,
    targetId: row.targetId,
    planId: metadata.planId || null,
    status: row.status,
    amount: Number(row.amount || 0),
    currency: row.currency,
    providerTransactionId: row.providerTransactionId || null,
    providerTransactionRef: row.providerTransactionRef || null,
    creditedAt: row.creditedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveAccessibleMindbaseOrganization(input: {
  tenantId: number;
  userId: number;
  organizationId?: string | null;
}) {
  const organizationId = asText(input.organizationId);
  const membershipFilters = [
    eq(mindbaseOrganizationUsers.tenantId, input.tenantId),
    eq(mindbaseOrganizationUsers.userId, input.userId),
  ];
  if (organizationId) membershipFilters.push(eq(mindbaseOrganizationUsers.organizationId, organizationId));

  const membership = await db.query.mindbaseOrganizationUsers.findFirst({
    where: and(...membershipFilters),
    orderBy: [desc(mindbaseOrganizationUsers.updatedAt)],
  });

  const organization = organizationId
    ? await db.query.mindbaseOrganizations.findFirst({
        where: and(eq(mindbaseOrganizations.tenantId, input.tenantId), eq(mindbaseOrganizations.id, organizationId)),
      })
    : membership
      ? await db.query.mindbaseOrganizations.findFirst({
          where: and(eq(mindbaseOrganizations.tenantId, input.tenantId), eq(mindbaseOrganizations.id, membership.organizationId)),
        })
      : await db.query.mindbaseOrganizations.findFirst({
          where: and(eq(mindbaseOrganizations.tenantId, input.tenantId), eq(mindbaseOrganizations.ownerUserId, input.userId)),
          orderBy: [desc(mindbaseOrganizations.updatedAt)],
        });

  if (!organization) return null;
  const isOwner = Number(organization.ownerUserId) === Number(input.userId);
  if (!isOwner && !membership) return null;
  return {
    organization,
    membershipRole: membership?.role || (isOwner ? "owner" : "member"),
  };
}

async function applyMindbaseFreePlan(input: {
  tenantId: number;
  userId: number;
  organization: typeof mindbaseOrganizations.$inferSelect;
}) {
  const plan = getMindbasePlan("free")!;
  const metadata = organizationMetadata(input.organization);
  const activatedAt = new Date().toISOString();
  const entitlement = {
    ...buildMindbasePlanEntitlement(plan),
    status: "active",
    provider: "manual",
    paymentId: null,
    activatedAt,
  };

  const [updated] = await db
    .update(mindbaseOrganizations)
    .set({
      plan: mapMindbasePlanToOrganizationPlan(plan.id) as any,
      status: input.organization.status === "draft" || input.organization.status === "onboarding" ? "active" : input.organization.status,
      metadata: {
        ...metadata,
        activePlan: plan.id,
        planStatus: "active",
        paymentProvider: "manual",
        entitlement,
      },
      updatedAt: new Date(),
    })
    .where(and(eq(mindbaseOrganizations.tenantId, input.tenantId), eq(mindbaseOrganizations.id, input.organization.id)))
    .returning();

  await db.execute(sql`
    insert into mindbase_events (tenant_id, organization_id, actor_user_id, event_type, status, payload)
    values (
      ${input.tenantId},
      ${input.organization.id},
      ${input.userId},
      'payment.free_plan_selected',
      'completed',
      ${safeJsonStringify({ planId: plan.id, activatedAt })}::jsonb
    )
  `);

  return { organization: updated || input.organization, entitlement };
}

async function applyMindbasePaymentEntitlement(input: {
  tenantId: number;
  paymentRow: typeof payments.$inferSelect;
  source: string;
}) {
  const metadata = paymentMetadata(input.paymentRow);
  const plan = getMindbasePlan(metadata.planId);
  if (!plan || !plan.checkoutRequired) return null;
  if (String(input.paymentRow.status || "").toLowerCase() !== "succeeded") return null;

  const organizationId = asText(metadata.organizationId) || asText(input.paymentRow.targetId);
  if (!organizationId) return null;
  const organization = await db.query.mindbaseOrganizations.findFirst({
    where: and(eq(mindbaseOrganizations.tenantId, input.tenantId), eq(mindbaseOrganizations.id, organizationId)),
  });
  if (!organization) return null;

  const orgMetadata = organizationMetadata(organization);
  const existingEntitlement = (orgMetadata.entitlement && typeof orgMetadata.entitlement === "object" ? orgMetadata.entitlement : {}) as Record<string, any>;
  const alreadyApplied = String(existingEntitlement.paymentId || "") === String(input.paymentRow.id);
  const activatedAt = alreadyApplied ? String(existingEntitlement.activatedAt || new Date().toISOString()) : new Date().toISOString();
  const entitlement = {
    ...buildMindbasePlanEntitlement(plan),
    status: "active",
    provider: input.paymentRow.provider,
    paymentId: input.paymentRow.id,
    paymentStatus: input.paymentRow.status,
    amount: Number(input.paymentRow.amount || 0),
    currency: input.paymentRow.currency,
    activatedAt,
    source: input.source,
  };

  const [updated] = await db
    .update(mindbaseOrganizations)
    .set({
      plan: mapMindbasePlanToOrganizationPlan(plan.id) as any,
      status: organization.status === "draft" || organization.status === "onboarding" ? "active" : organization.status,
      metadata: {
        ...orgMetadata,
        activePlan: plan.id,
        planStatus: "active",
        paymentProvider: input.paymentRow.provider,
        entitlement,
        lastPaymentId: input.paymentRow.id,
      },
      updatedAt: new Date(),
    })
    .where(and(eq(mindbaseOrganizations.tenantId, input.tenantId), eq(mindbaseOrganizations.id, organization.id)))
    .returning();

  if (!alreadyApplied) {
    await db.execute(sql`
      insert into mindbase_events (tenant_id, organization_id, actor_user_id, event_type, status, payload)
      values (
        ${input.tenantId},
        ${organization.id},
        ${Number(input.paymentRow.userId || 0) || null},
        'payment.entitlement_activated',
        'completed',
        ${safeJsonStringify({
          planId: plan.id,
          paymentId: input.paymentRow.id,
          provider: input.paymentRow.provider,
          source: input.source,
          activatedAt,
        })}::jsonb
      )
    `);
  }

  return { organization: updated || organization, entitlement, duplicate: alreadyApplied };
}

async function recordMindbasePaymentEvent(input: {
  tenantId: number;
  provider: string;
  providerEventId: string;
  status: string;
  paymentId?: string | null;
  organizationId?: string | null;
  rawPayload: unknown;
}) {
  const providerEventId =
    asText(input.providerEventId) ||
    `${input.provider}:${input.paymentId || "unknown"}:${sha256Hex(safeJsonStringify(input.rawPayload)).slice(0, 24)}`;
  const rawPayload = safeJsonStringify(input.rawPayload);
  const inserted = await db.execute(sql`
    insert into mindbase_payment_events (
      tenant_id,
      payment_id,
      organization_id,
      provider,
      provider_event_id,
      status,
      raw_payload,
      created_at
    )
    values (
      ${input.tenantId},
      ${input.paymentId || null},
      ${input.organizationId || null},
      ${input.provider},
      ${providerEventId},
      ${input.status},
      ${rawPayload}::jsonb,
      now()
    )
    on conflict (tenant_id, provider, provider_event_id) do nothing
    returning id, processed_at
  `);
  const insertedRows = rowsFromSqlResult<{ id: string; processed_at?: Date | string | null }>(inserted);
  if (insertedRows.length) {
    return { duplicate: false, providerEventId };
  }
  const existing = await db.execute(sql`
    select id, processed_at
    from mindbase_payment_events
    where tenant_id = ${input.tenantId}
      and provider = ${input.provider}
      and provider_event_id = ${providerEventId}
    limit 1
  `);
  const rows = rowsFromSqlResult<{ id: string; processed_at?: Date | string | null }>(existing);
  return { duplicate: Boolean(rows[0]?.processed_at), providerEventId };
}

async function markMindbasePaymentEventProcessed(input: {
  tenantId: number;
  provider: string;
  providerEventId: string;
  status: string;
  error?: string | null;
}) {
  await db.execute(sql`
    update mindbase_payment_events
    set status = ${input.status},
        processing_error = ${input.error || null},
        processed_at = now()
    where tenant_id = ${input.tenantId}
      and provider = ${input.provider}
      and provider_event_id = ${input.providerEventId}
  `);
}

async function updateMindbasePaymentFromGateway(input: {
  tenantId: number;
  paymentRow: typeof payments.$inferSelect;
  status: MindbasePaymentStatus;
  providerTransactionId?: string | null;
  providerTransactionRef?: string | null;
  rawPayload?: unknown;
  source: string;
}) {
  const providerTransactionId = asText(input.providerTransactionId) || input.paymentRow.providerTransactionId || null;
  const providerTransactionRef = asText(input.providerTransactionRef) || input.paymentRow.providerTransactionRef || null;
  const [updated] = await db
    .update(payments)
    .set({
      status: input.status as any,
      providerTransactionId,
      providerTransactionRef,
      providerPayload: input.rawPayload !== undefined ? (input.rawPayload as any) : input.paymentRow.providerPayload,
      creditedAt:
        input.status === "succeeded"
          ? input.paymentRow.creditedAt || new Date()
          : input.paymentRow.creditedAt || null,
      metadata: {
        ...paymentMetadata(input.paymentRow),
        lastStatusSource: input.source,
        lastStatusAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    } as any)
    .where(and(eq(payments.id, input.paymentRow.id), eq(payments.tenantId, input.tenantId)))
    .returning();

  const payment = updated || input.paymentRow;
  const entitlement = input.status === "succeeded" ? await applyMindbasePaymentEntitlement({ tenantId: input.tenantId, paymentRow: payment, source: input.source }) : null;
  return { payment, entitlement };
}

async function verifyMindbasePaymentWithGateway(input: {
  tenantId: number;
  tenantKey: TenantKey;
  paymentRow: typeof payments.$inferSelect;
  transactionId?: string | null;
  txRef?: string | null;
  source: string;
}) {
  const provider = String(input.paymentRow.provider || "").toLowerCase();
  if (provider === "flutterwave") {
    const keys = getFlutterwaveKeys(input.tenantKey);
    if (!keys.secretKey) {
      throw new Error("Flutterwave hosted verification requires FLUTTERWAVE_SECRET_KEY.");
    }
    const verified = await flutterwaveVerifyTransaction({
      mode: keys.mode,
      secretKey: keys.secretKey,
      transactionId: asText(input.transactionId) || input.paymentRow.providerTransactionId || null,
      txRef: asText(input.txRef) || input.paymentRow.providerTransactionRef || null,
    });
    if (verified.amount !== null && Number(input.paymentRow.amount) !== Math.round(Number(verified.amount))) {
      throw new Error("Payment amount mismatch.");
    }
    if (verified.currency && String(verified.currency).toUpperCase() !== String(input.paymentRow.currency || "XOF").toUpperCase()) {
      throw new Error("Payment currency mismatch.");
    }
    if (
      input.paymentRow.providerTransactionRef &&
      verified.txRef &&
      String(verified.txRef) !== String(input.paymentRow.providerTransactionRef)
    ) {
      throw new Error("Payment reference mismatch.");
    }
    return updateMindbasePaymentFromGateway({
      tenantId: input.tenantId,
      paymentRow: input.paymentRow,
      status: verified.normalizedStatus,
      providerTransactionId: verified.transactionId,
      providerTransactionRef: verified.txRef,
      rawPayload: verified.raw,
      source: input.source,
    });
  }

  if (provider === "kkiapay") {
    const transactionId = asText(input.transactionId) || input.paymentRow.providerTransactionId || null;
    if (!transactionId) {
      return { payment: input.paymentRow, entitlement: null, pendingReason: "Kkiapay transaction id is not available yet." };
    }
    const config = getKkiapayConfig(input.tenantKey);
    if (!config.publicKey || !config.privateKey || !config.secret) {
      throw new Error("Kkiapay verification requires public, private, and secret keys.");
    }
    const verified = await kkiapayVerifyTransaction({
      transactionId,
      mode: config.mode,
      publicKey: config.publicKey,
      privateKey: config.privateKey,
      secret: config.secret,
    });
    return updateMindbasePaymentFromGateway({
      tenantId: input.tenantId,
      paymentRow: input.paymentRow,
      status: verified.normalizedStatus as MindbasePaymentStatus,
      providerTransactionId: transactionId,
      rawPayload: verified.raw,
      source: input.source,
    });
  }

  throw new Error(`Unsupported MindBase payment provider: ${provider || "unknown"}`);
}

function buildMindbaseIntegrationStatuses() {
  const googleEnv = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"];
  const microsoftEnv = ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_REDIRECT_URI"];
  const whatsappEnv = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"];
  const email = configuredEmailProvider();

  const googleOauthConfigured = envTruthy("MINDBASE_GOOGLE_OAUTH_ENABLED");
  const microsoftOauthConfigured = envTruthy("MINDBASE_MICROSOFT_OAUTH_ENABLED");
  const whatsappConfigured = envTruthy("MINDBASE_WHATSAPP_ENABLED");

  return {
    gmail: integrationStatus({
      id: "gmail",
      provider: "Google Gmail",
      requiredEnv: googleEnv,
      enabled: false,
      disabledReason: googleOauthConfigured
        ? "Google OAuth keys are present, but the MindBase Gmail OAuth callback/storage flow is not enabled yet."
        : "Gmail is not enabled yet in this environment. Configure Google OAuth and enable MINDBASE_GOOGLE_OAUTH_ENABLED before starting the connection flow.",
    }),
    calendar: integrationStatus({
      id: "calendar",
      provider: "Google Calendar",
      requiredEnv: googleEnv,
      enabled: false,
      disabledReason: googleOauthConfigured
        ? "Google OAuth keys are present, but the MindBase Calendar OAuth callback/storage flow is not enabled yet."
        : "Calendar is not enabled yet in this environment. Configure Google OAuth and enable MINDBASE_GOOGLE_OAUTH_ENABLED before starting the connection flow.",
    }),
    drive: integrationStatus({
      id: "drive",
      provider: "Google Drive",
      requiredEnv: googleEnv,
      enabled: false,
      disabledReason: googleOauthConfigured
        ? "Google OAuth keys are present, but the MindBase Drive OAuth callback/storage flow is not enabled yet."
        : "Google Drive is not enabled yet in this environment. Configure Google OAuth and enable MINDBASE_GOOGLE_OAUTH_ENABLED before starting the connection flow.",
    }),
    microsoft: integrationStatus({
      id: "microsoft",
      provider: "Microsoft",
      requiredEnv: microsoftEnv,
      enabled: false,
      disabledReason: microsoftOauthConfigured
        ? "Microsoft OAuth keys are present, but the MindBase Microsoft callback/storage flow is not enabled yet."
        : "Microsoft sign-in and Outlook are not enabled yet in this environment. Configure Microsoft OAuth and enable MINDBASE_MICROSOFT_OAUTH_ENABLED first.",
    }),
    whatsapp: integrationStatus({
      id: "whatsapp",
      provider: "WhatsApp Business",
      requiredEnv: whatsappEnv,
      enabled: false,
      disabledReason: whatsappConfigured
        ? "WhatsApp keys are present, but MindBase workspace routing and approval flow are not enabled yet."
        : "WhatsApp is not enabled yet in this environment. Configure the WhatsApp Business API keys and enable MINDBASE_WHATSAPP_ENABLED before agents can use it.",
    }),
    email: {
      id: "email",
      provider: email.provider,
      enabled: email.configured,
      configured: email.configured,
      status: email.configured ? "Configured" : "Not enabled",
      missingEnv: email.missingEnv,
      message: email.configured
        ? "Transactional email is configured for this environment."
        : "Email sending is not enabled yet in this environment.",
      adminPath: "/admin/email",
    },
    team: {
      id: "team",
      provider: "MindBase team invitations",
      enabled: false,
      configured: false,
      status: "Not enabled",
      missingEnv: [] as string[],
      message: "Team invitations are not enabled in the chat onboarding flow yet.",
      adminPath: "/admin/mindbase/settings",
    },
    documents: {
      id: "documents",
      provider: "MindBase company brain",
      enabled: true,
      configured: true,
      status: "Ready",
      missingEnv: [] as string[],
      message: "Chat-first workspace document upload is enabled. Files are stored, parsed, attached to the workspace, and cited in agent replies when used.",
      adminPath: "/admin/mindbase/settings",
    },
    crm: {
      id: "crm",
      provider: "MindBase customer list",
      enabled: false,
      configured: false,
      status: "Not enabled",
      missingEnv: [] as string[],
      message: "Customer/CRM import is not enabled in the chat onboarding flow yet.",
      adminPath: "/admin/mindbase/settings",
    },
  };
}

function uniqueMissingEnvFromStatuses(statuses: Record<string, any>) {
  const missing = new Set<string>();
  for (const value of Object.values(statuses)) {
    const keys = Array.isArray((value as any)?.missingEnv) ? (value as any).missingEnv : [];
    for (const key of keys) {
      const normalized = String(key || "").trim();
      if (normalized) missing.add(normalized);
    }
  }
  return Array.from(missing).sort();
}

function toInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean);
      }
    } catch {
      // ignore JSON parse failures
    }
    return trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function slugify(input: string) {
  const normalized = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || `intellect-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeRoleLabel(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAdminPrivileges(user: SessionUser | null) {
  if (!user) return false;
  const roles = Array.isArray(user.roles) ? user.roles.map((role) => normalizeRoleLabel(role)) : [];
  const permissions = Array.isArray(user.permissions) ? user.permissions.map((permission) => String(permission ?? "").trim()) : [];
  const mode = normalizeRoleLabel(user.currentMode || "");
  return (
    mode === "admin" ||
    permissions.includes("*") ||
    permissions.includes("admin:*") ||
    roles.includes("admin") ||
    roles.includes("chairman") ||
    roles.includes("chairman assistant") ||
    roles.includes("super admin") ||
    roles.includes("platform admin")
  );
}

function buildSystemPromptFromDraft(input: {
  name: string;
  description?: string | null;
  personaRole?: string | null;
  personaTone?: string | null;
  personaRules?: string[];
  styleConstraints?: string[];
}) {
  return buildMindbaseSystemPrompt(input);
}

function safeChunkText(input: string) {
  return chunkKnowledgeText(input);
}

const LAUNCH_STARTER_AGENTS = [
  {
    id: "adjoa",
    name: "Adjoa",
    role: "MindBase Guide",
    purpose: "Guides onboarding, creates your workspace, and recommends the right AI team.",
    category: "guide",
    needs: ["Founder name", "Company name", "Business type"],
    requiredIntegrations: [],
  },
  {
    id: "awa",
    name: "Awa",
    role: "Executive Assistant",
    purpose: "Manages inbox follow-ups, meetings, reminders, and decisions.",
    category: "operations",
    needs: ["Gmail or Outlook", "Calendar", "Founder priorities"],
    requiredIntegrations: ["gmail", "calendar"],
  },
  {
    id: "kwame",
    name: "Kwame",
    role: "Operations Manager",
    purpose: "Turns goals into tasks, workflows, blockers, and execution plans.",
    category: "operations",
    needs: ["Company structure", "Projects", "Team members"],
    requiredIntegrations: [],
  },
  {
    id: "aminata",
    name: "Aminata",
    role: "Marketing Agent",
    purpose: "Creates campaigns, content plans, social posts, and brand messaging.",
    category: "marketing",
    needs: ["Target customers", "Offer description", "Brand tone"],
    requiredIntegrations: ["documents"],
  },
  {
    id: "idriss",
    name: "Idriss",
    role: "Sales Agent",
    purpose: "Tracks leads, prepares offers, follows up, and helps close opportunities.",
    category: "sales",
    needs: ["Customer list", "Pipeline", "Offer details"],
    requiredIntegrations: ["crm"],
  },
  {
    id: "nene",
    name: "Néné",
    role: "Accounting Agent",
    purpose: "Tracks invoices, expenses, revenue, cashflow, and finance reminders.",
    category: "finance",
    needs: ["Revenue model", "Currency", "Invoices and expenses"],
    requiredIntegrations: ["documents"],
  },
] as const;

async function parsePdfText(buffer: Buffer) {
  const moduleValue = (await import("pdf-parse")) as {
    default?: (input: Buffer) => Promise<{ text?: string | null }>;
    PDFParse?: new (options: { data: Buffer }) => {
      getText: () => Promise<{ text?: string | null }>;
      destroy?: () => Promise<void> | void;
    };
  };

  if (typeof moduleValue.default === "function") {
    const parsed = await moduleValue.default(buffer);
    return String(parsed?.text || "").trim();
  }

  if (typeof moduleValue.PDFParse === "function") {
    const parser = new moduleValue.PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return String(parsed?.text || "").trim();
    } finally {
      await Promise.resolve(parser.destroy?.());
    }
  }

  throw new Error("PDF parser module is not available in this runtime");
}

async function parseXlsxText(buffer: Buffer) {
  const xlsx = (await import("xlsx")) as {
    read: (data: Buffer, opts?: Record<string, unknown>) => {
      SheetNames: string[];
      Sheets: Record<string, unknown>;
    };
    utils: {
      sheet_to_csv: (sheet: unknown, opts?: Record<string, unknown>) => string;
    };
  };
  const workbook = xlsx.read(buffer, { type: "buffer", dense: true, cellDates: false });
  const textBlocks = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return "";
    const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
    if (!csv.trim()) return "";
    return `# Sheet: ${sheetName}\n${csv.trim()}`;
  }).filter(Boolean);
  return textBlocks.join("\n\n");
}

async function extractFileText(file: Express.Multer.File) {
  const mime = String(file.mimetype || "").toLowerCase();
  const filename = String(file.originalname || "file");
  const lowered = filename.toLowerCase();

  if (mime.includes("text") || lowered.endsWith(".txt") || lowered.endsWith(".md")) {
    return file.buffer.toString("utf8").trim();
  }

  if (mime.includes("pdf") || lowered.endsWith(".pdf")) {
    return parsePdfText(file.buffer);
  }

  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    lowered.endsWith(".docx") ||
    lowered.endsWith(".doc")
  ) {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    return String(parsed.value || "").trim();
  }

  if (
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    lowered.endsWith(".xlsx") ||
    lowered.endsWith(".xls")
  ) {
    return parseXlsxText(file.buffer);
  }

  throw new Error(`Unsupported file type: ${mime || filename}`);
}

function isAllowedKnowledgeUpload(file: Express.Multer.File) {
  const mime = String(file.mimetype || "").toLowerCase();
  const name = String(file.originalname || "").toLowerCase();
  if (!mime && !name) return false;
  return (
    mime.includes("text") ||
    mime.includes("pdf") ||
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".pdf") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx")
  );
}

function requireTenant(req: any, res: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    res.status(500).json({ ok: false, message: "Tenant not resolved" });
    return null;
  }
  return {
    id: tenantId,
    key: String(req.tenant?.key || "").trim() || "tenant",
  };
}

async function buildSessionUser(input: { userId: number; tenantId: number }) {
  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, input.userId) });
  if (!user) return null;
  const roles = Array.isArray((user as any).roles) ? (user as any).roles.map((value: unknown) => String(value || "")) : [];
  const mbRoles = await listMindbaseRoles(input.tenantId, Number(user.id));
  const mergedRoles = Array.from(new Set([...roles, ...mbRoles]));
  return {
    id: Number(user.id),
    email: String(user.email || ""),
    displayName: String(user.displayName || "User"),
    roles: mergedRoles,
    permissions: Array.isArray((user as any).permissions)
      ? (user as any).permissions.map((value: unknown) => String(value || ""))
      : [],
    currentMode: String((user as any).currentMode || ""),
  } satisfies SessionUser;
}

async function resolveSessionUser(req: any): Promise<SessionUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;

  let jwtClaims: ReturnType<typeof verifyMindbaseToken> = null;
  try {
    jwtClaims = verifyMindbaseToken(token, "access");
  } catch {
    jwtClaims = null;
  }
  if (jwtClaims) {
    return buildSessionUser({ userId: Number(jwtClaims.sub), tenantId });
  }

  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  return buildSessionUser({ userId: Number(session.userId), tenantId });
}

async function requireSessionUser(req: any, res: any): Promise<SessionUser | null> {
  const user = await resolveSessionUser(req);
  if (!user) {
    res.status(401).json({ ok: false, message: "Authentication required" });
    return null;
  }
  return user;
}

async function requireMindbaseRole(req: any, res: any, allowed: MindbaseRole[]) {
  const tenant = requireTenant(req, res);
  if (!tenant) return null;
  const user = await requireSessionUser(req, res);
  if (!user) return null;
  const roles = new Set((await listMindbaseRoles(tenant.id, user.id)).map((entry) => String(entry)));
  if (hasAdminPrivileges(user)) roles.add("admin");
  if (!roles.size) roles.add("client");
  const permitted = allowed.some((role) => roles.has(role));
  if (!permitted) {
    res.status(403).json({ ok: false, message: "Insufficient role for this action" });
    return null;
  }
  return { tenant, user, roles: Array.from(roles) };
}

function getMindbaseAgentEmailDomain() {
  return String(process.env.MINDBASE_AGENT_EMAIL_DOMAIN || "").trim().toLowerCase() || "mindbase.local";
}

async function generateUniqueAgentEmail(tenantId: number, seed: string) {
  const base = slugify(seed);
  const domain = getMindbaseAgentEmailDomain();
  let step = 1;
  let candidate = `${base}@${domain}`;
  while (true) {
    const conflict = await db.query.intellects.findFirst({
      where: and(eq(intellects.tenantId, tenantId), eq(intellects.agentEmail, candidate)),
      columns: { id: true },
    });
    if (!conflict) return candidate;
    step += 1;
    candidate = `${base}-${step}@${domain}`;
  }
}

function createAuthTokens(input: { userId: number; tenantId: number; roles: string[] }) {
  const accessToken = signMindbaseToken({
    userId: input.userId,
    tenantId: input.tenantId,
    roles: input.roles,
    kind: "access",
    ttlSeconds: ACCESS_TOKEN_TTL,
  });
  const refreshToken = signMindbaseToken({
    userId: input.userId,
    tenantId: input.tenantId,
    roles: input.roles,
    kind: "refresh",
    ttlSeconds: REFRESH_TOKEN_TTL,
  });
  return {
    accessToken,
    refreshToken,
    expiresInSec: ACCESS_TOKEN_TTL,
    refreshExpiresInSec: REFRESH_TOKEN_TTL,
  };
}

function normalizeGuestSessionId(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .slice(0, 80);
}

function isTemporaryMindbaseUser(userRow: typeof eceUsers.$inferSelect | null | undefined) {
  const metadata = (userRow?.metadata || {}) as Record<string, unknown>;
  const preferences = (metadata.preferences || {}) as Record<string, unknown>;
  return (
    !userRow?.passwordHash &&
    String((metadata.source || preferences.source) ?? "").trim() === "mindbase_onboarding_guest" &&
    (metadata.onboardingVisitor === true || preferences.onboardingVisitor === true)
  );
}

async function resolveOrCreateOnboardingUser(input: {
  req: any;
  tenantId: number;
  tenantKey: string;
  displayName?: string | null;
}) {
  const existingSessionUser = await resolveSessionUser(input.req);
  if (existingSessionUser) {
    return {
      user: existingSessionUser,
      temporary: false,
      tokens: null as ReturnType<typeof createAuthTokens> | null,
    };
  }

  const requestedGuestId = normalizeGuestSessionId(
    input.req.body?.guestSessionId ||
      input.req.body?.guest_session_id ||
      input.req.headers?.["x-mindbase-guest-session"],
  );
  const guestSessionId = requestedGuestId || crypto.randomUUID();
  const guestHash = crypto
    .createHash("sha256")
    .update(`${input.tenantId}:${guestSessionId}`)
    .digest("hex")
    .slice(0, 24);
  const email = `guest+${input.tenantKey}-${guestHash}@mindbase.local`.toLowerCase();
  const displayName = asText(input.displayName) || "MindBase Visitor";

  let userRow = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
  if (!userRow) {
    [userRow] = await db
      .insert(eceUsers)
      .values({
        email,
        passwordHash: null,
        displayName,
        role: "buyer",
        roles: ["buyer"],
        permissions: [],
        isActive: true,
        emailVerified: false,
        verificationLevel: "NONE",
        currentMode: "buyer",
        buyerType: "retail",
        metadata: {
          profileComplete: false,
          mustChangePassword: true,
          preferences: {
            source: "mindbase_onboarding_guest",
            onboardingVisitor: true,
            guestSessionId,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
  } else if (displayName && userRow.displayName !== displayName && isTemporaryMindbaseUser(userRow)) {
    [userRow] = await db
      .update(eceUsers)
      .set({ displayName, updatedAt: new Date() })
      .where(eq(eceUsers.id, userRow.id))
      .returning();
  }

  if (!userRow) throw new Error("Failed to create visitor session");
  await ensureMindbaseRole({ tenantId: input.tenantId, userId: userRow.id, role: "creator" });
  const user = await buildSessionUser({ userId: userRow.id, tenantId: input.tenantId });
  if (!user) throw new Error("Failed to initialize visitor session");
  await ensureCreatorProfile(input.tenantId, user);
  const tokens = createAuthTokens({ userId: user.id, tenantId: input.tenantId, roles: user.roles });
  return { user, temporary: true, tokens };
}

async function resolveWorkspaceMembership(input: { tenantId: number; workspaceId: string; userId: number }) {
  const membership = await db.query.mindbaseWorkspaceMembers.findFirst({
    where: and(
      eq(mindbaseWorkspaceMembers.tenantId, input.tenantId),
      eq(mindbaseWorkspaceMembers.workspaceId, input.workspaceId),
      eq(mindbaseWorkspaceMembers.userId, input.userId),
    ),
  });
  return membership;
}

function isWorkspaceAdminRole(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "owner" || normalized === "admin";
}

function normalizeEmailAddress(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const angleMatch = raw.match(/<([^>]+)>/);
  const picked = angleMatch ? angleMatch[1] : raw;
  return picked.trim().toLowerCase();
}

async function resolveWorkspaceApiKey(req: any, tenantId: number) {
  const raw =
    String(req.headers?.["x-api-key"] || "").trim() ||
    String(req.headers?.authorization || "")
      .trim()
      .replace(/^ApiKey\s+/i, "") ||
    String(req.body?.api_key || "").trim();
  if (!raw) return null;
  const keyHash = sha256Hex(raw);
  const key = await db.query.mindbaseApiKeys.findFirst({
    where: and(eq(mindbaseApiKeys.tenantId, tenantId), eq(mindbaseApiKeys.keyHash, keyHash), isNull(mindbaseApiKeys.revokedAt)),
  });
  if (!key) return null;
  return key;
}

async function recordCreditsLedgerEntry(input: {
  tenantId: number;
  userId: number;
  deltaInt: number;
  reason: string;
  requestCorrelationId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (!Number.isFinite(input.userId) || input.userId <= 0) return null;
  if (!Number.isFinite(input.deltaInt) || input.deltaInt === 0) return null;
  const [row] = await db
    .insert(mindbaseCreditsLedger)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      deltaInt: Math.trunc(input.deltaInt),
      reason: input.reason,
      requestCorrelationId: asText(input.requestCorrelationId),
      metadata: input.metadata ?? null,
      createdAt: new Date(),
    })
    .returning();
  return row;
}

async function ensureCreatorProfile(tenantId: number, user: SessionUser) {
  const existing = await db.query.creatorProfiles.findFirst({
    where: and(eq(creatorProfiles.tenantId, tenantId), eq(creatorProfiles.userId, user.id)),
  });
  if (existing) return existing;

  let baseSlug = slugify(user.displayName || user.email || `creator-${user.id}`);
  if (!baseSlug) baseSlug = `creator-${user.id}`;

  let candidate = baseSlug;
  let step = 1;
  while (true) {
    const conflict = await db.query.creatorProfiles.findFirst({
      where: and(eq(creatorProfiles.tenantId, tenantId), eq(creatorProfiles.shareSlug, candidate)),
    });
    if (!conflict) break;
    step += 1;
    candidate = `${baseSlug}-${step}`;
  }

  const [created] = await db
    .insert(creatorProfiles)
    .values({
      tenantId,
      userId: user.id,
      displayName: user.displayName,
      headline: null,
      bio: null,
      avatarUrl: null,
      location: null,
      shareSlug: candidate,
      verificationStatus: "unverified",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

async function ensureMindbaseRecord(input: {
  tenantId: number;
  ownerUserId: number;
  title?: string | null;
  tagline?: string | null;
  description?: string | null;
}) {
  const existing = await db.query.mindbaseMindbases.findFirst({
    where: and(eq(mindbaseMindbases.tenantId, input.tenantId), eq(mindbaseMindbases.ownerUserId, input.ownerUserId)),
  });
  const baseTitle = asText(input.title) || "My MindBase";
  const baseSlug = slugify(baseTitle) || `mindbase-${input.ownerUserId}`;
  if (existing) {
    const [updated] = await db
      .update(mindbaseMindbases)
      .set({
        title: asText(input.title) || existing.title,
        tagline: input.tagline !== undefined ? asText(input.tagline) : existing.tagline,
        description: input.description !== undefined ? asText(input.description) : existing.description,
        updatedAt: new Date(),
      })
      .where(eq(mindbaseMindbases.id, existing.id))
      .returning();
    return updated || existing;
  }

  let candidate = baseSlug;
  let step = 1;
  while (true) {
    const conflict = await db.query.mindbaseMindbases.findFirst({
      where: and(eq(mindbaseMindbases.tenantId, input.tenantId), eq(mindbaseMindbases.slug, candidate)),
      columns: { id: true },
    });
    if (!conflict) break;
    step += 1;
    candidate = `${baseSlug}-${step}`;
  }
  const [created] = await db
    .insert(mindbaseMindbases)
    .values({
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      slug: candidate,
      title: baseTitle,
      tagline: asText(input.tagline),
      description: asText(input.description),
      isPublished: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

function asUuid(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function sanitizeTagArray(value: unknown) {
  const items = normalizeArray(value)
    .map((entry) => entry.toLowerCase())
    .filter((entry) => entry.length <= 40)
    .slice(0, 24);
  return Array.from(new Set(items));
}

function scoreChunk(content: string, queryTokens: string[]) {
  const lowered = content.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    if (lowered.includes(token)) score += 3;
    if (lowered.includes(`${token}:`)) score += 1;
    if (lowered.includes(` ${token} `)) score += 2;
  }
  return score;
}

function getSqlRows<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

async function createEmbedding(input: string): Promise<number[] | null> {
  const text = String(input || "").trim();
  if (!text) return null;
  try {
    const client = getOpenAIClient();
    const model = String(process.env.EMBEDDING_MODEL || "").trim() || "text-embedding-3-small";
    const response = await client.embeddings.create({
      model,
      input: text.slice(0, 12000),
    });
    const values = Array.isArray(response.data?.[0]?.embedding) ? response.data[0].embedding : null;
    if (!values?.length) return null;
    return values.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  } catch {
    return null;
  }
}

async function collectKnowledgeContext(input: {
  tenantId: number;
  intellectId: string;
  query: string;
  allowScopes: Array<"private" | "public" | "monetized">;
}) {
  const files = await db.query.intellectKnowledgeFiles.findMany({
    where: and(
      eq(intellectKnowledgeFiles.tenantId, input.tenantId),
      eq(intellectKnowledgeFiles.intellectId, input.intellectId),
      eq(intellectKnowledgeFiles.status, "processed"),
      inArray(intellectKnowledgeFiles.scope, input.allowScopes as any),
    ),
    orderBy: [desc(intellectKnowledgeFiles.updatedAt)],
    limit: 50,
  });

  if (!files.length) {
    return {
      contextText: "",
      citations: [] as Array<{ fileId: string; filename: string }>,
    };
  }

  const fileIds = files.map((file) => file.id);
  const chunks = await db.query.intellectKnowledgeChunks.findMany({
    where: and(eq(intellectKnowledgeChunks.tenantId, input.tenantId), inArray(intellectKnowledgeChunks.fileId, fileIds as any)),
    orderBy: [asc(intellectKnowledgeChunks.createdAt)],
    limit: 400,
  });

  const tokenized = String(input.query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 16);

  const lexicalScored = chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(String(chunk.chunkText || ""), tokenized),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number((b.chunk.chunkIndex || 0) - (a.chunk.chunkIndex || 0));
    });

  const embedding = await createEmbedding(input.query);
  const vectorSelected = new Map<string, (typeof chunks)[number]>();
  if (embedding?.length && isMindbaseVectorEnabled()) {
    try {
      const result = await db.execute(sql`
        select id, file_id, chunk_index, source_filename, chunk_text
        from intellect_knowledge_chunks
        where tenant_id = ${input.tenantId}
          and intellect_id = ${input.intellectId}
          and file_id in (${sql.join(fileIds.map((fileId) => sql`${fileId}::uuid`), sql`,`)})
          and embedding_vector is not null
        order by embedding_vector <=> ${sql.raw(`'${vectorLiteral(embedding)}'::vector`)}
        limit 8
      `);
      for (const row of getSqlRows<{
        id: string;
        file_id: string;
        chunk_index: number;
        source_filename: string | null;
        chunk_text: string;
      }>(result)) {
        const chunk = chunks.find((candidate) => candidate.id === row.id);
        if (chunk) vectorSelected.set(chunk.id, chunk);
      }
    } catch {
      // Fall back to lexical ranking when vector operations are unavailable.
    }
  }

  const selectedMap = new Map<string, (typeof chunks)[number]>();
  for (const chunk of vectorSelected.values()) {
    selectedMap.set(chunk.id, chunk);
  }
  for (const entry of lexicalScored.filter((candidate, idx) => candidate.score > 0 || idx < 4).slice(0, 8)) {
    if (!selectedMap.has(entry.chunk.id)) selectedMap.set(entry.chunk.id, entry.chunk);
  }
  const selected = Array.from(selectedMap.values()).slice(0, 8);

  const citations = selected
    .map((chunk) => {
      const file = files.find((entry) => entry.id === chunk.fileId);
      return {
        fileId: chunk.fileId,
        filename: String(chunk.sourceFilename || file?.filename || "knowledge.txt"),
      };
    })
    .filter((citation) => citation.filename);

  const contextText = selected
    .map((chunk, idx) => {
      const file = files.find((entry) => entry.id === chunk.fileId);
      const source = String(chunk.sourceFilename || file?.filename || `source-${idx + 1}`);
      return `[${source}]\n${String(chunk.chunkText || "")}`;
    })
    .join("\n\n---\n\n");

  return { contextText, citations };
}

async function resolveOrganizationForWorkspace(input: {
  tenantId: number;
  workspaceId: string;
  userId?: number | null;
}) {
  const organization = await db.query.mindbaseOrganizations.findFirst({
    where: and(
      eq(mindbaseOrganizations.tenantId, input.tenantId),
      eq(mindbaseOrganizations.defaultWorkspaceId, input.workspaceId),
    ),
    orderBy: [desc(mindbaseOrganizations.updatedAt)],
  });
  if (!organization) return null;
  if (!input.userId || Number(organization.ownerUserId) === Number(input.userId)) return organization;

  const membership = await db.query.mindbaseOrganizationUsers.findFirst({
    where: and(
      eq(mindbaseOrganizationUsers.tenantId, input.tenantId),
      eq(mindbaseOrganizationUsers.organizationId, organization.id),
      eq(mindbaseOrganizationUsers.userId, input.userId),
    ),
  });
  return membership ? organization : null;
}

function brainEventPayload(row: typeof mindbaseBrainEvents.$inferSelect | null | undefined) {
  const payload = row?.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, any>) : {};
}

function serializeWorkspaceBrainDocument(row: typeof mindbaseBrainEvents.$inferSelect) {
  const payload = brainEventPayload(row);
  const status =
    asText(payload.status) ||
    (String(row.eventType || "").includes("failed") ? "failed" : "processed");
  return {
    id: row.id,
    filename: asText(payload.filename) || "document",
    mime: asText(payload.mime),
    status,
    workspace_id: asText(payload.workspaceId),
    organization_id: row.organizationId,
    bytes: Number(payload.bytes || 0),
    extracted_chars: Number(payload.extractedChars || 0),
    chunk_count: Number(payload.chunkCount || (Array.isArray(payload.chunks) ? payload.chunks.length : 0)),
    error_message: asText(payload.errorMessage),
    created_at: row.createdAt,
  };
}

async function listWorkspaceBrainDocumentEvents(input: {
  tenantId: number;
  organizationId: string;
  workspaceId: string;
  limit?: number;
}) {
  const rows = await db.query.mindbaseBrainEvents.findMany({
    where: and(
      eq(mindbaseBrainEvents.tenantId, input.tenantId),
      eq(mindbaseBrainEvents.organizationId, input.organizationId),
      eq(mindbaseBrainEvents.entityType, "workspace_document"),
    ),
    orderBy: [desc(mindbaseBrainEvents.createdAt)],
    limit: input.limit || 80,
  });
  return rows.filter((row) => asText(brainEventPayload(row).workspaceId) === input.workspaceId);
}

async function collectWorkspaceBrainContext(input: {
  tenantId: number;
  workspaceId: string;
  userId: number;
  query: string;
}) {
  const organization = await resolveOrganizationForWorkspace({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
  });
  if (!organization) {
    return {
      contextText: "",
      citations: [] as Array<{ fileId: string; filename: string }>,
    };
  }

  const events = (await listWorkspaceBrainDocumentEvents({
    tenantId: input.tenantId,
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    limit: 100,
  })).filter((row) => {
    const payload = brainEventPayload(row);
    return asText(payload.status) === "processed" && Array.isArray(payload.chunks);
  });

  const tokenized = String(input.query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 16);

  const candidates = events.flatMap((event) => {
    const payload = brainEventPayload(event);
    const filename = asText(payload.filename) || "company-brain.txt";
    return (Array.isArray(payload.chunks) ? payload.chunks : [])
      .map((chunk: unknown, index: number) => ({
        event,
        filename,
        index,
        text: String(chunk || "").trim(),
      }))
      .filter((entry) => entry.text);
  });

  const selected = candidates
    .map((entry) => ({
      ...entry,
      score: scoreChunk(entry.text, tokenized),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .filter((entry, index) => entry.score > 0 || index < 6)
    .slice(0, 8);

  const citations = selected
    .map((entry) => ({
      fileId: entry.event.id,
      filename: entry.filename,
    }))
    .filter((citation, index, all) => all.findIndex((item) => item.fileId === citation.fileId) === index);

  const contextText = selected
    .map((entry) => `[${entry.filename}]\n${entry.text}`)
    .join("\n\n---\n\n");

  return { contextText, citations };
}

async function runMindbaseCompletion(input: {
  systemPrompt: string;
  userMessage: string;
  contextText: string;
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}) {
  try {
    const client = getOpenAIClient();
    const model =
      String(process.env.MINDBASE_MODEL || "").trim() ||
      String(process.env.OPENAI_MODEL_BALANCED || "").trim() ||
      "gpt-4o-mini";

    const messages = [
      {
        role: "system" as const,
        content: `${input.systemPrompt}\n\nOperational output requirements:\n- Cite filenames when knowledge is used.\n- If missing knowledge, clearly ask for the missing document.\n- Keep output practical and concise.`,
      },
      ...(input.contextText
        ? [
            {
              role: "system" as const,
              content: `Knowledge context (use only when relevant):\n${input.contextText}`,
            },
          ]
        : []),
      ...input.history.slice(-8),
      {
        role: "user" as const,
        content: input.userMessage,
      },
    ];

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.25,
      max_tokens: 700,
    });

    const text = String(response.choices?.[0]?.message?.content || "").trim();
    if (!text) {
      return {
        blocked: true,
        message: "BLOCKED: model returned empty output. Next required permission: verify model access and provider quota.",
      };
    }

    return {
      blocked: false,
      message: text,
      usage: response.usage
        ? {
            promptTokens: Number(response.usage.prompt_tokens || 0),
            completionTokens: Number(response.usage.completion_tokens || 0),
            totalTokens: Number(response.usage.total_tokens || 0),
          }
        : null,
    };
  } catch (error: any) {
    return {
      blocked: true,
      message: `BLOCKED: ${String(error?.message || "AI provider unavailable")}. Next required permission: configure/enable AI provider credentials.`,
      usage: null,
    };
  }
}

async function loadConversationHistory(conversationId: string) {
  const rows = await db.query.intellectMessages.findMany({
    where: eq(intellectMessages.conversationId, conversationId),
    orderBy: [asc(intellectMessages.createdAt)],
    limit: 24,
  });

  return rows
    .map((row) => {
      if (row.senderType === "assistant") return { role: "assistant" as const, content: String(row.content || "") };
      if (row.senderType === "system") return { role: "system" as const, content: String(row.content || "") };
      return { role: "user" as const, content: String(row.content || "") };
    })
    .filter((row) => row.content.trim().length > 0);
}

type OnboardingExtracted = {
  displayName?: string | null;
  roleOrCompany?: string | null;
  goals?: string[];
  projects?: string[];
  preferredAssistantType?: string | null;
};

function normalizeStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  const unique: string[] = [];
  for (const entry of value) {
    const text = String(entry ?? "").trim();
    if (!text) continue;
    if (unique.some((item) => item.toLowerCase() === text.toLowerCase())) continue;
    unique.push(text);
    if (unique.length >= max) break;
  }
  return unique;
}

function toOnboardingExtracted(value: unknown): OnboardingExtracted {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    displayName: asText(raw.displayName),
    roleOrCompany: asText(raw.roleOrCompany),
    goals: normalizeStringArray(raw.goals, 10),
    projects: normalizeStringArray(raw.projects, 10),
    preferredAssistantType: asText(raw.preferredAssistantType),
  };
}

function uniquePush(list: string[], value: string, max = 10) {
  const text = String(value || "").trim();
  if (!text) return list;
  if (list.some((item) => item.toLowerCase() === text.toLowerCase())) return list;
  if (list.length >= max) return list;
  return [...list, text];
}

function extractOnboardingFields(input: {
  previous: OnboardingExtracted;
  message: string;
  fallbackDisplayName: string;
}): OnboardingExtracted {
  const message = String(input.message || "").trim();
  const lower = message.toLowerCase();
  const next: OnboardingExtracted = {
    displayName: input.previous.displayName || null,
    roleOrCompany: input.previous.roleOrCompany || null,
    goals: [...(input.previous.goals || [])],
    projects: [...(input.previous.projects || [])],
    preferredAssistantType: input.previous.preferredAssistantType || null,
  };

  const namePatterns = [
    /\bmy name is\s+([a-z][a-z\s'-]{1,60})/i,
    /\bi am\s+([a-z][a-z\s'-]{1,60})/i,
    /\bi'm\s+([a-z][a-z\s'-]{1,60})/i,
    /\bje m['’]appelle\s+([a-z][a-z\s'-]{1,60})/i,
    /\bje suis\s+([a-z][a-z\s'-]{1,60})/i,
  ];
  if (!next.displayName) {
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (!match?.[1]) continue;
      const candidate = String(match[1]).replace(/\s{2,}/g, " ").trim();
      if (candidate.length >= 2 && candidate.length <= 60) {
        next.displayName = candidate;
        break;
      }
    }
  }

  if (!next.roleOrCompany) {
    const rolePatterns = [
      /\bi work at\s+([a-z0-9][a-z0-9\s&'.-]{1,80})/i,
      /\bmy company is\s+([a-z0-9][a-z0-9\s&'.-]{1,80})/i,
      /\bi run\s+([a-z0-9][a-z0-9\s&'.-]{1,80})/i,
      /\bi am (?:a|an)\s+([a-z0-9][a-z0-9\s&'.-]{1,80})/i,
      /\bje travaille (?:chez|a)\s+([a-z0-9][a-z0-9\s&'.-]{1,80})/i,
      /\bma societe est\s+([a-z0-9][a-z0-9\s&'.-]{1,80})/i,
    ];
    for (const pattern of rolePatterns) {
      const match = message.match(pattern);
      if (!match?.[1]) continue;
      const candidate = String(match[1]).replace(/\s{2,}/g, " ").trim();
      if (candidate.length >= 2) {
        next.roleOrCompany = candidate;
        break;
      }
    }
  }

  const parts = message
    .split(/[\n.!?;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const part of parts) {
    const p = part.toLowerCase();
    if (
      p.includes("goal") ||
      p.includes("objectif") ||
      p.includes("want to") ||
      p.includes("need to") ||
      p.includes("je veux") ||
      p.includes("j'ai besoin")
    ) {
      next.goals = uniquePush(next.goals || [], part);
    }
    if (
      p.includes("project") ||
      p.includes("projet") ||
      p.includes("building") ||
      p.includes("creating") ||
      p.includes("lancer") ||
      p.includes("develop")
    ) {
      next.projects = uniquePush(next.projects || [], part);
    }
  }

  if (!next.preferredAssistantType) {
    if (/\bchief of staff\b/i.test(lower) || /\bchief\b/i.test(lower)) next.preferredAssistantType = "Chief of Staff";
    else if (/\bplanner\b/i.test(lower) || /\bplan\b/i.test(lower)) next.preferredAssistantType = "Project Planner";
    else if (/\bresearch\b/i.test(lower) || /\banalys/i.test(lower)) next.preferredAssistantType = "Research Assistant";
  }

  if (!next.displayName) next.displayName = input.fallbackDisplayName;
  next.goals = normalizeStringArray(next.goals, 10);
  next.projects = normalizeStringArray(next.projects, 10);
  return next;
}

function buildOnboardingReply(input: {
  extracted: OnboardingExtracted;
  messageCount: number;
}): string {
  const missing: string[] = [];
  if (!input.extracted.roleOrCompany) missing.push("your role or company");
  if (!(input.extracted.goals || []).length) missing.push("your primary goal");
  if (!(input.extracted.projects || []).length) missing.push("your active project");

  if (input.messageCount >= 5) {
    return "Great, I have enough context. Your MindBase is ready to create. Click \"Create my MindBase\" when you're ready.";
  }

  if (missing.length) {
    return `Got it. Share ${missing.slice(0, 2).join(" and ")} so I can build your MindBase profile.`;
  }

  return "Perfect. I captured that. Add one more detail about your workflow and we'll finalize your MindBase.";
}

async function ensureUniqueIntellectSlug(input: { tenantId: number; seed: string }) {
  const base = slugify(input.seed) || `mindbase-agent-${crypto.randomBytes(2).toString("hex")}`;
  let candidate = base;
  let step = 1;
  while (true) {
    const exists = await db.query.intellects.findFirst({
      where: and(eq(intellects.tenantId, input.tenantId), eq(intellects.slug, candidate)),
      columns: { id: true },
    });
    if (!exists) return candidate;
    step += 1;
    candidate = `${base}-${step}`;
  }
}

router.post("/api/onboarding/ingest", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-onboarding-ingest", 80, 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const conversationId = String(req.body?.conversationId || "").trim();
    const message = String(req.body?.message || "").trim();
    if (!conversationId) return res.status(400).json({ ok: false, message: "conversationId is required" });
    if (!message) return res.status(400).json({ ok: false, message: "message is required" });
    if (message.length > 4000) return res.status(400).json({ ok: false, message: "message is too long" });

    const existing = await db.query.mindbaseProfileDrafts.findFirst({
      where: and(
        eq(mindbaseProfileDrafts.tenantId, tenant.id),
        eq(mindbaseProfileDrafts.userId, user.id),
        eq(mindbaseProfileDrafts.conversationId, conversationId),
      ),
    });

    const previousExtracted = toOnboardingExtracted(existing?.extractedJson);
    const extracted = extractOnboardingFields({
      previous: previousExtracted,
      message,
      fallbackDisplayName: user.displayName || user.email.split("@")[0] || "User",
    });
    const messageCount = Math.max(1, Number(existing?.messageCount || 0) + 1);
    const readyToFinalize = messageCount >= 5;
    const assistantReply = buildOnboardingReply({ extracted, messageCount });

    const previousMessages = (
      Array.isArray(existing?.messagesJson) ? existing.messagesJson : []
    ) as Array<{ role: "user" | "assistant"; text: string; createdAt?: string }>;
    const nextMessages: Array<{ role: "user" | "assistant"; text: string; createdAt?: string }> = [
      { role: "user", text: message, createdAt: new Date().toISOString() },
      { role: "assistant", text: assistantReply, createdAt: new Date().toISOString() },
    ];
    const messagesJson = [...previousMessages, ...nextMessages].slice(-60);

    if (existing) {
      await db
        .update(mindbaseProfileDrafts)
        .set({
          messageCount,
          messagesJson,
          extractedJson: extracted,
          status: readyToFinalize ? "ready" : "draft",
          updatedAt: new Date(),
        })
        .where(eq(mindbaseProfileDrafts.id, existing.id));
    } else {
      await db.insert(mindbaseProfileDrafts).values({
        tenantId: tenant.id,
        userId: user.id,
        conversationId,
        messageCount,
        messagesJson,
        extractedJson: extracted,
        status: readyToFinalize ? "ready" : "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return res.json({
      ok: true,
      conversationId,
      assistantReply,
      extracted,
      messageCount,
      readyToFinalize,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to ingest onboarding message" });
  }
});

router.post("/api/onboarding/finalize", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-onboarding-finalize", 20, 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const conversationId = String(req.body?.conversationId || "").trim();
    if (!conversationId) return res.status(400).json({ ok: false, message: "conversationId is required" });

    const draft = await db.query.mindbaseProfileDrafts.findFirst({
      where: and(
        eq(mindbaseProfileDrafts.tenantId, tenant.id),
        eq(mindbaseProfileDrafts.userId, user.id),
        eq(mindbaseProfileDrafts.conversationId, conversationId),
      ),
    });
    if (!draft) return res.status(404).json({ ok: false, message: "Onboarding draft not found" });

    const extracted = toOnboardingExtracted(draft.extractedJson);
    await ensureMindbaseRole({ tenantId: tenant.id, userId: user.id, role: "creator" });
    await ensureCreatorProfile(tenant.id, user);

    const mindbaseTitle =
      extracted.roleOrCompany || extracted.displayName || user.displayName || "My MindBase";
    const mindbase = await ensureMindbaseRecord({
      tenantId: tenant.id,
      ownerUserId: user.id,
      title: mindbaseTitle,
      tagline: extracted.preferredAssistantType || "AI team aligned with your goals",
      description:
        (extracted.goals || []).join(" | ") ||
        (extracted.projects || []).join(" | ") ||
        "Chat-onboarded MindBase profile",
    });

    const baselineAgents = [
      {
        name: "Chief of Staff",
        tagline: "Coordinates priorities, communication, and execution.",
        category: "operations",
        personaRole: "Chief of Staff",
      },
      {
        name: "Project Planner",
        tagline: "Plans milestones, deadlines, and dependencies.",
        category: "planning",
        personaRole: "Project Planner",
      },
      {
        name: "Research Assistant",
        tagline: "Finds evidence, summarizes sources, and drafts briefs.",
        category: "research",
        personaRole: "Research Assistant",
      },
    ] as const;

    const createdOrExisting: Array<{ id: string; name: string; slug: string }> = [];
    for (const item of baselineAgents) {
      const existing = await db.query.intellects.findFirst({
        where: and(
          eq(intellects.tenantId, tenant.id),
          eq(intellects.ownerUserId, user.id),
          eq(intellects.name, item.name),
        ),
      });
      if (existing) {
        createdOrExisting.push({ id: existing.id, name: existing.name, slug: existing.slug });
        continue;
      }

      const slug = await ensureUniqueIntellectSlug({ tenantId: tenant.id, seed: `${item.name}-${user.id}` });
      const systemPrompt = buildSystemPromptFromDraft({
        name: item.name,
        description: item.tagline,
        personaRole: item.personaRole,
        personaTone: "clear and practical",
        personaRules: [],
        styleConstraints: [],
      });

      const [created] = await db
        .insert(intellects)
        .values({
          tenantId: tenant.id,
          ownerUserId: user.id,
          name: item.name,
          slug,
          tagline: item.tagline,
          description: item.tagline,
          category: item.category,
          tags: ["onboarding", "baseline"],
          personaRole: item.personaRole,
          personaTone: "clear and practical",
          personaRules: [],
          styleConstraints: [],
          systemPrompt,
          accessPolicy: "private",
          publishStatus: "draft",
          isPublished: false,
          pricePer100Messages: 0,
          usageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: intellects.id, name: intellects.name, slug: intellects.slug });

      if (created) createdOrExisting.push(created);
    }

    await db
      .update(mindbaseProfileDrafts)
      .set({
        status: "finalized",
        updatedAt: new Date(),
      })
      .where(eq(mindbaseProfileDrafts.id, draft.id));

    return res.json({
      ok: true,
      message: "Your MindBase is ready.",
      mindbase: mindbase
        ? {
            id: mindbase.id,
            title: mindbase.title,
            slug: mindbase.slug,
          }
        : null,
      agents: createdOrExisting,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to finalize onboarding" });
  }
});

router.get("/api/mindbase/integrations/status", async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const integrations = buildMindbaseIntegrationStatuses();
    const payment = buildPaymentStatus(String(tenant.key || "mindbase"));

    res.json({
      ok: true,
      tenant: tenant.key,
      integrations: {
        ...integrations,
        payments: {
          id: "payments",
          provider: "MindBase payments",
          enabled: payment.checkoutEnabled,
          configured: payment.checkoutEnabled,
          status: payment.status,
          missingEnv: payment.missingEnv,
          message: payment.message,
          adminPath: "/admin/mindbase/settings",
        },
      },
      payments: payment,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to read integration status" });
  }
});

router.get("/api/mindbase/payments/plans", async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const payment = buildPaymentStatus(String(tenant.key || "mindbase"));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      tenant: tenant.key,
      payments: payment,
      plans: MINDBASE_PAYMENT_PLANS,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load MindBase payment plans" });
  }
});

router.post("/api/mindbase/payments/checkout", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-payment-checkout", 20, 5 * 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const plan = getMindbasePlan(req.body?.planId ?? req.body?.plan_id);
    if (!plan) return res.status(400).json({ ok: false, message: "Unknown MindBase plan." });

    const access = await resolveAccessibleMindbaseOrganization({
      tenantId: tenant.id,
      userId: user.id,
      organizationId: asText(req.body?.organizationId ?? req.body?.organization_id),
    });
    if (!access) {
      return res.status(404).json({
        ok: false,
        message: "Create or save a MindBase organization before starting checkout.",
      });
    }

    if (plan.id === "free") {
      const entitlement = await applyMindbaseFreePlan({
        tenantId: tenant.id,
        userId: user.id,
        organization: access.organization,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        ok: true,
        checkout: {
          type: "free",
          message: "Free plan selected. No payment was created.",
        },
        plan,
        entitlement: entitlement.entitlement,
        organization: {
          id: entitlement.organization.id,
          slug: entitlement.organization.slug,
          status: entitlement.organization.status,
          activePlan: plan.id,
        },
      });
    }

    if (!plan.checkoutRequired || plan.monthlyXof === null) {
      return res.status(409).json({
        ok: false,
        code: "manual_plan_required",
        message: `${plan.name} plan requires manual activation. No paid access was granted.`,
        plan,
        safeOptions: ["Continue on Free plan", "Contact admin", "Choose Starter or Team"],
      });
    }

    const tenantKey = (tenant.key || "mindbase") as TenantKey;
    const paymentReadiness = buildPaymentStatus(tenantKey);
    if (!paymentReadiness.checkoutEnabled || paymentReadiness.provider === "manual") {
      return res.status(409).json({
        ok: false,
        code: "payment_provider_not_enabled",
        message: paymentReadiness.message,
        missingEnv: paymentReadiness.missingEnv,
        safeOptions: ["Continue on Free plan", "Configure in admin", "Try again after payments are enabled"],
      });
    }

    const provider = paymentReadiness.provider;
    const amount = Number(plan.monthlyXof || 0);
    const currency = normalizeCurrency(req.body?.currency || "XOF");
    const workspaceId = asText(req.body?.workspaceId ?? req.body?.workspace_id) || access.organization.defaultWorkspaceId || null;
    const returnPath = `/mindbase/payment/return?plan=${encodeURIComponent(plan.id)}`;
    const origin = getMindbasePublicOrigin(req);

    const [createdPayment] = await db
      .insert(payments)
      .values({
        tenantId: tenant.id,
        provider,
        purpose: MINDBASE_PAYMENT_PURPOSE,
        targetType: "MINDBASE_ORGANIZATION",
        targetId: access.organization.id,
        amount,
        currency,
        method: provider === "flutterwave" ? "REDIRECT" : "WIDGET",
        userId: String(user.id),
        status: "pending",
        providerPayload: null,
        metadata: {
          reason: "mindbase_plan_checkout",
          planId: plan.id,
          planName: plan.name,
          organizationId: access.organization.id,
          organizationSlug: access.organization.slug,
          workspaceId,
          returnPath,
          checkoutCreatedAt: new Date().toISOString(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();

    if (!createdPayment) throw new Error("Failed to create MindBase payment record.");

    if (provider === "flutterwave") {
      const keys = getFlutterwaveKeys(tenantKey);
      if (!keys.secretKey) {
        await db
          .update(payments)
          .set({
            status: "failed",
            metadata: {
              ...paymentMetadata(createdPayment),
              failureReason: "missing_flutterwave_secret_key",
            },
            updatedAt: new Date(),
          } as any)
          .where(and(eq(payments.id, createdPayment.id), eq(payments.tenantId, tenant.id)));
        return res.status(409).json({
          ok: false,
          code: "flutterwave_hosted_checkout_not_configured",
          message: "Flutterwave hosted checkout requires FLUTTERWAVE_SECRET_KEY for MindBase chat checkout.",
          missingEnv: ["FLUTTERWAVE_SECRET_KEY"],
          safeOptions: ["Continue on Free plan", "Configure in admin", "Try again"],
        });
      }

      const txRef = buildFlutterwaveTxRef({
        tenantKey,
        paymentId: createdPayment.id,
        type: "ORDER_PAYMENT",
      });
      const callbackPath = `/mindbase/payment/return?paymentId=${encodeURIComponent(String(createdPayment.id))}&plan=${encodeURIComponent(plan.id)}`;
      const init = await flutterwaveInitPayment({
        mode: keys.mode,
        secretKey: keys.secretKey,
        txRef,
        amount,
        currency,
        redirectUrl: `${origin}${callbackPath}`,
        customer: {
          email: user.email || `mindbase-user-${user.id}@mindbase.local`,
          name: user.displayName || user.email || "MindBase customer",
        },
        title: `MindBase ${plan.name}`,
        description: `Activate the ${plan.name} plan for ${access.organization.name}.`,
        meta: {
          paymentId: createdPayment.id,
          tenantKey,
          type: MINDBASE_PAYMENT_PURPOSE,
          planId: plan.id,
          organizationId: access.organization.id,
          workspaceId,
        },
        paymentOptions: req.body?.paymentOptions || "card,mobilemoney,banktransfer,ussd",
      });

      const [updatedPayment] = await db
        .update(payments)
        .set({
          status: "pending",
          providerTransactionRef: txRef,
          providerTransactionId: init.transactionId || null,
          providerPayload: init.raw ?? null,
          metadata: {
            ...paymentMetadata(createdPayment),
            callbackPath,
            flutterwaveMode: keys.mode,
            flutterwaveVersion: "v3_hosted",
            checkoutUrl: init.checkoutLink,
          },
          updatedAt: new Date(),
        } as any)
        .where(and(eq(payments.id, createdPayment.id), eq(payments.tenantId, tenant.id)))
        .returning();

      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({
        ok: true,
        plan,
        payment: serializeMindbasePayment(updatedPayment || createdPayment),
        checkout: {
          type: "redirect",
          provider: "flutterwave",
          url: init.checkoutLink,
          returnPath: callbackPath,
          message: "Open Flutterwave checkout. Paid access activates only after server-side verification.",
        },
      });
    }

    if (provider === "kkiapay") {
      const config = getKkiapayConfig(tenantKey);
      if (!config.publicKey || !config.privateKey || !config.secret) {
        await db
          .update(payments)
          .set({
            status: "failed",
            metadata: {
              ...paymentMetadata(createdPayment),
              failureReason: "missing_kkiapay_keys",
            },
            updatedAt: new Date(),
          } as any)
          .where(and(eq(payments.id, createdPayment.id), eq(payments.tenantId, tenant.id)));
        return res.status(409).json({
          ok: false,
          code: "kkiapay_not_configured",
          message: "Kkiapay checkout requires public, private, and secret keys for server-side verification.",
          missingEnv: ["KKIAPAY_PUBLIC_KEY", "KKIAPAY_PRIVATE_KEY", "KKIAPAY_SECRET_KEY"],
          safeOptions: ["Continue on Free plan", "Configure in admin", "Try again"],
        });
      }

      const callbackPath = `/mindbase/payment/return?paymentId=${encodeURIComponent(String(createdPayment.id))}&plan=${encodeURIComponent(plan.id)}`;
      const [updatedPayment] = await db
        .update(payments)
        .set({
          status: "pending",
          providerTransactionRef: String(createdPayment.id),
          metadata: {
            ...paymentMetadata(createdPayment),
            callbackPath,
            kkiapayMode: config.mode,
          },
          updatedAt: new Date(),
        } as any)
        .where(and(eq(payments.id, createdPayment.id), eq(payments.tenantId, tenant.id)))
        .returning();

      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({
        ok: true,
        plan,
        payment: serializeMindbasePayment(updatedPayment || createdPayment),
        checkout: {
          type: "kkiapay_widget",
          provider: "kkiapay",
          publicKey: config.publicKey,
          sandbox: config.mode === "SANDBOX",
          amount,
          currency,
          reference: String(createdPayment.id),
          callbackUrl: `${origin}${callbackPath}`,
          message: "Open the Kkiapay widget. Paid access activates only after server-side verification.",
        },
      });
    }

    return res.status(409).json({
      ok: false,
      code: "unsupported_payment_provider",
      message: `MindBase does not support checkout provider ${provider}.`,
      safeOptions: ["Continue on Free plan", "Configure in admin"],
    });
  } catch (error: any) {
    console.error("[MindBase payments] checkout error:", error);
    res.status(500).json({ ok: false, message: error?.message || "Failed to start MindBase checkout" });
  }
});

router.post("/api/mindbase/payments/flutterwave/webhook", async (req: any, res) => {
  const provider = "flutterwave";
  let recordedEvent: { providerEventId: string } | null = null;
  let tenantId = 0;
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    tenantId = tenant.id;
    const tenantKey = (tenant.key || "mindbase") as TenantKey;
    const payload = req.body || {};
    const data = payload?.data || payload || {};
    const paymentId = asText(data?.meta?.paymentId || data?.meta?.payment_id || payload?.paymentId);
    const txRef = asText(data?.tx_ref || data?.reference || payload?.tx_ref);
    const transactionId = asText(data?.id || payload?.id || data?.transaction_id || payload?.transaction_id);
    const eventId = asText(payload?.id || data?.id || transactionId || txRef);

    const paymentRow =
      (paymentId
        ? await db.query.payments.findFirst({
            where: and(eq(payments.tenantId, tenant.id), eq(payments.id, paymentId as any), eq(payments.provider, provider)),
          })
        : null) ||
      (txRef
        ? await db.query.payments.findFirst({
            where: and(eq(payments.tenantId, tenant.id), eq(payments.provider, provider), eq(payments.providerTransactionRef, txRef)),
          })
        : null) ||
      (transactionId
        ? await db.query.payments.findFirst({
            where: and(eq(payments.tenantId, tenant.id), eq(payments.provider, provider), eq(payments.providerTransactionId, transactionId)),
          })
        : null);

    const keys = getFlutterwaveKeys(tenantKey);
    const expectedHash = getWebhookHashForFlutterwave(keys);
    if (!expectedHash) {
      return res.status(401).json({ ok: false, message: "Flutterwave webhook secret is not configured." });
    }
    const signatureOk = verifyFlutterwaveWebhookSignature({
      version: keys.version,
      rawBody: req.rawBody,
      headerValue: keys.version === "v4" ? req.headers?.["flutterwave-signature"] : req.headers?.["verif-hash"],
      expectedHash,
    });
    if (!signatureOk) return res.status(401).json({ ok: false, message: "Invalid Flutterwave webhook signature." });

    if (!paymentRow || String(paymentRow.purpose || "") !== MINDBASE_PAYMENT_PURPOSE) {
      return res.status(200).json({ ok: true, ignored: true, reason: "payment_not_found" });
    }

    const metadata = paymentMetadata(paymentRow);
    recordedEvent = await recordMindbasePaymentEvent({
      tenantId: tenant.id,
      provider,
      providerEventId: eventId || `${paymentRow.id}:${transactionId || txRef || "event"}`,
      status: "received",
      paymentId: paymentRow.id,
      organizationId: asText(metadata.organizationId) || paymentRow.targetId,
      rawPayload: payload,
    });
    if ((recordedEvent as any).duplicate) {
      return res.status(200).json({ ok: true, ignored: true, reason: "duplicate_event" });
    }

    const result = await verifyMindbasePaymentWithGateway({
      tenantId: tenant.id,
      tenantKey,
      paymentRow,
      transactionId,
      txRef,
      source: "flutterwave_webhook",
    });
    await markMindbasePaymentEventProcessed({
      tenantId: tenant.id,
      provider,
      providerEventId: recordedEvent.providerEventId,
      status: String(result.payment.status || "processed"),
    });
    return res.status(200).json({
      ok: true,
      payment: serializeMindbasePayment(result.payment),
      entitlement: result.entitlement?.entitlement || null,
    });
  } catch (error: any) {
    if (recordedEvent && tenantId) {
      await markMindbasePaymentEventProcessed({
        tenantId,
        provider,
        providerEventId: recordedEvent.providerEventId,
        status: "failed",
        error: error?.message || "webhook_processing_failed",
      }).catch(() => undefined);
    }
    console.error("[MindBase payments] Flutterwave webhook error:", error);
    return res.status(200).json({ ok: false, message: error?.message || "Flutterwave webhook processing failed" });
  }
});

router.post("/api/mindbase/payments/kkiapay/webhook", async (req: any, res) => {
  const provider = "kkiapay";
  let recordedEvent: { providerEventId: string } | null = null;
  let tenantId = 0;
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    tenantId = tenant.id;
    const tenantKey = (tenant.key || "mindbase") as TenantKey;
    const config = getKkiapayConfig(tenantKey);
    const verified = verifyKkiapayWebhookSignature({
      rawBody: req.rawBody,
      headers: req.headers || {},
      secret: config.secret,
    });
    if (!verified.ok) return res.status(401).json({ ok: false, message: "Invalid Kkiapay webhook signature." });

    const parsed = parseKkiapayWebhook(req.body);
    const reference = asText(parsed.reference);
    const transactionId = asText(parsed.transactionId);
    const paymentRow =
      (reference
        ? await db.query.payments.findFirst({
            where: and(
              eq(payments.tenantId, tenant.id),
              eq(payments.provider, provider),
              or(eq(payments.id, reference as any), eq(payments.providerTransactionRef, reference)),
            ),
          })
        : null) ||
      (transactionId
        ? await db.query.payments.findFirst({
            where: and(eq(payments.tenantId, tenant.id), eq(payments.provider, provider), eq(payments.providerTransactionId, transactionId)),
          })
        : null);

    if (!paymentRow || String(paymentRow.purpose || "") !== MINDBASE_PAYMENT_PURPOSE) {
      return res.status(200).json({ ok: true, ignored: true, reason: "payment_not_found" });
    }

    const status = normalizeGatewayPaymentStatus(parsed.status) || "processing";
    if (parsed.amount !== null && Number(paymentRow.amount) !== Math.round(Number(parsed.amount))) {
      return res.status(400).json({ ok: false, message: "Payment amount mismatch." });
    }
    if (parsed.currency && String(parsed.currency).toUpperCase() !== String(paymentRow.currency || "XOF").toUpperCase()) {
      return res.status(400).json({ ok: false, message: "Payment currency mismatch." });
    }

    const metadata = paymentMetadata(paymentRow);
    recordedEvent = await recordMindbasePaymentEvent({
      tenantId: tenant.id,
      provider,
      providerEventId: transactionId || reference || `${paymentRow.id}:event`,
      status: "received",
      paymentId: paymentRow.id,
      organizationId: asText(metadata.organizationId) || paymentRow.targetId,
      rawPayload: req.body,
    });
    if ((recordedEvent as any).duplicate) {
      return res.status(200).json({ ok: true, ignored: true, reason: "duplicate_event" });
    }

    const result =
      status === "succeeded" && transactionId
        ? await verifyMindbasePaymentWithGateway({
            tenantId: tenant.id,
            tenantKey,
            paymentRow,
            transactionId,
            source: "kkiapay_webhook",
          })
        : await updateMindbasePaymentFromGateway({
            tenantId: tenant.id,
            paymentRow,
            status,
            providerTransactionId: transactionId,
            rawPayload: req.body,
            source: "kkiapay_webhook",
          });

    await markMindbasePaymentEventProcessed({
      tenantId: tenant.id,
      provider,
      providerEventId: recordedEvent.providerEventId,
      status: String(result.payment.status || "processed"),
    });
    return res.status(200).json({
      ok: true,
      payment: serializeMindbasePayment(result.payment),
      entitlement: result.entitlement?.entitlement || null,
    });
  } catch (error: any) {
    if (recordedEvent && tenantId) {
      await markMindbasePaymentEventProcessed({
        tenantId,
        provider,
        providerEventId: recordedEvent.providerEventId,
        status: "failed",
        error: error?.message || "webhook_processing_failed",
      }).catch(() => undefined);
    }
    console.error("[MindBase payments] Kkiapay webhook error:", error);
    return res.status(500).json({ ok: false, message: error?.message || "Kkiapay webhook processing failed" });
  }
});

router.get("/api/mindbase/payments/:paymentId/status", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const paymentId = String(req.params.paymentId || "").trim();
    const paymentRow = await db.query.payments.findFirst({
      where: and(eq(payments.tenantId, tenant.id), eq(payments.id, paymentId as any)),
    });
    if (!paymentRow || String(paymentRow.purpose || "") !== MINDBASE_PAYMENT_PURPOSE) {
      return res.status(404).json({ ok: false, message: "MindBase payment not found." });
    }

    const access = await resolveAccessibleMindbaseOrganization({
      tenantId: tenant.id,
      userId: user.id,
      organizationId: asText(paymentMetadata(paymentRow).organizationId) || paymentRow.targetId,
    });
    if (!access) return res.status(403).json({ ok: false, message: "You cannot access this payment." });

    let latestPayment = paymentRow;
    let entitlement: any = null;
    const shouldVerify =
      String(paymentRow.status || "").toLowerCase() !== "succeeded" &&
      (asText(req.query?.transaction_id) || asText(req.query?.transactionId) || asText(req.query?.tx_ref) || asText(req.query?.txRef));
    if (shouldVerify) {
      const result = await verifyMindbasePaymentWithGateway({
        tenantId: tenant.id,
        tenantKey: (tenant.key || "mindbase") as TenantKey,
        paymentRow,
        transactionId: asText(req.query?.transaction_id) || asText(req.query?.transactionId),
        txRef: asText(req.query?.tx_ref) || asText(req.query?.txRef),
        source: "status_poll",
      });
      latestPayment = result.payment;
      entitlement = result.entitlement;
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      payment: serializeMindbasePayment(latestPayment),
      entitlement: entitlement?.entitlement || null,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to read MindBase payment status" });
  }
});

router.post("/api/mindbase/payments/:paymentId/verify", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-payment-verify", 30, 5 * 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const paymentId = String(req.params.paymentId || "").trim();
    const paymentRow = await db.query.payments.findFirst({
      where: and(eq(payments.tenantId, tenant.id), eq(payments.id, paymentId as any)),
    });
    if (!paymentRow || String(paymentRow.purpose || "") !== MINDBASE_PAYMENT_PURPOSE) {
      return res.status(404).json({ ok: false, message: "MindBase payment not found." });
    }

    const access = await resolveAccessibleMindbaseOrganization({
      tenantId: tenant.id,
      userId: user.id,
      organizationId: asText(paymentMetadata(paymentRow).organizationId) || paymentRow.targetId,
    });
    if (!access) return res.status(403).json({ ok: false, message: "You cannot verify this payment." });

    const result = await verifyMindbasePaymentWithGateway({
      tenantId: tenant.id,
      tenantKey: (tenant.key || "mindbase") as TenantKey,
      paymentRow,
      transactionId: asText(req.body?.transactionId ?? req.body?.transaction_id ?? req.query?.transactionId ?? req.query?.transaction_id),
      txRef: asText(req.body?.txRef ?? req.body?.tx_ref ?? req.query?.txRef ?? req.query?.tx_ref),
      source: "manual_verify",
    });

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      payment: serializeMindbasePayment(result.payment),
      entitlement: result.entitlement?.entitlement || null,
      pendingReason: (result as any).pendingReason || null,
      message:
        String(result.payment.status || "").toLowerCase() === "succeeded"
          ? `Payment confirmed. Your ${paymentMetadata(result.payment).planName || "paid"} plan is now active.`
          : "Payment was not completed.",
      safeOptions:
        String(result.payment.status || "").toLowerCase() === "succeeded"
          ? ["Open workspace", "Connect tools"]
          : ["Try again", "Choose another method", "Continue on Free plan"],
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to verify MindBase payment" });
  }
});

router.post("/api/mindbase/onboarding/workspace", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-launch-workspace-save", 30, 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const requestedCompanyName = asText(req.body?.companyName ?? req.body?.company_name);
    const companyName =
      !requestedCompanyName || requestedCompanyName.toLowerCase() === "not yet"
        ? "Draft Company"
        : requestedCompanyName;
    const requestedWorkspaceName = asText(req.body?.workspaceName ?? req.body?.workspace_name);
    const workspaceName = requestedWorkspaceName || `${companyName} HQ`;
    const selectedAgentIds = new Set(
      (Array.isArray(req.body?.selectedAgentIds ?? req.body?.selected_agent_ids)
        ? (req.body?.selectedAgentIds ?? req.body?.selected_agent_ids)
        : []
      )
        .map((entry: unknown) => String(entry || "").trim().toLowerCase())
        .filter(Boolean),
    );
    const installStarterTeam =
      req.body?.installStarterAgents === true ||
      req.body?.install_starter_agents === true ||
      req.body?.installStarterTeam === true ||
      req.body?.install_starter_team === true;
    if (!selectedAgentIds.size && installStarterTeam) {
      for (const agent of LAUNCH_STARTER_AGENTS) {
        if (agent.id !== "adjoa") selectedAgentIds.add(agent.id);
      }
    }
    selectedAgentIds.add("adjoa");

    const onboardingSession = await resolveOrCreateOnboardingUser({
      req,
      tenantId: tenant.id,
      tenantKey: tenant.key,
      displayName: asText(req.body?.visitorName ?? req.body?.visitor_name),
    });
    const user = onboardingSession.user;

    await ensureMindbaseRole({ tenantId: tenant.id, userId: user.id, role: "creator" });
    await ensureCreatorProfile(tenant.id, user);

    let organizationCreated = false;
    const existingOrganization = await db.query.mindbaseOrganizations.findFirst({
      where: and(
        eq(mindbaseOrganizations.tenantId, tenant.id),
        eq(mindbaseOrganizations.ownerUserId, user.id),
        eq(mindbaseOrganizations.name, companyName),
        eq(mindbaseOrganizations.status, "draft"),
      ),
      orderBy: [desc(mindbaseOrganizations.updatedAt)],
    });

    const organization =
      existingOrganization ||
      (await createMindbaseOrganization({
        tenantId: tenant.id,
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
        },
        name: companyName,
      }));
    organizationCreated = !existingOrganization;

    const persistedOrganization =
      (await db.query.mindbaseOrganizations.findFirst({
        where: and(eq(mindbaseOrganizations.tenantId, tenant.id), eq(mindbaseOrganizations.id, organization.id)),
      })) || organization;

    let workspaceCreated = organizationCreated;
    let workspace =
      persistedOrganization.defaultWorkspaceId
        ? await db.query.mindbaseWorkspaces.findFirst({
            where: and(
              eq(mindbaseWorkspaces.tenantId, tenant.id),
              eq(mindbaseWorkspaces.id, persistedOrganization.defaultWorkspaceId),
            ),
          })
        : null;

    if (!workspace) {
      workspace = await db.query.mindbaseWorkspaces.findFirst({
        where: and(
          eq(mindbaseWorkspaces.tenantId, tenant.id),
          eq(mindbaseWorkspaces.ownerUserId, user.id),
          eq(mindbaseWorkspaces.name, workspaceName),
        ),
        orderBy: [desc(mindbaseWorkspaces.updatedAt)],
      });
    }

    if (!workspace) {
      const [createdWorkspace] = await db
        .insert(mindbaseWorkspaces)
        .values({
          tenantId: tenant.id,
          ownerUserId: user.id,
          name: workspaceName,
          description: "Draft command center workspace for the MindBase guide and AI team.",
          status: "draft",
          companyBrainProgress: 18,
          personaReadiness: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      if (!createdWorkspace) throw new Error("Workspace creation returned no record");
      workspace = createdWorkspace;
      workspaceCreated = true;

      await db
        .insert(mindbaseWorkspaceMembers)
        .values({
          tenantId: tenant.id,
          workspaceId: workspace.id,
          userId: user.id,
          role: "owner",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [mindbaseWorkspaceMembers.workspaceId, mindbaseWorkspaceMembers.userId],
          set: { role: "owner", updatedAt: new Date() },
        });

      await db
        .update(mindbaseOrganizations)
        .set({ defaultWorkspaceId: workspace.id, updatedAt: new Date() })
        .where(eq(mindbaseOrganizations.id, persistedOrganization.id));
    }
    if (!workspace) throw new Error("Workspace was not available after creation");

    const installedAgents: Array<{
      id: string;
      agentId: string;
      name: string;
      role: string;
      status: string;
      requiredIntegrations: string[];
    }> = [];

    for (const template of LAUNCH_STARTER_AGENTS.filter((agent) => selectedAgentIds.has(agent.id))) {
      const existing = await db.query.intellects.findFirst({
        where: and(
          eq(intellects.tenantId, tenant.id),
          eq(intellects.ownerUserId, user.id),
          eq(intellects.name, template.name),
        ),
      });
      const systemPrompt = buildSystemPromptFromDraft({
        name: template.name,
        description: template.purpose,
        personaRole: template.role,
        personaTone: "clear, practical, and operational",
        personaRules: [
          "Keep onboarding inside the chat unless the user explicitly opens another view.",
          "Ask for missing integrations before claiming external work is complete.",
          "Request approval before external or destructive actions.",
        ],
        styleConstraints: ["Use concise operational steps", "Name blockers plainly"],
      });

      const intellect =
        existing ||
        (
          await db
            .insert(intellects)
            .values({
              tenantId: tenant.id,
              ownerUserId: user.id,
              name: template.name,
              slug: await ensureUniqueIntellectSlug({ tenantId: tenant.id, seed: `${template.id}-${user.id}` }),
              tagline: template.role,
              description: template.purpose,
              category: template.category,
              tags: ["mindbase", "launch", "starter-agent", template.id],
              personaRole: template.role,
              personaTone: "clear, practical, and operational",
              personaRules: [
                "Keep onboarding inside the chat unless the user explicitly opens another view.",
                "Ask for missing integrations before claiming external work is complete.",
                "Request approval before external or destructive actions.",
              ],
              styleConstraints: ["Use concise operational steps", "Name blockers plainly"],
              systemPrompt,
              accessPolicy: "private",
              publishStatus: "draft",
              isPublished: false,
              pricePer100Messages: 0,
              usageCount: 0,
              agentEmail: await generateUniqueAgentEmail(tenant.id, template.id),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning()
        )[0];

      if (!intellect) continue;

      const [installation] = await db
        .insert(mindbaseWorkspaceAgents)
        .values({
          tenantId: tenant.id,
          workspaceId: workspace.id,
          intellectId: intellect.id,
          status: "draft",
          requiredIntegrations: [...template.requiredIntegrations],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [mindbaseWorkspaceAgents.workspaceId, mindbaseWorkspaceAgents.intellectId],
          set: {
            status: "draft",
            requiredIntegrations: [...template.requiredIntegrations],
            updatedAt: new Date(),
          },
        })
        .returning();

      installedAgents.push({
        id: installation?.id || `${workspace.id}:${intellect.id}`,
        agentId: template.id,
        name: template.name,
        role: template.role,
        status: String(installation?.status || "draft"),
        requiredIntegrations: [...template.requiredIntegrations],
      });
    }

    const finalOrganization =
      (await db.query.mindbaseOrganizations.findFirst({
        where: and(eq(mindbaseOrganizations.tenantId, tenant.id), eq(mindbaseOrganizations.id, persistedOrganization.id)),
      })) || persistedOrganization;

    res.status(201).json({
      ok: true,
      organization: {
        id: finalOrganization.id,
        name: finalOrganization.name,
        slug: finalOrganization.slug,
        status: finalOrganization.status,
        created: organizationCreated,
      },
      workspace: {
        id: workspace.id,
        organizationId: finalOrganization.id,
        name: workspace.name,
        status: workspace.status || "draft",
        companyBrainProgress: workspace.companyBrainProgress ?? 0,
        personaReadiness: workspace.personaReadiness ?? 0,
        created: workspaceCreated,
      },
      agents: installedAgents,
      commandRoute: `/app/${encodeURIComponent(finalOrganization.slug)}/operations`,
      session: onboardingSession.tokens
        ? {
            temporary: onboardingSession.temporary,
            access_token: onboardingSession.tokens.accessToken,
            refresh_token: onboardingSession.tokens.refreshToken,
            expires_in_sec: onboardingSession.tokens.expiresInSec,
            refresh_expires_in_sec: onboardingSession.tokens.refreshExpiresInSec,
            user: {
              id: user.id,
              email: user.email,
              display_name: user.displayName,
              roles: user.roles,
              temporary: onboardingSession.temporary,
            },
          }
        : null,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to save onboarding workspace" });
  }
});

router.get("/api/mindbase/health", async (_req, res) => {
  await ensureMindbaseTables();
  res.json({ ok: true, service: "mindbase" });
});

router.post("/api/mindbase/auth/register", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-auth-register", 20, 5 * 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const displayName = asText(req.body?.display_name ?? req.body?.displayName) || email.split("@")[0] || "Mindbase User";
    if (!email || !email.includes("@")) return res.status(400).json({ ok: false, message: "Valid email is required" });
    if (password.length < 8) return res.status(400).json({ ok: false, message: "Password must be at least 8 characters" });

    const sessionUser = await resolveSessionUser(req);
    const existing = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
    const passwordHash = await bcrypt.hash(password, 10);
    let created = null as typeof eceUsers.$inferSelect | null;

    if (existing) {
      if (!sessionUser || existing.id !== sessionUser.id || !isTemporaryMindbaseUser(existing)) {
        return res.status(409).json({ ok: false, message: "User already exists" });
      }
      const existingMetadata = ((existing as any).metadata || {}) as Record<string, unknown>;
      const existingPreferences = ((existingMetadata.preferences || {}) as Record<string, unknown>) || {};
      [created] = await db
        .update(eceUsers)
        .set({
          email,
          passwordHash,
          displayName,
          roles: ["buyer"],
          metadata: {
            profileComplete: Boolean(existingMetadata.profileComplete),
            seeded: Boolean(existingMetadata.seeded),
            mustChangePassword: false,
            preferences: {
              ...existingPreferences,
              source: "mindbase_register",
              onboardingVisitor: false,
              upgradedFromGuest: isTemporaryMindbaseUser(existing),
              passwordSetAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(eceUsers.id, existing.id))
        .returning();
    } else if (sessionUser) {
      const sessionRow = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, sessionUser.id) });
      if (isTemporaryMindbaseUser(sessionRow)) {
        const existingMetadata = ((sessionRow as any).metadata || {}) as Record<string, unknown>;
        const existingPreferences = ((existingMetadata.preferences || {}) as Record<string, unknown>) || {};
        [created] = await db
          .update(eceUsers)
          .set({
            email,
            passwordHash,
            displayName,
            roles: ["buyer"],
            metadata: {
              profileComplete: false,
              seeded: Boolean(existingMetadata.seeded),
              mustChangePassword: false,
              preferences: {
                ...existingPreferences,
                source: "mindbase_register",
                onboardingVisitor: false,
                upgradedFromGuest: true,
                passwordSetAt: new Date().toISOString(),
              },
            },
            updatedAt: new Date(),
          })
          .where(eq(eceUsers.id, sessionRow!.id))
          .returning();
      }
    }

    if (!created) {
      [created] = await db
        .insert(eceUsers)
        .values({
          email,
          passwordHash,
          displayName,
          role: "buyer",
          roles: ["buyer"],
          permissions: [],
          isActive: true,
          emailVerified: false,
          verificationLevel: "NONE",
          currentMode: "buyer",
          buyerType: "retail",
          metadata: {
            profileComplete: false,
            preferences: {
              source: "mindbase_register",
            },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    }

    await ensureMindbaseRole({ tenantId: tenant.id, userId: created.id, role: "creator" });
    const user = await buildSessionUser({ userId: created.id, tenantId: tenant.id });
    if (!user) return res.status(500).json({ ok: false, message: "Failed to initialize user session" });
    await ensureCreatorProfile(tenant.id, user);
    const tokens = createAuthTokens({ userId: user.id, tenantId: tenant.id, roles: user.roles });

    res.status(201).json({
      ok: true,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in_sec: tokens.expiresInSec,
      refresh_expires_in_sec: tokens.refreshExpiresInSec,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        roles: user.roles,
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to register" });
  }
});

router.post("/api/mindbase/auth/login", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-auth-login", 40, 5 * 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ ok: false, message: "Email and password are required" });

    const userRow = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
    if (!userRow) return res.status(401).json({ ok: false, message: "Invalid credentials" });
    if (!userRow.passwordHash) {
      return res.status(403).json({ ok: false, message: "Password setup required", code: "PASSWORD_SETUP_REQUIRED" });
    }
    if (!(await bcrypt.compare(password, userRow.passwordHash))) {
      return res.status(401).json({ ok: false, message: "Invalid credentials" });
    }

    await db.update(eceUsers).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(eceUsers.id, userRow.id));
    await ensureMindbaseRole({ tenantId: tenant.id, userId: userRow.id, role: "client" });
    const user = await buildSessionUser({ userId: userRow.id, tenantId: tenant.id });
    if (!user) return res.status(500).json({ ok: false, message: "Failed to build user session" });
    const tokens = createAuthTokens({ userId: user.id, tenantId: tenant.id, roles: user.roles });

    res.json({
      ok: true,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in_sec: tokens.expiresInSec,
      refresh_expires_in_sec: tokens.refreshExpiresInSec,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        roles: user.roles,
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to login" });
  }
});

router.post("/api/mindbase/auth/refresh", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-auth-refresh", 100, 5 * 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const token =
      String(req.body?.refresh_token || "").trim() ||
      String(req.headers?.["x-mindbase-refresh-token"] || "").trim();
    if (!token) return res.status(400).json({ ok: false, message: "refresh_token is required" });

    let claims: ReturnType<typeof verifyMindbaseToken> = null;
    try {
      claims = verifyMindbaseToken(token, "refresh");
    } catch {
      claims = null;
    }
    if (!claims) return res.status(401).json({ ok: false, message: "Invalid refresh token" });
    if (Number(claims.tenantId) !== tenant.id) return res.status(401).json({ ok: false, message: "Token tenant mismatch" });

    const user = await buildSessionUser({ userId: Number(claims.sub), tenantId: tenant.id });
    if (!user) return res.status(401).json({ ok: false, message: "User not found" });
    const tokens = createAuthTokens({ userId: user.id, tenantId: tenant.id, roles: user.roles });

    res.json({
      ok: true,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in_sec: tokens.expiresInSec,
      refresh_expires_in_sec: tokens.refreshExpiresInSec,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to refresh token" });
  }
});

router.get("/api/mindbase/auth/me", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;
    const roles = await listMindbaseRoles(tenant.id, user.id);
    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        roles: Array.from(new Set([...(user.roles || []), ...roles])),
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to resolve identity" });
  }
});

router.get("/api/mindbase/discover", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const q = asText(req.query?.q);
    const category = asText(req.query?.category);
    const limit = Math.max(1, Math.min(toInt(req.query?.limit, 40), 120));

    const filters: any[] = [eq(intellects.tenantId, tenant.id), eq(intellects.isPublished, true)];
    if (category) filters.push(eq(intellects.category, category));
    if (q) {
      filters.push(
        or(
          ilike(intellects.name, `%${q}%`),
          ilike(intellects.slug, `%${q}%`),
          ilike(intellects.tagline, `%${q}%`),
          ilike(intellects.description, `%${q}%`),
        ),
      );
    }

    const items = await db.query.intellects.findMany({
      where: and(...filters),
      orderBy: [desc(intellects.usageCount), desc(intellects.updatedAt)],
      limit,
    });

    const ownerIds = Array.from(new Set(items.map((entry) => Number(entry.ownerUserId)).filter((entry) => entry > 0)));
    const profileRows = ownerIds.length
      ? await db.query.creatorProfiles.findMany({
          where: and(eq(creatorProfiles.tenantId, tenant.id), inArray(creatorProfiles.userId, ownerIds as any)),
        })
      : [];
    const userRows = ownerIds.length
      ? await db.query.eceUsers.findMany({
          where: inArray(eceUsers.id, ownerIds as any),
        })
      : [];

    const payload = items.map((item) => {
      const profile = profileRows.find((entry) => entry.userId === item.ownerUserId);
      const user = userRows.find((entry) => entry.id === item.ownerUserId);
      return {
        source: "intellect",
        id: item.id,
        name: item.name,
        slug: item.slug,
        tagline: item.tagline,
        description: item.description,
        category: item.category,
        tags: item.tags || [],
        access_policy: item.accessPolicy,
        price_per_100_messages: item.pricePer100Messages,
        usage_count: item.usageCount,
        creator: {
          display_name: profile?.displayName || user?.displayName || "Creator",
          headline: profile?.headline || null,
          share_slug: profile?.shareSlug || null,
          verification_status: profile?.verificationStatus || "unverified",
        },
      };
    });

    const assetLimit = Math.max(0, limit - payload.length);
    const publishedNames = new Set(payload.map((item) => String(item.name || "").trim().toLowerCase()).filter(Boolean));
    const assetRows = assetLimit
      ? await listPublicMindbaseMarketplaceAssets({
          q,
          category: category === "Agents" ? "Agents" : category,
          type: "agent",
          limit: assetLimit,
        })
      : [];
    const assetPayload = assetRows
      .filter((asset) => !publishedNames.has(String(asset.name || "").trim().toLowerCase()))
      .map((asset) => ({
        source: "asset",
        id: asset.id,
        name: asset.name,
        slug: slugify(asset.name),
        tagline: asset.description,
        description: asset.description,
        category: asset.category,
        tags: asset.tags || [],
        access_policy: Number(asset.price || 0) > 0 ? "paid" : "public",
        price_per_100_messages: Number(asset.price || 0),
        pricing_label: Number(asset.price || 0) > 0 ? `${Number(asset.price).toLocaleString()} XOF install` : "Free starter install",
        usage_count: asset.installCount,
        install_count: asset.installCount,
        rating: Number(asset.rating || 0),
        plan_requirement: Number(asset.price || 0) > 0 ? "Starter or higher" : "Free",
        tools: asset.tags || [],
        needs: asset.tags || [],
        creator: {
          display_name: "MindBase",
          headline: "Official MindBase launch marketplace",
          share_slug: null,
          verification_status: "verified",
        },
      }));

    const combined = [...payload, ...assetPayload].slice(0, limit);
    res.json({
      ok: true,
      total: combined.length,
      marketplace_seeded: assetPayload.length > 0,
      items: combined,
      emptyState: {
        message: "I do not have an exact match yet, but I can create this agent for you.",
        actions: ["Create custom agent", "Show similar agents", "Ask Adjoa"],
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load intellect marketplace" });
  }
});

router.get("/api/mindbase/intellects/:slug", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const slug = asText(req.params?.slug);
    if (!slug) return res.status(400).json({ ok: false, message: "slug is required" });

    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.tenantId, tenant.id), eq(intellects.slug, slug), eq(intellects.isPublished, true)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Intellect not found" });

    const profile = await db.query.creatorProfiles.findFirst({
      where: and(eq(creatorProfiles.tenantId, tenant.id), eq(creatorProfiles.userId, intellect.ownerUserId)),
    });

    const knowledgeCountRows = await db
      .select({ total: db.$count(intellectKnowledgeFiles.id) })
      .from(intellectKnowledgeFiles)
      .where(and(eq(intellectKnowledgeFiles.tenantId, tenant.id), eq(intellectKnowledgeFiles.intellectId, intellect.id)));

    res.json({
      ok: true,
      item: {
        id: intellect.id,
        name: intellect.name,
        slug: intellect.slug,
        tagline: intellect.tagline,
        description: intellect.description,
        category: intellect.category,
        tags: intellect.tags || [],
        access_policy: intellect.accessPolicy,
        price_per_100_messages: intellect.pricePer100Messages,
        usage_count: intellect.usageCount,
        persona_role: intellect.personaRole,
        persona_tone: intellect.personaTone,
        persona_rules: intellect.personaRules || [],
        style_constraints: intellect.styleConstraints || [],
        creator: profile
          ? {
              display_name: profile.displayName,
              headline: profile.headline,
              share_slug: profile.shareSlug,
              verification_status: profile.verificationStatus,
            }
          : null,
        knowledge_files_count: Number(knowledgeCountRows?.[0]?.total || 0),
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load intellect" });
  }
});

router.get("/api/mindbase/creators/:slug", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const slug = asText(req.params?.slug);
    if (!slug) return res.status(400).json({ ok: false, message: "slug is required" });

    const profile = await db.query.creatorProfiles.findFirst({
      where: and(eq(creatorProfiles.tenantId, tenant.id), eq(creatorProfiles.shareSlug, slug)),
    });
    if (!profile) return res.status(404).json({ ok: false, message: "Creator not found" });

    const published = await db.query.intellects.findMany({
      where: and(eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, profile.userId), eq(intellects.isPublished, true)),
      orderBy: [desc(intellects.updatedAt)],
      limit: 60,
    });

    res.json({
      ok: true,
      profile: {
        id: profile.id,
        display_name: profile.displayName,
        headline: profile.headline,
        bio: profile.bio,
        avatar_url: profile.avatarUrl,
        location: profile.location,
        share_slug: profile.shareSlug,
        verification_status: profile.verificationStatus,
      },
      intellects: published.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        tagline: item.tagline,
        category: item.category,
        tags: item.tags || [],
        access_policy: item.accessPolicy,
        price_per_100_messages: item.pricePer100Messages,
        usage_count: item.usageCount,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load creator profile" });
  }
});

router.get("/api/mindbase/studio/profile", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const profile = await ensureCreatorProfile(tenant.id, user);
    const mindbase = await ensureMindbaseRecord({
      tenantId: tenant.id,
      ownerUserId: user.id,
      title: `${profile.displayName}'s MindBase`,
      tagline: profile.headline || null,
      description: profile.bio || null,
    });
    const wallet = await getOrCreateWalletAccount(String(user.id), "XOF");
    const credits = await getWalletBalance(wallet.id);

    res.json({
      ok: true,
      profile: {
        id: profile.id,
        display_name: profile.displayName,
        headline: profile.headline,
        bio: profile.bio,
        avatar_url: profile.avatarUrl,
        location: profile.location,
        share_slug: profile.shareSlug,
        verification_status: profile.verificationStatus,
      },
      mindbase: mindbase
        ? {
            id: mindbase.id,
            slug: mindbase.slug,
            title: mindbase.title,
            tagline: mindbase.tagline,
            description: mindbase.description,
            is_published: mindbase.isPublished,
          }
        : null,
      credits,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load creator studio profile" });
  }
});

router.put("/api/mindbase/studio/profile", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const profile = await ensureCreatorProfile(tenant.id, user);
    const displayName = asText(req.body?.display_name) || profile.displayName;
    const headline = asText(req.body?.headline);
    const bio = asText(req.body?.bio);
    const location = asText(req.body?.location);

    const [updated] = await db
      .update(creatorProfiles)
      .set({
        displayName,
        headline,
        bio,
        location,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id))
      .returning();
    const mindbase = await ensureMindbaseRecord({
      tenantId: tenant.id,
      ownerUserId: user.id,
      title: asText(req.body?.mindbase_title) || `${displayName}'s MindBase`,
      tagline: asText(req.body?.mindbase_tagline) || headline || null,
      description: asText(req.body?.mindbase_description) || bio || null,
    });

    res.json({
      ok: true,
      profile: updated || profile,
      mindbase: mindbase
        ? {
            id: mindbase.id,
            slug: mindbase.slug,
            title: mindbase.title,
            tagline: mindbase.tagline,
            description: mindbase.description,
            is_published: mindbase.isPublished,
          }
        : null,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to update profile" });
  }
});

router.get("/api/mindbase/studio/intellects", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const rows = await db.query.intellects.findMany({
      where: and(eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, user.id)),
      orderBy: [desc(intellects.updatedAt)],
      limit: 120,
    });

    res.json({ ok: true, items: rows });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list studio intellects" });
  }
});

router.get("/api/mindbase/studio/intellects/:id", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const intellectId = asUuid(req.params?.id);
    if (!intellectId) return res.status(400).json({ ok: false, message: "intellect id is required" });

    const row = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, user.id)),
    });

    if (!row) return res.status(404).json({ ok: false, message: "Intellect not found" });
    res.json({ ok: true, item: row });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load intellect details" });
  }
});

router.post("/api/mindbase/studio/intellects", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;
    const creatorProfile = await ensureCreatorProfile(tenant.id, user);
    await ensureMindbaseRecord({
      tenantId: tenant.id,
      ownerUserId: user.id,
      title: `${creatorProfile.displayName}'s MindBase`,
      tagline: creatorProfile.headline,
      description: creatorProfile.bio,
    });

    const name = asText(req.body?.name);
    if (!name) return res.status(400).json({ ok: false, message: "name is required" });

    let baseSlug = slugify(asText(req.body?.slug) || name);
    let candidate = baseSlug;
    let n = 1;
    while (true) {
      const conflict = await db.query.intellects.findFirst({
        where: and(eq(intellects.tenantId, tenant.id), eq(intellects.slug, candidate)),
      });
      if (!conflict) break;
      n += 1;
      candidate = `${baseSlug}-${n}`;
    }

    const personaRules = normalizeArray(req.body?.persona_rules ?? req.body?.personaRules);
    const styleConstraints = normalizeArray(req.body?.style_constraints ?? req.body?.styleConstraints);
    const agentEmail = await generateUniqueAgentEmail(tenant.id, asText(req.body?.agent_slug) || candidate);
    const draftPrompt = buildSystemPromptFromDraft({
      name,
      description: asText(req.body?.description),
      personaRole: asText(req.body?.persona_role ?? req.body?.personaRole),
      personaTone: asText(req.body?.persona_tone ?? req.body?.personaTone),
      personaRules,
      styleConstraints,
    });

    const [created] = await db
      .insert(intellects)
      .values({
        tenantId: tenant.id,
        ownerUserId: user.id,
        agentId: null,
        name,
        slug: candidate,
        tagline: asText(req.body?.tagline),
        description: asText(req.body?.description),
        category: asText(req.body?.category) || "general",
        tags: sanitizeTagArray(req.body?.tags),
        personaRole: asText(req.body?.persona_role ?? req.body?.personaRole),
        personaTone: asText(req.body?.persona_tone ?? req.body?.personaTone),
        personaRules,
        styleConstraints,
        systemPrompt: asText(req.body?.system_prompt ?? req.body?.systemPrompt) || draftPrompt,
        accessPolicy: (asText(req.body?.access_policy ?? req.body?.accessPolicy) || "private") as any,
        pricePer100Messages: Math.max(0, toInt(req.body?.price_per_100_messages ?? req.body?.pricePer100Messages, 0)),
        agentEmail,
        isPublished: false,
        publishStatus: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json({ ok: true, item: created });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to create intellect" });
  }
});

router.patch("/api/mindbase/studio/intellects/:id", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const intellectId = asUuid(req.params?.id);
    if (!intellectId) return res.status(400).json({ ok: false, message: "intellect id is required" });

    const current = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, user.id)),
    });
    if (!current) return res.status(404).json({ ok: false, message: "Intellect not found" });

    const nextName = asText(req.body?.name) || current.name;
    const nextDescription = asText(req.body?.description);
    const nextPersonaRole = asText(req.body?.persona_role ?? req.body?.personaRole);
    const nextPersonaTone = asText(req.body?.persona_tone ?? req.body?.personaTone);
    const nextPersonaRules = normalizeArray(req.body?.persona_rules ?? req.body?.personaRules);
    const nextStyle = normalizeArray(req.body?.style_constraints ?? req.body?.styleConstraints);

    const draftPrompt = buildSystemPromptFromDraft({
      name: nextName,
      description: nextDescription,
      personaRole: nextPersonaRole,
      personaTone: nextPersonaTone,
      personaRules: nextPersonaRules,
      styleConstraints: nextStyle,
    });

    const [updated] = await db
      .update(intellects)
      .set({
        name: nextName,
        tagline: asText(req.body?.tagline),
        description: nextDescription,
        category: asText(req.body?.category) || current.category,
        tags: req.body?.tags !== undefined ? sanitizeTagArray(req.body?.tags) : current.tags,
        personaRole: nextPersonaRole,
        personaTone: nextPersonaTone,
        personaRules: req.body?.persona_rules !== undefined || req.body?.personaRules !== undefined ? nextPersonaRules : current.personaRules,
        styleConstraints: req.body?.style_constraints !== undefined || req.body?.styleConstraints !== undefined ? nextStyle : current.styleConstraints,
        systemPrompt: asText(req.body?.system_prompt ?? req.body?.systemPrompt) || draftPrompt,
        accessPolicy: ((asText(req.body?.access_policy ?? req.body?.accessPolicy) || current.accessPolicy) as any),
        pricePer100Messages:
          req.body?.price_per_100_messages !== undefined || req.body?.pricePer100Messages !== undefined
            ? Math.max(0, toInt(req.body?.price_per_100_messages ?? req.body?.pricePer100Messages, current.pricePer100Messages || 0))
            : current.pricePer100Messages,
        updatedAt: new Date(),
      })
      .where(eq(intellects.id, current.id))
      .returning();

    res.json({ ok: true, item: updated || current });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to update intellect" });
  }
});

router.post("/api/mindbase/studio/intellects/:id/publish", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const intellectId = asUuid(req.params?.id);
    if (!intellectId) return res.status(400).json({ ok: false, message: "intellect id is required" });

    const current = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, user.id)),
    });
    if (!current) return res.status(404).json({ ok: false, message: "Intellect not found" });

    const autoApprove = hasAdminPrivileges(user);
    const [updated] = await db
      .update(intellects)
      .set({
        publishStatus: autoApprove ? "approved" : "pending",
        isPublished: autoApprove,
        updatedAt: new Date(),
      })
      .where(eq(intellects.id, current.id))
      .returning();

    res.json({ ok: true, item: updated || current, moderation_required: !autoApprove });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to submit intellect for publication" });
  }
});

router.get("/api/mindbase/studio/intellects/:id/knowledge", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const intellectId = asUuid(req.params?.id);
    if (!intellectId) return res.status(400).json({ ok: false, message: "intellect id is required" });

    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, user.id)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Intellect not found" });

    const files = await db.query.intellectKnowledgeFiles.findMany({
      where: and(eq(intellectKnowledgeFiles.tenantId, tenant.id), eq(intellectKnowledgeFiles.intellectId, intellect.id)),
      orderBy: [desc(intellectKnowledgeFiles.updatedAt)],
      limit: 200,
    });

    res.json({ ok: true, items: files });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list knowledge files" });
  }
});

router.post(
  "/api/mindbase/studio/intellects/:id/knowledge",
  knowledgeUpload.single("file"),
  async (req: any, res) => {
    try {
      await ensureMindbaseTables();
      if (!checkRateLimit(req, res, "mindbase-knowledge-upload", 30, 60_000)) return;
      const tenant = requireTenant(req, res);
      if (!tenant) return;
      const user = await requireSessionUser(req, res);
      if (!user) return;

      const intellectId = asUuid(req.params?.id);
      if (!intellectId) return res.status(400).json({ ok: false, message: "intellect id is required" });

      const intellect = await db.query.intellects.findFirst({
        where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, user.id)),
      });
      if (!intellect) return res.status(404).json({ ok: false, message: "Intellect not found" });

      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ ok: false, message: "file is required" });
      if (!isAllowedKnowledgeUpload(file)) {
        return res.status(400).json({ ok: false, message: "Unsupported file format. Allowed: PDF, DOCX, TXT, XLSX." });
      }

      const scopeRaw = asText(req.body?.scope) || "private";
      const scope = ["private", "public", "monetized"].includes(scopeRaw) ? scopeRaw : "private";

      const root = path.resolve(process.cwd(), "uploads", "mindbase", String(tenant.id), String(intellect.id));
      await fs.mkdir(root, { recursive: true });
      const sanitizedName = String(file.originalname || "knowledge.bin").replace(/[^A-Za-z0-9._-]/g, "_");
      const finalPath = path.join(root, `${Date.now()}-${sanitizedName}`);
      await fs.writeFile(finalPath, file.buffer);

      let extractedText: string | null = null;
      let status: "processed" | "failed" = "processed";
      let errorMessage: string | null = null;

      try {
        extractedText = await extractFileText(file);
        if (!extractedText || extractedText.length < 10) {
          throw new Error("No readable text found in the uploaded file");
        }
      } catch (error: any) {
        status = "failed";
        errorMessage = String(error?.message || "Text extraction failed");
      }

      const [saved] = await db
        .insert(intellectKnowledgeFiles)
        .values({
          tenantId: tenant.id,
          intellectId: intellect.id,
          scope: scope as any,
          filename: sanitizedName,
          mime: file.mimetype,
          storageUrl: finalPath,
          extractedText,
          status: status as any,
          errorMessage,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      let chunkCount = 0;
      if (saved && status === "processed" && extractedText) {
        const chunks = safeChunkText(extractedText);
        chunkCount = chunks.length;
        if (chunks.length) {
          const cappedChunks = chunks.slice(0, 120);
          for (let idx = 0; idx < cappedChunks.length; idx += 1) {
            const chunkText = cappedChunks[idx];
            if (!chunkText) continue;
            const embedding = await createEmbedding(chunkText);
            const [createdChunk] = await db
              .insert(intellectKnowledgeChunks)
              .values({
              tenantId: tenant.id,
              intellectId: intellect.id,
              fileId: saved.id,
              chunkIndex: idx,
              sourceFilename: sanitizedName,
              chunkText,
              embedding: embedding?.length ? embedding : null,
              createdAt: new Date(),
            })
              .returning();
            if (embedding?.length && createdChunk && isMindbaseVectorEnabled()) {
              try {
                await db.execute(sql`
                  update intellect_knowledge_chunks
                  set embedding_vector = ${sql.raw(`'${vectorLiteral(embedding)}'::vector`)}
                  where id = ${createdChunk.id}
                `);
              } catch {
                // Keep JSON embedding only when vector storage is unavailable.
              }
            }
          }
        }
      }

      res.status(201).json({ ok: true, item: saved, chunks_created: chunkCount });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error?.message || "Failed to upload knowledge file" });
    }
  },
);

router.post("/api/mindbase/intellects/:id/chat", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-chat", 120, 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const intellectId = asUuid(req.params?.id);
    if (!intellectId) return res.status(400).json({ ok: false, message: "intellect id is required" });

    const userMessage = asText(req.body?.message);
    if (!userMessage) return res.status(400).json({ ok: false, message: "message is required" });
    const requestCorrelationId =
      asText(req.headers?.["x-request-id"]) || asText(req.body?.request_correlation_id ?? req.body?.requestId);
    const workspaceId = asUuid(req.body?.workspace_id ?? req.body?.workspaceId);

    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Intellect not found" });

    if (requestCorrelationId) {
      const duplicate = await db.query.mindbaseUsageEvents.findFirst({
        where: and(
          eq(mindbaseUsageEvents.tenantId, tenant.id),
          eq(mindbaseUsageEvents.userId, user.id),
          eq(mindbaseUsageEvents.intellectId, intellect.id),
          eq(mindbaseUsageEvents.requestCorrelationId, requestCorrelationId),
        ),
        orderBy: [desc(mindbaseUsageEvents.createdAt)],
      });
      if (duplicate?.conversationId) {
        const lastReply = await db.query.intellectMessages.findFirst({
          where: eq(intellectMessages.conversationId, duplicate.conversationId),
          orderBy: [desc(intellectMessages.createdAt)],
        });
        return res.json({
          ok: true,
          idempotent: true,
          conversation_id: duplicate.conversationId,
          blocked: duplicate.eventType === "blocked",
          response: String(lastReply?.content || ""),
          citations: Array.isArray(lastReply?.citations) ? lastReply?.citations : [],
          debited: Number(duplicate.amountInt || 0),
        });
      }
    }

    const isOwner = Number(intellect.ownerUserId) === Number(user.id);
    if (!isOwner && intellect.accessPolicy === "private") {
      return res.status(403).json({ ok: false, message: "This intellect is private" });
    }
    if (!isOwner && !intellect.isPublished) {
      return res.status(403).json({ ok: false, message: "This intellect is not published yet" });
    }

    let conversationId = asUuid(req.body?.conversation_id ?? req.body?.conversationId);
    if (conversationId) {
      const existingConversation = await db.query.intellectConversations.findFirst({
        where: and(eq(intellectConversations.id, conversationId), eq(intellectConversations.tenantId, tenant.id)),
      });
      if (!existingConversation) conversationId = null;
      if (existingConversation && workspaceId && String(existingConversation.workspaceId || "") !== workspaceId) {
        return res.status(400).json({ ok: false, message: "conversation/workspace mismatch" });
      }
    }

    if (workspaceId) {
      const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
      if (!membership) return res.status(403).json({ ok: false, message: "You are not a member of this workspace" });
    }

    if (!conversationId) {
      const [createdConversation] = await db
        .insert(intellectConversations)
        .values({
          tenantId: tenant.id,
          channel: "web",
          externalThreadId: null,
          userId: user.id,
          workspaceId: workspaceId || null,
          intellectId: intellect.id,
          title: userMessage.slice(0, 80),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      conversationId = createdConversation?.id ?? null;
    }
    if (!conversationId) return res.status(500).json({ ok: false, message: "Failed to initialize conversation" });

    await db.insert(intellectMessages).values({
      conversationId,
      senderType: "user",
      senderUserId: user.id,
      content: userMessage,
      citations: null,
      createdAt: new Date(),
    });

    let debited = 0;
    if (!isOwner && intellect.accessPolicy === "paid") {
      const messageCost = computeCreditsCostPerMessage(Number(intellect.pricePer100Messages || 0));
      const wallet = await getOrCreateWalletAccount(String(user.id), "XOF");
      const balance = await getWalletBalance(wallet.id);
      if (balance < messageCost) {
        return res.status(402).json({
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          required: messageCost,
          balance,
          message: "Insufficient credits. Ask an admin to top up your wallet.",
        });
      }

      await debitWallet({
        walletAccountId: wallet.id,
        amount: messageCost,
        entryType: "PURCHASE",
        referenceType: "ORDER",
        referenceId: `mindbase:${conversationId}:${Date.now()}`,
        metadata: {
          intellectId: intellect.id,
          intellectName: intellect.name,
          event: "mindbase_message",
        },
      });
      await recordCreditsLedgerEntry({
        tenantId: tenant.id,
        userId: user.id,
        deltaInt: -messageCost,
        reason: "paid_intellect_message",
        requestCorrelationId,
        metadata: {
          source: "mindbase_chat",
          intellectId: intellect.id,
          conversationId,
        },
      });
      debited = messageCost;
    }

    const allowScopes: Array<"private" | "public" | "monetized"> = isOwner
      ? ["private", "public", "monetized"]
      : intellect.accessPolicy === "paid"
        ? ["public", "monetized"]
        : ["public"];

    const { contextText, citations } = await collectKnowledgeContext({
      tenantId: tenant.id,
      intellectId: intellect.id,
      query: userMessage,
      allowScopes,
    });

    const history = await loadConversationHistory(conversationId);
    const completion = await runMindbaseCompletion({
      systemPrompt:
        asText(intellect.systemPrompt) ||
        buildSystemPromptFromDraft({
          name: intellect.name,
          description: intellect.description,
          personaRole: intellect.personaRole,
          personaTone: intellect.personaTone,
          personaRules: (intellect.personaRules || []) as any,
          styleConstraints: (intellect.styleConstraints || []) as any,
        }),
      userMessage,
      contextText,
      history,
    });

    await db.insert(intellectMessages).values({
      conversationId,
      senderType: completion.blocked ? "system" : "assistant",
      senderUserId: null,
      content: completion.message,
      citations: citations.length ? citations : null,
      createdAt: new Date(),
    });

    await db.update(intellectConversations).set({ updatedAt: new Date() }).where(eq(intellectConversations.id, conversationId));
    await db.update(intellects).set({ usageCount: Number(intellect.usageCount || 0) + 1, updatedAt: new Date() }).where(eq(intellects.id, intellect.id));

    await db.insert(mindbaseUsageEvents).values({
      tenantId: tenant.id,
      userId: user.id,
      intellectId: intellect.id,
      conversationId,
      eventType: completion.blocked ? "blocked" : "message",
      amountInt: debited,
      amountUsd: null,
      requestCorrelationId: requestCorrelationId || null,
      metadata: {
        accessPolicy: intellect.accessPolicy,
        promptTokens: completion.usage?.promptTokens || 0,
        completionTokens: completion.usage?.completionTokens || 0,
        citations: citations.map((entry) => entry.filename),
      },
      createdAt: new Date(),
    });

    res.json({
      ok: true,
      conversation_id: conversationId,
      blocked: completion.blocked,
      response: completion.message,
      citations,
      debited,
      usage: completion.usage || null,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to run intellect chat" });
  }
});

router.get("/api/mindbase/workspaces", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const memberships = await db.query.mindbaseWorkspaceMembers.findMany({
      where: and(eq(mindbaseWorkspaceMembers.tenantId, tenant.id), eq(mindbaseWorkspaceMembers.userId, user.id)),
      orderBy: [desc(mindbaseWorkspaceMembers.updatedAt)],
      limit: 200,
    });
    const workspaceIds = memberships.map((row) => row.workspaceId);
    const workspaces = workspaceIds.length
      ? await db.query.mindbaseWorkspaces.findMany({
          where: and(eq(mindbaseWorkspaces.tenantId, tenant.id), inArray(mindbaseWorkspaces.id, workspaceIds as any)),
          orderBy: [desc(mindbaseWorkspaces.updatedAt)],
        })
      : [];

    res.json({
      ok: true,
      items: workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        role: memberships.find((row) => row.workspaceId === workspace.id)?.role || "member",
        updated_at: workspace.updatedAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list workspaces" });
  }
});

router.post("/api/mindbase/workspaces", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-workspace-create", 30, 60_000)) return;
    const context = await requireMindbaseRole(req, res, ["admin", "creator"]);
    if (!context) return;

    const name = asText(req.body?.name);
    if (!name) return res.status(400).json({ ok: false, message: "name is required" });
    const description = asText(req.body?.description);

    const [workspace] = await db
      .insert(mindbaseWorkspaces)
      .values({
        tenantId: context.tenant.id,
        ownerUserId: context.user.id,
        name,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await db.insert(mindbaseWorkspaceMembers).values({
      tenantId: context.tenant.id,
      workspaceId: workspace.id,
      userId: context.user.id,
      role: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json({ ok: true, item: workspace });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to create workspace" });
  }
});

router.get("/api/mindbase/workspaces/:id", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const workspaceId = asUuid(req.params?.id);
    if (!workspaceId) return res.status(400).json({ ok: false, message: "workspace id is required" });

    const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!membership) return res.status(403).json({ ok: false, message: "Workspace access denied" });

    const workspace = await db.query.mindbaseWorkspaces.findFirst({
      where: and(eq(mindbaseWorkspaces.tenantId, tenant.id), eq(mindbaseWorkspaces.id, workspaceId)),
    });
    if (!workspace) return res.status(404).json({ ok: false, message: "Workspace not found" });

    const members = await db.query.mindbaseWorkspaceMembers.findMany({
      where: and(eq(mindbaseWorkspaceMembers.tenantId, tenant.id), eq(mindbaseWorkspaceMembers.workspaceId, workspaceId)),
      limit: 200,
    });
    const memberUsers = members.length
      ? await db.query.eceUsers.findMany({ where: inArray(eceUsers.id, members.map((row) => row.userId) as any), limit: 200 })
      : [];
    const attached = await db.query.mindbaseWorkspaceAgents.findMany({
      where: and(eq(mindbaseWorkspaceAgents.tenantId, tenant.id), eq(mindbaseWorkspaceAgents.workspaceId, workspaceId)),
      limit: 200,
    });
    const intellectRows = attached.length
      ? await db.query.intellects.findMany({ where: inArray(intellects.id, attached.map((row) => row.intellectId) as any), limit: 200 })
      : [];

    res.json({
      ok: true,
      item: workspace,
      role: membership.role,
      members: members.map((member) => ({
        user_id: member.userId,
        role: member.role,
        display_name: memberUsers.find((entry) => entry.id === member.userId)?.displayName || `User ${member.userId}`,
      })),
      agents: intellectRows.map((agent) => ({
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        access_policy: agent.accessPolicy,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load workspace" });
  }
});

router.get("/api/mindbase/workspaces/:id/brain/files", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const workspaceId = asUuid(req.params?.id);
    if (!workspaceId) return res.status(400).json({ ok: false, message: "workspace id is required" });

    const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!membership) return res.status(403).json({ ok: false, message: "Workspace access denied" });

    const organization = await resolveOrganizationForWorkspace({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!organization) {
      return res.status(409).json({
        ok: false,
        message: "Link this workspace to a MindBase organization before uploading company brain documents.",
      });
    }

    const events = await listWorkspaceBrainDocumentEvents({
      tenantId: tenant.id,
      organizationId: organization.id,
      workspaceId,
      limit: 120,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      organization_id: organization.id,
      workspace_id: workspaceId,
      items: events.map(serializeWorkspaceBrainDocument),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list company brain documents" });
  }
});

router.post(
  "/api/mindbase/workspaces/:id/brain/upload",
  knowledgeUpload.single("file"),
  async (req: any, res) => {
    try {
      await ensureMindbaseTables();
      if (!checkRateLimit(req, res, "mindbase-workspace-brain-upload", 30, 60_000)) return;
      const tenant = requireTenant(req, res);
      if (!tenant) return;
      const user = await requireSessionUser(req, res);
      if (!user) return;

      const workspaceId = asUuid(req.params?.id);
      if (!workspaceId) return res.status(400).json({ ok: false, message: "workspace id is required" });

      const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
      if (!membership) return res.status(403).json({ ok: false, message: "Workspace access denied" });

      const workspace = await db.query.mindbaseWorkspaces.findFirst({
        where: and(eq(mindbaseWorkspaces.tenantId, tenant.id), eq(mindbaseWorkspaces.id, workspaceId)),
      });
      if (!workspace) return res.status(404).json({ ok: false, message: "Workspace not found" });

      const organization = await resolveOrganizationForWorkspace({ tenantId: tenant.id, workspaceId, userId: user.id });
      if (!organization) {
        return res.status(409).json({
          ok: false,
          message: "Link this workspace to a MindBase organization before uploading company brain documents.",
        });
      }

      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ ok: false, message: "file is required" });
      if (!isAllowedKnowledgeUpload(file)) {
        return res.status(400).json({ ok: false, message: "Unsupported file format. Allowed: PDF, DOCX, TXT, XLSX." });
      }

      const root = path.resolve(process.cwd(), "uploads", "mindbase", String(tenant.id), String(workspaceId), "brain");
      await fs.mkdir(root, { recursive: true });
      const sanitizedName = String(file.originalname || "company-brain.bin").replace(/[^A-Za-z0-9._-]/g, "_");
      const finalPath = path.join(root, `${Date.now()}-${crypto.randomUUID()}-${sanitizedName}`);
      await fs.writeFile(finalPath, file.buffer);

      let extractedText = "";
      let chunks: string[] = [];
      let status: "processed" | "failed" = "processed";
      let errorMessage: string | null = null;

      try {
        extractedText = await extractFileText(file);
        if (!extractedText || extractedText.length < 10) {
          throw new Error("No readable text found in the uploaded file");
        }
        chunks = safeChunkText(extractedText).slice(0, 120);
        if (!chunks.length) throw new Error("No readable text chunks could be created");
      } catch (error: any) {
        status = "failed";
        errorMessage = String(error?.message || "Text extraction failed");
      }

      const [event] = await db
        .insert(mindbaseBrainEvents)
        .values({
          tenantId: tenant.id,
          organizationId: organization.id,
          eventType: status === "processed" ? "company_brain.document_processed" : "company_brain.document_failed",
          entityType: "workspace_document",
          entityId: workspaceId,
          payload: {
            workspaceId,
            workspaceName: workspace.name,
            filename: sanitizedName,
            mime: file.mimetype || null,
            bytes: file.buffer.length,
            storageUrl: finalPath,
            status,
            errorMessage,
            extractedChars: extractedText.length,
            chunkCount: chunks.length,
            chunks,
            uploadedByUserId: user.id,
          },
          createdAt: new Date(),
        })
        .returning();

      if (status === "failed") {
        res.status(422).json({
          ok: false,
          message: errorMessage || "Document could not be processed.",
          item: event ? serializeWorkspaceBrainDocument(event) : null,
        });
        return;
      }

      const processedEvents = (await listWorkspaceBrainDocumentEvents({
        tenantId: tenant.id,
        organizationId: organization.id,
        workspaceId,
        limit: 200,
      })).filter((row) => asText(brainEventPayload(row).status) === "processed");
      const companyBrainProgress = Math.min(100, Math.max(Number(workspace.companyBrainProgress || 0), 20 + processedEvents.length * 12));

      const [updatedWorkspace] = await db
        .update(mindbaseWorkspaces)
        .set({
          companyBrainProgress,
          updatedAt: new Date(),
        })
        .where(and(eq(mindbaseWorkspaces.tenantId, tenant.id), eq(mindbaseWorkspaces.id, workspaceId)))
        .returning();

      res.status(201).json({
        ok: true,
        message: "Document processed and attached to the workspace company brain.",
        item: event ? serializeWorkspaceBrainDocument(event) : null,
        workspace: updatedWorkspace || workspace,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error?.message || "Failed to upload company brain document" });
    }
  },
);

router.get("/api/mindbase/workspaces/:id/conversations", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const workspaceId = asUuid(req.params?.id);
    if (!workspaceId) return res.status(400).json({ ok: false, message: "workspace id is required" });
    const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!membership) return res.status(403).json({ ok: false, message: "Workspace access denied" });

    const limit = Math.min(200, Math.max(1, toInt(req.query?.limit, 60)));
    const rows = await db.query.intellectConversations.findMany({
      where: and(
        eq(intellectConversations.tenantId, tenant.id),
        eq(intellectConversations.workspaceId, workspaceId),
        isNull(intellectConversations.archivedAt),
      ),
      orderBy: [desc(intellectConversations.updatedAt)],
      limit,
    });
    const intellectIds = Array.from(new Set(rows.map((row) => String(row.intellectId || "")).filter(Boolean)));
    const intellectRows = intellectIds.length
      ? await db.query.intellects.findMany({ where: inArray(intellects.id, intellectIds as any), limit: 300 })
      : [];
    const intellectById = new Map(intellectRows.map((row) => [String(row.id), row]));

    const items = await Promise.all(
      rows.map(async (conversation) => {
        const lastMessage = await db.query.intellectMessages.findFirst({
          where: eq(intellectMessages.conversationId, conversation.id),
          orderBy: [desc(intellectMessages.createdAt)],
        });
        const intellect = intellectById.get(String(conversation.intellectId || ""));
        return {
          id: conversation.id,
          intellect_id: conversation.intellectId,
          intellect_name: intellect?.name || null,
          intellect_slug: intellect?.slug || null,
          updated_at: conversation.updatedAt,
          title: conversation.title,
          last_message:
            lastMessage?.content && String(lastMessage.content).length > 220
              ? `${String(lastMessage.content).slice(0, 220)}...`
              : String(lastMessage?.content || ""),
        };
      }),
    );

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load workspace conversations" });
  }
});

router.get("/api/mindbase/workspaces/:id/conversations/:conversationId/messages", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const workspaceId = asUuid(req.params?.id);
    const conversationId = asUuid(req.params?.conversationId);
    if (!workspaceId || !conversationId) {
      return res.status(400).json({ ok: false, message: "workspace id and conversation id are required" });
    }

    const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!membership) return res.status(403).json({ ok: false, message: "Workspace access denied" });

    const conversation = await db.query.intellectConversations.findFirst({
      where: and(
        eq(intellectConversations.id, conversationId),
        eq(intellectConversations.tenantId, tenant.id),
        eq(intellectConversations.workspaceId, workspaceId),
      ),
    });
    if (!conversation) return res.status(404).json({ ok: false, message: "Conversation not found" });

    const limit = Math.min(500, Math.max(1, toInt(req.query?.limit, 300)));
    const messages = await db.query.intellectMessages.findMany({
      where: eq(intellectMessages.conversationId, conversationId),
      orderBy: [asc(intellectMessages.createdAt)],
      limit,
    });
    res.json({
      ok: true,
      conversation: {
        id: conversation.id,
        intellect_id: conversation.intellectId,
        title: conversation.title,
        updated_at: conversation.updatedAt,
      },
      items: messages.map((message) => ({
        id: message.id,
        sender_type: message.senderType,
        sender_user_id: message.senderUserId,
        content: message.content,
        citations: Array.isArray(message.citations) ? message.citations : [],
        created_at: message.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load conversation messages" });
  }
});

router.post("/api/mindbase/workspaces/:id/chat", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    if (!checkRateLimit(req, res, "mindbase-workspace-chat", 180, 60_000)) return;

    const user = await requireSessionUser(req, res);
    if (!user) return;
    const workspaceId = asUuid(req.params?.id);
    if (!workspaceId) return res.status(400).json({ ok: false, message: "workspace id is required" });
    const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!membership) return res.status(403).json({ ok: false, message: "Workspace access denied" });

    const userMessage = asText(req.body?.message);
    if (!userMessage) return res.status(400).json({ ok: false, message: "message is required" });
    const requestCorrelationId =
      asText(req.headers?.["x-request-id"]) || asText(req.body?.request_correlation_id ?? req.body?.requestId);

    const attached = await db.query.mindbaseWorkspaceAgents.findMany({
      where: and(eq(mindbaseWorkspaceAgents.tenantId, tenant.id), eq(mindbaseWorkspaceAgents.workspaceId, workspaceId)),
      orderBy: [asc(mindbaseWorkspaceAgents.createdAt)],
      limit: 200,
    });
    if (!attached.length) {
      return res.status(400).json({ ok: false, message: "No agents attached to this workspace" });
    }
    const attachedIds = attached.map((row) => row.intellectId);
    const attachedIntellects = await db.query.intellects.findMany({
      where: and(eq(intellects.tenantId, tenant.id), inArray(intellects.id, attachedIds as any)),
      limit: 220,
    });
    if (!attachedIntellects.length) {
      return res.status(400).json({ ok: false, message: "Attached agents are unavailable" });
    }
    const attachedById = new Map(attachedIntellects.map((item) => [String(item.id), item]));
    const orderedIntellects = attached
      .map((row) => attachedById.get(String(row.intellectId)))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    let routeMode: "mention" | "round_robin" | "sticky" = "round_robin";
    let selectedIntellect = orderedIntellects[0];
    let conversationId = asUuid(req.body?.conversation_id ?? req.body?.conversationId);

    let existingConversation: any = null;
    if (conversationId) {
      existingConversation = await db.query.intellectConversations.findFirst({
        where: and(
          eq(intellectConversations.id, conversationId),
          eq(intellectConversations.tenantId, tenant.id),
          eq(intellectConversations.workspaceId, workspaceId),
        ),
      });
      if (!existingConversation) conversationId = null;
    }

    const latest = await db.query.intellectConversations.findFirst({
      where: and(eq(intellectConversations.tenantId, tenant.id), eq(intellectConversations.workspaceId, workspaceId)),
      orderBy: [desc(intellectConversations.updatedAt)],
    });
    const stickySlug =
      existingConversation?.intellectId && attachedById.get(String(existingConversation.intellectId))
        ? attachedById.get(String(existingConversation.intellectId))?.slug
        : null;
    const latestSlug =
      latest?.intellectId && attachedById.get(String(latest.intellectId))
        ? attachedById.get(String(latest.intellectId))?.slug
        : null;

    const routing = selectWorkspaceAgentRoute({
      message: userMessage,
      orderedAgentSlugs: orderedIntellects.map((item) => String(item.slug || "")),
      stickySlug: stickySlug || null,
      latestSlug: latestSlug || null,
    });
    routeMode = routing.mode;
    const chosenBySlug = orderedIntellects.find((item) => String(item.slug || "").toLowerCase() === String(routing.slug || "").toLowerCase());
    if (chosenBySlug) selectedIntellect = chosenBySlug;

    if (!selectedIntellect) return res.status(400).json({ ok: false, message: "No routable agent found" });

    if (conversationId && existingConversation && String(existingConversation.intellectId) !== String(selectedIntellect.id)) {
      conversationId = null;
    }

    if (!conversationId) {
      const [createdConversation] = await db
        .insert(intellectConversations)
        .values({
          tenantId: tenant.id,
          channel: "web",
          externalThreadId: null,
          userId: user.id,
          workspaceId,
          intellectId: selectedIntellect.id,
          title: userMessage.slice(0, 100),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      conversationId = createdConversation?.id || null;
    }
    if (!conversationId) return res.status(500).json({ ok: false, message: "Failed to initialize conversation" });

    await db.insert(intellectMessages).values({
      conversationId,
      senderType: "user",
      senderUserId: user.id,
      content: userMessage,
      citations: null,
      createdAt: new Date(),
    });

    const isOwner = Number(selectedIntellect.ownerUserId) === Number(user.id);
    let debited = 0;
    if (!isOwner && selectedIntellect.accessPolicy === "paid") {
      const messageCost = computeCreditsCostPerMessage(Number(selectedIntellect.pricePer100Messages || 0));
      const wallet = await getOrCreateWalletAccount(String(user.id), "XOF");
      const balance = await getWalletBalance(wallet.id);
      if (balance < messageCost) {
        return res.status(402).json({
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          required: messageCost,
          balance,
          message: "Insufficient credits. Ask an admin to top up your wallet.",
        });
      }

      await debitWallet({
        walletAccountId: wallet.id,
        amount: messageCost,
        entryType: "PURCHASE",
        referenceType: "ORDER",
        referenceId: `mindbase-workspace:${conversationId}:${Date.now()}`,
        metadata: {
          intellectId: selectedIntellect.id,
          intellectName: selectedIntellect.name,
          event: "mindbase_workspace_message",
          workspaceId,
        },
      });
      await recordCreditsLedgerEntry({
        tenantId: tenant.id,
        userId: user.id,
        deltaInt: -messageCost,
        reason: "paid_workspace_message",
        requestCorrelationId,
        metadata: {
          source: "mindbase_workspace_chat",
          intellectId: selectedIntellect.id,
          workspaceId,
          conversationId,
        },
      });
      debited = messageCost;
    }

    const allowScopes: Array<"private" | "public" | "monetized"> = isOwner
      ? ["private", "public", "monetized"]
      : selectedIntellect.accessPolicy === "paid"
        ? ["public", "monetized"]
        : ["public"];
    const agentKnowledge = await collectKnowledgeContext({
      tenantId: tenant.id,
      intellectId: selectedIntellect.id,
      query: userMessage,
      allowScopes,
    });
    const workspaceBrain = await collectWorkspaceBrainContext({
      tenantId: tenant.id,
      workspaceId,
      userId: user.id,
      query: userMessage,
    });
    const contextText = [
      agentKnowledge.contextText,
      workspaceBrain.contextText ? `Workspace company brain:\n${workspaceBrain.contextText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");
    const citations = [...agentKnowledge.citations, ...workspaceBrain.citations].filter(
      (citation, index, all) => all.findIndex((item) => item.fileId === citation.fileId) === index,
    );

    const history = await loadConversationHistory(conversationId);
    const completion = await runMindbaseCompletion({
      systemPrompt:
        asText(selectedIntellect.systemPrompt) ||
        buildSystemPromptFromDraft({
          name: selectedIntellect.name,
          description: selectedIntellect.description,
          personaRole: selectedIntellect.personaRole,
          personaTone: selectedIntellect.personaTone,
          personaRules: (selectedIntellect.personaRules || []) as any,
          styleConstraints: (selectedIntellect.styleConstraints || []) as any,
        }),
      userMessage,
      contextText,
      history,
    });

    await db.insert(intellectMessages).values({
      conversationId,
      senderType: completion.blocked ? "system" : "assistant",
      senderUserId: null,
      content: completion.message,
      citations: citations.length ? citations : null,
      createdAt: new Date(),
    });
    await db.update(intellectConversations).set({ updatedAt: new Date() }).where(eq(intellectConversations.id, conversationId));
    await db
      .update(intellects)
      .set({ usageCount: Number(selectedIntellect.usageCount || 0) + 1, updatedAt: new Date() })
      .where(eq(intellects.id, selectedIntellect.id));
    await db.insert(mindbaseUsageEvents).values({
      tenantId: tenant.id,
      userId: user.id,
      intellectId: selectedIntellect.id,
      conversationId,
      eventType: completion.blocked ? "blocked" : "workspace_message",
      amountInt: debited,
      amountUsd: null,
      requestCorrelationId: requestCorrelationId || null,
      metadata: {
        workspaceId,
        routeMode,
        routedSlug: selectedIntellect.slug,
        promptTokens: completion.usage?.promptTokens || 0,
        completionTokens: completion.usage?.completionTokens || 0,
      },
      createdAt: new Date(),
    });

    res.json({
      ok: true,
      workspace_id: workspaceId,
      conversation_id: conversationId,
      route_mode: routeMode,
      routed_agent: {
        id: selectedIntellect.id,
        name: selectedIntellect.name,
        slug: selectedIntellect.slug,
      },
      blocked: completion.blocked,
      response: completion.message,
      citations,
      usage: completion.usage || null,
      debited,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to process workspace chat" });
  }
});

router.post("/api/mindbase/workspaces/:id/agents/attach", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const workspaceId = asUuid(req.params?.id);
    const agentId = asUuid(req.body?.agent_id ?? req.body?.agentId);
    if (!workspaceId) return res.status(400).json({ ok: false, message: "workspace id is required" });
    if (!agentId) return res.status(400).json({ ok: false, message: "agent_id is required" });

    const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!membership || !isWorkspaceAdminRole(membership.role)) {
      return res.status(403).json({ ok: false, message: "Workspace admin role required" });
    }

    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, agentId), eq(intellects.tenantId, tenant.id)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Agent not found" });

    const [attached] = await db
      .insert(mindbaseWorkspaceAgents)
      .values({
        tenantId: tenant.id,
        workspaceId,
        intellectId: intellect.id,
        createdAt: new Date(),
      })
      .onConflictDoNothing({
        target: [mindbaseWorkspaceAgents.workspaceId, mindbaseWorkspaceAgents.intellectId],
      })
      .returning();

    res.status(attached ? 201 : 200).json({ ok: true, item: attached || { workspace_id: workspaceId, intellect_id: intellect.id } });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to attach agent to workspace" });
  }
});

router.get("/api/mindbase/workspaces/:id/api-keys", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const workspaceId = asUuid(req.params?.id);
    if (!workspaceId) return res.status(400).json({ ok: false, message: "workspace id is required" });
    const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!membership || !isWorkspaceAdminRole(membership.role)) {
      return res.status(403).json({ ok: false, message: "Workspace admin role required" });
    }

    const keys = await db.query.mindbaseApiKeys.findMany({
      where: and(eq(mindbaseApiKeys.tenantId, tenant.id), eq(mindbaseApiKeys.workspaceId, workspaceId)),
      orderBy: [desc(mindbaseApiKeys.createdAt)],
      limit: 200,
    });
    res.json({
      ok: true,
      items: keys.map((item) => ({
        id: item.id,
        label: item.label,
        created_at: item.createdAt,
        revoked_at: item.revokedAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list API keys" });
  }
});

router.post("/api/mindbase/workspaces/:id/api-keys", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;
    if (!checkRateLimit(req, res, "mindbase-api-key-create", 20, 60_000)) return;

    const workspaceId = asUuid(req.params?.id);
    if (!workspaceId) return res.status(400).json({ ok: false, message: "workspace id is required" });
    const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!membership || !isWorkspaceAdminRole(membership.role)) {
      return res.status(403).json({ ok: false, message: "Workspace admin role required" });
    }

    const rawKey = `mbk_${crypto.randomBytes(24).toString("hex")}`;
    const [saved] = await db
      .insert(mindbaseApiKeys)
      .values({
        tenantId: tenant.id,
        workspaceId,
        keyHash: sha256Hex(rawKey),
        label: asText(req.body?.label) || "Workspace API key",
        createdByUserId: user.id,
        createdAt: new Date(),
      })
      .returning();

    res.status(201).json({
      ok: true,
      item: {
        id: saved.id,
        label: saved.label,
        created_at: saved.createdAt,
      },
      api_key: rawKey,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to create API key" });
  }
});

router.post("/api/mindbase/workspaces/:id/api-keys/:keyId/revoke", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;
    const workspaceId = asUuid(req.params?.id);
    const keyId = asUuid(req.params?.keyId);
    if (!workspaceId || !keyId) return res.status(400).json({ ok: false, message: "workspace id and key id are required" });

    const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
    if (!membership || !isWorkspaceAdminRole(membership.role)) {
      return res.status(403).json({ ok: false, message: "Workspace admin role required" });
    }

    const [updated] = await db
      .update(mindbaseApiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(mindbaseApiKeys.tenantId, tenant.id), eq(mindbaseApiKeys.workspaceId, workspaceId), eq(mindbaseApiKeys.id, keyId)))
      .returning();

    if (!updated) return res.status(404).json({ ok: false, message: "API key not found" });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to revoke API key" });
  }
});

router.post("/api/mindbase/agents/:id/message", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    if (!checkRateLimit(req, res, "mindbase-agent-message", 160, 60_000)) return;

    const apiKey = await resolveWorkspaceApiKey(req, tenant.id);
    const user = apiKey ? null : await requireSessionUser(req, res);
    if (!apiKey && !user) return;

    const message = asText(req.body?.message);
    if (!message) return res.status(400).json({ ok: false, message: "message is required" });
    const workspaceId = asUuid(req.body?.workspace_id ?? req.body?.workspaceId) || apiKey?.workspaceId || null;
    const intellectId = asUuid(req.params?.id);
    if (!intellectId) return res.status(400).json({ ok: false, message: "agent id is required" });

    if (workspaceId && user) {
      const membership = await resolveWorkspaceMembership({ tenantId: tenant.id, workspaceId, userId: user.id });
      if (!membership) return res.status(403).json({ ok: false, message: "Workspace access denied" });
    }

    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Agent not found" });

    const requesterUserId = user?.id || toInt(req.body?.user_id ?? req.body?.userId, 0) || null;
    const ownerAccess = requesterUserId ? Number(intellect.ownerUserId) === Number(requesterUserId) : false;
    if (!ownerAccess && intellect.accessPolicy === "private" && !workspaceId) {
      return res.status(403).json({ ok: false, message: "This agent is private" });
    }

    const [conversation] = await db
      .insert(intellectConversations)
      .values({
        tenantId: tenant.id,
        channel: "api",
        externalThreadId: asText(req.body?.external_thread_id ?? req.body?.externalThreadId),
        userId: requesterUserId,
        workspaceId,
        intellectId: intellect.id,
        title: message.slice(0, 80),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!conversation) return res.status(500).json({ ok: false, message: "Failed to initialize conversation" });

    await db.insert(intellectMessages).values({
      conversationId: conversation.id,
      senderType: "user",
      senderUserId: requesterUserId,
      content: message,
      citations: null,
      createdAt: new Date(),
    });

    const allowScopes: Array<"private" | "public" | "monetized"> = ownerAccess
      ? ["private", "public", "monetized"]
      : intellect.accessPolicy === "paid"
        ? ["public", "monetized"]
        : ["public"];
    const knowledge = await collectKnowledgeContext({
      tenantId: tenant.id,
      intellectId: intellect.id,
      query: message,
      allowScopes,
    });
    const completion = await runMindbaseCompletion({
      systemPrompt:
        asText(intellect.systemPrompt) ||
        buildSystemPromptFromDraft({
          name: intellect.name,
          description: intellect.description,
          personaRole: intellect.personaRole,
          personaTone: intellect.personaTone,
          personaRules: (intellect.personaRules || []) as any,
          styleConstraints: (intellect.styleConstraints || []) as any,
        }),
      userMessage: message,
      contextText: knowledge.contextText,
      history: [],
    });

    let debited = 0;
    if (requesterUserId && !ownerAccess && intellect.accessPolicy === "paid") {
      const cost = computeCreditsCostPerMessage(Number(intellect.pricePer100Messages || 0));
      const wallet = await getOrCreateWalletAccount(String(requesterUserId), "XOF");
      const balance = await getWalletBalance(wallet.id);
      if (balance < cost) {
        return res.status(402).json({ ok: false, code: "INSUFFICIENT_CREDITS", required: cost, balance });
      }
      await debitWallet({
        walletAccountId: wallet.id,
        amount: cost,
        entryType: "PURCHASE",
        referenceType: "ORDER",
        referenceId: `mindbase-api:${conversation.id}:${Date.now()}`,
        metadata: { intellectId: intellect.id, source: "mindbase_api_message" },
      });
      await recordCreditsLedgerEntry({
        tenantId: tenant.id,
        userId: requesterUserId,
        deltaInt: -cost,
        reason: "paid_intellect_api_message",
        requestCorrelationId: asText(req.headers?.["x-request-id"]),
        metadata: {
          source: "mindbase_api_message",
          intellectId: intellect.id,
          conversationId: conversation.id,
          workspaceId: workspaceId || null,
        },
      });
      debited = cost;
    }

    await db.insert(intellectMessages).values({
      conversationId: conversation.id,
      senderType: completion.blocked ? "system" : "assistant",
      senderUserId: null,
      content: completion.message,
      citations: knowledge.citations.length ? knowledge.citations : null,
      createdAt: new Date(),
    });
    await db.insert(mindbaseUsageEvents).values({
      tenantId: tenant.id,
      userId: requesterUserId,
      intellectId: intellect.id,
      conversationId: conversation.id,
      eventType: completion.blocked ? "blocked" : "message",
      amountInt: debited,
      amountUsd: null,
      requestCorrelationId: asText(req.headers?.["x-request-id"]) || null,
      metadata: {
        source: apiKey ? "workspace_api_key" : "user_jwt",
        apiKeyId: apiKey?.id || null,
      },
      createdAt: new Date(),
    });

    res.json({
      ok: true,
      conversation_id: conversation.id,
      blocked: completion.blocked,
      response: completion.message,
      citations: knowledge.citations,
      usage: completion.usage || null,
      debited,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to send message to agent" });
  }
});

router.post("/api/mindbase/email/inbound", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    if (!checkRateLimit(req, res, "mindbase-email-inbound", 120, 60_000)) return;
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const webhookSecret = String(process.env.EMAIL_WEBHOOK_SECRET || "").trim();
    if (webhookSecret) {
      const signature = String(req.headers?.["x-webhook-signature"] || req.headers?.["x-email-signature"] || "").trim();
      const payloadText = JSON.stringify(req.body || {});
      const expected = crypto.createHmac("sha256", webhookSecret).update(payloadText).digest("hex");
      if (!signature || !timingSafeEqualHex(signature, expected)) {
        return res.status(401).json({ ok: false, message: "Invalid webhook signature" });
      }
    }

    const toEmail = normalizeEmailAddress(req.body?.to || req.body?.recipient || req.body?.envelope?.to);
    const fromEmail = normalizeEmailAddress(req.body?.from || req.body?.sender || req.body?.envelope?.from);
    if (!toEmail || !fromEmail) return res.status(400).json({ ok: false, message: "to/from email are required" });

    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.tenantId, tenant.id), eq(intellects.agentEmail, toEmail)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Agent mailbox not found" });

    const subject = asText(req.body?.subject) || "(no subject)";
    const parsedText = asText(req.body?.text || req.body?.stripped_text || req.body?.plain || req.body?.bodyText) || "";
    const rawText =
      asText(req.body?.raw) ||
      asText(req.body?.body) ||
      (typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));

    const [thread] = await db
      .insert(mindbaseEmailThreads)
      .values({
        tenantId: tenant.id,
        intellectId: intellect.id,
        fromEmail,
        toEmail,
        subject,
        createdAt: new Date(),
        lastMessageAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    const resolvedThread =
      thread ||
      (await db.query.mindbaseEmailThreads.findFirst({
        where: and(
          eq(mindbaseEmailThreads.tenantId, tenant.id),
          eq(mindbaseEmailThreads.intellectId, intellect.id),
          eq(mindbaseEmailThreads.fromEmail, fromEmail),
          eq(mindbaseEmailThreads.toEmail, toEmail),
          eq(mindbaseEmailThreads.subject, subject),
        ),
        orderBy: [desc(mindbaseEmailThreads.createdAt)],
      }));
    if (!resolvedThread) return res.status(500).json({ ok: false, message: "Failed to resolve email thread" });

    const [message] = await db
      .insert(mindbaseEmailMessages)
      .values({
        tenantId: tenant.id,
        threadId: resolvedThread.id,
        direction: "inbound",
        fromEmail,
        toEmail,
        messageId: asText(req.body?.message_id ?? req.body?.messageId),
        rawText,
        parsedText,
        metadata: {
          headers: req.body?.headers || null,
          provider: asText(req.body?.provider) || "webhook",
        },
        createdAt: new Date(),
      })
      .returning();

    await db
      .update(mindbaseEmailThreads)
      .set({ lastMessageAt: new Date() })
      .where(eq(mindbaseEmailThreads.id, resolvedThread.id));

    res.status(201).json({
      ok: true,
      thread_id: resolvedThread.id,
      message_id: message?.id || null,
      intellect_id: intellect.id,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to process inbound email" });
  }
});

router.post("/api/mindbase/agents/:id/email/ingest-to-knowledge", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const intellectId = asUuid(req.params?.id);
    if (!intellectId) return res.status(400).json({ ok: false, message: "agent id is required" });
    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, user.id)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Agent not found" });

    const messageIds = normalizeArray(req.body?.message_ids ?? req.body?.messageIds);
    if (!messageIds.length) return res.status(400).json({ ok: false, message: "message_ids is required" });

    const rows = await db.query.mindbaseEmailMessages.findMany({
      where: and(eq(mindbaseEmailMessages.tenantId, tenant.id), inArray(mindbaseEmailMessages.id, messageIds as any)),
      orderBy: [asc(mindbaseEmailMessages.createdAt)],
      limit: 100,
    });
    if (!rows.length) return res.status(404).json({ ok: false, message: "No email messages found" });

    const textBody = rows
      .map((row) => String(row.parsedText || row.rawText || "").trim())
      .filter(Boolean)
      .join("\n\n---\n\n");
    if (!textBody) return res.status(400).json({ ok: false, message: "Selected messages do not contain ingestible text" });

    const scopeRaw = asText(req.body?.scope) || "private";
    const scope = ["private", "public", "monetized"].includes(scopeRaw) ? scopeRaw : "private";
    const syntheticName = `email-thread-${Date.now()}.txt`;
    const [saved] = await db
      .insert(intellectKnowledgeFiles)
      .values({
        tenantId: tenant.id,
        intellectId: intellect.id,
        scope: scope as any,
        filename: syntheticName,
        mime: "text/plain",
        storageUrl: `email://${intellect.id}/${Date.now()}`,
        extractedText: textBody,
        status: "processed",
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const chunks = safeChunkText(textBody).slice(0, 120);
    for (let idx = 0; idx < chunks.length; idx += 1) {
      const chunkText = chunks[idx];
      const embedding = await createEmbedding(chunkText);
      const [chunk] = await db
        .insert(intellectKnowledgeChunks)
        .values({
          tenantId: tenant.id,
          intellectId: intellect.id,
          fileId: saved.id,
          chunkIndex: idx,
          sourceFilename: syntheticName,
          chunkText,
          embedding: embedding?.length ? embedding : null,
          createdAt: new Date(),
        })
        .returning();
      if (embedding?.length && chunk && isMindbaseVectorEnabled()) {
        try {
          await db.execute(sql`
            update intellect_knowledge_chunks
            set embedding_vector = ${sql.raw(`'${vectorLiteral(embedding)}'::vector`)}
            where id = ${chunk.id}
          `);
        } catch {
          // Keep JSON embedding only when vector storage is unavailable.
        }
      }
    }

    res.status(201).json({ ok: true, file_id: saved.id, chunks_created: chunks.length });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to ingest emails into knowledge" });
  }
});

router.get("/api/mindbase/studio/intellects/:id/inbox", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const intellectId = asUuid(req.params?.id);
    if (!intellectId) return res.status(400).json({ ok: false, message: "agent id is required" });
    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, user.id)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Agent not found" });

    const threads = await db.query.mindbaseEmailThreads.findMany({
      where: and(eq(mindbaseEmailThreads.tenantId, tenant.id), eq(mindbaseEmailThreads.intellectId, intellect.id)),
      orderBy: [desc(mindbaseEmailThreads.lastMessageAt)],
      limit: 100,
    });
    res.json({ ok: true, items: threads });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load inbox threads" });
  }
});

router.get("/api/mindbase/studio/intellects/:id/inbox/:threadId/messages", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const intellectId = asUuid(req.params?.id);
    const threadId = asUuid(req.params?.threadId);
    if (!intellectId || !threadId) {
      return res.status(400).json({ ok: false, message: "agent id and thread id are required" });
    }
    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id), eq(intellects.ownerUserId, user.id)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Agent not found" });

    const thread = await db.query.mindbaseEmailThreads.findFirst({
      where: and(
        eq(mindbaseEmailThreads.id, threadId),
        eq(mindbaseEmailThreads.tenantId, tenant.id),
        eq(mindbaseEmailThreads.intellectId, intellect.id),
      ),
    });
    if (!thread) return res.status(404).json({ ok: false, message: "Email thread not found" });

    const messages = await db.query.mindbaseEmailMessages.findMany({
      where: and(eq(mindbaseEmailMessages.tenantId, tenant.id), eq(mindbaseEmailMessages.threadId, thread.id)),
      orderBy: [asc(mindbaseEmailMessages.createdAt)],
      limit: 500,
    });

    res.json({
      ok: true,
      thread,
      items: messages.map((item) => ({
        id: item.id,
        direction: item.direction,
        from_email: item.fromEmail,
        to_email: item.toEmail,
        message_id: item.messageId,
        parsed_text: item.parsedText,
        raw_text: item.rawText,
        metadata: item.metadata,
        created_at: item.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load inbox messages" });
  }
});

router.post("/api/admin/mindbase/intellects/:id/moderate", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const intellectId = asUuid(req.params?.id);
    if (!intellectId) return res.status(400).json({ ok: false, message: "intellect id is required" });

    const action = asText(req.body?.action) || "approve";
    const current = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ ok: false, message: "Intellect not found" });

    let publishStatus: any = current.publishStatus;
    let isPublished = current.isPublished;
    if (action === "approve") {
      publishStatus = "approved";
      isPublished = true;
    } else if (action === "reject") {
      publishStatus = "rejected";
      isPublished = false;
    } else if (action === "unpublish") {
      publishStatus = "draft";
      isPublished = false;
    }

    const [updated] = await db
      .update(intellects)
      .set({ publishStatus, isPublished, updatedAt: new Date() })
      .where(eq(intellects.id, current.id))
      .returning();

    res.json({ ok: true, item: updated || current });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to moderate intellect" });
  }
});

router.get("/api/admin/mindbase/intellects", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const status = asText(req.query?.status);
    const filters: any[] = [eq(intellects.tenantId, tenant.id)];
    if (status) {
      if (status === "published") filters.push(eq(intellects.isPublished, true));
      else filters.push(eq(intellects.publishStatus, status as any));
    }
    const items = await db.query.intellects.findMany({
      where: and(...filters),
      orderBy: [desc(intellects.updatedAt)],
      limit: Math.max(1, Math.min(toInt(req.query?.limit, 200), 500)),
    });
    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list mindbase moderation queue" });
  }
});

router.get("/api/admin/mindbase/dashboard", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const [intellectRows, workspaceRows, userRows, creditRows, pendingRows, paymentRows] = await Promise.all([
      db.query.intellects.findMany({
        where: eq(intellects.tenantId, tenant.id),
        columns: { id: true, isPublished: true, publishStatus: true },
        limit: 5000,
      }),
      db.query.mindbaseWorkspaces.findMany({
        where: eq(mindbaseWorkspaces.tenantId, tenant.id),
        columns: { id: true },
        limit: 5000,
      }),
      db.query.mindbaseUserRoles.findMany({
        where: eq(mindbaseUserRoles.tenantId, tenant.id),
        columns: { userId: true },
        limit: 10000,
      }),
      db.query.mindbaseCreditsLedger.findMany({
        where: eq(mindbaseCreditsLedger.tenantId, tenant.id),
        columns: { deltaInt: true },
        limit: 10000,
      }),
      db.query.intellects.findMany({
        where: and(eq(intellects.tenantId, tenant.id), eq(intellects.publishStatus, "pending")),
        columns: { id: true },
        limit: 5000,
      }),
      db.query.payments.findMany({
        where: eq(payments.tenantId, tenant.id),
        columns: { id: true, amount: true, status: true, provider: true },
        limit: 10000,
      }),
    ]);

    const uniqueUsers = new Set<number>();
    for (const row of userRows) uniqueUsers.add(Number(row.userId));

    const creditsNet = creditRows.reduce((sum, row) => sum + Number(row.deltaInt || 0), 0);
    const published = intellectRows.filter((row) => Boolean(row.isPublished)).length;
    const failedPayments = paymentRows.filter((row) => String(row.status || "").toLowerCase() === "failed").length;
    const revenue = paymentRows
      .filter((row) => String(row.status || "").toLowerCase() === "succeeded")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    res.json({
      ok: true,
      metrics: {
        intellectsTotal: intellectRows.length,
        intellectsPublished: published,
        moderationPending: pendingRows.length,
        workspaces: workspaceRows.length,
        usersWithRoles: uniqueUsers.size,
        creditsNet,
        revenue,
        failedPayments,
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load MindBase admin dashboard" });
  }
});

router.get("/api/admin/mindbase/launch-readiness", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const [organizationRows, workspaceRows, installedAgentRows, intellectRows, paymentRows, marketplaceAgentRows] = await Promise.all([
      db.query.mindbaseOrganizations.findMany({
        where: eq(mindbaseOrganizations.tenantId, tenant.id),
        columns: { id: true, status: true, plan: true },
        limit: 5000,
      }),
      db.query.mindbaseWorkspaces.findMany({
        where: eq(mindbaseWorkspaces.tenantId, tenant.id),
        columns: { id: true, status: true },
        limit: 5000,
      }),
      db.query.mindbaseWorkspaceAgents.findMany({
        where: eq(mindbaseWorkspaceAgents.tenantId, tenant.id),
        columns: { id: true, status: true },
        limit: 10000,
      }),
      db.query.intellects.findMany({
        where: eq(intellects.tenantId, tenant.id),
        columns: { id: true, isPublished: true, publishStatus: true },
        limit: 5000,
      }),
      db.query.payments.findMany({
        where: eq(payments.tenantId, tenant.id),
        columns: { id: true, status: true, amount: true, provider: true },
        limit: 10000,
      }),
      listPublicMindbaseMarketplaceAssets({ type: "agent", limit: 200 }),
    ]);

    const integrations = buildMindbaseIntegrationStatuses();
    const payment = buildPaymentStatus(String(tenant.key || "mindbase"));
    const email = configuredEmailProvider();
    const authMissing = missingEnv(["MINDBASE_JWT_SECRET", "MINDBASE_JWT_REFRESH_SECRET"]);
    const aiConfigured =
      envPresent("OPENAI_API_KEY") ||
      envPresent("ANTHROPIC_API_KEY") ||
      envPresent("GOOGLE_GENERATIVE_AI_API_KEY") ||
      envPresent("GEMINI_API_KEY");
    const errorMonitoringConfigured =
      envPresent("SENTRY_DSN") || envPresent("LOGTAIL_TOKEN") || envPresent("AXIOM_TOKEN") || envPresent("BUGSNAG_API_KEY");
    const publishedIntellects = intellectRows.filter((row) => Boolean(row.isPublished)).length;
    const marketplaceAgents = marketplaceAgentRows.length;
    const launchMarketplaceCount = publishedIntellects + marketplaceAgents;
    const failedPayments = paymentRows.filter((row) => String(row.status || "").toLowerCase() === "failed").length;
    const revenue = paymentRows
      .filter((row) => String(row.status || "").toLowerCase() === "succeeded")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const checks = [
      {
        id: "auth",
        label: "Auth configured",
        status: authMissing.length ? "blocked" : "ready",
        ready: authMissing.length === 0,
        missingEnv: authMissing,
        message: authMissing.length
          ? "MindBase JWT secrets are missing. Email/password auth cannot safely persist sessions in production."
          : "MindBase JWT secrets are configured for persisted sessions.",
      },
      {
        id: "payments",
        label: "Payments configured",
        status: payment.checkoutEnabled ? "ready" : payment.provider === "manual" ? "warning" : "blocked",
        ready: payment.checkoutEnabled,
        missingEnv: payment.missingEnv,
        message: payment.message,
      },
      {
        id: "webhooks",
        label: "Payment webhooks configured",
        status: payment.checkoutEnabled ? "ready" : "blocked",
        ready: payment.checkoutEnabled,
        missingEnv: payment.missingEnv,
        message: payment.checkoutEnabled
          ? "Selected payment provider has webhook credentials configured; still run duplicate and failed-payment sandbox tests."
          : "Payment webhooks are not ready because paid checkout is not fully configured.",
      },
      {
        id: "email",
        label: "Email configured",
        status: email.configured ? "ready" : "blocked",
        ready: email.configured,
        missingEnv: email.missingEnv,
        message: email.configured ? `${email.provider} email sending is configured.` : "Transactional email is not configured.",
      },
      {
        id: "google",
        label: "Google integrations configured",
        status: "blocked",
        ready: false,
        missingEnv: integrations.gmail.missingEnv,
        message:
          "Google OAuth keys alone are not enough. MindBase Gmail/Drive/Calendar callback storage and workspace-scoped token handling are still gated.",
      },
      {
        id: "whatsapp",
        label: "WhatsApp configured",
        status: "blocked",
        ready: false,
        missingEnv: integrations.whatsapp.missingEnv,
        message: integrations.whatsapp.message,
      },
      {
        id: "marketplace",
        label: "Agent marketplace seeded",
        status: launchMarketplaceCount >= 20 ? "ready" : launchMarketplaceCount > 0 ? "warning" : "blocked",
        ready: launchMarketplaceCount >= 20,
        missingEnv: [] as string[],
        message:
          launchMarketplaceCount >= 20
            ? `At least 20 launch marketplace agents are available (${publishedIntellects} published intellects, ${marketplaceAgents} server-backed agent assets).`
            : `Only ${launchMarketplaceCount} launch marketplace agents found. Seed and approve the first 20 launch agents.`,
      },
      {
        id: "onboarding",
        label: "Onboarding tested",
        status: organizationRows.length && workspaceRows.length && installedAgentRows.length ? "warning" : "blocked",
        ready: false,
        missingEnv: [] as string[],
        message:
          organizationRows.length && workspaceRows.length && installedAgentRows.length
            ? "Database records exist for organizations, workspaces, and installed agents. Run the full browser E2E before marking launch-ready."
            : "No complete org/workspace/agent installation evidence exists in this tenant yet.",
      },
      {
        id: "mobile",
        label: "Mobile tested",
        status: "blocked",
        ready: false,
        missingEnv: [] as string[],
        message: "Mobile chat layout still needs Playwright/browser verification before customer launch.",
      },
      {
        id: "ai-provider",
        label: "AI provider configured",
        status: aiConfigured ? "ready" : "blocked",
        ready: aiConfigured,
        missingEnv: aiConfigured ? [] : ["OPENAI_API_KEY"],
        message: aiConfigured
          ? "At least one AI provider key is present."
          : "No AI provider key is present. Configure OpenAI, Anthropic, Gemini, or another supported provider.",
      },
      {
        id: "error-monitoring",
        label: "Error monitoring configured",
        status: errorMonitoringConfigured ? "ready" : "warning",
        ready: errorMonitoringConfigured,
        missingEnv: errorMonitoringConfigured ? [] : ["SENTRY_DSN"],
        message: errorMonitoringConfigured
          ? "Error monitoring env is present."
          : "No error monitoring env was detected. Launch can proceed only with a manual monitoring runbook.",
      },
    ];

    const missingEnvKeys = Array.from(
      new Set([
        ...checks.flatMap((check) => check.missingEnv || []),
        ...uniqueMissingEnvFromStatuses(integrations),
        ...payment.missingEnv,
      ]),
    )
      .filter(Boolean)
      .sort();
    const blocking = checks.filter((check) => check.status === "blocked");
    const warnings = checks.filter((check) => check.status === "warning");

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      tenant: tenant.key,
      ready: blocking.length === 0 && warnings.length === 0,
      summary: {
        organizations: organizationRows.length,
        workspaces: workspaceRows.length,
        installedAgents: installedAgentRows.length,
        publishedIntellects,
        marketplaceAgents,
        revenue,
        failedPayments,
        blocking: blocking.length,
        warnings: warnings.length,
      },
      checks,
      integrations,
      payments: payment,
      missingEnv: missingEnvKeys,
      nextSteps: [
        ...missingEnvKeys.map((key) => `Set ${key} in production env if this feature is required for launch.`),
        ...(payment.checkoutEnabled
          ? ["Run Flutterwave/Kkiapay sandbox checkout, failed payment, abandoned checkout, and duplicate webhook tests."]
          : ["Choose PAYMENT_PROVIDER=flutterwave or PAYMENT_PROVIDER=kkiapay and configure its keys before enabling paid plans."]),
        "Implement and test Google OAuth callback/token storage before enabling Gmail, Drive, or Calendar cards.",
        "Implement and test WhatsApp workspace routing and approval flow before enabling WhatsApp agents.",
        "Run desktop and mobile onboarding E2E from a new visitor through command center access.",
      ],
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load MindBase launch readiness" });
  }
});

router.get("/api/admin/mindbase/payments", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const limit = Math.max(1, Math.min(toInt(req.query?.limit, 100), 500));
    const status = asText(req.query?.status);
    const filters: any[] = [eq(payments.tenantId, tenant.id), eq(payments.purpose, MINDBASE_PAYMENT_PURPOSE)];
    if (status) filters.push(eq(payments.status, status as any));

    const paymentRows = await db.query.payments.findMany({
      where: and(...filters),
      orderBy: [desc(payments.createdAt)],
      limit,
    });
    const paymentIds = paymentRows.map((row) => String(row.id || "")).filter(Boolean);
    const eventRows = paymentIds.length
      ? rowsFromSqlResult<any>(
          await db.execute(sql`
            select
              id::text,
              payment_id::text,
              provider,
              provider_event_id,
              status,
              raw_payload,
              processed_at,
              created_at,
              updated_at
            from mindbase_payment_events
            where tenant_id = ${tenant.id}
              and payment_id in (${sql.join(paymentIds.map((id) => sql`${id}::uuid`), sql`,`)})
            order by created_at desc
            limit 1000
          `),
        )
      : [];
    const eventsByPayment = new Map<string, any[]>();
    for (const event of eventRows) {
      const key = String(event.payment_id || "");
      if (!eventsByPayment.has(key)) eventsByPayment.set(key, []);
      eventsByPayment.get(key)!.push({
        id: String(event.id || ""),
        provider: String(event.provider || ""),
        providerEventId: String(event.provider_event_id || ""),
        status: String(event.status || ""),
        processedAt: event.processed_at || null,
        createdAt: event.created_at || null,
        updatedAt: event.updated_at || null,
      });
    }

    const items = paymentRows.map((row) => {
      const metadata = paymentMetadata(row);
      const normalizedStatus = String(row.status || "").toLowerCase();
      return {
        ...serializeMindbasePayment(row),
        targetType: row.targetType,
        targetId: row.targetId,
        method: row.method,
        pushStatus: row.pushStatus,
        metadata: {
          planId: metadata.planId || null,
          planName: metadata.planName || null,
          organizationId: metadata.organizationId || null,
          organizationSlug: metadata.organizationSlug || null,
          workspaceId: metadata.workspaceId || null,
          entitlement: metadata.entitlement || null,
          lastStatusSource: metadata.lastStatusSource || null,
          lastStatusAt: metadata.lastStatusAt || null,
        },
        webhookEvents: eventsByPayment.get(String(row.id)) || [],
        retryableVerification: ["pending", "processing", "failed"].includes(normalizedStatus),
      };
    });

    const summary = {
      total: paymentRows.length,
      succeeded: paymentRows.filter((row) => String(row.status || "").toLowerCase() === "succeeded").length,
      pending: paymentRows.filter((row) => ["pending", "processing"].includes(String(row.status || "").toLowerCase())).length,
      failed: paymentRows.filter((row) => String(row.status || "").toLowerCase() === "failed").length,
      revenue: paymentRows
        .filter((row) => String(row.status || "").toLowerCase() === "succeeded")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
      events: eventRows.length,
    };

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      tenant: tenant.key,
      summary,
      items,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load MindBase payments" });
  }
});

router.get("/api/admin/mindbase/payments/export.csv", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const paymentRows = await db.query.payments.findMany({
      where: and(eq(payments.tenantId, tenant.id), eq(payments.purpose, MINDBASE_PAYMENT_PURPOSE)),
      orderBy: [desc(payments.createdAt)],
      limit: 5000,
    });
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["id", "provider", "status", "amount", "currency", "plan_id", "plan_name", "target_type", "target_id", "transaction_id", "transaction_ref", "created_at", "updated_at"],
      ...paymentRows.map((row) => {
        const metadata = paymentMetadata(row);
        return [
          row.id,
          row.provider,
          row.status,
          row.amount,
          row.currency,
          metadata.planId || "",
          metadata.planName || "",
          row.targetType,
          row.targetId,
          row.providerTransactionId || "",
          row.providerTransactionRef || "",
          row.createdAt?.toISOString?.() || row.createdAt || "",
          row.updatedAt?.toISOString?.() || row.updatedAt || "",
        ];
      }),
    ];

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="mindbase-payments-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(rows.map((row) => row.map(escapeCsv).join(",")).join("\n"));
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to export MindBase payments" });
  }
});

router.post("/api/admin/mindbase/payments/:paymentId/verify", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const paymentId = asUuid(req.params?.paymentId);
    if (!paymentId) return res.status(400).json({ ok: false, message: "payment id is required" });

    const paymentRow = await db.query.payments.findFirst({
      where: and(eq(payments.tenantId, tenant.id), eq(payments.id, paymentId)),
    });
    if (!paymentRow || String(paymentRow.purpose || "") !== MINDBASE_PAYMENT_PURPOSE) {
      return res.status(404).json({ ok: false, message: "MindBase payment not found" });
    }

    const result = await verifyMindbasePaymentWithGateway({
      tenantId: tenant.id,
      tenantKey: (tenant.key || "mindbase") as TenantKey,
      paymentRow,
      transactionId: asText(req.body?.transactionId ?? req.body?.transaction_id),
      txRef: asText(req.body?.txRef ?? req.body?.tx_ref),
      source: "admin_retry",
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      payment: serializeMindbasePayment(result.payment),
      entitlement: result.entitlement || null,
      pendingReason: (result as any).pendingReason || null,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to verify MindBase payment" });
  }
});

router.get("/api/admin/mindbase/users", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const limit = Math.max(1, Math.min(toInt(req.query?.limit, 200), 1000));

    const roleRows = await db.query.mindbaseUserRoles.findMany({
      where: eq(mindbaseUserRoles.tenantId, tenant.id),
      columns: { userId: true, role: true, createdAt: true, updatedAt: true },
      orderBy: [desc(mindbaseUserRoles.updatedAt)],
      limit: limit * 10,
    });

    const userIds = Array.from(new Set(roleRows.map((row) => Number(row.userId)).filter((id) => Number.isFinite(id) && id > 0)));
    const users = userIds.length
      ? await db.query.eceUsers.findMany({
          where: and(eq(eceUsers.isActive, true), inArray(eceUsers.id, userIds as any)),
          columns: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            roles: true,
            currentMode: true,
            createdAt: true,
            updatedAt: true,
          },
          limit: Math.max(limit, userIds.length),
        })
      : [];

    const rolesByUser = new Map<number, string[]>();
    for (const row of roleRows) {
      const userId = Number(row.userId || 0);
      if (!userId) continue;
      const current = rolesByUser.get(userId) || [];
      current.push(String(row.role || "client"));
      rolesByUser.set(userId, Array.from(new Set(current)));
    }

    const items = users
      .map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        roles: user.roles,
        currentMode: user.currentMode,
        mindbaseRoles: rolesByUser.get(Number(user.id)) || ["client"],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }))
      .sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || "")))
      .slice(0, limit);

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list MindBase users" });
  }
});

router.get("/api/admin/mindbase/credits/ledger", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const limit = Math.max(1, Math.min(toInt(req.query?.limit, 200), 1000));

    const items = await db.query.mindbaseCreditsLedger.findMany({
      where: eq(mindbaseCreditsLedger.tenantId, tenant.id),
      orderBy: [desc(mindbaseCreditsLedger.createdAt)],
      limit,
    });

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list MindBase credits ledger" });
  }
});

router.get("/api/admin/mindbase/workspaces", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const limit = Math.max(1, Math.min(toInt(req.query?.limit, 200), 1000));

    const items = await db.query.mindbaseWorkspaces.findMany({
      where: eq(mindbaseWorkspaces.tenantId, tenant.id),
      orderBy: [desc(mindbaseWorkspaces.updatedAt)],
      limit,
    });

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list MindBase workspaces" });
  }
});

router.get("/api/admin/mindbase/agents", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const limit = Math.max(1, Math.min(toInt(req.query?.limit, 200), 1000));

    const items = await db.query.agents.findMany({
      where: eq(agents.tenantId, tenant.id),
      orderBy: [desc(agents.updatedAt)],
      limit,
      columns: {
        id: true,
        name: true,
        role: true,
        status: true,
        hierarchyLevel: true,
        intelligenceCap: true,
        maxDailyTokens: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to list MindBase base agents" });
  }
});

router.post("/api/admin/mindbase/credits/topup", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const userId = toInt(req.body?.user_id ?? req.body?.userId, 0);
    const amount = toInt(req.body?.amount ?? req.body?.amountInt, 0);
    if (userId <= 0) return res.status(400).json({ ok: false, message: "user_id is required" });
    if (amount <= 0) return res.status(400).json({ ok: false, message: "amount must be > 0" });

    const wallet = await getOrCreateWalletAccount(String(userId), "XOF");
    const entry = await creditWallet({
      walletAccountId: wallet.id,
      amount,
      entryType: "ADJUSTMENT",
      referenceType: "ADMIN_ADJ",
      referenceId: `mindbase-topup:${Date.now()}:${userId}`,
        metadata: {
          source: "mindbase_admin_topup",
          reason: asText(req.body?.reason) || "Mindbase credits topup",
          adminUserId: Number(req.adminUser?.id || 0) || null,
        },
      });
    await recordCreditsLedgerEntry({
      tenantId: tenant.id,
      userId,
      deltaInt: amount,
      reason: asText(req.body?.reason) || "Mindbase credits topup",
      requestCorrelationId: asText(req.headers?.["x-request-id"]),
      metadata: {
        source: "mindbase_admin_topup",
        adminUserId: Number(req.adminUser?.id || 0) || null,
      },
    });
    const balance = await getWalletBalance(wallet.id);
    res.json({ ok: true, entry, balance });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to top up credits" });
  }
});

router.post("/api/mindbase/admin/users/:id/credits", async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const context = await requireMindbaseRole(req, res, ["admin"]);
    if (!context) return;
    const userId = toInt(req.params?.id, 0);
    const amount = toInt(req.body?.amount, 0);
    if (userId <= 0) return res.status(400).json({ ok: false, message: "valid user id is required" });
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ ok: false, message: "amount must be non-zero" });
    }

    const wallet = await getOrCreateWalletAccount(String(userId), "XOF");
    const referenceId = `mindbase-admin-user-credits:${Date.now()}:${userId}`;
    const reason = asText(req.body?.reason) || "Mindbase admin credits adjustment";
    const payload = {
      walletAccountId: wallet.id,
      amount: Math.abs(amount),
      entryType: amount > 0 ? ("ADJUSTMENT" as const) : ("PURCHASE" as const),
      referenceType: amount > 0 ? ("ADMIN_ADJ" as const) : ("ORDER" as const),
      referenceId,
      metadata: {
        source: "mindbase_admin_user_credits",
        adminUserId: context.user.id,
        reason,
      },
    };

    if (amount > 0) {
      await creditWallet(payload);
    } else {
      const currentBalance = await getWalletBalance(wallet.id);
      if (currentBalance < Math.abs(amount)) {
        return res.status(402).json({
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          message: "User has insufficient credits for this debit",
          balance: currentBalance,
          required: Math.abs(amount),
        });
      }
      await debitWallet(payload);
    }

    await recordCreditsLedgerEntry({
      tenantId: context.tenant.id,
      userId,
      deltaInt: amount,
      reason,
      requestCorrelationId: asText(req.headers?.["x-request-id"]),
      metadata: {
        source: "mindbase_admin_user_credits",
        adminUserId: context.user.id,
      },
    });

    const balance = await getWalletBalance(wallet.id);
    res.json({ ok: true, user_id: userId, delta: amount, balance });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to adjust user credits" });
  }
});

router.post("/api/admin/mindbase/promote-agent", ensureTenantAdmin, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const agentId = toInt(req.body?.agent_id ?? req.body?.agentId, 0);
    const ownerUserId = toInt(req.body?.owner_user_id ?? req.body?.ownerUserId, 0);
    if (agentId <= 0) return res.status(400).json({ ok: false, message: "agent_id is required" });
    if (ownerUserId <= 0) return res.status(400).json({ ok: false, message: "owner_user_id is required" });

    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return res.status(404).json({ ok: false, message: "Agent not found" });
    const owner = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, ownerUserId) });
    if (!owner) return res.status(404).json({ ok: false, message: "Owner user not found" });

    const baseName = asText(req.body?.name) || String(agent.name || `Agent ${agent.id}`);
    const baseSlug = slugify(asText(req.body?.slug) || baseName);
    let slug = baseSlug;
    let i = 1;
    while (true) {
      const conflict = await db.query.intellects.findFirst({
        where: and(eq(intellects.tenantId, tenant.id), eq(intellects.slug, slug)),
      });
      if (!conflict) break;
      i += 1;
      slug = `${baseSlug}-${i}`;
    }

    const [created] = await db
      .insert(intellects)
      .values({
        tenantId: tenant.id,
        ownerUserId: owner.id,
        agentId: agent.id,
        name: baseName,
        slug,
        tagline: asText(req.body?.tagline) || `Intellect powered by ${String(agent.role || "expert workflow")}`,
        description: asText(req.body?.description) || String(agent.mission || agent.cv || ""),
        category: asText(req.body?.category) || "general",
        tags: sanitizeTagArray(req.body?.tags),
        personaRole: asText(req.body?.persona_role ?? req.body?.personaRole) || String(agent.role || "Expert"),
        personaTone: asText(req.body?.persona_tone ?? req.body?.personaTone) || "direct and practical",
        personaRules: normalizeArray(req.body?.persona_rules ?? req.body?.personaRules),
        styleConstraints: normalizeArray(req.body?.style_constraints ?? req.body?.styleConstraints),
        systemPrompt:
          asText(req.body?.system_prompt ?? req.body?.systemPrompt) ||
          buildSystemPromptFromDraft({
            name: baseName,
            description: asText(req.body?.description) || String(agent.mission || agent.cv || ""),
            personaRole: asText(req.body?.persona_role ?? req.body?.personaRole) || String(agent.role || "Expert"),
            personaTone: asText(req.body?.persona_tone ?? req.body?.personaTone) || "direct and practical",
            personaRules: normalizeArray(req.body?.persona_rules ?? req.body?.personaRules),
            styleConstraints: normalizeArray(req.body?.style_constraints ?? req.body?.styleConstraints),
          }),
        accessPolicy: (asText(req.body?.access_policy ?? req.body?.accessPolicy) || "private") as any,
        pricePer100Messages: Math.max(0, toInt(req.body?.price_per_100_messages ?? req.body?.pricePer100Messages, 0)),
        agentEmail: await generateUniqueAgentEmail(tenant.id, asText(req.body?.agent_slug) || slug),
        isPublished: false,
        publishStatus: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json({ ok: true, item: created });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to promote agent to intellect" });
  }
});

router.get("/api/internal/intellects/search", ensureTenantStaff, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const q = asText(req.query?.query) || asText(req.query?.q);

    const filters: any[] = [eq(intellects.tenantId, tenant.id), eq(intellects.isPublished, true)];
    if (q) {
      filters.push(
        or(
          ilike(intellects.name, `%${q}%`),
          ilike(intellects.slug, `%${q}%`),
          ilike(intellects.tagline, `%${q}%`),
          ilike(intellects.description, `%${q}%`),
        ),
      );
    }

    const items = await db.query.intellects.findMany({
      where: and(...filters),
      orderBy: [desc(intellects.usageCount), desc(intellects.updatedAt)],
      limit: Math.max(1, Math.min(toInt(req.query?.limit, 40), 100)),
    });

    res.json({
      ok: true,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        category: item.category,
        access_policy: item.accessPolicy,
        price_per_100_messages: item.pricePer100Messages,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to search intellects" });
  }
});

router.post("/api/internal/intellects/:id/invoke", ensureTenantStaff, async (req: any, res) => {
  try {
    await ensureMindbaseTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const intellectId = asUuid(req.params?.id);
    const message = asText(req.body?.message);
    if (!intellectId) return res.status(400).json({ ok: false, message: "intellect id is required" });
    if (!message) return res.status(400).json({ ok: false, message: "message is required" });

    const intellect = await db.query.intellects.findFirst({
      where: and(eq(intellects.id, intellectId), eq(intellects.tenantId, tenant.id), eq(intellects.isPublished, true)),
    });
    if (!intellect) return res.status(404).json({ ok: false, message: "Intellect not found" });

    const knowledge = await collectKnowledgeContext({
      tenantId: tenant.id,
      intellectId: intellect.id,
      query: message,
      allowScopes: ["public", "monetized"],
    });

    const completion = await runMindbaseCompletion({
      systemPrompt:
        asText(intellect.systemPrompt) ||
        buildSystemPromptFromDraft({
          name: intellect.name,
          description: intellect.description,
          personaRole: intellect.personaRole,
          personaTone: intellect.personaTone,
          personaRules: (intellect.personaRules || []) as any,
          styleConstraints: (intellect.styleConstraints || []) as any,
        }),
      userMessage: message,
      contextText: knowledge.contextText,
      history: [],
    });

    res.json({
      ok: true,
      blocked: completion.blocked,
      response: completion.message,
      citations: knowledge.citations,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to invoke intellect" });
  }
});

router.post("/api/internal/intellects/:id/credits/debit", ensureTenantStaff, async (req: any, res) => {
  try {
    const userId = toInt(req.body?.user_id ?? req.body?.userId, 0);
    const amount = toInt(req.body?.amount, 0);
    if (userId <= 0) return res.status(400).json({ ok: false, message: "user_id is required" });
    if (amount <= 0) return res.status(400).json({ ok: false, message: "amount must be > 0" });

    const wallet = await getOrCreateWalletAccount(String(userId), "XOF");
    const balanceBefore = await getWalletBalance(wallet.id);
    if (balanceBefore < amount) {
      return res.status(402).json({ ok: false, message: "insufficient balance", balance: balanceBefore, required: amount });
    }

    const entry = await debitWallet({
      walletAccountId: wallet.id,
      amount,
      entryType: "PURCHASE",
      referenceType: "ORDER",
      referenceId: `mindbase-internal-debit:${Date.now()}:${userId}`,
      metadata: {
        source: "internal_intellect_debit",
        intellectId: asUuid(req.params?.id),
      },
    });

    const balanceAfter = await getWalletBalance(wallet.id);
    res.json({ ok: true, entry, balance_before: balanceBefore, balance_after: balanceAfter });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to debit credits" });
  }
});

export default router;
