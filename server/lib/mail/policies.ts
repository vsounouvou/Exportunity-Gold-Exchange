export type MailboxPolicy = {
  dailyOutboundLimit: number;
  approvalRequired: boolean;
};

export function defaultMailboxPolicy(agentKey: string): MailboxPolicy {
  const key = String(agentKey || "").trim().toLowerCase();

  if (key === "marketing") {
    return { dailyOutboundLimit: 30, approvalRequired: true };
  }

  if (key === "seo" || key === "seo_autopilot" || key === "seo.autopilot") {
    return { dailyOutboundLimit: 10, approvalRequired: true };
  }

  if (key === "compliance") {
    return { dailyOutboundLimit: 20, approvalRequired: true };
  }

  if (key === "support") {
    return { dailyOutboundLimit: 100, approvalRequired: false };
  }

  return { dailyOutboundLimit: 0, approvalRequired: false };
}

