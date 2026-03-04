import { Redirect } from "wouter";
import { isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";

export default function MarketingAdvisoryPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;
  return <Redirect to="/solutions" />;
}

