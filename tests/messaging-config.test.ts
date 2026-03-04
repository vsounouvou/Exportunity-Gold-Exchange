import assert from "node:assert/strict";
import test from "node:test";

import { getMessagingHealth } from "../server/lib/messaging/config";

const ENV_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_VERIFY_SERVICE_SID",
  "TWILIO_WHATSAPP_FROM",
] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => void) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>;
  for (const key of ENV_KEYS) {
    if (key in values) {
      process.env[key] = String(values[key as keyof typeof values] || "");
    } else {
      delete process.env[key];
    }
  }
  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (typeof value === "string") process.env[key] = value;
      else delete process.env[key];
    }
  }
}

test("messaging config marks placeholders as missing", () => {
  withEnv(
    {
      TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      TWILIO_AUTH_TOKEN: "[AuthToken]",
      TWILIO_SMS_FROM: "",
      TWILIO_MESSAGING_SERVICE_SID: "",
      TWILIO_VERIFY_SERVICE_SID: "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
    () => {
      const health = getMessagingHealth();
      assert.equal(health.configured, false);
      assert.equal(health.missing.includes("TWILIO_ACCOUNT_SID"), true);
      assert.equal(health.missing.includes("TWILIO_AUTH_TOKEN"), true);
      assert.equal(health.sms.enabled, false);
      assert.equal(health.whatsappOtp.enabled, false);
    },
  );
});

test("messaging config resolves sms via messaging service when present", () => {
  withEnv(
    {
      TWILIO_ACCOUNT_SID: "AC12345678901234567890123456789012",
      TWILIO_AUTH_TOKEN: "abcdefabcdefabcdefabcdefabcdefab",
      TWILIO_MESSAGING_SERVICE_SID: "MG12345678901234567890123456789012",
      TWILIO_VERIFY_SERVICE_SID: "VA12345678901234567890123456789012",
      TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
    },
    () => {
      const health = getMessagingHealth();
      assert.equal(health.configured, true);
      assert.equal(health.sms.enabled, true);
      assert.equal(health.sms.via, "messaging_service");
      assert.equal(health.whatsappOtp.enabled, true);
    },
  );
});

