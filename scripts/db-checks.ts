import "../env";
import { db } from "../db";
import { agents, companies, departments } from "../db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  const agentsWithoutCompany = await db
    .select({ count: sql<number>`count(*)` })
    .from(agents)
    .where(sql`${agents.companyId} is null`);

  const companyRows = await db
    .select({
      id: companies.id,
      name: companies.name,
      agentCount: sql<number>`count(distinct ${agents.id})`,
      departmentCount: sql<number>`count(distinct ${departments.id})`,
    })
    .from(companies)
    .leftJoin(agents, eq(agents.companyId, companies.id))
    .leftJoin(departments, eq(departments.companyId, companies.id))
    .groupBy(companies.id)
    .orderBy(companies.id);

  console.log("Company staffing snapshot:");
  console.log(`- agents with no companyId: ${Number(agentsWithoutCompany?.[0]?.count ?? 0)}`);
  for (const row of companyRows) {
    console.log(
      `- company ${row.id}: ${row.name} | agents=${Number(row.agentCount || 0)} | departments=${Number(
        row.departmentCount || 0,
      )}`,
    );
  }
}

main().catch((error) => {
  console.error("db-checks failed:", error);
  process.exitCode = 1;
});
