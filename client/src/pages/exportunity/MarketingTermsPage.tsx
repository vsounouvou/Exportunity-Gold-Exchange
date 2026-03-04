import { useEffect, useState } from "react";
import { Redirect } from "wouter";

import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, MarketingContainer, MarketingKicker } from "@/components/exportunity/marketing-ui";

export default function MarketingTermsPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/exportunity/legal/termsofservice.html", { cache: "no-store" });
        if (!res.ok) return setHtml(null);
        const text = await res.text();
        setHtml(text);
      } catch {
        setHtml(null);
      }
    };
    void load();
  }, []);

  return (
    <MarketingShell active="terms">
      <MarketingContainer className="pt-10 md:pt-14">
        <GlassCard className="rounded-3xl p-6 md:p-8">
          <MarketingKicker>LEGAL</MarketingKicker>
          <h1 className="mt-3 text-3xl font-semibold">Terms of Service</h1>
          {html ? (
            <div className="prose prose-invert mt-8 max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="mt-6 text-white/70">Terms content is not available yet.</div>
          )}
        </GlassCard>
      </MarketingContainer>
    </MarketingShell>
  );
}

