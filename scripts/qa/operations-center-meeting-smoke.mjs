#!/usr/bin/env node

const baseUrl = String(process.env.SMOKE_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
const tenantKey = String(process.env.TENANT_KEY || "exportunity").trim().toLowerCase();
const email = String(process.env.E2E_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "").trim();
const password = String(process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "");
const suppliedAuthToken = String(process.env.AUTH_TOKEN || "").trim();
const timeoutMs = Math.max(10_000, Number(process.env.SMOKE_TIMEOUT_MS || 75_000));
const tag = String(process.env.SMOKE_TAG || `ops-meeting-smoke-${Date.now()}`).trim();

if (!suppliedAuthToken && (!email || !password)) {
  console.error(JSON.stringify({ ok: false, error: "Production smoke credentials are not configured" }));
  process.exit(1);
}

let authToken = suppliedAuthToken;

function requestHeaders(extra = {}) {
  const headers = {
    "content-type": "application/json",
    "x-tenant-key": tenantKey,
    ...extra,
  };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  return headers;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: requestHeaders(options.headers || {}),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  return { ok: response.ok, status: response.status, body };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function positiveId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function agentScore(agent) {
  const name = String(agent?.name || "").toLowerCase();
  const role = String(agent?.role || "").toLowerCase();
  const status = String(agent?.status || "").toLowerCase();
  let score = 0;
  if (["active", "working", "idle", "available"].includes(status)) score += 20;
  if (agent?.isVisible !== false) score += 10;
  if (!agent?.isTest) score += 10;
  if (/chief of staff|operations|commercial|coordinator|chairman/.test(role)) score += 12;
  if (/tassi|tasi|awa|fenou/.test(name)) score += 5;
  if (/test|limited|demo/.test(`${name} ${role}`)) score -= 100;
  return score;
}

function responseBreaksTenantContext(content) {
  return /boost hello|maison en terre|boursedelor|bourse de l'or|rayon marketplace/i.test(String(content || ""));
}

async function waitForAgentReply(conversationId, humanMessageId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await requestJson(`/api/messages/${encodeURIComponent(conversationId)}`);
    if (response.ok) {
      const messages = asArray(response.body);
      const reply = messages.find(
        (message) =>
          positiveId(message?.fromAgentId) &&
          positiveId(message?.id) &&
          positiveId(message?.id) > Number(humanMessageId || 0),
      );
      if (reply) return { reply, messages };
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return { reply: null, messages: [] };
}

async function main() {
  const checks = {};
  let meetingId = null;
  let conversationId = "";
  let selectedAgent = null;
  let agentReply = null;
  let closeStatus = null;

  if (authToken) {
    const authCheck = await requestJson("/api/ece/auth/me");
    checks.login = authCheck.ok && authToken.length > 12;
    if (!checks.login) throw new Error(`Supplied session token was rejected (${authCheck.status})`);
  } else {
    const login = await requestJson("/api/ece/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    authToken = login.ok ? String(login.body?.token || "") : "";
    checks.login = login.ok && authToken.length > 12;
    if (!checks.login) throw new Error(`Admin login failed (${login.status})`);
  }

  const companiesResponse = await requestJson("/api/companies");
  const companies = asArray(companiesResponse.body);
  const company =
    companies.find((item) => /exportunity/i.test(String(item?.name || ""))) ||
    companies.find((item) => positiveId(item?.id)) ||
    null;
  const companyId = positiveId(company?.id);
  checks.companyResolved = companiesResponse.ok && Boolean(companyId);
  if (!companyId) throw new Error("No tenant-scoped Exportunity company was found");

  const agentsResponse = await requestJson(`/api/companies/${companyId}/agents`);
  const agents = asArray(agentsResponse.body).filter((agent) => positiveId(agent?.id));
  selectedAgent = agents.sort((left, right) => agentScore(right) - agentScore(left))[0] || null;
  const agentId = positiveId(selectedAgent?.id);
  checks.agentResolved = agentsResponse.ok && Boolean(agentId);
  if (!agentId) throw new Error("No production agent was available for the meeting");

  const createResponse = await requestJson("/api/meetings", {
    method: "POST",
    body: JSON.stringify({
      title: `QA - Operations context - ${tag}`,
      description: "Internal production verification only. No external communication or commercial action is authorized.",
      type: "spontaneous",
      meetingType: "operations_qa",
      startTime: new Date().toISOString(),
      duration: 5,
      companyId,
      organizerId: agentId,
      participants: [agentId],
    }),
  });
  meetingId = positiveId(createResponse.body?.meeting?.id);
  conversationId = String(createResponse.body?.chatRoom?.conversationId || "");
  checks.meetingCreated = createResponse.ok && Boolean(meetingId) && conversationId.startsWith("meeting:");
  if (!checks.meetingCreated) throw new Error(`Meeting creation failed (${createResponse.status})`);

  const membersResponse = await requestJson(`/api/chatrooms/${encodeURIComponent(conversationId)}/members`);
  const members = asArray(membersResponse.body?.members || membersResponse.body);
  checks.agentMembership = membersResponse.ok && members.some((member) => positiveId(member?.agentId ?? member?.agent?.id) === agentId);

  const contextQuestion = [
    `[${tag}] Internal read-only context verification.`,
    "In one concise sentence, state the company and platform you work for and its industrial trade mission.",
    "Do not create a task, action, decision, outreach, email, call, or external communication.",
  ].join(" ");
  const sendResponse = await requestJson("/api/messages", {
    method: "POST",
    body: JSON.stringify({
      fromAgentId: null,
      toAgentId: agentId,
      conversationId,
      content: contextQuestion,
      metadata: { smokeTag: tag, requiresResponse: true, readOnly: true },
    }),
  });
  const humanMessageId = positiveId(sendResponse.body?.message?.id);
  checks.messageAccepted = sendResponse.ok && Boolean(humanMessageId);
  if (!checks.messageAccepted) throw new Error(`Meeting message failed (${sendResponse.status})`);

  const replyResult = await waitForAgentReply(conversationId, humanMessageId);
  agentReply = replyResult.reply;
  const replyText = String(agentReply?.content || "");
  const replyAnalysis = String(agentReply?.metadata?.analysis || "");
  checks.agentReplied = Boolean(agentReply);
  checks.exportunityContext = /exportunity/i.test(replyText) && !responseBreaksTenantContext(replyText);
  checks.providerBacked = Boolean(agentReply) && !/fallback response generated/i.test(replyAnalysis);
  checks.noExternalAction =
    asArray(agentReply?.metadata?.actionDispatch?.created).length === 0 &&
    asArray(agentReply?.metadata?.actionDispatch?.blocked).length === 0;

  const reopenResponse = await requestJson(`/api/meetings/${meetingId}`);
  const listedResponse = await requestJson(`/api/meetings?companyId=${companyId}`);
  checks.meetingReopened = reopenResponse.ok && positiveId(reopenResponse.body?.id) === meetingId;
  checks.meetingListed =
    listedResponse.ok && asArray(listedResponse.body).some((item) => positiveId(item?.id) === meetingId);
  checks.historyPersisted = replyResult.messages.some((message) => positiveId(message?.id) === humanMessageId) && Boolean(agentReply);

  const endResponse = await requestJson(`/api/meetings/${meetingId}/end`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  closeStatus = String(endResponse.body?.meeting?.status || "");
  checks.meetingClosed = endResponse.ok && closeStatus === "completed";

  const ok = Object.values(checks).every(Boolean);
  const report = {
    ok,
    tag,
    tenantKey,
    company: { id: companyId, name: String(company?.name || "") },
    agent: {
      id: agentId,
      name: String(selectedAgent?.name || ""),
      role: String(selectedAgent?.role || ""),
    },
    meeting: { id: meetingId, conversationId, status: closeStatus },
    reply: agentReply
      ? {
          id: positiveId(agentReply.id),
          preview: String(agentReply.content || "").slice(0, 500),
          fallbackUsed: /fallback response generated/i.test(String(agentReply?.metadata?.analysis || "")),
          actionRunsCreated: asArray(agentReply?.metadata?.actionDispatch?.created).length,
        }
      : null,
    checks,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        tag,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
