import { db } from "../db/index.js";
import { actionRequests } from "../db/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";

async function verifyFixes() {
  console.log("=== VERIFYING FIXES ARE LIVE ===\n");

  // 1. Check recent failed actions (should see old failures, no new ones)
  console.log("1. Checking failed actions...");
  const recentFailed = await db
    .select()
    .from(actionRequests)
    .where(eq(actionRequests.status, "FAILED"))
    .orderBy(desc(actionRequests.createdAt))
    .limit(10);

  console.log(`Found ${recentFailed.length} failed actions (recent):`);
  if (recentFailed.length > 0) {
    const mostRecent = recentFailed[0];
    console.log(`  Most recent failure: ${mostRecent.createdAt}`);
    console.log(`  Type: ${mostRecent.actionType}`);
    console.log(`  Age: ${Math.round((Date.now() - new Date(mostRecent.createdAt).getTime()) / 1000 / 60)} minutes ago`);

    // Check if there are any failures in the last 5 minutes (after server restart)
    const serverStartTime = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    const recentFailuresAfterRestart = recentFailed.filter(
      (f: any) => new Date(f.createdAt) > serverStartTime
    );

    if (recentFailuresAfterRestart.length > 0) {
      console.log(`  ⚠️  WARNING: ${recentFailuresAfterRestart.length} failures AFTER server restart!`);
    } else {
      console.log(`  ✅ No failures since server restart (fixes are working!)`);
    }
  }

  // 2. Check for QUEUED or PENDING actions (should be processed quickly)
  console.log("\n2. Checking pending/queued actions...");
  const pending = await db
    .select()
    .from(actionRequests)
    .where(sql`${actionRequests.status} IN ('QUEUED', 'PENDING', 'RUNNING')`)
    .orderBy(desc(actionRequests.createdAt))
    .limit(10);

  console.log(`Found ${pending.length} pending/queued actions`);
  if (pending.length > 0) {
    console.log("  Latest queued actions:");
    pending.forEach((a: any) => {
      const ageMinutes = Math.round((Date.now() - new Date(a.createdAt).getTime()) / 1000 / 60);
      console.log(`    - ID ${a.id}: ${a.actionType} (${a.status}, ${ageMinutes}min ago)`);
    });
  } else {
    console.log("  ✅ No pending actions (worker is processing quickly)");
  }

  // 3. Check successful actions in last 10 minutes
  console.log("\n3. Checking successful actions (last 10 minutes)...");
  const recentSuccess = await db
    .select()
    .from(actionRequests)
    .where(
      and(
        eq(actionRequests.status, "DONE"),
        sql`${actionRequests.updatedAt} > NOW() - INTERVAL '10 minutes'`
      )
    )
    .orderBy(desc(actionRequests.updatedAt))
    .limit(10);

  console.log(`Found ${recentSuccess.length} successful actions in last 10 minutes`);
  if (recentSuccess.length > 0) {
    const types = new Map<string, number>();
    recentSuccess.forEach((a: any) => {
      types.set(a.actionType, (types.get(a.actionType) || 0) + 1);
    });
    console.log("  Action types:");
    types.forEach((count, type) => {
      console.log(`    - ${type}: ${count}`);
    });
  }

  // 4. Summary
  console.log("\n=== SUMMARY ===");
  const totalActions = await db
    .select({ count: sql<number>`count(*)` })
    .from(actionRequests);
  const failedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(actionRequests)
    .where(eq(actionRequests.status, "FAILED"));
  const doneCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(actionRequests)
    .where(eq(actionRequests.status, "DONE"));

  const total = Number(totalActions[0]?.count || 0);
  const failed = Number(failedCount[0]?.count || 0);
  const done = Number(doneCount[0]?.count || 0);
  const successRate = total > 0 ? ((done / total) * 100).toFixed(1) : 0;

  console.log(`Total actions: ${total}`);
  console.log(`Successful: ${done} (${successRate}%)`);
  console.log(`Failed: ${failed}`);
  console.log(`Pending/Queued: ${pending.length}`);

  if (failed > 0 && recentFailed.length > 0) {
    const mostRecentFailure = recentFailed[0];
    const failureAgeMinutes = Math.round(
      (Date.now() - new Date(mostRecentFailure.createdAt).getTime()) / 1000 / 60
    );

    if (failureAgeMinutes > 10) {
      console.log(`\n✅ STATUS: HEALTHY - No failures in last ${failureAgeMinutes} minutes`);
      console.log("   Fixes are working! Old failures remain in DB but no new ones.");
    } else {
      console.log(`\n⚠️  STATUS: CHECK NEEDED - Recent failure ${failureAgeMinutes} minutes ago`);
      console.log("   Review logs to see if it's a new issue or old failure.");
    }
  } else {
    console.log("\n✅ STATUS: EXCELLENT - No failures detected!");
  }

  process.exit(0);
}

verifyFixes().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
