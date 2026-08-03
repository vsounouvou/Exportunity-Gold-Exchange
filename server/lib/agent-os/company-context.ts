import type { ChatMessage } from "./anthropic-gateway";
import type { AgentPolicy } from "./registry";

export function injectCompanyContext(policy: AgentPolicy, messages: ChatMessage[]): ChatMessage[] {
  const companyContext = policy.companyContext?.trim();
  if (!companyContext) return messages;

  const contextSignature = companyContext.slice(0, 120);
  const alreadyPresent = messages.some(
    (message) => message.role === "system" && message.content.includes(contextSignature),
  );
  if (alreadyPresent) return messages;

  const organizationLabel = policy.organizationKey ? `Organization role: ${policy.organizationKey}.` : "";
  const systemContext = [
    "Use the following company context as the source of truth for this visible, user-initiated request.",
    organizationLabel,
    companyContext,
    "Do not claim that an unverified fact, commercial commitment, external action, or background conversation has happened. Do not initiate background conversations. Keep recommendations explicit about evidence, approvals, and the responsible agent.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [{ role: "system", content: systemContext }, ...messages];
}
