import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

async function fixMarketplaceData() {
  console.log("=== FIXING MARKETPLACE DATA ===\n");

  try {
    // 1. Fix products with invalid seller references
    console.log("1. Checking for orphaned products (seller doesn't exist)...");

    const orphanedProducts = await db.execute(sql`
      SELECT sp.id, sp.name, sp.seller_id
      FROM seller_products sp
      LEFT JOIN sellers s ON sp.seller_id = s.id
      WHERE sp.seller_id IS NOT NULL AND s.id IS NULL
    `);

    if (orphanedProducts.rows.length > 0) {
      console.log(`   Found ${orphanedProducts.rows.length} orphaned products`);
      console.log("   Setting seller_id to NULL for these products...");

      const orphanedIds = orphanedProducts.rows.map((r: any) => r.id);
      await db.execute(sql`
        UPDATE seller_products
        SET seller_id = NULL, status = 'draft'
        WHERE id = ANY(${orphanedIds})
      `);

      console.log(`   ✅ Fixed ${orphanedProducts.rows.length} orphaned products`);
    } else {
      console.log("   ✅ No orphaned products found");
    }

    // 2. Fix products with mismatched tenant_id
    console.log("\n2. Fixing tenant_id mismatches...");

    const tenantMismatches = await db.execute(sql`
      SELECT sp.id, sp.name, sp.tenant_id as product_tenant, s.tenant_id as seller_tenant
      FROM seller_products sp
      JOIN sellers s ON sp.seller_id = s.id
      WHERE sp.tenant_id != s.tenant_id
    `);

    if (tenantMismatches.rows.length > 0) {
      console.log(`   Found ${tenantMismatches.rows.length} products with tenant mismatch`);
      console.log("   Aligning product tenant_id with seller tenant_id...");

      await db.execute(sql`
        UPDATE seller_products sp
        SET tenant_id = s.tenant_id
        FROM sellers s
        WHERE sp.seller_id = s.id AND sp.tenant_id != s.tenant_id
      `);

      console.log(`   ✅ Fixed ${tenantMismatches.rows.length} tenant mismatches`);
    } else {
      console.log("   ✅ No tenant mismatches found");
    }

    // 3. Fix products with invalid category references
    console.log("\n3. Checking for invalid category references...");

    const invalidCategories = await db.execute(sql`
      SELECT sp.id, sp.name, sp.category_id
      FROM seller_products sp
      LEFT JOIN product_categories pc ON sp.category_id = pc.id
      WHERE sp.category_id IS NOT NULL AND pc.id IS NULL
    `);

    if (invalidCategories.rows.length > 0) {
      console.log(`   Found ${invalidCategories.rows.length} products with invalid categories`);
      console.log("   Setting category_id to NULL...");

      const invalidCatIds = invalidCategories.rows.map((r: any) => r.id);
      await db.execute(sql`
        UPDATE seller_products
        SET category_id = NULL
        WHERE id = ANY(${invalidCatIds})
      `);

      console.log(`   ✅ Fixed ${invalidCategories.rows.length} products with invalid categories`);
    } else {
      console.log("   ✅ No invalid category references found");
    }

    // 4. Generate slugs for products without them
    console.log("\n4. Generating missing slugs...");

    const noSlug = await db.execute(sql`
      SELECT id, name
      FROM seller_products
      WHERE slug IS NULL OR slug = '' OR LENGTH(TRIM(slug)) = 0
    `);

    if (noSlug.rows.length > 0) {
      console.log(`   Found ${noSlug.rows.length} products without slugs`);

      for (const product of noSlug.rows) {
        const p = product as any;
        const slug = p.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          + `-${p.id}`;

        await db.execute(sql`
          UPDATE seller_products
          SET slug = ${slug}
          WHERE id = ${p.id}
        `);
      }

      console.log(`   ✅ Generated slugs for ${noSlug.rows.length} products`);
    } else {
      console.log("   ✅ All products have slugs");
    }

    // 5. Summary
    console.log("\n=== SUMMARY ===");
    const totalProducts = await db.execute(sql`SELECT COUNT(*) as count FROM seller_products`);
    const activeProducts = await db.execute(sql`SELECT COUNT(*) as count FROM seller_products WHERE status = 'active'`);
    const draftProducts = await db.execute(sql`SELECT COUNT(*) as count FROM seller_products WHERE status = 'draft'`);

    console.log(`Total products: ${(totalProducts.rows[0] as any).count}`);
    console.log(`Active products: ${(activeProducts.rows[0] as any).count}`);
    console.log(`Draft products: ${(draftProducts.rows[0] as any).count}`);
    console.log("\n✅ Marketplace data cleanup complete!");

  } catch (error) {
    console.error("❌ Error during fix:", error);
    throw error;
  }
}

fixMarketplaceData()
  .then(() => {
    console.log("\n✅ All fixes applied successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Fix failed:", err);
    process.exit(1);
  });
