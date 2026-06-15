import { ZoneInterface } from "@/ui/core/ZoneInterface";
import type { ConversationSpace, ExportunityShellMode } from "@/components/exportunity/ExportunityConversationalCommerce";

type StorePageProps = {
  initialSpace?: ConversationSpace;
  shellMode?: ExportunityShellMode;
};

export default function StorePage({ initialSpace = "city", shellMode = "commerce" }: StorePageProps) {
  return <ZoneInterface initialSpace={initialSpace} shellMode={shellMode} />;
}
