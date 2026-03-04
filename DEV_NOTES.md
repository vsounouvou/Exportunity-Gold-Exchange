# Exportunity Meet — Dev Notes

## Reuse map (what was reused)
- Auth + tenant resolution: existing request middleware in `server/index.ts` and `server/routes/utils/auth.ts`
- Database layer: existing Drizzle setup in `db/index.ts` and schema aggregation in `db/schema.ts`
- Conversation/thread posting: existing `messages` table and chat room linkage via `chatRooms`
- Action execution: existing Action Router/worker pipeline in `server/lib/actions/*`
- UI shell + routing: existing app shell and route architecture in `client/src/App.tsx`

## Added backend modules
- Meet schema: `db/schema/meet.ts`
- Runtime table bootstrap: `server/lib/meet/ensureTables.ts`
- Invite token signing/verification: `server/lib/meet/inviteToken.ts`
- Meeting domain service: `server/lib/meet/service.ts`
- Recording persistence helper: `server/lib/meet/recording.ts`
- AI recap worker: `server/lib/meet/aiWorker.ts`
- Meet API routes: `server/routes/meet.ts`
- Meet socket namespace: `server/lib/meet/socket.ts`

## Added frontend modules
- Meeting hub page: `client/src/pages/MeetingsHubPage.tsx`
- Meeting room page: `client/src/pages/MeetRoomPage.tsx`
- Routes wired in `client/src/App.tsx`:
  - `/meetings`
  - `/meetings/:id`
  - `/m/:id`
  - `/meet/:id`

## Action model extensions
- Added action types in `db/schema/actions.ts` + router/worker:
  - `CREATE_MEETING_LINK`
  - `SEND_MEETING_INVITE`
  - `REQUEST_MEETING_SUMMARY`

## Notes on media plane
- Socket signalling is live and scoped per meeting namespace room.
- Backend dynamically imports `mediasoup`; if runtime dependency is absent, room stays in control/chat mode and reports `mediasoup_unavailable`.
- TURN details are exposed by `GET /api/meet/turn` from environment.

## Validation status
- `npm run check` currently fails on pre-existing type errors in `server/routes/admin-marketing.ts`.
- Meet-specific type errors were fixed; no current meet type failures were reported.

## Local/prod smoke checklist
1. `GET /api/meet/healthz` returns `ok: true`
2. Create meeting from `/meetings`
3. Join from generated `/m/:id?t=...` link
4. Send chat in room and verify event updates
5. End meeting and verify summary artifact appears
