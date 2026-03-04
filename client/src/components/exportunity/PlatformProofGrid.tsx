import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { fetchMarketingScreenshots, type MarketingScreenshot } from "@/lib/marketing-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MediaThumb, MarketingKicker } from "@/components/exportunity/marketing-ui";

function safeString(value: unknown) {
  return String(value ?? "").trim();
}

export function PlatformProofGrid({
  title = "Real modules, real workflows",
  description,
  module,
  tag,
  limit = 6,
  className,
  ctaHref = "/platform/screenshots",
  ctaLabel = "See all screenshots",
}: {
  title?: string;
  description?: string;
  module?: string;
  tag?: string;
  limit?: number;
  className?: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  const shotsQuery = useQuery({
    queryKey: ["marketing-screenshots", module || "", tag || ""],
    queryFn: async () => {
      const res = await fetchMarketingScreenshots({ limit: 80, module, tag });
      return Array.isArray(res?.items) ? (res.items as MarketingScreenshot[]) : [];
    },
  });

  const items = shotsQuery.data || [];

  const visible = useMemo(() => {
    const slice = items.slice(0, Math.max(1, limit));
    if (slice.length) return slice;
    return items.slice(0, Math.max(1, limit));
  }, [items, limit]);

  return (
    <section className={cn("space-y-4", className)} id="proof">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <MarketingKicker>PROOF</MarketingKicker>
          <h2 className="text-2xl font-semibold md:text-3xl">{title}</h2>
          {description ? <div className="max-w-2xl text-sm text-white/70">{description}</div> : null}
        </div>
        <Link href={ctaHref}>
          <a>
            <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
              {ctaLabel}
            </Button>
          </a>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visible.map((shot, idx) => {
          const img = safeString((shot as any).imageLocalPath || (shot as any).imagePath);
          const alt = safeString(shot.title) || `Screenshot ${idx + 1}`;
          return (
            <div
              key={`${String(shot.id)}-${idx}`}
              className="group rounded-2xl border border-white/10 bg-black/30 p-3 transition-all hover:-translate-y-0.5 hover:border-white/30"
            >
              <MediaThumb src={img} alt={alt} className="rounded-xl" />
              <div className="p-2 pt-4">
                <div className="text-base font-semibold">{shot.title}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.12em] text-white/55">{shot.module}</div>
                {shot.caption ? <div className="mt-2 text-sm text-white/70">{shot.caption}</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      {!visible.length ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
          Proof coming. Request a guided walkthrough to see this module in live context.
        </div>
      ) : null}
    </section>
  );
}
