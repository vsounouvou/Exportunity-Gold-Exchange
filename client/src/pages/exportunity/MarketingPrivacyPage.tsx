import { useEffect, useState } from "react";
import { Redirect } from "wouter";

import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, MarketingContainer, MarketingKicker } from "@/components/exportunity/marketing-ui";

export default function MarketingPrivacyPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/exportunity/legal/privacypolicy.html", { cache: "no-store" });
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
    <MarketingShell active="privacy">
      <MarketingContainer className="pt-10 md:pt-14">
        <GlassCard className="rounded-3xl p-6 md:p-8">
          <MarketingKicker>LEGAL</MarketingKicker>
          <h1 className="mt-3 text-3xl font-semibold">Privacy Policy</h1>
          {html ? (
            <div className="prose prose-invert mt-8 max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="mt-6 text-white/70">Privacy policy content is not available yet.</div>
          )}
        </GlassCard>
      </MarketingContainer>
    </MarketingShell>
  );
}

