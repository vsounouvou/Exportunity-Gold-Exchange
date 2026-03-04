const { Client } = require("pg");

const seeds = [
  { name: "Abidjan - Plateau", tenant_id: 2, country_code: "CI", city: "Abidjan", territory_type: "neighborhood", center_lat: 5.3376, center_lng: -4.0244, radius_meters: 12000, currency: "XOF", language: "fr", status: "active", budget: 1500000 },
  { name: "Abidjan - Cocody", tenant_id: 2, country_code: "CI", city: "Abidjan", territory_type: "district", center_lat: 5.347, center_lng: -3.9869, radius_meters: 15000, currency: "XOF", language: "fr", status: "active", budget: 1000000 },
  { name: "Abidjan - Yopougon", tenant_id: 2, country_code: "CI", city: "Abidjan", territory_type: "district", center_lat: 5.327, center_lng: -4.0928, radius_meters: 17000, currency: "XOF", language: "fr", status: "active", budget: 800000 },
];

async function main() {
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error("DATABASE_URL missing");

  const now = new Date();
  const monthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const c = new Client({ connectionString: conn });
  await c.connect();

  // Ensure tables point to geo_territories (reset if needed)
  const resetSql = `
    DROP TABLE IF EXISTS territory_budgets, territory_kpis, referrer_profiles, territory_leaderboards, territory_operator_contracts CASCADE;
    CREATE TABLE IF NOT EXISTS territory_budgets (
      id serial PRIMARY KEY,
      territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE,
      month text NOT NULL,
      funded_amount integer NOT NULL DEFAULT 0,
      spent_amount integer NOT NULL DEFAULT 0,
      budget_cap integer NOT NULL DEFAULT 0,
      mode text NOT NULL DEFAULT 'low_power',
      created_at timestamp DEFAULT NOW(),
      updated_at timestamp DEFAULT NOW(),
      UNIQUE (territory_id, month)
    );
    CREATE TABLE IF NOT EXISTS territory_kpis (
      id serial PRIMARY KEY,
      territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE,
      month text NOT NULL,
      gmv integer NOT NULL DEFAULT 0,
      platform_fees integer NOT NULL DEFAULT 0,
      orders_count integer NOT NULL DEFAULT 0,
      active_buyers integer NOT NULL DEFAULT 0,
      active_sellers integer NOT NULL DEFAULT 0,
      avg_delivery_time integer,
      dispute_rate numeric(5,2),
      created_at timestamp DEFAULT NOW(),
      UNIQUE (territory_id, month)
    );
    CREATE TABLE IF NOT EXISTS referrer_profiles (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'active',
      last_checkin_at timestamp,
      created_at timestamp DEFAULT NOW(),
      updated_at timestamp DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS territory_leaderboards (
      id serial PRIMARY KEY,
      territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE,
      month text NOT NULL,
      winner_user_id integer,
      winning_metric_value integer DEFAULT 0,
      metric_type text NOT NULL DEFAULT 'platform_fees',
      computed_at timestamp,
      created_at timestamp DEFAULT NOW(),
      UNIQUE (territory_id, month)
    );
    CREATE TABLE IF NOT EXISTS territory_operator_contracts (
      id serial PRIMARY KEY,
      territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE,
      operator_user_id integer NOT NULL,
      month text NOT NULL,
      funded_amount integer NOT NULL DEFAULT 0,
      revenue_share_pct integer NOT NULL DEFAULT 0,
      disclaimer_accepted_at timestamp,
      status text NOT NULL DEFAULT 'active',
      created_at timestamp DEFAULT NOW(),
      updated_at timestamp DEFAULT NOW(),
      UNIQUE (territory_id, month)
    );
  `;
  await c.query(resetSql);

  for (const s of seeds) {
    const ins = await c.query(
      `INSERT INTO geo_territories (tenant_id,name,country_code,city,territory_type,center_lat,center_lng,radius_meters,currency,language,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       ON CONFLICT DO NOTHING RETURNING id;`,
      [s.tenant_id, s.name, s.country_code, s.city, s.territory_type, s.center_lat, s.center_lng, s.radius_meters, s.currency, s.language, s.status]
    );
    const tidRow =
      ins.rows[0] ||
      (await c.query("SELECT id FROM geo_territories WHERE name=$1 AND tenant_id=$2 LIMIT 1;", [s.name, s.tenant_id]))
        .rows[0];
    if (!tidRow?.id) {
      console.log("skip", s.name);
      continue;
    }
    const tid = tidRow.id;

    await c.query(
      `INSERT INTO territory_budgets (territory_id, month, funded_amount, spent_amount, budget_cap, mode, created_at, updated_at)
       VALUES ($1,$2,$3,0,$3,'funded',NOW(),NOW())
       ON CONFLICT (territory_id, month) DO UPDATE
       SET funded_amount=EXCLUDED.funded_amount, budget_cap=EXCLUDED.budget_cap, mode=EXCLUDED.mode, updated_at=NOW();`,
      [tid, monthStr, s.budget]
    );

    await c.query(
      `INSERT INTO territory_kpis (territory_id, month, gmv, platform_fees, orders_count, active_buyers, active_sellers, created_at)
       VALUES ($1,$2,0,0,0,0,0,NOW())
       ON CONFLICT (territory_id, month) DO NOTHING;`,
      [tid, monthStr]
    );

    console.log("seeded", s.name, "id", tid, "budget", s.budget);
  }

  await c.end();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
