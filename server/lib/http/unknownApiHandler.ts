import type { Express, Request, Response } from "express";

export function registerUnknownApiHandler(app: Express): void {
  app.use("/api", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(404).json({ message: "API route not found" });
  });
}
