import tls from "tls";

export type MailPlacementSnapshot = {
  ok: boolean;
  configured: boolean;
  checkedAtIso: string;
  provider: string | null;
  windowHours: number;
  inbox: { mailbox: string | null; count: number | null };
  spam: { mailbox: string | null; count: number | null };
  spamRate: number | null;
  error: string | null;
};

const CACHE_TTL_MS = 2 * 60_000;
const cache = new Map<string, { atMs: number; value: MailPlacementSnapshot }>();

function nowIso() {
  return new Date().toISOString();
}

function quoteImapString(value: string) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function parsePort(value: unknown, fallback: number) {
  const raw = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.trunc(raw);
}

function normalizeProvider(host: string) {
  const h = host.toLowerCase();
  if (h.includes("gmail")) return "gmail";
  if (h.includes("outlook") || h.includes("office365") || h.includes("hotmail") || h.includes("live.com")) return "outlook";
  return null;
}

function readEnvString(key: string) {
  const value = String(process.env[key] || "").trim();
  return value || null;
}

function readImapConfig() {
  const host = readEnvString("MAIL_DELIVERABILITY_TEST_IMAP_HOST");
  const user = readEnvString("MAIL_DELIVERABILITY_TEST_IMAP_USER");
  const pass = readEnvString("MAIL_DELIVERABILITY_TEST_IMAP_PASS");
  const port = parsePort(process.env.MAIL_DELIVERABILITY_TEST_IMAP_PORT, 993);
  const rejectUnauthorized = String(process.env.MAIL_DELIVERABILITY_TEST_IMAP_TLS_INSECURE || "").trim() !== "true";
  const windowHoursRaw = Number(process.env.MAIL_DELIVERABILITY_TEST_WINDOW_HOURS ?? 24);
  const windowHours = Number.isFinite(windowHoursRaw) ? Math.max(1, Math.min(168, Math.trunc(windowHoursRaw))) : 24;
  const timeoutMsRaw = Number(process.env.MAIL_DELIVERABILITY_TEST_TIMEOUT_MS ?? 10_000);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(2_000, Math.min(45_000, Math.trunc(timeoutMsRaw))) : 10_000;

  return {
    host,
    port,
    user,
    pass,
    rejectUnauthorized,
    windowHours,
    timeoutMs,
    configured: Boolean(host && user && pass),
  } as const;
}

type ImapCommandResult = {
  ok: boolean;
  taggedLine: string | null;
  untagged: string[];
  error: string | null;
};

async function runImapCommand(socket: tls.TLSSocket, tag: string, command: string, timeoutMs: number) : Promise<ImapCommandResult> {
  const line = `${tag} ${command}\r\n`;
  const state = { buffer: "", untagged: [] as string[], done: false };

  return new Promise((resolve) => {
    const finish = (ok: boolean, taggedLine: string | null, error: string | null) => {
      if (state.done) return;
      state.done = true;
      socket.off("data", onData);
      socket.off("error", onError);
      resolve({ ok, taggedLine, untagged: state.untagged, error });
    };

    const timer = setTimeout(() => finish(false, null, "imap_timeout"), timeoutMs);

    const onError = (err: any) => {
      clearTimeout(timer);
      finish(false, null, String(err?.message || err || "imap_socket_error"));
    };

    const onData = (chunk: any) => {
      state.buffer += chunk.toString("utf8");
      const parts = state.buffer.split(/\r?\n/);
      state.buffer = parts.pop() ?? "";
      for (const raw of parts) {
        const l = raw.trimEnd();
        if (!l) continue;
        if (l.startsWith("*")) {
          state.untagged.push(l);
          continue;
        }
        const lower = l.toLowerCase();
        if (lower.startsWith(tag.toLowerCase() + " ")) {
          clearTimeout(timer);
          const ok = /\sOK\b/i.test(l);
          const error = ok ? null : l;
          finish(ok, l, error);
          return;
        }
      }
    };

    socket.on("error", onError);
    socket.on("data", onData);
    socket.write(line);
  });
}

function parseListMailboxes(lines: string[]) {
  const boxes: Array<{ name: string; flags: string[] }> = [];
  for (const l of lines) {
    const m = l.match(/^\*\s+LIST\s+\(([^)]*)\)\s+\"[^\"]*\"\s+(.+)$/i);
    if (!m) continue;
    const flagsRaw = String(m[1] || "").trim();
    const flags = flagsRaw ? flagsRaw.split(/\s+/g).map((f) => f.trim()).filter(Boolean) : [];
    const tail = String(m[2] || "").trim();
    const nameMatch = tail.match(/\"([^\"]+)\"\s*$/);
    const name = nameMatch ? nameMatch[1] : tail.replace(/^\"|\"$/g, "");
    if (!name) continue;
    boxes.push({ name, flags });
  }
  return boxes;
}

function pickMailboxes(boxes: Array<{ name: string; flags: string[] }>) {
  const inbox = boxes.find((b) => b.name.toUpperCase() === "INBOX")?.name ?? "INBOX";
  const spamCandidates = boxes.filter((b) => {
    const name = b.name.toLowerCase();
    const flags = b.flags.map((f) => f.toLowerCase());
    if (flags.includes("\\junk") || flags.includes("\\spam")) return true;
    if (name.includes("spam")) return true;
    if (name.includes("junk")) return true;
    return false;
  });
  const spam = spamCandidates[0]?.name ?? null;
  return { inbox, spam };
}

function formatImapSinceDate(windowHours: number) {
  const since = new Date(Date.now() - windowHours * 60 * 60_000);
  const day = String(since.getUTCDate()).padStart(2, "0");
  const month = since.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = String(since.getUTCFullYear());
  return `${day}-${month}-${year}`;
}

function countSearchMatches(lines: string[]) {
  const searchLine = lines.find((l) => /^\*\s+SEARCH\b/i.test(l));
  if (!searchLine) return 0;
  const ids = searchLine.replace(/^\*\s+SEARCH\s*/i, "").trim();
  if (!ids) return 0;
  return ids.split(/\s+/g).filter(Boolean).length;
}

export async function getMailPlacementSnapshot(opts?: { fromQuery?: string | null; windowHours?: number }) : Promise<MailPlacementSnapshot> {
  const cfg = readImapConfig();
  const windowHoursRaw = typeof opts?.windowHours === "number" ? opts!.windowHours : cfg.windowHours;
  const windowHours = Number.isFinite(windowHoursRaw) ? Math.max(1, Math.min(168, Math.trunc(windowHoursRaw))) : cfg.windowHours;
  const fromQuery = String(opts?.fromQuery || "").trim() || null;

  const cacheKey = `${cfg.host || ""}|${cfg.user || ""}|${windowHours}|${fromQuery || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.atMs <= CACHE_TTL_MS) return cached.value;

  if (!cfg.configured) {
    const value: MailPlacementSnapshot = {
      ok: false,
      configured: false,
      checkedAtIso: nowIso(),
      provider: cfg.host ? normalizeProvider(cfg.host) : null,
      windowHours,
      inbox: { mailbox: "INBOX", count: null },
      spam: { mailbox: null, count: null },
      spamRate: null,
      error: "deliverability_test_imap_not_configured",
    };
    cache.set(cacheKey, { atMs: Date.now(), value });
    return value;
  }

  const socket = tls.connect({
    host: cfg.host!,
    port: cfg.port,
    servername: cfg.host!,
    rejectUnauthorized: cfg.rejectUnauthorized,
  });

  const placement = await new Promise<MailPlacementSnapshot>((resolve) => {
    const finish = (value: MailPlacementSnapshot) => {
      try {
        socket.end();
      } catch {
        // ignore
      }
      resolve(value);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        configured: true,
        checkedAtIso: nowIso(),
        provider: normalizeProvider(cfg.host!),
        windowHours,
        inbox: { mailbox: "INBOX", count: null },
        spam: { mailbox: null, count: null },
        spamRate: null,
        error: "imap_connect_timeout",
      });
    }, cfg.timeoutMs);

    const onError = (err: any) => {
      clearTimeout(timer);
      finish({
        ok: false,
        configured: true,
        checkedAtIso: nowIso(),
        provider: normalizeProvider(cfg.host!),
        windowHours,
        inbox: { mailbox: "INBOX", count: null },
        spam: { mailbox: null, count: null },
        spamRate: null,
        error: String(err?.message || err || "imap_connect_failed"),
      });
    };

    socket.on("error", onError);

    let greeted = false;
    let buffer = "";
    const onData = async (chunk: any) => {
      buffer += chunk.toString("utf8");
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";

      for (const raw of parts) {
        const line = raw.trimEnd();
        if (!line) continue;
        if (!greeted && line.startsWith("*")) {
          greeted = true;
          socket.off("data", onData);
          socket.off("error", onError);
          clearTimeout(timer);

          try {
            const login = await runImapCommand(socket, "a1", `LOGIN ${quoteImapString(cfg.user!)} ${quoteImapString(cfg.pass!)}`, cfg.timeoutMs);
            if (!login.ok) {
              return finish({
                ok: false,
                configured: true,
                checkedAtIso: nowIso(),
                provider: normalizeProvider(cfg.host!),
                windowHours,
                inbox: { mailbox: "INBOX", count: null },
                spam: { mailbox: null, count: null },
                spamRate: null,
                error: login.error || "imap_login_failed",
              });
            }

            const list = await runImapCommand(socket, "a2", `LIST "" "*"`, cfg.timeoutMs);
            const boxes = parseListMailboxes(list.untagged);
            const picked = pickMailboxes(boxes);

            const since = formatImapSinceDate(windowHours);
            const q = fromQuery ? fromQuery : "";
            const searchTerm = q ? `FROM ${quoteImapString(q)} ` : "";
            const inboxName = picked.inbox || "INBOX";
            const inboxSel = await runImapCommand(socket, "a3", `EXAMINE ${quoteImapString(inboxName)}`, cfg.timeoutMs);
            if (!inboxSel.ok) {
              return finish({
                ok: false,
                configured: true,
                checkedAtIso: nowIso(),
                provider: normalizeProvider(cfg.host!),
                windowHours,
                inbox: { mailbox: inboxName, count: null },
                spam: { mailbox: picked.spam, count: null },
                spamRate: null,
                error: inboxSel.error || "imap_inbox_examine_failed",
              });
            }
            const inboxSearch = await runImapCommand(socket, "a4", `SEARCH ${searchTerm}SINCE ${since}`, cfg.timeoutMs);
            const inboxCount = inboxSearch.ok ? countSearchMatches(inboxSearch.untagged) : null;

            let spamMailbox = picked.spam;
            let spamCount: number | null = null;
            if (spamMailbox) {
              const spamSel = await runImapCommand(socket, "a5", `EXAMINE ${quoteImapString(spamMailbox)}`, cfg.timeoutMs);
              if (spamSel.ok) {
                const spamSearch = await runImapCommand(socket, "a6", `SEARCH ${searchTerm}SINCE ${since}`, cfg.timeoutMs);
                spamCount = spamSearch.ok ? countSearchMatches(spamSearch.untagged) : null;
              } else {
                spamCount = null;
              }
            }

            try {
              await runImapCommand(socket, "a7", "LOGOUT", Math.min(5000, cfg.timeoutMs));
            } catch {
              // ignore
            }

            const total =
              typeof inboxCount === "number" && typeof spamCount === "number" ? inboxCount + spamCount : null;
            const spamRate = total && total > 0 && spamCount != null ? spamCount / total : total === 0 ? 0 : null;

            return finish({
              ok: true,
              configured: true,
              checkedAtIso: nowIso(),
              provider: normalizeProvider(cfg.host!),
              windowHours,
              inbox: { mailbox: inboxName, count: inboxCount },
              spam: { mailbox: spamMailbox, count: spamCount },
              spamRate,
              error: null,
            });
          } catch (err: any) {
            return finish({
              ok: false,
              configured: true,
              checkedAtIso: nowIso(),
              provider: normalizeProvider(cfg.host!),
              windowHours,
              inbox: { mailbox: "INBOX", count: null },
              spam: { mailbox: null, count: null },
              spamRate: null,
              error: String(err?.message || err || "imap_probe_failed"),
            });
          }
          return;
        }
      }
    };

    socket.on("data", onData);
  });

  cache.set(cacheKey, { atMs: Date.now(), value: placement });
  return placement;
}

