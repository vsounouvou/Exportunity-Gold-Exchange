export type DepartmentDefinition = {
  pageKey: string;
  label: string;
};

export const DEPARTMENT_REGISTRY: DepartmentDefinition[] = [
  { pageKey: "operations", label: "Operations" },
  { pageKey: "finance", label: "Finance" },
  { pageKey: "hr", label: "HR" },
  { pageKey: "compliance", label: "Compliance" },
  { pageKey: "marketplace", label: "Marketplace" },
  { pageKey: "gold-stamping", label: "Gold Stamping" },
  { pageKey: "sellers", label: "Sellers" },
  { pageKey: "products", label: "Products" },
  { pageKey: "logistics", label: "Logistics" },
  { pageKey: "growth", label: "Growth" },
  { pageKey: "territories", label: "Territories" },
];

export function getDepartmentByPageKey(pageKey: string) {
  const key = String(pageKey || "").trim().toLowerCase();
  return DEPARTMENT_REGISTRY.find((item) => item.pageKey === key) ?? null;
}
