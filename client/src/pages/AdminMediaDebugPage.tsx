import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Loader2, ExternalLink } from "lucide-react";

type DebugCheckResponse = {
  ok: boolean;
  status: {
    status: string;
    checkedAt: string;
    storage: { root: string; publicPath: string; ok: boolean; error?: string };
    replicate: { tokenConfigured: boolean };
  };
  checks: {
    token: { pass: boolean; reason: string };
    storage: { pass: boolean; reason: string };
  };
};

type GeneratedImage = {
  id: string;
  storedUrl?: string | null;
  status?: string | null;
  error?: string | null;
};

export default function AdminMediaDebugPage() {
  const { token } = useSession();
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : undefined),
    [token]
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [check, setCheck] = useState<DebugCheckResponse | null>(null);
  const [lastImage, setLastImage] = useState<GeneratedImage | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runCheck = async () => {
    if (!headers) return;
    setBusy("check");
    setMessage(null);
    try {
      const res = (await apiRequest("/api/admin/media/debug/check", { method: "POST", headers })) as DebugCheckResponse;
      setCheck(res);
      return res;
    } catch (err: any) {
      setMessage(err?.message || "FAIL");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const checkToken = async () => {
    const res = await runCheck();
    if (!res) return;
    setMessage(res.checks.token.pass ? "PASS: token configured" : `FAIL: ${res.checks.token.reason}`);
  };

  const checkStorage = async () => {
    const res = await runCheck();
    if (!res) return;
    setMessage(res.checks.storage.pass ? "PASS: storage writable" : `FAIL: ${res.checks.storage.reason}`);
  };

  const generate = async (mode: "fast" | "quality") => {
    if (!headers) return;
    setBusy(`gen-${mode}`);
    setMessage(null);
    try {
      const res = await apiRequest(`/api/admin/media/debug/generate-${mode}`, { method: "POST", headers });
      setLastImage(res.image || null);
      setMessage(res.ok ? `PASS: generated (${mode})` : `FAIL: ${res.message || "generation failed"}`);
    } catch (err: any) {
      setMessage(err?.message || "FAIL");
    } finally {
      setBusy(null);
    }
  };

  const setHero = async () => {
    if (!headers || !lastImage?.id) return;
    setBusy("set-hero");
    setMessage(null);
    try {
      const res = await apiRequest("/api/admin/media/debug/set-hero", {
        method: "POST",
        headers,
        body: JSON.stringify({ imageId: lastImage.id }),
      });
      setMessage(res.ok ? "PASS: hero updated" : `FAIL: ${res.message || "set-hero failed"}`);
    } catch (err: any) {
      setMessage(err?.message || "FAIL");
    } finally {
      setBusy(null);
    }
  };

  const openLast = () => {
    if (!lastImage?.storedUrl) return;
    window.open(lastImage.storedUrl, "_blank");
  };

  const openGateway = () => {
    window.open("/gateway", "_blank");
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Admin &gt; Media &gt; Debug</h1>
        <div className="text-sm text-gray-400">One-click checks for storage, token, generation, and gateway refresh.</div>
      </div>

      {message && (
        <div className="text-sm text-gray-200 bg-slate-900/60 border border-slate-800 rounded-lg p-3">{message}</div>
      )}

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Checks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={checkToken} disabled={!headers || busy !== null}>
              {busy === "check" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              1) Check token status
            </Button>
            <Button onClick={checkStorage} disabled={!headers || busy !== null} variant="secondary">
              {busy === "check" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              2) Check storage writable
            </Button>
            {check && (
              <>
                <Badge variant="outline" className="bg-slate-950 border-slate-800 text-gray-200">
                  Token: {check.checks.token.pass ? "PASS" : "FAIL"}
                </Badge>
                <Badge variant="outline" className="bg-slate-950 border-slate-800 text-gray-200">
                  Storage: {check.checks.storage.pass ? "PASS" : "FAIL"}
                </Badge>
              </>
            )}
          </div>
          {check && (
            <div className="text-xs text-gray-400 space-y-1">
              <div>{check.checks.token.reason}</div>
              <div>{check.checks.storage.reason}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Generation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => generate("fast")} disabled={!headers || busy !== null}>
              {busy === "gen-fast" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              3) Generate test image FAST
            </Button>
            <Button onClick={() => generate("quality")} disabled={!headers || busy !== null} variant="secondary">
              {busy === "gen-quality" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              4) Generate test image QUALITY
            </Button>
            <Button onClick={openLast} disabled={!lastImage?.storedUrl} variant="ghost">
              <ExternalLink className="h-4 w-4 mr-2" />
              5) Open generated asset URL
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={setHero} disabled={!lastImage?.id || busy !== null}>
              {busy === "set-hero" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              6) Set it active for hero
            </Button>
            <Button onClick={openGateway} variant="ghost">
              <ExternalLink className="h-4 w-4 mr-2" />
              7) Open /gateway
            </Button>
          </div>

          {lastImage && (
            <div className="text-xs text-gray-400 space-y-1">
              <div>Last image id: {lastImage.id}</div>
              <div>Stored URL: {lastImage.storedUrl || "n/a"}</div>
              <div>Status: {lastImage.status || "n/a"}</div>
              {lastImage.error && <div>Error: {lastImage.error}</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
