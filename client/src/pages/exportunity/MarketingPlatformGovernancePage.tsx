import { Redirect } from "wouter";

import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { PlatformModulePage } from "@/components/exportunity/PlatformModulePage";

export default function MarketingPlatformGovernancePage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <PlatformModulePage
      kicker="PLATFORM / GOVERNANCE"
      title="Action Logs & Governance"
      lead="A simple contract: if the platform claims it did something, there is an Action record, an execution result, and an audit trail."
      purpose="Governance surfaces that make execution visible: actions, approvals, correlation IDs, and outcomes."
      primaryLinkKey="os.governance.logs"
      capabilities={[
        "Action lifecycle with clear statuses and timestamps",
        "Approvals workflow with explicit blocking reasons",
        "Correlation IDs across tools, logs, and thread messages",
        "Runner heartbeat and observability for reliability",
        "Audit exports for compliance and investor reporting",
        "Noise control via role scopes and relevance filters",
      ]}
      howItWorks={[
        "Intent becomes an Action row (tenant scoped, auditable).",
        "Approvals gate high-impact actions; blockers are always visible.",
        "Runner executes tools and writes results and errors back.",
        "Threads receive outcome messages for every action execution.",
        "Dashboards expose logs, heartbeat, and reporting based on actions.",
      ]}
      proofModule="Governance"
      proofTag="audit"
      backHref="/platform"
    />
  );
}

