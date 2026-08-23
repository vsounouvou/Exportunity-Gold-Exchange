import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MANAGED_KEYS = [
  "EXPORTUNITY_APP_URL",
  "EXPORTUNITY_GOOGLE_CLIENT_ID",
  "EXPORTUNITY_GOOGLE_CLIENT_SECRET",
  "EXPORTUNITY_META_APP_ID",
  "EXPORTUNITY_META_APP_SECRET",
  "EXPORTUNITY_META_LOGIN_CONFIGURATION_ID",
  "EXPORTUNITY_META_GRAPH_VERSION",
  "EXPORTUNITY_TWILIO_ACCOUNT_SID",
  "EXPORTUNITY_TWILIO_AUTH_TOKEN",
  "EXPORTUNITY_TWILIO_SMS_FROM",
  "EXPORTUNITY_TWILIO_WHATSAPP_FROM",
  "EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID",
  "EXPORTUNITY_TWILIO_VERIFY_SERVICE_SID",
  "EXPORTUNITY_TWILIO_TEST_SMS_TO",
  "EXPORTUNITY_TWILIO_TEST_WHATSAPP_TO",
  "EXPORTUNITY_TWILIO_SMS_VERIFIED_AT",
  "EXPORTUNITY_TWILIO_WHATSAPP_VERIFIED_AT",
  "EXPORTUNITY_OUTREACH_TEST_MODE",
  "EXPORTUNITY_OUTREACH_TEST_EMAILS",
  "EXPORTUNITY_OUTREACH_TEST_SMS_NUMBERS",
  "EXPORTUNITY_OUTREACH_TEST_WHATSAPP_NUMBERS",
  "EXPORTUNITY_OUTREACH_TEST_EMAIL_ENABLED",
  "EXPORTUNITY_OUTREACH_TEST_SMS_ENABLED",
  "EXPORTUNITY_OUTREACH_TEST_WHATSAPP_ENABLED",
  "EXPORTUNITY_OUTREACH_TEST_WHATSAPP_SESSION_ACTIVE",
  "EXPORTUNITY_OUTREACH_TEST_AGENT_KEY",
  "MAIL_DOMAIN_EXPORTUNITY",
  "EXPORTUNITY_INTEGRATION_SECRET",
];

const REQUIRED_OAUTH_KEYS = [
  "EXPORTUNITY_APP_URL",
  "EXPORTUNITY_GOOGLE_CLIENT_ID",
  "EXPORTUNITY_GOOGLE_CLIENT_SECRET",
  "EXPORTUNITY_META_APP_ID",
  "EXPORTUNITY_META_APP_SECRET",
  "EXPORTUNITY_META_LOGIN_CONFIGURATION_ID",
  "EXPORTUNITY_INTEGRATION_SECRET",
];

const EXPECTED_PUBLIC_IDS = {
  EXPORTUNITY_APP_URL: "https://exportunity.net",
  EXPORTUNITY_GOOGLE_CLIENT_ID:
    "319014179870-g24l883rkhlub2q8jf3en526ci89bhst.apps.googleusercontent.com",
  EXPORTUNITY_META_APP_ID: "1395362115866384",
  EXPORTUNITY_META_LOGIN_CONFIGURATION_ID: "1923572488310307",
};

function fail(message) {
  console.error(`[exportunity-env] ${message}`);
  process.exit(1);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : "";
}

function parseEnvFile(filePath) {
  const values = new Map();
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function runSsh({ identity, target, command, args = [], input }) {
  const result = spawnSync(
    "ssh.exe",
    [
      "-i",
      identity,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      target,
      command,
      ...args,
    ],
    {
      input,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  return {
    status: result.status,
    stderr: String(result.stderr || "").trim(),
  };
}

const sourcePath = path.resolve(option("--source") || ".env.local");
if (!fs.existsSync(sourcePath)) fail(`${sourcePath} was not found`);

const values = parseEnvFile(sourcePath);
const presence = Object.fromEntries(
  MANAGED_KEYS.map((key) => [key, String(values.get(key) || "").trim() ? "present" : "missing"]),
);
const publicIdMatches = Object.fromEntries(
  Object.entries(EXPECTED_PUBLIC_IDS).map(([key, expected]) => [
    key,
    String(values.get(key) || "").trim() === expected,
  ]),
);

console.log(
  JSON.stringify(
    {
      source: path.basename(sourcePath),
      valuesPrinted: false,
      presence,
      publicIdMatches,
    },
    null,
    2,
  ),
);

const missingRequired = REQUIRED_OAUTH_KEYS.filter(
  (key) => !String(values.get(key) || "").trim(),
);
if (missingRequired.length) {
  fail(`required OAuth keys are missing: ${missingRequired.join(", ")}`);
}
const mismatchedPublicIds = Object.entries(publicIdMatches)
  .filter(([, matches]) => !matches)
  .map(([key]) => key);
if (mismatchedPublicIds.length) {
  fail(`public Exportunity identifiers do not match: ${mismatchedPublicIds.join(", ")}`);
}

if (!process.argv.includes("--sync-production")) process.exit(0);
if (!process.argv.includes("--confirm-exportunity-production")) {
  fail("--confirm-exportunity-production is required for a remote write");
}

const identity = path.resolve(option("--identity"));
const target = option("--target");
const remoteEnv = option("--remote-env");
if (!identity || !fs.existsSync(identity)) fail("a valid --identity file is required");
if (!/^[a-z0-9._-]+@[a-z0-9.:-]+$/i.test(target)) fail("a valid --target is required");
if (!/^\/[a-z0-9_./-]+$/i.test(remoteEnv)) fail("a safe absolute --remote-env path is required");

const ssh = (command, args = [], input) =>
  runSsh({ identity, target, command, args, input });
const fileCheck = ssh("test", ["-f", remoteEnv]);
if (fileCheck.status !== 0) fail(`remote environment file is unavailable: ${fileCheck.stderr}`);

const missingRemote = [];
for (const key of MANAGED_KEYS) {
  const value = String(values.get(key) || "").trim();
  if (!value) continue;
  const result = ssh("grep", ["-q", `${key}=`, remoteEnv]);
  if (result.status === 1) missingRemote.push(key);
  else if (result.status !== 0) fail(`remote key audit failed for ${key}: ${result.stderr}`);
}

if (!missingRemote.length) {
  console.log(JSON.stringify({ synced: false, reason: "all_present", valuesPrinted: false }, null, 2));
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const backupPath = `${remoteEnv}.backup-${timestamp}`;
const backup = ssh("cp", ["-p", remoteEnv, backupPath]);
if (backup.status !== 0) fail(`remote environment backup failed: ${backup.stderr}`);

const payload = [
  "",
  "# Exportunity-owned provider namespace",
  ...missingRemote.map((key) => `${key}=${values.get(key)}`),
  "",
].join("\n");
const append = ssh(
  "dd",
  [`of=${remoteEnv}`, "oflag=append", "conv=notrunc", "status=none"],
  payload,
);
if (append.status !== 0) fail(`remote environment update failed: ${append.stderr}`);

for (const key of missingRemote) {
  const verified = ssh("grep", ["-q", `${key}=`, remoteEnv]);
  if (verified.status !== 0) fail(`remote verification failed for ${key}`);
}

console.log(
  JSON.stringify(
    {
      synced: true,
      syncedKeys: missingRemote,
      backupPath,
      valuesPrinted: false,
    },
    null,
    2,
  ),
);
