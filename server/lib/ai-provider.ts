import * as openaiLib from './openai';
import * as claudeLib from './claude';
import * as geminiLib from './gemini';
import { AiConsentRequiredError, assertAiEnabled } from "./ai-consent";
import { db } from "@db";
import { agents, companies } from "@db/schema";
import { eq } from "drizzle-orm";
import { EXPORTUNITY_COMPANY_CONTEXT } from "./industrial/companyContext";
import { applyTenantResponsePolicy } from "./tenant-ai-policy";
import { getAgentPolicy } from "./agent-os/registry";
import {
  loadCompanyBrainContextPack,
  renderCompanyBrainContextPackForModel,
} from "./company-brain/contextAssembler";
import { isCompanyBrainFeatureEnabled } from "./company-brain/featureFlags";

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

type AgentResponseContext = {
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
  emailContext?: AgentEmailContext;
  taskKey?: string;
  conversationId?: string | null;
  correlationId?: string | null;
};

type AgentResponseOptions = {
  role: string;
  agentId?: number;
  companyId?: number | null;
  context: AgentResponseContext;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isExportunityCompanyName(value: unknown) {
  return /^exportunity(?:\s+machinery)?$/i.test(String(value || "").trim());
}

function isBdoCompanyName(value: unknown) {
  return /bourse\s+de\s+l['’]?or/i.test(String(value || "").trim());
}

/**
 * The legacy channel/meeting callers are shared by multiple tenants. Hydrate
 * the named agent and company context here so Exportunity never falls through
 * to another tenant's default policy when a caller omits it.
 */
async function hydrateAgentResponseOptions(options: AgentResponseOptions): Promise<AgentResponseOptions> {
  const context: AgentResponseContext = { ...options.context };
  const agentRow = options.agentId
    ? await db.query.agents.findFirst({
        where: eq(agents.id, options.agentId),
        columns: {
          name: true,
          role: true,
          companyId: true,
          tenantId: true,
          metadata: true,
          mission: true,
          responsibilities: true,
          approvalRules: true,
        },
      })
    : null;
  const effectiveCompanyId = options.companyId ?? agentRow?.companyId ?? null;
  const company = effectiveCompanyId
    ? await db.query.companies.findFirst({
        where: eq(companies.id, effectiveCompanyId),
        columns: { name: true },
      })
    : null;
  const metadata = asRecord(agentRow?.metadata);
  const metadataCompanyContext = typeof metadata.companyContext === "string" ? metadata.companyContext.trim() : "";

  const explicitTenantKey = String(context.tenantKey || "").trim().toLowerCase();
  if (explicitTenantKey === "exportunity" || (!explicitTenantKey && isExportunityCompanyName(company?.name))) {
    context.tenantKey = "exportunity";
    context.companyContext = EXPORTUNITY_COMPANY_CONTEXT;
  } else if (explicitTenantKey === "bdo" || (!explicitTenantKey && isBdoCompanyName(company?.name))) {
    context.tenantKey = "bdo";
  } else if (!context.companyContext && metadataCompanyContext) {
    context.companyContext = metadataCompanyContext;
  }

  if (!context.agentName && typeof agentRow?.name === "string") {
    context.agentName = agentRow.name.trim();
  }

  if (!context.agentMission && typeof agentRow?.mission === "string") {
    context.agentMission = agentRow.mission;
  }
  if (!context.agentResponsibilities && Array.isArray(agentRow?.responsibilities)) {
    context.agentResponsibilities = agentRow.responsibilities.map((item) => String(item)).filter(Boolean);
  }
  if (!context.approvalRules && agentRow?.approvalRules && typeof agentRow.approvalRules === "object") {
    context.approvalRules = agentRow.approvalRules as Record<string, unknown>;
  }

  if (
    context.tenantKey === "exportunity" &&
    options.agentId &&
    agentRow?.tenantId &&
    isCompanyBrainFeatureEnabled("companyBrain") &&
    isCompanyBrainFeatureEnabled("contextPacks")
  ) {
    const policy = await getAgentPolicy(options.agentId);
    const correlationId = String(context.correlationId || "").trim() || null;
    const taskKey =
      String(context.taskKey || "").trim() ||
      correlationId ||
      `agent-response:${options.agentId}:${context.roomType || "conversation"}:${context.roomName || "general"}`;
    const pack = await loadCompanyBrainContextPack({
      tenantId: Number(agentRow.tenantId),
      companyId: effectiveCompanyId,
      agentPolicy: policy,
      taskKey,
      purpose: "internal",
      conversationId: String(context.conversationId || "").trim() || null,
      correlationId,
    });
    context.companyContext = [
      context.companyContext,
      renderCompanyBrainContextPackForModel(pack),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return {
    ...options,
    role:
      isExportunityCompanyName(company?.name) && typeof agentRow?.role === "string" && agentRow.role.trim()
        ? agentRow.role.trim()
        : options.role,
    companyId: effectiveCompanyId,
    context,
  };
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
  options: AgentResponseOptions,
): Promise<{ analysis: string; response: string; shouldContinue: boolean }> {
  assertAiEnabled({
    what: "Generate an AI agent response",
    why: "This generates an agent reply using an external AI model.",
    forHowLong: "For this request only.",
    resources: ["External AI API calls", "Compute/network usage"],
  });
  const effectiveOptions = await hydrateAgentResponseOptions(options);
  const providers = await getProvidersForCompany(effectiveOptions.companyId);
  
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
        return openaiLib.generateAgentResponse(message, effectiveOptions);
      } else if (provider === 'claude') {
        return claudeLib.generateAgentResponse(message, effectiveOptions);
      } else {
        return geminiLib.generateAgentResponse(message, effectiveOptions);
      }
    }
  );

  const policyResult = applyTenantResponsePolicy(result.response, {
    tenantKey: effectiveOptions.context.tenantKey,
    companyContext: effectiveOptions.context.companyContext,
  });
  if (policyResult.violated && policyResult.text !== result.response) {
    debug("Tenant response wording sanitized", {
      policy: policyResult.policy,
      violations: policyResult.violations,
      agentId: options.agentId,
    });
    return { ...result, response: policyResult.text };
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
