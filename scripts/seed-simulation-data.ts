import { db } from "../db";
import { 
  companies, 
  companyShareholders, 
  companyKpis, 
  revenueTransactions,
  agents
} from "../db/schema";

async function seedSimulationData() {
  console.log("🌱 Starting simulation data seeding...\n");

  try {
    // 1. Create GoldExport International (Primary Trading Company)
    console.log("Creating GoldExport International...");
    const [goldExport] = await db.insert(companies).values({
      name: "GoldExport International",
      description: "Leading gold and precious metals trading company specializing in export operations across Middle East and Asia.",
      country: "UAE",
      legalType: "LLC",
      registrationNumber: "GEI-2024-001",
      registrationDate: new Date("2024-01-15"),
      primarySector: "gold_metals",
      secondarySector: "trade_export",
      industryTags: ["gold-trading", "export", "precious-metals", "commodities"],
      vision: "Become the most trusted gold trading platform connecting Middle East suppliers with Asian markets",
      currentGoals: [
        "Achieve $50M quarterly revenue by Q2 2025",
        "Expand supplier network to 50+ verified gold mines",
        "Launch AI-powered market prediction system",
        "Obtain ISO 9001 certification"
      ],
      kpiTargets: {
        "quarterly_revenue": 50000000,
        "customer_satisfaction": 95,
        "delivery_time": 72
      },
      dailyCashBurnTarget: 15000,
      tokenUsageLimit: 500000,
      autonomyLevel: "high",
      riskAppetite: "medium",
      creativity: "balanced",
      strictness: "strict",
      themeColor: "#D4AF37"
    }).returning();

    // Add GoldExport shareholders
    await db.insert(companyShareholders).values([
      {
        companyId: goldExport.id,
        shareholderName: "Al-Mansour Investment Group",
        shareholderType: "institutional",
        sharePercentage: 45,
        role: "Lead Investor",
        distributionMode: "wallet",
        metadata: {
          investmentAmount: "4500000",
          notes: "Primary institutional investor with board seat"
        }
      },
      {
        companyId: goldExport.id,
        shareholderName: "Sheikh Abdullah bin Rashid",
        shareholderType: "individual",
        sharePercentage: 30,
        role: "Founder & Chairman",
        distributionMode: "traditional",
        metadata: {
          investmentAmount: "3000000",
          notes: "Founding member with extensive gold trading experience"
        }
      },
      {
        companyId: goldExport.id,
        shareholderName: "Asia Trade Partners DAO",
        shareholderType: "dao",
        sharePercentage: 25,
        role: "Strategic Partner",
        distributionMode: "wallet",
        metadata: {
          investmentAmount: "2500000",
          notes: "Blockchain-based investor collective focusing on Asia-Pacific trade"
        }
      }
    ]);

    // Add GoldExport KPIs
    await db.insert(companyKpis).values([
      {
        companyId: goldExport.id,
        kpiName: "Q4 2024 Revenue",
        kpiValue: 38500000,
        period: "Q4 2024",
        target: 45000000,
        category: "financial"
      },
      {
        companyId: goldExport.id,
        kpiName: "Active Supplier Network",
        kpiValue: 42,
        period: "November 2025",
        target: 50,
        category: "operational"
      },
      {
        companyId: goldExport.id,
        kpiName: "Customer Satisfaction Score",
        kpiValue: 92,
        period: "November 2025",
        target: 95,
        category: "customer"
      },
      {
        companyId: goldExport.id,
        kpiName: "Average Delivery Time (hours)",
        kpiValue: 68,
        period: "November 2025",
        target: 72,
        category: "operational"
      },
      {
        companyId: goldExport.id,
        kpiName: "AI Model Accuracy",
        kpiValue: 87,
        period: "November 2025",
        target: 90,
        category: "technology"
      }
    ]);

    // Add GoldExport transactions
    await db.insert(revenueTransactions).values([
      {
        companyId: goldExport.id,
        amount: "12500000",
        type: "sale",
        direction: "credit",
        source: "Asia Pacific Markets",
        description: "Gold shipment to Singapore - 250kg at $50k/kg",
        createdAt: new Date("2024-11-01")
      },
      {
        companyId: goldExport.id,
        amount: "8750000",
        type: "sale",
        direction: "credit",
        source: "India Traders Alliance",
        description: "Gold bars export - 175kg premium grade",
        createdAt: new Date("2024-11-05")
      },
      {
        companyId: goldExport.id,
        amount: "15200000",
        type: "sale",
        direction: "credit",
        source: "Dubai Gold Souk Network",
        description: "Bulk precious metals sale - 304kg mixed",
        createdAt: new Date("2024-11-10")
      },
      {
        companyId: goldExport.id,
        amount: "250000",
        type: "refund",
        direction: "debit",
        source: "Malaysia Jewelers Co",
        description: "Quality dispute refund - 5kg rejected shipment",
        createdAt: new Date("2024-11-12")
      },
      {
        companyId: goldExport.id,
        amount: "6800000",
        type: "subscription",
        direction: "credit",
        source: "Premium Trading Platform",
        description: "Q4 2024 platform subscription revenue",
        createdAt: new Date("2024-11-15")
      },
      {
        companyId: goldExport.id,
        amount: "425000",
        type: "commission",
        direction: "credit",
        source: "Third-party broker fees",
        description: "Brokerage commissions from facilitated trades",
        createdAt: new Date("2024-11-17")
      }
    ]);

    console.log(`✅ GoldExport International created with ${goldExport.id}\n`);

    // 2. Create EduTech Academy (Education Platform)
    console.log("Creating EduTech Academy...");
    const [eduTech] = await db.insert(companies).values({
      name: "EduTech Academy",
      description: "AI-powered online education platform offering courses in technology, business, and creative skills.",
      country: "USA",
      legalType: "C-Corp",
      registrationNumber: "ETA-2023-789",
      registrationDate: new Date("2023-06-01"),
      primarySector: "education",
      secondarySector: "technology",
      industryTags: ["edtech", "online-learning", "ai-education", "saas"],
      vision: "Democratize access to world-class education through AI-driven personalized learning experiences",
      currentGoals: [
        "Reach 1 million active learners by 2026",
        "Launch AI tutor for 20+ subjects",
        "Achieve 85% course completion rate",
        "Expand to 15 new languages"
      ],
      kpiTargets: {
        "monthly_active_users": 500000,
        "course_completion_rate": 85,
        "nps_score": 70
      },
      dailyCashBurnTarget: 8000,
      tokenUsageLimit: 750000,
      autonomyLevel: "medium",
      riskAppetite: "high",
      creativity: "innovative",
      strictness: "flexible",
      themeColor: "#4F46E5"
    }).returning();

    // Add EduTech shareholders
    await db.insert(companyShareholders).values([
      {
        companyId: eduTech.id,
        shareholderName: "Sequoia Ventures",
        shareholderType: "institutional",
        sharePercentage: 40,
        role: "Series A Lead",
        distributionMode: "traditional",
        metadata: {
          investmentAmount: "12000000",
          notes: "Lead Series A investor with board representation"
        }
      },
      {
        companyId: eduTech.id,
        shareholderName: "Sarah Chen",
        shareholderType: "individual",
        sharePercentage: 35,
        role: "Founder & CEO",
        distributionMode: "traditional",
        metadata: {
          investmentAmount: "500000",
          notes: "Former Stanford professor, EdTech pioneer"
        }
      },
      {
        companyId: eduTech.id,
        shareholderName: "Learning Impact Fund",
        shareholderType: "institutional",
        sharePercentage: 15,
        role: "Impact Investor",
        distributionMode: "traditional",
        metadata: {
          investmentAmount: "4500000",
          notes: "Focus on social impact and education accessibility"
        }
      },
      {
        companyId: eduTech.id,
        shareholderName: "Employee Stock Pool",
        shareholderType: "employee_pool",
        sharePercentage: 10,
        role: "Employee Equity",
        distributionMode: "traditional",
        metadata: {
          notes: "Reserved for employee stock options and grants"
        }
      }
    ]);

    // Add EduTech KPIs
    await db.insert(companyKpis).values([
      {
        companyId: eduTech.id,
        kpiName: "Monthly Active Users",
        kpiValue: 285000,
        period: "November 2025",
        target: 500000,
        category: "growth"
      },
      {
        companyId: eduTech.id,
        kpiName: "Course Completion Rate",
        kpiValue: 78,
        period: "November 2025",
        target: 85,
        category: "engagement"
      },
      {
        companyId: eduTech.id,
        kpiName: "Net Promoter Score",
        kpiValue: 65,
        period: "November 2025",
        target: 70,
        category: "customer"
      },
      {
        companyId: eduTech.id,
        kpiName: "Monthly Recurring Revenue",
        kpiValue: 1850000,
        period: "November 2025",
        target: 2500000,
        category: "financial"
      }
    ]);

    // Add EduTech transactions
    await db.insert(revenueTransactions).values([
      {
        companyId: eduTech.id,
        amount: "1850000",
        type: "subscription",
        direction: "credit",
        source: "Platform Subscriptions",
        description: "November 2025 subscription revenue",
        createdAt: new Date("2024-11-01")
      },
      {
        companyId: eduTech.id,
        amount: "425000",
        type: "sale",
        direction: "credit",
        source: "Corporate Training",
        description: "Enterprise license for TechCorp Inc - 500 seats",
        createdAt: new Date("2024-11-08")
      },
      {
        companyId: eduTech.id,
        amount: "180000",
        type: "service",
        direction: "credit",
        source: "Custom Content Development",
        description: "Bespoke course creation for Finance Corp",
        createdAt: new Date("2024-11-12")
      },
      {
        companyId: eduTech.id,
        amount: "15000",
        type: "refund",
        direction: "debit",
        source: "Customer refunds",
        description: "Pro-rated refunds for cancelled subscriptions",
        createdAt: new Date("2024-11-14")
      }
    ]);

    console.log(`✅ EduTech Academy created with ${eduTech.id}\n`);

    // 3. Create BuildRight Construction (Construction Company)
    console.log("Creating BuildRight Construction...");
    const [buildRight] = await db.insert(companies).values({
      name: "BuildRight Construction",
      description: "Full-service construction company specializing in commercial and residential projects with sustainable building practices.",
      country: "Canada",
      legalType: "Corporation",
      registrationNumber: "BRC-2022-456",
      registrationDate: new Date("2022-03-15"),
      primarySector: "construction",
      secondarySector: "architecture",
      industryTags: ["construction", "sustainable-building", "commercial", "residential"],
      vision: "Lead the construction industry in sustainable, innovative building practices while delivering exceptional quality",
      currentGoals: [
        "Complete 25 major projects in 2025",
        "Achieve LEED certification for all new projects",
        "Reduce carbon footprint by 30%",
        "Implement AI-powered project management"
      ],
      kpiTargets: {
        "projects_completed": 25,
        "safety_incidents": 0,
        "client_satisfaction": 90
      },
      dailyCashBurnTarget: 25000,
      tokenUsageLimit: 300000,
      autonomyLevel: "low",
      riskAppetite: "low",
      creativity: "balanced",
      strictness: "very_strict",
      themeColor: "#FB8500"
    }).returning();

    // Add BuildRight shareholders
    await db.insert(companyShareholders).values([
      {
        companyId: buildRight.id,
        shareholderName: "James Morrison",
        shareholderType: "individual",
        sharePercentage: 60,
        role: "Founder & CEO",
        distributionMode: "traditional",
        metadata: {
          investmentAmount: "3000000",
          notes: "25+ years in construction industry"
        }
      },
      {
        companyId: buildRight.id,
        shareholderName: "Green Building Fund",
        shareholderType: "institutional",
        sharePercentage: 25,
        role: "Strategic Investor",
        distributionMode: "traditional",
        metadata: {
          investmentAmount: "1250000",
          notes: "Focus on sustainable construction initiatives"
        }
      },
      {
        companyId: buildRight.id,
        shareholderName: "Employee Ownership Trust",
        shareholderType: "employee_pool",
        sharePercentage: 15,
        role: "Employee Owners",
        distributionMode: "traditional",
        metadata: {
          notes: "Employee ownership program for long-term staff"
        }
      }
    ]);

    // Add BuildRight KPIs
    await db.insert(companyKpis).values([
      {
        companyId: buildRight.id,
        kpiName: "Projects Completed YTD",
        kpiValue: 18,
        period: "2024",
        target: 25,
        category: "operational"
      },
      {
        companyId: buildRight.id,
        kpiName: "Safety Incident Rate",
        kpiValue: 0,
        period: "November 2025",
        target: 0,
        category: "safety"
      },
      {
        companyId: buildRight.id,
        kpiName: "Client Satisfaction Score",
        kpiValue: 88,
        period: "November 2025",
        target: 90,
        category: "customer"
      },
      {
        companyId: buildRight.id,
        kpiName: "Projects Under Budget %",
        kpiValue: 72,
        period: "2024",
        target: 80,
        category: "financial"
      }
    ]);

    // Add BuildRight transactions
    await db.insert(revenueTransactions).values([
      {
        companyId: buildRight.id,
        amount: "2850000",
        type: "sale",
        direction: "credit",
        source: "Riverside Commercial Tower",
        description: "Progress payment - Phase 3 completion",
        createdAt: new Date("2024-11-02")
      },
      {
        companyId: buildRight.id,
        amount: "1200000",
        type: "sale",
        direction: "credit",
        source: "Lakeside Residential Complex",
        description: "Foundation and framing completion payment",
        createdAt: new Date("2024-11-09")
      },
      {
        companyId: buildRight.id,
        amount: "95000",
        type: "adjustment",
        direction: "debit",
        source: "Material cost overrun",
        description: "Steel price increase adjustment - Q4 2024",
        createdAt: new Date("2024-11-11")
      },
      {
        companyId: buildRight.id,
        amount: "650000",
        type: "sale",
        direction: "credit",
        source: "City Hall Renovation",
        description: "Contract deposit for new municipal project",
        createdAt: new Date("2024-11-15")
      }
    ]);

    console.log(`✅ BuildRight Construction created with ${buildRight.id}\n`);

    console.log("\n🎉 Simulation data seeding completed successfully!");
    console.log("\nSummary:");
    console.log(`- 3 Companies created`);
    console.log(`- 10 Shareholders across all companies`);
    console.log(`- 13 KPIs tracked`);
    console.log(`- 17 Revenue transactions recorded`);
    console.log("\nYou can now explore the platform with rich, realistic data!");

  } catch (error) {
    console.error("❌ Error seeding simulation data:", error);
    throw error;
  }
}

seedSimulationData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
