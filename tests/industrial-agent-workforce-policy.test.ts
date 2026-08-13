import assert from "node:assert/strict";
import test from "node:test";

import {
  industrialSpecialistKeys,
  resolveIndustrialRequirementHandoffPlan,
} from "../server/lib/industrial/operationsHandoffPolicy";
import {
  commercialStaffingRecommendations,
  commercialStaffingRoleTitles,
} from "../server/lib/industrial/workforcePlanningPolicy";

test("raw-material demand routes to a commercial team, not a CAD-only flow", () => {
  const plan = resolveIndustrialRequirementHandoffPlan({
    requirementType: "raw_material",
    urgency: "standard",
  });

  assert.equal(plan.primaryAgentKey, "commercial");
  assert.deepEqual(industrialSpecialistKeys(plan), [
    "sourcing",
    "quality",
    "logistics",
    "compliance",
    "finance",
  ]);
  assert.equal(plan.participantAgentKeys.includes("technical"), false);
});

test("palm-oil demand proposes the dedicated desk without inventing machinery staffing", () => {
  const roles = commercialStaffingRoleTitles({
    intent: "SOURCE_PRODUCT",
    productCategory: "palm_oil",
    requirementType: "raw_material",
  });

  assert.deepEqual(roles, ["Palm Oil Desk Agent"]);
  assert.equal(roles.includes("Machinery and Industrial Equipment Desk Agent"), false);
  assert.deepEqual(
    commercialStaffingRecommendations({
      intent: "SOURCE_PRODUCT",
      productCategory: "palm_oil",
      requirementType: "raw_material",
    }).map(({ roleTitle, signalType, demandThreshold }) => ({ roleTitle, signalType, demandThreshold })),
    [{
      roleTitle: "Palm Oil Desk Agent",
      signalType: "recurring_demand",
      demandThreshold: 10,
    }],
  );
});

test("a missing execution specialist is immediately reviewable while a new desk accumulates demand", () => {
  assert.deepEqual(
    commercialStaffingRecommendations({
      intent: "BUY_PRODUCT",
      productCategory: "cocoa",
      requirementType: "raw_material",
      missingSpecialistKeys: ["logistics"],
    }).map(({ roleTitle, signalType, demandThreshold }) => ({ roleTitle, signalType, demandThreshold })),
    [
      {
        roleTitle: "Cocoa Desk Agent",
        signalType: "recurring_demand",
        demandThreshold: 10,
      },
      {
        roleTitle: "Freight Routing Agent",
        signalType: "critical_capability_gap",
        demandThreshold: 1,
      },
    ],
  );
});

test("export demand proposes buyer intelligence while ordinary buying does not", () => {
  assert.deepEqual(
    commercialStaffingRoleTitles({
      intent: "FIND_BUYER",
      productCategory: "cashew",
      requirementType: "export_quotation",
    }),
    ["Cashew Desk Agent", "Buyer Intelligence Lead"],
  );
  assert.deepEqual(
    commercialStaffingRoleTitles({
      intent: "BUY_PRODUCT",
      productCategory: "cashew",
      requirementType: "raw_material",
    }),
    ["Cashew Desk Agent"],
  );
});
