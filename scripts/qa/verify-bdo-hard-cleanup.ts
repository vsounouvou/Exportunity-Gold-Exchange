import "../../env";
import pg from "pg";

const { Client } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tenantRow = await client.query("select id from tenants where key='bdo' limit 1");
    const tenantId = tenantRow.rows[0]?.id;
    if (!tenantId) {
      console.log("[verify] tenant key=bdo not found");
      return;
    }

    const jewellers = await client.query(
      "select name, is_active from partner_jewellers where tenant_id=$1 order by name asc",
      [tenantId],
    );
    const meetingsCount = await client.query("select count(*)::int as n from meetings where tenant_id=$1", [tenantId]);
    const meetSessionsCount = await client.query("select count(*)::int as n from meet_sessions where tenant_id=$1", [
      tenantId,
    ]);

    console.log("[verify] partner_jewellers:", jewellers.rows);
    console.log("[verify] meetings_count:", meetingsCount.rows[0]?.n ?? null);
    console.log("[verify] meet_sessions_count:", meetSessionsCount.rows[0]?.n ?? null);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[verify] failed:", err?.message || err);
  process.exit(1);
});

