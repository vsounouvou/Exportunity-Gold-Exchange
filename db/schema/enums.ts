import { pgEnum } from "drizzle-orm/pg-core";

export const applicationStatusEnum = pgEnum("application_status", [
  "pending",
  "ai_reviewing",
  "ai_approved",
  "ai_rejected",
  "admin_reviewing",
  "in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "needs_info",
]);

