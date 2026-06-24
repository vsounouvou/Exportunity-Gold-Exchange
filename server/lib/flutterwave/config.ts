import crypto from "crypto";

import type { TenantKey } from "../tenants";

export type FlutterwaveMode = "SANDBOX" | "LIVE";
export type FlutterwaveApiVersion = "v3" | "v4";

const TENANT_SUFFIX_ALIASES: Record<TenantKey, string[]> = {
  bdo: ["BDO", "BOURSE"],
  agoojye: ["AGOOJYE", "AGOOJYE_MOBILITY"],
  exportunity: ["EXPO", "EXPORTUNITY"],
  zone: ["ZONE"],
  mindbase: ["MINDBASE"],
  met: ["MET", "MAISONENTERRE", "MAISON_EN_TERRE"],
  vs: ["VS", "VITALSOUNOUVOU", "VITAL_SOUNOUVOU"],
  hoz: ["HOZ", "HOUSEOFZOGUE", "HOUSE_OF_ZOGUE"],
  zogueland: ["ZOGUELAND"],
  madd: ["MADD", "MADDACADEMY", "MADD_ACADEMY"],
  rayon1km: ["RAYON1KM", "RAYON"],
  xportcard: ["XPORTCARD", "XCARD", "XPORT"],
};

const SHARED_FLUTTERWAVE_SUFFIXES = ["EXPO", "EXPORTUNITY"];

function normalizeMode(value: string | null | undefined): FlutterwaveMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "sandbox") return "SANDBOX";
  if (normalized === "live" || normalized === "production" || normalized === "prod") return "LIVE";
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return nodeEnv === "production" ? "LIVE" : "SANDBOX";
}

function parseModeOverride(value: unknown): FlutterwaveMode | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "sandbox") return "SANDBOX";
  if (raw === "live" || raw === "production" || raw === "prod") return "LIVE";
  return null;
}

function firstEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function suffixesForTenant(tenantKey: TenantKey): string[] {
  return uniqueStrings([
    ...(TENANT_SUFFIX_ALIASES[tenantKey] || []),
    ...SHARED_FLUTTERWAVE_SUFFIXES,
  ]);
}

function keyForMode(base: string, mode: FlutterwaveMode) {
  return `${base}_${mode}`;
}

function uniqueStrings(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function envCandidates(basePrefix: string, tenantKey: TenantKey, mode: FlutterwaveMode): string[] {
  const suffixes = suffixesForTenant(tenantKey);
  const modeSuffix = mode === "SANDBOX" ? "SANDBOX" : "LIVE";
  const candidates: string[] = [];

  for (const suffix of suffixes) {
    candidates.push(keyForMode(`${basePrefix}_${suffix}`, modeSuffix));
    candidates.push(`${basePrefix}_${suffix}`);
  }
  candidates.push(keyForMode(basePrefix, modeSuffix));
  candidates.push(basePrefix);

  return uniqueStrings(candidates);
}

export function getFlutterwaveMode(tenantKey: TenantKey, modeOverride?: string | null): FlutterwaveMode {
  const explicitMode = parseModeOverride(modeOverride);
  if (explicitMode) return explicitMode;

  const suffixes = suffixesForTenant(tenantKey);
  const mode = firstEnv(
    ...suffixes.flatMap((suffix) => [`FLW_MODE_${suffix}`, `FLUTTERWAVE_MODE_${suffix}`]),
    "FLW_MODE",
    "FLUTTERWAVE_MODE",
    "PAYMENTS_MODE",
    "PAYMENT_MODE",
    ...suffixes.flatMap((suffix) => [`KIKI_MODE_${suffix}`]),
    "KIKI_MODE",
  );
  return normalizeMode(mode);
}

export function getFlutterwaveKeyEnvVarNames(tenantKey: TenantKey, mode: FlutterwaveMode) {
  return {
    clientId: envCandidates("FLW_CLIENT_ID", tenantKey, mode).concat(envCandidates("FLUTTERWAVE_CLIENT_ID", tenantKey, mode)),
    clientSecret: envCandidates("FLW_CLIENT_SECRET", tenantKey, mode).concat(
      envCandidates("FLUTTERWAVE_CLIENT_SECRET", tenantKey, mode),
    ),
    publicKey: envCandidates("FLW_PUBLIC_KEY", tenantKey, mode).concat(envCandidates("FLUTTERWAVE_PUBLIC_KEY", tenantKey, mode)),
    secretKey: envCandidates("FLW_SECRET_KEY", tenantKey, mode).concat(envCandidates("FLUTTERWAVE_SECRET_KEY", tenantKey, mode)),
    encryptionKey: envCandidates("FLW_ENCRYPTION_KEY", tenantKey, mode).concat(envCandidates("FLUTTERWAVE_ENCRYPTION_KEY", tenantKey, mode)),
    webhookHash: envCandidates("FLW_WEBHOOK_HASH", tenantKey, mode).concat(envCandidates("FLUTTERWAVE_WEBHOOK_HASH", tenantKey, mode)),
  };
}

export function getFlutterwaveKeys(tenantKey: TenantKey, modeOverride?: string | null) {
  const mode = getFlutterwaveMode(tenantKey, modeOverride);
  const names = getFlutterwaveKeyEnvVarNames(tenantKey, mode);

  const clientId = firstEnv(...names.clientId) ?? "";
  const clientSecret = firstEnv(...names.clientSecret) ?? "";
  const publicKey = firstEnv(...names.publicKey) ?? "";
  const secretKey = firstEnv(...names.secretKey) ?? "";
  const encryptionKey = firstEnv(...names.encryptionKey);
  const webhookHash = firstEnv(...names.webhookHash);
  const version: FlutterwaveApiVersion = clientId || clientSecret || encryptionKey ? "v4" : "v3";
  const configured =
    version === "v4"
      ? Boolean(clientId && clientSecret && encryptionKey)
      : Boolean(secretKey);

  return {
    mode,
    version,
    clientId,
    clientSecret,
    publicKey,
    secretKey,
    encryptionKey,
    webhookHash,
    configured,
    envVarNames: names,
  };
}

export function verifyFlutterwaveWebhookHash(input: {
  headerValue: string | string[] | undefined;
  expectedHash: string | null | undefined;
}) {
  const expected = String(input.expectedHash || "").trim();
  const headerRaw = Array.isArray(input.headerValue) ? input.headerValue[0] : input.headerValue;
  const received = String(headerRaw || "").trim();

  if (!expected || !received) return false;

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

export function verifyFlutterwaveWebhookSignature(input: {
  version: FlutterwaveApiVersion;
  rawBody: Buffer | string | undefined;
  headerValue: string | string[] | undefined;
  expectedHash: string | null | undefined;
}) {
  if (input.version === "v3") {
    return verifyFlutterwaveWebhookHash({
      headerValue: input.headerValue,
      expectedHash: input.expectedHash,
    });
  }

  const expected = String(input.expectedHash || "").trim();
  const headerRaw = Array.isArray(input.headerValue) ? input.headerValue[0] : input.headerValue;
  const received = String(headerRaw || "").trim();
  const rawBody =
    typeof input.rawBody === "string" ? Buffer.from(input.rawBody) : Buffer.isBuffer(input.rawBody) ? input.rawBody : null;

  if (!expected || !received || !rawBody?.length) return false;

  const digest = crypto.createHmac("sha256", expected).update(rawBody).digest("base64");
  const expectedBuf = Buffer.from(digest);
  const receivedBuf = Buffer.from(received);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
