export type IndustrialSearchRequirementContext = {
  requirementType: "machinery" | "raw_material" | "spare_part";
  categoryCode:
    | "machinery_and_production_equipment"
    | "raw_materials"
    | "spare_parts_and_components";
};

type IndustrialSearchAliasGroup = {
  terms: readonly string[];
  context?: IndustrialSearchRequirementContext;
};

const INDUSTRIAL_SEARCH_ALIAS_GROUPS: readonly IndustrialSearchAliasGroup[] = [
  {
    terms: ["roulement", "roulements", "bearing", "bearings"],
    context: {
      requirementType: "spare_part",
      categoryCode: "spare_parts_and_components",
    },
  },
  {
    terms: ["courroie", "courroies", "belt", "belts"],
    context: {
      requirementType: "spare_part",
      categoryCode: "spare_parts_and_components",
    },
  },
  {
    terms: ["poulie", "poulies", "pulley", "pulleys"],
    context: {
      requirementType: "spare_part",
      categoryCode: "spare_parts_and_components",
    },
  },
  {
    terms: ["pignon", "pignons", "sprocket", "sprockets"],
    context: {
      requirementType: "spare_part",
      categoryCode: "spare_parts_and_components",
    },
  },
  {
    terms: ["accouplement", "accouplements", "coupling", "couplings"],
    context: {
      requirementType: "spare_part",
      categoryCode: "spare_parts_and_components",
    },
  },
  {
    terms: ["pompe", "pompes", "pump", "pumps"],
    context: {
      requirementType: "machinery",
      categoryCode: "machinery_and_production_equipment",
    },
  },
  {
    terms: ["arbre", "arbres", "shaft", "shafts"],
    context: {
      requirementType: "spare_part",
      categoryCode: "spare_parts_and_components",
    },
  },
  {
    terms: ["bague", "bagues", "bushing", "bushings"],
    context: {
      requirementType: "spare_part",
      categoryCode: "spare_parts_and_components",
    },
  },
  {
    terms: [
      "matière première",
      "matières premières",
      "raw material",
      "raw materials",
    ],
    context: {
      requirementType: "raw_material",
      categoryCode: "raw_materials",
    },
  },
  {
    terms: [
      "ligne de production",
      "lignes de production",
      "production line",
      "production lines",
    ],
    context: {
      requirementType: "machinery",
      categoryCode: "machinery_and_production_equipment",
    },
  },
  {
    terms: [
      "pièce détachée",
      "pièces détachées",
      "spare part",
      "spare parts",
    ],
    context: {
      requirementType: "spare_part",
      categoryCode: "spare_parts_and_components",
    },
  },
];

export function normalizeIndustrialSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const INDUSTRIAL_SEARCH_ALIASES = new Map<string, string[]>();
const INDUSTRIAL_SEARCH_REQUIREMENT_CONTEXTS = new Map<
  string,
  IndustrialSearchRequirementContext
>();

for (const group of INDUSTRIAL_SEARCH_ALIAS_GROUPS) {
  for (const term of group.terms) {
    const normalized = normalizeIndustrialSearchText(term);
    INDUSTRIAL_SEARCH_ALIASES.set(normalized, Array.from(group.terms));
    if (group.context) {
      INDUSTRIAL_SEARCH_REQUIREMENT_CONTEXTS.set(normalized, group.context);
    }
  }
}

/**
 * Keeps public industrial search deterministic while recognizing common
 * French/English technical equivalents. The returned list is deliberately
 * bounded before it becomes database search predicates.
 */
export function industrialSearchTerms(input: string) {
  const original = input.trim();
  if (!original) return [];

  const normalized = normalizeIndustrialSearchText(original);
  const values = new Set<string>([original]);
  if (normalized && normalized !== original) values.add(normalized);

  const aliasKeys = new Set([
    normalized,
    ...normalized.split(" ").filter(Boolean),
  ]);
  for (const key of aliasKeys) {
    for (const alias of INDUSTRIAL_SEARCH_ALIASES.get(key) || []) {
      values.add(alias);
    }
  }

  return Array.from(values)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Suggests a controlled requirement type only for terms in the maintained
 * public technical alias registry. Unknown searches intentionally return null.
 */
export function industrialSearchRequirementContext(
  input: string,
): IndustrialSearchRequirementContext | null {
  const normalized = normalizeIndustrialSearchText(input);
  if (!normalized) return null;

  const direct = INDUSTRIAL_SEARCH_REQUIREMENT_CONTEXTS.get(normalized);
  if (direct) return { ...direct };

  const boundedInput = ` ${normalized} `;
  for (const [term, context] of INDUSTRIAL_SEARCH_REQUIREMENT_CONTEXTS) {
    if (term.includes(" ") && boundedInput.includes(` ${term} `)) {
      return { ...context };
    }
  }

  const keys = normalized.split(" ").filter(Boolean);
  for (const key of keys) {
    const context = INDUSTRIAL_SEARCH_REQUIREMENT_CONTEXTS.get(key);
    if (context) return { ...context };
  }
  return null;
}
