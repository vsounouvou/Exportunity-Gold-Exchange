import { ensureExportunityIndustrialAgentOrganization } from "../server/lib/industrial/agentOrganization";

const dryRun = process.argv.includes("--dry-run");

ensureExportunityIndustrialAgentOrganization({ dryRun })
  .then((result) => {
    console.log(JSON.stringify({ ok: true, dryRun, ...result }, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("[seed-exportunity-industrial-agents] failed", error);
    process.exit(1);
  });
