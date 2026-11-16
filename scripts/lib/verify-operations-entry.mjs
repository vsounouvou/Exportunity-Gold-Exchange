function functionBody(source, name) {
  const match = source.match(new RegExp("^function " + name + "\\([^\\n]*\\)\\s*\\{([\\s\\S]*?)^\\}", "m"));
  if (!match) throw new Error("Missing operations entry function: " + name);
  return match[1];
}

// Follow the route boundary and its protected fallback instead of matching
// unrelated components later in App.tsx.
export function verifyOperationsEntry(appSource, entryFor) {
  let checks = 0;
  const require = (condition, message) => {
    if (!condition) throw new Error(message);
    checks++;
  };
  const routes = appSource.match(/<Route\s+path="\/ai-team"\s+component=\{AiTeamEntryRoute\}\s*\/>/g) || [];
  require(routes.length === 1, "/ai-team must have one canonical AiTeamEntryRoute");
  const entry = functionBody(appSource, "AiTeamEntryRoute");
  const center = functionBody(appSource, "TenantOperationsCenterRoute");
  require(/const \{ isAuthenticated, isGuest, user \} = useSession\(\)/.test(entry), "Operations entry must use the existing session");
  require(/const \{ tenant \} = useTenant\(\)/.test(entry), "Operations entry must use the existing tenant");
  require(/window\.location\.pathname \+ window\.location\.search \+ window\.location\.hash/.test(entry), "Operations entry must retain company, conversation and diagnostic parameters");
  require(/workspaceOperationsEntry\(requested, tenant\.key, \(user\?\.roles \|\| \[\]\)\.join\("\|"\), \(user\?\.permissions \|\| \[\]\)\.join\("\|"\), String\(user\?\.currentMode \|\| ""\)\)/.test(entry), "Tassi entry must be derived from the current tenant and existing user roles");
  require(/if \(isAuthenticated && !isGuest && !user\?\.mustChangePassword && destination\)\s*\{\s*return <Redirect to=\{destination\} \/>;\s*\}/.test(entry), "Tassi redirect must preserve authentication, guest and password guards");
  require(/return <ProtectedRoute><TenantOperationsCenterRoute \/><\/ProtectedRoute>;\s*$/.test(entry), "Explicit operations URLs must retain the protected operations renderer");
  require(/if \(tenant\.key === "exportunity"\) return <ExportunityOperationsCenterPage \/>;/.test(center), "Exportunity must retain its dedicated operations interface");
  require(/return <AITeamHubPage \/>;\s*$/.test(center), "Other tenants must retain their existing operations renderer");
  const cases = [
    ["/ai-team", "exportunity", "employee", "", "", "/pro/tassi"],
    ["/ai-team?company=machinery", "exportunity", "admin", "", "", null],
    ["/ai-team?conversation=fixture-42", "exportunity", "admin", "", "", null],
    ["/ai-team?build=1", "exportunity", "admin", "", "", null],
    ["/ai-team", "bdo", "admin", "*", "", null],
    ["/ai-team", "exportunity", "buyer", "", "", null],
  ];
  for (const [location, tenant, roles, permissions, mode, expected] of cases) {
    require(entryFor(location, tenant, roles, permissions, mode) === expected, "Operations entry policy regression for " + location + " / " + tenant + " / " + roles);
  }
  return { checks, machineryOperationsPreserved: true };
}
