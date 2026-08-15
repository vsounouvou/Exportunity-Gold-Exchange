export const COMPANY_BRAIN_CONFIDENTIALITY_LEVELS = [
  "public",
  "internal",
  "confidential",
  "restricted",
] as const;

export type CompanyBrainConfidentiality = (typeof COMPANY_BRAIN_CONFIDENTIALITY_LEVELS)[number];

const CONFIDENTIALITY_RANK = new Map(
  COMPANY_BRAIN_CONFIDENTIALITY_LEVELS.map((level, index) => [level, index]),
);

function badRequest(message: string) {
  const error = new Error(message);
  (error as any).status = 400;
  return error;
}

export function normalizeCompanyBrainConfidentiality(value: unknown): CompanyBrainConfidentiality {
  const normalized = String(value || "").trim().toLowerCase();
  if (!CONFIDENTIALITY_RANK.has(normalized as CompanyBrainConfidentiality)) {
    throw badRequest("Unsupported Company Brain confidentiality classification.");
  }
  return normalized as CompanyBrainConfidentiality;
}

export function stricterCompanyBrainConfidentiality(
  left: CompanyBrainConfidentiality,
  right: CompanyBrainConfidentiality,
) {
  return (CONFIDENTIALITY_RANK.get(left) || 0) >= (CONFIDENTIALITY_RANK.get(right) || 0) ? left : right;
}

export function assertCompanyBrainClassificationDoesNotDowngrade(input: {
  currentSourceLevel: unknown;
  currentVersionLevel: unknown;
  nextLevel: unknown;
}) {
  const sourceLevel = normalizeCompanyBrainConfidentiality(input.currentSourceLevel || "internal");
  const versionLevel = normalizeCompanyBrainConfidentiality(input.currentVersionLevel || sourceLevel);
  const nextLevel = normalizeCompanyBrainConfidentiality(input.nextLevel);
  const currentLevel = stricterCompanyBrainConfidentiality(sourceLevel, versionLevel);
  if ((CONFIDENTIALITY_RANK.get(nextLevel) || 0) < (CONFIDENTIALITY_RANK.get(currentLevel) || 0)) {
    const error = new Error(
      `Confidentiality cannot be downgraded from ${currentLevel} to ${nextLevel} through this control.`,
    );
    (error as any).status = 409;
    throw error;
  }
  return { sourceLevel, versionLevel, currentLevel, nextLevel };
}
