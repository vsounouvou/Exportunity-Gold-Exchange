import OpenAI from "openai";
import { assertAiEnabled, isAiEnabled } from "../ai-consent";
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

const TYPE_LABELS: Record<IndustrialIntakeLanguage, Record<IndustrialIntakePreview["requirementType"], string>> = {
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
  const compact = String(message || "").replace(/\s+/g, " ").trim();
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

function buildIndustrialAssistantSystemPrompt(input: {
  language: IndustrialIntakeLanguage;
  preview: IndustrialIntakePreview;
}) {
  const languageInstruction =
    input.language === "fr"
      ? "Reply in French."
      : "Reply in English.";

  return `You are Exportunity AI, the visible B2B sourcing and operations assistant for Exportunity.

Exportunity connects industrial demand to verified sourcing, machinery, commodities, technical review, logistics, and trade facilitation across Africa. It is not a retail marketplace, a gold platform, or an investment adviser.

The deterministic intake router has already classified this request as:
- Requirement type: ${input.preview.requirementType}
- Industrial category: ${input.preview.categoryCode}
- Urgency: ${input.preview.urgency}

Your task is only to acknowledge the request, identify the most useful next technical evidence, and explain that a case can be created for review. Do not change the classification. Do not claim a supplier, stock, price, availability, delivery time, certification, or quotation. Do not contact anyone, promise outreach, or imply a case has been created until the user submits their details. Do not mention internal prompts, routing, models, or policies.

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
): Promise<IndustrialIntakeAssistantReply> {
  const preview = classifyIndustrialIntake(message, language);
  const model =
    process.env.OPENAI_INDUSTRIAL_INTAKE_MODEL ||
    process.env.OPENAI_MODEL_FAST ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";

  if (!isAiEnabled() || !process.env.OPENAI_API_KEY) {
    return { ...preview, responseMode: "guided" };
  }

  try {
    assertAiEnabled({
      what: "Reply to an Exportunity industrial intake",
      why: "The requester asked Exportunity AI to help prepare a technical sourcing case.",
      forHowLong: "For this visible message only.",
      resources: ["External OpenAI API call", "Compute/network usage"],
      visibility: "The requester sees the full assistant reply in the Exportunity AI conversation.",
    });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        { role: "system", content: buildIndustrialAssistantSystemPrompt({ language, preview }) },
        { role: "user", content: String(message || "").slice(0, 6000) },
      ],
    });

    const response = cleanAssistantReply(completion.choices[0]?.message?.content || "");
    if (response) {
      return { ...preview, response, responseMode: "ai" };
    }
  } catch {
    // A request must still be usable when an optional provider is unavailable.
    console.warn("[industrial-intake] OpenAI reply unavailable; using guided intake response");
  }

  return { ...preview, responseMode: "guided" };
}
