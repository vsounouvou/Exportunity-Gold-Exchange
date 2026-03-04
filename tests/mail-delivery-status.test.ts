import test from "node:test";
import assert from "node:assert/strict";
import {
  MAIL_DELIVERY_STATUSES,
  classifyMailDeliveryStatus,
  extractQueueIdFromSmtpResponse,
  normalizeMailDeliveryStatus,
} from "../server/lib/mail/deliveryStatus";

test("classifyMailDeliveryStatus maps accepted delivery to ACCEPTED_BY_MTA", () => {
  const status = classifyMailDeliveryStatus({
    delivery: {
      ok: true,
      accepted: ["user@example.com"],
      rejected: [],
      pending: [],
      missing: [],
      response: "250 2.0.0 Ok: queued as 41AB9C",
    },
    errorMessage: null,
  });
  assert.equal(status, MAIL_DELIVERY_STATUSES.ACCEPTED_BY_MTA);
});

test("classifyMailDeliveryStatus maps auth rejection to SPAM_REJECTED", () => {
  const status = classifyMailDeliveryStatus({
    delivery: {
      ok: false,
      accepted: [],
      rejected: ["user@gmail.com"],
      pending: [],
      missing: ["user@gmail.com"],
      response: "550-5.7.26 sender is unauthenticated (SPF and DKIM failed)",
    },
    errorMessage: "gmail rejected unauthenticated sender",
  });
  assert.equal(status, MAIL_DELIVERY_STATUSES.SPAM_REJECTED);
});

test("normalizeMailDeliveryStatus handles legacy sent/failed values", () => {
  assert.equal(normalizeMailDeliveryStatus("sent"), MAIL_DELIVERY_STATUSES.ACCEPTED_BY_MTA);
  assert.equal(normalizeMailDeliveryStatus("failed"), MAIL_DELIVERY_STATUSES.BOUNCED);
});

test("extractQueueIdFromSmtpResponse parses postfix queue id", () => {
  assert.equal(extractQueueIdFromSmtpResponse("250 2.0.0 Ok: queued as 7A91BC"), "7A91BC");
  assert.equal(extractQueueIdFromSmtpResponse("250 ok id=4FB7A98"), "4FB7A98");
  assert.equal(extractQueueIdFromSmtpResponse(""), null);
});

