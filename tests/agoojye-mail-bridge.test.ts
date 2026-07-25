import assert from "node:assert/strict";
import test from "node:test";

import {
  AGOOJIYE_HUMAN_MAILBOX_PROFILES,
  agoojiyeConversationKey,
  agoojiyeMailboxAddress,
  agoojiyeMaildirPath,
  canUseExactMailboxSender,
  extractHardBounceRecipient,
  isExplicitOptOutMessage,
} from "../server/lib/agoojye/mailBridgePolicy";

test("AGOOJIYE human mailbox profiles are stable and tenant-scoped", () => {
  assert.deepEqual(
    AGOOJIYE_HUMAN_MAILBOX_PROFILES.map((profile) => agoojiyeMailboxAddress(profile.localPart)),
    [
      "regis@agoojiye.com",
      "soriane@agoojiye.com",
      "maryse@agoojiye.com",
      "christian@agoojiye.com",
      "vital@agoojiye.com",
      "vs@agoojiye.com",
    ],
  );
  assert.equal(agoojiyeMaildirPath("Regis"), "/var/mail/agoojiye.com/regis");
});

test("exact sender policy only allows approved AGOOJIYE human mailboxes", () => {
  assert.equal(
    canUseExactMailboxSender({ tenantKey: "agoojye", email: "regis@agoojiye.com", senderAddressMode: "mailbox_exact" }),
    true,
  );
  assert.equal(
    canUseExactMailboxSender({ tenantKey: "exportunity", email: "regis@agoojiye.com", senderAddressMode: "mailbox_exact" }),
    false,
  );
  assert.equal(
    canUseExactMailboxSender({ tenantKey: "agoojye", email: "attacker@agoojiye.com", senderAddressMode: "mailbox_exact" }),
    false,
  );
  assert.equal(
    canUseExactMailboxSender({ tenantKey: "agoojye", email: "marise@agoojiye.com", senderAddressMode: "mailbox_exact" }),
    false,
  );
});

test("opt-outs and hard-bounce recipients are recognized", () => {
  assert.equal(isExplicitOptOutMessage("Merci de ne me contactez plus."), true);
  assert.equal(isExplicitOptOutMessage("Merci pour votre message."), false);
  assert.equal(
    extractHardBounceRecipient("Final-Recipient: rfc822; prospect@example.com\nStatus: 5.1.1"),
    "prospect@example.com",
  );
  assert.equal(extractHardBounceRecipient("Delivery completed"), null);
});

test("conversation keys deduplicate alias fan-out without merging unrelated fallback threads", () => {
  assert.equal(agoojiyeConversationKey("<Message-1@Example.com>", 10, 20), "rfc:<message-1@example.com>");
  assert.equal(agoojiyeConversationKey(null, 10, 20), "mail-engine:10:20");
  assert.notEqual(agoojiyeConversationKey(null, 10, 20), agoojiyeConversationKey(null, 11, 20));
});
