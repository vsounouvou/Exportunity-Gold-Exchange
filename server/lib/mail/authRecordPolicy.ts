export type MailDkimLookup = {
  selector: string;
  records: string[];
};

export type MailAuthRecordAnalysis = {
  spfOk: boolean;
  dmarcOk: boolean;
  dkimOk: boolean;
  dmarcPolicy: string | null;
  dkimSelector: string | null;
  dkimRecords: string[];
  warnings: string[];
};

function matchingTxtRecords(records: string[], prefix: string) {
  const expected = prefix.toLowerCase();
  return records.filter((record) =>
    String(record || "").trim().toLowerCase().startsWith(expected),
  );
}

function detectDmarcPolicy(record: string) {
  const policy = String(record || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("p="));
  return policy ? policy.slice(2).trim().toLowerCase() || null : null;
}

/**
 * DNS authentication records are singletons at each relevant owner name.
 * Multiple SPF or DMARC policy records are invalid even when one of them looks
 * syntactically correct. A DKIM selector is usable only when exactly one key is
 * published for that selector; other valid selectors may coexist for rotation.
 */
export function analyzeMailAuthRecords(input: {
  spfRecords: string[];
  dmarcRecords: string[];
  dkimLookups: MailDkimLookup[];
}): MailAuthRecordAnalysis {
  const spfPolicies = matchingTxtRecords(input.spfRecords, "v=spf1");
  const dmarcPolicies = matchingTxtRecords(input.dmarcRecords, "v=dmarc1");
  const dkimCandidates = input.dkimLookups.map((lookup) => ({
    selector: String(lookup.selector || "").trim().toLowerCase(),
    records: matchingTxtRecords(lookup.records, "v=dkim1"),
  }));
  const selectedDkim = dkimCandidates.find(
    (candidate) => candidate.selector && candidate.records.length === 1,
  );

  const warnings: string[] = [];
  if (spfPolicies.length === 0) warnings.push("spf_missing");
  if (spfPolicies.length > 1) warnings.push("spf_multiple");
  if (!selectedDkim) {
    warnings.push(
      dkimCandidates.some((candidate) => candidate.records.length > 1)
        ? "dkim_multiple"
        : "dkim_missing",
    );
  }
  if (dmarcPolicies.length === 0) warnings.push("dmarc_missing");
  if (dmarcPolicies.length > 1) warnings.push("dmarc_multiple");

  return {
    spfOk: spfPolicies.length === 1,
    dmarcOk: dmarcPolicies.length === 1,
    dkimOk: Boolean(selectedDkim),
    dmarcPolicy:
      dmarcPolicies.length === 1
        ? detectDmarcPolicy(dmarcPolicies[0])
        : null,
    dkimSelector: selectedDkim?.selector || null,
    dkimRecords: selectedDkim?.records || [],
    warnings,
  };
}
