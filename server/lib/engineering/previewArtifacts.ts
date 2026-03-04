import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { machineRevisions, machines, previewArtifacts } from "@db/schema";
import {
  buildGlbFromEngineeringBoxes,
  buildStlFromEngineeringBoxes,
  recipeToEngineeringBoxes,
  sha256Hex,
} from "./modeling";
import { ensureDir, getRevisionArtifactsDir, pickArtifactsRoot, safePathUnderRoot } from "./artifacts";

export type PreviewArtifactInfo = {
  kind: "glb" | "stl";
  path: string;
  sha256: string | null;
};

function toRelativePath(rootDir: string, absolutePath: string) {
  const rel = path.relative(rootDir, absolutePath);
  return rel.split(path.sep).join("/");
}

export async function ensureRevisionPreviewArtifacts(args: {
  tenantId: number;
  revisionId: number;
  force?: boolean;
}): Promise<{ ok: true; items: PreviewArtifactInfo[] } | { ok: false; reason: string }> {
  const rows = await db
    .select({
      revisionId: machineRevisions.id,
      revision: machineRevisions.revision,
      recipe: machineRevisions.recipe,
      machineId: machines.id,
    })
    .from(machineRevisions)
    .innerJoin(machines, eq(machineRevisions.machineId, machines.id))
    .where(and(eq(machineRevisions.id, args.revisionId), eq(machines.tenantId, args.tenantId)));

  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };

  const rootDir = await pickArtifactsRoot();
  const revisionDir = getRevisionArtifactsDir({
    rootDir,
    tenantId: args.tenantId,
    machineId: row.machineId,
    revision: Number(row.revision),
  });
  await ensureDir(revisionDir);

  const existing = await db.query.previewArtifacts.findMany({
    where: eq(previewArtifacts.revisionId, row.revisionId),
  });
  const has = new Set(existing.map((e) => String(e.kind)));

  const boxes = recipeToEngineeringBoxes((row.recipe ?? {}) as any);

  const items: PreviewArtifactInfo[] = [];

  const writeKind = async (kind: "glb" | "stl", data: Buffer | string) => {
    const filename = kind === "glb" ? "preview.glb" : "preview.stl";
    const abs = path.join(revisionDir, filename);
    const rel = toRelativePath(rootDir, abs);
    const sha = sha256Hex(data);
    if (typeof data === "string") {
      await fs.writeFile(abs, data, "utf8");
    } else {
      await fs.writeFile(abs, data);
    }

    const now = new Date();
    await db
      .insert(previewArtifacts)
      .values({
        revisionId: row.revisionId,
        kind,
        path: rel,
        sha256: sha,
        createdAt: now,
      } as any)
      .onConflictDoUpdate({
        target: [previewArtifacts.revisionId, previewArtifacts.kind],
        set: { path: rel, sha256: sha, createdAt: now },
      });

    items.push({ kind, path: rel, sha256: sha });
  };

  if (args.force || !has.has("stl")) {
    const stl = buildStlFromEngineeringBoxes(boxes, {
      solidName: `preview_${row.machineId}_rev_${row.revision}`,
    });
    await writeKind("stl", stl);
  } else {
    const stl = existing.find((e) => e.kind === "stl");
    if (stl) items.push({ kind: "stl", path: stl.path, sha256: stl.sha256 ?? null });
  }

  if (args.force || !has.has("glb")) {
    try {
      const glb = await buildGlbFromEngineeringBoxes(boxes);
      await writeKind("glb", glb);
    } catch {
      // GLB is optional; STL fallback is always available.
    }
  } else {
    const glb = existing.find((e) => e.kind === "glb");
    if (glb) items.push({ kind: "glb", path: glb.path, sha256: glb.sha256 ?? null });
  }

  return { ok: true, items };
}

export async function readPreviewArtifactFile(args: {
  tenantId: number;
  revisionId: number;
  kind: "glb" | "stl";
}): Promise<{ ok: true; absolutePath: string } | { ok: false; reason: string }> {
  const rows = await db
    .select({
      revisionId: machineRevisions.id,
      machineId: machines.id,
    })
    .from(machineRevisions)
    .innerJoin(machines, eq(machineRevisions.machineId, machines.id))
    .where(and(eq(machineRevisions.id, args.revisionId), eq(machines.tenantId, args.tenantId)));

  if (!rows[0]) return { ok: false, reason: "not_found" };

  const rec = await db.query.previewArtifacts.findFirst({
    where: and(eq(previewArtifacts.revisionId, args.revisionId), eq(previewArtifacts.kind, args.kind)),
  });

  if (!rec?.path) return { ok: false, reason: "missing_preview" };

  const rootDir = await pickArtifactsRoot();
  const absolutePath = safePathUnderRoot(rootDir, rec.path);
  return { ok: true, absolutePath };
}

