import tls from "tls";

function quoteImapString(value: string) {
  // IMAP quoted-string: escape backslash and double-quote.
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function getImapHost() {
  return String(process.env.MAILSERVER_IMAP_HOST || "mail.exportunity.net").trim() || "mail.exportunity.net";
}

function getImapPort() {
  const raw = String(process.env.MAILSERVER_IMAP_PORT || "993").trim();
  const port = raw ? Number(raw) : 993;
  return Number.isFinite(port) ? port : 993;
}

function isImapTlsInsecure() {
  return String(process.env.MAILSERVER_IMAP_TLS_INSECURE || "").trim() === "true";
}

export async function verifyImapLogin(opts: { user: string; password: string; timeoutMs?: number }) {
  const host = getImapHost();
  const port = getImapPort();
  const timeoutMs = Math.max(2_000, Math.min(opts.timeoutMs ?? 15_000, 60_000));

  const socket = tls.connect({
    host,
    port,
    servername: host,
    rejectUnauthorized: !isImapTlsInsecure(),
  });

  const state = {
    buffer: "",
    greeted: false,
    done: false,
    ok: false,
    err: "",
  };

  const tag = "a1";
  const loginLine = `${tag} LOGIN ${quoteImapString(opts.user)} ${quoteImapString(opts.password)}\r\n`;

  const result = await new Promise<{ ok: boolean; message: string }>((resolve) => {
    const finish = (ok: boolean, message: string) => {
      if (state.done) return;
      state.done = true;
      try {
        socket.end();
      } catch {
        // ignore
      }
      resolve({ ok, message });
    };

    const timer = setTimeout(() => {
      finish(false, "IMAP auth timed out");
    }, timeoutMs);

    const onError = (err: any) => {
      clearTimeout(timer);
      finish(false, String(err?.message || err || "IMAP socket error"));
    };

    socket.on("error", onError);
    socket.on("close", () => {
      if (!state.done) {
        clearTimeout(timer);
        finish(false, "IMAP connection closed");
      }
    });

    socket.on("data", (chunk) => {
      state.buffer += chunk.toString("utf8");
      const parts = state.buffer.split(/\r?\n/);
      state.buffer = parts.pop() ?? "";

      for (const rawLine of parts) {
        const line = rawLine.trimEnd();
        if (!line) continue;

        if (!state.greeted && line.startsWith("*")) {
          state.greeted = true;
          socket.write(loginLine);
          continue;
        }

        if (line.toLowerCase().startsWith(tag.toLowerCase() + " ")) {
          clearTimeout(timer);
          if (/\sOK\b/i.test(line)) return finish(true, "IMAP auth OK");
          if (/\sNO\b/i.test(line) || /\sBAD\b/i.test(line)) return finish(false, line);
          return finish(false, `Unexpected IMAP response: ${line}`);
        }
      }
    });
  });

  return {
    ok: result.ok,
    host,
    port,
    message: result.message,
  };
}

