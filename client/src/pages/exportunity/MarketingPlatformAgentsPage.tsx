import { Redirect } from "wouter";

import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";

export default function MarketingPlatformAgentsPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;
  return <Redirect to="/talk" />;
}

