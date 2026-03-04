import crypto from "crypto";

type CompanyBrand = {
  companyName: string;
  website: string;
  defaultDomain: string;
};

export type AgentProfessionalProfile = {
  firstName: string;
  lastName: string;
  displayName: string;
  role: string;
  companyName: string;
  website: string;
  emailAddress: string;
};

type ResolveProfileInput = {
  tenantKey: string;
  tenantName?: string | null;
  agentKey: string;
  agentName?: string | null;
  agentRole?: string | null;
  preferredDomain?: string | null;
};

const PROFILE_BY_AGENT_KEY: Record<string, { firstName: string; lastName: string; role: string }> = {
  diego_alvarez: { firstName: "Diego", lastName: "Alvarez", role: "Platform Lead" },
  samuel_mensah: { firstName: "Samuel", lastName: "Mensah", role: "Operations Coordinator" },
  awa_bamba: { firstName: "Awa", lastName: "Bamba", role: "Treasury & Payments Controller" },
  jean_baptiste_ouattara: { firstName: "Jean-Baptiste", lastName: "Ouattara", role: "Marketplace Lead" },
  marketing: { firstName: "Amara", lastName: "Diallo", role: "Platform Lead" },
  ops: { firstName: "Samuel", lastName: "Mensah", role: "Operations Coordinator" },
  wallet: { firstName: "Awa", lastName: "Bamba", role: "Treasury & Payments Controller" },
  accounting: { firstName: "Awa", lastName: "Bamba", role: "Treasury & Payments Controller" },
  sales: { firstName: "Koffi", lastName: "Kouassi", role: "Marketplace Lead" },
  client_hunter: { firstName: "Koffi", lastName: "Kouassi", role: "Marketplace Lead" },
};

const FALLBACK_FIRST_NAMES = [
  "Amara",
  "Samuel",
  "Awa",
  "Koffi",
  "Mariam",
  "Fatou",
  "Yao",
  "Nadia",
  "Ibrahim",
  "Aminata",
];

const FALLBACK_LAST_NAMES = [
  "Diallo",
  "Mensah",
  "Bamba",
  "Kouassi",
  "Konate",
  "Traore",
  "Sow",
  "Kamara",
  "Ouattara",
  "Bello",
];

function normalizeLetters(value: unknown) {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeNameToken(value: unknown) {
  return normalizeLetters(value)
    .replace(/[^A-Za-z-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseWord(value: string) {
  if (!value) return "";
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

function toLocalPartToken(value: string) {
  return normalizeLetters(value)
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
}

function normalizeDomain(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.-]/g, "");
}

function fallbackBrand(tenantKey: string, tenantName?: string | null): CompanyBrand {
  const normalizedTenantKey = String(tenantKey || "").trim().toLowerCase();
  if (normalizedTenantKey === "bdo") {
    return {
      companyName: "Bourse de l'Or",
      website: "https://boursedelor.com",
      defaultDomain: "boursedelor.com",
    };
  }
  if (normalizedTenantKey === "exportunity") {
    return {
      companyName: "Exportunity",
      website: "https://exportunity.net",
      defaultDomain: "exportunity.net",
    };
  }
  const companyName = String(tenantName || "Exportunity").trim() || "Exportunity";
  return {
    companyName,
    website: "https://exportunity.net",
    defaultDomain: "exportunity.net",
  };
}

function inferRole(agentKey: string, roleHint?: string | null) {
  const role = String(roleHint || "").trim();
  if (role) return role;

  const key = String(agentKey || "").toLowerCase();
  if (/(wallet|accounting|treasury|payment|finance)/.test(key)) return "Treasury & Payments Controller";
  if (/(ops|support|coordinator|compliance)/.test(key)) return "Operations Coordinator";
  if (/(market|sales|client|procurement)/.test(key)) return "Marketplace Lead";
  if (/(marketing|platform|data|seo|media)/.test(key)) return "Platform Lead";
  return "Operations Lead";
}

function splitNameFromDisplayName(displayName?: string | null): { firstName: string; lastName: string } | null {
  const raw = normalizeLetters(displayName || "");
  if (!raw) return null;
  const tokens = raw
    .split(/\s+/g)
    .map((token) => normalizeNameToken(token))
    .filter(Boolean);
  if (tokens.length < 2) return null;
  const firstName = titleCaseWord(tokens[0]);
  const lastName = titleCaseWord(tokens[tokens.length - 1]);
  if (!firstName || !lastName) return null;
  return { firstName, lastName };
}

function splitNameFromAgentKey(agentKey: string): { firstName: string; lastName: string } | null {
  const tokens = String(agentKey || "")
    .split(/[_\-.]+/g)
    .map((token) => normalizeNameToken(token))
    .filter(Boolean)
    .filter((token) => token.length >= 2)
    .filter((token) => !["agent", "team", "lead", "ops", "sales", "wallet", "support", "data"].includes(token.toLowerCase()));

  if (tokens.length < 2) return null;
  const firstName = titleCaseWord(tokens[0]);
  const lastName = titleCaseWord(tokens[tokens.length - 1]);
  if (!firstName || !lastName) return null;
  return { firstName, lastName };
}

function deterministicName(agentKey: string) {
  const hash = crypto.createHash("sha1").update(agentKey || "agent").digest();
  const first = FALLBACK_FIRST_NAMES[hash[0] % FALLBACK_FIRST_NAMES.length];
  const last = FALLBACK_LAST_NAMES[hash[1] % FALLBACK_LAST_NAMES.length];
  return { firstName: first, lastName: last };
}

export function resolveAgentProfessionalProfile(input: ResolveProfileInput): AgentProfessionalProfile {
  const agentKey = String(input.agentKey || "").trim().toLowerCase();
  const profile = PROFILE_BY_AGENT_KEY[agentKey] || null;
  const brand = fallbackBrand(input.tenantKey, input.tenantName);
  const domain = normalizeDomain(input.preferredDomain) || brand.defaultDomain;

  const nameFromDisplay = splitNameFromDisplayName(input.agentName);
  const nameFromKey = splitNameFromAgentKey(agentKey);
  const deterministic = deterministicName(agentKey);
  const firstName = titleCaseWord(
    normalizeNameToken(profile?.firstName || nameFromDisplay?.firstName || nameFromKey?.firstName || deterministic.firstName),
  );
  const lastName = titleCaseWord(
    normalizeNameToken(profile?.lastName || nameFromDisplay?.lastName || nameFromKey?.lastName || deterministic.lastName),
  );

  const safeFirst = firstName || deterministic.firstName;
  const safeLast = lastName || deterministic.lastName;
  const localFirst = toLocalPartToken(safeFirst);
  const localLast = toLocalPartToken(safeLast);
  const localPart = `${localFirst}.${localLast}`.replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
  const emailAddress = `${localPart}@${domain}`;
  const displayName = `${safeFirst} ${safeLast}`.trim();
  const role = profile?.role || inferRole(agentKey, input.agentRole);

  return {
    firstName: safeFirst,
    lastName: safeLast,
    displayName,
    role,
    companyName: brand.companyName,
    website: brand.website,
    emailAddress,
  };
}
