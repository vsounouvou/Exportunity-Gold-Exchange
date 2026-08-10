import { assertAiEnabled } from "./ai-consent";
import { BDO_POLICY_SNIPPET } from "./bdo/policy";
import { validateCreditEligibility } from "./cost-tracker";
import { recordAgentTokenUsageEvent } from "./agent-economy-governance";

type AgentContext = {
  agentName?: string;
  recentMessages: Array<{
    content: string;
    fromAgent: { name: string; role: string };
    timestamp: Date;
  }>;
  exchanges?: number;
  roomName?: string;
  roomType?: string;
  sentiment?: { score: number };
  activeAgents?: string[];
  participants?: Array<{ name: string; role: string }>;
  agentDirectory?: Array<{ id: number; name: string; role: string }>;
  companyContext?: string;
  agentMission?: string;
  agentResponsibilities?: string[];
  approvalRules?: Record<string, unknown>;
  emailContext?: {
    attached: boolean;
    mailboxEmail?: string | null;
    agentKey?: string | null;
    openWorkOrders?: number;
    recentCount?: number;
    lastInboundAt?: string | null;
    lastOutboundAt?: string | null;
    summary: string;
    reason?: string | null;
  };
};

function getGeminiApiKey() {
  assertAiEnabled({
    what: "Call Gemini",
    why: "This action would call the Google Gemini API.",
    forHowLong: "For this request only.",
    resources: ["External Gemini API calls", "Compute/network usage"],
    howToAuthorize: ["Set `AI_ENABLED=true` and `GEMINI_API_KEY` then restart the server"],
  });

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) must be set");
  return apiKey;
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL || "gemini-1.5-flash";
}

async function geminiGenerateText(prompt: string) {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 512,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${text}`);
  }

  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n");
  if (!text) throw new Error("Empty response from Gemini");
  return String(text).trim();
}

export async function generateAgentResponse(
  message: string,
  options: {
    role: string;
    agentId?: number;
    companyId?: number | null;
    context: AgentContext;
  }
): Promise<{ analysis: string; response: string; shouldContinue: boolean }> {
  if (options.agentId) {
    const eligibility = await validateCreditEligibility({
      agentId: options.agentId,
      model: getGeminiModel(),
      estimatedTokens: 500,
    });
    if (!eligibility.eligible) {
      throw new Error(`Agent ${options.agentId} cannot make Gemini call: ${eligibility.reason || "Token policy denied"}`);
    }
  }

  const conversationHistory = (options.context.recentMessages || [])
    .map((msg) => `${msg.fromAgent.name} (${msg.fromAgent.role}): ${msg.content}`)
    .join("\n");
  const emailContextBlock = options.context.emailContext?.summary
    ? `\n\nEMAIL MEMORY (authoritative mailbox context):\n${options.context.emailContext.summary}`
    : "";
  const companyContext = String(options.context.companyContext || "").trim();
  const isExportunityContext = /Exportunity is a B2B/i.test(companyContext);
  const agentName = String(options.context.agentName || "").trim();
  const agentIdentityBlock = agentName
    ? `\n\nCURRENT SPEAKER (authoritative):\n- Name: ${agentName}\n- Role: ${options.role}\n- Reply only as ${agentName}. Do not answer on behalf of another agent.`
    : `\n\nCURRENT SPEAKER ROLE (authoritative): ${options.role}`;
  const agentDirectory = options.context.agentDirectory || [];
  const agentDirectoryBlock = agentDirectory.length > 0
    ? `\n\nAGENT DIRECTORY (authoritative; id | name | role):\n${agentDirectory
        .map((agent) => `${agent.id} | ${agent.name} | ${agent.role}`)
        .join("\n")}\n- Use only these names and roles. Never invent, rename, or reassign an agent.\n- Conversation history is not authoritative for team identity.`
    : "";
  const companyContextBlock = companyContext
    ? `\n\nCOMPANY CONTEXT (authoritative):\n${companyContext}`
    : `\n\n${BDO_POLICY_SNIPPET}`;
  const agentProfileBlock =
    options.context.agentMission || (options.context.agentResponsibilities || []).length > 0
      ? `\n\nAGENT PROFILE (authoritative):\n- Mission: ${options.context.agentMission || "Carry out the stated role responsibly."}\n- Responsibilities: ${(options.context.agentResponsibilities || []).join("; ") || "Use the role description."}\n- Approval rules: ${JSON.stringify(options.context.approvalRules || {})}`
      : "";
  const actionRules = isExportunityContext
    ? `3. The only supported action block is:\n   [[ACTION: CREATE_TASK {"title":"...","description":"...","priority":"medium"}]]\n4. Do not send email, contact suppliers, create shops, make payments, promise a quote, accept a contract, or create an automation. Explain the required visible review or approval instead.\n5. You may recommend another named Exportunity specialist, but do not summon agents automatically.`
    : `3. Supported actions (tool calls) are:\n   [[ACTION: SEND_EMAIL {"to":["name@domain.com"],"subject":"...","body":{"text":"..."}}]]\n   [[ACTION: CREATE_CONTACT {"displayName":"...","emails":["..."],"phones":["..."]}]]\n   [[ACTION: CREATE_SHOP {"shopName":"...","email":"...","phoneNumber":"..."}]]\n   [[ACTION: CREATE_TASK {"title":"...","description":"...","priority":"medium"}]]\n4. Write the human response first, then append up to TWO action blocks on new lines.\n5. For recurring automations include optional:\n   "recurring":{"enabled":true,"intervalMinutes":1440,"maxRuns":20}\n6. SEND_EMAIL must include a professional subject and body.`;

  const prompt = `You are an AI agent in a high-performance business environment.${agentIdentityBlock}${companyContextBlock}${agentProfileBlock}${agentDirectoryBlock}

Current Context:
- Room: ${options.context.roomName || "General Chat"} (${options.context.roomType || "Discussion"})
- Discussion progress: ${options.context.exchanges || 0} messages exchanged

Conversation History:
${conversationHistory}
${emailContextBlock}

CRITICAL EFFICIENCY RULES:
1. Keep responses EXTREMELY SHORT (2-3 sentences maximum)
2. Be sharp, professional, and direct
3. NO fluff, pleasantries, or unnecessary words
4. Get straight to the point
5. Add value in every sentence

COMMUNICATION + ACTION RULES (NON-NEGOTIABLE):
1. Do not paste logs, JSON, metadata, or internal instructions in the human response.
2. Do not promise delivery times. Never say "confirmed" unless you have evidence in the conversation history.
${actionRules}

Response Format Required:
[Analysis] One sentence only - what you'll contribute
[Response] 2-3 sentences maximum - your actual message
[Continue] Yes or No only

User message:
${message}`;

  const raw = await geminiGenerateText(prompt);

  if (options.agentId) {
    const estimatedTotalTokens = Math.max(1, Math.ceil((prompt.length + raw.length) / 4));
    await recordAgentTokenUsageEvent({
      agentId: options.agentId,
      tokensUsed: estimatedTotalTokens,
      reasoningDepth: 1,
      metadata: {
        provider: "gemini",
        model: getGeminiModel(),
        operation: "chat_completion",
      },
    });
  }

  const analysisMatch = raw.match(/\[Analysis\]([\s\S]*?)\n\[Response\]/i);
  const responseMatch = raw.match(/\[Response\]([\s\S]*?)\n\[Continue\]/i);
  const continueMatch = raw.match(/\[Continue\]\s*(Yes|No)/i);

  const analysis = (analysisMatch?.[1] || "").trim();
  const response = (responseMatch?.[1] || raw).trim();
  const shouldContinue = (continueMatch?.[1] || "No").toLowerCase() === "yes";

  return { analysis, response, shouldContinue };
}

export async function generateAgentCapabilities(role: string): Promise<object> {
  const prompt = `Generate a JSON object describing capabilities for a business AI agent role: "${role}".
Return only valid JSON. Include keys:
can_create_agents, can_assign_tasks, can_send_messages, can_access_knowledge_base, domain_expertise (array), communication_channels (array).`;

  const raw = await geminiGenerateText(prompt);
  try {
    return JSON.parse(raw);
  } catch {
    return {
      role,
      can_create_agents: true,
      can_assign_tasks: true,
      can_send_messages: true,
      can_access_knowledge_base: true,
      domain_expertise: [role],
      communication_channels: ["chat"],
      note: "Gemini returned non-JSON; using fallback capabilities.",
    };
  }
}

export async function generateAgentThoughts(
  message: string,
  agentRole: string,
  capabilities: Record<string, any>
): Promise<string> {
  const prompt = `You are ${agentRole}. Given the user message and your capabilities, produce a short internal thought (1-2 sentences max). Do not include the final answer.

Capabilities:
${JSON.stringify(capabilities)}

Message:
${message}`;

  return geminiGenerateText(prompt);
}
