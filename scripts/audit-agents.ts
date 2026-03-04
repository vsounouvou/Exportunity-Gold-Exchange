import { db } from "../db/index.js";
import { agents, actionRequests, actionResults } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

async function auditSystem() {
  console.log("=== EXPORTUNITY PLATFORM AUDIT ===\n");

  // 1. Find test agents
  console.log("1. Checking for test agents...");
  const testAgents = await db.select().from(agents).where(eq(agents.isTest, true));
  console.log(`Found ${testAgents.length} test agents:`);
  testAgents.forEach((a: any) => {
    console.log(`  - ID: ${a.id}, Name: ${a.name}, Status: ${a.status}, Visible: ${a.isVisible}`);
  });

  // 2. Find invisible agents
  console.log("\n2. Checking for invisible agents...");
  const invisibleAgents = await db.select().from(agents).where(eq(agents.isVisible, false));
  console.log(`Found ${invisibleAgents.length} invisible agents:`);
  invisibleAgents.forEach((a: any) => {
    console.log(`  - ID: ${a.id}, Name: ${a.name}, Status: ${a.status}, IsTest: ${a.isTest}`);
  });

  // 3. Check failed actions
  console.log("\n3. Checking failed actions...");
  const failedActions = await db
    .select()
    .from(actionRequests)
    .where(eq(actionRequests.status, "FAILED"))
    .orderBy(desc(actionRequests.createdAt))
    .limit(20);

  console.log(`Found ${failedActions.length} failed actions (showing last 20):`);
  for (const action of failedActions) {
    console.log(`\n  Action ID: ${action.id}`);
    console.log(`  Type: ${action.actionType}`);
    console.log(`  Created: ${action.createdAt}`);
    console.log(`  Agent: ${action.requestedByAgentKey || "N/A"}`);
    console.log(`  Payload: ${JSON.stringify(action.payload).substring(0, 200)}...`);

    // Get error details from actionResults
    const results = await db
      .select()
      .from(actionResults)
      .where(eq(actionResults.actionRequestId, action.id))
      .limit(1);

    if (results.length > 0 && results[0].error) {
      console.log(`  Error: ${JSON.stringify(results[0].error)}`);
    }
  }

  // 4. Check pending/queued actions
  console.log("\n4. Checking queued actions...");
  const queuedActions = await db
    .select()
    .from(actionRequests)
    .where(eq(actionRequests.status, "QUEUED"))
    .orderBy(desc(actionRequests.createdAt))
    .limit(10);

  console.log(`Found ${queuedActions.length} queued actions (showing last 10):`);
  queuedActions.forEach((a: any) => {
    console.log(`  - ID: ${a.id}, Type: ${a.actionType}, Created: ${a.createdAt}`);
  });

  // 5. Count all agents by status
  console.log("\n5. Agent summary:");
  const allAgents = await db.select().from(agents);
  const summary: Record<string, number> = {};
  allAgents.forEach((a: any) => {
    const key = `${a.status} (test=${a.isTest}, visible=${a.isVisible})`;
    summary[key] = (summary[key] || 0) + 1;
  });
  Object.entries(summary).forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

  process.exit(0);
}

auditSystem().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
