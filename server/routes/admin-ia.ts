import fs from "fs";
import path from "path";
import { Router } from "express";
import { ensureTenantAdmin } from "./utils/auth";

type RegistryItem = {
  route: string;
  pageTitle: string;
  module: string;
  capabilityTag: string;
  apiEndpointsCalled: string[];
  navEntryName: string | null;
  visibleInNav: boolean;
  redirectTo?: string;
};

type RegistryPayload = {
  version: number;
  generatedAt: string;
  items: RegistryItem[];
};

function normalizeEndpoint(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\/+$/, "");
}

function overlapRatio(a: string[], b: string[]) {
  const A = new Set(a.map(normalizeEndpoint).filter(Boolean));
  const B = new Set(b.map(normalizeEndpoint).filter(Boolean));
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = new Set<string>([...A, ...B]).size;
  return union ? inter / union : 0;
}

function readRegistry(): { payload: RegistryPayload; lastUpdated: string | null } {
  const registryPath = path.join(process.cwd(), "client", "src", "lib", "adminNavRegistry.json");
  const raw = fs.readFileSync(registryPath, "utf8");
  const payload = JSON.parse(raw) as RegistryPayload;
  const stat = fs.statSync(registryPath);
  const lastUpdated = Number.isFinite(stat.mtimeMs) ? new Date(stat.mtimeMs).toISOString() : null;
  return { payload, lastUpdated };
}

const router = Router();

router.use(ensureTenantAdmin);

router.get("/pages-audit", async (_req, res) => {
  try {
    const { payload, lastUpdated } = readRegistry();
    const items = Array.isArray(payload.items) ? payload.items : [];

    const byCapability = new Map<string, RegistryItem[]>();
    for (const item of items) {
      const tag = String(item?.capabilityTag || "").trim();
      if (!tag) continue;
      if (!byCapability.has(tag)) byCapability.set(tag, []);
      byCapability.get(tag)!.push(item);
    }

    const duplicateClusters: Array<{
      capabilityTag: string;
      canonicalRoute: string | null;
      routes: string[];
      apiOverlapThreshold: number;
    }> = [];

    for (const [capabilityTag, group] of byCapability.entries()) {
      if (group.length < 2) continue;

      const links = new Map<string, Set<string>>();
      for (const item of group) links.set(item.route, new Set<string>());

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          const ratio = overlapRatio(a.apiEndpointsCalled || [], b.apiEndpointsCalled || []);
          if (ratio >= 0.8) {
            links.get(a.route)!.add(b.route);
            links.get(b.route)!.add(a.route);
          }
        }
      }

      const visited = new Set<string>();
      for (const start of links.keys()) {
        if (visited.has(start)) continue;
        const queue = [start];
        const cluster: string[] = [];
        visited.add(start);
        while (queue.length) {
          const cur = queue.pop() as string;
          cluster.push(cur);
          for (const next of links.get(cur) || []) {
            if (visited.has(next)) continue;
            visited.add(next);
            queue.push(next);
          }
        }

        if (cluster.length < 2) continue;

        const clusterItems = group.filter((x) => cluster.includes(x.route));
        const canonical =
          clusterItems.find((x) => x.visibleInNav && !x.redirectTo)?.route ||
          clusterItems.find((x) => !x.redirectTo)?.route ||
          clusterItems[0]?.route ||
          null;

        duplicateClusters.push({
          capabilityTag,
          canonicalRoute: canonical,
          routes: cluster.sort((a, b) => a.localeCompare(b)),
          apiOverlapThreshold: 0.8,
        });
      }
    }

    res.json({
      ok: true,
      generatedAt: payload.generatedAt || null,
      lastUpdated,
      items: items.map((item) => ({
        route: item.route,
        pageTitle: item.pageTitle,
        module: item.module,
        capabilityTag: item.capabilityTag,
        apiEndpointsCalled: item.apiEndpointsCalled || [],
        navEntryName: item.navEntryName,
        lastUpdated,
        redirectTo: item.redirectTo || null,
        visibleInNav: !!item.visibleInNav,
      })),
      duplicates: duplicateClusters.sort((a, b) => a.capabilityTag.localeCompare(b.capabilityTag)),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "audit failed" });
  }
});

export default router;

