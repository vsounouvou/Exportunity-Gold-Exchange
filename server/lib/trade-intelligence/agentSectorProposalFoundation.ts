import { z } from "zod";

import { normalizeTradeSectorCode } from "./foundation";

export const TRADE_SECTOR_PROPOSAL_INTENT =
  "trade_sector_taxonomy_proposal";
export const TRADE_SECTOR_PROPOSAL_EXECUTION_TYPE = "trade_sector_draft";
export const TRADE_SECTOR_PROPOSAL_MISSION_TYPE =
  "sector_taxonomy_proposal";
export const TRADE_SECTOR_PROPOSAL_EXECUTION_SCOPE =
  "trade_sector_proposal";

const sectorProposalOutputSchema = z.object({
  code: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(240),
  nameFr: z.string().trim().min(2).max(240).nullable().optional(),
  description: z.string().trim().min(10).max(5_000),
  rationale: z.string().trim().min(10).max(5_000),
  canonicalCategoryCodes: z
    .array(z.string().trim().min(2).max(120))
    .min(1)
    .max(20),
  confidence: z.number().min(0).max(1),
});

export type TradeSectorProposalOutput = z.infer<
  typeof sectorProposalOutputSchema
>;

function extractJsonObject(value: string) {
  const trimmed = value.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The employee output did not contain a JSON proposal.");
  }
  return unfenced.slice(start, end + 1);
}

export function parseTradeSectorProposalOutput(
  value: string,
  allowedCanonicalCategoryCodes: Iterable<string>,
): TradeSectorProposalOutput {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonObject(value));
  } catch (error) {
    if (error instanceof Error && error.message.includes("did not contain")) {
      throw error;
    }
    throw new Error("The employee output was not valid JSON.");
  }

  const parsed = sectorProposalOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("The employee output did not satisfy the governed sector-proposal contract.");
  }

  const allowed = new Set(
    Array.from(allowedCanonicalCategoryCodes, (code) =>
      String(code || "")
        .trim()
        .toLowerCase()
        .replace(/-/g, "_"),
    ).filter(Boolean),
  );
  const canonicalCategoryCodes = Array.from(
    new Set(
      parsed.data.canonicalCategoryCodes.map((code) =>
        code.toLowerCase().replace(/-/g, "_"),
      ),
    ),
  );
  const unknown = canonicalCategoryCodes.filter((code) => !allowed.has(code));
  if (unknown.length) {
    throw new Error(
      `The employee proposed unknown Industrial OS categories: ${unknown.join(", ")}.`,
    );
  }

  const code = normalizeTradeSectorCode(parsed.data.code);
  if (!code || code === "all" || code === "__all__") {
    throw new Error("The employee did not propose a distinct sector code.");
  }

  return {
    ...parsed.data,
    code,
    nameFr: parsed.data.nameFr || null,
    canonicalCategoryCodes,
  };
}

export function buildTradeSectorProposalInstruction(input: {
  demandEventId: string;
  normalizedProduct?: string | null;
  queryText?: string | null;
  productCategory?: string | null;
  destinationCountryCode?: string | null;
  commercialIntent?: string | null;
  resultCount?: number | null;
  canonicalCategories: Array<{ code: string; label: string }>;
}) {
  const demandLabel =
    String(input.normalizedProduct || "").trim() ||
    String(input.queryText || "").trim() ||
    "unclassified demand";
  const categories = input.canonicalCategories
    .map((category) => `- ${category.code}: ${category.label}`)
    .join("\n");
  return [
    "Prepare one internal industry-sector taxonomy proposal for human review.",
    "This is data-governance work only: do not contact third parties, send messages, purchase anything, promise coverage, publish content, or claim that research was completed.",
    "Use only the demand facts below. Missing evidence must remain missing.",
    "Return exactly one JSON object and no prose or Markdown with these fields:",
    '{"code":"snake_case","name":"English name","nameFr":"French name or null","description":"10+ characters","rationale":"10+ characters grounded in the demand signal","canonicalCategoryCodes":["one_or_more_codes_below"],"confidence":0.0}',
    "The proposal will become a draft only. A human administrator must review and activate it.",
    "",
    `Demand event: ${input.demandEventId}`,
    `Demand: ${demandLabel}`,
    `Raw query: ${String(input.queryText || "not supplied")}`,
    `Product category: ${String(input.productCategory || "not supplied")}`,
    `Destination country: ${String(input.destinationCountryCode || "not supplied")}`,
    `Commercial intent: ${String(input.commercialIntent || "not supplied")}`,
    `Result count: ${input.resultCount == null ? "not supplied" : input.resultCount}`,
    "",
    "Allowed canonical Industrial OS categories:",
    categories,
  ].join("\n");
}
