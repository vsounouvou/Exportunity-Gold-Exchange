import fs from "fs";
import { PassThrough } from "stream";
import Docker from "dockerode";

type ExecResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDockerSocketPath() {
  return String(process.env.MAILSERVER_DOCKER_SOCKET_PATH || "/var/run/docker.sock").trim() || "/var/run/docker.sock";
}

function getContainerName() {
  return String(process.env.MAILSERVER_CONTAINER_NAME || "mailserver").trim() || "mailserver";
}

export function isMailserverSetupAvailable() {
  const socketPath = getDockerSocketPath();
  try {
    return fs.existsSync(socketPath);
  } catch {
    return false;
  }
}

async function execInMailserver(cmd: string[], opts?: { timeoutMs?: number }): Promise<ExecResult> {
  const socketPath = getDockerSocketPath();
  if (!isMailserverSetupAvailable()) {
    const err = new Error(`Mailserver setup unavailable (missing docker socket at ${socketPath})`);
    (err as any).status = 503;
    throw err;
  }

  const docker = new Docker({ socketPath });
  const containerName = getContainerName();
  const container = docker.getContainer(containerName);

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ hijack: true, stdin: false });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);

  const outChunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  stdout.on("data", (c) => outChunks.push(Buffer.from(c)));
  stderr.on("data", (c) => errChunks.push(Buffer.from(c)));

  const timeoutMs = Math.max(1_000, Math.min(opts?.timeoutMs ?? 25_000, 120_000));
  const deadline = Date.now() + timeoutMs;

  await new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      if (Date.now() < deadline) return;
      clearInterval(timer);
      try {
        stream.destroy(new Error("mailserver exec timed out"));
      } catch {
        // ignore
      }
      reject(new Error("mailserver exec timed out"));
    }, 250);

    stream.on("end", () => {
      clearInterval(timer);
      resolve();
    });
    stream.on("error", (err: unknown) => {
      clearInterval(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  const inspected = await exec.inspect();
  const exitCode = typeof inspected?.ExitCode === "number" ? inspected.ExitCode : null;
  const out = Buffer.concat(outChunks).toString("utf8").trim();
  const err = Buffer.concat(errChunks).toString("utf8").trim();

  return { ok: exitCode === 0, exitCode, stdout: out, stderr: err };
}

export async function mailserverEmailAdd(address: string, password: string) {
  return execInMailserver(["setup", "email", "add", address, password]);
}

export async function mailserverEmailUpdate(address: string, password: string) {
  return execInMailserver(["setup", "email", "update", address, password]);
}

export async function mailserverDoveadmAuthTest(address: string, password: string) {
  const result = await execInMailserver(["doveadm", "auth", "test", address, password], { timeoutMs: 10_000 });
  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  return {
    ...result,
    ok: result.ok && /auth succeeded/i.test(combinedOutput),
  };
}

export async function mailserverRefreshAuth() {
  const flush = await execInMailserver(["doveadm", "auth", "cache", "flush"], { timeoutMs: 10_000 }).catch((err: any) => ({
    ok: false,
    exitCode: typeof err?.status === "number" ? err.status : null,
    stdout: "",
    stderr: err?.message || "doveadm auth cache flush failed",
  }));
  const reload = await execInMailserver(["doveadm", "reload"], { timeoutMs: 10_000 }).catch((err: any) => ({
    ok: false,
    exitCode: typeof err?.status === "number" ? err.status : null,
    stdout: "",
    stderr: err?.message || "doveadm reload failed",
  }));

  return { ok: flush.ok || reload.ok, flush, reload };
}

export async function mailserverDoveadmAuthTestWithRefresh(
  address: string,
  password: string,
  opts?: { attempts?: number; delayMs?: number },
) {
  const attempts = Math.max(1, Math.min(opts?.attempts ?? 6, 10));
  const delayMs = Math.max(250, Math.min(opts?.delayMs ?? 1_000, 5_000));
  let refresh: Awaited<ReturnType<typeof mailserverRefreshAuth>> | null = null;
  let last = await mailserverDoveadmAuthTest(address, password);
  if (last.ok) return { ...last, refresh };

  for (let attempt = 2; attempt <= attempts; attempt += 1) {
    refresh = await mailserverRefreshAuth();
    await sleep(delayMs);
    last = await mailserverDoveadmAuthTest(address, password);
    if (last.ok) return { ...last, refresh };
  }

  return { ...last, refresh };
}

export async function mailserverEmailDelete(address: string) {
  return execInMailserver(["setup", "email", "del", address]);
}

export async function mailserverAliasAdd(source: string, destination: string) {
  return execInMailserver(["setup", "alias", "add", source, destination]);
}

export async function mailserverQuotaSet(address: string, quota: string) {
  return execInMailserver(["setup", "quota", "set", address, quota]);
}

export async function mailserverQuotaDel(address: string) {
  return execInMailserver(["setup", "quota", "del", address]);
}
