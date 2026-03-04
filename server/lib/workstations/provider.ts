import Docker, { type Container } from "dockerode";

export type WorkstationProviderName = "DOCKER" | "K8S" | "FUTURE_MICROVM";
export type WorkstationRuntimeStatus = "CREATING" | "RUNNING" | "STOPPED" | "FAILED" | "DESTROYED";

export type WorkstationProviderUrls = {
  ideUrl: string | null;
  desktopUrl: string | null;
  terminalUrl: string | null;
};

export type WorkstationCreateSpec = {
  workstationId: string;
  tenantId: number;
  agentId: number;
  workspaceType: "EPHEMERAL" | "PERSISTENT";
  cpu: number;
  ramMb: number;
  diskMb: number;
  networkPolicyMode: "DEFAULT_DENY" | "ALLOWLIST" | "FULL_EGRESS";
  allowedDomains: string[];
  repoUrl?: string | null;
  repoBranch?: string | null;
};

export type WorkstationCreateResult = {
  providerId: string;
  status: WorkstationRuntimeStatus;
  urls: WorkstationProviderUrls;
  metadata?: Record<string, unknown>;
};

export type WorkstationStatusResult = {
  status: WorkstationRuntimeStatus;
  urls: WorkstationProviderUrls;
  metadata?: Record<string, unknown>;
};

export interface IWorkstationProvider {
  readonly provider: WorkstationProviderName;
  readonly healthy: boolean;
  create(spec: WorkstationCreateSpec): Promise<WorkstationCreateResult>;
  start(providerId: string): Promise<WorkstationStatusResult>;
  stop(providerId: string): Promise<WorkstationStatusResult>;
  destroy(providerId: string): Promise<void>;
  status(providerId: string): Promise<WorkstationStatusResult>;
}

type DockerPortMap = {
  idePort: number | null;
  desktopPort: number | null;
  terminalPort: number | null;
};

const DEFAULT_WORKSTATION_IMAGE = process.env.WORKSTATION_IMAGE || "exportunity/workstation:latest";
const FALLBACK_WORKSTATION_IMAGE = process.env.WORKSTATION_IMAGE_FALLBACK || "codercom/code-server:latest";
const DEFAULT_EXPOSE_IDE_PORT = Number(process.env.WORKSTATION_IDE_PORT || 3000) || 3000;
const DEFAULT_EXPOSE_DESKTOP_PORT = Number(process.env.WORKSTATION_DESKTOP_PORT || 6080) || 6080;
const DEFAULT_EXPOSE_TERMINAL_PORT = Number(process.env.WORKSTATION_TERMINAL_PORT || 3001) || 3001;
const DEFAULT_PUBLIC_PROTOCOL = String(process.env.WORKSTATION_PUBLIC_PROTOCOL || "https").trim() || "https";
const DEFAULT_PUBLIC_HOST = String(process.env.WORKSTATION_PUBLIC_HOST || "boursedelor.com").trim();
const DEFAULT_HOST_BIND = String(process.env.WORKSTATION_HOST_BIND || "127.0.0.1").trim() || "127.0.0.1";
const DEFAULT_DOCKER_SOCKET = String(process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock").trim();
const DEFAULT_DOCKER_NETWORK = String(process.env.WORKSTATION_DOCKER_NETWORK || "").trim();
const DEFAULT_PROXY_URL = String(process.env.WORKSTATION_PROXY_URL || "").trim();

function toStatus(containerState: unknown): WorkstationRuntimeStatus {
  const state = String(containerState || "").toLowerCase();
  if (state === "running") return "RUNNING";
  if (state === "created" || state === "restarting") return "CREATING";
  if (state === "exited" || state === "paused") return "STOPPED";
  if (state === "dead") return "FAILED";
  if (state === "removing") return "DESTROYED";
  return "FAILED";
}

function resolveHostPort(inspect: any, internalPort: number): number | null {
  const key = `${internalPort}/tcp`;
  const ports = inspect?.NetworkSettings?.Ports?.[key];
  if (!Array.isArray(ports) || !ports.length) return null;
  const hostPort = Number(ports[0]?.HostPort ?? NaN);
  if (!Number.isFinite(hostPort) || hostPort <= 0) return null;
  return Math.trunc(hostPort);
}

function buildUrls(ports: DockerPortMap): WorkstationProviderUrls {
  const withPort = (port: number | null) =>
    port ? `${DEFAULT_PUBLIC_PROTOCOL}://${DEFAULT_PUBLIC_HOST}:${port}` : null;
  return {
    ideUrl: withPort(ports.idePort),
    desktopUrl: withPort(ports.desktopPort),
    terminalUrl: withPort(ports.terminalPort),
  };
}

function parsePorts(inspect: any): DockerPortMap {
  return {
    idePort: resolveHostPort(inspect, DEFAULT_EXPOSE_IDE_PORT),
    desktopPort: resolveHostPort(inspect, DEFAULT_EXPOSE_DESKTOP_PORT),
    terminalPort: resolveHostPort(inspect, DEFAULT_EXPOSE_TERMINAL_PORT),
  };
}

async function pullImage(docker: Docker, image: string) {
  const stream = await docker.pull(image);
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err) => (err ? reject(err) : resolve()));
  });
}

async function ensureImage(docker: Docker, image: string) {
  try {
    await docker.getImage(image).inspect();
  } catch {
    await pullImage(docker, image);
  }
}

async function resolveUsableImage(docker: Docker, primary: string, fallback: string): Promise<{ image: string; usedFallback: boolean }> {
  try {
    await ensureImage(docker, primary);
    return { image: primary, usedFallback: false };
  } catch {
    if (!fallback || fallback === primary) throw new Error(`Unable to resolve workstation image: ${primary}`);
    await ensureImage(docker, fallback);
    return { image: fallback, usedFallback: true };
  }
}

function sanitizeLabel(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function createDockerClient() {
  return new Docker({ socketPath: DEFAULT_DOCKER_SOCKET });
}

export async function createDockerWorkstationProvider(): Promise<IWorkstationProvider> {
  const docker = createDockerClient();
  let healthy = false;
  try {
    await docker.ping();
    healthy = true;
  } catch {
    healthy = false;
  }

  async function inspectContainer(providerId: string) {
    const container = docker.getContainer(providerId);
    const inspect = await container.inspect();
    return { container, inspect };
  }

  async function ensureRunning(providerId: string): Promise<{ container: Container; inspect: any }> {
    const { container, inspect } = await inspectContainer(providerId);
    if (String(inspect?.State?.Status || "").toLowerCase() !== "running") {
      await container.start();
      return inspectContainer(providerId);
    }
    return { container, inspect };
  }

  return {
    provider: "DOCKER",
    healthy,
    async create(spec) {
      if (!healthy) {
        throw new Error("Docker daemon unavailable for workstation provisioning");
      }

      const imageInfo = await resolveUsableImage(docker, DEFAULT_WORKSTATION_IMAGE, FALLBACK_WORKSTATION_IMAGE);
      const image = imageInfo.image;

      const exposedPorts = {
        [`${DEFAULT_EXPOSE_IDE_PORT}/tcp`]: {},
        [`${DEFAULT_EXPOSE_DESKTOP_PORT}/tcp`]: {},
        [`${DEFAULT_EXPOSE_TERMINAL_PORT}/tcp`]: {},
      } as Record<string, {}>;

      const portBindings = {
        [`${DEFAULT_EXPOSE_IDE_PORT}/tcp`]: [{ HostIp: DEFAULT_HOST_BIND, HostPort: "0" }],
        [`${DEFAULT_EXPOSE_DESKTOP_PORT}/tcp`]: [{ HostIp: DEFAULT_HOST_BIND, HostPort: "0" }],
        [`${DEFAULT_EXPOSE_TERMINAL_PORT}/tcp`]: [{ HostIp: DEFAULT_HOST_BIND, HostPort: "0" }],
      } as Record<string, Array<{ HostIp: string; HostPort: string }>>;

      const envVars = [
        `TENANT_ID=${spec.tenantId}`,
        `AGENT_ID=${spec.agentId}`,
        `WORKSTATION_ID=${spec.workstationId}`,
        `WORKSPACE_TYPE=${spec.workspaceType}`,
        `WORKSTATION_NETWORK_MODE=${spec.networkPolicyMode}`,
        `WORKSTATION_ALLOWED_DOMAINS=${spec.allowedDomains.join(",")}`,
      ];

      if (spec.repoUrl) envVars.push(`WORKSTATION_REPO_URL=${spec.repoUrl}`);
      if (spec.repoBranch) envVars.push(`WORKSTATION_REPO_BRANCH=${spec.repoBranch}`);
      if (DEFAULT_PROXY_URL) {
        envVars.push(`HTTP_PROXY=${DEFAULT_PROXY_URL}`, `HTTPS_PROXY=${DEFAULT_PROXY_URL}`, `http_proxy=${DEFAULT_PROXY_URL}`, `https_proxy=${DEFAULT_PROXY_URL}`);
      }

      const name = `ws_t${spec.tenantId}_a${spec.agentId}_${sanitizeLabel(spec.workstationId).slice(0, 28)}`;

      const container = await docker.createContainer({
        name,
        Image: image,
        Env: envVars,
        ExposedPorts: exposedPorts,
        Labels: {
          "app.exportunity.workstation": "1",
          "app.exportunity.tenant_id": String(spec.tenantId),
          "app.exportunity.agent_id": String(spec.agentId),
          "app.exportunity.workstation_id": spec.workstationId,
        },
        HostConfig: {
          AutoRemove: false,
          Memory: Math.max(256, spec.ramMb) * 1024 * 1024,
          NanoCpus: Math.max(1, spec.cpu) * 1_000_000_000,
          PortBindings: portBindings,
          NetworkMode: DEFAULT_DOCKER_NETWORK || undefined,
        },
      });

      await container.start();
      const inspect = await container.inspect();
      const ports = parsePorts(inspect);

      return {
        providerId: inspect.Id,
        status: toStatus(inspect?.State?.Status),
        urls: buildUrls(ports),
        metadata: {
          image,
          imageFallbackUsed: imageInfo.usedFallback,
          ports,
          networkMode: DEFAULT_DOCKER_NETWORK || "bridge",
        },
      };
    },

    async start(providerId) {
      if (!healthy) throw new Error("Docker daemon unavailable for workstation start");
      const { inspect } = await ensureRunning(providerId);
      const ports = parsePorts(inspect);
      return {
        status: toStatus(inspect?.State?.Status),
        urls: buildUrls(ports),
        metadata: {
          image: inspect?.Config?.Image ?? null,
          ports,
        },
      };
    },

    async stop(providerId) {
      if (!healthy) throw new Error("Docker daemon unavailable for workstation stop");
      const { container, inspect } = await inspectContainer(providerId);
      const status = String(inspect?.State?.Status || "").toLowerCase();
      if (status === "running") {
        await container.stop({ t: 10 });
      }
      const next = await container.inspect();
      const ports = parsePorts(next);
      return {
        status: toStatus(next?.State?.Status),
        urls: buildUrls(ports),
        metadata: {
          image: next?.Config?.Image ?? null,
          ports,
        },
      };
    },

    async destroy(providerId) {
      if (!healthy) throw new Error("Docker daemon unavailable for workstation destroy");
      const container = docker.getContainer(providerId);
      try {
        const inspect = await container.inspect();
        if (String(inspect?.State?.Status || "").toLowerCase() === "running") {
          await container.stop({ t: 5 });
        }
      } catch {
        return;
      }
      await container.remove({ force: true });
    },

    async status(providerId) {
      if (!healthy) throw new Error("Docker daemon unavailable for workstation status");
      const { inspect } = await inspectContainer(providerId);
      const ports = parsePorts(inspect);
      return {
        status: toStatus(inspect?.State?.Status),
        urls: buildUrls(ports),
        metadata: {
          image: inspect?.Config?.Image ?? null,
          ports,
        },
      };
    },
  };
}
