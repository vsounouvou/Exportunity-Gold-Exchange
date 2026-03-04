import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@db";
import {
  auditLogs,
  eceSessions,
  eceUsers,
  metBlogPosts,
  metEstimateRequests,
  metLeads,
  metOrderItems,
  metOrders,
  metPlans,
  metProjectMedia,
  metProjects,
  metProducts,
  metSettings,
  userTenantRoles,
} from "@db/schema";
import { getStoredFile, saveEstimateRequestFile } from "../lib/met/storage";

const router = Router();
const MET_TENANT_KEY = "met";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_PAGE_SIZE = 200;

const LEAD_SOURCES = ["WEB_FORM", "WHATSAPP", "ADMIN_MANUAL"] as const;
const LEAD_INTENTS = ["BUILD_HOUSE", "BUY_BRICKS", "VISIT_MODEL", "INFO"] as const;
const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"] as const;
const ORDER_STATUSES = ["DRAFT", "SUBMITTED", "CONFIRMED", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
const ORDER_TYPES = ["BRICKS"] as const;
const ESTIMATE_STATUSES = ["NEW", "REVIEWING", "SENT", "CLOSED"] as const;
const PRODUCT_UNITS = ["PIECE", "PALLET"] as const;
const PROJECT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

const ALLOWED_UPLOAD_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const uploadEstimate = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

type TenantScope = { id: number; key: string };
type SessionUser = {
  id: number;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  roles?: unknown;
  permissions?: unknown;
  currentMode?: string | null;
};

type MetAccess = {
  tenant: TenantScope;
  user: SessionUser;
  tenantRoles: Set<string>;
  permissions: Set<string>;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
};

type MetCapability =
  | "read"
  | "manage_leads"
  | "manage_orders"
  | "manage_estimates"
  | "manage_content"
  | "manage_settings";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const leadCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().max(254).optional().nullable(),
  city: z.string().trim().min(2).max(120),
  country: z.string().trim().max(120).optional().nullable(),
  source: z.enum(LEAD_SOURCES).optional(),
  intent: z.enum(LEAD_INTENTS).optional(),
  message: z.string().trim().max(5000).optional().nullable(),
});

const orderItemInputSchema = z.object({
  productId: z.string().uuid().optional(),
  sku: z.string().trim().max(80).optional(),
  quantityPieces: z.coerce.number().int().min(0).optional(),
  quantityPallets: z.coerce.number().int().min(0).optional(),
  unitPriceCfa: z.coerce.number().int().min(0).optional(),
});

const orderCreateSchema = z.object({
  lead: leadCreateSchema.extend({ intent: z.enum(LEAD_INTENTS).optional() }),
  orderType: z.enum(ORDER_TYPES).optional(),
  deliveryAddress: z.string().trim().max(500).optional().nullable(),
  requestedDeliveryDate: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  distanceKm: z.coerce.number().min(0).optional().nullable(),
  deliveryFeeCfa: z.coerce.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  items: z.array(orderItemInputSchema).min(1).max(100),
});

const estimateCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().max(254).optional().nullable(),
  city: z.string().trim().min(2).max(120),
  country: z.string().trim().max(120).optional().nullable(),
  projectCity: z.string().trim().max(120).optional().nullable(),
  landSizeM2: z.coerce.number().min(0).optional().nullable(),
  floors: z.coerce.number().int().min(0).optional().nullable(),
  rooms: z.coerce.number().int().min(0).optional().nullable(),
  budgetCfa: z.coerce.number().int().min(0).optional().nullable(),
  timeline: z.string().trim().max(400).optional().nullable(),
  brief: z.string().trim().max(5000).optional().nullable(),
});

const productCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(2).max(80),
  description: z.string().trim().max(5000).optional().nullable(),
  dimensionsMm: z
    .object({
      length: z.coerce.number().min(0).optional(),
      width: z.coerce.number().min(0).optional(),
      height: z.coerce.number().min(0).optional(),
    })
    .optional(),
  compressiveStrengthMpa: z.coerce.number().min(0).optional().nullable(),
  priceCfa: z.coerce.number().int().min(0),
  unit: z.enum(PRODUCT_UNITS),
  piecesPerPallet: z.coerce.number().int().min(0),
  isActive: z.boolean().optional(),
});

const productPatchSchema = productCreateSchema.partial();

const planCreateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  slug: z.string().trim().min(2).max(180).optional(),
  description: z.string().trim().max(6000).optional().nullable(),
  bedrooms: z.coerce.number().int().min(0).optional().nullable(),
  bathrooms: z.coerce.number().int().min(0).optional().nullable(),
  floors: z.coerce.number().int().min(0).optional().nullable(),
  areaM2: z.coerce.number().min(0).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(40).optional(),
  thumbnailUrl: z.string().trim().max(500).optional().nullable(),
  fileUrl: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const planPatchSchema = planCreateSchema.partial();

const projectMediaCreateSchema = z
  .object({
    assetUrl: z.string().trim().min(1).max(500),
    caption: z.string().trim().max(1000).optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  })
  .array()
  .max(60)
  .optional();

const projectCreateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  slug: z.string().trim().min(2).max(180).optional(),
  summary: z.string().trim().max(1200).optional().nullable(),
  description: z.string().trim().max(20000).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  isFeatured: z.boolean().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  media: projectMediaCreateSchema,
});

const projectPatchSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  slug: z.string().trim().min(2).max(180).optional(),
  summary: z.string().trim().max(1200).optional().nullable(),
  description: z.string().trim().max(20000).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  isFeatured: z.boolean().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  media: projectMediaCreateSchema,
});

const blogCreateSchema = z.object({
  slug: z.string().trim().min(2).max(180),
  title: z.string().trim().min(2).max(200),
  excerpt: z.string().trim().max(1000).optional().nullable(),
  contentMarkdown: z.string().trim().max(200000).optional().nullable(),
  coverImageUrl: z.string().trim().max(500).optional().nullable(),
  publishedAt: z.string().datetime({ offset: true }).optional().nullable(),
});

const blogPatchSchema = blogCreateSchema.partial();

const leadPatchSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  internalNotes: z.string().trim().max(5000).optional().nullable(),
});

const orderPatchSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  internalNotes: z.string().trim().max(5000).optional().nullable(),
  deliveryAddress: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  distanceKm: z.coerce.number().min(0).optional().nullable(),
  deliveryFeeCfa: z.coerce.number().int().min(0).optional().nullable(),
  subtotalCfa: z.coerce.number().int().min(0).optional().nullable(),
  totalCfa: z.coerce.number().int().min(0).optional().nullable(),
});

const estimatePatchSchema = z.object({
  status: z.enum(ESTIMATE_STATUSES).optional(),
  internalNotes: z.string().trim().max(5000).optional().nullable(),
});

const settingsPatchSchema = z.object({
  key: z.string().trim().min(2).max(120),
  value: z.record(z.any()),
});

function normalizeRoleLabel(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePermission(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean) : [];
}

function sanitizeNullable(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeSlug(value: unknown, fallback = "item"): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || fallback;
}

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLimit(value: unknown, fallback = 50) {
  const parsed = toInt(value, fallback);
  if (parsed <= 0) return fallback;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function parseOffset(value: unknown, fallback = 0) {
  const parsed = toInt(value, fallback);
  if (parsed <= 0) return 0;
  return parsed;
}

function parseDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^Bearer\s+/i, "").trim() || null;
}

function getClientIp(req: Request) {
  const fromForward = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  if (fromForward) return fromForward;
  const fromReal = String(req.headers["x-real-ip"] || "").trim();
  if (fromReal) return fromReal;
  return String(req.ip || "").trim() || "0.0.0.0";
}

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return res.status(status).json({
    ok: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });
}

function ok(res: Response, payload: Record<string, unknown>) {
  return res.json({ ok: true, ...payload });
}

function requireMetTenantScope(req: Request, res: Response): TenantScope | null {
  const tenant = (req as any)?.tenant;
  const tenantId = Number(tenant?.id || 0);
  const tenantKey = String(tenant?.key || "").trim().toLowerCase();
  if (!tenantId || !tenantKey) {
    sendError(res, 500, "TENANT_UNRESOLVED", "Tenant context is required.");
    return null;
  }
  if (tenantKey !== MET_TENANT_KEY) {
    sendError(res, 404, "TENANT_NOT_FOUND", "Resource not available for this tenant.");
    return null;
  }
  return { id: tenantId, key: tenantKey };
}

async function resolveSessionUser(req: Request): Promise<SessionUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const session = await db.query.eceSessions.findFirst({
    where: eq(eceSessions.token, token),
    columns: { userId: true, expiresAt: true },
  });
  if (!session || new Date(session.expiresAt) < new Date()) return null;

  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, session.userId),
  });
  if (!user) return null;

  return {
    id: Number(user.id),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    roles: user.roles,
    permissions: user.permissions,
    currentMode: user.currentMode,
  };
}

function hasPermission(access: MetAccess, expected: string[]) {
  if (!expected.length) return false;
  const candidateSet = new Set(expected.map((entry) => normalizePermission(entry)).filter(Boolean));
  if (!candidateSet.size) return false;
  for (const permission of access.permissions) {
    if (!permission) continue;
    if (permission === "*") return true;
    if (candidateSet.has(permission)) return true;
    if (permission.endsWith(":*") || permission.endsWith(".*")) {
      const prefix = permission.slice(0, -2);
      for (const expectedPermission of candidateSet) {
        if (expectedPermission === prefix || expectedPermission.startsWith(`${prefix}.`)) return true;
      }
    }
  }
  return false;
}

function hasCapability(access: MetAccess, capability: MetCapability) {
  if (access.isSuperAdmin) return true;
  const roles = access.tenantRoles;
  switch (capability) {
    case "read":
      return (
        access.isTenantAdmin ||
        roles.has("OPS") ||
        roles.has("SUPPORT") ||
        roles.has("USER") ||
        hasPermission(access, ["met.read", "met.*", "met:read", "met:*"])
      );
    case "manage_leads":
      return (
        access.isTenantAdmin ||
        roles.has("OPS") ||
        roles.has("SUPPORT") ||
        hasPermission(access, ["met.leads.write", "met.leads.*", "met.manage", "met:*"])
      );
    case "manage_orders":
      return (
        access.isTenantAdmin ||
        roles.has("OPS") ||
        hasPermission(access, ["met.orders.write", "met.orders.*", "met.manage", "met:*"])
      );
    case "manage_estimates":
      return (
        access.isTenantAdmin ||
        roles.has("OPS") ||
        roles.has("SUPPORT") ||
        hasPermission(access, ["met.estimates.write", "met.estimates.*", "met.manage", "met:*"])
      );
    case "manage_content":
      return (
        access.isTenantAdmin ||
        hasPermission(access, ["met.content.write", "met.content.*", "met.manage", "met:*"])
      );
    case "manage_settings":
      return (
        access.isTenantAdmin ||
        hasPermission(access, ["met.settings.write", "met.settings.*", "met.manage", "met:*"])
      );
    default:
      return false;
  }
}

async function resolveMetAccess(req: Request, tenant: TenantScope): Promise<MetAccess | null> {
  const user = await resolveSessionUser(req);
  if (!user) return null;

  const membershipRows = await db.query.userTenantRoles.findMany({
    where: eq(userTenantRoles.userId, user.id),
    columns: { tenantId: true, role: true },
  });

  const tenantRoles = new Set(
    membershipRows
      .filter((row) => Number(row.tenantId) === tenant.id)
      .map((row) => String(row.role || "").trim().toUpperCase())
      .filter(Boolean),
  );

  const roleLabels = new Set(asStringArray(user.roles).map((role) => normalizeRoleLabel(role)));
  if (user.role) roleLabels.add(normalizeRoleLabel(user.role));
  if (user.currentMode) roleLabels.add(normalizeRoleLabel(user.currentMode));
  const permissions = new Set(asStringArray(user.permissions).map((entry) => normalizePermission(entry)));

  const superViaTenantRole = membershipRows.some((row) => String(row.role || "").toUpperCase() === "SUPER_ADMIN");
  const superViaIdentityRole =
    roleLabels.has("super admin") ||
    roleLabels.has("platform admin") ||
    roleLabels.has("chairman") ||
    permissions.has("*");

  const isSuperAdmin = superViaTenantRole || superViaIdentityRole;
  const isTenantAdmin = tenantRoles.has("TENANT_ADMIN");

  if (!isSuperAdmin && !tenantRoles.size) return null;

  return {
    tenant,
    user,
    tenantRoles,
    permissions,
    isSuperAdmin,
    isTenantAdmin,
  };
}

function rateLimitKey(req: Request, endpoint: string) {
  return `${endpoint}:${getClientIp(req)}`;
}

function takeRateLimit(key: string, maxCount: number, windowMs: number): boolean {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= maxCount) return false;
  current.count += 1;
  return true;
}

function createRateLimitMiddleware(endpoint: string, maxCount: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = rateLimitKey(req, endpoint);
    if (!takeRateLimit(key, maxCount, windowMs)) {
      sendError(res, 429, "RATE_LIMITED", "Too many requests. Please retry shortly.");
      return;
    }
    next();
  };
}

function asyncRoute(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch((error: any) => {
      const message = String(error?.message || "Unexpected error");
      console.error("[met] route error:", error);
      sendError(res, 500, "INTERNAL_ERROR", message);
    });
  };
}

function parseBody<T>(schema: z.ZodType<T>, payload: unknown, res: Response): T | null {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid request payload.", parsed.error.flatten());
    return null;
  }
  return parsed.data;
}

function normalizeDateBounds(req: Request) {
  const from = parseDate((req.query as any)?.from || (req.query as any)?.dateFrom);
  const to = parseDate((req.query as any)?.to || (req.query as any)?.dateTo);
  return { from, to };
}

async function writeMetAudit(input: {
  tenantId: number;
  userId: number | null;
  action: string;
  entityType?: string;
  entityUuid?: string | null;
  previousState?: unknown;
  newState?: unknown;
  metadata?: Record<string, unknown>;
  req: Request;
}) {
  try {
    await db.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      userRole: "met_admin",
      action: input.action,
      entityType: input.entityType ?? "met",
      entityId: null,
      previousState: input.previousState ?? null,
      newState: input.newState ?? null,
      ipAddress: getClientIp(input.req),
      userAgent: sanitizeNullable(input.req.headers["user-agent"]),
      metadata: {
        tenant_key: MET_TENANT_KEY,
        entity_uuid: input.entityUuid ?? null,
        ...(input.metadata || {}),
      },
      createdAt: new Date(),
    });
  } catch (error) {
    console.warn("[met] audit log insert skipped:", error);
  }
}

async function requireAccess(
  req: Request,
  res: Response,
  capability: MetCapability,
): Promise<MetAccess | null> {
  const tenant = requireMetTenantScope(req, res);
  if (!tenant) return null;

  const access = await resolveMetAccess(req, tenant);
  if (!access) {
    sendError(res, 401, "AUTH_REQUIRED", "Authentication required.");
    return null;
  }

  if (!hasCapability(access, "read")) {
    sendError(res, 403, "ACCESS_DENIED", "You do not have access to Maison en Terre admin.");
    return null;
  }

  if (!hasCapability(access, capability)) {
    sendError(res, 403, "ACCESS_DENIED", "Insufficient permissions for this operation.");
    return null;
  }

  return access;
}

async function resolvePublicTenant(req: Request, res: Response): Promise<TenantScope | null> {
  const tenant = requireMetTenantScope(req, res);
  if (!tenant) return null;
  return tenant;
}

function extractUploadedFile(req: Request): Express.Multer.File | null {
  const single = (req as any).file as Express.Multer.File | undefined;
  if (single) return single;
  const files = (req as any).files as Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined;
  if (!files) return null;
  if (Array.isArray(files)) return files[0] ?? null;
  const candidates = ["planFile", "file", "plan"];
  for (const key of candidates) {
    const list = files[key];
    if (Array.isArray(list) && list.length) return list[0];
  }
  return null;
}

function ensureUploadAcceptable(file: Express.Multer.File, res: Response): boolean {
  const mime = String(file.mimetype || "").toLowerCase();
  if (!ALLOWED_UPLOAD_MIME.has(mime)) {
    sendError(res, 400, "INVALID_FILE_TYPE", "Only PDF and image files are allowed.");
    return false;
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    sendError(res, 400, "INVALID_FILE_SIZE", `File must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes.`);
    return false;
  }
  return true;
}

async function listPublicProducts(tenant: TenantScope, activeOnly: boolean) {
  const whereParts: any[] = [eq(metProducts.tenantId, tenant.id), eq(metProducts.tenantKey, tenant.key)];
  if (activeOnly) whereParts.push(eq(metProducts.isActive, true));

  return db
    .select()
    .from(metProducts)
    .where(and(...whereParts))
    .orderBy(desc(metProducts.updatedAt), desc(metProducts.createdAt));
}

async function listPublicPlans(
  tenant: TenantScope,
  filters: {
    activeOnly: boolean;
    q?: string;
    minArea?: number | null;
    maxArea?: number | null;
    bedrooms?: number | null;
    floors?: number | null;
    tag?: string;
  },
) {
  const whereParts: any[] = [eq(metPlans.tenantId, tenant.id), eq(metPlans.tenantKey, tenant.key)];
  if (filters.activeOnly) whereParts.push(eq(metPlans.isActive, true));

  if (filters.q) {
    const like = `%${filters.q}%`;
    whereParts.push(or(ilike(metPlans.title, like), ilike(metPlans.description, like)));
  }
  if (filters.bedrooms != null) whereParts.push(eq(metPlans.bedrooms, filters.bedrooms));
  if (filters.floors != null) whereParts.push(eq(metPlans.floors, filters.floors));
  if (filters.tag) whereParts.push(sql`${metPlans.tags} @> ${JSON.stringify([filters.tag])}::jsonb`);
  if (filters.minArea != null) whereParts.push(sql`${metPlans.areaM2}::numeric >= ${String(filters.minArea)}`);
  if (filters.maxArea != null) whereParts.push(sql`${metPlans.areaM2}::numeric <= ${String(filters.maxArea)}`);

  return db
    .select()
    .from(metPlans)
    .where(and(...whereParts))
    .orderBy(desc(metPlans.updatedAt), desc(metPlans.createdAt));
}

async function findPublicPlanBySlugOrId(tenant: TenantScope, slugOrId: string) {
  return db.query.metPlans.findFirst({
    where: and(
      eq(metPlans.tenantId, tenant.id),
      eq(metPlans.tenantKey, tenant.key),
      or(eq(metPlans.slug, slugOrId), eq(metPlans.id, slugOrId)),
    ),
  });
}

async function listPublicProjects(tenant: TenantScope) {
  const projects = await db
    .select()
    .from(metProjects)
    .where(
      and(
        eq(metProjects.tenantId, tenant.id),
        eq(metProjects.tenantKey, tenant.key),
        eq(metProjects.status, "PUBLISHED"),
      ),
    )
    .orderBy(desc(metProjects.isFeatured), desc(metProjects.updatedAt), desc(metProjects.createdAt));

  const projectIds = projects.map((project) => project.id);
  const mediaRows = projectIds.length
    ? await db
        .select()
        .from(metProjectMedia)
        .where(
          and(
            eq(metProjectMedia.tenantId, tenant.id),
            eq(metProjectMedia.tenantKey, tenant.key),
            inArray(metProjectMedia.projectId, projectIds),
          ),
        )
        .orderBy(metProjectMedia.sortOrder, desc(metProjectMedia.createdAt))
    : [];

  const mediaMap = new Map<string, typeof mediaRows>();
  for (const row of mediaRows) {
    const bucket = mediaMap.get(row.projectId) || [];
    bucket.push(row);
    mediaMap.set(row.projectId, bucket);
  }

  return projects.map((project) => ({
    ...project,
    media: mediaMap.get(project.id) || [],
  }));
}

async function findPublicProjectBySlugOrId(tenant: TenantScope, slugOrId: string) {
  const project = await db.query.metProjects.findFirst({
    where: and(
      eq(metProjects.tenantId, tenant.id),
      eq(metProjects.tenantKey, tenant.key),
      eq(metProjects.status, "PUBLISHED"),
      or(eq(metProjects.slug, slugOrId), eq(metProjects.id, slugOrId)),
    ),
  });
  if (!project) return null;

  const media = await db
    .select()
    .from(metProjectMedia)
    .where(
      and(
        eq(metProjectMedia.tenantId, tenant.id),
        eq(metProjectMedia.tenantKey, tenant.key),
        eq(metProjectMedia.projectId, project.id),
      ),
    )
    .orderBy(metProjectMedia.sortOrder, desc(metProjectMedia.createdAt));

  return { ...project, media };
}

router.get(
  "/api/met/products",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const activeOnly = String((req.query as any)?.active || "true").trim().toLowerCase() !== "false";
    const rows = await listPublicProducts(tenant, activeOnly);

    ok(res, { items: rows });
  }),
);

router.get(
  "/api/met/public/products",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const activeOnly = String((req.query as any)?.active || "true").trim().toLowerCase() !== "false";
    const rows = await listPublicProducts(tenant, activeOnly);
    ok(res, { items: rows });
  }),
);

router.get(
  "/api/met/plans",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const activeOnly = String((req.query as any)?.active || "true").trim().toLowerCase() !== "false";
    const q = sanitizeNullable((req.query as any)?.q) || undefined;
    const tag = sanitizeNullable((req.query as any)?.tag) || undefined;
    const minArea = (req.query as any)?.minArea == null ? null : Number((req.query as any)?.minArea);
    const maxArea = (req.query as any)?.maxArea == null ? null : Number((req.query as any)?.maxArea);
    const bedrooms = (req.query as any)?.bedrooms == null ? null : Number((req.query as any)?.bedrooms);
    const floors = (req.query as any)?.floors == null ? null : Number((req.query as any)?.floors);

    const rows = await listPublicPlans(tenant, {
      activeOnly,
      q,
      minArea: Number.isFinite(minArea as number) ? minArea : null,
      maxArea: Number.isFinite(maxArea as number) ? maxArea : null,
      bedrooms: Number.isFinite(bedrooms as number) ? bedrooms : null,
      floors: Number.isFinite(floors as number) ? floors : null,
      tag,
    });

    ok(res, { items: rows });
  }),
);

router.get(
  "/api/met/public/plans",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const activeOnly = String((req.query as any)?.active || "true").trim().toLowerCase() !== "false";
    const q = sanitizeNullable((req.query as any)?.q) || undefined;
    const tag = sanitizeNullable((req.query as any)?.tag) || undefined;
    const minArea = (req.query as any)?.minArea == null ? null : Number((req.query as any)?.minArea);
    const maxArea = (req.query as any)?.maxArea == null ? null : Number((req.query as any)?.maxArea);
    const bedrooms = (req.query as any)?.bedrooms == null ? null : Number((req.query as any)?.bedrooms);
    const floors = (req.query as any)?.floors == null ? null : Number((req.query as any)?.floors);

    const rows = await listPublicPlans(tenant, {
      activeOnly,
      q,
      minArea: Number.isFinite(minArea as number) ? minArea : null,
      maxArea: Number.isFinite(maxArea as number) ? maxArea : null,
      bedrooms: Number.isFinite(bedrooms as number) ? bedrooms : null,
      floors: Number.isFinite(floors as number) ? floors : null,
      tag,
    });
    ok(res, { items: rows });
  }),
);

router.get(
  "/api/met/public/plans/:slug",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const slugOrId = String(req.params.slug || "").trim();
    if (!slugOrId) {
      sendError(res, 400, "INVALID_SLUG", "Missing plan identifier.");
      return;
    }

    const row = await findPublicPlanBySlugOrId(tenant, slugOrId);
    if (!row) {
      sendError(res, 404, "NOT_FOUND", "Plan not found.");
      return;
    }
    if (!row.isActive) {
      sendError(res, 404, "NOT_FOUND", "Plan not found.");
      return;
    }
    ok(res, { item: row });
  }),
);

router.get(
  "/api/met/blog-posts",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const slug = String((req.query as any)?.slug || "").trim();
    if (slug) {
      const row = await db.query.metBlogPosts.findFirst({
        where: and(eq(metBlogPosts.tenantId, tenant.id), eq(metBlogPosts.tenantKey, tenant.key), eq(metBlogPosts.slug, slug)),
      });
      if (!row) {
        sendError(res, 404, "NOT_FOUND", "Blog post not found.");
        return;
      }
      if (!row.publishedAt) {
        sendError(res, 404, "NOT_FOUND", "Blog post not found.");
        return;
      }
      ok(res, { item: row });
      return;
    }

    const rows = await db
      .select()
      .from(metBlogPosts)
      .where(
        and(
          eq(metBlogPosts.tenantId, tenant.id),
          eq(metBlogPosts.tenantKey, tenant.key),
          sql`${metBlogPosts.publishedAt} is not null`,
        ),
      )
      .orderBy(desc(metBlogPosts.publishedAt), desc(metBlogPosts.createdAt));
    ok(res, { items: rows });
  }),
);

router.get(
  "/api/met/public/blog-posts",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const rows = await db
      .select()
      .from(metBlogPosts)
      .where(
        and(
          eq(metBlogPosts.tenantId, tenant.id),
          eq(metBlogPosts.tenantKey, tenant.key),
          sql`${metBlogPosts.publishedAt} is not null`,
        ),
      )
      .orderBy(desc(metBlogPosts.publishedAt), desc(metBlogPosts.createdAt));

    ok(res, { items: rows });
  }),
);

router.get(
  "/api/met/public/blog-posts/:slug",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      sendError(res, 400, "INVALID_SLUG", "Missing blog slug.");
      return;
    }

    const row = await db.query.metBlogPosts.findFirst({
      where: and(
        eq(metBlogPosts.tenantId, tenant.id),
        eq(metBlogPosts.tenantKey, tenant.key),
        eq(metBlogPosts.slug, slug),
        sql`${metBlogPosts.publishedAt} is not null`,
      ),
    });
    if (!row) {
      sendError(res, 404, "NOT_FOUND", "Blog post not found.");
      return;
    }
    ok(res, { item: row });
  }),
);

router.get(
  "/api/met/public/projects",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const rows = await listPublicProjects(tenant);
    ok(res, { items: rows });
  }),
);

router.get(
  "/api/met/projects",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;
    const rows = await listPublicProjects(tenant);
    ok(res, { items: rows });
  }),
);

router.get(
  "/api/met/public/projects/:slug",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const slugOrId = String(req.params.slug || "").trim();
    if (!slugOrId) {
      sendError(res, 400, "INVALID_SLUG", "Missing project identifier.");
      return;
    }

    const row = await findPublicProjectBySlugOrId(tenant, slugOrId);
    if (!row) {
      sendError(res, 404, "NOT_FOUND", "Project not found.");
      return;
    }
    ok(res, { item: row });
  }),
);

router.get(
  "/api/met/projects/:slug",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const slugOrId = String(req.params.slug || "").trim();
    if (!slugOrId) {
      sendError(res, 400, "INVALID_SLUG", "Missing project identifier.");
      return;
    }
    const row = await findPublicProjectBySlugOrId(tenant, slugOrId);
    if (!row) {
      sendError(res, 404, "NOT_FOUND", "Project not found.");
      return;
    }
    ok(res, { item: row });
  }),
);

router.get(
  "/api/met/settings/public",
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const rows = await db
      .select()
      .from(metSettings)
      .where(
        and(
          eq(metSettings.tenantId, tenant.id),
          eq(metSettings.tenantKey, tenant.key),
          inArray(metSettings.key, ["homepage.hero", "pricing.rules"]),
        ),
      );

    const settings: Record<string, unknown> = {};
    for (const row of rows) settings[row.key] = row.value || {};
    ok(res, { settings });
  }),
);

router.post(
  "/api/leads",
  createRateLimitMiddleware("met:api:leads", 20, 60_000),
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const payload = parseBody(leadCreateSchema, req.body, res);
    if (!payload) return;

    const [created] = await db
      .insert(metLeads)
      .values({
        tenantId: tenant.id,
        tenantKey: tenant.key,
        name: payload.name,
        phone: payload.phone,
        email: sanitizeNullable(payload.email),
        city: payload.city,
        country: sanitizeNullable(payload.country),
        source: payload.source || "WEB_FORM",
        intent: payload.intent || "INFO",
        message: sanitizeNullable(payload.message),
        status: "NEW",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: metLeads.id, createdAt: metLeads.createdAt });

    ok(res, { leadId: created.id, createdAt: created.createdAt });
  }),
);

router.post(
  "/api/orders",
  createRateLimitMiddleware("met:api:orders", 10, 60_000),
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const payload = parseBody(orderCreateSchema, req.body, res);
    if (!payload) return;

    try {
      const result = await db.transaction(async (tx) => {
        const [lead] = await tx
          .insert(metLeads)
          .values({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            name: payload.lead.name,
            phone: payload.lead.phone,
            email: sanitizeNullable(payload.lead.email),
            city: payload.lead.city,
            country: sanitizeNullable(payload.lead.country),
            source: "WEB_FORM",
            intent: payload.lead.intent || "BUY_BRICKS",
            message: sanitizeNullable(payload.lead.message),
            status: "NEW",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: metLeads.id });

        let subtotal = 0;
        const rowsToInsert: Array<{
          tenantId: number;
          tenantKey: string;
          orderId: string;
          productId: string;
          quantityPieces: number | null;
          quantityPallets: number | null;
          unitPriceCfa: number;
          totalCfa: number;
          createdAt: Date;
          updatedAt: Date;
        }> = [];
        const normalizedItems: Array<Record<string, unknown>> = [];

        const mergedNotesParts = [
          sanitizeNullable(payload.notes),
          sanitizeNullable(payload.requestedDeliveryDate)
            ? `Date souhaitee: ${sanitizeNullable(payload.requestedDeliveryDate)}`
            : null,
        ].filter(Boolean);
        const mergedNotes = mergedNotesParts.length ? mergedNotesParts.join("\n") : null;

        const [order] = await tx
          .insert(metOrders)
          .values({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            leadId: lead.id,
            orderType: payload.orderType || "BRICKS",
            status: "SUBMITTED",
            deliveryAddress: sanitizeNullable(payload.deliveryAddress),
            city: sanitizeNullable(payload.city),
            distanceKm: payload.distanceKm == null ? null : String(payload.distanceKm),
            deliveryFeeCfa: payload.deliveryFeeCfa == null ? null : payload.deliveryFeeCfa,
            notes: mergedNotes,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: metOrders.id });

        for (const item of payload.items) {
          const product =
            item.productId
              ? await tx.query.metProducts.findFirst({
                  where: and(
                    eq(metProducts.tenantId, tenant.id),
                    eq(metProducts.tenantKey, tenant.key),
                    eq(metProducts.id, item.productId),
                  ),
                })
              : await tx.query.metProducts.findFirst({
                  where: and(
                    eq(metProducts.tenantId, tenant.id),
                    eq(metProducts.tenantKey, tenant.key),
                    eq(metProducts.sku, String(item.sku || "")),
                  ),
                });

          if (!product) {
            throw new Error("One or more products are invalid.");
          }

          const quantityPieces = Number(item.quantityPieces || 0);
          const quantityPallets = Number(item.quantityPallets || 0);
          if (quantityPieces <= 0 && quantityPallets <= 0) {
            throw new Error(`Missing quantity for product ${product.sku}.`);
          }

          const effectiveUnitPrice = Number.isFinite(Number(item.unitPriceCfa))
            ? Number(item.unitPriceCfa)
            : Number(product.priceCfa || 0);

          const billedQuantity = quantityPieces > 0 ? quantityPieces : quantityPallets;
          const lineTotal = Math.max(0, effectiveUnitPrice * billedQuantity);
          subtotal += lineTotal;

          rowsToInsert.push({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            orderId: order.id,
            productId: product.id,
            quantityPieces: quantityPieces > 0 ? quantityPieces : null,
            quantityPallets: quantityPallets > 0 ? quantityPallets : null,
            unitPriceCfa: effectiveUnitPrice,
            totalCfa: lineTotal,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          normalizedItems.push({
            productId: product.id,
            sku: product.sku,
            name: product.name,
            quantityPieces: quantityPieces > 0 ? quantityPieces : null,
            quantityPallets: quantityPallets > 0 ? quantityPallets : null,
            unitPriceCfa: effectiveUnitPrice,
            totalCfa: lineTotal,
          });
        }

        if (rowsToInsert.length) {
          await tx.insert(metOrderItems).values(rowsToInsert);
        }

        const deliveryFee = payload.deliveryFeeCfa == null ? 0 : payload.deliveryFeeCfa;
        const total = subtotal + deliveryFee;
        await tx
          .update(metOrders)
          .set({
            subtotalCfa: subtotal,
            totalCfa: total,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(metOrders.id, order.id),
              eq(metOrders.tenantId, tenant.id),
              eq(metOrders.tenantKey, tenant.key),
            ),
          );

        return {
          orderId: order.id,
          leadId: lead.id,
          subtotalCfa: subtotal,
          deliveryFeeCfa: deliveryFee || null,
          totalCfa: total,
          items: normalizedItems,
        };
      });

      ok(res, result);
    } catch (error: any) {
      sendError(res, 400, "ORDER_CREATE_FAILED", String(error?.message || "Unable to create order."));
    }
  }),
);

router.post(
  "/api/estimate-requests",
  createRateLimitMiddleware("met:api:estimate-requests", 8, 60_000),
  uploadEstimate.any(),
  asyncRoute(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const payload = parseBody(estimateCreateSchema, req.body, res);
    if (!payload) return;

    const file = extractUploadedFile(req);
    if (!file) {
      sendError(res, 400, "FILE_REQUIRED", "Please upload a plan file (PDF or image).");
      return;
    }
    if (!ensureUploadAcceptable(file, res)) return;

    const [lead] = await db
      .insert(metLeads)
      .values({
        tenantId: tenant.id,
        tenantKey: tenant.key,
        name: payload.name,
        phone: payload.phone,
        email: sanitizeNullable(payload.email),
        city: payload.city,
        country: sanitizeNullable(payload.country),
        source: "WEB_FORM",
        intent: "BUILD_HOUSE",
        message: sanitizeNullable(payload.brief),
        status: "NEW",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: metLeads.id });

    const [estimate] = await db
      .insert(metEstimateRequests)
      .values({
        tenantId: tenant.id,
        tenantKey: tenant.key,
        leadId: lead.id,
        projectCity: sanitizeNullable(payload.projectCity) || payload.city,
        landSizeM2: payload.landSizeM2 == null ? null : String(payload.landSizeM2),
        floors: payload.floors == null ? null : payload.floors,
        rooms: payload.rooms == null ? null : payload.rooms,
        budgetCfa: payload.budgetCfa == null ? null : payload.budgetCfa,
        timeline: sanitizeNullable(payload.timeline),
        brief: sanitizeNullable(payload.brief),
        status: "NEW",
        planFileUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: metEstimateRequests.id });

    const stored = await saveEstimateRequestFile({
      tenantKey: tenant.key,
      estimateRequestId: estimate.id,
      file,
    });

    await db
      .update(metEstimateRequests)
      .set({
        planFileUrl: stored.relativePath,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(metEstimateRequests.id, estimate.id),
          eq(metEstimateRequests.tenantId, tenant.id),
          eq(metEstimateRequests.tenantKey, tenant.key),
        ),
      );

    ok(res, {
      leadId: lead.id,
      estimateRequestId: estimate.id,
      file: {
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        originalName: stored.originalName,
      },
    });
  }),
);

router.get(
  "/api/admin/met/kpis",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [newLeadsRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metLeads)
      .where(
        and(
          eq(metLeads.tenantId, access.tenant.id),
          eq(metLeads.tenantKey, access.tenant.key),
          gte(metLeads.createdAt, sevenDaysAgo),
        ),
      );

    const [ordersSubmittedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metOrders)
      .where(
        and(
          eq(metOrders.tenantId, access.tenant.id),
          eq(metOrders.tenantKey, access.tenant.key),
          eq(metOrders.status, "SUBMITTED"),
        ),
      );

    const [estimatesPendingRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metEstimateRequests)
      .where(
        and(
          eq(metEstimateRequests.tenantId, access.tenant.id),
          eq(metEstimateRequests.tenantKey, access.tenant.key),
          inArray(metEstimateRequests.status, ["NEW", "REVIEWING"]),
        ),
      );

    ok(res, {
      kpis: {
        newLeadsLast7Days: Number(newLeadsRow?.count || 0),
        ordersSubmitted: Number(ordersSubmittedRow?.count || 0),
        estimatesPending: Number(estimatesPendingRow?.count || 0),
      },
    });
  }),
);

router.get(
  "/api/admin/met/leads",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const q = String((req.query as any)?.q || "").trim();
    const status = String((req.query as any)?.status || "").trim().toUpperCase();
    const source = String((req.query as any)?.source || "").trim().toUpperCase();
    const intent = String((req.query as any)?.intent || "").trim().toUpperCase();
    const limit = parseLimit((req.query as any)?.limit, 50);
    const offset = parseOffset((req.query as any)?.offset, 0);
    const { from, to } = normalizeDateBounds(req);

    const whereParts: any[] = [eq(metLeads.tenantId, access.tenant.id), eq(metLeads.tenantKey, access.tenant.key)];
    if (status && (LEAD_STATUSES as readonly string[]).includes(status)) whereParts.push(eq(metLeads.status, status as any));
    if (source && (LEAD_SOURCES as readonly string[]).includes(source)) whereParts.push(eq(metLeads.source, source as any));
    if (intent && (LEAD_INTENTS as readonly string[]).includes(intent)) whereParts.push(eq(metLeads.intent, intent as any));
    if (from) whereParts.push(gte(metLeads.createdAt, from));
    if (to) whereParts.push(lte(metLeads.createdAt, to));
    if (q) {
      const like = `%${q}%`;
      whereParts.push(
        or(
          ilike(metLeads.name, like),
          ilike(metLeads.phone, like),
          ilike(metLeads.email, like),
          ilike(metLeads.city, like),
        ),
      );
    }

    const whereClause = and(...whereParts);
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metLeads)
      .where(whereClause);

    const rows = await db
      .select()
      .from(metLeads)
      .where(whereClause)
      .orderBy(desc(metLeads.createdAt))
      .limit(limit)
      .offset(offset);

    ok(res, {
      items: rows,
      pagination: {
        total: Number(countRow?.count || 0),
        limit,
        offset,
      },
    });
  }),
);

router.get(
  "/api/admin/met/leads/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const row = await db.query.metLeads.findFirst({
      where: and(eq(metLeads.id, id), eq(metLeads.tenantId, access.tenant.id), eq(metLeads.tenantKey, access.tenant.key)),
    });
    if (!row) {
      sendError(res, 404, "NOT_FOUND", "Lead not found.");
      return;
    }

    const [orders, estimates] = await Promise.all([
      db
        .select({
          id: metOrders.id,
          status: metOrders.status,
          totalCfa: metOrders.totalCfa,
          createdAt: metOrders.createdAt,
        })
        .from(metOrders)
        .where(
          and(
            eq(metOrders.tenantId, access.tenant.id),
            eq(metOrders.tenantKey, access.tenant.key),
            eq(metOrders.leadId, row.id),
          ),
        )
        .orderBy(desc(metOrders.createdAt)),
      db
        .select({
          id: metEstimateRequests.id,
          status: metEstimateRequests.status,
          projectCity: metEstimateRequests.projectCity,
          createdAt: metEstimateRequests.createdAt,
        })
        .from(metEstimateRequests)
        .where(
          and(
            eq(metEstimateRequests.tenantId, access.tenant.id),
            eq(metEstimateRequests.tenantKey, access.tenant.key),
            eq(metEstimateRequests.leadId, row.id),
          ),
        )
        .orderBy(desc(metEstimateRequests.createdAt)),
    ]);

    ok(res, { item: { ...row, orders, estimates } });
  }),
);

router.patch(
  "/api/admin/met/leads/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_leads");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const payload = parseBody(leadPatchSchema, req.body, res);
    if (!payload) return;

    const existing = await db.query.metLeads.findFirst({
      where: and(eq(metLeads.id, id), eq(metLeads.tenantId, access.tenant.id), eq(metLeads.tenantKey, access.tenant.key)),
    });
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Lead not found.");
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.status) patch.status = payload.status;
    if (payload.internalNotes !== undefined) patch.internalNotes = sanitizeNullable(payload.internalNotes);

    const [updated] = await db
      .update(metLeads)
      .set(patch as any)
      .where(
        and(
          eq(metLeads.id, id),
          eq(metLeads.tenantId, access.tenant.id),
          eq(metLeads.tenantKey, access.tenant.key),
        ),
      )
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.leads.update",
      entityType: "met_lead",
      entityUuid: id,
      previousState: { status: existing.status, internalNotes: existing.internalNotes },
      newState: { status: updated.status, internalNotes: updated.internalNotes },
      req,
    });

    ok(res, { item: updated });
  }),
);

router.get(
  "/api/admin/met/orders",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const q = String((req.query as any)?.q || "").trim();
    const status = String((req.query as any)?.status || "").trim().toUpperCase();
    const limit = parseLimit((req.query as any)?.limit, 50);
    const offset = parseOffset((req.query as any)?.offset, 0);
    const { from, to } = normalizeDateBounds(req);

    const whereParts: any[] = [eq(metOrders.tenantId, access.tenant.id), eq(metOrders.tenantKey, access.tenant.key)];
    if (status && (ORDER_STATUSES as readonly string[]).includes(status)) whereParts.push(eq(metOrders.status, status as any));
    if (from) whereParts.push(gte(metOrders.createdAt, from));
    if (to) whereParts.push(lte(metOrders.createdAt, to));
    if (q) {
      const like = `%${q}%`;
      whereParts.push(
        or(
          ilike(metOrders.city, like),
          ilike(metOrders.deliveryAddress, like),
          ilike(metOrders.notes, like),
        ),
      );
    }

    const whereClause = and(...whereParts);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metOrders)
      .where(whereClause);

    const rows = await db
      .select()
      .from(metOrders)
      .where(whereClause)
      .orderBy(desc(metOrders.createdAt))
      .limit(limit)
      .offset(offset);

    const orderIds = rows.map((row) => row.id);
    const leadIds = rows.map((row) => row.leadId).filter(Boolean) as string[];

    const items = orderIds.length
      ? await db
          .select()
          .from(metOrderItems)
          .where(
            and(
              eq(metOrderItems.tenantId, access.tenant.id),
              eq(metOrderItems.tenantKey, access.tenant.key),
              inArray(metOrderItems.orderId, orderIds),
            ),
          )
          .orderBy(desc(metOrderItems.createdAt))
      : [];

    const leads = leadIds.length
      ? await db
          .select({ id: metLeads.id, name: metLeads.name, phone: metLeads.phone, email: metLeads.email })
          .from(metLeads)
          .where(
            and(
              eq(metLeads.tenantId, access.tenant.id),
              eq(metLeads.tenantKey, access.tenant.key),
              inArray(metLeads.id, leadIds),
            ),
          )
      : [];

    const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
    const itemMap = new Map<string, typeof items>();
    for (const row of items) {
      const bucket = itemMap.get(row.orderId) || [];
      bucket.push(row);
      itemMap.set(row.orderId, bucket);
    }

    const normalized = rows.map((row) => ({
      ...row,
      lead: row.leadId ? leadMap.get(row.leadId) || null : null,
      items: itemMap.get(row.id) || [],
    }));

    ok(res, {
      items: normalized,
      pagination: { total: Number(countRow?.count || 0), limit, offset },
    });
  }),
);

router.get(
  "/api/admin/met/orders/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const order = await db.query.metOrders.findFirst({
      where: and(eq(metOrders.id, id), eq(metOrders.tenantId, access.tenant.id), eq(metOrders.tenantKey, access.tenant.key)),
    });
    if (!order) {
      sendError(res, 404, "NOT_FOUND", "Order not found.");
      return;
    }

    const items = await db
      .select()
      .from(metOrderItems)
      .where(
        and(
          eq(metOrderItems.tenantId, access.tenant.id),
          eq(metOrderItems.tenantKey, access.tenant.key),
          eq(metOrderItems.orderId, id),
        ),
      )
      .orderBy(desc(metOrderItems.createdAt));

    const lead = order.leadId
      ? await db.query.metLeads.findFirst({
          where: and(
            eq(metLeads.id, order.leadId),
            eq(metLeads.tenantId, access.tenant.id),
            eq(metLeads.tenantKey, access.tenant.key),
          ),
        })
      : null;

    ok(res, { item: { ...order, lead: lead || null, items } });
  }),
);

router.patch(
  "/api/admin/met/orders/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_orders");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const payload = parseBody(orderPatchSchema, req.body, res);
    if (!payload) return;

    const existing = await db.query.metOrders.findFirst({
      where: and(eq(metOrders.id, id), eq(metOrders.tenantId, access.tenant.id), eq(metOrders.tenantKey, access.tenant.key)),
    });
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Order not found.");
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.status) patch.status = payload.status;
    if (payload.notes !== undefined) patch.notes = sanitizeNullable(payload.notes);
    if (payload.internalNotes !== undefined) patch.internalNotes = sanitizeNullable(payload.internalNotes);
    if (payload.deliveryAddress !== undefined) patch.deliveryAddress = sanitizeNullable(payload.deliveryAddress);
    if (payload.city !== undefined) patch.city = sanitizeNullable(payload.city);
    if (payload.distanceKm !== undefined) patch.distanceKm = payload.distanceKm == null ? null : String(payload.distanceKm);
    if (payload.deliveryFeeCfa !== undefined) patch.deliveryFeeCfa = payload.deliveryFeeCfa;
    if (payload.subtotalCfa !== undefined) patch.subtotalCfa = payload.subtotalCfa;
    if (payload.totalCfa !== undefined) patch.totalCfa = payload.totalCfa;

    const [updated] = await db
      .update(metOrders)
      .set(patch as any)
      .where(
        and(
          eq(metOrders.id, id),
          eq(metOrders.tenantId, access.tenant.id),
          eq(metOrders.tenantKey, access.tenant.key),
        ),
      )
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.orders.update",
      entityType: "met_order",
      entityUuid: id,
      previousState: { status: existing.status, totalCfa: existing.totalCfa, deliveryFeeCfa: existing.deliveryFeeCfa },
      newState: { status: updated.status, totalCfa: updated.totalCfa, deliveryFeeCfa: updated.deliveryFeeCfa },
      req,
    });

    ok(res, { item: updated });
  }),
);

router.get(
  "/api/admin/met/estimate-requests",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const q = String((req.query as any)?.q || "").trim();
    const status = String((req.query as any)?.status || "").trim().toUpperCase();
    const limit = parseLimit((req.query as any)?.limit, 50);
    const offset = parseOffset((req.query as any)?.offset, 0);
    const { from, to } = normalizeDateBounds(req);

    const whereParts: any[] = [
      eq(metEstimateRequests.tenantId, access.tenant.id),
      eq(metEstimateRequests.tenantKey, access.tenant.key),
    ];
    if (status && (ESTIMATE_STATUSES as readonly string[]).includes(status)) {
      whereParts.push(eq(metEstimateRequests.status, status as any));
    }
    if (from) whereParts.push(gte(metEstimateRequests.createdAt, from));
    if (to) whereParts.push(lte(metEstimateRequests.createdAt, to));
    if (q) {
      const like = `%${q}%`;
      whereParts.push(
        or(
          ilike(metEstimateRequests.projectCity, like),
          ilike(metEstimateRequests.timeline, like),
          ilike(metEstimateRequests.brief, like),
        ),
      );
    }

    const whereClause = and(...whereParts);
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metEstimateRequests)
      .where(whereClause);

    const rows = await db
      .select()
      .from(metEstimateRequests)
      .where(whereClause)
      .orderBy(desc(metEstimateRequests.createdAt))
      .limit(limit)
      .offset(offset);

    const leadIds = rows.map((row) => row.leadId).filter(Boolean) as string[];
    const leads = leadIds.length
      ? await db
          .select({ id: metLeads.id, name: metLeads.name, phone: metLeads.phone, email: metLeads.email })
          .from(metLeads)
          .where(
            and(
              eq(metLeads.tenantId, access.tenant.id),
              eq(metLeads.tenantKey, access.tenant.key),
              inArray(metLeads.id, leadIds),
            ),
          )
      : [];
    const leadMap = new Map(leads.map((lead) => [lead.id, lead]));

    const normalized = rows.map((row) => ({
      ...row,
      lead: row.leadId ? leadMap.get(row.leadId) || null : null,
    }));

    ok(res, {
      items: normalized,
      pagination: {
        total: Number(countRow?.count || 0),
        limit,
        offset,
      },
    });
  }),
);

router.get(
  "/api/admin/met/estimate-requests/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const row = await db.query.metEstimateRequests.findFirst({
      where: and(
        eq(metEstimateRequests.id, id),
        eq(metEstimateRequests.tenantId, access.tenant.id),
        eq(metEstimateRequests.tenantKey, access.tenant.key),
      ),
    });
    if (!row) {
      sendError(res, 404, "NOT_FOUND", "Estimate request not found.");
      return;
    }

    const lead = row.leadId
      ? await db.query.metLeads.findFirst({
          where: and(
            eq(metLeads.id, row.leadId),
            eq(metLeads.tenantId, access.tenant.id),
            eq(metLeads.tenantKey, access.tenant.key),
          ),
        })
      : null;

    ok(res, { item: { ...row, lead: lead || null } });
  }),
);

router.patch(
  "/api/admin/met/estimate-requests/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_estimates");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const payload = parseBody(estimatePatchSchema, req.body, res);
    if (!payload) return;

    const existing = await db.query.metEstimateRequests.findFirst({
      where: and(
        eq(metEstimateRequests.id, id),
        eq(metEstimateRequests.tenantId, access.tenant.id),
        eq(metEstimateRequests.tenantKey, access.tenant.key),
      ),
    });
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Estimate request not found.");
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.status) patch.status = payload.status;
    if (payload.internalNotes !== undefined) patch.internalNotes = sanitizeNullable(payload.internalNotes);

    const [updated] = await db
      .update(metEstimateRequests)
      .set(patch as any)
      .where(
        and(
          eq(metEstimateRequests.id, id),
          eq(metEstimateRequests.tenantId, access.tenant.id),
          eq(metEstimateRequests.tenantKey, access.tenant.key),
        ),
      )
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.estimates.update",
      entityType: "met_estimate_request",
      entityUuid: id,
      previousState: { status: existing.status },
      newState: { status: updated.status },
      req,
    });

    ok(res, { item: updated });
  }),
);

router.get(
  "/api/admin/met/estimate-requests/:id/file",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const estimate = await db.query.metEstimateRequests.findFirst({
      where: and(
        eq(metEstimateRequests.id, id),
        eq(metEstimateRequests.tenantId, access.tenant.id),
        eq(metEstimateRequests.tenantKey, access.tenant.key),
      ),
      columns: { id: true, planFileUrl: true },
    });
    if (!estimate) {
      sendError(res, 404, "NOT_FOUND", "Estimate request not found.");
      return;
    }
    if (!estimate.planFileUrl) {
      sendError(res, 404, "FILE_NOT_FOUND", "No attachment found for this estimate.");
      return;
    }

    let storedFile: { absolutePath: string; relativePath: string };
    try {
      storedFile = await getStoredFile(estimate.planFileUrl);
    } catch {
      sendError(res, 404, "FILE_NOT_FOUND", "File does not exist on storage.");
      return;
    }

    const fileName = path.basename(storedFile.absolutePath);
    res.download(storedFile.absolutePath, fileName);
  }),
);

router.get(
  "/api/admin/met/products",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const active = String((req.query as any)?.active || "").trim().toLowerCase();
    const whereParts: any[] = [eq(metProducts.tenantId, access.tenant.id), eq(metProducts.tenantKey, access.tenant.key)];
    if (active === "true") whereParts.push(eq(metProducts.isActive, true));
    if (active === "false") whereParts.push(eq(metProducts.isActive, false));

    const rows = await db
      .select()
      .from(metProducts)
      .where(and(...whereParts))
      .orderBy(desc(metProducts.updatedAt), desc(metProducts.createdAt));

    ok(res, { items: rows });
  }),
);

router.post(
  "/api/admin/met/products",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_content");
    if (!access) return;

    const payload = parseBody(productCreateSchema, req.body, res);
    if (!payload) return;

    const [created] = await db
      .insert(metProducts)
      .values({
        tenantId: access.tenant.id,
        tenantKey: access.tenant.key,
        createdByUserId: access.user.id,
        name: payload.name,
        sku: payload.sku,
        description: sanitizeNullable(payload.description),
        dimensionsMm: payload.dimensionsMm || {},
        compressiveStrengthMpa:
          payload.compressiveStrengthMpa == null ? null : String(payload.compressiveStrengthMpa),
        priceCfa: payload.priceCfa,
        unit: payload.unit,
        piecesPerPallet: payload.piecesPerPallet,
        isActive: payload.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.products.create",
      entityType: "met_product",
      entityUuid: created.id,
      newState: { sku: created.sku, name: created.name },
      req,
    });

    ok(res, { item: created });
  }),
);

router.patch(
  "/api/admin/met/products/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_content");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const payload = parseBody(productPatchSchema, req.body, res);
    if (!payload) return;

    const existing = await db.query.metProducts.findFirst({
      where: and(eq(metProducts.id, id), eq(metProducts.tenantId, access.tenant.id), eq(metProducts.tenantKey, access.tenant.key)),
    });
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Product not found.");
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.sku !== undefined) patch.sku = payload.sku;
    if (payload.description !== undefined) patch.description = sanitizeNullable(payload.description);
    if (payload.dimensionsMm !== undefined) patch.dimensionsMm = payload.dimensionsMm || {};
    if (payload.compressiveStrengthMpa !== undefined) {
      patch.compressiveStrengthMpa =
        payload.compressiveStrengthMpa == null ? null : String(payload.compressiveStrengthMpa);
    }
    if (payload.priceCfa !== undefined) patch.priceCfa = payload.priceCfa;
    if (payload.unit !== undefined) patch.unit = payload.unit;
    if (payload.piecesPerPallet !== undefined) patch.piecesPerPallet = payload.piecesPerPallet;
    if (payload.isActive !== undefined) patch.isActive = payload.isActive;

    const [updated] = await db
      .update(metProducts)
      .set(patch as any)
      .where(
        and(
          eq(metProducts.id, id),
          eq(metProducts.tenantId, access.tenant.id),
          eq(metProducts.tenantKey, access.tenant.key),
        ),
      )
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.products.update",
      entityType: "met_product",
      entityUuid: id,
      previousState: { sku: existing.sku, name: existing.name, isActive: existing.isActive },
      newState: { sku: updated.sku, name: updated.name, isActive: updated.isActive },
      req,
    });

    ok(res, { item: updated });
  }),
);

router.get(
  "/api/admin/met/plans",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const active = String((req.query as any)?.active || "").trim().toLowerCase();
    const whereParts: any[] = [eq(metPlans.tenantId, access.tenant.id), eq(metPlans.tenantKey, access.tenant.key)];
    if (active === "true") whereParts.push(eq(metPlans.isActive, true));
    if (active === "false") whereParts.push(eq(metPlans.isActive, false));

    const rows = await db
      .select()
      .from(metPlans)
      .where(and(...whereParts))
      .orderBy(desc(metPlans.updatedAt), desc(metPlans.createdAt));

    ok(res, { items: rows });
  }),
);

router.post(
  "/api/admin/met/plans",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_content");
    if (!access) return;

    const payload = parseBody(planCreateSchema, req.body, res);
    if (!payload) return;
    const normalizedSlug = normalizeSlug(payload.slug || payload.title, `plan-${Date.now().toString(36)}`);

    const [created] = await db
      .insert(metPlans)
      .values({
        tenantId: access.tenant.id,
        tenantKey: access.tenant.key,
        createdByUserId: access.user.id,
        title: payload.title,
        slug: normalizedSlug,
        description: sanitizeNullable(payload.description),
        bedrooms: payload.bedrooms == null ? null : payload.bedrooms,
        bathrooms: payload.bathrooms == null ? null : payload.bathrooms,
        floors: payload.floors == null ? null : payload.floors,
        areaM2: payload.areaM2 == null ? null : String(payload.areaM2),
        tags: payload.tags || [],
        thumbnailUrl: sanitizeNullable(payload.thumbnailUrl),
        fileUrl: sanitizeNullable(payload.fileUrl),
        isActive: payload.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.plans.create",
      entityType: "met_plan",
      entityUuid: created.id,
      newState: { title: created.title },
      req,
    });

    ok(res, { item: created });
  }),
);

router.patch(
  "/api/admin/met/plans/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_content");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const payload = parseBody(planPatchSchema, req.body, res);
    if (!payload) return;

    const existing = await db.query.metPlans.findFirst({
      where: and(eq(metPlans.id, id), eq(metPlans.tenantId, access.tenant.id), eq(metPlans.tenantKey, access.tenant.key)),
    });
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Plan not found.");
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.title !== undefined) patch.title = payload.title;
    if (payload.slug !== undefined) patch.slug = normalizeSlug(payload.slug, existing.slug || "plan");
    if (payload.description !== undefined) patch.description = sanitizeNullable(payload.description);
    if (payload.bedrooms !== undefined) patch.bedrooms = payload.bedrooms;
    if (payload.bathrooms !== undefined) patch.bathrooms = payload.bathrooms;
    if (payload.floors !== undefined) patch.floors = payload.floors;
    if (payload.areaM2 !== undefined) patch.areaM2 = payload.areaM2 == null ? null : String(payload.areaM2);
    if (payload.tags !== undefined) patch.tags = payload.tags;
    if (payload.thumbnailUrl !== undefined) patch.thumbnailUrl = sanitizeNullable(payload.thumbnailUrl);
    if (payload.fileUrl !== undefined) patch.fileUrl = sanitizeNullable(payload.fileUrl);
    if (payload.isActive !== undefined) patch.isActive = payload.isActive;

    const [updated] = await db
      .update(metPlans)
      .set(patch as any)
      .where(
        and(
          eq(metPlans.id, id),
          eq(metPlans.tenantId, access.tenant.id),
          eq(metPlans.tenantKey, access.tenant.key),
        ),
      )
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.plans.update",
      entityType: "met_plan",
      entityUuid: id,
      previousState: { title: existing.title, isActive: existing.isActive },
      newState: { title: updated.title, isActive: updated.isActive },
      req,
    });

    ok(res, { item: updated });
  }),
);

router.get(
  "/api/admin/met/projects",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const q = sanitizeNullable((req.query as any)?.q);
    const status = String((req.query as any)?.status || "").trim().toUpperCase();

    const whereParts: any[] = [
      eq(metProjects.tenantId, access.tenant.id),
      eq(metProjects.tenantKey, access.tenant.key),
    ];
    if (status && (PROJECT_STATUSES as readonly string[]).includes(status)) {
      whereParts.push(eq(metProjects.status, status as any));
    }
    if (q) {
      const like = `%${q}%`;
      whereParts.push(
        or(ilike(metProjects.title, like), ilike(metProjects.summary, like), ilike(metProjects.location, like)),
      );
    }

    const projects = await db
      .select()
      .from(metProjects)
      .where(and(...whereParts))
      .orderBy(desc(metProjects.isFeatured), desc(metProjects.updatedAt), desc(metProjects.createdAt));

    const projectIds = projects.map((project) => project.id);
    const mediaRows = projectIds.length
      ? await db
          .select()
          .from(metProjectMedia)
          .where(
            and(
              eq(metProjectMedia.tenantId, access.tenant.id),
              eq(metProjectMedia.tenantKey, access.tenant.key),
              inArray(metProjectMedia.projectId, projectIds),
            ),
          )
          .orderBy(metProjectMedia.sortOrder, desc(metProjectMedia.createdAt))
      : [];

    const mediaMap = new Map<string, typeof mediaRows>();
    for (const row of mediaRows) {
      const bucket = mediaMap.get(row.projectId) || [];
      bucket.push(row);
      mediaMap.set(row.projectId, bucket);
    }

    ok(res, {
      items: projects.map((project) => ({
        ...project,
        media: mediaMap.get(project.id) || [],
      })),
    });
  }),
);

router.get(
  "/api/admin/met/projects/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const item = await db.query.metProjects.findFirst({
      where: and(
        eq(metProjects.id, id),
        eq(metProjects.tenantId, access.tenant.id),
        eq(metProjects.tenantKey, access.tenant.key),
      ),
    });
    if (!item) {
      sendError(res, 404, "NOT_FOUND", "Project not found.");
      return;
    }

    const media = await db
      .select()
      .from(metProjectMedia)
      .where(
        and(
          eq(metProjectMedia.tenantId, access.tenant.id),
          eq(metProjectMedia.tenantKey, access.tenant.key),
          eq(metProjectMedia.projectId, item.id),
        ),
      )
      .orderBy(metProjectMedia.sortOrder, desc(metProjectMedia.createdAt));

    ok(res, { item: { ...item, media } });
  }),
);

router.post(
  "/api/admin/met/projects",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_content");
    if (!access) return;

    const payload = parseBody(projectCreateSchema, req.body, res);
    if (!payload) return;

    const projectSlug = normalizeSlug(payload.slug || payload.title, `project-${Date.now().toString(36)}`);
    const [project] = await db
      .insert(metProjects)
      .values({
        tenantId: access.tenant.id,
        tenantKey: access.tenant.key,
        createdByUserId: access.user.id,
        title: payload.title,
        slug: projectSlug,
        summary: sanitizeNullable(payload.summary),
        description: sanitizeNullable(payload.description),
        location: sanitizeNullable(payload.location),
        status: payload.status || "PUBLISHED",
        isFeatured: payload.isFeatured ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (payload.media?.length) {
      await db.insert(metProjectMedia).values(
        payload.media.map((entry, index) => ({
          tenantId: access.tenant.id,
          tenantKey: access.tenant.key,
          projectId: project.id,
          createdByUserId: access.user.id,
          assetUrl: entry.assetUrl,
          caption: sanitizeNullable(entry.caption),
          sortOrder: entry.sortOrder ?? index + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }

    const media = await db
      .select()
      .from(metProjectMedia)
      .where(
        and(
          eq(metProjectMedia.tenantId, access.tenant.id),
          eq(metProjectMedia.tenantKey, access.tenant.key),
          eq(metProjectMedia.projectId, project.id),
        ),
      )
      .orderBy(metProjectMedia.sortOrder, desc(metProjectMedia.createdAt));

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.projects.create",
      entityType: "met_project",
      entityUuid: project.id,
      newState: { slug: project.slug, title: project.title },
      req,
    });

    ok(res, { item: { ...project, media } });
  }),
);

router.patch(
  "/api/admin/met/projects/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_content");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const payload = parseBody(projectPatchSchema, req.body, res);
    if (!payload) return;

    const existing = await db.query.metProjects.findFirst({
      where: and(
        eq(metProjects.id, id),
        eq(metProjects.tenantId, access.tenant.id),
        eq(metProjects.tenantKey, access.tenant.key),
      ),
    });
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Project not found.");
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.title !== undefined) patch.title = payload.title;
    if (payload.slug !== undefined) patch.slug = normalizeSlug(payload.slug, existing.slug || "project");
    if (payload.summary !== undefined) patch.summary = sanitizeNullable(payload.summary);
    if (payload.description !== undefined) patch.description = sanitizeNullable(payload.description);
    if (payload.location !== undefined) patch.location = sanitizeNullable(payload.location);
    if (payload.status !== undefined) patch.status = payload.status;
    if (payload.isFeatured !== undefined) patch.isFeatured = payload.isFeatured;

    const [updated] = await db
      .update(metProjects)
      .set(patch as any)
      .where(
        and(
          eq(metProjects.id, id),
          eq(metProjects.tenantId, access.tenant.id),
          eq(metProjects.tenantKey, access.tenant.key),
        ),
      )
      .returning();

    if (payload.media) {
      await db
        .delete(metProjectMedia)
        .where(
          and(
            eq(metProjectMedia.projectId, id),
            eq(metProjectMedia.tenantId, access.tenant.id),
            eq(metProjectMedia.tenantKey, access.tenant.key),
          ),
        );
      if (payload.media.length) {
        await db.insert(metProjectMedia).values(
          payload.media.map((entry, index) => ({
            tenantId: access.tenant.id,
            tenantKey: access.tenant.key,
            projectId: id,
            createdByUserId: access.user.id,
            assetUrl: entry.assetUrl,
            caption: sanitizeNullable(entry.caption),
            sortOrder: entry.sortOrder ?? index + 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        );
      }
    }

    const media = await db
      .select()
      .from(metProjectMedia)
      .where(
        and(
          eq(metProjectMedia.tenantId, access.tenant.id),
          eq(metProjectMedia.tenantKey, access.tenant.key),
          eq(metProjectMedia.projectId, id),
        ),
      )
      .orderBy(metProjectMedia.sortOrder, desc(metProjectMedia.createdAt));

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.projects.update",
      entityType: "met_project",
      entityUuid: id,
      previousState: { title: existing.title, slug: existing.slug, status: existing.status },
      newState: { title: updated.title, slug: updated.slug, status: updated.status },
      req,
    });

    ok(res, { item: { ...updated, media } });
  }),
);

router.get(
  "/api/admin/met/blog-posts",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const rows = await db
      .select()
      .from(metBlogPosts)
      .where(and(eq(metBlogPosts.tenantId, access.tenant.id), eq(metBlogPosts.tenantKey, access.tenant.key)))
      .orderBy(desc(metBlogPosts.publishedAt), desc(metBlogPosts.createdAt));

    ok(res, { items: rows });
  }),
);

router.post(
  "/api/admin/met/blog-posts",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_content");
    if (!access) return;

    const payload = parseBody(blogCreateSchema, req.body, res);
    if (!payload) return;
    const normalizedSlug = normalizeSlug(payload.slug, `article-${Date.now().toString(36)}`);

    const [created] = await db
      .insert(metBlogPosts)
      .values({
        tenantId: access.tenant.id,
        tenantKey: access.tenant.key,
        createdByUserId: access.user.id,
        slug: normalizedSlug,
        title: payload.title,
        excerpt: sanitizeNullable(payload.excerpt),
        contentMarkdown: sanitizeNullable(payload.contentMarkdown),
        coverImageUrl: sanitizeNullable(payload.coverImageUrl),
        publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.blog.create",
      entityType: "met_blog_post",
      entityUuid: created.id,
      newState: { slug: created.slug, title: created.title },
      req,
    });

    ok(res, { item: created });
  }),
);

router.patch(
  "/api/admin/met/blog-posts/:id",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_content");
    if (!access) return;

    const id = String(req.params.id || "").trim();
    const payload = parseBody(blogPatchSchema, req.body, res);
    if (!payload) return;

    const existing = await db.query.metBlogPosts.findFirst({
      where: and(eq(metBlogPosts.id, id), eq(metBlogPosts.tenantId, access.tenant.id), eq(metBlogPosts.tenantKey, access.tenant.key)),
    });
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Blog post not found.");
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.slug !== undefined) patch.slug = normalizeSlug(payload.slug, existing.slug || "article");
    if (payload.title !== undefined) patch.title = payload.title;
    if (payload.excerpt !== undefined) patch.excerpt = sanitizeNullable(payload.excerpt);
    if (payload.contentMarkdown !== undefined) patch.contentMarkdown = sanitizeNullable(payload.contentMarkdown);
    if (payload.coverImageUrl !== undefined) patch.coverImageUrl = sanitizeNullable(payload.coverImageUrl);
    if (payload.publishedAt !== undefined) patch.publishedAt = payload.publishedAt ? new Date(payload.publishedAt) : null;

    const [updated] = await db
      .update(metBlogPosts)
      .set(patch as any)
      .where(
        and(
          eq(metBlogPosts.id, id),
          eq(metBlogPosts.tenantId, access.tenant.id),
          eq(metBlogPosts.tenantKey, access.tenant.key),
        ),
      )
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.blog.update",
      entityType: "met_blog_post",
      entityUuid: id,
      previousState: { slug: existing.slug, title: existing.title },
      newState: { slug: updated.slug, title: updated.title },
      req,
    });

    ok(res, { item: updated });
  }),
);

router.get(
  "/api/admin/met/settings",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "read");
    if (!access) return;

    const rows = await db
      .select()
      .from(metSettings)
      .where(and(eq(metSettings.tenantId, access.tenant.id), eq(metSettings.tenantKey, access.tenant.key)))
      .orderBy(metSettings.key);

    ok(res, { items: rows });
  }),
);

router.patch(
  "/api/admin/met/settings",
  asyncRoute(async (req, res) => {
    const access = await requireAccess(req, res, "manage_settings");
    if (!access) return;

    const payload = parseBody(settingsPatchSchema, req.body, res);
    if (!payload) return;

    const now = new Date();
    const [updated] = await db
      .insert(metSettings)
      .values({
        tenantId: access.tenant.id,
        tenantKey: access.tenant.key,
        createdByUserId: access.user.id,
        key: payload.key,
        value: payload.value,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [metSettings.tenantId, metSettings.key],
        set: {
          value: payload.value,
          updatedAt: now,
          createdByUserId: access.user.id,
        },
      })
      .returning();

    await writeMetAudit({
      tenantId: access.tenant.id,
      userId: access.user.id,
      action: "met.settings.update",
      entityType: "met_setting",
      entityUuid: updated.id,
      newState: { key: updated.key },
      metadata: { setting_key: updated.key },
      req,
    });

    ok(res, { item: updated });
  }),
);

export default router;
