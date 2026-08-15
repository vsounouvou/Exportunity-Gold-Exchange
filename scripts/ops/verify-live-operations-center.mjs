import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const baseUrl = String(process.env.ACCEPTANCE_BASE_URL || "https://exportunity.net").replace(/\/$/, "");
const userId = Number.parseInt(String(process.env.ACCEPTANCE_USER_ID || "58"), 10);
const companyId = Number.parseInt(String(process.env.ACCEPTANCE_COMPANY_ID || "2"), 10);
const tenantKey = String(process.env.ACCEPTANCE_TENANT_KEY || "exportunity").trim().toLowerCase();
const timeoutMs = Math.max(15_000, Math.min(180_000, Number(process.env.ACCEPTANCE_TIMEOUT_MS || 90_000)));

if (process.env.ALLOW_LIVE_INTERNAL_ACCEPTANCE !== "true") {
  throw new Error("Set ALLOW_LIVE_INTERNAL_ACCEPTANCE=true to run this internal live acceptance.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!Number.isInteger(userId) || userId <= 0) throw new Error("ACCEPTANCE_USER_ID must be a positive integer.");
if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("ACCEPTANCE_COMPANY_ID must be a positive integer.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const token = `ops-acceptance-${randomUUID()}`;
let sessionCreated = false;

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function waitForAgentReply(conversationId, agentId, afterMessageId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const items = await api(`/api/messages/${encodeURIComponent(conversationId)}`);
    const reply = Array.isArray(items)
      ? items.find(
          (item) => Number(item?.fromAgentId) === agentId && Number(item?.id) > Number(afterMessageId || 0),
        )
      : null;
    if (reply) return { reply, items };
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  throw new Error(`Agent ${agentId} did not reply within ${timeoutMs}ms.`);
}

async function main() {
  const tenantResult = await pool.query(
    "select id, key from tenants where lower(key) = $1 limit 1",
    [tenantKey],
  );
  const tenant = tenantResult.rows[0];
  expect(tenant?.id, `Tenant ${tenantKey} was not found.`);

  const userResult = await pool.query(
    `select id, display_name, role, roles, permissions, current_mode, is_active
       from ece_users
      where id = $1
      limit 1`,
    [userId],
  );
  const user = userResult.rows[0];
  expect(user?.id, `Staff user ${userId} was not found.`);
  expect(user.is_active !== false, `Staff user ${userId} is inactive.`);
  const roles = Array.isArray(user.roles) ? user.roles.map((value) => String(value).toLowerCase()) : [];
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  expect(
    user.current_mode === "admin" || roles.includes("admin") || permissions.includes("*") || permissions.includes("admin:*"),
    `Staff user ${userId} is not an administrator.`,
  );

  const agentsResult = await pool.query(
    `select id, name, role, status, company_id
       from agents
      where company_id = $1
        and status = 'active'
        and (lower(name) like '%awa%' or lower(name) like '%fenou%')
      order by id`,
    [companyId],
  );
  const awa = agentsResult.rows.find((agent) => /awa/i.test(String(agent.name)));
  const fenou = agentsResult.rows.find((agent) => /fenou/i.test(String(agent.name)));
  expect(awa?.id, "Active Awa agent was not found in the Exportunity company.");
  expect(fenou?.id, "Active Fenou agent was not found in the Exportunity company.");

  await pool.query(
    `insert into ece_sessions (user_id, token, expires_at, created_at)
     values ($1, $2, now() + interval '30 minutes', now())`,
    [userId, token],
  );
  sessionCreated = true;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const title = `Acceptance interne - Operations Center - ${stamp}`;
  const created = await api("/api/meetings", {
    method: "POST",
    body: {
      title,
      description:
        "Validation interne de la conversation agentique Exportunity. Aucun contact externe ni aucune communication sortante n'est autorise pendant ce test.",
      type: "spontaneous",
      meetingType: "operations_acceptance",
      startTime: new Date(Date.now() - 1_000).toISOString(),
      duration: 10,
      companyId,
      attendees: [
        { participantType: "agent", agentId: Number(awa.id), role: "commercial_owner", required: true },
        { participantType: "agent", agentId: Number(fenou.id), role: "facilitator", required: true },
      ],
    },
  });

  const meetingId = Number(created?.meeting?.id);
  const roomId = Number(created?.chatRoom?.id);
  const conversationId = String(created?.meeting?.conversationId || created?.chatRoom?.conversationId || "");
  expect(meetingId > 0 && roomId > 0 && conversationId, "Meeting creation response is incomplete.");

  const first = await api("/api/messages", {
    method: "POST",
    body: {
      conversationId,
      toAgentId: Number(awa.id),
      content:
        "Test interne uniquement. Confirmez que vous travaillez pour Exportunity, puis proposez trois prochaines etapes internes pour qualifier une demande de 100 tonnes d'huile de palme raffinee a livrer a Abidjan. Aucun contact externe, aucun message sortant et aucune prise de commande ne sont autorises pendant ce test.",
    },
  });
  const firstMessageId = Number(first?.message?.id || 0);
  const awaResult = await waitForAgentReply(conversationId, Number(awa.id), firstMessageId);
  const awaText = String(awaResult.reply?.content || "");
  expect(/exportunity/i.test(awaText), "Awa did not preserve the Exportunity company context.");
  expect(!/boost\s*hello/i.test(awaText), "Awa confused Exportunity with Boost Hello.");

  const second = await api("/api/messages", {
    method: "POST",
    body: {
      conversationId,
      toAgentId: Number(fenou.id),
      content:
        "Test interne uniquement. Lisez le contexte de cette reunion, confirmez l'entreprise concernee et resumez le plan interne de suivi. Ne contactez personne et ne declenchez aucune communication externe.",
    },
  });
  const secondMessageId = Number(second?.message?.id || 0);
  const fenouResult = await waitForAgentReply(conversationId, Number(fenou.id), secondMessageId);
  const fenouText = String(fenouResult.reply?.content || "");
  expect(/exportunity/i.test(fenouText), "Fenou did not preserve the Exportunity company context.");
  expect(!/boost\s*hello/i.test(fenouText), "Fenou confused Exportunity with Boost Hello.");

  const beforeEnd = await api(`/api/messages/${encodeURIComponent(conversationId)}`);
  expect(Array.isArray(beforeEnd) && beforeEnd.length >= 4, "Meeting history was not persisted before closure.");

  const ended = await api(`/api/meetings/${meetingId}/end`, { method: "POST", body: {} });
  expect(String(ended?.meeting?.status) === "completed", "Meeting did not transition to completed.");

  const afterEnd = await api(`/api/messages/${encodeURIComponent(conversationId)}`);
  expect(Array.isArray(afterEnd) && afterEnd.length >= beforeEnd.length, "Meeting history was lost after closure.");

  const stateResult = await pool.query(
    `select m.status as meeting_status, cr.is_active as room_active,
            (select count(*)::int from messages msg where msg.conversation_id = m.conversation_id) as message_count
       from meetings m
       join chat_rooms cr on cr.conversation_id = m.conversation_id
      where m.id = $1 and m.tenant_id = $2
      limit 1`,
    [meetingId, Number(tenant.id)],
  );
  const state = stateResult.rows[0];
  expect(state?.meeting_status === "completed", "Canonical meeting state is not completed.");
  expect(state?.room_active === false, "Meeting room remained active after closure.");
  expect(Number(state?.message_count || 0) >= 4, "Persisted meeting history is incomplete.");

  console.log(
    JSON.stringify(
      {
        ok: true,
        meetingId,
        roomId,
        conversationId,
        agents: [
          { id: Number(awa.id), name: awa.name, role: awa.role, replyPreview: awaText.slice(0, 220) },
          { id: Number(fenou.id), name: fenou.name, role: fenou.role, replyPreview: fenouText.slice(0, 220) },
        ],
        meetingStatus: state.meeting_status,
        roomActive: state.room_active,
        messageCount: Number(state.message_count),
        outboundCommunicationAuthorized: false,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  if (sessionCreated) await pool.query("delete from ece_sessions where token = $1", [token]);
  await pool.end();
}
