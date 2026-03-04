import { db } from "@db";
import { agentKeys } from "@db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { type Request, type Response, type NextFunction } from "express";

type Scope = string;

export function verifyAgentKey(requiredScopes: Scope[] = []) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "agent key required" });
      const token = auth.replace("Bearer ", "");

      const rows = await db.query.agentKeys.findMany();
      let matched: any = null;
      for (const row of rows) {
        if (bcrypt.compareSync(token, row.keyHash)) {
          matched = row;
          break;
        }
      }
      if (!matched) return res.status(401).json({ message: "invalid agent key" });

      const scopes: Record<string, string[]> = matched.scopes || {};
      const allowed = requiredScopes.every((s) => {
        const [group, action] = s.split(":");
        return scopes[group]?.includes(action) || scopes[group]?.includes("*");
      });
      if (!allowed) return res.status(403).json({ message: "scope denied" });

      (req as any).agentName = matched.name;
      (req as any).agentScopes = scopes;
      (req as any).agentRateLimit = matched.rateLimitPerDay;
      next();
    } catch (err) {
      next(err);
    }
  };
}
