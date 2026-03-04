# Voice Input Audit (PTT -> Text)
Date: 2026-02-21

## Current Code Paths (before refactor)
- UI voice-note button: `client/src/components/VoiceNoteButton.tsx`
- Ops composer integration: `client/src/pages/AITeamHubPage.tsx`
- Legacy voice input button: `client/src/components/VoiceInput.tsx`
- Voice-note upload API (stores audio attachment): `POST /api/companies/:companyId/channels/:channelId/voice-notes` in `server/routes.ts`
- Retry transcription action API: `POST /api/companies/:companyId/channels/:channelId/messages/:messageId/voice-transcribe` in `server/routes.ts`
- Async transcription worker action: `TRANSCRIBE_VOICE_NOTE` in `server/lib/actions/worker.ts`
- Direct transcribe endpoint used by legacy voice input: `POST /api/voice/transcribe` in `server/routes/voice.ts`
- Provider logic: `server/lib/voice/transcriber.ts`

## Existing State Model
The old implementation mixed two flows:
1. **Voice note flow (Ops page)**:
   - Record audio
   - Upload audio as attachment message
   - Queue async `TRANSCRIBE_VOICE_NOTE` action
   - Render `<audio controls>` card + transcription status bubble in timeline
2. **Direct transcribe flow (VoiceInput)**:
   - Record audio
   - POST `/api/voice/transcribe`
   - Insert returned text into draft

This dual-path model caused inconsistent behavior and debugging ambiguity.

## Root Causes of Stuck/Noisy Behavior
- **Pending forever UI risk**:
  - Voice-note status depends on background action worker (`TRANSCRIBE_VOICE_NOTE`).
  - If queue/worker is delayed or unavailable, `transcriptionStatus` stays `pending/processing`, leaving a stale "Transcribing..." bubble.
- **Upload + transcribe coupling in timeline**:
  - Audio attachment message is created first, even if transcription later fails.
  - Users see voice note artifacts and retry controls instead of draft text.
- **State clearing inconsistency**:
  - Voice note path updates message metadata asynchronously; UI relies on later query invalidation.
  - Failures can leave temporary or failed states visible without deterministic cleanup.
- **No strict timeout split in UI**:
  - Legacy voice input had one timeout bucket and no explicit `UPLOADING` vs `TRANSCRIBING` transition model.
- **No single accountability surface**:
  - There was no tenant-scoped transcription jobs list dedicated to voice debugging.

## Refactor Direction Applied
- Single path for chat composer voice input:
  - `IDLE -> RECORDING -> UPLOADING -> TRANSCRIBING -> READY | ERROR`
- New endpoint:
  - `POST /api/transcription` (direct text result)
- Voice-note mode hard-disabled by default:
  - `FEATURE_VOICE_NOTE_MODE=false`
- Voice debug observability:
  - `transcription_jobs` table
  - `GET /api/admin/transcription-jobs`
  - client event telemetry endpoint for voice lifecycle events

