#!/usr/bin/env node

const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const TENANT_ID = 2;
const COMPANY_ID = 2;
const REQUIREMENT_ID = "3c984c0f-cb7e-44fd-88ce-1e798defd647";
const REQUIREMENT_REFERENCE = "REQ-20260814-IN456S";
const QA_CONVERSATION_ID = "qa-autonomy-20260814-161109";
const QA_MEETING_IDS = [15, 16, 17];
const QA_MEETING_CONVERSATIONS = [
  "meeting:2:1786717860579:56ef36",
  "meeting:2:1786720029139:d88554",
  "meeting:2:1786720588165:41b128",
];
const QA_TASK_IDS = [10, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
const QA_ACTION_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const QA_CONTEXT_PACK_IDS = [5, 6, 7, 8, 9, 10, 11, 12, 13];

function assert(condition, message) {
  if (!condition) throw new Error(`Safety assertion failed: ${message}`);
}

function ids(rows) {
  return rows.map((row) => Number(row.id)).sort((a, b) => a - b);
}

function sameIds(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const query = async (text, params = []) => (await client.query(text, params)).rows;
  const deleted = {};

  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('exportunity-production-qa-cleanup-v1'))");

    const tenant = await query("select id, key from tenants where id = $1", [TENANT_ID]);
    assert(tenant.length === 1 && tenant[0].key === "exportunity", "tenant 2 must be exportunity");

    const company = await query("select id, name from companies where id = $1", [COMPANY_ID]);
    assert(company.length === 1 && /exportunity/i.test(company[0].name || ""), "company 2 must be Exportunity");

    const meetings = await query(
      "select id, title, conversation_id from meetings where company_id = $1 and id = any($2::int[]) order by id",
      [COMPANY_ID, QA_MEETING_IDS],
    );
    assert(sameIds(ids(meetings), QA_MEETING_IDS), "the three expected smoke meetings must exist");
    for (const meeting of meetings) {
      assert(/QA|ops-meeting-smoke/i.test(meeting.title || ""), `meeting ${meeting.id} must be QA-labelled`);
      assert(QA_MEETING_CONVERSATIONS.includes(meeting.conversation_id), `meeting ${meeting.id} conversation must match`);
    }
    const meetingParticipants = await query("select id from meeting_participants where meeting_id = any($1::int[])", [QA_MEETING_IDS]);
    const meetingAttendance = await query("select id from agent_meeting_attendance where meeting_id = any($1::int[])", [QA_MEETING_IDS]);
    const meetingDecisions = await query("select id from meeting_decisions where meeting_id = any($1::int[])", [QA_MEETING_IDS]);
    const meetingAgentInstances = await query("select id from meeting_agent_instances where meeting_id = any($1::int[])", [QA_MEETING_IDS]);
    assert(meetingParticipants.length === 6, "the smoke meetings must have exactly six participant rows");
    assert(meetingAttendance.length === 3, "the smoke meetings must have exactly three attendance rows");
    assert(meetingDecisions.length === 2, "the smoke meetings must have exactly two decision rows");
    assert(meetingAgentInstances.length === 3, "the smoke meetings must have exactly three agent instances");

    const tasks = await query(
      "select id, title, description from tasks where company_id = $1 and id = any($2::int[]) order by id",
      [COMPANY_ID, QA_TASK_IDS],
    );
    assert(sameIds(ids(tasks), QA_TASK_IDS), "all expected QA tasks must exist");
    for (const task of tasks) {
      const text = `${task.title || ""}\n${task.description || ""}`;
      assert(/QA|ops-meeting-smoke|REQ-20260814-IN456S/i.test(text), `task ${task.id} must be QA-labelled`);
    }

    const actions = await query(
      "select id, action_type, correlation_id, payload from action_requests where tenant_id = $1 and id = any($2::int[]) order by id",
      [TENANT_ID, QA_ACTION_IDS],
    );
    assert(sameIds(ids(actions), QA_ACTION_IDS), "all expected QA actions must exist");
    for (const action of actions) {
      const payloadText = JSON.stringify(action.payload || {});
      const isMeetingQa = action.id <= 3 && /QA|meeting-task:13|act_178653/i.test(`${action.correlation_id || ""} ${payloadText}`);
      const isIndustrialQa = action.id >= 4 && action.correlation_id === `industrial-requirement:${REQUIREMENT_ID}`;
      assert(isMeetingQa || isIndustrialQa, `action ${action.id} must match the QA fixture`);
    }

    const requirement = await query(
      "select id, reference_code, title, source_conversation_id, customer_contact_id from industrial_requirements where id = $1 and tenant_id = $2",
      [REQUIREMENT_ID, TENANT_ID],
    );
    assert(requirement.length === 1, "the synthetic industrial requirement must exist");
    assert(requirement[0].reference_code === REQUIREMENT_REFERENCE, "industrial requirement reference must match");
    assert(/QA AUTONOMY/i.test(requirement[0].title || ""), "industrial requirement must be QA-labelled");
    assert(requirement[0].source_conversation_id === QA_CONVERSATION_ID, "industrial requirement conversation must match");
    assert(Number(requirement[0].customer_contact_id) === 3, "industrial requirement must use synthetic contact 3");

    const orders = await query("select id from industrial_orders where requirement_id = $1", [REQUIREMENT_ID]);
    const offers = await query("select id from industrial_commercial_offers where requirement_id = $1", [REQUIREMENT_ID]);
    const quotes = await query("select id from industrial_quotes where requirement_id = $1", [REQUIREMENT_ID]);
    const supplierQuotes = await query("select id from industrial_supplier_quotes where requirement_id = $1", [REQUIREMENT_ID]);
    assert(orders.length === 0, "synthetic requirement must have no order");
    assert(offers.length === 0, "synthetic requirement must have no commercial offer");
    assert(quotes.length === 0 && supplierQuotes.length === 0, "synthetic requirement must have no quote");

    const staffing = await query(
      "select id, requirement_id, role_code, status, provisioned_agent_id from industrial_agent_staffing_requests where id = 7 and tenant_id = $1",
      [TENANT_ID],
    );
    assert(staffing.length === 1 && staffing[0].requirement_id === REQUIREMENT_ID, "staffing signal 7 must belong to the QA requirement");
    assert(staffing[0].role_code === "exportunity-seat-commodity-industry-desks-04-palm-oil-desk-agent", "staffing role must match");
    assert(staffing[0].status === "monitoring" && staffing[0].provisioned_agent_id == null, "staffing signal must not have provisioned an employee");

    const contact = await query("select id, display_name, company, primary_email from contacts where id = 3", []);
    assert(contact.length === 1, "synthetic contact 3 must exist");
    assert(contact[0].display_name === "Exportunity Lifecycle QA", "synthetic contact name must match");
    assert(contact[0].company === "Exportunity Internal QA", "synthetic contact company must match");
    assert(contact[0].primary_email === "qa-lifecycle@exportunity.net", "synthetic contact email must match");
    const contactReferences = await query("select id from industrial_requirements where customer_contact_id = 3");
    assert(contactReferences.length === 1 && contactReferences[0].id === REQUIREMENT_ID, "synthetic contact must only belong to the QA requirement");

    const contextPacks = await query(
      "select id, conversation_id, correlation_id, task_key from company_brain_context_packs where tenant_id = $1 and id = any($2::int[]) order by id",
      [TENANT_ID, QA_CONTEXT_PACK_IDS],
    );
    assert(sameIds(ids(contextPacks), QA_CONTEXT_PACK_IDS), "all expected QA context packs must exist");
    for (const pack of contextPacks) {
      const text = `${pack.conversation_id || ""} ${pack.correlation_id || ""} ${pack.task_key || ""}`;
      assert(text.includes(REQUIREMENT_ID) || text.includes(REQUIREMENT_REFERENCE) || text.includes(QA_CONVERSATION_ID), `context pack ${pack.id} must match the QA case`);
    }

    const allConversations = [QA_CONVERSATION_ID, ...QA_MEETING_CONVERSATIONS];
    const messages = await query("select id from messages where conversation_id = any($1::text[])", [allConversations]);
    assert(messages.length === 11, "the QA conversations must contain exactly 11 messages");
    const chatRooms = await query("select id from chat_rooms where conversation_id = any($1::text[])", [QA_MEETING_CONVERSATIONS]);
    assert(chatRooms.length === 3, "the smoke meetings must have exactly three chat rooms");

    const actionRuns = await query(
      "select id from agent_action_runs where tenant_id = $1 and correlation_id = $2 order by id",
      [TENANT_ID, `industrial-requirement:${REQUIREMENT_ID}`],
    );
    assert(actionRuns.length === 8, "the QA industrial case must have exactly eight agent action runs");
    const intelligenceAuditEvents = await query(
      "select id from intelligence_audit_events where tenant_id = $1 and task_id = any($2::int[])",
      [TENANT_ID, QA_TASK_IDS],
    );
    const intelligenceTokenLedger = await query(
      "select id from intelligence_token_ledger where tenant_id = $1 and task_id = any($2::int[])",
      [TENANT_ID, QA_TASK_IDS],
    );
    assert(intelligenceAuditEvents.length === 0, "Exportunity must not claim another tenant's intelligence audit events");
    assert(intelligenceTokenLedger.length === 0, "Exportunity must not claim another tenant's token ledger entries");
    const auditRows = await query(
      "select id from industrial_audit_logs where tenant_id = $1 and entity_id = $2",
      [TENANT_ID, REQUIREMENT_ID],
    );
    assert(auditRows.length === 17, "the QA industrial case must have exactly 17 audit rows");

    const deleteRows = async (name, text, params) => {
      const result = await query(`${text} returning id`, params);
      deleted[name] = result.length;
      return result;
    };

    await deleteRows("intelligenceAuditEvents", "delete from intelligence_audit_events where tenant_id = $1 and task_id = any($2::int[])", [TENANT_ID, QA_TASK_IDS]);
    await deleteRows("intelligenceTokenLedger", "delete from intelligence_token_ledger where tenant_id = $1 and task_id = any($2::int[])", [TENANT_ID, QA_TASK_IDS]);
    await deleteRows("taskProgressEvents", "delete from task_progress_events where tenant_id = $1 and task_id = any($2::int[])", [TENANT_ID, QA_TASK_IDS]);
    await deleteRows("meetingParticipants", "delete from meeting_participants where meeting_id = any($1::int[])", [QA_MEETING_IDS]);
    const remainingAttendance = await query("select id from agent_meeting_attendance where meeting_id = any($1::int[])", [QA_MEETING_IDS]);
    assert(remainingAttendance.length === 0, "QA attendance rows must be removed by the participant cascade");
    deleted.meetingAttendanceCascaded = meetingAttendance.length;
    await deleteRows("meetingDecisions", "delete from meeting_decisions where meeting_id = any($1::int[])", [QA_MEETING_IDS]);
    await deleteRows("meetingAgentInstances", "delete from meeting_agent_instances where meeting_id = any($1::int[])", [QA_MEETING_IDS]);
    await deleteRows("actionRequests", "delete from action_requests where tenant_id = $1 and id = any($2::int[])", [TENANT_ID, QA_ACTION_IDS]);
    const remainingAgentRuns = await query(
      "select id from agent_action_runs where tenant_id = $1 and correlation_id = $2",
      [TENANT_ID, `industrial-requirement:${REQUIREMENT_ID}`],
    );
    assert(remainingAgentRuns.length === 0, "QA agent action runs must be removed by the action-request cascade");
    deleted.agentActionRunsCascaded = actionRuns.length;
    await deleteRows("tasks", "delete from tasks where company_id = $1 and id = any($2::int[])", [COMPANY_ID, QA_TASK_IDS]);
    await deleteRows("messages", "delete from messages where conversation_id = any($1::text[])", [allConversations]);
    await deleteRows("chatRooms", "delete from chat_rooms where conversation_id = any($1::text[])", [QA_MEETING_CONVERSATIONS]);
    await deleteRows("meetings", "delete from meetings where company_id = $1 and id = any($2::int[])", [COMPANY_ID, QA_MEETING_IDS]);
    await deleteRows("staffingSignals", "delete from industrial_agent_staffing_requests where tenant_id = $1 and id = 7", [TENANT_ID]);
    await deleteRows("contextPacks", "delete from company_brain_context_packs where tenant_id = $1 and id = any($2::int[])", [TENANT_ID, QA_CONTEXT_PACK_IDS]);
    await deleteRows("industrialAuditLogs", "delete from industrial_audit_logs where tenant_id = $1 and entity_id = $2", [TENANT_ID, REQUIREMENT_ID]);
    await deleteRows("industrialRequirements", "delete from industrial_requirements where tenant_id = $1 and id = $2", [TENANT_ID, REQUIREMENT_ID]);
    await deleteRows("contacts", "delete from contacts where id = 3 and primary_email = 'qa-lifecycle@exportunity.net'", []);

    assert(deleted.actionRequests === 11, "exactly 11 QA actions must be deleted");
    assert(deleted.agentActionRunsCascaded === 8, "exactly eight QA agent action runs must be cascade-deleted");
    assert(deleted.intelligenceAuditEvents === 0, "no other tenant's intelligence audit events may be deleted");
    assert(deleted.intelligenceTokenLedger === 0, "no other tenant's token ledger entries may be deleted");
    assert(deleted.tasks === 15, "exactly 15 QA tasks must be deleted");
    assert(deleted.meetingParticipants === 6, "exactly six QA meeting participants must be deleted");
    assert(deleted.meetingAttendanceCascaded === 3, "exactly three QA attendance rows must be cascade-deleted");
    assert(deleted.meetings === 3, "exactly three QA meetings must be deleted");
    assert(deleted.contextPacks === 9, "exactly nine QA context packs must be deleted");
    assert(deleted.industrialRequirements === 1 && deleted.contacts === 1, "the synthetic requirement and contact must be deleted");

    if (APPLY) {
      await client.query("commit");
      console.log(JSON.stringify({ mode: "applied", tenant: tenant[0], company: company[0], deleted }, null, 2));
    } else {
      await client.query("rollback");
      console.log(JSON.stringify({ mode: "dry-run", tenant: tenant[0], company: company[0], wouldDelete: deleted }, null, 2));
    }
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
