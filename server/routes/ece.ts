import { Router } from "express";
import { db } from "@db";
import { 
  eceUsers, 
  eceSessions, 
  traderApplications,
  buyerProfiles, 
  supplierProfiles, 
  shareholderProfiles,
  sourcingRequests,
  eceChatMessages,
  mineDailyProduction,
  sellers,
  userWhatsappChannels,
  walletAccounts,
  walletLedgerEntries,
  governmentSupplierLists,
  supplierRegistryEntries,
  inventoryDeclarations,
  contracts,
  shipments,
  marketAccessRequests,
  auditLogs,
  tenantSwitchTokens,
  tenants,
  userTenantRoles
} from "@db/schema";
import { eq, desc, and, asc, inArray, sql, gte, lte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { generateChatResponse, type UserRole } from "../lib/ece-ai";
import { isChairmanAssistantUser } from "./utils/auth";
import { hydrateTenantUserAccess } from "../lib/tenantUserAccess";
import { getOrCreateWalletAccount } from "../lib/wallet/wallet";
import { getDefaultEceOnboardingConfig, getEceOnboardingConfig } from "../lib/ece-onboarding";
import { ensureEceAgentsTables } from "../lib/ece-agents/ensureTables";
import { isPublishedSeedCredential } from "../lib/auth/publishedSeedCredential";
import {
  getWhatsAppOtpHealth,
  isOtpCode,
  normalizeOtpCode,
  normalizeOtpPhone,
  sendOtp,
  verifyOtp,
} from "../services/whatsappOtp.service";

const router = Router();

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function isVerifiedForSpaces(level: string | null | undefined) {
  return level === "BASIC_VERIFIED" || level === "GOLD_VERIFIED";
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function safeUuid() {
  try {
    return randomUUID();
  } catch {
    const hex = randomBytes(16).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

function getSqlRows(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result)) return result;
  return [];
}

function formatDateKey(date: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function normalizeMineSiteId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "default";
  const normalized = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "default";
}

function isMineUser(user: any) {
  const roles = new Set<string>(Array.isArray(user?.roles) ? user.roles.map(String) : []);
  const mode = String(user?.currentMode || user?.role || "").toLowerCase();
  return roles.has("mine_operator") || roles.has("mine_owner") || roles.has("gold_miner") || mode === "mine_operator" || mode === "mine_owner";
}

function isEceAdmin(user: any) {
  const roles: string[] = Array.isArray(user?.roles)
    ? user.roles.map((role: unknown) => String(role))
    : [];
  const permissions: string[] = Array.isArray(user?.permissions)
    ? user.permissions.map((permission: unknown) => String(permission))
    : [];
  const normalizeRole = (value: unknown) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
  const normalizedRoles = roles.map(normalizeRole);
  const mode = normalizeRole(user?.currentMode || user?.role || "");
  return (
    ["admin", "super admin", "platform admin", "chairman"].includes(mode) ||
    normalizedRoles.some((role) => ["admin", "super admin", "platform admin", "chairman", "operator"].includes(role)) ||
    permissions.includes("*") ||
    permissions.includes("admin:*") ||
    isChairmanAssistantUser(user)
  );
}

async function resolveMineCompanyId(params: { tenantId: number; userId: number }) {
  const { tenantId, userId } = params;
  try {
    const seller = await db.query.sellers.findFirst({
      where: and(eq(sellers.tenantId, tenantId), eq(sellers.userId, userId)),
      columns: { id: true },
    });
    if (seller?.id) return Number(seller.id);
  } catch {
    // Fall back when marketplace tables are not provisioned in this tenant.
  }

  return Number(userId);
}

function parseFiniteNumber(value: unknown) {
  const num = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

async function computeMineProductionOverview(params: {
  tenantId: number;
  companyId: number;
  timeZone: string;
}) {
  const now = new Date();
  const today = formatDateKey(now, params.timeZone);
  const last7Keys = Array.from({ length: 7 }, (_, idx) => formatDateKey(new Date(now.getTime() - (6 - idx) * 86400000), params.timeZone));
  const start7 = last7Keys[0];
  const monthStart = `${today.slice(0, 7)}-01`;

  const todayRows = await db.query.mineDailyProduction.findMany({
    where: and(
      eq(mineDailyProduction.tenantId, params.tenantId),
      eq(mineDailyProduction.companyId, params.companyId),
      eq(mineDailyProduction.date, today),
    ),
    orderBy: [asc(mineDailyProduction.siteId), desc(mineDailyProduction.updatedAt), desc(mineDailyProduction.id)],
  });

  const todayTotalGrams = todayRows.reduce((sum, row) => sum + Number(row.gramsTotal || 0), 0);

  const last7Agg = await db
    .select({
      date: mineDailyProduction.date,
      gramsTotal: sql<string>`sum(${mineDailyProduction.gramsTotal})`.as("grams_total"),
    })
    .from(mineDailyProduction)
    .where(
      and(
        eq(mineDailyProduction.tenantId, params.tenantId),
        eq(mineDailyProduction.companyId, params.companyId),
        gte(mineDailyProduction.date, start7),
        lte(mineDailyProduction.date, today),
      ),
    )
    .groupBy(mineDailyProduction.date)
    .orderBy(asc(mineDailyProduction.date));

  const last7Map = new Map(last7Agg.map((row) => [String(row.date), Number(row.gramsTotal || 0)]));
  const last7Days = last7Keys.map((key) => ({ date: key, gramsTotal: last7Map.get(key) ?? 0 }));

  const [mtdRow] = await db
    .select({
      gramsTotal: sql<string>`coalesce(sum(${mineDailyProduction.gramsTotal}), 0)`.as("grams_total"),
    })
    .from(mineDailyProduction)
    .where(
      and(
        eq(mineDailyProduction.tenantId, params.tenantId),
        eq(mineDailyProduction.companyId, params.companyId),
        gte(mineDailyProduction.date, monthStart),
        lte(mineDailyProduction.date, today),
      ),
    );

  const monthToDateGrams = Number(mtdRow?.gramsTotal || 0);

  return {
    today,
    todayTotalGrams,
    todayEntries: todayRows.map((row) => ({
      id: row.id,
      siteId: row.siteId || "default",
      gramsTotal: Number(row.gramsTotal || 0),
      purityPercent: row.purityPercent ? Number(row.purityPercent) : null,
      shift: row.shift || null,
      notes: row.notes || null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      recordedByUserId: row.userId,
    })),
    last7Days,
    monthToDateGrams,
  };
}

const otpSendBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimitOtp(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = otpSendBuckets.get(key);
  if (!row || row.resetAt <= now) {
    otpSendBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (row.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((row.resetAt - now) / 1000));
    const err = new Error("Rate limit exceeded");
    (err as any).status = 429;
    (err as any).retryAfterSec = retryAfterSec;
    throw err;
  }
  row.count += 1;
}

async function verifySession(token: string | undefined, tenantId?: number) {
  if (!token) return null;
  
  const session = await db.query.eceSessions.findFirst({
    where: and(
      eq(eceSessions.token, token),
    )
  });

  if (!session || new Date(session.expiresAt) < new Date()) {
    return null;
  }

  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, session.userId)
  });

  return hydrateTenantUserAccess(user, tenantId);
}

function normalizeRoomKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['â€™]/g, "'")
    .replace(/[^a-z0-9\s.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWeightKg(raw: string): number | null {
  const text = String(raw || "").replace(",", ".").toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|kilogrammes?|kilos?|g|grammes?|t|tonnes?)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = String(match[2] || "").toLowerCase();
  if (unit.startsWith("kg") || unit.startsWith("kilo")) return value;
  if (unit.startsWith("g") || unit.startsWith("gram")) return value / 1000;
  if (unit.startsWith("t") || unit.startsWith("ton")) return value * 1000;
  return null;
}

function parseMoneyXof(raw: string): number | null {
  const text = String(raw || "").replace(/\s+/g, "");
  const match = text.match(/(\d{2,})(?:xof|fcfa)?/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

function formatWeightIntentKg(qtyKg: number): string {
  if (!Number.isFinite(qtyKg) || qtyKg <= 0) return "";
  const rounded = Math.round(qtyKg * 1000) / 1000;
  if (rounded >= 1) {
    return `${rounded.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} kg`;
  }
  const grams = Math.round(rounded * 1000);
  if (grams >= 1) return `${grams.toLocaleString("fr-FR")} g`;
  return `${rounded.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} kg`;
}

function parseUrgencyLabel(raw: string): string | null {
  const norm = normalizeText(raw);
  if (!norm) return null;

  if (/\b(aujourd hui|today)\b/.test(norm)) return "Aujourd'hui";
  if (/\b(demain|tomorrow)\b/.test(norm)) return "Demain";
  if (/\b(cette semaine|this week)\b/.test(norm)) return "Cette semaine";
  if (/\b(ce mois|this month)\b/.test(norm)) return "Ce mois";
  if (/\b(urgent|asap|immediat|immediatement)\b/.test(norm)) return "Urgent";

  return null;
}

function toTitleCase(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/g)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
    .join(" ");
}

function parseCityName(raw: string): string | null {
  const original = String(raw || "").trim();
  if (!original) return null;

  const norm = normalizeText(original);
  if (!norm) return null;

  const knownCities = [
    "abidjan",
    "yamoussoukro",
    "bouake",
    "korhogo",
    "daloa",
    "man",
    "san pedro",
    "cotonou",
    "porto novo",
    "parakou",
    "lome",
    "kara",
    "sokode",
    "bamako",
    "sikasso",
    "ouagadougou",
    "bobo dioulasso",
    "accra",
    "kumasi",
    "tamale",
    "conakry",
    "dakar",
  ];

  for (const city of knownCities) {
    if (norm.includes(city)) return toTitleCase(city);
  }

  const segments = original
    .split(/[,;|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length > 1) {
    const candidate = segments[segments.length - 1];
    const candNorm = normalizeText(candidate);
    if (
      candNorm &&
      !/\b(aujourd hui|demain|cette semaine|ce mois|urgent|today|tomorrow|this week|this month|asap)\b/.test(candNorm)
    ) {
      if (!/[0-9]/.test(candidate) && candNorm.split(" ").length <= 4 && candNorm.length >= 3) {
        return toTitleCase(candidate);
      }
    }
  }

  const matchPrefix = norm.match(
    /^(?<city>[a-z][a-z\s-]{2,40})\s+(?:aujourd hui|demain|cette semaine|ce mois|urgent|today|tomorrow|this week|this month|asap)\b/,
  );
  if (matchPrefix?.groups?.city) return toTitleCase(matchPrefix.groups.city);

  const matchSuffix = norm.match(
    /\b(?:aujourd hui|demain|cette semaine|ce mois|urgent|today|tomorrow|this week|this month|asap)\s+(?<city>[a-z][a-z\s-]{2,40})\b/,
  );
  if (matchSuffix?.groups?.city) return toTitleCase(matchSuffix.groups.city);

  return null;
}

function hasAgentSource(meta: unknown): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const source = (meta as any).source;
  return !!source && typeof source === "object" && typeof source.agent_id === "string" && !!source.agent_id.trim();
}

function isLegacyPlaceholderRoomMessage(msg: any) {
  if (!msg) return false;
  if (msg.role !== "assistant" && msg.role !== "system") return false;

  // Hard rule: every assistant/system message must have an agent source.
  // Older builds stored static placeholders without a source; hide them to prevent duplication and ambiguity.
  if (hasAgentSource(msg.metadata)) return false;

  return true;
}

type AgentSource = {
  agent_id: string;
  tool_call?: any;
  server_msg_id: string;
};

type AgentRunResult = {
  role: "assistant" | "system";
  content: string;
  quickReplies?: string[];
  executedActions?: any[];
  source: AgentSource;
};

const ROOM_DEFS: Record<
  string,
  {
    title: string;
    subtitle: string;
    pinned?: boolean;
  }
> = {
  wallet: {
    title: "Kofi Mensah - Payments Agent",
    subtitle: "Balance, transfers, withdrawals",
    pinned: true,
  },
  accounting: {
    title: "Marie Diop - Accounting Agent",
    subtitle: "Ledger, invoices, and daily summaries",
    pinned: true,
  },
  support: {
    title: "Amadou Kone - Support Agent",
    subtitle: "Customer issues, onboarding, and follow-up",
    pinned: true,
  },
  production: {
    title: "Production",
    subtitle: "Report output, attach evidence, request pickup",
  },
  procurement: {
    title: "Fatou Traore - Operations Agent",
    subtitle: "Orders, procurement, and execution follow-up",
    pinned: true,
  },
  sales: {
    title: "Sara Bello - Sales Assistant",
    subtitle: "Client conversations, offers, and follow-up",
    pinned: true,
  },
  delivery: {
    title: "Fatou Traore - Operations Agent",
    subtitle: "Pickup, drop-off, and proof of delivery",
  },
  compliance: {
    title: "Elena Novak - Compliance Agent",
    subtitle: "KYC, KYB, AML checks, and risk flags",
    pinned: true,
  },
  legal: {
    title: "Legal",
    subtitle: "Contract templates and rules guidance",
  },
  team: {
    title: "Team Room",
    subtitle: "Internal coordination room",
  },
  investor: {
    title: "Investor",
    subtitle: "Portfolio updates and reports",
  },
  ops: {
    title: "General Operations",
    subtitle: "Main conversation. Tag agents and route work.",
    pinned: true,
  },
};

function getDefaultRoomsForUser(user: any): string[] {
  const roles = new Set<string>(Array.isArray(user?.roles) ? user.roles.map(String) : []);
  const currentMode = String(user?.currentMode || user?.role || "").toLowerCase();

  // Human-first defaults: a single primary conversation + focused specialist chats.
  const roomKeys = new Set<string>(["ops", "support", "wallet", "procurement", "sales", "compliance", "accounting"]);

  if (roles.has("mine_owner") || roles.has("gold_miner") || currentMode === "mine_owner") {
    roomKeys.add("production");
  }

  if (roles.has("buyer") || currentMode === "buyer") {
    roomKeys.add("procurement");
  }

  if (roles.has("seller") || roles.has("shop_owner") || roles.has("authorized_gold_buyer") || currentMode === "seller" || currentMode === "shop_owner") {
    roomKeys.add("sales");
    roomKeys.add("procurement");
  }

  if (roles.has("delivery") || currentMode === "delivery") {
    roomKeys.add("delivery");
  }

  if (roles.has("investor") || roles.has("shareholder") || currentMode === "investor") {
    roomKeys.add("investor");
    roomKeys.add("accounting");
  }

  if (roles.has("admin") || roles.has("operator")) {
    roomKeys.add("team");
  }

  return Array.from(roomKeys.values());
}

async function seedRoomMessagesIfEmpty(params: {
  tenantId: number;
  userId: number;
  roomKey: string;
  seeds: Array<{ role: "assistant" | "system"; content: string; quickReplies?: string[] }>;
}) {
  const { tenantId, userId, roomKey, seeds } = params;
  if (!seeds?.length) return false;

  const existing = await db.query.eceChatMessages.findFirst({
    where: and(
      eq(eceChatMessages.userId, userId),
      eq(eceChatMessages.tenantId, tenantId),
      eq(eceChatMessages.contextType, roomKey),
    ),
    columns: { id: true },
  });
  if (existing) return false;

  const now = new Date();
  await db.insert(eceChatMessages).values(
    seeds.map((seed, idx) => ({
      tenantId,
      userId,
      role: seed.role,
      content: seed.content,
      contextType: roomKey,
      metadata: seed.quickReplies?.length ? { quickReplies: seed.quickReplies } : {},
      // Keep ordering stable even when inserted in the same statement.
      createdAt: new Date(now.getTime() + idx),
    })),
  );
  return true;
}

async function getWalletBalanceXof(userId: string) {
  const wallet = await getOrCreateWalletAccount(userId, "XOF");
  const latest = await db.query.walletLedgerEntries.findFirst({
    where: eq(walletLedgerEntries.walletAccountId, wallet.id),
    orderBy: desc(walletLedgerEntries.createdAt),
  });
  const balance = latest ? Number(latest.balanceAfter || 0) : 0;
  return { walletId: wallet.id, balance };
}

async function runRoomAgent(params: {
  tenantId: number;
  tenantKey: string;
  user: any;
  roomKey: string;
  content: string;
  requestIp: string | undefined;
  userAgent: string | undefined;
  clientMessageId: string | null;
}): Promise<AgentRunResult[]> {
  const tenantId = params.tenantId;
  const normalized = normalizeText(params.content);

  const buildSource = (agentId: string, toolCall?: any): AgentSource => ({
    agent_id: agentId,
    tool_call: toolCall ?? null,
    server_msg_id: safeUuid(),
  });

  if (params.roomKey === "wallet") {
    const snapshot = await getWalletBalanceXof(String(params.user.id));

    if (/\b(historique|history|transactions?)\b/.test(normalized)) {
      const rows = await db.query.walletLedgerEntries.findMany({
        where: eq(walletLedgerEntries.walletAccountId, snapshot.walletId),
        orderBy: desc(walletLedgerEntries.createdAt),
        limit: 10,
      });

      const lines = rows.map((r) => {
        const date = r.createdAt ? new Date(r.createdAt).toLocaleString("fr-FR") : "";
        const sign = r.direction === "CREDIT" ? "+" : "-";
        const amount = Math.trunc(Number(r.amount || 0)).toLocaleString("fr-FR");
        return `- ${date} â€¢ ${String(r.entryType || "TX")} â€¢ ${sign}${amount} XOF`;
      });

      return [
        {
          role: "assistant",
          content: `Solde actuel: ${Math.trunc(snapshot.balance).toLocaleString("fr-FR")} XOF\n\nDerniÃ¨res opÃ©rations:\n${lines.join("\n") || "- (aucune)"}`,
          quickReplies: ["Voir solde", "DÃ©poser", "Retirer"],
          executedActions: [{ type: "wallet_ledger_list", count: rows.length }],
          source: buildSource("wallet_agent", { type: "db", op: "wallet_ledger_list" }),
        },
      ];
    }

    return [
      {
        role: "assistant",
        content: `Solde: ${Math.trunc(snapshot.balance).toLocaleString("fr-FR")} XOF\n\nQue voulez-vous faire ?`,
        quickReplies: ["DÃ©poser", "Retirer", "Voir historique"],
        executedActions: [{ type: "wallet_balance", walletId: snapshot.walletId }],
        source: buildSource("wallet_agent", { type: "db", op: "wallet_balance" }),
      },
    ];
  }

  if (params.roomKey === "procurement") {
    if (/\b(voir les vendeurs|voir vendeurs|see sellers)\b/.test(normalized)) {
      const rows = await db.query.supplierRegistryEntries.findMany({
        where: and(eq(supplierRegistryEntries.tenantId, tenantId), eq(supplierRegistryEntries.isActive, true)),
        orderBy: desc(supplierRegistryEntries.createdAt),
        limit: 8,
      });

      const list = rows.map((r) => {
        const region = r.region ? ` â€¢ ${r.region}` : "";
        const license = r.licenseNumber ? ` â€¢ licence ${r.licenseNumber}` : "";
        return `- ${r.supplierName}${region}${license}`;
      });

      const content = rows.length
        ? `Vendeurs (registre officiel) actifs:\n${list.join("\n")}`
        : "Aucun vendeur vÃ©rifiÃ© n'est disponible dans le registre pour le moment.";

      return [
        {
          role: "assistant",
          content,
          quickReplies: ["CrÃ©er une demande", "Je cherche 1kg"],
          executedActions: [{ type: "supplier_registry_list", count: rows.length }],
          source: buildSource("procurement_agent", { type: "db", op: "supplier_registry_list" }),
        },
      ];
    }

    const wantsNewRequest = /\b(nouvelle demande|new request|reset)\b/.test(normalized);
    const wantsCreate = /\b(creer une demande|create request)\b/.test(normalized);
    const wantsSubmit = /\b(envoyer la demande|soumettre|submit)\b/.test(normalized);

    const now = new Date();
    const activeSince = new Date(Date.now() - 6 * 60 * 60 * 1000);

    const activeRequest = await db.query.sourcingRequests.findFirst({
      where: and(
        eq(sourcingRequests.tenantId, tenantId),
        inArray(sourcingRequests.status, ["open", "sourcing"]),
        eq(sourcingRequests.requesterUserId, params.user.id),
        sql`${sourcingRequests.createdAt} >= ${activeSince}`,
      ),
      orderBy: [desc(sourcingRequests.updatedAt), desc(sourcingRequests.createdAt)],
    });

    const shouldCreateNew = wantsNewRequest || (!activeRequest && wantsCreate);

    const defaultQuery = "Achat d'or (demande)";
    const queryText = wantsCreate ? "" : params.content.trim().slice(0, 500);
    const productQuery = queryText || activeRequest?.productQuery || defaultQuery;

    const qtyKg = parseWeightKg(params.content);
    const cityName = parseCityName(params.content);
    const urgency = parseUrgencyLabel(params.content);

    let request = activeRequest;
    const executedActions: any[] = [];

    if (!request || shouldCreateNew) {
      request =
        (await db
          .insert(sourcingRequests)
          .values({
            tenantId,
            requesterUserId: params.user.id,
            guestSessionId: null,
            productQuery,
            quantityIntent: qtyKg != null ? formatWeightIntentKg(qtyKg) : null,
            urgency: urgency || null,
            qualityNotes: null,
            marketKey: "marketplace",
            location: cityName ? ({ cityName, label: cityName } as any) : {},
            status: "open",
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .then((rows) => rows[0])) || undefined;

      executedActions.push({ type: "sourcing_request_create", requestId: request?.id ?? null });
    } else {
      const currentLoc: any = request.location || {};
      const nextLoc = cityName
        ? {
            ...currentLoc,
            cityName,
            label: cityName,
          }
        : currentLoc;

      const nextQuantity = qtyKg != null ? formatWeightIntentKg(qtyKg) : request.quantityIntent || null;
      const nextUrgency = urgency || request.urgency || null;

      if (
        nextQuantity !== (request.quantityIntent || null) ||
        nextUrgency !== (request.urgency || null) ||
        (cityName && cityName !== currentLoc.cityName)
      ) {
        const [updated] = await db
          .update(sourcingRequests)
          .set({
            quantityIntent: nextQuantity,
            urgency: nextUrgency,
            location: nextLoc,
            updatedAt: now,
          })
          .where(and(eq(sourcingRequests.id, request.id), eq(sourcingRequests.tenantId, tenantId)))
          .returning();

        if (updated) request = updated as any;
        executedActions.push({ type: "sourcing_request_update", requestId: request?.id ?? null });
      } else {
        executedActions.push({ type: "sourcing_request_noop", requestId: request?.id ?? null });
      }
    }

    if (!request) {
      return [
        {
          role: "assistant",
          content: "Impossible de crÃ©er la demande pour le moment. RÃ©essayez.",
          quickReplies: ["Voir les vendeurs", "Support"],
          executedActions: [{ type: "sourcing_request_error" }],
          source: buildSource("procurement_agent", { type: "error", op: "sourcing_request_error" }),
        },
      ];
    }

    let req = request as typeof sourcingRequests.$inferSelect;

    const loc: any = req.location || {};
    const missing: string[] = [];
    if (!req.quantityIntent) missing.push("quantitÃ©");
    if (!loc.cityName && !loc.label) missing.push("ville");
    if (!req.urgency) missing.push("dÃ©lai");

    if (wantsSubmit) {
      if (missing.length) {
        return [
          {
            role: "assistant",
            content: `Avant d'envoyer la demande #${req.id}, il manque: ${missing.join(", ")}.`,
            quickReplies: ["Je cherche 1kg", "Cette semaine", "Abidjan", "Voir les vendeurs"],
            executedActions: [...executedActions, { type: "sourcing_request_submit_blocked", missing }],
            source: buildSource("procurement_agent", { type: "logic", op: "submit_blocked" }),
          },
        ];
      }

      const [updated] = await db
        .update(sourcingRequests)
        .set({ status: "sourcing", updatedAt: now })
        .where(and(eq(sourcingRequests.id, req.id), eq(sourcingRequests.tenantId, tenantId)))
        .returning();
      if (updated) req = updated as any;

      await db.insert(auditLogs).values({
        tenantId,
        userId: params.user.id,
        userRole: String(params.user?.currentMode || params.user?.role || "buyer"),
        action: "sourcing_request_submitted",
        entityType: "sourcing_request",
        entityId: req.id as any,
        newState: {
          requestId: req.id,
          quantityIntent: req.quantityIntent,
          urgency: req.urgency,
          location: req.location,
        },
        ipAddress: params.requestIp,
        userAgent: params.userAgent,
      } as any);

      return [
        {
          role: "assistant",
          content: `Demande envoyÃ©e (#${req.id}).\n\nProchaine Ã©tape: je contacte les vendeurs vÃ©rifiÃ©s et je reviens vers vous.`,
          quickReplies: ["Voir les vendeurs", "Nouvelle demande"],
          executedActions: [...executedActions, { type: "sourcing_request_submit", requestId: req.id }],
          source: buildSource("procurement_agent", { type: "db", op: "sourcing_request_submit" }),
        },
      ];
    }

    const summaryLines = [
      `Demande #${req.id} (${req.status})`,
      `- QuantitÃ©: ${req.quantityIntent || "â€”"}`,
      `- Ville: ${loc.cityName || loc.label || "â€”"}`,
      `- DÃ©lai: ${req.urgency || "â€”"}`,
    ];

    let prompt = "";
    let quickReplies: string[] = [];
    if (!req.quantityIntent) {
      prompt = "Quelle quantitÃ© cherchez-vous ?";
      quickReplies = ["Je cherche 1kg", "Je cherche 200g", "Voir les vendeurs"];
    } else if (!loc.cityName && !loc.label) {
      prompt = "Dans quelle ville ?";
      quickReplies = ["Abidjan", "Cotonou", "LomÃ©"];
    } else if (!req.urgency) {
      prompt = "Quel dÃ©lai ?";
      quickReplies = ["Aujourd'hui", "Cette semaine", "Ce mois"];
    } else {
      prompt = "Voulez-vous envoyer la demande ou voir les vendeurs ?";
      quickReplies = ["Envoyer la demande", "Voir les vendeurs", "Nouvelle demande"];
    }

    return [
      {
        role: "assistant",
        content: `${summaryLines.join("\n")}\n\n${prompt}`,
        quickReplies,
        executedActions: executedActions.length ? executedActions : [{ type: "sourcing_request_state", requestId: req.id }],
        source: buildSource("procurement_agent", { type: "db", op: "sourcing_request_state" }),
      },
    ];
  }

  if (params.roomKey === "compliance") {
    const buyer = await db.query.buyerProfiles.findFirst({
      where: and(eq(buyerProfiles.userId, params.user.id), eq(buyerProfiles.tenantId, tenantId)),
    });
    const supplier = await db.query.supplierProfiles.findFirst({
      where: and(eq(supplierProfiles.userId, params.user.id), eq(supplierProfiles.tenantId, tenantId)),
    });

    const summaryLines: string[] = [];
    const missing: string[] = [];

    if (buyer) {
      summaryLines.push(`Acheteur: ${buyer.verificationStatus}`);
      if (!buyer.proofOfFundsSubmitted) missing.push("Preuve de fonds");
      if (!Array.isArray(buyer.proofOfFundsDocuments) || buyer.proofOfFundsDocuments.length === 0) missing.push("Document(s) preuve de fonds");
    }

    if (supplier) {
      summaryLines.push(`Vendeur/Fournisseur: ${supplier.verificationStatus}`);
      const docs = Array.isArray(supplier.documents) ? supplier.documents : [];
      const hasId = docs.some((d: any) => String(d?.type || "").toLowerCase().includes("id"));
      const hasLicense = docs.some((d: any) => String(d?.type || "").toLowerCase().includes("license") || String(d?.type || "").toLowerCase().includes("licence"));
      if (!supplier.matchedToGovernmentList) missing.push("Appariement registre officiel");
      if (!hasId) missing.push("PiÃ¨ce d'identitÃ©");
      if (!hasLicense && supplier.miningLicenseNumber) missing.push("Document licence miniÃ¨re");
    }

    if (!buyer && !supplier) {
      return [
        {
          role: "assistant",
          content:
            "Aucun dossier KYC n'est associÃ© Ã  votre compte.\n\nOuvrez l'espace Pro â†’ ParamÃ¨tres â†’ KYC pour dÃ©marrer (ou soumettez une demande d'accÃ¨s).",
          quickReplies: ["Voir mon statut", "Prochaine Ã©tape"],
          executedActions: [{ type: "kyc_status_lookup", found: false }],
          source: buildSource("compliance_agent", { type: "db", op: "kyc_status_lookup" }),
        },
      ];
    }

    const wantsNext = /\b(prochaine etape|next step)\b/.test(normalized);

    const content = wantsNext
      ? `Prochaine Ã©tape:\n${missing.length ? missing.map((x) => `- ${x}`).join("\n") : "- Aucun blocage dÃ©tectÃ©."}`
      : `Statut KYC:\n${summaryLines.join("\n")}\n\nBlocages:\n${missing.length ? missing.map((x) => `- ${x}`).join("\n") : "- Aucun."}`;

    return [
      {
        role: "assistant",
        content,
        quickReplies: ["RÃ©sumÃ©", "Prochaine Ã©tape"],
        executedActions: [{ type: "kyc_status_lookup", buyer: !!buyer, supplier: !!supplier }],
        source: buildSource("compliance_agent", { type: "db", op: "kyc_status_lookup" }),
      },
    ];
  }

  if (params.roomKey === "production") {
    const supplier = await db.query.supplierProfiles.findFirst({
      where: and(eq(supplierProfiles.userId, params.user.id), eq(supplierProfiles.tenantId, tenantId)),
    });

    if (!supplier) {
      return [
        {
          role: "assistant",
          content:
            "Votre profil fournisseur n'est pas configurÃ©.\n\nAllez dans Espace Pro â†’ Profil â†’ VÃ©rification, puis revenez ici pour dÃ©clarer la production.",
          quickReplies: ["RÃ©sumÃ©", "Support"],
          executedActions: [{ type: "supplier_profile_missing" }],
          source: buildSource("production_agent", { type: "db", op: "supplier_profile_missing" }),
        },
      ];
    }

    const qtyKg = parseWeightKg(params.content);
    if (qtyKg == null) {
      return [
        {
          role: "assistant",
          content: "Envoyez la quantitÃ© produite (ex: '620g' ou '0.62kg') et la date si diffÃ©rente d'aujourd'hui.",
          quickReplies: ["J'ai 620g aujourd'hui", "Ajouter des photos"],
          executedActions: [{ type: "inventory_declaration_prompt" }],
          source: buildSource("production_agent", { type: "logic", op: "prompt_quantity" }),
        },
      ];
    }

    const [inv] = await db
      .insert(inventoryDeclarations)
      .values({
        tenantId,
        supplierId: supplier.id,
        commodityType: "gold",
        declaredWeightKg: String(qtyKg),
        declaredPurity: null,
        estimatedValueUsd: null,
        status: "declared",
        mineLocation: null,
        productionDate: new Date(),
        batchNumber: null,
        documents: [],
        readyForExport: false,
        notes: params.content.slice(0, 1000),
        metadata: { source: "chat" },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();

    return [
      {
        role: "assistant",
        content: `Production dÃ©clarÃ©e: ${qtyKg.toFixed(3)} kg (id #${inv?.id ?? "?"}).\n\nAjoutez des photos (balance + gros plan) si possible.`,
        quickReplies: ["Ajouter des photos", "Demander un pickup"],
        executedActions: [{ type: "inventory_declaration_create", inventoryId: inv?.id ?? null }],
        source: buildSource("production_agent", { type: "db", op: "inventory_declaration_create" }),
      },
    ];
  }

  if (params.roomKey === "accounting") {
    const snapshot = await getWalletBalanceXof(String(params.user.id));
    const rows = await db.query.walletLedgerEntries.findMany({
      where: eq(walletLedgerEntries.walletAccountId, snapshot.walletId),
      orderBy: desc(walletLedgerEntries.createdAt),
      limit: 200,
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let credit = 0;
    let debit = 0;
    for (const r of rows) {
      const when = r.createdAt ? new Date(r.createdAt) : null;
      if (!when || when < startOfDay) continue;
      const amt = Math.trunc(Number(r.amount || 0));
      if (r.direction === "CREDIT") credit += amt;
      if (r.direction === "DEBIT") debit += amt;
    }

    const fmt = (n: number) => Math.trunc(n).toLocaleString("fr-FR");

    return [
      {
        role: "assistant",
        content:
          `RÃ©sumÃ© du jour:\n- EntrÃ©es: ${fmt(credit)} XOF\n- Sorties: ${fmt(debit)} XOF\n- Solde: ${fmt(snapshot.balance)} XOF\n\nDites-moi: 'Pourquoi ces frais ?' ou 'RÃ©sumÃ© de la semaine'.`,
        quickReplies: ["RÃ©sumÃ© du jour", "RÃ©sumÃ© de la semaine", "Pourquoi ces frais ?"],
        executedActions: [{ type: "accounting_summary", entries: rows.length }],
        source: buildSource("accounting_agent", { type: "db", op: "accounting_summary" }),
      },
    ];
  }

  if (params.roomKey === "investor") {
    const profile = await db.query.shareholderProfiles.findFirst({
      where: and(eq(shareholderProfiles.userId, params.user.id), eq(shareholderProfiles.tenantId, tenantId)),
    });

    if (!profile) {
      return [
        {
          role: "assistant",
          content: "Aucun profil investisseur n'est liÃ© Ã  votre compte. Contactez l'admin pour l'activer.",
          quickReplies: ["Support"],
          executedActions: [{ type: "investor_profile_missing" }],
          source: buildSource("investor_agent", { type: "db", op: "investor_profile_missing" }),
        },
      ];
    }

    const pct = profile.sharePercentage ? `${profile.sharePercentage}%` : "â€”";
    const amount = profile.investmentAmount ? `${profile.investmentAmount} ${profile.investmentCurrency || "USD"}` : "â€”";

    return [
      {
        role: "assistant",
        content: `Profil investisseur:\n- Participation: ${pct}\n- Investissement: ${amount}`,
        quickReplies: ["RÃ©sumÃ©", "Support"],
        executedActions: [{ type: "investor_profile_read" }],
        source: buildSource("investor_agent", { type: "db", op: "investor_profile_read" }),
      },
    ];
  }

  if (params.roomKey === "ops" || params.roomKey === "operations") {
    const text = String(params.content || "");
    const mentionCompliance = /\B@(compliance|kyc|aml)\b/i.test(text);
    const mentionSupport = /\B@(support|help)\b/i.test(text);
    const mentionSales = /\B@(sales|outreach|clients)\b/i.test(text);
    const mentionAccounting = /\B@(accounting|finance|cfo)\b/i.test(text);
    const mentionPayments = /\B@(money|payments|wallet)\b/i.test(text);
    const mentionOps = /\B@(ops|operations|procurement|orders)\b/i.test(text);

    const proRoomLink = (key: string) => `/pro/threads/${key === "ops" ? "general-operations" : key}`;

    if (mentionCompliance) {
      return [
        {
          role: "assistant",
          content:
            `${ROOM_DEFS.compliance?.title || "Compliance Agent"} is on this. Routing to compliance checks now.\n\nOpen: ${proRoomLink("compliance")}`,
          executedActions: [{ type: "handoff", to: "compliance" }],
          source: buildSource("ops_agent", { type: "logic", op: "handoff_compliance" }),
        },
      ];
    }

    if (mentionSupport) {
      return [
        {
          role: "assistant",
          content:
            `${ROOM_DEFS.support?.title || "Support Agent"} is on this. Routing this support issue now.\n\nOpen: ${proRoomLink("support")}`,
          executedActions: [{ type: "handoff", to: "support" }],
          source: buildSource("ops_agent", { type: "logic", op: "handoff_support" }),
        },
      ];
    }

    if (mentionSales) {
      return [
        {
          role: "assistant",
          content:
            `${ROOM_DEFS.sales?.title || "Sales Agent"} is on this. Routing this client/sales request now.\n\nOpen: ${proRoomLink("sales")}`,
          executedActions: [{ type: "handoff", to: "sales" }],
          source: buildSource("ops_agent", { type: "logic", op: "handoff_sales" }),
        },
      ];
    }

    if (mentionPayments) {
      return [
        {
          role: "assistant",
          content:
            `${ROOM_DEFS.wallet?.title || "Payments Agent"} is on this. Routing this payment request now.\n\nOpen: ${proRoomLink("wallet")}`,
          executedActions: [{ type: "handoff", to: "wallet" }],
          source: buildSource("ops_agent", { type: "logic", op: "handoff_wallet" }),
        },
      ];
    }

    if (mentionAccounting) {
      return [
        {
          role: "assistant",
          content:
            `${ROOM_DEFS.accounting?.title || "Accounting Agent"} is on this. Routing this accounting request now.\n\nOpen: ${proRoomLink("accounting")}`,
          executedActions: [{ type: "handoff", to: "accounting" }],
          source: buildSource("ops_agent", { type: "logic", op: "handoff_accounting" }),
        },
      ];
    }

    if (mentionOps) {
      return [
        {
          role: "assistant",
          content:
            `${ROOM_DEFS.procurement?.title || "Operations Agent"} is on this. Routing this operations request now.\n\nOpen: ${proRoomLink("procurement")}`,
          executedActions: [{ type: "handoff", to: "procurement" }],
          source: buildSource("ops_agent", { type: "logic", op: "handoff_operations" }),
        },
      ];
    }

    const items = await db.query.auditLogs.findMany({
      where: eq(auditLogs.tenantId, tenantId),
      orderBy: desc(auditLogs.createdAt),
      limit: 6,
    });

    const lines = items.map((x) => {
      const when = x.createdAt ? new Date(x.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
      return `- ${when} ${x.action}`;
    });

    return [
      {
        role: "assistant",
        content:
          `General Operations status:\n${lines.join("\n") || "- no recent updates"}\n\nTag a role: @Compliance @Support @Sales @Accounting @Money`,
        quickReplies: ["@Compliance check KYC", "@Money check wallet", "@Sales follow up client"],
        executedActions: [{ type: "ops_audit_list", count: items.length }],
        source: buildSource("ops_agent", { type: "db", op: "ops_audit_list" }),
      },
    ];
  }

  if (params.roomKey === "team") {
    const wantsTask = /\b(creer une tache|create task|tache)\b/.test(normalized);
    if (wantsTask) {
      const title = params.content.trim().slice(0, 140);
      const [logRow] = await db
        .insert(auditLogs)
        .values({
          tenantId,
          userId: params.user.id,
          userRole: String(params.user?.currentMode || params.user?.role || "user"),
          action: "team_task_created",
          entityType: "chat_task",
          entityId: null as any,
          newState: { title },
          ipAddress: params.requestIp,
          userAgent: params.userAgent,
        } as any)
        .returning();

      return [
        {
          role: "assistant",
          content: `TÃ¢che crÃ©Ã©e (rÃ©f #${logRow?.id ?? "?"}).\n\nTitre: ${title}`,
          quickReplies: ["RÃ©sumÃ©", "CrÃ©er une tÃ¢che"],
          executedActions: [{ type: "team_task_created", ticketId: logRow?.id ?? null }],
          source: buildSource("coordinator_agent", { type: "db", op: "audit_log_insert" }),
        },
      ];
    }

    return [
      {
        role: "assistant",
        content: "Dites-moi ce que vous voulez faire: rÃ©sumÃ©, crÃ©er une tÃ¢che, ou envoyer une note Ã  l'Ã©quipe.",
        quickReplies: ["RÃ©sumÃ©", "CrÃ©er une tÃ¢che"],
        executedActions: [{ type: "team_prompt" }],
        source: buildSource("coordinator_agent", { type: "logic", op: "prompt" }),
      },
    ];
  }

  if (params.roomKey === "support") {
    const [logRow] = await db
      .insert(auditLogs)
      .values({
        tenantId,
        userId: params.user.id,
        userRole: String(params.user?.currentMode || params.user?.role || "user"),
        action: "support_ticket_created",
        entityType: "support_ticket",
        entityId: null as any,
        newState: { message: params.content.slice(0, 2000) },
        ipAddress: params.requestIp,
        userAgent: params.userAgent,
      } as any)
      .returning();

    return [
      {
        role: "assistant",
        content: `Merci. Demande support crÃ©Ã©e (#${logRow?.id ?? "?"}). Un agent vous rÃ©pondra ici.`,
        quickReplies: ["Suivi", "Nouvelle demande"],
        executedActions: [{ type: "support_ticket_created", ticketId: logRow?.id ?? null }],
        source: buildSource("support_agent", { type: "db", op: "audit_log_insert" }),
      },
    ];
  }

  if (params.roomKey === "delivery") {
    const [logRow] = await db
      .insert(auditLogs)
      .values({
        tenantId,
        userId: params.user.id,
        userRole: String(params.user?.currentMode || params.user?.role || "user"),
        action: "delivery_update",
        entityType: "delivery",
        entityId: null as any,
        newState: { message: params.content.slice(0, 500) },
        ipAddress: params.requestIp,
        userAgent: params.userAgent,
      } as any)
      .returning();

    return [
      {
        role: "assistant",
        content: `Mise Ã  jour enregistrÃ©e (#${logRow?.id ?? "?"}).\n\nSi c'est un problÃ¨me, prÃ©cisez: adresse, contact, et photo si possible.`,
        quickReplies: ["Pickup effectuÃ©", "LivrÃ©", "J'ai un problÃ¨me"],
        executedActions: [{ type: "delivery_update_logged", ticketId: logRow?.id ?? null }],
        source: buildSource("delivery_agent", { type: "db", op: "audit_log_insert" }),
      },
    ];
  }

  if (params.roomKey === "sales") {
    if (/\b(voir mes offres|mes offres|offers?)\b/.test(normalized)) {
      const rows = await db.query.auditLogs.findMany({
        where: and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.userId, params.user.id), eq(auditLogs.action, "sales_offer_draft")),
        orderBy: desc(auditLogs.createdAt),
        limit: 10,
      });

      const lines = rows.map((r) => {
        const when = r.createdAt ? new Date(r.createdAt).toLocaleString("fr-FR") : "";
        const state: any = r.newState || {};
        const qty = state.quantityIntent || state.quantityKg || "â€”";
        const price = state.priceTargetXof ? `${Number(state.priceTargetXof).toLocaleString("fr-FR")} XOF` : "â€”";
        const city = state.cityName || "â€”";
        return `- #${r.id} â€¢ ${when} â€¢ ${qty} â€¢ ${price} â€¢ ${city}`;
      });

      return [
        {
          role: "assistant",
          content: `Vos derniÃ¨res offres:\n${lines.join("\n") || "- (aucune)"}`,
          quickReplies: ["CrÃ©er une offre"],
          executedActions: [{ type: "sales_offer_list", count: rows.length }],
          source: buildSource("sales_agent", { type: "db", op: "sales_offer_list" }),
        },
      ];
    }

    const qtyKg = parseWeightKg(params.content);
    const cityName = parseCityName(params.content);
    const priceXof = parseMoneyXof(params.content);

    const [ticket] = await db
      .insert(auditLogs)
      .values({
        tenantId,
        userId: params.user.id,
        userRole: String(params.user?.currentMode || params.user?.role || "seller"),
        action: "sales_offer_draft",
        entityType: "sales_offer",
        entityId: null as any,
        newState: {
          quantityIntent: qtyKg != null ? formatWeightIntentKg(qtyKg) : null,
          quantityKg: qtyKg != null ? Number(qtyKg.toFixed(3)) : null,
          cityName: cityName || null,
          priceTargetXof: priceXof != null ? priceXof : null,
          raw: params.content.slice(0, 1000),
        },
        ipAddress: params.requestIp,
        userAgent: params.userAgent,
      } as any)
      .returning();

    const missing: string[] = [];
    if (qtyKg == null) missing.push("poids");
    if (!cityName) missing.push("ville");
    if (priceXof == null) missing.push("prix (XOF)");

    const nextPrompt = missing.length
      ? `Offre enregistrÃ©e (#${ticket?.id ?? "?"}). Il manque: ${missing.join(", ")}.`
      : `Offre enregistrÃ©e (#${ticket?.id ?? "?"}). Prochaine Ã©tape: je transmets au service commercial pour validation.`;

    const quickReplies: string[] = missing.length
      ? ["Je vends 1kg", "Prix 40000000 XOF", "Abidjan", "Voir mes offres"]
      : ["Voir mes offres", "CrÃ©er une offre"];

    return [
      {
        role: "assistant",
        content: nextPrompt,
        quickReplies,
        executedActions: [{ type: "sales_offer_draft_logged", ticketId: ticket?.id ?? null }],
        source: buildSource("sales_agent", { type: "db", op: "audit_log_insert" }),
      },
    ];
  }

  if (params.roomKey === "legal") {
    if (/\b(modele|mod[eÃ¨]le|template)\b/.test(normalized)) {
      return [
        {
          role: "assistant",
          content:
            "ModÃ¨les disponibles (MVP):\n- Contrat d'achat (offtake)\n- Accord de confidentialitÃ© (NDA)\n- Mandat de reprÃ©sentation\n\nDites: \"NDA\" ou \"contrat d'achat\" + le pays pour que je prÃ©pare le bon fichier.",
          quickReplies: ["NDA", "Contrat d'achat", "Support"],
          executedActions: [{ type: "legal_templates_list" }],
          source: buildSource("legal_agent", { type: "logic", op: "templates_list" }),
        },
      ];
    }

    const [ticket] = await db
      .insert(auditLogs)
      .values({
        tenantId,
        userId: params.user.id,
        userRole: String(params.user?.currentMode || params.user?.role || "user"),
        action: "legal_request_created",
        entityType: "legal_request",
        entityId: null as any,
        newState: { message: params.content.slice(0, 2000) },
        ipAddress: params.requestIp,
        userAgent: params.userAgent,
      } as any)
      .returning();

    return [
      {
        role: "assistant",
        content: `Demande juridique enregistrÃ©e (#${ticket?.id ?? "?"}).\n\nDites-moi: le pays + le type (NDA, contrat d'achat, clause, litige).`,
        quickReplies: ["ModÃ¨le (NDA)", "ModÃ¨le de contrat", "Support"],
        executedActions: [{ type: "legal_request_logged", ticketId: ticket?.id ?? null }],
        source: buildSource("legal_agent", { type: "db", op: "audit_log_insert" }),
      },
    ];
  }

  return [
    {
      role: "assistant",
      content: "Service indisponible pour cette room.",
      quickReplies: ["Support"],
      executedActions: [{ type: "room_unhandled", roomKey: params.roomKey }],
      source: buildSource("system", { type: "error", op: "room_unhandled" }),
    },
  ];
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : String(value[0] ?? "");
  if (value == null) return "";
  return String(value);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string") return [value];
  return [];
}

function normalizeMetadata(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function mustChangePassword(user: any): boolean {
  return Boolean(user?.metadata?.mustChangePassword);
}

function normalizeRoleKey(raw: string) {
  const key = (raw || "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    // Frontend/UI friendly aliases (accept + normalize).
    gold_miner: "mine_owner",
    authorized_buyer: "authorized_gold_buyer",
    mining_machinery_manufacturer: "machinery_manufacturer",
    mining_machinery_reseller: "machinery_reseller",
  };
  return aliases[key] ?? key;
}

router.post("/applications/submit", upload.array("documents", 10), async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;
    const tenantKey = String(tenant.key || "bdo");

    const allowedRoles = new Set([
      "buyer",
      "supplier",
      "shareholder",
      "admin",
      "mine_owner",
      "authorized_gold_buyer",
      "jewelry_manufacturer",
      "jewelry_reseller",
      "machinery_manufacturer",
      "machinery_reseller",
      "investor",
    ]);

    const contact = asString((req.body as any).contact).trim();
    const displayName = asString((req.body as any).displayName).trim();
    const rawRoleKey = asString((req.body as any).roleKey);
    const roleKey = normalizeRoleKey(rawRoleKey);

    const email = asString((req.body as any).email).trim() || null;
    const phone = asString((req.body as any).phone).trim() || null;

    const country = asString((req.body as any).country).trim();
    const region = asString((req.body as any).region).trim() || null;
    const city = asString((req.body as any).city).trim() || null;
    const address = asString((req.body as any).address).trim() || null;
    const postalCode = asString((req.body as any).postalCode).trim() || null;

    const licenseNumber = asString((req.body as any).licenseNumber).trim() || null;
    const mineSubtype = asString((req.body as any).mineSubtype).trim() || null;
    const jewelrySubtype = asString((req.body as any).jewelrySubtype).trim() || null;
    const sellOnPlatform = asString((req.body as any).sellOnPlatform).trim() || null;
    const investmentRange = asString((req.body as any).investmentRange).trim() || null;
    const investorInterest = asString((req.body as any).investorInterest).trim() || null;

    if (!contact || !displayName || !roleKey) {
      return res.status(400).json({ message: "Contact, full name, and role are required" });
    }
    if (!allowedRoles.has(roleKey)) {
      return res.status(400).json({
        message: "Invalid role",
        received: rawRoleKey,
        normalized: roleKey,
        allowed: Array.from(allowedRoles.values()).sort(),
      });
    }
    if (!country) {
      return res.status(400).json({ message: "Country is required" });
    }
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }
    if (!address) {
      return res.status(400).json({ message: "Address is required" });
    }

    if (roleKey === "authorized_gold_buyer") {
      const files = (req.files || []) as Express.Multer.File[];
      if (!licenseNumber) return res.status(400).json({ message: "License number is required" });
      if (!files.length) return res.status(400).json({ message: "License document is required" });
    }

    const applicationRef = `APP-${randomBytes(6).toString("hex").toUpperCase()}`;
    const nowIso = new Date().toISOString();

    const files = (req.files || []) as Express.Multer.File[];
    const types = asStringArray((req.body as any).documentTypes);
    const names = asStringArray((req.body as any).documentNames);

    const documents: Array<{
      type: 'trading_license' | 'business_registration' | 'government_authorization' | 'id_document' | 'proof_of_funds' | 'other';
      name: string;
      url: string;
      uploadedAt: string;
      size?: number;
      mimeType?: string;
    }> = [];

    if (files.length) {
      const dir = path.join(process.cwd(), "attached_assets", "ece-applications", applicationRef);
      await fs.mkdir(dir, { recursive: true });

      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        const original = path.basename(file.originalname || `document_${idx}`);
        const ext = path.extname(original);
        const base = path.basename(original, ext).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
        const stored = `${Date.now()}_${idx}_${base}${ext || ""}`;

        const filePath = path.join(dir, stored);
        await fs.writeFile(filePath, file.buffer);

        const rawType = types[idx] || types[0] || "other";
        const safeType = (
          [
            "trading_license",
            "business_registration",
            "government_authorization",
            "id_document",
            "proof_of_funds",
            "other",
          ] as const
        ).includes(rawType as any)
          ? (rawType as any)
          : "other";

        documents.push({
          type: safeType,
          name: names[idx] || original,
          url: `/attached_assets/ece-applications/${applicationRef}/${stored}`,
          uploadedAt: nowIso,
          size: file.size,
          mimeType: file.mimetype,
        });
      }
    }

    const [application] = await db
      .insert(traderApplications)
      .values({
        tenantId,
        applicationRef,
        email,
        contact,
        displayName,
        phone,
        requestedRole: roleKey as any,
        companyName: null,
        companyRegistration: null,
        country,
        region,
        city,
        postalCode,
        address,
        licenseNumber,
        mineSubtype,
        jewelrySubtype,
        sellOnPlatform,
        investmentRange,
        investorInterest,
        documents,
        status: "submitted",
        aiReviewResult: "needs_review",
        aiReviewReason: documents.length ? "documents_submitted" : "submitted",
        aiReviewDetails: {},
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      })
      .returning();

    await db.insert(auditLogs).values({
      tenantId,
      userId: null,
      userRole: roleKey,
      action: "trader_application_submitted",
      entityType: "trader_application",
      entityId: application.id,
      newState: { applicationRef, roleKey },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ applicationRef });
  } catch (error: any) {
    console.error("[ECE] Application submit error:", error);
    res.status(500).json({ message: "Failed to submit application", error: error.message });
  }
});

router.get("/applications/status", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const ref = String(req.query.ref || "").trim();
    if (!ref) return res.status(400).json({ message: "Missing ref" });

    const app = await db.query.traderApplications.findFirst({
      where: and(eq(traderApplications.applicationRef, ref), eq(traderApplications.tenantId, tenantId)),
      columns: {
        applicationRef: true,
        status: true,
        aiReviewResult: true,
        aiReviewedAt: true,
        reviewedAt: true,
        adminReviewNote: true,
        updatedAt: true,
      },
    });

    if (!app) return res.status(404).json({ message: "Not found" });

    res.json(app);
  } catch (error: any) {
    console.error("[ECE] Application status error:", error);
    res.status(500).json({ message: "Failed to fetch status" });
  }
});

router.post("/auth/register", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const { email, password, displayName, phone } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ message: "Email, password, and name are required" });
    }

    const existingUser = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.email, email.toLowerCase())
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db.insert(eceUsers).values({
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      phone: phone || null,
      role: 'buyer',
      roles: ['buyer'],
      permissions: [],
      currentMode: 'buyer',
      isActive: true,
      emailVerified: false
    }).returning();

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(eceSessions).values({
      userId: newUser.id,
      token,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await db.insert(auditLogs).values({
      tenantId,
      userId: newUser.id,
      userRole: 'buyer',
      action: 'user_registered',
      entityType: 'user',
      entityId: newUser.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await db
      .insert(userTenantRoles)
      .values({ tenantId, userId: newUser.id, role: "USER" })
      .onConflictDoNothing();

    res.json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        roles: newUser.roles || ['buyer'],
        permissions: newUser.permissions || [],
        currentMode: newUser.currentMode || 'buyer',
        buyerType: (newUser as any).buyerType || 'retail',
        verificationLevel: (newUser as any).verificationLevel || 'NONE',
        mustChangePassword: mustChangePassword(newUser),
      }
    });
  } catch (error: any) {
    console.error("[ECE] Registration error:", error);
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const emailLower = String(email || "").trim().toLowerCase();
    const maskedEmail = (() => {
      const raw = emailLower;
      if (!raw) return "";
      const at = raw.indexOf("@");
      if (at > 1) return `${raw.slice(0, 2)}***${raw.slice(at)}`;
      if (raw.length <= 2) return `${raw}***`;
      return `${raw.slice(0, 2)}***`;
    })();

    const user = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.email, emailLower)
    });

    if (!user) {
      console.warn("[ECE] Login failed: user not found", {
        tenantId,
        email: maskedEmail,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.passwordHash) {
      return res.status(403).json({
        message: "Password setup required",
        code: "PASSWORD_SETUP_REQUIRED",
      });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      console.warn("[ECE] Login failed: invalid password", {
        tenantId,
        userId: user.id,
        email: maskedEmail,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isActive) {
      console.warn("[ECE] Login blocked: inactive account", {
        tenantId,
        userId: user.id,
        email: maskedEmail,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      return res.status(403).json({ message: "Account is disabled" });
    }

    if (
      isPublishedSeedCredential({
        email: emailLower,
        password,
        nodeEnv: process.env.NODE_ENV,
      })
    ) {
      const metadata = {
        ...normalizeMetadata((user as any).metadata),
        mustChangePassword: true,
        credentialRotationReason: "published_seed_credential",
      };

      await db
        .update(eceUsers)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(eceUsers.id, user.id));

      await db.insert(auditLogs).values({
        tenantId,
        userId: user.id,
        userRole: (user as any).currentMode || "admin",
        action: "login_blocked_published_seed_credential",
        entityType: "user",
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      console.warn("[ECE] Login blocked: published setup credential", {
        tenantId,
        userId: user.id,
        email: maskedEmail,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return res.status(403).json({
        message: "This administrator password has been retired. Use an existing signed-in session to change it, or request a one-time setup link.",
        code: "PASSWORD_ROTATION_REQUIRED",
      });
    }

    const effectiveUser = await hydrateTenantUserAccess(user, tenantId);
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(eceSessions).values({
      userId: user.id,
      token,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await db.update(eceUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(eceUsers.id, user.id));

    const activeMode = (effectiveUser as any)?.currentMode || 'buyer';
    await db.insert(auditLogs).values({
      tenantId,
      userId: user.id,
      userRole: activeMode,
      action: 'user_login',
      entityType: 'session',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await db
      .insert(userTenantRoles)
      .values({ tenantId, userId: user.id, role: "USER" })
      .onConflictDoNothing();

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: (effectiveUser as any)?.roles || ['buyer'],
        permissions: (effectiveUser as any)?.permissions || [],
        currentMode: (effectiveUser as any)?.currentMode || 'buyer',
        buyerType: (user as any).buyerType || 'retail',
        verificationLevel: (user as any).verificationLevel || 'NONE',
        mustChangePassword: mustChangePassword(user),
      }
    });
  } catch (error: any) {
    console.error("[ECE] Login error:", error);
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

// OTP login (phone / WhatsApp). No password.
export const startOtpHandler = async (req: any, res: any) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = Number(tenant.id);
    const requestId = String(req.headers["x-request-id"] || req.headers["x-correlation-id"] || `otp-${Date.now()}`);

    const phoneRaw = String(req.body?.phone || "").trim();
    const phone = normalizeOtpPhone(phoneRaw);
    if (!phone) return res.status(400).json({ message: "Phone number required" });

    try {
      // Hard limit: 3 OTP sends per hour per tenant+phone, plus coarse IP guard.
      rateLimitOtp(`otp:tenant:${tenantId}:phone:${phone}`, 3, 60 * 60 * 1000);
      rateLimitOtp(`otp:tenant:${tenantId}:ip:${req.ip}`, 20, 60 * 60 * 1000);
    } catch (err: any) {
      const status = typeof err?.status === "number" ? err.status : 429;
      if (status === 429) res.setHeader("Retry-After", String(err?.retryAfterSec || 60));
      return res.status(status).json({ message: err?.message || "Rate limit exceeded" });
    }

    const out = await sendOtp(phone);
    const health = getWhatsAppOtpHealth();
    if (out.sandboxMode) {
      console.warn("[whatsapp-otp] Twilio WhatsApp Sandbox mode");
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      provider: "twilio_verify",
      delivery: "whatsapp",
      expiresInSec: 10 * 60,
      status: out.status,
      configured: health.configured,
      debugOtp: null,
      requestId,
    });
  } catch (error: any) {
    const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : 500;
    const requestId = String(req.headers["x-request-id"] || req.headers["x-correlation-id"] || `otp-${Date.now()}`);
    console.error(
      `[ECE][OTP_START] tenant=${String((req as any)?.tenant?.id || "unknown")} requestId=${requestId} code=${String(error?.code || "otp_start_failed")} message=${String(error?.message || "Failed to start OTP")}`,
    );
    res.status(status).json({
      message: String(error?.message || "Failed to start OTP"),
      code: error?.code ? String(error.code) : null,
      requestId,
    });
  }
};

router.post("/auth/otp/start", startOtpHandler);

export const verifyOtpHandler = async (req: any, res: any) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;
    const requestId = String(req.headers["x-request-id"] || req.headers["x-correlation-id"] || `otp-${Date.now()}`);

    const phoneRaw = String(req.body?.phone || "").trim();
    const phone = normalizeOtpPhone(phoneRaw);
    const otp = normalizeOtpCode(String(req.body?.otp || req.body?.code || "").trim());

    if (!phone) return res.status(400).json({ message: "Phone number required" });
    if (!isOtpCode(otp)) return res.status(400).json({ message: "Invalid OTP" });

    await verifyOtp(phone, otp);

    // Resolve or create user identity by WhatsApp phone (unique).
    let channel = await db.query.userWhatsappChannels.findFirst({ where: eq(userWhatsappChannels.waPhoneE164, phone) });
    let user = channel ? await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, channel.userId) }) : null;

    if (!user) {
      // Best-effort: bind to an existing user record that has the same phone.
      user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.phone, phone) });
    }

    if (!user) {
      const digits = phone.replace(/\D/g, "");
      const email = `wa_${digits}@otp.local`.toLowerCase();
      const existingByEmail = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
      if (existingByEmail) {
        user = existingByEmail;
      } else {
        const passwordHash = await bcrypt.hash(generateToken(), 10);
        const [newUser] = await db
          .insert(eceUsers)
          .values({
            email,
            passwordHash,
            displayName: `Utilisateur ${phone}`,
            phone,
            role: "buyer",
            roles: ["buyer"],
            permissions: [],
            currentMode: "buyer",
            isActive: true,
            emailVerified: false,
          })
          .returning();
        user = newUser;
      }
    }

    if (!user) {
      return res.status(500).json({ message: "User resolution failed" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is disabled" });
    }

    await db
      .insert(userWhatsappChannels)
      .values({
        userId: user.id,
        waPhoneE164: phone,
        verifiedAt: new Date(),
        status: "active",
        lastSeenAt: new Date(),
        waDisplayName: null,
      })
      .onConflictDoNothing();

    await db
      .insert(userTenantRoles)
      .values({ tenantId, userId: user.id, role: "USER" })
      .onConflictDoNothing();

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(eceSessions).values({
      userId: user.id,
      token,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await db.update(eceUsers).set({ lastLoginAt: new Date() }).where(eq(eceUsers.id, user.id));

    const activeMode = (user as any).currentMode || "buyer";
    await db.insert(auditLogs).values({
      tenantId,
      userId: user.id,
      userRole: activeMode,
      action: "user_login_otp",
      entityType: "session",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: (user as any).roles || ["buyer"],
        permissions: (user as any).permissions || [],
        currentMode: (user as any).currentMode || "buyer",
        buyerType: (user as any).buyerType || "retail",
        verificationLevel: (user as any).verificationLevel || "NONE",
        mustChangePassword: mustChangePassword(user),
      },
      requestId,
    });
  } catch (error: any) {
    const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : 500;
    const requestId = String(req.headers["x-request-id"] || req.headers["x-correlation-id"] || `otp-${Date.now()}`);
    console.error(
      `[ECE][OTP_VERIFY] tenant=${String((req as any)?.tenant?.id || "unknown")} requestId=${requestId} code=${String(error?.code || "otp_verify_failed")} message=${String(error?.message || "OTP verification failed")}`,
    );
    res.status(status).json({
      message: String(error?.message || "OTP verification failed"),
      code: error?.code ? String(error.code) : null,
      requestId,
    });
  }
};

router.post("/auth/otp/verify", verifyOtpHandler);

router.post("/auth/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      await db.delete(eceSessions).where(eq(eceSessions.token, token));
    }

    res.json({ message: "Logged out successfully" });
  } catch (error: any) {
    console.error("[ECE] Logout error:", error);
    res.status(500).json({ message: "Logout failed" });
  }
});

router.post("/auth/switch-mode", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifySession(token);

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { mode } = req.body;
    const userRoles = (user as any).roles || ['buyer'];

    if (!userRoles.includes(mode)) {
      return res.status(403).json({ message: "You don't have access to this mode" });
    }

    await db.update(eceUsers)
      .set({ currentMode: mode })
      .where(eq(eceUsers.id, user.id));

    await db.insert(auditLogs).values({
      tenantId,
      userId: user.id,
      userRole: mode,
      action: 'mode_switched',
      entityType: 'user',
      metadata: { previousMode: (user as any).currentMode || 'buyer', newMode: mode },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ 
      message: "Mode switched successfully",
      currentMode: mode
    });
  } catch (error: any) {
    console.error("[ECE] Mode switch error:", error);
    res.status(500).json({ message: "Failed to switch mode" });
  }
});

router.post("/auth/buyer-type", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifySession(token);

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { buyerType } = req.body as { buyerType?: string };
    if (buyerType !== "wholesale" && buyerType !== "retail") {
      return res.status(400).json({ message: "buyerType must be 'wholesale' or 'retail'" });
    }

    if (buyerType === "wholesale") {
      const roles = ((user as any).roles || []) as string[];
      const isAdmin = (user as any).role === "admin" || roles.includes("admin") || isChairmanAssistantUser(user);
      if (!isAdmin) {
        const approved = await db.query.marketAccessRequests.findFirst({
          where: and(
            eq(marketAccessRequests.userId, user.id),
            eq(marketAccessRequests.marketKey, "wholesale_gold"),
            eq(marketAccessRequests.status, "approved"),
            eq(marketAccessRequests.tenantId, tenantId),
          ),
          orderBy: [desc(marketAccessRequests.createdAt)],
        });
        if (!approved) {
          return res.status(403).json({ message: "Wholesale access requires approval" });
        }
      }
    }

    await db.update(eceUsers)
      .set({ buyerType })
      .where(eq(eceUsers.id, user.id));

    await db.insert(auditLogs).values({
      tenantId,
      userId: user.id,
      userRole: (user as any).currentMode || 'buyer',
      action: 'buyer_type_updated',
      entityType: 'user',
      entityId: user.id,
      metadata: { buyerType },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ buyerType });
  } catch (error: any) {
    console.error("[ECE] Buyer type update error:", error);
    res.status(500).json({ message: "Failed to update buyer type" });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifySession(token, Number((req as any)?.tenant?.id || 0));

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: (user as any).roles || ['buyer'],
      permissions: (user as any).permissions || [],
      currentMode: (user as any).currentMode || 'buyer',
      buyerType: (user as any).buyerType || 'retail',
      verificationLevel: (user as any).verificationLevel || 'NONE',
      mustChangePassword: mustChangePassword(user),
    });
  } catch (error: any) {
    console.error("[ECE] Auth check error:", error);
    res.status(500).json({ message: "Auth check failed" });
  }
});

router.post("/auth/change-password", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifySession(token, tenantId);

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    if (!user.passwordHash) {
      return res.status(403).json({ message: "Password setup required", code: "PASSWORD_SETUP_REQUIRED" });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid current password" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const nextMetadata = { ...normalizeMetadata((user as any).metadata), mustChangePassword: false };

    await db.update(eceUsers)
      .set({ passwordHash, metadata: nextMetadata, updatedAt: new Date() })
      .where(eq(eceUsers.id, user.id));

    await db.insert(auditLogs).values({
      tenantId,
      userId: user.id,
      userRole: (user as any).currentMode || 'buyer',
      action: 'password_changed',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[ECE] Change password error:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
});

router.post("/auth/switch-space", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token, tenant.id);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
    const permissions = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
    const currentMode = (user as any).currentMode;
    const isAdmin =
      roles.includes("admin") ||
      permissions.includes("*") ||
      permissions.includes("view_admin_dashboard") ||
      permissions.includes("manage_users") ||
      currentMode === "admin" ||
      isChairmanAssistantUser(user);

    if (!isAdmin && !isVerifiedForSpaces((user as any).verificationLevel)) {
      return res.status(403).json({ message: "Verification required" });
    }

    const targetTenant = String(req.body?.targetTenant || "").trim();
    if (!targetTenant) {
      return res.status(400).json({ message: "targetTenant is required" });
    }

    const target = await db.query.tenants.findFirst({
      where: eq(tenants.key, targetTenant),
    });
    if (!target) {
      return res.status(404).json({ message: "Unknown tenant" });
    }

    const exchangeToken = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 1000);

    await db.insert(tenantSwitchTokens).values({
      token: exchangeToken,
      userId: user.id,
      targetTenantId: target.id,
      expiresAt,
    });

    res.json({
      token: exchangeToken,
      target: {
        key: target.key,
        domains: (target as any).domains || [],
      },
    });
  } catch (error: any) {
    console.error("[ECE] Space switch error:", error);
    res.status(500).json({ message: "Failed to switch space" });
  }
});

router.post("/auth/switch-space/refresh", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token, tenant.id);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
    const permissions = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
    const currentMode = (user as any).currentMode;
    const isAdmin =
      roles.includes("admin") ||
      permissions.includes("*") ||
      permissions.includes("view_admin_dashboard") ||
      permissions.includes("manage_users") ||
      currentMode === "admin" ||
      isChairmanAssistantUser(user);

    const targetTenantKeyRaw = String(req.body?.targetTenant || "").trim();
    let target = tenant;
    if (targetTenantKeyRaw) {
      const resolved = await db.query.tenants.findFirst({
        where: eq(tenants.key, targetTenantKeyRaw),
      });
      if (resolved) target = resolved as any;
    }

    const targetKey = String((target as any)?.key || "");
    const currentTenantKey = String(tenant.key || "");
    const sameTenant = targetKey === currentTenantKey;
    if (!sameTenant && !isAdmin && !isVerifiedForSpaces((user as any).verificationLevel)) {
      return res.status(403).json({ message: "Verification required" });
    }

    const exchangeToken = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 1000);

    await db.insert(tenantSwitchTokens).values({
      token: exchangeToken,
      userId: user.id,
      targetTenantId: target.id,
      expiresAt,
    });

    res.json({
      token: exchangeToken,
      target: {
        key: target.key,
        domains: (target as any).domains || [],
      },
    });
  } catch (error: any) {
    console.error("[ECE] Space switch refresh error:", error);
    res.status(500).json({ message: "Failed to refresh space switch token" });
  }
});

router.post("/auth/exchange-space", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const token = String(req.body?.token || "").trim();
    if (!token) {
      return res.status(400).json({ message: "token is required" });
    }

    const exchange = await db.query.tenantSwitchTokens.findFirst({
      where: eq(tenantSwitchTokens.token, token),
    });

    if (!exchange || exchange.usedAt || new Date(exchange.expiresAt) < new Date()) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    if (exchange.targetTenantId !== tenant.id) {
      return res.status(403).json({ message: "Token not valid for this tenant" });
    }

    const user = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.id, exchange.userId),
    });
    if (!user || !(user as any).isActive) {
      return res.status(403).json({ message: "Account disabled" });
    }

    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(eceSessions).values({
      userId: user.id,
      token: sessionToken,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await db
      .update(tenantSwitchTokens)
      .set({ usedAt: new Date() })
      .where(eq(tenantSwitchTokens.id, exchange.id));

    res.json({
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: (user as any).roles || ["buyer"],
        permissions: (user as any).permissions || [],
        currentMode: (user as any).currentMode || "buyer",
        buyerType: (user as any).buyerType || "retail",
        verificationLevel: (user as any).verificationLevel || "NONE",
        mustChangePassword: mustChangePassword(user),
      },
    });
  } catch (error: any) {
    console.error("[ECE] Exchange space error:", error);
    res.status(500).json({ message: "Failed to exchange space token" });
  }
});

router.get("/chat/messages", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifySession(token);

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const messages = await db.query.eceChatMessages.findMany({
      where: and(eq(eceChatMessages.userId, user.id), eq(eceChatMessages.tenantId, tenantId)),
      orderBy: [desc(eceChatMessages.createdAt)],
      limit: 100
    });

    res.json(messages.reverse());
  } catch (error: any) {
    console.error("[ECE] Fetch messages error:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

router.post("/chat/send", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifySession(token);

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { content, role } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Message content required" });
    }

    const [userMessage] = await db.insert(eceChatMessages).values({
      tenantId,
      userId: user.id,
      role: 'user',
      content,
      metadata: { requestedRole: role }
    }).returning();

    let profile = null;
    let companyName = undefined;
    let verificationStatus = undefined;
    const currentMode = (user as any).currentMode || 'buyer';

    if (currentMode === 'buyer') {
      profile = await db.query.buyerProfiles.findFirst({
        where: and(eq(buyerProfiles.userId, user.id), eq(buyerProfiles.tenantId, tenantId))
      });
      companyName = profile?.companyName;
      verificationStatus = profile?.verificationStatus;
    } else if (currentMode === 'seller') {
      profile = await db.query.supplierProfiles.findFirst({
        where: and(eq(supplierProfiles.userId, user.id), eq(supplierProfiles.tenantId, tenantId))
      });
      companyName = profile?.companyName;
      verificationStatus = profile?.verificationStatus;
    }

    const recentMessages = await db.query.eceChatMessages.findMany({
      where: and(eq(eceChatMessages.userId, user.id), eq(eceChatMessages.tenantId, tenantId)),
      orderBy: [desc(eceChatMessages.createdAt)],
      limit: 10
    });

    const conversationHistory = recentMessages.reverse().map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })).slice(0, -1);

    const aiResponse = await generateChatResponse(
      content,
      {
        role: currentMode as UserRole,
        userId: user.id,
        userName: user.displayName,
        companyName,
        verificationStatus,
        additionalContext: {
          profileComplete: !!profile,
          isVerified: verificationStatus === 'verified'
        }
      },
      conversationHistory
    );

    const [assistantMessage] = await db.insert(eceChatMessages).values({
      tenantId,
      userId: user.id,
      role: 'assistant',
      content: aiResponse,
      contextType: currentMode,
      metadata: { 
        aiModel:
          process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL ||
          process.env.ANTHROPIC_MODEL ||
          process.env.ANTHROPIC_MODEL_BALANCED ||
          'claude-sonnet-4-5'
      }
    }).returning();

    res.json({
      userMessage,
      assistantMessage
    });
  } catch (error: any) {
    console.error("[ECE] Send message error:", error);
    res.status(500).json({ message: "Failed to send message", error: error.message });
  }
});

const guestRateLimits = new Map<string, { count: number; resetTime: number }>();
const GUEST_RATE_LIMIT = 10;
const GUEST_RATE_WINDOW = 60 * 1000;

router.post("/chat/guest", async (req, res) => {
  try {
    const { content, guestSessionId } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Message content required" });
    }

    if (content.length > 500) {
      return res.status(400).json({ message: "Message too long. Please keep it under 500 characters." });
    }

    const clientIp = req.ip || 'unknown';
    const rateLimitKey = guestSessionId || clientIp;
    const now = Date.now();
    const rateData = guestRateLimits.get(rateLimitKey);

    if (rateData) {
      if (now > rateData.resetTime) {
        guestRateLimits.set(rateLimitKey, { count: 1, resetTime: now + GUEST_RATE_WINDOW });
      } else if (rateData.count >= GUEST_RATE_LIMIT) {
        return res.status(429).json({ 
          message: "Too many requests. Please sign up for unlimited access or wait a minute." 
        });
      } else {
        rateData.count++;
      }
    } else {
      guestRateLimits.set(rateLimitKey, { count: 1, resetTime: now + GUEST_RATE_WINDOW });
    }

    const guestContext = {
      role: 'guest' as any,
      userId: 0,
      userName: 'Guest',
      companyName: undefined,
      verificationStatus: undefined,
      additionalContext: {
        isGuest: true,
        guestSessionId,
        profileComplete: false,
        isVerified: false
      }
    };

    const aiResponse = await generateChatResponse(
      content,
      guestContext,
      []
    );

    res.json({
      response: aiResponse
    });
  } catch (error: any) {
    console.error("[ECE] Guest chat error:", error);
    res.status(500).json({ message: "Failed to process message", error: error.message });
  }
});

router.post("/admin/create-user", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace('Bearer ', '');
    const adminUser = await verifySession(token);

    const adminMode = (adminUser as any)?.currentMode;
    const adminPerms = (adminUser as any)?.permissions || [];
    if (!adminUser || (adminMode !== 'admin' && !adminPerms.includes('*'))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { email, password, displayName, roles, permissions, companyName, country } = req.body;

    if (!email || !password || !displayName || !country) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existingUser = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.email, email.toLowerCase())
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userRoles = roles || ['buyer'];
    const userPerms = permissions || [];
    const defaultMode = userRoles.includes('admin') ? 'admin' : userRoles[0] || 'buyer';

    const [newUser] = await db.insert(eceUsers).values({
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      role: 'buyer',
      roles: userRoles,
      permissions: userPerms,
      currentMode: defaultMode,
      country,
      isActive: true,
      emailVerified: false
    }).returning();

    await db.insert(auditLogs).values({
      tenantId,
      userId: adminUser.id,
      userRole: adminMode || 'admin',
      action: 'admin_created_user',
      entityType: 'user',
      entityId: newUser.id,
      newState: { email: newUser.email, roles: userRoles, permissions: userPerms },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await db
      .insert(userTenantRoles)
      .values({ tenantId, userId: newUser.id, role: "USER" })
      .onConflictDoNothing();

    res.json({
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        roles: userRoles,
        permissions: userPerms,
        currentMode: defaultMode,
        buyerType: (newUser as any).buyerType || 'retail',
        verificationLevel: (newUser as any).verificationLevel || 'NONE',
        mustChangePassword: mustChangePassword(newUser),
      }
    });
  } catch (error: any) {
    console.error("[ECE] Admin create user error:", error);
    res.status(500).json({ message: "Failed to create user", error: error.message });
  }
});

router.get("/suppliers/registry", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifySession(token);

    const activeMode = (user as any)?.currentMode;
    const userPerms = (user as any)?.permissions || [];
    if (!user || (activeMode !== 'admin' && !userPerms.includes('*'))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const lists = await db.query.governmentSupplierLists.findMany({
      where: and(eq(governmentSupplierLists.isActive, true), eq(governmentSupplierLists.tenantId, tenantId)),
      orderBy: [desc(governmentSupplierLists.createdAt)]
    });

    res.json(lists);
  } catch (error: any) {
    console.error("[ECE] Fetch supplier lists error:", error);
    res.status(500).json({ message: "Failed to fetch supplier lists" });
  }
});

router.post("/suppliers/registry", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifySession(token);

    const activeMode = (user as any)?.currentMode;
    const userPerms = (user as any)?.permissions || [];
    if (!user || (activeMode !== 'admin' && !userPerms.includes('*'))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { country, sourceName, effectiveDate, expiryDate, documentUrl, entries } = req.body;

    const [newList] = await db.insert(governmentSupplierLists).values({
      tenantId,
      country,
      sourceName,
      uploadedBy: user.id,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      documentUrl,
      isActive: true,
      metadata: { totalSuppliers: entries?.length || 0 }
    }).returning();

    if (entries && Array.isArray(entries)) {
      for (const entry of entries) {
        await db.insert(supplierRegistryEntries).values({
          tenantId,
          governmentListId: newList.id,
          supplierName: entry.supplierName,
          companyId: entry.companyId,
          licenseNumber: entry.licenseNumber,
          region: entry.region,
          commodityType: entry.commodityType || 'gold',
          licenseExpiry: entry.licenseExpiry ? new Date(entry.licenseExpiry) : null,
          isActive: true
        });
      }
    }

    await db.insert(auditLogs).values({
      tenantId,
      userId: user.id,
      userRole: activeMode || 'admin',
      action: 'government_list_uploaded',
      entityType: 'government_supplier_list',
      entityId: newList.id,
      newState: { country, sourceName, entriesCount: entries?.length || 0 },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json(newList);
  } catch (error: any) {
    console.error("[ECE] Upload supplier list error:", error);
    res.status(500).json({ message: "Failed to upload supplier list" });
  }
});

router.get("/metrics/summary", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await verifySession(token);

    const activeMode = (user as any)?.currentMode;
    const userPerms = (user as any)?.permissions || [];
    if (!user || (activeMode !== 'admin' && !userPerms.includes('*') && !userPerms.includes('view_financials'))) {
      return res.status(403).json({ message: "Access denied" });
    }

    const activeSuppliers = await db.query.supplierProfiles.findMany({
      where: and(eq(supplierProfiles.verificationStatus, 'verified'), eq(supplierProfiles.tenantId, tenantId))
    });

    const activeBuyers = await db.query.buyerProfiles.findMany({
      where: and(eq(buyerProfiles.verificationStatus, 'verified'), eq(buyerProfiles.tenantId, tenantId))
    });

    const allContracts = await db.query.contracts.findMany({
      where: eq(contracts.tenantId, tenantId),
    });
    const allShipments = await db.query.shipments.findMany({
      where: eq(shipments.tenantId, tenantId),
    });

    const metrics = {
      totalRotations: allContracts.length,
      totalVolumeKg: allContracts.reduce((sum, c) => sum + parseFloat(c.contractedWeightKg || '0'), 0),
      totalValueUsd: allContracts.reduce((sum, c) => sum + parseFloat(c.totalValue || '0'), 0),
      activeSuppliers: activeSuppliers.length,
      activeBuyers: activeBuyers.length,
      pendingContracts: allContracts.filter(c => c.status === 'pending_approval').length,
      inTransitShipments: allShipments.filter(s => s.status === 'in_transit').length,
      countries: [...new Set(activeSuppliers.map(s => s.country))].length
    };

    res.json(metrics);
  } catch (error: any) {
    console.error("[ECE] Fetch metrics error:", error);
    res.status(500).json({ message: "Failed to fetch metrics" });
  }
});

// ============================================================================
// Agentic Inbox (MVP): room-based chat built on ece_chat_messages.contextType
// ============================================================================

router.post("/onboarding/join-role", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;
    const tenantKey = String(tenant.key || "bdo");

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const raw = String(req.body?.role || "").trim().toLowerCase();
    const normalized = raw.replace(/[^a-z_-]/g, "");
    const mapping: Record<string, { role: string; roomKey: string }> = {
      seller: { role: "seller", roomKey: "sales" },
      miner: { role: "mine_owner", roomKey: "production" },
      mine_owner: { role: "mine_owner", roomKey: "production" },
      delivery: { role: "delivery", roomKey: "delivery" },
      investor: { role: "investor", roomKey: "investor" },
    };
    const resolved = mapping[normalized];
    if (!resolved) return res.status(400).json({ message: "Invalid role" });

    const priorRoles: string[] = Array.isArray((user as any).roles)
      ? ((user as any).roles as any[]).map((r) => String(r))
      : [];
    const nextRoles = new Set<string>(priorRoles);
    nextRoles.add(resolved.role);
    nextRoles.add("buyer"); // keep baseline access

    await db
      .update(eceUsers)
      .set({
        roles: Array.from(nextRoles.values()) as any,
        currentMode: resolved.role as any,
        updatedAt: new Date(),
      })
      .where(eq(eceUsers.id, user.id));

    await db
      .insert(userTenantRoles)
      .values({ tenantId, userId: user.id, role: "USER" })
      .onConflictDoNothing();

    await db.insert(auditLogs).values({
      tenantId,
      userId: user.id,
      userRole: resolved.role,
      action: "join_role",
      entityType: "user",
      entityId: user.id,
      metadata: { requested: normalized, resolved: resolved.role },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const updated = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, user.id) });
    const outUser = updated || user;

    res.json({
      ok: true,
      role: resolved.role,
      roomKey: resolved.roomKey,
      user: {
        id: outUser.id,
        email: outUser.email,
        displayName: outUser.displayName,
        roles: (outUser as any).roles || ["buyer"],
        permissions: (outUser as any).permissions || [],
        currentMode: (outUser as any).currentMode || "buyer",
        buyerType: (outUser as any).buyerType || "retail",
        verificationLevel: (outUser as any).verificationLevel || "NONE",
        mustChangePassword: mustChangePassword(outUser),
      },
    });
  } catch (error: any) {
    console.error("[ECE] Join role error:", error);
    res.status(500).json({ message: "Failed to join role" });
  }
});

router.get("/onboarding/config", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const wantsDefaults = String((req.query as any)?.defaults || "").trim() === "1";
    const config = wantsDefaults ? getDefaultEceOnboardingConfig() : await getEceOnboardingConfig(String(tenant.key || "bdo"));
    res.setHeader("Cache-Control", "no-store");
    res.json({ config });
  } catch (error: any) {
    console.error("[ECE] Onboarding config error:", error);
    res.status(500).json({ message: "Failed to load onboarding config" });
  }
});

type OperationsEventCategory = "company" | "clients" | "team" | "money" | "approvals";

function prettifyEventAction(action: string): string {
  const normalized = String(action || "").trim().toLowerCase();
  if (!normalized) return "Company update";

  const patterns: Array<{ pattern: RegExp; title: string; category: OperationsEventCategory }> = [
    { pattern: /payment|wallet|ledger|topup|payout|invoice|transfer/, title: "Payment activity", category: "money" },
    { pattern: /approval|approve|reject/, title: "Approval update", category: "approvals" },
    { pattern: /support|client|sales|offer|lead/, title: "Client update", category: "clients" },
    { pattern: /team|agent|handoff|task/, title: "AI team update", category: "team" },
    { pattern: /risk|alert|security|compliance/, title: "Risk alert", category: "company" },
    { pattern: /email_work_order|email/, title: "Message sent", category: "clients" },
    { pattern: /whatsapp/, title: "WhatsApp update", category: "clients" },
  ];

  const matched = patterns.find((entry) => entry.pattern.test(normalized));
  if (matched) return matched.title;

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function categoryFromAction(action: string, fallback: OperationsEventCategory = "company"): OperationsEventCategory {
  const normalized = String(action || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (/payment|wallet|ledger|topup|payout|invoice|transfer/.test(normalized)) return "money";
  if (/approval|approve|reject/.test(normalized)) return "approvals";
  if (/support|client|sales|offer|lead|email|whatsapp/.test(normalized)) return "clients";
  if (/team|agent|handoff|task/.test(normalized)) return "team";
  return fallback;
}

function categoryFromRoom(roomKey: string | null | undefined): OperationsEventCategory {
  const key = String(roomKey || "").trim().toLowerCase();
  if (!key) return "company";
  if (key === "wallet") return "money";
  if (key === "team") return "team";
  if (["sales", "support", "procurement", "delivery", "legal", "compliance"].includes(key)) return "clients";
  return "company";
}

router.get("/operations/center", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    await ensureEceAgentsTables();

    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

    const tickets = await db.query.sourcingRequests.findMany({
      where: and(
        eq(sourcingRequests.tenantId, tenantId),
        eq(sourcingRequests.requesterUserId, user.id),
        inArray(sourcingRequests.status, ["open", "sourcing", "matched"]),
      ),
      orderBy: [desc(sourcingRequests.updatedAt), desc(sourcingRequests.id)],
      limit: 40,
    });

    const slaRisks = tickets.filter((ticket) => {
      const urgency = String(ticket.urgency || "").toLowerCase();
      if (urgency.includes("urgent") || urgency.includes("aujourd") || urgency.includes("today")) return true;
      const updatedAt = ticket.updatedAt ? new Date(ticket.updatedAt).getTime() : 0;
      return updatedAt > 0 && now - updatedAt > 24 * 60 * 60 * 1000;
    }).length;

    const wallet = await getOrCreateWalletAccount(String(user.id), "XOF");
    const todayCredits = await db.query.walletLedgerEntries.findMany({
      where: and(
        eq(walletLedgerEntries.walletAccountId, wallet.id),
        eq(walletLedgerEntries.direction, "CREDIT" as any),
        sql`${walletLedgerEntries.createdAt} >= ${startOfDay}`,
      ),
      orderBy: [desc(walletLedgerEntries.createdAt)],
      limit: 100,
    });
    const paymentsReceivedToday = todayCredits.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const clientRepliesRows = await db.query.eceChatMessages.findMany({
      where: and(
        eq(eceChatMessages.tenantId, tenantId),
        eq(eceChatMessages.userId, user.id),
        eq(eceChatMessages.role, "user"),
        inArray(eceChatMessages.contextType, ["sales", "support", "procurement", "delivery"]),
        sql`${eceChatMessages.createdAt} >= ${dayAgo}`,
      ),
      orderBy: [desc(eceChatMessages.createdAt), desc(eceChatMessages.id)],
      limit: 120,
    });
    const newClientReplies = clientRepliesRows.length;

    const ownOrgRows = await db.execute(sql`
      select id
      from ece_agent_orgs
      where tenant_id = ${tenantId}
        and owner_user_id = ${user.id}
      order by id asc
      limit 1
    `);
    const anyOrgRows = await db.execute(sql`
      select id
      from ece_agent_orgs
      where tenant_id = ${tenantId}
      order by id asc
      limit 1
    `);
    const ownOrg = getSqlRows(ownOrgRows)[0];
    const anyOrg = getSqlRows(anyOrgRows)[0];
    const orgId = Number(ownOrg?.id ?? anyOrg?.id ?? 0);

    const pendingApprovalsRows = orgId
      ? await db.execute(sql`
          select count(*)::int as count
          from ece_org_agent_tasks
          where tenant_id = ${tenantId}
            and org_id = ${orgId}
            and status = 'needs_approval'
        `)
      : ({ rows: [{ count: 0 }] } as any);
    const pendingApprovals = Number(getSqlRows(pendingApprovalsRows)[0]?.count || 0);

    const agentsRows = orgId
      ? await db.execute(sql`
          select
            a.id,
            a.display_name,
            a.status,
            a.model_tier,
            t.title as template_title,
            (
              select m.content
              from ece_org_agent_messages m
              where m.tenant_id = a.tenant_id and m.org_agent_id = a.id
              order by m.created_at desc, m.id desc
              limit 1
            ) as last_message
          from ece_org_agents a
          left join ece_agent_templates t on t.id = a.template_id
          where a.tenant_id = ${tenantId}
            and a.org_id = ${orgId}
          order by a.created_at desc
          limit 12
        `)
      : ({ rows: [] } as any);

    const tasksRows = orgId
      ? await db.execute(sql`
          select
            t.id,
            t.title,
            t.status,
            t.type,
            t.org_agent_id,
            a.display_name as agent_name,
            t.created_at
          from ece_org_agent_tasks t
          join ece_org_agents a on a.id = t.org_agent_id and a.tenant_id = t.tenant_id and a.org_id = t.org_id
          where t.tenant_id = ${tenantId}
            and t.org_id = ${orgId}
          order by t.created_at desc, t.id desc
          limit 80
        `)
      : ({ rows: [] } as any);

    const recentAudit = await db.query.auditLogs.findMany({
      where: and(eq(auditLogs.tenantId, tenantId), sql`${auditLogs.createdAt} >= ${dayAgo}`),
      orderBy: [desc(auditLogs.createdAt), desc(auditLogs.id)],
      limit: 20,
    });

    const recentRoomMessages = await db.query.eceChatMessages.findMany({
      where: and(
        eq(eceChatMessages.tenantId, tenantId),
        eq(eceChatMessages.userId, user.id),
        inArray(eceChatMessages.role, ["assistant", "system"]),
        sql`${eceChatMessages.createdAt} >= ${dayAgo}`,
      ),
      orderBy: [desc(eceChatMessages.createdAt), desc(eceChatMessages.id)],
      limit: 16,
    });

    const toIso = (value: unknown) => {
      const date = value instanceof Date ? value : new Date(String(value || ""));
      if (Number.isNaN(date.getTime())) return new Date().toISOString();
      return date.toISOString();
    };

    const liveEvents: Array<{
      id: string;
      title: string;
      detail: string | null;
      severity: "low" | "medium" | "high";
      createdAt: string;
      link: string;
      category: OperationsEventCategory;
    }> = [];

    for (const row of (tasksRows as any).rows || []) {
      if (String(row.status || "").toLowerCase() !== "needs_approval") continue;
      liveEvents.push({
        id: `task-${row.id}`,
        title: "Approval needed",
        detail: String(row.title || `Task #${row.id}`),
        severity: "high",
        createdAt: toIso(row.created_at),
        link: "/app/actions?filter=approvals",
        category: "approvals",
      });
    }

    for (const row of todayCredits.slice(0, 8)) {
      liveEvents.push({
        id: `pay-${row.id}`,
        title: "Payment received",
        detail: `+${Math.trunc(Number(row.amount || 0)).toLocaleString("fr-FR")} XOF`,
        severity: Number(row.amount || 0) >= 100000 ? "high" : "medium",
        createdAt: toIso(row.createdAt),
        link: "/app/wallet",
        category: "money",
      });
    }

    for (const row of tickets.slice(0, 8)) {
      liveEvents.push({
        id: `ticket-${row.id}`,
        title: "Client request update",
        detail: String(row.productQuery || `Request #${row.id}`),
        severity: String(row.urgency || "").toLowerCase().includes("urgent") ? "high" : "medium",
        createdAt: toIso(row.updatedAt || row.createdAt),
        link: "/app/chats",
        category: "clients",
      });
    }

    for (const row of recentRoomMessages.slice(0, 8)) {
      liveEvents.push({
        id: `msg-${row.id}`,
        title: "Agent update",
        detail: String(row.content || "").slice(0, 180),
        severity: row.role === "system" ? "medium" : "low",
        createdAt: toIso(row.createdAt),
        link: `/app/chats/${normalizeRoomKey(row.contextType) === "ops" ? "general-operations" : normalizeRoomKey(row.contextType) || "general-operations"}`,
        category: categoryFromRoom(normalizeRoomKey(row.contextType)),
      });
    }

    for (const row of recentAudit.slice(0, 8)) {
      const action = String(row.action || "");
      const title = prettifyEventAction(action);
      const category = categoryFromAction(action);
      liveEvents.push({
        id: `audit-${row.id}`,
        title,
        detail: asString(row.entityType) || null,
        severity: /failed|blocked|risk|error/i.test(action) ? "high" : "low",
        createdAt: toIso(row.createdAt),
        link: "/app/chats/general-operations",
        category,
      });
    }

    liveEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      summary: {
        activeTickets: tickets.length,
        slaRisks,
        newClientReplies,
        paymentsReceivedToday,
        pendingApprovals,
      },
      live: liveEvents.slice(0, 40),
      tickets: tickets.slice(0, 30).map((ticket) => ({
        id: ticket.id,
        productQuery: ticket.productQuery,
        status: ticket.status,
        urgency: ticket.urgency,
        updatedAt: toIso(ticket.updatedAt || ticket.createdAt),
      })),
      agents: getSqlRows(agentsRows).map((row: any) => ({
        id: Number(row.id),
        display_name: String(row.display_name || `Agent ${row.id}`),
        status: String(row.status || "active"),
        model_tier: String(row.model_tier || "L0"),
        template_title: row.template_title ? String(row.template_title) : null,
        last_message: row.last_message ? String(row.last_message) : null,
      })),
      tasks: getSqlRows(tasksRows).map((row: any) => ({
        id: Number(row.id),
        title: String(row.title || `Task #${row.id}`),
        status: String(row.status || "draft"),
        type: String(row.type || "task"),
        org_agent_id: Number(row.org_agent_id || 0),
        agent_name: row.agent_name ? String(row.agent_name) : null,
        created_at: toIso(row.created_at),
      })),
    });
  } catch (error: any) {
    console.error("[ECE] Operations center error:", error);
    res.status(500).json({ message: "Failed to load operations center" });
  }
});

router.get("/money/overview", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const wallet = await getOrCreateWalletAccount(String(user.id), "XOF");
    const latest = await db.query.walletLedgerEntries.findFirst({
      where: eq(walletLedgerEntries.walletAccountId, wallet.id),
      orderBy: [desc(walletLedgerEntries.createdAt)],
    });

    const transactions = await db.query.walletLedgerEntries.findMany({
      where: eq(walletLedgerEntries.walletAccountId, wallet.id),
      orderBy: [desc(walletLedgerEntries.createdAt), desc(walletLedgerEntries.id)],
      limit: 120,
    });

    const todayRows = transactions.filter((row) => row.createdAt && new Date(row.createdAt).getTime() >= startOfDay.getTime());
    const todayReceived = todayRows
      .filter((row) => String(row.direction || "").toUpperCase() === "CREDIT")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const feesToday = todayRows
      .filter((row) => String(row.entryType || "").toUpperCase() === "FEE")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const requestRows = await db.query.eceChatMessages.findMany({
      where: and(
        eq(eceChatMessages.tenantId, tenantId),
        eq(eceChatMessages.userId, user.id),
        eq(eceChatMessages.contextType, "wallet"),
        inArray(eceChatMessages.role, ["system", "assistant"]),
        sql`${eceChatMessages.createdAt} >= ${weekAgo}`,
      ),
      orderBy: [desc(eceChatMessages.createdAt), desc(eceChatMessages.id)],
      limit: 100,
    });

    const pendingAmount = requestRows.reduce((sum, row) => {
      const meta = normalizeMetadata(row.metadata);
      const card = normalizeMetadata(meta.card);
      if (String(card.kind || "").toLowerCase() !== "request_payment") return sum;
      const status = String(card.status || "").toLowerCase();
      if (status && status !== "logged" && status !== "pending") return sum;
      const amount = Number(card.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return sum;
      return sum + amount;
    }, 0);

    const disputeRows = await db.query.auditLogs.findMany({
      where: and(
        eq(auditLogs.tenantId, tenantId),
        sql`${auditLogs.createdAt} >= ${monthAgo}`,
        sql`${auditLogs.action} ilike ${"%dispute%"}`,
      ),
      orderBy: [desc(auditLogs.createdAt)],
      limit: 50,
    });
    const disputeCount = disputeRows.length;

    const taxEstimate = Math.max(0, Math.round((todayReceived - feesToday) * 0.02));

    res.json({
      walletId: wallet.id,
      currency: String(wallet.currency || "XOF"),
      balance: Number(latest?.balanceAfter || 0),
      todayReceived,
      pendingAmount,
      disputeCount,
      feesToday,
      taxEstimate,
      transactions: transactions.slice(0, 80).map((row) => ({
        id: row.id,
        direction: row.direction,
        amount: Number(row.amount || 0),
        balanceAfter: Number(row.balanceAfter || 0),
        entryType: row.entryType,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
        reference: row.referenceId || null,
        note: normalizeMetadata(row.metadata).note ? String(normalizeMetadata(row.metadata).note) : null,
      })),
    });
  } catch (error: any) {
    console.error("[ECE] Money overview error:", error);
    res.status(500).json({ message: "Failed to load money overview" });
  }
});

router.get("/mine/production/overview", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const canAdmin = isEceAdmin(user);
    const canMine = isMineUser(user);
    if (!canAdmin && !canMine) {
      return res.status(403).json({ message: "Mine access required" });
    }

    const companyId = await resolveMineCompanyId({ tenantId, userId: user.id });
    const timeZone = String((user as any)?.timezone || "UTC") || "UTC";

    const overview = await computeMineProductionOverview({
      tenantId,
      companyId,
      timeZone,
    });

    res.json({
      companyId,
      unit: "grams",
      ...overview,
    });
  } catch (error: any) {
    console.error("[ECE] Mine production overview error:", error);
    res.status(500).json({ message: "Failed to load mine production overview" });
  }
});

router.post("/mine/production/today", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const canAdmin = isEceAdmin(user);
    const canMine = isMineUser(user);
    if (!canAdmin && !canMine) {
      return res.status(403).json({ message: "Mine access required" });
    }

    const companyId = await resolveMineCompanyId({ tenantId, userId: user.id });
    const timeZone = String((user as any)?.timezone || "UTC") || "UTC";
    const today = formatDateKey(new Date(), timeZone);

    const gramsRaw = (req.body as any)?.gramsTotal ?? (req.body as any)?.grams_total ?? (req.body as any)?.grams;
    const gramsNum = parseFiniteNumber(gramsRaw);
    if (!gramsNum || gramsNum <= 0) {
      return res.status(400).json({ message: "gramsTotal must be a positive number" });
    }
    const gramsRounded = Math.round(gramsNum * 1000) / 1000;
    const gramsTotal = gramsRounded.toFixed(3);

    const purityNum = parseFiniteNumber((req.body as any)?.purityPercent ?? (req.body as any)?.purity_percent);
    if (purityNum !== null && (purityNum < 0 || purityNum > 100)) {
      return res.status(400).json({ message: "purityPercent must be between 0 and 100" });
    }
    const purityPercent = purityNum === null ? null : (Math.round(purityNum * 100) / 100).toFixed(2);

    const shiftRaw = String((req.body as any)?.shift || "").trim().toUpperCase();
    const shift = shiftRaw === "AM" || shiftRaw === "PM" ? shiftRaw : null;

    const notesRaw = String((req.body as any)?.notes || "").trim();
    const notes = notesRaw ? notesRaw.slice(0, 4000) : null;

    const siteId = normalizeMineSiteId((req.body as any)?.siteId ?? (req.body as any)?.site_id);

    const now = new Date();
    const [row] = await db
      .insert(mineDailyProduction)
      .values({
        tenantId,
        companyId,
        userId: user.id,
        siteId,
        date: today,
        gramsTotal,
        purityPercent,
        shift,
        notes,
        createdAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoUpdate({
        target: [mineDailyProduction.tenantId, mineDailyProduction.companyId, mineDailyProduction.siteId, mineDailyProduction.date],
        set: {
          userId: user.id,
          gramsTotal,
          purityPercent,
          shift,
          notes,
          updatedAt: now,
        } as any,
      })
      .returning();

    await db
      .insert(auditLogs)
      .values({
        tenantId,
        userId: user.id,
        userRole: String((user as any)?.currentMode || (user as any)?.role || "user"),
        action: "mine_daily_production_upserted",
        entityType: "mine_daily_production",
        entityId: String(row?.id || ""),
        metadata: { date: today, gramsTotal, siteId },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        createdAt: now,
      } as any)
      .catch(() => null);

    const overview = await computeMineProductionOverview({
      tenantId,
      companyId,
      timeZone,
    });

    res.json({
      ok: true,
      companyId,
      unit: "grams",
      saved: row
        ? {
            id: row.id,
            date: row.date,
            siteId: row.siteId || "default",
            gramsTotal: Number(row.gramsTotal || 0),
            purityPercent: row.purityPercent ? Number(row.purityPercent) : null,
            shift: row.shift || null,
            notes: row.notes || null,
            updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
          }
        : null,
      ...overview,
    });
  } catch (error: any) {
    console.error("[ECE] Mine production upsert error:", error);
    res.status(500).json({ message: "Failed to save today's production" });
  }
});

router.get("/mine/production/history", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const canAdmin = isEceAdmin(user);
    const canMine = isMineUser(user);
    if (!canAdmin && !canMine) {
      return res.status(403).json({ message: "Mine access required" });
    }

    const companyId = await resolveMineCompanyId({ tenantId, userId: user.id });
    const timeZone = String((user as any)?.timezone || "UTC") || "UTC";
    const today = formatDateKey(new Date(), timeZone);

    const from = String(req.query?.from || "").trim();
    const to = String(req.query?.to || "").trim();
    const limitRaw = Number(String(req.query?.limit || "60"));
    const limit = Number.isFinite(limitRaw) ? Math.min(365, Math.max(1, Math.trunc(limitRaw))) : 60;

    const siteIdParam = req.query?.siteId ?? req.query?.site_id;
    const siteId = siteIdParam ? normalizeMineSiteId(siteIdParam) : null;

    const where = [
      eq(mineDailyProduction.tenantId, tenantId),
      eq(mineDailyProduction.companyId, companyId),
    ] as any[];

    if (siteId) where.push(eq(mineDailyProduction.siteId, siteId));

    if (from && to) {
      where.push(gte(mineDailyProduction.date, from));
      where.push(lte(mineDailyProduction.date, to));
    } else {
      where.push(lte(mineDailyProduction.date, today));
    }

    const rows = await db.query.mineDailyProduction.findMany({
      where: and(...where),
      orderBy: [desc(mineDailyProduction.date), desc(mineDailyProduction.updatedAt), desc(mineDailyProduction.id)],
      limit,
    });

    res.json({
      companyId,
      unit: "grams",
      rows: rows.map((row) => ({
        id: row.id,
        date: row.date,
        siteId: row.siteId || "default",
        gramsTotal: Number(row.gramsTotal || 0),
        purityPercent: row.purityPercent ? Number(row.purityPercent) : null,
        shift: row.shift || null,
        notes: row.notes || null,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        recordedByUserId: row.userId,
      })),
    });
  } catch (error: any) {
    console.error("[ECE] Mine production history error:", error);
    res.status(500).json({ message: "Failed to load production history" });
  }
});

router.get("/inbox/rooms", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const roomKeys = getDefaultRoomsForUser(user);

    const recentMessages = await db.query.eceChatMessages.findMany({
      where: and(eq(eceChatMessages.userId, user.id), eq(eceChatMessages.tenantId, tenantId), inArray(eceChatMessages.contextType, roomKeys)),
      orderBy: [desc(eceChatMessages.createdAt), desc(eceChatMessages.id)],
      limit: 250,
    });

    const lastByRoom = new Map<string, (typeof recentMessages)[number]>();
    for (const msg of recentMessages) {
      if (isLegacyPlaceholderRoomMessage(msg)) continue;
      const key = normalizeRoomKey(msg.contextType);
      if (!key) continue;
      if (lastByRoom.has(key)) continue;
      lastByRoom.set(key, msg);
    }

    const rooms = roomKeys.map((key) => {
      const def = ROOM_DEFS[key] ?? { title: key, subtitle: "" };
      const last = lastByRoom.get(key);
      return {
        key,
        title: def.title,
        subtitle: def.subtitle,
        isPinned: Boolean(def.pinned),
        unreadCount: 0,
        lastMessage: last
          ? {
              content: last.content,
              createdAt: last.createdAt?.toISOString?.() ?? new Date().toISOString(),
              role: last.role as "user" | "assistant" | "system",
            }
          : null,
      };
    });

    res.json({ rooms });
  } catch (error: any) {
    console.error("[ECE] Inbox rooms error:", error);
    res.status(500).json({ message: "Failed to load inbox rooms" });
  }
});

router.get("/inbox/rooms/:roomKey/messages", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const roomKey = normalizeRoomKey(req.params.roomKey);
    const allowedRooms = new Set(getDefaultRoomsForUser(user));
    if (!roomKey || !allowedRooms.has(roomKey)) {
      return res.status(404).json({ message: "Room not found" });
    }

    const messages = await db.query.eceChatMessages.findMany({
      where: and(
        eq(eceChatMessages.userId, user.id),
        eq(eceChatMessages.tenantId, tenantId),
        eq(eceChatMessages.contextType, roomKey),
      ),
      orderBy: [asc(eceChatMessages.createdAt), asc(eceChatMessages.id)],
      limit: 250,
    });

    const def = ROOM_DEFS[roomKey] ?? { title: roomKey, subtitle: "" };

    res.json({
      room: { key: roomKey, title: def.title, subtitle: def.subtitle },
      messages: messages.filter((m) => !isLegacyPlaceholderRoomMessage(m)),
    });
  } catch (error: any) {
    console.error("[ECE] Inbox messages error:", error);
    res.status(500).json({ message: "Failed to load room messages" });
  }
});

router.post("/inbox/rooms/:roomKey/cards", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const roomKey = normalizeRoomKey(req.params.roomKey);
    const allowedRooms = new Set(getDefaultRoomsForUser(user));
    if (!roomKey || !allowedRooms.has(roomKey)) {
      return res.status(404).json({ message: "Room not found" });
    }

    const kind = asString(req.body?.kind).trim().toLowerCase();
    const allowedKinds = new Set([
      "request_payment",
      "pay_now",
      "create_task",
      "share_product",
      "send_contract",
      "create_order",
      "delivery_update",
    ]);
    if (!allowedKinds.has(kind)) return res.status(400).json({ message: "Unsupported card kind" });

    const amountRaw = Number(req.body?.amount);
    const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? Math.trunc(amountRaw) : null;
    const currency = asString(req.body?.currency).trim().toUpperCase() || "XOF";
    const to = asString(req.body?.to).trim() || null;
    const note = asString(req.body?.note).trim() || null;
    const dueDate = asString(req.body?.dueDate).trim() || null;
    const productTitle = asString(req.body?.productTitle).trim() || null;
    const deliveryStatus = asString(req.body?.deliveryStatus).trim() || null;

    const cardTitleByKind: Record<string, string> = {
      request_payment: "Request Payment",
      pay_now: "Send Money",
      create_task: "Task",
      share_product: "Share Product",
      send_contract: "Contract",
      create_order: "Create Order",
      delivery_update: "Delivery Update",
    };
    const cardTitle = cardTitleByKind[kind] || "Action";

    const [auditRow] = await db
      .insert(auditLogs)
      .values({
        tenantId,
        userId: user.id,
        userRole: String(user.currentMode || user.role || "user"),
        action: `chat_card_${kind}`,
        entityType: "chat_card",
        metadata: {
          roomKey,
          kind,
          to,
          amount,
          currency,
          note,
          dueDate,
          productTitle,
          deliveryStatus,
        } as any,
      })
      .returning();

    const cardMeta = {
      kind,
      title: cardTitle,
      status: "logged",
      amount: amount ?? undefined,
      currency,
      note: note ?? undefined,
      dueDate: dueDate ?? undefined,
      productTitle: productTitle ?? undefined,
      deliveryStatus: deliveryStatus ?? undefined,
      actionId: auditRow?.id ?? null,
    };

    const [userMessage] = await db
      .insert(eceChatMessages)
      .values({
        tenantId,
        userId: user.id,
        role: "user",
        contextType: roomKey,
        content: `${cardTitle}${note ? `: ${note}` : ""}`,
        metadata: {
          card: cardMeta,
          requestedRole: String(user.currentMode || user.role || "user"),
        } as any,
      })
      .returning();

    const [systemMessage] = await db
      .insert(eceChatMessages)
      .values({
        tenantId,
        userId: user.id,
        role: "system",
        contextType: roomKey,
        content: `${cardTitle} logged and queued for processing.`,
        metadata: {
          card: cardMeta,
          executedActions: [{ type: kind, status: "logged", actionId: auditRow?.id ?? null }],
          source: {
            agent_id: "ops_agent",
            server_msg_id: `ops-card-${Date.now()}`,
          },
        } as any,
      })
      .returning();

    res.json({
      ok: true,
      actionId: auditRow?.id ?? null,
      userMessage,
      systemMessage,
    });
  } catch (error: any) {
    console.error("[ECE] Inbox card action error:", error);
    res.status(500).json({ message: "Failed to create card action" });
  }
});

router.post("/inbox/rooms/:roomKey/send", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;
    const tenantKey = String(tenant.key || "bdo");

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const roomKey = normalizeRoomKey(req.params.roomKey);
    const allowedRooms = new Set(getDefaultRoomsForUser(user));
    if (!roomKey || !allowedRooms.has(roomKey)) {
      return res.status(404).json({ message: "Room not found" });
    }

    const content = asString(req.body?.content).trim();
    if (!content) return res.status(400).json({ message: "Message content required" });

    const clientMessageIdRaw = asString(req.body?.clientMessageId || req.body?.client_message_id).trim();
    const clientMessageId = clientMessageIdRaw ? clientMessageIdRaw.slice(0, 120) : null;

    if (clientMessageId) {
      const existingUserMessage = await db.query.eceChatMessages.findFirst({
        where: and(
          eq(eceChatMessages.userId, user.id),
          eq(eceChatMessages.tenantId, tenantId),
          eq(eceChatMessages.contextType, roomKey),
          eq(eceChatMessages.role, "user"),
          sql`${eceChatMessages.metadata} ->> 'clientMessageId' = ${clientMessageId}`,
        ),
        orderBy: [desc(eceChatMessages.createdAt), desc(eceChatMessages.id)],
      });

      if (existingUserMessage) {
        const existingAssistantMessage = await db.query.eceChatMessages.findFirst({
          where: and(
            eq(eceChatMessages.userId, user.id),
            eq(eceChatMessages.tenantId, tenantId),
            eq(eceChatMessages.contextType, roomKey),
            eq(eceChatMessages.role, "assistant"),
            sql`${eceChatMessages.metadata} ->> 'inReplyToClientMessageId' = ${clientMessageId}`,
          ),
          orderBy: [asc(eceChatMessages.createdAt), asc(eceChatMessages.id)],
        });

        const def = ROOM_DEFS[roomKey] ?? { title: roomKey, subtitle: "" };
        return res.json({
          ok: true,
          deduped: true,
          room: { key: roomKey, title: def.title, subtitle: def.subtitle },
          userMessage: existingUserMessage,
          assistantMessage: existingAssistantMessage ?? null,
        });
      }
    }

    const lastUserMessage = await db.query.eceChatMessages.findFirst({
      where: and(
        eq(eceChatMessages.userId, user.id),
        eq(eceChatMessages.tenantId, tenantId),
        eq(eceChatMessages.contextType, roomKey),
        eq(eceChatMessages.role, "user"),
      ),
      orderBy: [desc(eceChatMessages.createdAt), desc(eceChatMessages.id)],
    });

    if (
      lastUserMessage &&
      typeof lastUserMessage.content === "string" &&
      lastUserMessage.content.trim() === content &&
      lastUserMessage.createdAt &&
      Date.now() - new Date(lastUserMessage.createdAt).getTime() < 1500
    ) {
      const def = ROOM_DEFS[roomKey] ?? { title: roomKey, subtitle: "" };
      return res.json({
        ok: true,
        deduped: true,
        room: { key: roomKey, title: def.title, subtitle: def.subtitle },
        userMessage: lastUserMessage,
        assistantMessage: null,
      });
    }

    const [userMessage] = await db
      .insert(eceChatMessages)
      .values({
        tenantId,
        userId: user.id,
        role: "user",
        content,
        contextType: roomKey,
        metadata: (clientMessageId ? { clientMessageId } : {}) as any,
      })
      .returning();

    const def = ROOM_DEFS[roomKey] ?? { title: roomKey, subtitle: "" };

    const agentRuns = await runRoomAgent({
      tenantId,
      tenantKey,
      user,
      roomKey,
      content,
      requestIp: req.ip,
      userAgent: req.headers["user-agent"] as string | undefined,
      clientMessageId,
    });

    const now = Date.now();
    const insertedAssistantMessages: any[] = [];

    for (let idx = 0; idx < agentRuns.length; idx++) {
      const run = agentRuns[idx];
      const metadata = {
        ...(run.quickReplies?.length ? { quickReplies: run.quickReplies } : {}),
        ...(run.executedActions?.length ? { executedActions: run.executedActions } : {}),
        source: run.source,
        ...(clientMessageId ? { inReplyToClientMessageId: clientMessageId } : {}),
      };

      const [assistantMessage] = await db
        .insert(eceChatMessages)
        .values({
          tenantId,
          userId: user.id,
          role: run.role,
          content: run.content,
          contextType: roomKey,
          metadata,
          createdAt: new Date(now + idx),
        } as any)
        .returning();

      if (assistantMessage) insertedAssistantMessages.push(assistantMessage);
    }

    res.json({
      ok: true,
      room: { key: roomKey, title: def.title, subtitle: def.subtitle },
      userMessage,
      assistantMessage: insertedAssistantMessages[0] ?? null,
      assistantMessages: insertedAssistantMessages,
    });
  } catch (error: any) {
    console.error("[ECE] Inbox send error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

router.get("/audit/logs", async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const rawLimit = Number.parseInt(String(req.query?.limit ?? ""), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 200) : 60;

    const rows = await db.query.auditLogs.findMany({
      where: eq(auditLogs.tenantId, tenantId),
      orderBy: desc(auditLogs.createdAt),
      limit,
    });

    res.json({
      ok: true,
      items: rows.map((row: any) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType ?? null,
        userRole: row.userRole ?? null,
        createdAt: row.createdAt ?? null,
      })),
    });
  } catch (error: any) {
    console.error("[ECE] Audit logs error:", error);
    res.status(500).json({ message: error?.message || "Failed to load audit logs" });
  }
});

export default router;

