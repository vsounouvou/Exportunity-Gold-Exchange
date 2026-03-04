import { Router, Request, Response, NextFunction } from "express";
import { db } from "@db";
import { 
  bureauDAchat, 
  goldOffers, 
  traderWallets, 
  goldWalletTransactions,
  goldGroupages,
  goldPurchaseOrders,
  goldDeliveryEvents,
  goldOriginDocuments,
  lbmaPriceCache,
  bdoGoldUnitDefinitions,
  bdoPricingSnapshots,
  bdoVirtualVaults,
  bdoGoldAcquisitionRecords,
  bdoVaultGoldUnits,
  bdoDeliveryOrders,
  bdoResaleAuthorizations,
  bdoSecondaryMarketListings,
  bdoSecondaryMarketTrades,
	  marketAccessRequests,
	  auditLogs,
	  tenants,
	  eceUsers,
	  eceSessions,
	  walletAccounts,
	  walletLedgerEntries,
	  sellerProducts,
	  sellers
	} from "@db/schema";
import { eq, desc, and, gte, lte, sql, asc, or, ilike } from "drizzle-orm";
	import { nanoid } from "nanoid";
	import bcrypt from "bcryptjs";
	import { seedBureauDAchat, seedBureauxAsSellers, seedDubaiDealers, seedDubaiDealersAsSellers } from "../lib/seed-bureau-data";
	import { isChairmanAssistantUser } from "./utils/auth";
	import { demoCompanyName, isDemoModeRequest } from "./utils/demo-mode";
	import { getOrCreateWalletAccount } from "../lib/wallet/wallet";
	import { getFxSnapshot, getUsdConversionRateForCurrency } from "../lib/fx";

const router = Router();

async function verifySession(token: string | undefined) {
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

  return user;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await verifySession(token);

  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  (req as any).user = user;
  next();
}

async function writeAudit(
  req: Request,
  args: {
    userId?: number | null;
    userRole?: string | null;
    action: string;
    entityType?: string | null;
    entityId?: number | null;
    previousState?: any;
    newState?: any;
    metadata?: any;
  },
) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return;

    await db.insert(auditLogs).values({
      tenantId,
      userId: args.userId ?? null,
      userRole: args.userRole ?? null,
      action: args.action,
      entityType: args.entityType ?? null,
      entityId: args.entityId ?? null,
      previousState: args.previousState ?? null,
      newState: args.newState ?? null,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      metadata: args.metadata ?? {},
      createdAt: new Date(),
    });
  } catch (error: any) {
    console.warn("[BDO] Audit log write failed:", error?.message || error);
  }
}

const TROY_OUNCE_TO_GRAMS = 31.1035;
const BDO_FX_SCOPE = "tenant:bdo";

let cachedBdoTenantId: number | null = null;
async function resolveBdoTenantId(): Promise<number> {
  if (cachedBdoTenantId) return cachedBdoTenantId;

  const preferred = await db.query.tenants.findFirst({ where: eq(tenants.key, "bdo") });
  if (preferred?.id) {
    cachedBdoTenantId = preferred.id;
    return preferred.id;
  }

  const anyTenant = await db.query.tenants.findFirst({ orderBy: asc(tenants.id) });
  if (anyTenant?.id) {
    cachedBdoTenantId = anyTenant.id;
    return anyTenant.id;
  }

  throw new Error("No tenants found");
}

async function getLBMAPrice() {
  const fx = await getFxSnapshot(BDO_FX_SCOPE);
  const eurPerUsd = getUsdConversionRateForCurrency(fx.effectiveRates, "EUR");
  const aedPerUsd = getUsdConversionRateForCurrency(fx.effectiveRates, "AED");
  const xofPerUsd = getUsdConversionRateForCurrency(fx.effectiveRates, "XOF");

  const cached = await db.query.lbmaPriceCache.findFirst({
    orderBy: desc(lbmaPriceCache.fetchedAt)
  });
  
  if (cached && new Date(cached.fetchedAt).getTime() > Date.now() - 60 * 60 * 1000) {
    const basePrice = Number(cached.pricePerOzUsd || 0);
    if (Number.isFinite(basePrice) && basePrice > 0) {
      return {
        ...cached,
        pricePerOzEur: (basePrice * eurPerUsd).toFixed(4),
        pricePerOzAed: (basePrice * aedPerUsd).toFixed(4),
        pricePerOzXof: (basePrice * xofPerUsd).toFixed(4),
        fxRateEurUsd: eurPerUsd.toFixed(6),
        fxRateAedUsd: aedPerUsd.toFixed(6),
        fxRateXofUsd: xofPerUsd.toFixed(6),
      };
    }
    return {
      ...cached,
      fxRateEurUsd: eurPerUsd.toFixed(6),
      fxRateAedUsd: aedPerUsd.toFixed(6),
      fxRateXofUsd: xofPerUsd.toFixed(6),
    };
  }
  
  const basePrice = 2650 + (Math.random() - 0.5) * 50;
  
  const pricePerOzUsd = basePrice.toFixed(4);
  const pricePerGramUsd = (basePrice / TROY_OUNCE_TO_GRAMS).toFixed(4);
  const pricePerKgUsd = ((basePrice / TROY_OUNCE_TO_GRAMS) * 1000).toFixed(4);
  
  const [newPrice] = await db.insert(lbmaPriceCache).values({
    pricePerOzUsd,
    pricePerGramUsd,
    pricePerKgUsd,
    pricePerOzEur: (basePrice * eurPerUsd).toFixed(4),
    pricePerOzAed: (basePrice * aedPerUsd).toFixed(4),
    pricePerOzXof: (basePrice * xofPerUsd).toFixed(4),
    fxRateEurUsd: eurPerUsd.toFixed(6),
    fxRateAedUsd: aedPerUsd.toFixed(6),
    fxRateXofUsd: xofPerUsd.toFixed(6),
    source: "LBMA",
    fetchedAt: new Date(),
    validUntil: new Date(Date.now() + 60 * 60 * 1000),
    metadata: {
      amSession: true,
      pmSession: false,
      rawResponse: { fxUpdatedAt: fx.updatedAt, fxOverrideApplied: fx.overrideApplied },
    }
  }).returning();
  
  return newPrice;
}

// ========================================
// BOURSE DE L'OR (BDO) helpers
// ========================================

type WalletCurrency = "USD" | "EUR" | "AED" | "XOF" | "USDT";

const normalizeWalletCurrency = (value: unknown): WalletCurrency => {
  const raw = String(value || "XOF").toUpperCase().trim();
  if (raw === "USD" || raw === "EUR" || raw === "AED" || raw === "XOF" || raw === "USDT") return raw;
  return "XOF";
};

const balanceFieldForCurrency = (currency: WalletCurrency) => {
  if (currency === "USD") return "balanceUsd" as const;
  if (currency === "EUR") return "balanceEur" as const;
  if (currency === "AED") return "balanceAed" as const;
  if (currency === "USDT") return "balanceUsdt" as const;
  return "balanceXof" as const;
};

const parsePositiveNumber = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parseOptionalDate = (value: unknown) => {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
};

async function ensureBdoUnitDefinitionsSeeded() {
  const tenantId = await resolveBdoTenantId();
  const existing = await db.query.bdoGoldUnitDefinitions.findFirst({ where: eq(bdoGoldUnitDefinitions.tenantId, tenantId) });
  if (existing) return;

  const now = new Date();
  await db
    .insert(bdoGoldUnitDefinitions)
    .values([
      { tenantId, unitSizeGrams: 10, purityMin: "0.9000", purityMax: "0.9999", availability: true, createdAt: now, updatedAt: now },
      { tenantId, unitSizeGrams: 20, purityMin: "0.9000", purityMax: "0.9999", availability: true, createdAt: now, updatedAt: now },
      { tenantId, unitSizeGrams: 50, purityMin: "0.9000", purityMax: "0.9999", availability: true, createdAt: now, updatedAt: now },
      { tenantId, unitSizeGrams: 100, purityMin: "0.9000", purityMax: "0.9999", availability: true, createdAt: now, updatedAt: now },
    ])
    .onConflictDoNothing();
}

async function getOrCreatePricingSnapshot(currency: WalletCurrency) {
  const tenantId = await resolveBdoTenantId();
  const recent = await db.query.bdoPricingSnapshots.findFirst({
    where: and(eq(bdoPricingSnapshots.tenantId, tenantId), eq(bdoPricingSnapshots.currency, currency)),
    orderBy: desc(bdoPricingSnapshots.createdAt),
  });

  if (recent && recent.createdAt && Date.now() - new Date(recent.createdAt).getTime() < 10 * 60 * 1000) {
    return recent;
  }

  const [lbma, fxSnapshot] = await Promise.all([
    getLBMAPrice(),
    getFxSnapshot(BDO_FX_SCOPE),
  ]);
  const perGramUsd = parseFloat(lbma.pricePerGramUsd);
  const fxXofPerUsd = getUsdConversionRateForCurrency(fxSnapshot.effectiveRates, "XOF");
  const fxEurPerUsd = getUsdConversionRateForCurrency(fxSnapshot.effectiveRates, "EUR");
  const fxAedPerUsd = getUsdConversionRateForCurrency(fxSnapshot.effectiveRates, "AED");

  let pricePerGram = perGramUsd;
  if (currency === "XOF") pricePerGram = perGramUsd * fxXofPerUsd;
  else if (currency === "EUR") pricePerGram = perGramUsd * fxEurPerUsd;
  else if (currency === "AED") pricePerGram = perGramUsd * fxAedPerUsd;
  else if (currency === "USDT") pricePerGram = perGramUsd;

  const [snapshot] = await db
    .insert(bdoPricingSnapshots)
    .values({
      tenantId,
      pricePerGram: pricePerGram.toFixed(6),
      currency,
      pricingMethodId: "internal_lbma_cache",
      sourceMeta: {
        note: "Internal pricing snapshot derived from cached reference; do not present external sources in UI unless approved.",
        fxUpdatedAt: fxSnapshot.updatedAt,
        fxProviderTimestamp: fxSnapshot.providerTimestamp,
        fxOverrideApplied: fxSnapshot.overrideApplied,
      },
      createdAt: new Date(),
    })
    .returning();

  return snapshot;
}

async function ensureBdoVault(userId: number) {
  const tenantId = await resolveBdoTenantId();
  let vault = await db.query.bdoVirtualVaults.findFirst({
    where: and(eq(bdoVirtualVaults.tenantId, tenantId), eq(bdoVirtualVaults.ownerUserId, userId)),
  });

  if (!vault) {
    const [created] = await db
      .insert(bdoVirtualVaults)
      .values({
        tenantId,
        ownerUserId: userId,
        custodyLocation: "virtual_vault",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    vault = created;
  }

  return vault;
}

async function ensureTraderWallet(userId: number, primaryCurrency: WalletCurrency) {
  const tenantId = await resolveBdoTenantId();
  let wallet = await db.query.traderWallets.findFirst({
    where: and(eq(traderWallets.tenantId, tenantId), eq(traderWallets.userId, userId)),
  });

  if (!wallet) {
    const [created] = await db
      .insert(traderWallets)
      .values({
        tenantId,
        userId,
        primaryCurrency,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    wallet = created;
  }

  return wallet;
}

function isConfirmedClient(user: any): boolean {
  const perms = Array.isArray(user?.permissions) ? user.permissions.map(String) : [];
  const roles = Array.isArray(user?.roles) ? user.roles.map(String) : [];
  return (
    perms.includes("*") ||
    perms.includes("confirmed_client") ||
    perms.includes("secondary_market_access") ||
    roles.includes("confirmed_client")
  );
}

async function hasApprovedMarketAccess(userId: number, marketKey: string) {
  const access = await db.query.marketAccessRequests.findFirst({
    where: and(eq(marketAccessRequests.userId, userId), eq(marketAccessRequests.marketKey, marketKey), eq(marketAccessRequests.status, "approved")),
    orderBy: desc(marketAccessRequests.updatedAt),
  });
  return !!access;
}

async function requireConfirmedClient(user: any) {
  if (isConfirmedClient(user)) return true;
  return hasApprovedMarketAccess(user.id, "secondary_market");
}

async function ensurePlatformUser() {
  let platform = await db.query.eceUsers.findFirst({
    where: or(eq(eceUsers.role, "admin"), sql`${eceUsers.roles}::text ILIKE '%admin%'`),
    orderBy: asc(eceUsers.id),
  });

  if (!platform) {
    const passwordHash = await bcrypt.hash(`platform-${nanoid(16)}`, 10);
    const [created] = await db
      .insert(eceUsers)
      .values({
        email: "platform@bourse.local",
        passwordHash,
        displayName: "Bourse de l’Or Platform",
        role: "admin",
        roles: ["admin"],
        permissions: ["*"],
        isActive: true,
        emailVerified: true,
        currentMode: "admin",
        buyerType: "retail",
        metadata: { seeded: true, profileComplete: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    platform = created;
  }

  return platform;
}

type DbTx = Parameters<typeof db.transaction>[0] extends (tx: infer T) => any ? T : any;

async function walletTransferTx(
  tx: DbTx,
  args: {
  fromUserId: number;
  toUserId: number;
  currency: WalletCurrency;
  amount: string;
  type: "payment" | "transfer" | "refund";
  notes?: string;
  metadata?: Record<string, any>;
},
) {
  const now = new Date();
  const amountNum = parseFloat(args.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) throw new Error("Invalid transfer amount");

  const fromWallet = await tx.query.traderWallets.findFirst({
    where: eq(traderWallets.userId, args.fromUserId),
  });
  const toWallet = await tx.query.traderWallets.findFirst({
    where: eq(traderWallets.userId, args.toUserId),
  });

  if (!fromWallet || !toWallet) throw new Error("Wallet not found");

  const field = balanceFieldForCurrency(args.currency);
  const fromBefore = parseFloat((fromWallet as any)[field] || "0");
  const toBefore = parseFloat((toWallet as any)[field] || "0");

  if (fromBefore < amountNum) throw new Error("Insufficient funds");

  const fromAfter = fromBefore - amountNum;
  const toAfter = toBefore + amountNum;

  await tx
    .update(traderWallets)
    .set({ [field]: fromAfter.toFixed(4), updatedAt: now } as any)
    .where(eq(traderWallets.id, fromWallet.id));

  await tx
    .update(traderWallets)
    .set({ [field]: toAfter.toFixed(4), updatedAt: now } as any)
    .where(eq(traderWallets.id, toWallet.id));

  const notes = args.notes ? String(args.notes).slice(0, 500) : undefined;
  const debitMeta = {
    notes,
    ...(args.metadata ? { extra: args.metadata } : {}),
  } as any;

  const creditMeta = {
    notes,
    ...(args.metadata ? { extra: args.metadata } : {}),
  } as any;

  const [debit] = await tx
    .insert(goldWalletTransactions)
    .values({
      tenantId: fromWallet.tenantId,
      walletId: fromWallet.id,
      type: args.type,
      direction: "debit",
      amount: amountNum.toFixed(4),
      currency: args.currency,
      balanceBefore: fromBefore.toFixed(4),
      balanceAfter: fromAfter.toFixed(4),
      status: "completed",
      completedAt: now,
      metadata: debitMeta,
      createdAt: now,
    })
    .returning();

  const [credit] = await tx
    .insert(goldWalletTransactions)
    .values({
      tenantId: toWallet.tenantId,
      walletId: toWallet.id,
      type: args.type,
      direction: "credit",
      amount: amountNum.toFixed(4),
      currency: args.currency,
      balanceBefore: toBefore.toFixed(4),
      balanceAfter: toAfter.toFixed(4),
      status: "completed",
      completedAt: now,
      metadata: creditMeta,
      createdAt: now,
    })
    .returning();

  return { debitTx: debit, creditTx: credit };
}

	async function walletTransfer(args: Parameters<typeof walletTransferTx>[1]) {
	  return db.transaction((tx) => walletTransferTx(tx as DbTx, args));
	}
	
	async function walletOsTransferTx(
	  tx: DbTx,
	  args: {
	    fromWalletAccountId: string;
	    toWalletAccountId: string;
	    amount: number;
	    entryType: "TOPUP" | "PURCHASE" | "TRANSFER" | "PAYOUT" | "FEE" | "COMMISSION" | "ADJUSTMENT" | "REVERSAL" | "VOUCHER_REDEEM" | "VOUCHER_ISSUE" | "SELLER_CASHIN";
	    referenceType: "TOPUP" | "ORDER" | "TRANSFER" | "PAYOUT" | "VOUCHER" | "ADMIN_ADJ" | "SELLER_OP";
	    referenceId: string;
	    metadata?: Record<string, any>;
	  },
	) {
	  const now = new Date();
	  const amount = Math.trunc(Number(args.amount));
	  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid transfer amount");
	  if (args.fromWalletAccountId === args.toWalletAccountId) throw new Error("Wallet ids must differ");
	
	  const a = String(args.fromWalletAccountId);
	  const b = String(args.toWalletAccountId);
	  const [firstLock, secondLock] = a < b ? [a, b] : [b, a];
	
	  await tx.execute(sql`select id from wallet_accounts where id = ${firstLock} for update`);
	  await tx.execute(sql`select id from wallet_accounts where id = ${secondLock} for update`);
	
	  const fromWallet = await tx.query.walletAccounts.findFirst({
	    where: eq(walletAccounts.id, args.fromWalletAccountId as any),
	  });
	  const toWallet = await tx.query.walletAccounts.findFirst({
	    where: eq(walletAccounts.id, args.toWalletAccountId as any),
	  });
	
	  if (!fromWallet || !toWallet) throw new Error("Wallet not found");
	  if (fromWallet.status !== "ACTIVE") throw new Error("Wallet not active");
	  if (toWallet.status !== "ACTIVE") throw new Error("Wallet not active");
	
	  const fromLatest = await tx.query.walletLedgerEntries.findFirst({
	    where: eq(walletLedgerEntries.walletAccountId, args.fromWalletAccountId as any),
	    orderBy: desc(walletLedgerEntries.createdAt),
	  });
	  const toLatest = await tx.query.walletLedgerEntries.findFirst({
	    where: eq(walletLedgerEntries.walletAccountId, args.toWalletAccountId as any),
	    orderBy: desc(walletLedgerEntries.createdAt),
	  });
	
	  const fromBefore = fromLatest ? Number(fromLatest.balanceAfter || 0) : 0;
	  const toBefore = toLatest ? Number(toLatest.balanceAfter || 0) : 0;
	
	  if (fromBefore - amount < 0) throw new Error("insufficient_balance");
	
	  const [debit] = await tx
	    .insert(walletLedgerEntries)
	    .values({
	      walletAccountId: args.fromWalletAccountId,
	      direction: "DEBIT",
	      entryType: args.entryType,
	      amount,
	      balanceAfter: fromBefore - amount,
	      referenceType: args.referenceType,
	      referenceId: args.referenceId,
	      counterpartyWalletId: args.toWalletAccountId,
	      metadata: args.metadata ?? {},
	      createdAt: now,
	    })
	    .returning();
	
	  const [credit] = await tx
	    .insert(walletLedgerEntries)
	    .values({
	      walletAccountId: args.toWalletAccountId,
	      direction: "CREDIT",
	      entryType: args.entryType,
	      amount,
	      balanceAfter: toBefore + amount,
	      referenceType: args.referenceType,
	      referenceId: args.referenceId,
	      counterpartyWalletId: args.fromWalletAccountId,
	      metadata: args.metadata ?? {},
	      createdAt: now,
	    })
	    .returning();
	
	  await tx.update(walletAccounts).set({ updatedAt: now }).where(eq(walletAccounts.id, args.fromWalletAccountId as any));
	  await tx.update(walletAccounts).set({ updatedAt: now }).where(eq(walletAccounts.id, args.toWalletAccountId as any));
	
	  return { debitTx: debit, creditTx: credit };
	}
	
router.get("/lbma-price", async (req, res) => {
  try {
    const [price, fx] = await Promise.all([getLBMAPrice(), getFxSnapshot(BDO_FX_SCOPE)]);
    const eurPerUsd = getUsdConversionRateForCurrency(fx.effectiveRates, "EUR");
    const aedPerUsd = getUsdConversionRateForCurrency(fx.effectiveRates, "AED");
    const xofPerUsd = getUsdConversionRateForCurrency(fx.effectiveRates, "XOF");
    
    res.json({
      prices: {
        usd: {
          perOunce: parseFloat(price.pricePerOzUsd),
          perGram: parseFloat(price.pricePerGramUsd),
          perKg: parseFloat(price.pricePerKgUsd)
        },
        eur: {
          perOunce: parseFloat(price.pricePerOzEur || "0"),
          perGram: parseFloat(price.pricePerOzEur || "0") / TROY_OUNCE_TO_GRAMS,
          perKg: (parseFloat(price.pricePerOzEur || "0") / TROY_OUNCE_TO_GRAMS) * 1000
        },
        aed: {
          perOunce: parseFloat(price.pricePerOzAed || "0"),
          perGram: parseFloat(price.pricePerOzAed || "0") / TROY_OUNCE_TO_GRAMS,
          perKg: (parseFloat(price.pricePerOzAed || "0") / TROY_OUNCE_TO_GRAMS) * 1000
        },
        xof: {
          perOunce: parseFloat(price.pricePerOzXof || "0"),
          perGram: parseFloat(price.pricePerOzXof || "0") / TROY_OUNCE_TO_GRAMS,
          perKg: (parseFloat(price.pricePerOzXof || "0") / TROY_OUNCE_TO_GRAMS) * 1000
        }
      },
      fxRates: {
        EUR_USD: eurPerUsd,
        AED_USD: aedPerUsd,
        XOF_USD: xofPerUsd,
      },
      fxMeta: {
        updatedAt: fx.updatedAt,
        providerTimestamp: fx.providerTimestamp,
        isStale: fx.isStale,
        source: fx.source,
        overrideApplied: fx.overrideApplied,
      },
      fetchedAt: price.fetchedAt,
      validUntil: price.validUntil
    });
  } catch (error: any) {
    console.error("[Gold Exchange] LBMA price error:", error);
    res.status(500).json({ message: "Failed to fetch gold price" });
  }
});

router.get("/platform-stats", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(SUM(stock_quantity), 0) as total_grams,
        COUNT(DISTINCT seller_id) as total_sellers,
        COUNT(*) as total_products
      FROM seller_products 
      WHERE status = 'active' 
      AND (tags::text LIKE '%gold%' OR name ILIKE '%gold%' OR name ILIKE '%doré%')
    `);
    
    const stats = result.rows[0] as any;
    const totalKg = Number(stats.total_grams || 0) / 1000;
    
    res.json({
      totalGoldKg: totalKg,
      totalGoldGrams: Number(stats.total_grams || 0),
      totalSellers: Number(stats.total_sellers || 0),
      totalProducts: Number(stats.total_products || 0),
      formattedTotal: totalKg >= 1000 
        ? `${(totalKg / 1000).toFixed(1)} tonnes` 
        : `${totalKg.toFixed(0)} kg`
    });
  } catch (error: any) {
    console.error("[Gold Exchange] Platform stats error:", error);
    res.status(500).json({ message: "Failed to fetch platform stats" });
  }
});

router.post("/roi-calculator", async (req, res) => {
  try {
    const { 
      quantityKg, 
      purchaseDiscountPercent = 2,
      exportCostPercent = 1.5, 
      refineryFeePercent = 0.5, 
      logisticsCostUsd = 2500,
      currency = "USD" 
    } = req.body;
    
    if (!quantityKg || quantityKg <= 0) {
      return res.status(400).json({ message: "Valid quantity in kg is required" });
    }
    
    const price = await getLBMAPrice();
    const lbmaPricePerKg = parseFloat(price.pricePerKgUsd);
    
    const purchasePricePerKg = lbmaPricePerKg * (1 - purchaseDiscountPercent / 100);
    const totalPurchaseCost = purchasePricePerKg * quantityKg;
    
    const exportCost = totalPurchaseCost * (exportCostPercent / 100);
    const refineryFee = totalPurchaseCost * (refineryFeePercent / 100);
    const totalLogistics = logisticsCostUsd;
    
    const totalCost = totalPurchaseCost + exportCost + refineryFee + totalLogistics;
    
    const sellPriceAtLBMA = lbmaPricePerKg * quantityKg;
    
    const grossMargin = sellPriceAtLBMA - totalPurchaseCost;
    const netMargin = sellPriceAtLBMA - totalCost;
    const roiPercent = (netMargin / totalCost) * 100;
    
    const estimatedDays = 14;
    const annualizedRoi = (roiPercent / estimatedDays) * 365;
    
    const fxSnapshot = await getFxSnapshot(BDO_FX_SCOPE);
    const normalizedCurrency = String(currency || "USD").toUpperCase();
    let multiplier = 1;
    try {
      multiplier = getUsdConversionRateForCurrency(fxSnapshot.effectiveRates, normalizedCurrency);
    } catch {
      multiplier = 1;
    }
    
    res.json({
      input: {
        quantityKg,
        purchaseDiscountPercent,
        exportCostPercent,
        refineryFeePercent,
        logisticsCostUsd,
        currency
      },
      lbmaPrice: {
        perKg: lbmaPricePerKg,
        perGram: lbmaPricePerKg / 1000
      },
      breakdown: {
        purchasePricePerKg: purchasePricePerKg * multiplier,
        totalPurchaseCost: totalPurchaseCost * multiplier,
        exportCost: exportCost * multiplier,
        refineryFee: refineryFee * multiplier,
        logisticsCost: totalLogistics * multiplier,
        totalCost: totalCost * multiplier,
        sellPriceAtLBMA: sellPriceAtLBMA * multiplier
      },
      margins: {
        grossMargin: grossMargin * multiplier,
        netMargin: netMargin * multiplier,
        roiPercent: roiPercent,
        annualizedRoiPercent: annualizedRoi
      },
      timeline: {
        estimatedDays,
        stages: [
          { name: "Purchase & Escrow", days: 1 },
          { name: "Collection & Verification", days: 3 },
          { name: "Customs & Export", days: 3 },
          { name: "Transit to Dubai", days: 2 },
          { name: "Refinery Processing", days: 3 },
          { name: "Payment Release", days: 2 }
        ]
      }
    });
  } catch (error: any) {
    console.error("[Gold Exchange] ROI calculator error:", error);
    res.status(500).json({ message: "Failed to calculate ROI" });
  }
});

router.get("/bureaus", async (req, res) => {
  try {
    const { city, region, country, verified, hasOffers, authorizedOnly, includeAll } = req.query;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    const canIncludeAll =
      includeAll === "true" &&
      !!user &&
      ((user as any).role === "admin" ||
        (user as any).roles?.includes?.("admin") ||
        isChairmanAssistantUser(user));
    
    let conditions = [];
    if (!canIncludeAll) {
      if (authorizedOnly !== "false") conditions.push(eq(bureauDAchat.licenseStatus, "authorized"));
      conditions.push(eq(bureauDAchat.publicVisible, true));
      conditions.push(eq(bureauDAchat.isActive, true));
      conditions.push(eq(bureauDAchat.isVerified, true));
    }
    if (city) conditions.push(eq(bureauDAchat.city, city as string));
    if (region) conditions.push(or(eq(bureauDAchat.region, region as string), eq(bureauDAchat.city, region as string)));
    if (country) conditions.push(eq(bureauDAchat.country, country as string));
    if (verified === "true") conditions.push(eq(bureauDAchat.isVerified, true));
    
    let bureaus = await db.select().from(bureauDAchat)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(bureauDAchat.rating));
    
    if (bureaus.length === 0) {
      await seedBureauDAchat();
      bureaus = await db.select().from(bureauDAchat).orderBy(desc(bureauDAchat.rating));
    }

    const isDemo = isDemoModeRequest(req);
    const response = isDemo
      ? bureaus.map((b) => {
          const label = demoCompanyName(b.id, "bureau");
          const suffix = String(b.id).padStart(4, "0");
          return {
            ...b,
            legalName: label,
            name: label,
            licenseNumber: b.licenseNumber ? `DEMO-LIC-${suffix}` : b.licenseNumber,
            authorizationNumber: `DEMO-AUTH-${suffix}`,
            managers: [],
            phones: [],
            contactPhone: null,
            email: null,
            locationDetail: null,
          };
        })
      : bureaus;

    res.json(response);
  } catch (error: any) {
    console.error("[Gold Exchange] Bureaus fetch error:", error);
    res.status(500).json({ message: "Failed to fetch bureaus" });
  }
});

router.get("/bureaus/:id", async (req, res) => {
  try {
    const bureauId = parseInt(req.params.id);
    
    const bureau = await db.query.bureauDAchat.findFirst({
      where: eq(bureauDAchat.id, bureauId)
    });
    
    if (!bureau) {
      return res.status(404).json({ message: "Bureau not found" });
    }
    
    const offers = await db.select().from(goldOffers)
      .where(and(eq(goldOffers.bureauId, bureauId), eq(goldOffers.isAvailable, true)))
      .orderBy(desc(goldOffers.createdAt));

    const isDemo = isDemoModeRequest(req);
    const bureauResponse = isDemo
      ? (() => {
          const label = demoCompanyName(bureau.id, "bureau");
          const suffix = String(bureau.id).padStart(4, "0");
          return {
            ...bureau,
            legalName: label,
            name: label,
            licenseNumber: bureau.licenseNumber ? `DEMO-LIC-${suffix}` : bureau.licenseNumber,
            authorizationNumber: `DEMO-AUTH-${suffix}`,
            managers: [],
            phones: [],
            contactPhone: null,
            email: null,
            locationDetail: null,
          };
        })()
      : bureau;

    res.json({ bureau: bureauResponse, offers });
  } catch (error: any) {
    console.error("[Gold Exchange] Bureau detail error:", error);
    res.status(500).json({ message: "Failed to fetch bureau details" });
  }
});

router.get("/offers", async (req, res) => {
  try {
    const { bureauId, minWeight, maxWeight, minPurity, available } = req.query;
    
    let conditions = [];
    if (bureauId) conditions.push(eq(goldOffers.bureauId, parseInt(bureauId as string)));
    if (available !== "false") conditions.push(eq(goldOffers.isAvailable, true));
    if (minWeight) conditions.push(gte(goldOffers.weightGrams, minWeight as string));
    if (maxWeight) conditions.push(lte(goldOffers.weightGrams, maxWeight as string));
    if (minPurity) conditions.push(gte(goldOffers.purityCarat, minPurity as string));
    
    const offers = await db.select({
      offer: goldOffers,
      bureau: bureauDAchat
    })
      .from(goldOffers)
      .leftJoin(bureauDAchat, eq(goldOffers.bureauId, bureauDAchat.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(goldOffers.createdAt));

    const isDemo = isDemoModeRequest(req);
    res.json(
      offers.map((o) => {
        if (!isDemo || !o.bureau) return { ...o.offer, bureau: o.bureau };
        const label = demoCompanyName(o.bureau.id, "bureau");
        const suffix = String(o.bureau.id).padStart(4, "0");
        return {
          ...o.offer,
          bureau: {
            ...o.bureau,
            legalName: label,
            name: label,
            licenseNumber: o.bureau.licenseNumber ? `DEMO-LIC-${suffix}` : o.bureau.licenseNumber,
            authorizationNumber: `DEMO-AUTH-${suffix}`,
            managers: [],
            phones: [],
            contactPhone: null,
            email: null,
            locationDetail: null,
          },
        };
      }),
    );
  } catch (error: any) {
    console.error("[Gold Exchange] Offers fetch error:", error);
    res.status(500).json({ message: "Failed to fetch offers" });
  }
});

router.post("/offers", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(500).json({ message: "Tenant not resolved" });
    }
    const { 
      bureauId, weightGrams, purityCarat, pricePerGramUsd, 
      discountPercent, productionType, sourceRegion, photos 
    } = req.body;
    
    if (!bureauId || !weightGrams || !purityCarat) {
      return res.status(400).json({ message: "bureauId, weightGrams, and purityCarat are required" });
    }
    
    const fineWeight = (parseFloat(weightGrams) * (parseFloat(purityCarat) / 24)).toFixed(4);
    
    const [offer] = await db.insert(goldOffers).values({
      tenantId,
      bureauId,
      weightGrams,
      purityCarat,
      fineWeightGrams: fineWeight,
      pricePerGramUsd: pricePerGramUsd || null,
      discountPercent: discountPercent || "0.00",
      productionType: productionType || "artisanal",
      sourceRegion,
      batchId: `BATCH-${nanoid(8).toUpperCase()}`,
      photos: photos || [],
      isAvailable: true,
      metadata: {}
    }).returning();
    
    res.status(201).json(offer);
  } catch (error: any) {
    console.error("[Gold Exchange] Create offer error:", error);
    res.status(500).json({ message: "Failed to create offer" });
  }
});

router.get("/wallet/:userId", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const authUser = (req as any).user;
    
    if (authUser.id !== userId) {
      return res.status(403).json({ error: "Cannot access another user's wallet" });
    }

    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(500).json({ message: "Tenant not resolved" });
    }
    
    let wallet = await db.query.traderWallets.findFirst({
      where: and(eq(traderWallets.tenantId, tenantId), eq(traderWallets.userId, userId))
    });
    
    if (!wallet) {
      const [newWallet] = await db.insert(traderWallets).values({
        tenantId,
        userId,
        primaryCurrency: "USD"
      }).returning();
      wallet = newWallet;
    }
    
    const recentTransactions = await db.select().from(goldWalletTransactions)
      .where(and(eq(goldWalletTransactions.tenantId, tenantId), eq(goldWalletTransactions.walletId, wallet.id)))
      .orderBy(desc(goldWalletTransactions.createdAt))
      .limit(20);
    
    res.json({ wallet, recentTransactions });
  } catch (error: any) {
    console.error("[Gold Exchange] Wallet fetch error:", error);
    res.status(500).json({ message: "Failed to fetch wallet" });
  }
});

router.post("/wallet/:userId/deposit", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const authUser = (req as any).user;
    
    if (authUser.id !== userId) {
      return res.status(403).json({ error: "Cannot deposit to another user's wallet" });
    }
    
    const { amount, currency, paymentMethod, externalReference } = req.body;
    
    if (!amount || !currency) {
      return res.status(400).json({ message: "amount and currency are required" });
    }

    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(500).json({ message: "Tenant not resolved" });
    }
    
    let wallet = await db.query.traderWallets.findFirst({
      where: and(eq(traderWallets.tenantId, tenantId), eq(traderWallets.userId, userId))
    });
    
    if (!wallet) {
      const [newWallet] = await db.insert(traderWallets).values({
        tenantId,
        userId,
        primaryCurrency: currency
      }).returning();
      wallet = newWallet;
    }
    
    const currencyField = `balance${currency.charAt(0).toUpperCase() + currency.slice(1).toLowerCase()}` as keyof typeof wallet;
    const currentBalance = parseFloat(wallet[currencyField] as string || "0");
    const newBalance = currentBalance + parseFloat(amount);
    
    await db.update(traderWallets)
      .set({ 
        [currencyField]: newBalance.toFixed(4),
        updatedAt: new Date()
      })
      .where(eq(traderWallets.id, wallet.id));
    
    const [transaction] = await db.insert(goldWalletTransactions).values({
      tenantId,
      walletId: wallet.id,
      type: "deposit",
      direction: "credit",
      amount,
      currency: currency.toUpperCase(),
      balanceBefore: currentBalance.toFixed(4),
      balanceAfter: newBalance.toFixed(4),
      paymentMethod,
      externalReference,
      status: "completed",
      completedAt: new Date()
    }).returning();
    
    await writeAudit(req, {
      userId: authUser?.id,
      userRole: authUser?.role ?? null,
      action: "wallet_deposit",
      entityType: "gold_wallet_transaction",
      entityId: transaction.id,
      metadata: { amount, currency: String(currency).toUpperCase(), paymentMethod, externalReference },
    });

    res.json({
      message: "Deposit successful",
      transaction,
      newBalance: newBalance.toFixed(4)
    });
  } catch (error: any) {
    console.error("[Gold Exchange] Deposit error:", error);
    res.status(500).json({ message: "Failed to process deposit" });
  }
});

router.post("/budget-allocation", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(500).json({ message: "Tenant not resolved" });
    }
    const { budgetUsd, currency = "USD" } = req.body;
    const userId = authUser.id;
    
    if (!budgetUsd) {
      return res.status(400).json({ message: "budgetUsd is required" });
    }
    
    const price = await getLBMAPrice();
    const lbmaPricePerKg = parseFloat(price.pricePerKgUsd);
    const avgDiscount = 0.02;
    const purchasePrice = lbmaPricePerKg * (1 - avgDiscount);
    
    const maxKg = parseFloat(budgetUsd) / purchasePrice;
    
    const availableOffers = await db.select({
      offer: goldOffers,
      bureau: bureauDAchat
    })
      .from(goldOffers)
      .leftJoin(bureauDAchat, eq(goldOffers.bureauId, bureauDAchat.id))
      .where(eq(goldOffers.isAvailable, true))
      .orderBy(desc(goldOffers.weightGrams));
    
    const selectedOffers = [];
    let remainingBudget = parseFloat(budgetUsd);
    let totalWeight = 0;
    
    for (const item of availableOffers) {
      const offer = item.offer;
      const bureau = item.bureau;
      
      const offerPrice = offer.pricePerGramUsd 
        ? parseFloat(offer.pricePerGramUsd) * parseFloat(offer.weightGrams)
        : purchasePrice * (parseFloat(offer.weightGrams) / 1000);
      
      if (offerPrice <= remainingBudget) {
        selectedOffers.push({
          offer,
          bureau,
          estimatedPrice: offerPrice
        });
        remainingBudget -= offerPrice;
        totalWeight += parseFloat(offer.weightGrams);
      }
    }
    
    const [groupage] = await db.insert(goldGroupages).values({
      tenantId,
      buyerUserId: userId,
      totalBudgetUsd: budgetUsd,
      allocatedBudgetUsd: (parseFloat(budgetUsd) - remainingBudget).toFixed(4),
      currency,
      totalWeightGrams: totalWeight.toFixed(4),
      exportHub: "Abidjan",
      status: "planning",
      sellerCount: new Set(selectedOffers.map(o => o.bureau?.id)).size,
      estimatedDeliveryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }).returning();
    
    res.json({
      groupage,
      analysis: {
        maxPurchasableKg: maxKg.toFixed(4),
        lbmaPricePerKg,
        avgPurchasePrice: purchasePrice.toFixed(2),
        avgDiscountPercent: avgDiscount * 100
      },
      selectedOffers,
      summary: {
        totalOffers: selectedOffers.length,
        totalWeightGrams: totalWeight.toFixed(4),
        totalWeightKg: (totalWeight / 1000).toFixed(4),
        allocatedBudget: (parseFloat(budgetUsd) - remainingBudget).toFixed(2),
        remainingBudget: remainingBudget.toFixed(2),
        uniqueSellers: new Set(selectedOffers.map(o => o.bureau?.id)).size
      }
    });
  } catch (error: any) {
    console.error("[Gold Exchange] Budget allocation error:", error);
    res.status(500).json({ message: "Failed to process budget allocation" });
  }
});

router.post("/orders", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(500).json({ message: "Tenant not resolved" });
    }
    const { 
      bureauId, offerId, groupageId,
      weightGrams, purityCarat, pricePerGramUsd 
    } = req.body;
    const buyerUserId = authUser.id;
    
    if (!bureauId || !weightGrams || !purityCarat || !pricePerGramUsd) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    const totalPrice = parseFloat(weightGrams) * parseFloat(pricePerGramUsd);
    const fineWeight = (parseFloat(weightGrams) * (parseFloat(purityCarat) / 24)).toFixed(4);
    
    const orderNumber = `GEX-${Date.now()}-${nanoid(6).toUpperCase()}`;
    
    const [order] = await db.insert(goldPurchaseOrders).values({
      tenantId,
      orderNumber,
      buyerUserId,
      bureauId,
      offerId: offerId || null,
      groupageId: groupageId || null,
      weightGrams,
      purityCarat,
      fineWeightGrams: fineWeight,
      pricePerGramUsd,
      totalPriceUsd: totalPrice.toFixed(4),
      escrowAmountUsd: totalPrice.toFixed(4),
      status: "pending",
      metadata: {}
    }).returning();
    
    const deliverySteps = [
      { step: "order_confirmed", stepNumber: 1, title: "Order Confirmed", description: "Your order has been placed and is awaiting seller confirmation" },
      { step: "seller_preparing", stepNumber: 2, title: "Seller Preparing Gold", description: "The seller is preparing your gold for pickup" },
      { step: "pickup_scheduled", stepNumber: 3, title: "Pickup Scheduled", description: "A pickup has been scheduled with the delivery agent" },
      { step: "gold_collected", stepNumber: 4, title: "Gold Collected", description: "The gold has been collected from the seller" },
      { step: "assay_completed", stepNumber: 5, title: "Assay Completed", description: "Weight and purity have been verified" },
      { step: "customs_cleared", stepNumber: 6, title: "Customs Cleared", description: "Export customs clearance completed" },
      { step: "flight_departed", stepNumber: 7, title: "Flight Departed", description: "Gold is in transit to destination" },
      { step: "arrival_dubai", stepNumber: 8, title: "Arrival in Dubai", description: "Gold has arrived at destination" },
      { step: "delivery_refinery", stepNumber: 9, title: "Delivery to Refinery", description: "Gold delivered to the refinery" },
      { step: "payment_released", stepNumber: 10, title: "Payment Released", description: "Payment has been released to seller" }
    ];
    
    for (const step of deliverySteps) {
      await db.insert(goldDeliveryEvents).values({
        tenantId,
        orderId: order.id,
        step: step.step as any,
        stepNumber: step.stepNumber,
        title: step.title,
        description: step.description,
        isCompleted: false
      });
    }
    
    await db.update(goldDeliveryEvents)
      .set({ isCompleted: true, completedAt: new Date() })
      .where(and(eq(goldDeliveryEvents.orderId, order.id), eq(goldDeliveryEvents.stepNumber, 1)));
    
    await db.update(goldPurchaseOrders)
      .set({ currentDeliveryStep: "order_confirmed" })
      .where(eq(goldPurchaseOrders.id, order.id));
    
    res.status(201).json(order);
  } catch (error: any) {
    console.error("[Gold Exchange] Create order error:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
});

router.get("/orders/:orderId", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const orderId = parseInt(req.params.orderId);
    
    const order = await db.query.goldPurchaseOrders.findFirst({
      where: eq(goldPurchaseOrders.id, orderId)
    });
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (order.buyerUserId !== authUser.id) {
      return res.status(403).json({ error: "Cannot access another user's order" });
    }
    
    const bureau = await db.query.bureauDAchat.findFirst({
      where: eq(bureauDAchat.id, order.bureauId)
    });
    
    const deliveryEvents = await db.select().from(goldDeliveryEvents)
      .where(eq(goldDeliveryEvents.orderId, orderId))
      .orderBy(asc(goldDeliveryEvents.stepNumber));
    
    const documents = await db.select().from(goldOriginDocuments)
      .where(eq(goldOriginDocuments.orderId, orderId));
    
    res.json({ order, bureau, deliveryEvents, documents });
  } catch (error: any) {
    console.error("[Gold Exchange] Order detail error:", error);
    res.status(500).json({ message: "Failed to fetch order details" });
  }
});

router.get("/orders/user/:userId", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const userId = parseInt(req.params.userId);
    
    if (authUser.id !== userId) {
      return res.status(403).json({ error: "Cannot access another user's orders" });
    }
    
    const orders = await db.select({
      order: goldPurchaseOrders,
      bureau: bureauDAchat
    })
      .from(goldPurchaseOrders)
      .leftJoin(bureauDAchat, eq(goldPurchaseOrders.bureauId, bureauDAchat.id))
      .where(eq(goldPurchaseOrders.buyerUserId, userId))
      .orderBy(desc(goldPurchaseOrders.createdAt));
    
    res.json(orders.map(o => ({ ...o.order, bureau: o.bureau })));
  } catch (error: any) {
    console.error("[Gold Exchange] User orders fetch error:", error);
    res.status(500).json({ message: "Failed to fetch user orders" });
  }
});

router.patch("/orders/:orderId/delivery-step", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const orderId = parseInt(req.params.orderId);
    const { step, location, notes, documents, photos } = req.body;
    
    const order = await db.query.goldPurchaseOrders.findFirst({
      where: eq(goldPurchaseOrders.id, orderId)
    });
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (order.buyerUserId !== authUser.id) {
      return res.status(403).json({ error: "Cannot update another user's order" });
    }
    
    const deliveryEvent = await db.query.goldDeliveryEvents.findFirst({
      where: and(eq(goldDeliveryEvents.orderId, orderId), eq(goldDeliveryEvents.step, step))
    });
    
    if (!deliveryEvent) {
      return res.status(404).json({ message: "Delivery step not found" });
    }
    
    await db.update(goldDeliveryEvents)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        location,
        performedByUserId: authUser.id,
        documents: documents || [],
        photos: photos || [],
        metadata: { notes }
      })
      .where(eq(goldDeliveryEvents.id, deliveryEvent.id));
    
    await db.update(goldPurchaseOrders)
      .set({ 
        currentDeliveryStep: step,
        updatedAt: new Date()
      })
      .where(eq(goldPurchaseOrders.id, orderId));
    
    res.json({ message: "Delivery step updated successfully" });
  } catch (error: any) {
    console.error("[Gold Exchange] Update delivery step error:", error);
    res.status(500).json({ message: "Failed to update delivery step" });
  }
});

router.get("/delivery-tracking/:orderId", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const orderId = parseInt(req.params.orderId);
    
    const order = await db.query.goldPurchaseOrders.findFirst({
      where: eq(goldPurchaseOrders.id, orderId)
    });
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (order.buyerUserId !== authUser.id) {
      return res.status(403).json({ error: "Cannot access another user's delivery tracking" });
    }
    
    const deliveryEvents = await db.select().from(goldDeliveryEvents)
      .where(eq(goldDeliveryEvents.orderId, orderId))
      .orderBy(asc(goldDeliveryEvents.stepNumber));
    
    const completedSteps = deliveryEvents.filter(e => e.isCompleted).length;
    const totalSteps = deliveryEvents.length;
    const progressPercent = (completedSteps / totalSteps) * 100;
    
    const currentStep = deliveryEvents.find(e => !e.isCompleted) || deliveryEvents[deliveryEvents.length - 1];
    
    res.json({
      orderNumber: order.orderNumber,
      status: order.status,
      progress: {
        completedSteps,
        totalSteps,
        progressPercent
      },
      currentStep: currentStep?.step,
      timeline: deliveryEvents.map(e => ({
        step: e.step,
        stepNumber: e.stepNumber,
        title: e.title,
        description: e.description,
        isCompleted: e.isCompleted,
        completedAt: e.completedAt,
        location: e.location,
        documents: e.documents,
        photos: e.photos
      }))
    });
  } catch (error: any) {
    console.error("[Gold Exchange] Delivery tracking error:", error);
    res.status(500).json({ message: "Failed to fetch delivery tracking" });
  }
});

// ========================================
// BDO — Wallet/Vault/Delivery/Secondary Market APIs
// ========================================

router.get("/bdo/unit-definitions", async (_req, res) => {
  try {
    await ensureBdoUnitDefinitionsSeeded();
    const defs = await db.query.bdoGoldUnitDefinitions.findMany({
      orderBy: asc(bdoGoldUnitDefinitions.unitSizeGrams),
    });
    res.json(defs);
  } catch (error: any) {
    console.error("[BDO] Unit definitions error:", error);
    res.status(500).json({ message: "Failed to load unit definitions" });
  }
});

router.get("/bdo/vault", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as any;
    const vault = await ensureBdoVault(user.id);
    const units = await db.query.bdoVaultGoldUnits.findMany({
      where: eq(bdoVaultGoldUnits.vaultId, vault.id),
      orderBy: [desc(bdoVaultGoldUnits.createdAt)],
    });

    const now = Date.now();
    const grams = units
      .filter((u) => u.status !== "sold")
      .reduce((sum, u) => sum + (u.unitSizeGrams || 0), 0);

    res.json({
      vault,
      totalGrams: grams,
      units: units.map((u) => ({
        ...u,
        isLocked: !!u.lockupEndDate && new Date(u.lockupEndDate).getTime() > now,
      })),
    });
  } catch (error: any) {
    console.error("[BDO] Vault fetch error:", error);
    res.status(500).json({ message: "Failed to fetch vault" });
  }
});

	router.post("/bdo/purchase", requireAuth, async (req, res) => {
	  try {
	    const user = (req as any).user as any;
	    const unitSizeGrams = parsePositiveNumber(req.body?.unitSizeGrams);
	    const currency = normalizeWalletCurrency(req.body?.currency);
	    const lockupEndDate = parseOptionalDate(req.body?.lockupEndDate);
	    const deliveryNow = Boolean(req.body?.deliveryNow);
	    const destination = req.body?.destination && typeof req.body.destination === "object" ? req.body.destination : {};

    if (!unitSizeGrams) {
      return res.status(400).json({ message: "unitSizeGrams is required" });
    }

    await ensureBdoUnitDefinitionsSeeded();
    const def = await db.query.bdoGoldUnitDefinitions.findFirst({
      where: eq(bdoGoldUnitDefinitions.unitSizeGrams, unitSizeGrams),
    });

    if (!def || !def.availability) {
      return res.status(400).json({ message: "Unsupported unit size" });
    }
	
	    const pricing = await getOrCreatePricingSnapshot(currency);
	    const pricePerGram = parseFloat(pricing.pricePerGram as any);
	    const totalPriceNum = unitSizeGrams * pricePerGram;
	    if (currency !== "XOF") {
	      return res.status(400).json({ message: "Wallet purchases currently support XOF only" });
	    }
	
	    const totalPriceXof = Math.max(1, Math.ceil(totalPriceNum));
	    const totalPrice = totalPriceXof.toFixed(4);
	
	    const platform = await ensurePlatformUser();
	    const buyerWalletAccount = await getOrCreateWalletAccount(String(user.id), "XOF");
	    const platformWalletAccount = await getOrCreateWalletAccount(String(platform.id), "XOF");
	
	    const vault = await ensureBdoVault(user.id);
	
	    const result = await db.transaction(async (tx) => {
	      const now = new Date();

      const [acq] = await tx
        .insert(bdoGoldAcquisitionRecords)
	        .values({
	          tenantId: vault.tenantId,
	          userId: user.id,
	          unitSizeGrams,
	          purity: "0.9950",
	          timestamp: now,
	          pricePerGram: pricePerGram.toFixed(6),
	          totalPrice,
	          currency,
	          pricingSnapshotId: pricing.id,
	          allocatedLotIds: [],
	          proofDocs: [],
	          custodyLocation: "virtual_vault",
	          lockupEndDate: lockupEndDate || null,
	          status: "stored",
	          metadata: { kind: "bdo_purchase", deliveryNow },
	          createdAt: now,
	        })
	        .returning();

      const [unit] = await tx
        .insert(bdoVaultGoldUnits)
        .values({
          tenantId: vault.tenantId,
          vaultId: vault.id,
          acquisitionId: acq.id,
          unitSizeGrams,
          purity: "0.9950",
          status: "stored",
          lockupEndDate: lockupEndDate || null,
          deliveryStatus: "created",
          metadata: { createdBy: "purchase" },
          createdAt: now,
          updatedAt: now,
        })
	        .returning();
	
	      const transfer = await walletOsTransferTx(tx as DbTx, {
	        fromWalletAccountId: buyerWalletAccount.id,
	        toWalletAccountId: platformWalletAccount.id,
	        amount: totalPriceXof,
	        entryType: "PURCHASE",
	        referenceType: "SELLER_OP",
	        referenceId: `bdo_purchase:${acq.id}`,
	        metadata: { acquisitionId: acq.id, vaultUnitId: unit.id, kind: "bdo_purchase", unitSizeGrams, currency: "XOF" },
	      });

      let deliveryOrder = null as any;
      if (deliveryNow) {
        const deliveredAt = new Date();
        const [order] = await tx
          .insert(bdoDeliveryOrders)
          .values({
            tenantId: vault.tenantId,
            userId: user.id,
            vaultUnitId: unit.id,
            carrierId: "internal",
            destination,
            fees: "0.00",
            currency,
            status: "delivered",
            trackingEvents: [
              { eventType: "order_created", description: "Delivery requested", timestamp: now.toISOString() },
              { eventType: "delivered", description: "Delivered", timestamp: deliveredAt.toISOString() },
            ],
            proofDocs: [],
            deliveredAt,
            metadata: { kind: "delivery_now" },
            createdAt: now,
            updatedAt: deliveredAt,
          })
          .returning();

        deliveryOrder = order;

        await tx
          .update(bdoVaultGoldUnits)
          .set({ status: "delivered", deliveryStatus: "delivered", updatedAt: deliveredAt })
          .where(eq(bdoVaultGoldUnits.id, unit.id));

        await tx.update(bdoGoldAcquisitionRecords).set({ status: "delivered" }).where(eq(bdoGoldAcquisitionRecords.id, acq.id));
      }

	      return { acquisition: acq, unit, transfer, deliveryOrder };
	    });

    await writeAudit(req, {
      userId: user?.id,
      userRole: user?.role ?? null,
      action: "bdo_purchase_unit",
      entityType: "bdo_gold_acquisition_record",
      entityId: result?.acquisition?.id ?? null,
      metadata: {
        unitSizeGrams,
        currency,
        totalPrice: result?.acquisition?.totalPrice,
        pricingSnapshotId: result?.acquisition?.pricingSnapshotId,
        lockupEndDate: lockupEndDate ? lockupEndDate.toISOString() : null,
        deliveryNow,
      },
    });

	    res.status(201).json(result);
	  } catch (error: any) {
	    const msg = String(error?.message || "");
	    if (msg.includes("insufficient_balance")) {
	      return res.status(400).json({ message: "Insufficient wallet balance" });
	    }
	    console.error("[BDO] Purchase error:", error);
	    res.status(500).json({ message: "Failed to purchase unit", error: error.message });
	  }
	});

router.post("/bdo/vault/:unitId/request-delivery", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as any;
    const unitId = parseInt(req.params.unitId);
    const destination = req.body?.destination && typeof req.body.destination === "object" ? req.body.destination : {};

    const vault = await ensureBdoVault(user.id);
    const unit = await db.query.bdoVaultGoldUnits.findFirst({
      where: and(eq(bdoVaultGoldUnits.id, unitId), eq(bdoVaultGoldUnits.vaultId, vault.id)),
    });

    if (!unit) return res.status(404).json({ message: "Unit not found" });
    if (unit.status !== "stored") return res.status(400).json({ message: "Unit is not eligible for delivery" });

    if (unit.lockupEndDate && new Date(unit.lockupEndDate).getTime() > Date.now()) {
      return res.status(400).json({ message: "Unit is locked until the lock-up end date" });
    }

    const now = new Date();
    const deliveredAt = new Date();
    const [order] = await db
      .insert(bdoDeliveryOrders)
      .values({
        tenantId: unit.tenantId,
        userId: user.id,
        vaultUnitId: unit.id,
        carrierId: "internal",
        destination,
        fees: "0.00",
        currency: "XOF",
        status: "delivered",
        trackingEvents: [
          { eventType: "order_created", description: "Delivery requested", timestamp: now.toISOString() },
          { eventType: "delivered", description: "Delivered", timestamp: deliveredAt.toISOString() },
        ],
        proofDocs: [],
        deliveredAt,
        createdAt: now,
        updatedAt: deliveredAt,
      })
      .returning();

    await db.update(bdoVaultGoldUnits).set({ status: "delivered", deliveryStatus: "delivered", updatedAt: deliveredAt }).where(eq(bdoVaultGoldUnits.id, unit.id));
    if (unit.acquisitionId) {
      await db.update(bdoGoldAcquisitionRecords).set({ status: "delivered" }).where(eq(bdoGoldAcquisitionRecords.id, unit.acquisitionId));
    }

    await writeAudit(req, {
      userId: user?.id,
      userRole: user?.role ?? null,
      action: "bdo_request_delivery",
      entityType: "bdo_delivery_order",
      entityId: order?.id ?? null,
      metadata: { vaultUnitId: unit.id, destination },
    });

    res.json({ message: "Delivery created", order });
  } catch (error: any) {
    console.error("[BDO] Delivery request error:", error);
    res.status(500).json({ message: "Failed to request delivery" });
  }
});

router.post("/bdo/vault/:unitId/authorize-resale", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as any;
    const unitId = parseInt(req.params.unitId);
    const commissionRate = req.body?.commissionRate ? String(req.body.commissionRate) : "0.1500";
    const listingDurationDays = Number.isFinite(Number(req.body?.listingDurationDays))
      ? Math.max(1, Math.min(365, Number(req.body.listingDurationDays)))
      : 30;
    const pricingRule = req.body?.pricingRule && typeof req.body.pricingRule === "object" ? req.body.pricingRule : {};

    const vault = await ensureBdoVault(user.id);
    const unit = await db.query.bdoVaultGoldUnits.findFirst({
      where: and(eq(bdoVaultGoldUnits.id, unitId), eq(bdoVaultGoldUnits.vaultId, vault.id)),
    });

    if (!unit) return res.status(404).json({ message: "Unit not found" });
    if (unit.status !== "stored") return res.status(400).json({ message: "Only stored units can be authorized for resale" });
    if (unit.lockupEndDate && new Date(unit.lockupEndDate).getTime() > Date.now()) {
      return res.status(400).json({ message: "Unit is locked until the lock-up end date" });
    }

    const existingActive = await db.query.bdoResaleAuthorizations.findFirst({
      where: and(eq(bdoResaleAuthorizations.vaultUnitId, unit.id), eq(bdoResaleAuthorizations.status, "active")),
      orderBy: desc(bdoResaleAuthorizations.createdAt),
    });

    if (existingActive) {
      return res.json({ authorization: existingActive, message: "Resale already authorized" });
    }

    const now = new Date();
    const [authorization] = await db
      .insert(bdoResaleAuthorizations)
      .values({
        tenantId: unit.tenantId,
        vaultUnitId: unit.id,
        ownerUserId: user.id,
        authorizedAt: now,
        commissionRate,
        listingDurationDays,
        pricingRule,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await writeAudit(req, {
      userId: user?.id,
      userRole: user?.role ?? null,
      action: "bdo_authorize_resale",
      entityType: "bdo_resale_authorization",
      entityId: authorization?.id ?? null,
      metadata: { vaultUnitId: unit.id, commissionRate, listingDurationDays, pricingRule },
    });

    res.status(201).json({ authorization });
  } catch (error: any) {
    console.error("[BDO] Resale authorization error:", error);
    res.status(500).json({ message: "Failed to authorize resale" });
  }
});

router.post("/bdo/secondary-market/listings", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as any;
    const unitId = parseInt(req.body?.unitId);
    const pricingRule = req.body?.pricingRule && typeof req.body.pricingRule === "object" ? req.body.pricingRule : {};

    if (!unitId) return res.status(400).json({ message: "unitId is required" });

    const vault = await ensureBdoVault(user.id);
    const unit = await db.query.bdoVaultGoldUnits.findFirst({
      where: and(eq(bdoVaultGoldUnits.id, unitId), eq(bdoVaultGoldUnits.vaultId, vault.id)),
    });

    if (!unit) return res.status(404).json({ message: "Unit not found" });
    if (unit.status !== "stored") return res.status(400).json({ message: "Unit is not eligible for listing" });

    const authorization = await db.query.bdoResaleAuthorizations.findFirst({
      where: and(eq(bdoResaleAuthorizations.vaultUnitId, unit.id), eq(bdoResaleAuthorizations.status, "active")),
      orderBy: desc(bdoResaleAuthorizations.createdAt),
    });

    if (!authorization) return res.status(400).json({ message: "Resale authorization required" });
    if (authorization.ownerUserId !== user.id) return res.status(403).json({ message: "Not authorized for this unit" });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + authorization.listingDurationDays * 24 * 60 * 60 * 1000);

    const [listing] = await db
      .insert(bdoSecondaryMarketListings)
      .values({
        tenantId: unit.tenantId,
        vaultUnitId: unit.id,
        sellerUserId: user.id,
        visibleTo: "confirmed_clients_only",
        pricingRule: Object.keys(pricingRule).length ? pricingRule : authorization.pricingRule,
        status: "active",
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.update(bdoVaultGoldUnits).set({ status: "listed_for_resale", resaleListingId: listing.id, updatedAt: now }).where(eq(bdoVaultGoldUnits.id, unit.id));
    if (unit.acquisitionId) {
      await db.update(bdoGoldAcquisitionRecords).set({ status: "listed_for_resale" }).where(eq(bdoGoldAcquisitionRecords.id, unit.acquisitionId));
    }

    await writeAudit(req, {
      userId: user?.id,
      userRole: user?.role ?? null,
      action: "bdo_create_listing",
      entityType: "bdo_secondary_market_listing",
      entityId: listing?.id ?? null,
      metadata: { vaultUnitId: unit.id, pricingRule: (listing as any)?.pricingRule ?? pricingRule },
    });

    res.status(201).json({ listing });
  } catch (error: any) {
    console.error("[BDO] Listing creation error:", error);
    res.status(500).json({ message: "Failed to create listing" });
  }
});

router.get("/bdo/secondary-market/listings", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as any;
    const allowed = await requireConfirmedClient(user);
    if (!allowed) {
      return res.status(403).json({ message: "Secondary market is restricted to confirmed clients" });
    }

    const now = new Date();
    const listings = await db.query.bdoSecondaryMarketListings.findMany({
      where: and(eq(bdoSecondaryMarketListings.status, "active"), or(sql`${bdoSecondaryMarketListings.expiresAt} IS NULL`, gte(bdoSecondaryMarketListings.expiresAt, now))),
      orderBy: [desc(bdoSecondaryMarketListings.createdAt)],
      limit: 100,
    });

    res.json({ listings });
  } catch (error: any) {
    console.error("[BDO] Listings fetch error:", error);
    res.status(500).json({ message: "Failed to fetch listings" });
  }
});

router.post("/bdo/secondary-market/listings/:listingId/buy", requireAuth, async (req, res) => {
  try {
    const buyer = (req as any).user as any;
    const allowed = await requireConfirmedClient(buyer);
    if (!allowed) {
      return res.status(403).json({ message: "Secondary market is restricted to confirmed clients" });
    }

    const listingId = parseInt(req.params.listingId);
    const deliveryNow = Boolean(req.body?.deliveryNow);
    const destination = req.body?.destination && typeof req.body.destination === "object" ? req.body.destination : {};

    const listing = await db.query.bdoSecondaryMarketListings.findFirst({
      where: eq(bdoSecondaryMarketListings.id, listingId),
    });

    if (!listing) return res.status(404).json({ message: "Listing not found" });
    if (listing.status !== "active") return res.status(400).json({ message: "Listing is not active" });
    if (listing.expiresAt && new Date(listing.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ message: "Listing expired" });
    }

    const unit = await db.query.bdoVaultGoldUnits.findFirst({
      where: eq(bdoVaultGoldUnits.id, listing.vaultUnitId),
    });
    if (!unit) return res.status(404).json({ message: "Unit not found" });
    if (unit.status !== "listed_for_resale") return res.status(400).json({ message: "Unit is not listed" });

    if (listing.sellerUserId === buyer.id) return res.status(400).json({ message: "Cannot buy your own listing" });

    const authorization = await db.query.bdoResaleAuthorizations.findFirst({
      where: and(eq(bdoResaleAuthorizations.vaultUnitId, unit.id), eq(bdoResaleAuthorizations.status, "active")),
      orderBy: desc(bdoResaleAuthorizations.createdAt),
    });
    if (!authorization) return res.status(400).json({ message: "Missing resale authorization" });

    const currency = normalizeWalletCurrency((listing.pricingRule as any)?.currency || "XOF");
    const pricePerGramRaw = (listing.pricingRule as any)?.pricePerGram;
	    const pricePerGram =
	      typeof pricePerGramRaw === "string" || typeof pricePerGramRaw === "number"
	        ? parseFloat(String(pricePerGramRaw))
	        : parseFloat((await getOrCreatePricingSnapshot(currency)).pricePerGram as any);
	
	    if (currency !== "XOF") {
	      return res.status(400).json({ message: "Secondary market purchases currently support XOF only" });
	    }
	
	    const salePriceNum = unit.unitSizeGrams * pricePerGram;
	    const salePriceXof = Math.max(1, Math.ceil(salePriceNum));
	    const salePrice = salePriceXof.toFixed(4);
	    const commissionRate = parseFloat(String(authorization.commissionRate || "0.1500"));
	    const commissionAmountXof = Math.max(0, Math.ceil(salePriceXof * commissionRate));
	    const sellerNetXof = salePriceXof - commissionAmountXof;
	    if (sellerNetXof < 0) return res.status(500).json({ message: "Invalid commission configuration" });
	    const commissionAmount = commissionAmountXof.toFixed(4);
	    const sellerNet = sellerNetXof.toFixed(4);

	    const platform = await ensurePlatformUser();
	    const buyerWalletAccount = await getOrCreateWalletAccount(String(buyer.id), "XOF");
	    const sellerWalletAccount = await getOrCreateWalletAccount(String(listing.sellerUserId), "XOF");
	    const platformWalletAccount = await getOrCreateWalletAccount(String(platform.id), "XOF");

	    const buyerVault = await ensureBdoVault(buyer.id);
	    const now = new Date();

	    const tradeResult = await db.transaction(async (tx) => {
	      await tx.update(bdoSecondaryMarketListings).set({ status: "sold", soldAt: now, updatedAt: now }).where(eq(bdoSecondaryMarketListings.id, listing.id));
	
	      const referenceId = `bdo_secondary:${listing.id}`;
	      const paySeller = await walletOsTransferTx(tx as DbTx, {
	        fromWalletAccountId: buyerWalletAccount.id,
	        toWalletAccountId: sellerWalletAccount.id,
	        amount: sellerNetXof,
	        entryType: "PURCHASE",
	        referenceType: "SELLER_OP",
	        referenceId,
	        metadata: { listingId: listing.id, vaultUnitId: unit.id, kind: "secondary_market_trade", leg: "seller_net" },
	      });
	
	      const payCommission = await walletOsTransferTx(tx as DbTx, {
	        fromWalletAccountId: buyerWalletAccount.id,
	        toWalletAccountId: platformWalletAccount.id,
	        amount: commissionAmountXof,
	        entryType: "COMMISSION",
	        referenceType: "SELLER_OP",
	        referenceId,
	        metadata: { listingId: listing.id, vaultUnitId: unit.id, kind: "secondary_market_commission", leg: "commission" },
	      });

      const pricing = await getOrCreatePricingSnapshot(currency);
      const [newAcq] = await tx
        .insert(bdoGoldAcquisitionRecords)
        .values({
          tenantId: unit.tenantId,
          userId: buyer.id,
	          unitSizeGrams: unit.unitSizeGrams,
	          purity: unit.purity,
	          timestamp: now,
	          pricePerGram: (salePriceXof / unit.unitSizeGrams).toFixed(6),
	          totalPrice: salePrice,
	          currency,
	          pricingSnapshotId: pricing.id,
	          allocatedLotIds: [],
          proofDocs: [],
          custodyLocation: "virtual_vault",
          lockupEndDate: null,
          status: "stored",
          metadata: { kind: "secondary_market_purchase", listingId: listing.id, previousAcquisitionId: unit.acquisitionId },
          createdAt: now,
        })
        .returning();

      await tx
        .update(bdoVaultGoldUnits)
        .set({
          vaultId: buyerVault.id,
          acquisitionId: newAcq.id,
          status: deliveryNow ? "delivered" : "stored",
          resaleListingId: null,
          deliveryStatus: deliveryNow ? "delivered" : "created",
          updatedAt: now,
          metadata: { ...(unit.metadata as any), previousSellerUserId: listing.sellerUserId, tradedAt: now.toISOString(), listingId: listing.id },
        } as any)
        .where(eq(bdoVaultGoldUnits.id, unit.id));

      if (unit.acquisitionId) {
        await tx.update(bdoGoldAcquisitionRecords).set({ status: "sold" }).where(eq(bdoGoldAcquisitionRecords.id, unit.acquisitionId));
      }

      const walletTransactionIds = [
        paySeller.debitTx.id,
        paySeller.creditTx.id,
        payCommission.debitTx.id,
        payCommission.creditTx.id,
      ];

      const [trade] = await tx
        .insert(bdoSecondaryMarketTrades)
        .values({
          tenantId: listing.tenantId,
          listingId: listing.id,
          buyerUserId: buyer.id,
          sellerUserId: listing.sellerUserId,
          salePrice,
          currency,
          commissionAmount,
          walletTransactionIds,
          status: "completed",
          metadata: { deliveryNow },
          createdAt: now,
        })
        .returning();

      let deliveryOrder = null as any;
      if (deliveryNow) {
        const deliveredAt = new Date();
        const [order] = await tx
          .insert(bdoDeliveryOrders)
          .values({
            tenantId: listing.tenantId,
            userId: buyer.id,
            vaultUnitId: unit.id,
            carrierId: "internal",
            destination,
            fees: "0.00",
            currency,
            status: "delivered",
            trackingEvents: [
              { eventType: "order_created", description: "Delivery requested", timestamp: now.toISOString() },
              { eventType: "delivered", description: "Delivered", timestamp: deliveredAt.toISOString() },
            ],
            proofDocs: [],
            deliveredAt,
            createdAt: now,
            updatedAt: deliveredAt,
          })
          .returning();
        deliveryOrder = order;
      }

      return { trade, walletTransactionIds, deliveryOrder };
    });

    await writeAudit(req, {
      userId: buyer?.id,
      userRole: buyer?.role ?? null,
      action: "bdo_buy_listing",
      entityType: "bdo_secondary_market_trade",
      entityId: tradeResult?.trade?.id ?? null,
      metadata: {
        listingId,
        vaultUnitId: listing?.vaultUnitId,
        sellerUserId: listing?.sellerUserId,
        salePrice: tradeResult?.trade?.salePrice,
        currency: tradeResult?.trade?.currency,
        commissionAmount: tradeResult?.trade?.commissionAmount,
        walletTransactionIds: tradeResult?.walletTransactionIds,
        deliveryNow,
      },
    });

	    res.json(tradeResult);
	  } catch (error: any) {
	    const msg = String(error?.message || "");
	    if (msg.includes("insufficient_balance")) {
	      return res.status(400).json({ message: "Insufficient wallet balance" });
	    }
	    console.error("[BDO] Buy listing error:", error);
	    res.status(500).json({ message: "Failed to buy listing", error: error.message });
	  }
	});

router.post("/seed-bureaus", async (req, res) => {
  try {
    await seedBureauDAchat();
    res.json({ message: "Bureau d'Achat data seeded successfully" });
  } catch (error: any) {
    console.error("[Gold Exchange] Seed error:", error);
    res.status(500).json({ message: "Failed to seed data" });
  }
});

router.post("/seed-sellers", async (req, res) => {
  try {
    await seedBureauxAsSellers();
    res.json({ message: "Bureau d'Achat sellers and gold products seeded successfully" });
  } catch (error: any) {
    console.error("[Gold Exchange] Seed sellers error:", error);
    res.status(500).json({ message: "Failed to seed sellers" });
  }
});

router.post("/seed-dubai-dealers", async (req, res) => {
  try {
    await seedDubaiDealers();
    res.json({ message: "Dubai gold dealers seeded successfully" });
  } catch (error: any) {
    console.error("[Gold Exchange] Seed Dubai dealers error:", error);
    res.status(500).json({ message: "Failed to seed Dubai dealers" });
  }
});

router.post("/seed-dubai-sellers", async (req, res) => {
  try {
    await seedDubaiDealersAsSellers();
    res.json({ message: "Dubai gold dealers and refined 24K products seeded successfully" });
  } catch (error: any) {
    console.error("[Gold Exchange] Seed Dubai sellers error:", error);
    res.status(500).json({ message: "Failed to seed Dubai sellers" });
  }
});

export default router;
