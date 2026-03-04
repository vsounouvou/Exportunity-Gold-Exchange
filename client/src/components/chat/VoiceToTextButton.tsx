import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { nextVoiceInputState, type VoiceInputState } from "./voiceStateMachine";

type RecordedPayload = {
  blob: Blob;
  mimeType: string;
  fileName: string;
  durationMs: number;
};

type VoiceToTextButtonProps = {
  disabled?: boolean;
  draftText: string;
  setDraftText: (text: string) => void;
  appendDraftText: (text: string) => void;
  conversationId?: string | null;
  tenantId?: number | null;
  apiClient?: (path: string, options?: RequestInit) => Promise<any>;
  autoSendAfterTranscription?: boolean;
  onAutoSend?: () => void;
};

const RECORDING_MAX_MS = 120_000;
const UPLOAD_STAGE_MS = 10_000;
const TRANSCRIBE_STAGE_MS = 20_000;
const HARD_TIMEOUT_MS = UPLOAD_STAGE_MS + TRANSCRIBE_STAGE_MS;
const SERVER_FALLBACK_HINT = "Server transcription unavailable - using browser speech (Chrome/Edge recommended).";

function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "audio/wav",
  ];
  for (const candidate of candidates) {
    try {
      if ((window as any)?.MediaRecorder?.isTypeSupported?.(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return "";
}

function buildFilename(mimeType: string) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("ogg")) return `voice-${Date.now()}.ogg`;
  if (mime.includes("mp4") || mime.includes("m4a")) return `voice-${Date.now()}.m4a`;
  if (mime.includes("wav")) return `voice-${Date.now()}.wav`;
  if (mime.includes("mpeg") || mime.includes("mp3")) return `voice-${Date.now()}.mp3`;
  return `voice-${Date.now()}.webm`;
}

export function VoiceToTextButton({
  disabled,
  draftText,
  setDraftText,
  appendDraftText,
  conversationId,
  tenantId,
  apiClient,
  autoSendAfterTranscription = false,
  onAutoSend,
}: VoiceToTextButtonProps) {
  const { toast } = useToast();
  const mediaRecorderSupported = useMemo(() => typeof window !== "undefined" && "MediaRecorder" in window, []);
  const browserSpeechSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }, []);
  const supported = mediaRecorderSupported || browserSpeechSupported;
  const requestApi = apiClient ?? apiRequest;

  const [state, setState] = useState<VoiceInputState>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverFallbackHint, setServerFallbackHint] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<any | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const recordingLimitTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const transcribeStageTimerRef = useRef<number | null>(null);
  const hardTimeoutRef = useRef<number | null>(null);
  const lastPayloadRef = useRef<RecordedPayload | null>(null);
  const localTranscriptFinalRef = useRef<string>("");
  const localTranscriptInterimRef = useRef<string>("");

  const isBusy = state === "UPLOADING" || state === "TRANSCRIBING";
  const isRecording = state === "RECORDING";

  const clearTimers = () => {
    if (recordingLimitTimerRef.current) {
      window.clearTimeout(recordingLimitTimerRef.current);
      recordingLimitTimerRef.current = null;
    }
    if (transcribeStageTimerRef.current) {
      window.clearTimeout(transcribeStageTimerRef.current);
      transcribeStageTimerRef.current = null;
    }
    if (hardTimeoutRef.current) {
      window.clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
  };

  const cleanupMedia = () => {
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {
      // ignore
    }
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  };

  const stopBrowserSpeechRecognition = () => {
    try {
      speechRecognitionRef.current?.stop?.();
    } catch {
      // ignore
    }
    speechRecognitionRef.current = null;
  };

  const startBrowserSpeechRecognition = () => {
    if (!browserSpeechSupported) return;
    try {
      const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!Ctor) return;
      const recognition = new Ctor();
      recognition.lang = String(window?.navigator?.language || "en-US");
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = Number(event?.resultIndex || 0); i < Number(event?.results?.length || 0); i += 1) {
          const result = event.results[i];
          const transcript = String(result?.[0]?.transcript || "").trim();
          if (!transcript) continue;
          if (result?.isFinal) {
            localTranscriptFinalRef.current = `${localTranscriptFinalRef.current} ${transcript}`.trim();
          } else {
            interim = `${interim} ${transcript}`.trim();
          }
        }
        localTranscriptInterimRef.current = interim;
      };
      recognition.onerror = () => {
        // best-effort fallback only
      };
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      // ignore
    }
  };

  const getBrowserTranscriptFallback = () => {
    const merged = `${localTranscriptFinalRef.current} ${localTranscriptInterimRef.current}`.trim();
    return merged.replace(/\s+/g, " ");
  };

  const logClientEvent = async (eventType: string, payload: Record<string, any> = {}) => {
    try {
      await requestApi("/api/transcription/events", {
        method: "POST",
        body: JSON.stringify({
          eventType,
          conversationId: conversationId ?? null,
          tenantId: tenantId ?? null,
          ...payload,
        }),
      });
    } catch {
      // best-effort telemetry
    }
  };

  const resetToIdle = () => {
    setState("IDLE");
    setErrorMessage(null);
    setServerFallbackHint(null);
  };

  const setFailed = (message: string) => {
    setState((prev) => nextVoiceInputState(prev, "FAIL"));
    setErrorMessage(message);
  };

  const insertTranscript = (text: string) => {
    const clean = String(text || "").trim();
    if (!clean) return;

    if (!String(draftText || "").trim()) {
      setDraftText(clean);
    } else {
      appendDraftText(clean);
    }

    if (autoSendAfterTranscription && onAutoSend) {
      onAutoSend();
    }
  };

  const transcribePayload = async (payload: RecordedPayload) => {
    clearTimers();
    setErrorMessage(null);
    setServerFallbackHint(null);
    setState("UPLOADING");

    const formData = new FormData();
    formData.append("file", new File([payload.blob], payload.fileName, { type: payload.mimeType || "audio/webm" }));
    formData.append("durationMs", String(Math.max(1, Math.trunc(payload.durationMs || 0))));
    if (conversationId) formData.append("conversationId", conversationId);
    if (tenantId != null) formData.append("tenantId", String(tenantId));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    transcribeStageTimerRef.current = window.setTimeout(() => {
      setState((prev) => (prev === "UPLOADING" ? "TRANSCRIBING" : prev));
    }, UPLOAD_STAGE_MS);

    hardTimeoutRef.current = window.setTimeout(() => {
      controller.abort();
    }, HARD_TIMEOUT_MS);

    try {
      const response = await requestApi("/api/transcription", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const text = String((response as any)?.text || "").trim();
      if (!text) {
        const browserFallback = getBrowserTranscriptFallback();
        if (browserFallback) {
          insertTranscript(browserFallback);
          await logClientEvent("VOICE_TRANSCRIBE_SUCCESS", {
            chars: browserFallback.length,
            provider: "browser-speech",
            durationMs: payload.durationMs,
          });
          setState((prev) => nextVoiceInputState(prev, "TRANSCRIBE_COMPLETE"));
          window.setTimeout(() => {
            setState("IDLE");
          }, 600);
          return;
        }
        await logClientEvent("VOICE_TRANSCRIBE_FAILED", { errorCode: "EMPTY_TRANSCRIPT" });
        setFailed("Transcription failed. Please retry.");
        return;
      }

      insertTranscript(text);
      setServerFallbackHint(null);
      await logClientEvent("VOICE_TRANSCRIBE_SUCCESS", {
        chars: text.length,
        provider: String((response as any)?.provider || ""),
        durationMs: Number((response as any)?.durationMs || 0),
      });

      setState((prev) => nextVoiceInputState(prev, "TRANSCRIBE_COMPLETE"));
      window.setTimeout(() => {
        setState("IDLE");
      }, 600);
    } catch (error: any) {
      const isAbort = error?.name === "AbortError";
      const browserFallback = getBrowserTranscriptFallback();
      if (browserFallback) {
        insertTranscript(browserFallback);
        setServerFallbackHint(SERVER_FALLBACK_HINT);
        await logClientEvent("VOICE_TRANSCRIBE_SUCCESS", {
          chars: browserFallback.length,
          provider: "browser-speech",
          durationMs: payload.durationMs,
        });
        setState((prev) => nextVoiceInputState(prev, "TRANSCRIBE_COMPLETE"));
        window.setTimeout(() => {
          setState("IDLE");
        }, 600);
        return;
      }
      const failMessage = isAbort
        ? "Transcription timed out. Retry or type your message."
        : error instanceof Error
          ? error.message
          : "Transcription failed. Retry or type your message.";

      if (state === "UPLOADING") {
        await logClientEvent("VOICE_UPLOAD_FAILED", { errorCode: isAbort ? "UPLOAD_TIMEOUT" : "UPLOAD_FAILED" });
      } else {
        await logClientEvent("VOICE_TRANSCRIBE_FAILED", { errorCode: isAbort ? "TRANSCRIBE_TIMEOUT" : "TRANSCRIBE_FAILED" });
      }

      setFailed(failMessage);
    } finally {
      clearTimers();
      abortControllerRef.current = null;
    }
  };

  const stopRecording = async () => {
    if (state !== "RECORDING") return;
    stopBrowserSpeechRecognition();
    if (!recorderRef.current) {
      const durationMs = Math.max(0, Date.now() - recordingStartedAtRef.current);
      clearTimers();
      cleanupMedia();
      const browserFallback = getBrowserTranscriptFallback();
      if (browserFallback) {
        insertTranscript(browserFallback);
        await logClientEvent("VOICE_TRANSCRIBE_SUCCESS", {
          chars: browserFallback.length,
          provider: "browser-speech",
          durationMs,
        });
        setState((prev) => nextVoiceInputState(prev, "TRANSCRIBE_COMPLETE"));
        window.setTimeout(() => {
          setState("IDLE");
        }, 600);
        return;
      }
      setFailed("No speech detected. Retry.");
      return;
    }
    try {
      recorderRef.current.stop();
    } catch {
      setFailed("Could not stop recording.");
      cleanupMedia();
      clearTimers();
    }
  };

  const startRecording = async () => {
    if (!supported || disabled || isBusy || state === "RECORDING") return;

    setErrorMessage(null);
    setServerFallbackHint(null);
    chunksRef.current = [];
    localTranscriptFinalRef.current = "";
    localTranscriptInterimRef.current = "";
    stopBrowserSpeechRecognition();

    if (!mediaRecorderSupported && browserSpeechSupported) {
      recordingStartedAtRef.current = Date.now();
      setState((prev) => nextVoiceInputState(prev, "START_RECORDING"));
      await logClientEvent("VOICE_RECORD_STARTED");
      startBrowserSpeechRecognition();
      recordingLimitTimerRef.current = window.setTimeout(() => {
        void stopRecording();
      }, RECORDING_MAX_MS);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordingStartedAtRef.current = Date.now();

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const stoppedAt = Date.now();
        const durationMs = Math.max(0, stoppedAt - recordingStartedAtRef.current);
        void logClientEvent("VOICE_RECORD_STOPPED", { durationMs });

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanupMedia();
        clearTimers();

        if (!blob.size) {
          setFailed("No audio captured. Retry.");
          return;
        }

        const payload: RecordedPayload = {
          blob,
          mimeType: blob.type || recorder.mimeType || "audio/webm",
          fileName: buildFilename(blob.type || recorder.mimeType || "audio/webm"),
          durationMs,
        };
        lastPayloadRef.current = payload;
        void transcribePayload(payload);
      };

      recorder.start();
      setState((prev) => nextVoiceInputState(prev, "START_RECORDING"));
      await logClientEvent("VOICE_RECORD_STARTED");
      startBrowserSpeechRecognition();

      recordingLimitTimerRef.current = window.setTimeout(() => {
        void stopRecording();
      }, RECORDING_MAX_MS);
    } catch (error: any) {
      if (browserSpeechSupported) {
        recordingStartedAtRef.current = Date.now();
        setState((prev) => nextVoiceInputState(prev, "START_RECORDING"));
        await logClientEvent("VOICE_RECORD_STARTED", { mode: "browser-speech-fallback" });
        startBrowserSpeechRecognition();
        recordingLimitTimerRef.current = window.setTimeout(() => {
          void stopRecording();
        }, RECORDING_MAX_MS);
        toast({
          title: "Microphone recording fallback",
          description: "Using browser speech recognition mode.",
        });
        return;
      }
      setFailed(error?.message || "Microphone permission denied.");
      toast({
        title: "Microphone unavailable",
        description: "Allow microphone access, then retry.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    return () => {
      try {
        abortControllerRef.current?.abort();
      } catch {
        // ignore
      }
      stopBrowserSpeechRecognition();
      clearTimers();
      cleanupMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText =
    state === "RECORDING"
      ? "Recording..."
      : state === "UPLOADING"
        ? "Uploading..."
        : state === "TRANSCRIBING"
          ? "Transcribing..."
          : state === "READY"
            ? "Transcript inserted"
            : null;
  const micHelperText = !supported
    ? "Microphone unavailable"
    : isRecording
      ? "Tap mic again to stop"
      : "Tap mic to dictate";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={`h-11 w-11 md:h-12 md:w-12 rounded-xl border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700 ${
          isRecording ? "border-red-500/70 bg-red-500/10" : ""
        }`}
        disabled={Boolean(disabled) || !supported || isBusy}
        aria-label={
          !supported
            ? "Voice input unavailable"
            : isRecording
              ? "Stop recording"
              : "Start recording voice input"
        }
        aria-pressed={isRecording}
        onClick={(event) => {
          event.preventDefault();
          if (isRecording) {
            void stopRecording();
            return;
          }
          void startRecording();
        }}
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
        ) : (
          <Mic className={isRecording ? "h-4 w-4 md:h-5 md:w-5 text-red-500 animate-pulse" : "h-4 w-4 md:h-5 md:w-5"} />
        )}
      </Button>

      <div className="min-h-[24px] text-xs text-gray-300">
        {statusText ? <span className="inline-flex items-center gap-1">{statusText}</span> : <span>{micHelperText}</span>}
        {serverFallbackHint ? <div className="text-amber-300">{serverFallbackHint}</div> : null}
        {state === "ERROR" ? (
          <div className="inline-flex items-center gap-2 text-amber-300">
            <span>Transcription failed.</span>
            <button
              type="button"
              className="underline underline-offset-2 hover:opacity-90"
              onClick={() => {
                const payload = lastPayloadRef.current;
                if (!payload) {
                  resetToIdle();
                  return;
                }
                setState((prev) => nextVoiceInputState(prev, "RETRY"));
                void transcribePayload(payload);
              }}
            >
              <span className="inline-flex items-center gap-1">
                <RotateCcw className="h-3 w-3" />
                Retry
              </span>
            </button>
            <button
              type="button"
              className="underline underline-offset-2 hover:opacity-90"
              onClick={resetToIdle}
            >
              Type instead
            </button>
            {errorMessage ? <span className="text-gray-400">({errorMessage})</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
