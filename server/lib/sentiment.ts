import OpenAI from "openai";
import type { Message } from "@db/schema";

export interface SentimentAnalysis {
  sentiment: number; // -1 to 1 scale
  emotional_tone: string;
  business_context: {
    professionalism: number; // 0 to 1 scale
    urgency: number; // 0 to 1 scale
    decision_impact: number; // 0 to 1 scale
  };
  key_topics: string[];
}

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function analyzeSentiment(message: string): Promise<SentimentAnalysis> {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return {
        sentiment: 0,
        emotional_tone: "neutral",
        business_context: {
          professionalism: 0.5,
          urgency: 0,
          decision_impact: 0,
        },
        key_topics: [],
      };
    }
    const systemPrompt = `Analyze the business communication sentiment and context. 
Format your response EXACTLY as shown, with all numeric values:
{sentiment} [number between -1 and 1]
{emotional_tone} [primary emotional tone]
{professionalism} [number between 0 and 1]
{urgency} [number between 0 and 1]
{decision_impact} [number between 0 and 1]
{key_topics} [comma-separated list of main business topics]`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
    });

    const content = response.choices[0].message.content || "";
    const lines = content.split('\n');

    // Parse the formatted response
    const sentiment = parseFloat(lines[0]) || 0;
    const emotional_tone = (lines[1] || "neutral").trim();
    const professionalism = parseFloat(lines[2]) || 0.5;
    const urgency = parseFloat(lines[3]) || 0;
    const decision_impact = parseFloat(lines[4]) || 0;
    const key_topics = lines[5] ? lines[5].split(',').map(t => t.trim()) : [];

    return {
      sentiment,
      emotional_tone,
      business_context: {
        professionalism,
        urgency,
        decision_impact
      },
      key_topics
    };
  } catch (error) {
    console.error("Error analyzing sentiment:", error);
    // Return neutral sentiment on error
    return {
      sentiment: 0,
      emotional_tone: "neutral",
      business_context: {
        professionalism: 0.5,
        urgency: 0,
        decision_impact: 0
      },
      key_topics: []
    };
  }
}

export async function analyzeInteraction(messages: Message[]): Promise<{
  overallSentiment: number;
  interactionQuality: number;
  communicationEffectiveness: number;
}> {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return {
        overallSentiment: 0,
        interactionQuality: 0.5,
        communicationEffectiveness: 0.5,
      };
    }
    const messageContext = messages
      .map(msg => `${msg.fromAgentId} -> ${msg.toAgentId}: ${msg.content}`)
      .join("\n");

    const systemPrompt = `Analyze this business interaction sequence and provide metrics in the following format:
{overall_sentiment} [number between -1 and 1]
{interaction_quality} [number between 0 and 1]
{communication_effectiveness} [number between 0 and 1]

Consider:
- Sentiment progression
- Response appropriateness
- Goal alignment
- Communication clarity`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageContext }
      ],
      temperature: 0.7,
    });

    const content = response.choices[0].message.content || "";
    const lines = content.split('\n');

    return {
      overallSentiment: parseFloat(lines[0]) || 0,
      interactionQuality: parseFloat(lines[1]) || 0.5,
      communicationEffectiveness: parseFloat(lines[2]) || 0.5
    };
  } catch (error) {
    console.error("Error analyzing interaction:", error);
    return {
      overallSentiment: 0,
      interactionQuality: 0.5,
      communicationEffectiveness: 0.5
    };
  }
}
