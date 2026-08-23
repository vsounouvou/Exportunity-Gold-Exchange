import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.cwd(), ".env.local");

if (!fs.existsSync(target)) {
  console.error(".env.local was not found; no credentials were changed.");
  process.exitCode = 1;
} else {
  const original = fs.readFileSync(target, "utf8");
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/);
  const values = new Map();

  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    values.set(match[1], match[2]);
  }

  const additions = [];
  const copyIfMissing = (targetKey, sourceKey) => {
    if (String(values.get(targetKey) || "").trim()) return;
    const sourceValue = String(values.get(sourceKey) || "");
    if (!sourceValue.trim()) return;
    additions.push(`${targetKey}=${sourceValue}`);
    values.set(targetKey, sourceValue);
  };
  const setIfMissing = (targetKey, value) => {
    if (String(values.get(targetKey) || "").trim()) return;
    additions.push(`${targetKey}=${value}`);
    values.set(targetKey, value);
  };

  copyIfMissing("EXPORTUNITY_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID");
  copyIfMissing("EXPORTUNITY_GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET");
  copyIfMissing("EXPORTUNITY_META_APP_ID", "META_APP_ID");
  copyIfMissing("EXPORTUNITY_META_APP_SECRET", "META_APP_SECRET");
  copyIfMissing(
    "EXPORTUNITY_META_LOGIN_CONFIGURATION_ID",
    "META_LOGIN_CONFIGURATION_ID",
  );
  copyIfMissing("EXPORTUNITY_META_GRAPH_VERSION", "META_GRAPH_VERSION");
  copyIfMissing("EXPORTUNITY_TWILIO_ACCOUNT_SID", "TWILIO_ACCOUNT_SID");
  copyIfMissing("EXPORTUNITY_TWILIO_AUTH_TOKEN", "TWILIO_AUTH_TOKEN");
  copyIfMissing("EXPORTUNITY_TWILIO_SMS_FROM", "TWILIO_SMS_FROM");
  copyIfMissing("EXPORTUNITY_TWILIO_WHATSAPP_FROM", "TWILIO_WHATSAPP_FROM");
  copyIfMissing(
    "EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID",
    "TWILIO_MESSAGING_SERVICE_SID",
  );
  copyIfMissing(
    "EXPORTUNITY_TWILIO_VERIFY_SERVICE_SID",
    "TWILIO_VERIFY_SERVICE_SID",
  );
  setIfMissing("EXPORTUNITY_APP_URL", "https://exportunity.net");
  setIfMissing(
    "EXPORTUNITY_INTEGRATION_SECRET",
    crypto.randomBytes(48).toString("base64url"),
  );

  if (additions.length) {
    const base = original.endsWith("\n") || original.endsWith("\r\n")
      ? original
      : `${original}${newline}`;
    fs.writeFileSync(
      target,
      `${base}${newline}# Exportunity-owned provider namespace (migrated without removing legacy keys)${newline}${additions.join(newline)}${newline}`,
      { encoding: "utf8", mode: 0o600 },
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        addedKeys: additions.map((line) => line.slice(0, line.indexOf("="))),
        preservedLegacyKeys: true,
        secretValuesPrinted: false,
      },
      null,
      2,
    ),
  );
}
