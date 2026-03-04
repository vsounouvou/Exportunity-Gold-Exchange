import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const ENGINEERING_MACHINE_FAMILIES = [
  "dry_gold_recovery_system",
  "final_concentrate_finishing_module",
  "portable_crushing_screening_unit",
  "universal_mining_skid_frame",
] as const;

export type EngineeringMachineFamily = (typeof ENGINEERING_MACHINE_FAMILIES)[number];

export type EngineeringRequestStatus = "pending" | "compiled" | "executed" | "rejected" | "failed";
export type MachineStatus = "compiled" | "executing" | "executed" | "rejected" | "failed";
export type FabricationJobStatus = "queued" | "running" | "completed" | "failed";

export const PREVIEW_ARTIFACT_KINDS = ["glb", "stl"] as const;
export type PreviewArtifactKind = (typeof PREVIEW_ARTIFACT_KINDS)[number];

export const engineeringRequests = pgTable(
  "engineering_requests",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    projectId: text("project_id"),
    inferredIntent: text("inferred_intent").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("pending"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("engineering_requests_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("engineering_requests_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
  }),
);

export const machines = pgTable(
  "machines",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    engineeringRequestId: integer("engineering_request_id").references(() => engineeringRequests.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id"),
    machineFamily: text("machine_family", { enum: ENGINEERING_MACHINE_FAMILIES }).notNull(),
    compilerVersion: text("compiler_version").notNull(),
    status: text("status").notNull().default("compiled"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("machines_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("machines_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
  }),
);

export const machineRevisions = pgTable(
  "machine_revisions",
  {
    id: serial("id").primaryKey(),
    machineId: integer("machine_id")
      .references(() => machines.id, { onDelete: "cascade" })
      .notNull(),
    revision: integer("revision").notNull(),
    parametersHash: text("parameters_hash").notNull(),
    generatorVersion: text("generator_version").notNull(),
    recipe: jsonb("recipe").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueRevision: uniqueIndex("machine_revisions_machine_revision_idx").on(t.machineId, t.revision),
    byMachineCreated: index("machine_revisions_machine_created_idx").on(t.machineId, t.createdAt),
  }),
);

export const fabricationJobs = pgTable(
  "fabrication_jobs",
  {
    id: serial("id").primaryKey(),
    revisionId: integer("revision_id")
      .references(() => machineRevisions.id, { onDelete: "cascade" })
      .notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull().default("queued"),
    logs: text("logs"),
    artifactsLocation: text("artifacts_location"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byNodeCreated: index("fabrication_jobs_node_created_idx").on(t.nodeId, t.createdAt),
    byStatusUpdated: index("fabrication_jobs_status_updated_idx").on(t.status, t.updatedAt),
  }),
);

export const machineEditActions = pgTable(
  "machine_edit_actions",
  {
    id: serial("id").primaryKey(),
    revisionId: integer("revision_id")
      .references(() => machineRevisions.id, { onDelete: "cascade" })
      .notNull(),
    action: jsonb("action_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRevisionCreated: index("machine_edit_actions_revision_created_idx").on(t.revisionId, t.createdAt),
  }),
);

export const previewArtifacts = pgTable(
  "preview_artifacts",
  {
    id: serial("id").primaryKey(),
    revisionId: integer("revision_id")
      .references(() => machineRevisions.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind", { enum: PREVIEW_ARTIFACT_KINDS }).notNull(),
    path: text("path").notNull(),
    sha256: text("sha256"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueRevisionKind: uniqueIndex("preview_artifacts_revision_kind_idx").on(t.revisionId, t.kind),
    byRevisionCreated: index("preview_artifacts_revision_created_idx").on(t.revisionId, t.createdAt),
  }),
);
