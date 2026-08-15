const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;

function uniqueEmails(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

export function extractEmailAddresses(value: unknown) {
  const matches = String(value || "").match(EMAIL_PATTERN) || [];
  return uniqueEmails(matches);
}

export function buildWorkspaceEmailMetadata(input: {
  accountEmail?: unknown;
  from?: unknown;
  to?: unknown;
  cc?: unknown;
}) {
  const accountEmail = extractEmailAddresses(input.accountEmail)[0] || "";
  const fromEmails = extractEmailAddresses(input.from);
  const toEmails = extractEmailAddresses(input.to);
  const ccEmails = extractEmailAddresses(input.cc);
  const recipients = uniqueEmails([...toEmails, ...ccEmails]);
  const direction = accountEmail && fromEmails.includes(accountEmail)
    ? "outbound"
    : accountEmail && recipients.includes(accountEmail)
      ? "inbound"
      : "external";
  const correspondentEmails = uniqueEmails([...fromEmails, ...recipients]).filter(
    (email) => email !== accountEmail,
  );

  return {
    accountEmail: accountEmail || null,
    fromEmails,
    toEmails,
    ccEmails,
    correspondentEmails,
    direction,
  } as const;
}
