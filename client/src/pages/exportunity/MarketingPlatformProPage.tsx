import { Redirect } from "wouter";

import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { PlatformModulePage } from "@/components/exportunity/PlatformModulePage";

export default function MarketingPlatformProPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <PlatformModulePage
      kicker="PLATFORM / PRO"
      title="Exportunity Pro (Seller / Business Ops)"
      lead="An operator app for day-to-day business execution: sales, payments, logistics, team roles, and client conversations."
      purpose="A practical surface for businesses running inside Exportunity: products, orders, customers, and operational follow-through."
      primaryLinkKey="os.pro.seller.home"
      capabilities={[
        "Products, pricing, inventory, and storefront operations",
        "Orders, delivery milestones, and customer updates",
        "Client chat threads with actionable cards (orders, payments, docs)",
        "Team roles and permissions for staff and operators",
        "Receipts and audit events tied to each operational action",
        "Optional agent assistance with approvals for external outreach",
      ]}
      howItWorks={[
        "Operate your business through an inbox-first surface.",
        "Convert chats into structured orders, payments, and delivery checkpoints.",
        "Attach documents and evidence to each milestone when required.",
        "Use approvals to control external sends and high-impact actions.",
        "Track outcomes using the same execution logs used by governance.",
      ]}
      backHref="/platform"
    />
  );
}

