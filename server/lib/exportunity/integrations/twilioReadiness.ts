type ExportunityTwilioReadiness = {
  configured: boolean;
  connected: boolean;
  ready: boolean;
  status: "setup_needed" | "configured_unverified" | "verified";
  requiredEnv: string[];
  missingEnv: string[];
  envNamespace: "EXPORTUNITY_";
  smsEnabled: boolean;
  smsVerified: boolean;
  whatsappSenderPresent: boolean;
  whatsappVerified: boolean;
  sandboxMode: boolean;
  testRecipients: {
    sms: { configured: boolean; masked: string | null };
    whatsapp: { configured: boolean; masked: string | null };
  };
  warnings: string[];
};

function value(key: string) {
  return String(process.env[`EXPORTUNITY_${key}`] || "").trim();
}

function placeholder(input: string) {
  return (
    !input ||
    /(?:changeme|replace|example|placeholder|your[_-]?|xxxx+|\.\.\.)/i.test(
      input,
    )
  );
}

function validAccountSid(input: string) {
  return /^AC[a-z0-9]{32}$/i.test(input) && !placeholder(input);
}

function validAuthToken(input: string) {
  return /^[a-z0-9]{24,64}$/i.test(input) && !placeholder(input);
}

function validMessagingServiceSid(input: string) {
  return /^MG[a-z0-9]{32}$/i.test(input) && !placeholder(input);
}

function validSmsSender(input: string) {
  return /^\+[1-9]\d{6,14}$/.test(input) && !placeholder(input);
}

function validWhatsappSender(input: string) {
  return /^whatsapp:\+[1-9]\d{6,14}$/i.test(input) && !placeholder(input);
}

function maskRecipient(input: string) {
  return validSmsSender(input) ? `••••${input.slice(-4)}` : null;
}

function validVerificationTimestamp(input: string) {
  if (!input) return false;
  const timestamp = new Date(input).valueOf();
  return Number.isFinite(timestamp) && timestamp > 0;
}

export function getExportunityTwilioReadiness(): ExportunityTwilioReadiness {
  const accountSid = value("TWILIO_ACCOUNT_SID");
  const authToken = value("TWILIO_AUTH_TOKEN");
  const smsFrom = value("TWILIO_SMS_FROM");
  const messagingServiceSid = value("TWILIO_MESSAGING_SERVICE_SID");
  const whatsappFrom = value("TWILIO_WHATSAPP_FROM");
  const smsTestTo = value("TWILIO_TEST_SMS_TO");
  const whatsappTestTo = value("TWILIO_TEST_WHATSAPP_TO");
  const smsVerifiedAt = value("TWILIO_SMS_VERIFIED_AT");
  const whatsappVerifiedAt = value("TWILIO_WHATSAPP_VERIFIED_AT");

  const accountConfigured = validAccountSid(accountSid);
  const tokenConfigured = validAuthToken(authToken);
  const smsFromValid = validSmsSender(smsFrom);
  const serviceValid = validMessagingServiceSid(messagingServiceSid);
  const whatsappFromValid = validWhatsappSender(whatsappFrom);
  const smsEnabled = smsFromValid || serviceValid;
  const smsVerified = smsEnabled && validVerificationTimestamp(smsVerifiedAt);
  const whatsappVerified =
    whatsappFromValid && validVerificationTimestamp(whatsappVerifiedAt);
  const configured = accountConfigured && tokenConfigured;
  const ready = configured && smsVerified && whatsappVerified;
  const warnings: string[] = [];

  if (smsFrom && !smsFromValid) {
    warnings.push("EXPORTUNITY_TWILIO_SMS_FROM is not a valid E.164 sender");
  }
  if (messagingServiceSid && !serviceValid) {
    warnings.push(
      "EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID is not a valid Messaging Service SID",
    );
  }
  if (whatsappFrom && !whatsappFromValid) {
    warnings.push(
      "EXPORTUNITY_TWILIO_WHATSAPP_FROM is not a valid WhatsApp sender",
    );
  }
  if (smsTestTo && !validSmsSender(smsTestTo)) {
    warnings.push("EXPORTUNITY_TWILIO_TEST_SMS_TO is not a valid E.164 recipient");
  }
  if (whatsappTestTo && !validSmsSender(whatsappTestTo)) {
    warnings.push("EXPORTUNITY_TWILIO_TEST_WHATSAPP_TO is not a valid E.164 recipient");
  }
  if (smsEnabled && !smsVerified) {
    warnings.push(
      "SMS configuration has not been recorded as operationally verified",
    );
  }
  if (whatsappFromValid && !whatsappVerified) {
    warnings.push(
      "WhatsApp configuration has not been recorded as operationally verified",
    );
  }

  const missingEnv = [
    ...(!accountConfigured ? ["EXPORTUNITY_TWILIO_ACCOUNT_SID"] : []),
    ...(!tokenConfigured ? ["EXPORTUNITY_TWILIO_AUTH_TOKEN"] : []),
    ...(!smsEnabled
      ? [
          "EXPORTUNITY_TWILIO_SMS_FROM or EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID",
        ]
      : []),
    ...(!whatsappFromValid ? ["EXPORTUNITY_TWILIO_WHATSAPP_FROM"] : []),
  ];

  return {
    configured,
    connected: configured,
    ready,
    status: ready
      ? "verified"
      : configured && smsEnabled && whatsappFromValid
        ? "configured_unverified"
        : "setup_needed",
    requiredEnv: [
      "EXPORTUNITY_TWILIO_ACCOUNT_SID",
      "EXPORTUNITY_TWILIO_AUTH_TOKEN",
      "EXPORTUNITY_TWILIO_SMS_FROM or EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID",
      "EXPORTUNITY_TWILIO_WHATSAPP_FROM",
      "EXPORTUNITY_TWILIO_SMS_VERIFIED_AT",
      "EXPORTUNITY_TWILIO_WHATSAPP_VERIFIED_AT",
    ],
    missingEnv,
    envNamespace: "EXPORTUNITY_",
    smsEnabled,
    smsVerified,
    whatsappSenderPresent: whatsappFromValid,
    whatsappVerified,
    sandboxMode:
      whatsappFrom.toLowerCase() === "whatsapp:+14155238886",
    testRecipients: {
      sms: {
        configured: validSmsSender(smsTestTo),
        masked: maskRecipient(smsTestTo),
      },
      whatsapp: {
        configured: validSmsSender(whatsappTestTo),
        masked: maskRecipient(whatsappTestTo),
      },
    },
    warnings,
  };
}
