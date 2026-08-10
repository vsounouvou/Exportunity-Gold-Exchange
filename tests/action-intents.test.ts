import test from "node:test";
import assert from "node:assert/strict";
import {
  dispatchAgentActionIntents,
  extractAgentActionIntents,
  renderActionDispatchFeedback,
  stripAgentActionMarkers,
} from "../server/lib/actions/agentActionIntents";

test("extractAgentActionIntents detects heuristic email intent", () => {
  const intents = extractAgentActionIntents(
    "Send email to ops@example.com subject: Weekly update body: Please share status.",
  );
  assert.equal(intents.length, 1);
  assert.equal(intents[0]?.actionType, "SEND_EMAIL");
  assert.deepEqual(intents[0]?.payload?.to, ["ops@example.com"]);
});

test("extractAgentActionIntents parses structured action blocks", () => {
  const intents = extractAgentActionIntents(
    `[[ACTION:SEND_SMS {"toE164":"+15551234567","body":"hello","mode":"text"}]]`,
  );
  assert.equal(intents.length, 1);
  assert.equal(intents[0]?.actionType, "SEND_SMS");
  assert.equal(intents[0]?.payload?.toE164, "+15551234567");
});

test("extractAgentActionIntents ignores action-like prose when heuristics are disabled", () => {
  const intents = extractAgentActionIntents(
    "Capture and qualify client needs, then list the decisions and owners required.",
    { allowHeuristics: false },
  );
  assert.deepEqual(intents, []);
});

test("extractAgentActionIntents still accepts explicit action blocks when heuristics are disabled", () => {
  const intents = extractAgentActionIntents(
    `[[ACTION:CREATE_TASK {"title":"Review industrial outreach readiness"}]]`,
    { allowHeuristics: false },
  );
  assert.equal(intents.length, 1);
  assert.equal(intents[0]?.actionType, "CREATE_TASK");
});

test("extractAgentActionIntents parses CREATE_CONTACT and CREATE_SHOP action blocks", () => {
  const intents = extractAgentActionIntents(
    [
      `[[ACTION:CREATE_CONTACT {"displayName":"Souang","email":"souang@example.com","phone":"+22501020304"}]]`,
      `[[ACTION:CREATE_SHOP {"shop_name":"LE RUBIS SERTISSEUR","tax_id":"25020806"}]]`,
    ].join("\n"),
  );

  assert.equal(intents.length, 2);
  assert.equal(intents[0]?.actionType, "CREATE_CONTACT");
  assert.equal(intents[1]?.actionType, "CREATE_SHOP");
});

test("extractAgentActionIntents adds recurring settings for contact/shop heuristics", () => {
  const intents = extractAgentActionIntents(
    "Please save contact name: Souang email: souang@example.com and create shop name: LE RUBIS SERTISSEUR as a recurring daily automation for 5 times.",
  );
  const contact = intents.find((intent) => intent.actionType === "CREATE_CONTACT");
  const shop = intents.find((intent) => intent.actionType === "CREATE_SHOP");

  assert.ok(contact);
  assert.ok(shop);
  assert.equal((contact?.payload as any)?.recurring?.intervalMinutes, 1440);
  assert.equal((contact?.payload as any)?.recurring?.maxRuns, 5);
  assert.equal((shop?.payload as any)?.recurring?.intervalMinutes, 1440);
});

test("extractAgentActionIntents detects bulk create request with word count", () => {
  const intents = extractAgentActionIntents("Please create twenty internal agents for operations.");
  assert.equal(intents.length, 1);
  assert.equal(intents[0]?.actionType, "BULK_CREATE_AGENTS");
  assert.equal(Array.isArray((intents[0]?.payload as any)?.agents), true);
  assert.equal((intents[0]?.payload as any)?.agents.length, 20);
});

test("dispatchAgentActionIntents blocks when tenant context is missing", async () => {
  const result = await dispatchAgentActionIntents({
    text: "send email to team@example.com",
    tenantId: null,
    conversationId: "conv-1",
    source: "test",
  });
  assert.equal(result.created.length, 0);
  assert.ok(result.blocked.some((line) => line.includes("tenant context missing")));
});

test("dispatchAgentActionIntents creates queue rows with correlation metadata", async () => {
  let captured: any = null;
  const result = await dispatchAgentActionIntents(
    {
      text: "Send email to hello@example.com subject: Test launch",
      tenantId: 4,
      conversationId: "conv-22",
      source: "test",
      companyId: 9,
      agent: { id: 88, role: "Operations Coordinator" },
    },
    {
      createActionRequest: async (input: any) => {
        captured = input;
        return { id: 321, status: "QUEUED" };
      },
    },
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.created[0]?.id, 321);
  assert.equal(captured.relatedConversationId, "conv-22");
  assert.equal(captured.actionType, "SEND_EMAIL");
  assert.equal(captured.payload.companyId, 9);
  assert.equal(captured.payload.agentId, 88);
  assert.ok(typeof captured.payload.correlationId === "string" && captured.payload.correlationId.length > 10);
});

test("dispatchAgentActionIntents upgrades CREATE_AGENT count payload into BULK_CREATE_AGENTS", async () => {
  let captured: any = null;
  const result = await dispatchAgentActionIntents(
    {
      text: `[[ACTION:CREATE_AGENT {"name":"Internal Agent","role":"Operator","count":20}]]`,
      tenantId: 4,
      conversationId: "conv-bulk-upgrade",
      source: "test",
      agent: { id: 88, role: "Operations Coordinator" },
    },
    {
      createActionRequest: async (input: any) => {
        captured = input;
        return { id: 333, status: "QUEUED" };
      },
    },
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.created[0]?.actionType, "BULK_CREATE_AGENTS");
  assert.equal(captured.actionType, "BULK_CREATE_AGENTS");
  assert.equal(Array.isArray(captured.payload?.agents), true);
  assert.equal(captured.payload.agents.length, 20);
});

test("dispatchAgentActionIntents prefers agent identity over MAIL_DEFAULT_AGENT_KEY", async () => {
  let captured: any = null;
  const previous = process.env.MAIL_DEFAULT_AGENT_KEY;
  process.env.MAIL_DEFAULT_AGENT_KEY = "support";
  try {
    const result = await dispatchAgentActionIntents(
      {
        text: "Send email to hello@example.com subject: Test launch",
        tenantId: 4,
        conversationId: "conv-identity-priority",
        source: "test",
        agent: { id: 88, name: "Awa Bamba", role: "Coordinator" },
      },
      {
        createActionRequest: async (input: any) => {
          captured = input;
          return { id: 322, status: "QUEUED" };
        },
      },
    );

    assert.equal(result.created.length, 1);
    assert.equal(captured.requestedByAgentKey, "awa_bamba");
    assert.equal(captured.payload.agentKey, "awa_bamba");
  } finally {
    if (previous == null) delete process.env.MAIL_DEFAULT_AGENT_KEY;
    else process.env.MAIL_DEFAULT_AGENT_KEY = previous;
  }
});

test("dispatchAgentActionIntents uses current-user fallback recipient when requested", async () => {
  let captured: any = null;
  const result = await dispatchAgentActionIntents(
    {
      text: "Send test email to Platform Admin (current user) right now.",
      tenantId: 7,
      conversationId: "conv-current-user",
      source: "test",
      fallbackRecipientEmails: ["admin@example.com"],
      agent: { id: 9, role: "Coordinator" },
    },
    {
      createActionRequest: async (input: any) => {
        captured = input;
        return { id: 555, status: "QUEUED" };
      },
    },
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.blocked.length, 0);
  assert.deepEqual(captured.payload.to, ["admin@example.com"]);
});

test("dispatchAgentActionIntents normalizes CREATE_SHOP payload and queues request", async () => {
  let captured: any = null;
  const result = await dispatchAgentActionIntents(
    {
      text: `[[ACTION:CREATE_SHOP {"shop_name":"LE RUBIS SERTISSEUR","legal_entity":"RCCM-ABJ","tax_id":"25020806"}]]`,
      tenantId: 17,
      conversationId: "conv-shop-1",
      source: "test",
      requestedByUserId: 99,
      agent: { id: 17, name: "Awa Bamba", role: "Coordinator" },
    },
    {
      createActionRequest: async (input: any) => {
        captured = input;
        return { id: 991, status: "QUEUED" };
      },
    },
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.created[0]?.actionType, "CREATE_SHOP");
  assert.equal(captured.actionType, "CREATE_SHOP");
  assert.equal(captured.payload.shopName, "LE RUBIS SERTISSEUR");
  assert.equal(captured.payload.legalEntity, "RCCM-ABJ");
  assert.equal(captured.payload.taxId, "25020806");
});

test("dispatchAgentActionIntents preserves ownerContactRef placeholders for CREATE_SHOP", async () => {
  let captured: any = null;
  const result = await dispatchAgentActionIntents(
    {
      text: `[[ACTION:CREATE_SHOP {"shop_name":"LE RUBIS SERTISSEUR","owner_contact_id":"{{last_created_contact_id}}","email":"souang@example.com"}]]`,
      tenantId: 17,
      conversationId: "conv-shop-placeholder",
      source: "test",
      requestedByUserId: 99,
      agent: { id: 17, name: "Awa Bamba", role: "Coordinator" },
    },
    {
      createActionRequest: async (input: any) => {
        captured = input;
        return { id: 993, status: "QUEUED" };
      },
    },
  );

  assert.equal(result.created.length, 1);
  assert.equal(captured.actionType, "CREATE_SHOP");
  assert.equal(captured.payload.ownerContactId, null);
  assert.equal(captured.payload.ownerContactRef, "{{last_created_contact_id}}");
});

test("dispatchAgentActionIntents normalizes CREATE_TASK payload and preserves recurring", async () => {
  let captured: any = null;
  const result = await dispatchAgentActionIntents(
    {
      text: `[[ACTION:CREATE_TASK {"title":"Follow up with supplier","description":"Call and collect docs","priority":"high","recurring":{"enabled":true,"intervalMinutes":60,"maxRuns":3}}]]`,
      tenantId: 17,
      conversationId: "conv-task-1",
      source: "test",
      requestedByUserId: 99,
      agent: { id: 17, name: "Awa Bamba", role: "Coordinator" },
    },
    {
      createActionRequest: async (input: any) => {
        captured = input;
        return { id: 992, status: "QUEUED" };
      },
    },
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.created[0]?.actionType, "CREATE_TASK");
  assert.equal(captured.actionType, "CREATE_TASK");
  assert.equal(captured.payload.title, "Follow up with supplier");
  assert.equal(captured.payload.priority, "high");
  assert.equal(captured.payload.recurring.intervalMinutes, 60);
  assert.equal(captured.payload.recurring.maxRuns, 3);
});

test("renderActionDispatchFeedback reports created and blocked entries", () => {
  const text = renderActionDispatchFeedback({
    intentsDetected: 2,
    created: [{ id: 3, status: "REQUIRES_APPROVAL", actionType: "SEND_EMAIL", correlationId: "cid-1" }],
    blocked: ["Action blocked: tenant context missing."],
  });
  assert.ok(text.includes("awaiting approval"));
  assert.ok(text.includes("Could not proceed"));
});

test("stripAgentActionMarkers removes structured blocks and ACTION lines", () => {
  const raw = [
    "I'll send the email now.",
    "",
    '[[ACTION: SEND_EMAIL {"to":["a@example.com"],"subject":"Hi","body":{"text":"Hello"}}]]',
    "",
    "**ACTION: SEND_EMAIL**",
    "{",
    '  "to": ["a@example.com"],',
    '  "subject": "Hi",',
    '  "body": { "text": "Hello" }',
    "}",
    "",
    "Dear Vital,",
    "Here is the message body.",
  ].join("\n");

  const cleaned = stripAgentActionMarkers(raw);
  assert.ok(cleaned.includes("I'll send the email now."));
  assert.ok(!cleaned.includes("[[ACTION:"));
  assert.ok(!/ACTION\s*:\s*SEND_EMAIL/i.test(cleaned));
  assert.ok(!cleaned.includes('"to"'));
  assert.ok(cleaned.includes("Dear Vital,"));
});
