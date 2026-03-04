import twilio from "twilio";
import { normalizeE164 } from "./twilio";

export type TwilioCallCreateParams = {
  toE164: string;
  fromE164: string;
  twimlUrl: string;
  statusCallbackUrl?: string | null;
  statusCallbackEvents?: string[] | null;
};

export type TwilioCallCreateResult = {
  ok: boolean;
  providerCallId: string | null;
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  raw: Record<string, unknown> | null;
};

function getTwilioClient() {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!accountSid) throw new Error("TWILIO_ACCOUNT_SID missing");
  if (!authToken) throw new Error("TWILIO_AUTH_TOKEN missing");
  return twilio(accountSid, authToken);
}

export async function createTwilioCall(params: TwilioCallCreateParams): Promise<TwilioCallCreateResult> {
  try {
    const toE164 = normalizeE164(params.toE164);
    if (!toE164) return { ok: false, providerCallId: null, status: null, errorCode: "invalid_to", errorMessage: "Invalid E.164 number", raw: null };

    const fromE164 = normalizeE164(params.fromE164);
    if (!fromE164) return { ok: false, providerCallId: null, status: null, errorCode: "invalid_from", errorMessage: "Invalid from number", raw: null };

    const url = String(params.twimlUrl || "").trim();
    if (!url) return { ok: false, providerCallId: null, status: null, errorCode: "invalid_url", errorMessage: "TwiML URL required", raw: null };

    const client = getTwilioClient();
    const statusCallback = params.statusCallbackUrl ? String(params.statusCallbackUrl).trim() : "";
    const statusCallbackEvents = Array.isArray(params.statusCallbackEvents) ? params.statusCallbackEvents : null;

    const call = await client.calls.create({
      to: toE164,
      from: fromE164,
      url,
      method: "POST",
      ...(statusCallback ? { statusCallback, statusCallbackMethod: "POST" as any } : {}),
      ...(statusCallback && statusCallbackEvents?.length ? { statusCallbackEvent: statusCallbackEvents as any } : {}),
    });

    return {
      ok: true,
      providerCallId: call?.sid ? String(call.sid) : null,
      status: call?.status ? String(call.status) : null,
      errorCode: (call as any)?.errorCode != null ? String((call as any).errorCode) : null,
      errorMessage: (call as any)?.errorMessage != null ? String((call as any).errorMessage) : null,
      raw: {
        sid: call?.sid,
        status: call?.status,
        to: call?.to,
        from: call?.from,
        direction: call?.direction,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      providerCallId: null,
      status: null,
      errorCode: "twilio_error",
      errorMessage: String(err?.message || "Twilio call failed"),
      raw: null,
    };
  }
}

