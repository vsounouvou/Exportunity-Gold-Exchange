import { db } from "@db";
import {
  countries, regions, cities, districts, neighborhoods,
  companies, products, services, revenueTransactions
} from "@db/schema";
import { eq } from "drizzle-orm";
import { generateCompanyQR, generateProductQR, generateServiceQR } from "./qrCodeService";
import { calculateDistance } from "./geolocationService";

// Comprehensive global geolocation data
export const WORLD_LOCATIONS = {
  // Major countries with full hierarchy
  countries: [
    // North America
    { code: 'US', name: 'United States', dialCode: '+1', currency: 'USD', timezone: 'America/New_York' },
    { code: 'CA', name: 'Canada', dialCode: '+1', currency: 'CAD', timezone: 'America/Toronto' },
    { code: 'MX', name: 'Mexico', dialCode: '+52', currency: 'MXN', timezone: 'America/Mexico_City' },
    
    // Europe
    { code: 'GB', name: 'United Kingdom', dialCode: '+44', currency: 'GBP', timezone: 'Europe/London' },
    { code: 'FR', name: 'France', dialCode: '+33', currency: 'EUR', timezone: 'Europe/Paris' },
    { code: 'DE', name: 'Germany', dialCode: '+49', currency: 'EUR', timezone: 'Europe/Berlin' },
    { code: 'IT', name: 'Italy', dialCode: '+39', currency: 'EUR', timezone: 'Europe/Rome' },
    { code: 'ES', name: 'Spain', dialCode: '+34', currency: 'EUR', timezone: 'Europe/Madrid' },
    
    // Middle East & Africa
    { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', currency: 'AED', timezone: 'Asia/Dubai' },
    { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', currency: 'SAR', timezone: 'Asia/Riyadh' },
    { code: 'EG', name: 'Egypt', dialCode: '+20', currency: 'EGP', timezone: 'Africa/Cairo' },
    { code: 'ZA', name: 'South Africa', dialCode: '+27', currency: 'ZAR', timezone: 'Africa/Johannesburg' },
    { code: 'NG', name: 'Nigeria', dialCode: '+234', currency: 'NGN', timezone: 'Africa/Lagos' },
    { code: 'KE', name: 'Kenya', dialCode: '+254', currency: 'KES', timezone: 'Africa/Nairobi' },
    
    // Asia
    { code: 'CN', name: 'China', dialCode: '+86', currency: 'CNY', timezone: 'Asia/Shanghai' },
    { code: 'IN', name: 'India', dialCode: '+91', currency: 'INR', timezone: 'Asia/Kolkata' },
    { code: 'JP', name: 'Japan', dialCode: '+81', currency: 'JPY', timezone: 'Asia/Tokyo' },
    { code: 'SG', name: 'Singapore', dialCode: '+65', currency: 'SGD', timezone: 'Asia/Singapore' },
    { code: 'TH', name: 'Thailand', dialCode: '+66', currency: 'THB', timezone: 'Asia/Bangkok' },
    { code: 'VN', name: 'Vietnam', dialCode: '+84', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
    
    // South America
    { code: 'BR', name: 'Brazil', dialCode: '+55', currency: 'BRL', timezone: 'America/Sao_Paulo' },
    { code: 'AR', name: 'Argentina', dialCode: '+54', currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires' },
  ],
  
  // Major regions for each country
  regions: {
    US: [
      { name: 'California', code: 'CA', type: 'state' },
      { name: 'New York', code: 'NY', type: 'state' },
      { name: 'Texas', code: 'TX', type: 'state' },
      { name: 'Florida', code: 'FL', type: 'state' },
    ],
    AE: [
      { name: 'Dubai', code: 'DU', type: 'emirate' },
      { name: 'Abu Dhabi', code: 'AZ', type: 'emirate' },
      { name: 'Sharjah', code: 'SH', type: 'emirate' },
    ],
    FR: [
      { name: 'Île-de-France', code: 'IDF', type: 'region' },
      { name: 'Provence-Alpes-Côte d\'Azur', code: 'PAC', type: 'region' },
    ],
    GB: [
      { name: 'England', code: 'ENG', type: 'country' },
      { name: 'Scotland', code: 'SCT', type: 'country' },
    ],
    CN: [
      { name: 'Beijing', code: 'BJ', type: 'municipality' },
      { name: 'Shanghai', code: 'SH', type: 'municipality' },
      { name: 'Guangdong', code: 'GD', type: 'province' },
    ],
  },
  
  // Major cities
  cities: {
    'US-CA': [
      { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, population: 3990000 },
      { name: 'San Francisco', lat: 37.7749, lon: -122.4194, population: 883000 },
      { name: 'San Diego', lat: 32.7157, lon: -117.1611, population: 1420000 },
    ],
    'US-NY': [
      { name: 'New York City', lat: 40.7128, lon: -74.0060, population: 8804000 },
      { name: 'Buffalo', lat: 42.8864, lon: -78.8784, population: 259000 },
    ],
    'AE-DU': [
      { name: 'Dubai', lat: 25.2048, lon: 55.2708, population: 3500000 },
    ],
    'AE-AZ': [
      { name: 'Abu Dhabi', lat: 24.4539, lon: 54.3773, population: 1500000 },
    ],
    'FR-IDF': [
      { name: 'Paris', lat: 48.8566, lon: 2.3522, population: 2161000 },
    ],
    'GB-ENG': [
      { name: 'London', lat: 51.5074, lon: -0.1278, population: 9000000 },
      { name: 'Manchester', lat: 53.4808, lon: -2.2426, population: 553000 },
    ],
    'CN-BJ': [
      { name: 'Beijing', lat: 39.9042, lon: 116.4074, population: 21540000 },
    ],
    'CN-SH': [
      { name: 'Shanghai', lat: 31.2304, lon: 121.4737, population: 27060000 },
    ],
  },
  
  // Districts for major cities
  districts: {
    'Dubai': [
      { name: 'Downtown Dubai', type: 'district' },
      { name: 'Dubai Marina', type: 'district' },
      { name: 'Deira', type: 'district' },
      { name: 'Jumeirah', type: 'district' },
    ],
    'New York City': [
      { name: 'Manhattan', type: 'borough' },
      { name: 'Brooklyn', type: 'borough' },
      { name: 'Queens', type: 'borough' },
      { name: 'Bronx', type: 'borough' },
    ],
    'London': [
      { name: 'Westminster', type: 'borough' },
      { name: 'Camden', type: 'borough' },
      { name: 'Kensington and Chelsea', type: 'borough' },
    ],
    'Paris': [
      { name: '1st Arrondissement', type: 'arrondissement' },
      { name: '8th Arrondissement', type: 'arrondissement' },
      { name: '16th Arrondissement', type: 'arrondissement' },
    ],
  },
  
  // Neighborhoods
  neighborhoods: {
    'Downtown Dubai': [
      { name: 'Burj Khalifa District', lat: 25.1972, lon: 55.2744 },
      { name: 'Business Bay', lat: 25.1881, lon: 55.2667 },
    ],
    'Dubai Marina': [
      { name: 'Marina Walk', lat: 25.0805, lon: 55.1388 },
      { name: 'JBR (Jumeirah Beach Residence)', lat: 25.0742, lon: 55.1352 },
    ],
    'Manhattan': [
      { name: 'SoHo', lat: 40.7233, lon: -74.0030 },
      { name: 'Tribeca', lat: 40.7163, lon: -74.0086 },
      { name: 'Upper East Side', lat: 40.7736, lon: -73.9566 },
      { name: 'Midtown', lat: 40.7549, lon: -73.9840 },
    ],
    'Westminster': [
      { name: 'Mayfair', lat: 51.5099, lon: -0.1467 },
      { name: 'Soho', lat: 51.5136, lon: -0.1353 },
    ],
    '1st Arrondissement': [
      { name: 'Louvre', lat: 48.8611, lon: 2.3364 },
      { name: 'Palais Royal', lat: 48.8631, lon: 2.3373 },
    ],
  }
};

export async function generateGlobalGeolocationData() {
  console.log('[GeoSim] Starting comprehensive geolocation data generation...');
  
  const countryMap: Record<string, number> = {};
  const regionMap: Record<string, number> = {};
  const cityMap: Record<string, number> = {};
  const districtMap: Record<string, number> = {};
  
  try {
    // 1. Insert Countries
    console.log('[GeoSim] Inserting countries...');
    for (const country of WORLD_LOCATIONS.countries) {
      const [inserted] = await db.insert(countries).values(country).returning();
      countryMap[country.code] = inserted.id;
    }
    console.log(`[GeoSim] Inserted ${Object.keys(countryMap).length} countries`);
    
    // 2. Insert Regions
    console.log('[GeoSim] Inserting regions...');
    let regionCount = 0;
    for (const [countryCode, regionList] of Object.entries(WORLD_LOCATIONS.regions)) {
      const countryId = countryMap[countryCode];
      if (!countryId) continue;
      
      for (const region of regionList) {
        const [inserted] = await db.insert(regions).values({
          countryId,
          name: region.name,
          code: region.code,
          type: region.type as 'state' | 'province' | 'region' | 'territory'
        }).returning();
        regionMap[`${countryCode}-${region.code}`] = inserted.id;
        regionCount++;
      }
    }
    console.log(`[GeoSim] Inserted ${regionCount} regions`);
    
    // 3. Insert Cities
    console.log('[GeoSim] Inserting cities...');
    let cityCount = 0;
    for (const [regionKey, cityList] of Object.entries(WORLD_LOCATIONS.cities)) {
      const regionId = regionMap[regionKey];
      if (!regionId) continue;
      
      const countryCode = regionKey.split('-')[0];
      const countryId = countryMap[countryCode];
      
      for (const city of cityList) {
        const [inserted] = await db.insert(cities).values({
          regionId,
          countryId,
          name: city.name,
          latitude: city.lat.toString(),
          longitude: city.lon.toString(),
          population: city.population
        }).returning();
        cityMap[city.name] = inserted.id;
        cityCount++;
      }
    }
    console.log(`[GeoSim] Inserted ${cityCount} cities`);
    
    // 4. Insert Districts
    console.log('[GeoSim] Inserting districts...');
    let districtCount = 0;
    for (const [cityName, districtList] of Object.entries(WORLD_LOCATIONS.districts)) {
      const cityId = cityMap[cityName];
      if (!cityId) continue;
      
      for (const district of districtList) {
        const [inserted] = await db.insert(districts).values({
          cityId,
          name: district.name,
          type: district.type as 'district' | 'commune' | 'borough' | 'ward'
        }).returning();
        districtMap[district.name] = inserted.id;
        districtCount++;
      }
    }
    console.log(`[GeoSim] Inserted ${districtCount} districts`);
    
    // 5. Insert Neighborhoods
    console.log('[GeoSim] Inserting neighborhoods...');
    let neighborhoodCount = 0;
    for (const [districtName, neighborhoodList] of Object.entries(WORLD_LOCATIONS.neighborhoods)) {
      const districtId = districtMap[districtName];
      if (!districtId) continue;
      
      // Find cityId from district
      const districtEntry = Object.entries(WORLD_LOCATIONS.districts).find(
        ([_, dList]) => dList.some(d => d.name === districtName)
      );
      if (!districtEntry) continue;
      
      const cityId = cityMap[districtEntry[0]];
      if (!cityId) continue;
      
      for (const neighborhood of neighborhoodList) {
        await db.insert(neighborhoods).values({
          districtId,
          cityId,
          name: neighborhood.name,
          latitude: neighborhood.lat.toString(),
          longitude: neighborhood.lon.toString(),
          isCustom: false
        });
        neighborhoodCount++;
      }
    }
    console.log(`[GeoSim] Inserted ${neighborhoodCount} neighborhoods`);
    
    console.log('[GeoSim] ✅ Global geolocation data generation complete!');
    console.log(`Summary: ${Object.keys(countryMap).length} countries, ${regionCount} regions, ${cityCount} cities, ${districtCount} districts, ${neighborhoodCount} neighborhoods`);
    
    return {
      countries: Object.keys(countryMap).length,
      regions: regionCount,
      cities: cityCount,
      districts: districtCount,
      neighborhoods: neighborhoodCount
    };
  } catch (error) {
    console.error('[GeoSim] Error generating geolocation data:', error);
    throw error;
  }
}

export async function updateCompaniesWithLocationAndQR() {
  console.log('[GeoSim] Updating companies with geolocation, phone numbers, and QR codes...');
  
  try {
    const existingCompanies = await db.query.companies.findMany();
    
    // Sample neighborhoods for random assignment
    const allNeighborhoods = await db.query.neighborhoods.findMany({
      with: {
        city: { with: { region: { with: { country: true } } } },
        district: true
      },
      limit: 100
    });
    
    for (const company of existingCompanies) {
      // Randomly assign a neighborhood
      const neighborhood = allNeighborhoods[Math.floor(Math.random() * allNeighborhoods.length)];
      
      if (!neighborhood) continue;
      
      // Generate phone number
      const dialCode = neighborhood.city?.region?.country?.dialCode || '+1';
      const phoneNumber = `${dialCode}${Math.floor(Math.random() * 9000000000 + 1000000000)}`;
      
      // Generate QR code
      const qr = await generateCompanyQR(company.id);
      
      // Update company
      await db.update(companies)
        .set({
          neighborhoodId: neighborhood.id,
          districtId: neighborhood.districtId,
          cityId: neighborhood.cityId,
          regionId: neighborhood.city?.regionId,
          countryId: neighborhood.city?.countryId,
          latitude: neighborhood.latitude,
          longitude: neighborhood.longitude,
          phoneNumber,
          phoneCountryCode: dialCode,
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
          qrCode: qr.qrCode,
          qrCodeUrl: qr.qrCodeUrl,
          marketplaceEnabled: true,
          publicVisibility: true
        })
        .where(eq(companies.id, company.id));
      
      console.log(`[GeoSim] Updated company ${company.name} with location and QR`);
    }
    
    console.log(`[GeoSim] ✅ Updated ${existingCompanies.length} companies`);
    return { companiesUpdated: existingCompanies.length };
  } catch (error) {
    console.error('[GeoSim] Error updating companies:', error);
    throw error;
  }
}

export async function generateSimulationData() {
  console.log('[GeoSim] Starting comprehensive simulation data generation...');
  
  try {
    // Step 1: Generate global geolocation hierarchy
    const geoStats = await generateGlobalGeolocationData();
    
    // Step 2: Update existing companies
    const companyStats = await updateCompaniesWithLocationAndQR();
    
    console.log('[GeoSim] ✅ Simulation complete!');
    return {
      ...geoStats,
      ...companyStats
    };
  } catch (error) {
    console.error('[GeoSim] Simulation failed:', error);
    throw error;
  }
}
