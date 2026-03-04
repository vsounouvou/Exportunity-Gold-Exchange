import { useMemo, useState } from "react";
import { Redirect } from "wouter";

import marketingSiteConfig from "@/content/marketing/site";
import aboutGallery from "@/content/exportunity/about/gallery.json";
import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";

type GalleryItem = {
  srcLocal: string | null;
  alt: string;
  order: number;
  sourceUrl: string;
};

function safeDecode(value: string) {
  try {
    return decodeURIComponent(String(value || "")).replace(/\+/g, " ");
  } catch {
    return String(value || "");
  }
}

export default function MarketingAboutPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const [selected, setSelected] = useState<number | null>(null);
  const gallery = useMemo(
    () =>
      ((aboutGallery as unknown as GalleryItem[]) || [])
        .filter((item) => item?.srcLocal)
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [],
  );
  const selectedItem = selected != null && selected >= 0 && selected < gallery.length ? gallery[selected] : null;

  return (
    <MarketingShell active="story">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.journey} imageAlt="Exportunity journey">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>OUR JOURNEY</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">From trade foundations to Exportunity OS.</MarketingTitle>
            <MarketingLead>{marketingSiteConfig.mission}</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="mb-5">
          <MarketingKicker>MILESTONES</MarketingKicker>
          <h2 className="mt-3 text-3xl font-semibold">Built for Africa-to-global trade execution</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(marketingSiteConfig.timeline || []).map((item) => (
            <GlassCard key={`${item.year}-${item.label}`} className="flex gap-4">
              <div className="shrink-0 rounded-xl border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-sm font-semibold text-sky-200">{item.year}</div>
              <div>
                <div className="font-semibold">{item.label}</div>
                <div className="mt-1 text-sm text-white/70">{item.details}</div>
              </div>
            </GlassCard>
          ))}
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-14">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <MarketingKicker>FIELD GALLERY</MarketingKicker>
            <h2 className="mt-3 text-3xl font-semibold">Operational moments</h2>
          </div>
        </div>

        {gallery.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((item, index) => (
              <button
                key={`${item.order}-${item.srcLocal}`}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left transition-all hover:-translate-y-0.5 hover:border-white/30"
                onClick={() => setSelected(index)}
              >
                <MediaThumb src={item.srcLocal} alt={item.alt} />
                <div className="p-3 text-xs text-white/70 line-clamp-2">{safeDecode(item.alt)}</div>
              </button>
            ))}
          </div>
        ) : (
          <GlassCard className="text-sm text-white/70">
            Field gallery is available on guided demo and media coverage while new operations photos are being published.
          </GlassCard>
        )}
      </MarketingContainer>

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-white/20 bg-black">
            <img className="max-h-[75vh] w-full object-contain" src={selectedItem.srcLocal || ""} alt={selectedItem.alt} />
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm text-white/85">{safeDecode(selectedItem.alt)}</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelected((prev) => (prev == null ? null : Math.max(0, prev - 1)))}>
                  Prev
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelected((prev) => (prev == null ? null : Math.min(gallery.length - 1, prev + 1)))}>
                  Next
                </Button>
                <Button size="sm" className="bg-amber-400 text-slate-950 hover:bg-amber-300" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </MarketingShell>
  );
}

