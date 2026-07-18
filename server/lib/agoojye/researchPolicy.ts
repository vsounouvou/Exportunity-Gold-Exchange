export type AgoojiyePublicSourceRecord = {
  url: string;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  excerpt: string | null;
  fetchedAt: string;
  status: "fetched" | "failed";
  error: string | null;
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Founding Partner": ["investment", "investissement", "strategy", "stratégie", "innovation", "infrastructure", "development", "développement"],
  "Talent Partner": ["university", "université", "education", "éducation", "training", "formation", "skills", "compétences", "internship", "stage"],
  "Industrial Partner": ["manufacturing", "fabrication", "industry", "industrie", "automotive", "automobile", "engineering", "ingénierie", "component", "composant"],
  "Energy Partner": ["energy", "énergie", "electricity", "électricité", "charging", "recharge", "battery", "batterie", "solar", "solaire", "renewable", "renouvelable"],
  "Media Partner": ["media", "média", "press", "presse", "journalism", "journalisme", "documentary", "documentaire", "broadcast", "diffusion"],
};

function normalized(value: unknown) {
  return String(value ?? "").trim();
}

function replaceVariables(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) => {
    const value = normalized(variables[key]);
    return value || `[A COMPLETER: ${key}]`;
  });
}

export function scoreAgoojiyeResearch(input: {
  organizationName: string;
  industry?: string | null;
  strategicRelevance?: string | null;
  sources: AgoojiyePublicSourceRecord[];
}) {
  const successfulSources = input.sources.filter((source) => source.status === "fetched");
  const corpus = [
    input.organizationName,
    input.industry,
    input.strategicRelevance,
    ...successfulSources.flatMap((source) => [source.title, source.description, source.excerpt]),
  ]
    .map(normalized)
    .join(" ")
    .toLowerCase();

  const categories = Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => {
    const matchedKeywords = keywords.filter((keyword) => corpus.includes(keyword.toLowerCase()));
    return { category, matchedKeywords, points: Math.min(50, matchedKeywords.length * 8) };
  });
  categories.sort((a, b) => b.points - a.points || a.category.localeCompare(b.category));
  const best = categories[0];
  const second = categories[1];
  const sourcePoints = Math.min(25, successfulSources.length * 8);
  const contextPoints = (normalized(input.industry) ? 5 : 0) + (normalized(input.strategicRelevance) ? 10 : 0);
  const relevanceScore = Math.min(95, sourcePoints + contextPoints + (best?.points || 0));
  const margin = Math.max(0, (best?.points || 0) - (second?.points || 0));
  const confidenceScore = Math.min(90, 30 + successfulSources.length * 12 + Math.min(20, margin));

  return {
    sponsorCategoryGuess: best?.points ? best.category : "À vérifier",
    relevanceScore,
    confidenceScore,
    matchedThemes: (best?.matchedKeywords || []).slice(0, 6),
    breakdown: {
      publicSources: successfulSources.length,
      failedSources: input.sources.length - successfulSources.length,
      sourcePoints,
      contextPoints,
      categoryScores: categories,
      formula: "sources (max 25) + contexte CRM (max 15) + mots-clés catégorie (max 50)",
    },
  };
}

export function buildAgoojiyeResearchSummary(input: {
  organizationName: string;
  sources: AgoojiyePublicSourceRecord[];
  category: string;
  matchedThemes: string[];
}) {
  const successful = input.sources.filter((source) => source.status === "fetched");
  if (!successful.length) {
    return `Aucune source publique n'a pu être vérifiée pour ${input.organizationName}. Une recherche humaine est requise.`;
  }
  const sourceNotes = successful
    .slice(0, 4)
    .map((source) => `${source.title || new URL(source.finalUrl || source.url).hostname}: ${source.description || source.excerpt || "contenu public consulté"}`)
    .join(" ");
  const themes = input.matchedThemes.length ? ` Thèmes détectés: ${input.matchedThemes.join(", ")}.` : "";
  return `Synthèse de ${successful.length} source(s) publique(s) pour ${input.organizationName}. Catégorie suggérée: ${input.category}.${themes} ${sourceNotes}`.slice(0, 4_000);
}

export function buildAgoojiyeResearchDraft(input: {
  organizationName: string;
  contactFirstName?: string | null;
  contactTitle?: string | null;
  category: string;
  matchedThemes: string[];
  templateSubject?: string | null;
  templateBody?: string | null;
}) {
  const greeting = normalized(input.contactFirstName) ? `Bonjour ${normalized(input.contactFirstName)},` : "Bonjour,";
  const themes = input.matchedThemes.slice(0, 3).join(", ") || "l'innovation et le développement";
  const defaultSubject = `Échange sur un partenariat potentiel entre ${input.organizationName} et AGOOJIYE`;
  const defaultBody = `${greeting}\n\nNous avons consulté les informations publiques de ${input.organizationName}, notamment ses activités liées à ${themes}. Cette proximité avec la catégorie « ${input.category} » nous conduit à proposer un premier échange, sans présumer de votre intérêt.\n\nAGOOJIYE développe depuis le Bénin une vision de mobilité électrique et d'industrialisation adaptée aux réalités africaines. Nous souhaiterions vous présenter le projet et vérifier s'il existe un terrain de collaboration pertinent.\n\nSeriez-vous disponible pour un court échange avec l'équipe AGOOJIYE ?`;
  const variables = {
    contact_first_name: normalized(input.contactFirstName),
    contact_title: normalized(input.contactTitle),
    organization_name: input.organizationName,
    sponsor_category: input.category,
  };
  return {
    subject: replaceVariables(normalized(input.templateSubject) || defaultSubject, variables),
    body: replaceVariables(normalized(input.templateBody) || defaultBody, variables),
  };
}
