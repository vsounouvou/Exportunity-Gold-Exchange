import fs from "node:fs";
import path from "node:path";

type Row = {
  url: string;
  status: number;
  note: string;
};

function nowStamp() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

function mdEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

async function fetchStatus(url: string): Promise<{ status: number; note: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    const status = res.status;

    if (url.endsWith("/api/system/version") && res.ok) {
      const data: any = await res.json().catch(() => null);
      const gitSha = data?.gitSha || data?.clientBuild?.gitSha || null;
      const buildId = data?.buildId || data?.clientBuild?.buildId || null;
      const mismatch = data?.buildMismatch ?? null;
      return { status, note: `gitSha=${gitSha ?? "?"} buildId=${buildId ?? "?"} mismatch=${mismatch ?? "?"}` };
    }

    return { status, note: res.ok ? "OK" : "non-2xx" };
  } catch (err: any) {
    return { status: 0, note: err?.message || "fetch_failed" };
  }
}

async function main() {
  const base = process.env.PRO_APP_AUDIT_BASE_URL || "https://boursedelor.com";
  const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);

  const paths = [
    "/app",
    "/app/join/seller",
    "/app/join/miner",
    "/app/join/delivery",
    "/app/join/investor",
    "/admin",
    "/manifest.webmanifest",
    "/service-worker.js",
    "/api/system/version",
  ];

  const rows: Row[] = [];
  for (const p of paths) {
    const url = new URL(p.replace(/^\//, ""), baseUrl).toString();
    const { status, note } = await fetchStatus(url);
    rows.push({ url, status, note });
  }

  const lines: string[] = [];
  lines.push(`# Pro App Audit Report`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Base: ${baseUrl.toString().replace(/\/$/, "")}`);
  lines.push("");
  lines.push(`| URL | Status | Note |`);
  lines.push(`| --- | ---: | --- |`);
  for (const r of rows) {
    lines.push(`| ${mdEscape(r.url)} | ${r.status} | ${mdEscape(r.note)} |`);
  }
  lines.push("");
  lines.push("## How to run");
  lines.push("");
  lines.push("```bash");
  lines.push("node --import tsx scripts/audit-pro-app.ts");
  lines.push("```");
  lines.push("");
  lines.push("Environment:");
  lines.push("- `PRO_APP_AUDIT_BASE_URL` (default: `https://boursedelor.com`)");
  lines.push("");

  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `pro-app-audit-${nowStamp()}.md`);
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
