export type CountryOption = { code: string; name: string };

// Fallback ISO-3166 alpha-2 codes (used when Intl.supportedValuesOf is unavailable)
const ISO_ALPHA2_FALLBACK: string[] = [
  "AF","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ",
  "BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BV","BR","IO","BN","BG","BF","BI",
  "CV","KH","CM","CA","KY","CF","TD","CL","CN","CX","CC","CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ",
  "DK","DJ","DM","DO",
  "EC","EG","SV","GQ","ER","EE","SZ","ET",
  "FK","FO","FJ","FI","FR","GF","PF","TF","GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY",
  "HT","HM","VA","HN","HK","HU",
  "IS","IN","ID","IR","IQ","IE","IM","IL","IT",
  "JM","JP","JE","JO",
  "KZ","KE","KI","KP","KR","KW","KG",
  "LA","LV","LB","LS","LR","LY","LI","LT","LU",
  "MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS","MA","MZ","MM",
  "NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","MK","MP","NO",
  "OM",
  "PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR",
  "QA",
  "RE","RO","RU","RW",
  "BL","SH","KN","LC","MF","PM","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS","SS","ES","LK","SD","SR","SJ","SE","CH","SY",
  "TW","TJ","TZ","TH","TL","TG","TK","TO","TT","TN","TR","TM","TC","TV",
  "UG","UA","AE","GB","UM","US","UY","UZ",
  "VU","VE","VN","VG","VI",
  "WF","EH",
  "YE",
  "ZM","ZW",
];

const countryCache = new Map<string, CountryOption[]>();

function getRegionCodes(): string[] {
  const supported = (Intl as any)?.supportedValuesOf;
  if (typeof supported === "function") {
    try {
      const regions = supported("region") as string[];
      return regions.filter((code) => typeof code === "string" && code.length === 2);
    } catch {
      return ISO_ALPHA2_FALLBACK;
    }
  }
  return ISO_ALPHA2_FALLBACK;
}

function getDisplayName(code: string, locale: string): string {
  const DisplayNames = (Intl as any)?.DisplayNames;
  if (typeof DisplayNames === "function") {
    try {
      const dn = new DisplayNames([locale], { type: "region" });
      return dn.of(code) || code;
    } catch {
      return code;
    }
  }
  return code;
}

export function getCountryOptions(locale = "en"): CountryOption[] {
  const key = locale.toLowerCase();
  const cached = countryCache.get(key);
  if (cached) return cached;

  const options = getRegionCodes()
    .map((code) => ({ code, name: getDisplayName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  countryCache.set(key, options);
  return options;
}

export function getSuggestedCountryCode(): string | null {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (tz === "Africa/Abidjan") return "CI";

  const lang = (navigator.language || "").toLowerCase();
  if (lang.includes("fr-ci")) return "CI";

  return null;
}

