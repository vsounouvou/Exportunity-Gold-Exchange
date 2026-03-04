import { Redirect } from "wouter";

import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { PlatformModulePage } from "@/components/exportunity/PlatformModulePage";

export default function MarketingPlatformMessagingPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <PlatformModulePage
      kicker="PLATFORM / MESSAGING"
      title="Messaging: Email, SMS, and WhatsApp"
      lead="Communications orchestration with policy gates, approvals, and audit trails. Agents can propose actions but never silently send."
      purpose="A communications layer that stays tied to execution threads, approvals, and outcomes."
      primaryLinkKey="os.messaging"
      capabilities={[
        "Tenant-scoped integrations for email and WhatsApp tools",
        "Approval gates for external sends and sensitive outreach",
        "Templates, logs, and outcome visibility per thread",
        "Correlation IDs that link sends to actions and audit events",
        "Inbound capture that keeps context attached to the conversation",
        "Operator controls for policies, budgets, and allowed channels",
      ]}
      howItWorks={[
        "Messages originate from a governed thread or an approved action.",
        "Policy checks block disallowed sends with an explicit reason.",
        "Approved sends execute via the runner and write outcomes back.",
        "Inbound replies attach to the correct thread and context references.",
        "Audit logs retain the actor, identity, provider response, and result.",
      ]}
      backHref="/platform"
    />
  );
}

