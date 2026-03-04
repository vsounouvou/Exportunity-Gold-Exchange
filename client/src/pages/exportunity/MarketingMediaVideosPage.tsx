import { useMemo, useState } from "react";
import { Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { fetchMarketingMedia } from "@/lib/marketing-api";
import { HeroPanel, MarketingContainer, MarketingKicker, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";
import marketingSiteConfig from "@/content/marketing/site";

export default function MarketingMediaVideosPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const [query, setQuery] = useState("");
  const mediaQuery = useQuery({
    queryKey: ["marketing-media-videos", query],
    queryFn: () => fetchMarketingMedia({ limit: 140, q: query || undefined, type: "video" }),
  });

  const items = Array.isArray(mediaQuery.data?.items) ? mediaQuery.data.items : [];
  const featured = useMemo(() => items.filter((item: any) => Boolean(item?.featured)), [items]);
  const visible = items.length ? items : featured;

  return (
    <MarketingShell active="proof">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Video coverage">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>MEDIA / VIDEOS</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Video Coverage</MarketingTitle>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-8">
        <div className="mb-5 w-full md:w-72">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search videos" className="border-white/20 bg-white/10 text-white" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((item: any) => (
            <a key={String(item.id)} href={item.url} target="_blank" rel="noreferrer" className="group rounded-2xl border border-white/10 bg-black/30 p-3 transition-all hover:-translate-y-0.5 hover:border-white/30">
              <MediaThumb src={item.thumbnailLocalPath || item.thumbnailRemoteUrl} alt={item.title} className="rounded-xl" />
              <div className="p-2 pt-4">
                <div className="text-xs uppercase tracking-[0.12em] text-white/60">{item.outlet || "Video"}</div>
                <div className="mt-2 font-semibold leading-tight">{item.title}</div>
                {item.summaryParagraph ? <div className="mt-2 text-sm text-white/70 line-clamp-3">{item.summaryParagraph}</div> : null}
              </div>
            </a>
          ))}
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

