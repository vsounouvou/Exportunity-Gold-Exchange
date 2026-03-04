type JsonObject = Record<string, any>;

export type ArcGisLayerInfo = {
  id: number;
  name: string;
  type?: string;
  geometryType?: string;
};

export type ArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: Record<string, unknown>;
};

type CadastreClientOptions = {
  baseUrl: string;
  apiKey?: string | null;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
};

function normalizeBaseUrl(input: string) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function toQuery(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, String(entry)));
      continue;
    }
    query.set(key, String(value));
  }
  return query.toString();
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export class CadastreClient {
  private readonly baseUrl: string;
  private readonly token: string | null;
  private readonly connectTimeoutMs: number;
  private readonly totalTimeoutMs: number;

  constructor(options: CadastreClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.token = String(options.apiKey || "").trim() || null;
    this.connectTimeoutMs = Math.max(1000, Math.trunc(options.connectTimeoutMs ?? 3_000));
    this.totalTimeoutMs = Math.max(this.connectTimeoutMs, Math.trunc(options.totalTimeoutMs ?? 25_000));
  }

  private async getJson(pathname: string, queryParams: Record<string, unknown> = {}) {
    if (!this.baseUrl) {
      throw new Error("CI_CADASTRE_BASE_URL is missing");
    }

    const params: Record<string, unknown> = {
      f: "json",
      ...queryParams,
    };

    if (this.token) {
      params.token = this.token;
    }

    const qs = toQuery(params);
    const url = `${this.baseUrl}${pathname}${qs ? `?${qs}` : ""}`;
    const response = await fetchWithTimeout(url, this.totalTimeoutMs);
    if (!response.ok) {
      throw new Error(`Cadastre upstream ${response.status}`);
    }
    const data = (await response.json()) as JsonObject;
    if (data?.error) {
      const msg = String(data.error?.message || "Cadastre upstream error");
      throw new Error(msg);
    }
    return data;
  }

  async ping() {
    const startedAt = Date.now();
    await this.getJson("/");
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      timeoutMs: this.totalTimeoutMs,
    };
  }

  async getLayers() {
    const payload = await this.getJson("/");
    const layers = Array.isArray(payload?.layers) ? payload.layers : [];
    return layers
      .map((layer): ArcGisLayerInfo | null => {
        const id = Number(layer?.id);
        if (!Number.isFinite(id)) return null;
        return {
          id,
          name: String(layer?.name || `Layer ${id}`),
          type: typeof layer?.type === "string" ? layer.type : undefined,
          geometryType: typeof layer?.geometryType === "string" ? layer.geometryType : undefined,
        };
      })
      .filter((item): item is ArcGisLayerInfo => Boolean(item));
  }

  async queryLayerFeatures(layerId: number, options: { where?: string; resultRecordCount?: number } = {}) {
    const payload = await this.getJson(`/${layerId}/query`, {
      where: options.where || "1=1",
      outFields: "*",
      returnGeometry: true,
      outSR: 4326,
      resultOffset: 0,
      resultRecordCount: options.resultRecordCount || 2000,
    });
    return Array.isArray(payload?.features) ? (payload.features as ArcGisFeature[]) : [];
  }
}

export function defaultCiCadastreServiceUrl() {
  return (
    String(process.env.CI_CADASTRE_BASE_URL || "").trim() ||
    "https://mines.gouv.ci.cadastreminier.org/arcgis/rest/services/MapPortal/ActiveLicences/MapServer"
  );
}

