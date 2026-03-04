import { runBourseLandingBatch } from "../lib/imageGen/generateBourseLanding";

async function main() {
  const results = await runBourseLandingBatch();
  console.log("=== Bourse Landing Image Batch ===");
  console.table(
    results.map((r) => ({
      assetKey: r.assetKey,
      status: r.status,
      storedUrl: r.storedUrl ?? "n/a",
      error: r.error ?? "",
    }))
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
