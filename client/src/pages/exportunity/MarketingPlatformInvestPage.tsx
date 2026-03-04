import { Redirect } from "wouter";

import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { PlatformModulePage } from "@/components/exportunity/PlatformModulePage";

export default function MarketingPlatformInvestPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <PlatformModulePage
      kicker="PLATFORM / INVEST"
      title="Invest: Trackable capital deployment"
      lead="Fund verified operations on the platform, governed by digital contract terms, milestone releases, evidence, and reporting."
      purpose="An investment surface that connects capital to on-platform execution so deployment and outcomes remain visible."
      primaryLinkKey="os.invest.opportunities"
      capabilities={[
        "Opportunities directory and eligibility signals (where enabled)",
        "Funding via wallet rails with escrow and controlled releases",
        "Milestones, evidence, approvals, and governance checkpoints",
        "Restricted spend patterns (platform-native purchases and vendors)",
        "Investor reporting and action-level audit logs",
        "Dispute / termination workflows for governance-first control",
      ]}
      howItWorks={[
        "A business builds track record via platform transactions and operations.",
        "An investor funds a contract tied to milestones and permitted spend rules.",
        "Funds release only when evidence and approvals satisfy the contract.",
        "Purchases and actions remain linked to the execution log and wallet rail.",
        "Investors receive reporting derived from real operations, not manual updates.",
      ]}
      backHref="/platform"
    />
  );
}

