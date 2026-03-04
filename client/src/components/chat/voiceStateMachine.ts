export type VoiceInputState = "IDLE" | "RECORDING" | "UPLOADING" | "TRANSCRIBING" | "READY" | "ERROR";

export type VoiceInputEvent =
  | "START_RECORDING"
  | "STOP_RECORDING"
  | "UPLOAD_COMPLETE"
  | "TRANSCRIBE_COMPLETE"
  | "FAIL"
  | "RETRY"
  | "RESET";

const TRANSITIONS: Record<VoiceInputState, Partial<Record<VoiceInputEvent, VoiceInputState>>> = {
  IDLE: {
    START_RECORDING: "RECORDING",
    RESET: "IDLE",
  },
  RECORDING: {
    STOP_RECORDING: "UPLOADING",
    FAIL: "ERROR",
    RESET: "IDLE",
  },
  UPLOADING: {
    UPLOAD_COMPLETE: "TRANSCRIBING",
    FAIL: "ERROR",
    RESET: "IDLE",
  },
  TRANSCRIBING: {
    TRANSCRIBE_COMPLETE: "READY",
    FAIL: "ERROR",
    RESET: "IDLE",
  },
  READY: {
    RESET: "IDLE",
    START_RECORDING: "RECORDING",
  },
  ERROR: {
    RETRY: "UPLOADING",
    RESET: "IDLE",
    START_RECORDING: "RECORDING",
  },
};

export function nextVoiceInputState(current: VoiceInputState, event: VoiceInputEvent): VoiceInputState {
  return TRANSITIONS[current]?.[event] ?? current;
}

