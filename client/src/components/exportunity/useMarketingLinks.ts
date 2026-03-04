import marketingSiteConfig from "@/content/marketing/site";
import { useLocale } from "@/contexts/LocaleContext";
import { appendQueryParamsToUrl } from "@/lib/url";

function deriveCountryFromNavigator(): string | null {
  if (typeof navigator === "undefined") return null;
  const lang = String(navigator.language || "").trim();
  const region = lang.split("-")[1]?.toUpperCase() || "";
  return region && /^[A-Z]{2}$/.test(region) ? region : null;
}

export function useMarketingPlatformHref() {
  const { language, currency } = useLocale();
  const country = deriveCountryFromNavigator();
  return appendQueryParamsToUrl(marketingSiteConfig.platformLink, {
    lang: language,
    currency,
    country,
  });
}

export function useMarketingMemberLoginHref() {
  const { language, currency } = useLocale();
  const country = deriveCountryFromNavigator();
  return appendQueryParamsToUrl(marketingSiteConfig.memberLoginLink, {
    lang: language,
    currency,
    country,
  });
}

