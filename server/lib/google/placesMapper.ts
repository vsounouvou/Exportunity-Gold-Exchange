import type { PmeLeadInput } from "../pme-exchange/repository";

type GooglePlace = Record<string, any>;

function firstText(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object") {
    const text = String((value as any).text || "").trim();
    if (text) return text;
  }
  return null;
}

function normalizeCategory(value: unknown) {
  const raw = String(value || "business")
    .replace(/_/g, " ")
    .trim();
  return raw ? raw.replace(/\b\w/g, (m) => m.toUpperCase()) : "Business";
}

function inferCity(address: string | null, fallback?: string) {
  const text = String(address || "").toLowerCase();
  if (text.includes("cotonou") || text.includes("benin")) return "Cotonou";
  if (text.includes("abidjan") || text.includes("cote d") || text.includes("côte d")) return "Abidjan";
  return fallback || null;
}

function inferCountry(address: string | null, fallback?: string) {
  const text = String(address || "").toLowerCase();
  if (text.includes("benin") || text.includes("bénin")) return "BJ";
  if (text.includes("cote d") || text.includes("côte d") || text.includes("abidjan")) return "CI";
  return fallback || null;
}

export function mapGooglePlaceToPmeLead(place: GooglePlace, input?: { city?: string; country?: string }): PmeLeadInput {
  const displayName = firstText(place.displayName) || firstText(place.name) || "Local business";
  const formattedAddress = firstText(place.formattedAddress);
  const primaryType = String(place.primaryType || (Array.isArray(place.types) ? place.types[0] : "") || "business").trim();
  const types = Array.isArray(place.types) ? place.types.map((t) => String(t)).filter(Boolean) : primaryType ? [primaryType] : [];
  const latitude = Number(place.location?.latitude ?? place.location?.lat);
  const longitude = Number(place.location?.longitude ?? place.location?.lng);

  return {
    source: "google_places",
    googlePlaceId: String(place.id || place.name || "").trim() || null,
    name: displayName,
    description: `${normalizeCategory(primaryType)} from Google Places. Contact and verification are required before claiming inventory or investment readiness.`,
    category: normalizeCategory(primaryType),
    primaryType,
    types,
    address: formattedAddress || undefined,
    city: inferCity(formattedAddress, input?.city) as any,
    country: inferCountry(formattedAddress, input?.country) as any,
    latitude: Number.isFinite(latitude) ? latitude : null as any,
    longitude: Number.isFinite(longitude) ? longitude : null as any,
    phone: firstText(place.nationalPhoneNumber) || firstText(place.internationalPhoneNumber) || undefined,
    whatsappPhone: firstText(place.internationalPhoneNumber) || firstText(place.nationalPhoneNumber) || undefined,
    website: firstText(place.websiteUri) || undefined,
    googleMapsUrl: firstText(place.googleMapsUri),
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : undefined,
    reviewCount: Number.isFinite(Number(place.userRatingCount)) ? Number(place.userRatingCount) : undefined,
    businessStatus: firstText(place.businessStatus) || "UNKNOWN",
    openingHours: place.regularOpeningHours || {},
    leadStatus: "enriched",
    contactStatus: "contact_required",
    metadata: {
      googleResourceName: place.name || null,
      discoverySource: "google_places",
      publicListing: true,
      verificationRequired: true,
    },
  };
}

export function mapGooglePlacesToPmeLeads(places: GooglePlace[], input?: { city?: string; country?: string }) {
  return places.map((place) => mapGooglePlaceToPmeLead(place, input));
}
