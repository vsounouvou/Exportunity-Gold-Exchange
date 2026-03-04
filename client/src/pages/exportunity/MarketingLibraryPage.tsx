import { useMemo, useState } from "react";
import { Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { fetchMarketingLibrary } from "@/lib/marketing-api";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";
import marketingSiteConfig from "@/content/marketing/site";

export default function MarketingLibraryPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const [query, setQuery] = useState("");
  const libraryQuery = useQuery({
    queryKey: ["marketing-library", query],
    queryFn: () => fetchMarketingLibrary({ limit: 150, q: query || undefined }),
  });

  const items = Array.isArray(libraryQuery.data?.items) ? libraryQuery.data.items : [];
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item?.category) set.add(String(item.category));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  return (
    <MarketingShell active="proof">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Media library">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>MEDIA / LIBRARY</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Library</MarketingTitle>
            <MarketingLead>Videos, interviews, and operational resources managed directly in the Exportunity CMS.</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Badge key={category} className="border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80">
                {category}
              </Badge>
            ))}
          </div>
          <div className="w-full md:w-72">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library" className="border-white/20 bg-white/10 text-white" />
          </div>
        </div>

        {items.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {items.map((item: any) => (
              <GlassCard key={String(item.id)} className="overflow-hidden p-3">
                <MediaThumb src={item.thumbnailLocal} alt={item.title} className="rounded-xl" />
                <div className="p-2 pt-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-white/60">
                    <span>{item.category || "Library"}</span>
                    {item.language ? <span>{item.language}</span> : null}
                    {item.duration ? <span>{item.duration}</span> : null}
                  </div>
                  <div className="mt-2 text-lg font-semibold">{item.title}</div>
                  {item.description ? <div className="mt-2 text-sm text-white/70">{item.description}</div> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.externalUrl ? (
                      <a href={item.externalUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" className="bg-amber-400 text-slate-950 hover:bg-amber-300">Open source</Button>
                      </a>
                    ) : null}
                    {item.embedUrl ? (
                      <a href={item.embedUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">Open embed</Button>
                      </a>
                    ) : null}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="text-sm text-white/70">No library entries published yet.</GlassCard>
        )}
      </MarketingContainer>
    </MarketingShell>
  );
}

