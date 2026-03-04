import { Redirect } from "wouter";

import { MarketingChatDesk } from "@/components/exportunity/MarketingChatDesk";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { HeroPanel, MarketingContainer, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";
import marketingSiteConfig from "@/content/marketing/site";

export default function MarketingTalkPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <MarketingShell active="talk">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.contact} imageAlt="Talk">
          <div className="max-w-3xl space-y-4">
            <MarketingTitle className="text-4xl md:text-5xl">Talk to an operator</MarketingTitle>
            <MarketingLead>An operator will respond and route you.</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="pb-14 pt-8">
        <MarketingChatDesk
          autoStart
          hideIntentCards
          inputPlaceholder="Type your message..."
          systemMessage="An operator will respond and route you."
        />
      </MarketingContainer>
    </MarketingShell>
  );
}

