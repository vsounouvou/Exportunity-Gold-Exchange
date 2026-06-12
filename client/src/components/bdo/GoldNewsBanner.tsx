import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useLocale } from "@/contexts/LocaleContext";

type GoldNewsItem = {
  title: string;
  source: string;
  url: string;
  publishedAt?: string | null;
  summary?: string | null;
  topic?: string | null;
};

type GoldNewsResponse = {
  items?: GoldNewsItem[];
};

const FALLBACK_ITEMS: GoldNewsItem[] = [
  {
    title: "Mines d'or en Côte d'Ivoire : activité et modernisation",
    source: "Brief industrie",
    url: "/industrie-miniere",
    summary: "Points clés sur la production, les permis et la modernisation du secteur.",
    topic: "cote_divoire_mining",
  },
  {
    title: "Cadre réglementaire : traçabilité, conformité et exportation d'or",
    source: "Brief conformité",
    url: "/reglementation",
    summary: "Repère rapide des obligations légales et des standards de contrôle.",
    topic: "regulation",
  },
];

const AUTHORITY_CARDS = [
  {
    title: "Mines d'or en Côte d'Ivoire",
    summary: "Production, zones actives, acteurs et priorités de modernisation.",
    href: "/industrie-miniere",
    tag: "Industrie minière",
  },
  {
    title: "Cadre légal de l'or",
    summary: "Règles clés, contrôle qualité, exigences documentaires et supervision.",
    href: "/reglementation",
    tag: "Cadre réglementaire",
  },
  {
    title: "Exportation d'or et conformité",
    summary: "Trajectoire mines -> certification -> expédition sécurisée vers les marchés cibles.",
    href: "/actualites",
    tag: "Exportation d'or",
  },
  {
    title: "Guide professionnel",
    summary: "Espace Pro pour mines, négociants, maisons et acheteurs institutionnels.",
    href: "/espace-pro",
    tag: "Espace Pro",
  },
] as const;

function sanitizeSummary(value: string | null | undefined): string {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeItems(items: GoldNewsItem[] | undefined): GoldNewsItem[] {
  const rows = Array.isArray(items) ? items : [];
  const clean = rows
    .map((item) => ({
      title: String(item?.title || "").trim(),
      source: String(item?.source || "News").trim(),
      url: String(item?.url || "").trim(),
      summary: sanitizeSummary(item?.summary),
      publishedAt: String(item?.publishedAt || "").trim(),
      topic: String(item?.topic || "").trim(),
    }))
    .filter((item) => item.title.length > 0 && item.url.length > 0);
  return clean.length ? clean : FALLBACK_ITEMS;
}

function inferTopic(item: GoldNewsItem): string {
  const fromApi = String(item.topic || "").trim().toLowerCase();
  if (fromApi) return fromApi;
  const text = `${item.title} ${item.summary || ""}`.toLowerCase();
  if (text.includes("reglement") || text.includes("regulation") || text.includes("legal")) return "regulation";
  if (text.includes("cote d'ivoire") || text.includes("côte d'ivoire") || text.includes("ivoire")) {
    return "cote_divoire_mining";
  }
  if (text.includes("mine") || text.includes("mining")) return "industry";
  if (text.includes("export") || text.includes("compliance") || text.includes("tracabil")) return "export_compliance";
  return "market_news";
}

function topicLabel(topic: string): string {
  if (topic === "cote_divoire_mining") return "Mines d'or en Côte d'Ivoire";
  if (topic === "regulation") return "Cadre réglementaire";
  if (topic === "export_compliance") return "Exportation d'or";
  if (topic === "industry") return "Industrie aurifère";
  return "Actualités du marché";
}

export function GoldNewsBanner() {
  const { language } = useLocale();
  const isFrench = language === "fr";

  const query = useQuery<GoldNewsResponse>({
    queryKey: ["/api/news/gold"],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/news/gold"), { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load gold news");
      return res.json();
    },
    staleTime: 15 * 60_000,
    retry: 1,
  });

  const items = useMemo(() => safeItems(query.data?.items), [query.data?.items]);
  const featured = items[0];
  const side = items.slice(1, 5);

  return (
    <section className="rounded-2xl border border-[#D4AF37]/20 bg-[linear-gradient(180deg,rgba(11,11,13,0.92),rgba(13,27,42,0.58))] p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-['Cinzel',serif] text-sm font-semibold text-[#F1D27A]">
          {isFrench ? "Actualités & Réglementation" : "Gold News & Regulation"}
        </h3>
        <a href="/actualites" className="text-[11px] text-[#E8C873] hover:text-[#F1D27A]">
          {isFrench ? "Voir tout" : "View all"}
        </a>
      </div>
      <p className="mb-2 text-[11px] text-white/60">
        {isFrench
          ? "Des mines africaines aux coffres des Émirats : tracé, certifié, estampillé."
          : "From African mines to UAE vaults: traced, certified, stamped."}
      </p>

      <div className="grid gap-2 xl:grid-cols-12">
        <a
          href={featured?.url || "#"}
          target="_blank"
          rel="noreferrer"
          className="xl:col-span-4 rounded-lg border border-white/10 bg-black/20 p-2 hover:border-[#D4AF37]/40"
        >
          <div className="text-[10px] uppercase tracking-wide text-[#E8C873]/80">
            {topicLabel(inferTopic(featured || FALLBACK_ITEMS[0]))}
          </div>
          <div className="mt-1 line-clamp-2 text-xs font-semibold text-white">{featured?.title || "Loading..."}</div>
          <div className="mt-1 line-clamp-2 text-[11px] text-white/65">
            {sanitizeSummary(featured?.summary).slice(0, 180)}
          </div>
          <div className="mt-1 text-[10px] text-white/50">{featured?.source || "News"}</div>
        </a>

        <div className="xl:col-span-4 grid gap-2 sm:grid-cols-2">
          {side.map((item, index) => (
            <a
              key={`${item.url}-${index}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/10 bg-black/20 p-2 hover:border-[#D4AF37]/40"
            >
              <div className="text-[10px] uppercase tracking-wide text-white/60">{topicLabel(inferTopic(item))}</div>
              <div className="mt-1 line-clamp-2 text-[12px] font-medium text-white">{item.title}</div>
              <div className="mt-1 line-clamp-1 text-[10px] text-white/50">{item.source}</div>
            </a>
          ))}
        </div>

        <div className="xl:col-span-4 rounded-lg border border-white/10 bg-black/20 p-2">
          <h4 className="font-['Cinzel',serif] text-xs font-semibold text-[#F1D27A]">
            {isFrench ? "Industrie minière & Cadre réglementaire" : "Mining Industry & Regulatory Framework"}
          </h4>
          <div className="mt-2 space-y-2">
            {AUTHORITY_CARDS.map((card) => (
              <a
                key={card.title}
                href={card.href}
                className="block rounded-lg border border-white/10 bg-black/25 p-2 hover:border-[#D4AF37]/40"
              >
                <div className="text-[10px] uppercase tracking-wide text-[#E8C873]/85">{card.tag}</div>
                <div className="mt-1 line-clamp-1 text-[12px] font-medium text-white">{card.title}</div>
                <div className="line-clamp-2 text-[11px] text-white/60">{card.summary}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
