import assert from "node:assert/strict";
import test from "node:test";

import {
  findPublicIndustrialCatalog,
  PUBLIC_INDUSTRIAL_CATALOG,
} from "../server/lib/industrial/publicProductCatalog";
import { isIndustrialCategoryCode } from "../server/lib/industrial/taxonomy";

test("public industrial catalog exposes useful products without inventing stock", () => {
  assert.ok(PUBLIC_INDUSTRIAL_CATALOG.length >= 20);
  assert.equal(
    new Set(PUBLIC_INDUSTRIAL_CATALOG.map((item) => item.id)).size,
    PUBLIC_INDUSTRIAL_CATALOG.length,
  );

  for (const item of PUBLIC_INDUSTRIAL_CATALOG) {
    assert.equal(isIndustrialCategoryCode(item.categoryCode), true, item.id);
    assert.equal(item.inventoryVerified, false, item.id);
    assert.equal(item.availabilityStatus, "subject_to_confirmation", item.id);
    assert.equal(item.minimumOrderQuantity, null, item.id);
    assert.equal(item.productionCapacityText, null, item.id);
    assert.equal(item.leadTimeText, null, item.id);
    assert.ok(item.media[0]?.startsWith("/tenants/exportunity/industrial/catalog/"));
  }
});

test("documented factory output always carries official evidence", () => {
  const factoryItems = PUBLIC_INDUSTRIAL_CATALOG.filter(
    (item) => item.listingKind === "documented_factory_output",
  );
  assert.ok(factoryItems.length >= 10);
  for (const item of factoryItems) {
    assert.match(item.sourceUrl || "", /^https:\/\/gdiz-benin\.com\//);
    assert.ok(item.sourceLabel?.fr);
    assert.ok(item.sourceLabel?.en);
    assert.equal(item.requestMode, "availability_request");
  }

  const productSpecificMedia = factoryItems
    .filter((item) => item.id !== "curated-factory-gdiz-2025-production")
    .map((item) => item.media[0]);
  assert.ok(new Set(productSpecificMedia).size >= 10);
  assert.ok(
    factoryItems
      .find((item) => item.id === "curated-factory-cashew-kernels")
      ?.media[0]?.endsWith("processed-cashew-kernels.webp"),
  );
});

test("catalog search works across French and English industrial terms", () => {
  assert.ok(
    findPublicIndustrialCatalog({ query: "roulements" }).some((item) =>
      item.id.includes("bearings"),
    ),
  );
  assert.ok(
    findPublicIndustrialCatalog({ query: "cashew" }).some((item) =>
      item.id.includes("cashew"),
    ),
  );
  assert.ok(
    findPublicIndustrialCatalog({
      classification: "export_ready_factory_product",
    }).every((item) => item.classification === "export_ready_factory_product"),
  );
});
