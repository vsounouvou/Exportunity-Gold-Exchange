import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useLocale } from "@/contexts/LocaleContext";

type GoldPriceResponse = {
  prices?: {
    usd?: { perOunce?: number; perGram?: number };
    xof?: { perGram?: number; perOunce?: number };
  };
  fetchedAt?: string;
};

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value: number, currency: string, locale: string) {
  if (!Number.isFinite(value) || value <= 0) return "--";
  try {
    const maxDigits = currency === "XOF" ? 0 : 2;
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: maxDigits }).format(value);
  } catch {
    const decimals = currency === "XOF" ? 0 : 2;
    return `${value.toFixed(decimals)} ${currency}`;
  }
}

export function GoldQuotesPanel() {
  const { language, currency, setCurrency } = useLocale();
  const locale = language === "fr" ? "fr-FR" : language === "ar" ? "ar-SA" : "en-US";

  const quotesQuery = useQuery<GoldPriceResponse>({
    queryKey: ["/api/gold-exchange/lbma-price"],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/gold-exchange/lbma-price"), { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load gold quotes");
      return res.json();
    },
    staleTime: 60_000,
    retry: 1,
  });

  const usdOz = asNumber(quotesQuery.data?.prices?.usd?.perOunce);
  const usdG = asNumber(quotesQuery.data?.prices?.usd?.perGram || (usdOz > 0 ? usdOz / 31.1034768 : 0));
  const xofG = asNumber(quotesQuery.data?.prices?.xof?.perGram || (usdG > 0 ? usdG * 615 : 0));
  const xofOz = asNumber(quotesQuery.data?.prices?.xof?.perOunce || (xofG > 0 ? xofG * 31.1034768 : 0));

  const asOf = useMemo(() => {
    const raw = String(quotesQuery.data?.fetchedAt || "").trim();
    if (!raw) return language === "fr" ? "direct" : "live";
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return language === "fr" ? "direct" : "live";
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }, [language, locale, quotesQuery.data?.fetchedAt]);

  const isFrench = language === "fr";
  const chartLocale = isFrench ? "fr" : language === "ar" ? "ar_AE" : "en";

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-[#0a0f1a]/90 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-200">{isFrench ? "Cours de l'or en direct" : "Live Gold Quotes"}</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/60">{isFrench ? "Mis à jour" : "as of"} {asOf}</span>
          <div className="hidden md:flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1">
            {(["XOF", "USD", "AED"] as const).map((curr) => (
              <button
                key={curr}
                type="button"
                className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                  currency === curr
                    ? "bg-amber-500/25 text-amber-200 border border-amber-500/40"
                    : "text-white/60 hover:text-white"
                }`}
                onClick={() => setCurrency(curr)}
              >
                {curr}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="text-[10px] text-white/60">{isFrench ? "Prix au gramme (XOF)" : "Price per gram (XOF)"}</div>
          <div className="mt-1 text-sm font-semibold text-white">{money(xofG, "XOF", locale)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="text-[10px] text-white/60">{isFrench ? "Prix à l'once (XOF)" : "Price per ounce (XOF)"}</div>
          <div className="mt-1 text-sm font-semibold text-white">{money(xofOz, "XOF", locale)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="text-[10px] text-white/60">{isFrench ? "Référence USD (g)" : "USD reference (g)"}</div>
          <div className="mt-1 text-sm font-semibold text-white">{money(usdG, "USD", locale)}</div>
        </div>
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
        <iframe
          title="XAUUSD chart"
          className="h-28 w-full bg-black"
          src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_xauusd&symbol=OANDA%3AXAUUSD&interval=60&hidesidetoolbar=1&symboledit=1&saveimage=0&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=0&hideideas=1&locale=${encodeURIComponent(chartLocale)}`}
        />
      </div>
    </section>
  );
}
