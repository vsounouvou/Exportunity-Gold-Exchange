import { useMemo } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";
import { fetchMarketingScreenshots, type MarketingScreenshot } from "@/lib/marketing-api";

function safeString(value: unknown) {
  return String(value ?? "").trim();
}

function parseSearch(location: string) {
  const searchIndex = location.indexOf("?");
  const raw = searchIndex >= 0 ? location.slice(searchIndex + 1) : "";
  return new URLSearchParams(raw);
}

export default function MarketingPlatformScreenshotsPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const [location] = useLocation();
  const search = parseSearch(location);
  const moduleFilter = safeString(search.get("module") || "");
  const tagFilter = safeString(search.get("tag") || "");

  const shotsQuery = useQuery({
    queryKey: ["marketing-screenshots-library", moduleFilter, tagFilter],
    queryFn: async () => {
      const res = await fetchMarketingScreenshots({
        limit: 200,
        module: moduleFilter || undefined,
        tag: tagFilter || undefined,
      });
      return Array.isArray(res?.items) ? (res.items as MarketingScreenshot[]) : [];
    },
  });

  const items = shotsQuery.data || [];

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const mod = safeString((item as any).module);
      if (mod) set.add(mod);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const rawTags = (item as any).tags;
      if (!Array.isArray(rawTags)) continue;
      for (const t of rawTags) {
        const tag = safeString(t).toLowerCase();
        if (tag) set.add(tag);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    if (!moduleFilter && !tagFilter) return items;
    return items.filter((item) => {
      const moduleMatch = !moduleFilter || safeString((item as any).module) === moduleFilter;
      const tagMatch = !tagFilter
        ? true
        : Array.isArray((item as any).tags)
          ? (item as any).tags.some((t: any) => safeString(t).toLowerCase() === tagFilter.toLowerCase())
          : false;
      return moduleMatch && tagMatch;
    });
  }, [items, moduleFilter, tagFilter]);

  const queryString = (next: { module?: string; tag?: string }) => {
    const params = new URLSearchParams();
    if (next.module) params.set("module", next.module);
    if (next.tag) params.set("tag", next.tag);
    const raw = params.toString();
    return raw ? `?${raw}` : "";
  };

  return (
    <MarketingShell active="platform">
      <MarketingContainer className="pt-10 md:pt-14">
        <div className="space-y-4">
          <MarketingKicker>PLATFORM / SCREENSHOTS</MarketingKicker>
          <MarketingTitle className="text-4xl md:text-5xl">Proof library</MarketingTitle>
          <MarketingLead className="max-w-3xl">
            Curated screenshots from platform surfaces. Filter by module or tag, then open the platform or request a guided demo.
          </MarketingLead>

          <div className="flex flex-wrap gap-3">
            <Link href="/platform">
              <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                Back to platform
              </Button>
            </Link>
            <Link href="/talk">
              <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">Request demo</Button>
            </Link>
          </div>
        </div>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-white">Filters</div>
              <div className="text-sm text-white/70">Select a module or tag to narrow the proof tiles.</div>
            </div>
            <Link href="/admin/screenshots">
              <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                Upload screenshots (admin)
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-[0.24em] text-sky-200/70">MODULE</div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/platform/screenshots${queryString({ tag: tagFilter || undefined })}`}>
                  <a
                    className={`rounded-full border px-3 py-1 text-sm ${
                      moduleFilter ? "border-white/10 text-white/70 hover:border-white/25 hover:text-white" : "border-white/25 text-white"
                    }`}
                  >
                    All
                  </a>
                </Link>
                {modules.map((mod) => (
                  <Link key={mod} href={`/platform/screenshots${queryString({ module: mod, tag: tagFilter || undefined })}`}>
                    <a
                      className={`rounded-full border px-3 py-1 text-sm ${
                        moduleFilter === mod ? "border-white/25 text-white" : "border-white/10 text-white/70 hover:border-white/25 hover:text-white"
                      }`}
                    >
                      {mod}
                    </a>
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-[0.24em] text-sky-200/70">TAG</div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/platform/screenshots${queryString({ module: moduleFilter || undefined })}`}>
                  <a
                    className={`rounded-full border px-3 py-1 text-sm ${
                      tagFilter ? "border-white/10 text-white/70 hover:border-white/25 hover:text-white" : "border-white/25 text-white"
                    }`}
                  >
                    All
                  </a>
                </Link>
                {tags.slice(0, 24).map((tag) => (
                  <Link key={tag} href={`/platform/screenshots${queryString({ module: moduleFilter || undefined, tag })}`}>
                    <a
                      className={`rounded-full border px-3 py-1 text-sm ${
                        tagFilter.toLowerCase() === tag.toLowerCase()
                          ? "border-white/25 text-white"
                          : "border-white/10 text-white/70 hover:border-white/25 hover:text-white"
                      }`}
                    >
                      {tag}
                    </a>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((shot, idx) => {
            const img = safeString((shot as any).imageLocalPath || (shot as any).imagePath);
            const alt = safeString(shot.title) || `Screenshot ${idx + 1}`;
            return (
              <div key={`${String((shot as any).id)}-${idx}`} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <MediaThumb src={img} alt={alt} className="rounded-xl" />
                <div className="p-2 pt-4">
                  <div className="text-base font-semibold text-white">{shot.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.12em] text-white/55">{safeString((shot as any).module)}</div>
                  {shot.caption ? <div className="mt-2 text-sm text-white/70">{shot.caption}</div> : null}
                </div>
              </div>
            );
          })}
        </div>

        {!filtered.length ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
            No screenshots match this filter yet. Open demo or request a guided walkthrough.
          </div>
        ) : null}
      </MarketingContainer>
    </MarketingShell>
  );
}

