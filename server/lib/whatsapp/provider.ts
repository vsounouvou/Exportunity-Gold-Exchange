import type { WaSendResult } from "./waGateway";
import { TwilioProvider } from "./providers/twilioProvider";

export type WhatsAppTemplateInfo = {
  name: string;
  language?: string | null;
  status?: string | null;
  category?: string | null;
};

export type WhatsAppConnectStatus = {
  provider: "twilio";
  connected: boolean;
  dryRun: boolean;
  dryRunAllowed: boolean;
  accountSidPresent: boolean;
  authTokenPresent: boolean;
  verifyServiceSidPresent: boolean;
  whatsappFromPresent: boolean;
  sandboxMode: boolean;
};

export interface WhatsAppProvider {
  readonly provider: "twilio";
  sendText(toE164: string, text: string): Promise<WaSendResult>;
  sendTemplate(toE164: string, templateName: string, languageCode?: string): Promise<WaSendResult>;
  listTemplates(): Promise<WhatsAppTemplateInfo[]>;
  getStatus(): WhatsAppConnectStatus;
}

export function getWhatsAppProvider(): WhatsAppProvider {
  return new TwilioProvider();
}
