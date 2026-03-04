import OpenAI from "openai";
import { generateAgentCapabilities } from "./openai";
import type { Agent } from "@db/schema";

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface GeneratedAgentProfile {
  name: string;
  role: string;
  capabilities: Record<string, any>;
  personality: {
    traits: string[];
    communicationStyle: string;
    decisionMaking: string;
    learningStyle: string;
  };
  responsibilities: string[];
  hierarchyLevel: number;
}

export async function generateAgentFromDescription(
  description: string
): Promise<GeneratedAgentProfile> {
  try {
    if (!openai) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert in organizational design and business roles. 
Generate a detailed agent profile based on the provided description.
Consider organizational hierarchy, responsibilities, and personality traits.
The output should be a valid JSON object matching this TypeScript interface:

interface AgentProfile {
  name: string;                    // Professional name for the agent
  role: string;                    // Clear business role title
  capabilities: {                  // What the agent can do
    strategic_competencies: string[];
    operational_capabilities: {
      process_management: boolean;
      resource_allocation: boolean;
      performance_monitoring: boolean;
    };
    communication_channels: string[];
    authority_levels: {
      decision_making: "high" | "medium" | "low";
      approval_required: boolean;
      risk_management: string[];
    }
  };
  personality: {
    traits: string[];             // 3-5 key personality traits
    communicationStyle: string;   // Brief description of communication approach
    decisionMaking: string;       // Decision-making style
    learningStyle: string;        // How the agent learns and adapts
  };
  responsibilities: string[];     // 3-5 key responsibilities
  hierarchyLevel: number;         // Suggested hierarchy level (1-5, where 1 is highest)
}`
        },
        {
          role: "user",
          content: description
        }
      ],
      response_format: { type: "json_object" }
    });

    if (!response.choices[0]?.message?.content) {
      throw new Error("Failed to generate agent profile");
    }

    const profile = JSON.parse(response.choices[0].message.content);
    
    // Validate and clean up the profile
    return {
      name: profile.name,
      role: profile.role,
      capabilities: profile.capabilities,
      personality: {
        traits: profile.personality.traits.slice(0, 5),
        communicationStyle: profile.personality.communicationStyle,
        decisionMaking: profile.personality.decisionMaking,
        learningStyle: profile.personality.learningStyle
      },
      responsibilities: profile.responsibilities.slice(0, 5),
      hierarchyLevel: Math.min(Math.max(1, profile.hierarchyLevel), 5)
    };
  } catch (error) {
    console.error("Error generating agent profile:", error);
    throw error;
  }
}
