import { db } from "@db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { lbmaPriceCache, messageTemplates } from "@db/schema";
import { generateAgentResponse } from "./ai-provider";
import { isAiEnabled } from "./ai-consent";

export type ReplyMode = "canned" | "data" | "llm";

export type ReplyRouterResult = {
  mode: ReplyMode;
  response: string;
  confidence: number;
  reason: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectLanguage(text: string, fallback: "fr" | "en" = "fr"): "fr" | "en" {
  const t = normalizeText(text);
  if (/\b(bonjour|salut|merci|svp|s il vous plait|rdv|rendez vous|prix|comment)\b/.test(t)) return "fr";
  if (/\b(hello|hi|thanks|please|price|how to|schedule|appointment)\b/.test(t)) return "en";
  return fallback;
}

function isComplexMessage(text: string) {
  const raw = String(text || "");
  if (raw.length >= 220) return true;
  const qCount = (raw.match(/\?/g) || []).length;
  if (qCount >= 2) return true;
  if (raw.split("\n").length >= 4) return true;
  return false;
}

async function fetchTemplates(params: { tenantId?: number | null; language: "fr" | "en" }) {
  try {
    const rows = await db.query.messageTemplates.findMany({
      where: and(
        eq(messageTemplates.isActive, true),
        eq(messageTemplates.language, params.language),
        params.tenantId
          ? or(eq(messageTemplates.tenantId, params.tenantId), isNull(messageTemplates.tenantId))
          : isNull(messageTemplates.tenantId),
      ),
      orderBy: desc(messageTemplates.updatedAt),
      limit: 200,
    });
    return rows;
  } catch {
    return [];
  }
}

function pickTemplate(rows: any[], intents: string[]) {
  if (!rows.length) return null;
  const normalizedIntents = intents.map((x) => String(x).toLowerCase());
  for (const row of rows) {
    const rowIntents: string[] = Array.isArray((row as any).intents) ? ((row as any).intents as string[]) : [];
    if (rowIntents.some((i) => normalizedIntents.includes(String(i).toLowerCase()))) return row;
  }
  return rows[0] ?? null;
}

async function getLbmaPriceSnapshot() {
  const cached = await db.query.lbmaPriceCache.findFirst({ orderBy: desc(lbmaPriceCache.fetchedAt) });
  if (cached && cached.fetchedAt && new Date(cached.fetchedAt).getTime() > Date.now() - 60 * 60 * 1000) return cached;

  // Lightweight synthetic fallback when cache is empty/stale (no external calls).
  const FX_RATES = { EUR_USD: 0.92, AED_USD: 3.67, XOF_USD: 615.0 };
  const TROY_OUNCE_TO_GRAMS = 31.1035;
  const basePrice = 2650 + (Math.random() - 0.5) * 50;

  const pricePerOzUsd = basePrice.toFixed(4);
  const pricePerGramUsd = (basePrice / TROY_OUNCE_TO_GRAMS).toFixed(4);
  const pricePerKgUsd = ((basePrice / TROY_OUNCE_TO_GRAMS) * 1000).toFixed(4);

  const [newRow] = await db
    .insert(lbmaPriceCache)
    .values({
      pricePerOzUsd,
      pricePerGramUsd,
      pricePerKgUsd,
      pricePerOzEur: (basePrice * FX_RATES.EUR_USD).toFixed(4),
      pricePerOzAed: (basePrice * FX_RATES.AED_USD).toFixed(4),
      pricePerOzXof: (basePrice * FX_RATES.XOF_USD).toFixed(4),
      fxRateEurUsd: FX_RATES.EUR_USD.toFixed(6),
      fxRateAedUsd: FX_RATES.AED_USD.toFixed(6),
      fxRateXofUsd: FX_RATES.XOF_USD.toFixed(6),
      source: "LBMA",
      fetchedAt: new Date(),
      validUntil: new Date(Date.now() + 60 * 60 * 1000),
      metadata: { rawResponse: { synthetic: true } },
    })
    .returning();

  return newRow ?? cached ?? null;
}

export async function replyRouter(
  message: string,
  ctx?: { tenantId?: number | null; tenantKey?: string | null; language?: "fr" | "en" }
): Promise<ReplyRouterResult> {
  const raw = String(message || "").trim();
  const normalized = normalizeText(raw);
  const lang = ctx?.language ?? detectLanguage(raw, "fr");
  const templates = await fetchTemplates({ tenantId: ctx?.tenantId ?? null, language: lang });

  // Tier 0 — canned / template-first
  if (/^(hi|hello|hey|bonjour|salut|yo)\b/.test(normalized)) {
    const t = pickTemplate(templates, ["onboarding", "help"]);
    const response =
      (t?.templateText as string | undefined) ||
      (lang === "fr"
        ? "Bonjour. Dites-moi ce dont vous avez besoin (prix, KYC, rendez-vous, commande)."
        : "Hello. Tell me what you need (pricing, KYC, scheduling, order).");
    return { mode: "canned", response, confidence: 0.92, reason: "greeting" };
  }

  // Tier 1 — data-driven (no model)
  if (/\b(prix|price|tarif|cours|lbma|gold price)\b/.test(normalized)) {
    const snapshot = await getLbmaPriceSnapshot().catch(() => null);
    const oz = snapshot ? Number(snapshot.pricePerOzUsd) : null;
    const gram = snapshot ? Number(snapshot.pricePerGramUsd) : null;
    const response =
      lang === "fr"
        ? `Indicatif LBMA: ${oz ? `$${oz.toFixed(2)}/oz` : "indisponible"} (${gram ? `$${gram.toFixed(2)}/g` : "indisponible"}). Quelle quantité et quel pays/ville ?`
        : `Indicative LBMA: ${oz ? `$${oz.toFixed(2)}/oz` : "unavailable"} (${gram ? `$${gram.toFixed(2)}/g` : "unavailable"}). What quantity and which country/city?`;
    return { mode: "data", response, confidence: 0.84, reason: "pricing_snapshot" };
  }

  if (/\b(kyc|know your customer|identite|identite|piece|passport|proof of address|adresse|conformite)\b/.test(normalized)) {
    const t = pickTemplate(templates, ["kyc"]);
    const response =
      (t?.templateText as string | undefined) ||
      (lang === "fr"
        ? "Checklist KYC: 1) Pièce d'identité 2) Preuve d'adresse 3) Source des fonds 4) Documents société (si applicable) 5) Pays + contact."
        : "KYC checklist: 1) Government ID 2) Proof of address 3) Source of funds 4) Company docs (if applicable) 5) Country + contact.");
    return { mode: "data", response, confidence: 0.9, reason: "kyc_checklist" };
  }

  if (/\b(how to|comment|procedure|etapes|steps)\b/.test(normalized)) {
    const response =
      lang === "fr"
        ? "Étapes standard: 1) Définir le produit/quantité 2) KYC (si requis) 3) Devis/conditions 4) Paiement/escrow 5) Livraison + preuves."
        : "Standard steps: 1) Confirm product/quantity 2) KYC (if required) 3) Quote/terms 4) Payment/escrow 5) Delivery + proofs.";
    return { mode: "data", response, confidence: 0.76, reason: "howto_steps" };
  }

  // Tier 2 — LLM (only if needed)
  const cannedFallback =
    lang === "fr"
      ? "Pouvez-vous préciser: produit/quantité, pays/ville, et délai ?"
      : "Please clarify: product/quantity, country/city, and timeline.";

  const complex = isComplexMessage(raw);
  const confidence = complex ? 0.45 : 0.55;
  const threshold = 0.68;
  if ((complex || confidence < threshold) && isAiEnabled()) {
    try {
      const ai = await generateAgentResponse(raw, {
        role: "Support",
        companyId: null,
        context: { recentMessages: [] },
      });
      const response = ai.response?.trim() ? ai.response.trim() : cannedFallback;
      return { mode: "llm", response, confidence: 0.6, reason: complex ? "complex_message" : "low_confidence" };
    } catch (err: any) {
      return { mode: "canned", response: cannedFallback, confidence: 0.5, reason: `llm_failed:${err?.message || "error"}` };
    }
  }

  return { mode: "canned", response: cannedFallback, confidence: confidence, reason: complex ? "complex_no_llm" : "fallback" };
}
