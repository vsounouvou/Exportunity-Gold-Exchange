import { readFile } from "fs/promises";
import { createReadStream } from "fs";
import OpenAI from "openai";

export type VoiceTranscribeProvider = "whisper-service" | "openai";
type ProviderPreference = "whisper_service" | "browser_speech" | "openai";

const DEFAULT_PRIMARY_PROVIDER: ProviderPreference = "whisper_service";
const DEFAULT_SECONDARY_PROVIDER: ProviderPreference = "browser_speech";
const DEFAULT_TERTIARY_PROVIDER: ProviderPreference = "openai";
const CONNECT_TIMEOUT_MS = 3_000;
const WHISPER_TOTAL_TIMEOUT_MS = 25_000;

export type VoiceTranscribeInput = {
  filePath: string;
  fileName?: string | null;
  mimeType?: string | null;
  language?: string | null;
  prompt?: string | null;
};

export type VoiceTranscribeResult = {
  text: string;
  model: string;
  provider: VoiceTranscribeProvider;
  language: string | null;
  confidence?: number;
};

export type VoiceTranscriptionAttempt = {
  provider: VoiceTranscribeProvider;
  ok: boolean;
  durationMs: number;
  error?: string;
};

export type VoiceTranscribeDetailedResult = VoiceTranscribeResult & {
  durationMs: number;
  attempts: VoiceTranscriptionAttempt[];
};

export type VoiceTranscribeRunOptions = {
  allowFallback?: boolean;
  primaryTimeoutMs?: number;
  fallbackTimeoutMs?: number;
};

export interface TranscriptionProvider {
  id: VoiceTranscribeProvider;
  isConfigured: () => boolean;
  transcribe: (input: VoiceTranscribeInput, timeoutMs: number) => Promise<VoiceTranscribeResult>;
}

export type TranscriptionProviderHealth = {
  primary: ProviderPreference;
  secondary: ProviderPreference;
  tertiary: ProviderPreference;
  openaiEnabled: boolean;
  providers: {
    whisperService: {
      configured: boolean;
      endpoint: string | null;
      reachable: boolean;
      statusCode: number | null;
      error: string | null;
    };
    browserSpeech: {
      configured: boolean;
      serverSide: false;
    };
    openai: {
      configured: boolean;
      enabled: boolean;
      endpoint: string | null;
    };
  };
};

function parseBooleanLike(value: unknown, fallback: boolean) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

function normalizeBaseUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `http://${raw.replace(/\/+$/, "")}`;
}

function normalizeProviderPreference(value: unknown, fallback: ProviderPreference): ProviderPreference {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  if (["whisper", "whisper_service", "whisper-service"].includes(raw)) return "whisper_service";
  if (["browser", "browser_speech", "browser-speech"].includes(raw)) return "browser_speech";
  if (raw === "openai") return "openai";
  return fallback;
}

function getProviderPreferences() {
  return {
    primary: normalizeProviderPreference(process.env.TRANSCRIPTION_PROVIDER_PRIMARY, DEFAULT_PRIMARY_PROVIDER),
    secondary: normalizeProviderPreference(process.env.TRANSCRIPTION_PROVIDER_SECONDARY, DEFAULT_SECONDARY_PROVIDER),
    tertiary: normalizeProviderPreference(process.env.TRANSCRIPTION_PROVIDER_TERTIARY, DEFAULT_TERTIARY_PROVIDER),
  };
}

function resolveWhisperEndpoint() {
  const explicit = String(process.env.WHISPER_TRANSCRIBE_URL || "").trim();
  if (explicit) return normalizeBaseUrl(explicit);

  const base = normalizeBaseUrl(
    String(
      process.env.WHISPER_SERVICE_URL ||
        process.env.FASTER_WHISPER_URL ||
        process.env.WHISPER_BASE_URL ||
        process.env.WHISPER_API_URL ||
        process.env.WHISPER_URL ||
        "",
    ).trim(),
  );
  if (!base) return "";
  if (/\/transcribe\/?$/i.test(base)) return base;

  const path = String(process.env.WHISPER_TRANSCRIBE_PATH || "/transcribe").trim() || "/transcribe";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function getOpenAiApiKey() {
  return String(process.env.OPENAI_API_KEY || "").trim();
}

function getOpenAiBaseUrl() {
  return String(process.env.OPENAI_BASE_URL || "").trim();
}

function getOpenAiModel() {
  return String(process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1").trim() || "whisper-1";
}

function isOpenAiTranscriptionEnabled() {
  return parseBooleanLike(process.env.OPENAI_TRANSCRIPTION_ENABLED, false);
}

function resolveOpenAiTranscribeEndpoint() {
  const explicit = String(process.env.OPENAI_TRANSCRIBE_URL || "").trim();
  if (explicit) return normalizeBaseUrl(explicit);

  const base = normalizeBaseUrl(getOpenAiBaseUrl() || "https://api.openai.com");
  const path = String(process.env.OPENAI_TRANSCRIBE_PATH || "/v1/audio/transcriptions").trim() || "/v1/audio/transcriptions";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseTimeoutMs() {
  const parsed = Number.parseInt(String(process.env.VOICE_TRANSCRIBE_TIMEOUT_MS || "90000"), 10);
  if (!Number.isFinite(parsed) || parsed < 5_000) return 90_000;
  return Math.min(parsed, 5 * 60_000);
}

function normalizeTimeoutMs(value: unknown, fallbackMs: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 3_000) return fallbackMs;
  return Math.min(Math.trunc(parsed), 5 * 60_000);
}

function summarizeFetchFailure(error: any, fallback: string) {
  if (!error) return fallback;
  if (error?.name === "AbortError") return "request_timeout";
  const message = String(error?.message || error || "").trim();
  return message || fallback;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutCode: string): Promise<T> {
  const safeTimeoutMs = normalizeTimeoutMs(timeoutMs, parseTimeoutMs());
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutCode)), safeTimeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function probeEndpointReachability(url: string, timeoutMs: number) {
  const endpoint = String(url || "").trim();
  if (!endpoint) {
    return {
      reachable: false,
      statusCode: null as number | null,
      error: "not_configured",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1_000, Math.trunc(timeoutMs)));
  try {
    const response = await fetch(endpoint, {
      method: "OPTIONS",
      signal: controller.signal,
    });
    return {
      reachable: true,
      statusCode: Number.isFinite(Number(response.status)) ? Number(response.status) : null,
      error: null as string | null,
    };
  } catch (error: any) {
    return {
      reachable: false,
      statusCode: null as number | null,
      error: summarizeFetchFailure(error, "request_failed"),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function isVoiceTranscriptionConfigured() {
  const whisperEndpoint = resolveWhisperEndpoint();
  if (whisperEndpoint) return true;
  return Boolean(isOpenAiTranscriptionEnabled() && getOpenAiApiKey());
}

async function transcribeWithWhisperService(input: VoiceTranscribeInput, timeoutMs: number): Promise<VoiceTranscribeResult> {
  const endpoint = resolveWhisperEndpoint();
  if (!endpoint) throw new Error("whisper_service_not_configured");

  const probe = await probeEndpointReachability(endpoint, CONNECT_TIMEOUT_MS);
  if (!probe.reachable) {
    throw new Error(`whisper_service_connection_failed: ${probe.error || "connect_timeout"}`);
  }

  const bytes = await readFile(input.filePath);
  if (!bytes.length) throw new Error("audio_file_empty");

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([bytes], { type: String(input.mimeType || "audio/webm") }),
    String(input.fileName || "voice.webm"),
  );
  if (input.language) formData.append("language", String(input.language));
  if (input.prompt) formData.append("prompt", String(input.prompt));

  const totalTimeoutMs = Math.min(normalizeTimeoutMs(timeoutMs, WHISPER_TOTAL_TIMEOUT_MS), WHISPER_TOTAL_TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), totalTimeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        body: formData as any,
        signal: controller.signal,
      });
    } catch (error: any) {
      throw new Error(`whisper_service_connection_failed: ${summarizeFetchFailure(error, "request_failed")}`);
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    let payload: any = null;
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    } else {
      payload = await response.text().catch(() => "");
    }

    if (!response.ok) {
      const detail =
        typeof payload === "string"
          ? payload
          : typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.message === "string"
              ? payload.message
              : `HTTP ${response.status}`;
      throw new Error(`whisper_service_failed: ${detail}`);
    }

    const text = String(
      typeof payload === "string"
        ? payload
        : payload?.text ?? payload?.transcript ?? payload?.result?.text ?? payload?.data?.text ?? "",
    ).trim();
    if (!text) throw new Error("whisper_service_empty_transcript");

    return {
      text,
      provider: "whisper-service",
      model: String(payload?.model || "faster-whisper").trim(),
      language: String(payload?.language || input.language || "").trim() || null,
      ...(Number.isFinite(Number(payload?.confidence)) ? { confidence: Number(payload?.confidence) } : {}),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function getOpenAiClient() {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;
  const baseURL = getOpenAiBaseUrl();
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
}

async function transcribeWithOpenAISdk(input: VoiceTranscribeInput, timeoutMs: number): Promise<VoiceTranscribeResult> {
  if (!isOpenAiTranscriptionEnabled()) throw new Error("openai_transcription_disabled");
  const openaiClient = getOpenAiClient();
  if (!openaiClient) throw new Error("openai_not_configured");

  const request = openaiClient.audio.transcriptions.create({
    model: getOpenAiModel(),
    file: createReadStream(input.filePath) as any,
    ...(input.language ? { language: input.language } : {}),
    ...(input.prompt ? { prompt: input.prompt } : {}),
  } as any);

  let result: any;
  try {
    result = await withTimeout(request as Promise<any>, timeoutMs, "openai_sdk_timeout");
  } catch (error: any) {
    throw new Error(`openai_sdk_failed: ${String(error?.message || error || "request_failed")}`);
  }

  const text = String(result?.text || "").trim();
  if (!text) throw new Error("openai_empty_transcript");

  return {
    text,
    provider: "openai",
    model: getOpenAiModel(),
    language: String(result?.language || input.language || "").trim() || null,
    ...(Number.isFinite(Number(result?.confidence)) ? { confidence: Number(result?.confidence) } : {}),
  };
}

async function transcribeWithOpenAIFetch(input: VoiceTranscribeInput, timeoutMs: number): Promise<VoiceTranscribeResult> {
  if (!isOpenAiTranscriptionEnabled()) throw new Error("openai_transcription_disabled");
  const openAiApiKey = getOpenAiApiKey();
  if (!openAiApiKey) throw new Error("openai_not_configured");

  const endpoint = resolveOpenAiTranscribeEndpoint();
  const bytes = await readFile(input.filePath);
  if (!bytes.length) throw new Error("audio_file_empty");

  const formData = new FormData();
  formData.append("model", getOpenAiModel());
  formData.append(
    "file",
    new Blob([bytes], { type: String(input.mimeType || "audio/webm") }),
    String(input.fileName || "voice.webm"),
  );
  if (input.language) formData.append("language", String(input.language));
  if (input.prompt) formData.append("prompt", String(input.prompt));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), normalizeTimeoutMs(timeoutMs, parseTimeoutMs()));
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
        },
        body: formData as any,
        signal: controller.signal,
      });
    } catch (error: any) {
      throw new Error(`openai_http_connection_failed: ${summarizeFetchFailure(error, "request_failed")}`);
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    let payload: any = null;
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    } else {
      payload = await response.text().catch(() => "");
    }

    if (!response.ok) {
      const detail =
        typeof payload === "string"
          ? payload
          : typeof payload?.error?.message === "string"
            ? payload.error.message
            : typeof payload?.error === "string"
              ? payload.error
              : typeof payload?.message === "string"
                ? payload.message
                : `HTTP ${response.status}`;
      throw new Error(`openai_http_failed: ${detail}`);
    }

    const text = String(
      typeof payload === "string"
        ? payload
        : payload?.text ?? payload?.transcript ?? payload?.result?.text ?? payload?.data?.text ?? "",
    ).trim();
    if (!text) throw new Error("openai_http_empty_transcript");

    return {
      text,
      provider: "openai",
      model: String(payload?.model || getOpenAiModel()).trim() || getOpenAiModel(),
      language: String(payload?.language || input.language || "").trim() || null,
      ...(Number.isFinite(Number(payload?.confidence)) ? { confidence: Number(payload?.confidence) } : {}),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function appendProviderOnce(providers: TranscriptionProvider[], provider: TranscriptionProvider) {
  if (providers.some((item) => item.id === provider.id)) return;
  providers.push(provider);
}

export function getDefaultTranscriptionProviders(): TranscriptionProvider[] {
  const providers: TranscriptionProvider[] = [];
  const preferences = getProviderPreferences();
  const requestedOrder: ProviderPreference[] = [preferences.primary, preferences.secondary, preferences.tertiary];
  const whisperConfigured = Boolean(resolveWhisperEndpoint());
  const openAiConfigured = Boolean(getOpenAiApiKey()) && isOpenAiTranscriptionEnabled();

  const whisperProvider: TranscriptionProvider = {
    id: "whisper-service",
    isConfigured: () => Boolean(resolveWhisperEndpoint()),
    transcribe: (input, timeoutMs) => transcribeWithWhisperService(input, timeoutMs),
  };

  const openAiProvider: TranscriptionProvider = {
    id: "openai",
    isConfigured: () => Boolean(isOpenAiTranscriptionEnabled() && getOpenAiApiKey()),
    transcribe: async (input, timeoutMs) => {
      try {
        return await transcribeWithOpenAISdk(input, timeoutMs);
      } catch {
        return await transcribeWithOpenAIFetch(input, timeoutMs);
      }
    },
  };

  for (const preference of requestedOrder) {
    if (preference === "whisper_service" && whisperConfigured) {
      appendProviderOnce(providers, whisperProvider);
      continue;
    }
    if (preference === "openai" && openAiConfigured) {
      appendProviderOnce(providers, openAiProvider);
      continue;
    }
  }

  if (!providers.length) {
    if (whisperConfigured) appendProviderOnce(providers, whisperProvider);
    if (openAiConfigured) appendProviderOnce(providers, openAiProvider);
  }

  return providers;
}

export async function transcribeWithProviders(
  input: VoiceTranscribeInput,
  providers: TranscriptionProvider[],
  options: VoiceTranscribeRunOptions = {},
): Promise<VoiceTranscribeDetailedResult> {
  const configuredProviders = providers.filter((provider) => provider.isConfigured());
  if (!configuredProviders.length) throw new Error("transcription_not_configured");

  const allowFallback = options.allowFallback !== false;
  const defaultTimeout = parseTimeoutMs();
  const primaryTimeoutMs = normalizeTimeoutMs(options.primaryTimeoutMs, defaultTimeout);
  const fallbackTimeoutMs = normalizeTimeoutMs(options.fallbackTimeoutMs, defaultTimeout);
  const attempts: VoiceTranscriptionAttempt[] = [];
  const errors: string[] = [];
  const startedAt = Date.now();

  for (let index = 0; index < configuredProviders.length; index += 1) {
    const provider = configuredProviders[index];
    const timeoutMs = index === 0 ? primaryTimeoutMs : fallbackTimeoutMs;
    const attemptStartedAt = Date.now();
    try {
      const result = await provider.transcribe(input, timeoutMs);
      attempts.push({
        provider: provider.id,
        ok: true,
        durationMs: Date.now() - attemptStartedAt,
      });

      return {
        ...result,
        durationMs: Date.now() - startedAt,
        attempts,
      };
    } catch (error: any) {
      const errorText = String(error?.message || error || "transcription_failed");
      attempts.push({
        provider: provider.id,
        ok: false,
        durationMs: Date.now() - attemptStartedAt,
        error: errorText,
      });
      errors.push(errorText);
      if (!allowFallback) break;
    }
  }

  const failure = new Error(errors.join(" | ") || "transcription_failed");
  (failure as any).attempts = attempts;
  throw failure;
}

export async function transcribeAudioFileDetailed(
  input: VoiceTranscribeInput,
  options: VoiceTranscribeRunOptions = {},
): Promise<VoiceTranscribeDetailedResult> {
  const whisperConfigured = Boolean(resolveWhisperEndpoint());
  const providers = getDefaultTranscriptionProviders();
  const serverProviders = whisperConfigured ? providers.filter((provider) => provider.id === "whisper-service") : providers;
  return transcribeWithProviders(input, serverProviders, {
    ...options,
    allowFallback: whisperConfigured ? false : options.allowFallback,
    ...(whisperConfigured
      ? {
          primaryTimeoutMs: Math.min(
            normalizeTimeoutMs(options.primaryTimeoutMs, WHISPER_TOTAL_TIMEOUT_MS),
            WHISPER_TOTAL_TIMEOUT_MS,
          ),
        }
      : {}),
  });
}

export async function transcribeAudioFile(input: VoiceTranscribeInput): Promise<VoiceTranscribeResult> {
  const detailed = await transcribeAudioFileDetailed(input, { allowFallback: true });
  return {
    text: detailed.text,
    model: detailed.model,
    provider: detailed.provider,
    language: detailed.language,
    ...(Number.isFinite(Number(detailed.confidence)) ? { confidence: Number(detailed.confidence) } : {}),
  };
}

export async function getTranscriptionProviderHealth(): Promise<TranscriptionProviderHealth> {
  const preferences = getProviderPreferences();
  const whisperEndpoint = resolveWhisperEndpoint();
  const whisperProbe = whisperEndpoint
    ? await probeEndpointReachability(whisperEndpoint, CONNECT_TIMEOUT_MS)
    : {
        reachable: false,
        statusCode: null,
        error: "not_configured",
      };

  return {
    primary: preferences.primary,
    secondary: preferences.secondary,
    tertiary: preferences.tertiary,
    openaiEnabled: isOpenAiTranscriptionEnabled(),
    providers: {
      whisperService: {
        configured: Boolean(whisperEndpoint),
        endpoint: whisperEndpoint || null,
        reachable: Boolean(whisperProbe.reachable),
        statusCode: Number.isFinite(Number(whisperProbe.statusCode)) ? Number(whisperProbe.statusCode) : null,
        error: whisperProbe.error ? String(whisperProbe.error) : null,
      },
      browserSpeech: {
        configured: true,
        serverSide: false,
      },
      openai: {
        configured: Boolean(getOpenAiApiKey()),
        enabled: isOpenAiTranscriptionEnabled(),
        endpoint: resolveOpenAiTranscribeEndpoint(),
      },
    },
  };
}
