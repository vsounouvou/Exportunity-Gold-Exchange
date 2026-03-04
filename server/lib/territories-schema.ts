import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureTerritoryPolygonColumns() {
  await db.execute(sql`alter table geo_territories add column if not exists parent_territory_id int references geo_territories(id) on delete set null;`);
  await db.execute(sql`alter table geo_territories add column if not exists geometry_type text;`);
  await db.execute(sql`alter table geo_territories add column if not exists geometry_geojson jsonb;`);
  await db.execute(sql`alter table geo_territories add column if not exists bbox jsonb;`);
  await db.execute(sql`alter table geo_territories add column if not exists source text;`);
  await db.execute(sql`alter table geo_territories add column if not exists source_ref text;`);
  await db.execute(sql`alter table geo_territories add column if not exists source_version text;`);
  await db.execute(sql`alter table geo_territories add column if not exists confidence int;`);

  await db.execute(sql`create index if not exists geo_territories_parent_idx on geo_territories(parent_territory_id);`);
  await db.execute(sql`create index if not exists geo_territories_country_type_idx on geo_territories(tenant_id, country_code, territory_type);`);
}

