import { Globe, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale, type Language, type Currency, languageNames, currencyNames } from "@/contexts/LocaleContext";

const languageBadges: Record<Language, string> = {
  en: "GB",
  fr: "FR",
  ar: "AR",
};

const currencyBadges: Record<Currency, string> = {
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  XOF: "XOF",
  GHS: "GHS",
  NGN: "NGN",
  KES: "KES",
  AED: "AED",
};

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, currency, setLanguage, setCurrency, t } = useLocale();

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-white/70 hover:text-white hover:bg-white/10">
            <Globe className="h-4 w-4 mr-1" />
            <span className="text-xs">
              {languageBadges[language]} {currencyBadges[currency]}
            </span>
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700 text-white min-w-[180px]">
          <DropdownMenuLabel className="text-gray-400 text-xs">{t("settings.language")}</DropdownMenuLabel>
          {(Object.keys(languageNames) as Language[]).map((lang) => (
            <DropdownMenuItem
              key={lang}
              className={`cursor-pointer ${language === lang ? "bg-amber-500/20 text-amber-400" : "hover:bg-gray-800"}`}
              onClick={() => setLanguage(lang)}
            >
              <span className="mr-2 text-[11px]">{languageBadges[lang]}</span>
              {languageNames[lang]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-gray-700" />
          <DropdownMenuLabel className="text-gray-400 text-xs">{t("settings.currency")}</DropdownMenuLabel>
          {(Object.keys(currencyNames) as Currency[]).map((curr) => (
            <DropdownMenuItem
              key={curr}
              className={`cursor-pointer ${currency === curr ? "bg-amber-500/20 text-amber-400" : "hover:bg-gray-800"}`}
              onClick={() => setCurrency(curr)}
            >
              <span className="mr-2 text-[11px]">{currencyBadges[curr]}</span>
              {currencyNames[curr]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-gray-800/50 border-gray-700 text-white hover:bg-gray-800 hover:text-white"
          >
            <span className="mr-2 text-[11px]">{languageBadges[language]}</span>
            {languageNames[language]}
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700 text-white">
          <DropdownMenuLabel className="text-gray-400">{t("settings.language")}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-gray-700" />
          {(Object.keys(languageNames) as Language[]).map((lang) => (
            <DropdownMenuItem
              key={lang}
              className={`cursor-pointer ${language === lang ? "bg-amber-500/20 text-amber-400" : "hover:bg-gray-800"}`}
              onClick={() => setLanguage(lang)}
            >
              <span className="mr-2 text-[11px]">{languageBadges[lang]}</span>
              {languageNames[lang]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-gray-800/50 border-gray-700 text-white hover:bg-gray-800 hover:text-white"
          >
            <span className="mr-2 text-[11px]">{currencyBadges[currency]}</span>
            {currency}
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700 text-white">
          <DropdownMenuLabel className="text-gray-400">{t("settings.currency")}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-gray-700" />
          {(Object.keys(currencyNames) as Currency[]).map((curr) => (
            <DropdownMenuItem
              key={curr}
              className={`cursor-pointer ${currency === curr ? "bg-amber-500/20 text-amber-400" : "hover:bg-gray-800"}`}
              onClick={() => setCurrency(curr)}
            >
              <span className="mr-2 text-[11px]">{currencyBadges[curr]}</span>
              {currencyNames[curr]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
