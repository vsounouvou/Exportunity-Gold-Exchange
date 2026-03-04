import { execSync } from "child_process";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

try {
  run("npm run qa:inventory");
} catch (error) {
  console.error("[e2e] Failed to generate inventories.");
  process.exit(1);
}

for (let i = 1; i <= 3; i += 1) {
  console.log(`[e2e] Pass ${i}/3`);
  try {
    run("npm run test:e2e");
  } catch (error) {
    console.error(`[e2e] Pass ${i} failed.`);
    process.exit(1);
  }
}

console.log("[e2e] All 3 passes succeeded.");
