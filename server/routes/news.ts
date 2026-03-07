import { Router } from "express";
import { getGoldNewsItems } from "../services/news/rssGoldFeeds";

const router = Router();

type NewsTopic =
  | "market_news"
  | "cote_divoire_mining"
  | "regulation"
  | "export_compliance"
  | "industry";

function classifyTopic(title: string, summary: string | null | undefined): NewsTopic {
  const text = `${title || ""} ${summary || ""}`.toLowerCase();
  if (
    text.includes("cote d'ivoire") ||
    text.includes("cote d ivoire") ||
    text.includes("ivorian") ||
    text.includes("mine") ||
    text.includes("mining")
  ) {
    return "cote_divoire_mining";
  }
  if (
    text.includes("regulation") ||
    text.includes("reglement") ||
    text.includes("legal") ||
    text.includes("law") ||
    text.includes("compliance")
  ) {
    return "regulation";
  }
  if (text.includes("export") || text.includes("shipping") || text.includes("customs") || text.includes("traceability")) {
    return "export_compliance";
  }
  if (text.includes("industry") || text.includes("supply chain") || text.includes("ecosystem")) {
    return "industry";
  }
  return "market_news";
}

function computeImportanceScore(title: string, summary: string | null | undefined): number {
  const text = `${title || ""} ${summary || ""}`.toLowerCase();
  let score = 35;
  if (text.includes("gold")) score += 20;
  if (text.includes("africa") || text.includes("african")) score += 15;
  if (text.includes("regulation") || text.includes("reglement") || text.includes("compliance")) score += 15;
  if (text.includes("cote d'ivoire") || text.includes("cote d ivoire")) score += 15;
  if (text.includes("export")) score += 10;
  return Math.min(100, score);
}

router.get("/gold", async (req: any, res) => {
  try {
    const tenantId = String(req?.tenant?.id || "global");
    const rows = await getGoldNewsItems(tenantId);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.json({
      ok: true,
      items: rows.map((row) => ({
        title: row.title,
        source: row.source,
        url: row.url,
        publishedAt: row.publishedAt,
        summary: row.summary,
        topic: classifyTopic(row.title, row.summary),
        importanceScore: computeImportanceScore(row.title, row.summary),
        tenantVisibility: ["bdo"],
        translatedSummary_fr: null,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to load gold news" });
  }
});

export default router;
