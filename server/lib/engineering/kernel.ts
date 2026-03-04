import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { ENGINEERING_MACHINE_FAMILIES, engineeringRequests, machineEditActions, machineRevisions, machines } from "@db/schema";
import { ensureRevisionPreviewArtifacts } from "./previewArtifacts";

export const ENGINEERING_COMPILER_VERSION = "engineering-kernel@v1";
export const ENGINEERING_GENERATOR_VERSION = "mining-machines@v1";

export type EngineeringKernelInput = {
  throughputTph?: number;
  geology?: string;
  geography?: string;
  budgetUsd?: number;
  timelineDays?: number;
  logistics?: Record<string, unknown>;
  availableNodes?: Array<{ nodeId: string; location?: string }>;
};

export type EngineeringRequestCreateArgs = {
  tenantId: number;
  projectId?: string | null;
  intent: string;
  input?: EngineeringKernelInput;
};

export type CompileResult =
  | {
      ok: true;
      status: "compiled";
      tenantId: number;
      requestId: number;
      machineId: number;
      revisionId: number;
      revision: number;
      machineFamily: (typeof ENGINEERING_MACHINE_FAMILIES)[number];
      parametersHash: string;
      recipe: Record<string, unknown>;
      reusedRevision: boolean;
    }
  | {
      ok: false;
      status: "rejected" | "failed";
      tenantId: number;
      requestId: number;
      reason: string;
    };

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickBudgetUsd(input: Record<string, unknown>): number | null {
  return (
    safeNumber(input.budgetUsd) ??
    safeNumber(input.budgetUSD) ??
    safeNumber(input.budget_usd) ??
    safeNumber(input.budget) ??
    null
  );
}

function inferThroughputTphFromIntent(intent: string): number | null {
  const text = intent.toLowerCase();

  // Examples:
  // "1–2 t/h", "1-2 t/h", "1 to 2 t/h"
  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:t\/h|tph|tph\b|tons?\/h)/i);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(0.1, (a + b) / 2);
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*(?:t\/h|tph|tph\b|tons?\/h)/i);
  if (single) {
    const v = Number(single[1]);
    if (Number.isFinite(v)) return Math.max(0.1, v);
  }

  return null;
}

function normalizeIntent(intent: unknown): string {
  return String(intent ?? "").trim();
}

function stableSort(value: any, seen: WeakSet<object>): any {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => stableSort(v, seen));
  const keys = Object.keys(value).sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = stableSort(value[key], seen);
  return out;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableSort(value as any, new WeakSet()));
}

export function hashRecipe(recipe: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(recipe)).digest("hex");
}

function architectureAgent(args: { intent: string; input: EngineeringKernelInput }) {
  const text = `${args.intent}`.toLowerCase();
  const wantsCrushing = /crush|crushing|crusher|screen|screening/.test(text);
  const wantsFinishing = /final|finishing|concentrate|refin/.test(text);
  const wantsDryGold = /gold/.test(text) && /dry|minimal water|no water|waterless/.test(text);

  if (wantsCrushing) return "portable_crushing_screening_unit" as const;
  if (wantsFinishing) return "final_concentrate_finishing_module" as const;
  if (wantsDryGold) return "dry_gold_recovery_system" as const;
  return "universal_mining_skid_frame" as const;
}

function designAgent(args: {
  machineFamily: (typeof ENGINEERING_MACHINE_FAMILIES)[number];
  intent: string;
  input: EngineeringKernelInput;
}) {
  const throughputTph =
    typeof args.input.throughputTph === "number" && Number.isFinite(args.input.throughputTph)
      ? args.input.throughputTph
      : inferThroughputTphFromIntent(args.intent) ?? 1;

  const base = {
    family: args.machineFamily,
    intent: args.intent,
    parameters: {
      throughput_tph: Math.max(0.1, throughputTph),
      geology: args.input.geology ?? null,
      geography: args.input.geography ?? null,
      timeline_days: typeof args.input.timelineDays === "number" ? args.input.timelineDays : null,
    },
    modules: [] as Array<Record<string, unknown>>,
    bom: [] as Array<Record<string, unknown>>,
    safety: { guards: true, labels: true, lockout_tagout: true },
    metadata: {
      generator_version: ENGINEERING_GENERATOR_VERSION,
      generated_at: new Date().toISOString(),
    },
  } satisfies Record<string, unknown>;

  const addBom = (item: { sku: string; description: string; qty: number; unit_cost_usd: number }) => {
    base.bom.push(item);
  };

  switch (args.machineFamily) {
    case "dry_gold_recovery_system": {
      base.modules.push(
        { id: "feed_hopper", type: "hopper", material: "steel", notes: "grizzly + dust control" },
        { id: "vibration_feeder", type: "feeder", kind: "vibratory" },
        { id: "air_classifier", type: "classifier", kind: "air" },
        { id: "dry_concentrator", type: "concentrator", kind: "dry" },
        { id: "baghouse", type: "dust_control", kind: "baghouse" },
      );
      addBom({ sku: "HOPPER-STD", description: "Feed hopper (steel)", qty: 1, unit_cost_usd: 1800 });
      addBom({ sku: "FEEDER-VIB", description: "Vibratory feeder", qty: 1, unit_cost_usd: 2400 });
      addBom({ sku: "AIR-CLASS", description: "Air classifier", qty: 1, unit_cost_usd: 6800 });
      addBom({ sku: "CONC-DRY", description: "Dry concentrator module", qty: 1, unit_cost_usd: 14500 });
      addBom({ sku: "BAGHOUSE", description: "Dust baghouse", qty: 1, unit_cost_usd: 5200 });
      break;
    }
    case "final_concentrate_finishing_module": {
      base.modules.push(
        { id: "finishing_table", type: "finishing", kind: "table" },
        { id: "weighing_scale", type: "scale", kind: "precision" },
        { id: "secure_box", type: "security", kind: "lockbox" },
      );
      addBom({ sku: "FIN-TABLE", description: "Finishing table", qty: 1, unit_cost_usd: 2200 });
      addBom({ sku: "SCALE-PREC", description: "Precision weighing scale", qty: 1, unit_cost_usd: 600 });
      addBom({ sku: "LOCKBOX", description: "Secure concentrate lockbox", qty: 1, unit_cost_usd: 450 });
      break;
    }
    case "portable_crushing_screening_unit": {
      base.modules.push(
        { id: "crusher", type: "crusher", kind: "jaw" },
        { id: "screen", type: "screen", kind: "vibratory" },
        { id: "conveyor", type: "conveyor", kind: "belt" },
        { id: "power", type: "power", kind: "diesel_generator" },
      );
      addBom({ sku: "CRUSH-JAW", description: "Jaw crusher", qty: 1, unit_cost_usd: 21000 });
      addBom({ sku: "SCREEN-VIB", description: "Vibratory screen", qty: 1, unit_cost_usd: 9800 });
      addBom({ sku: "CONV-BELT", description: "Belt conveyor", qty: 2, unit_cost_usd: 3200 });
      addBom({ sku: "GEN-DIESEL", description: "Diesel generator", qty: 1, unit_cost_usd: 7500 });
      break;
    }
    case "universal_mining_skid_frame": {
      base.modules.push({ id: "skid", type: "frame", kind: "universal", mounts: ["hopper", "pump", "generator"] });
      addBom({ sku: "SKID-FRAME", description: "Universal skid frame (welded steel)", qty: 1, unit_cost_usd: 5400 });
      break;
    }
    default: {
      // Enforce canonical v1 families.
      throw new Error(`unknown_machine_family:${String(args.machineFamily)}`);
    }
  }

  return base as unknown as Record<string, unknown>;
}

function manufacturingAgent(recipe: Record<string, unknown>) {
  // Fabrication reality constraints (global, immutable): keep it conservative.
  // For v1 we only validate structural sanity; a future industrial node can run a real CAD kernel.
  const next = { ...recipe };
  return next;
}

function costAgent(args: { recipe: Record<string, unknown>; budgetUsd: number | null }) {
  const bom = Array.isArray((args.recipe as any)?.bom) ? ((args.recipe as any).bom as any[]) : [];
  const capex = bom.reduce((sum, item) => {
    const qty = Number(item?.qty ?? 0);
    const unit = Number(item?.unit_cost_usd ?? 0);
    return sum + (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unit) ? unit : 0);
  }, 0);

  const budgetUsd = args.budgetUsd;
  const economicallyJustified = Number.isFinite(budgetUsd) ? capex > 0 && capex <= (budgetUsd as number) : capex > 0;

  return { capex_usd: capex, budget_usd: budgetUsd, economically_justified: economicallyJustified };
}

function reliabilityAgent(recipe: Record<string, unknown>) {
  return { ...recipe, reliability: { target_uptime_pct: 92, maintenance_interval_days: 14 } };
}

function complianceAgent(recipe: Record<string, unknown>) {
  const metadata = typeof (recipe as any).metadata === "object" && (recipe as any).metadata ? (recipe as any).metadata : {};
  return { ...recipe, metadata: { ...metadata, safety_compliance: { guards: true, labels: true } } };
}

export async function createEngineeringRequest(args: EngineeringRequestCreateArgs) {
  const intent = normalizeIntent(args.intent);
  if (!intent) throw new Error("intent_required");

  const now = new Date();
  const [row] = await db
    .insert(engineeringRequests)
    .values({
      tenantId: args.tenantId,
      projectId: args.projectId ?? null,
      inferredIntent: intent,
      input: args.input ?? {},
      status: "pending",
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: engineeringRequests.id });

  return { id: row.id };
}

export async function compileEngineeringRequest(args: { tenantId: number; requestId: number }): Promise<CompileResult> {
  const now = new Date();
  const reqRow = await db.query.engineeringRequests.findFirst({
    where: and(eq(engineeringRequests.id, args.requestId), eq(engineeringRequests.tenantId, args.tenantId)),
  });
  if (!reqRow) {
    return { ok: false, status: "failed", tenantId: args.tenantId, requestId: args.requestId, reason: "not_found" };
  }

  if (String(reqRow.status) === "compiled") {
    const machineRow = await db.query.machines.findFirst({
      where: and(eq(machines.tenantId, args.tenantId), eq(machines.engineeringRequestId, reqRow.id)),
      orderBy: desc(machines.updatedAt),
    });
    if (machineRow) {
      const latest = await db.query.machineRevisions.findFirst({
        where: eq(machineRevisions.machineId, machineRow.id),
        orderBy: desc(machineRevisions.revision),
      });
      if (latest) {
        try {
          await ensureRevisionPreviewArtifacts({ tenantId: args.tenantId, revisionId: latest.id });
        } catch {
          // Preview generation is best-effort.
        }
        return {
          ok: true,
          status: "compiled",
          tenantId: args.tenantId,
          requestId: reqRow.id,
          machineId: machineRow.id,
          revisionId: latest.id,
          revision: latest.revision,
          machineFamily: machineRow.machineFamily as any,
          parametersHash: latest.parametersHash,
          recipe: (latest.recipe as any) ?? {},
          reusedRevision: true,
        };
      }
    }
  }

  const input = (reqRow.input ?? {}) as Record<string, unknown>;
  const normalizedInput: EngineeringKernelInput = {
    throughputTph: safeNumber((input as any).throughputTph) ?? undefined,
    geology: typeof (input as any).geology === "string" ? (input as any).geology : undefined,
    geography: typeof (input as any).geography === "string" ? (input as any).geography : undefined,
    budgetUsd: pickBudgetUsd(input) ?? undefined,
    timelineDays: safeNumber((input as any).timelineDays) ?? undefined,
    logistics: typeof (input as any).logistics === "object" && (input as any).logistics ? (input as any).logistics : undefined,
    availableNodes: Array.isArray((input as any).availableNodes) ? (input as any).availableNodes : undefined,
  };

  try {
    const machineFamily = architectureAgent({ intent: reqRow.inferredIntent, input: normalizedInput });
    const recipe0 = designAgent({ machineFamily, intent: reqRow.inferredIntent, input: normalizedInput });
    const recipe1 = manufacturingAgent(recipe0);
    const recipe2 = reliabilityAgent(recipe1);
    const recipe3 = complianceAgent(recipe2);

    const costing = costAgent({ recipe: recipe3, budgetUsd: normalizedInput.budgetUsd ?? null });
    const metadata = typeof (recipe3 as any).metadata === "object" && (recipe3 as any).metadata ? (recipe3 as any).metadata : {};
    const recipeFinal = { ...recipe3, metadata: { ...metadata, costing } };

    if (!costing.economically_justified) {
      await db
        .update(engineeringRequests)
        .set({ status: "rejected", lastError: "economic_not_justified", updatedAt: now })
        .where(eq(engineeringRequests.id, reqRow.id));

      return {
        ok: false,
        status: "rejected",
        tenantId: args.tenantId,
        requestId: reqRow.id,
        reason: "economic_not_justified",
      };
    }

    const compilerVersion = ENGINEERING_COMPILER_VERSION;
    const parametersHash = hashRecipe(recipeFinal);

    const existingMachine = await db.query.machines.findFirst({
      where: and(eq(machines.tenantId, args.tenantId), eq(machines.engineeringRequestId, reqRow.id)),
      orderBy: desc(machines.updatedAt),
    });

    const machineId = existingMachine
      ? existingMachine.id
      : (
          await db
            .insert(machines)
            .values({
              tenantId: args.tenantId,
              engineeringRequestId: reqRow.id,
              projectId: reqRow.projectId ?? null,
              machineFamily,
              compilerVersion,
              status: "compiled",
              metadata: { source: "engineering_kernel", compiler_version: compilerVersion },
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: machines.id })
        )[0].id;

    const latest = await db.query.machineRevisions.findFirst({
      where: eq(machineRevisions.machineId, machineId),
      orderBy: desc(machineRevisions.revision),
    });

    if (latest && String(latest.parametersHash) === parametersHash) {
      await db
        .update(engineeringRequests)
        .set({ status: "compiled", lastError: null, updatedAt: now })
        .where(eq(engineeringRequests.id, reqRow.id));

      try {
        await ensureRevisionPreviewArtifacts({ tenantId: args.tenantId, revisionId: latest.id });
      } catch {
        // Preview generation is best-effort.
      }
      return {
        ok: true,
        status: "compiled",
        tenantId: args.tenantId,
        requestId: reqRow.id,
        machineId,
        revisionId: latest.id,
        revision: latest.revision,
        machineFamily,
        parametersHash,
        recipe: (latest.recipe as any) ?? {},
        reusedRevision: true,
      };
    }

    const nextRevision = latest ? Number(latest.revision) + 1 : 1;
    const [revRow] = await db
      .insert(machineRevisions)
      .values({
        machineId,
        revision: nextRevision,
        parametersHash,
        generatorVersion: ENGINEERING_GENERATOR_VERSION,
        recipe: recipeFinal,
        createdAt: now,
      })
      .returning({ id: machineRevisions.id });

    await db
      .update(engineeringRequests)
      .set({ status: "compiled", lastError: null, updatedAt: now })
      .where(eq(engineeringRequests.id, reqRow.id));

    await db.update(machines).set({ status: "compiled", updatedAt: now }).where(eq(machines.id, machineId));

    try {
      await ensureRevisionPreviewArtifacts({ tenantId: args.tenantId, revisionId: revRow.id });
    } catch {
      // Preview generation is best-effort.
    }
    return {
      ok: true,
      status: "compiled",
      tenantId: args.tenantId,
      requestId: reqRow.id,
      machineId,
      revisionId: revRow.id,
      revision: nextRevision,
      machineFamily,
      parametersHash,
      recipe: recipeFinal,
      reusedRevision: false,
    };
  } catch (err: any) {
    const message = String(err?.message || "compile_failed");
    await db
      .update(engineeringRequests)
      .set({ status: "failed", lastError: message, updatedAt: now })
      .where(eq(engineeringRequests.id, reqRow.id));

    return { ok: false, status: "failed", tenantId: args.tenantId, requestId: reqRow.id, reason: message };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function validateParameterPatch(patch: Record<string, unknown>) {
  const rules: Record<string, { min: number; max: number; round?: number }> = {
    throughput_tph: { min: 0.1, max: 250, round: 2 },
    skid_length_m: { min: 1.8, max: 24, round: 3 },
    skid_width_m: { min: 0.8, max: 8, round: 3 },
    skid_height_m: { min: 0.12, max: 2.5, round: 3 },
    module_spacing_m: { min: 0.05, max: 2.5, round: 3 },
    module_scale: { min: 0.4, max: 3, round: 3 },
  };

  const textKeys = new Set(["geology", "geography"]);

  const out: Record<string, unknown> = {};
  for (const [keyRaw, value] of Object.entries(patch || {})) {
    const key = String(keyRaw || "").trim();
    if (!key) continue;

    if (textKeys.has(key)) {
      const v = String(value ?? "").trim();
      if (!v) continue;
      out[key] = v.slice(0, 240);
      continue;
    }

    const rule = rules[key];
    if (!rule) continue;
    const n = coerceFiniteNumber(value);
    if (n == null) continue;
    const clamped = clamp(n, rule.min, rule.max);
    if (rule.round != null) {
      const p = Math.pow(10, rule.round);
      out[key] = Math.round(clamped * p) / p;
    } else {
      out[key] = clamped;
    }
  }

  return out;
}

export type RegenerateResult =
  | {
      ok: true;
      status: "compiled";
      tenantId: number;
      machineId: number;
      baseRevisionId: number;
      revisionId: number;
      revision: number;
      parametersHash: string;
      recipe: Record<string, unknown>;
      previewArtifacts: Array<{ kind: "glb" | "stl"; sha256: string | null }>;
    }
  | { ok: false; status: "failed"; reason: string };

export async function regenerateMachineRevision(args: {
  tenantId: number;
  baseRevisionId: number;
  parametersPatch: Record<string, unknown>;
  action?: Record<string, unknown>;
  user?: any | null;
}): Promise<RegenerateResult> {
  const now = new Date();
  const baseRows = await db
    .select({
      revisionId: machineRevisions.id,
      revision: machineRevisions.revision,
      recipe: machineRevisions.recipe,
      machineId: machines.id,
      machineFamily: machines.machineFamily,
    })
    .from(machineRevisions)
    .innerJoin(machines, eq(machineRevisions.machineId, machines.id))
    .where(and(eq(machineRevisions.id, args.baseRevisionId), eq(machines.tenantId, args.tenantId)));

  const base = baseRows[0];
  if (!base) return { ok: false, status: "failed", reason: "not_found" };

  const patch = validateParameterPatch(args.parametersPatch || {});
  if (Object.keys(patch).length === 0) {
    return { ok: false, status: "failed", reason: "no_valid_changes" };
  }

  const baseRecipe = (base.recipe ?? {}) as Record<string, unknown>;
  const baseParams =
    baseRecipe && typeof (baseRecipe as any).parameters === "object" && (baseRecipe as any).parameters
      ? ((baseRecipe as any).parameters as Record<string, unknown>)
      : {};

  const nextParams = { ...baseParams, ...patch };

  const baseMetadata =
    baseRecipe && typeof (baseRecipe as any).metadata === "object" && (baseRecipe as any).metadata ? (baseRecipe as any).metadata : {};

  const recipeNext: Record<string, unknown> = {
    ...baseRecipe,
    parameters: nextParams,
    metadata: {
      ...baseMetadata,
      regenerated_from_revision_id: args.baseRevisionId,
      regenerated_at: now.toISOString(),
    },
  };

  const latest = await db.query.machineRevisions.findFirst({
    where: eq(machineRevisions.machineId, base.machineId),
    orderBy: desc(machineRevisions.revision),
  });

  const nextRevision = latest ? Number(latest.revision) + 1 : Number(base.revision) + 1;
  const parametersHash = hashRecipe(recipeNext);

  const [revRow] = await db
    .insert(machineRevisions)
    .values({
      machineId: base.machineId,
      revision: nextRevision,
      parametersHash,
      generatorVersion: ENGINEERING_GENERATOR_VERSION,
      recipe: recipeNext,
      createdAt: now,
    })
    .returning({ id: machineRevisions.id });

  const userId = typeof args.user?.id === "number" ? args.user.id : null;
  const actionJson = {
    type: "regenerate",
    baseRevisionId: args.baseRevisionId,
    patch,
    ...(args.action ? { action: args.action } : {}),
    actor: userId ? { userId } : null,
  };

  await db.insert(machineEditActions).values({
    revisionId: revRow.id,
    action: actionJson as any,
    createdAt: now,
  });

  await db.update(machines).set({ status: "compiled", updatedAt: now }).where(eq(machines.id, base.machineId));

  let previews: Array<{ kind: "glb" | "stl"; sha256: string | null }> = [];
  try {
    const ensured = await ensureRevisionPreviewArtifacts({ tenantId: args.tenantId, revisionId: revRow.id, force: true });
    if (ensured.ok) {
      previews = ensured.items.map((p) => ({ kind: p.kind, sha256: p.sha256 ?? null }));
    }
  } catch {
    // ignore preview failures
  }

  return {
    ok: true,
    status: "compiled",
    tenantId: args.tenantId,
    machineId: base.machineId,
    baseRevisionId: args.baseRevisionId,
    revisionId: revRow.id,
    revision: nextRevision,
    parametersHash,
    recipe: recipeNext,
    previewArtifacts: previews,
  };
}
