import { normalizeIndustrialText } from "./taxonomy";

export const INDUSTRIAL_FACTORY_LEAD_STATUSES = [
  "new",
  "under_review",
  "qualified",
  "contact_ready",
  "rejected",
  "converted",
] as const;

export type IndustrialFactoryLeadStatus =
  (typeof INDUSTRIAL_FACTORY_LEAD_STATUSES)[number];

export function canConvertIndustrialFactoryLead(
  status: IndustrialFactoryLeadStatus,
) {
  return status === "qualified" || status === "contact_ready";
}

export type IndustrialFactoryLeadCandidate = {
  source: "google_places";
  googlePlaceId: string | null;
  name: string;
  normalizedName: string;
  primaryIndustry: string | null;
  googleTypes: string[];
  address: string | null;
  city: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  openingHours: Record<string, unknown>;
  qualificationScore: number;
  metadata: Record<string, unknown>;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayName(value: unknown) {
  if (typeof value === "string") return text(value);
  if (value && typeof value === "object") {
    return (
      text((value as Record<string, unknown>).text) ||
      text((value as Record<string, unknown>).displayName)
    );
  }
  return null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => text(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function humanizeType(value: string | null) {
  if (!value) return null;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function qualificationScore(input: {
  primaryType: string | null;
  types: string[];
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
}) {
  const industrialPattern =
    /(manufactur|factory|industrial|warehouse|logistics|freight|machine|construction|material|packaging|agricultur|food_process|textile|distributor)/i;
  const typeText = [input.primaryType, ...input.types]
    .filter(Boolean)
    .join(" ");
  let score = 0;
  if (industrialPattern.test(typeText)) score += 28;
  if (input.address) score += 12;
  if (input.latitude !== null && input.longitude !== null) score += 14;
  if (input.phone) score += 16;
  if (input.website) score += 12;
  if ((input.rating || 0) >= 4) score += 10;
  if ((input.reviewCount || 0) >= 10) score += 8;
  return Math.min(100, score);
}

export function mapGooglePlaceToIndustrialFactoryLead(
  place: unknown,
  context: {
    city?: string | null;
    countryCode?: string | null;
    query?: string | null;
  } = {},
): IndustrialFactoryLeadCandidate | null {
  const item = asRecord(place);
  const name = displayName(item.displayName);
  if (!name) return null;

  const location = asRecord(item.location);
  const types = stringList(item.types);
  const primaryType = text(item.primaryType);
  const address = text(item.formattedAddress);
  const latitude = numberOrNull(location.latitude ?? location.lat);
  const longitude = numberOrNull(location.longitude ?? location.lng);
  const rating = numberOrNull(item.rating);
  const reviewCount = numberOrNull(item.userRatingCount);
  const phone =
    text(item.internationalPhoneNumber) || text(item.nationalPhoneNumber);
  const website = text(item.websiteUri);
  const googlePlaceId = text(item.id) || text(item.name);
  const query = text(context.query);

  const score = qualificationScore({
    primaryType,
    types,
    address,
    latitude,
    longitude,
    phone,
    website,
    rating,
    reviewCount,
  });

  return {
    source: "google_places",
    googlePlaceId,
    name,
    normalizedName: normalizeIndustrialText(name),
    primaryIndustry: humanizeType(primaryType),
    googleTypes: types,
    address,
    city: text(context.city),
    countryCode: text(context.countryCode)?.toUpperCase() || null,
    latitude,
    longitude,
    phone,
    website,
    googleMapsUrl: text(item.googleMapsUri),
    rating,
    reviewCount,
    businessStatus: text(item.businessStatus),
    openingHours: asRecord(item.regularOpeningHours),
    qualificationScore: score,
    metadata: {
      source: "google_places",
      discoveryQuery: query,
      publicListing: true,
      verificationRequired: true,
      qualificationBasis: "preliminary_public_listing_data",
    },
  };
}

export function mapGooglePlacesToIndustrialFactoryLeads(
  places: unknown[],
  context: {
    city?: string | null;
    countryCode?: string | null;
    query?: string | null;
  } = {},
) {
  return places
    .map((place) => mapGooglePlaceToIndustrialFactoryLead(place, context))
    .filter((candidate): candidate is IndustrialFactoryLeadCandidate =>
      Boolean(candidate),
    );
}

export function factoryLeadDeduplicationLabel(
  candidate: Pick<
    IndustrialFactoryLeadCandidate,
    "googlePlaceId" | "normalizedName" | "city"
  >,
) {
  return (
    candidate.googlePlaceId ||
    `${candidate.normalizedName}:${String(candidate.city || "")
      .trim()
      .toLowerCase()}`
  );
}
