#!/usr/bin/env node
import { Resolver } from "node:dns/promises";

const DOMAIN = "agoojiye.com";
const EXPECTED_IP = "51.254.143.30";
const EXPECTED_MX = { exchange: "mail.agoojiye.com", priority: 10 };
const EXPECTED_SPF = `v=spf1 mx ip4:${EXPECTED_IP} -all`;
const EXPECTED_DMARC = "v=DMARC1; p=none; rua=mailto:dmarc@agoojiye.com; adkim=s; aspf=s";
const EXPECTED_DKIM =
  "v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2sc5bNVbO7Z6xXGrtXXA2FP65BU7GgVc7oliHOI5N/HTP1RE2HOSCS71FRVB6ceTRMD/KnbPP4Y0pSdR9GUCMkCPH0COJf6HegEj9QAny+kczV/Xgy1XYi2AZiVZ6R7qZflKTIHvPwL1/KeQ8FoZp3ykfXkGkav0kyx4zovc5mau5NjLKG9RpsFzVa9FTKrXbb1uBEQwHFKv4HMVwaWjCn+GJrxuIL1O4UfqaMkcHdso1lLPjy/i8Rg6mN4D1dmRT3p1UB3GUTiFuZGJVMz7CN1GXymDRbd4hqcoIjzqAbx5/rMZU7nO3U1Ev2rR8C68V1OmpIs3LtYlBXUTJohfgwIDAQAB";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const serverArg = process.argv.find((arg) => arg.startsWith("--server="));
const server = serverArg ? serverArg.slice("--server=".length).trim() : "1.1.1.1";

const resolver = new Resolver();
resolver.setServers([server]);
let usedDohFallback = false;

function normalizeHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

function flattenTxt(records) {
  return (records || []).map((chunks) => chunks.join(""));
}

function decodeDohTxt(value) {
  const raw = String(value || "").trim();
  const chunks = raw.match(/"(?:[^"\\]|\\.)*"/g);
  if (!chunks?.length) return raw;
  return chunks.map((chunk) => JSON.parse(chunk)).join("");
}

async function resolveDoh(name, type) {
  const url = new URL("https://dns.google/resolve");
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  const response = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!response.ok) throw new Error(`DOH_HTTP_${response.status}`);

  const payload = await response.json();
  if (payload.Status !== 0) {
    const error = new Error(payload.Status === 3 ? "ENOTFOUND" : `DOH_STATUS_${payload.Status}`);
    error.code = payload.Status === 3 ? "ENOTFOUND" : `DOH_STATUS_${payload.Status}`;
    throw error;
  }

  const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
  if (type === "MX") {
    return answers.map((answer) => {
      const [priority, ...exchange] = String(answer.data || "").trim().split(/\s+/);
      return { priority: Number(priority), exchange: exchange.join(" ") };
    });
  }
  if (type === "A") return answers.map((answer) => String(answer.data || "").trim()).filter(Boolean);
  if (type === "TXT") return answers.map((answer) => [decodeDohTxt(answer.data)]);
  return answers;
}

async function query(label, name, type, fn) {
  try {
    return { label, ok: true, value: await fn(), error: null };
  } catch (error) {
    const code = error?.code || error?.message || String(error);
    if (["ETIMEOUT", "EAI_AGAIN", "ECONNREFUSED", "SERVFAIL"].includes(code)) {
      try {
        usedDohFallback = true;
        return { label, ok: true, value: await resolveDoh(name, type), error: null };
      } catch (fallbackError) {
        return {
          label,
          ok: false,
          value: null,
          error: fallbackError?.code || fallbackError?.message || String(fallbackError),
        };
      }
    }
    return { label, ok: false, value: null, error: code };
  }
}

const [mxResult, mailAResult, rootTxtResult, dmarcResult, dkimResult] = await Promise.all([
  query("mx", DOMAIN, "MX", () => resolver.resolveMx(DOMAIN)),
  query("mailA", `mail.${DOMAIN}`, "A", () => resolver.resolve4(`mail.${DOMAIN}`)),
  query("rootTxt", DOMAIN, "TXT", () => resolver.resolveTxt(DOMAIN)),
  query("dmarc", `_dmarc.${DOMAIN}`, "TXT", () => resolver.resolveTxt(`_dmarc.${DOMAIN}`)),
  query("dkim", `mail._domainkey.${DOMAIN}`, "TXT", () => resolver.resolveTxt(`mail._domainkey.${DOMAIN}`)),
]);

const resolverLabel = usedDohFallback ? `${server} + dns.google DoH fallback` : server;

const mx = mxResult.ok
  ? mxResult.value.map((record) => ({
      exchange: normalizeHost(record.exchange),
      priority: Number(record.priority),
    }))
  : [];
const rootTxt = rootTxtResult.ok ? flattenTxt(rootTxtResult.value) : [];
const dmarcTxt = dmarcResult.ok ? flattenTxt(dmarcResult.value) : [];
const dkimTxt = dkimResult.ok ? flattenTxt(dkimResult.value) : [];

const checks = [
  {
    name: "MX",
    ok: mx.length === 1 && mx[0].exchange === EXPECTED_MX.exchange && mx[0].priority === EXPECTED_MX.priority,
    expected: `${EXPECTED_MX.priority} ${EXPECTED_MX.exchange}.`,
    actual: mxResult.ok ? mx.map((record) => `${record.priority} ${record.exchange}.`) : mxResult.error,
  },
  {
    name: "mail A",
    ok: mailAResult.ok && mailAResult.value.includes(EXPECTED_IP),
    expected: EXPECTED_IP,
    actual: mailAResult.ok ? mailAResult.value : mailAResult.error,
  },
  {
    name: "SPF",
    ok: rootTxt.includes(EXPECTED_SPF),
    expected: EXPECTED_SPF,
    actual: rootTxt.filter((value) => value.toLowerCase().startsWith("v=spf1")),
  },
  {
    name: "DMARC",
    ok: dmarcTxt.includes(EXPECTED_DMARC),
    expected: EXPECTED_DMARC,
    actual: dmarcResult.ok ? dmarcTxt : dmarcResult.error,
  },
  {
    name: "DKIM",
    ok: dkimTxt.includes(EXPECTED_DKIM),
    expected: "mail._domainkey TXT value from docs/AGOOJIYE_EMAIL_DNS_AND_MAILBOXES.md",
    actual: dkimResult.ok ? dkimTxt.map((value) => `${value.slice(0, 72)}${value.length > 72 ? "..." : ""}`) : dkimResult.error,
  },
];

const ok = checks.every((check) => check.ok);

if (json) {
  console.log(JSON.stringify({ ok, domain: DOMAIN, resolver: resolverLabel, checks }, null, 2));
} else {
  console.log(`AGOOJIYE mail DNS verification for ${DOMAIN} via ${resolverLabel}`);
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
    if (!check.ok) {
      console.log(`  expected: ${Array.isArray(check.expected) ? check.expected.join(", ") : check.expected}`);
      console.log(`  actual: ${Array.isArray(check.actual) ? check.actual.join(", ") : check.actual}`);
    }
  }
  console.log(ok ? "All AGOOJIYE mail DNS records are correct." : "AGOOJIYE mail DNS is not ready yet.");
}

process.exit(ok ? 0 : 1);
