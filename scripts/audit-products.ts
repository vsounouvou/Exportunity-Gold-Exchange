import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

async function auditProducts() {
  console.log("=== PRODUCT DATA AUDIT ===\n");

  // 1. Check for products with mismatched shop associations
  console.log("1. Checking product-shop associations...");

  const productsWithShops = await db.execute(sql`
    SELECT
      p.id as product_id,
      p.name as product_name,
      p.shop_id,
      s.id as actual_shop_id,
      s.name as shop_name,
      s.company_id as shop_company_id,
      p.company_id as product_company_id
    FROM products p
    LEFT JOIN shops s ON p.shop_id = s.id
    WHERE p.shop_id IS NOT NULL
    LIMIT 100
  `);

  console.log(`Found ${productsWithShops.rows.length} products with shop associations`);

  // Find mismatches
  const mismatches = productsWithShops.rows.filter((row: any) => {
    return row.shop_id && !row.actual_shop_id; // Shop doesn't exist
  });

  if (mismatches.length > 0) {
    console.log(`\n⚠️  Found ${mismatches.length} products with invalid shop_id:`);
    mismatches.slice(0, 10).forEach((p: any) => {
      console.log(`  - Product ${p.product_id} "${p.product_name}" → shop_id=${p.shop_id} (DOES NOT EXIST)`);
    });
  } else {
    console.log("  ✅ All products have valid shop associations");
  }

  // 2. Check for products with mismatched company_id
  const companyMismatches = productsWithShops.rows.filter((row: any) => {
    return row.shop_company_id && row.product_company_id &&
           row.shop_company_id !== row.product_company_id;
  });

  if (companyMismatches.length > 0) {
    console.log(`\n⚠️  Found ${companyMismatches.length} products with company_id mismatch:`);
    companyMismatches.slice(0, 10).forEach((p: any) => {
      console.log(`  - Product ${p.product_id} company=${p.product_company_id} but shop company=${p.shop_company_id}`);
    });
  } else {
    console.log("  ✅ All products match their shop's company");
  }

  // 3. Check for products without descriptions
  const noDescription = await db.execute(sql`
    SELECT id, name, description
    FROM products
    WHERE description IS NULL OR description = '' OR LENGTH(TRIM(description)) < 10
    LIMIT 50
  `);

  console.log(`\n3. Checking product descriptions...`);
  console.log(`Found ${noDescription.rows.length} products with missing/short descriptions`);
  if (noDescription.rows.length > 0) {
    console.log("  ⚠️  Sample products needing descriptions:");
    noDescription.rows.slice(0, 5).forEach((p: any) => {
      console.log(`  - Product ${p.id}: "${p.name}" (desc: "${p.description || 'EMPTY'}")`);
    });
  }

  // 4. Check for products without images
  const noImages = await db.execute(sql`
    SELECT id, name, images
    FROM products
    WHERE images IS NULL OR jsonb_array_length(images) = 0
    LIMIT 50
  `);

  console.log(`\n4. Checking product images...`);
  console.log(`Found ${noImages.rows.length} products without images`);
  if (noImages.rows.length > 0) {
    console.log("  ⚠️  Sample products needing images:");
    noImages.rows.slice(0, 5).forEach((p: any) => {
      console.log(`  - Product ${p.id}: "${p.name}"`);
    });
  }

  // 5. Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Products with invalid shop_id: ${mismatches.length}`);
  console.log(`Products with company mismatch: ${companyMismatches.length}`);
  console.log(`Products with missing descriptions: ${noDescription.rows.length}`);
  console.log(`Products without images: ${noImages.rows.length}`);

  if (mismatches.length > 0 || companyMismatches.length > 0) {
    console.log("\n⚠️  ACTION REQUIRED: Run fix script to clean up data");
    return 1;
  } else {
    console.log("\n✅ Product data is clean!");
    return 0;
  }
}

auditProducts()
  .then((exitCode) => process.exit(exitCode))
  .catch((err) => {
    console.error("Audit failed:", err);
    process.exit(1);
  });
