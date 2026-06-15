export const vitrineAssets = {
  operatingStack: "/brand-assets/generated/operating-stack-hero.png",
  gold: "/brand-assets/generated/gold-mining-visual.png",
  machinery: "/brand-assets/generated/machinery-visual.png",
  government: "/brand-assets/generated/government-advisory-visual.png",
  payments: "/brand-assets/generated/payments-wallet-visual.png",
  archive: "/brand-assets/generated/archive-background.png",
  archiveEvent: "/assets/exportunity/2759c4ea629c90837245379ae826bfce6ed7401205fe4a975b45bda4553cd577.jpg",
  founderMedia: "/assets/exportunity/519f378b430f043d854a92e22300af362625c1982a1744d473515bb102e4cfdb.jpg",
  platform: "/assets/exportunity/0cec61a9c702ba53d25fb2dd90d9ccb4b867cd529d1b0aef910e9d770429670a.jpg",
} as const;

export type VitrineKey =
  | "company"
  | "what"
  | "platforms"
  | "gold"
  | "machinery"
  | "government"
  | "archive"
  | "stack"
  | "work";

export type VitrineCard = {
  title: string;
  text: string;
  href?: string;
  label?: string;
  status?: "verified" | "owner-provided" | "needs-approval" | "generated";
  sources?: VitrineSourceId[];
};

export type VitrineSection = {
  kicker?: string;
  title: string;
  text?: string;
  cards?: VitrineCard[];
  timeline?: Array<{ year: string; title: string; text: string; sourceStatus?: VitrineCard["status"]; sources?: VitrineSourceId[] }>;
  image?: { src: string; title: string; caption: string; status?: VitrineCard["status"] };
  sourceStatus?: VitrineCard["status"];
  sources?: VitrineSourceId[];
};

export type VitrinePageMeta = {
  active: string;
  kicker: string;
  title: string;
  lead: string;
  image: string;
  cta: VitrineCard[];
};

export type VitrineSourceId =
  | "owner-master-task"
  | "project-site-config"
  | "legacy-exportunity-home"
  | "legacy-exportunity-about"
  | "legacy-exportunity-platforms"
  | "tef-member-profile"
  | "tef-article"
  | "legacy-wix-xportcard";

export type VitrineSource = {
  id: VitrineSourceId;
  label: string;
  href?: string;
  note: string;
};

export const vitrineSources: Record<VitrineSourceId, VitrineSource> = {
  "owner-master-task": {
    id: "owner-master-task",
    label: "Owner task",
    note: "Owner-provided master task and compliance direction.",
  },
  "project-site-config": {
    id: "project-site-config",
    label: "Project config",
    note: "Existing project marketing configuration and platform records.",
  },
  "legacy-exportunity-home": {
    id: "legacy-exportunity-home",
    label: "Legacy home",
    href: "https://www.exportunity.com/",
    note: "Legacy Exportunity public homepage.",
  },
  "legacy-exportunity-about": {
    id: "legacy-exportunity-about",
    label: "Legacy about",
    href: "https://www.exportunity.com/about",
    note: "Legacy public company history, founder, marketplace, XportCARD, and media references.",
  },
  "legacy-exportunity-platforms": {
    id: "legacy-exportunity-platforms",
    label: "Legacy platforms",
    href: "https://www.exportunity.com/blank-2",
    note: "Legacy platform page with Bourse de l'Or, Pro App, Boost the Law, machinery, SME operations, and wallet references.",
  },
  "tef-member-profile": {
    id: "tef-member-profile",
    label: "TEF profile",
    href: "https://www.tonyelumelufoundation.org/member/vital-sounouvou",
    note: "Third-party Tony Elumelu Foundation profile connecting Vital Sounouvou and Exportunity.",
  },
  "tef-article": {
    id: "tef-article",
    label: "TEF article",
    href: "https://www.tonyelumelufoundation.org/west-africa/one-marketplace-for-africa-through-exportunity-the-dream-of-vital-sounouvou",
    note: "Third-party Tony Elumelu Foundation article on Exportunity marketplace activity.",
  },
  "legacy-wix-xportcard": {
    id: "legacy-wix-xportcard",
    label: "XportCARD archive",
    href: "https://vitalsounouvou2025.wixsite.com/exportunity/products",
    note: "Legacy Wix XportCARD archive; historic, not current product availability.",
  },
};

export const vitrinePageMeta: Record<VitrineKey, VitrinePageMeta> = {
  company: {
    active: "company",
    kicker: "COMPANY",
    title: "Built from trade. Expanded into platforms.",
    lead: "Exportunity builds and operates connected platforms for trade, payments, advisory, and execution.",
    image: vitrineAssets.founderMedia,
    cta: [
      { title: "View archive", text: "Open records and media.", href: "/archive" },
      { title: "Contact", text: "Start a company conversation.", href: "/contact" },
    ],
  },
  what: {
    active: "what",
    kicker: "WHAT WE DO",
    title: "Trade, gold, machinery, advisory, payments, and execution.",
    lead: "Exportunity supports business operations through platforms, sourcing support, records, and follow-up.",
    image: vitrineAssets.operatingStack,
    cta: [
      { title: "Work with us", text: "Send a request.", href: "/work-with-us" },
      { title: "Platform access", text: "Open platform routes.", href: "/platform" },
    ],
  },
  platforms: {
    active: "platforms",
    kicker: "PLATFORMS",
    title: "Each platform supports a specific business activity.",
    lead: "Exportunity platforms connect marketplace activity, payments, gold workflows, operations, and evidence records.",
    image: vitrineAssets.platform,
    cta: [
      { title: "Open platform", text: "Choose an access route.", href: "/platform" },
      { title: "Request access", text: "Contact the team.", href: "/work-with-us" },
    ],
  },
  gold: {
    active: "what",
    kicker: "GOLD & MINING",
    title: "Gold-related trade, verification, machinery, and coordination.",
    lead: "Exportunity supports gold-related workflows by connecting records, product data, documents, and transaction steps.",
    image: vitrineAssets.gold,
    cta: [
      { title: "Explore Bourse de l'Or", text: "Open gold platform direction.", href: "/gold-mining" },
      { title: "Request access", text: "Contact the team.", href: "/work-with-us" },
    ],
  },
  machinery: {
    active: "what",
    kicker: "MACHINERY",
    title: "Sourcing, supply coordination, financing pathways, and follow-up.",
    lead: "Exportunity supports businesses and operators that need equipment for production, mining, logistics, construction, and trade activity.",
    image: vitrineAssets.machinery,
    cta: [
      { title: "Request machinery support", text: "Send an equipment request.", href: "/work-with-us" },
      { title: "Platform access", text: "Open access routes.", href: "/platform" },
    ],
  },
  government: {
    active: "what",
    kicker: "GOVERNMENT & INSTITUTIONS",
    title: "Advisory, platform strategy, trade execution, and coordination.",
    lead: "Exportunity advises public, private, and institutional partners on trade, investment, SME systems, and market execution.",
    image: vitrineAssets.government,
    cta: [
      { title: "Contact institutional team", text: "Start an advisory request.", href: "/contact" },
      { title: "View archive", text: "Review public records.", href: "/archive" },
    ],
  },
  archive: {
    active: "archive",
    kicker: "ARCHIVE",
    title: "A public record of activity, platforms, media, and milestones.",
    lead: "Archive entries must carry dates, categories, captions, sources, and approval status before final publication.",
    image: vitrineAssets.archive,
    cta: [
      { title: "View record", text: "Open proof records.", href: "/media" },
      { title: "Contact", text: "Request archive context.", href: "/contact" },
    ],
  },
  stack: {
    active: "stack",
    kicker: "OPERATING STACK",
    title: "Workflows behind the platforms.",
    lead: "The operating stack connects users, messages, approvals, payments, documents, records, and follow-up.",
    image: vitrineAssets.operatingStack,
    cta: [
      { title: "Request access", text: "Ask for operator access.", href: "/work-with-us" },
      { title: "Open platform", text: "Choose a platform route.", href: "/platform" },
    ],
  },
  work: {
    active: "work",
    kicker: "WORK WITH EXPORTUNITY",
    title: "Trade, gold, machinery, advisory, platform access, or collaboration.",
    lead: "Contact Exportunity for B2B operations, B2G advisory, machinery support, gold workflows, and platform access.",
    image: vitrineAssets.payments,
    cta: [
      { title: "Send request", text: "Use the form below.", href: "#request" },
      { title: "Platform access", text: "Open access routes.", href: "/platform" },
    ],
  },
};

export const vitrineSeoMeta: Record<VitrineKey, { title: string; description: string }> = {
  company: {
    title: "Exportunity Company \u2014 Trade Platforms and Public Record",
    description: "Exportunity builds and operates connected platforms for trade, payments, advisory, and execution.",
  },
  what: {
    title: "What Exportunity Does \u2014 Trade, Mining, Machinery, Advisory, and Platforms",
    description: "Exportunity supports trade, gold, machinery, advisory, payments, and platform execution.",
  },
  platforms: {
    title: "Exportunity Platforms \u2014 Bourse de l'Or, rayOn, XportCARD, MindBase",
    description: "Each Exportunity platform supports a specific business activity across trade, payments, gold workflows, operations, and records.",
  },
  gold: {
    title: "Gold & Mining Support \u2014 Bourse de l'Or by Exportunity",
    description: "Exportunity supports gold-related trade, verification, machinery, and transaction coordination through structured workflows.",
  },
  machinery: {
    title: "Machinery Support \u2014 Sourcing, Supply, Financing, and Operations",
    description: "Machinery sourcing, supply coordination, financing pathways, procurement support, and operational follow-up.",
  },
  government: {
    title: "Government & Institutions \u2014 Trade and Digital Platform Advisory",
    description: "Advisory, platform strategy, trade execution, and public-private coordination for businesses and institutions.",
  },
  archive: {
    title: "Exportunity Archive \u2014 Media, Records, Platforms, and Company History",
    description: "A public record of Exportunity activity, platforms, media, documents, images, and milestones.",
  },
  stack: {
    title: "Exportunity Operating Stack \u2014 Workflows Behind the Platforms",
    description: "The Exportunity operating stack connects users, messages, approvals, payments, documents, records, and follow-up.",
  },
  work: {
    title: "Work With Exportunity \u2014 Trade, Gold, Machinery, Advisory, and Platform Access",
    description: "Contact Exportunity for trade, gold, machinery, advisory, platform access, or institutional collaboration.",
  },
};

export const vitrineSections: Record<VitrineKey, VitrineSection[]> = {
  company: [
    {
      title: "Company summary",
      text: "Exportunity started with trade promotion and market access work. The company later developed marketplace, payment, SME, and operating platforms connected to African business activity.",
      sourceStatus: "verified",
      sources: ["legacy-exportunity-about", "tef-article"],
    },
    {
      kicker: "TIMELINE",
      title: "Verified and owner-provided milestones",
      timeline: [
        { year: "2012", title: "Company foundation", text: "Trade promotion and market access activity.", sourceStatus: "verified", sources: ["legacy-exportunity-home", "legacy-exportunity-about"] },
        { year: "2015", title: "Marketplace activity", text: "Support for African small businesses and secure payments.", sourceStatus: "verified", sources: ["legacy-exportunity-about", "tef-article"] },
        { year: "2017", title: "XportCARD launch direction", text: "Payment access direction recorded in owner-provided platform history.", sourceStatus: "verified", sources: ["legacy-exportunity-about", "legacy-wix-xportcard"] },
        { year: "2021", title: "Media and platform story", text: "Public media records connected to the founder and platform activity.", sourceStatus: "verified", sources: ["legacy-exportunity-about"] },
        { year: "Current", title: "Connected operating stack", text: "Exportunity organizes platform work through shared workflows and records.", sourceStatus: "owner-provided", sources: ["owner-master-task", "project-site-config"] },
      ],
    },
    {
      title: "What remains constant",
      cards: [
        { title: "Market access", text: "Connecting producers, suppliers, buyers, and operators.", status: "verified", sources: ["legacy-exportunity-home", "tef-article"] },
        { title: "Execution", text: "Turning business intent into tracked operational workflows.", status: "owner-provided", sources: ["owner-master-task"] },
        { title: "Payments", text: "Supporting transaction access and financial flow.", status: "verified", sources: ["legacy-exportunity-about", "legacy-wix-xportcard"] },
        { title: "Advisory", text: "Structuring trade and investment activity.", status: "owner-provided", sources: ["owner-master-task"] },
        { title: "Proof", text: "Maintaining records of work, media, images, and milestones.", status: "owner-provided", sources: ["owner-master-task"] },
      ],
    },
    {
      title: "Leadership",
      text: "Exportunity was founded by Vital Sounouvou and developed through trade, technology, advisory, and platform work across African markets.",
      sourceStatus: "verified",
      sources: ["legacy-exportunity-about", "tef-member-profile", "tef-article"],
      image: {
        src: vitrineAssets.founderMedia,
        title: "Founder media record",
        caption: "Public media still connected to Exportunity leadership records. Context pending verification.",
        status: "needs-approval",
      },
    },
  ],
  what: [
    {
      title: "Trade and market access",
      text: "Exportunity connects producers, suppliers, buyers, and business operators through platforms, sourcing support, and transaction workflows.",
      sourceStatus: "verified",
      sources: ["legacy-exportunity-home", "tef-article"],
      cards: [
        { title: "Product sourcing", text: "Requests, suppliers, and buyer access.", status: "owner-provided" },
        { title: "Supplier coordination", text: "Records, communication, and follow-up.", status: "owner-provided" },
        { title: "B2B support", text: "Transaction preparation and operating records.", status: "owner-provided" },
      ],
    },
    {
      title: "Gold and mining support",
      text: "Exportunity supports gold-related operations by connecting miners, suppliers, buyers, advisors, and institutional partners through structured workflows.",
      sourceStatus: "owner-provided",
      sources: ["owner-master-task", "legacy-exportunity-platforms"],
      cards: [
        { title: "Supplier onboarding", text: "Miner and supplier records without claiming mine ownership.", status: "owner-provided" },
        { title: "Verification coordination", text: "Certificates, documents, approvals, and photos.", status: "owner-provided" },
        { title: "Transaction preparation", text: "Buyer and seller communication before execution.", status: "owner-provided" },
      ],
      image: {
        src: vitrineAssets.gold,
        title: "Gold workflow visual",
        caption: "Generated visual for gold workflow atmosphere. Not documentary proof.",
        status: "generated",
      },
    },
    {
      title: "Machinery and equipment",
      text: "Exportunity supports machinery sourcing, supply coordination, financing pathways, delivery coordination, and after-sales follow-up.",
      sourceStatus: "verified",
      sources: ["legacy-exportunity-platforms", "owner-master-task"],
      cards: [
        { title: "Machinery requests", text: "Equipment needs captured in a structured workflow.", status: "owner-provided" },
        { title: "Supplier coordination", text: "Catalogs, documentation, and offer follow-up.", status: "owner-provided" },
        { title: "Financing pathways", text: "Support for leasing or financing preparation.", status: "verified" },
      ],
      image: {
        src: vitrineAssets.machinery,
        title: "Machinery procurement visual",
        caption: "Generated visual for machinery and procurement atmosphere. Not documentary proof.",
        status: "generated",
      },
    },
    {
      title: "Payments and wallet access",
      text: "Exportunity's payment history includes XportCARD and wallet-linked tools designed to support SMEs, traders, and cross-border transaction access.",
      sourceStatus: "verified",
      sources: ["legacy-exportunity-about", "legacy-wix-xportcard"],
      cards: [
        { title: "Payment access", text: "Card and wallet direction connected to platform activity.", status: "verified" },
        { title: "Transaction records", text: "Payment steps recorded alongside operations.", status: "owner-provided" },
        { title: "Platform settlement", text: "Settlement direction tied to requests, orders, and follow-up.", status: "owner-provided" },
      ],
      image: {
        src: vitrineAssets.payments,
        title: "Payments and wallet visual",
        caption: "Generated visual for payment infrastructure. Not a bank partnership claim.",
        status: "generated",
      },
    },
    {
      title: "Operating systems",
      text: "Exportunity connects public platforms with internal workflows for tasks, messages, approvals, payments, documents, and records.",
      sourceStatus: "owner-provided",
      sources: ["owner-master-task", "project-site-config"],
      image: {
        src: vitrineAssets.operatingStack,
        title: "Operating stack visual",
        caption: "Generated abstract visual for the shared operating layer.",
        status: "generated",
      },
    },
    {
      title: "Government and institutional advisory",
      text: "Exportunity advises businesses, public actors, and institutional partners on trade, investment, digital systems, and market execution.",
      sourceStatus: "owner-provided",
      sources: ["owner-master-task"],
    },
  ],
  platforms: [
    {
      title: "Platform directory",
      cards: [
        { title: "Bourse de l'Or", text: "Gold products, document records, transaction management, and market coordination.", href: "/gold-mining", label: "Open platform", status: "verified", sources: ["legacy-exportunity-platforms", "project-site-config"] },
        { title: "Maison en Terre", text: "Construction materials, production, stock, and orders.", href: "/platforms", label: "Open platform", status: "verified", sources: ["legacy-exportunity-platforms", "project-site-config"] },
        { title: "rayOn", text: "Seller tools, local commerce, payments, training, and delivery workflows.", href: "/platforms", label: "Open platform", status: "verified", sources: ["legacy-exportunity-about", "project-site-config"] },
        { title: "XportCARD", text: "Payment access and transaction history for traders and SMEs.", href: "/platforms", label: "View record", status: "verified", sources: ["legacy-exportunity-about", "legacy-wix-xportcard"] },
        { title: "MindBase", text: "Agents, tasks, approvals, workflows, and internal execution.", href: "/operating-stack", label: "Request access", status: "verified", sources: ["project-site-config"] },
        { title: "House of Zogue", text: "Creative, cultural, and luxury products.", href: "/platforms", label: "Open platform", status: "verified", sources: ["project-site-config"] },
      ],
    },
  ],
  gold: [
    {
      title: "Bourse de l'Or",
      text: "Bourse de l'Or is the Exportunity platform direction for gold products, document records, transaction management, and market coordination.",
      sourceStatus: "verified",
      sources: ["legacy-exportunity-platforms", "project-site-config"],
      cards: [
        { title: "Gold products", text: "Product records and supporting documents.", status: "owner-provided" },
        { title: "Certification records", text: "Document and approval coordination.", status: "owner-provided" },
        { title: "Transaction management", text: "Buyer, seller, and follow-up steps.", status: "owner-provided" },
        { title: "Machinery support", text: "Equipment needs connected to operations.", status: "verified" },
      ],
      image: {
        src: vitrineAssets.gold,
        title: "Gold and verification workflow",
        caption: "Generated section visual. Product, certificate, and transaction claims still require source-backed records.",
        status: "generated",
      },
    },
    {
      title: "Support for miners and suppliers",
      text: "Exportunity helps structure work around miners and suppliers so product information, documents, buyers, equipment needs, and transaction steps are easier to manage.",
      sourceStatus: "owner-provided",
      sources: ["owner-master-task"],
    },
    {
      title: "Verification and records",
      text: "Gold-related operations require clear records: documents, photos, certificates, buyer requests, approvals, and transaction history.",
      sourceStatus: "owner-provided",
      sources: ["owner-master-task"],
    },
  ],
  machinery: [
    {
      title: "Machinery support",
      cards: [
        { title: "Equipment requests", text: "Capture machinery needs and operating context.", status: "owner-provided" },
        { title: "Supplier sourcing", text: "Coordinate catalogs, offers, and documentation.", status: "owner-provided" },
        { title: "Financing pathways", text: "Prepare leasing or financing follow-up.", status: "verified", sources: ["legacy-exportunity-platforms"] },
        { title: "Import/export coordination", text: "Track documents and logistics steps.", status: "owner-provided" },
        { title: "Delivery follow-up", text: "Record delivery and after-sales coordination.", status: "owner-provided" },
        { title: "Maintenance coordination", text: "Keep support and maintenance visible.", status: "owner-provided" },
      ],
      image: {
        src: vitrineAssets.machinery,
        title: "Machinery sourcing workflow",
        caption: "Generated section visual for equipment sourcing and procurement support.",
        status: "generated",
      },
    },
    {
      title: "For miners and operators",
      text: "Mining and production operators need reliable equipment, structured documentation, and trusted supplier coordination. Exportunity helps organize the process from request to execution.",
      sourceStatus: "owner-provided",
      sources: ["owner-master-task"],
    },
  ],
  government: [
    {
      title: "Advisory",
      text: "Exportunity advises public, private, and institutional partners on trade, investment, digital platforms, payment access, SME systems, and market execution.",
      sourceStatus: "owner-provided",
      sources: ["owner-master-task", "legacy-exportunity-home"],
      cards: [
        { title: "Trade program design", text: "Structure programs with records and execution steps.", status: "owner-provided" },
        { title: "SME digitalization", text: "Connect market access, payments, and training.", status: "owner-provided" },
        { title: "Platform strategy", text: "Plan systems for public-private coordination.", status: "owner-provided" },
        { title: "Data and records", text: "Keep evidence, approvals, and milestones visible.", status: "owner-provided" },
      ],
      image: {
        src: vitrineAssets.government,
        title: "Institutional advisory visual",
        caption: "Generated visual for advisory work. Not documentary proof of a government relationship.",
        status: "generated",
      },
    },
    {
      title: "Archive proof",
      text: "Historic government and institutional images must be captioned as archive or public record. They must not imply active contracts unless verified.",
      sourceStatus: "owner-provided",
      sources: ["owner-master-task", "legacy-exportunity-about"],
      image: {
        src: vitrineAssets.archiveEvent,
        title: "Institutional event archive",
        caption: "Archive image from Exportunity public records. Context pending verification before final publication.",
        status: "needs-approval",
      },
    },
  ],
  archive: [
    {
      title: "Archive categories",
      cards: [
        { title: "Company history", text: "Timeline, foundation, and company milestones.", status: "verified", sources: ["legacy-exportunity-about", "tef-article"] },
        { title: "Media", text: "Articles, videos, profiles, and press records.", status: "verified", sources: ["legacy-exportunity-about", "tef-article"] },
        { title: "Trade events", text: "Market access records and event material.", status: "verified", sources: ["legacy-exportunity-home", "legacy-exportunity-about"] },
        { title: "Government", text: "Institutional archive items with careful captions.", status: "needs-approval", sources: ["legacy-exportunity-about", "owner-master-task"] },
        { title: "Payments", text: "XportCARD and wallet-linked history.", status: "verified", sources: ["legacy-exportunity-about", "legacy-wix-xportcard"] },
        { title: "Platforms", text: "rayOn, Bourse de l'Or, MindBase, and connected platform records.", status: "verified", sources: ["legacy-exportunity-platforms", "project-site-config"] },
      ],
      image: {
        src: vitrineAssets.archive,
        title: "Archive operating standard",
        caption: "Generated visual for the archive system. Real archive items require verified captions and sources.",
        status: "generated",
      },
    },
    {
      title: "Archive item standard",
      text: "Every archive item should include title, date if known, category, location if known, image or document, factual caption, source, and approval status.",
      sourceStatus: "owner-provided",
      sources: ["owner-master-task"],
    },
  ],
  stack: [
    {
      title: "Core layers",
      cards: [
        { title: "Marketplace", text: "Products, requests, orders, suppliers, buyers, and transactions.", status: "owner-provided", sources: ["owner-master-task", "project-site-config"] },
        { title: "Wallet and settlement", text: "Balances, payments, settlement direction, and completion records.", status: "owner-provided", sources: ["owner-master-task", "project-site-config"] },
        { title: "Contracts and approvals", text: "Agreements, validations, approvals, milestones, and execution steps.", status: "owner-provided", sources: ["owner-master-task", "project-site-config"] },
        { title: "Messaging", text: "Email, WhatsApp, SMS, notifications, and follow-up.", status: "owner-provided", sources: ["owner-master-task", "project-site-config"] },
        { title: "Agent operations", text: "Routing, reminders, workflow execution, and assistant-driven tasks.", status: "owner-provided", sources: ["owner-master-task", "project-site-config"] },
        { title: "Governance", text: "Roles, permissions, policies, logs, and system memory.", status: "owner-provided", sources: ["owner-master-task", "project-site-config"] },
        { title: "Archive and evidence", text: "Images, documents, activity, and proof connected to operations.", status: "owner-provided", sources: ["owner-master-task", "project-site-config"] },
        { title: "Platform access", text: "Access for operators, partners, clients, and internal teams.", status: "owner-provided", sources: ["owner-master-task", "project-site-config"] },
      ],
      image: {
        src: vitrineAssets.operatingStack,
        title: "Operating stack architecture",
        caption: "Generated abstract visual for workflows, records, approvals, and platform access.",
        status: "generated",
      },
    },
  ],
  work: [
    {
      title: "Contact areas",
      cards: [
        { title: "Trade", text: "For producers, suppliers, buyers, and B2B operators.", status: "owner-provided" },
        { title: "Gold and mining", text: "For miners, suppliers, buyers, advisors, and gold-related operators.", status: "owner-provided" },
        { title: "Machinery", text: "For sourcing, supply, financing, and project coordination.", status: "owner-provided" },
        { title: "Government and institutions", text: "For public-private work, advisory, platforms, and trade programs.", status: "owner-provided" },
        { title: "Platforms", text: "For access to Exportunity platforms and operator tools.", status: "owner-provided" },
        { title: "Investors and partners", text: "For strategic partnerships and long-term collaboration.", status: "owner-provided" },
      ],
    },
  ],
};
