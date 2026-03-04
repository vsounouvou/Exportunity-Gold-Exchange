import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { engineeringRequests, fabricationJobs, machineRevisions, machines } from "@db/schema";
import { ensureDir, getRevisionArtifactsDir, pickArtifactsRoot } from "./artifacts";
import { buildStlFromEngineeringBoxes, recipeToEngineeringBoxes } from "./modeling";
import { ensureRevisionPreviewArtifacts } from "./previewArtifacts";

type ExecuteArgs = {
  tenantId: number;
  revisionId: number;
  nodeId?: string | null;
};

type ExecuteResult =
  | { ok: true; jobId: number; artifactsLocation: string; nodeId: string; status: "completed" }
  | { ok: false; status: "failed"; reason: string };

function safeString(value: unknown): string {
  return String(value ?? "").trim();
}

function safeJson(value: unknown) {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

async function writeArtifacts(args: {
  rootDir: string;
  tenantId: number;
  machineId: number;
  revision: number;
  recipe: Record<string, unknown>;
}) {
  const machineDir = getRevisionArtifactsDir({
    rootDir: args.rootDir,
    tenantId: args.tenantId,
    machineId: args.machineId,
    revision: args.revision,
  });
  await ensureDir(machineDir);

  const bom = Array.isArray((args.recipe as any)?.bom) ? (args.recipe as any).bom : [];
  const modules = Array.isArray((args.recipe as any)?.modules) ? (args.recipe as any).modules : [];

  const bomPath = path.join(machineDir, "bom.json");
  await fs.writeFile(bomPath, JSON.stringify(bom, null, 2), "utf8");

  const cutListPath = path.join(machineDir, "cut_list.csv");
  const cutLines = ["part,qty,material,notes"];
  for (const mod of modules) {
    const id = safeString((mod as any)?.id) || "module";
    cutLines.push(`${id},1,steel,placeholder`);
  }
  await fs.writeFile(cutListPath, cutLines.join("\n"), "utf8");

  const weldMapPath = path.join(machineDir, "weld_map.txt");
  await fs.writeFile(
    weldMapPath,
    [
      "Weld Map (placeholder)",
      `tenant=${args.tenantId} machine=${args.machineId} revision=${args.revision}`,
      "",
      "1) Frame seams: continuous welds, 6mm fillet",
      "2) Guard mounts: stitch welds, 50mm on / 50mm off",
      "",
      "NOTE: This is a simulated artifact; a real industrial node will generate weld maps from CAD.",
      "",
    ].join("\n"),
    "utf8",
  );

  const assemblyPath = path.join(machineDir, "assembly_instructions.md");
  await fs.writeFile(
    assemblyPath,
    [
      "# Assembly Instructions (placeholder)",
      "",
      `- Tenant: ${args.tenantId}`,
      `- Machine: ${args.machineId}`,
      `- Revision: ${args.revision}`,
      "",
      "## Steps",
      "1. Fabricate skid/frame components per cut list.",
      "2. Weld frame following weld map.",
      "3. Mount modules in listed order.",
      "4. Install guards and labels.",
      "5. Run dry commissioning test (no ore), then low-throughput ore test.",
      "",
    ].join("\n"),
    "utf8",
  );

  const recipeMeta = safeJson((args.recipe as any)?.metadata);

  const modelStepPath = path.join(machineDir, "model.step");
  await fs.writeFile(
    modelStepPath,
    [
      "ISO-10303-21;",
      "HEADER;",
      "FILE_DESCRIPTION(('SIMULATED STEP PLACEHOLDER'),'2;1');",
      `FILE_NAME('machine_${args.machineId}_rev_${args.revision}.step','${new Date().toISOString()}',('Exportunity Engineering Kernel'),('Exportunity'), '','', '');`,
      "ENDSEC;",
      "DATA;",
      `/* recipe_metadata: ${JSON.stringify(recipeMeta)} */`,
      "ENDSEC;",
      "END-ISO-10303-21;",
      "",
    ].join("\n"),
    "utf8",
  );

  const modelDxfPath = path.join(machineDir, "model.dxf");
  await fs.writeFile(
    modelDxfPath,
    [
      "0",
      "SECTION",
      "2",
      "HEADER",
      "9",
      "$ACADVER",
      "1",
      "AC1027",
      "0",
      "ENDSEC",
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "TEXT",
      "8",
      "0",
      "10",
      "0.0",
      "20",
      "0.0",
      "40",
      "2.5",
      "1",
      `SIMULATED DXF - machine ${args.machineId} rev ${args.revision}`,
      "0",
      "ENDSEC",
      "0",
      "EOF",
      "",
    ].join("\n"),
    "utf8",
  );

  const modelStlPath = path.join(machineDir, "model.stl");
  const stlSolidName = `machine_${args.machineId}_rev_${args.revision}`;
  const boxes = recipeToEngineeringBoxes(args.recipe ?? {});
  const stl = buildStlFromEngineeringBoxes(boxes, { solidName: stlSolidName });
  await fs.writeFile(
    modelStlPath,
    stl,
    "utf8",
  );

  return machineDir;
}

function pickNodeId(args: { explicit?: string | null; requestInput: Record<string, unknown> }) {
  const explicit = safeString(args.explicit);
  if (explicit) return explicit;

  const nodes = Array.isArray((args.requestInput as any).availableNodes) ? ((args.requestInput as any).availableNodes as any[]) : [];
  const first = nodes.find((n) => safeString(n?.nodeId));
  if (first) return safeString(first.nodeId);

  return "local-sim";
}

export async function executeMachineRevision(args: ExecuteArgs): Promise<ExecuteResult> {
  const now = new Date();
  const rows = await db
    .select({
      revisionId: machineRevisions.id,
      revision: machineRevisions.revision,
      recipe: machineRevisions.recipe,
      machineId: machines.id,
      requestId: machines.engineeringRequestId,
      requestInput: engineeringRequests.input,
    })
    .from(machineRevisions)
    .innerJoin(machines, eq(machineRevisions.machineId, machines.id))
    .leftJoin(engineeringRequests, eq(machines.engineeringRequestId, engineeringRequests.id))
    .where(and(eq(machineRevisions.id, args.revisionId), eq(machines.tenantId, args.tenantId)));

  const row = rows[0];
  if (!row) return { ok: false, status: "failed", reason: "not_found" };

  const requestInput = (row.requestInput ?? {}) as Record<string, unknown>;
  const nodeId = pickNodeId({ explicit: args.nodeId ?? null, requestInput });

  try {
    const [job] = await db
      .insert(fabricationJobs)
      .values({
        revisionId: row.revisionId,
        nodeId,
        status: "queued",
        logs: null,
        artifactsLocation: null,
        metadata: { executor: "local_sim", node_id: nodeId },
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: fabricationJobs.id });

    await db.update(fabricationJobs).set({ status: "running", updatedAt: new Date() }).where(eq(fabricationJobs.id, job.id));
    await db.update(machines).set({ status: "executing", updatedAt: new Date() }).where(eq(machines.id, row.machineId));

    const root = await pickArtifactsRoot();
    const artifactsLocation = await writeArtifacts({
      rootDir: root,
      tenantId: args.tenantId,
      machineId: row.machineId,
      revision: Number(row.revision),
      recipe: (row.recipe ?? {}) as any,
    });

    try {
      await ensureRevisionPreviewArtifacts({ tenantId: args.tenantId, revisionId: row.revisionId });
    } catch {
      // Best-effort only; execution artifacts are still useful without a preview.
    }

    const logLines = [
      `[${new Date().toISOString()}] job=${job.id} node=${nodeId} status=completed`,
      `artifacts_location=${artifactsLocation}`,
    ].join("\n");

    await db
      .update(fabricationJobs)
      .set({ status: "completed", artifactsLocation, logs: logLines, updatedAt: new Date() })
      .where(eq(fabricationJobs.id, job.id));

    await db.update(machines).set({ status: "executed", updatedAt: new Date() }).where(eq(machines.id, row.machineId));

    if (row.requestId) {
      await db
        .update(engineeringRequests)
        .set({ status: "executed", lastError: null, updatedAt: new Date() })
        .where(eq(engineeringRequests.id, row.requestId));
    }

    return { ok: true, jobId: job.id, artifactsLocation, nodeId, status: "completed" };
  } catch (err: any) {
    const message = String(err?.message || "execution_failed");
    return { ok: false, status: "failed", reason: message };
  }
}
