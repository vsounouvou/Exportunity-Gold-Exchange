export function runOperationsStructureContracts(appSource, entryFor, verify, assert) {
  let passed = 0;
  const valid = verify(appSource, entryFor);
  assert(valid.machineryOperationsPreserved && valid.checks >= 15, "current route and Machinery operations remain protected");
  passed++;
  const mutateEntry = (from, to) => appSource.replace(/function AiTeamEntryRoute\(\) \{[\s\S]*?^\}/m, (entry) => entry.replace(from, to));
  const mutations = [
    ["remove login guard", appSource.replace("if (isAuthenticated && !isGuest && !user?.mustChangePassword && destination)", "if (destination)")],
    ["remove protected fallback", appSource.replace("return <ProtectedRoute><TenantOperationsCenterRoute /></ProtectedRoute>;", "return <TenantOperationsCenterRoute />;")],
    ["bypass dedicated operations renderer", appSource.replace("return <ProtectedRoute><TenantOperationsCenterRoute /></ProtectedRoute>;", "return <ProtectedRoute><AITeamHubPage /></ProtectedRoute>;")],
    ["render another tenant interface for Exportunity", appSource.replace('if (tenant.key === "exportunity") return <ExportunityOperationsCenterPage />;', 'if (tenant.key === "exportunity") return <AITeamHubPage />;')],
    ["discard company query", mutateEntry("window.location.pathname + window.location.search + window.location.hash", "window.location.pathname")],
    ["duplicate the canonical route", appSource.replace('<Route path="/ai-team" component={AiTeamEntryRoute} />', '<Route path="/ai-team" component={AiTeamEntryRoute} /><Route path="/ai-team" component={AiTeamEntryRoute} />')],
    ["remove the canonical entry", appSource.replace('<Route path="/ai-team" component={AiTeamEntryRoute} />', '<Route path="/ai-team" component={TenantOperationsCenterRoute} />')],
  ];
  for (const [name, source] of mutations) {
    assert(source !== appSource, "negative fixture applied: " + name);
    let rejected = false;
    try { verify(source, entryFor); } catch { rejected = true; }
    assert(rejected, "structural guard rejects: " + name);
    passed++;
  }
  let redirectedCompanyRejected = false;
  try { verify(appSource, () => "/pro/tassi"); } catch { redirectedCompanyRejected = true; }
  assert(redirectedCompanyRejected, "Machinery company context cannot be redirected away");
  passed++;
  return passed;
}
