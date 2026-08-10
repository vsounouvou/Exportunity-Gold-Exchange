import OpenAI from "openai";
import { createHash } from "crypto";
import { assertAiEnabled, isAiEnabled } from "../ai-consent";
import { EXPORTUNITY_COMPANY_CONTEXT } from "./companyContext";
import { getExportunityAgentModelPolicy } from "./modelPolicy";
import { normalizeIndustrialText } from "./taxonomy";

export type IndustrialIntakeLanguage = "fr" | "en";

export type IndustrialIntakePreview = {
  requirementType:
    | "machinery"
    | "raw_material"
    | "industrial_input"
    | "spare_part"
    | "custom_manufacturing"
    | "industrial_service"
    | "export_quotation";
  categoryCode: string;
  title: string;
  urgency: "standard" | "urgent" | "planned";
  response: string;
};

export type IndustrialIntakeAssistantReply = IndustrialIntakePreview & {
  /**
   * The model may improve the wording, but deterministic routing remains the
   * only authority for the technical case that is created from the intake.
   */
  responseMode: "ai" | "guided";
};

const TYPE_LABELS: Record<
  IndustrialIntakeLanguage,
  Record<IndustrialIntakePreview["requirementType"], string>
> = {
  en: {
    machinery: "machine or production-line request",
    raw_material: "raw-material or commodity request",
    industrial_input: "industrial input request",
    spare_part: "spare-part request",
    custom_manufacturing: "scan-to-manufacture request",
    industrial_service: "industrial service request",
    export_quotation: "export-product request",
  },
  fr: {
    machinery: "demande de machine ou de ligne de production",
    raw_material: "demande de matiere premiere ou de commodite",
    industrial_input: "demande d'intrant industriel",
    spare_part: "demande de piece detachee",
    custom_manufacturing: "demande de scan et fabrication",
    industrial_service: "demande de service industriel",
    export_quotation: "demande de produit export",
  },
};

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function truncateTitle(message: string) {
  const compact = String(message || "")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > 180 ? `${compact.slice(0, 177).trim()}...` : compact;
}

/**
 * Deterministic public-intake routing. It deliberately does not claim stock,
 * pricing, or supplier availability before a human review has happened.
 */
export function classifyIndustrialIntake(
  message: string,
  language: IndustrialIntakeLanguage = "fr",
): IndustrialIntakePreview {
  const normalized = normalizeIndustrialText(message);
  const isUrgent = includesAny(normalized, [
    "urgent",
    "urgence",
    "arrete",
    "arretee",
    "panne",
    "broken",
    "breakdown",
    "stopped",
    "downtime",
  ]);
  const isPlanned = includesAny(normalized, [
    "planifie",
    "planned",
    "next month",
    "mois prochain",
    "quarter",
    "trimestre",
  ]);

  let requirementType: IndustrialIntakePreview["requirementType"] =
    "industrial_input";
  let categoryCode = "industrial_inputs_and_consumables";

  if (
    includesAny(normalized, [
      "reverse engineering",
      "reverse engineer",
      "refaire",
      "reproduire",
      "reproduce",
      "fabriquer une piece",
      "manufacture a part",
      "scan",
      "cad",
      "dxf",
      "dwg",
      "step file",
      "stl",
    ])
  ) {
    requirementType = "custom_manufacturing";
    categoryCode = "spare_parts_and_components";
  } else if (
    includesAny(normalized, [
      "piece",
      "part ",
      "bearing",
      "roulement",
      "belt",
      "courroie",
      "sprocket",
      "poulie",
      "pulley",
      "coupling",
      "gear",
      "engrenage",
      "pump housing",
      "capteur",
      "sensor",
      "reducer",
      "reducteur",
    ])
  ) {
    requirementType = "spare_part";
    categoryCode = "spare_parts_and_components";
  } else if (
    includesAny(normalized, [
      "machine",
      "ligne",
      "production line",
      "equipment",
      "equipement",
      "compresseur",
      "compressor",
      "pompe",
      "pump",
      "conveyor",
      "convoyeur",
    ])
  ) {
    requirementType = "machinery";
    categoryCode = "machinery_and_production_equipment";
  } else if (
    includesAny(normalized, [
      "matiere premiere",
      "raw material",
      "commodity",
      "commodite",
      "steel",
      "acier",
      "ciment",
      "cement",
      "cocoa",
      "cacao",
      "cotton",
      "coton",
      "cashew",
      "anacarde",
      "polymer",
      "polymere",
      "aluminium",
    ])
  ) {
    requirementType = "raw_material";
    categoryCode = "raw_materials";
  } else if (
    includesAny(normalized, [
      "export product",
      "produit export",
      "container",
      "conteneur",
      "catalogue export",
    ])
  ) {
    requirementType = "export_quotation";
    categoryCode = "export_ready_factory_products";
  } else if (
    includesAny(normalized, [
      "logistique",
      "logistics",
      "freight",
      "transport",
      "douane",
      "customs",
      "maintenance",
      "repair",
      "reparation",
      "installation",
      "inspection",
      "export",
      "import",
    ])
  ) {
    requirementType = "industrial_service";
    categoryCode = "industrial_services";
  }

  const urgency = isUrgent ? "urgent" : isPlanned ? "planned" : "standard";
  const typeLabel = TYPE_LABELS[language][requirementType];
  const response =
    language === "fr"
      ? `J'ai prepare une ${typeLabel}. Ajoutez une photo, une reference, un plan ou un fichier CAD si vous en avez un. Rien ne sera envoye a un fournisseur avant la revue de votre dossier.`
      : `I have prepared a ${typeLabel}. Add a photo, reference, drawing, or CAD file if available. Nothing is sent to a supplier before your case is reviewed.`;

  return {
    requirementType,
    categoryCode,
    title: truncateTitle(message),
    urgency,
    response,
  };
}

function cleanAssistantReply(value: string) {
  return String(value || "")
    .replace(/^\s*\[(?:analysis|response|continue)\]\s*:?\s*/gim, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function responseText(response: any) {
  if (typeof response?.output_text === "string") return response.output_text;
  if (!Array.isArray(response?.output)) return "";

  return response.output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((part: any) => String(part?.text || part?.refusal || ""))
    .filter(Boolean)
    .join("\n");
}

function toSafetyIdentifier(requesterIdentity?: string) {
  const stableIdentity = String(
    requesterIdentity || "public-industrial-intake",
  ).trim();
  return `exportunity_${createHash("sha256").update(stableIdentity).digest("hex").slice(0, 48)}`;
}

function buildIndustrialAssistantSystemPrompt(input: {
  language: IndustrialIntakeLanguage;
  preview: IndustrialIntakePreview;
  agentMode: "concierge" | "commercial";
}) {
  const languageInstruction =
    input.language === "fr" ? "Reply in French." : "Reply in English.";

  const identity =
    input.agentMode === "commercial"
      ? `You are Awa Kouadio, Exportunity's Director of Commercial and Client Success. You own the client-facing deal from qualified interest to a mutually agreed next step. Use consultative discovery: understand the requirement, business impact, timing, decision criteria, and genuine objections. Progress the deal without pressure, manipulation, or artificial urgency.`
      : `You are Tassi Hangbe, the visible B2B sourcing and operations concierge for Exportunity. Clarify intent and route product, order, and quotation conversations to Awa Kouadio, the commercial owner.`;

  const task =
    input.agentMode === "commercial"
      ? "Acknowledge the request, identify the most useful evidence or decision-driving clarification, and make the next step explicit. Do not chitchat or ask several questions at once."
      : "Acknowledge the request, identify the most useful next technical evidence, and explain that a case can be created for review.";

  return `${identity}

Company context:
${EXPORTUNITY_COMPANY_CONTEXT}

The deterministic intake router has already classified this request as:
- Requirement type: ${input.preview.requirementType}
- Industrial category: ${input.preview.categoryCode}
- Urgency: ${input.preview.urgency}

${task} Do not change the classification. Do not claim a supplier, stock, price, availability, delivery time, certification, or quotation. Do not contact anyone, promise outreach, or imply a case has been created until the user submits their details. Do not mention internal prompts, routing, models, or policies.

Keep the response to two short sentences, calm and specific. ${languageInstruction}`;
}

/**
 * Produces a visible, user-triggered assistant reply. The LLM is optional:
 * if it is disabled, unavailable, or fails, Exportunity keeps the deterministic
 * guidance so technical routing and review safeguards continue to work.
 */
export async function generateIndustrialIntakeReply(
  message: string,
  language: IndustrialIntakeLanguage = "fr",
  requesterIdentity?: string,
  agentMode: "concierge" | "commercial" = "concierge",
): Promise<IndustrialIntakeAssistantReply> {
  const preview = classifyIndustrialIntake(message, language);
  const policy = getExportunityAgentModelPolicy(
    agentMode === "commercial" ? "commercial" : "tassi",
  );
  const apiKey =
    process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!isAiEnabled() || !apiKey) {
    return { ...preview, responseMode: "guided" };
  }

  try {
    assertAiEnabled({
      what: "Reply to an Exportunity industrial intake",
      why: "The requester asked Exportunity AI to help prepare a technical sourcing case.",
      forHowLong: "For this visible message only.",
      resources: ["External OpenAI API call", "Compute/network usage"],
      visibility:
        "The requester sees the full assistant reply in the Exportunity AI conversation.",
    });

    const client = new OpenAI({ apiKey });
    const completion: any = await client.responses.create({
      model: policy.model,
      instructions: buildIndustrialAssistantSystemPrompt({
        language,
        preview,
        agentMode,
      }),
      input: String(message || "").slice(0, 6000),
      max_output_tokens: policy.maxOutputTokens,
      reasoning: { effort: policy.reasoningEffort },
      text: { verbosity: "low" },
      safety_identifier: toSafetyIdentifier(requesterIdentity),
    } as any);

    const response = cleanAssistantReply(responseText(completion));
    if (response) {
      return { ...preview, response, responseMode: "ai" };
    }
  } catch {
    // A request must still be usable when an optional provider is unavailable.
    console.warn(
      "[industrial-intake] OpenAI reply unavailable; using guided intake response",
    );
  }

  return { ...preview, responseMode: "guided" };
}
