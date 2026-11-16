
export async function runContracts(routing, conversations, assert) {
  let passed = 0;
  const check = (name, actual, expected) => { assert(JSON.stringify(actual) === JSON.stringify(expected), name); passed++; };
  const equal = (name, run, expected) => check(name, run(), expected);
  equal("ordinary employee retains the existing workspace", () => routing.workspaceDefault("exportunity", "employee", "", "", "/pro"), "/pro");
  equal("administrator enters Tassi", () => routing.workspaceDefault("exportunity", "admin", "", "", "/ai-team"), "/pro/tassi");
  equal("existing admin capability enters Tassi", () => routing.workspaceDefault("exportunity", "", "admin:*", "", "/ai-team"), "/pro/tassi");
  equal("chairman assistant enters Tassi", () => routing.workspaceDefault("exportunity", "chairman_assistant", "", "", "/ai-team"), "/pro/tassi");
  equal("operator keeps its current workspace", () => routing.workspaceDefault("exportunity", "operator", "", "", "/ai-team"), "/ai-team");
  equal("tenant admin label alone is not a chairman capability", () => routing.workspaceDefault("exportunity", "tenant_admin", "", "", "/ai-team"), "/ai-team");
  equal("chairman mode alone does not invent an account role", () => routing.workspaceDefault("exportunity", "buyer", "", "chairman", "/ai-team"), "/ai-team");

  equal("dashboard visibility does not grant Tassi access", () => routing.workspaceDefault("exportunity", "", "view_admin_dashboard", "", "/ai-team"), "/ai-team");
  equal("buyer keeps its original entry", () => routing.workspaceDefault("exportunity", "buyer", "", "", "/pro/operations"), "/pro/operations");
  equal("other tenant keeps its original entry", () => routing.workspaceDefault("bdo", "admin", "*", "", "/dashboard"), "/dashboard");
  equal("explicit task deep link wins", () => routing.workspaceEntry("/admin?next=%2Ftasks%3Fid%3D42%23proof", "/pro/tassi"), "/tasks?id=42#proof");
  equal("password rotation wins over next", () => routing.workspaceEntry("/admin?next=%2Ftasks", "/pro/tassi", true), "/admin/password");
  equal("default entry without next", () => routing.workspaceEntry("/admin", "/pro/tassi"), "/pro/tassi");
  equal("employee welcome link retains its protected workspace", () => routing.workspaceOperationsEntry("/ai-team", "exportunity", "employee"), null);
  equal("dashboard-only welcome link retains its workspace", () => routing.workspaceOperationsEntry("/ai-team", "exportunity", "", "view_admin_dashboard"), null);
  equal("explicit conversation deep link is preserved", () => routing.workspaceOperationsEntry("/ai-team?conversation=fixture-42", "exportunity", "employee"), null);
  equal("verified Machinery company context is preserved", () => routing.workspaceOperationsEntry("/ai-team?company=machinery", "exportunity", "admin"), null);
  equal("explicit diagnostics link is preserved", () => routing.workspaceOperationsEntry("/ai-team?build=1", "exportunity", "admin"), null);
  equal("other tenant keeps its operations page", () => routing.workspaceOperationsEntry("/ai-team", "bdo", "admin"), null);
  equal("ordinary non-staff user gets no Tassi default", () => routing.workspaceOperationsEntry("/ai-team", "exportunity", "buyer"), null);
  equal("unrelated query keeps default", () => routing.workspaceEntry("/admin?build=1", "/pro/tassi"), "/pro/tassi");
  equal("return through login round trips", () => routing.workspaceEntry(routing.workspaceLoginUrl("/ai-team?view=chat#result", "/admin")), "/ai-team?view=chat#result");
  for (const value of ["https://outside.invalid", "//outside.invalid", "/\\outside.invalid", "/%2foutside.invalid", "/%5coutside.invalid", "/%00outside", "/%2e%2e/admin", "/admin", "/admin/login?next=/tasks", "/auth", "/pro/login/", "/login", "/%zz"]) {
    equal("unsafe or looping next rejected: " + JSON.stringify(value), () => routing.normalizeWorkspaceNext(value), null);
  }
  equal("bad encoded query falls back", () => routing.workspaceEntry("/admin?next=%zz"), "/pro/tassi");
  equal("first next parameter is authoritative", () => routing.workspaceEntry("/admin?next=https%3A%2F%2Foutside.invalid&next=%2Ftasks"), "/pro/tassi");
  check("cache partitioned by tenant", conversations.conversationQueryKey(2, 8, 7), ["tassi-conversation", 2, 8, 7]);
  assert(JSON.stringify(conversations.conversationQueryKey(2, 8)) !== JSON.stringify(conversations.conversationQueryKey(2, 9)), "cache partitioned by user"); passed++;
  for (const id of [0, -1, 1.5, NaN]) {
    let rejected = false;
    try { conversations.conversationQueryKey(id, 8); } catch { rejected = true; }
    assert(rejected, "invalid tenant identity rejected"); passed++;
  }
  const requests = [];
  const api = conversations.createTassiConversationApi(async (url, options) => {
    requests.push({ url, ...options });
    return { threads: [], messages: [] };
  });
  await api.list();
  await api.messages(42);
  check("opening/refreshing only reads", requests.map((r) => r.method), ["GET", "GET"]);
  check("read paths never provision an agent/thread", requests.map((r) => r.url), ["/api/assistant/threads?limit=50", "/api/assistant/thread/42/messages?limit=200"]);
  await api.send("  Fixture request  ", 42);
  check("explicit send uses existing thread", JSON.parse(requests[2].body), { content: "Fixture request", threadId: 42 });
  check("explicit send uses established service", [requests[2].url, requests[2].method], ["/api/assistant/message", "POST"]);
  await api.send("First fixture message");
  check("first message leaves thread creation to authorized server", JSON.parse(requests[3].body), { content: "First fixture message" });
  const before = requests.length;
  for (const run of [() => api.messages(0), () => api.send(""), () => api.send("fixture", -1)]) {
    let rejected = false;
    try { await run(); } catch { rejected = true; }
    assert(rejected, "invalid request blocked before transport"); passed++;
  }
  check("invalid requests have no transport side effects", requests.length, before);
  let deniedCalls = 0;
  const denied = conversations.createTassiConversationApi(async () => { deniedCalls++; throw new Error("403: Chairman access required"); });
  let rejection = "";
  try { await denied.list(); } catch (error) { rejection = error.message; }
  check("server access denial remains visible", rejection, "403: Chairman access required");
  check("access denial is not retried/provisioned", deniedCalls, 1);
  return passed;
}
