import type { AdminNavIconKey } from "@/lib/adminNavRegistry";

import { ROUTES, ROUTE_GROUP_META, type RouteDef, type RouteGroupId } from "./routeRegistry";

export type SidebarMenuItem = {
  id: string;
  label: string;
  path: string;
  icon?: AdminNavIconKey;
  order: number;
  groupId: RouteGroupId;
  subgroup?: string;
  kind: "page" | "hub";
  adminOnly: boolean;
  tags: string[];
};

export type SidebarMenuSubgroup = {
  id: string;
  label: string;
  order: number;
  items: SidebarMenuItem[];
};

export type SidebarMenuGroup = {
  groupId: RouteGroupId;
  label: string;
  order: number;
  items: SidebarMenuItem[];
  subgroups: SidebarMenuSubgroup[];
};

function normalizeLabel(value: string) {
  return String(value || "").trim().toLowerCase();
}

function subgroupId(groupId: string, subgroup: string) {
  const token = subgroup
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${groupId}_${token}`;
}

function itemSort(left: SidebarMenuItem, right: SidebarMenuItem) {
  if (left.order !== right.order) return left.order - right.order;
  if (left.kind !== right.kind) return left.kind === "hub" ? -1 : 1;
  return left.label.localeCompare(right.label);
}

function withDisambiguatedLabels(items: SidebarMenuItem[]): SidebarMenuItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalizeLabel(item.label);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return items.map((item) => {
    const key = normalizeLabel(item.label);
    if ((counts.get(key) || 0) <= 1) return item;
    if (item.subgroup) return { ...item, label: `${item.label} (${item.subgroup})` };
    const [, suffix = item.groupId] = item.path.split("/").filter(Boolean);
    const context = suffix ? suffix.replace(/[-_]+/g, " ") : item.groupId;
    return { ...item, label: `${item.label} (${context})` };
  });
}

function toSidebarItem(route: RouteDef): SidebarMenuItem {
  return {
    id: route.id,
    label: route.title,
    path: route.path,
    icon: route.icon,
    order: route.order ?? 100,
    groupId: route.group,
    subgroup: route.subgroup,
    kind: route.kind === "hub" ? "hub" : "page",
    adminOnly: Boolean(route.adminOnly),
    tags: route.tags || [],
  };
}

export function buildSidebarMenu(routes: RouteDef[] = ROUTES): SidebarMenuGroup[] {
  const byPath = new Map<string, SidebarMenuItem>();

  for (const route of routes) {
    if (route.kind !== "page" && route.kind !== "hub") continue;
    const next = toSidebarItem(route);
    const existing = byPath.get(next.path);
    if (!existing) {
      byPath.set(next.path, next);
      continue;
    }
    if (next.order < existing.order || (next.order === existing.order && next.kind === "hub" && existing.kind !== "hub")) {
      byPath.set(next.path, next);
    }
  }

  const groups = new Map<RouteGroupId, SidebarMenuGroup>();
  const groupOrderMap = new Map(ROUTE_GROUP_META.map((meta) => [meta.groupId, meta.order]));
  const groupLabelMap = new Map(ROUTE_GROUP_META.map((meta) => [meta.groupId, meta.label]));

  const items = withDisambiguatedLabels(Array.from(byPath.values()).sort(itemSort));
  for (const item of items) {
    if (!groups.has(item.groupId)) {
      groups.set(item.groupId, {
        groupId: item.groupId,
        label: groupLabelMap.get(item.groupId) || "Unsorted",
        order: groupOrderMap.get(item.groupId) ?? 999,
        items: [],
        subgroups: [],
      });
    }
    const group = groups.get(item.groupId)!;

    if (item.subgroup) {
      const key = subgroupId(item.groupId, item.subgroup);
      const existingSubgroup = group.subgroups.find((row) => row.id === key);
      if (existingSubgroup) {
        existingSubgroup.items.push(item);
      } else {
        group.subgroups.push({
          id: key,
          label: item.subgroup,
          order: item.order,
          items: [item],
        });
      }
      continue;
    }

    group.items.push(item);
  }

  for (const group of groups.values()) {
    group.items = group.items.sort(itemSort);
    group.subgroups = group.subgroups
      .map((subgroup) => ({ ...subgroup, items: subgroup.items.sort(itemSort) }))
      .sort((left, right) => {
        if (left.order !== right.order) return left.order - right.order;
        return left.label.localeCompare(right.label);
      });
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    return left.label.localeCompare(right.label);
  });
}

export const NAV_MENU_GROUPS = buildSidebarMenu();

