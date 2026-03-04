import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { eceUsers } from "./ece";

export const meetSessionStatusEnum = pgEnum("meet_session_status", ["scheduled", "live", "ended"]);
export const meetParticipantRoleEnum = pgEnum("meet_participant_role", ["host", "cohost", "attendee", "observer"]);
export const meetArtifactTypeEnum = pgEnum("meet_artifact_type", ["recording", "transcript", "summary", "email_draft"]);
export const meetInviteStatusEnum = pgEnum("meet_invite_status", ["active", "revoked", "expired", "used"]);
export const meetEventTypeEnum = pgEnum("meet_event_type", [
  "participant_joined",
  "participant_left",
  "participant_muted",
  "participant_kicked",
  "meeting_locked",
  "meeting_unlocked",
  "chat_message",
  "recording_uploaded",
  "summary_generated",
]);

export const meetSessions = pgTable(
  "meet_sessions",
  {
    id: text("id").primaryKey(), // uuid string
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdByAgentId: integer("created_by_agent_id"),
    status: meetSessionStatusEnum("status").notNull().default("scheduled"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    locked: boolean("locked").notNull().default(false),
    recordingEnabled: boolean("recording_enabled").notNull().default(false),
    conversationId: text("conversation_id"),
    sfuRoomKey: text("sfu_room_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("meet_sessions_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("meet_sessions_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
    byTenantStart: index("meet_sessions_tenant_start_idx").on(t.tenantId, t.startsAt),
    byConversation: uniqueIndex("meet_sessions_conversation_idx").on(t.conversationId),
  }),
);

export const meetParticipants = pgTable(
  "meet_participants",
  {
    id: serial("id").primaryKey(),
    meetingId: text("meeting_id")
      .references(() => meetSessions.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    guestEmail: text("guest_email"),
    role: meetParticipantRoleEnum("role").notNull().default("attendee"),
    displayName: text("display_name"),
    inviteJtiHash: text("invite_jti_hash"),
    isMuted: boolean("is_muted").notNull().default(false),
    isKicked: boolean("is_kicked").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byMeeting: index("meet_participants_meeting_idx").on(t.meetingId, t.createdAt),
    byTenantMeeting: index("meet_participants_tenant_meeting_idx").on(t.tenantId, t.meetingId, t.createdAt),
    byUser: index("meet_participants_tenant_user_idx").on(t.tenantId, t.userId, t.createdAt),
  }),
);

export const meetInvites = pgTable(
  "meet_invites",
  {
    id: text("id").primaryKey(), // uuid string
    meetingId: text("meeting_id")
      .references(() => meetSessions.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    issuedTo: text("issued_to"),
    role: meetParticipantRoleEnum("role").notNull().default("attendee"),
    tokenHash: text("token_hash").notNull(),
    tokenJtiHash: text("token_jti_hash").notNull(),
    status: meetInviteStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byMeeting: index("meet_invites_meeting_idx").on(t.meetingId, t.createdAt),
    byTenant: index("meet_invites_tenant_idx").on(t.tenantId, t.createdAt),
    uniqueTokenHash: uniqueIndex("meet_invites_token_hash_idx").on(t.tokenHash),
    uniqueJtiHash: uniqueIndex("meet_invites_token_jti_hash_idx").on(t.tokenJtiHash),
  }),
);

export const meetArtifacts = pgTable(
  "meet_artifacts",
  {
    id: serial("id").primaryKey(),
    meetingId: text("meeting_id")
      .references(() => meetSessions.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    type: meetArtifactTypeEnum("type").notNull(),
    storageUrl: text("storage_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byMeetingType: index("meet_artifacts_meeting_type_idx").on(t.meetingId, t.type, t.createdAt),
    byTenant: index("meet_artifacts_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

export const meetSessionEvents = pgTable(
  "meet_session_events",
  {
    id: serial("id").primaryKey(),
    meetingId: text("meeting_id")
      .references(() => meetSessions.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    participantId: integer("participant_id").references(() => meetParticipants.id, { onDelete: "set null" }),
    eventType: meetEventTypeEnum("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byMeeting: index("meet_session_events_meeting_idx").on(t.meetingId, t.createdAt),
    byTenant: index("meet_session_events_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

