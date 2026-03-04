import { Redirect } from "wouter";

import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { PlatformModulePage } from "@/components/exportunity/PlatformModulePage";

export default function MarketingPlatformWalletPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <PlatformModulePage
      kicker="PLATFORM / WALLET"
      title="Wallet & Payments Rails"
      lead="Payments are not an add-on. Exportunity uses wallet rails to keep funding, disbursement, and reporting tied to execution."
      purpose="A wallet layer that supports controlled deployment of funds and a clear audit trail for every movement."
      primaryLinkKey="os.wallet"
      capabilities={[
        "Wallet ledger and transaction history per tenant",
        "Funding flows for contracts and operational execution",
        "Escrow-style holds and controlled releases (where enabled)",
        "Audit trail per transfer, with correlation IDs and metadata",
        "Spend visibility tied to orders, milestones, and actions",
        "Role-scoped approvals for sensitive movements",
      ]}
      howItWorks={[
        "Funds enter the platform through a wallet rail tied to the tenant.",
        "Contracts and approvals define how funds can be released or spent.",
        "Execution events (orders, milestones, actions) reference wallet movements.",
        "Operators attach evidence for compliance checkpoints when required.",
        "Investors and admins see reporting from the actual ledger and event logs.",
      ]}
      backHref="/platform"
    />
  );
}

