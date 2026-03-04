const { Client } = require("pg");

async function main() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    throw new Error("DATABASE_URL is not set");
  }

const client = new Client({ connectionString: conn });
await client.connect();

const queries = [
  `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ece_users' AND column_name = 'primary_territory_id'
      ) THEN
        ALTER TABLE ece_users ADD COLUMN primary_territory_id integer REFERENCES geo_territories(id) ON DELETE SET NULL;
      END IF;
    END $$;`,
  `CREATE TABLE IF NOT EXISTS geo_territories ( id serial PRIMARY KEY, tenant_id integer NOT NULL, name text NOT NULL, country_code text NOT NULL, city text, territory_type text NOT NULL DEFAULT 'neighborhood', center_lat numeric(10,7) NOT NULL, center_lng numeric(10,7) NOT NULL, radius_meters integer NOT NULL, currency text DEFAULT 'XOF', language text DEFAULT 'fr', status text NOT NULL DEFAULT 'inactive', created_at timestamp DEFAULT NOW(), updated_at timestamp DEFAULT NOW() );`,
  `CREATE TABLE IF NOT EXISTS territory_budgets ( id serial PRIMARY KEY, territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE, month text NOT NULL, funded_amount integer NOT NULL DEFAULT 0, spent_amount integer NOT NULL DEFAULT 0, budget_cap integer NOT NULL DEFAULT 0, mode text NOT NULL DEFAULT 'low_power', created_at timestamp DEFAULT NOW(), updated_at timestamp DEFAULT NOW(), UNIQUE (territory_id, month) );`,
  `CREATE TABLE IF NOT EXISTS territory_kpis ( id serial PRIMARY KEY, territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE, month text NOT NULL, gmv integer NOT NULL DEFAULT 0, platform_fees integer NOT NULL DEFAULT 0, orders_count integer NOT NULL DEFAULT 0, active_buyers integer NOT NULL DEFAULT 0, active_sellers integer NOT NULL DEFAULT 0, avg_delivery_time integer, dispute_rate numeric(5,2), created_at timestamp DEFAULT NOW(), UNIQUE (territory_id, month) );`,
  `CREATE TABLE IF NOT EXISTS referrer_profiles ( id serial PRIMARY KEY, user_id integer NOT NULL, territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'active', last_checkin_at timestamp, created_at timestamp DEFAULT NOW(), updated_at timestamp DEFAULT NOW() );`,
  `CREATE TABLE IF NOT EXISTS territory_leaderboards ( id serial PRIMARY KEY, territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE, month text NOT NULL, winner_user_id integer, winning_metric_value integer DEFAULT 0, metric_type text NOT NULL DEFAULT 'platform_fees', computed_at timestamp, created_at timestamp DEFAULT NOW(), UNIQUE (territory_id, month) );`,
  `CREATE TABLE IF NOT EXISTS territory_operator_contracts ( id serial PRIMARY KEY, territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE, operator_user_id integer NOT NULL, month text NOT NULL, funded_amount integer NOT NULL DEFAULT 0, revenue_share_pct integer NOT NULL DEFAULT 0, disclaimer_accepted_at timestamp, status text NOT NULL DEFAULT 'active', created_at timestamp DEFAULT NOW(), updated_at timestamp DEFAULT NOW(), UNIQUE (territory_id, month) );`,
];

for (const q of queries) {
  console.log("running:", q.split("\n")[0]);
  await client.query(q);
  }

  await client.end();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
