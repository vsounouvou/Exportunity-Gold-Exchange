import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("agent management exposes a localized identity and face workflow", () => {
  const page = readRepoFile("client/src/pages/OperationsAgentsPage.tsx");
  const profile = readRepoFile("client/src/components/AgentProfileDialog.tsx");
  const photo = readRepoFile("client/src/components/AgentPhotoEditorCard.tsx");

  for (const source of [page, profile, photo]) {
    assert.match(source, /useLocale/);
  }

  assert.match(page, /Modifier l'identité et le visage/);
  assert.match(page, /Créer et configurer/);
  assert.match(profile, /Responsable hiérarchique/);
  assert.match(profile, /Responsable de département/);
  assert.match(profile, /Niveau d'autonomie/);
  assert.match(profile, /Enregistrer les modifications/);
  assert.match(photo, /Importer une photo/);
  assert.match(photo, /Verrouiller la photo/);
});

test("agent profile editor remains usable on compact screens", () => {
  const profile = readRepoFile("client/src/components/AgentProfileDialog.tsx");

  assert.match(profile, /w-\[calc\(100vw-2rem\)\]/);
  assert.match(profile, /grid-cols-1 gap-4 sm:grid-cols-2/);
  assert.match(profile, /sticky bottom-0 z-10/);
  assert.match(profile, /bg-amber-500 text-slate-950 hover:bg-amber-400/);
  assert.doesNotMatch(profile, /â€”|Â·/);
});
