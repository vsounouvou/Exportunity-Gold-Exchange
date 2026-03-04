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

async function waitForActionDone(req: any, headers: Record<string, string>, actionId: number) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const detailResp = await req.get(`/api/actions/${actionId}`, { headers });
    expect(detailResp.ok(), `action detail ${actionId} should load`).toBeTruthy();
    const payload = await detailResp.json();
    const action = payload?.actionRequest;
    const status = String(action?.status || "").toUpperCase();
    if (status === "DONE") return payload;
    if (status === "FAILED" || status === "DENIED" || status === "CANCELLED") {
      throw new Error(`Action ${actionId} ended with status=${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for action ${actionId} to reach DONE`);
}

test("Authenticated actions smoke (create contact + create shop + recurring follow-up)", async ({ page }) => {
  await loginAsAdmin(page);
  const token = await adminToken(page);
  const headers = authHeaders(token);
  const req = page.request;
  const runTag = Date.now();
  const contactEmail = `smoke.contact.${runTag}@example.com`;
  const contactPhone = `+22501${String(runTag).slice(-8)}`;
  const shopName = `Smoke Shop ${runTag}`;

  const contactCreateResp = await req.post("/api/actions/request", {
    headers,
    data: {
      actionType: "CREATE_CONTACT",
      relatedConversationId: `smoke-actions-${runTag}`,
      payload: {
        displayName: `Smoke Contact ${runTag}`,
        email: contactEmail,
        phone: contactPhone,
      },
    },
  });
  expect(contactCreateResp.ok()).toBeTruthy();
  const contactCreatePayload = await contactCreateResp.json();
  const contactActionId = Number(contactCreatePayload?.actionRequest?.id || 0);
  expect(contactActionId).toBeGreaterThan(0);
  const contactDonePayload = await waitForActionDone(req, headers, contactActionId);
  const contactResult = (contactDonePayload?.results || [])[0]?.result || {};
  const createdContactId = Number(contactResult?.contactId || 0);
  expect(createdContactId).toBeGreaterThan(0);

  const shopCreateResp = await req.post("/api/actions/request", {
    headers,
    data: {
      actionType: "CREATE_SHOP",
      relatedConversationId: `smoke-actions-${runTag}`,
      payload: {
        shop_name: shopName,
        owner_contact_id: createdContactId,
        email: contactEmail,
        phoneNumber: contactPhone,
        recurring: {
          enabled: true,
          intervalMinutes: 1,
          maxRuns: 2,
        },
      },
    },
  });
  expect(shopCreateResp.ok()).toBeTruthy();
  const shopCreatePayload = await shopCreateResp.json();
  const shopActionId = Number(shopCreatePayload?.actionRequest?.id || 0);
  expect(shopActionId).toBeGreaterThan(0);

  const shopDonePayload = await waitForActionDone(req, headers, shopActionId);

  const shopResult = (shopDonePayload?.results || [])[0]?.result || {};

  const createdShopId = Number(shopResult?.sellerId || 0);
  expect(createdShopId).toBeGreaterThan(0);

  const recurringNextActionId = Number(shopResult?.recurringNextActionId || 0);
  expect(recurringNextActionId).toBeGreaterThan(0);

  const queueResp = await req.get(`/api/actions/queue?limit=300`, { headers });
  expect(queueResp.ok()).toBeTruthy();
  const queuePayload = await queueResp.json();
  const recurringAction = (queuePayload?.items || []).find((item: any) => Number(item?.id) === recurringNextActionId);
  expect(recurringAction).toBeTruthy();
  expect(String(recurringAction?.status || "").toUpperCase()).toBe("QUEUED");
  expect(Number(recurringAction?.payload?.ownerContactId || 0)).toBe(createdContactId);
  expect(Number(recurringAction?.metadata?.recurring?.runIndex || 0)).toBe(2);
});
