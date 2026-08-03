import * as openaiLib from './openai';
import * as claudeLib from './claude';
import * as geminiLib from './gemini';
import { AiConsentRequiredError, assertAiEnabled } from "./ai-consent";
import { db } from "@db";
import { companies } from "@db/schema";
import { eq } from "drizzle-orm";
import { sanitizeBdoText } from "./bdo/policy";

export type AIProvider = 'openai' | 'claude' | 'gemini';
export type AgentEmailContext = {
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
type RoutingStrategy = 'balanced' | 'cheapest' | 'quality';
type AiRoutingConfig = {
  strategy: RoutingStrategy;
  allowedProviders?: AIProvider[];
  forcedProvider?: AIProvider | null;
};

const debug = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [AI-Provider] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

/**
 * Determine which AI provider to use based on environment variables.
 * Default routing prefers OpenAI, with Anthropic (Claude) as fallback.
 */
function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  
  if (process.env.OPENAI_API_KEY) {
    providers.push('openai');
  }

  if (process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY) {
    providers.push('claude');
    debug('Claude available (Replit AI Integration: ' + !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY + ')');
  }

  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    providers.push('gemini');
  }
  
  return providers;
}

async function getCompanyAiRoutingConfig(companyId: number | null | undefined): Promise<AiRoutingConfig> {
  if (!companyId) return { strategy: 'balanced' };
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { metadata: true },
  });
  const routing = (company?.metadata as any)?.aiRouting || {};

  const strategy: RoutingStrategy =
    routing.strategy === 'cheapest' || routing.strategy === 'quality' || routing.strategy === 'balanced'
      ? routing.strategy
      : 'balanced';

  const allowedProviders = Array.isArray(routing.allowedProviders)
    ? routing.allowedProviders.filter((p: any) => p === 'openai' || p === 'claude' || p === 'gemini')
    : undefined;

  const forcedProvider: AIProvider | null =
    routing.forcedProvider === 'openai' || routing.forcedProvider === 'claude' || routing.forcedProvider === 'gemini'
      ? routing.forcedProvider
      : null;

  return { strategy, allowedProviders, forcedProvider };
}

function orderProvidersByStrategy(strategy: RoutingStrategy): AIProvider[] {
  if (strategy === 'cheapest') return ['gemini', 'claude', 'openai'];
  if (strategy === 'quality') return ['openai', 'claude', 'gemini'];
  return ['openai', 'claude', 'gemini'];
}

async function getProvidersForCompany(companyId: number | null | undefined): Promise<AIProvider[]> {
  const available = getAvailableProviders();
  const config = await getCompanyAiRoutingConfig(companyId);

  const allowed = config.allowedProviders
    ? config.allowedProviders.filter((p) => available.includes(p))
    : available;

  if (config.forcedProvider && allowed.includes(config.forcedProvider)) {
    return [config.forcedProvider, ...allowed.filter((p) => p !== config.forcedProvider)];
  }

  const order = orderProvidersByStrategy(config.strategy);
  return order.filter((p) => allowed.includes(p));
}

/**
 * Try providers in order until one succeeds
 */
async function tryProviders<T>(
  operation: string,
  providers: AIProvider[],
  executeWithProvider: (provider: AIProvider) => Promise<T>
): Promise<T> {
  const errors: Record<string, Error> = {};
  
  for (const provider of providers) {
    try {
      debug(`Attempting ${operation} with ${provider}`);
      const result = await executeWithProvider(provider);
      debug(`Successfully completed ${operation} with ${provider}`);
      return result;
    } catch (error) {
      if (error instanceof AiConsentRequiredError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors[provider] = error as Error;
      debug(`Failed ${operation} with ${provider}: ${errorMessage}`);
      
      // Continue to next provider
      continue;
    }
  }
  
  // All providers failed
  debug(`All providers failed for ${operation}`, { errors: Object.keys(errors) });
  throw new Error(`All AI providers failed for ${operation}: ${Object.entries(errors).map(([p, e]) => `${p}: ${e.message}`).join(', ')}`);
}

/**
 * Generates a response from an agent using available AI providers with automatic fallback
 */
export async function generateAgentResponse(
  message: string,
  options: {
    role: string;
    agentId?: number;
    companyId?: number | null;
    context: {
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
      emailContext?: AgentEmailContext;
    };
  }
): Promise<{ analysis: string; response: string; shouldContinue: boolean }> {
  assertAiEnabled({
    what: "Generate an AI agent response",
    why: "This generates an agent reply using an external AI model.",
    forHowLong: "For this request only.",
    resources: ["External AI API calls", "Compute/network usage"],
  });
  const providers = await getProvidersForCompany(options.companyId);
  
  if (providers.length === 0) {
    return {
      analysis: "",
      response: "AI is not configured. Set OPENAI_API_KEY (recommended) to enable agent responses.",
      shouldContinue: false,
    };
  }
  
  const result = await tryProviders(
    'generateAgentResponse',
    providers,
    async (provider) => {
      if (provider === 'openai') {
        return openaiLib.generateAgentResponse(message, options);
      } else if (provider === 'claude') {
        return claudeLib.generateAgentResponse(message, options);
      } else {
        return geminiLib.generateAgentResponse(message, options);
      }
    }
  );

  const isExportunityContext = /Exportunity is a B2B/i.test(String(options.context.companyContext || ""));
  if (!isExportunityContext) {
    const sanitized = sanitizeBdoText(result.response);
    if (sanitized.violated && sanitized.text !== result.response) {
      debug("BDO compliance wording sanitized", { violations: sanitized.violations, agentId: options.agentId });
      return { ...result, response: sanitized.text };
    }
  }

  return result;
}

/**
 * Generates capabilities for an agent using available AI providers
 */
export async function generateAgentCapabilities(role: string): Promise<object> {
  assertAiEnabled({
    what: "Generate AI agent capabilities",
    why: "This generates agent capability metadata using an external AI model.",
    forHowLong: "For this request only.",
    resources: ["External AI API calls", "Compute/network usage"],
  });
  const available = getAvailableProviders();
  const providers = orderProvidersByStrategy('balanced').filter((p) => available.includes(p));
  
  if (providers.length === 0) {
    return {
      role,
      can_create_agents: true,
      can_assign_tasks: true,
      can_send_messages: true,
      can_access_knowledge_base: true,
      domain_expertise: [role],
      communication_channels: ["chat"],
      note: "AI is not configured. Set OPENAI_API_KEY to generate richer capabilities.",
    };
  }
  
  return tryProviders(
    'generateAgentCapabilities',
    providers,
    async (provider) => {
      if (provider === 'openai') {
        return openaiLib.generateAgentCapabilities(role);
      } else if (provider === 'claude') {
        return claudeLib.generateAgentCapabilities(role);
      } else {
        return geminiLib.generateAgentCapabilities(role);
      }
    }
  );
}

/**
 * Generates thoughts for an agent using available AI providers
 */
export async function generateAgentThoughts(
  message: string,
  agentRole: string,
  capabilities: Record<string, any>
): Promise<string> {
  assertAiEnabled({
    what: "Generate AI agent thoughts",
    why: "This generates agent internal thoughts using an external AI model.",
    forHowLong: "For this request only.",
    resources: ["External AI API calls", "Compute/network usage"],
  });
  const available = getAvailableProviders();
  const providers = orderProvidersByStrategy('balanced').filter((p) => available.includes(p));
  
  if (providers.length === 0) {
    return "";
  }
  
  return tryProviders(
    'generateAgentThoughts',
    providers,
    async (provider) => {
      if (provider === 'openai') {
        return openaiLib.generateAgentThoughts(message, agentRole, capabilities);
      } else if (provider === 'claude') {
        return claudeLib.generateAgentThoughts(message, agentRole, capabilities);
      } else {
        return geminiLib.generateAgentThoughts(message, agentRole, capabilities);
      }
    }
  );
}
