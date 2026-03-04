import "dotenv/config";
import { runToolMatrixReport } from "../server/lib/agent-os/toolMatrix";

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  const result = await runToolMatrixReport({ limit });
  console.log(JSON.stringify({ ok: true, reportPath: result.reportPath, summary: result.payload }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
