export type NormalizedCadastreRecord = {
  cadastreName: string;
  permitNumber: string | null;
  region: string | null;
  department: string | null;
  commune: string | null;
  holderName: string | null;
  siteType: "ARTISANAL" | "SEMI_INDUSTRIAL" | "INDUSTRIAL" | "UNKNOWN";
  status: "VERIFIED" | "PENDING" | "INACTIVE";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  lat: number;
  lng: number;
  geometryJson: Record<string, unknown> | null;
  sourceRef: string | null;
};

type ArcGisGeometry =
  | { x?: number; y?: number; rings?: number[][][]; paths?: number[][][] }
  | null
  | undefined;

function asText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function asUpper(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function pickFirstText(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asText(obj[key]);
    if (value) return value;
  }
  return null;
}

function averageCoords(coords: number[][]) {
  if (!coords.length) return null;
  const sum = coords.reduce(
    (acc, [x, y]) => {
      acc.x += Number.isFinite(x) ? x : 0;
      acc.y += Number.isFinite(y) ? y : 0;
      return acc;
    },
    { x: 0, y: 0 },
  );
  return {
    lng: sum.x / coords.length,
    lat: sum.y / coords.length,
  };
}

function geometryCentroid(geometry: ArcGisGeometry) {
  if (!geometry) return null;

  if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    return { lat: Number(geometry.y), lng: Number(geometry.x) };
  }

  const ring = Array.isArray(geometry.rings) && geometry.rings.length > 0 ? geometry.rings[0] : null;
  if (Array.isArray(ring) && ring.length) {
    const centroid = averageCoords(ring as number[][]);
    if (centroid) return centroid;
  }

  const path = Array.isArray(geometry.paths) && geometry.paths.length > 0 ? geometry.paths[0] : null;
  if (Array.isArray(path) && path.length) {
    const centroid = averageCoords(path as number[][]);
    if (centroid) return centroid;
  }

  return null;
}

function normalizeSiteType(rawType: string) {
  const normalized = rawType.toLowerCase();
  if (
    normalized.includes("artis") ||
    normalized.includes("autorisation d'exploitation artisanale") ||
    normalized === "aea"
  ) {
    return "ARTISANAL" as const;
  }
  if (
    normalized.includes("semi") ||
    normalized.includes("semi-industrial") ||
    normalized.includes("semi industriel")
  ) {
    return "SEMI_INDUSTRIAL" as const;
  }
  if (
    normalized.includes("exploitation") ||
    normalized.includes("industrial") ||
    normalized === "pe" ||
    normalized === "pr"
  ) {
    return "INDUSTRIAL" as const;
  }
  return "UNKNOWN" as const;
}

function normalizeStatus(rawStatus: string) {
  const normalized = rawStatus.toLowerCase();
  if (
    normalized.includes("active") ||
    normalized.includes("actif") ||
    normalized.includes("valid")
  ) {
    return "VERIFIED" as const;
  }
  if (
    normalized.includes("inactive") ||
    normalized.includes("expired") ||
    normalized.includes("suspend") ||
    normalized.includes("rejet")
  ) {
    return "INACTIVE" as const;
  }
  return "PENDING" as const;
}

function defaultRiskFromStatus(status: "VERIFIED" | "PENDING" | "INACTIVE") {
  if (status === "INACTIVE") return "HIGH" as const;
  if (status === "PENDING") return "MEDIUM" as const;
  return "LOW" as const;
}

function normalizeCadastreName(attributes: Record<string, unknown>, permitNumber: string | null, holderName: string | null) {
  const explicit = pickFirstText(attributes, [
    "cadastre_name",
    "CadastreName",
    "Nom",
    "NOM",
    "name",
    "Name",
    "titre",
    "Titre",
    "title",
    "Title",
  ]);
  if (explicit) return explicit;

  const parties = pickFirstText(attributes, ["Parties", "parties", "holder_name", "Holder", "Titulaire"]);
  if (permitNumber && parties) return `${parties} (${permitNumber})`;
  if (permitNumber) return `Permit ${permitNumber}`;
  if (parties) return parties;
  if (holderName) return holderName;
  return "";
}

export function normalizeCiCadastreFeature(input: {
  layerId: number;
  feature: { attributes?: Record<string, unknown>; geometry?: ArcGisGeometry };
}): NormalizedCadastreRecord | null {
  const attributes = input.feature?.attributes || {};
  const geometry = input.feature?.geometry;
  const centroid = geometryCentroid(geometry);
  if (!centroid || !Number.isFinite(centroid.lat) || !Number.isFinite(centroid.lng)) {
    return null;
  }

  const permitNumber = pickFirstText(attributes, [
    "Code",
    "code",
    "PermitNumber",
    "permit_number",
    "Numero",
    "NumeroPermis",
    "N_PERMIS",
    "id",
    "ID",
  ]);
  const region = pickFirstText(attributes, ["Region", "region", "REGION"]);
  const department = pickFirstText(attributes, ["Department", "Departement", "department", "departement", "DEPARTEMENT"]);
  const commune = pickFirstText(attributes, ["Commune", "commune"]);
  const holderName = pickFirstText(attributes, ["Parties", "Titulaire", "holder_name", "Holder", "parties"]);
  const rawType = pickFirstText(attributes, ["Type", "type", "TYPE", "PermitType", "permit_type"]) || `layer-${input.layerId}`;
  const rawStatus = pickFirstText(attributes, ["Status", "status", "STATUS", "State", "state"]) || "pending";
  const siteType = normalizeSiteType(rawType);
  const status = normalizeStatus(rawStatus);
  const cadastreName = normalizeCadastreName(attributes, permitNumber, holderName);
  if (!cadastreName) return null;

  const objectId = asUpper(attributes.OBJECTID ?? attributes.objectid ?? attributes.ObjectId);
  const sourceRef = [input.layerId, permitNumber || objectId || cadastreName]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .join(":");

  return {
    cadastreName,
    permitNumber,
    region,
    department,
    commune,
    holderName,
    siteType,
    status,
    riskLevel: defaultRiskFromStatus(status),
    lat: Number(centroid.lat),
    lng: Number(centroid.lng),
    geometryJson: geometry && typeof geometry === "object" ? (geometry as Record<string, unknown>) : null,
    sourceRef: sourceRef || null,
  };
}

