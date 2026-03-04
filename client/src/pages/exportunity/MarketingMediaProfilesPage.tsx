import { useState } from "react";
import { Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { fetchMarketingMedia } from "@/lib/marketing-api";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";
import marketingSiteConfig from "@/content/marketing/site";

export default function MarketingMediaProfilesPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const [query, setQuery] = useState("");
  const mediaQuery = useQuery({
    queryKey: ["marketing-media-profiles", query],
    queryFn: () => fetchMarketingMedia({ limit: 120, q: query || undefined, type: "profile" }),
  });

  const items = Array.isArray(mediaQuery.data?.items) ? mediaQuery.data.items : [];

  return (
    <MarketingShell active="proof">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Institutional profiles">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>MEDIA / PROFILES</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Institutional Profiles</MarketingTitle>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-8">
        <div className="mb-5 w-full md:w-72">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search profiles" className="border-white/20 bg-white/10 text-white" />
        </div>

        {items.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((item: any) => (
              <a key={String(item.id)} href={item.url} target="_blank" rel="noreferrer" className="group rounded-2xl border border-white/10 bg-black/30 p-3 transition-all hover:-translate-y-0.5 hover:border-white/30">
                <MediaThumb src={item.thumbnailLocalPath || item.thumbnailRemoteUrl} alt={item.title} className="rounded-xl" />
                <div className="p-2 pt-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-white/60">{item.outlet || "Profile"}</div>
                  <div className="mt-2 font-semibold leading-tight">{item.title}</div>
                  {item.summaryParagraph ? <div className="mt-2 text-sm text-white/70">{item.summaryParagraph}</div> : null}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <GlassCard className="text-sm text-white/70">No profile entries available.</GlassCard>
        )}
      </MarketingContainer>
    </MarketingShell>
  );
}

