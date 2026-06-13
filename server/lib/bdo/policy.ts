export const BDO_REQUIRED_WORDING = [
  "Buy certified physical gold.",
  "Build your purchase budget. Your gold is not purchased until you confirm an order.",
  "Market-linked price + platform spread.",
  "Certificate verification is available for eligible pieces.",
  "Secure delivery can be arranged through an approved logistics partner.",
  "A resale request is conditional and requires review.",
  "BOURSE DE L'OR is not a bank, wallet, money-transfer service, crypto platform, securities issuer, derivatives venue, or financial exchange.",
] as const;

type ForbiddenRule = {
  label: string;
  pattern: RegExp;
  replacement?: string;
};

const FORBIDDEN_RULES: ForbiddenRule[] = [
  {
    label: "mise_en_relation",
    pattern: /\bmise\s+en\s+relation\b/gi,
    replacement: "certified physical gold brokerage platform",
  },
  {
    label: "marketplace_wording",
    pattern: /\bmarketplace\b/gi,
    replacement: "certified physical gold brokerage platform",
  },
  {
    label: "connect_buyers_sellers",
    pattern: /\b(we\s+)?connect\s+buyers?\s+and\s+sellers?\b/gi,
    replacement:
      "BOURSE DE L'OR brokers certified physical gold with documented review, supplier checks, and client order confirmation",
  },
  {
    label: "matching_platform",
    pattern: /\bmatching\s+platform\b/gi,
    replacement: "certified physical gold brokerage platform",
  },
  {
    label: "buyer_pays_seller",
    pattern: /\bbuyer\s+pays?\s+the\s+seller\b/gi,
    replacement: "Client payment, supplier allocation, logistics, and compliance review are documented before order execution",
  },
  {
    label: "gold_wallet",
    pattern: /\bgold\s+wallet\b/gi,
    replacement: "purchase objective",
  },
  {
    label: "virtual_vault",
    pattern: /\bvirtual\s+(gold\s+)?vault\b/gi,
    replacement: "client-selected custody or secure delivery",
  },
  {
    label: "instant_liquidity",
    pattern: /\binstant\s+liquidity\b/gi,
  },
  {
    label: "guaranteed_buyback",
    pattern: /\bguaranteed\s+buyback\b/gi,
  },
  {
    label: "remittance",
    pattern: /\bremittance\b/gi,
  },
  {
    label: "gold_account",
    pattern: /\bgold\s+account\b/gi,
    replacement: "certificate record",
  },
  {
    label: "interest_rate",
    pattern: /\binterest\s+rate\b/gi,
  },
  {
    label: "guaranteed_return",
    pattern: /\bguaranteed\s+return\b/gi,
  },
  {
    label: "savings_product",
    pattern: /\bsavings\s+product\b/gi,
  },
  {
    label: "deposit_account",
    pattern: /\bdeposit\s+account\b/gi,
  },
  {
    label: "lend_your_gold",
    pattern: /\b(lend|lending)\s+(your\s+)?gold\b/gi,
  },
  {
    label: "off_platform_payment",
    pattern: /\b(off-?platform|outside\s+the\s+platform)\s+payment(s)?\b/gi,
  },
];

export const BDO_POLICY_SNIPPET = `Bourse de l'Or policy (non-negotiable):
- Describe the offer as certified physical gold, verified jewelry, certificate verification, secure delivery, and conditional resale requests.
- The Purchase Objective flow builds a purchase budget; gold is not purchased until the client confirms an order after a refreshed quote.
- Pricing must split market-linked product price, platform spread, payment fee, delivery/insurance, customs/taxes, custody/storage if selected, and total payable.
- Bourse de l'Or is not a bank, wallet, stored-value account, money-transfer service, FX service, crypto platform, securities issuer, derivatives venue, or financial exchange.
- Resale and buyback requests are conditional, reviewed, and never guaranteed.

Forbidden wording: never use "gold wallet", "cash out anywhere", "convert gold to yuan/dollars/CFA", "remittance", "guaranteed return", "guaranteed buyback", "peer-to-peer gold exchange", "instant liquidity", "deposit money", "gold account", or "investment yield".`;

export function sanitizeBdoText(text: string): { text: string; violated: boolean; violations: string[] } {
  const raw = String(text ?? "");
  if (!raw.trim()) return { text: raw, violated: false, violations: [] };

  let next = raw;
  const violations: string[] = [];

  for (const rule of FORBIDDEN_RULES) {
    if (!rule.pattern.test(next)) continue;
    violations.push(rule.label);
    if (typeof rule.replacement === "string") {
      next = next.replace(rule.pattern, rule.replacement);
    } else {
      next = next.replace(rule.pattern, "");
    }
  }

  // Normalize whitespace after replacements/removals.
  next = next.replace(/\s{3,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  // Hard-stop: if forbidden terms still present (edge cases), replace with safe fallback.
  const stillBad = FORBIDDEN_RULES.some((rule) => rule.pattern.test(next));
  if (stillBad) {
    return {
      text: "BOURSE DE L'OR helps clients buy certified physical gold, verify certificates, arrange secure delivery, and request reviewed resale offers. It is not a bank, wallet, crypto platform, securities issuer, derivatives venue, or financial exchange.",
      violated: true,
      violations: Array.from(new Set(violations)),
    };
  }

  return { text: next, violated: violations.length > 0, violations: Array.from(new Set(violations)) };
}
