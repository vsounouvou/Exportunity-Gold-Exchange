import assert from "node:assert/strict";
import crypto from "node:crypto";

// Keep this script runnable in the production Docker image (which does not include `/server` sources).
function computeTwilioSignature(params: { url: string; body: Record<string, any>; authToken: string }) {
  const keys = Object.keys(params.body || {}).sort();
  let data = params.url;
  for (const k of keys) data += `${k}${params.body[k] ?? ""}`;
  return crypto.createHmac("sha1", params.authToken).update(data, "utf8").digest("base64");
}

function requireEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isLocalhost(url: string) {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

async function postForm(opts: { url: string; authToken: string; data: Record<string, string> }) {
  const signature = computeTwilioSignature({ url: opts.url, body: opts.data, authToken: opts.authToken });
  const body = new URLSearchParams(opts.data);
  const res = await fetch(opts.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": signature,
    },
    body,
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  const baseUrl = String(process.env.BASE_URL || "http://localhost:5000").trim();
  if (!isLocalhost(baseUrl) && String(process.env.TWILIO_SMOKE_ALLOW_NONLOCAL || "").trim() !== "1") {
    throw new Error(`Refusing to run against non-local BASE_URL (${baseUrl}). Set TWILIO_SMOKE_ALLOW_NONLOCAL=1 to override.`);
  }

  const authToken = requireEnv("TWILIO_AUTH_TOKEN");

  const inboundUrl = new URL("/api/webhooks/twilio/whatsapp/inbound", baseUrl).toString();
  const statusUrl = new URL("/api/webhooks/twilio/message/status", baseUrl).toString();
  const voiceInboundUrl = new URL("/api/webhooks/twilio/voice/inbound", baseUrl).toString();

  const from = String(process.env.TWILIO_TEST_FROM || "whatsapp:+2250100000229").trim();
  const to = String(process.env.TWILIO_TEST_TO || "whatsapp:+14155238886").trim();
  const messageSid = `SMOKE_${Date.now()}`;

  const inbound = await postForm({
    url: inboundUrl,
    authToken,
    data: {
      From: from,
      To: to,
      Body: "Ping (smoke test)",
      MessageSid: messageSid,
    },
  });

  assert.equal(inbound.status, 200, `Inbound webhook failed: ${inbound.status} ${inbound.text}`);

  const status = await postForm({
    url: statusUrl,
    authToken,
    data: {
      MessageSid: messageSid,
      MessageStatus: "sent",
      From: to,
      To: from,
    },
  });

  assert.equal(status.status, 200, `Status webhook failed: ${status.status} ${status.text}`);

  const voiceFrom = String(process.env.TWILIO_TEST_VOICE_FROM || "+2250100000229").trim();
  const voiceTo = String(process.env.TWILIO_TEST_VOICE_TO || "+14155238886").trim();
  const callSid = `CALL_SMOKE_${Date.now()}`;
  const voiceInbound = await postForm({
    url: voiceInboundUrl,
    authToken,
    data: {
      CallSid: callSid,
      CallStatus: "ringing",
      From: voiceFrom,
      To: voiceTo,
    },
  });
  assert.equal(voiceInbound.status, 200, `Voice inbound webhook failed: ${voiceInbound.status} ${voiceInbound.text}`);

  console.log("[twilio-smoke] OK");
}

main().catch((err) => {
  console.error("[twilio-smoke] FAIL:", err?.message || err);
  process.exit(1);
});
