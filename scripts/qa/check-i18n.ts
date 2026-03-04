import fs from "fs";
import path from "path";
import { LOCALE_TRANSLATIONS } from "../../client/src/contexts/LocaleContext";

type Language = keyof typeof LOCALE_TRANSLATIONS;

const CLIENT_SRC_ROOT = path.join(process.cwd(), "client", "src");

const walkFiles = (dir: string, out: string[] = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
};

const extractTranslationKeys = (content: string) => {
  const keys: string[] = [];
  const rx = /\bt\s*\(\s*["']([^"'\\]+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(content)) !== null) {
    keys.push(match[1]);
  }
  return keys;
};

const base = LOCALE_TRANSLATIONS.en;
const baseKeys = Object.keys(base).sort();

const missingByLang: Record<string, string[]> = {};
const extraByLang: Record<string, string[]> = {};

(Object.keys(LOCALE_TRANSLATIONS) as Language[]).forEach((lang) => {
  const dict = LOCALE_TRANSLATIONS[lang] ?? {};
  const dictKeys = Object.keys(dict);

  const missing = baseKeys.filter((key) => !(key in dict));
  const extra = dictKeys.filter((key) => !(key in base));

  if (missing.length) missingByLang[lang] = missing;
  if (extra.length) extraByLang[lang] = extra;
});

const usedKeys = new Set<string>();
walkFiles(CLIENT_SRC_ROOT).forEach((filePath) => {
  const content = fs.readFileSync(filePath, "utf-8");
  extractTranslationKeys(content).forEach((key) => usedKeys.add(key));
});

const missingInEn = Array.from(usedKeys).filter((key) => !(key in base)).sort();

if (missingInEn.length) {
  console.error("[i18n] Missing keys in LOCALE_TRANSLATIONS.en (used in code):");
  missingInEn.forEach((key) => console.error(`- ${key}`));
}

if (Object.keys(missingByLang).length) {
  console.error("[i18n] Missing keys per language (must match en):");
  Object.entries(missingByLang).forEach(([lang, keys]) => {
    console.error(`\n[${lang}] missing ${keys.length}:`);
    keys.forEach((key) => console.error(`- ${key}`));
  });
}

if (Object.keys(extraByLang).length) {
  console.error("[i18n] Extra keys per language (not present in en):");
  Object.entries(extraByLang).forEach(([lang, keys]) => {
    console.error(`\n[${lang}] extra ${keys.length}:`);
    keys.forEach((key) => console.error(`- ${key}`));
  });
}

if (missingInEn.length || Object.keys(missingByLang).length || Object.keys(extraByLang).length) {
  console.error("[i18n] i18n check failed.");
  process.exit(1);
}

console.log("[i18n] i18n check passed.");

