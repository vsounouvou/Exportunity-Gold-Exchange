export function runRoomSlugContracts(resolve, assert) {
  let checks = 0;
  const equal = (actual, expected, name) => {
    assert(JSON.stringify(actual) === JSON.stringify(expected), name);
    checks++;
  };
  const aliases = {
    "general-operations": "ops", operations: "ops", ops: "ops", support: "support",
    wallet: "wallet", procurement: "procurement", orders: "procurement", sales: "sales",
    clients: "sales", compliance: "compliance", accounting: "accounting", delivery: "delivery",
    team: "team", "team-room": "team", investor: "investor", production: "production", legal: "legal",
  };
  for (const [slug, key] of Object.entries(aliases)) {
    equal(resolve(slug), key, "existing alias " + slug);
    equal(resolve("  " + slug.toUpperCase() + "  "), key, "normalized alias " + slug);
  }
  for (const slug of ["", "missing-room", "__proto__", "constructor", "toString", "hasOwnProperty", "prototype", "ops/../sales", "%6f%70%73", "operations?company=machinery"]) {
    equal(resolve(slug), null, "unknown slug is rejected: " + slug);
  }
  return checks;
}

export function runRoomEntryContracts(render, assert) {
  let checks = 0;
  const equal = (actual, expected, name) => {
    assert(JSON.stringify(actual) === JSON.stringify(expected), name);
    checks++;
  };
  const base = { authenticated: true, guest: false, search: "?company=machinery&conversation=fixture-17", hash: "#message-fixture" };
  for (const route of ["/pro/operations/:roomKey", "/pro/threads/:roomKey", "/app/chats/:roomKey", "/app/room/:roomKey", "/pro/room/:roomKey"]) {
    const unknown = render({ ...base, route, slug: "missing-room" });
    equal(unknown.view, "unknown", "unknown room is visible on " + route);
    equal(unknown.mounts, [], "unknown room cannot mount queries or mutations on " + route);
    equal(unknown.href, "/pro/chats" + base.search + base.hash, "explicit room picker preserves company and conversation on " + route);
    const known = render({ ...base, route, slug: "team-room" });
    equal(known.view, "room", "team room still opens on " + route);
    equal(known.mounts, ["team"], "only the requested team room is mounted on " + route);
    equal(known.key, "team", "room change creates a distinct component instance on " + route);
  }
  for (const slug of ["__proto__", "constructor", "toString", "", "operations?company=another"]) {
    const result = render({ ...base, route: "/pro/operations/:roomKey", slug });
    equal(result.view, "unknown", "malformed room is rejected: " + slug);
    equal(result.mounts, [], "malformed room never provisions operations: " + slug);
  }
  for (const slug of ["ops", "general-operations", "operations"]) {
    equal(render({ ...base, route: "/pro/operations/:roomKey", slug }).mounts, ["ops"], "operations alias retained: " + slug);
  }
  for (const session of [{ authenticated: false, guest: false }, { authenticated: true, guest: true }]) {
    for (const slug of ["team-room", "missing-room"]) {
      const result = render({ ...base, ...session, route: "/pro/operations/:roomKey", slug });
      equal(result.view, "login", "existing login guard precedes room mounting");
      equal(result.mounts, [], "anonymous/guest never mounts room services");
      const next = "/pro/operations/" + slug + base.search + base.hash;
      equal(result.to, "/pro/login?next=" + encodeURIComponent(next), "login return preserves requested room, company, conversation and message");
    }
  }
  return checks;
}
