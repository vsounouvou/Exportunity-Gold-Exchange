import { useMemo } from "react";
import { Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { HeroPanel, MarketingContainer, MarketingLead, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";
import { fetchMarketingMedia } from "@/lib/marketing-api";
import marketingSiteConfig from "@/content/marketing/site";

function toYear(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const ts = new Date(raw);
  if (Number.isNaN(ts.getTime())) return "";
  return String(ts.getFullYear());
}

function normalizeUrl(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    return parsed.toString();
  } catch {
    return "";
  }
}

export default function MarketingMediaPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const mediaQuery = useQuery({
    queryKey: ["marketing-media-gateway"],
    queryFn: () => fetchMarketingMedia({ limit: 120 }),
  });

  const cards = useMemo(() => {
    const raw = Array.isArray(mediaQuery.data?.items) ? mediaQuery.data.items : [];
    const byCanonical = new Map<string, any>();
    raw
      .map((item: any) => ({
        id: String(item?.id || ""),
        title: String(item?.title || "").trim(),
        source: String(item?.outlet || "").trim(),
        year: toYear(item?.publishedAt),
        description: String(item?.summaryParagraph || item?.excerpt || "").trim(),
        href: normalizeUrl(item?.url),
        thumb: String(item?.thumbnailLocalPath || item?.thumbnailRemoteUrl || ""),
      }))
      .filter((item: any) => item.title && item.href)
      .forEach((item: any) => {
        if (!byCanonical.has(item.href)) byCanonical.set(item.href, item);
      });

    const list = Array.from(byCanonical.values());

    if (list.length) return list;

    return [
      {
        id: "fallback",
        title: "Export platforms for SMEs",
        source: "Wamda Africa",
        year: "2023",
        description: "Coverage on trade platforms supporting SME exports.",
        href: "https://www.wamda.com",
        thumb: String(marketingSiteConfig.images?.platform || marketingSiteConfig.images?.hero || ""),
      },
    ];
  }, [mediaQuery.data]);

  return (
    <MarketingShell active="media">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform || marketingSiteConfig.images?.hero} imageAlt="Media coverage">
          <div className="max-w-3xl space-y-4">
            <MarketingTitle className="text-4xl md:text-5xl">Press, videos, and articles</MarketingTitle>
            <MarketingLead>Public coverage and recorded appearances.</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="pb-14 pt-10">
        {!cards.length ? (
          <div className="rounded-3xl border border-white/10 bg-black/30 p-6 text-sm text-white/75">
            No media records are available.
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((item: any) => (
            <a
              key={item.id}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-3xl border border-white/10 bg-black/30 p-4 transition-all hover:-translate-y-0.5 hover:border-white/30"
            >
              <MediaThumb src={item.thumb} alt={item.title} className="rounded-2xl" />
              <div className="p-2 pt-4">
                <div className="text-lg font-semibold text-white">{item.title}</div>
                <div className="mt-2 text-sm text-white/70">{item.source || "Source"}</div>
                <div className="mt-1 text-sm text-white/70">{item.year || "Year"}</div>
                <div className="mt-2 text-sm text-white/80">{item.description}</div>
              </div>
            </a>
          ))}
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

