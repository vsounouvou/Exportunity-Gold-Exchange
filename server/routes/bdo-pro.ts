import crypto from "node:crypto";
import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@db";
import { bureauDAchat, goldOffers, miningSites } from "@db/schema";
import { ensureTenantUser } from "./utils/auth";

const router = Router();
const TIER_RANK = { free: 0, pro_basic: 1, pro_buyer: 2, pro_source: 3, admin_internal: 4 } as const;

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function slugify(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeRole(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/["'’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireTenant(req: any, res: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    res.status(500).json({ ok: false, message: "Tenant not resolved" });
    return null;
  }
  return { id: tenantId, key: String(req.tenant?.key || "tenant").trim() || "tenant" };
}

async function ensureTables() {
  await db.execute(sql`
    create table if not exists pro_profiles (
      id uuid primary key,
      user_id integer not null references ece_users(id) on delete cascade,
      tenant_id integer not null references tenants(id) on delete cascade,
      role text not null,
      company_name text,
      country text,
      verification_status text not null default 'pending',
      membership_tier text not null default 'free',
      can_access_map boolean not null default false,
      can_view_supply_contacts boolean not null default false,
      can_view_mine_layer boolean not null default false,
      can_view_bureau_layer boolean not null default true,
      can_view_export_layer boolean not null default false,
      created_at timestamp without time zone not null default now(),
      updated_at timestamp without time zone not null default now(),
      unique (tenant_id, user_id)
    )
  `);
  await db.execute(sql`
    create table if not exists pro_map_nodes (
      id uuid primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      node_type text not null,
      name text not null,
      slug text,
      description text,
      country text,
      region text,
      city text,
      latitude numeric(10,7),
      longitude numeric(10,7),
      verification_status text not null default 'unknown',
      is_public_to_pro boolean not null default true,
      owner_profile_id uuid references pro_profiles(id) on delete set null,
      company_name text,
      contact_name text,
      contact_phone text,
      contact_whatsapp text,
      contact_email text,
      metadata_json jsonb not null default '{}'::jsonb,
      created_at timestamp without time zone not null default now(),
      updated_at timestamp without time zone not null default now()
    )
  `);
  await db.execute(sql`create index if not exists pro_profiles_tenant_role_idx on pro_profiles(tenant_id, role)`);
  await db.execute(sql`create index if not exists pro_profiles_tenant_tier_idx on pro_profiles(tenant_id, membership_tier)`);
  await db.execute(sql`create unique index if not exists pro_map_nodes_tenant_slug_idx on pro_map_nodes(tenant_id, slug)`);
  await db.execute(sql`create index if not exists pro_map_nodes_tenant_type_idx on pro_map_nodes(tenant_id, node_type)`);
}

async function seedNodes(tenantId: number) {
  const countResult = await db.execute(sql`select count(*)::int as count from pro_map_nodes where tenant_id = ${tenantId}`);
  const count = Number((countResult.rows[0] as any)?.count || 0);
  if (count > 0) return;

  const nodes = [
    ["association", "Association des acheteurs auriferes du Nord", "association-acheteurs-nord", "Reseau professionnel pour les zones de sourcing du nord ivoirien.", "CI", "Korhogo", "Korhogo", 9.458, -5.629, "verified", "Association des acheteurs auriferes du Nord", "Coordination regionale", "+2250700000001", "+2250700000001", "nord@boursedelor.com", JSON.stringify({ layers: ["association", "regional_supply_node"], priority: 4 })],
    ["regional_supply_node", "Noeud d'approvisionnement de Bouake", "noeud-approvisionnement-bouake", "Consolidation des flux de sourcing et preparation logistique pour les achats professionnels.", "CI", "Bouake", "Bouake", 7.689, -5.03, "verified", "Noeud d'approvisionnement de Bouake", "Desk sourcing", "+2250700000002", "+2250700000002", "bouake@boursedelor.com", JSON.stringify({ layers: ["regional_supply_node", "bureau_achat"], priority: 3 })],
    ["export_hub", "Hub export Abidjan", "hub-export-abidjan", "Hub de preparation documentaire, conformite et coordination export.", "CI", "Abidjan", "Abidjan", 5.3364, -4.0267, "verified", "Hub export Abidjan", "Cellule export", "+2250700000003", "+2250700000003", "export@boursedelor.com", JSON.stringify({ layers: ["export_hub", "exporter"], priority: 2 })],
    ["logistics_hub", "Plateforme logistique San Pedro", "plateforme-logistique-san-pedro", "Appui logistique et coordination transport pour lots professionnels.", "CI", "San-Pedro", "San-Pedro", 4.7485, -6.6363, "pending", "Plateforme logistique San Pedro", "Desk logistique", "+2250700000004", "+2250700000004", "logistique@boursedelor.com", JSON.stringify({ layers: ["logistics_hub"], priority: 5 })],
    ["equipment_node", "Support equipement Yamoussoukro", "support-equipement-yamoussoukro", "Maintenance, equipements et support terrain pour operateurs verifies.", "CI", "Yamoussoukro", "Yamoussoukro", 6.8276, -5.2893, "verified", "Support equipement Yamoussoukro", "Support operations", "+2250700000005", "+2250700000005", "equipment@boursedelor.com", JSON.stringify({ layers: ["equipment_node"], priority: 6 })],
  ] as const;

  for (const node of nodes) {
    await db.execute(sql`
      insert into pro_map_nodes (
        id, tenant_id, node_type, name, slug, description, country, region, city, latitude, longitude,
        verification_status, is_public_to_pro, company_name, contact_name, contact_phone, contact_whatsapp,
        contact_email, metadata_json, created_at, updated_at
      ) values (
        ${crypto.randomUUID()}, ${tenantId}, ${node[0]}, ${node[1]}, ${node[2]}, ${node[3]}, ${node[4]}, ${node[5]}, ${node[6]}, ${node[7]}, ${node[8]},
        ${node[9]}, true, ${node[10]}, ${node[11]}, ${node[12]}, ${node[13]}, ${node[14]}, ${node[15]}, now(), now()
      ) on conflict do nothing
    `);
  }
}

function deriveDefaultProfile(user: any) {
  const rawRoles = new Set<string>();
  for (const value of [user?.currentMode, ...(Array.isArray(user?.roles) ? user.roles : [])]) {
    const normalized = normalizeRole(value);
    if (normalized) rawRoles.add(normalized);
  }
  const displayName = text(user?.displayName) || text(user?.email) || "Compte professionnel";

  if (rawRoles.has("admin") || rawRoles.has("chairman assistant") || rawRoles.has("chairman")) {
    return { role: "admin_internal", company_name: displayName, country: "CI", verification_status: "verified", membership_tier: "admin_internal", can_access_map: true, can_view_supply_contacts: true, can_view_mine_layer: true, can_view_bureau_layer: true, can_view_export_layer: true };
  }
  if (rawRoles.has("bureau achat user") || rawRoles.has("authorized gold buyer")) {
    return { role: "bureau_achat", company_name: displayName, country: "CI", verification_status: "verified", membership_tier: "pro_source", can_access_map: true, can_view_supply_contacts: true, can_view_mine_layer: true, can_view_bureau_layer: true, can_view_export_layer: true };
  }
  if (rawRoles.has("verified investor") || rawRoles.has("shareholder")) {
    return { role: "international_buyer", company_name: displayName, country: "CI", verification_status: "verified", membership_tier: "pro_buyer", can_access_map: true, can_view_supply_contacts: true, can_view_mine_layer: false, can_view_bureau_layer: true, can_view_export_layer: true };
  }
  if (rawRoles.has("mine owner") || rawRoles.has("mine operator") || rawRoles.has("operator")) {
    return { role: "association_admin", company_name: displayName, country: "CI", verification_status: "verified", membership_tier: "pro_source", can_access_map: true, can_view_supply_contacts: true, can_view_mine_layer: true, can_view_bureau_layer: true, can_view_export_layer: false };
  }
  if (rawRoles.has("investor")) {
    return { role: "investor", company_name: displayName, country: "CI", verification_status: "pending", membership_tier: "pro_basic", can_access_map: false, can_view_supply_contacts: false, can_view_mine_layer: false, can_view_bureau_layer: true, can_view_export_layer: false };
  }
  return { role: "investor", company_name: displayName, country: "CI", verification_status: "unknown", membership_tier: "free", can_access_map: false, can_view_supply_contacts: false, can_view_mine_layer: false, can_view_bureau_layer: false, can_view_export_layer: false };
}

function mapProfile(row: any) {
  return {
    id: String(row.id),
    user_id: Number(row.user_id),
    tenant_id: Number(row.tenant_id),
    role: String(row.role),
    company_name: text(row.company_name),
    country: text(row.country),
    verification_status: String(row.verification_status || "unknown"),
    membership_tier: String(row.membership_tier || "free"),
    can_access_map: Boolean(row.can_access_map),
    can_view_supply_contacts: Boolean(row.can_view_supply_contacts),
    can_view_mine_layer: Boolean(row.can_view_mine_layer),
    can_view_bureau_layer: Boolean(row.can_view_bureau_layer),
    can_view_export_layer: Boolean(row.can_view_export_layer),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

async function getProfile(req: any, res: any) {
  const tenant = requireTenant(req, res);
  if (!tenant) return null;
  const user = req.tenantUser;
  if (!user) {
    res.status(401).json({ ok: false, message: "Authentication required" });
    return null;
  }

  await ensureTables();
  await seedNodes(tenant.id);

  const existing = await db.execute(sql`select * from pro_profiles where tenant_id = ${tenant.id} and user_id = ${Number(user.id)} limit 1`);
  if (existing.rows[0]) return mapProfile(existing.rows[0]);

  const profile = deriveDefaultProfile(user);
  const inserted = await db.execute(sql`
    insert into pro_profiles (
      id, user_id, tenant_id, role, company_name, country, verification_status, membership_tier,
      can_access_map, can_view_supply_contacts, can_view_mine_layer, can_view_bureau_layer, can_view_export_layer,
      created_at, updated_at
    ) values (
      ${crypto.randomUUID()}, ${Number(user.id)}, ${tenant.id}, ${profile.role}, ${profile.company_name}, ${profile.country}, ${profile.verification_status}, ${profile.membership_tier},
      ${profile.can_access_map}, ${profile.can_view_supply_contacts}, ${profile.can_view_mine_layer}, ${profile.can_view_bureau_layer}, ${profile.can_view_export_layer}, now(), now()
    )
    on conflict (tenant_id, user_id) do update set updated_at = now()
    returning *
  `);
  return mapProfile(inserted.rows[0]);
}

function canDirectory(profile: any) {
  return TIER_RANK[profile.membership_tier as keyof typeof TIER_RANK] >= TIER_RANK.pro_basic || profile.role === "admin_internal";
}

function canMap(profile: any) {
  return Boolean(profile.can_access_map) || TIER_RANK[profile.membership_tier as keyof typeof TIER_RANK] >= TIER_RANK.pro_buyer;
}

function visibleLayers(profile: any) {
  const layers = new Set<string>();
  if (profile.can_view_bureau_layer) {
    layers.add("bureau_achat");
    layers.add("regional_supply_node");
  }
  if (profile.can_view_export_layer) {
    layers.add("exporter");
    layers.add("export_hub");
    layers.add("logistics_hub");
  }
  if (profile.can_view_mine_layer) {
    layers.add("mine");
    layers.add("artisanal_zone");
    layers.add("association");
    layers.add("equipment_node");
    layers.add("regional_supply_node");
    layers.add("logistics_hub");
  }
  if (profile.role === "admin_internal") {
    ["bureau_achat", "exporter", "mine", "artisanal_zone", "association", "regional_supply_node", "export_hub", "logistics_hub", "equipment_node"].forEach((value) => layers.add(value));
  }
  return layers;
}

function mapMeta(profile: any) {
  if (profile.role === "bureau_achat" || profile.role === "association_admin" || profile.membership_tier === "pro_source") {
    return {
      variant: "source",
      title: "Carte de sourcing aurifere",
      subtitle: "Visualisez les zones minieres, associations et opportunites de sourcing.",
      defaultTypes: ["mine", "artisanal_zone", "association", "regional_supply_node", "logistics_hub"],
    };
  }
  return {
    variant: "buyer",
    title: "Carte des contreparties auriferes verifiees",
    subtitle: "Identifiez des bureaux d'achat et exportateurs verifies pour vos operations en gros.",
    defaultTypes: ["bureau_achat", "exporter", "export_hub", "regional_supply_node"],
  };
}

async function offerStatsByBureau(tenantId: number) {
  const result = await db
    .select({
      bureauId: goldOffers.bureauId,
      activeOffers: sql<number>`count(*)::int`,
      totalWeight: sql<string>`coalesce(sum(${goldOffers.weightGrams}), 0)::text`,
    })
    .from(goldOffers)
    .where(and(eq(goldOffers.tenantId, tenantId), eq(goldOffers.isAvailable, true)))
    .groupBy(goldOffers.bureauId);

  const map = new Map<number, { activeOffers: number; totalWeight: number }>();
  for (const row of result) {
    map.set(Number(row.bureauId), { activeOffers: Number(row.activeOffers || 0), totalWeight: num(row.totalWeight, 0) });
  }
  return map;
}

async function bureauRows(tenantId: number) {
  const offerStats = await offerStatsByBureau(tenantId);
  const rows = await db.query.bureauDAchat.findMany({
    where: and(eq(bureauDAchat.tenantId, tenantId), eq(bureauDAchat.isActive, true), eq(bureauDAchat.publicVisible, true)),
    orderBy: [desc(bureauDAchat.isVerified), asc(bureauDAchat.name)],
  });
  return rows.map((row) => {
    const services = Array.isArray(row.services) ? row.services.map((entry) => String(entry)) : [];
    const stats = offerStats.get(Number(row.id)) ?? { activeOffers: 0, totalWeight: 0 };
    return {
      id: `bureau-${row.id}`,
      row,
      services,
      wholesaleReady: stats.activeOffers > 0 || num(row.totalSalesKg, 0) > 0,
      activeOffers: stats.activeOffers,
      totalWeightKg: stats.totalWeight / 1000,
    };
  });
}

async function customNodes(tenantId: number) {
  const result = await db.execute(sql`select * from pro_map_nodes where tenant_id = ${tenantId} and is_public_to_pro = true order by created_at asc`);
  return result.rows as any[];
}

async function buildNodes(tenantId: number, profile: any) {
  const [bureaux, mines, custom] = await Promise.all([
    bureauRows(tenantId),
    profile.can_view_mine_layer
      ? db.query.miningSites.findMany({
          where: and(eq(miningSites.tenantId, tenantId), eq(miningSites.country, "CI")),
          orderBy: [desc(miningSites.status), asc(miningSites.cadastreName)],
          limit: 180,
        })
      : Promise.resolve([]),
    customNodes(tenantId),
  ]);

  const layers = visibleLayers(profile);
  const nodes: any[] = [];

  if (profile.can_view_bureau_layer || profile.can_view_export_layer) {
    for (const entry of bureaux) {
      const bureau = entry.row;
      const rowLayers = new Set<string>();
      if (profile.can_view_bureau_layer) rowLayers.add("bureau_achat");
      if (profile.can_view_export_layer && entry.services.includes("exporting")) rowLayers.add("exporter");
      if (!rowLayers.size) continue;
      const phone = text(bureau.contactPhone) || text(Array.isArray(bureau.phones) ? bureau.phones[0] : null);
      const lat = Number(bureau.latitude ?? 0);
      const lng = Number(bureau.longitude ?? 0);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) continue;
      nodes.push({
        id: `bureau-${bureau.id}`,
        nodeType: "bureau_achat",
        layers: Array.from(rowLayers),
        name: text(bureau.legalName) || bureau.name,
        slug: slugify(text(bureau.legalName) || bureau.name),
        description: `${entry.wholesaleReady ? "Contrepartie prete pour les operations en gros" : "Contrepartie en cours de structuration"}${entry.services.includes("exporting") ? " - capacite export" : ""}`,
        country: text(bureau.country),
        region: text(bureau.region),
        city: text(bureau.city),
        latitude: lat,
        longitude: lng,
        verificationStatus: bureau.isVerified ? "verified" : "pending",
        companyName: text(bureau.legalName) || bureau.name,
        contactName: bureau.name,
        contactPhone: profile.can_view_supply_contacts ? phone : null,
        contactWhatsapp: profile.can_view_supply_contacts ? phone : null,
        contactEmail: profile.can_view_supply_contacts ? text(bureau.email) : null,
        wholesaleReady: entry.wholesaleReady,
        metadata: {
          activeOffers: entry.activeOffers,
          totalWeightKg: Number(entry.totalWeightKg.toFixed(3)),
          services: entry.services,
          authorizationNumber: text(bureau.authorizationNumber),
          licenseNumber: text(bureau.licenseNumber),
        },
      });
    }
  }

  if (profile.can_view_mine_layer) {
    for (const mine of mines) {
      const nodeType = String(mine.siteType || "UNKNOWN") === "ARTISANAL" ? "artisanal_zone" : "mine";
      nodes.push({
        id: `mine-${mine.id}`,
        nodeType,
        layers: [nodeType],
        name: mine.cadastreName,
        slug: slugify(mine.cadastreName),
        description: "Zone miniere et signal sourcing a destination des acteurs professionnels verifies.",
        country: text(mine.country),
        region: text(mine.region),
        city: text(mine.commune) || text(mine.department),
        latitude: Number(mine.lat),
        longitude: Number(mine.lng),
        verificationStatus: String(mine.status || "pending").toLowerCase(),
        companyName: text(mine.holderName),
        contactName: null,
        contactPhone: null,
        contactWhatsapp: null,
        contactEmail: null,
        wholesaleReady: true,
        metadata: {
          permitNumber: text(mine.permitNumber),
          siteType: mine.siteType,
          riskLevel: mine.riskLevel,
          source: mine.source,
        },
      });
    }
  }

  for (const row of custom) {
    const lat = Number(row.latitude ?? 0);
    const lng = Number(row.longitude ?? 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) continue;
    const meta = row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {};
    const rowLayers = Array.isArray((meta as any).layers)
      ? (meta as any).layers.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
      : [String(row.node_type || "").trim()];
    if (!rowLayers.some((layer: string) => layers.has(layer))) continue;
    nodes.push({
      id: String(row.id),
      nodeType: String(row.node_type),
      layers: rowLayers,
      name: String(row.name),
      slug: text(row.slug),
      description: text(row.description),
      country: text(row.country),
      region: text(row.region),
      city: text(row.city),
      latitude: lat,
      longitude: lng,
      verificationStatus: String(row.verification_status || "unknown"),
      companyName: text(row.company_name),
      contactName: profile.can_view_supply_contacts ? text(row.contact_name) : null,
      contactPhone: profile.can_view_supply_contacts ? text(row.contact_phone) : null,
      contactWhatsapp: profile.can_view_supply_contacts ? text(row.contact_whatsapp) : null,
      contactEmail: profile.can_view_supply_contacts ? text(row.contact_email) : null,
      wholesaleReady: true,
      metadata: meta as Record<string, unknown>,
    });
  }

  return nodes;
}

function summarize(nodes: any[]) {
  const verifiedBureaux = nodes.filter((item) => item.layers.includes("bureau_achat") && item.verificationStatus === "verified").length;
  const verifiedExporters = nodes.filter((item) => item.layers.includes("exporter") && item.verificationStatus === "verified").length;
  const activeRegions = new Set(nodes.map((item) => `${item.country || ""}:${item.region || ""}`).filter((value) => value !== ":")).size;
  const sourcingNodes = nodes.filter((item) => item.layers.some((layer: string) => ["mine", "artisanal_zone", "association", "regional_supply_node"].includes(layer))).length;
  return { verifiedBureaux, verifiedExporters, activeRegions, sourcingNodes, totalVisibleNodes: nodes.length };
}

function filterVisible(nodes: any[], req: any) {
  const country = text(req.query?.country);
  const region = text(req.query?.region);
  const verifiedOnly = bool(req.query?.verifiedOnly || req.query?.verified_only);
  const contactAvailable = bool(req.query?.contactAvailable || req.query?.contact_available);
  const wholesaleReady = bool(req.query?.wholesaleReady || req.query?.wholesale_ready);
  const types = new Set(String(req.query?.types || req.query?.type || "").split(",").map((entry) => entry.trim()).filter(Boolean));
  return nodes.filter((node) => {
    if (country && String(node.country || "").toUpperCase() !== country.toUpperCase()) return false;
    if (region && String(node.region || "").toLowerCase() !== region.toLowerCase()) return false;
    if (verifiedOnly && node.verificationStatus !== "verified") return false;
    if (contactAvailable && !node.contactPhone && !node.contactEmail && !node.contactWhatsapp) return false;
    if (wholesaleReady && !node.wholesaleReady) return false;
    if (types.size && !node.layers.some((layer: string) => types.has(layer)) && !types.has(node.nodeType)) return false;
    return true;
  });
}

router.get("/pro/map/summary", ensureTenantUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const profile = await getProfile(req, res);
    if (!profile) return;
    const nodes = await buildNodes(tenant.id, profile);
    const meta = mapMeta(profile);
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      profile: {
        id: profile.id,
        role: profile.role,
        membershipTier: profile.membership_tier,
        verificationStatus: profile.verification_status,
        companyName: profile.company_name,
        country: profile.country,
        canAccessMap: canMap(profile),
        canViewSupplyContacts: profile.can_view_supply_contacts,
        canViewMineLayer: profile.can_view_mine_layer,
        canViewBureauLayer: profile.can_view_bureau_layer,
        canViewExportLayer: profile.can_view_export_layer,
      },
      map: {
        variant: meta.variant,
        title: meta.title,
        subtitle: meta.subtitle,
        defaultTypes: meta.defaultTypes,
        locked: !canMap(profile),
        lockedMessage: !canMap(profile) ? "Acces reserve aux membres Pro verifies" : null,
      },
      stats: summarize(nodes),
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load Pro map summary" });
  }
});

router.get("/pro/profile", ensureTenantUser, async (req: any, res) => {
  try {
    const profile = await getProfile(req, res);
    if (!profile) return;
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      profile: {
        id: profile.id,
        role: profile.role,
        membershipTier: profile.membership_tier,
        verificationStatus: profile.verification_status,
        companyName: profile.company_name,
        country: profile.country,
        canAccessMap: canMap(profile),
        canViewSupplyContacts: profile.can_view_supply_contacts,
        canViewMineLayer: profile.can_view_mine_layer,
        canViewBureauLayer: profile.can_view_bureau_layer,
        canViewExportLayer: profile.can_view_export_layer,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load Pro profile" });
  }
});

router.get("/pro/map/nodes", ensureTenantUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const profile = await getProfile(req, res);
    if (!profile) return;
    if (!canMap(profile)) {
      return res.status(403).json({ ok: false, message: "Acces reserve aux membres Pro verifies" });
    }
    const nodes = filterVisible(await buildNodes(tenant.id, profile), req);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, map: mapMeta(profile), stats: summarize(nodes), items: nodes });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load Pro map nodes" });
  }
});

router.get("/pro/directory/bureaux-achat", ensureTenantUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const profile = await getProfile(req, res);
    if (!profile) return;
    if (!canDirectory(profile) || !profile.can_view_bureau_layer) {
      return res.status(403).json({ ok: false, message: "Debloquez l'acces Pro pour consulter les contreparties." });
    }
    const items = (await bureauRows(tenant.id)).map((entry) => ({
      id: entry.id,
      companyName: text(entry.row.legalName) || entry.row.name,
      verified: Boolean(entry.row.isVerified),
      region: text(entry.row.region),
      country: text(entry.row.country),
      city: text(entry.row.city),
      type: "Bureau d'achat",
      wholesaleReady: entry.wholesaleReady,
      services: entry.services,
      activeOffers: entry.activeOffers,
      totalWeightKg: Number(entry.totalWeightKg.toFixed(3)),
      contactPhone: profile.can_view_supply_contacts ? text(entry.row.contactPhone) || text(Array.isArray(entry.row.phones) ? entry.row.phones[0] : null) : null,
      contactEmail: profile.can_view_supply_contacts ? text(entry.row.email) : null,
      mapLink: `/pro/map?type=bureau_achat&focus=${entry.id}`,
    }));
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load bureaux d'achat" });
  }
});

router.get("/pro/directory/exporters", ensureTenantUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const profile = await getProfile(req, res);
    if (!profile) return;
    if (!canDirectory(profile) || !profile.can_view_export_layer) {
      return res.status(403).json({ ok: false, message: "Debloquez l'acces Pro pour consulter les exportateurs verifies." });
    }
    const [bureaux, custom] = await Promise.all([bureauRows(tenant.id), customNodes(tenant.id)]);
    const fromBureaux = bureaux
      .filter((entry) => entry.services.includes("exporting"))
      .map((entry) => ({
        id: `${entry.id}-exporter`,
        companyName: text(entry.row.legalName) || entry.row.name,
        verified: Boolean(entry.row.isVerified),
        region: text(entry.row.region),
        country: text(entry.row.country),
        city: text(entry.row.city),
        type: "Exportateur verifie",
        wholesaleReady: entry.wholesaleReady,
        contactPhone: profile.can_view_supply_contacts ? text(entry.row.contactPhone) || text(Array.isArray(entry.row.phones) ? entry.row.phones[0] : null) : null,
        contactEmail: profile.can_view_supply_contacts ? text(entry.row.email) : null,
        mapLink: `/pro/map?type=exporter&focus=${entry.id}`,
      }));
    const fromCustom = custom
      .filter((row) => {
        const meta = row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {};
        const rowLayers = Array.isArray((meta as any).layers)
          ? (meta as any).layers.map((entry: unknown) => String(entry || "").trim())
          : [String(row.node_type || "").trim()];
        return rowLayers.includes("exporter") || String(row.node_type || "") === "export_hub";
      })
      .map((row) => ({
        id: String(row.id),
        companyName: text(row.company_name) || String(row.name),
        verified: String(row.verification_status || "unknown") === "verified",
        region: text(row.region),
        country: text(row.country),
        city: text(row.city),
        type: String(row.node_type || "exporter") === "export_hub" ? "Hub export" : "Exportateur verifie",
        wholesaleReady: true,
        contactPhone: profile.can_view_supply_contacts ? text(row.contact_phone) : null,
        contactEmail: profile.can_view_supply_contacts ? text(row.contact_email) : null,
        mapLink: `/pro/map?type=exporter&focus=${String(row.id)}`,
      }));
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, items: [...fromBureaux, ...fromCustom] });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load exporters" });
  }
});

export default router;
