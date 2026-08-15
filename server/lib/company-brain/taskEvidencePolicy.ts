export type CompanyBrainTaskEvidenceRef = {
  sourceId: number;
  sourceVersionId: number;
};

export function normalizeCompanyBrainTaskEvidenceRefs(value: unknown): CompanyBrainTaskEvidenceRef[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    const error = new Error("Company Brain task evidence references must be an array.");
    (error as any).status = 400;
    throw error;
  }
  if (value.length > 12) {
    const error = new Error("A task can select at most 12 Company Brain evidence versions.");
    (error as any).status = 400;
    throw error;
  }

  const refs: CompanyBrainTaskEvidenceRef[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
    const sourceId = Number(record.sourceId ?? record.source_id);
    const sourceVersionId = Number(record.sourceVersionId ?? record.source_version_id);
    if (!Number.isInteger(sourceId) || sourceId <= 0 || !Number.isInteger(sourceVersionId) || sourceVersionId <= 0) {
      const error = new Error("Each Company Brain task evidence reference requires positive sourceId and sourceVersionId values.");
      (error as any).status = 400;
      throw error;
    }
    const key = `${sourceId}:${sourceVersionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ sourceId, sourceVersionId });
  }
  return refs;
}
