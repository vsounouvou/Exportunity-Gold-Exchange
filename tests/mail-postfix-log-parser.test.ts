import test from "node:test";
import assert from "node:assert/strict";
import { MAIL_DELIVERY_STATUSES } from "../server/lib/mail/deliveryStatus";
import { parsePostfixDeliveryEvent, parsePostfixDeliveryEvents } from "../server/lib/mail/postfixLogParser";

test("parsePostfixDeliveryEvent parses delivered line", () => {
  const event = parsePostfixDeliveryEvent(
    "postfix/smtp[123]: 4A1B2C3D4E: to=<user@example.com>, relay=mx.example.com[1.2.3.4]:25, delay=1.2, dsn=2.0.0, status=sent (250 2.0.0 Ok: queued as 88AA77)",
  );
  assert.ok(event);
  assert.equal(event?.queueId, "4A1B2C3D4E");
  assert.equal(event?.recipient, "user@example.com");
  assert.equal(event?.deliveryStatus, MAIL_DELIVERY_STATUSES.DELIVERED_REMOTE_ACCEPTED);
});

test("parsePostfixDeliveryEvent parses unauthenticated rejection", () => {
  const event = parsePostfixDeliveryEvent(
    "postfix/smtp[123]: 99FFAA11BC: to=<user@gmail.com>, relay=gmail-smtp-in.l.google.com[74.125.200.27]:25, delay=1.4, dsn=5.7.26, status=bounced (host gmail-smtp-in.l.google.com said: 550-5.7.26 This message does not pass SPF or DKIM checks)",
  );
  assert.ok(event);
  assert.equal(event?.deliveryStatus, MAIL_DELIVERY_STATUSES.SPAM_REJECTED);
});

test("parsePostfixDeliveryEvents filters non-delivery lines", () => {
  const events = parsePostfixDeliveryEvents([
    "random line",
    "postfix/smtp[10]: A1B2C3D4E5: to=<x@example.org>, relay=mx, dsn=4.4.1, status=deferred (connect timeout)",
    "another line",
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].deliveryStatus, MAIL_DELIVERY_STATUSES.DEFERRED);
});

