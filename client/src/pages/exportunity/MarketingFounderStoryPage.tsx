import { useMemo } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";
import { useMarketingPlatformHref } from "@/components/exportunity/useMarketingLinks";
import { fetchMarketingMedia, type MarketingMediaItem } from "@/lib/marketing-api";
import marketingSiteConfig from "@/content/marketing/site";
import aboutGallery from "@/content/exportunity/about/gallery.json";

type GalleryItem = {
  srcLocal: string | null;
  alt: string;
  order: number;
  sourceUrl: string;
};

function normalizeTag(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export default function MarketingFounderStoryPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const platformHref = useMarketingPlatformHref();

  const gallery = useMemo(
    () =>
      ((aboutGallery as unknown as GalleryItem[]) || [])
        .filter((item) => item?.srcLocal)
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [],
  );

  const headshot = String(
    gallery.find((g) => /\bvital\b/i.test(String(g.alt || "")))?.srcLocal ||
      gallery.find((g) => /yali/i.test(String(g.alt || "")))?.srcLocal ||
      gallery[0]?.srcLocal ||
      marketingSiteConfig.images?.hero ||
      "",
  );

  const mediaQuery = useQuery({
    queryKey: ["marketing-founder-media"],
    queryFn: async () => {
      const res = await fetchMarketingMedia({ limit: 240, q: "Vital" });
      return Array.isArray(res?.items) ? (res.items as MarketingMediaItem[]) : [];
    },
  });
  const mediaItems = mediaQuery.data || [];

  const profileHighlights = useMemo(() => {
    if (!mediaItems.length) return [];
    const wants = new Set(["profile", "institutional", "yali", "video", "interview", "founder"].map(normalizeTag));
    const preferred = mediaItems.filter((row: any) =>
      Array.isArray(row.tags) ? row.tags.some((t: any) => wants.has(normalizeTag(t))) : false,
    );
    return (preferred.length ? preferred : mediaItems).slice(0, 3) as any[];
  }, [mediaItems]);

  return (
    <MarketingShell active="story">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.hero} imageAlt="Founder story">
          <div className="max-w-4xl space-y-4">
            <MarketingKicker>FOUNDER STORY</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Vital Sounouvou</MarketingTitle>
            <MarketingLead>Built Exportunity to turn fragmented workflows into coordinated execution.</MarketingLead>
            <div className="flex flex-wrap gap-3 pt-2">
              <a href={platformHref} target="_blank" rel="noreferrer">
                <Button size="lg" className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                  Open Platform
                </Button>
              </a>
              <Link href="/talk">
                <Button size="lg" variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                  Talk to an agent
                </Button>
              </Link>
              <Link href="/proof">
                <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Media & references
                </Button>
              </Link>
              <Link href="/story">
                <Button size="lg" variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                  Company story
                </Button>
              </Link>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.25fr]">
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <img src={headshot} alt="Founder headshot" className="aspect-[4/5] w-full rounded-2xl object-cover" loading="lazy" />
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="border border-white/20 bg-white/10 text-white">Mandela Washington Fellow</Badge>
              <Badge className="border border-white/20 bg-white/10 text-white">Harvard strategy certificate</Badge>
              <Badge className="border border-white/20 bg-white/10 text-white">Founder, Exportunity</Badge>
              <Badge className="border border-white/20 bg-white/10 text-white">Global speaker</Badge>
            </div>
          </div>

          <div className="space-y-4">
            <GlassCard>
              <div className="text-xs uppercase tracking-[0.12em] text-white/60">Why he built it</div>
              <div className="mt-3 text-sm text-white/75">
                Trade breaks when execution is informal: money moves, approvals vanish, and evidence is scattered across chats. Exportunity was built to make operations auditable by defaultâ€”so teams, partners, and investors can see the same truth.
              </div>
            </GlassCard>

            {profileHighlights.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {profileHighlights.map((item: any) => (
                  <a
                    key={String(item.id)}
                    href={String(item.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-2xl border border-white/10 bg-black/30 p-3 transition-all hover:-translate-y-0.5 hover:border-white/30"
                  >
                    <MediaThumb src={item.thumbnailLocalPath || item.thumbnailRemoteUrl || marketingSiteConfig.images?.platform} alt={item.title} className="rounded-xl" />
                    <div className="p-2 pt-4">
                      <div className="text-xs uppercase tracking-[0.12em] text-white/60">{item.outlet || "Source"}</div>
                      <div className="mt-2 font-semibold leading-tight">{item.title}</div>
                    </div>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

