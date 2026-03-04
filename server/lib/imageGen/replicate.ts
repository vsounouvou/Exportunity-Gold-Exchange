const DEFAULT_QUALITY_MODEL = process.env.REPLICATE_MODEL_QUALITY || "black-forest-labs/flux-dev";
const DEFAULT_FAST_MODEL = process.env.REPLICATE_MODEL_FAST || "black-forest-labs/flux-schnell";

const versionCache = new Map<string, string>();

const DEFAULT_TIMEOUT_MS = parseInt(process.env.REPLICATE_HTTP_TIMEOUT_MS || "20000", 10);
const DEFAULT_RETRIES = 2;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function isRetryableError(err: unknown): boolean {
  const name = (err as any)?.name;
  return name === "AbortError" || name === "TypeError";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  opts?: { timeoutMs?: number; retries?: number }
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts?.retries ?? DEFAULT_RETRIES;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (res.ok) {
        return (await res.json()) as T;
      }
      const text = await res.text();
      const err = new Error(`HTTP ${res.status}: ${text}`);
      lastErr = err;
      if (attempt < retries && isRetryableStatus(res.status)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw err;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetryableError(err)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function resolveModelVersion(modelRef: string, token: string) {
  if (!modelRef.includes("/")) return modelRef;
  const cached = versionCache.get(modelRef);
  if (cached) return cached;

  const data = await fetchJsonWithRetry<any>(`https://api.replicate.com/v1/models/${modelRef}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const version = data?.latest_version?.id;
  if (!version) {
    throw new Error(`Replicate model lookup missing latest_version for ${modelRef}`);
  }
  versionCache.set(modelRef, version);
  return version;
}

export type ReplicateMode = "quality" | "fast";

export async function createPrediction({
  prompt,
  negative_prompt,
  mode = "quality",
  model,
  input = {},
}: {
  prompt: string;
  negative_prompt?: string;
  mode?: ReplicateMode;
  model?: string;
  input?: Record<string, any>;
}) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN not configured");
  }

  const modelRef = model || (mode === "fast" ? DEFAULT_FAST_MODEL : DEFAULT_QUALITY_MODEL);
  const version = await resolveModelVersion(modelRef, token);

  const body = {
    version,
    input: {
      prompt,
      ...(negative_prompt ? { negative_prompt } : {}),
      ...input,
    },
    stream: false,
  };

  return fetchJsonWithRetry<any>(
    "https://api.replicate.com/v1/predictions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
    { timeoutMs: parseInt(process.env.REPLICATE_CREATE_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10) }
  );
}

export async function getPrediction(id: string) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN not configured");
  }

  return fetchJsonWithRetry<any>(
    `https://api.replicate.com/v1/predictions/${id}`,
    { headers: { Authorization: `Bearer ${token}` } },
    { timeoutMs: parseInt(process.env.REPLICATE_GET_TIMEOUT_MS || "15000", 10) }
  );
}
