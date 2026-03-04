import express from "express";
import { randomUUID } from "crypto";
import { db } from "@db";
import { sql } from "drizzle-orm";
import stampedGoldRouter from "../server/routes/stamped-gold";
import publicRouter from "../server/routes/public";

const now = Date.now();
const runId = `smoke-${now}`;

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function createUserSession(kind: "admin" | "partner") {
  const email = `${kind}.${runId}@example.local`;
  const role = kind === "admin" ? "admin" : "jewelry_manufacturer";
  const roles = kind === "admin" ? ["admin"] : ["jewellery partner"];
  const permissions = kind === "admin" ? ["admin:*"] : ["stamped_gold.partner"];
  const mode = kind === "admin" ? "admin" : "jewelry_manufacturer";
  const inserted = await db.execute(sql`
    insert into ece_users (
      email, password_hash, display_name, role, roles, permissions,
      is_active, email_verified, verification_level, current_mode, created_at, updated_at
    ) values (
      ${email},
      'smoke-hash',
      ${kind === "admin" ? "Smoke Admin" : "Smoke Partner"},
      ${role}::ece_user_role,
      ${JSON.stringify(roles)}::jsonb,
      ${JSON.stringify(permissions)}::jsonb,
      true,
      true,
      'BASIC_VERIFIED'::verification_level,
      ${mode},
      now(),
      now()
    )
    returning id
  `);
  const userId = Number((inserted as any)?.rows?.[0]?.id || 0);
  expect(userId > 0, `failed to create ${kind} user`);

  await db.execute(sql`
    insert into users (id, display_name, email, role, account_type, created_at, updated_at)
    values (
      ${userId},
      ${kind === "admin" ? "Smoke Admin" : "Smoke Partner"},
      ${email},
      'admin',
      ${kind === "admin" ? "Chairman" : "Operator"},
      now(),
      now()
    )
    on conflict (id) do nothing
  `);

  const token = `${kind}-${randomUUID()}`;
  await db.execute(sql`
    insert into ece_sessions (user_id, token, expires_at, created_at)
    values (${userId}, ${token}, now() + interval '2 hours', now())
  `);
  return { userId, token };
}

async function main() {
  const tenantRes = await db.execute(sql`select id, key, name from tenants where key = 'bdo' limit 1`);
  const tenant = (tenantRes as any)?.rows?.[0];
  expect(Boolean(tenant?.id), "bdo tenant not found");
  const tenantId = Number(tenant.id);

  const skuRes = await db.execute(sql`
    select s.id as sku_id, sp.seller_id as seller_id, s.karat
    from stamped_gold_skus s
    join seller_products sp on sp.id = s.product_id
    where s.tenant_id = ${tenantId}
      and coalesce(s.is_active, true) = true
      and s.weight_grams is not null
    order by s.created_at desc
    limit 1
  `);
  const skuRow = (skuRes as any)?.rows?.[0];
  expect(Boolean(skuRow?.sku_id), "active sku with linked product/seller not found");
  const skuId = String(skuRow.sku_id);
  const sellerId = Number(skuRow.seller_id);
  if (skuRow.karat == null) {
    await db.execute(sql`update stamped_gold_skus set karat = 24 where id = ${skuId}::uuid`);
  }

  const partnerRes = await db.execute(sql`
    select id from partner_jewellers
    where tenant_id = ${tenantId} and coalesce(is_active, true) = true
    order by created_at desc
    limit 1
  `);
  const partnerJewellerId = String((partnerRes as any)?.rows?.[0]?.id || "");
  expect(Boolean(partnerJewellerId), "active partner jeweller not found");

  const admin = await createUserSession("admin");
  const partner = await createUserSession("partner");

  await db.execute(sql`
    insert into partner_jeweller_users (tenant_id, partner_jeweller_id, user_id, role, created_at)
    values (${tenantId}, ${partnerJewellerId}::uuid, ${partner.userId}, 'OWNER', now())
    on conflict (tenant_id, partner_jeweller_id, user_id) do nothing
  `);

  const hasPaymentStatusRes = await db.execute(sql`
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='marketplace_orders'
      and column_name='payment_status'
    limit 1
  `);
  const hasPaymentStatus = Boolean((hasPaymentStatusRes as any)?.rows?.[0]);

  const pendingOrderNumber = `SMOKE-PENDING-${now}`;
  const pendingOrderInsert = hasPaymentStatus
    ? await db.execute(sql`
        insert into marketplace_orders (
          tenant_id, order_number, buyer_user_id, seller_id,
          subtotal, total, status, payment_status, created_at, updated_at
        ) values (
          ${tenantId}, ${pendingOrderNumber}, ${admin.userId}, ${sellerId},
          1000, 1000, 'pending', 'PENDING', now(), now()
        )
        returning id
      `)
    : await db.execute(sql`
        insert into marketplace_orders (
          tenant_id, order_number, buyer_user_id, seller_id,
          subtotal, total, status, created_at, updated_at
        ) values (
          ${tenantId}, ${pendingOrderNumber}, ${admin.userId}, ${sellerId},
          1000, 1000, 'pending', now(), now()
        )
        returning id
      `);
  const pendingOrderId = Number((pendingOrderInsert as any)?.rows?.[0]?.id || 0);
  expect(pendingOrderId > 0, "failed to create pending order");

  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use((req: any, _res, next) => {
    req.tenant = { id: tenantId, key: String(tenant.key), name: String(tenant.name) };
    next();
  });
  app.use("/api/stamped-gold", stampedGoldRouter);
  app.use("/", publicRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;

  const checks: Array<{ name: string; pass: boolean; details?: string }> = [];

  async function call(name: string, path: string, opts: { method?: string; token?: string; body?: any; expectStatus?: number }) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    const response = await fetch(`${base}${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await response.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    const expected = opts.expectStatus ?? 200;
    const pass = response.status === expected;
    checks.push({ name, pass, details: `status=${response.status} expected=${expected}` });
    if (!pass) {
      throw new Error(`${name} failed: status=${response.status}, body=${JSON.stringify(json)}`);
    }
    return json;
  }

  try {
    const blocked = await call(
      "payment gate blocks unconfirmed order",
      "/api/stamped-gold/items/generate",
      {
        method: "POST",
        token: admin.token,
        expectStatus: 400,
        body: { sku_id: skuId, count: 1, order_id: pendingOrderId },
      },
    );
    expect(blocked?.code === "PROCESS_BLOCKED", "blocked response missing PROCESS_BLOCKED code");

    const quoteResp = await call("quote creation", "/api/stamped-gold/quote/bar", {
      method: "POST",
      token: admin.token,
      expectStatus: 201,
      body: { sku_id: skuId },
    });
    const quoteId = Number(quoteResp?.quote?.id || 0);
    expect(quoteId > 0, "quote id missing");

    const orderResp = await call("order placement with active quote", "/api/stamped-gold/orders/place", {
      method: "POST",
      token: admin.token,
      expectStatus: 201,
      body: {
        quote_id: quoteId,
        seller_id: sellerId,
        quantity: 1,
        buyer_name: "Smoke Buyer",
        buyer_phone: "+22900000002",
        buyer_email: "smoke.buyer@example.local",
      },
    });
    const confirmedOrderId = Number(orderResp?.order?.id || 0);
    expect(confirmedOrderId > 0, "confirmed order id missing");

    const generatedResp = await call("generate item with confirmed order", "/api/stamped-gold/items/generate", {
      method: "POST",
      token: admin.token,
      expectStatus: 201,
      body: { sku_id: skuId, count: 1, order_id: confirmedOrderId },
    });
    const createdItem = Array.isArray(generatedResp?.created) ? generatedResp.created[0] : null;
    const itemId = String(createdItem?.id || "");
    expect(Boolean(itemId), "generated item id missing");

    await call("assign item to partner", `/api/stamped-gold/items/${itemId}/assign`, {
      method: "POST",
      token: admin.token,
      expectStatus: 200,
      body: { partner_jeweller_id: partnerJewellerId },
    });

    await call("partner transition ASSIGNED->ENGRAVED", `/api/stamped-gold/items/${itemId}/status`, {
      method: "POST",
      token: partner.token,
      expectStatus: 200,
      body: { status: "ENGRAVED" },
    });

    await call("partner transition ENGRAVED->SEALED", `/api/stamped-gold/items/${itemId}/status`, {
      method: "POST",
      token: partner.token,
      expectStatus: 200,
      body: { status: "SEALED" },
    });

    const partnerBlocked = await call("partner blocked from CERTIFIED", `/api/stamped-gold/items/${itemId}/status`, {
      method: "POST",
      token: partner.token,
      expectStatus: 403,
      body: { status: "CERTIFIED" },
    });
    expect(partnerBlocked?.code === "PROCESS_BLOCKED", "partner block did not return PROCESS_BLOCKED");

    const certifyResp = await call("admin transition SEALED->CERTIFIED + certificate", `/api/stamped-gold/items/${itemId}/status`, {
      method: "POST",
      token: admin.token,
      expectStatus: 200,
      body: { status: "CERTIFIED", expert_id: admin.userId },
    });
    expect(Boolean(certifyResp?.certificate?.id), "certificate not generated");

    await call("admin transition CERTIFIED->IN_VAULT", `/api/stamped-gold/items/${itemId}/status`, {
      method: "POST",
      token: admin.token,
      expectStatus: 200,
      body: { status: "IN_VAULT", owner_user_id: admin.userId },
    });

    await call("admin transition IN_VAULT->DELIVERED", `/api/stamped-gold/items/${itemId}/status`, {
      method: "POST",
      token: admin.token,
      expectStatus: 200,
      body: { status: "DELIVERED" },
    });

    const verifyResp = await call("root public verify route", `/public/verify/${createdItem.qr_token}`, {
      method: "GET",
      expectStatus: 200,
    });
    expect(verifyResp?.valid === true, "public verify did not return valid=true");

    await call("admin quote expiry endpoint", "/api/stamped-gold/quotes/expire", {
      method: "POST",
      token: admin.token,
      expectStatus: 200,
      body: {},
    });

    console.log(JSON.stringify({ ok: true, runId, checks }, null, 2));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error), runId }, null, 2));
  process.exit(1);
});
