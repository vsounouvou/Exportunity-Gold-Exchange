import assert from "node:assert/strict";
import test from "node:test";

import { deriveTalkExecutionState } from "../client/src/lib/talk-execution-state";

test("a qualified French lead shows the real contact gate without claiming sourcing", () => {
  const state = deriveTalkExecutionState({
    language: "fr",
    crm: { status: "lead_captured", stage: "new" },
    retrieval: {
      status: "no_verified_match",
      verifiedMatchCount: 0,
      publicMatchCount: 0,
    },
  });

  assert.ok(state);
  assert.equal(state.locale, "fr");
  assert.match(state.opportunity || "", /attend le contact/i);
  assert.match(state.nextStep, /WhatsApp ou un email/i);
  assert.doesNotMatch(JSON.stringify(state), /contacté|devis reçu/i);
});

test("a governed sourcing task exposes approval, no outreach, and no quote", () => {
  const state = deriveTalkExecutionState({
    language: "en",
    crm: {
      status: "opportunity_opened",
      stage: "qualified",
      opportunityReferenceCode: "OPP-TREQ-20260821-ABC123",
    },
    sourcingTask: {
      status: "review_task_ready",
      publicTaskId: "INT-20260821-001",
      state: "CREATED",
      requiresHumanApproval: true,
      outboundActionsAllowed: false,
    },
    supplierCandidateScreening: {
      status: "candidates_ready",
      candidateCount: 2,
      requiresHumanApproval: true,
      supplierIdentityPublic: false,
      outboundActionsAllowed: false,
      externalDiscoveryStarted: false,
      quoteCreated: false,
    },
  });

  assert.ok(state);
  assert.match(state.opportunity || "", /OPP-TREQ-20260821-ABC123/);
  assert.match(state.sourcingReview || "", /human approval required/i);
  assert.match(state.supplierScreening || "", /2 verified internal supplier candidates/i);
  assert.equal(state.outbound, "Not started");
  assert.equal(state.quote, "Not created");
  assert.match(state.nextStep, /review candidates before any contact/i);
});

test("zero internal candidates never implies that external discovery started", () => {
  const state = deriveTalkExecutionState({
    language: "en",
    sourcingTask: {
      status: "review_task_ready",
      state: "CREATED",
      requiresHumanApproval: true,
      outboundActionsAllowed: false,
    },
    supplierCandidateScreening: {
      status: "no_verified_candidate",
      candidateCount: 0,
      requiresHumanApproval: true,
      supplierIdentityPublic: false,
      outboundActionsAllowed: false,
      externalDiscoveryStarted: false,
      quoteCreated: false,
    },
  });

  assert.ok(state);
  assert.match(state.supplierScreening || "", /No verified internal supplier/i);
  assert.match(state.nextStep, /approval is required before external supplier discovery/i);
  assert.equal(state.outbound, "Not started");
});

test("missing native agent assignments become an explicit administrator action", () => {
  const state = deriveTalkExecutionState({
    language: "en",
    sourcingTask: {
      status: "agent_assignment_missing",
      requiresHumanApproval: true,
      outboundActionsAllowed: false,
    },
  });

  assert.ok(state);
  assert.match(state.sourcingReview || "", /agent assignment missing/i);
  assert.match(state.nextStep, /assign the Commercial and Sourcing agents/i);
  assert.doesNotMatch(JSON.stringify(state), /mindbase/i);
});
