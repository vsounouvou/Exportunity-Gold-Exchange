import { db } from "@db";
import { agents } from "../db/schema";
import { sql } from "drizzle-orm";

async function seedAgents() {
  console.log("🤖 Seeding agents for simulation companies...\n");

  try {
    // Get company IDs
    const companies = await db.query.companies.findMany();
    const goldExport = companies.find(c => c.name === "GoldExport International");
    const eduTech = companies.find(c => c.name === "EduTech Academy");
    const buildRight = companies.find(c => c.name === "BuildRight Construction");

    if (!goldExport || !eduTech || !buildRight) {
      console.error("❌ Companies not found. Run seed-simulation-data first.");
      return;
    }

    // Create GoldExport International agents
    console.log(`Creating agents for ${goldExport.name}...`);
    const goldExportAgents = await db.insert(agents).values([
      {
        name: "Sarah Al-Mansour",
        role: "CEO",
        status: "active",
        companyId: goldExport.id,
        managerId: null,
        tokenBudget: 50000,
        capabilities: ["strategic-planning", "business-development", "market-analysis"],
        metadata: {
          personal: {
            background: "Former McKinsey consultant, 15 years in commodities trading",
            expertise: ["Gold markets", "International trade", "Strategic growth"]
          },
          professional: {
            experience: "Led $500M gold trading operations across Middle East",
            achievements: ["Tripled company revenue in 3 years", "Expanded to 12 new markets"]
          },
          personality: {
            traits: ["Strategic", "Results-driven", "Decisive"],
            communicationStyle: "Direct and efficient"
          }
        }
      },
      {
        name: "Marcus Chen",
        role: "Trading Director",
        status: "active",
        companyId: goldExport.id,
        managerId: null, // Will update after CEO is created
        tokenBudget: 30000,
        capabilities: ["market-analysis", "risk-management", "trading-strategy"],
        metadata: {
          personal: {
            background: "Former Goldman Sachs commodities trader",
            expertise: ["Precious metals", "Market timing", "Risk hedging"]
          },
          professional: {
            experience: "$2B+ in successful gold trades",
            achievements: ["95% trade success rate", "Developed proprietary pricing models"]
          },
          personality: {
            traits: ["Analytical", "Quick-thinking", "Data-driven"],
            communicationStyle: "Precise with numbers and facts"
          }
        }
      },
      {
        name: "Fatima Hassan",
        role: "Compliance Manager",
        status: "active",
        companyId: goldExport.id,
        managerId: null,
        tokenBudget: 20000,
        capabilities: ["regulatory-compliance", "risk-assessment", "legal-review"],
        metadata: {
          personal: {
            background: "15 years in international trade law",
            expertise: ["Export regulations", "Anti-money laundering", "Trade compliance"]
          },
          professional: {
            experience: "Managed compliance for $10B+ trading operations",
            achievements: ["Zero regulatory violations in 8 years", "ISO 9001 certification lead"]
          },
          personality: {
            traits: ["Detail-oriented", "Principled", "Thorough"],
            communicationStyle: "Clear and policy-focused"
          }
        }
      },
      {
        name: "James Rodriguez",
        role: "Operations Lead",
        status: "active",
        companyId: goldExport.id,
        managerId: null,
        tokenBudget: 25000,
        capabilities: ["logistics", "supply-chain", "process-optimization"],
        metadata: {
          personal: {
            background: "Former Amazon operations manager",
            expertise: ["Supply chain", "Logistics", "Process automation"]
          },
          professional: {
            experience: "Managed 500+ shipments monthly across 30 countries",
            achievements: ["Reduced delivery time by 40%", "Cut logistics costs by $2M annually"]
          },
          personality: {
            traits: ["Efficient", "Problem-solver", "Systems-thinker"],
            communicationStyle: "Solution-oriented and practical"
          }
        }
      }
    ]).returning();

    // Update manager IDs for GoldExport
    const ceo = goldExportAgents.find(a => a.role === "CEO");
    if (ceo) {
      await db.update(agents)
        .set({ managerId: ceo.id })
        .where(sql`company_id = ${goldExport.id} AND role != 'CEO'`);
    }

    console.log(`✅ Created ${goldExportAgents.length} agents for GoldExport\n`);

    // Create EduTech Academy agents
    console.log(`Creating agents for ${eduTech.name}...`);
    const eduTechAgents = await db.insert(agents).values([
      {
        name: "Dr. Sarah Chen",
        role: "CEO",
        status: "active",
        companyId: eduTech.id,
        managerId: null,
        tokenBudget: 60000,
        capabilities: ["education-strategy", "product-vision", "stakeholder-management"],
        metadata: {
          personal: {
            background: "Former Stanford professor, EdTech pioneer",
            expertise: ["Online learning", "AI in education", "Curriculum design"]
          },
          professional: {
            experience: "Founded 2 EdTech startups, published 50+ papers",
            achievements: ["Raised $30M Series A", "Built platform to 500K users"]
          },
          personality: {
            traits: ["Visionary", "Empathetic", "Innovation-focused"],
            communicationStyle: "Inspiring and inclusive"
          }
        }
      },
      {
        name: "Alex Kumar",
        role: "Product Lead",
        status: "active",
        companyId: eduTech.id,
        managerId: null,
        tokenBudget: 40000,
        capabilities: ["product-development", "user-research", "feature-prioritization"],
        metadata: {
          personal: {
            background: "Former Google PM, 10 years in product",
            expertise: ["User experience", "A/B testing", "Product strategy"]
          },
          professional: {
            experience: "Launched products used by 10M+ users",
            achievements: ["Increased retention by 60%", "Led AI tutor development"]
          },
          personality: {
            traits: ["User-centric", "Data-driven", "Creative"],
            communicationStyle: "Clear with data backing"
          }
        }
      },
      {
        name: "Maria Santos",
        role: "Marketing Director",
        status: "active",
        companyId: eduTech.id,
        managerId: null,
        tokenBudget: 35000,
        capabilities: ["growth-marketing", "brand-strategy", "content-marketing"],
        metadata: {
          personal: {
            background: "15 years in SaaS marketing",
            expertise: ["Growth hacking", "Content strategy", "Community building"]
          },
          professional: {
            experience: "Scaled 3 SaaS companies from 0 to $10M ARR",
            achievements: ["Built 100K follower community", "400% user growth in 2 years"]
          },
          personality: {
            traits: ["Creative", "Metrics-focused", "Energetic"],
            communicationStyle: "Engaging and story-driven"
          }
        }
      },
      {
        name: "David Park",
        role: "Engineering Manager",
        status: "active",
        companyId: eduTech.id,
        managerId: null,
        tokenBudget: 45000,
        capabilities: ["technical-architecture", "team-management", "ai-development"],
        metadata: {
          personal: {
            background: "MIT grad, former Meta engineer",
            expertise: ["AI/ML", "Platform architecture", "Team leadership"]
          },
          professional: {
            experience: "Built systems handling 1B+ requests/day",
            achievements: ["Led AI tutor development", "99.99% uptime for 2 years"]
          },
          personality: {
            traits: ["Technical", "Methodical", "Collaborative"],
            communicationStyle: "Technical but accessible"
          }
        }
      }
    ]).returning();

    // Update manager IDs for EduTech
    const eduCeo = eduTechAgents.find(a => a.role === "CEO");
    if (eduCeo) {
      await db.update(agents)
        .set({ managerId: eduCeo.id })
        .where(sql`company_id = ${eduTech.id} AND role != 'CEO'`);
    }

    console.log(`✅ Created ${eduTechAgents.length} agents for EduTech\n`);

    // Create BuildRight Construction agents
    console.log(`Creating agents for ${buildRight.name}...`);
    const buildRightAgents = await db.insert(agents).values([
      {
        name: "James Morrison",
        role: "CEO",
        status: "active",
        companyId: buildRight.id,
        managerId: null,
        tokenBudget: 40000,
        capabilities: ["construction-management", "business-operations", "client-relations"],
        metadata: {
          personal: {
            background: "25+ years in construction industry",
            expertise: ["Commercial construction", "Sustainable building", "Project management"]
          },
          professional: {
            experience: "Delivered 200+ projects worth $500M+",
            achievements: ["LEED certification expert", "Zero safety incidents in 5 years"]
          },
          personality: {
            traits: ["Experienced", "Safety-focused", "Reliable"],
            communicationStyle: "Direct and practical"
          }
        }
      },
      {
        name: "Emily Zhang",
        role: "Project Manager",
        status: "active",
        companyId: buildRight.id,
        managerId: null,
        tokenBudget: 30000,
        capabilities: ["project-management", "scheduling", "budget-control"],
        metadata: {
          personal: {
            background: "15 years managing large construction projects",
            expertise: ["Timeline management", "Resource allocation", "Stakeholder coordination"]
          },
          professional: {
            experience: "Managed 50+ projects, $300M+ total value",
            achievements: ["95% on-time delivery rate", "Average 8% under budget"]
          },
          personality: {
            traits: ["Organized", "Proactive", "Detail-oriented"],
            communicationStyle: "Structured and clear"
          }
        }
      },
      {
        name: "Robert Williams",
        role: "Safety Specialist",
        status: "active",
        companyId: buildRight.id,
        managerId: null,
        tokenBudget: 25000,
        capabilities: ["safety-compliance", "risk-assessment", "training"],
        metadata: {
          personal: {
            background: "Former OSHA inspector, 20 years in construction safety",
            expertise: ["OSHA compliance", "Risk mitigation", "Safety training"]
          },
          professional: {
            experience: "Implemented safety programs for 100+ construction sites",
            achievements: ["Zero fatalities in 10 years", "Industry safety award recipient"]
          },
          personality: {
            traits: ["Vigilant", "Principled", "Training-focused"],
            communicationStyle: "Clear and safety-first"
          }
        }
      }
    ]).returning();

    // Update manager IDs for BuildRight
    const buildCeo = buildRightAgents.find(a => a.role === "CEO");
    if (buildCeo) {
      await db.update(agents)
        .set({ managerId: buildCeo.id })
        .where(sql`company_id = ${buildRight.id} AND role != 'CEO'`);
    }

    console.log(`✅ Created ${buildRightAgents.length} agents for BuildRight\n`);

    console.log("\n🎉 Agent seeding completed successfully!");
    console.log("\nSummary:");
    console.log(`- GoldExport International: ${goldExportAgents.length} agents`);
    console.log(`- EduTech Academy: ${eduTechAgents.length} agents`);
    console.log(`- BuildRight Construction: ${buildRightAgents.length} agents`);
    console.log(`- Total: ${goldExportAgents.length + eduTechAgents.length + buildRightAgents.length} agents created`);

  } catch (error) {
    console.error("❌ Error seeding agents:", error);
    throw error;
  }
}

seedAgents()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
