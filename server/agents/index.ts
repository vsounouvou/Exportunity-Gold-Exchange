import type { AgentKey, AgentPlaybook } from "./types";

import marketing from "./marketing/playbook";
import clientHunter from "./client_hunter/playbook";
import media from "./media/playbook";
import ops from "./ops/playbook";
import compliance from "./compliance/playbook";
import data from "./data/playbook";
import seoAutopilot from "./seo_autopilot/playbook";

export const AGENT_KEYS: AgentKey[] = [
  "marketing",
  "client_hunter",
  "media",
  "ops",
  "compliance",
  "data",
  "seo_autopilot",
];

const PLAYBOOKS: Record<AgentKey, AgentPlaybook> = {
  marketing,
  client_hunter: clientHunter,
  media,
  ops,
  compliance,
  data,
  seo_autopilot: seoAutopilot,
};

export function getAgentPlaybook(agent: AgentKey): AgentPlaybook {
  return PLAYBOOKS[agent];
}
