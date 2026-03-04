#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

const scriptPath = path.resolve(process.cwd(), "scripts", "migrate-marketing-content-to-db.js");
const child = spawn(process.execPath, [scriptPath, "--commit"], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(typeof code === "number" ? code : 1);
});
