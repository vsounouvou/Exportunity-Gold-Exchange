#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";

const baseUrl = String(process.env.BASE_URL || process.env.SMOKE_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const authToken = String(process.env.AUTH_TOKEN || process.env.E2E_TOKEN || process.env.ECE_TOKEN || "").trim();
const tenantKey = String(process.env.TENANT_KEY || "bdo").trim();
const auditTag = String(process.env.AUDIT_TAG || `gold-audit-${Date.now()}`);
const allowMutation = String(process.env.ALLOW_MUTATION || "0").trim() === "1";
const outputDir = String(process.env.OUTPUT_DIR || "").trim();

function buildHeaders(extra = {}) {
  const headers = {
    "content-type": "application/json",
    "x-chairman-admin-override": "1",
    "x-tenant-key": tenantKey,
    ...extra,
  };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  return headers;
}

async function requestJson(endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    endpoint,
    raw,
    json,
  };
}

function toErrorText(resp) {
  if (!resp) return "no response";
  if (resp?.json?.message) return String(resp.json.message);
  if (resp?.json?.error) return String(resp.json.error);
  return String(resp.raw || `HTTP ${resp.status}`);
}

function makeCheck(id, passed, details, meta = {}) {
  return {
    id,
    passed: Boolean(passed),
    details: String(details || ""),
    ...meta,
  };
}

function makeSkipped(id, reason, meta = {}) {
  return {
    id,
    passed: false,
    skipped: true,
    details: String(reason || "skipped"),
    ...meta,
  };
}

function checksToMarkdown(checks) {
  const lines = ["# Gold Stamping Audit", "", `- Base URL: \`${baseUrl}\``, `- Tenant: \`${tenantKey}\``, `- Tag: \`${auditTag}\``, ""];
  for (const check of checks) {
    const marker = check.skipped ? "SKIP" : check.passed ? "PASS" : "FAIL";
    const endpoint = check.endpoint ? ` (\`${check.endpoint}\`)` : "";
    lines.push(`- [${marker}] ${check.id}${endpoint}: ${check.details}`);
  }
  return lines.join("\n");
}

async function main() {
  const checks = [];

  const featuresResp = await requestJson("/api/admin/features");
  if (featuresResp.ok) {
    const features = featuresResp.json?.features || {};
    checks.push(
      makeCheck(
        "feature.gold_stamping",
        features["feature.gold_stamping"] === true,
        `feature.gold_stamping=${String(features["feature.gold_stamping"])}`,
        { endpoint: featuresResp.endpoint, status: featuresResp.status },
      ),
    );
  } else {
    checks.push(
      makeCheck(
        "feature.flags.read",
        false,
        `unable to read feature flags: ${toErrorText(featuresResp)}`,
        { endpoint: featuresResp.endpoint, status: featuresResp.status },
      ),
    );
  }

  const skusResp = await requestJson("/api/stamped-gold/skus");
  if (!skusResp.ok) {
    checks.push(
      makeCheck(
        "sku.list",
        false,
        `failed: ${toErrorText(skusResp)}`,
        { endpoint: skusResp.endpoint, status: skusResp.status },
      ),
    );
  } else {
    const skus = Array.isArray(skusResp.json?.skus) ? skusResp.json.skus : [];
    const countersValid = skus.every(
      (sku) =>
        typeof sku?.mintedTotal === "number" &&
        typeof sku?.inStock === "number" &&
        typeof sku?.reserved === "number" &&
        typeof sku?.delivered === "number",
    );
    checks.push(
      makeCheck(
        "sku.list",
        true,
        `loaded ${skus.length} sku(s)`,
        { endpoint: skusResp.endpoint, status: skusResp.status },
      ),
    );
    checks.push(
      makeCheck(
        "sku.counters",
        countersValid,
        countersValid ? "mintedTotal/inStock/reserved/delivered present" : "missing normalized counters on one or more SKUs",
        { endpoint: skusResp.endpoint, status: skusResp.status },
      ),
    );
  }

  const jewellersResp = await requestJson("/api/stamped-gold/jewellers/public", {
    method: "GET",
    headers: {
      "x-tenant-key": tenantKey,
    },
  });
  if (jewellersResp.ok) {
    const jewellers = Array.isArray(jewellersResp.json?.jewellers) ? jewellersResp.json.jewellers : [];
    const partnerLockPass =
      tenantKey.toLowerCase() !== "bdo" ||
      jewellers.every((j) => String(j?.name || "").toUpperCase() === "LE RUBIS SERTISSEUR");
    checks.push(
      makeCheck(
        "jewellers.public",
        true,
        `loaded ${jewellers.length} active partner(s)`,
        { endpoint: jewellersResp.endpoint, status: jewellersResp.status },
      ),
    );
    checks.push(
      makeCheck(
        "authorized.partner.lock",
        partnerLockPass,
        partnerLockPass
          ? "only authorized partner visible for BDO"
          : "non-authorized partner visible in public list",
        { endpoint: jewellersResp.endpoint, status: jewellersResp.status },
      ),
    );
  } else {
    checks.push(
      makeCheck(
        "jewellers.public",
        false,
        `failed: ${toErrorText(jewellersResp)}`,
        { endpoint: jewellersResp.endpoint, status: jewellersResp.status },
      ),
    );
  }

  const itemsResp = await requestJson("/api/stamped-gold/items?limit=20");
  if (!itemsResp.ok) {
    checks.push(
      makeCheck(
        "item.list",
        false,
        `failed: ${toErrorText(itemsResp)}`,
        { endpoint: itemsResp.endpoint, status: itemsResp.status },
      ),
    );
  } else {
    const items = Array.isArray(itemsResp.json?.items) ? itemsResp.json.items : [];
    checks.push(
      makeCheck(
        "item.list",
        true,
        `loaded ${items.length} item(s)`,
        { endpoint: itemsResp.endpoint, status: itemsResp.status },
      ),
    );

    const candidate = items.find((item) => item?.serialCode || item?.serial);
    if (!candidate) {
      checks.push(makeSkipped("verify.fallback", "no item with serial available", { endpoint: "/api/stamped-gold/verify/*" }));
    } else {
      const serial = String(candidate.serialCode || candidate.serial || "").trim();
      const verifyBySerial = await requestJson(`/api/stamped-gold/verify/${encodeURIComponent(serial)}`);
      const verifyByTokenFallback = await requestJson(`/api/stamped-gold/verify/token/${encodeURIComponent(serial)}`);
      const publicVerifyFallback = await requestJson(`/public/verify/${encodeURIComponent(serial)}`, {
        headers: {
          "x-tenant-key": tenantKey,
          "content-type": "application/json",
        },
      });

      checks.push(
        makeCheck(
          "verify.serial",
          verifyBySerial.ok && verifyBySerial.json?.valid === true,
          verifyBySerial.ok ? "serial lookup valid=true" : toErrorText(verifyBySerial),
          { endpoint: verifyBySerial.endpoint, status: verifyBySerial.status },
        ),
      );
      checks.push(
        makeCheck(
          "verify.token.fallback",
          verifyByTokenFallback.ok && verifyByTokenFallback.json?.valid === true,
          verifyByTokenFallback.ok ? "token endpoint resolves serial fallback" : toErrorText(verifyByTokenFallback),
          { endpoint: verifyByTokenFallback.endpoint, status: verifyByTokenFallback.status },
        ),
      );
      checks.push(
        makeCheck(
          "verify.public.fallback",
          publicVerifyFallback.ok && publicVerifyFallback.json?.valid === true,
          publicVerifyFallback.ok ? "public verify resolves serial fallback" : toErrorText(publicVerifyFallback),
          { endpoint: publicVerifyFallback.endpoint, status: publicVerifyFallback.status },
        ),
      );

      const pickupScanResp = await requestJson("/api/pickup/scan", {
        method: "POST",
        body: JSON.stringify({
          serialCode: serial,
        }),
      });
      checks.push(
        makeCheck(
          "pickup.scan.match",
          pickupScanResp.ok && pickupScanResp.json?.valid === true,
          pickupScanResp.ok ? "pickup scanner resolved item" : toErrorText(pickupScanResp),
          { endpoint: pickupScanResp.endpoint, status: pickupScanResp.status },
        ),
      );
    }
  }

  if (!allowMutation) {
    checks.push(makeSkipped("mint.contract", "set ALLOW_MUTATION=1 to execute mint checks", { endpoint: "/api/stamped-gold/items/mint" }));
    checks.push(makeSkipped("pickup.confirm.validation", "set ALLOW_MUTATION=1 to execute pickup confirm checks", { endpoint: "/api/pickup/confirm" }));
  } else {
    const skus = Array.isArray(skusResp.json?.skus) ? skusResp.json.skus : [];
    const activeSku = skus.find((sku) => sku?.isActive !== false);
    if (!activeSku?.id) {
      checks.push(makeCheck("mint.contract", false, "no active SKU found for mint smoke", { endpoint: "/api/stamped-gold/items/mint" }));
    } else {
      const mintResp = await requestJson("/api/stamped-gold/items/mint", {
        method: "POST",
        body: JSON.stringify({
          skuId: activeSku.id,
          quantity: 1,
          locationType: "VAULT",
        }),
      });
      checks.push(
        makeCheck(
          "mint.contract",
          mintResp.ok && Number(mintResp.json?.minted || 0) >= 1,
          mintResp.ok ? `minted=${mintResp.json?.minted}` : toErrorText(mintResp),
          { endpoint: mintResp.endpoint, status: mintResp.status },
        ),
      );
    }

    const items = Array.isArray(itemsResp.json?.items) ? itemsResp.json.items : [];
    const readyPickupItem = items.find((item) => String(item?.status || "").toUpperCase() === "READY_PICKUP");
    if (!readyPickupItem?.serialCode) {
      checks.push(makeSkipped("pickup.confirm.validation", "no READY_PICKUP item found", { endpoint: "/api/pickup/confirm" }));
    } else {
      const rejectResp = await requestJson("/api/pickup/confirm", {
        method: "POST",
        body: JSON.stringify({
          serialCode: readyPickupItem.serialCode,
          idVerified: false,
        }),
      });
      checks.push(
        makeCheck(
          "pickup.confirm.validation",
          rejectResp.status === 400,
          rejectResp.status === 400 ? "rejects confirmation when idVerified=false" : toErrorText(rejectResp),
          { endpoint: rejectResp.endpoint, status: rejectResp.status },
        ),
      );
    }
  }

  const passCount = checks.filter((c) => c.passed).length;
  const skipCount = checks.filter((c) => c.skipped).length;
  const failCount = checks.filter((c) => !c.passed && !c.skipped).length;

  const result = {
    audit: "gold-stamping",
    timestamp: new Date().toISOString(),
    baseUrl,
    tenantKey,
    tag: auditTag,
    allowMutation,
    summary: {
      passCount,
      failCount,
      skipCount,
    },
    checks,
  };

  const markdown = checksToMarkdown(checks);
  console.log(JSON.stringify(result, null, 2));
  console.log("\n---\n");
  console.log(markdown);

  if (outputDir) {
    const dir = path.resolve(outputDir);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${auditTag}.gold-stamping-audit.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(dir, `${auditTag}.gold-stamping-audit.md`), `${markdown}\n`, "utf8");
  }

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[gold-stamping-audit] failed:", error?.message || error);
  process.exit(1);
});
