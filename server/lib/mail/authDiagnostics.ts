import dns from "node:dns/promises";

type PtrDiagnostics = {
  ip: string | null;
  expectedHost: string | null;
  reverseHosts: string[];
  ok: boolean | null;
  warning: string | null;
};

type HeloDiagnostics = {
  configured: string | null;
  expected: string | null;
  ok: boolean | null;
};

export type MailAuthDiagnostics = {
  domain: string;
  checkedAtIso: string;
  spf: {
    ok: boolean;
    records: string[];
  };
  dkim: {
    ok: boolean;
    selector: string | null;
    records: string[];
  };
  dmarc: {
    ok: boolean;
    policy: string | null;
    records: string[];
  };
  ptr: PtrDiagnostics;
  helo: HeloDiagnostics;
  trustedForOutbound: boolean;
  warnings: string[];
};

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { atMs: number; value: MailAuthDiagnostics }>();

function normalizeDomain(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/g, "");
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
}

async function safeResolveTxt(name: string) {
  try {
    const rows = await dns.resolveTxt(name);
    return rows.map((parts) => parts.join("")).map((row) => row.trim()).filter(Boolean);
  } catch {
    return [] as string[];
  }
}

async function resolveCandidateSourceIp(hostname: string | null) {
  if (!hostname) return null;
  try {
    const ips = await dns.resolve4(hostname);
    return ips[0] || null;
  } catch {
    return null;
  }
}

async function resolvePtr(input: { sourceIp: string | null; expectedHost: string | null }): Promise<PtrDiagnostics> {
  if (!input.sourceIp) {
    return {
      ip: null,
      expectedHost: input.expectedHost ?? null,
      reverseHosts: [],
      ok: null,
      warning: "source_ip_missing",
    };
  }
  try {
    const reverseHosts = uniq(await dns.reverse(input.sourceIp));
    const expectedHost = normalizeDomain(input.expectedHost);
    const ok = expectedHost ? reverseHosts.some((value) => normalizeDomain(value) === expectedHost) : null;
    return {
      ip: input.sourceIp,
      expectedHost: expectedHost || null,
      reverseHosts,
      ok,
      warning: ok === false ? "ptr_mismatch" : null,
    };
  } catch {
    return {
      ip: input.sourceIp,
      expectedHost: normalizeDomain(input.expectedHost) || null,
      reverseHosts: [],
      ok: false,
      warning: "ptr_lookup_failed",
    };
  }
}

function detectDmarcPolicy(records: string[]) {
  for (const record of records) {
    const policy = String(record)
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.toLowerCase().startsWith("p="));
    if (policy) return policy.slice(2).trim().toLowerCase();
  }
  return null;
}

export async function getMailAuthDiagnostics(input: {
  domain: string;
  dkimSelectors?: string[];
  smtpHost?: string | null;
  smtpHeloName?: string | null;
  sourceIp?: string | null;
}) : Promise<MailAuthDiagnostics> {
  const domain = normalizeDomain(input.domain);
  const cacheKey = `${domain}|${normalizeDomain(input.smtpHost)}|${normalizeDomain(input.smtpHeloName)}|${String(
    input.sourceIp || "",
  ).trim()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.atMs <= CACHE_TTL_MS) return cached.value;

  const selectors = uniq((input.dkimSelectors || ["s1", "mail", "default"]).map((value) => normalizeDomain(value)));
  const warnings: string[] = [];

  const spfRecords = await safeResolveTxt(domain);
  const dmarcRecords = await safeResolveTxt(`_dmarc.${domain}`);
  const dkimLookups = await Promise.all(selectors.map(async (selector) => ({
    selector,
    records: await safeResolveTxt(`${selector}._domainkey.${domain}`),
  })));

  const spfOk = spfRecords.some((record) => record.toLowerCase().startsWith("v=spf1"));
  const dmarcOk = dmarcRecords.some((record) => record.toLowerCase().startsWith("v=dmarc1"));
  const dmarcPolicy = detectDmarcPolicy(dmarcRecords);
  const selectedDkim = dkimLookups.find((entry) =>
    entry.records.some((record) => String(record).toLowerCase().includes("v=dkim1")),
  );
  const dkimOk = Boolean(selectedDkim);

  if (!spfOk) warnings.push("spf_missing");
  if (!dkimOk) warnings.push("dkim_missing");
  if (!dmarcOk) warnings.push("dmarc_missing");

  const smtpHost = normalizeDomain(input.smtpHost);
  const heloConfigured = normalizeDomain(input.smtpHeloName);
  const expectedHost = smtpHost || heloConfigured || null;
  const sourceIp =
    String(input.sourceIp || "").trim() ||
    String(process.env.MAIL_SMTP_PUBLIC_IP || process.env.MAIL_SMTP_SOURCE_IP || "").trim() ||
    (await resolveCandidateSourceIp(expectedHost));
  const ptr = await resolvePtr({
    sourceIp: sourceIp || null,
    expectedHost,
  });
  if (ptr.warning) warnings.push(ptr.warning);

  const helo: HeloDiagnostics = {
    configured: heloConfigured || null,
    expected: expectedHost,
    ok: heloConfigured && expectedHost ? heloConfigured === expectedHost : null,
  };
  if (helo.ok === false) warnings.push("helo_mismatch");

  const value = {
    domain,
    checkedAtIso: new Date().toISOString(),
    spf: {
      ok: spfOk,
      records: spfRecords,
    },
    dkim: {
      ok: dkimOk,
      selector: selectedDkim?.selector || null,
      records: selectedDkim?.records || [],
    },
    dmarc: {
      ok: dmarcOk,
      policy: dmarcPolicy,
      records: dmarcRecords,
    },
    ptr,
    helo,
    trustedForOutbound: spfOk && dkimOk,
    warnings,
  };
  cache.set(cacheKey, { atMs: Date.now(), value });
  return value;
}
