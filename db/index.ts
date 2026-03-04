import "../env";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import ws from "ws";
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = String(process.env.DATABASE_URL);
const forcedDriver = String(process.env.DB_DRIVER || "").trim().toLowerCase();
const isNeonUrl = /neon\.tech/i.test(databaseUrl);
const useNeon = forcedDriver ? forcedDriver === "neon" : isNeonUrl;

const isInternalPostgresHost = /@(postgres|localhost|127\.0\.0\.1)(:|\/)/i.test(databaseUrl);
const nodePool = useNeon
  ? null
  : new Pool({
      connectionString: databaseUrl,
      ssl: isInternalPostgresHost ? false : undefined,
    });

export const db = useNeon
  ? drizzleNeon({
      connection: databaseUrl,
      schema,
      ws: ws,
    })
  : drizzleNode(nodePool as Pool, { schema });
