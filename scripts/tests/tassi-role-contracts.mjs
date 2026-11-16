export function createFixtureGuard(guardJavaScript, fixture) {
  const token = "fixture-session";
  const user = Object.freeze({
    id: 1042,
    role: fixture.role || "employee",
    roles: Object.freeze([...(fixture.roles || [])]),
    permissions: Object.freeze([...(fixture.permissions || [])]),
    currentMode: fixture.currentMode || "employee",
  });
  const db = {
    query: {
      eceSessions: { findFirst: async ({ where }) => fixture.invalidSession || where.value !== token
        ? null : { userId: user.id, expiresAt: "2050-01-01T00:00:00.000Z" } },
      eceUsers: { findFirst: async () => user },
    },
  };
  const factory = new Function("db", "eceSessions", "eceUsers", "eq", "resolveQuickSession",
    guardJavaScript + "\nreturn resolveChairmanConsoleActor;");
  const guard = factory(db, { token: "token" }, { id: "id" }, (field, value) => ({ field, value }), async () => null);
  const request = {
    tenant: { id: fixture.invalidTenant ? 0 : 2 },
    headers: { authorization: "Bearer " + token, ...(fixture.noOverride ? {} : { "x-chairman-admin-override": "1" }) },
    query: {},
  };
  return { user, run: () => guard(request, { allowAdminOverride: true }) };
}

export async function runTassiRoleContracts(routing, makeGuard, assert) {
  const fallback = "/ai-team?company=machinery";
  const fixtures = [
    { name: "ordinary Machinery employee", role: "employee", roles: ["employee"], status: 403, destination: fallback },
    { name: "non-member without a privileged role", role: "buyer", roles: ["buyer"], currentMode: "buyer", status: 403, destination: fallback },
    { name: "operator", role: "operator", roles: ["operator"], status: 403, destination: fallback },
    { name: "dashboard viewer", roles: ["employee"], permissions: ["view_admin_dashboard"], status: 403, destination: fallback },
    { name: "tenant-admin label alone", roles: ["tenant_admin"], status: 403, destination: fallback },
    { name: "existing administrator", role: "admin", roles: ["admin"], status: 200, destination: "/pro/tassi" },
    { name: "existing chairman assistant", role: "chairman_assistant", roles: ["chairman_assistant"], status: 200, destination: "/pro/tassi" },
    { name: "existing administrative permission", roles: ["employee"], permissions: ["admin:*"], status: 200, destination: "/pro/tassi" },
    { name: "existing admin mode", roles: ["employee"], currentMode: "admin", status: 200, destination: "/pro/tassi" },
  ];
  let checks = 0;
  for (const fixture of fixtures) {
    const { user, run } = makeGuard(fixture);
    const before = JSON.stringify(user);
    const result = await run();
    assert((result.ok ? 200 : result.status) === fixture.status, "real server guard result: " + fixture.name); checks++;
    const destination = routing.workspaceDefault("exportunity", user.roles.join("|"), user.permissions.join("|"), user.currentMode, fallback);
    assert(destination === fixture.destination, "entry agrees with API authorization: " + fixture.name); checks++;
    assert(JSON.stringify(user) === before, "no fixture account authority changed: " + fixture.name); checks++;
  }
  for (const fixture of [
    { name: "admin without override request", role: "admin", roles: ["admin"], noOverride: true, expected: 403 },
    { name: "invalid tenant", invalidTenant: true, expected: 401 },
    { name: "invalid session", invalidSession: true, expected: 401 },
  ]) {
    const result = await makeGuard(fixture).run();
    assert(!result.ok && result.status === fixture.expected, "existing defensive guard: " + fixture.name); checks++;
  }
  assert(routing.workspaceOperationsEntry(fallback, "exportunity", "employee") === null, "Machinery context is retained"); checks++;
  assert(routing.workspaceOperationsEntry("/ai-team?conversation=fixture-42", "exportunity", "admin") === null, "conversation link is retained"); checks++;
  return { roleFixtures: fixtures.length, checks };
}
