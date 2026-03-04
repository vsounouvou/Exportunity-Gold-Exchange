import "../env";
import { seedDemoData, resetDemoData } from "./lib/seed-demo-data";
import { seedMetTenantData } from "./lib/met/seed";

async function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has("--reset")) {
    await resetDemoData();
  }

  const { credentials, offers } = await seedDemoData();
  const met = await seedMetTenantData();

  console.log("");
  console.log("Demo data ready");
  console.log(`- Admin: ${credentials.admin.email} (password set, not printed)`);
  console.log(`- Users: ${credentials.users.length}`);
  console.log(`- Gold offers seeded: ${offers.offersCreated} (across ${offers.bureaus} bureaus)`);
  console.log(`- Maison en Terre tenant seeded: ${met.tenantKey} (tenantId=${met.tenantId})`);
  console.log("");
  console.log("Tip: set SEED_GPS_POINTS_FILE=path/to/points.csv (or run with --gps path) to seed sellers from your own GPS list.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});


