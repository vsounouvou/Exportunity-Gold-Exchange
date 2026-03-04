#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";

const baseUrl = String(process.env.BASE_URL || process.env.SMOKE_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const authToken = String(process.env.AUTH_TOKEN || process.env.E2E_TOKEN || process.env.ECE_TOKEN || "").trim();
const tenantKey = String(process.env.TENANT_KEY || "bdo").trim();
const tenantId = Number(process.env.TENANT_ID || 1);
const tag = String(process.env.SMOKE_TAG || `chairman-smoke-${Date.now()}`);
const outputDir = String(process.env.OUTPUT_DIR || "").trim();
const navigatePath = String(process.env.SMOKE_NAVIGATE_PATH || "/actions").trim();

function headers(extra = {}) {
  const base = {
    "content-type": "application/json",
    "x-chairman-admin-override": "1",
    "x-tenant-key": tenantKey,
    ...extra,
  };
  if (authToken) base.authorization = `Bearer ${authToken}`;
  return base;
}

async function requestJson(endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...headers(),
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

function errorText(resp) {
  if (!resp) return "no response";
  if (resp?.json?.message) return String(resp.json.message);
  if (resp?.json?.error) return String(resp.json.error);
  return String(resp.raw || `HTTP ${resp.status}`);
}

function check(id, passed, details, meta = {}) {
  return {
    id,
    passed: Boolean(passed),
    details: String(details || ""),
    ...meta,
  };
}

function markdown(checks) {
  const lines = [
    "# Chairman Auth Smoke",
    "",
    `- Base URL: \`${baseUrl}\``,
    `- Tenant key: \`${tenantKey}\``,
    `- Tenant id: \`${tenantId}\``,
    `- Tag: \`${tag}\``,
    "",
  ];
  for (const item of checks) {
    lines.push(`- [${item.passed ? "PASS" : "FAIL"}] ${item.id}${item.endpoint ? ` (\`${item.endpoint}\`)` : ""}: ${item.details}`);
  }
  return lines.join("\n");
}

async function main() {
  const checks = [];
  const run = {
    threadId: null,
    messageId: null,
    actionRunId: null,
    quickTokenPrefix: null,
    quickRedeemSessionPrefix: null,
  };

  const terminalAgentResp = await requestJson(`/api/tenants/${tenantId}/terminal-agent`);
  checks.push(
    check(
      "terminal-agent",
      terminalAgentResp.ok && Number(terminalAgentResp.json?.agent?.id || 0) > 0,
      terminalAgentResp.ok
        ? `assistant=${terminalAgentResp.json?.agent?.displayName || terminalAgentResp.json?.agent?.name || "unknown"}`
        : errorText(terminalAgentResp),
      { endpoint: terminalAgentResp.endpoint, status: terminalAgentResp.status },
    ),
  );

  const threadResp = await requestJson("/api/assistant/thread", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (threadResp.ok) {
    run.threadId = Number(threadResp.json?.thread?.id || 0) || null;
  }
  checks.push(
    check(
      "assistant.thread",
      threadResp.ok && Number(run.threadId || 0) > 0,
      threadResp.ok ? `threadId=${run.threadId}` : errorText(threadResp),
      { endpoint: threadResp.endpoint, status: threadResp.status },
    ),
  );

  const messageResp = await requestJson("/api/assistant/message", {
    method: "POST",
    body: JSON.stringify({
      threadId: run.threadId,
      content: `[${tag}] chairman smoke ping`,
      metadata: { smokeTag: tag },
    }),
  });
  if (messageResp.ok) {
    run.messageId = Number(messageResp.json?.assistantMessage?.id || 0) || null;
  }
  checks.push(
    check(
      "assistant.message",
      messageResp.ok && Number(run.messageId || 0) > 0,
      messageResp.ok ? `assistantMessageId=${run.messageId}` : errorText(messageResp),
      { endpoint: messageResp.endpoint, status: messageResp.status },
    ),
  );

  const createRunResp = await requestJson("/api/actions/run", {
    method: "POST",
    body: JSON.stringify({
      actionKey: "NAVIGATE_OPEN_PAGE",
      threadId: run.threadId,
      payload: {
        path: navigatePath,
        label: `smoke:${tag}`,
      },
    }),
  });
  if (createRunResp.ok) {
    run.actionRunId = Number(createRunResp.json?.run?.id || 0) || null;
  }
  checks.push(
    check(
      "actions.run.create",
      createRunResp.ok && Number(run.actionRunId || 0) > 0,
      createRunResp.ok ? `runId=${run.actionRunId}` : errorText(createRunResp),
      { endpoint: createRunResp.endpoint, status: createRunResp.status },
    ),
  );

  const evidenceResp = run.actionRunId
    ? await requestJson(`/api/actions/run/${run.actionRunId}/evidence`, {
        method: "POST",
        body: JSON.stringify({
          complete: true,
          evidenceType: "NAVIGATE",
          payload: {
            path: navigatePath,
            label: `smoke:${tag}`,
            method: "push",
            smokeTag: tag,
          },
        }),
      })
    : null;
  checks.push(
    check(
      "actions.evidence.complete",
      Boolean(evidenceResp?.ok) && String(evidenceResp?.json?.run?.status || "").toUpperCase() === "SUCCEEDED",
      evidenceResp ? (evidenceResp.ok ? `runStatus=${evidenceResp.json?.run?.status}` : errorText(evidenceResp)) : "run creation failed",
      { endpoint: evidenceResp?.endpoint || "/api/actions/run/:id/evidence", status: evidenceResp?.status || null },
    ),
  );

  const quickTokenResp = await requestJson("/api/chairman/quick-token", {
    method: "POST",
    body: JSON.stringify({
      expiresInMinutes: 10,
      metadata: { smokeTag: tag },
    }),
  });
  if (quickTokenResp.ok) {
    run.quickTokenPrefix = String(quickTokenResp.json?.tokenPrefix || "");
  }
  checks.push(
    check(
      "quick-token.create",
      quickTokenResp.ok && typeof quickTokenResp.json?.token === "string" && quickTokenResp.json.token.length > 12,
      quickTokenResp.ok ? `tokenPrefix=${run.quickTokenPrefix}` : errorText(quickTokenResp),
      { endpoint: quickTokenResp.endpoint, status: quickTokenResp.status },
    ),
  );

  const redeemResp = quickTokenResp.ok
    ? await requestJson("/api/chairman/quick-token/redeem", {
        method: "POST",
        body: JSON.stringify({
          token: quickTokenResp.json.token,
        }),
      })
    : null;
  if (redeemResp?.ok) {
    run.quickRedeemSessionPrefix = String(redeemResp.json?.sessionToken || "").slice(0, 8) || null;
  }
  checks.push(
    check(
      "quick-token.redeem.once",
      Boolean(redeemResp?.ok) && typeof redeemResp?.json?.sessionToken === "string",
      redeemResp ? (redeemResp.ok ? "redeem succeeded" : errorText(redeemResp)) : "quick token creation failed",
      { endpoint: redeemResp?.endpoint || "/api/chairman/quick-token/redeem", status: redeemResp?.status || null },
    ),
  );

  const redeemAgainResp = quickTokenResp.ok
    ? await requestJson("/api/chairman/quick-token/redeem", {
        method: "POST",
        body: JSON.stringify({
          token: quickTokenResp.json.token,
        }),
      })
    : null;
  checks.push(
    check(
      "quick-token.redeem.second.blocked",
      Boolean(redeemAgainResp) && !redeemAgainResp.ok,
      redeemAgainResp ? (!redeemAgainResp.ok ? `blocked with ${redeemAgainResp.status}` : "second redemption unexpectedly succeeded") : "quick token creation failed",
      { endpoint: redeemAgainResp?.endpoint || "/api/chairman/quick-token/redeem", status: redeemAgainResp?.status || null },
    ),
  );

  const passCount = checks.filter((x) => x.passed).length;
  const failCount = checks.length - passCount;

  const result = {
    smoke: "chairman-auth",
    timestamp: new Date().toISOString(),
    baseUrl,
    tenantId,
    tenantKey,
    tag,
    summary: {
      passCount,
      failCount,
    },
    run,
    checks,
  };

  const md = markdown(checks);
  console.log(JSON.stringify(result, null, 2));
  console.log("\n---\n");
  console.log(md);

  if (outputDir) {
    const dir = path.resolve(outputDir);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${tag}.chairman-smoke-auth.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(dir, `${tag}.chairman-smoke-auth.md`), `${md}\n`, "utf8");
  }

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[chairman-smoke-auth] failed:", error?.message || error);
  process.exit(1);
});
