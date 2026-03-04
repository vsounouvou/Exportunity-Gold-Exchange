import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MachineryViewer } from "@/components/machinery/MachineryViewer";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  History,
  Play,
  Rocket,
  ShieldAlert,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";

type UiAccessPayload =
  | {
      ok: true;
      enabled: true;
      tenant: { id: number; key: string; name: string };
      user: { id: number | null; displayName: string | null };
    }
  | { ok: false; message?: string };

type RevisionsPayload = {
  ok: true;
  machine: { id: number; machineFamily: string; status: string };
  revisions: Array<{ id: number; revision: number; parametersHash: string; createdAt: string }>;
};

type RevisionPayload = {
  ok: true;
  revision: {
    id: number;
    revision: number;
    machineId: number;
    machineFamily: string;
    parametersHash: string;
    createdAt: string;
    recipe: any;
    previewArtifacts: Array<{ kind: "glb" | "stl"; sha256: string | null; url: string }>;
    latestExecution: { jobId: number; nodeId: string; artifactsLocation: string; updatedAt: string } | null;
    actions: Array<{ id: number; createdAt: string; action: any }>;
  };
};

type ArtifactsPayload = {
  ok: true;
  artifactsLocation: string | null;
  files: Array<{ name: string; kind: string | null; contentType: string; url: string }>;
};

type PartItem = { id: string; label: string };

function safeJson(value: unknown, maxChars = 8000) {
  try {
    const text = JSON.stringify(value, null, 2);
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n... (truncated)`;
  } catch {
    return String(value ?? "");
  }
}

function newDefaultProjectId() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  return `mine_${stamp}`;
}

function parseQueryId(location: string, key: string): number | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildQuery(location: string, params: Record<string, string | null>) {
  const path = location.split("?")[0] || "/machinery";
  const next = new URLSearchParams(location.split("?")[1] || "");
  for (const [k, v] of Object.entries(params)) {
    if (!v) next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}

type ParamField =
  | { key: string; label: string; kind: "number"; min: number; max: number; step: string }
  | { key: string; label: string; kind: "text"; maxLen: number; placeholder?: string };

const PARAM_FIELDS: ParamField[] = [
  { key: "throughput_tph", label: "Throughput (tph)", kind: "number", min: 0.1, max: 250, step: "0.1" },
  { key: "skid_length_m", label: "Skid length (m)", kind: "number", min: 1.8, max: 24, step: "0.01" },
  { key: "skid_width_m", label: "Skid width (m)", kind: "number", min: 0.8, max: 8, step: "0.01" },
  { key: "skid_height_m", label: "Skid height (m)", kind: "number", min: 0.12, max: 2.5, step: "0.01" },
  { key: "module_spacing_m", label: "Module spacing (m)", kind: "number", min: 0.05, max: 2.5, step: "0.01" },
  { key: "module_scale", label: "Module scale", kind: "number", min: 0.4, max: 3, step: "0.01" },
  { key: "geology", label: "Geology", kind: "text", maxLen: 240, placeholder: "e.g. alluvial, quartz, laterite..." },
  { key: "geography", label: "Geography", kind: "text", maxLen: 240, placeholder: "e.g. West Africa, Mali, Ghana..." },
];

function toDraftString(value: unknown) {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value ?? "");
}

export function MachineryPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  const isAdmin = session.user?.currentMode === "admin" || session.hasRole("admin");

  const [intent, setIntent] = useState("Dry gold recovery for 1-2 t/h artisanal mine, minimal water, West Africa.");
  const [projectId, setProjectId] = useState(newDefaultProjectId());
  const [requestId, setRequestId] = useState<number | null>(() => parseQueryId(location, "requestId"));
  const [machineId, setMachineId] = useState<number | null>(() => parseQueryId(location, "machineId"));
  const [revisionId, setRevisionId] = useState<number | null>(() => parseQueryId(location, "revisionId"));
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [paramDraft, setParamDraft] = useState<Record<string, string>>({});
  const [regenerateNote, setRegenerateNote] = useState<string>("");
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const uiAccess = useQuery<UiAccessPayload>({
    queryKey: ["/api/internal/engineering/ui-access"],
    retry: false,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const fromUrlRequestId = parseQueryId(location, "requestId");
    const fromUrlMachineId = parseQueryId(location, "machineId");
    const fromUrlRevisionId = parseQueryId(location, "revisionId");

    if (fromUrlRequestId && fromUrlRequestId !== requestId) setRequestId(fromUrlRequestId);
    if (fromUrlMachineId && fromUrlMachineId !== machineId) setMachineId(fromUrlMachineId);
    if (fromUrlRevisionId && fromUrlRevisionId !== revisionId) setRevisionId(fromUrlRevisionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Machinery (Private) - Engineering Kernel";

    let meta = document.querySelector('meta[name=\"robots\"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    const prevRobots = meta.getAttribute("content");
    meta.setAttribute("content", "noindex, nofollow, noarchive");

    return () => {
      document.title = previousTitle;
      if (meta) {
        if (prevRobots) meta.setAttribute("content", prevRobots);
        else meta.remove();
      }
    };
  }, []);

  const canUseUi = Boolean(uiAccess.data && (uiAccess.data as any).ok);
  const accessDenied =
    uiAccess.isError ||
    (uiAccess.data && (uiAccess.data as any).ok === false) ||
    (uiAccess.data && (uiAccess.data as any).ok && (uiAccess.data as any).enabled !== true);

  const revisionsQuery = useQuery<RevisionsPayload>({
    queryKey: ["/api/internal/engineering/machines", machineId, "revisions"],
    enabled: canUseUi && !!machineId,
    queryFn: async () => {
      return await apiRequest(`/api/internal/engineering/machines/${machineId}/revisions`, { method: "GET" });
    },
    staleTime: 10_000,
  });

  const revisionQuery = useQuery<RevisionPayload>({
    queryKey: ["/api/internal/engineering/revisions", revisionId],
    enabled: canUseUi && !!revisionId,
    queryFn: async () => {
      return await apiRequest(`/api/internal/engineering/revisions/${revisionId}`, { method: "GET" });
    },
    staleTime: 10_000,
  });

  const artifactsQuery = useQuery<ArtifactsPayload>({
    queryKey: ["/api/internal/engineering/revisions", revisionId, "artifacts"],
    enabled: canUseUi && !!revisionId,
    queryFn: async () => {
      return await apiRequest(`/api/internal/engineering/revisions/${revisionId}/artifacts`, { method: "GET" });
    },
    staleTime: 5_000,
  });

  const recipe = (revisionQuery.data as any)?.revision?.recipe as any | undefined;
  const recipeParams = useMemo(() => {
    const raw = recipe?.parameters;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {} as Record<string, unknown>;
  }, [recipe]);

  useEffect(() => {
    if (!recipe || !revisionId) return;
    const next: Record<string, string> = {};
    for (const field of PARAM_FIELDS) next[field.key] = toDraftString((recipeParams as any)[field.key]);
    setParamDraft(next);
    setSelectedPartId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionId, (revisionQuery.data as any)?.revision?.parametersHash]);

  const parts = useMemo<{ skid: PartItem[]; modules: PartItem[] }>(() => {
    const modulesRaw: unknown[] = Array.isArray(recipe?.modules) ? (recipe.modules as unknown[]) : [];
    const modules = modulesRaw
      .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
      .map((m, idx) => {
        const id = String(m.id ?? `module_${idx + 1}`).trim() || `module_${idx + 1}`;
        const type = String(m.type ?? "module").trim() || "module";
        return { id, type };
      });

    return {
      skid: [{ id: "skid_frame", label: "Skid frame" }],
      modules: modules.map((module) => ({ id: module.id, label: `${module.type} (${module.id})` })),
    };
  }, [recipe]);

  const paramPatch = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const field of PARAM_FIELDS) {
      const draft = String(paramDraft[field.key] ?? "");
      const base = (recipeParams as any)[field.key];

      if (field.kind === "text") {
        const next = draft.trim();
        const prev = String(base ?? "").trim();
        if (!next || next === prev) continue;
        out[field.key] = next.slice(0, field.maxLen);
        continue;
      }

      const nextRaw = draft.trim();
      if (!nextRaw) continue;
      const next = Number(nextRaw);
      if (!Number.isFinite(next)) continue;

      const prevNum = typeof base === "number" && Number.isFinite(base) ? (base as number) : Number(String(base ?? ""));
      if (Number.isFinite(prevNum) && Math.abs(prevNum - next) < 1e-9) continue;
      out[field.key] = next;
    }
    return out;
  }, [paramDraft, recipeParams]);

  const downloadFile = useCallback(
    async (file: { url: string; name: string }) => {
      if (!session.token) throw new Error("Authentication required");
      const res = await fetch(resolveApiUrl(file.url), {
        headers: { Authorization: `Bearer ${session.token}` },
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = file.name;
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      }
    },
    [session.token],
  );

  const statusBadge = uiAccess.isLoading ? (
    <Badge className="bg-white/10 border-white/10 text-white/70">Checking…</Badge>
  ) : accessDenied ? (
    <Badge className="bg-rose-500/15 border-rose-400/30 text-rose-200">Blocked</Badge>
  ) : (
    <Badge className="bg-emerald-500/15 border-emerald-400/30 text-emerald-200">Enabled</Badge>
  );

  const createIntentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/internal/engineering/intent", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, intent, input: {} }),
      });
    },
    onSuccess: (data: any) => {
      const nextRequestId = Number(data?.request_id) || null;
      setLastResponse(data);
      setRequestId(nextRequestId);
      setMachineId(null);
      setRevisionId(null);
      setStatusLine(`Intent created (request_id=${data?.request_id ?? "?"})`);
      setLocation(
        buildQuery(location, {
          requestId: nextRequestId ? String(nextRequestId) : null,
          machineId: null,
          revisionId: null,
        }),
      );
    },
    onError: (err: any) => {
      setStatusLine(err?.message ? `Intent failed: ${err.message}` : "Intent failed");
    },
  });

  const compileMutation = useMutation({
    mutationFn: async () => {
      if (!requestId) throw new Error("request_id missing");
      return apiRequest("/api/internal/engineering/compile", {
        method: "POST",
        body: JSON.stringify({ request_id: requestId }),
      });
    },
    onSuccess: (data: any) => {
      const nextMachineId = Number(data?.machineId) || null;
      const nextRevisionId = Number(data?.revisionId) || null;
      setLastResponse(data);
      setMachineId(nextMachineId);
      setRevisionId(nextRevisionId);
      setStatusLine(`Compiled (revisionId=${data?.revisionId ?? "?"})`);
      setLocation(
        buildQuery(location, {
          requestId: requestId ? String(requestId) : null,
          machineId: nextMachineId ? String(nextMachineId) : null,
          revisionId: nextRevisionId ? String(nextRevisionId) : null,
        }),
      );
    },
    onError: (err: any) => {
      setStatusLine(err?.message ? `Compile failed: ${err.message}` : "Compile failed");
    },
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!revisionId) throw new Error("revision_id missing");
      return apiRequest("/api/internal/engineering/execute", {
        method: "POST",
        body: JSON.stringify({ revision_id: revisionId }),
      });
    },
    onSuccess: (data: any) => {
      setLastResponse(data);
      setStatusLine(`Executed (jobId=${data?.jobId ?? "?"})`);
      queryClient.invalidateQueries({ queryKey: ["/api/internal/engineering/revisions", revisionId, "artifacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/internal/engineering/revisions", revisionId] });
    },
    onError: (err: any) => {
      setStatusLine(err?.message ? `Execute failed: ${err.message}` : "Execute failed");
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (!revisionId) throw new Error("revision_id missing");
      if (!Object.keys(paramPatch).length) throw new Error("No parameter changes");
      return apiRequest(`/api/internal/engineering/revisions/${revisionId}/regenerate`, {
        method: "POST",
        body: JSON.stringify({
          parameters: paramPatch,
          action: regenerateNote.trim()
            ? { source: "ui", note: regenerateNote.trim().slice(0, 240) }
            : { source: "ui" },
        }),
      });
    },
    onSuccess: (data: any) => {
      const nextRevisionId = Number(data?.revisionId) || null;
      setLastResponse(data);
      if (nextRevisionId) setRevisionId(nextRevisionId);
      setStatusLine(`Regenerated (revisionId=${data?.revisionId ?? "?"})`);
      setRegenerateNote("");
      setLocation(
        buildQuery(location, {
          machineId: machineId ? String(machineId) : null,
          revisionId: nextRevisionId ? String(nextRevisionId) : null,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/internal/engineering/machines", machineId, "revisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/internal/engineering/revisions", revisionId] });
    },
    onError: (err: any) => {
      setStatusLine(err?.message ? `Regenerate failed: ${err.message}` : "Regenerate failed");
    },
  });

  const busy =
    uiAccess.isLoading ||
    createIntentMutation.isPending ||
    compileMutation.isPending ||
    executeMutation.isPending ||
    regenerateMutation.isPending;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Machinery</h1>
            <p className="text-sm text-gray-400">Private CAD editor (parametric). Not indexed.</p>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge}
            {!isAdmin ? (
              <Badge variant="outline" className="border-amber-500/30 text-amber-200">
                <ShieldAlert className="h-3 w-3 mr-1" />
                Admin required
              </Badge>
            ) : null}
          </div>
        </div>

        {accessDenied ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-200">
                <AlertCircle className="h-5 w-5" />
                Access blocked
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-300 space-y-2">
              <p>This page is private and requires an enabled feature flag + tenant admin access.</p>
              <p className="text-gray-400">
                {uiAccess.error instanceof Error
                  ? uiAccess.error.message
                  : (uiAccess.data as any)?.message || "Forbidden"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-amber-300" />
                  Intent
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Project ID</label>
                    <div className="flex gap-2">
                      <Input
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white"
                        disabled={busy}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="bg-gray-800 border border-gray-700 text-gray-200"
                        onClick={() => setProjectId(newDefaultProjectId())}
                        disabled={busy}
                      >
                        New
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-xs text-gray-400">
                      Tenant:{" "}
                      <span className="font-mono text-gray-200">
                        {uiAccess.data && (uiAccess.data as any).ok ? (uiAccess.data as any).tenant?.key : "?"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      request_id: <span className="font-mono text-gray-200">{requestId ?? "-"}</span> | machineId:{" "}
                      <span className="font-mono text-gray-200">{machineId ?? "-"}</span> | revisionId:{" "}
                      <span className="font-mono text-gray-200">{revisionId ?? "-"}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400">Describe the machine (intent only)</label>
                  <Textarea
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white min-h-[120px]"
                    disabled={busy}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => createIntentMutation.mutate()}
                    disabled={busy || !intent.trim() || !projectId.trim()}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Create Intent
                  </Button>
                  <Button
                    onClick={() => compileMutation.mutate()}
                    disabled={busy || !requestId}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Cpu className="h-4 w-4 mr-2" />
                    Compile
                  </Button>
                  <Button
                    onClick={() => executeMutation.mutate()}
                    disabled={busy || !revisionId}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Rocket className="h-4 w-4 mr-2" />
                    Execute
                  </Button>
                </div>

                {statusLine ? (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    <span className="text-gray-200">{statusLine}</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span>3D Preview</span>
                      <Badge className="bg-white/10 border-white/10 text-white/70 font-mono">
                        rev {revisionQuery.data?.revision?.revision ?? "-"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[420px]">
                      <MachineryViewer
                        revisionId={revisionId}
                        token={session.token}
                        selectedPartId={selectedPartId}
                        onSelectPartId={setSelectedPartId}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Play className="h-5 w-5 text-blue-200" />
                      Status / Logs
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-gray-500">Latest response (JSON):</div>
                    <pre className="whitespace-pre-wrap break-words text-xs bg-black/40 border border-white/10 rounded-lg p-3 max-h-[320px] overflow-auto">
                      {lastResponse ? safeJson(lastResponse) : "No actions yet."}
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5 text-amber-200" />
                      Revisions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {!machineId ? (
                      <div className="text-sm text-gray-400">Compile an intent to create a machine + revisions.</div>
                    ) : revisionsQuery.isLoading ? (
                      <div className="text-sm text-gray-400">Loading revisions...</div>
                    ) : (revisionsQuery.data?.revisions?.length ?? 0) === 0 ? (
                      <div className="text-sm text-gray-400">No revisions found.</div>
                    ) : (
                      <div className="space-y-1 max-h-[180px] overflow-auto pr-1">
                        {revisionsQuery.data!.revisions.map((r) => {
                          const active = r.id === revisionId;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setRevisionId(r.id);
                                setLocation(buildQuery(location, { machineId: String(machineId), revisionId: String(r.id) }));
                              }}
                              className={[
                                "w-full text-left rounded-lg border px-3 py-2 text-sm",
                                active
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                                  : "border-white/10 bg-black/20 text-white/75 hover:bg-black/30",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono">rev {r.revision}</span>
                                <span className="text-[11px] text-white/45">{new Date(r.createdAt).toLocaleString()}</span>
                              </div>
                              <div className="text-[11px] text-white/45 font-mono truncate">{r.parametersHash}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <SlidersHorizontal className="h-5 w-5 text-blue-200" />
                      Parameters
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!revisionId ? (
                      <div className="text-sm text-gray-400">Select a revision to edit parameters.</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-2">
                          {PARAM_FIELDS.map((field) => {
                            const value = String(paramDraft[field.key] ?? "");
                            const base = (recipeParams as any)[field.key];
                            const changed =
                              field.kind === "text"
                                ? value.trim() !== String(base ?? "").trim()
                                : value.trim() !== toDraftString(base).trim();
                            const numberOutOfRange =
                              field.kind === "number" && value.trim()
                                ? (() => {
                                    const n = Number(value);
                                    return Number.isFinite(n) && (n < field.min || n > field.max);
                                  })()
                                : false;

                            return (
                              <div key={field.key} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-xs text-gray-400">{field.label}</label>
                                  {changed ? (
                                    <span className="text-[10px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                                      changed
                                    </span>
                                  ) : null}
                                </div>
                                {field.kind === "text" ? (
                                  <Input
                                    value={value}
                                    onChange={(e) =>
                                      setParamDraft((prev) => ({ ...prev, [field.key]: e.target.value.slice(0, field.maxLen) }))
                                    }
                                    placeholder={field.placeholder}
                                    className="bg-gray-800 border-gray-700 text-white"
                                    disabled={busy}
                                  />
                                ) : (
                                  <Input
                                    type="number"
                                    value={value}
                                    onChange={(e) => setParamDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    min={field.min}
                                    max={field.max}
                                    step={field.step}
                                    className={["bg-gray-800 border-gray-700 text-white", numberOutOfRange ? "border-rose-500/60" : ""].join(" ")}
                                    disabled={busy}
                                  />
                                )}
                                {field.kind === "number" ? (
                                  <div className="text-[11px] text-white/45">
                                    Range: <span className="font-mono">{field.min}</span> - <span className="font-mono">{field.max}</span>
                                    {numberOutOfRange ? <span className="text-rose-200"> (will be clamped)</span> : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs text-gray-400">Edit note (optional)</label>
                          <Input
                            value={regenerateNote}
                            onChange={(e) => setRegenerateNote(e.target.value)}
                            className="bg-gray-800 border-gray-700 text-white"
                            placeholder="Why this change?"
                            disabled={busy}
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className="bg-gray-800 border border-gray-700 text-gray-200"
                            onClick={() => {
                              const next: Record<string, string> = {};
                              for (const field of PARAM_FIELDS) next[field.key] = toDraftString((recipeParams as any)[field.key]);
                              setParamDraft(next);
                              setRegenerateNote("");
                            }}
                            disabled={busy}
                          >
                            <Undo2 className="h-4 w-4 mr-2" />
                            Reset
                          </Button>
                          <Button
                            type="button"
                            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                            onClick={() => regenerateMutation.mutate()}
                            disabled={busy || !Object.keys(paramPatch).length}
                            title={!Object.keys(paramPatch).length ? "No parameter changes" : undefined}
                          >
                            <Cpu className="h-4 w-4 mr-2" />
                            Regenerate
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Download className="h-5 w-5 text-emerald-200" />
                      Exports
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {!revisionId ? (
                      <div className="text-sm text-gray-400">Select a revision to access exports.</div>
                    ) : artifactsQuery.isLoading ? (
                      <div className="text-sm text-gray-400">Loading artifacts...</div>
                    ) : (artifactsQuery.data?.files?.length ?? 0) === 0 ? (
                      <div className="text-sm text-gray-400">
                        No artifacts yet. Click <span className="font-semibold text-white/80">Execute</span> to generate STEP/DXF/STL + BOM.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-[11px] text-white/45 font-mono truncate">{artifactsQuery.data?.artifactsLocation ?? ""}</div>
                        <div className="space-y-1">
                          {artifactsQuery.data!.files.map((f) => (
                            <div key={f.name} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-sm text-white/80 font-mono truncate">{f.name}</div>
                                <div className="text-[11px] text-white/45">{f.contentType}</div>
                              </div>
                              <Button
                                type="button"
                                variant="secondary"
                                className="bg-gray-800 border border-gray-700 text-gray-200"
                                onClick={() => downloadFile({ url: f.url, name: f.name })}
                                disabled={busy}
                              >
                                Download
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle>Parts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {!revisionId ? (
                      <div className="text-sm text-gray-400">Select a revision to browse parts.</div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Skid</div>
                          {parts.skid.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedPartId(p.id)}
                              className={[
                                "w-full text-left rounded-lg border px-3 py-2 text-sm",
                                selectedPartId === p.id
                                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                                  : "border-white/10 bg-black/20 text-white/75 hover:bg-black/30",
                              ].join(" ")}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Modules</div>
                          <div className="space-y-1 max-h-[200px] overflow-auto pr-1">
                            {parts.modules.length === 0 ? (
                              <div className="text-sm text-gray-400">No modules.</div>
                            ) : (
                              parts.modules.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setSelectedPartId(p.id)}
                                  className={[
                                    "w-full text-left rounded-lg border px-3 py-2 text-sm",
                                    selectedPartId === p.id
                                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                                      : "border-white/10 bg-black/20 text-white/75 hover:bg-black/30",
                                  ].join(" ")}
                                >
                                  {p.label}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle>Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {!revisionId ? (
                      <div className="text-sm text-gray-400">Select a revision to view actions.</div>
                    ) : revisionQuery.isLoading ? (
                      <div className="text-sm text-gray-400">Loading actions...</div>
                    ) : (revisionQuery.data?.revision?.actions?.length ?? 0) === 0 ? (
                      <div className="text-sm text-gray-400">No actions recorded for this revision.</div>
                    ) : (
                      <div className="space-y-2 max-h-[240px] overflow-auto pr-1">
                        {revisionQuery.data!.revision.actions.map((a) => (
                          <div key={a.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <div className="text-[11px] text-white/45">{new Date(a.createdAt).toLocaleString()}</div>
                            <pre className="whitespace-pre-wrap break-words text-xs text-white/70 mt-1">{safeJson(a.action, 1200)}</pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
