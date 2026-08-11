export type AgentEvidenceCitation = {
  id: string;
  evidenceId: string;
  name: string;
  url?: string;
  extractionStatus?: string;
};

const EVIDENCE_REFERENCE_PATTERN =
  /\b(attachment|attached|file|document|docx|pdf|spreadsheet|workbook|slide|presentation|screenshot|image|invoice|receipt|contract|evidence|proof|piece jointe|fichier|tableur|classeur|presentation|capture|facture|recu|contrat|preuve|resume|resumer|summari[sz]e|review|read|relis|lire|extract|extraire|analyse|analy[sz]e|compare)\b/i;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toCitation(value: unknown): AgentEvidenceCitation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = String(record.name || "").trim();
  const sha256 = String(record.sha256 || "").trim().toLowerCase();
  const directEvidenceId = String(record.evidenceId || "").trim();
  const evidenceId = directEvidenceId || (/^[a-f0-9]{64}$/.test(sha256) ? `sha256:${sha256}` : "");
  if (!name || !evidenceId) return null;

  const url = String(record.url || "").trim();
  const extractionStatus = String(record.extractionStatus || "").trim();
  return {
    id: String(record.id || evidenceId).trim() || evidenceId,
    evidenceId,
    name,
    ...(url ? { url } : {}),
    ...(extractionStatus ? { extractionStatus } : {}),
  };
}

function normalizeCitations(values: unknown): AgentEvidenceCitation[] {
  if (!Array.isArray(values)) return [];
  const byEvidenceId = new Map<string, AgentEvidenceCitation>();
  for (const value of values) {
    const citation = toCitation(value);
    if (!citation) continue;
    byEvidenceId.set(citation.evidenceId.toLowerCase(), citation);
  }
  return Array.from(byEvidenceId.values());
}

export function selectEvidenceCitationsForResponse(input: {
  userText: unknown;
  currentAttachments?: unknown;
  recentMessages?: Array<{ metadata?: unknown }>;
}): AgentEvidenceCitation[] {
  const direct = normalizeCitations(input.currentAttachments);
  if (direct.length) return direct;

  if (!EVIDENCE_REFERENCE_PATTERN.test(normalizeText(input.userText))) return [];
  for (const message of input.recentMessages || []) {
    const metadata =
      message?.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
        ? (message.metadata as Record<string, unknown>)
        : {};
    const citations = normalizeCitations(metadata.attachments);
    if (citations.length) return citations;
  }
  return [];
}

export function canonicalizeEvidenceReferences(
  content: unknown,
  citations: AgentEvidenceCitation[],
): string {
  const text = String(content ?? "");
  if (!text || citations.length === 0) return text;

  return text.replace(/sha256:([a-f0-9]{8,64})(?![a-f0-9])/gi, (match, hashPrefix: string) => {
    if (hashPrefix.length === 64) return match;
    const normalizedPrefix = hashPrefix.toLowerCase();
    const matches = citations
      .map((citation) => citation.evidenceId)
      .filter((evidenceId) => evidenceId.toLowerCase().startsWith(`sha256:${normalizedPrefix}`));
    return matches.length === 1 ? matches[0] : match;
  });
}

export function requestsActionReceipt(value: unknown): boolean {
  const text = normalizeText(value).replace(/[\u2019']/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return false;
  const mentionsExecution =
    /\b(task|tasks|action|actions|decision|decisions|contact|contacts|email|emails|message|messages|call|calls|outreach|tache|taches|action|actions|decision|decisions|contact|contacts|courriel|courriels|appel|appels)\b/i.test(
      text,
    );
  const asksForProof =
    /\b(confirm|confirme|confirmer|verify|verifie|verifier|prove|preuve|receipt|recu)\b/i.test(text);
  const deniesExecution =
    /\b(do not|dont|without|no|aucun|aucune|sans|ne|n as|n avez|pas)\b/i.test(text);
  return mentionsExecution && (asksForProof || deniesExecution);
}
