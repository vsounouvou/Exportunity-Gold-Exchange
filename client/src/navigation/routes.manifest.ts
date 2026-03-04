import type { AdminNavIconKey } from "@/lib/adminNavRegistry";

import { NAV_MENU_GROUPS } from "./buildMenu";
import type { NavNode } from "./navTypes";
import type { RouteGroupId } from "./routeRegistry";

export type NavManifestGroupId = RouteGroupId;

export type NavManifestItem = {
  id: string;
  label: string;
  path: string;
  icon?: AdminNavIconKey;
  requiresParams?: string[];
  hidden?: boolean;
  adminOnly?: boolean;
  subgroup?: string;
};

export type NavManifestGroup = {
  groupId: NavManifestGroupId;
  label: string;
  items: NavManifestItem[];
  subgroups: Array<{
    id: string;
    label: string;
    items: NavManifestItem[];
  }>;
};

export const NAV_GROUPS: NavManifestGroup[] = NAV_MENU_GROUPS.map((group) => ({
  groupId: group.groupId,
  label: group.label,
  items: group.items.map((item) => ({
    id: item.id,
    label: item.label,
    path: item.path,
    icon: item.icon,
    adminOnly: item.adminOnly,
  })),
  subgroups: group.subgroups.map((subgroup) => ({
    id: subgroup.id,
    label: subgroup.label,
    items: subgroup.items.map((item) => ({
      id: item.id,
      label: item.label,
      path: item.path,
      icon: item.icon,
      adminOnly: item.adminOnly,
      subgroup: item.subgroup,
    })),
  })),
}));

export const NAV_TREE: NavNode[] = NAV_GROUPS.map((group) => ({
  id: group.groupId,
  label: group.label,
  children: [
    ...group.items.map((item) => ({
      id: item.id,
      label: item.label,
      path: item.path,
      icon: item.icon,
      adminOnly: item.adminOnly,
      alwaysVisible: true,
    })),
    ...group.subgroups.map((subgroup) => ({
      id: subgroup.id,
      label: subgroup.label,
      children: subgroup.items.map((item) => ({
        id: item.id,
        label: item.label,
        path: item.path,
        icon: item.icon,
        adminOnly: item.adminOnly,
        alwaysVisible: true,
      })),
    })),
  ],
}));

