import "../../env";
import fs from "fs";
import path from "path";
import pg from "pg";

const { Client } = pg;

function readSql(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

async function main() {
  const confirmed = String(process.env.CONFIRM_GOLD_CUTOVER_SQL || "").trim() === "1";
  if (!confirmed) {
    throw new Error("Refusing to run. Set CONFIRM_GOLD_CUTOVER_SQL=1.");
  }

  const applyCleanup = String(process.env.APPLY_BDO_PARTNER_CLEANUP || "").trim() === "1";
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const sqlFiles = [
    path.resolve(process.cwd(), "db", "migrations", "20260312_gold_chairman_cutover_patch.sql"),
  ];
  if (applyCleanup) {
    sqlFiles.push(path.resolve(process.cwd(), "scripts", "sql", "bdo_partner_jewellers_cleanup.sql"));
  }

  const client = new Client({ connectionString: databaseUrl });
  const startedAt = Date.now();
  await client.connect();
  try {
    for (const filePath of sqlFiles) {
      const sqlText = readSql(filePath);
      await client.query(sqlText);
      console.log(`[gold-cutover] applied ${path.relative(process.cwd(), filePath)}`);
    }
  } finally {
    await client.end();
  }

  console.log(`[gold-cutover] done in ${Date.now() - startedAt}ms`);
}

main().catch((error) => {
  console.error(`[gold-cutover] failed: ${error?.message || error}`);
  process.exit(1);
});
