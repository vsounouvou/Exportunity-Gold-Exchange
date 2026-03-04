import { Router, Request, Response, NextFunction } from "express";
import { db } from "@db";
import {
  bureauDAchat,
  digitalContractSignatures,
  digitalContracts,
  digitalPayouts,
  eceSessions,
  eceUsers,
  purchaseOrders,
  revenueEvents,
} from "@db/schema";
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { addMonths } from "date-fns";

const router = Router();

type EceUserRow = typeof eceUsers.$inferSelect;

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function whereAny(conditions: Array<SQL<unknown> | null | undefined>): SQL<unknown> | undefined {
  const filtered = conditions.filter(isDefined);
  if (!filtered.length) return undefined;
  if (filtered.length === 1) return filtered[0];
  return or(...(filtered as any));
}

function whereAll(conditions: Array<SQL<unknown> | null | undefined>): SQL<unknown> | undefined {
  const filtered = conditions.filter(isDefined);
  if (!filtered.length) return undefined;
  if (filtered.length === 1) return filtered[0];
  return and(...(filtered as any));
}

function getRoles(user: EceUserRow): string[] {
  const roles = (user as any).roles;
  return Array.isArray(roles) ? roles.map(String) : [];
}

function hasRole(user: EceUserRow, role: string): boolean {
  return getRoles(user).includes(role) || (user as any).role === role;
}

function isAdmin(user: EceUserRow): boolean {
  return hasRole(user, "admin");
}

function isInvestor(user: EceUserRow): boolean {
  return isAdmin(user) || hasRole(user, "verified_investor") || hasRole(user, "shareholder") || hasRole(user, "investor");
}

function isBureauUser(user: EceUserRow): boolean {
  return isAdmin(user) || hasRole(user, "bureau_achat_user");
}

function isMineOperator(user: EceUserRow): boolean {
  return isAdmin(user) || hasRole(user, "operator") || hasRole(user, "mine_owner");
}

async function verifySession(token: string | undefined) {
  if (!token) return null;

  const session = await db.query.eceSessions.findFirst({
    where: eq(eceSessions.token, token),
  });

  if (!session || new Date(session.expiresAt) < new Date()) return null;

  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, session.userId),
  });

  return user || null;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const user = await verifySession(token);
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  (req as any).eceUser = user;
  next();
}

function buildContractPreview(args: {
  contractId: string;
  contractType: string;
  mineId: string;
  bureauLegalName?: string | null;
  principalAmount: string;
  currency: string;
  startDate: Date;
  endDate?: Date | null;
  returnModel: { type: string; value: number };
  payoutFrequency: string;
}) {
  const end = args.endDate ? args.endDate.toISOString().slice(0, 10) : "—";
  const start = args.startDate.toISOString().slice(0, 10);
  const buyer = args.bureauLegalName ? `Authorized Bureau d’Achat: ${args.bureauLegalName}` : "Authorized Bureau d’Achat: —";
  const returnLine =
    args.returnModel.type === "revenue_share_percent"
      ? `Return model: revenue share (${args.returnModel.value}%)`
      : `Return model: return per rotation (indicative) (${args.returnModel.value}%)`;

  return [
    `DIGITALLY MANAGED CONTRACT (Preview)`,
    ``,
    `Contract ID: ${args.contractId}`,
    `Contract type: ${args.contractType}`,
    `Mine reference: ${args.mineId}`,
    buyer,
    ``,
    `Participation amount: ${args.principalAmount} ${args.currency}`,
    `Start date: ${start}`,
    `End date: ${end}`,
    returnLine,
    `Payout frequency: ${args.payoutFrequency}`,
    ``,
    `Compliance note: This is a digitally managed contract linking payouts to confirmed revenue events (purchase orders / offtake).`,
    `Only authorized buyers can execute purchase orders via the platform.`,
    ``,
    `Signatures`,
    `- Party A: Mine (owner/licensed entity)`,
    `- Party B: Investor`,
    `- Party C (optional): Authorized Bureau d’Achat`,
  ].join("\n");
}

router.get("/my-bureaus", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;
  const rows = await db.query.bureauDAchat.findMany({
    where: isAdmin(user) ? undefined : eq(bureauDAchat.linkedUserId, user.id),
    orderBy: desc(bureauDAchat.updatedAt),
  });
  res.json(rows);
});

router.get("/contracts", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;

  const bureausForUser = await db
    .select({ id: bureauDAchat.id })
    .from(bureauDAchat)
    .where(and(eq(bureauDAchat.linkedUserId, user.id), eq(bureauDAchat.isActive, true)));
  const bureauIds = bureausForUser.map((b) => b.id);

  const contracts = await db.query.digitalContracts.findMany({
    where: isAdmin(user)
      ? undefined
      : whereAny([
          eq(digitalContracts.partyAUserId, user.id),
          eq(digitalContracts.partyBUserId, user.id),
          eq(digitalContracts.partyCUserId, user.id),
          bureauIds.length ? inArray(digitalContracts.bureauAchatId, bureauIds) : undefined,
        ]),
    with: {
      bureau: true,
      signatures: true,
    },
    orderBy: desc(digitalContracts.createdAt),
  });

  res.json(
    contracts.map((c) => ({
      ...c,
      signatures: (c as any).signatures?.map((s: any) => ({
        party: s.party,
        userId: s.userId,
        signedAt: s.signedAt,
      })),
    })),
  );
});

router.get("/contracts/:contractId", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;
  const { contractId } = req.params;

  const contract = await db.query.digitalContracts.findFirst({
    where: eq(digitalContracts.contractId, contractId),
    with: {
      bureau: true,
      signatures: true,
      purchaseOrders: true,
      revenueEvents: true,
      payouts: true,
    },
  });

  if (!contract) return res.status(404).json({ message: "Contract not found" });

  const isViewer =
    isAdmin(user) ||
    contract.partyAUserId === user.id ||
    contract.partyBUserId === user.id ||
    contract.partyCUserId === user.id ||
    (contract.bureauAchatId
      ? !!(await db.query.bureauDAchat.findFirst({
          where: and(eq(bureauDAchat.id, contract.bureauAchatId), eq(bureauDAchat.linkedUserId, user.id)),
        }))
      : false);

  if (!isViewer) return res.status(403).json({ message: "Not authorized" });

  res.json(contract);
});

router.post("/contracts/from-opportunity", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;
  if (!isInvestor(user)) return res.status(403).json({ message: "Investor role required" });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

  const {
    investmentOpportunityId,
    mineId,
    bureauAchatId,
    principalAmount,
    currency = "USD",
    durationMonths,
    templateKey,
    revenueSharePercent,
    premiumPerRotationPercent,
    payoutFrequency,
    terminationClauses,
  } = req.body as Record<string, any>;

  if (!mineId || !principalAmount || !durationMonths || !templateKey) {
    return res.status(400).json({ message: "mineId, principalAmount, durationMonths, templateKey are required" });
  }

  const startDate = new Date();
  const endDate = addMonths(startDate, Number(durationMonths));

  const hasBureau = typeof bureauAchatId === "number" || (typeof bureauAchatId === "string" && bureauAchatId);
  let bureau: (typeof bureauDAchat.$inferSelect) | null = null;
  let bureauId: number | null = null;
  let partyCUserId: number | null = null;

  if (hasBureau) {
    bureauId = Number(bureauAchatId);
    bureau = (await db.query.bureauDAchat.findFirst({ where: eq(bureauDAchat.id, bureauId) })) ?? null;
    if (!bureau) return res.status(400).json({ message: "Invalid bureauAchatId" });
    if (!(bureau.publicVisible && bureau.isActive && bureau.isVerified && bureau.licenseStatus === "authorized")) {
      return res.status(400).json({ message: "Selected bureau is not authorized" });
    }
    partyCUserId = bureau.linkedUserId || null;
  }

  const contractId = `DC-${nanoid(12).toUpperCase()}`;

  const inferredReturnModel =
    templateKey === "revenue_share"
      ? { type: "revenue_share_percent" as const, revenueSharePercent: Number(revenueSharePercent ?? 12) }
      : { type: "premium_per_rotation" as const, premiumPerRotationPercent: Number(premiumPerRotationPercent ?? 3) };

  const contractType = bureauId ? "tri_party_investment_offtake" : "investment_revenue_share";
  const requiredParties: Array<"partyA" | "partyB" | "partyC"> = ["partyB", ...(bureauId ? (["partyC"] as const) : [])];

  const previewText = buildContractPreview({
    contractId,
    contractType,
    mineId: String(mineId),
    bureauLegalName: bureau?.legalName || bureau?.name || null,
    principalAmount: String(principalAmount),
    currency: String(currency),
    startDate,
    endDate,
    returnModel:
      inferredReturnModel.type === "revenue_share_percent"
        ? { type: inferredReturnModel.type, value: inferredReturnModel.revenueSharePercent }
        : { type: inferredReturnModel.type, value: inferredReturnModel.premiumPerRotationPercent },
    payoutFrequency: String(payoutFrequency || (inferredReturnModel.type === "revenue_share_percent" ? "per_sale" : "per_rotation")),
  });

  const [contract] = await db
    .insert(digitalContracts)
    .values({
      tenantId,
      contractId,
      contractType: contractType as any,
      mineId: String(mineId),
      investmentOpportunityId: investmentOpportunityId ? String(investmentOpportunityId) : null,
      bureauAchatId: bureauId,
      partyBUserId: user.id,
      partyCUserId,
      principalAmount: String(principalAmount),
      currency: String(currency),
      startDate,
      endDate,
      rotationCount: inferredReturnModel.type === "premium_per_rotation" ? Number(durationMonths) : null,
      returnModel: inferredReturnModel as any,
      payoutFrequency: (payoutFrequency || (inferredReturnModel.type === "revenue_share_percent" ? "per_sale" : "per_rotation")) as any,
      terminationClauses: terminationClauses ? String(terminationClauses) : "Termination by mutual consent or material breach, with recorded notice in-app.",
      status: "pending_signatures" as any,
      documents: { previewText, attachments: [] },
      metadata: { requiredParties },
    })
    .returning();

  res.status(201).json(contract);
});

router.post("/contracts/:contractId/sign", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;
  const { contractId } = req.params;
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(500).json({ message: "Tenant not resolved" });

  const contract = await db.query.digitalContracts.findFirst({
    where: eq(digitalContracts.contractId, contractId),
    with: { bureau: true, signatures: true },
  });
  if (!contract) return res.status(404).json({ message: "Contract not found" });

  const requiredParties: Array<"partyA" | "partyB" | "partyC"> = ((contract.metadata as any)?.requiredParties ||
    ["partyB"]) as any;

  const explicitParty = (req.body as any)?.party as "partyA" | "partyB" | "partyC" | undefined;
  let party: "partyA" | "partyB" | "partyC" | null = null;

  if (explicitParty) party = explicitParty;
  else if (contract.partyBUserId === user.id) party = "partyB";
  else if (contract.partyCUserId === user.id) party = "partyC";
  else if (isMineOperator(user)) party = "partyA";
  else if (contract.bureauAchatId && contract.bureau?.linkedUserId === user.id) party = "partyC";

  if (!party) return res.status(403).json({ message: "Not authorized to sign this contract" });

  if (!requiredParties.includes(party)) {
    return res.status(400).json({ message: "This party is not required for signatures on this contract" });
  }

  const alreadySigned = (contract as any).signatures?.some((s: any) => s.party === party);
  if (alreadySigned) return res.json({ message: "Already signed", contract });

  await db.insert(digitalContractSignatures).values({
    tenantId,
    contractDbId: contract.id,
    party,
    userId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] || null,
  });

  const update: Partial<typeof digitalContracts.$inferInsert> = {};
  if (party === "partyA" && !contract.partyAUserId) update.partyAUserId = user.id;
  if (party === "partyC" && !contract.partyCUserId) update.partyCUserId = user.id;

  if (Object.keys(update).length) {
    await db.update(digitalContracts).set(update).where(eq(digitalContracts.id, contract.id));
  }

  const signatures = await db.query.digitalContractSignatures.findMany({
    where: eq(digitalContractSignatures.contractDbId, contract.id),
  });

  const signedParties = new Set(signatures.map((s) => s.party));
  const allSigned = requiredParties.every((p) => signedParties.has(p as any));

  if (allSigned) {
    await db
      .update(digitalContracts)
      .set({ status: "active" as any, activatedAt: new Date(), updatedAt: new Date() })
      .where(eq(digitalContracts.id, contract.id));
  } else {
    await db.update(digitalContracts).set({ updatedAt: new Date() }).where(eq(digitalContracts.id, contract.id));
  }

  const refreshed = await db.query.digitalContracts.findFirst({
    where: eq(digitalContracts.id, contract.id),
    with: { bureau: true, signatures: true },
  });

  res.json(refreshed);
});

router.get("/purchase-orders", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;

  if (isAdmin(user)) {
    const rows = await db.query.purchaseOrders.findMany({ orderBy: desc(purchaseOrders.createdAt) });
    return res.json(rows);
  }

  const bureausForUser = await db
    .select({ id: bureauDAchat.id })
    .from(bureauDAchat)
    .where(and(eq(bureauDAchat.linkedUserId, user.id), eq(bureauDAchat.isActive, true)));
  const bureauIds = bureausForUser.map((b) => b.id);

  const investorContracts = await db
    .select({ id: digitalContracts.id })
    .from(digitalContracts)
    .where(eq(digitalContracts.partyBUserId, user.id));
  const contractDbIds = investorContracts.map((c) => c.id);

  if (!bureauIds.length && !contractDbIds.length) return res.json([]);

  const rows = await db.query.purchaseOrders.findMany({
    where: whereAny([
      bureauIds.length ? inArray(purchaseOrders.bureauAchatId, bureauIds) : undefined,
      contractDbIds.length ? inArray(purchaseOrders.linkedContractDbId, contractDbIds) : undefined,
    ]),
    orderBy: desc(purchaseOrders.createdAt),
  });

  res.json(rows);
});

router.post("/purchase-orders", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;
  if (!isBureauUser(user)) return res.status(403).json({ message: "Bureau d’Achat role required" });

  const { bureauAchatId, mineId, goldType, quantityKg, pricingReference, linkedContractId } = req.body as Record<
    string,
    any
  >;

  if (!linkedContractId) {
    return res
      .status(400)
      .json({ message: "linkedContractId is required (purchase orders must be created inside a contract)" });
  }

  if (!quantityKg) {
    return res.status(400).json({ message: "quantityKg is required" });
  }

  const contract = await db.query.digitalContracts.findFirst({
    where: eq(digitalContracts.contractId, String(linkedContractId)),
  });
  if (!contract) return res.status(400).json({ message: "Invalid linkedContractId" });

  const contractBureauId = Number(contract.bureauAchatId);
  const contractMineId = String(contract.mineId || "");
  if (!Number.isFinite(contractBureauId) || contractBureauId <= 0 || !contractMineId) {
    return res.status(400).json({ message: "Contract is missing bureauAchatId or mineId" });
  }

  if (bureauAchatId && Number(bureauAchatId) !== contractBureauId) {
    return res.status(400).json({ message: "bureauAchatId does not match linked contract" });
  }

  if (mineId && String(mineId) !== contractMineId) {
    return res.status(400).json({ message: "mineId does not match linked contract" });
  }

  const bureauId = contractBureauId;
  const bureau = await db.query.bureauDAchat.findFirst({ where: eq(bureauDAchat.id, bureauId) });
  if (!bureau) return res.status(400).json({ message: "Invalid bureauAchatId" });
  if (!isAdmin(user) && bureau.linkedUserId !== user.id) {
    return res.status(403).json({ message: "This bureau is not linked to your account" });
  }
  if (!(bureau.publicVisible && bureau.isActive && bureau.isVerified && bureau.licenseStatus === "authorized")) {
    return res.status(400).json({ message: "This bureau is not authorized" });
  }

  if (contract.bureauAchatId !== bureauId) return res.status(400).json({ message: "linkedContractId does not match bureau" });
  if (contract.mineId !== contractMineId) return res.status(400).json({ message: "linkedContractId does not match mine" });
  const linkedContractDbId = contract.id;

  const orderId = `PO-${nanoid(12).toUpperCase()}`;
  const now = new Date();

  const [order] = await db
    .insert(purchaseOrders)
    .values({
      tenantId: bureau.tenantId,
      orderId,
      bureauAchatId: bureauId,
      mineId: contractMineId,
      goldType: String(goldType || "dore"),
      quantityKg: String(quantityKg),
      pricingReference: pricingReference ? String(pricingReference) : null,
      status: "submitted" as any,
      linkedContractDbId,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  res.status(201).json(order);
});

router.patch("/purchase-orders/:orderId/status", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;
  const { orderId } = req.params;
  const { status, evidence, grossRevenue, netRevenue, currency } = req.body as Record<string, any>;

  const order = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.orderId, orderId) });
  if (!order) return res.status(404).json({ message: "Purchase order not found" });

  const bureau = await db.query.bureauDAchat.findFirst({ where: eq(bureauDAchat.id, order.bureauAchatId) });
  const isBureauActor = isAdmin(user) || (bureau?.linkedUserId && bureau.linkedUserId === user.id);

  const nextStatus = String(status || "");
  const now = new Date();

  if (!["draft", "submitted", "accepted", "executed", "settled", "cancelled"].includes(nextStatus)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  if (nextStatus === "accepted" && !isMineOperator(user)) {
    return res.status(403).json({ message: "Mine operator role required to accept" });
  }

  if (["executed", "settled"].includes(nextStatus) && !isBureauActor) {
    return res.status(403).json({ message: "Bureau role required to execute/settle" });
  }

  if (nextStatus === "settled") {
    const gross = Number(grossRevenue);
    if (!Number.isFinite(gross) || gross <= 0) {
      return res.status(400).json({ message: "grossRevenue is required when settling an order" });
    }
    const net = netRevenue != null ? Number(netRevenue) : gross;
    if (!Number.isFinite(net) || net <= 0) {
      return res.status(400).json({ message: "netRevenue must be a valid positive number" });
    }
  }

  const update: Partial<typeof purchaseOrders.$inferInsert> = {
    status: nextStatus as any,
    updatedAt: now,
  };

  if (nextStatus === "submitted") update.submittedAt = now;
  if (nextStatus === "accepted") update.acceptedAt = now;
  if (nextStatus === "executed") update.executedAt = now;
  if (nextStatus === "settled") update.settledAt = now;
  if (evidence && typeof evidence === "object") update.evidence = evidence;

  let createdRevenueEvent: any = null;
  let createdPayout: any = null;

  if (nextStatus === "settled") {
    const gross = Number(grossRevenue);
    const net = netRevenue != null ? Number(netRevenue) : gross;

    const existingEvt = await db.query.revenueEvents.findFirst({
      where: eq(revenueEvents.purchaseOrderDbId, order.id),
    });

    if (existingEvt) {
      createdRevenueEvent = existingEvt;
    } else {
      const eventId = `REV-${nanoid(12).toUpperCase()}`;
      const [evt] = await db
        .insert(revenueEvents)
        .values({
          tenantId: order.tenantId,
          eventId,
          mineId: order.mineId,
          bureauAchatId: order.bureauAchatId,
          linkedContractDbId: order.linkedContractDbId,
          purchaseOrderDbId: order.id,
          grossRevenue: String(gross),
          netRevenue: String(net),
          currency: String(currency || "USD"),
          timestamp: now,
          evidence: evidence && typeof evidence === "object" ? evidence : {},
          createdAt: now,
        })
        .returning();

      createdRevenueEvent = evt;

      if (order.linkedContractDbId) {
        const contract = await db.query.digitalContracts.findFirst({
          where: eq(digitalContracts.id, order.linkedContractDbId),
        });

        if (contract && contract.status === "active") {
          const rm: any = contract.returnModel || {};
          let payoutAmount = 0;

          if (rm.type === "revenue_share_percent") {
            payoutAmount = (net * Number(rm.revenueSharePercent || 0)) / 100;
          } else if (rm.type === "premium_per_rotation") {
            const premium = Number(rm.premiumPerRotationPercent || 0);
            payoutAmount = (Number(contract.principalAmount) * premium) / 100;

            const rotationLimit = Number(contract.rotationCount || (contract.cap as any)?.maxRotations || 0);
            if (rotationLimit > 0) {
              const used = await db.execute(
                sql`SELECT COUNT(*)::int AS count FROM digital_payouts WHERE contract_db_id = ${contract.id}`,
              );
              const count = Number((used.rows[0] as any)?.count || 0);
              if (count >= rotationLimit) payoutAmount = 0;
            }
          }

          if (payoutAmount > 0) {
            const maxPayout = Number((contract.cap as any)?.maxPayout || 0);
            if (maxPayout > 0) {
              const totals = await db.execute(
                sql`SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM digital_payouts WHERE contract_db_id = ${contract.id}`,
              );
              const totalSoFar = Number((totals.rows[0] as any)?.total || 0);
              payoutAmount = Math.max(0, Math.min(payoutAmount, maxPayout - totalSoFar));
            }
          }

          if (payoutAmount > 0) {
            const payoutId = `PAY-${nanoid(12).toUpperCase()}`;
            const [p] = await db
              .insert(digitalPayouts)
              .values({
                tenantId: contract.tenantId,
                payoutId,
                contractDbId: contract.id,
                investorUserId: contract.partyBUserId,
                revenueEventDbId: evt.id,
                amount: String(payoutAmount.toFixed(4)),
                currency: String(contract.currency || "USD"),
                status: "due" as any,
                dueAt: now,
                createdAt: now,
              })
              .returning();
            createdPayout = p;
          }
        }
      }
    }
  }

  await db.update(purchaseOrders).set(update).where(eq(purchaseOrders.id, order.id));

  const refreshed = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, order.id) });
  res.json({ order: refreshed, revenueEvent: createdRevenueEvent, payout: createdPayout });
});

router.get("/revenue-events", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;
  const contractId = req.query.contractId ? String(req.query.contractId) : null;

  if (isAdmin(user)) {
    const rows = await db.query.revenueEvents.findMany({
      where: contractId
        ? eq(revenueEvents.linkedContractDbId, (await db.query.digitalContracts.findFirst({ where: eq(digitalContracts.contractId, contractId) }))?.id || -1)
        : undefined,
      orderBy: desc(revenueEvents.timestamp),
    });
    return res.json(rows);
  }

  const investorContracts = await db
    .select({ id: digitalContracts.id })
    .from(digitalContracts)
    .where(eq(digitalContracts.partyBUserId, user.id));
  const contractDbIds = investorContracts.map((c) => c.id);

  const bureauRows = await db
    .select({ id: bureauDAchat.id })
    .from(bureauDAchat)
    .where(and(eq(bureauDAchat.linkedUserId, user.id), eq(bureauDAchat.isActive, true)));
  const bureauIds = bureauRows.map((b) => b.id);

  if (!bureauIds.length && !contractDbIds.length) return res.json([]);

  const resolvedContractDbId = contractId
    ? (await db.query.digitalContracts.findFirst({ where: eq(digitalContracts.contractId, contractId) }))?.id || null
    : null;

  if (contractId && !resolvedContractDbId) return res.json([]);

  const rows = await db.query.revenueEvents.findMany({
    where: whereAll([
      whereAny([
        contractDbIds.length ? inArray(revenueEvents.linkedContractDbId, contractDbIds) : undefined,
        bureauIds.length ? inArray(revenueEvents.bureauAchatId, bureauIds) : undefined,
      ]),
      resolvedContractDbId ? eq(revenueEvents.linkedContractDbId, resolvedContractDbId) : undefined,
    ]),
    orderBy: desc(revenueEvents.timestamp),
  });

  res.json(rows);
});

router.get("/payouts", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;
  const contractId = req.query.contractId ? String(req.query.contractId) : null;

  let resolvedContractDbId: number | null = null;
  if (contractId) {
    const c = await db.query.digitalContracts.findFirst({ where: eq(digitalContracts.contractId, contractId) });
    resolvedContractDbId = c?.id || null;
  }

  const rows = await db.query.digitalPayouts.findMany({
    where: whereAll([
      isAdmin(user) ? undefined : eq(digitalPayouts.investorUserId, user.id),
      resolvedContractDbId ? eq(digitalPayouts.contractDbId, resolvedContractDbId) : undefined,
    ]),
    orderBy: desc(digitalPayouts.createdAt),
  });
  res.json(rows);
});

router.post("/payouts/:payoutId/mark-paid", requireAuth, async (req, res) => {
  const user = (req as any).eceUser as EceUserRow;
  if (!isMineOperator(user)) return res.status(403).json({ message: "Operator role required" });

  const { payoutId } = req.params;
  const row = await db.query.digitalPayouts.findFirst({ where: eq(digitalPayouts.payoutId, payoutId) });
  if (!row) return res.status(404).json({ message: "Payout not found" });

  await db
    .update(digitalPayouts)
    .set({ status: "paid" as any, paidAt: new Date() })
    .where(eq(digitalPayouts.id, row.id));

  const refreshed = await db.query.digitalPayouts.findFirst({ where: eq(digitalPayouts.id, row.id) });
  res.json(refreshed);
});

export default router;
