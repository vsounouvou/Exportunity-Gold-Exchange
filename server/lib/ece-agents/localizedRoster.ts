type SeedAgentProfile = {
  displayName: string;
  roleTitle: string;
  templateCode: "procurement_agent" | "compliance_agent" | "outreach_agent" | "seo_agent";
  language: string;
  goals: string;
};

type RosterLocale = "BJ" | "CI" | "AE" | "RU" | "GLOBAL";

const PHONE_PREFIX_LOCALE: Array<{ prefix: string; locale: RosterLocale }> = [
  { prefix: "+229", locale: "BJ" },
  { prefix: "+225", locale: "CI" },
  { prefix: "+971", locale: "AE" },
  { prefix: "+7", locale: "RU" },
];

const COUNTRY_HINTS: Array<{ locale: RosterLocale; hints: string[] }> = [
  { locale: "BJ", hints: ["bj", "benin", "republique du benin"] },
  { locale: "CI", hints: ["ci", "cote divoire", "cote d ivoire", "ivory coast", "civ"] },
  { locale: "AE", hints: ["ae", "uae", "united arab emirates", "emirats arabes unis"] },
  { locale: "RU", hints: ["ru", "russia", "russian federation", "russie"] },
];

const TIMEZONE_HINTS: Array<{ locale: RosterLocale; hints: string[] }> = [
  { locale: "BJ", hints: ["africa/porto", "africa/cotonou"] },
  { locale: "CI", hints: ["africa/abidjan"] },
  { locale: "AE", hints: ["asia/dubai"] },
  { locale: "RU", hints: ["europe/moscow", "asia/yekaterinburg", "asia/novosibirsk"] },
];

const ROSTERS: Record<RosterLocale, SeedAgentProfile[]> = {
  BJ: [
    {
      displayName: "Kossi Agossou",
      roleTitle: "Operations Manager",
      templateCode: "procurement_agent",
      language: "fr",
      goals: "Route work across the team, keep threads structured, and convert messages into tracked actions.",
    },
    {
      displayName: "Rosine Dossou",
      roleTitle: "Compliance Agent",
      templateCode: "compliance_agent",
      language: "fr",
      goals: "Keep KYC/KYB files complete and raise approval gates before high-impact actions.",
    },
    {
      displayName: "Willyn Houngbedji",
      roleTitle: "Sales Agent",
      templateCode: "outreach_agent",
      language: "fr",
      goals: "Run structured outbound follow-ups and keep lead pipeline updates in chat.",
    },
    {
      displayName: "Aicha Adjovi",
      roleTitle: "Support Agent",
      templateCode: "outreach_agent",
      language: "fr",
      goals: "Handle inbound support requests with clear next steps and escalation notes.",
    },
    {
      displayName: "Gildas Avocevo",
      roleTitle: "Accounting Agent",
      templateCode: "compliance_agent",
      language: "fr",
      goals: "Track reconciliation requests and prepare approval-ready finance summaries.",
    },
  ],
  CI: [
    {
      displayName: "Kader Bamba",
      roleTitle: "Operations Manager",
      templateCode: "procurement_agent",
      language: "fr",
      goals: "Route work across the team, keep threads structured, and convert messages into tracked actions.",
    },
    {
      displayName: "Mariam Traore",
      roleTitle: "Compliance Agent",
      templateCode: "compliance_agent",
      language: "fr",
      goals: "Validate partner compliance packs and keep audit trails complete.",
    },
    {
      displayName: "Yao Kouassi",
      roleTitle: "Sales Agent",
      templateCode: "outreach_agent",
      language: "fr",
      goals: "Create outreach sequences and convert qualified opportunities to actions.",
    },
    {
      displayName: "Serge Yapi",
      roleTitle: "Support Agent",
      templateCode: "outreach_agent",
      language: "fr",
      goals: "Respond to customer requests fast with clear owner and timeline.",
    },
    {
      displayName: "Nguessan Affoue",
      roleTitle: "Accounting Agent",
      templateCode: "compliance_agent",
      language: "fr",
      goals: "Track invoices, payment confirmations, and monthly finance handoff notes.",
    },
  ],
  AE: [
    {
      displayName: "Hassan Al Suwaidi",
      roleTitle: "Operations Manager",
      templateCode: "procurement_agent",
      language: "en",
      goals: "Route work across the team, keep threads structured, and convert messages into tracked actions.",
    },
    {
      displayName: "Fatima Al Mazrouei",
      roleTitle: "Compliance Agent",
      templateCode: "compliance_agent",
      language: "en",
      goals: "Ensure policy and document compliance before any external execution.",
    },
    {
      displayName: "Omar Al Mansouri",
      roleTitle: "Sales Agent",
      templateCode: "outreach_agent",
      language: "en",
      goals: "Build high-value prospect lists and drive follow-up cadences.",
    },
    {
      displayName: "Layla Al Nuaimi",
      roleTitle: "Support Agent",
      templateCode: "outreach_agent",
      language: "en",
      goals: "Handle inbound support threads and convert requests to tracked tasks.",
    },
    {
      displayName: "Noura Al Hashimi",
      roleTitle: "Accounting Agent",
      templateCode: "compliance_agent",
      language: "en",
      goals: "Prepare finance follow-ups, reconciliations, and payout checks.",
    },
  ],
  RU: [
    {
      displayName: "Dmitri Sokolov",
      roleTitle: "Operations Manager",
      templateCode: "procurement_agent",
      language: "ru",
      goals: "Route work across the team, keep threads structured, and convert messages into tracked actions.",
    },
    {
      displayName: "Anastasia Morozova",
      roleTitle: "Compliance Agent",
      templateCode: "compliance_agent",
      language: "ru",
      goals: "Track compliance checks and approval gates for each high-impact action.",
    },
    {
      displayName: "Sergey Ivanov",
      roleTitle: "Sales Agent",
      templateCode: "outreach_agent",
      language: "ru",
      goals: "Run outreach plans and move qualified opportunities to execution.",
    },
    {
      displayName: "Mikhail Petrov",
      roleTitle: "Support Agent",
      templateCode: "outreach_agent",
      language: "ru",
      goals: "Resolve customer requests quickly with clear owner assignments.",
    },
    {
      displayName: "Ekaterina Volkova",
      roleTitle: "Accounting Agent",
      templateCode: "compliance_agent",
      language: "ru",
      goals: "Prepare financial follow-ups, reconciliations, and payout checks.",
    },
  ],
  GLOBAL: [
    {
      displayName: "Jordan Clarke",
      roleTitle: "Operations Manager",
      templateCode: "procurement_agent",
      language: "en",
      goals: "Route work across the team, keep threads structured, and convert messages into tracked actions.",
    },
    {
      displayName: "Maya Brooks",
      roleTitle: "Compliance Agent",
      templateCode: "compliance_agent",
      language: "en",
      goals: "Keep compliance records complete and pre-validate critical actions.",
    },
    {
      displayName: "Noah Bennett",
      roleTitle: "Sales Agent",
      templateCode: "outreach_agent",
      language: "en",
      goals: "Convert qualified leads into tracked outreach actions.",
    },
    {
      displayName: "Lea Dupont",
      roleTitle: "Support Agent",
      templateCode: "outreach_agent",
      language: "fr",
      goals: "Handle inbound support and keep all follow-ups visible in chat.",
    },
    {
      displayName: "Samir Haddad",
      roleTitle: "Accounting Agent",
      templateCode: "compliance_agent",
      language: "en",
      goals: "Track finance and reconciliation tasks with clear audit notes.",
    },
  ],
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s/+_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferLocaleFromPhone(phone: unknown): RosterLocale | null {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;
  const normalized = raw.startsWith("+") ? `+${raw.replace(/[^\d]/g, "")}` : `+${raw.replace(/[^\d]/g, "")}`;
  const match = PHONE_PREFIX_LOCALE.find((item) => normalized.startsWith(item.prefix));
  return match?.locale || null;
}

function inferLocaleFromCountry(country: unknown): RosterLocale | null {
  const value = normalize(country);
  if (!value) return null;
  for (const item of COUNTRY_HINTS) {
    if (item.hints.some((hint) => value.includes(hint))) {
      return item.locale;
    }
  }
  return null;
}

function inferLocaleFromTimezone(timezone: unknown): RosterLocale | null {
  const value = normalize(timezone);
  if (!value) return null;
  for (const item of TIMEZONE_HINTS) {
    if (item.hints.some((hint) => value.includes(hint))) {
      return item.locale;
    }
  }
  return null;
}

export function resolveRosterLocale(user: any): RosterLocale {
  return (
    inferLocaleFromCountry(user?.country) ||
    inferLocaleFromPhone(user?.phone) ||
    inferLocaleFromTimezone(user?.timezone) ||
    inferLocaleFromCountry(user?.metadata?.country) ||
    inferLocaleFromCountry(user?.metadata?.locale) ||
    "GLOBAL"
  );
}

export function buildLocalizedSeedRoster(user: any): { locale: RosterLocale; agents: SeedAgentProfile[] } {
  const locale = resolveRosterLocale(user);
  return {
    locale,
    agents: ROSTERS[locale] || ROSTERS.GLOBAL,
  };
}
