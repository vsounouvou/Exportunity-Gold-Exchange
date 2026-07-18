import * as XLSX from "xlsx";

export type AgoojiyeImportTarget = "organizations" | "contacts" | "opportunities" | "toolbox";

export type AgoojiyeImportField = {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
};

export type AgoojiyeImportWarning = {
  row: number;
  message: string;
};

export const AGOOJIYE_IMPORT_FIELDS: Record<AgoojiyeImportTarget, AgoojiyeImportField[]> = {
  organizations: [
    { key: "name", label: "Organisation", required: true, aliases: ["organisation", "organization", "company", "entreprise", "name", "nom"] },
    { key: "website", label: "Site web", aliases: ["website", "site", "siteweb", "url"] },
    { key: "country", label: "Pays", aliases: ["country", "pays"] },
    { key: "industry", label: "Secteur", aliases: ["industry", "sector", "secteur", "industrie"] },
    { key: "sponsorCategory", label: "Categorie sponsor", aliases: ["sponsorcategory", "category", "categorie", "type"] },
    { key: "companySize", label: "Taille", aliases: ["companysize", "size", "taille", "effectif"] },
    { key: "publicDescription", label: "Description", aliases: ["description", "publicdescription", "resume"] },
    { key: "priority", label: "Priorite", aliases: ["priority", "priorite"] },
    { key: "estimatedValue", label: "Valeur estimee", aliases: ["estimatedvalue", "value", "valeur", "budget"] },
    { key: "currency", label: "Devise", aliases: ["currency", "devise"] },
    { key: "nextAction", label: "Prochaine action", aliases: ["nextaction", "prochaineaction"] },
    { key: "internalNotes", label: "Notes internes", aliases: ["notes", "internalnotes", "notesinternes"] },
  ],
  contacts: [
    { key: "email", label: "Email professionnel", required: true, aliases: ["email", "e-mail", "courriel", "businessemail"] },
    { key: "firstName", label: "Prenom", aliases: ["firstname", "first", "prenom", "givenname"] },
    { key: "lastName", label: "Nom", aliases: ["lastname", "last", "nom", "familyname"] },
    { key: "jobTitle", label: "Fonction", aliases: ["jobtitle", "title", "fonction", "poste", "role"] },
    { key: "phone", label: "Telephone", aliases: ["phone", "telephone", "tel", "mobile"] },
    { key: "country", label: "Pays", aliases: ["country", "pays"] },
    { key: "organizationName", label: "Organisation", aliases: ["organization", "organisation", "company", "entreprise", "organizationname"] },
    { key: "preferredLanguage", label: "Langue", aliases: ["language", "langue", "preferredlanguage"] },
    { key: "publicSourceUrl", label: "Source publique", aliases: ["source", "sourceurl", "publicsourceurl", "url"] },
    { key: "verificationStatus", label: "Verification", aliases: ["verification", "verificationstatus", "statut"] },
    { key: "lawfulContactNote", label: "Base de contact", aliases: ["lawfulcontactnote", "consent", "consentement", "basecontact"] },
    { key: "notes", label: "Notes", aliases: ["notes", "comment", "commentaire"] },
  ],
  opportunities: [
    { key: "organizationName", label: "Organisation", required: true, aliases: ["organization", "organisation", "company", "entreprise", "organizationname"] },
    { key: "title", label: "Opportunite", required: true, aliases: ["title", "opportunity", "opportunite", "name", "nom"] },
    { key: "contactEmail", label: "Email contact", aliases: ["contactemail", "email", "courriel"] },
    { key: "sponsorCategory", label: "Categorie sponsor", aliases: ["sponsorcategory", "category", "categorie"] },
    { key: "priority", label: "Priorite", aliases: ["priority", "priorite"] },
    { key: "estimatedValue", label: "Valeur estimee", aliases: ["estimatedvalue", "value", "valeur", "budget"] },
    { key: "currency", label: "Devise", aliases: ["currency", "devise"] },
    { key: "nextAction", label: "Prochaine action", aliases: ["nextaction", "prochaineaction"] },
    { key: "internalNotes", label: "Notes internes", aliases: ["notes", "internalnotes", "notesinternes"] },
  ],
  toolbox: [
    { key: "title", label: "Titre", required: true, aliases: ["title", "titre", "name", "nom"] },
    { key: "category", label: "Categorie", aliases: ["category", "categorie"] },
    { key: "description", label: "Description", aliases: ["description", "resume"] },
    { key: "fileUrl", label: "URL du fichier", aliases: ["fileurl", "url", "fichier", "link", "lien"] },
    { key: "assetType", label: "Type", aliases: ["assettype", "type", "format"] },
    { key: "status", label: "Statut", aliases: ["status", "statut"] },
    { key: "version", label: "Version", aliases: ["version"] },
    { key: "tags", label: "Tags", aliases: ["tags", "etiquettes", "labels"] },
  ],
};

const MAX_IMPORT_ROWS = 2_000;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cellText(value: unknown) {
  return String(value ?? "").trim().slice(0, 5_000);
}

export function isAgoojiyeImportTarget(value: unknown): value is AgoojiyeImportTarget {
  return Object.prototype.hasOwnProperty.call(AGOOJIYE_IMPORT_FIELDS, String(value || ""));
}

export function parseAgoojiyeImportFile(input: { fileName: string; buffer: Buffer }) {
  const extension = String(input.fileName || "").toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "xlsx") {
    throw new Error("Format non pris en charge. Utilisez un fichier CSV ou XLSX.");
  }

  const workbook = XLSX.read(input.buffer, { type: "buffer", raw: false, cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Le fichier ne contient aucune feuille exploitable.");
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (!rows.length) throw new Error("Le fichier ne contient aucune ligne de donnees.");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Le fichier depasse la limite de ${MAX_IMPORT_ROWS} lignes.`);

  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row).map((key) => cellText(key))).filter(Boolean)));
  const safeRows = rows.map((row) => Object.fromEntries(headers.map((header) => [header, cellText(row[header])])));
  return { headers, rows: safeRows, sourceType: extension } as const;
}

export function inferAgoojiyeImportMapping(target: AgoojiyeImportTarget, headers: string[]) {
  const normalizedHeaders = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mapping: Record<string, string> = {};
  for (const field of AGOOJIYE_IMPORT_FIELDS[target]) {
    const candidates = [field.key, ...field.aliases].map(normalizeHeader);
    const match = candidates.map((candidate) => normalizedHeaders.get(candidate)).find(Boolean);
    if (match) mapping[field.key] = match;
  }
  return mapping;
}

export function parseAgoojiyeImportMapping(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, string>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    throw new Error("Le mapping de colonnes est invalide.");
  }
}

export function normalizeAgoojiyeImportRows(
  target: AgoojiyeImportTarget,
  rows: Array<Record<string, string>>,
  mapping: Record<string, string>,
) {
  const fields = AGOOJIYE_IMPORT_FIELDS[target];
  const missingRequired = fields.filter((field) => field.required && !cellText(mapping[field.key]));
  if (missingRequired.length) {
    throw new Error(`Colonnes obligatoires non mappees: ${missingRequired.map((field) => field.label).join(", ")}.`);
  }

  const warnings: AgoojiyeImportWarning[] = [];
  const validRows: Array<{ sourceRow: number; data: Record<string, string> }> = [];
  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();

  rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const data = Object.fromEntries(fields.map((field) => [field.key, cellText(row[mapping[field.key]])]));
    const missing = fields.filter((field) => field.required && !data[field.key]);
    if (missing.length) {
      warnings.push({ row: sourceRow, message: `Valeur obligatoire manquante: ${missing.map((field) => field.label).join(", ")}.` });
      return;
    }

    if (target === "contacts" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.toLowerCase())) {
      warnings.push({ row: sourceRow, message: "Adresse email professionnelle invalide." });
      return;
    }

    const dedupeKey = importDedupeKey(target, data);
    if (seenKeys.has(dedupeKey)) {
      duplicateKeys.add(dedupeKey);
      warnings.push({ row: sourceRow, message: "Doublon detecte dans le fichier." });
      return;
    }
    seenKeys.add(dedupeKey);
    validRows.push({ sourceRow, data });
  });

  return { validRows, warnings, duplicateKeys: Array.from(duplicateKeys) };
}

export function importDedupeKey(target: AgoojiyeImportTarget, data: Record<string, string>) {
  if (target === "contacts") return data.email.trim().toLowerCase();
  if (target === "opportunities") return data.title.trim().toLowerCase();
  return (target === "organizations" ? data.name : data.title).trim().toLowerCase();
}

