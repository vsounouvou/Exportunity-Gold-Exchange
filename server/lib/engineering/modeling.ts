import crypto from "crypto";
import { Document, NodeIO } from "@gltf-transform/core";

export type EngineeringBox = {
  id: string;
  label: string;
  kind: "skid" | "module";
  size: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  color: [number, number, number];
};

type RecipeLike = Record<string, unknown>;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function getRecipeParams(recipe: RecipeLike): Record<string, unknown> {
  const params = (recipe as any)?.parameters;
  if (params && typeof params === "object" && !Array.isArray(params)) return params as Record<string, unknown>;
  return {};
}

function getRecipeModules(recipe: RecipeLike): Array<Record<string, unknown>> {
  const raw = (recipe as any)?.modules;
  if (Array.isArray(raw)) return raw.filter((m) => m && typeof m === "object") as Array<Record<string, unknown>>;
  return [];
}

function moduleDims(moduleType: string, throughputTph: number) {
  const scale = clamp(Math.sqrt(Math.max(0.1, throughputTph)), 0.75, 2.2);

  switch (moduleType) {
    case "hopper":
      return { x: 1.6 * scale, y: 1.4 * scale, z: 1.4 * scale };
    case "feeder":
      return { x: 1.3 * scale, y: 0.7 * scale, z: 1.0 * scale };
    case "classifier":
      return { x: 1.8 * scale, y: 1.5 * scale, z: 1.2 * scale };
    case "concentrator":
      return { x: 1.9 * scale, y: 1.4 * scale, z: 1.2 * scale };
    case "dust_control":
      return { x: 1.3 * scale, y: 1.8 * scale, z: 1.0 * scale };
    case "finishing":
      return { x: 1.6 * scale, y: 0.9 * scale, z: 0.9 * scale };
    case "scale":
      return { x: 0.6 * scale, y: 0.6 * scale, z: 0.6 * scale };
    case "security":
      return { x: 0.8 * scale, y: 0.8 * scale, z: 0.8 * scale };
    case "crusher":
      return { x: 2.2 * scale, y: 1.7 * scale, z: 1.6 * scale };
    case "screen":
      return { x: 2.0 * scale, y: 1.2 * scale, z: 1.5 * scale };
    case "conveyor":
      return { x: 2.4 * scale, y: 0.6 * scale, z: 0.8 * scale };
    case "power":
      return { x: 1.6 * scale, y: 1.2 * scale, z: 1.0 * scale };
    case "frame":
      return { x: 3.0 * scale, y: 0.7 * scale, z: 1.5 * scale };
    default:
      return { x: 1.2 * scale, y: 1.0 * scale, z: 1.0 * scale };
  }
}

function moduleColor(moduleType: string): [number, number, number] {
  switch (moduleType) {
    case "hopper":
      return [0.95, 0.70, 0.15];
    case "feeder":
      return [0.20, 0.70, 0.95];
    case "classifier":
      return [0.55, 0.35, 0.95];
    case "concentrator":
      return [0.25, 0.85, 0.45];
    case "dust_control":
      return [0.85, 0.30, 0.30];
    case "crusher":
      return [0.95, 0.45, 0.20];
    case "screen":
      return [0.35, 0.85, 0.95];
    case "conveyor":
      return [0.85, 0.85, 0.85];
    case "power":
      return [0.40, 0.90, 0.55];
    default:
      return [0.70, 0.70, 0.75];
  }
}

export function recipeToEngineeringBoxes(recipe: RecipeLike): EngineeringBox[] {
  const params = getRecipeParams(recipe);
  const throughputTph = toFiniteNumber(params.throughput_tph) ?? 1;

  const modules = getRecipeModules(recipe);
  const moduleSpacingM = clamp(toFiniteNumber(params.module_spacing_m) ?? 0.4, 0.05, 2.5);
  const moduleScale = clamp(toFiniteNumber(params.module_scale) ?? 1, 0.4, 3);

  const moduleBoxes = modules.map((mod, idx) => {
    const id = String((mod as any)?.id || `module_${idx + 1}`).trim() || `module_${idx + 1}`;
    const type = String((mod as any)?.type || "module").trim().toLowerCase() || "module";
    const dims = moduleDims(type, throughputTph);
    return {
      id,
      label: id,
      kind: "module" as const,
      size: { x: dims.x * moduleScale, y: dims.y * moduleScale, z: dims.z * moduleScale },
      position: { x: 0, y: 0, z: 0 },
      color: moduleColor(type),
    };
  });

  const totalModuleLength =
    moduleBoxes.reduce((sum, box) => sum + box.size.x, 0) + Math.max(0, moduleBoxes.length - 1) * moduleSpacingM;
  const inferredSkidLength = clamp(totalModuleLength + 1.2, 2.5, 18);
  const inferredSkidWidth = clamp(
    Math.max(1.2, ...moduleBoxes.map((b) => b.size.z)) + 0.8,
    1.0,
    6,
  );

  const skidLengthM = clamp(toFiniteNumber(params.skid_length_m) ?? inferredSkidLength, 1.8, 24);
  const skidWidthM = clamp(toFiniteNumber(params.skid_width_m) ?? inferredSkidWidth, 0.8, 8);
  const skidHeightM = clamp(toFiniteNumber(params.skid_height_m) ?? 0.35, 0.12, 2.5);

  const skid: EngineeringBox = {
    id: "skid_frame",
    label: "Skid frame",
    kind: "skid",
    size: { x: skidLengthM, y: skidHeightM, z: skidWidthM },
    position: { x: 0, y: skidHeightM / 2, z: 0 },
    color: [0.30, 0.34, 0.38],
  };

  const layoutStartX = -totalModuleLength / 2;
  let cursorX = layoutStartX;
  for (const box of moduleBoxes) {
    cursorX += box.size.x / 2;
    box.position = { x: cursorX, y: skidHeightM + box.size.y / 2, z: 0 };
    cursorX += box.size.x / 2 + moduleSpacingM;
  }

  return [skid, ...moduleBoxes];
}

function boxGeometry(size: { x: number; y: number; z: number }) {
  const hx = size.x / 2;
  const hy = size.y / 2;
  const hz = size.z / 2;

  // 24 vertices (4 per face) with per-face normals.
  const positions = new Float32Array([
    // +Z (front)
    -hx, -hy, hz, hx, -hy, hz, hx, hy, hz, -hx, hy, hz,
    // -Z (back)
    hx, -hy, -hz, -hx, -hy, -hz, -hx, hy, -hz, hx, hy, -hz,
    // +Y (top)
    -hx, hy, hz, hx, hy, hz, hx, hy, -hz, -hx, hy, -hz,
    // -Y (bottom)
    -hx, -hy, -hz, hx, -hy, -hz, hx, -hy, hz, -hx, -hy, hz,
    // +X (right)
    hx, -hy, hz, hx, -hy, -hz, hx, hy, -hz, hx, hy, hz,
    // -X (left)
    -hx, -hy, -hz, -hx, -hy, hz, -hx, hy, hz, -hx, hy, -hz,
  ]);

  const normals = new Float32Array([
    // +Z
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    // -Z
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    // +Y
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    // -Y
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    // +X
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    // -X
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, // front
    4, 5, 6, 4, 6, 7, // back
    8, 9, 10, 8, 10, 11, // top
    12, 13, 14, 12, 14, 15, // bottom
    16, 17, 18, 16, 18, 19, // right
    20, 21, 22, 20, 22, 23, // left
  ]);

  return { positions, normals, indices };
}

export async function buildGlbFromEngineeringBoxes(boxes: EngineeringBox[]) {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene("scene");
  document.getRoot().setDefaultScene(scene);

  for (const box of boxes) {
    const geom = boxGeometry(box.size);
    const positionAccessor = document
      .createAccessor(`${box.id}_pos`)
      .setType("VEC3")
      .setArray(geom.positions)
      .setBuffer(buffer);
    const normalAccessor = document
      .createAccessor(`${box.id}_nrm`)
      .setType("VEC3")
      .setArray(geom.normals)
      .setBuffer(buffer);
    const indexAccessor = document
      .createAccessor(`${box.id}_idx`)
      .setType("SCALAR")
      .setArray(geom.indices)
      .setBuffer(buffer);

    const material = document
      .createMaterial(`mat_${box.id}`)
      .setBaseColorFactor([box.color[0], box.color[1], box.color[2], 1])
      .setMetallicFactor(0.15)
      .setRoughnessFactor(0.85);

    const prim = document
      .createPrimitive()
      .setAttribute("POSITION", positionAccessor)
      .setAttribute("NORMAL", normalAccessor)
      .setIndices(indexAccessor)
      .setMaterial(material);

    const mesh = document.createMesh(box.id).addPrimitive(prim);
    const node = document
      .createNode(box.id)
      .setMesh(mesh)
      .setTranslation([box.position.x, box.position.y, box.position.z]);

    scene.addChild(node);
  }

  const io = new NodeIO();
  const bytes = await io.writeBinary(document);
  return Buffer.from(bytes);
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0";
  const s = n.toFixed(6);
  return s.replace(/\.?0+$/, "");
}

function normalOfTriangle(a: number[], b: number[], c: number[]) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const nx = ab[1] * ac[2] - ab[2] * ac[1];
  const ny = ab[2] * ac[0] - ab[0] * ac[2];
  const nz = ab[0] * ac[1] - ab[1] * ac[0];
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function pushFacet(lines: string[], a: number[], b: number[], c: number[]) {
  const n = normalOfTriangle(a, b, c);
  lines.push(`facet normal ${fmt(n[0])} ${fmt(n[1])} ${fmt(n[2])}`);
  lines.push(" outer loop");
  lines.push(`  vertex ${fmt(a[0])} ${fmt(a[1])} ${fmt(a[2])}`);
  lines.push(`  vertex ${fmt(b[0])} ${fmt(b[1])} ${fmt(b[2])}`);
  lines.push(`  vertex ${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])}`);
  lines.push(" endloop");
  lines.push("endfacet");
}

export function buildStlFromEngineeringBoxes(boxes: EngineeringBox[], opts?: { solidName?: string }) {
  const solid = opts?.solidName?.trim() || "machine_preview";
  const lines: string[] = [`solid ${solid}`];

  for (const box of boxes) {
    const cx = box.position.x;
    const cy = box.position.y;
    const cz = box.position.z;
    const hx = box.size.x / 2;
    const hy = box.size.y / 2;
    const hz = box.size.z / 2;

    const p000 = [cx - hx, cy - hy, cz - hz];
    const p001 = [cx - hx, cy - hy, cz + hz];
    const p010 = [cx - hx, cy + hy, cz - hz];
    const p011 = [cx - hx, cy + hy, cz + hz];
    const p100 = [cx + hx, cy - hy, cz - hz];
    const p101 = [cx + hx, cy - hy, cz + hz];
    const p110 = [cx + hx, cy + hy, cz - hz];
    const p111 = [cx + hx, cy + hy, cz + hz];

    // +Z front
    pushFacet(lines, p001, p101, p111);
    pushFacet(lines, p001, p111, p011);
    // -Z back
    pushFacet(lines, p100, p000, p010);
    pushFacet(lines, p100, p010, p110);
    // +Y top
    pushFacet(lines, p011, p111, p110);
    pushFacet(lines, p011, p110, p010);
    // -Y bottom
    pushFacet(lines, p000, p100, p101);
    pushFacet(lines, p000, p101, p001);
    // +X right
    pushFacet(lines, p101, p100, p110);
    pushFacet(lines, p101, p110, p111);
    // -X left
    pushFacet(lines, p000, p001, p011);
    pushFacet(lines, p000, p011, p010);
  }

  lines.push(`endsolid ${solid}`);
  lines.push("");
  return lines.join("\n");
}

export function sha256Hex(data: Buffer | string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
