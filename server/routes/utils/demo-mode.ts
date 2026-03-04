import type { Request } from "express";

function asSingleHeader(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : String(value[0] ?? "");
  return String(value ?? "");
}

export function isDemoModeRequest(req: Request): boolean {
  const headerRaw = asSingleHeader(req.headers["x-demo-mode"]);
  const header = headerRaw.trim().toLowerCase();
  if (header === "1" || header === "true" || header === "yes") return true;

  const query = (req.query as any)?.demo;
  const queryValue = Array.isArray(query) ? query[0] : query;
  const q = String(queryValue ?? "").trim().toLowerCase();
  return q === "1" || q === "true" || q === "yes";
}

function pick<T>(items: readonly T[], seed: number): T {
  const idx = Math.abs(seed) % items.length;
  return items[idx];
}

function mix(seed: number, salt: number): number {
  // Deterministic, stable across runtimes.
  return (seed * 1664525 + salt * 1013904223) >>> 0;
}

const COMPANY_PREFIXES = [
  "Sahel",
  "Sankofa",
  "Kora",
  "Nimba",
  "Teranga",
  "Baobab",
  "Savannah",
  "Atlas",
  "Volta",
  "Okavango",
  "Zambezi",
  "Horizon",
  "Aurora",
  "Solstice",
  "Equinox",
  "Vertex",
  "Oasis",
  "Marula",
  "Cedar",
  "Lagoon",
  "Nile",
  "Kilimanjaro",
  "Goldcrest",
  "Keystone",
] as const;

const COMPANY_CORES = [
  "Gold",
  "Minerals",
  "Metals",
  "Commodities",
  "Trading",
  "Exchange",
  "Partners",
  "Holdings",
  "Resources",
  "Supply",
  "Logistics",
  "Capital",
  "Vault",
] as const;

const COMPANY_FORMS = ["SARL", "SA", "Ltd", "Group"] as const;

const PERSON_FIRST = [
  "Amara",
  "Aicha",
  "Binta",
  "Kofi",
  "Fatou",
  "Nana",
  "Idrissa",
  "Mariama",
  "Sadio",
  "Salif",
  "Awa",
  "Moussa",
  "Kadija",
  "Oumar",
  "Zainab",
  "Ibrahim",
  "Adama",
  "Seydou",
  "Aminata",
  "Mamadou",
] as const;

const PERSON_LAST = [
  "Diallo",
  "Mensah",
  "Traore",
  "Kouassi",
  "Kone",
  "Sarr",
  "Diop",
  "Camara",
  "Ouattara",
  "Toure",
  "Sanogo",
  "Keita",
  "Fall",
  "Bah",
  "Sy",
  "Cisse",
  "Niane",
  "Nguema",
] as const;

export function demoCompanyName(seed: number, kind: "bureau" | "seller" = "seller"): string {
  const s1 = mix(seed, kind === "bureau" ? 11 : 17);
  const s2 = mix(seed, kind === "bureau" ? 29 : 31);
  const s3 = mix(seed, kind === "bureau" ? 43 : 47);
  const prefix = pick(COMPANY_PREFIXES, s1);
  const core = pick(COMPANY_CORES, s2);
  const form = pick(COMPANY_FORMS, s3);
  return `${prefix} ${core} ${form}`;
}

export function demoPersonName(seed: number): string {
  const s1 = mix(seed, 101);
  const s2 = mix(seed, 251);
  const first = pick(PERSON_FIRST, s1);
  const last = pick(PERSON_LAST, s2);
  return `${first} ${last}`;
}

export function demoEmail(seed: number): string {
  const suffix = String(Math.abs(mix(seed, 97)) % 10000).padStart(4, "0");
  return `demo.${suffix}@example.test`;
}

