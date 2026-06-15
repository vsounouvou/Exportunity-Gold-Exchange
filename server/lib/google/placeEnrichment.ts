import type { PmeLeadInput } from "../pme-exchange/repository";
import { scoreLead } from "../pme-exchange/repository";

const wholesaleSignals = [
  "wholesale",
  "supplier",
  "distributor",
  "warehouse",
  "manufacturer",
  "factory",
  "logistics",
  "freight",
  "industrial",
  "machinery",
  "materials",
  "packaging",
  "agricultural",
];

export function classifyPmeLead(input: PmeLeadInput) {
  const text = [input.name, input.category, input.primaryType, ...(input.types || []), input.description]
    .join(" ")
    .toLowerCase();
  const kind = wholesaleSignals.some((signal) => text.includes(signal)) ? "wholesale" : "marketplace";
  const score = scoreLead(input);
  const leadStatus = score.qualificationScore >= 78 ? "qualified" : score.qualificationScore >= 64 ? "enriched" : "new";
  return {
    ...input,
    kind: input.kind || kind,
    leadStatus: input.leadStatus || leadStatus,
    qualificationScore: input.qualificationScore ?? score.qualificationScore,
    investmentPotentialScore: input.investmentPotentialScore ?? score.investmentPotentialScore,
    revenueVisibilityScore: input.revenueVisibilityScore ?? score.revenueVisibilityScore,
    contactStatus: input.phone || input.whatsappPhone ? input.contactStatus || "contact_required" : "missing_contact",
    metadata: {
      ...(input.metadata || {}),
      classification: kind,
      investmentFeatures: "internal_review_only",
    },
  } satisfies PmeLeadInput;
}

export function enrichPmeLeads(inputs: PmeLeadInput[]) {
  return inputs.map((input) => classifyPmeLead(input));
}
