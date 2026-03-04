import { createHash, createHmac, timingSafeEqual } from "crypto";

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const body = entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(",");
    return `{${body}}`;
  }

  return JSON.stringify(String(value));
}

export function computeStableJsonHash(payload: unknown): string {
  const normalized = stableSerialize(payload);
  return createHash("sha256").update(normalized).digest("hex");
}

export function resolveWorkflowSigningSecret(): string {
  const configured = String(process.env.INTELLIGENCE_WORKFLOW_SIGNING_KEY || "").trim();
  if (configured) return configured;
  return "development-intelligence-signing-key";
}

export function signHash(hash: string, secret = resolveWorkflowSigningSecret()): string {
  const signature = createHmac("sha256", secret).update(String(hash)).digest("hex");
  return `v1.${signature}`;
}

export function verifyHashSignature(hash: string, signature: string, secret = resolveWorkflowSigningSecret()): boolean {
  const sig = String(signature || "").trim();
  if (!sig.startsWith("v1.")) return false;

  const expected = Buffer.from(signHash(hash, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function signWorkflowSpec(spec: unknown, secret = resolveWorkflowSigningSecret()) {
  const workflowHash = computeStableJsonHash(spec);
  const signature = signHash(workflowHash, secret);
  return { workflowHash, signature };
}

export function verifyWorkflowSpecSignature(spec: unknown, signature: string, secret = resolveWorkflowSigningSecret()) {
  const workflowHash = computeStableJsonHash(spec);
  return verifyHashSignature(workflowHash, signature, secret);
}
