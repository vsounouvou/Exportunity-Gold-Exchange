import "../env";
import { db } from "../db";
import { agents, agentEmailIdentities, agentMailboxes, tenants } from "../db/schema";
import { eq, and } from "drizzle-orm";

function generateProfessionalEmail(name: string, domain: string): string {
  const parts = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return `agent${Date.now()}@${domain}`;
  if (parts.length === 1) return `${parts[0]}@${domain}`;

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return `${firstName}.${lastName}@${domain}`;
}

function generateAgentKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

async function main() {
  console.log("[fix-agent-email-identities] Starting migration...");

  const allAgents = await db.query.agents.findMany({
    where: eq(agents.isTest, false),
  });

  console.log(`[INFO] Found ${allAgents.length} non-test agents`);

  for (const agent of allAgents) {
    if (!agent.companyId) {
      console.log(`[SKIP] Agent ${agent.id} (${agent.name}) - no companyId`);
      continue;
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, agent.companyId),
    });

    if (!tenant) {
      console.log(`[SKIP] Agent ${agent.id} (${agent.name}) - tenant not found for companyId=${agent.companyId}`);
      continue;
    }

    const domain = tenant.key === "bdo" ? "boursedelor.com" : "exportunity.net";
    const professionalEmail = generateProfessionalEmail(agent.name, domain);
    const agentKey = generateAgentKey(agent.name);

    console.log(`[FIX] Agent ${agent.id} (${agent.name}) → ${professionalEmail} (agentKey: ${agentKey})`);

    // Check if identity already exists
    const existing = await db.query.agentEmailIdentities.findFirst({
      where: and(
        eq(agentEmailIdentities.tenantId, tenant.id),
        eq(agentEmailIdentities.agentId, agent.id)
      ),
    });

    if (existing) {
      // Update existing
      await db
        .update(agentEmailIdentities)
        .set({
          fromEmail: professionalEmail,
          replyToEmail: professionalEmail,
          displayName: agent.name,
          agentKey,
          metadata: {
            ...((existing.metadata as any) || {}),
            role: agent.role,
            companyName: tenant.name,
            website: `https://${domain}`,
            updatedBy: "fix-agent-email-identities",
            updatedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(agentEmailIdentities.id, existing.id));

      console.log(`  ✅ Updated identity ${existing.id}`);
    } else {
      // Create new
      const [created] = await db
        .insert(agentEmailIdentities)
        .values({
          tenantId: tenant.id,
          agentId: agent.id,
          agentKey,
          fromEmail: professionalEmail,
          replyToEmail: professionalEmail,
          displayName: agent.name,
          isEnabled: true,
          metadata: {
            role: agent.role,
            companyName: tenant.name,
            website: `https://${domain}`,
            createdBy: "fix-agent-email-identities",
            createdAt: new Date().toISOString(),
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      console.log(`  ✅ Created identity ${created?.id}`);
    }
  }

  console.log("\n[DONE] Agent email identities migration complete");
}

main().catch((err) => {
  console.error("[fix-agent-email-identities] FAILED:", err);
  process.exit(1);
});
