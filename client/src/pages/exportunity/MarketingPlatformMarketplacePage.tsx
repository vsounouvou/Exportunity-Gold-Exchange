import { Redirect } from "wouter";

import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { PlatformModulePage } from "@/components/exportunity/PlatformModulePage";

export default function MarketingPlatformMarketplacePage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <PlatformModulePage
      kicker="PLATFORM / MARKETPLACE"
      title="Marketplace and B2B Execution"
      lead="Supplier discovery is not enough. Exportunity connects discovery to execution: workflows, communications, approvals, and an audit trail."
      heroImage="/assets/exportunity/e6780893d266dc64e78172c490fc625f889e268db7469539847d3f94c7a592fc.jpg"
      heroAlt="Marketplace operations"
      purpose="A multi-tenant commerce layer where quotes, orders, delivery milestones, and communications remain linked to execution logs."
      primaryLinkKey="os.marketplace"
      capabilities={[
        "Supplier discovery and structured RFQ flows",
        "Conversation-first buying and negotiation threads",
        "Order and fulfillment milestones with evidence capture",
        "Audit trail across quote -> order -> delivery -> settlement",
        "Role-aware permissions for partners and operators",
        "Agent-assisted follow-ups with approvals when required",
      ]}
      howItWorks={[
        "Discover suppliers and start execution inside a dedicated thread.",
        "Convert intent to structured RFQs, quotes, and draft orders.",
        "Track milestones and attach documents and evidence as you go.",
        "Use approvals to control high-impact actions and payments.",
        "Report outcomes from the underlying transaction and event logs.",
      ]}
      proofModule="Operations"
      proofTag="workflow"
      backHref="/platform"
    />
  );
}

