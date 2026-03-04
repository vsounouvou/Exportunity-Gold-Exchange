import { useMemo } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, MarketingContainer, MarketingKicker, MediaThumb } from "@/components/exportunity/marketing-ui";
import { fetchMarketingPostBySlug } from "@/lib/marketing-api";

export default function MarketingPostPage({ params }: { params?: Record<string, string | undefined> }) {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const slug = useMemo(() => String(params?.slug || "").trim(), [params?.slug]);

  const postQuery = useQuery({
    queryKey: ["marketing-post", slug],
    enabled: Boolean(slug),
    queryFn: () => fetchMarketingPostBySlug(slug),
  });

  if (!slug) return <Redirect to="/media" />;

  const item = postQuery.data?.item;

  return (
    <MarketingShell active="proof">
      <MarketingContainer className="pt-10 md:pt-14">
        <GlassCard className="rounded-3xl p-6 md:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <MarketingKicker>ARTICLE</MarketingKicker>
            <Link href="/media">
              <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">Back to Media</Button>
            </Link>
          </div>

          <h1 className="text-balance text-3xl font-semibold leading-tight md:text-4xl">{item?.title || "Article"}</h1>
          {item?.publishedAt ? <div className="mt-2 text-sm text-white/60">Published {String(item.publishedAt).slice(0, 10)}</div> : null}

          {item?.coverImageLocal ? (
            <div className="mt-6">
              <MediaThumb src={item.coverImageLocal} alt={item.title} className="rounded-2xl" />
            </div>
          ) : null}

          {item?.contentHtml ? (
            <div className="prose prose-invert mt-8 max-w-none prose-headings:font-semibold prose-a:text-sky-300" dangerouslySetInnerHTML={{ __html: String(item.contentHtml) }} />
          ) : postQuery.isLoading ? (
            <div className="mt-8 text-white/70">Loading article...</div>
          ) : (
            <div className="mt-8 text-white/70">This article is missing or unpublished.</div>
          )}
        </GlassCard>
      </MarketingContainer>
    </MarketingShell>
  );
}

