import { db } from "@db";
import { cloneProfiles, companyCloneAssignments, agentDiagnostics } from "@db/schema";
import { eq, and } from "drizzle-orm";

const DEFAULT_EXPERT_CLONES = [
  {
    shortCode: "chief_orchestrator",
    displayName: "Chief Orchestrator",
    title: "Chief of Staff",
    bio: "Coordinates all your AI employees around your goals.",
    longDescription: "This expert takes the founder's objectives and turns them into structured projects, assigning tasks to other agents and tracking progress. It behaves like a Chief of Staff running a multi-agent company on your behalf.",
    category: "business" as const,
    primaryExpertise: "Multi-agent coordination",
    avatar: "👔",
    skills: ["Multi-agent coordination", "Breaking big goals into actionable steps", "Prioritization and roadmap planning", "Progress tracking and status reporting"],
    industries: ["All Industries"],
    priorityOrder: 1
  },
  {
    shortCode: "head_of_operations",
    displayName: "Head of Operations",
    title: "Operations Director",
    bio: "Turns strategy into repeatable, efficient workflows.",
    longDescription: "This expert designs, optimizes and documents the operational workflows of the company. It focuses on execution, routines, SOPs and checklists that make the business run smoothly every day.",
    category: "productivity" as const,
    primaryExpertise: "Process mapping and workflow design",
    avatar: "⚡",
    skills: ["Process mapping and workflow design", "Operational checklists and SOPs", "Bottleneck detection", "Policy enforcement in day-to-day operations"],
    industries: ["All Industries"],
    priorityOrder: 2
  },
  {
    shortCode: "head_of_finance_payments",
    displayName: "Head of Finance & Payments",
    title: "Finance & Payments Director",
    bio: "Watches the money, the payment gateway and the cash flows.",
    longDescription: "This expert oversees revenue flows, payment gateway performance, settlements, basic unit economics and financial sanity checks, so the founder always knows where the money is going.",
    category: "business" as const,
    primaryExpertise: "Revenue and cost breakdowns",
    avatar: "💰",
    skills: ["Revenue and cost breakdowns", "Payment flow monitoring", "Basic cash-flow analysis", "Financial risk spotting"],
    industries: ["Finance", "E-commerce", "SaaS"],
    priorityOrder: 3
  },
  {
    shortCode: "strategy_growth_director",
    displayName: "Strategy & Growth Director",
    title: "Strategy Director",
    bio: "Finds opportunities and builds clear growth roadmaps.",
    longDescription: "This expert helps the founder answer: where should we focus next? It looks at positioning, value proposition, segments, pricing, channels and proposes simple, concrete growth plans.",
    category: "business" as const,
    primaryExpertise: "Market and segment thinking",
    avatar: "🎯",
    skills: ["Market and segment thinking", "Positioning and messaging ideas", "Prioritization of growth levers", "High-level roadmapping"],
    industries: ["Startups", "E-commerce", "SaaS"],
    priorityOrder: 4
  },
  {
    shortCode: "data_insights_analyst",
    displayName: "Data & Insights Analyst",
    title: "Data Analyst",
    bio: "Turns raw data into honest, actionable insights.",
    longDescription: "This expert reads metrics, logs and reports, then explains what is happening and why. It is bluntly honest and focused on facts rather than opinions.",
    category: "productivity" as const,
    primaryExpertise: "KPI structuring and trend analysis",
    avatar: "📊",
    skills: ["KPI structuring", "Trend analysis", "Anomaly detection", "Experiment result interpretation"],
    industries: ["All Industries"],
    priorityOrder: 5
  },
  {
    shortCode: "engineering_automation_specialist",
    displayName: "Engineering & Automation Specialist",
    title: "Automation Engineer",
    bio: "Connects systems and makes repetitive work disappear.",
    longDescription: "This expert is the technical builder: it proposes automations, integration patterns, and system designs that reduce manual workload and make the platform feel seamless.",
    category: "productivity" as const,
    primaryExpertise: "Automation design and API integration",
    avatar: "🔧",
    skills: ["Automation design", "API / webhook integration ideas", "System architecture sketches", "Technical edge-case awareness"],
    industries: ["Technology", "SaaS", "E-commerce"],
    priorityOrder: 6
  },
  {
    shortCode: "customer_relations_manager",
    displayName: "Customer Relations Manager",
    title: "Customer Success Manager",
    bio: "Protects the relationship with customers and users.",
    longDescription: "This expert focuses on people using the product: their questions, frustrations, expectations and experience. It writes responses, support macros and playbooks that keep users informed and respected.",
    category: "sales" as const,
    primaryExpertise: "Support reply drafting and customer communication",
    avatar: "💬",
    skills: ["Support reply drafting", "Tone and phrasing for sensitive cases", "Support workflows and macros", "Customer feedback structuring"],
    industries: ["All Industries"],
    priorityOrder: 7
  },
  {
    shortCode: "knowledge_training_curator",
    displayName: "Knowledge & Training Curator",
    title: "Knowledge Curator",
    bio: "Turns what the company knows into clear playbooks.",
    longDescription: "This expert organizes knowledge: it structures documentation, SOPs, training material and internal how-tos so that anyone (human or agent) can quickly understand how things are done.",
    category: "productivity" as const,
    primaryExpertise: "Documentation structure and SOP creation",
    avatar: "📚",
    skills: ["Documentation structure", "SOP and playbook creation", "Onboarding flows", "Knowledge base taxonomies"],
    industries: ["All Industries"],
    priorityOrder: 8
  },
  {
    shortCode: "compliance_risk_manager",
    displayName: "Compliance & Risk Manager",
    title: "Compliance Manager",
    bio: "Keeps operations safe, clean and within agreed rules.",
    longDescription: "This expert reviews flows and decisions with a risk lens: it looks for fraud possibilities, compliance breaches and fragile processes, then suggests safer ways to operate.",
    category: "business" as const,
    primaryExpertise: "Risk spotting and compliance checks",
    avatar: "🛡️",
    skills: ["Risk spotting", "Basic compliance checks", "Policy drafting", "Safeguard recommendations"],
    industries: ["Finance", "Healthcare", "Legal"],
    priorityOrder: 9
  },
  {
    shortCode: "meetings_coordination_manager",
    displayName: "Meetings & Coordination Manager",
    title: "Coordination Manager",
    bio: "Makes sure decisions and follow-ups don't get lost.",
    longDescription: "This expert structures meetings, agendas and follow-ups. It helps the founder and agents decide when a meeting is needed, what should happen in it, and what actions must follow.",
    category: "productivity" as const,
    primaryExpertise: "Agenda creation and action tracking",
    avatar: "📅",
    skills: ["Agenda creation", "Action item tracking", "Summary writing", "Cross-team coordination"],
    industries: ["All Industries"],
    priorityOrder: 10
  },
  {
    shortCode: "communications_content_advisor",
    displayName: "Communications & Content Advisor",
    title: "Communications Advisor",
    bio: "Gives the company a clear, consistent voice.",
    longDescription: "This expert writes and refines messages: emails, updates, one-pagers, landing page copy and internal announcements. It adapts tone to audience (team, partners, customers, investors).",
    category: "content" as const,
    primaryExpertise: "Copywriting and message framing",
    avatar: "✍️",
    skills: ["Copywriting", "Message framing", "Tone adaptation", "Document polishing"],
    industries: ["All Industries"],
    priorityOrder: 11
  },
  {
    shortCode: "innovation_rd_lead",
    displayName: "Innovation & R&D Lead",
    title: "Innovation Lead",
    bio: "Safely explores new ideas, features and business angles.",
    longDescription: "This expert is the internal lab: it tests ideas, explores alternatives, and simulates scenarios before the founder invests real time and money.",
    category: "expert" as const,
    primaryExpertise: "Idea generation and experiment design",
    avatar: "💡",
    skills: ["Idea generation", "Scenario simulation", "Experiment design", "Assumption testing"],
    industries: ["All Industries"],
    priorityOrder: 12
  },
  {
    shortCode: "sales_manager",
    displayName: "Sales Manager",
    title: "Sales Manager",
    bio: "Oversees sales strategy, targets and pipeline health.",
    longDescription: "This expert leads the sales department: setting targets, monitoring the pipeline, coordinating SDRs and closers, and ensuring deals move forward efficiently. Posts daily standups and weekly pipeline reviews.",
    category: "sales" as const,
    primaryExpertise: "Sales strategy and pipeline management",
    avatar: "📈",
    skills: ["Pipeline management", "Sales forecasting", "Team coordination", "Deal prioritization", "Target setting"],
    industries: ["All Industries"],
    priorityOrder: 13
  },
  {
    shortCode: "sales_development_rep",
    displayName: "Sales Development Representative",
    title: "SDR",
    bio: "Generates leads, researches prospects and launches initial outreach.",
    longDescription: "This expert is the top of the funnel: it finds potential customers, researches them, qualifies them, and initiates first contact through email, LinkedIn or other channels. Reports new lead batches to the team.",
    category: "sales" as const,
    primaryExpertise: "Lead generation and prospecting",
    avatar: "🔍",
    skills: ["Lead research", "Prospect qualification", "Outreach sequences", "Cold email writing", "LinkedIn prospecting"],
    industries: ["All Industries"],
    priorityOrder: 14
  },
  {
    shortCode: "sales_representative",
    displayName: "Sales Representative",
    title: "Closer",
    bio: "Handles qualified leads, proposals, negotiation and closing.",
    longDescription: "This expert takes warm leads and moves them through the final stages: demos, proposals, negotiations and closing. It drafts responses, handles objections and updates deal stages.",
    category: "sales" as const,
    primaryExpertise: "Deal closing and negotiation",
    avatar: "🤝",
    skills: ["Proposal writing", "Objection handling", "Negotiation", "Demo delivery", "Contract closing"],
    industries: ["All Industries"],
    priorityOrder: 15
  },
  {
    shortCode: "crm_automation_agent",
    displayName: "CRM Automation Agent",
    title: "CRM Specialist",
    bio: "Maintains contact and pipeline data, triggers follow-ups automatically.",
    longDescription: "This expert keeps the sales data clean and actionable: it flags stale leads, triggers follow-up sequences, prevents deals from going dormant, and ensures no opportunity falls through the cracks.",
    category: "sales" as const,
    primaryExpertise: "CRM management and automation",
    avatar: "🤖",
    skills: ["Data hygiene", "Follow-up automation", "Lead scoring", "Pipeline maintenance", "Activity tracking"],
    industries: ["All Industries"],
    priorityOrder: 16
  },
  {
    shortCode: "chief_marketing_officer",
    displayName: "Chief Marketing Officer",
    title: "CMO",
    bio: "Owns marketing strategy, campaigns and brand.",
    longDescription: "This expert leads the marketing department: it designs campaigns, coordinates the marketing team, sets priorities, and aligns marketing activities with business goals. Posts weekly marketing briefs.",
    category: "content" as const,
    primaryExpertise: "Marketing strategy and brand management",
    avatar: "🎨",
    skills: ["Marketing strategy", "Brand positioning", "Campaign planning", "Budget allocation", "Market analysis"],
    industries: ["All Industries"],
    priorityOrder: 17
  },
  {
    shortCode: "content_creator",
    displayName: "Content Creator",
    title: "Content Creator",
    bio: "Writes posts, newsletters, landing copy, scripts and emails.",
    longDescription: "This expert produces all written content: blog posts, social media updates, email newsletters, landing page copy, video scripts and marketing emails. It creates content calendars and drafts for review.",
    category: "content" as const,
    primaryExpertise: "Content writing and copywriting",
    avatar: "📝",
    skills: ["Blog writing", "Social media posts", "Email copywriting", "Landing page copy", "Script writing"],
    industries: ["All Industries"],
    priorityOrder: 18
  },
  {
    shortCode: "social_media_manager",
    displayName: "Social Media Manager",
    title: "Social Media Manager",
    bio: "Schedules and posts content, monitors reactions, suggests engagement.",
    longDescription: "This expert manages the company's social presence: it schedules posts, monitors engagement, responds to comments, tracks performance metrics and reports on what content resonates with the audience.",
    category: "content" as const,
    primaryExpertise: "Social media management and engagement",
    avatar: "📱",
    skills: ["Post scheduling", "Engagement monitoring", "Community management", "Performance tracking", "Trend spotting"],
    industries: ["All Industries"],
    priorityOrder: 19
  },
  {
    shortCode: "ads_specialist",
    displayName: "Ads Specialist",
    title: "Paid Media Specialist",
    bio: "Designs and manages paid campaigns on Facebook, Google, TikTok and more.",
    longDescription: "This expert handles paid advertising: it creates ad campaigns, manages budgets, runs A/B tests, optimizes for conversions and reports on CTR, CPC, ROAS and other key metrics.",
    category: "content" as const,
    primaryExpertise: "Paid advertising and performance marketing",
    avatar: "💳",
    skills: ["Campaign creation", "Budget optimization", "A/B testing", "Performance reporting", "Audience targeting"],
    industries: ["All Industries"],
    priorityOrder: 20
  },
  {
    shortCode: "video_producer",
    displayName: "Video Producer",
    title: "Video Producer",
    bio: "Generates scripts, storyboards and instructions for video content.",
    longDescription: "This expert creates video content plans: hooks, scripts, storyboards and production instructions for short-form and long-form video. It helps turn ideas into ready-to-produce video briefs.",
    category: "content" as const,
    primaryExpertise: "Video production and scripting",
    avatar: "🎬",
    skills: ["Video scripting", "Storyboarding", "Hook writing", "Production planning", "Format optimization"],
    industries: ["All Industries"],
    priorityOrder: 21
  }
];

export async function seedExpertClones() {
  console.log("[Seed] Starting Expert Clones population...");

  for (const clone of DEFAULT_EXPERT_CLONES) {
    const existing = await db.query.cloneProfiles.findFirst({
      where: eq(cloneProfiles.shortCode, clone.shortCode)
    });

    if (existing) {
      console.log(`[Seed] Expert clone ${clone.displayName} already exists, updating...`);
      await db.update(cloneProfiles)
        .set({
          displayName: clone.displayName,
          title: clone.title,
          bio: clone.bio,
          longDescription: clone.longDescription,
          category: clone.category,
          primaryExpertise: clone.primaryExpertise,
          avatar: clone.avatar,
          skills: clone.skills,
          industries: clone.industries,
          trainingStatus: "ready",
          trainingProgress: 100,
          visibility: "public_marketplace",
          isPublished: true,
          isFeatured: clone.priorityOrder <= 4,
          publishedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(cloneProfiles.shortCode, clone.shortCode));
    } else {
      console.log(`[Seed] Creating expert clone: ${clone.displayName}`);
      await db.insert(cloneProfiles).values({
        shortCode: clone.shortCode,
        displayName: clone.displayName,
        title: clone.title,
        bio: clone.bio,
        longDescription: clone.longDescription,
        category: clone.category,
        primaryExpertise: clone.primaryExpertise,
        avatar: clone.avatar,
        skills: clone.skills,
        industries: clone.industries,
        languages: ["en"],
        trainingStatus: "ready",
        trainingProgress: 100,
        visibility: "public_marketplace",
        isPublished: true,
        publishedAt: new Date(),
        isFeatured: clone.priorityOrder <= 4,
        pricingModel: "per_day",
        baseDailyCost: "0.00",
        baseHourlyRate: "0.00"
      });
    }
  }

  console.log(`[Seed] Successfully seeded ${DEFAULT_EXPERT_CLONES.length} expert clones`);
  return { success: true, count: DEFAULT_EXPERT_CLONES.length };
}

export async function assignClonesToCompany(companyId: number) {
  console.log(`[Seed] Assigning all expert clones to company ${companyId}...`);
  
  const allClones = await db.query.cloneProfiles.findMany({
    where: eq(cloneProfiles.isPublished, true)
  });

  let assigned = 0;
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  for (const clone of allClones) {
    const existing = await db.query.companyCloneAssignments.findFirst({
      where: and(
        eq(companyCloneAssignments.companyId, companyId),
        eq(companyCloneAssignments.cloneProfileId, clone.id)
      )
    });

    if (!existing) {
      const [assignment] = await db.insert(companyCloneAssignments).values({
        companyId,
        cloneProfileId: clone.id,
        roleWithinCompany: clone.title,
        reportingLevel: clone.category === "business" ? 1 : 2,
        status: "active",
        startDate: now,
        dailyCost: "0.00",
        weeklyCost: "0.00",
        monthlyCost: "0.00"
      }).returning();

      await db.insert(agentDiagnostics).values({
        assignmentId: assignment.id,
        companyId,
        metricDate: now
      });

      assigned++;
    }
  }

  console.log(`[Seed] Assigned ${assigned} new clones to company ${companyId}`);
  return { assigned };
}
