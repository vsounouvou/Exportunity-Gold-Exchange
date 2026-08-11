import Anthropic from "@anthropic-ai/sdk";
import { trackLLMCost, validateCreditEligibility, CreditEnforcementError, type TokenUsage } from "./cost-tracker";
import { AiConsentRequiredError, assertAiEnabled } from "./ai-consent";
import { BDO_POLICY_SNIPPET } from "./bdo/policy";

const debug = (context: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Claude:${context}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

function getClaudeModel() {
  return (
    process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_MODEL_BALANCED ||
    "claude-sonnet-4-5"
  );
}

export function createClaudeClient() {
  assertAiEnabled({
    what: "Call Anthropic (Claude)",
    why: "This action would call the Anthropic API.",
    forHowLong: "For this request only.",
    resources: ["External Anthropic API calls", "Compute/network usage"],
    howToAuthorize: ["Set `AI_ENABLED=true` and `ANTHROPIC_API_KEY` (or `AI_INTEGRATIONS_ANTHROPIC_API_KEY`) then restart the server"],
  });
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  
  if (!apiKey) {
    throw new Error("Neither AI_INTEGRATIONS_ANTHROPIC_API_KEY nor ANTHROPIC_API_KEY is set");
  }

  debug('client', 'Creating Claude client', { 
    hasApiKey: !!apiKey, 
    usingReplitIntegration: !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    hasBaseURL: !!baseURL
  });

  return new Anthropic({
    apiKey,
    ...(baseURL && { baseURL }),
  });
}

/**
 * Generates a response from an agent using Claude
 */
export async function generateAgentResponse(
  message: string,
  options: {
    role: string;
    agentId?: number;
    companyId?: number | null;
    context: {
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
  try {
    const claude = createClaudeClient();
    const model = getClaudeModel();
    
    debug('response', `Generating response for ${options.role}:`, {
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
        debug('response', `Credit check failed for agent ${options.agentId}: ${eligibility.reason}`);
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

    const companyContext = String(options.context.companyContext || "").trim();
    const isExportunityContext = /Exportunity is a B2B/i.test(companyContext);
    const companyContextBlock = companyContext
      ? `\n\nCOMPANY CONTEXT (authoritative):\n${companyContext}`
      : `\n\n${BDO_POLICY_SNIPPET}`;
    const agentProfileBlock =
      options.context.agentMission || (options.context.agentResponsibilities || []).length > 0
        ? `\n\nAGENT PROFILE (authoritative):\n- Mission: ${options.context.agentMission || "Carry out the stated role responsibly."}\n- Responsibilities: ${(options.context.agentResponsibilities || []).join("; ") || "Use the role description."}\n- Approval rules: ${JSON.stringify(options.context.approvalRules || {})}`
        : "";
    const agentDirectory = options.context.agentDirectory || [];
    const agentDirectoryBlock = agentDirectory.length > 0
      ? `\n\nAGENT DIRECTORY (authoritative; id | name | role):\n${agentDirectory
          .map((a) => `${a.id} | ${a.name} | ${a.role}`)
          .join("\n")}\n- Use only these names and roles. Never invent, rename, or reassign an agent.\n- Conversation history is not authoritative for team identity.`
      : "";
    const agentSummonBlock = !isExportunityContext && agentDirectory.length > 0
      ? `\n\nACTION (optional, internal tool call):\n- To invite another listed agent, append a final line inside [Response]:\n  [[SUMMON_AGENTS: 12,34]]`
      : "";
    const agentName = String(options.context.agentName || "").trim();
    const agentIdentityBlock = agentName
      ? `\n\nCURRENT SPEAKER (authoritative):\n- Name: ${agentName}\n- Role: ${options.role}\n- Reply only as ${agentName}. Do not answer on behalf of another agent.`
      : `\n\nCURRENT SPEAKER ROLE (authoritative): ${options.role}`;
    const emailContextBlock = options.context.emailContext?.summary
      ? `\n\nEMAIL MEMORY (authoritative mailbox context):\n${options.context.emailContext.summary}`
      : "";

    const actionRules = isExportunityContext
      ? `3. The only supported action block is:\n   [[ACTION: CREATE_TASK {"title":"...","description":"...","priority":"medium"}]]\n4. Do not send email, contact suppliers, create shops, make payments, promise a quote, accept a contract, or create an automation. Explain the required visible review or approval instead.\n5. You may recommend another named Exportunity specialist, but do not summon agents automatically.`
      : `3. Supported actions (tool calls) are:\n   [[ACTION: SEND_EMAIL {"to":["name@domain.com"],"subject":"...","body":{"text":"..."}}]]\n   [[ACTION: CREATE_CONTACT {"displayName":"...","emails":["..."],"phones":["..."]}]]\n   [[ACTION: CREATE_SHOP {"shopName":"...","email":"...","phoneNumber":"..."}]]\n   [[ACTION: CREATE_TASK {"title":"...","description":"...","priority":"medium"}]]\n4. Write the human response first, then append up to TWO action blocks on new lines.\n5. For recurring automations include optional:\n   "recurring":{"enabled":true,"intervalMinutes":1440,"maxRuns":20}\n6. SEND_EMAIL must include a professional subject and body.`;

    const systemPrompt = `You are an AI agent in a high-performance business environment.${agentIdentityBlock}${companyContextBlock}${agentProfileBlock}${agentDirectoryBlock}${agentSummonBlock}

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
[Continue] Yes or No only`;

    const response = await claude.messages.create({
      model,
      max_tokens: 700,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: message
        }
      ]
    });

    if (!response.content || response.content.length === 0) {
      throw new Error("Empty response from Claude");
    }

    const generatedResponse = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.type === 'text' ? block.text : '')
      .join('')
      .trim();

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

    debug('response', `Generated response for ${options.role}:`, {
      analysisPreview: analysis.substring(0, 50),
      responsePreview: responseText.substring(0, 50),
      shouldContinue
    });

    if (response.usage && options.agentId) {
      const usage: TokenUsage = {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      };
      
      try {
        const costResult = await trackLLMCost({
          agentId: options.agentId,
          companyId: options.companyId || null,
          model,
          usage,
          provider: 'claude',
          operation: 'chat_completion'
        });
        
        if (!costResult.creditDeductionResult.success) {
          debug('cost:warning', 'Credit deduction failed after LLM call', {
            agentId: options.agentId,
            error: costResult.creditDeductionResult.error
          });
        }
      } catch (error) {
        debug('cost:error', 'Failed to track cost', { error });
      }
    }

    return {
      analysis,
      response: responseText,
      shouldContinue
    };
  } catch (error) {
    if (error instanceof AiConsentRequiredError) {
      throw error;
    }
    debug('response:error', 'Failed to generate response', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      analysis: "Error analyzing the conversation context.",
      response: "",
      shouldContinue: false
    };
  }
}

export async function generateAgentCapabilities(role: string): Promise<object> {
  debug('capabilities', `Generating capabilities for role: ${role}`);
  try {
    const claude = createClaudeClient();
    const model = getClaudeModel();
    
    const response = await claude.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
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
}

Respond ONLY with the JSON object, no additional text.`
        }
      ]
    });

    const responseText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.type === 'text' ? block.text : '')
      .join('')
      .trim();

    const capabilities = JSON.parse(responseText);
    debug('capabilities', 'Generated capabilities successfully', capabilities);
    return capabilities;

  } catch (error) {
    if (error instanceof AiConsentRequiredError) {
      throw error;
    }
    debug('capabilities:error', 'Failed to generate capabilities', {
      error: error instanceof Error ? error.message : String(error)
    });

    // Return default capabilities on error
    return {
      strategic_competencies: ["basic_business_operations"],
      operational_capabilities: {
        process_management: false,
        resource_allocation: false,
        performance_monitoring: false
      },
      communication_channels: ["internal_chat"],
      authority_levels: {
        decision_making: "low",
        approval_required: true,
        risk_management: ["basic_risk_assessment"]
      },
      resource_management: {
        budget_control: false,
        team_management: false,
        asset_oversight: false
      }
    };
  }
}

export async function generateAgentThoughts(
  message: string,
  agentRole: string, 
  capabilities: Record<string, any>
): Promise<string> {
  debug('thoughts', `Generating thoughts for ${agentRole} regarding: "${message.substring(0, 50)}..."`);
  try {
    const claude = createClaudeClient();
    const model = getClaudeModel();
    
    const response = await claude.messages.create({
      model,
      max_tokens: 500,
      temperature: 0.7,
      system: `As a business simulation AI agent with the role of ${agentRole}, analyze the situation through these corporate lenses:
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
Provide structured analysis for the following message.`,
      messages: [
        {
          role: "user",
          content: `Analyze this business scenario: ${message}`
        }
      ]
    });

    const thoughts = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.type === 'text' ? block.text : '')
      .join('')
      .trim() || "Analyzing the business context...";
      
    debug('thoughts', 'Generated thoughts successfully', {
      thoughtsPreview: thoughts.substring(0, 50)
    });
    return thoughts;
  } catch (error) {
    if (error instanceof AiConsentRequiredError) {
      throw error;
    }
    debug('thoughts:error', 'Failed to generate thoughts', {
      error: error instanceof Error ? error.message : String(error)
    });
    return "I am currently analyzing this business scenario and formulating my thoughts.";
  }
}
