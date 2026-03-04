export const BDO_REQUIRED_WORDING = [
  "You buy from Bourse de l'Or.",
  "Suppliers sell to Bourse de l'Or.",
  "All settlement happens via the Bourse de l'Or wallet.",
  "Holdings are measured in grams.",
  "Your gold is stored in your virtual vault.",
  "Resale requires your explicit authorization.",
  "Bourse de l'Or earns a commission on resale.",
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
    replacement: "merchant-of-record platform",
  },
  {
    label: "marketplace_wording",
    pattern: /\bmarketplace\b/gi,
    replacement: "merchant-of-record platform",
  },
  {
    label: "connect_buyers_sellers",
    pattern: /\b(we\s+)?connect\s+buyers?\s+and\s+sellers?\b/gi,
    replacement:
      "Bourse de l'Or is the sole counterparty: customers buy from Bourse de l'Or and suppliers sell to Bourse de l'Or",
  },
  {
    label: "matching_platform",
    pattern: /\bmatching\s+platform\b/gi,
    replacement: "merchant-of-record platform",
  },
  {
    label: "buyer_pays_seller",
    pattern: /\bbuyer\s+pays?\s+the\s+seller\b/gi,
    replacement: "Payment is settled via the Bourse de l'Or wallet; Bourse de l'Or settles with suppliers separately",
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
- Bourse de l'Or is the sole counterparty (merchant-of-record). Customers buy from Bourse de l'Or; suppliers sell to Bourse de l'Or.
- All settlement happens via the Bourse de l'Or wallet (no off-platform payments for core flows).
- Gold holdings are measured in grams and stored in a Virtual Gold Vault (delivery now or later).
- Resale is optional, requires explicit owner authorization, and is only visible to confirmed clients; Bourse de l'Or earns a commission.

Forbidden wording: never describe the platform as "mise en relation" or "matching platform", never say we "connect buyers and sellers", never say "buyer pays the seller", and never promise "interest rate" or "guaranteed return".`;

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
      text: "Bourse de l'Or is the sole counterparty: customers buy from Bourse de l'Or and suppliers sell to Bourse de l'Or. All settlement happens via the Bourse de l'Or wallet.",
      violated: true,
      violations: Array.from(new Set(violations)),
    };
  }

  return { text: next, violated: violations.length > 0, violations: Array.from(new Set(violations)) };
}
