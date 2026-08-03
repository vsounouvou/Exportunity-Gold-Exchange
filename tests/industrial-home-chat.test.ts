import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("Exportunity industrial home leads with the case-backed AI conversation", () => {
  const hub = readRepoFile(
    "client/src/pages/exportunity/IndustrialHubPage.tsx",
  );
  const assistant = readRepoFile(
    "client/src/components/exportunity/IndustrialAssistantChat.tsx",
  );
  const homeAssistantIndex = hub.indexOf(
    "<IndustrialAssistantChat language={locale} requester={user} />",
  );
  const homeStart = hub.indexOf('{view === "home" ? (');
  const publicDirectoryStart = hub.indexOf('{view !== "map"', homeStart);
  const homeMarkup = hub.slice(homeStart, publicDirectoryStart);
  const firstGenericSearchIndex = hub.indexOf(
    "placeholder={copy.searchPlaceholder}",
  );

  assert.match(
    hub,
    /import \{ IndustrialAssistantChat \} from "@\/components\/exportunity\/IndustrialAssistantChat";/,
  );
  assert.ok(homeAssistantIndex >= 0);
  assert.ok(homeStart >= 0);
  assert.ok(publicDirectoryStart > homeStart);
  assert.match(homeMarkup, /<IndustrialAssistantChat language=\{locale\} requester=\{user\} \/>/);
  assert.doesNotMatch(homeMarkup, /onSubmit=\{goSearch\}/);
  assert.doesNotMatch(homeMarkup, /placeholder=\{copy\.searchPlaceholder\}/);
  assert.ok(firstGenericSearchIndex > homeAssistantIndex);
  assert.match(assistant, /\/api\/industrial\/assistant\/intake-preview/);
  assert.match(assistant, /\/api\/industrial\/requirements/);
  assert.match(assistant, /Message Exportunity AI/);
  assert.match(assistant, /VoiceToTextButton/);
});
