import { Agent } from "@db/schema";
import { resolveApiUrl } from "./runtimeConfig";

// Types for API responses
interface OpenAIResponse {
  status: string;
  data: any;
  error?: string;
}

interface AgentCapabilities {
  can_create_agents: boolean;
  can_assign_tasks: boolean;
  can_send_messages: boolean;
  can_access_knowledge_base: boolean;
  domain_expertise: string[];
  communication_channels: string[];
  [key: string]: any;
}

// Helper function to generate agent response
export async function generateAgentResponse(
  content: string,
  fromAgent: Agent,
  toAgent: Agent
): Promise<OpenAIResponse> {
  try {
    const response = await fetch(resolveApiUrl("/api/messages"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        fromAgentId: fromAgent.id,
        toAgentId: toAgent.id,
        type: "chat",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      status: "success",
      data,
    };
  } catch (error) {
    return {
      status: "error",
      data: null,
      error: error instanceof Error ? error.message : "Failed to generate response",
    };
  }
}

// Generate capabilities for a new agent
export async function generateAgentCapabilities(role: string): Promise<OpenAIResponse> {
  try {
    const response = await fetch(resolveApiUrl("/api/agents/capabilities"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const capabilities: AgentCapabilities = await response.json();
    return {
      status: "success",
      data: capabilities,
    };
  } catch (error) {
    return {
      status: "error",
      data: null,
      error: error instanceof Error ? error.message : "Failed to generate capabilities",
    };
  }
}

// Analyze message context and generate appropriate response format
export async function analyzeMessageContext(
  message: string,
  agent: Agent
): Promise<OpenAIResponse> {
  try {
    const response = await fetch(resolveApiUrl("/api/agents/analyze"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        agentId: agent.id,
        role: agent.role,
        capabilities: agent.capabilities,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const analysisResult = await response.json();
    return {
      status: "success",
      data: analysisResult,
    };
  } catch (error) {
    return {
      status: "error",
      data: null,
      error: error instanceof Error ? error.message : "Failed to analyze message context",
    };
  }
}

// Generate task recommendations based on conversation
export async function generateTaskRecommendations(
  conversationHistory: string[],
  agent: Agent
): Promise<OpenAIResponse> {
  try {
    const response = await fetch(resolveApiUrl("/api/agents/tasks/recommend"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationHistory,
        agentId: agent.id,
        role: agent.role,
        capabilities: agent.capabilities,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const recommendations = await response.json();
    return {
      status: "success",
      data: recommendations,
    };
  } catch (error) {
    return {
      status: "error",
      data: null,
      error: error instanceof Error ? error.message : "Failed to generate task recommendations",
    };
  }
}

// Generate agent hierarchy suggestions
export async function generateHierarchySuggestions(
  currentAgents: Agent[]
): Promise<OpenAIResponse> {
  try {
    const response = await fetch(resolveApiUrl("/api/agents/hierarchy/suggest"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentAgents,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const suggestions = await response.json();
    return {
      status: "success",
      data: suggestions,
    };
  } catch (error) {
    return {
      status: "error",
      data: null,
      error: error instanceof Error ? error.message : "Failed to generate hierarchy suggestions",
    };
  }
}

// Validate agent actions based on capabilities
export function validateAgentAction(
  action: string,
  agent: Agent
): { valid: boolean; reason?: string } {
  const capabilities = agent.capabilities as AgentCapabilities;

  switch (action) {
    case "create_agent":
      return {
        valid: capabilities.can_create_agents,
        reason: capabilities.can_create_agents ? undefined : "Agent lacks permission to create other agents",
      };
    case "assign_task":
      return {
        valid: capabilities.can_assign_tasks,
        reason: capabilities.can_assign_tasks ? undefined : "Agent lacks permission to assign tasks",
      };
    case "send_message":
      return {
        valid: capabilities.can_send_messages,
        reason: capabilities.can_send_messages ? undefined : "Agent lacks permission to send messages",
      };
    default:
      return {
        valid: false,
        reason: "Unknown action type",
      };
  }
}

// Helper function to format agent messages based on role and capabilities
export function formatAgentMessage(
  message: string,
  agent: Agent
): string {
  const capabilities = agent.capabilities as AgentCapabilities;
  const prefix = `[${agent.role}] `;
  const suffix = capabilities.domain_expertise
    ? ` (Expert in: ${capabilities.domain_expertise.join(", ")})`
    : "";

  return `${prefix}${message}${suffix}`;
}
