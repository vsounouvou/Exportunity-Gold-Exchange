import { Redirect } from "wouter";

import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { PlatformModulePage } from "@/components/exportunity/PlatformModulePage";

export default function MarketingPlatformContractsPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <PlatformModulePage
      kicker="PLATFORM / CONTRACTS"
      title="Digital Contract Engine (Smart Digital Contracts)"
      lead="Define execution constraints up front: escrow, milestones, evidence requirements, approvals, and termination rules."
      purpose="A governance layer that turns agreements into enforceable workflows with evidence and reporting."
      primaryLinkKey="os.contracts"
      capabilities={[
        "Contract lifecycle: draft -> signed -> funded -> active -> completed",
        "Milestones with evidence schemas (docs, receipts, delivery proof)",
        "Approval gates for disbursement and high-impact actions",
        "Vendor-direct payment and restricted-spend patterns (where enabled)",
        "Dispute and termination workflows with audit history",
        "Investor and operator reporting driven by execution logs",
      ]}
      howItWorks={[
        "Model parties, purpose, amount, and permitted spend categories.",
        "Define milestones and evidence required to unlock each release.",
        "Use approvals to verify evidence and authorize releases or actions.",
        "Record every action and movement in an immutable audit trail.",
        "Generate reporting from real transactions and milestone events.",
      ]}
      backHref="/platform"
    />
  );
}

