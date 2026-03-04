import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";

const anthropicApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const anthropicBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const anthropicModel =
  process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL_BALANCED ||
  "claude-sonnet-4-5";
const anthropic = anthropicApiKey
  ? new Anthropic({
      apiKey: anthropicApiKey,
      ...(anthropicBaseURL ? { baseURL: anthropicBaseURL } : {}),
    })
  : null;

export type UserRole = 'buyer' | 'seller' | 'admin' | 'guest';

interface ChatContext {
  role: UserRole;
  userId: number;
  userName: string;
  companyName?: string;
  verificationStatus?: string;
  additionalContext?: Record<string, any>;
}

const SYSTEM_PROMPTS: Record<UserRole, string> = {
  guest: `You are the ECE (Exportunity Commodities Exchange) Assistant for visitors exploring the platform.

Your role is to help prospective users understand:
- What Exportunity Commodities Exchange does (transparent African gold trading)
- How the platform ensures transparency through government-verified suppliers
- The role of national assayers in certifying gold purity
- How BRINKS handles secure logistics worldwide
- The difference between buyer and seller roles on the platform
- How to get started on the platform

Key principles:
- Be welcoming and informative about our transparency-first approach
- Explain the D2C (Direct-to-Consumer) model that benefits African suppliers
- Highlight the full traceability chain: Verified Mine → National Assayer → BRINKS → Delivery
- Encourage visitors to sign up to access full platform features
- Never reveal specific supplier or buyer information (even in demos)

Be friendly, professional, and focused on showcasing the value of transparent commodities trading.`,

  buyer: `You are the ECE (Exportunity Commodities Exchange) Assistant for buyers.

Your role is to help verified gold buyers:
- Request gold or other commodities with specific quantities and purity requirements
- Receive competitive pricing quotes based on current market rates
- Review and sign contract drafts
- Track export timelines and shipping status
- Receive updates from national assayers about gold purity verification
- Get notified when BRINKS picks up and delivers shipments

Key principles:
- Never reveal supplier identities - all supply comes through Exportunity's verified network
- Always verify proof-of-funds status before processing large orders
- Provide transparent pricing including all fees
- Explain the full traceability chain: Mine → National Assayer → BRINKS → Delivery

Be professional, helpful, and focused on building trust through transparency.`,

  seller: `You are the ECE (Exportunity Commodities Exchange) Assistant for sellers (gold suppliers).

Your role is to help verified gold sellers:
- Declare inventory (weight, estimated purity, production date)
- Upload required documents (mining license, government registration, export permits)
- Confirm government registration status
- Indicate when inventory is ready for national assayer testing
- Track the status of their gold through the export process

Key principles:
- Never reveal buyer identities - all sales go through Exportunity's D2C platform
- Verify seller matches government-approved supplier lists
- Guide sellers through compliance requirements
- Explain the traceability chain: Declaration → Government Verification → Assay → Export

You represent Exportunity's commitment to transparency and fair pricing for African suppliers.`,

  admin: `You are the ECE (Exportunity Commodities Exchange) Admin Assistant.

Your role is to help platform administrators:
- Upload and manage government supplier lists
- Approve buyer onboarding after verification
- Validate proof-of-funds documentation
- Assign and modify user roles
- Trigger and monitor export workflows
- Oversee AI agent activities
- Access comprehensive platform data

Key principles:
- Maintain strict security protocols
- Log all sensitive actions
- Verify identities before making changes
- Ensure compliance with all regulations

You have full platform visibility and responsibility for maintaining platform integrity.`
};

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

export async function generateChatResponse(
  message: string,
  context: ChatContext,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  if (!anthropic) {
    return "AI is not configured. Set OPENAI_API_KEY (recommended) or ANTHROPIC_API_KEY to enable assistants.";
  }

  const systemPrompt = SYSTEM_PROMPTS[context.role];
  
  const contextInfo = `
Current User: ${context.userName}
${context.companyName ? `Company: ${context.companyName}` : ''}
Role: ${context.role}
${context.verificationStatus ? `Verification Status: ${context.verificationStatus}` : ''}
${context.additionalContext ? `Additional Context: ${JSON.stringify(context.additionalContext)}` : ''}
`;

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...conversationHistory,
    { role: 'user', content: message }
  ];

  return pRetry(
    async () => {
      try {
        const response = await anthropic.messages.create({
          model: anthropicModel,
          max_tokens: 8192,
          system: `${systemPrompt}\n\n--- Current Session Context ---\n${contextInfo}`,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        });

        const content = response.content[0];
        if (content.type === "text") {
          return content.text;
        }
        throw new Error("Unexpected response type");
      } catch (error: any) {
        if (isRateLimitError(error)) {
          throw error;
        }
        throw new AbortError(error);
      }
    },
    {
      retries: 5,
      minTimeout: 2000,
      maxTimeout: 30000,
      factor: 2,
    }
  );
}

export async function generateBuyerPricing(
  request: {
    commodityType: string;
    weightKg: number;
    minPurity?: number;
    deliveryCountry?: string;
  },
  context: ChatContext
): Promise<string> {
  const prompt = `Generate a professional pricing quote response for a gold buyer request:
- Commodity: ${request.commodityType}
- Requested Weight: ${request.weightKg} kg
${request.minPurity ? `- Minimum Purity: ${request.minPurity}%` : ''}
${request.deliveryCountry ? `- Delivery Country: ${request.deliveryCountry}` : ''}

Explain the pricing breakdown including:
1. Base price per kg (reference spot price)
2. Premium/fees breakdown
3. Estimated timeline
4. Next steps to proceed

Do not provide actual prices - just explain the structure and ask them to confirm their request for an official quote.`;

  return generateChatResponse(prompt, context);
}

export async function generateSupplierGuidance(
  inventoryDetails: {
    commodityType: string;
    weightKg: number;
    declaredPurity?: number;
    hasDocuments: boolean;
  },
  context: ChatContext
): Promise<string> {
  const prompt = `Generate guidance for a supplier declaring inventory:
- Commodity: ${inventoryDetails.commodityType}
- Declared Weight: ${inventoryDetails.weightKg} kg
${inventoryDetails.declaredPurity ? `- Declared Purity: ${inventoryDetails.declaredPurity}%` : ''}
- Documents Uploaded: ${inventoryDetails.hasDocuments ? 'Yes' : 'No'}

Explain:
1. What documents are still needed (if any)
2. The verification process with government supplier lists
3. Next steps for national assayer testing
4. Expected timeline to export readiness`;

  return generateChatResponse(prompt, context);
}

export async function generateShareholderReport(
  reportType: 'rotation_summary' | 'margin_report' | 'country_exposure' | 'risk_report',
  context: ChatContext,
  data?: Record<string, any>
): Promise<string> {
  const reportPrompts: Record<string, string> = {
    rotation_summary: `Generate a rotation summary report for shareholders. Include:
- Total number of completed gold rotations
- Total volume processed (kg)
- Average rotation time
- Month-over-month trends
Use sample/demo data if actual data not provided.`,
    margin_report: `Generate a margin report for shareholders. Include:
- Gross margin percentage and absolute value
- Net margin after all costs
- Breakdown by commodity type
- Comparison to previous period
Use sample/demo data if actual data not provided.`,
    country_exposure: `Generate a country exposure analysis for shareholders. Include:
- Breakdown of sourcing by African country
- Volume and value per country
- Risk assessment per country
- Diversification recommendations
Use sample/demo data if actual data not provided.`,
    risk_report: `Generate a risk report for shareholders. Include:
- Current risk exposure levels
- Regulatory risks by country
- Market volatility assessment
- Mitigation strategies in place
Use sample/demo data if actual data not provided.`
  };

  return generateChatResponse(reportPrompts[reportType], context);
}

export async function generateAdminAction(
  action: string,
  details: Record<string, any>,
  context: ChatContext
): Promise<string> {
  const prompt = `Admin action requested: ${action}
Details: ${JSON.stringify(details)}

Provide guidance on executing this action, including:
1. Verification steps needed
2. Security considerations
3. Expected outcomes
4. Any warnings or cautions`;

  return generateChatResponse(prompt, context);
}

const limit = pLimit(2);

export async function batchProcessMessages(
  messages: Array<{ message: string; context: ChatContext }>
): Promise<string[]> {
  const processingPromises = messages.map((item) =>
    limit(() => generateChatResponse(item.message, item.context))
  );
  
  return Promise.all(processingPromises);
}
