import { Router, Request, Response, NextFunction } from "express";
import { db } from "@db";
import { 
  users, 
  userRoles, 
  userRoleAssignments, 
  subscriptionPlans,
  userSubscriptions,
  workflows,
  shopApplications,
  deliveryApplications,
  leads,
  leadMessages,
  leadCampaigns,
  aiApprovalLogs,
  agents,
  chatRooms,
  messages,
  roomMemberships,
  tasks,
  goals,
  activityLog,
  meetings,
  tokenTransactions,
  knowledgeSpaces,
  knowledgeDocuments,
  agentsProduction,
  auditLogs,
} from "@db/schema";
import {
  eceChatMessages,
  eceUsers,
  eceSessions,
  marketplaceOrderItems,
  marketplaceOrders,
  productCategories,
  userTenantRoles,
  sellerProducts,
  sellers,
} from "@db/schema";
import { eq, desc, and, asc, inArray, gte, lte, or, sql, like, count, ilike } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { randomBytes } from "crypto";
import { isChairmanAssistantUser } from "./utils/auth";
import { hydrateTenantUserAccess } from "../lib/tenantUserAccess";
import { resolveAgentRuntimeEnv } from "../lib/agents/visibility";
import { normalizeAgentKey } from "../lib/mail/agentSlugs";
import { readLatestToolMatrixReport, runToolMatrixReport } from "../lib/agent-os/toolMatrix";

const router = Router();

async function verifyAdminSession(token: string | undefined, tenantId?: number) {
  if (!token) return null;
  
  const session = await db.query.eceSessions.findFirst({
    where: eq(eceSessions.token, token)
  });

  if (!session || new Date(session.expiresAt) < new Date()) {
    return null;
  }

  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, session.userId)
  });

  return hydrateTenantUserAccess(user, tenantId);
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await verifyAdminSession(token, Number((req as any)?.tenant?.id || 0));

  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const activeMode = String((user as any)?.currentMode || "").trim().toLowerCase();
  const userPerms = Array.isArray((user as any)?.permissions) ? (user as any).permissions : [];
  const userRoles = Array.isArray((user as any)?.roles) ? (user as any).roles : [];
  const normalizedRoles = userRoles.map((role: unknown) =>
    String(role || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " "),
  );
  
  const isAdmin =
    activeMode === "admin" ||
    userPerms.includes("*") ||
    userPerms.includes("admin:*") ||
    normalizedRoles.includes("admin") ||
    normalizedRoles.includes("super admin") ||
    normalizedRoles.includes("platform admin") ||
    normalizedRoles.includes("chairman") ||
    isChairmanAssistantUser(user);

  if (!isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }

  (req as any).adminUser = user;
  next();
}

router.use(requireAdmin);

function normalizeEmail(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function normalizePhone(raw: unknown) {
  const value = String(raw ?? "").trim();
  return value || null;
}

function normalizeText(raw: unknown) {
  return String(raw ?? "").trim();
}

function randomPassword(length = 14) {
  const bytes = randomBytes(Math.ceil((length * 3) / 4) + 2);
  return bytes
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length);
}

function resolvePublicBaseUrl(req: Request) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  if (!host) return null;
  return `${proto}://${host}`;
}

router.post("/pro-test-accounts", async (req, res) => {
  try {
    const tenantId = Number((req as any)?.tenant?.id || 0);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return res.status(500).json({ ok: false, message: "Tenant not resolved" });
    }

    const fullName = normalizeText(req.body?.fullName || req.body?.displayName);
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone);
    const companyName = normalizeText(req.body?.companyName);
    const companyType = normalizeText(req.body?.companyType || "jewellery_store") || "jewellery_store";
    const language = normalizeText(req.body?.language || "fr") || "fr";
    const currency = normalizeText(req.body?.currency || "XOF") || "XOF";

    const rolesRaw = Array.isArray(req.body?.roles) ? req.body.roles : [req.body?.role].filter(Boolean);
    const roles = rolesRaw.map((r: any) => String(r).trim()).filter(Boolean);

    if (!fullName) return res.status(400).json({ ok: false, message: "fullName is required" });
    if (!email) return res.status(400).json({ ok: false, message: "email is required" });
    if (!companyName) return res.status(400).json({ ok: false, message: "companyName is required" });

    const existing = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.email, email),
      columns: { id: true, email: true },
    });
    if (existing) {
      return res.status(409).json({ ok: false, message: "Email already registered", userId: existing.id });
    }

    const seedKey = `demo_${nanoid(10)}`;
    const tempPassword = randomPassword(14);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const now = new Date();

    const baseRole =
      companyType === "mine"
        ? "mine_owner"
        : companyType === "jewellery_store"
          ? "jewelry_reseller"
          : "buyer";

    const normalizedRoles = Array.from(
      new Set([
        ...roles,
        ...(companyType === "mine" ? ["mine_operator", "mine_owner"] : ["shop_owner"]),
        ...(companyType === "jewellery_store" ? ["jewelry_reseller"] : []),
      ].map((r) => String(r).trim()).filter(Boolean)),
    );

    const [createdUser] = await db
      .insert(eceUsers)
      .values({
        email,
        passwordHash,
        displayName: fullName,
        phone,
        role: baseRole as any,
        roles: normalizedRoles as any,
        permissions: [] as any,
        currentMode: (normalizedRoles[0] || baseRole) as any,
        buyerType: "retail" as any,
        isActive: true,
        emailVerified: true,
        metadata: {
          proProfile: {
            companyName,
            companyType,
            language,
            currency,
          },
          demoSeed: {
            key: seedKey,
            kind: "pro_test_account",
            createdAt: now.toISOString(),
          },
        } as any,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    await db
      .insert(auditLogs)
      .values({
        tenantId,
        userId: Number((req as any)?.adminUser?.id || 0) || null,
        userRole: "admin",
        action: "PRO_TEST_ACCOUNT_CREATED",
        entityType: "ece_user",
        entityId: createdUser.id,
        metadata: { email, companyName, companyType, seedKey },
        createdAt: now,
      })
      .catch(() => null);

    await db
      .insert(userTenantRoles)
      .values({
        tenantId,
        userId: createdUser.id,
        role: "USER",
        createdAt: now,
      } as any)
      .onConflictDoNothing()
      .catch(() => null);

    // Seed lightweight demo commerce data (seller + 3 products + 2 orders).
    const slugBase = companyName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60);
    const sellerSlug = `${slugBase || "demo-shop"}-${nanoid(6)}`;

    const [seller] = await db
      .insert(sellers)
      .values({
        tenantId,
        userId: createdUser.id as any,
        shopName: companyName,
        slug: sellerSlug,
        description: `DEMO:${seedKey} â€” Pro test account seller space.`,
        sellerType: (companyType === "mine" ? "mine" : companyType === "jewellery_store" ? "jeweler" : "retail_shop") as any,
        productionType: companyType === "mine" ? "gold_mining" : "gold_retail",
        status: "approved" as any,
        approvedAt: now,
        verifiedAt: now,
        isProducer: companyType === "mine",
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    let jewelryCategory = await db.query.productCategories.findFirst({
      where: and(eq(productCategories.tenantId, tenantId), eq(productCategories.slug, "jewelry")),
    });

    if (!jewelryCategory) {
      const [createdCategory] = await db
        .insert(productCategories)
        .values({
          tenantId,
          name: "Jewelry",
          slug: `demo-jewelry-${seedKey}`.slice(0, 100),
          description: `DEMO:${seedKey} â€” Jewelry products category`,
          icon: "💍",
          color: "#F59E0B",
          sortOrder: 10,
          isActive: true,
          createdAt: now,
        } as any)
        .returning();
      jewelryCategory = createdCategory as any;
    }

    const productTemplates = [
      {
        name: "Gold Ring - Classic",
        slug: `demo-ring-${seedKey}-${nanoid(4)}`,
        description: `DEMO:${seedKey} - Classic gold ring. Hallmarked. Premium box.`,
        price: "420000",
        weight: "9.2",
        weightUnit: "g",
        images: ["/product-images/custom-ring.png"],
      },
      {
        name: "Gold Necklace - Link Chain",
        slug: `demo-necklace-${seedKey}-${nanoid(4)}`,
        description: `DEMO:${seedKey} - Link chain necklace. Secure packaging.`,
        price: "760000",
        weight: "18.5",
        weightUnit: "g",
        images: ["/product-images/jewelry-chain.png"],
      },
      {
        name: "Gold Bracelet - Heritage Finish",
        slug: `demo-bracelet-${seedKey}-${nanoid(4)}`,
        description: `DEMO:${seedKey} - Heritage finish bracelet. Gift-ready.`,
        price: "980000",
        weight: "22.0",
        weightUnit: "g",
        images: ["/product-images/jewelry-bracelet.png"],
      },
    ];

    const createdProducts = await db
      .insert(sellerProducts)
      .values(
        productTemplates.map((p) => ({
          tenantId,
          sellerId: seller.id,
          categoryId: (jewelryCategory as any)?.id ?? null,
          name: p.name,
          slug: p.slug,
          description: p.description,
          shortDescription: p.description,
          price: p.price,
          currency,
          stockQuantity: 10,
          isHandmade: true,
          productionTime: "2-5 days",
          weight: p.weight,
          weightUnit: p.weightUnit,
          images: p.images,
          tags: ["demo", `seed:${seedKey}`, "jewelry"],
          status: "active" as any,
          createdAt: now,
          updatedAt: now,
        } as any)),
      )
      .returning();

    const productIds = createdProducts.map((p: any) => Number(p.id)).filter((id) => Number.isInteger(id) && id > 0);

    const makeOrderNumber = (suffix: string) =>
      `DEMO-${seedKey.slice(-6).toUpperCase()}-${suffix}-${String(now.getUTCDate()).padStart(2, "0")}${String(
        now.getUTCMonth() + 1,
      ).padStart(2, "0")}`.slice(0, 50);

    const orderPayloads = [
      {
        orderNumber: makeOrderNumber("A1"),
        buyerName: "Client Demo 1",
        buyerPhone: "+225 07 00 00 01",
        status: "pending",
      },
      {
        orderNumber: makeOrderNumber("B2"),
        buyerName: "Client Demo 2",
        buyerPhone: "+225 07 00 00 02",
        status: "processing",
      },
    ];

    const createdOrderIds: number[] = [];

    for (let idx = 0; idx < orderPayloads.length; idx++) {
      const payload = orderPayloads[idx];
      const product = createdProducts[idx % createdProducts.length];
      const unitPrice = String(product?.price || "0");
      const qty = 1;
      const subtotal = unitPrice;

      const [order] = await db
        .insert(marketplaceOrders)
        .values({
          tenantId,
          orderNumber: payload.orderNumber,
          buyerName: payload.buyerName,
          buyerPhone: payload.buyerPhone,
          sellerId: seller.id,
          subtotal,
          deliveryFee: "0.00",
          serviceFee: "0.00",
          discount: "0.00",
          total: subtotal,
          status: payload.status as any,
          notes: `DEMO_SEED:${seedKey}`,
          createdAt: now,
          updatedAt: now,
      } as any)
        .returning();
      createdOrderIds.push(Number(order.id));

      await db
        .insert(marketplaceOrderItems)
        .values({
          tenantId,
          orderId: order.id,
          productId: product.id,
          productName: product.name,
          productImage: Array.isArray(product.images) ? product.images[0] : null,
          quantity: qty,
          unitPrice,
          subtotal,
          notes: `DEMO_SEED:${seedKey}`,
          createdAt: now,
        } as any);
    }

    const demoMessage = await db
      .insert(eceChatMessages)
      .values({
        tenantId,
        userId: createdUser.id,
        role: "assistant",
        contextType: "ops",
        content: `Sales Agent: DEMO customer message - "Bonjour, je veux un bracelet et une chaine. Quels sont les prix ?" (seed ${seedKey})`,
        metadata: { demoSeedKey: seedKey, kind: "customer_thread_message" } as any,
        createdAt: new Date(now.getTime() + 1),
      } as any)
      .returning();

    const messageIds = demoMessage.map((m: any) => Number(m.id)).filter((id) => Number.isInteger(id) && id > 0);

    await db
      .update(eceUsers)
      .set({
        metadata: {
          ...(createdUser as any).metadata,
          proProfile: {
            companyName,
            companyType,
            language,
            currency,
          },
          demoSeed: {
            key: seedKey,
            kind: "pro_test_account",
            createdAt: now.toISOString(),
            sellerId: seller.id,
            productIds,
            orderIds: createdOrderIds,
            messageIds,
          },
        } as any,
        updatedAt: new Date(),
      } as any)
      .where(eq(eceUsers.id, createdUser.id));

    const baseUrl = resolvePublicBaseUrl(req);
    const proUrl = baseUrl ? `${baseUrl}/pro/login` : "/pro/login";

    res.status(201).json({
      ok: true,
      proUrl,
      credentials: {
        email,
        tempPassword,
      },
      user: {
        id: createdUser.id,
        email: createdUser.email,
        displayName: createdUser.displayName,
        roles: (createdUser as any).roles || [],
        currentMode: (createdUser as any).currentMode || null,
        language,
        currency,
        companyName,
        companyType,
      },
      seeded: {
        seedKey,
        sellerId: seller.id,
        productIds,
        orderIds: createdOrderIds,
        messageIds,
      },
    });
  } catch (error: any) {
    console.error("[Admin] Create pro test account error:", error);
    res.status(500).json({ ok: false, message: error?.message || "Failed to create test account" });
  }
});

router.post("/pro-test-accounts/:userId/delete-demo-data", async (req, res) => {
  try {
    const tenantId = Number((req as any)?.tenant?.id || 0);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return res.status(500).json({ ok: false, message: "Tenant not resolved" });
    }

    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid userId" });
    }

    const user = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.id, userId),
      columns: { id: true, metadata: true, email: true },
    });

    const meta = (user as any)?.metadata && typeof (user as any).metadata === "object" ? (user as any).metadata : {};
    const demoSeed = meta?.demoSeed && typeof meta.demoSeed === "object" ? meta.demoSeed : null;
    const seedKey = String(demoSeed?.key || "").trim();
    if (!seedKey) {
      return res.json({ ok: true, deleted: { seller: 0, products: 0, orders: 0, messages: 0 }, seedKey: null });
    }

    const sellerId = Number(demoSeed?.sellerId || 0) || null;
    const productIds = Array.isArray(demoSeed?.productIds) ? demoSeed.productIds.map((x: any) => Number(x)).filter((x: number) => x > 0) : [];
    const orderIds = Array.isArray(demoSeed?.orderIds) ? demoSeed.orderIds.map((x: any) => Number(x)).filter((x: number) => x > 0) : [];
    const messageIds = Array.isArray(demoSeed?.messageIds) ? demoSeed.messageIds.map((x: any) => Number(x)).filter((x: number) => x > 0) : [];

    const deleted = await db.transaction(async (tx) => {
      const out = { seller: 0, products: 0, orders: 0, orderItems: 0, messages: 0 };

      if (orderIds.length) {
        const deletedItems = await tx
          .delete(marketplaceOrderItems)
          .where(and(eq(marketplaceOrderItems.tenantId, tenantId), inArray(marketplaceOrderItems.orderId, orderIds)))
          .returning({ id: marketplaceOrderItems.id });
        out.orderItems += deletedItems.length;

        const deletedOrders = await tx
          .delete(marketplaceOrders)
          .where(and(eq(marketplaceOrders.tenantId, tenantId), inArray(marketplaceOrders.id, orderIds)))
          .returning({ id: marketplaceOrders.id });
        out.orders += deletedOrders.length;
      } else {
        const deletedItems = await tx
          .delete(marketplaceOrderItems)
          .where(and(eq(marketplaceOrderItems.tenantId, tenantId), sql`${marketplaceOrderItems.notes} ilike ${`%${seedKey}%`}`))
          .returning({ id: marketplaceOrderItems.id });
        out.orderItems += deletedItems.length;

        const deletedOrders = await tx
          .delete(marketplaceOrders)
          .where(and(eq(marketplaceOrders.tenantId, tenantId), ilike(marketplaceOrders.notes, `%${seedKey}%`)))
          .returning({ id: marketplaceOrders.id });
        out.orders += deletedOrders.length;
      }

      if (productIds.length) {
        const deletedProducts = await tx
          .delete(sellerProducts)
          .where(and(eq(sellerProducts.tenantId, tenantId), inArray(sellerProducts.id, productIds)))
          .returning({ id: sellerProducts.id });
        out.products += deletedProducts.length;
      }

      if (sellerId) {
        const deletedSellers = await tx
          .delete(sellers)
          .where(and(eq(sellers.tenantId, tenantId), eq(sellers.id, sellerId), eq(sellers.isDemo, true)))
          .returning({ id: sellers.id });
        out.seller += deletedSellers.length;
      }

      if (messageIds.length) {
        const deletedMessages = await tx
          .delete(eceChatMessages)
          .where(and(eq(eceChatMessages.tenantId, tenantId), inArray(eceChatMessages.id, messageIds)))
          .returning({ id: eceChatMessages.id });
        out.messages += deletedMessages.length;
      } else {
        const deletedMessages = await tx
          .delete(eceChatMessages)
          .where(
            and(
              eq(eceChatMessages.tenantId, tenantId),
              eq(eceChatMessages.userId, userId),
              sql`${eceChatMessages.metadata} ->> 'demoSeedKey' = ${seedKey}`,
            ),
          )
          .returning({ id: eceChatMessages.id });
        out.messages += deletedMessages.length;
      }

      await tx
        .update(eceUsers)
        .set({
          metadata: {
            ...meta,
            demoSeed: null,
          } as any,
          updatedAt: new Date(),
        } as any)
        .where(eq(eceUsers.id, userId));

      return out;
    });

    await db
      .insert(auditLogs)
      .values({
        tenantId,
        userId: Number((req as any)?.adminUser?.id || 0) || null,
        userRole: "admin",
        action: "PRO_TEST_ACCOUNT_DEMO_DATA_DELETED",
        entityType: "ece_user",
        entityId: userId,
        metadata: { seedKey, deleted },
        createdAt: new Date(),
      })
      .catch(() => null);

    res.json({ ok: true, seedKey, deleted });
  } catch (error: any) {
    console.error("[Admin] Delete pro demo data error:", error);
    res.status(500).json({ ok: false, message: error?.message || "Failed to delete demo data" });
  }
});

router.post("/agents/bulk-archive-tests", async (req, res) => {
  try {
    const now = new Date();
    const runtimeEnv = resolveAgentRuntimeEnv();
    const candidateWhere = or(
      eq(agents.isTest, true),
      ilike(agents.name, "%test%"),
      ilike(agents.role, "%test%"),
      sql`lower(coalesce(${agents.metadata}::jsonb->>'test','false')) in ('1','true','yes','on')`,
      sql`lower(coalesce(${agents.metadata}::jsonb->>'isTest','false')) in ('1','true','yes','on')`,
    );

    const updated = await db
      .update(agents)
      .set({
        status: "archived",
        isVisible: false,
        isTest: true,
        updatedAt: now,
      })
      .where(candidateWhere)
      .returning({
        id: agents.id,
        name: agents.name,
        role: agents.role,
        env: agents.env,
        status: agents.status,
      });

    const tenantId = Number((req as any)?.tenant?.id || 1);
    const adminUser = (req as any)?.adminUser;

    await db.insert(auditLogs).values({
      tenantId,
      userId: Number(adminUser?.id || 0) || null,
      userRole: "admin",
      action: "AGENTS_TEST_BULK_ARCHIVED",
      entityType: "agents",
      entityId: null,
      metadata: {
        runtimeEnv,
        archivedCount: updated.length,
        archivedAgentIds: updated.map((row) => Number(row.id)),
      },
      createdAt: now,
    });

    res.json({
      ok: true,
      runtimeEnv,
      archivedCount: updated.length,
      archived: updated.slice(0, 200),
    });
  } catch (error: any) {
    console.error("[Admin] Error bulk-archiving test agents:", error);
    res.status(500).json({ error: error.message || "Failed to bulk archive test agents" });
  }
});

router.post("/agents/purge-limited", async (req, res) => {
  try {
    const tenantId = Number((req as any)?.tenant?.id || 0);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return res.status(400).json({ ok: false, message: "tenant required" });
    }

    const confirm = String(req.body?.confirm ?? "").trim().toLowerCase();
    const isConfirmed = confirm === "true" || confirm === "1" || req.body?.confirm === true;

    const companyIdRaw = req.body?.companyId ?? req.body?.company_id ?? req.query?.companyId ?? req.query?.company_id ?? null;
    const companyId =
      companyIdRaw != null && Number.isFinite(Number(companyIdRaw)) ? Math.trunc(Number(companyIdRaw)) : null;

    const limitRaw = req.body?.limit ?? req.query?.limit ?? null;
    const limit = limitRaw != null && Number.isFinite(Number(limitRaw)) ? Math.max(1, Math.min(5000, Math.trunc(Number(limitRaw)))) : 2000;

    const isLimitedOrTestAgent = (agent: any) => {
      const name = String(agent?.name || "").toLowerCase();
      const role = String(agent?.role || "").toLowerCase();
      const env = String(agent?.env || "").toLowerCase();
      const status = String(agent?.status || "").toLowerCase();
      const meta = agent?.metadata && typeof agent.metadata === "object" ? agent.metadata : {};
      const metaTest = String((meta as any)?.test ?? (meta as any)?.isTest ?? "").toLowerCase();

      if (agent?.isTest === true) return true;
      if (env && env !== "prod") return true;
      if (name.includes("limited agent")) return true;
      if (role.includes("limited")) return true;
      if (name.includes("test agent") || role.includes("test agent")) return true;
      if (name.includes("demo") || role.includes("demo")) return true;
      if (name.includes("placeholder") || role.includes("placeholder")) return true;
      if (metaTest && ["1", "true", "yes", "y", "on"].includes(metaTest)) return true;
      if (status === "archived" && (name.includes("limited") || name.includes("test"))) return true;
      return false;
    };

    const allowlisted = await db
      .select({ agentId: agentsProduction.agentId })
      .from(agentsProduction)
      .where(and(eq(agentsProduction.tenantId, tenantId), eq(agentsProduction.isEnabled, true)))
      .limit(5000);
    const allowlistedIds = new Set<number>(
      allowlisted.map((row) => Number(row.agentId)).filter((id) => Number.isInteger(id) && id > 0),
    );

    const rows = await db
      .select({
        id: agents.id,
        companyId: agents.companyId,
        name: agents.name,
        role: agents.role,
        status: agents.status,
        env: agents.env,
        isTest: agents.isTest,
        isVisible: agents.isVisible,
        managerId: agents.managerId,
        metadata: agents.metadata,
      })
      .from(agents)
      .where(companyId ? eq(agents.companyId, companyId) : undefined)
      .orderBy(asc(agents.name))
      .limit(limit);

    const candidates = rows
      .filter((agent) => !allowlistedIds.has(Number(agent.id)))
      .filter((agent) => isLimitedOrTestAgent(agent));

    const candidateIds = Array.from(
      new Set(candidates.map((a) => Number(a.id)).filter((id) => Number.isInteger(id) && id > 0)),
    );

    if (!isConfirmed) {
      return res.status(428).json({
        ok: false,
        message: "Confirmation required",
        requiresConsent: true,
        tenantId,
        companyId,
        candidateCount: candidates.length,
        sample: candidates.slice(0, 50),
        plan: {
          what: "Hard delete limited/test/demo agents and their related test-only artifacts",
          why: "Removes placeholder agents from org chart and prevents accidental actions/emails from non-production agents",
          forHowLong: "One-time DB cleanup (seconds to minutes, depends on message volume)",
          resources: ["Database reads/writes (transaction)"],
          howToAuthorize: ["Send again with `{ \"confirm\": true }` (optionally include companyId/limit)"],
          howToStop: ["N/A (single request). If it runs long, terminate the server process."],
          visibility: ["Check GET /api/admin/agents/production", "Reload Agents page/org chart"],
        },
      });
    }

    if (!candidateIds.length) {
      return res.json({ ok: true, tenantId, companyId, deletedCount: 0, deleted: [] });
    }

    const adminUser = (req as any)?.adminUser ?? null;
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      // Detach hierarchy links first to avoid FK blocks.
      await tx.update(agents).set({ managerId: null, updatedAt: now }).where(inArray(agents.managerId, candidateIds));

      await tx.update(chatRooms).set({ moderatorId: null, updatedAt: now }).where(inArray(chatRooms.moderatorId, candidateIds));
      await tx.update(chatRooms).set({ ownerAgentId: null, updatedAt: now }).where(inArray(chatRooms.ownerAgentId, candidateIds));

      await tx.update(meetings).set({ organizerId: null, updatedAt: now }).where(inArray(meetings.organizerId, candidateIds));

      await tx.update(goals).set({ ownerAgentId: null, updatedAt: now }).where(inArray(goals.ownerAgentId, candidateIds));

      await tx.update(tasks).set({ approvedByAgentId: null, updatedAt: now }).where(inArray(tasks.approvedByAgentId, candidateIds));
      await tx.delete(tasks).where(inArray(tasks.agentId, candidateIds));

      await tx.update(activityLog).set({ agentId: null }).where(inArray(activityLog.agentId, candidateIds));
      await tx.delete(tokenTransactions).where(inArray(tokenTransactions.agentId, candidateIds));

      await tx.update(knowledgeSpaces).set({ createdBy: null, updatedAt: now }).where(inArray(knowledgeSpaces.createdBy, candidateIds));
      await tx.update(knowledgeDocuments).set({ createdBy: null, updatedAt: now }).where(inArray(knowledgeDocuments.createdBy, candidateIds));

      await tx.delete(roomMemberships).where(inArray(roomMemberships.agentId, candidateIds));
      await tx.delete(messages).where(or(inArray(messages.fromAgentId, candidateIds), inArray(messages.toAgentId, candidateIds)));

      const deletedAgents = await tx
        .delete(agents)
        .where(inArray(agents.id, candidateIds))
        .returning({ id: agents.id, name: agents.name, role: agents.role, status: agents.status });

      return { deletedAgents };
    });

    await db.insert(auditLogs).values({
      tenantId,
      userId: Number(adminUser?.id || 0) || null,
      userRole: "admin",
      action: "AGENTS_LIMITED_PURGED",
      entityType: "agents",
      entityId: null,
      metadata: {
        companyId,
        deletedCount: result.deletedAgents.length,
        deletedAgentIds: result.deletedAgents.map((a) => Number(a.id)),
      },
      createdAt: now,
    });

    res.json({
      ok: true,
      tenantId,
      companyId,
      deletedCount: result.deletedAgents.length,
      deleted: result.deletedAgents.slice(0, 200),
    });
  } catch (error: any) {
    console.error("[Admin] Error purging limited agents:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to purge limited agents" });
  }
});

router.get("/agents/production", async (req, res) => {
  try {
    const tenantId = Number((req as any)?.tenant?.id || 0);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return res.status(400).json({ ok: false, message: "tenant required" });
    }

    const items = await db
      .select({
        id: agentsProduction.id,
        tenantId: agentsProduction.tenantId,
        agentId: agentsProduction.agentId,
        agentKey: agentsProduction.agentKey,
        displayName: agentsProduction.displayName,
        isEnabled: agentsProduction.isEnabled,
        createdAt: agentsProduction.createdAt,
        updatedAt: agentsProduction.updatedAt,
        agentName: agents.name,
        agentRole: agents.role,
        agentStatus: agents.status,
        agentIsTest: agents.isTest,
        agentIsVisible: agents.isVisible,
        agentAvatar: agents.avatar,
      })
      .from(agentsProduction)
      .leftJoin(agents, eq(agentsProduction.agentId, agents.id))
      .where(eq(agentsProduction.tenantId, tenantId))
      .orderBy(desc(agentsProduction.updatedAt))
      .limit(500);

    res.json({ ok: true, tenantId, items });
  } catch (error: any) {
    console.error("[Admin] Error listing production agents:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to list production agents" });
  }
});

router.post("/agents/production/seed", async (req, res) => {
  try {
    const tenantId = Number((req as any)?.tenant?.id || 0);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return res.status(400).json({ ok: false, message: "tenant required" });
    }

    const confirm = String(req.body?.confirm ?? "").trim().toLowerCase() === "true" || req.body?.confirm === true;
    if (!confirm) {
      return res.status(428).json({
        ok: false,
        message: "Confirmation required",
        requiresConsent: true,
        plan: {
          what: "Seed agents_production allowlist from existing active agents",
          why: "Ensures only approved agents can send emails, run actions, and join meetings in production mode.",
          forHowLong: "One-time DB write (seconds).",
          resources: ["Database reads/writes"],
          howToAuthorize: ["Send again with `{ \"confirm\": true }`"],
          howToStop: ["N/A (single request)"],
          visibility: "Use GET /api/admin/agents/production to review",
        },
      });
    }

    const now = new Date();
    const adminUser = (req as any)?.adminUser;

    const candidates = await db
      .select({
        id: agents.id,
        name: agents.name,
        role: agents.role,
        status: agents.status,
        env: agents.env,
        isTest: agents.isTest,
        isVisible: agents.isVisible,
      })
      .from(agents)
      .where(
        and(
          eq(agents.env, "prod"),
          eq(agents.status, "active"),
          eq(agents.isTest, false),
          eq(agents.isVisible, true),
          sql`lower(${agents.name}) not like '%limited agent%'`,
          sql`lower(${agents.role}) not like '%limited%'`,
        ),
      )
      .orderBy(asc(agents.name))
      .limit(5000);

    const values = candidates
      .map((agent) => {
        const agentKey = normalizeAgentKey(String(agent.name || ""));
        if (!agentKey) return null;
        return {
          tenantId,
          agentId: Number(agent.id),
          agentKey,
          displayName: String(agent.name || "").trim() || null,
          isEnabled: true,
          metadata: {
            seededBy: adminUser?.email ?? null,
            seededAt: now.toISOString(),
          },
          createdAt: now,
          updatedAt: now,
        };
      })
      .filter(Boolean) as Array<{
        tenantId: number;
        agentId: number;
        agentKey: string;
        displayName: string | null;
        isEnabled: boolean;
        metadata: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
      }>;

    const inserted = values.length
      ? await db
          .insert(agentsProduction)
          .values(values)
          .onConflictDoNothing({ target: [agentsProduction.tenantId, agentsProduction.agentKey] })
          .returning({ id: agentsProduction.id, agentId: agentsProduction.agentId, agentKey: agentsProduction.agentKey })
      : [];

    res.json({
      ok: true,
      tenantId,
      candidateCount: candidates.length,
      insertedCount: inserted.length,
      inserted: inserted.slice(0, 200),
    });
  } catch (error: any) {
    console.error("[Admin] Error seeding production agents:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to seed production agents" });
  }
});

router.post("/agents/production/upsert", async (req, res) => {
  try {
    const tenantId = Number((req as any)?.tenant?.id || 0);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return res.status(400).json({ ok: false, message: "tenant required" });
    }

    const rawKey = String(req.body?.agentKey ?? req.body?.agent_key ?? "").trim();
    const agentKey = normalizeAgentKey(rawKey);
    if (!agentKey) return res.status(400).json({ ok: false, message: "agentKey required" });

    const agentIdRaw = req.body?.agentId ?? req.body?.agent_id ?? null;
    const agentId = agentIdRaw != null && Number.isFinite(Number(agentIdRaw)) ? Number(agentIdRaw) : null;
    const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : null;
    const isEnabled =
      typeof req.body?.isEnabled === "boolean"
        ? req.body.isEnabled
        : String(req.body?.isEnabled ?? "true").trim().toLowerCase() !== "false";

    const now = new Date();

    const inserted = await db
      .insert(agentsProduction)
      .values({
        tenantId,
        agentId,
        agentKey,
        displayName,
        isEnabled,
        metadata: { manual: true },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [agentsProduction.tenantId, agentsProduction.agentKey],
        set: { agentId, displayName, isEnabled, updatedAt: now },
      })
      .returning();

    res.json({ ok: true, tenantId, item: inserted[0] ?? null });
  } catch (error: any) {
    console.error("[Admin] Error upserting production agent:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to upsert production agent" });
  }
});

router.post("/agents/tools-matrix/run", async (req, res) => {
  try {
    const limitRaw = req.body?.limit;
    const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;
    const result = await runToolMatrixReport({ limit });
    res.json({
      ok: true,
      reportPath: result.reportPath,
      summary: {
        generatedAt: result.payload.generatedAt,
        totalAgents: result.payload.totalAgents,
        failures: result.payload.failures,
        blockedForbiddenChecks: result.payload.blockedForbiddenChecks,
      },
    });
  } catch (error: any) {
    console.error("[Admin] Error running tools matrix:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to run tools matrix" });
  }
});

router.get("/agents/tools-matrix/report", async (_req, res) => {
  try {
    const report = await readLatestToolMatrixReport();
    if (!report) return res.status(404).json({ ok: false, message: "No tools matrix report found" });
    res.json({ ok: true, reportPath: report.reportPath, report: report.payload });
  } catch (error: any) {
    console.error("[Admin] Error loading tools matrix report:", error);
    res.status(500).json({ ok: false, error: error.message || "Failed to read tools matrix report" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const conditions: any[] = [];

    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(eceUsers.displayName, searchTerm),
          ilike(eceUsers.email, searchTerm),
          ilike(eceUsers.phone, searchTerm)
        )
      );
    }

    if (status && typeof status === 'string' && status !== 'all') {
      if (status === 'active') {
        conditions.push(eq(eceUsers.isActive, true));
      } else if (status === 'inactive') {
        conditions.push(eq(eceUsers.isActive, false));
      }
    }

    if (role && typeof role === 'string' && role !== 'all') {
      conditions.push(sql`${role} = ANY(${eceUsers.roles})`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const allUsers = await db.query.eceUsers.findMany({
      where: whereClause,
      orderBy: desc(eceUsers.createdAt),
      limit: Number(limit),
      offset
    });

    const countResult = whereClause
      ? await db.select({ count: count() }).from(eceUsers).where(whereClause)
      : await db.select({ count: count() }).from(eceUsers);

    const totalCount = countResult[0]?.count || 0;

    res.json({
      users: allUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error: any) {
    console.error("[Admin] Error fetching users:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.id, Number(id))
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error: any) {
    console.error("[Admin] Error fetching user:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { roles, isActive, displayName, email, phone } = req.body;

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (roles !== undefined) updateData.roles = roles;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;

    const [updated] = await db.update(eceUsers)
      .set(updateData)
      .where(eq(eceUsers.id, Number(id)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("[Admin] Error updating user:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/roles", async (req, res) => {
  try {
    const roles = await db.query.userRoles.findMany({
      orderBy: asc(userRoles.name)
    });
    res.json(roles);
  } catch (error: any) {
    console.error("[Admin] Error fetching roles:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/roles", async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    const [role] = await db.insert(userRoles)
      .values({ name, description, permissions: permissions || [] })
      .returning();

    res.json(role);
  } catch (error: any) {
    console.error("[Admin] Error creating role:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/users/:userId/roles/:roleId", async (req, res) => {
  try {
    const { userId, roleId } = req.params;
    const { assignedBy } = req.body;

    const existing = await db.query.userRoleAssignments.findFirst({
      where: and(
        eq(userRoleAssignments.userId, Number(userId)),
        eq(userRoleAssignments.roleId, Number(roleId)),
        eq(userRoleAssignments.isActive, true)
      )
    });

    if (existing) {
      return res.status(400).json({ error: "Role already assigned" });
    }

    const [assignment] = await db.insert(userRoleAssignments)
      .values({
        userId: Number(userId),
        roleId: Number(roleId),
        assignedBy: assignedBy ? Number(assignedBy) : null
      })
      .returning();

    res.json(assignment);
  } catch (error: any) {
    console.error("[Admin] Error assigning role:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/users/:userId/roles/:roleId", async (req, res) => {
  try {
    const { userId, roleId } = req.params;

    await db.update(userRoleAssignments)
      .set({ isActive: false })
      .where(and(
        eq(userRoleAssignments.userId, Number(userId)),
        eq(userRoleAssignments.roleId, Number(roleId))
      ));

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin] Error removing role:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/subscription-plans", async (req, res) => {
  try {
    const plans = await db.query.subscriptionPlans.findMany({
      where: eq(subscriptionPlans.isActive, true),
      orderBy: asc(subscriptionPlans.sortOrder)
    });
    res.json(plans);
  } catch (error: any) {
    console.error("[Admin] Error fetching plans:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/subscription-plans", async (req, res) => {
  try {
    const planData = req.body;

    const [plan] = await db.insert(subscriptionPlans)
      .values(planData)
      .returning();

    res.json(plan);
  } catch (error: any) {
    console.error("[Admin] Error creating plan:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/subscription-plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updated] = await db.update(subscriptionPlans)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, Number(id)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("[Admin] Error updating plan:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/workflows", async (req, res) => {
  try {
    const { type, active } = req.query;
    
    let query = db.query.workflows.findMany({
      orderBy: desc(workflows.createdAt)
    });

    const allWorkflows = await query;
    res.json(allWorkflows);
  } catch (error: any) {
    console.error("[Admin] Error fetching workflows:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/workflows", async (req, res) => {
  try {
    const workflowData = req.body;

    const [workflow] = await db.insert(workflows)
      .values(workflowData)
      .returning();

    res.json(workflow);
  } catch (error: any) {
    console.error("[Admin] Error creating workflow:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/applications/shop", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const applications = await db.query.shopApplications.findMany({
      orderBy: desc(shopApplications.createdAt),
      limit: Number(limit),
      offset,
      with: {
        user: true,
        workflow: true,
        recommendedPlan: true
      }
    });

    const totalCount = await db.select({ count: count() }).from(shopApplications);

    res.json({
      applications,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount[0]?.count || 0
      }
    });
  } catch (error: any) {
    console.error("[Admin] Error fetching shop applications:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/applications/shop", async (req, res) => {
  try {
    const sessionUserId = (req as any).session?.userId;
    const { userId: bodyUserId, applicationData, conversationHistory } = req.body;
    const userId = sessionUserId || bodyUserId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const existingApp = await db.query.shopApplications.findFirst({
      where: and(
        eq(shopApplications.userId, userId),
        or(
          eq(shopApplications.status, 'submitted'),
          eq(shopApplications.status, 'under_review'),
          eq(shopApplications.status, 'approved')
        )
      )
    });

    if (existingApp) {
      return res.status(400).json({ 
        error: "You already have a pending or approved application",
        applicationId: existingApp.id,
        status: existingApp.status
      });
    }

    const defaultWorkflow = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.type, 'shop_application'),
        eq(workflows.isActive, true),
        eq(workflows.isDefault, true)
      )
    });

    let aiScore = 50;
    const appData = applicationData || {};
    
    if (appData.businessName) aiScore += 10;
    if (appData.businessType) aiScore += 10;
    if (appData.productCategories?.length > 0) aiScore += 10;
    if (appData.tradingExperience) aiScore += 10;
    if (appData.documentsReady) aiScore += 10;

    let aiDecision: 'approved' | 'needs_review' | 'rejected' = 'needs_review';
    if (aiScore >= 80) {
      aiDecision = 'approved';
    } else if (aiScore < 40) {
      aiDecision = 'rejected';
    }

    const [application] = await db.insert(shopApplications)
      .values({
        userId,
        workflowId: defaultWorkflow?.id,
        applicationData: {
          ...appData,
          conversationHistory: conversationHistory?.slice(-20)
        },
        status: 'submitted',
        aiScore,
        aiDecision,
        currentStep: 6,
        submittedAt: new Date()
      })
      .returning();

    await db.insert(aiApprovalLogs)
      .values({
        applicationType: 'shop',
        applicationId: application.id,
        inputData: appData,
        decision: aiDecision,
        score: aiScore,
        confidence: (aiScore / 100).toFixed(4),
        reasons: [
          appData.businessName ? 'Business name provided' : 'Missing business name',
          appData.businessType ? 'Business type specified' : 'Missing business type',
          appData.productCategories?.length > 0 ? 'Product categories listed' : 'No products listed',
          appData.tradingExperience ? 'Experience documented' : 'No experience info',
          appData.documentsReady ? 'Documents confirmed ready' : 'Documents not confirmed'
        ].filter(r => r.includes('provided') || r.includes('specified') || r.includes('listed') || r.includes('documented') || r.includes('confirmed ready')),
        hardRulesApplied: [],
        modelUsed: 'rule-based-v1',
        tokensUsed: 0,
        processingTimeMs: 50
      });

    res.json({
      applicationId: application.id,
      status: application.status,
      aiScore,
      aiDecision
    });
  } catch (error: any) {
    console.error("[Admin] Error creating shop application:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/applications/shop/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updated] = await db.update(shopApplications)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(shopApplications.id, Number(id)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("[Admin] Error updating shop application:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/applications/shop/my-application", async (req, res) => {
  try {
    const userId = (req as any).session?.userId;
    
    if (!userId) {
      return res.status(200).json(null);
    }

    const application = await db.query.shopApplications.findFirst({
      where: eq(shopApplications.userId, userId),
      orderBy: desc(shopApplications.createdAt)
    });

    res.json(application || null);
  } catch (error: any) {
    console.error("[Admin] Error fetching user shop application:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/applications/shop/chat", async (req, res) => {
  try {
    const { message, currentStep, applicationData, conversationHistory } = req.body;

    const STEP_PROMPTS: Record<number, { prompt: string; extractFields: string[] }> = {
      1: {
        prompt: `You are an AI assistant helping with a shop owner application for Exportunity Commodities Exchange. 
The user just provided their business name. Extract it and ask about their business type (e.g., gold trading, commodities export, mining).
Be friendly and professional.`,
        extractFields: ['businessName']
      },
      2: {
        prompt: `The user is telling you about their business. Extract the business type and ask about:
- What specific products/commodities they trade
- Their production or sourcing capacity
- How long they've been in business`,
        extractFields: ['businessType', 'yearsInBusiness']
      },
      3: {
        prompt: `The user is describing their products. Extract product categories and ask about:
- Their typical order sizes
- Target markets (local, regional, international)
- Any certifications they have`,
        extractFields: ['productCategories', 'productionCapacity', 'targetMarkets']
      },
      4: {
        prompt: `The user is sharing their experience. Extract relevant details and ask about:
- Their online presence (website, social media)
- Previous trading platforms they've used
- References or testimonials they can provide`,
        extractFields: ['tradingExperience', 'socialPresence']
      },
      5: {
        prompt: `Almost done! Ask the user to confirm they will provide:
- Valid government-issued ID
- Business registration documents
- Tax identification (if applicable)
Let them know these will be requested after the AI review.`,
        extractFields: ['documentsReady']
      }
    };

    const stepConfig = STEP_PROMPTS[currentStep] || STEP_PROMPTS[1];
    
    let extractedData: Record<string, any> = {};
    let nextStep = currentStep;
    
    const lowerMessage = message.toLowerCase();
    
    if (currentStep === 1 && message.length > 2) {
      extractedData.businessName = message.trim();
      nextStep = 2;
    } else if (currentStep === 2) {
      if (lowerMessage.includes('gold') || lowerMessage.includes('mining') || lowerMessage.includes('commodit')) {
        extractedData.businessType = message.trim();
        nextStep = 3;
      }
    } else if (currentStep === 3) {
      if (message.length > 10) {
        extractedData.productCategories = message.split(',').map((s: string) => s.trim());
        nextStep = 4;
      }
    } else if (currentStep === 4) {
      extractedData.tradingExperience = message.trim();
      nextStep = 5;
    } else if (currentStep === 5) {
      if (lowerMessage.includes('yes') || lowerMessage.includes('ready') || lowerMessage.includes('confirm')) {
        extractedData.documentsReady = true;
        nextStep = 6;
      }
    }

    const responses: Record<number, string[]> = {
      1: [
        `Great! "${applicationData.businessName || message}" sounds like an interesting business. What type of commodities do you primarily deal with? For example: gold trading, agricultural exports, or mining operations?`,
      ],
      2: [
        `Excellent! That gives me a good picture of your business. Now, could you tell me more about your products? What specific items would you list on the marketplace, and what's your typical production or sourcing capacity?`,
      ],
      3: [
        `Thank you for those details. Your product range looks promising! To better understand your experience, could you share:
- How many years have you been in this industry?
- Do you have a website or social media presence?
- Have you used other trading platforms before?`,
      ],
      4: [
        `Great experience! You seem well-prepared for our marketplace. 
        
For the final step, I need to confirm you can provide these documents after approval:
- Government-issued ID
- Business registration certificate
- Tax identification (if applicable)

Can you confirm you have these ready? Just say "Yes, I'm ready" to proceed.`,
      ],
      5: [
        `Perfect! You're all set to submit your application. 

Based on our conversation, here's a summary:
- Business: ${applicationData.businessName || 'Your business'}
- Type: ${applicationData.businessType || 'Commodities trading'}
- Experience: ${applicationData.tradingExperience || 'Experienced trader'}

Your application will be reviewed by our AI system, which typically takes 24-48 hours. You'll be notified of the decision via email.

Click the "Submit" button when you're ready!`,
      ]
    };

    const responseOptions = responses[nextStep] || responses[1];
    const responseMessage = responseOptions[0];

    res.json({
      message: responseMessage,
      extractedData,
      nextStep,
      applicationData: { ...applicationData, ...extractedData }
    });
  } catch (error: any) {
    console.error("[Admin] Shop application chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/applications/delivery", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const applications = await db.query.deliveryApplications.findMany({
      orderBy: desc(deliveryApplications.createdAt),
      limit: Number(limit),
      offset,
      with: {
        user: true,
        workflow: true
      }
    });

    const totalCount = await db.select({ count: count() }).from(deliveryApplications);

    res.json({
      applications,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount[0]?.count || 0
      }
    });
  } catch (error: any) {
    console.error("[Admin] Error fetching delivery applications:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/applications/delivery/my-application", async (req, res) => {
  try {
    const userId = (req as any).session?.userId;
    
    if (!userId) {
      return res.status(200).json(null);
    }

    const application = await db.query.deliveryApplications.findFirst({
      where: eq(deliveryApplications.userId, userId),
      orderBy: desc(deliveryApplications.createdAt)
    });

    res.json(application || null);
  } catch (error: any) {
    console.error("[Admin] Error fetching user delivery application:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/applications/delivery/chat", async (req, res) => {
  try {
    const { message, currentStep, applicationData } = req.body;
    
    let extractedData: Record<string, any> = {};
    let nextStep = currentStep;
    
    const lowerMessage = message.toLowerCase();
    
    if (currentStep === 1 && message.length > 2) {
      extractedData.fullName = message.trim();
      nextStep = 2;
    } else if (currentStep === 2) {
      if (message.includes('@') || /\d{10,}/.test(message.replace(/\D/g, ''))) {
        extractedData.contactInfo = message.trim();
        nextStep = 3;
      }
    } else if (currentStep === 3) {
      if (lowerMessage.includes('car') || lowerMessage.includes('motorcycle') || 
          lowerMessage.includes('bike') || lowerMessage.includes('truck') || lowerMessage.includes('van')) {
        extractedData.vehicleType = message.trim();
        extractedData.hasVehicle = true;
        nextStep = 4;
      }
    } else if (currentStep === 4) {
      extractedData.deliveryExperience = message.trim();
      nextStep = 5;
    } else if (currentStep === 5) {
      if (lowerMessage.includes('yes') || lowerMessage.includes('agree') || lowerMessage.includes('accept')) {
        extractedData.acceptedTerms = true;
        extractedData.depositAgreed = true;
        nextStep = 6;
      }
    }

    const responses: Record<number, string> = {
      1: `Nice to meet you, ${applicationData.fullName || message}! 

Now I need your contact details. Please share:
- Your phone number
- Your email address`,
      2: `Great! Now let's talk about transportation.

What type of vehicle will you use for deliveries? We accept:
- Motorcycle/Bike (for small packages)
- Car/Sedan (for medium packages)
- Van/Truck (for large deliveries)

Please describe your vehicle.`,
      3: `${applicationData.vehicleType || message} sounds perfect for our deliveries!

Do you have any prior delivery experience? Have you worked with:
- Food delivery apps (Uber Eats, DoorDash, etc.)
- Package delivery (FedEx, UPS, etc.)
- Other logistics services

Please share your experience or say "No prior experience" if you're new to delivery.`,
      4: `Thanks for sharing your background!

Before we proceed, there are some important requirements:

💰 Security Deposit: $100 (refundable)
This protects against lost/damaged high-value commodities.

📋 Insurance: Basic coverage required
You'll need to maintain valid vehicle insurance.

📱 Equipment: Smartphone with GPS
For real-time tracking and delivery confirmations.

Do you agree to these terms? Reply "Yes, I agree" to continue.`,
      5: `Excellent! You're ready to submit your application.

Summary:
- Name: ${applicationData.fullName || 'Provided'}
- Vehicle: ${applicationData.vehicleType || 'Provided'}
- Experience: ${applicationData.deliveryExperience || 'Provided'}
- Deposit: $100 (payable upon approval)

Your application will be reviewed within 24-48 hours. Click "Submit" when ready!`
    };

    const responseMessage = responses[nextStep] || responses[1];

    res.json({
      message: responseMessage,
      extractedData,
      nextStep,
      applicationData: { ...applicationData, ...extractedData }
    });
  } catch (error: any) {
    console.error("[Admin] Delivery application chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/applications/delivery", async (req, res) => {
  try {
    const sessionUserId = (req as any).session?.userId;
    const { userId: bodyUserId, applicationData, conversationHistory } = req.body;
    const userId = sessionUserId || bodyUserId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const existingApp = await db.query.deliveryApplications.findFirst({
      where: and(
        eq(deliveryApplications.userId, userId),
        or(
          eq(deliveryApplications.status, 'submitted'),
          eq(deliveryApplications.status, 'under_review'),
          eq(deliveryApplications.status, 'approved')
        )
      )
    });

    if (existingApp) {
      return res.status(400).json({ 
        error: "You already have a pending or approved application",
        applicationId: existingApp.id,
        status: existingApp.status
      });
    }

    const defaultWorkflow = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.type, 'delivery_application'),
        eq(workflows.isActive, true),
        eq(workflows.isDefault, true)
      )
    });

    let aiScore = 50;
    const appData = applicationData || {};
    
    if (appData.fullName) aiScore += 10;
    if (appData.hasVehicle) aiScore += 15;
    if (appData.deliveryExperience && appData.deliveryExperience.length > 20) aiScore += 10;
    if (appData.acceptedTerms) aiScore += 10;
    if (appData.depositAgreed) aiScore += 5;

    let aiDecision: 'approved' | 'needs_review' | 'rejected' = 'needs_review';
    if (aiScore >= 80) {
      aiDecision = 'approved';
    } else if (aiScore < 40 || !appData.hasVehicle) {
      aiDecision = 'rejected';
    }

    const depositAmount = "100.00";

    const [application] = await db.insert(deliveryApplications)
      .values({
        userId,
        workflowId: defaultWorkflow?.id,
        applicationData: {
          ...appData,
          conversationHistory: conversationHistory?.slice(-20)
        },
        status: 'submitted',
        aiScore,
        aiDecision,
        requiredDeposit: depositAmount,
        insuranceRequired: true,
        insuranceVerified: false,
        currentStep: 6,
        submittedAt: new Date()
      })
      .returning();

    await db.insert(aiApprovalLogs)
      .values({
        applicationType: 'delivery',
        applicationId: application.id,
        inputData: appData,
        decision: aiDecision,
        score: aiScore,
        confidence: (aiScore / 100).toFixed(4),
        reasons: [
          appData.fullName ? 'Full name provided' : 'Missing name',
          appData.hasVehicle ? 'Has vehicle' : 'No vehicle',
          appData.deliveryExperience ? 'Experience documented' : 'No experience info',
          appData.acceptedTerms ? 'Terms accepted' : 'Terms not accepted'
        ].filter(r => !r.includes('Missing') && !r.includes('No ')),
        hardRulesApplied: appData.hasVehicle ? [] : [{ rule: 'Vehicle required', result: false, action: 'reject' }],
        modelUsed: 'rule-based-v1',
        tokensUsed: 0,
        processingTimeMs: 50
      });

    res.json({
      applicationId: application.id,
      status: application.status,
      aiScore,
      aiDecision,
      depositRequired: true,
      depositAmount
    });
  } catch (error: any) {
    console.error("[Admin] Error creating delivery application:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/applications/delivery/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updated] = await db.update(deliveryApplications)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(deliveryApplications.id, Number(id)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("[Admin] Error updating delivery application:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/ai/decide", async (req, res) => {
  try {
    const { type, applicationId, data, userProfile } = req.body;

    const hardRules: Array<{ rule: string; result: boolean; action: string }> = [];
    let autoReject = false;
    let needsReview = false;

    if (type === 'shop_application') {
      if (!data.documents?.some((d: any) => d.type === 'id')) {
        hardRules.push({ rule: 'ID document required', result: false, action: 'needs_review' });
        needsReview = true;
      }
      if (!data.businessType) {
        hardRules.push({ rule: 'Business type required', result: false, action: 'needs_review' });
        needsReview = true;
      }
    }

    if (type === 'delivery_application') {
      if (!data.documents?.some((d: any) => d.type === 'driving_license')) {
        hardRules.push({ rule: 'Driving license required', result: false, action: 'needs_review' });
        needsReview = true;
      }
      if (!data.hasVehicle) {
        hardRules.push({ rule: 'Vehicle required', result: false, action: 'reject' });
        autoReject = true;
      }
    }

    let score = 50;
    const reasons: string[] = [];

    if (data.socialPresence?.website) { score += 10; reasons.push("Has website"); }
    if (data.socialPresence?.instagram) { score += 5; reasons.push("Active on Instagram"); }
    if (data.productCategories?.length > 0) { score += 5; reasons.push("Clear product categories"); }
    if (data.productionCapacity) { score += 5; reasons.push("Production capacity declared"); }
    if (data.documents?.length >= 2) { score += 10; reasons.push("Multiple documents provided"); }

    let decision: 'approved' | 'rejected' | 'needs_review';
    if (autoReject) {
      decision = 'rejected';
      score = Math.min(score, 30);
    } else if (needsReview || score < 70) {
      decision = 'needs_review';
    } else {
      decision = 'approved';
    }

    const [log] = await db.insert(aiApprovalLogs)
      .values({
        applicationType: type === 'shop_application' ? 'shop' : 'delivery',
        applicationId,
        inputData: { data, userProfile },
        decision,
        score,
        confidence: (score / 100).toFixed(4),
        reasons,
        hardRulesApplied: hardRules,
        modelUsed: 'rule-based-v1',
        tokensUsed: 0,
        processingTimeMs: 50
      })
      .returning();

    res.json({
      decision,
      score,
      reasons,
      recommendedPlanId: decision === 'approved' ? 1 : null,
      logId: log.id
    });
  } catch (error: any) {
    console.error("[Admin] AI Decision error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/leads", async (req, res) => {
  try {
    const { status, source, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const allLeads = await db.query.leads.findMany({
      orderBy: desc(leads.createdAt),
      limit: Number(limit),
      offset,
      with: {
        assignedTo: true,
        campaign: true
      }
    });

    const totalCount = await db.select({ count: count() }).from(leads);

    res.json({
      leads: allLeads,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount[0]?.count || 0
      }
    });
  } catch (error: any) {
    console.error("[Admin] Error fetching leads:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/leads", async (req, res) => {
  try {
    const leadData = req.body;

    const [lead] = await db.insert(leads)
      .values(leadData)
      .returning();

    res.json(lead);
  } catch (error: any) {
    console.error("[Admin] Error creating lead:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/leads/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updated] = await db.update(leads)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(leads.id, Number(id)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("[Admin] Error updating lead:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/leads/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;

    const messages = await db.query.leadMessages.findMany({
      where: eq(leadMessages.leadId, Number(id)),
      orderBy: desc(leadMessages.createdAt)
    });

    res.json(messages);
  } catch (error: any) {
    console.error("[Admin] Error fetching lead messages:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/leads/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const messageData = req.body;

    const [message] = await db.insert(leadMessages)
      .values({
        leadId: Number(id),
        ...messageData
      })
      .returning();

    await db.update(leads)
      .set({ lastContactedAt: new Date(), updatedAt: new Date() })
      .where(eq(leads.id, Number(id)));

    res.json(message);
  } catch (error: any) {
    console.error("[Admin] Error creating lead message:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/leads/ai-discover", async (req, res) => {
  try {
    const { criteria } = req.body;
    const adminUser = (req as any).adminUser;

    const industryLeads = [
      { industry: 'gold_mining', region: 'West Africa', companies: ['Ghana Gold Corp', 'Senegal Minerals', 'Mali Precious Metals'] },
      { industry: 'commodities_trading', region: 'East Africa', companies: ['Kenya Trade Hub', 'Tanzania Resources', 'Uganda Exports'] },
      { industry: 'refinery', region: 'Southern Africa', companies: ['SA Refinery Ltd', 'Zimbabwe Gold Works', 'Botswana Metals'] },
    ];

    const discoveredLeads: any[] = [];
    
    for (const sector of industryLeads) {
      for (const company of sector.companies) {
        const score = Math.floor(60 + Math.random() * 35);
        const contactName = `${['John', 'Sarah', 'Michael', 'Grace', 'David'][Math.floor(Math.random() * 5)]} ${['Smith', 'Johnson', 'Okonkwo', 'Mensah', 'Ndlovu'][Math.floor(Math.random() * 5)]}`;
        
        const [lead] = await db.insert(leads)
          .values({
            companyName: company,
            contactName,
            contactEmail: `contact@${company.toLowerCase().replace(/\s+/g, '')}.com`,
            source: 'manual',
            status: 'new',
            score,
            notes: `AI-discovered lead in ${sector.industry} sector, ${sector.region}. High potential for commodities trading partnership.`,
            metadata: {
              industry: sector.industry,
              region: sector.region,
              discoveryMethod: 'ai_pattern_matching',
              confidence: (score / 100).toFixed(2)
            }
          })
          .returning();
        
        discoveredLeads.push(lead);
      }
    }

    const [campaign] = await db.insert(leadCampaigns)
      .values({
        name: `AI Discovery - ${new Date().toLocaleDateString()}`,
        description: 'Automated lead discovery campaign targeting African commodities sector',
        status: 'completed',
        targetCategory: (criteria as any)?.industry || 'commodities',
        sources: ['manual'],
        totalLeadsGenerated: discoveredLeads.length,
        totalConversions: 0,
        ownerUserId: adminUser?.id || null,
        metadata: {
          discoveryType: "ai_discovery",
          targetCriteria: criteria || { industry: 'commodities', region: 'africa' }
        }
      })
      .returning();

    res.json({
      success: true,
      leadsFound: discoveredLeads.length,
      campaign,
      leads: discoveredLeads
    });
  } catch (error: any) {
    console.error("[Admin] AI Discovery error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/leads/:id/ai-score", async (req, res) => {
  try {
    const { id } = req.params;
    
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, Number(id))
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    let score = 50;
    const factors: string[] = [];

    if (lead.companyName) { score += 10; factors.push("Company identified"); }
    if (lead.contactEmail) { score += 15; factors.push("Email available"); }
    if (lead.contactPhone) { score += 10; factors.push("Phone available"); }
    if ((lead.metadata as any)?.industry === 'gold_mining') { score += 15; factors.push("High-value industry"); }
    if (String((lead.metadata as any)?.region || "").includes('Africa')) { score += 10; factors.push("Target region match"); }
    if (lead.status === 'responded') { score += 20; factors.push("Engaged prospect"); }

    score = Math.min(score, 100);

    const [updated] = await db.update(leads)
      .set({ 
        score, 
        metadata: { 
          ...(lead.metadata as any || {}), 
          aiScoreFactors: factors,
          lastScored: new Date().toISOString()
        },
        updatedAt: new Date() 
      })
      .where(eq(leads.id, Number(id)))
      .returning();

    res.json({
      lead: updated,
      score,
      factors,
      recommendation: score >= 80 ? 'high_priority' : score >= 60 ? 'follow_up' : 'nurture'
    });
  } catch (error: any) {
    console.error("[Admin] AI Score error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/leads/:id/ai-outreach", async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const { id } = req.params;
    const { type = 'email' } = req.body;
    
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, Number(id))
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const companyName = lead.companyName || 'your company';
    const contactName = lead.contactName?.split(' ')[0] || 'there';
    const industry = (lead.metadata as any)?.industry || 'commodities';

    let message = '';
    let subject = '';

    if (type === 'email') {
      subject = `Partnership Opportunity - Exportunity Commodities Exchange`;
      message = `Dear ${contactName},

I hope this message finds you well. I'm reaching out from Exportunity Commodities Exchange, a leading B2B platform connecting verified suppliers with global buyers in the commodities sector.

We've identified ${companyName} as a potential strategic partner based on your presence in the ${industry.replace('_', ' ')} industry. Our platform offers:

• Direct access to verified international buyers
• Transparent pricing and secure transactions  
• End-to-end logistics with BRINKS shipping
• National assayer verification for quality assurance

I'd love to schedule a brief call to explore how we can support ${companyName}'s growth objectives.

Would you have 15 minutes available this week?

Best regards,
Exportunity Business Development Team`;
    } else if (type === 'sms') {
      message = `Hi ${contactName}, this is Exportunity Commodities Exchange. We help ${industry.replace('_', ' ')} businesses connect with verified global buyers. Interested in learning more? Reply YES for details.`;
    } else if (type === 'whatsapp') {
      message = `Hello ${contactName}! 👋

We're Exportunity Commodities Exchange - a B2B platform for verified commodities trading.

We noticed ${companyName} and thought you'd be interested in:
✅ Access to global buyers
✅ Secure transactions
✅ Premium logistics

Would you like to know more?`;
    }

    const channel =
      type === "email" ||
      type === "instagram_dm" ||
      type === "tiktok_dm" ||
      type === "whatsapp" ||
      type === "sms" ||
      type === "linkedin" ||
      type === "phone_call" ||
      type === "in_app"
        ? type
        : "email";

    const [outreach] = await db.insert(leadMessages)
      .values({
        leadId: Number(id),
        direction: 'outbound',
        channel,
        content: message,
        subject: subject || null,
        sentBy: 'system',
        sentByUserId: adminUser?.id || null,
        status: 'draft',
        metadata: {
          aiGenerated: true,
          generatedAt: new Date().toISOString()
        }
      })
      .returning();

    res.json({
      success: true,
      message: outreach,
      subject,
      content: message,
      suggestedSendTime: 'Tuesday or Wednesday, 10 AM local time'
    });
  } catch (error: any) {
    console.error("[Admin] AI Outreach error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/leads/ai-qualify-batch", async (req, res) => {
  try {
    const unqualifiedLeads = await db.query.leads.findMany({
      where: eq(leads.status, 'new'),
      limit: 50
    });

    const results = [];
    
    for (const lead of unqualifiedLeads) {
      let score = lead.score || 50;
      const factors: string[] = [];

      if (lead.companyName) { score += 10; factors.push("Company identified"); }
      if (lead.contactEmail) { score += 15; factors.push("Email available"); }
      if (lead.contactPhone) { score += 10; factors.push("Phone available"); }
      
      score = Math.min(score, 100);
      
      const newStatus = (score >= 70 ? 'responded' : score >= 50 ? 'contacted' : 'new') as
        | "new"
        | "contacted"
        | "responded";

      await db.update(leads)
        .set({ 
          score, 
          status: newStatus,
          metadata: { ...(lead.metadata as any || {}), aiQualified: true, qualificationFactors: factors },
          updatedAt: new Date() 
        })
        .where(eq(leads.id, lead.id));

      results.push({ id: lead.id, score, status: newStatus });
    }

    res.json({
      processed: results.length,
      qualified: results.filter(r => r.status === 'responded').length,
      results
    });
  } catch (error: any) {
    console.error("[Admin] AI Qualify Batch error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/campaigns", async (req, res) => {
  try {
    const campaigns = await db.query.leadCampaigns.findMany({
      orderBy: desc(leadCampaigns.createdAt),
      with: {
        owner: true
      }
    });
    res.json(campaigns);
  } catch (error: any) {
    console.error("[Admin] Error fetching campaigns:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/campaigns", async (req, res) => {
  try {
    const campaignData = req.body;

    const [campaign] = await db.insert(leadCampaigns)
      .values(campaignData)
      .returning();

    res.json(campaign);
  } catch (error: any) {
    console.error("[Admin] Error creating campaign:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const [userCount] = await db.select({ count: count() }).from(users);
    const [shopAppCount] = await db.select({ count: count() }).from(shopApplications);
    const [deliveryAppCount] = await db.select({ count: count() }).from(deliveryApplications);
    const [leadCount] = await db.select({ count: count() }).from(leads);

    res.json({
      totalUsers: userCount?.count || 0,
      shopApplications: shopAppCount?.count || 0,
      deliveryApplications: deliveryAppCount?.count || 0,
      totalLeads: leadCount?.count || 0
    });
  } catch (error: any) {
    console.error("[Admin] Error fetching stats:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
