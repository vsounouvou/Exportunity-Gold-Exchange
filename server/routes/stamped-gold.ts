import { Router } from "express";
import { db } from "@db";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import {
  marketplaceOrders,
  partnerJewellers,
  productCategories,
  sellerProducts,
  stampedGoldCertificates,
  stampedGoldItems,
  stampedGoldSkus,
  stampedGoldVerificationScans,
  tenants,
} from "@db/schema";
import { ensureTenantAdmin, ensureTenantUser } from "./utils/auth";
import { ensureStampedGoldTables } from "../lib/stamped-gold/ensureTables";

const router = Router();

router.use(async (_req, res, next) => {
  try {
    await ensureStampedGoldTables();
    next();
  } catch (error) {
    console.error("[Stamped Gold] ensure tables failed:", error);
    res.status(500).json({ message: "Stamped Gold service unavailable" });
  }
});

router.use(async (req, res, next) => {
  try {
    const enabled = await ensureGoldStampingFeatureEnabled(req, res);
    if (!enabled) return;
    next();
  } catch (error) {
    console.error("[Stamped Gold] feature gate error:", error);
    res.status(500).json({ message: "Feature gate failed" });
  }
});

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

const PROCESS_BLOCKED_CODE = "PROCESS_BLOCKED";
const INVALID_TRANSITION_CODE = "INVALID_TRANSITION";

type StampedGoldStatus =
  | "CREATED"
  | "ASSIGNED"
  | "ENGRAVED"
  | "SEALED"
  | "CERTIFIED"
  | "IN_VAULT"
  | "READY_PICKUP"
  | "DELIVERED"
  | "OPENED_VOID"
  | "IN_STOCK"
  | "RESERVED"
  | "SOLD"
  | "VOID";

const TRANSITION_RULES: Record<StampedGoldStatus, StampedGoldStatus[]> = {
  CREATED: ["ASSIGNED"],
  ASSIGNED: ["ENGRAVED"],
  ENGRAVED: ["SEALED"],
  SEALED: ["CERTIFIED"],
  CERTIFIED: ["IN_VAULT", "READY_PICKUP"],
  IN_VAULT: ["DELIVERED"],
  READY_PICKUP: ["DELIVERED"],
  DELIVERED: [],
  OPENED_VOID: [],
  // Legacy statuses retained for backward-compat data migration paths.
  IN_STOCK: ["ASSIGNED", "CREATED"],
  RESERVED: ["ASSIGNED"],
  SOLD: ["READY_PICKUP"],
  VOID: [],
};

const PARTNER_TRANSITIONS = new Set(["ASSIGNED->ENGRAVED", "ENGRAVED->SEALED"]);
const CERTIFY_TRANSITIONS = new Set(["SEALED->CERTIFIED"]);
const POST_CERTIFY_TRANSITIONS = new Set(["CERTIFIED->IN_VAULT", "CERTIFIED->READY_PICKUP"]);

const BDO_TENANT_KEY = "bdo";
const BDO_AUTHORIZED_PARTNER_JEWELLER_NAME = "LE RUBIS SERTISSEUR";
const FEATURE_DISABLED_CODE = "FEATURE_DISABLED";

function isBourseDeLorTenant(tenantKey: string) {
  return String(tenantKey || "")
    .trim()
    .toLowerCase() === BDO_TENANT_KEY;
}

function processBlocked(res: any, reason: string, status = 400, extra?: Record<string, unknown>) {
  return res.status(status).json({
    code: PROCESS_BLOCKED_CODE,
    reason,
    ...(extra || {}),
  });
}

function invalidTransition(res: any, fromStatus: string, toStatus: string) {
  return res.status(400).json({
    code: INVALID_TRANSITION_CODE,
    message: `Invalid transition ${fromStatus} -> ${toStatus}`,
    from: fromStatus,
    to: toStatus,
  });
}

function normalizeFeatureFlags(raw: unknown) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    "feature.gold_stamping": input["feature.gold_stamping"] !== false,
    "feature.jewelry": Boolean(input["feature.jewelry"]),
    "feature.custom_jewelry": Boolean(input["feature.custom_jewelry"]),
    "feature.3d_memory": Boolean(input["feature.3d_memory"]),
  } as const;
}

async function getTenantFeatureFlags(tenantId: number) {
  const row = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { featureFlags: true },
  });
  return normalizeFeatureFlags(row?.featureFlags ?? null);
}

async function ensureGoldStampingFeatureEnabled(req: any, res: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    res.status(400).json({ message: "Tenant not resolved" });
    return false;
  }
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags["feature.gold_stamping"]) {
    res.status(403).json({
      code: FEATURE_DISABLED_CODE,
      message: "Gold stamping is disabled for this tenant",
      feature: "feature.gold_stamping",
    });
    return false;
  }
  return true;
}

function getPublicBaseUrl(req: any): string {
  const explicitBase = String(process.env.TWILIO_STATUS_CALLBACK_BASE_URL || process.env.PUBLIC_BASE_URL || "").trim();
  if (explicitBase) return explicitBase.replace(/\/+$/, "");
  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${protocol || "https"}://${host}`.replace(/\/+$/, "");
}

function getAssetBasePath() {
  return String(process.env.ASSET_BASE_PATH || path.resolve(process.cwd(), "data/assets")).trim();
}

function getAssetPublicPath() {
  return String(process.env.ASSET_PUBLIC_PATH || "/assets").trim().replace(/\/+$/, "");
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function createSimplePdfBuffer(lines: string[]) {
  const safeLines = lines.map((line) => escapePdfText(line.slice(0, 2000)));
  const content = safeLines
    .slice(0, 30)
    .map((line, index) => `BT /F1 12 Tf 40 ${760 - index * 22} Td (${line}) Tj ET`)
    .join("\n");
  const objects: string[] = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
  );
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  objects.push(`5 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj`);

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${object}\n`;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

let hasPaymentStatusColumnPromise: Promise<boolean> | null = null;
async function hasMarketplaceOrderPaymentStatusColumn() {
  if (!hasPaymentStatusColumnPromise) {
    hasPaymentStatusColumnPromise = (async () => {
      const result = await db.execute(sql`
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'marketplace_orders'
          and column_name = 'payment_status'
        limit 1
      `);
      return Boolean((result as any)?.rows?.[0]);
    })();
  }
  return hasPaymentStatusColumnPromise;
}

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

async function resolveAuthorizedPartnerJewellerId(scope: { tenantId: number; tenantKey: string }): Promise<string | null> {
  if (!isBourseDeLorTenant(scope.tenantKey)) return null;

  const result = await db.execute(sql`
    select id::text as id
    from partner_jewellers
    where tenant_id = ${scope.tenantId}
      and is_active = true
      and lower(name) = lower(${BDO_AUTHORIZED_PARTNER_JEWELLER_NAME})
    limit 1
  `);
  const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
  const id = String(row?.id || "").trim();
  return id || null;
}

function ensureAuthorizedPartnerJeweller(
  res: any,
  scope: { tenantId: number; tenantKey: string },
  requestedPartnerJewellerId: string,
  authorizedPartnerJewellerId: string | null,
) {
  if (!isBourseDeLorTenant(scope.tenantKey)) return { ok: true as const };
  if (!authorizedPartnerJewellerId) {
    return {
      ok: false as const,
      response: processBlocked(res, `Authorized partner jeweller (${BDO_AUTHORIZED_PARTNER_JEWELLER_NAME}) is missing for this tenant.`),
    };
  }
  if (String(requestedPartnerJewellerId).toLowerCase() !== String(authorizedPartnerJewellerId).toLowerCase()) {
    return {
      ok: false as const,
      response: processBlocked(
        res,
        `Only the authorized partner jeweller (${BDO_AUTHORIZED_PARTNER_JEWELLER_NAME}) can be used for stamped gold manufacturing.`,
        403,
      ),
    };
  }
  return { ok: true as const };
}

function toInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function toUuid(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(raw)) return null;
  return raw;
}

function normalizePurityCode(purityRaw: unknown): string {
  return String(purityRaw ?? "")
    .trim()
    .replace(/[^0-9.]/g, "")
    .replace(/\.+/g, ".");
}

function normalizeSkuCode(input: { type: "COIN" | "BAR"; weightGrams: number; purity: string }) {
  const purityDigits = input.purity.replace(/\./g, "");
  const weightLabel = input.weightGrams >= 1000 ? `${Math.round(input.weightGrams / 1000)}KG` : `${input.weightGrams}G`;
  return `BDO-${input.type}-${weightLabel}-${purityDigits || "NA"}`.toUpperCase();
}

const COIN_WEIGHTS_G = new Set([1, 2, 5, 10, 20, 31]); // 31g ≈ 1oz (optional)
const BAR_WEIGHTS_G = new Set([5, 10, 20, 50, 100, 250, 500, 1000]);

function validateStampedGoldSku(input: { type: "COIN" | "BAR"; weightGrams: number }) {
  if (input.type === "COIN" && !COIN_WEIGHTS_G.has(input.weightGrams)) {
    throw new Error("invalid_coin_weight");
  }
  if (input.type === "BAR" && !BAR_WEIGHTS_G.has(input.weightGrams)) {
    throw new Error("invalid_bar_weight");
  }
}

function buildSerialCode(input: { serialPrefix: string; year: number; type: "COIN" | "BAR"; weightGrams: number }) {
  const prefix = String(input.serialPrefix || "").trim().replace(/\s+/g, "-");
  const year = Number.isFinite(input.year) ? Math.trunc(input.year) : new Date().getUTCFullYear();
  const weightLabel = input.weightGrams >= 1000 ? `${Math.round(input.weightGrams / 1000)}KG` : `${input.weightGrams}G`;
  return `${prefix}-${year}-${input.type}-${weightLabel}-${nanoid(8).toUpperCase()}`.toUpperCase();
}

async function resolveTenantScope(req: any): Promise<{ tenantId: number; tenantKey: string }> {
  const requestedKey = String(req.query.tenantKey || "").trim();
  if (requestedKey) {
    const row = await db.query.tenants.findFirst({ where: eq(tenants.key, requestedKey) });
    if (row) return { tenantId: row.id, tenantKey: row.key };
  }
  const tenant = req.tenant;
  return { tenantId: tenant.id, tenantKey: tenant.key };
}

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const head = user?.slice(0, 1) || "*";
  return `${head}***@${domain}`;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `***${digits.slice(-4)}`;
}

function normalizeRoleLabel(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectNormalizedRoles(user: any): string[] {
  const directRole = user?.role;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const currentMode = user?.currentMode;
  return [directRole, currentMode, ...roles]
    .map((value) => normalizeRoleLabel(value))
    .filter(Boolean);
}

function isStampedGoldAdminUser(user: any): boolean {
  if (!user) return false;
  const permissions = Array.isArray(user?.permissions) ? user.permissions.map(String) : [];
  const roles = collectNormalizedRoles(user);
  return (
    permissions.includes("*") ||
    permissions.includes("admin:*") ||
    roles.includes("admin") ||
    roles.includes("chairman") ||
    roles.includes("super admin") ||
    roles.includes("platform admin")
  );
}

function isJewellerPartnerUser(user: any): boolean {
  if (!user) return false;
  const permissions = Array.isArray(user?.permissions) ? user.permissions.map(String) : [];
  if (
    permissions.includes("*") ||
    permissions.includes("stamped_gold.partner") ||
    permissions.includes("stamped_gold:*")
  ) {
    return true;
  }
  const roles = collectNormalizedRoles(user);
  return (
    roles.includes("jeweller partner") ||
    roles.includes("jewelry partner") ||
    roles.includes("jewellery partner") ||
    roles.includes("jewelry manufacturer") ||
    roles.includes("jewellery manufacturer")
  );
}

function isExpertUser(user: any): boolean {
  if (!user) return false;
  const permissions = Array.isArray(user?.permissions) ? user.permissions.map(String) : [];
  if (
    permissions.includes("*") ||
    permissions.includes("stamped_gold.expert") ||
    permissions.includes("stamped_gold.certify") ||
    permissions.includes("stamped_gold:*")
  ) {
    return true;
  }
  const roles = collectNormalizedRoles(user);
  return roles.some((role) => role.includes("expert") || role.includes("assayer") || role.includes("laboratory"));
}

function getScopedUserFromRequest(req: any) {
  return req.adminUser ?? req.tenantUser ?? null;
}

function parseUserId(value: unknown): number | null {
  const parsed = toInt(value);
  if (!parsed || parsed <= 0) return null;
  return parsed;
}

async function resolvePartnerJewellerForUser(tenantId: number, userId: number): Promise<string | null> {
  const result = await db.execute(
    sql`
      select partner_jeweller_id::text as partner_jeweller_id
      from partner_jeweller_users
      where tenant_id = ${tenantId}
        and user_id = ${userId}
      order by id desc
      limit 1
    `,
  );
  const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
  const partnerJewellerId = String(row?.partner_jeweller_id || "").trim();
  return partnerJewellerId || null;
}

async function ensureOrderPaymentConfirmed(
  tenantId: number,
  orderId: number,
): Promise<{ ok: true; order: any } | { ok: false; reason: string }> {
  const hasPaymentStatus = await hasMarketplaceOrderPaymentStatusColumn();
  const result = hasPaymentStatus
    ? await db.execute(sql`
        select id, status, payment_status, paid_at, confirmed_at
        from marketplace_orders
        where tenant_id = ${tenantId}
          and id = ${orderId}
        limit 1
      `)
    : await db.execute(sql`
        select id, status, paid_at, confirmed_at
        from marketplace_orders
        where tenant_id = ${tenantId}
          and id = ${orderId}
        limit 1
      `);
  const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
  if (!row) return { ok: false, reason: "Order not found" };
  if (hasPaymentStatus) {
    const paymentStatus = normalizeStatus(row.payment_status);
    if (paymentStatus !== "CONFIRMED") {
      return { ok: false, reason: "Order payment_status must be CONFIRMED before production." };
    }
  } else {
    const status = normalizeStatus(row.status);
    const paidAt = row.paid_at ?? row.paidAt;
    if (!(status === "CONFIRMED" || Boolean(paidAt))) {
      return { ok: false, reason: "Order payment is not confirmed." };
    }
  }
  return { ok: true, order: row };
}

function isTransitionAllowed(previousStatus: string, nextStatus: string) {
  const previous = normalizeStatus(previousStatus) as StampedGoldStatus;
  const next = normalizeStatus(nextStatus) as StampedGoldStatus;
  const allowed = TRANSITION_RULES[previous] || [];
  return allowed.includes(next);
}

async function writeStatusAuditLog(args: {
  tenantId: number;
  itemId: string;
  previousStatus: string;
  newStatus: string;
  actorId: string | null;
  actorRole: string | null;
}) {
  await db.execute(sql`
    insert into audit_log (
      tenant_id,
      item_id,
      previous_status,
      new_status,
      actor_id,
      actor_role,
      created_at
    ) values (
      ${args.tenantId},
      ${args.itemId},
      ${normalizeStatus(args.previousStatus)},
      ${normalizeStatus(args.newStatus)},
      ${args.actorId},
      ${args.actorRole},
      now()
    )
  `);
}

function deriveActorRole(user: any) {
  const roles = collectNormalizedRoles(user);
  if (!roles.length) return null;
  return roles[0];
}

async function ensureQuoteExpiry(tenantId: number) {
  await db.execute(sql`
    update bar_quotes
    set status = 'EXPIRED'
    where tenant_id = ${tenantId}
      and status = 'ACTIVE'
      and valid_until < now()
  `);
}

async function generateAndStoreCertificate(args: {
  req: any;
  tenantId: number;
  itemId: string;
  orderId: number | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  pickupPartnerId: string | null;
  serial: string;
  qrToken: string;
  weightGrams: number;
  karat: number;
  expertUserId: number;
}) {
  const verifyUrl = `${getPublicBaseUrl(args.req)}/public/verify/${args.qrToken}`;
  const now = new Date();
  const pdfLines = [
    "Bourse de l'Or - Gold Certification",
    `Item: ${args.itemId}`,
    `Serial: ${args.serial}`,
    `Weight(g): ${args.weightGrams}`,
    `Karat: ${args.karat}`,
    `Expert ID: ${args.expertUserId}`,
    `Issued At: ${now.toISOString()}`,
    `Verify: ${verifyUrl}`,
  ];
  const pdfBuffer = createSimplePdfBuffer(pdfLines);
  const pdfHash = createHash("sha256").update(pdfBuffer).digest("hex");
  const certificatesDir = path.join(getAssetBasePath(), "stamped-gold-certificates", String(args.tenantId));
  await fs.mkdir(certificatesDir, { recursive: true });
  const fileName = `${args.serial}-${Date.now()}.pdf`.replace(/[^A-Za-z0-9._-]/g, "_");
  const absolutePath = path.join(certificatesDir, fileName);
  await fs.writeFile(absolutePath, pdfBuffer);
  const pdfUrl = `${getAssetPublicPath()}/stamped-gold-certificates/${args.tenantId}/${fileName}`;

  const result = await db.execute(sql`
    insert into stamped_gold_certificates (
      tenant_id,
      item_id,
      order_id,
      owner_user_id,
      owner_email,
      pickup_partner_id,
      serial,
      qr_link,
      sha256_hash,
      pdf_url,
      weight_g,
      karat,
      expert_user_id,
      issued_at
    ) values (
      ${args.tenantId},
      ${args.itemId},
      ${args.orderId},
      ${args.ownerUserId},
      ${args.ownerEmail},
      ${args.pickupPartnerId},
      ${args.serial},
      ${verifyUrl},
      ${pdfHash},
      ${pdfUrl},
      ${args.weightGrams},
      ${args.karat},
      ${args.expertUserId},
      ${now}
    )
    on conflict (item_id)
    do update set
      order_id = excluded.order_id,
      owner_user_id = excluded.owner_user_id,
      owner_email = excluded.owner_email,
      pickup_partner_id = excluded.pickup_partner_id,
      serial = excluded.serial,
      qr_link = excluded.qr_link,
      sha256_hash = excluded.sha256_hash,
      pdf_url = excluded.pdf_url,
      weight_g = excluded.weight_g,
      karat = excluded.karat,
      expert_user_id = excluded.expert_user_id,
      issued_at = excluded.issued_at
    returning id, item_id, qr_link, sha256_hash, pdf_url, issued_at
  `);
  const certificate = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
  if (certificate?.id) {
    await db.execute(sql`
      update stamped_gold_items
      set
        certificate_id = ${certificate.id},
        expert_user_id = ${args.expertUserId},
        updated_at = now()
      where tenant_id = ${args.tenantId}
        and id = ${args.itemId}
    `);
  }
  return certificate;
}

// Public: QR verification
router.get("/verify/:serial", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const scanInput = String(req.params.serial || "").trim();
    const normalizedLookup = scanInput.toUpperCase();
    if (!normalizedLookup) return res.status(400).json({ valid: false, message: "serial is required" });

    const [row] = await db
      .select({
        item: stampedGoldItems,
        sku: stampedGoldSkus,
        product: {
          id: sellerProducts.id,
          name: sellerProducts.name,
          status: sellerProducts.status,
        },
        order: {
          id: marketplaceOrders.id,
          orderNumber: marketplaceOrders.orderNumber,
          status: marketplaceOrders.status,
          buyerName: marketplaceOrders.buyerName,
          buyerEmail: marketplaceOrders.buyerEmail,
          buyerPhone: marketplaceOrders.buyerPhone,
          paidAt: marketplaceOrders.paidAt,
          deliveredAt: marketplaceOrders.deliveredAt,
        },
      })
      .from(stampedGoldItems)
      .leftJoin(stampedGoldSkus, eq(stampedGoldItems.skuId, stampedGoldSkus.id))
      .leftJoin(sellerProducts, eq(stampedGoldSkus.productId, sellerProducts.id))
      .leftJoin(marketplaceOrders, eq(stampedGoldItems.orderId, marketplaceOrders.id))
      .where(
        and(
          eq(stampedGoldItems.tenantId, tenant.id),
          sql`(
            upper(coalesce(${stampedGoldItems.serialCode}, '')) = ${normalizedLookup}
            or upper(coalesce(stamped_gold_items.serial, '')) = ${normalizedLookup}
            or stamped_gold_items.qr_token = ${scanInput}
          )`,
        ),
      )
      .limit(1);

    if (!row?.item?.id) {
      await db.insert(stampedGoldVerificationScans).values({
        tenantId: tenant.id,
        itemId: null,
        serialCode: normalizedLookup,
        scannedByUserId: null,
        scannerType: "PUBLIC",
        ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]?.trim() || null,
        userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
        createdAt: new Date(),
      });
      return res.status(404).json({ valid: false, serialCode: normalizedLookup, status: "INVALID" });
    }

    const item = row.item;
    const sku = row.sku;
    const product = row.product;
    const order = row.order?.id ? row.order : null;

    await db.insert(stampedGoldVerificationScans).values({
      tenantId: tenant.id,
      itemId: item.id,
      serialCode: item.serialCode || normalizedLookup,
      scannedByUserId: null,
      scannerType: "PUBLIC",
      ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]?.trim() || null,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
      createdAt: new Date(),
    });

    const owner =
      order && (item.status === "SOLD" || item.status === "DELIVERED")
        ? {
            name: order.buyerName ? String(order.buyerName).slice(0, 1) + "***" : null,
            email: order.buyerEmail ? maskEmail(String(order.buyerEmail)) : null,
            phone: order.buyerPhone ? maskPhone(String(order.buyerPhone)) : null,
          }
        : null;

    res.json({
      valid: true,
      serialCode: item.serialCode,
      status: item.status,
      sku: sku
        ? {
            skuCode: sku.skuCode,
            type: sku.stampedType,
            weightGrams: sku.weightGrams,
            purity: sku.purity,
            metal: sku.metal,
            brandText: sku.brandText,
            hallmarkText: sku.hallmarkText,
            year: sku.year,
            requiresLegalStamp: sku.requiresLegalStamp,
          }
        : null,
      product: product?.id ? product : null,
      location: {
        type: item.currentLocationType,
        partnerId: item.currentLocationId,
      },
      order: order
        ? {
            orderNumber: order.orderNumber,
            status: order.status,
            paidAt: order.paidAt,
            deliveredAt: order.deliveredAt,
          }
        : null,
      owner,
    });
  } catch (error: any) {
    console.error("[Stamped Gold] verify error:", error);
    res.status(500).json({ valid: false, message: "Verification failed" });
  }
});

// Public: active pickup partners for checkout
router.get("/jewellers/public", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const scope = { tenantId: Number(tenant.id), tenantKey: String(tenant.key || "") };
    const authorizedId = await resolveAuthorizedPartnerJewellerId(scope);
    const rows = await db
      .select({
        id: partnerJewellers.id,
        name: partnerJewellers.name,
        stockMode: partnerJewellers.stockMode,
        isActive: partnerJewellers.isActive,
        address: partnerJewellers.address,
        phone: partnerJewellers.phone,
      })
      .from(partnerJewellers)
      .where(
        and(
          eq(partnerJewellers.tenantId, tenant.id),
          eq(partnerJewellers.isActive, true),
          isBourseDeLorTenant(scope.tenantKey) ? (authorizedId ? eq(partnerJewellers.id, authorizedId as any) : sql`1=0`) : undefined,
        ),
      )
      .orderBy(asc(partnerJewellers.name));
    res.json({ jewellers: rows });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to load jewellers" });
  }
});

router.get("/skus", ensureTenantUser, async (req: any, res) => {
  try {
    const user = getScopedUserFromRequest(req);
    if (!user || (!isStampedGoldAdminUser(user) && !isJewellerPartnerUser(user))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const { tenantId } = await resolveTenantScope(req);

    const rows = await db
      .select({
        sku: stampedGoldSkus,
        product: {
          id: sellerProducts.id,
          name: sellerProducts.name,
          status: sellerProducts.status,
          price: sellerProducts.price,
          currency: sellerProducts.currency,
          weight: sellerProducts.weight,
          weightUnit: sellerProducts.weightUnit,
        },
        mintedTotal: sql<number>`count(${stampedGoldItems.id})`,
        inStock: sql<number>`sum(case when ${stampedGoldItems.status} in ('CREATED','ASSIGNED','ENGRAVED','SEALED','CERTIFIED','IN_VAULT','READY_PICKUP') then 1 else 0 end)`,
        reserved: sql<number>`sum(case when ${stampedGoldItems.status} = 'RESERVED' then 1 else 0 end)`,
        delivered: sql<number>`sum(case when ${stampedGoldItems.status} = 'DELIVERED' then 1 else 0 end)`,
      })
      .from(stampedGoldSkus)
      .leftJoin(sellerProducts, eq(stampedGoldSkus.productId, sellerProducts.id))
      .leftJoin(stampedGoldItems, eq(stampedGoldItems.skuId, stampedGoldSkus.id))
      .where(eq(stampedGoldSkus.tenantId, tenantId))
      .groupBy(stampedGoldSkus.id, sellerProducts.id)
      .orderBy(desc(stampedGoldSkus.createdAt));

    res.json({
      skus: rows.map((r) => ({
        ...r.sku,
        product: r.product?.id ? r.product : null,
        mintedTotal: Number(r.mintedTotal || 0),
        inStock: Number(r.inStock || 0),
        reserved: Number(r.reserved || 0),
        delivered: Number(r.delivered || 0),
        totalItems: Number(r.mintedTotal || 0), // backward-compatible alias
      })),
    });
  } catch (error: any) {
    console.error("[Stamped Gold] skus list error:", error);
    res.status(500).json({ message: "Failed to load SKUs" });
  }
});

router.post("/skus", ensureTenantAdmin, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const now = new Date();

    const productId = toInt(req.body?.productId);
    if (!productId) return res.status(400).json({ message: "productId is required" });

    const stampedType = String(req.body?.stampedType || "").trim().toUpperCase() as "COIN" | "BAR";
    if (stampedType !== "COIN" && stampedType !== "BAR") return res.status(400).json({ message: "stampedType must be COIN or BAR" });

    const weightGrams = toInt(req.body?.weightGrams);
    if (!weightGrams || weightGrams <= 0) return res.status(400).json({ message: "weightGrams is required" });

    validateStampedGoldSku({ type: stampedType, weightGrams });

    const purity = normalizePurityCode(req.body?.purity);
    if (!purity) return res.status(400).json({ message: "purity is required (e.g. 999.9)" });

    const metal = String(req.body?.metal || "FINE GOLD").trim() || "FINE GOLD";
    const brandText = String(req.body?.brandText || "BOURSE DE L'OR").trim() || "BOURSE DE L'OR";
    const hallmarkText = String(req.body?.hallmarkText || "").trim();
    if (!hallmarkText) return res.status(400).json({ message: "hallmarkText is required" });

    const serialPrefix = String(req.body?.serialPrefix || "").trim();
    if (!serialPrefix) return res.status(400).json({ message: "serialPrefix is required" });

    const year = toInt(req.body?.year) ?? new Date().getUTCFullYear();
    const skuCode = String(req.body?.skuCode || "").trim() || normalizeSkuCode({ type: stampedType, weightGrams, purity });

    const [productRow] = await db
      .select({ product: sellerProducts, category: productCategories })
      .from(sellerProducts)
      .leftJoin(productCategories, eq(sellerProducts.categoryId, productCategories.id))
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)))
      .limit(1);

    if (!productRow?.product) return res.status(404).json({ message: "Product not found" });
    if (String(productRow.category?.slug || "") !== "stamped") {
      return res.status(400).json({ message: "Product must be in the 'stamped' category" });
    }

    const existing = await db.query.stampedGoldSkus.findFirst({
      where: and(eq(stampedGoldSkus.tenantId, tenantId), eq(stampedGoldSkus.productId, productId)),
    });

    const payload = {
      tenantId,
      productId,
      stampedType,
      weightGrams,
      purity,
      metal,
      brandText,
      hallmarkText,
      serialPrefix,
      year,
      skuCode,
      requiresLegalStamp: true,
      isActive: req.body?.isActive == null ? true : Boolean(req.body.isActive),
      updatedAt: now,
    } as const;

    const sku = existing
      ? (
          await db
            .update(stampedGoldSkus)
            .set(payload)
            .where(eq(stampedGoldSkus.id, existing.id))
            .returning()
        )[0]
      : (
          await db
            .insert(stampedGoldSkus)
            .values({ ...payload, createdAt: now })
            .returning()
        )[0];

    res.status(201).json({ ok: true, sku });
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg === "invalid_coin_weight") return res.status(400).json({ message: "Invalid coin weight. Allowed: 1g, 2g, 5g, 10g, 20g (optional 1oz≈31g)." });
    if (msg === "invalid_bar_weight") return res.status(400).json({ message: "Invalid bar weight. Allowed: 5g, 10g, 20g, 50g, 100g, 250g, 500g, 1kg." });
    console.error("[Stamped Gold] sku upsert error:", error);
    res.status(500).json({ message: "Failed to save SKU" });
  }
});

router.post("/items/mint", ensureTenantAdmin, async (req: any, res) => {
  try {
    const scope = await resolveTenantScope(req);
    const { tenantId } = scope;
    const now = new Date();
    const admin = (req as any).adminUser;
    const mintedBy = admin?.id ? `admin:${admin.id}` : null;

    const skuId = toUuid(req.body?.skuId);
    if (!skuId) return res.status(400).json({ message: "skuId is required" });

    const orderId = toInt(req.body?.order_id ?? req.body?.orderId) ?? null;
    if (orderId) {
      const paymentGate = await ensureOrderPaymentConfirmed(tenantId, orderId);
      if (!paymentGate.ok) {
        return processBlocked(res, "reason" in paymentGate ? paymentGate.reason : "Order payment validation failed.");
      }
    }

    const qty = toInt(req.body?.quantity) ?? 0;
    if (qty <= 0 || qty > 2000) return res.status(400).json({ message: "quantity must be between 1 and 2000" });

    const locationType = String(req.body?.locationType || "VAULT").trim().toUpperCase();
    const locationId = toUuid(req.body?.locationId);

    if (locationType === "JEWELLER_PARTNER" && !locationId) {
      return res.status(400).json({ message: "locationId is required when locationType is JEWELLER_PARTNER" });
    }

    if (locationType === "JEWELLER_PARTNER" && locationId) {
      const authorizedId = await resolveAuthorizedPartnerJewellerId(scope);
      const authorizedCheck = ensureAuthorizedPartnerJeweller(res, scope, locationId, authorizedId);
      if (!authorizedCheck.ok) return authorizedCheck.response;
    }

    const skuLookup = await db.execute(sql`
      select
        s.id,
        s.serial_prefix,
        s.stamped_type,
        s.weight_grams,
        s.year,
        coalesce(s.is_active, true) as is_active,
        p.status as product_status
      from stamped_gold_skus s
      left join seller_products p on p.id = s.product_id
      where s.tenant_id = ${tenantId}
        and s.id = ${skuId}
      limit 1
    `);
    const sku = Array.isArray((skuLookup as any)?.rows) ? (skuLookup as any).rows[0] : null;
    if (!sku?.id) return res.status(404).json({ message: "SKU not found" });
    if (!Boolean(sku.is_active)) {
      return processBlocked(res, "Inactive SKU cannot be minted.");
    }
    if (String(sku.product_status || "").trim().toLowerCase() !== "active") {
      return processBlocked(res, "SKU product is inactive; mint blocked.");
    }

    if (locationType === "JEWELLER_PARTNER") {
      const partner = await db.query.partnerJewellers.findFirst({
        where: and(eq(partnerJewellers.id, locationId as any), eq(partnerJewellers.tenantId, tenantId), eq(partnerJewellers.isActive, true)),
      });
      if (!partner) return res.status(400).json({ message: "Invalid partner jeweller" });
    }

    const created: any[] = [];
    for (let i = 0; i < qty; i++) {
      let attempt = 0;
      while (attempt < 5) {
        attempt += 1;
        const serial = buildSerialCode({
          serialPrefix: String(sku.serial_prefix || "BDO"),
          year: sku.year ?? new Date().getUTCFullYear(),
          type: String(sku.stamped_type || "BAR").toUpperCase() as "COIN" | "BAR",
          weightGrams: Number(sku.weight_grams || 0),
        });
        try {
          const [row] = await db
            .insert(stampedGoldItems)
            .values({
              tenantId,
              skuId: sku.id,
              serialCode: serial,
              status: "CREATED",
              currentLocationType: locationType === "JEWELLER_PARTNER" ? "JEWELLER_PARTNER" : "VAULT",
              currentLocationId: locationType === "JEWELLER_PARTNER" ? (locationId as any) : null,
              mintedAt: now,
              mintedBy,
              orderId: orderId ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          if (locationType === "JEWELLER_PARTNER" && locationId) {
            await db.execute(sql`
              update stamped_gold_items
              set partner_jeweller_id = ${locationId}
              where tenant_id = ${tenantId}
                and id = ${row.id}
            `);
          }
          await db.execute(sql`
            update stamped_gold_items
            set
              serial = coalesce(serial, ${serial}),
              qr_token = coalesce(
                nullif(qr_token, ''),
                substr(md5(${serial} || random()::text || clock_timestamp()::text), 1, 32)
              )
            where tenant_id = ${tenantId}
              and id = ${row.id}
          `);
          created.push(row);
          break;
        } catch (err: any) {
          const message = String(err?.message || "");
          if (message.includes("duplicate") || message.includes("unique")) continue;
          throw err;
        }
      }
    }

    res.status(201).json({ ok: true, minted: created.length, items: created });
  } catch (error: any) {
    console.error("[Stamped Gold] mint error:", error);
    res.status(500).json({ message: "Failed to mint items" });
  }
});

router.post("/items/generate", ensureTenantAdmin, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const skuId = toUuid(req.body?.sku_id ?? req.body?.skuId);
    const count = Math.min(500, Math.max(1, toInt(req.body?.count ?? req.body?.n ?? req.body?.quantity) ?? 1));
    const prefixOverride = String(req.body?.prefix || req.body?.serial_prefix || "").trim();
    const orderId = toInt(req.body?.order_id ?? req.body?.orderId) ?? null;

    if (!skuId) return res.status(400).json({ message: "sku_id (or skuId) is required" });
    if (orderId) {
      const paymentGate = await ensureOrderPaymentConfirmed(tenantId, orderId);
      if (!paymentGate.ok) {
        return processBlocked(res, "reason" in paymentGate ? paymentGate.reason : "Order payment validation failed.");
      }
    }

    const skuLookup = await db.execute(sql`
      select
        s.id,
        s.serial_prefix,
        s.stamped_type,
        s.weight_grams,
        s.year,
        coalesce(s.is_active, true) as is_active,
        p.status as product_status
      from stamped_gold_skus s
      left join seller_products p on p.id = s.product_id
      where s.tenant_id = ${tenantId}
        and s.id = ${skuId}
      limit 1
    `);
    const sku = Array.isArray((skuLookup as any)?.rows) ? (skuLookup as any).rows[0] : null;
    if (!sku?.id) return res.status(404).json({ message: "SKU not found" });
    if (!Boolean(sku.is_active)) {
      return processBlocked(res, "Inactive SKU cannot be minted.");
    }
    if (String(sku.product_status || "").trim().toLowerCase() !== "active") {
      return processBlocked(res, "SKU product is inactive; mint blocked.");
    }

    const prefix = prefixOverride || String(sku.serial_prefix || "BDO");
    const year = Number(sku.year || new Date().getUTCFullYear());
    const createdRows: any[] = [];

    for (let i = 0; i < count; i++) {
      let inserted = false;
      for (let attempt = 0; attempt < 7 && !inserted; attempt++) {
        const serial = buildSerialCode({
          serialPrefix: prefix,
          year,
          type: String(sku.stamped_type || "BAR").toUpperCase() as "COIN" | "BAR",
          weightGrams: Number(sku.weight_grams || 0),
        });
        const qrToken = nanoid(32).replace(/[^a-zA-Z0-9]/g, "a").slice(0, 32);
        try {
          const result = await db.execute(sql`
            insert into stamped_gold_items (
              tenant_id,
              sku_id,
              serial_code,
              serial,
              status,
              current_location_type,
              qr_token,
              order_id,
              minted_at,
              minted_by,
              created_at,
              updated_at
            ) values (
              ${tenantId},
              ${sku.id},
              ${serial},
              ${serial},
              'CREATED',
              'VAULT',
              ${qrToken},
              ${orderId as any},
              now(),
              ${req.adminUser?.id ? `admin:${req.adminUser.id}` : null},
              now(),
              now()
            )
            returning id, tenant_id, sku_id, serial_code, serial, status, qr_token, minted_at, created_at
          `);
          const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
          if (row) createdRows.push(row);
          inserted = true;
        } catch (error: any) {
          const message = String(error?.message || "");
          if (!message.includes("duplicate") && !message.includes("unique")) {
            throw error;
          }
        }
      }
    }

    res.status(201).json({ ok: true, created: createdRows, count: createdRows.length });
  } catch (error: any) {
    console.error("[Stamped Gold] generate items error:", error);
    res.status(500).json({ message: "Failed to generate items" });
  }
});

router.post("/items/:id/assign", ensureTenantAdmin, async (req: any, res) => {
  try {
    const scope = await resolveTenantScope(req);
    const { tenantId } = scope;
    const actor = getScopedUserFromRequest(req);
    const itemId = toUuid(req.params.id);
    const partnerJewellerId = toUuid(req.body?.partner_jeweller_id ?? req.body?.partnerJewellerId);

    if (!itemId) return res.status(400).json({ message: "Invalid item id" });
    if (!partnerJewellerId) return res.status(400).json({ message: "partner_jeweller_id (or partnerJewellerId) is required" });

    const authorizedId = await resolveAuthorizedPartnerJewellerId(scope);
    const authorizedCheck = ensureAuthorizedPartnerJeweller(res, scope, partnerJewellerId, authorizedId);
    if (!authorizedCheck.ok) return authorizedCheck.response;

    const partner = await db.query.partnerJewellers.findFirst({
      where: and(
        eq(partnerJewellers.id, partnerJewellerId as any),
        eq(partnerJewellers.tenantId, tenantId),
        eq(partnerJewellers.isActive, true),
      ),
    });
    if (!partner) return res.status(404).json({ message: "Partner jeweller not found" });

    const itemLookup = await db.execute(sql`
      select id, status, order_id, serial_code
      from stamped_gold_items
      where tenant_id = ${tenantId}
        and id = ${itemId}
      limit 1
    `);
    const item = Array.isArray((itemLookup as any)?.rows) ? (itemLookup as any).rows[0] : null;
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (normalizeStatus(item.status) === "OPENED_VOID") {
      return processBlocked(res, "Seal is void. No further state change is allowed.");
    }
    if (!item.order_id) {
      return processBlocked(res, "Item is not linked to an order. Assignment is blocked.");
    }
    const paymentGate = await ensureOrderPaymentConfirmed(tenantId, Number(item.order_id));
    if (!paymentGate.ok) {
      return processBlocked(res, "reason" in paymentGate ? paymentGate.reason : "Order payment validation failed.");
    }
    if (!isTransitionAllowed(item.status, "ASSIGNED")) {
      return processBlocked(res, `Invalid transition ${item.status} -> ASSIGNED.`);
    }

    const result = await db.execute(sql`
      update stamped_gold_items
      set
        partner_jeweller_id = ${partnerJewellerId},
        current_location_type = 'JEWELLER_PARTNER',
        current_location_id = ${partnerJewellerId},
        status = 'ASSIGNED',
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${itemId}
      returning id, tenant_id, sku_id, serial_code, status, partner_jeweller_id, current_location_type, updated_at
    `);
    const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    if (!row) return res.status(404).json({ message: "Item not found" });
    await writeStatusAuditLog({
      tenantId,
      itemId,
      previousStatus: item.status,
      newStatus: "ASSIGNED",
      actorId: actor?.id ? String(actor.id) : null,
      actorRole: deriveActorRole(actor),
    });
    res.json({ ok: true, item: row });
  } catch (error: any) {
    console.error("[Stamped Gold] assign item error:", error);
    res.status(500).json({ message: "Failed to assign item" });
  }
});

router.post("/items/:id/status", ensureTenantUser, async (req: any, res) => {
  try {
    const user = getScopedUserFromRequest(req);
    const isAdmin = isStampedGoldAdminUser(user);
    const isPartner = isJewellerPartnerUser(user);
    const isExpert = isExpertUser(user);
    if (!user || (!isAdmin && !isPartner && !isExpert)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const scope = await resolveTenantScope(req);
    const { tenantId } = scope;
    const itemId = toUuid(req.params.id);
    const nextStatus = String(req.body?.status || "").trim().toUpperCase();
    if (!itemId) return res.status(400).json({ message: "Invalid item id" });

    const allowedStatuses = new Set([
      "IN_STOCK",
      "RESERVED",
      "SOLD",
      "DELIVERED",
      "VOID",
      "CREATED",
      "ASSIGNED",
      "ENGRAVED",
      "SEALED",
      "CERTIFIED",
      "IN_VAULT",
      "READY_PICKUP",
      "OPENED_VOID",
    ]);
    if (!allowedStatuses.has(nextStatus)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    let partnerJewellerId: string | null = null;
    if (!isAdmin) {
      const userId = parseUserId(user?.id);
      if (!userId) return res.status(403).json({ message: "Invalid account binding" });
      if (isPartner) {
        partnerJewellerId = await resolvePartnerJewellerForUser(tenantId, userId);
        if (!partnerJewellerId) return res.status(403).json({ message: "No partner jeweller assignment for this account" });
      }
    }

    if (isPartner && partnerJewellerId) {
      const authorizedId = await resolveAuthorizedPartnerJewellerId(scope);
      const authorizedCheck = ensureAuthorizedPartnerJeweller(res, scope, partnerJewellerId, authorizedId);
      if (!authorizedCheck.ok) return authorizedCheck.response;
    }

    const lookup = await db.execute(sql`
      select
        i.id,
        i.status,
        i.partner_jeweller_id,
        i.current_location_id,
        i.current_location_type,
        i.order_id,
        i.owner_user_id,
        i.owner_email,
        i.serial,
        i.serial_code,
        i.qr_token,
        i.sku_id,
        s.weight_grams,
        s.karat
      from stamped_gold_items i
      left join stamped_gold_skus s on s.id = i.sku_id
      where i.tenant_id = ${tenantId}
        and i.id = ${itemId}
      limit 1
    `);
    const item = Array.isArray((lookup as any)?.rows) ? (lookup as any).rows[0] : null;
    if (!item) {
      return res.status(404).json({ message: "Item not found or not assigned to this partner" });
    }

    const currentStatus = normalizeStatus(item.status);
    const isOpenedVoidTransition = nextStatus === "OPENED_VOID";
    if (currentStatus === "OPENED_VOID") {
      return processBlocked(res, "Seal is void. No further state change is allowed.");
    }
    if (!isOpenedVoidTransition && !isTransitionAllowed(currentStatus, nextStatus)) {
      return invalidTransition(res, currentStatus, nextStatus);
    }

    const transitionKey = `${currentStatus}->${nextStatus}`;
    const userId = parseUserId(user?.id);

    if (isOpenedVoidTransition) {
      if (!isAdmin && !isExpert) {
        return processBlocked(res, "OPENED_VOID is restricted to ADMIN or EXPERT role.", 403);
      }
      const reason = String(req.body?.reason || req.body?.void_reason || "").trim();
      if (!reason) {
        return processBlocked(res, "OPENED_VOID requires a non-empty reason.");
      }
    }

    if (isPartner) {
      const assignmentId = String(item.partner_jeweller_id || item.current_location_id || "").trim();
      if (!assignmentId || !partnerJewellerId || assignmentId !== partnerJewellerId) {
        return processBlocked(res, "Partner can only update items assigned to their jeweller account.", 403);
      }
      if (!PARTNER_TRANSITIONS.has(transitionKey)) {
        return processBlocked(res, `Partner role cannot perform transition ${transitionKey}.`, 403);
      }
    }

    if ((CERTIFY_TRANSITIONS.has(transitionKey) || POST_CERTIFY_TRANSITIONS.has(transitionKey)) && !isAdmin && !isExpert) {
      return processBlocked(res, `${transitionKey} is restricted to ADMIN or EXPERT role.`, 403);
    }

    if (nextStatus === "ASSIGNED") {
      if (item.order_id) {
        const paymentGate = await ensureOrderPaymentConfirmed(tenantId, Number(item.order_id));
        if (!paymentGate.ok) {
          return processBlocked(res, "reason" in paymentGate ? paymentGate.reason : "Order payment validation failed.");
        }
      }
    }

    let certificate: any = null;
    let vaultOwnerUserId: number | null = null;
    if (nextStatus === "CERTIFIED") {
      const weightGrams = Number(item.weight_grams || 0);
      const karat = Number(item.karat || 0);
      const serial = String(item.serial || item.serial_code || "").trim();
      const qrToken = String(item.qr_token || "").trim();
      const expertUserId = toInt(req.body?.expert_id ?? req.body?.expertId) ?? userId;
      if (!weightGrams || !karat || !serial || !qrToken || !expertUserId) {
        return processBlocked(res, "Certificate generation requires weight, karat, serial, qr token, and expert_id.");
      }
      certificate = await generateAndStoreCertificate({
        req,
        tenantId,
        itemId,
        orderId: item.order_id ? Number(item.order_id) : null,
        ownerUserId: item.owner_user_id ? String(item.owner_user_id) : null,
        ownerEmail: item.owner_email ? String(item.owner_email) : null,
        pickupPartnerId: item.partner_jeweller_id ? String(item.partner_jeweller_id) : null,
        serial,
        qrToken,
        weightGrams,
        karat,
        expertUserId,
      });
    }
    if (nextStatus === "IN_VAULT") {
      vaultOwnerUserId =
        toInt(req.body?.owner_user_id ?? req.body?.ownerUserId) ??
        toInt(item.owner_user_id) ??
        userId;
      if (!vaultOwnerUserId) {
        return processBlocked(res, "owner_user_id is required when moving item to vault.");
      }
    }

    const result = await db.execute(sql`
      update stamped_gold_items
      set
        status = ${nextStatus}::stamped_gold_item_status,
        updated_at = now(),
        current_location_type = case
          when ${nextStatus}::text = 'IN_VAULT' then 'VAULT'::stamped_gold_location_type
          when ${nextStatus}::text = 'READY_PICKUP' then 'JEWELLER_PARTNER'::stamped_gold_location_type
          when ${nextStatus}::text = 'DELIVERED' then 'DELIVERED'::stamped_gold_location_type
          else current_location_type
        end,
        delivered_at = case
          when ${nextStatus}::text = 'DELIVERED' then now()
          else delivered_at
        end,
        voided_at = case
          when ${nextStatus}::text = 'OPENED_VOID' then now()
          else voided_at
        end
      where tenant_id = ${tenantId}
        and id = ${itemId}
        ${partnerJewellerId
          ? sql`and coalesce(partner_jeweller_id, current_location_id) = ${partnerJewellerId}`
          : sql``}
      returning id, tenant_id, sku_id, serial_code, status, current_location_type, delivered_at, updated_at
    `);
    const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    if (!row) return res.status(404).json({ message: "Item not found or not assigned to this partner" });

    if (nextStatus === "IN_VAULT") {
      await db.execute(sql`
        insert into vault_storage (tenant_id, item_id, owner_user_id, stored_at, notes)
        values (${tenantId}, ${itemId}, ${vaultOwnerUserId as any}, now(), ${req.body?.notes ? String(req.body.notes) : null})
      `);
    }
    if (nextStatus === "DELIVERED") {
      await db.execute(sql`
        update vault_storage
        set released_at = now()
        where tenant_id = ${tenantId}
          and item_id = ${itemId}
          and released_at is null
      `);
    }

    await writeStatusAuditLog({
      tenantId,
      itemId,
      previousStatus: currentStatus,
      newStatus: nextStatus,
      actorId: user?.id ? String(user.id) : null,
      actorRole: deriveActorRole(user),
    });

    res.json({ ok: true, item: row, certificate });
  } catch (error: any) {
    console.error("[Stamped Gold] status update error:", error);
    res.status(500).json({ message: "Failed to update item status" });
  }
});

router.get("/items", ensureTenantUser, async (req: any, res) => {
  try {
    const user = getScopedUserFromRequest(req);
    const isAdmin = isStampedGoldAdminUser(user);
    const isPartner = isJewellerPartnerUser(user);
    if (!user || (!isAdmin && !isPartner)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const scope = await resolveTenantScope(req);
    const { tenantId } = scope;
    const limit = Math.min(200, Math.max(1, toInt(req.query.limit) ?? 50));
    const offset = Math.max(0, toInt(req.query.offset) ?? 0);

    const skuId = toUuid(req.query.skuId);
    const status = String(req.query.status || "").trim().toUpperCase();
    const q = String(req.query.q || "").trim();
    const userId = parseUserId(user?.id);

    const partnerJewellerId =
      !isAdmin && isPartner && userId
        ? await resolvePartnerJewellerForUser(tenantId, userId)
        : null;

    if (!isAdmin && isPartner && !partnerJewellerId) {
      return res.status(403).json({ message: "No partner jeweller assignment for this account" });
    }

    if (!isAdmin && isPartner && partnerJewellerId) {
      const authorizedId = await resolveAuthorizedPartnerJewellerId(scope);
      const authorizedCheck = ensureAuthorizedPartnerJeweller(res, scope, partnerJewellerId, authorizedId);
      if (!authorizedCheck.ok) return authorizedCheck.response;
    }

    const where = and(
      eq(stampedGoldItems.tenantId, tenantId),
      partnerJewellerId
        ? sql`coalesce(${sql.raw("stamped_gold_items.partner_jeweller_id")}, ${stampedGoldItems.currentLocationId}) = ${partnerJewellerId}`
        : undefined,
      skuId ? eq(stampedGoldItems.skuId, skuId as any) : undefined,
      status ? eq(stampedGoldItems.status, status as any) : undefined,
      q ? ilike(stampedGoldItems.serialCode, `%${q}%`) : undefined,
    );

    const rows = await db
      .select({
        item: stampedGoldItems,
        sku: stampedGoldSkus,
        product: {
          id: sellerProducts.id,
          name: sellerProducts.name,
        },
        partner: {
          id: partnerJewellers.id,
          name: partnerJewellers.name,
        },
      })
      .from(stampedGoldItems)
      .leftJoin(stampedGoldSkus, eq(stampedGoldItems.skuId, stampedGoldSkus.id))
      .leftJoin(sellerProducts, eq(stampedGoldSkus.productId, sellerProducts.id))
      .leftJoin(partnerJewellers, eq(stampedGoldItems.currentLocationId, partnerJewellers.id))
      .where(where)
      .orderBy(desc(stampedGoldItems.mintedAt), asc(stampedGoldItems.serialCode))
      .limit(limit)
      .offset(offset);

    res.json({
      items: rows.map((r) => ({
        ...r.item,
        sku: r.sku?.id ? r.sku : null,
        product: r.product?.id ? r.product : null,
        partner: r.partner?.id ? r.partner : null,
      })),
    });
  } catch (error: any) {
    console.error("[Stamped Gold] items list error:", error);
    res.status(500).json({ message: "Failed to load items" });
  }
});

router.get("/jewellers", ensureTenantUser, async (req: any, res) => {
  try {
    const user = getScopedUserFromRequest(req);
    if (!user || (!isStampedGoldAdminUser(user) && !isJewellerPartnerUser(user))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const scope = await resolveTenantScope(req);
    const { tenantId } = scope;
    const authorizedId = await resolveAuthorizedPartnerJewellerId(scope);
    const rows = await db
      .select()
      .from(partnerJewellers)
      .where(
        and(
          eq(partnerJewellers.tenantId, tenantId),
          eq(partnerJewellers.isActive, true),
          isBourseDeLorTenant(scope.tenantKey) ? (authorizedId ? eq(partnerJewellers.id, authorizedId as any) : sql`1=0`) : undefined,
        ),
      )
      .orderBy(asc(partnerJewellers.name));
    res.json({ jewellers: rows });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to load jewellers" });
  }
});

router.post("/jewellers/from-contact", ensureTenantAdmin, async (req: any, res) => {
  try {
    const scope = await resolveTenantScope(req);
    const { tenantId } = scope;
    const contactId = toInt(req.body?.contact_id ?? req.body?.contactId);
    if (!contactId) return res.status(400).json({ message: "contact_id is required" });

    const result = await db.execute(sql`
      select
        c.id,
        c.company,
        c.display_name,
        c.given_name,
        c.family_name,
        c.primary_phone_e164,
        c.phone
      from tenant_contacts tc
      join contacts c on c.id = tc.contact_id
      where tc.tenant_id = ${tenantId}
        and tc.contact_id = ${contactId}
      limit 1
    `);
    const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    if (!row) return res.status(404).json({ message: "Contact not found in this tenant" });

    const displayName =
      String(row.company || "").trim() ||
      String(row.display_name || "").trim() ||
      `${String(row.given_name || "").trim()} ${String(row.family_name || "").trim()}`.trim();
    if (!displayName) return res.status(400).json({ message: "Contact has no usable name/company" });

    const phone = String(row.primary_phone_e164 || row.phone || "").trim() || null;
    const now = new Date();

    const existing = await db.execute(sql`
      select id::text as id
      from partner_jewellers
      where tenant_id = ${tenantId}
        and lower(name) = lower(${displayName})
      limit 1
    `);
    const existingRow = Array.isArray((existing as any)?.rows) ? (existing as any).rows[0] : null;
    const existingId = String(existingRow?.id || "").trim();

    if (existingId) {
      const [updated] = await db
        .update(partnerJewellers)
        .set({ phone, isActive: true, updatedAt: now } as any)
        .where(and(eq(partnerJewellers.tenantId, tenantId), eq(partnerJewellers.id, existingId as any)))
        .returning();
      return res.json({ ok: true, jeweller: updated, upsert: "updated" });
    }

    const [created] = await db
      .insert(partnerJewellers)
      .values({
        tenantId,
        name: displayName,
        phone,
        address: null,
        latitude: null,
        longitude: null,
        stockMode: "JUST_IN_TIME",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, jeweller: created, upsert: "created" });
  } catch (error: any) {
    console.error("[Stamped Gold] jeweller from contact error:", error);
    res.status(500).json({ message: "Failed to create jeweller from contact" });
  }
});

router.post("/jewellers", ensureTenantAdmin, async (req: any, res) => {
  try {
    const scope = await resolveTenantScope(req);
    const { tenantId } = scope;
    if (isBourseDeLorTenant(scope.tenantKey)) {
      return res.status(403).json({
        message: "Partner jewellers must be created from existing Contacts for this tenant. Use POST /api/stamped-gold/jewellers/from-contact.",
      });
    }
    const now = new Date();
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "name is required" });

    const stockMode = String(req.body?.stockMode || "JUST_IN_TIME").trim().toUpperCase();
    if (stockMode !== "STOCKED" && stockMode !== "JUST_IN_TIME") {
      return res.status(400).json({ message: "stockMode must be STOCKED or JUST_IN_TIME" });
    }

    const [row] = await db
      .insert(partnerJewellers)
      .values({
        tenantId,
        name,
        address: req.body?.address ? String(req.body.address) : null,
        phone: req.body?.phone ? String(req.body.phone) : null,
        latitude: req.body?.latitude ? String(req.body.latitude) : null,
        longitude: req.body?.longitude ? String(req.body.longitude) : null,
        stockMode,
        isActive: req.body?.isActive == null ? true : Boolean(req.body.isActive),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    res.status(201).json({ ok: true, jeweller: row });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to create jeweller" });
  }
});

router.get("/scans", ensureTenantAdmin, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const limit = Math.min(200, Math.max(1, toInt(req.query.limit) ?? 50));
    const offset = Math.max(0, toInt(req.query.offset) ?? 0);
    const q = String(req.query.q || "").trim();

    const rows = await db
      .select({
        scan: stampedGoldVerificationScans,
        item: { id: stampedGoldItems.id, status: stampedGoldItems.status },
        sku: { id: stampedGoldSkus.id, skuCode: stampedGoldSkus.skuCode, stampedType: stampedGoldSkus.stampedType, weightGrams: stampedGoldSkus.weightGrams },
      })
      .from(stampedGoldVerificationScans)
      .leftJoin(stampedGoldItems, eq(stampedGoldVerificationScans.itemId, stampedGoldItems.id))
      .leftJoin(stampedGoldSkus, eq(stampedGoldItems.skuId, stampedGoldSkus.id))
      .where(and(eq(stampedGoldVerificationScans.tenantId, tenantId), q ? ilike(stampedGoldVerificationScans.serialCode, `%${q}%`) : undefined))
      .orderBy(desc(stampedGoldVerificationScans.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      scans: rows.map((r) => ({
        ...r.scan,
        item: r.item?.id ? r.item : null,
        sku: r.sku?.id ? r.sku : null,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to load scans" });
  }
});

router.post("/certificates/rebuild", ensureTenantAdmin, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const ids: string[] = (Array.isArray(req.body?.itemIds) ? req.body.itemIds : [])
      .map((value: unknown) => toUuid(value))
      .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
    if (!ids.length) return res.status(400).json({ message: "itemIds is required" });
    const expertUserId = toInt(req.body?.expert_id ?? req.body?.expertId) ?? parseUserId(req.adminUser?.id);
    if (!expertUserId) {
      return processBlocked(res, "expert_id is required for certificate generation.");
    }

    const rows = await db.execute(sql`
      select
        i.id,
        i.order_id,
        i.owner_user_id,
        i.owner_email,
        i.partner_jeweller_id,
        i.serial,
        i.serial_code,
        i.qr_token,
        s.weight_grams,
        s.karat
      from stamped_gold_items i
      left join stamped_gold_skus s on s.id = i.sku_id
      where i.tenant_id = ${tenantId}
        and i.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `);
    const items = Array.isArray((rows as any)?.rows) ? (rows as any).rows : [];
    const failures: Array<{ itemId: string; reason: string }> = [];
    const rebuilt: any[] = [];
    for (const item of items) {
      const serial = String(item.serial || item.serial_code || "").trim();
      const qrToken = String(item.qr_token || "").trim();
      const weightGrams = Number(item.weight_grams || 0);
      const karat = Number(item.karat || 0);
      if (!serial || !qrToken || !weightGrams || !karat) {
        failures.push({
          itemId: String(item.id),
          reason: "Missing required certificate fields (serial, qr token, weight, karat).",
        });
        continue;
      }
      const certificate = await generateAndStoreCertificate({
        req,
        tenantId,
        itemId: String(item.id),
        orderId: item.order_id ? Number(item.order_id) : null,
        ownerUserId: item.owner_user_id ? String(item.owner_user_id) : null,
        ownerEmail: item.owner_email ? String(item.owner_email) : null,
        pickupPartnerId: item.partner_jeweller_id ? String(item.partner_jeweller_id) : null,
        serial,
        qrToken,
        weightGrams,
        karat,
        expertUserId,
      });
      if (certificate) rebuilt.push(certificate);
    }

    if (!rebuilt.length && failures.length) {
      return processBlocked(res, "Certificate generation blocked by missing required fields.", 400, {
        failures,
      });
    }
    res.json({ ok: true, rebuilt: rebuilt.length, certificates: rebuilt, failures });
  } catch (error: any) {
    console.error("[Stamped Gold] certificates rebuild error:", error);
    res.status(500).json({ message: "Failed to rebuild certificates" });
  }
});

router.post("/price-ticks", ensureTenantAdmin, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const xauUsd = Number(req.body?.xau_usd ?? req.body?.xauUsd);
    const usdXof = Number(req.body?.usd_xof ?? req.body?.usdXof);
    const source = String(req.body?.source || "XAUUSD").trim() || "XAUUSD";

    if (!Number.isFinite(xauUsd) || xauUsd <= 0) return res.status(400).json({ message: "xau_usd must be > 0" });
    if (!Number.isFinite(usdXof) || usdXof <= 0) return res.status(400).json({ message: "usd_xof must be > 0" });

    const result = await db.execute(sql`
      insert into gold_price_ticks (tenant_id, source, xau_usd, usd_xof, created_at)
      values (${tenantId}, ${source}, ${xauUsd}, ${usdXof}, now())
      returning id, tenant_id, source, xau_usd, usd_xof, created_at
    `);
    const tick = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    res.status(201).json({ ok: true, tick });
  } catch (error: any) {
    console.error("[Stamped Gold] price tick insert error:", error);
    res.status(500).json({ message: "Failed to save price tick" });
  }
});

router.post("/quote/bar", ensureTenantUser, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const user = getScopedUserFromRequest(req);
    const userId = parseUserId(user?.id);
    const skuId = toUuid(req.body?.sku_id ?? req.body?.skuId);
    if (!userId) return res.status(401).json({ message: "Authenticated user required" });
    if (!skuId) return res.status(400).json({ message: "sku_id (or skuId) is required" });

    const skuResult = await db.execute(sql`
      select
        s.id,
        s.weight_grams,
        coalesce(s.karat, 24) as karat,
        p.status as product_status
      from stamped_gold_skus s
      left join seller_products p on p.id = s.product_id
      where s.tenant_id = ${tenantId}
        and s.id = ${skuId}
        and coalesce(s.is_active, true) = true
      limit 1
    `);
    const sku = Array.isArray((skuResult as any)?.rows) ? (skuResult as any).rows[0] : null;
    if (!sku) return res.status(404).json({ message: "SKU not found" });
    if (String(sku.product_status || "").trim().toLowerCase() !== "active") {
      return processBlocked(res, "SKU product is inactive; order quoting blocked.");
    }

    let tickResult = await db.execute(sql`
      select xau_usd, usd_xof, source, created_at
      from gold_price_ticks
      where tenant_id = ${tenantId}
      order by created_at desc
      limit 1
    `);
    let tick = Array.isArray((tickResult as any)?.rows) ? (tickResult as any).rows[0] : null;
    if (!tick) {
      const fallbackXauUsd = Number(process.env.STAMPED_GOLD_FALLBACK_XAU_USD || 2900);
      const fallbackUsdXof = Number(process.env.STAMPED_GOLD_FALLBACK_USD_XOF || 610);
      const inserted = await db.execute(sql`
        insert into gold_price_ticks (tenant_id, source, xau_usd, usd_xof, created_at)
        values (${tenantId}, 'XAUUSD', ${fallbackXauUsd}, ${fallbackUsdXof}, now())
        returning xau_usd, usd_xof, source, created_at
      `);
      tick = Array.isArray((inserted as any)?.rows) ? (inserted as any).rows[0] : null;
    }
    if (!tick) return res.status(503).json({ message: "No market tick available" });

    const weightGrams = Number(sku.weight_grams || 0);
    const karat = Number(sku.karat || 24);
    const xauUsd = Number(tick.xau_usd);
    const usdXof = Number(tick.usd_xof);
    const ozToGram = 31.1034768;
    const karatFactor = karat >= 24 ? 1 : Math.max(0.5, Math.min(1, karat / 24));
    const spreadPerGramXof = Number(process.env.STAMPED_GOLD_SPREAD_PER_G_XOF || 1500);
    const fixedFeeXof = Number(process.env.STAMPED_GOLD_FIXED_FEE_XOF || 25000);
    const lockMinutes = 10;

    await ensureQuoteExpiry(tenantId);

    const baseXofPerGram24k = (xauUsd / ozToGram) * usdXof;
    const baseXofPerGram = baseXofPerGram24k * karatFactor;
    const pricePerGramXof = baseXofPerGram + spreadPerGramXof;
    const totalXof = pricePerGramXof * weightGrams + fixedFeeXof;
    const validUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    const breakdown = {
      source: tick.source,
      tickCreatedAt: tick.created_at,
      xau_usd: xauUsd,
      usd_xof: usdXof,
      base_xof_per_gram_24k: Number(baseXofPerGram24k.toFixed(2)),
      karat,
      karat_factor: Number(karatFactor.toFixed(4)),
      spread_per_gram_xof: spreadPerGramXof,
      fixed_fee_xof: fixedFeeXof,
      weight_grams: weightGrams,
    };

    const quoteResult = await db.execute(sql`
      insert into bar_quotes (
        tenant_id,
        user_id,
        sku_id,
        price_per_g_xof,
        total_xof,
        breakdown,
        valid_until,
        status,
        created_at
      ) values (
        ${tenantId},
        ${userId},
        ${sku.id},
        ${Number(pricePerGramXof.toFixed(2))},
        ${Number(totalXof.toFixed(2))},
        ${JSON.stringify(breakdown)}::jsonb,
        ${validUntil},
        'ACTIVE',
        now()
      )
      returning id, tenant_id, user_id, sku_id, price_per_g_xof, total_xof, breakdown, valid_until, status, created_at
    `);
    const quote = Array.isArray((quoteResult as any)?.rows) ? (quoteResult as any).rows[0] : null;
    res.status(201).json({ ok: true, quote });
  } catch (error: any) {
    console.error("[Stamped Gold] quote error:", error);
    res.status(500).json({ message: "Failed to create quote" });
  }
});

router.post("/quotes/expire", ensureTenantAdmin, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    await ensureQuoteExpiry(tenantId);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("[Stamped Gold] quote expiry error:", error);
    res.status(500).json({ message: "Failed to expire quotes" });
  }
});

router.post("/orders/place", ensureTenantUser, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const user = getScopedUserFromRequest(req);
    const userId = parseUserId(user?.id);
    if (!userId) return res.status(401).json({ message: "Authenticated user required" });

    const quoteId = toInt(req.body?.quote_id ?? req.body?.quoteId);
    const sellerId = toInt(req.body?.seller_id ?? req.body?.sellerId);
    const quantity = Math.max(1, toInt(req.body?.quantity) ?? 1);
    const buyerName = req.body?.buyer_name ? String(req.body.buyer_name) : null;
    const buyerPhone = req.body?.buyer_phone ? String(req.body.buyer_phone) : null;
    const buyerEmail = req.body?.buyer_email ? String(req.body.buyer_email) : null;
    if (!quoteId) return processBlocked(res, "quote_id is required to place order.");
    if (!sellerId) return processBlocked(res, "seller_id is required to place order.");

    await ensureQuoteExpiry(tenantId);

    const quoteResult = await db.execute(sql`
      select q.id, q.sku_id, q.price_per_g_xof, q.total_xof, q.breakdown, q.valid_until, q.status, q.user_id
      from bar_quotes q
      where q.tenant_id = ${tenantId}
        and q.id = ${quoteId}
      limit 1
    `);
    const quote = Array.isArray((quoteResult as any)?.rows) ? (quoteResult as any).rows[0] : null;
    if (!quote) return processBlocked(res, "Quote not found.");
    if (Number(quote.user_id) !== userId) {
      return processBlocked(res, "Quote ownership mismatch.", 403);
    }
    if (String(quote.status) !== "ACTIVE") {
      return processBlocked(res, "Quote is not active.");
    }
    if (new Date(String(quote.valid_until)).getTime() <= Date.now()) {
      return processBlocked(res, "Quote expired.");
    }

    const skuResult = await db.execute(sql`
      select
        s.id,
        s.product_id,
        coalesce(s.is_active, true) as is_active,
        p.name as product_name,
        p.status as product_status
      from stamped_gold_skus s
      left join seller_products p on p.id = s.product_id
      where s.tenant_id = ${tenantId}
        and s.id = ${quote.sku_id}
      limit 1
    `);
    const sku = Array.isArray((skuResult as any)?.rows) ? (skuResult as any).rows[0] : null;
    if (!sku?.id || !sku?.product_id) {
      return processBlocked(res, "SKU must be linked to a product before order placement.");
    }
    if (!Boolean(sku.is_active)) {
      return processBlocked(res, "Inactive SKU cannot be ordered.");
    }
    if (String(sku.product_status || "").trim().toLowerCase() !== "active") {
      return processBlocked(res, "SKU product is inactive; order blocked.");
    }

    const orderNumber = `SG-${Date.now()}-${nanoid(6).toUpperCase()}`;
    const unitTotal = Number(quote.total_xof || 0);
    const subtotal = Number((unitTotal * quantity).toFixed(2));
    const pricingBreakdown = {
      ...(quote.breakdown || {}),
      quote_id: quote.id,
      quote_valid_until: quote.valid_until,
      quantity,
      unit_total_xof: unitTotal,
      subtotal_xof: subtotal,
    };

    const orderResult = await db.execute(sql`
      insert into marketplace_orders (
        tenant_id,
        order_number,
        buyer_user_id,
        buyer_name,
        buyer_phone,
        buyer_email,
        seller_id,
        subtotal,
        total,
        status,
        paid_at,
        confirmed_at,
        quote_id,
        pricing_breakdown,
        created_at,
        updated_at
      ) values (
        ${tenantId},
        ${orderNumber},
        ${userId},
        ${buyerName},
        ${buyerPhone},
        ${buyerEmail},
        ${sellerId},
        ${subtotal},
        ${subtotal},
        'confirmed',
        now(),
        now(),
        ${quote.id},
        ${JSON.stringify(pricingBreakdown)}::jsonb,
        now(),
        now()
      )
      returning id, order_number, tenant_id, status, quote_id, pricing_breakdown, created_at
    `);
    const order = Array.isArray((orderResult as any)?.rows) ? (orderResult as any).rows[0] : null;
    if (!order?.id) {
      return res.status(500).json({ message: "Failed to create order" });
    }

    await db.execute(sql`
      insert into marketplace_order_items (
        tenant_id,
        order_id,
        product_id,
        product_name,
        quantity,
        unit_price,
        subtotal,
        created_at
      ) values (
        ${tenantId},
        ${order.id},
        ${sku.product_id},
        ${sku.product_name || "Stamped Gold"},
        ${quantity},
        ${Number(quote.price_per_g_xof || 0)},
        ${subtotal},
        now()
      )
    `);

    await db.execute(sql`
      update bar_quotes
      set status = 'USED'
      where tenant_id = ${tenantId}
        and id = ${quote.id}
    `);

    res.status(201).json({ ok: true, order });
  } catch (error: any) {
    console.error("[Stamped Gold] order placement error:", error);
    res.status(500).json({ message: "Failed to place order with quote" });
  }
});

router.post("/vault/store", ensureTenantAdmin, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const actor = getScopedUserFromRequest(req);
    const itemId = toUuid(req.body?.item_id ?? req.body?.itemId);
    const ownerUserId = toInt(req.body?.owner_user_id ?? req.body?.ownerUserId);
    const notes = req.body?.notes ? String(req.body.notes) : null;
    if (!itemId) return res.status(400).json({ message: "item_id (or itemId) is required" });
    if (!ownerUserId) return processBlocked(res, "owner_user_id (or ownerUserId) is required");

    const itemLookup = await db.execute(sql`
      select id, status
      from stamped_gold_items
      where tenant_id = ${tenantId}
        and id = ${itemId}
      limit 1
    `);
    const item = Array.isArray((itemLookup as any)?.rows) ? (itemLookup as any).rows[0] : null;
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (normalizeStatus(item.status) === "OPENED_VOID") {
      return processBlocked(res, "Seal is void. No further state change is allowed.");
    }
    if (!isTransitionAllowed(item.status, "IN_VAULT")) {
      return invalidTransition(res, normalizeStatus(item.status), "IN_VAULT");
    }

    await db.execute(sql`
      insert into vault_storage (tenant_id, item_id, owner_user_id, stored_at, notes)
      values (${tenantId}, ${itemId}, ${ownerUserId}, now(), ${notes})
    `);
    await db.execute(sql`
      update stamped_gold_items
      set
        status = 'IN_VAULT',
        current_location_type = 'VAULT',
        current_location_id = null,
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${itemId}
    `);
    await writeStatusAuditLog({
      tenantId,
      itemId,
      previousStatus: item.status,
      newStatus: "IN_VAULT",
      actorId: actor?.id ? String(actor.id) : null,
      actorRole: deriveActorRole(actor),
    });
    res.json({ ok: true });
  } catch (error: any) {
    console.error("[Stamped Gold] vault store error:", error);
    res.status(500).json({ message: "Failed to move item to vault" });
  }
});

router.post("/vault/release", ensureTenantAdmin, async (req: any, res) => {
  try {
    const { tenantId } = await resolveTenantScope(req);
    const actor = getScopedUserFromRequest(req);
    const itemId = toUuid(req.body?.item_id ?? req.body?.itemId);
    if (!itemId) return res.status(400).json({ message: "item_id (or itemId) is required" });

    const itemLookup = await db.execute(sql`
      select id, status
      from stamped_gold_items
      where tenant_id = ${tenantId}
        and id = ${itemId}
      limit 1
    `);
    const item = Array.isArray((itemLookup as any)?.rows) ? (itemLookup as any).rows[0] : null;
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!isTransitionAllowed(item.status, "DELIVERED")) {
      return invalidTransition(res, normalizeStatus(item.status), "DELIVERED");
    }

    await db.execute(sql`
      update vault_storage
      set released_at = now()
      where tenant_id = ${tenantId}
        and item_id = ${itemId}
        and released_at is null
    `);
    await db.execute(sql`
      update stamped_gold_items
      set
        status = 'DELIVERED',
        current_location_type = 'DELIVERED',
        delivered_at = now(),
        updated_at = now()
      where tenant_id = ${tenantId}
        and id = ${itemId}
    `);
    await writeStatusAuditLog({
      tenantId,
      itemId,
      previousStatus: item.status,
      newStatus: "DELIVERED",
      actorId: actor?.id ? String(actor.id) : null,
      actorRole: deriveActorRole(actor),
    });
    res.json({ ok: true });
  } catch (error: any) {
    console.error("[Stamped Gold] vault release error:", error);
    res.status(500).json({ message: "Failed to release item from vault" });
  }
});

router.get("/verify/token/:qrToken", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const token = String(req.params.qrToken || "").trim();
    if (!token) return res.status(400).json({ valid: false, message: "qrToken is required" });
    const normalized = token.toUpperCase();

    const result = await db.execute(sql`
      select
        i.id,
        i.serial_code,
        i.status,
        i.current_location_type,
        s.sku_code,
        s.stamped_type,
        s.weight_grams,
        s.purity,
        s.karat,
        s.metal
      from stamped_gold_items i
      left join stamped_gold_skus s on s.id = i.sku_id
      where i.tenant_id = ${tenant.id}
        and (
          i.qr_token = ${token}
          or upper(coalesce(i.serial_code, '')) = ${normalized}
          or upper(coalesce(i.serial, '')) = ${normalized}
        )
      limit 1
    `);
    const item = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    if (!item) return res.status(404).json({ valid: false, message: "Not found" });

    res.json({
      valid: true,
      item: {
        id: item.id,
        serialCode: item.serial_code,
        status: item.status,
        currentLocationType: item.current_location_type,
      },
      sku: item.sku_code
        ? {
            skuCode: item.sku_code,
            stampedType: item.stamped_type,
            weightGrams: Number(item.weight_grams || 0),
            purity: item.purity,
            karat: item.karat,
            metal: item.metal,
          }
        : null,
    });
  } catch (error: any) {
    console.error("[Stamped Gold] verify token error:", error);
    res.status(500).json({ valid: false, message: "Verification failed" });
  }
});

router.get("/public/verify/:qrToken", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const token = String(req.params.qrToken || "").trim();
    if (!token) return res.status(400).json({ valid: false, message: "qrToken is required" });
    const normalized = token.toUpperCase();

    const result = await db.execute(sql`
      select
        i.id,
        i.serial_code,
        i.status,
        i.current_location_type,
        c.pdf_url,
        c.sha256_hash,
        c.qr_link,
        c.issued_at,
        s.sku_code,
        s.stamped_type,
        s.weight_grams,
        s.purity,
        s.karat,
        s.metal
      from stamped_gold_items i
      left join stamped_gold_skus s on s.id = i.sku_id
      left join stamped_gold_certificates c on c.item_id = i.id
      where i.tenant_id = ${tenant.id}
        and (
          i.qr_token = ${token}
          or upper(coalesce(i.serial_code, '')) = ${normalized}
          or upper(coalesce(i.serial, '')) = ${normalized}
        )
      limit 1
    `);
    const item = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    if (!item) return res.status(404).json({ valid: false, message: "Not found" });

    res.json({
      valid: true,
      item: {
        id: item.id,
        serialCode: item.serial_code,
        status: item.status,
        currentLocationType: item.current_location_type,
      },
      certificate: item.pdf_url
        ? {
            pdfUrl: item.pdf_url,
            sha256Hash: item.sha256_hash,
            qrLink: item.qr_link,
            issuedAt: item.issued_at,
          }
        : null,
      sku: item.sku_code
        ? {
            skuCode: item.sku_code,
            stampedType: item.stamped_type,
            weightGrams: Number(item.weight_grams || 0),
            purity: item.purity,
            karat: item.karat,
            metal: item.metal,
          }
        : null,
    });
  } catch (error: any) {
    console.error("[Stamped Gold] public verify error:", error);
    res.status(500).json({ valid: false, message: "Verification failed" });
  }
});

export default router;
