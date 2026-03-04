import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";
import { useMarketingPlatformHref } from "@/components/exportunity/useMarketingLinks";
import { fetchMarketingMedia, fetchMarketingScreenshots, type MarketingMediaItem, type MarketingScreenshot } from "@/lib/marketing-api";
import marketingSiteConfig from "@/content/marketing/site";

type TabKey = "screenshots" | "press" | "videos" | "profiles";

function normalizeMediaKey(item: any) {
  const canonical = String(item?.canonicalUrl || item?.url || "").trim().toLowerCase();
  if (!canonical) return "";
  try {
    const parsed = new URL(canonical);
    const params = parsed.searchParams;
    ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid"].forEach((key) => params.delete(key));
    parsed.search = params.toString();
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return canonical.replace(/\/+$/, "");
  }
}

function languageBadge(lang: unknown) {
  const v = String(lang || "").trim().toLowerCase();
  if (v === "fr") return "FR";
  if (v === "en") return "EN";
  if (v === "ar") return "AR";
  return v ? v.toUpperCase() : null;
}

function guessVideoEmbed(url: string) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace("/", "").trim();
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    if (host.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    // ignore
  }
  return null;
}

function safeParam(name: string) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export default function MarketingProofPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const platformHref = useMarketingPlatformHref();
  const [, setLocation] = useLocation();

  const [tab, setTab] = useState<TabKey>(() => (safeParam("tab") as TabKey) || "press");
  const [query, setQuery] = useState(() => safeParam("q") || "");
  const [tag, setTag] = useState(() => safeParam("tag") || "");

  useEffect(() => {
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (query.trim()) params.set("q", query.trim());
    if (tag.trim()) params.set("tag", tag.trim());
    const next = `/proof${params.toString() ? `?${params.toString()}` : ""}`;
    setLocation(next, { replace: true });
  }, [query, setLocation, tab, tag]);

  const shotsQuery = useQuery({
    queryKey: ["marketing-proof-shots", tag],
    queryFn: async () => {
      const res = await fetchMarketingScreenshots({ limit: 80, tag: tag || undefined });
      return Array.isArray(res?.items) ? (res.items as MarketingScreenshot[]) : [];
    },
  });

  const mediaQuery = useQuery({
    queryKey: ["marketing-proof-media", query, tag],
    queryFn: async () => {
      const res = await fetchMarketingMedia({ limit: 240, q: query || undefined, tag: tag || undefined, verify: true });
      return Array.isArray(res?.items) ? (res.items as MarketingMediaItem[]) : [];
    },
  });

  const screenshots = shotsQuery.data || [];
  const mediaItemsRaw = mediaQuery.data || [];

  const mediaGroups = useMemo(() => {
    const byKey = new Map<string, MarketingMediaItem[]>();
    for (const item of mediaItemsRaw as any[]) {
      const key = normalizeMediaKey(item) || String(item?.id || "");
      if (!key) continue;
      const existing = byKey.get(key) || [];
      existing.push(item);
      byKey.set(key, existing);
    }
    for (const [key, group] of byKey.entries()) {
      group.sort((a: any, b: any) => {
        const aTs = a?.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const bTs = b?.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        if (aTs !== bTs) return bTs - aTs;
        return String(a?.language || "").localeCompare(String(b?.language || ""));
      });
      byKey.set(key, group);
    }
    return Array.from(byKey.values());
  }, [mediaItemsRaw]);

  const pressGroups = useMemo(
    () => mediaGroups.filter((group) => ["article", "press_release", "post", "podcast"].includes(String((group[0] as any)?.type || "").toLowerCase())),
    [mediaGroups],
  );
  const videoGroups = useMemo(
    () => mediaGroups.filter((group) => String((group[0] as any)?.type || "").toLowerCase() === "video"),
    [mediaGroups],
  );
  const profileGroups = useMemo(
    () => mediaGroups.filter((group) => String((group[0] as any)?.type || "").toLowerCase() === "profile"),
    [mediaGroups],
  );

  const groupsForTab = tab === "videos" ? videoGroups : tab === "profiles" ? profileGroups : pressGroups;

  return (
    <MarketingShell active="proof">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Proof hub">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>PROOF</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Coverage, screenshots, and external sources.</MarketingTitle>
            <MarketingLead>Click a proof item. Open the platform in one step.</MarketingLead>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a href={platformHref} target="_blank" rel="noreferrer">
                <Button size="lg" className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                  Open Platform
                </Button>
              </a>
              <Link href="/platform">
                <Button size="lg" variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                  Platform flow
                </Button>
              </Link>
              <Link href="/talk">
                <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Talk to an agent
                </Button>
              </Link>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={tab === "press" ? "default" : "outline"}
              className={tab === "press" ? "bg-amber-400 text-slate-950 hover:bg-amber-300" : "border-white/25 bg-white/[0.04] text-white hover:bg-white/10"}
              onClick={() => setTab("press")}
            >
              Press
            </Button>
            <Button
              variant={tab === "videos" ? "default" : "outline"}
              className={tab === "videos" ? "bg-amber-400 text-slate-950 hover:bg-amber-300" : "border-white/25 bg-white/[0.04] text-white hover:bg-white/10"}
              onClick={() => setTab("videos")}
            >
              Videos
            </Button>
            <Button
              variant={tab === "screenshots" ? "default" : "outline"}
              className={tab === "screenshots" ? "bg-amber-400 text-slate-950 hover:bg-amber-300" : "border-white/25 bg-white/[0.04] text-white hover:bg-white/10"}
              onClick={() => setTab("screenshots")}
            >
              Screenshots
            </Button>
            <Button
              variant={tab === "profiles" ? "default" : "outline"}
              className={tab === "profiles" ? "bg-amber-400 text-slate-950 hover:bg-amber-300" : "border-white/25 bg-white/[0.04] text-white hover:bg-white/10"}
              onClick={() => setTab("profiles")}
            >
              Profiles
            </Button>
          </div>

          <div className="flex w-full max-w-xl items-center gap-2 md:w-auto">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search proofâ€¦"
              className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
            />
            <Button
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={() => {
                setQuery("");
                setTag("");
              }}
            >
              Clear
            </Button>
          </div>
        </div>

        {tab === "screenshots" ? (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {screenshots.map((shot: any) => (
              <a
                key={String(shot.id)}
                href={String(shot.imageLocalPath || "")}
                target="_blank"
                rel="noreferrer"
                className="group rounded-2xl border border-white/10 bg-black/30 p-3 transition-all hover:-translate-y-0.5 hover:border-white/30"
              >
                <MediaThumb src={shot.imageLocalPath} alt={shot.title} className="rounded-xl" />
                <div className="p-2 pt-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-white/60">{shot.module || "Platform"}</div>
                  <div className="mt-2 font-semibold leading-tight">{shot.title}</div>
                  {shot.caption ? <div className="mt-2 text-sm text-white/70 line-clamp-3">{shot.caption}</div> : null}
                </div>
              </a>
            ))}
          </div>
        ) : null}

        {tab !== "screenshots" ? (
          tab === "videos" ? (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {groupsForTab.map((group) => {
                const item: any = group[0];
                const embed = String(item.mediaEmbedUrl || "").trim() || guessVideoEmbed(String(item.url || ""));
                const isFacebook = String(item.url || "").toLowerCase().includes("facebook.com");
                return (
                  <div key={String(item.id)} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-[0.12em] text-white/60">{item.outlet || "Video"}</div>
                        <div className="mt-2 truncate text-lg font-semibold">{item.title}</div>
                      </div>
                      {languageBadge(item.language) ? (
                        <span className="shrink-0 rounded-full border border-white/20 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/75">
                          {languageBadge(item.language)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4">
                      {embed && !isFacebook ? (
                        <div className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
                          <iframe
                            className="h-full w-full"
                            src={embed}
                            title={item.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <a href={item.url} target="_blank" rel="noreferrer" className="block">
                          <MediaThumb src={item.thumbnailLocalPath || item.thumbnailRemoteUrl} alt={item.title} className="rounded-xl" />
                          <div className="mt-2 text-sm text-white/70">Open on publisher site</div>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {groupsForTab.map((group) => {
                const variants = group as any[];
                const base: any = variants[0];
                return (
                  <a
                    key={normalizeMediaKey(base) || String(base.id)}
                    href={base.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-2xl border border-white/10 bg-black/30 p-3 transition-all hover:-translate-y-0.5 hover:border-white/30"
                  >
                    <MediaThumb src={base.thumbnailLocalPath || base.thumbnailRemoteUrl} alt={base.title} className="rounded-xl" />
                    <div className="p-2 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs uppercase tracking-[0.12em] text-white/60">{base.outlet || "Source"}</div>
                        <div className="flex items-center gap-2">
                          {variants.length > 1 ? (
                            <div className="flex flex-wrap gap-1">
                              {variants.map((v) =>
                                languageBadge(v.language) ? (
                                  <a
                                    key={`${String(v.id)}-${String(v.language)}`}
                                    href={String(v.url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-white/20 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/75 hover:border-white/35 hover:text-white"
                                    title="Open language variant"
                                  >
                                    {languageBadge(v.language)}
                                  </a>
                                ) : null,
                              )}
                            </div>
                          ) : languageBadge(base.language) ? (
                            <span className="rounded-full border border-white/20 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/75">
                              {languageBadge(base.language)}
                            </span>
                          ) : null}
                          {base.verified ? (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">
                              Verified
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 font-semibold leading-tight">{base.title}</div>
                      {base.summaryParagraph ? <div className="mt-2 text-sm text-white/70 line-clamp-3">{base.summaryParagraph}</div> : null}
                    </div>
                  </a>
                );
              })}
            </div>
          )
        ) : null}
      </MarketingContainer>
    </MarketingShell>
  );
}

