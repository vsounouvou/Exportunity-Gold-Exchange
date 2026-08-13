export type IndustrialCommercialPricingInput = {
  supplierCosts: number[];
  additionalCosts?: Record<string, number>;
  customerPrice: number;
};

export type IndustrialCommercialPricing = {
  supplierCost: number;
  additionalCost: number;
  totalCost: number;
  customerPrice: number;
  internalMargin: number;
  marginPercent: number;
  costStack: Record<string, string>;
};

function finiteMoney(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a finite non-negative amount.`);
  }
  return number;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percent(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function calculateIndustrialCommercialPricing(
  input: IndustrialCommercialPricingInput,
): IndustrialCommercialPricing {
  if (!input.supplierCosts.length) {
    throw new Error("At least one reviewed supplier quotation is required.");
  }

  const supplierCost = money(
    input.supplierCosts.reduce(
      (total, value) => total + finiteMoney(value, "Supplier cost"),
      0,
    ),
  );
  const normalizedAdditional = Object.entries(input.additionalCosts || {}).reduce<
    Record<string, number>
  >((result, [rawLabel, rawAmount]) => {
    const label = String(rawLabel || "").trim();
    if (!label) return result;
    result[label] = money(finiteMoney(rawAmount, label));
    return result;
  }, {});
  const additionalCost = money(
    Object.values(normalizedAdditional).reduce(
      (total, value) => total + value,
      0,
    ),
  );
  const totalCost = money(supplierCost + additionalCost);
  const customerPrice = money(
    finiteMoney(input.customerPrice, "Customer price"),
  );
  if (customerPrice <= totalCost) {
    throw new Error(
      "Customer price must exceed the documented supplier and additional costs.",
    );
  }

  const internalMargin = money(customerPrice - totalCost);
  const marginPercent = percent((internalMargin / customerPrice) * 100);
  const costStack: Record<string, string> = {
    supplier_cost: supplierCost.toFixed(2),
    ...Object.fromEntries(
      Object.entries(normalizedAdditional).map(([label, value]) => [
        label,
        value.toFixed(2),
      ]),
    ),
    additional_cost: additionalCost.toFixed(2),
    total_cost: totalCost.toFixed(2),
  };

  return {
    supplierCost,
    additionalCost,
    totalCost,
    customerPrice,
    internalMargin,
    marginPercent,
    costStack,
  };
}

export type IndustrialRfqMessageInput = {
  language: "fr" | "en";
  supplierName: string;
  referenceCode: string;
  product: string;
  specification?: string | null;
  quantity?: string | null;
  unit?: string | null;
  destination?: string | null;
  incoterm?: string | null;
  requiredBy?: string | null;
};

export function buildIndustrialRfqMessage(input: IndustrialRfqMessageInput) {
  const quantity = [input.quantity, input.unit].filter(Boolean).join(" ");
  if (input.language === "en") {
    return [
      `Hello ${input.supplierName},`,
      "Exportunity is reviewing a documented industrial sourcing requirement.",
      `Reference: ${input.referenceCode}`,
      `Product: ${input.product}`,
      input.specification ? `Specification: ${input.specification}` : null,
      quantity ? `Quantity: ${quantity}` : null,
      input.destination ? `Destination: ${input.destination}` : null,
      input.incoterm ? `Requested Incoterm: ${input.incoterm}` : null,
      input.requiredBy ? `Required by: ${input.requiredBy}` : null,
      "Please confirm availability, unit and total price, MOQ, origin, lead time, certifications, payment terms, quotation validity, and the contact responsible for this offer.",
      "This message is a request for quotation only and does not constitute an order or commitment.",
      "Regards,\nExportunity Sourcing",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Bonjour ${input.supplierName},`,
    "Exportunity étudie un besoin industriel documenté.",
    `Référence : ${input.referenceCode}`,
    `Produit : ${input.product}`,
    input.specification ? `Spécification : ${input.specification}` : null,
    quantity ? `Quantité : ${quantity}` : null,
    input.destination ? `Destination : ${input.destination}` : null,
    input.incoterm ? `Incoterm demandé : ${input.incoterm}` : null,
    input.requiredBy ? `Date souhaitée : ${input.requiredBy}` : null,
    "Merci de confirmer la disponibilité, le prix unitaire et total, le MOQ, l'origine, le délai, les certifications, les conditions de paiement, la validité de l'offre et le contact responsable.",
    "Ce message est uniquement une demande de cotation et ne constitue ni une commande ni un engagement.",
    "Cordialement,\nÉquipe Sourcing Exportunity",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCustomerQuoteSnapshot(input: {
  product: string;
  specification?: string | null;
  quantity?: string | null;
  unit?: string | null;
  customerPrice: number;
}) {
  const description = [input.product, input.specification]
    .filter(Boolean)
    .join(" - ");
  return [
    {
      description,
      ...(input.quantity ? { quantity: input.quantity } : {}),
      ...(input.unit ? { unit: input.unit } : {}),
      amount: money(input.customerPrice).toFixed(2),
    },
  ];
}
