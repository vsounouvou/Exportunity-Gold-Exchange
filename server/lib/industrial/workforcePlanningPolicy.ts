export type CommercialStaffingContext = {
  intent?: string | null;
  productCategory?: string | null;
  requirementType: string;
  missingSpecialistKeys?: string[];
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function commercialStaffingRoleTitles(
  context: CommercialStaffingContext,
) {
  const roles = new Set<string>();
  const category = normalize(context.productCategory);
  const intent = normalize(context.intent);

  if (category === "palm_oil") roles.add("Palm Oil Desk Agent");
  if (category === "cocoa") roles.add("Cocoa Desk Agent");
  if (category === "coffee") roles.add("Coffee Desk Agent");
  if (category === "cashew") roles.add("Cashew Desk Agent");
  if (
    ["machinery", "spare_part", "custom_manufacturing"].includes(
      context.requirementType,
    )
  ) {
    roles.add("Machinery and Industrial Equipment Desk Agent");
  }
  if (intent === "find_buyer" || intent === "sell_export") {
    roles.add("Buyer Intelligence Lead");
  }

  return Array.from(roles);
}
