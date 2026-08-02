export const INDUSTRIAL_ORDER_STATUSES = [
  "confirmed",
  "procurement",
  "manufacturing",
  "quality_control",
  "delivery",
  "completed",
  "cancelled",
] as const;

export type IndustrialOrderStatus = (typeof INDUSTRIAL_ORDER_STATUSES)[number];

const ORDER_TRANSITIONS: Record<IndustrialOrderStatus, readonly IndustrialOrderStatus[]> = {
  confirmed: ["procurement", "manufacturing", "cancelled"],
  procurement: ["manufacturing", "quality_control", "delivery", "cancelled"],
  manufacturing: ["quality_control", "delivery", "cancelled"],
  quality_control: ["manufacturing", "delivery", "cancelled"],
  delivery: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionIndustrialOrder(from: IndustrialOrderStatus, to: IndustrialOrderStatus) {
  return from === to || ORDER_TRANSITIONS[from].includes(to);
}

export function isIndustrialOrderOpen(status: IndustrialOrderStatus) {
  return status !== "completed" && status !== "cancelled";
}
