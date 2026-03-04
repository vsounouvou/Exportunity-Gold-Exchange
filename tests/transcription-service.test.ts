import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefaultTranscriptionProviders,
  type TranscriptionProvider,
  transcribeWithProviders,
  type VoiceTranscribeInput,
} from "../server/lib/voice/transcriber";

const INPUT: VoiceTranscribeInput = {
  filePath: "/tmp/does-not-matter.webm",
  fileName: "sample.webm",
  mimeType: "audio/webm",
};

function withEnv(overrides: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });
}

test("transcribeWithProviders falls back to secondary provider", async () => {
  const providers: TranscriptionProvider[] = [
    {
      id: "whisper-service",
      isConfigured: () => true,
      transcribe: async () => {
        throw new Error("primary_failed");
      },
    },
    {
      id: "openai",
      isConfigured: () => true,
      transcribe: async () => ({
        text: "hello world",
        model: "whisper-1",
        provider: "openai",
        language: "en",
      }),
    },
  ];

  const result = await transcribeWithProviders(INPUT, providers, {
    allowFallback: true,
    primaryTimeoutMs: 1000,
    fallbackTimeoutMs: 1000,
  });

  assert.equal(result.provider, "openai");
  assert.equal(result.text, "hello world");
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]?.ok, false);
  assert.equal(result.attempts[1]?.ok, true);
});

test("transcribeWithProviders does not fallback when disabled", async () => {
  const providers: TranscriptionProvider[] = [
    {
      id: "whisper-service",
      isConfigured: () => true,
      transcribe: async () => {
        throw new Error("primary_failed");
      },
    },
    {
      id: "openai",
      isConfigured: () => true,
      transcribe: async () => ({
        text: "should-not-be-used",
        model: "whisper-1",
        provider: "openai",
        language: "en",
      }),
    },
  ];

  await assert.rejects(
    () =>
      transcribeWithProviders(INPUT, providers, {
        allowFallback: false,
        primaryTimeoutMs: 1000,
        fallbackTimeoutMs: 1000,
      }),
    /primary_failed/,
  );
});

test("getDefaultTranscriptionProviders excludes OpenAI when disabled", async () => {
  await withEnv(
    {
      OPENAI_API_KEY: "sk-test",
      OPENAI_TRANSCRIPTION_ENABLED: "false",
      WHISPER_SERVICE_URL: "",
      WHISPER_TRANSCRIBE_URL: "",
    },
    async () => {
      const providers = getDefaultTranscriptionProviders();
      assert.equal(providers.some((provider) => provider.id === "openai"), false);
    },
  );
});

test("getDefaultTranscriptionProviders includes OpenAI when explicitly enabled", async () => {
  await withEnv(
    {
      OPENAI_API_KEY: "sk-test",
      OPENAI_TRANSCRIPTION_ENABLED: "true",
      WHISPER_SERVICE_URL: "",
      WHISPER_TRANSCRIBE_URL: "",
      TRANSCRIPTION_PROVIDER_PRIMARY: "openai",
      TRANSCRIPTION_PROVIDER_SECONDARY: "browser_speech",
      TRANSCRIPTION_PROVIDER_TERTIARY: "whisper_service",
    },
    async () => {
      const providers = getDefaultTranscriptionProviders();
      assert.equal(providers.some((provider) => provider.id === "openai"), true);
    },
  );
});
