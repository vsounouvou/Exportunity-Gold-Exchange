import { sql } from "drizzle-orm";
import { db } from "@db";
import type { GatewayToolCall, GatewayToolSchema } from "./types";

type ToolCatalogItem = {
  id: string;
  name: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  description: string;
  permissionsRequired: string[];
  parameters: Record<string, unknown>;
};

const TOOL_CATALOG: ToolCatalogItem[] = [
  {
    id: "DB_QUERY_READONLY",
    name: "DB_QUERY_READONLY",
    riskLevel: "medium",
    description: "Read-only tenant-scoped lookup for approved operational tables.",
    permissionsRequired: ["model_gateway:tool:db_read"],
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", enum: ["marketplace_products", "marketplace_orders", "agents", "finance_transactions", "model_gateway_logs"] },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["table"],
      additionalProperties: false,
    },
  },
  {
    id: "HTTP_FETCH_ALLOWLIST",
    name: "HTTP_FETCH_ALLOWLIST",
    riskLevel: "high",
    description: "Safe GET fetch only for allowlisted internal endpoints.",
    permissionsRequired: ["model_gateway:tool:http_fetch"],
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
];

function readAllowlistedHosts() {
  const raw = String(process.env.MODEL_GATEWAY_HTTP_ALLOWLIST || "").trim();
  const defaults = ["127.0.0.1", "localhost", "bdo-app", "api.exportunity.net"];
  const values = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...defaults, ...values]);
}

function parseLimit(input: unknown, fallback = 10) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), 50);
}

export function getToolSchemasForModel(toolNames: string[]): GatewayToolSchema[] {
  const allow = new Set(toolNames);
  return TOOL_CATALOG.filter((entry) => allow.has(entry.id)).map((entry) => ({
    name: entry.name,
    description: entry.description,
    parameters: entry.parameters,
  }));
}

export function getToolCatalogIds() {
  return TOOL_CATALOG.map((entry) => entry.id);
}

async function runDbReadOnlyTool(tenantId: number, args: Record<string, unknown>) {
  const table = String(args.table || "").trim();
  const limit = parseLimit(args.limit, 10);

  if (table === "marketplace_products") {
    const result = await db.execute(sql`
      select id, name, price, currency, created_at
      from marketplace_products
      where tenant_id = ${tenantId}
      order by created_at desc
      limit ${limit}
    `);
    return Array.isArray((result as any)?.rows) ? (result as any).rows : result;
  }

  if (table === "marketplace_orders") {
    const result = await db.execute(sql`
      select id, status, total_amount, currency, created_at
      from marketplace_orders
      where tenant_id = ${tenantId}
      order by created_at desc
      limit ${limit}
    `);
    return Array.isArray((result as any)?.rows) ? (result as any).rows : result;
  }

  if (table === "agents") {
    const result = await db.execute(sql`
      select id, name, role, hierarchy_level, status
      from agents
      where tenant_id = ${tenantId}
      order by updated_at desc nulls last, created_at desc
      limit ${limit}
    `);
    return Array.isArray((result as any)?.rows) ? (result as any).rows : result;
  }

  if (table === "finance_transactions") {
    const result = await db.execute(sql`
      select id, provider, tx_type, status, amount, currency, occurred_at
      from finance_transactions
      where tenant_id = ${tenantId}
      order by occurred_at desc
      limit ${limit}
    `);
    return Array.isArray((result as any)?.rows) ? (result as any).rows : result;
  }

  if (table === "model_gateway_logs") {
    const result = await db.execute(sql`
      select id, trace_id, model_name, status, total_tokens, latency_ms, created_at
      from model_gateway_logs
      where tenant_id = ${tenantId}
      order by created_at desc
      limit ${limit}
    `);
    return Array.isArray((result as any)?.rows) ? (result as any).rows : result;
  }

  throw new Error("db_tool_table_not_allowed");
}

async function runHttpFetchAllowlistTool(args: Record<string, unknown>) {
  const urlRaw = String(args.url || "").trim();
  if (!urlRaw) throw new Error("missing_url");
  let parsed: URL;
  try {
    parsed = new URL(urlRaw);
  } catch {
    throw new Error("invalid_url");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported_protocol");
  const allowlist = readAllowlistedHosts();
  const host = parsed.hostname.toLowerCase();
  if (!allowlist.has(host)) throw new Error("host_not_allowlisted");

  const response = await fetch(parsed.toString(), { method: "GET" });
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    body: text.slice(0, 3000),
  };
}

export async function executeToolCall(call: GatewayToolCall, tenantId: number): Promise<GatewayToolCall> {
  if (!call.allowed) {
    return {
      ...call,
      status: "rejected",
      error: "tool_not_allowlisted",
    };
  }
  try {
    if (call.name === "DB_QUERY_READONLY") {
      const result = await runDbReadOnlyTool(tenantId, call.arguments);
      return { ...call, status: "executed", result };
    }
    if (call.name === "HTTP_FETCH_ALLOWLIST") {
      const result = await runHttpFetchAllowlistTool(call.arguments);
      return { ...call, status: "executed", result };
    }
    return { ...call, status: "failed", error: "tool_handler_missing" };
  } catch (error: any) {
    return {
      ...call,
      status: "failed",
      error: String(error?.message || "tool_execution_failed"),
    };
  }
}
