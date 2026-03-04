import { Redirect } from "wouter";

import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { PlatformModulePage } from "@/components/exportunity/PlatformModulePage";

export default function MarketingPlatformOsPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <PlatformModulePage
      kicker="PLATFORM / OS"
      title="Exportunity OS (Core Operating System)"
      lead="A multi-tenant runtime for execution: accounts, roles, wallets, contracts, approvals, messaging, and audit logs."
      purpose="The core operating layer that keeps execution, evidence, and reporting connected across verticals."
      primaryLinkKey="os.home"
      capabilities={[
        "Workspaces, roles, and tenant-scoped permissions",
        "Wallet rails and transaction visibility across workflows",
        "Digital contracts: milestones, evidence, and controlled releases",
        "Action logs, approvals, and correlation IDs for audit trails",
        "Messaging layer for email / SMS / WhatsApp tools (policy gated)",
        "Reporting surfaces derived from execution events, not slide decks",
      ]}
      howItWorks={[
        "Model your organization as a tenant with roles and permissions.",
        "Execute operations through governed surfaces: wallets, contracts, actions, and messaging.",
        "Capture evidence at each checkpoint (docs, receipts, confirmations).",
        "Enforce approvals and policy gates on high-impact actions and spend.",
        "Generate reporting from the underlying event and transaction logs.",
      ]}
      backHref="/platform"
    />
  );
}

