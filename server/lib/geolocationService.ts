export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationHierarchy {
  countryId: number;
  regionId: number;
  cityId: number;
  districtId: number;
  neighborhoodId: number;
}

/**
 * Calculate distance between two geographic coordinates using Haversine formula
 * @returns Distance in kilometers
 */
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = degreesToRadians(coord2.latitude - coord1.latitude);
  const dLon = degreesToRadians(coord2.longitude - coord1.longitude);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(coord1.latitude)) *
    Math.cos(degreesToRadians(coord2.latitude)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if a point is within a radius from a center point
 */
export function isWithinRadius(
  center: Coordinates,
  point: Coordinates,
  radiusKm: number
): boolean {
  const distance = calculateDistance(center, point);
  return distance <= radiusKm;
}

/**
 * Find companies within a radius from a given point
 */
export interface CompanyLocation {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

export function filterCompaniesByRadius(
  centerPoint: Coordinates,
  companies: CompanyLocation[],
  radiusKm: number
): Array<CompanyLocation & { distance: number }> {
  return companies
    .map(company => ({
      ...company,
      distance: calculateDistance(centerPoint, {
        latitude: company.latitude,
        longitude: company.longitude
      })
    }))
    .filter(company => company.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Get bounding box for a given center point and radius
 * Useful for database queries
 */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function getBoundingBox(center: Coordinates, radiusKm: number): BoundingBox {
  const R = 6371; // Earth's radius in km
  
  // Convert radius to angular distance in radians
  const radDist = radiusKm / R;
  
  const minLat = center.latitude - (radDist * 180 / Math.PI);
  const maxLat = center.latitude + (radDist * 180 / Math.PI);
  
  // Longitude calculation needs to account for latitude
  const deltaLon = Math.asin(Math.sin(radDist) / Math.cos(degreesToRadians(center.latitude))) * 180 / Math.PI;
  
  const minLon = center.longitude - deltaLon;
  const maxLon = center.longitude + deltaLon;
  
  return {
    minLat: Math.max(minLat, -90),
    maxLat: Math.min(maxLat, 90),
    minLon: Math.max(minLon, -180),
    maxLon: Math.min(maxLon, 180)
  };
}

/**
 * Format phone number with country code
 */
export function formatPhoneNumber(number: string, countryCode: string): string {
  // Remove all non-numeric characters
  const cleaned = number.replace(/\D/g, '');
  
  // If it already starts with +, return as is
  if (number.startsWith('+')) {
    return number;
  }
  
  // Add country code if not present
  if (!cleaned.startsWith(countryCode.replace('+', ''))) {
    return `${countryCode}${cleaned}`;
  }
  
  return `+${cleaned}`;
}

/**
 * Validate phone number format (basic validation)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Basic validation: should start with + and have 10-15 digits
  const phoneRegex = /^\+?[1-9]\d{9,14}$/;
  const cleaned = phone.replace(/[\s-()]/g, '');
  return phoneRegex.test(cleaned);
}

/**
 * Generate location display name from hierarchy
 */
export function formatLocationDisplay(location: {
  neighborhood?: string;
  district?: string;
  city?: string;
  region?: string;
  country?: string;
}): string {
  const parts = [
    location.neighborhood,
    location.district,
    location.city,
    location.region,
    location.country
  ].filter(Boolean);
  
  return parts.join(', ');
}
