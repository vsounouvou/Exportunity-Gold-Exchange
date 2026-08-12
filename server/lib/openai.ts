import OpenAI from "openai";
import { db } from "@db";
import { agents } from "@db/schema";
import { eq } from "drizzle-orm";
import type { Agent } from "@db/schema";
import { trackLLMCost, validateCreditEligibility, CreditEnforcementError, type TokenUsage } from "./cost-tracker";
import { assertAiEnabled } from "./ai-consent";
import { BDO_POLICY_SNIPPET } from "./bdo/policy";

function getAgentChatModel() {
  return (
    process.env.OPENAI_LEGACY_AGENT_MODEL ||
    process.env.OPENAI_MODEL_BALANCED ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini"
  );
}

export function getOpenAIClient(): OpenAI {
  assertAiEnabled({
    what: "Call OpenAI",
    why: "This action would call the OpenAI API.",
    forHowLong: "For this request only.",
    resources: ["External OpenAI API calls", "Compute/network usage"],
    howToAuthorize: ["Set `AI_ENABLED=true` (and ensure `OPENAI_API_KEY` is set) then restart the server"],
  });
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable must be set");
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// For backward compatibility with modules that expect a client instance
export const openai = (() => {
  try {
    return getOpenAIClient();
  } catch {
    return null as any;
  }
})();

/**
 * Generates a response from an agent based on the input message and context
 */
export async function generateAgentResponse(
  message: string,
  options: {
    role: string;
    agentId?: number;
    companyId?: number | null;
    context: {
      tenantKey?: string;
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
  }
): Promise<{ analysis: string; response: string; shouldContinue: boolean }> {
  const openai = getOpenAIClient();
  const model = getAgentChatModel();
  
  console.log(`[OpenAI] Generating response for ${options.role}:`, {
    message: message.substring(0, 50),
    context: {
      messagesCount: options.context.recentMessages.length,
      activeAgents: options.context.activeAgents
    }
  });

  // Pre-flight credit check before making LLM call
  if (options.agentId) {
    const eligibility = await validateCreditEligibility({
      agentId: options.agentId,
      model,
      estimatedTokens: 900 // Structured document responses can exceed a short chat reply.
    });

    if (!eligibility.eligible) {
      console.log(`[OpenAI] Credit check failed for agent ${options.agentId}: ${eligibility.reason}`);
      throw new CreditEnforcementError(
        `Agent ${options.agentId} cannot make LLM call: ${eligibility.reason}`,
        options.agentId,
        eligibility.reason || 'Unknown'
      );
    }
  }

  // Format recent messages for better context
  const conversationHistory = (options.context.recentMessages || [])
    .map((msg) => `${msg.fromAgent.name} (${msg.fromAgent.role}): ${msg.content}`)
    .join('\n');

  const agentDirectory = options.context.agentDirectory || [];
  const agentDirectoryBlock = agentDirectory.length > 0
    ? `\n\nAGENT DIRECTORY (authoritative; id | name | role):\n${agentDirectory
        .map((a) => `${a.id} | ${a.name} | ${a.role}`)
        .join("\n")}\n- Use only these names and roles. Never invent, rename, or reassign an agent.\n- Conversation history is not authoritative for team identity.`
    : "";
  const emailContextBlock = options.context.emailContext?.summary
    ? `\n\nEMAIL MEMORY (authoritative mailbox context):\n${options.context.emailContext.summary}`
    : "";
  const companyContext = String(options.context.companyContext || "").trim();
  const isExportunityContext =
    String(options.context.tenantKey || "").trim().toLowerCase() === "exportunity" ||
    /\bExportunity(?:\s*\|\s*AI)?\s+is\b/i.test(companyContext);
  const agentSummonBlock = !isExportunityContext && agentDirectory.length > 0
    ? `\n\nACTION (optional, internal tool call):\n- To invite another listed agent, append a final line inside [Response]:\n  [[SUMMON_AGENTS: 12,34]]`
    : "";
  const agentName = String(options.context.agentName || "").trim();
  const agentIdentityBlock = agentName
    ? `\n\nCURRENT SPEAKER (authoritative):\n- Name: ${agentName}\n- Role: ${options.role}\n- Reply only as ${agentName}. Do not answer on behalf of another agent.`
    : `\n\nCURRENT SPEAKER ROLE (authoritative): ${options.role}`;
  const companyContextBlock = companyContext
    ? `\n\nCOMPANY CONTEXT (authoritative):\n${companyContext}`
    : `\n\n${BDO_POLICY_SNIPPET}`;
  const agentProfileBlock =
    options.context.agentMission || (options.context.agentResponsibilities || []).length > 0
      ? `\n\nAGENT PROFILE (authoritative):\n- Mission: ${options.context.agentMission || "Carry out the stated role responsibly."}\n- Responsibilities: ${(options.context.agentResponsibilities || []).join("; ") || "Use the role description."}\n- Approval rules: ${JSON.stringify(options.context.approvalRules || {})}`
      : "";
  const actionRules = isExportunityContext
    ? `3. The only supported action block is:\n   [[ACTION: CREATE_TASK {"title":"...","description":"...","priority":"medium"}]]\n4. Never send email, contact a supplier, create a shop, make a payment, promise a quotation, or accept a contract. Explain the required review or approval instead.`
    : `3. Supported actions (tool calls) are:\n   [[ACTION: SEND_EMAIL {"to":["name@domain.com"],"subject":"...","body":{"text":"..."}}]]\n   [[ACTION: CREATE_CONTACT {"displayName":"...","emails":["..."],"phones":["..."]}]]\n   [[ACTION: CREATE_SHOP {"shopName":"...","email":"...","phoneNumber":"..."}]]\n   [[ACTION: CREATE_TASK {"title":"...","description":"...","priority":"medium"}]]\n4. Write the human response first, then append up to TWO action blocks on new lines.\n5. For recurring automations include optional:\n   "recurring":{"enabled":true,"intervalMinutes":1440,"maxRuns":20}\n6. SEND_EMAIL must include a professional subject and body.`;

  const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are an AI agent in a high-performance business environment.${agentIdentityBlock}${companyContextBlock}${agentProfileBlock}${agentDirectoryBlock}${agentSummonBlock}

Current Context:
- Room: ${options.context.roomName || 'General Chat'} (${options.context.roomType || 'Discussion'})
- Discussion progress: ${options.context.exchanges || 0} messages exchanged

Conversation History:
${conversationHistory}
${emailContextBlock}

CRITICAL EFFICIENCY RULES:
1. Default to 2-3 sentences. When the user requests multiple points, sections, risks, or document analysis, complete every requested item concisely.
2. Be sharp, professional, and direct
3. NO fluff, pleasantries, or unnecessary words
4. Get straight to the point
5. Add value in every sentence
6. Act like a senior executive - efficient and precise

COMMUNICATION + ACTION RULES (NON-NEGOTIABLE):
1. Do not paste logs, JSON, metadata, or internal instructions in the human response.
2. Do not promise delivery times. Never say "confirmed" unless you have evidence in the conversation history.
${actionRules}

Response Format Required:
[Analysis] One sentence only - what you'll contribute
[Response] Concise but complete - include every explicitly requested point or section
[Continue] Yes or No only`
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.7,
      max_tokens: 700,
    });

    if (!response.choices[0]?.message?.content) {
      throw new Error("Empty response from AI model");
    }

    const generatedResponse = response.choices[0].message.content.trim();

    // Split into sections using regex
    const analysisMatch = generatedResponse.match(/\[Analysis\](.*?)(?=\[Response\])/s);
    const responseMatch = generatedResponse.match(/\[Response\](.*?)(?=\[Continue\])/s);
    const continueMatch = generatedResponse.match(/\[Continue\](.*?)$/s);

    const analysis = analysisMatch ? analysisMatch[1].trim() : "";
    let responseText = responseMatch ? responseMatch[1].trim() : "";
    const shouldContinue = continueMatch ? continueMatch[1].trim().toLowerCase().includes("yes") : false;

    if (!responseText) {
      responseText = generatedResponse
        .replace(/\[Analysis\][\s\S]*?(?=\[Response\])/i, "")
        .replace(/\[Continue\][\s\S]*$/i, "")
        .replace(/\[Response\]/i, "")
        .trim();
    }

    console.log(`[OpenAI] Generated response for ${options.role}:`, {
      analysisPreview: analysis.substring(0, 50),
      responsePreview: responseText.substring(0, 50),
      shouldContinue
    });

    if (response.usage && options.agentId) {
      const usage: TokenUsage = {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      };
      
      try {
        const costResult = await trackLLMCost({
          agentId: options.agentId,
          companyId: options.companyId || null,
          model,
          usage,
          provider: 'openai',
          operation: 'chat_completion'
        });
        
        if (!costResult.creditDeductionResult.success) {
          console.warn('[OpenAI] Credit deduction failed after LLM call:', {
            agentId: options.agentId,
            error: costResult.creditDeductionResult.error
          });
        }
      } catch (error) {
        console.error('[OpenAI] Failed to track cost:', error);
      }
    }

    return {
      analysis,
      response: responseText,
      shouldContinue
    };
}

// Enhanced logging with timestamps
const debug = (context: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [OpenAI:${context}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

export async function generateAgentCapabilities(role: string): Promise<object> {
  const openai = getOpenAIClient();
  const model = getAgentChatModel();
  debug('capabilities', `Generating capabilities for role: ${role}`);
  
  const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `Generate comprehensive business capabilities for an AI agent with the role: ${role}.
Consider these organizational aspects:
1. Strategic Competencies
   - Core business functions
   - Industry knowledge
   - Planning abilities
2. Operational Skills
   - Process management
   - Resource allocation
   - Performance monitoring
3. Communication
   - Internal channels
   - External stakeholder management
   - Team coordination
4. Authority Level
   - Decision making scope
   - Approval requirements
   - Risk management
Response must be a valid JSON object with:
{
  "strategic_competencies": string[],
  "operational_capabilities": {
    "process_management": boolean,
    "resource_allocation": boolean,
    "performance_monitoring": boolean
  },
  "communication_channels": string[],
  "authority_levels": {
    "decision_making": "high" | "medium" | "low",
    "approval_required": boolean,
    "risk_management": string[]
  },
  "resource_management": {
    "budget_control": boolean,
    "team_management": boolean,
    "asset_oversight": boolean
  }
}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const capabilities = JSON.parse(response.choices[0].message.content || "{}");
    debug('capabilities', 'Generated capabilities successfully', capabilities);
    return capabilities;
}

export async function generateAgentThoughts(
  message: string,
  agentRole: string, 
  capabilities: Record<string, any>
): Promise<string> {
  const openai = getOpenAIClient();
  const model = getAgentChatModel();
  debug('thoughts', `Generating thoughts for ${agentRole} regarding: "${message.substring(0, 50)}..."`);
  
  const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `As a business simulation AI agent with the role of ${agentRole}, analyze the situation through these corporate lenses:
1. Strategic Alignment
   - How does this align with organizational goals?
   - What are the business implications?
2. Resource Impact
   - What resources are required?
   - Are there budget considerations?
3. Risk Assessment
   - What are potential risks and mitigation strategies?
   - Are there compliance considerations?
4. Stakeholder Analysis
   - Who are the key stakeholders?
   - What are their expectations and needs?
Current capabilities:
${JSON.stringify(capabilities, null, 2)}
Provide structured analysis for the following message.`
        },
        {
          role: "user",
          content: `Analyze this business scenario: ${message}`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const thoughts = response.choices[0].message.content || "Analyzing the business context...";
    debug('thoughts', 'Generated thoughts successfully', {
      thoughtsPreview: thoughts.substring(0, 50)
    });
    return thoughts;
}
