import { useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import {
  GlassCard,
  HeroPanel,
  MarketingContainer,
  MarketingKicker,
  MarketingLead,
  MarketingTitle,
  MediaThumb,
} from "@/components/exportunity/marketing-ui";
import { useMarketingPlatformHref } from "@/components/exportunity/useMarketingLinks";
import { fetchMarketingMedia, fetchMarketingScreenshots, type MarketingMediaItem, type MarketingScreenshot } from "@/lib/marketing-api";
import { appendQueryParamsToUrl } from "@/lib/url";
import marketingSiteConfig from "@/content/marketing/site";

type UseCaseKey = "operators" | "smes" | "investors" | "gold";

const USE_CASES: Array<{
  key: UseCaseKey;
  label: string;
  sentence: string;
  platformSeed: string;
  screenshotTags: string[];
  mediaTags: string[];
}> = [
  {
    key: "operators",
    label: "Operators",
    sentence: "Execute trade with contracts, approvals, evidence, and reporting.",
    platformSeed: "operator",
    screenshotTags: ["operations", "approval", "report", "audit"],
    mediaTags: ["institutional", "trade", "platform"],
  },
  {
    key: "smes",
    label: "SMEs",
    sentence: "Run sales and operations with governed money movement.",
    platformSeed: "sme",
    screenshotTags: ["procurement", "payments", "messaging", "orders"],
    mediaTags: ["SME", "export", "platform"],
  },
  {
    key: "gold",
    label: "Gold & commodities",
    sentence: "Traceable execution from sourcing to settlement with checkpoints.",
    platformSeed: "gold",
    screenshotTags: ["traceability", "evidence", "gold", "compliance"],
    mediaTags: ["gold", "Africa", "trade"],
  },
  {
    key: "investors",
    label: "Investors",
    sentence: "Deploy trackable capital with contract controls and releases.",
    platformSeed: "investor",
    screenshotTags: ["invest", "contract", "report", "payments"],
    mediaTags: ["feature", "institutional", "story"],
  },
];

function normalizeTag(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function pickScreenshots(items: MarketingScreenshot[], preferredTags: string[], limit: number) {
  if (!items.length) return [];
  const tagSet = new Set(preferredTags.map(normalizeTag).filter(Boolean));
  const preferred = items.filter((shot) =>
    Array.isArray(shot.tags) ? shot.tags.some((tag) => tagSet.has(normalizeTag(tag))) : false,
  );
  return (preferred.length ? preferred : items).slice(0, limit);
}

function pickMedia(items: MarketingMediaItem[], preferredTags: string[], limit: number) {
  if (!items.length) return [];
  const tagSet = new Set(preferredTags.map(normalizeTag).filter(Boolean));
  const preferred = items.filter((row: any) =>
    Array.isArray(row.tags) ? row.tags.some((tag: unknown) => tagSet.has(normalizeTag(tag))) : false,
  );
  return (preferred.length ? preferred : items).slice(0, limit);
}

export default function MarketingUseCasesPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const [active, setActive] = useState<UseCaseKey>("operators");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const platformHrefBase = useMarketingPlatformHref();
  const platformHrefFor = (seed: string) =>
    appendQueryParamsToUrl(platformHrefBase, { role: seed, entry: "use_cases" });

  const screenshotsQuery = useQuery({
    queryKey: ["marketing-usecases-shots"],
    queryFn: async () => {
      const res = await fetchMarketingScreenshots({ limit: 60 });
      return Array.isArray(res?.items) ? (res.items as MarketingScreenshot[]) : [];
    },
  });

  const mediaQuery = useQuery({
    queryKey: ["marketing-usecases-media"],
    queryFn: async () => {
      const res = await fetchMarketingMedia({ limit: 160 });
      return Array.isArray(res?.items) ? (res.items as MarketingMediaItem[]) : [];
    },
  });

  const screenshots = screenshotsQuery.data || [];
  const mediaItems = (mediaQuery.data || []).filter((item: any) => String(item?.status || "").toLowerCase() === "published");

  const selected = USE_CASES.find((item) => item.key === active) || USE_CASES[0];

  const proofCards = useMemo(() => {
    const shots = pickScreenshots(screenshots, selected.screenshotTags, 2);
    const media = pickMedia(mediaItems, selected.mediaTags, 1);

    const cards: Array<{ id: string; title: string; thumb: string; href: string; badge: string }> = [];

    for (const shot of shots) {
      cards.push({
        id: String(shot.id),
        title: String(shot.title || "Screenshot"),
        thumb: String((shot as any).imageLocalPath || ""),
        href: `/proof?tab=screenshots&tag=${encodeURIComponent(String((shot.tags || [])[0] || ""))}`,
        badge: "Screenshot",
      });
    }

    for (const item of media) {
      const thumb = String((item as any).thumbnailLocalPath || (item as any).thumbnailRemoteUrl || "");
      cards.push({
        id: String((item as any).id),
        title: String((item as any).title || "Media"),
        thumb: thumb || String(marketingSiteConfig.images?.platform || marketingSiteConfig.images?.hero || ""),
        href: String((item as any).url || "/proof"),
        badge: String((item as any).type || "Press").replace(/_/g, " "),
      });
    }

    while (cards.length < 3) {
      const fallback = screenshots[cards.length] as any;
      if (!fallback?.imageLocalPath) break;
      cards.push({
        id: String(fallback.id),
        title: String(fallback.title || "Screenshot"),
        thumb: String(fallback.imageLocalPath || ""),
        href: "/proof?tab=screenshots",
        badge: "Screenshot",
      });
    }

    return cards.slice(0, 3);
  }, [mediaItems, screenshots, selected]);

  return (
    <MarketingShell active="useCases">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Use cases">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>USE CASES</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Choose a role. Start execution.</MarketingTitle>
            <MarketingLead>Each path links to proof and a direct platform entry.</MarketingLead>
            <div className="flex flex-wrap gap-3 pt-2">
              <a href={platformHrefFor("operator")} target="_blank" rel="noreferrer">
                <Button size="lg" className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                  Open Platform
                </Button>
              </a>
              <Link href="/talk">
                <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Talk to an agent
                </Button>
              </Link>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {USE_CASES.map((tile) => (
            <button
              key={tile.key}
              onClick={() => {
                setActive(tile.key);
                setDrawerOpen(true);
              }}
              className="rounded-3xl border border-white/10 bg-black/30 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-white/25"
            >
              <div className="text-xs font-semibold tracking-[0.2em] text-sky-200/70">{tile.label.toUpperCase()}</div>
              <div className="mt-3 text-xl font-semibold text-white">{tile.label}</div>
              <div className="mt-2 text-sm text-white/70">{tile.sentence}</div>
              <div className="mt-4 text-sm font-medium text-amber-200">Open proof drawer</div>
            </button>
          ))}
        </div>
      </MarketingContainer>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="border-white/10 bg-[#04070d] text-white">
          <DrawerHeader>
            <DrawerTitle>{selected.label}</DrawerTitle>
            <DrawerDescription className="text-white/70">{selected.sentence}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {proofCards.map((card) => (
                <a
                  key={card.id}
                  href={card.href}
                  target={card.href.startsWith("http") ? "_blank" : undefined}
                  rel={card.href.startsWith("http") ? "noreferrer" : undefined}
                  className="group rounded-2xl border border-white/10 bg-black/35 p-3 transition-all hover:-translate-y-0.5 hover:border-white/30"
                >
                  <MediaThumb src={card.thumb} alt={card.title} className="rounded-xl" />
                  <div className="p-2 pt-4">
                    <div className="text-xs uppercase tracking-[0.12em] text-white/60">{card.badge}</div>
                    <div className="mt-2 font-semibold leading-tight">{card.title}</div>
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              <GlassCard className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Open Platform (role seeded)</div>
                  <div className="mt-1 text-xs text-white/60">Takes you into the right entry flow.</div>
                </div>
                <a href={platformHrefFor(selected.platformSeed)} target="_blank" rel="noreferrer">
                  <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">Open</Button>
                </a>
              </GlassCard>
              <GlassCard className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Talk to an agent</div>
                  <div className="mt-1 text-xs text-white/60">Two questions, then routing.</div>
                </div>
                <Link href="/talk">
                  <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                    Talk
                  </Button>
                </Link>
              </GlassCard>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </MarketingShell>
  );
}


