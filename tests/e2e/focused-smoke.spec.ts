import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./utils";

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "x-ece-lang": "en",
    "Content-Type": "application/json",
  };
}

async function adminToken(page: any) {
  const token = await page.evaluate(() => localStorage.getItem("ece_session"));
  expect(token).toBeTruthy();
  return String(token || "");
}

function pickNumericId(...values: any[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

test("AdminAgentGovernancePage route loads", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/agents/governance", { waitUntil: "domcontentloaded" });
  const agentsOsHeading = page.getByRole("heading", { name: /agents os/i }).first();
  await expect(agentsOsHeading).toBeVisible();
  await expect(page.getByText("Page failed to load")).toHaveCount(0);
});

test("Agent photo API resolves Agents OS id (no 404)", async ({ page }) => {
  await loginAsAdmin(page);
  const token = await adminToken(page);
  const headers = authHeaders(token);
  const req = page.request;

  const registryResp = await req.get("/api/admin/agents?page=1&pageSize=10", { headers });
  expect(registryResp.ok(), await registryResp.text()).toBeTruthy();

  const registryPayload = await registryResp.json();
  const firstAgentId = pickNumericId(
    registryPayload?.items?.[0]?.id,
    registryPayload?.agents?.[0]?.id,
    registryPayload?.data?.[0]?.id,
  );
  expect(firstAgentId).toBeGreaterThan(0);

  const photoResp = await req.get(`/api/agents/${firstAgentId}/photo`, { headers });
  expect(photoResp.ok(), await photoResp.text()).toBeTruthy();

  const lockResp = await req.post(`/api/agents/${firstAgentId}/photo/lock`, {
    headers,
    data: { locked: false },
  });
  expect(lockResp.ok(), await lockResp.text()).toBeTruthy();
});

test("Meetings flow API smoke (create -> start -> end -> outputs + recurrence)", async ({ page }) => {
  await loginAsAdmin(page);
  const token = await adminToken(page);
  const headers = authHeaders(token);

  const req = page.request;
  const companiesResp = await req.get("/api/companies", { headers });
  expect(companiesResp.ok()).toBeTruthy();
  const companiesPayload = await companiesResp.json();
  const companyId = Number((companiesPayload || [])[0]?.id || 0);
  expect(companyId).toBeGreaterThan(0);

  const objectiveCreateResp = await req.post("/api/goals", {
    headers,
    data: {
      companyId,
      title: `Smoke Objective ${Date.now()}`,
      description: "Objective required by agenda hard-process rules",
      priority: "medium",
      mode: "SIMULATE",
      approvalReason: "e2e smoke objective bootstrap",
    },
  });
  expect(objectiveCreateResp.ok(), await objectiveCreateResp.text()).toBeTruthy();
  const objectivePayload = await objectiveCreateResp.json();
  const objectiveId = pickNumericId(
    objectivePayload?.id,
    objectivePayload?.goal?.id,
    objectivePayload?.data?.id,
    objectivePayload?.result?.id,
  );
  expect(objectiveId).toBeGreaterThan(0);

  const activeAgentsResp = await req.get("/api/agents?status=active", { headers });
  expect(activeAgentsResp.ok(), await activeAgentsResp.text()).toBeTruthy();
  const activeAgentsPayload = await activeAgentsResp.json();
  const activeAgentId = pickNumericId(
    activeAgentsPayload?.[0]?.id,
    activeAgentsPayload?.agents?.[0]?.id,
    activeAgentsPayload?.items?.[0]?.id,
    activeAgentsPayload?.data?.[0]?.id,
  );

  const roomsResp = await req.get("/api/rooms", { headers });
  expect(roomsResp.ok()).toBeTruthy();
  const roomsPayload = await roomsResp.json();
  let roomId = Number((roomsPayload?.rooms || [])[0]?.id || 0);

  if (!roomId) {
    const createRoomResp = await req.post("/api/rooms", {
      headers,
      data: {
        name: `Smoke Room ${Date.now()}`,
        location_label: "Virtual",
        is_virtual: true,
        timezone: "UTC",
      },
    });
    expect(createRoomResp.ok()).toBeTruthy();
    const createRoomPayload = await createRoomResp.json();
    roomId = Number(createRoomPayload?.room?.id || 0);
  }

  expect(roomId).toBeGreaterThan(0);

  const now = Date.now();
  const meetingTitle = `Smoke Flow ${now}`;

  const createAgendaResp = await req.post("/api/agenda-events", {
    headers,
    data: {
      title: meetingTitle,
      description: "Automated smoke check",
      meeting_type: "weekly_ops_sync",
      start_at: new Date(now + 10 * 60 * 1000).toISOString(),
      duration_minutes: 15,
      room_id: roomId,
      objective_id: objectiveId,
      attendees: activeAgentId
        ? [
            {
              participantType: "agent",
              agentId: activeAgentId,
              role: "note_taker",
              required: true,
            },
          ]
        : [],
    },
  });
  expect(createAgendaResp.ok(), await createAgendaResp.text()).toBeTruthy();
  const createAgendaPayload = await createAgendaResp.json();
  const meetingId = pickNumericId(
    createAgendaPayload?.meeting?.id,
    createAgendaPayload?.agendaEvent?.meetingId,
    createAgendaPayload?.agendaEvent?.id,
  );
  expect(meetingId).toBeGreaterThan(0);

  const startResp = await req.post(`/api/meetings/${meetingId}/start`, { headers });
  expect(startResp.ok()).toBeTruthy();

  const endResp = await req.post(`/api/meetings/${meetingId}/end`, { headers });
  expect(endResp.ok()).toBeTruthy();

  const outputsResp = await req.post(`/api/meetings/${meetingId}/outputs/generate`, { headers });
  expect(outputsResp.ok()).toBeTruthy();

  const outputsReadResp = await req.get(`/api/meetings/${meetingId}/outputs`, { headers });
  expect(outputsReadResp.ok()).toBeTruthy();
  const outputsReadPayload = await outputsReadResp.json();
  expect(outputsReadPayload?.ok).toBeTruthy();

  const recurringTitle = `Recurring Smoke ${now}`;
  const recurringStart = new Date();
  recurringStart.setUTCHours(10, 0, 0, 0);
  if (recurringStart.getTime() < Date.now()) {
    recurringStart.setUTCDate(recurringStart.getUTCDate() + 1);
  }

  const recurringCreateResp = await req.post("/api/agenda-events", {
    headers,
    data: {
      title: recurringTitle,
      description: "Recurring agenda visibility smoke",
      meeting_type: "weekly_ops_sync",
      start_at: recurringStart.toISOString(),
      duration_minutes: 20,
      room_id: roomId,
      objective_id: objectiveId,
      recurrence_rule: "FREQ=DAILY;INTERVAL=1;COUNT=4;BYHOUR=10;BYMINUTE=0",
    },
  });
  expect(recurringCreateResp.ok(), await recurringCreateResp.text()).toBeTruthy();

  const from = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const recurringListResp = await req.get(
    `/api/agenda-events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers },
  );
  expect(recurringListResp.ok()).toBeTruthy();
  const recurringListPayload = await recurringListResp.json();
  const recurringItems = (recurringListPayload?.items || []).filter((item: any) => item?.title === recurringTitle);
  expect(recurringItems.length).toBeGreaterThanOrEqual(2);
});
