import { ZoneInterface } from "@/ui/core/ZoneInterface";
import type { ConversationSpace, ExportunityExchangeVariant, ExportunityShellMode } from "@/components/exportunity/ExportunityConversationalCommerce";

type StorePageProps = {
  initialSpace?: ConversationSpace;
  shellMode?: ExportunityShellMode;
  exchangeVariant?: ExportunityExchangeVariant;
};

export default function StorePage({ initialSpace = "city", shellMode = "commerce", exchangeVariant = "export" }: StorePageProps) {
  return <ZoneInterface initialSpace={initialSpace} shellMode={shellMode} exchangeVariant={exchangeVariant} />;
}
