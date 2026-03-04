import fs from "fs";
import path from "path";

export type AdminNavRegistryItem = {
  route: string;
  pageTitle: string;
  module: string;
  capabilityTag: string;
  apiEndpointsCalled: string[];
  navEntryName: string | null;
  visibleInNav: boolean;
  redirectTo?: string;
  icon?: string;
};

export type AdminNavRegistryPayload = {
  version: number;
  generatedAt: string;
  items: AdminNavRegistryItem[];
};

export function readAdminNavRegistry(): { ok: true; payload: AdminNavRegistryPayload; lastUpdated: string | null } | { ok: false; error: string } {
  const registryPath = path.join(process.cwd(), "client", "src", "lib", "adminNavRegistry.json");
  try {
    const raw = fs.readFileSync(registryPath, "utf8");
    const payload = JSON.parse(raw) as AdminNavRegistryPayload;
    const stat = fs.statSync(registryPath);
    const lastUpdated = Number.isFinite(stat.mtimeMs) ? new Date(stat.mtimeMs).toISOString() : null;
    return { ok: true, payload, lastUpdated };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || "failed_to_read_admin_nav_registry") };
  }
}

export function summarizeAdminNav(payload: AdminNavRegistryPayload, opts?: { maxItems?: number }) {
  const maxItems = Math.max(1, Math.min(Number(opts?.maxItems ?? 32), 120));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const visible = items.filter((i) => i && i.visibleInNav).map((i) => ({
    module: String(i.module || "Admin"),
    label: String(i.navEntryName || i.pageTitle || i.route),
    route: String(i.route || ""),
    redirectTo: i.redirectTo ? String(i.redirectTo) : null,
  }));

  const byModule = new Map<string, Array<{ label: string; route: string; redirectTo: string | null }>>();
  for (const item of visible) {
    const module = item.module || "Admin";
    if (!byModule.has(module)) byModule.set(module, []);
    byModule.get(module)!.push({ label: item.label, route: item.route, redirectTo: item.redirectTo });
  }

  const lines: string[] = [];
  let emitted = 0;
  for (const [module, group] of Array.from(byModule.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const entries = group
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((x) => `- ${x.label} (${x.redirectTo ? x.redirectTo : x.route})`);

    if (!entries.length) continue;
    lines.push(`${module}:`);
    for (const entry of entries) {
      if (emitted >= maxItems) break;
      lines.push(entry);
      emitted += 1;
    }
    if (emitted >= maxItems) break;
  }

  if (visible.length > maxItems) {
    lines.push(`... (${visible.length - maxItems} more)`);
  }

  return lines.join("\n");
}

