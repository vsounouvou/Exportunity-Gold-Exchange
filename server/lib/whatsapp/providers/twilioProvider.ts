import type { WhatsAppConnectStatus, WhatsAppProvider, WhatsAppTemplateInfo } from "../provider";
import { getTwilioConfig } from "../../communications/twilio";
import { sendWaTemplate, sendWaText } from "../waGateway";

function isTruthy(value: string | undefined) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function getDryRunAllowed() {
  if (isTruthy(process.env.WHATSAPP_ALLOW_DRY_RUN)) return true;
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return nodeEnv !== "production";
}

export class TwilioProvider implements WhatsAppProvider {
  public readonly provider = "twilio" as const;

  async sendText(toE164: string, text: string) {
    return sendWaText(toE164, text);
  }

  async sendTemplate(toE164: string, templateName: string, languageCode?: string) {
    return sendWaTemplate(toE164, templateName, languageCode);
  }

  async listTemplates(): Promise<WhatsAppTemplateInfo[]> {
    return [
      { name: "ORDER_STATUS_UPDATE", status: "twilio_text_fallback", category: "utility" },
      { name: "DOCS_REQUEST", status: "twilio_text_fallback", category: "utility" },
    ];
  }

  getStatus(): WhatsAppConnectStatus {
    const cfg = getTwilioConfig();
    const connected = !!cfg.accountSid && !!cfg.authTokenPresent && !!cfg.whatsappFrom;
    const dryRunAllowed = getDryRunAllowed();
    const dryRun = !connected && dryRunAllowed;

    return {
      provider: "twilio",
      connected,
      dryRun,
      dryRunAllowed,
      accountSidPresent: !!cfg.accountSid,
      authTokenPresent: !!cfg.authTokenPresent,
      verifyServiceSidPresent: !!cfg.verifyServiceSidPresent,
      whatsappFromPresent: !!cfg.whatsappFrom,
      sandboxMode: Boolean(cfg.sandboxMode),
    };
  }
}
