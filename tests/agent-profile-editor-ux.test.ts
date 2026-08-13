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
  assert.match(profile, /isGovernedRoleSeat/);
  assert.match(profile, /Agents OS > Workforce/);
  assert.match(profile, /Workforce employees remain partially autonomous with human approvals/);
  assert.match(photo, /Importer une photo/);
  assert.match(photo, /Verrouiller la photo/);
});

test("agent profile editor remains usable on compact screens", () => {
  const profile = readRepoFile("client/src/components/AgentProfileDialog.tsx");

  assert.match(profile, /w-\[calc\(100vw-2rem\)\]/);
  assert.match(profile, /grid-cols-1 gap-4 sm:grid-cols-2/);
  assert.match(profile, /grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-6/);
  assert.match(profile, /sticky bottom-0 z-10 flex flex-col-reverse/);
  assert.match(profile, /w-full bg-amber-500 text-slate-950 hover:bg-amber-400 sm:w-auto/);
  assert.doesNotMatch(profile, /â€”|Â·/);
});

test("agent portrait defaults reflect the global Exportunity brand", () => {
  const editor = readRepoFile("client/src/components/AgentPhotoEditorCard.tsx");
  const route = readRepoFile("server/routes/agent-photos.ts");
  for (const source of [editor, route]) {
    assert.match(source, /global B2B trade, sourcing, export, supply-chain, and market-expansion network/);
    assert.match(source, /premium Afro-global business aesthetic/);
    assert.doesNotMatch(source, /African industrial company team member/);
  }
});

test("governed workforce profiles cannot bypass manager or lifecycle controls", () => {
  const routes = readRepoFile("server/routes.ts");

  assert.match(routes, /GOVERNED_WORKFORCE_LIFECYCLE_REQUIRED/);
  assert.match(routes, /GOVERNED_WORKFORCE_MANAGER_REQUIRED/);
  assert.match(routes, /GOVERNED_WORKFORCE_COMPANY_REQUIRED/);
  assert.match(routes, /updateData\.status = currentAgent\.status/);
  assert.match(routes, /updateData\.isVisible = currentAgent\.isVisible/);
});

test("Agents OS tabs use the canonical route and legacy links preserve tab state", () => {
  const app = readRepoFile("client/src/App.tsx");
  const agentsOs = readRepoFile("client/src/pages/AdminAgentsOsPage.tsx");
  const industrialNetwork = readRepoFile("client/src/pages/AdminIndustrialNetworkPage.tsx");

  assert.match(app, /function AgentsOsAliasRedirect\(\)/);
  assert.match(app, /String\(window\.location\.search \|\| ""\)/);
  assert.match(app, /<Redirect to=\{`\/agents-os\$\{search\}`\} \/>/);
  assert.match(agentsOs, /setLocation\(`\/agents-os\?tab=\$\{safe\}`/);
  assert.match(agentsOs, /<TabsTrigger value="workforce">/);
  assert.match(agentsOs, /<TabsContent value="workforce"/);
  assert.doesNotMatch(agentsOs, /setLocation\(`\/admin\/agents-os\?tab=/);
  assert.match(industrialNetwork, /href="\/agents-os\?tab=workforce"/);
});
