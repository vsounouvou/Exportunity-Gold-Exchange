import "../../env";
import fs from "fs";
import path from "path";
import pg from "pg";

const { Client } = pg;

function mustGetEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

async function main() {
  const confirmed = String(process.env.CONFIRM_BDO_HARD_CLEANUP || "").trim() === "1";
  if (!confirmed) {
    throw new Error(
      "Refusing to run. Set CONFIRM_BDO_HARD_CLEANUP=1 to apply db/migrations/20260218_bdo_hard_cleanup.sql to DATABASE_URL.",
    );
  }

  const databaseUrl = mustGetEnv("DATABASE_URL");
  const sqlPath = path.resolve(process.cwd(), "db", "migrations", "20260218_bdo_hard_cleanup.sql");
  const sqlText = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: databaseUrl });
  const startedAt = Date.now();
  await client.connect();
  try {
    await client.query(sqlText);
  } finally {
    await client.end();
  }

  const elapsedMs = Date.now() - startedAt;
  // Intentionally do not print DATABASE_URL.
  console.log(`[bdo-hard-cleanup] applied ${path.basename(sqlPath)} in ${elapsedMs}ms`);
}

main().catch((err) => {
  console.error(`[bdo-hard-cleanup] failed: ${err?.message || err}`);
  process.exit(1);
});

