import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type TwilioStatusResponse = {
  ok: boolean;
  twilio: {
    accountSidPresent: boolean;
    accountSidLooksValid?: boolean;
    authTokenPresent: boolean;
    authTokenLength?: number;
    authTokenLooksValid?: boolean;
    whatsappFromPresent: boolean;
    smsFromPresent: boolean;
    messagingServiceSidPresent: boolean;
    voiceFromPresent?: boolean;
    verifyServiceSidPresent?: boolean;
    publicBaseUrlPresent: boolean;
    statusCallbackBaseUrlPresent?: boolean;
    webhookPathPresent?: boolean;
    sandboxMode?: boolean;
    whatsappFrom: string | null;
    smsFrom: string | null;
    messagingServiceSid: string | null;
    voiceFrom?: string | null;
    webhookPath?: string | null;
  };
};

type RoutingRule = {
  id: number;
  tenantId: number;
  provider: string;
  channel: "sms" | "whatsapp" | "voice";
  toAddress: string;
  agentKey: string;
  isEnabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type RoutingResponse = { ok: boolean; items: RoutingRule[] };

type TwilioEvent = {
  id: number;
  tenantId: number;
  provider: string;
  eventType: string;
  eventAt: string;
  data: Record<string, unknown>;
  createdAt: string;
};

type EventsResponse = { ok: boolean; items: TwilioEvent[] };

type AgentControl = {
  id: number;
  tenantId: number;
  agentKey: string;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  voiceEnabled: boolean;
  smsDailyOutboundLimit: number;
  whatsappDailyOutboundLimit: number;
  voiceDailyOutboundLimit: number;
  voiceDialToE164: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type AgentControlsResponse = { ok: boolean; items: AgentControl[] };

function parseNonNegativeInt(value: string, fallback: number) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

function formatLimit(limit: number) {
  return limit > 0 ? String(limit) : "unlimited";
}

export function AdminTwilioControlCenterPage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tenantKey = tenant?.key ?? null;

  const statusQuery = useQuery<TwilioStatusResponse>({
    queryKey: ["/api/admin/twilio/status"],
    staleTime: 15_000,
  });

  const routingQuery = useQuery<RoutingResponse>({
    queryKey: ["/api/admin/twilio/routing"],
    staleTime: 5_000,
  });

  const eventsQuery = useQuery<EventsResponse>({
    queryKey: ["/api/admin/twilio/events?limit=20"],
    staleTime: 5_000,
  });

  const agentControlsQuery = useQuery<AgentControlsResponse>({
    queryKey: ["/api/admin/twilio/agent-controls"],
    staleTime: 5_000,
  });

  const cfg = statusQuery.data?.twilio ?? null;
  const smsEnabled = !!cfg && (cfg.smsFromPresent || cfg.messagingServiceSidPresent);
  const accountSidLooksValid = cfg?.accountSidLooksValid !== false;
  const authTokenLooksValid = cfg?.authTokenLooksValid !== false;
  const canSendWhatsApp =
    !!cfg && cfg.accountSidPresent && cfg.authTokenPresent && cfg.whatsappFromPresent && accountSidLooksValid && authTokenLooksValid;
  const canSendSms = !!cfg && cfg.accountSidPresent && cfg.authTokenPresent && smsEnabled && accountSidLooksValid && authTokenLooksValid;
  const canUseVoice =
    !!cfg && cfg.accountSidPresent && cfg.authTokenPresent && !!cfg.voiceFromPresent && accountSidLooksValid && authTokenLooksValid;

  const [testChannel, setTestChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [testMode, setTestMode] = useState<"text" | "template">("text");
  const [testTo, setTestTo] = useState<string>("");
  const [testMessage, setTestMessage] = useState<string>("");
  const [testContentSid, setTestContentSid] = useState<string>("");
  const [testContentVariables, setTestContentVariables] = useState<string>('{"1":"value"}');
  const [lastSendResult, setLastSendResult] = useState<any>(null);
  const canSendTest = testChannel === "whatsapp" ? canSendWhatsApp : canSendSms;

  const resolvedDefaultMessage = useMemo(() => {
    const key = tenantKey ? String(tenantKey) : "tenant";
    return `Hello from Bourse de l'Or (Twilio) - test message (${key}).`;
  }, [tenantKey]);

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const clientMessageId =
        typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function"
          ? (crypto as any).randomUUID()
          : `cm_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      if (testMode === "template") {
        const contentSid = testContentSid.trim();
        if (!contentSid) throw new Error("Content SID is required for template sends");
        let contentVariables: any = null;
        const raw = testContentVariables.trim();
        if (raw) {
          try {
            contentVariables = JSON.parse(raw);
          } catch {
            throw new Error("Content variables must be valid JSON");
          }
        }
        return await apiRequest("/api/admin/twilio/send-test", "POST", {
          channel: testChannel,
          mode: "template",
          to: testTo,
          agentKey: "support",
          contentSid,
          contentVariables,
          ...(testMessage.trim() ? { message: testMessage.trim() } : {}),
          client_message_id: clientMessageId,
        });
      }

      const message = (testMessage || "").trim() || resolvedDefaultMessage;
      return await apiRequest("/api/admin/twilio/send-test", "POST", {
        channel: testChannel,
        mode: "text",
        to: testTo,
        agentKey: "support",
        message,
        client_message_id: clientMessageId,
      });
    },
    onSuccess: (data: any) => {
      setLastSendResult(data);
      const sid = data?.result?.providerMessageId;
      toast({ title: "Sent", description: sid ? `Queued (sid=${sid})` : "Twilio test message queued." });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/events?limit=20"] });
    },
    onError: (err: any) => toast({ title: "Send failed", description: err?.message || "Unable to send test message", variant: "destructive" }),
  });

  const [routeChannel, setRouteChannel] = useState<"whatsapp" | "sms" | "voice">("whatsapp");
  const [routeVoiceDialTo, setRouteVoiceDialTo] = useState<string>("");
  const [routeTo, setRouteTo] = useState<string>("");
  const [routeAgentKey, setRouteAgentKey] = useState<string>("support");

  const upsertRouteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/admin/twilio/routing", "POST", {
        channel: routeChannel,
        toAddress: routeTo,
        agentKey: routeAgentKey,
        ...(routeChannel === "voice" && routeVoiceDialTo.trim() ? { dialToE164: routeVoiceDialTo.trim() } : {}),
      });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Routing rule updated." });
      setRouteTo("");
      setRouteVoiceDialTo("");
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/routing"] });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message || "Unable to update routing rule", variant: "destructive" }),
  });

  const [controlsAgentKey, setControlsAgentKey] = useState("");
  const [controlsSmsEnabled, setControlsSmsEnabled] = useState(true);
  const [controlsWhatsappEnabled, setControlsWhatsappEnabled] = useState(true);
  const [controlsVoiceEnabled, setControlsVoiceEnabled] = useState(true);
  const [controlsSmsLimit, setControlsSmsLimit] = useState("0");
  const [controlsWhatsappLimit, setControlsWhatsappLimit] = useState("0");
  const [controlsVoiceLimit, setControlsVoiceLimit] = useState("0");
  const [controlsVoiceDialTo, setControlsVoiceDialTo] = useState("");

  const resetAgentControlsForm = () => {
    setControlsAgentKey("");
    setControlsSmsEnabled(true);
    setControlsWhatsappEnabled(true);
    setControlsVoiceEnabled(true);
    setControlsSmsLimit("0");
    setControlsWhatsappLimit("0");
    setControlsVoiceLimit("0");
    setControlsVoiceDialTo("");
  };

  const loadAgentControls = (c: AgentControl) => {
    setControlsAgentKey(c.agentKey || "");
    setControlsSmsEnabled(Boolean(c.smsEnabled));
    setControlsWhatsappEnabled(Boolean(c.whatsappEnabled));
    setControlsVoiceEnabled(Boolean(c.voiceEnabled));
    setControlsSmsLimit(String(c.smsDailyOutboundLimit ?? 0));
    setControlsWhatsappLimit(String(c.whatsappDailyOutboundLimit ?? 0));
    setControlsVoiceLimit(String(c.voiceDailyOutboundLimit ?? 0));
    setControlsVoiceDialTo(c.voiceDialToE164 || "");
  };

  const saveAgentControlsMutation = useMutation({
    mutationFn: async () => {
      const agentKey = controlsAgentKey.trim();
      if (!agentKey) throw new Error("agentKey required");
      return await apiRequest("/api/admin/twilio/agent-controls", "POST", {
        agentKey,
        smsEnabled: controlsSmsEnabled,
        whatsappEnabled: controlsWhatsappEnabled,
        voiceEnabled: controlsVoiceEnabled,
        smsDailyOutboundLimit: parseNonNegativeInt(controlsSmsLimit, 0),
        whatsappDailyOutboundLimit: parseNonNegativeInt(controlsWhatsappLimit, 0),
        voiceDailyOutboundLimit: parseNonNegativeInt(controlsVoiceLimit, 0),
        voiceDialToE164: controlsVoiceDialTo.trim() || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Agent controls updated." });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/agent-controls"] });
    },
    onError: (err: any) =>
      toast({ title: "Save failed", description: err?.message || "Unable to update agent controls", variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Twilio Control Center</h1>
        <p className="text-gray-400 text-sm">Tenant: {tenant?.name || "-"}</p>
      </div>

      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Quick setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={cfg?.accountSidPresent && accountSidLooksValid ? "default" : "destructive"}>
              Account SID:{" "}
              {cfg?.accountSidPresent ? (accountSidLooksValid ? "OK" : "invalid") : "missing"}
            </Badge>
            <Badge variant={cfg?.authTokenPresent && authTokenLooksValid ? "default" : "destructive"}>
              Auth token:{" "}
              {cfg?.authTokenPresent
                ? authTokenLooksValid
                  ? "OK"
                  : `invalid${typeof cfg?.authTokenLength === "number" ? ` (len=${cfg.authTokenLength})` : ""}`
                : "missing"}
            </Badge>
            <Badge variant={cfg?.statusCallbackBaseUrlPresent ? "default" : "destructive"}>
              Callback base URL: {cfg?.statusCallbackBaseUrlPresent ? "OK" : "missing"}
            </Badge>
            <Badge variant={cfg?.whatsappFromPresent ? "default" : "destructive"}>WA From: {cfg?.whatsappFromPresent ? "OK" : "missing"}</Badge>
            <Badge variant={smsEnabled ? "default" : "secondary"}>SMS: {smsEnabled ? "enabled" : "disabled"}</Badge>
            <Badge variant={cfg?.voiceFromPresent ? "default" : "secondary"}>Voice: {cfg?.voiceFromPresent ? "enabled" : "disabled"}</Badge>
            <Badge variant={cfg?.verifyServiceSidPresent ? "default" : "secondary"}>Verify: {cfg?.verifyServiceSidPresent ? "enabled" : "disabled"}</Badge>
            {cfg?.sandboxMode ? <Badge variant="secondary">Sandbox</Badge> : <Badge variant="default">Live</Badge>}
          </div>

          {cfg && cfg.authTokenPresent && cfg.authTokenLooksValid === false ? (
            <div className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
              <div className="font-semibold">TWILIO_AUTH_TOKEN looks invalid.</div>
              <div className="mt-1">
                Twilio Auth Tokens are typically <span className="font-mono">32</span> characters. Re-copy it from{" "}
                <span className="font-mono">Twilio Console → Account → General Settings</span>.
              </div>
            </div>
          ) : null}

          {cfg && (!cfg.accountSidPresent || !cfg.authTokenPresent || !cfg.whatsappFromPresent) ? (
            <div className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
              Twilio is not fully configured on this server. To send WhatsApp tests you need:{" "}
              <span className="font-mono">TWILIO_ACCOUNT_SID</span>, <span className="font-mono">TWILIO_AUTH_TOKEN</span>,{" "}
              <span className="font-mono">TWILIO_WHATSAPP_FROM</span>.
              <div className="mt-2">
                For delivery webhooks + signature validation set <span className="font-mono">TWILIO_STATUS_CALLBACK_BASE_URL</span> (preferred) or{" "}
                <span className="font-mono">PUBLIC_BASE_URL</span> (or <span className="font-mono">TWILIO_APP_BASE_URL</span>).
              </div>
            </div>
          ) : null}

          {cfg && !cfg.statusCallbackBaseUrlPresent ? (
            <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              Callback base URL is missing. Messages can still send, but you wonâ€™t record <span className="font-semibold">delivered/read</span> statuses reliably.
              Set <span className="font-mono">TWILIO_STATUS_CALLBACK_BASE_URL</span> (recommended) or <span className="font-mono">PUBLIC_BASE_URL</span>.
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-gray-300">Test recipient (E.164)</Label>
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="+2250100000229"
                className="bg-gray-950 border-gray-800 text-white"
              />
            </div>

            <div>
              <Label className="text-gray-300">Channel</Label>
              <div className="flex gap-2 mt-2">
                <Button type="button" variant={testChannel === "whatsapp" ? "default" : "secondary"} onClick={() => setTestChannel("whatsapp")}>
                  WhatsApp
                </Button>
                <Button
                  type="button"
                  variant={testChannel === "sms" ? "default" : "secondary"}
                  onClick={() => {
                    setTestChannel("sms");
                    setTestMode("text");
                  }}
                  disabled={!smsEnabled}
                >
                  SMS
                </Button>
              </div>
              <div className="mt-3">
                <Label className="text-gray-300">Mode</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant={testMode === "text" ? "default" : "secondary"}
                    onClick={() => setTestMode("text")}
                  >
                    Text
                  </Button>
                  <Button
                    type="button"
                    variant={testMode === "template" ? "default" : "secondary"}
                    onClick={() => setTestMode("template")}
                    disabled={testChannel !== "whatsapp"}
                    title={testChannel !== "whatsapp" ? "Templates are WhatsApp-only" : undefined}
                  >
                    Template (Content SID)
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => sendTestMutation.mutate()}
                disabled={
                  sendTestMutation.isPending ||
                  !testTo.trim() ||
                  !canSendTest ||
                  (testMode === "template" && (!testContentSid.trim() || testChannel !== "whatsapp"))
                }
                title={!canSendTest ? "Missing Twilio config for this channel" : undefined}
              >
                {sendTestMutation.isPending ? "Sending..." : "Send test"}
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-gray-300">{testMode === "template" ? "Body (optional)" : "Message (optional)"}</Label>
            <Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder={resolvedDefaultMessage} className="bg-gray-950 border-gray-800 text-white" />
          </div>

          {testMode === "template" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">Content SID</Label>
                <Input
                  value={testContentSid}
                  onChange={(e) => setTestContentSid(e.target.value)}
                  placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="bg-gray-950 border-gray-800 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">Content variables (JSON)</Label>
                <Textarea
                  value={testContentVariables}
                  onChange={(e) => setTestContentVariables(e.target.value)}
                  placeholder='{"1":"12/1","2":"3pm"}'
                  className="bg-gray-950 border-gray-800 text-white min-h-[88px]"
                />
              </div>
            </div>
          ) : null}

          {lastSendResult?.result ? (
            <div className="rounded-lg border border-gray-800 bg-gray-950/30 p-3 text-sm text-gray-200 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold">Last send</div>
                <Link href="/admin/communications/twilio/logs">
                  <Button type="button" variant="secondary" size="sm">
                    View logs
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-gray-300">
                <div>
                  <div className="text-gray-500">Message SID</div>
                  <div className="break-words font-mono">{lastSendResult.result.providerMessageId || "—"}</div>
                </div>
                <div>
                  <div className="text-gray-500">Status</div>
                  <div className="break-words font-mono">{lastSendResult.result.status || "—"}</div>
                </div>
                <div>
                  <div className="text-gray-500">Thread / Message</div>
                  <div className="break-words font-mono">
                    {lastSendResult.result.threadId ?? "—"} / {lastSendResult.result.messageId ?? "—"}
                  </div>
                </div>
              </div>
              {lastSendResult.result.errorMessage ? <div className="text-xs text-rose-200">{lastSendResult.result.errorMessage}</div> : null}
              <pre className="text-[11px] text-gray-300 bg-black/40 border border-gray-800 rounded-lg p-3 overflow-auto">
                {JSON.stringify(lastSendResult, null, 2)}
              </pre>
            </div>
          ) : null}

          <div className="text-xs text-gray-500 space-y-1">
            <div className="text-gray-400">Webhook endpoints:</div>
            <div>
              Messages inbound: <span className="text-gray-300">/api/webhooks/twilio/sms/inbound</span> and{" "}
              <span className="text-gray-300">/api/webhooks/twilio/whatsapp/inbound</span>
            </div>
            <div>
              Message status: <span className="text-gray-300">{cfg?.webhookPath || "/api/webhooks/twilio/status"}</span>
            </div>
            <div>
              Voice inbound (TwiML): <span className="text-gray-300">/api/webhooks/twilio/voice/inbound</span>
            </div>
            <div>
              Voice status: <span className="text-gray-300">/api/webhooks/twilio/voice/status</span>
            </div>
            <div className="text-gray-500">Also available: /api/webhooks/twilio/message/status (canonical), /api/webhooks/twilio/status (alias)</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Routing (To -&gt; agent)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2">
              <Label className="text-gray-300">Channel</Label>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant={routeChannel === "whatsapp" ? "default" : "secondary"} onClick={() => setRouteChannel("whatsapp")}>
                  WhatsApp
                </Button>
                <Button type="button" variant={routeChannel === "sms" ? "default" : "secondary"} onClick={() => setRouteChannel("sms")}>
                  SMS
                </Button>
                <Button
                  type="button"
                  variant={routeChannel === "voice" ? "default" : "secondary"}
                  onClick={() => setRouteChannel("voice")}
                  disabled={!canUseVoice}
                  title={!canUseVoice ? "Configure TWILIO_VOICE_FROM to enable voice routing" : undefined}
                >
                  Voice
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-gray-300">To address (your Twilio number, E.164)</Label>
              <Input
                value={routeTo}
                onChange={(e) => setRouteTo(e.target.value)}
                placeholder={routeChannel === "whatsapp" ? "+14155238886" : "+1XXXXXXXXXX"}
                className="bg-gray-950 border-gray-800 text-white"
              />
            </div>

            {routeChannel === "voice" ? (
              <div>
                <Label className="text-gray-300">Dial to (agent phone, E.164)</Label>
                <Input
                  value={routeVoiceDialTo}
                  onChange={(e) => setRouteVoiceDialTo(e.target.value)}
                  placeholder="+1XXXXXXXXXX"
                  className="bg-gray-950 border-gray-800 text-white"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Optional. If empty, the platform will use agent voice settings (or TWILIO_VOICE_FORWARD_TO).
                </div>
              </div>
            ) : null}

            <div>
              <Label className="text-gray-300">Agent key</Label>
              <Input
                value={routeAgentKey}
                onChange={(e) => setRouteAgentKey(e.target.value)}
                placeholder="support"
                className="bg-gray-950 border-gray-800 text-white"
              />
            </div>

            <Button onClick={() => upsertRouteMutation.mutate()} disabled={upsertRouteMutation.isPending || !routeTo.trim() || !routeAgentKey.trim()}>
              {upsertRouteMutation.isPending ? "Saving..." : "Save routing rule"}
            </Button>

            <div className="border-t border-gray-800 pt-3">
              <div className="text-xs text-gray-500 mb-2">Current rules</div>
              <ScrollArea className="h-[220px] pr-3">
                <div className="space-y-2">
                  {(routingQuery.data?.items ?? []).map((r) => (
                    <div key={r.id} className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white truncate">
                          {r.channel.toUpperCase()} -&gt; {r.agentKey}
                        </div>
                        <Badge variant={r.isEnabled ? "default" : "secondary"}>{r.isEnabled ? "enabled" : "disabled"}</Badge>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 truncate">{r.toAddress}</div>
                      {r.channel === "voice" && (r.metadata as any)?.dialToE164 ? (
                        <div className="text-xs text-gray-500 mt-1 truncate">Dial to: {(r.metadata as any)?.dialToE164}</div>
                      ) : null}
                    </div>
                  ))}
                  {(routingQuery.data?.items?.length ?? 0) === 0 ? <div className="text-sm text-gray-500">No routing rules yet.</div> : null}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Recent webhook events</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px] pr-4">
              <div className="space-y-2">
                {(eventsQuery.data?.items ?? []).map((e) => (
                  <div key={e.id} className="rounded-lg border border-gray-800 bg-gray-950/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-white">{e.eventType}</div>
                      <div className="text-xs text-gray-500">{new Date(e.eventAt).toLocaleString()}</div>
                    </div>
                    <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap break-words">{JSON.stringify(e.data ?? {}, null, 2)}</pre>
                  </div>
                ))}
                {(eventsQuery.data?.items?.length ?? 0) === 0 ? <div className="text-sm text-gray-500">No Twilio events yet.</div> : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Agent controls (limits + enable flags)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-gray-500">
            Controls apply per tenant + agent key. Admin users (and Chairman Assistant) can override limits.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
            <div className="space-y-3">
              <div>
                <Label className="text-gray-300">Agent key</Label>
                <Input
                  value={controlsAgentKey}
                  onChange={(e) => setControlsAgentKey(e.target.value)}
                  placeholder="support"
                  className="bg-gray-950 border-gray-800 text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-800 bg-gray-950/30 p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-white font-medium">SMS</div>
                    <div className="text-xs text-gray-500 mt-1">Enable/disable</div>
                  </div>
                  <Switch checked={controlsSmsEnabled} onCheckedChange={(v) => setControlsSmsEnabled(Boolean(v))} />
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-950/30 p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-white font-medium">WhatsApp</div>
                    <div className="text-xs text-gray-500 mt-1">Enable/disable</div>
                  </div>
                  <Switch checked={controlsWhatsappEnabled} onCheckedChange={(v) => setControlsWhatsappEnabled(Boolean(v))} />
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-950/30 p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-white font-medium">Voice</div>
                    <div className="text-xs text-gray-500 mt-1">Enable/disable</div>
                  </div>
                  <Switch checked={controlsVoiceEnabled} onCheckedChange={(v) => setControlsVoiceEnabled(Boolean(v))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-gray-300">SMS daily limit</Label>
                  <Input
                    value={controlsSmsLimit}
                    onChange={(e) => setControlsSmsLimit(e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    className="bg-gray-950 border-gray-800 text-white"
                  />
                  <div className="text-xs text-gray-500 mt-1">0 = unlimited</div>
                </div>

                <div>
                  <Label className="text-gray-300">WhatsApp daily limit</Label>
                  <Input
                    value={controlsWhatsappLimit}
                    onChange={(e) => setControlsWhatsappLimit(e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    className="bg-gray-950 border-gray-800 text-white"
                  />
                  <div className="text-xs text-gray-500 mt-1">0 = unlimited</div>
                </div>

                <div>
                  <Label className="text-gray-300">Voice daily limit</Label>
                  <Input
                    value={controlsVoiceLimit}
                    onChange={(e) => setControlsVoiceLimit(e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    className="bg-gray-950 border-gray-800 text-white"
                  />
                  <div className="text-xs text-gray-500 mt-1">0 = unlimited</div>
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Voice dial to (E.164)</Label>
                <Input
                  value={controlsVoiceDialTo}
                  onChange={(e) => setControlsVoiceDialTo(e.target.value)}
                  placeholder="+1XXXXXXXXXX"
                  className="bg-gray-950 border-gray-800 text-white"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Used as the default destination for outbound calls for this agent (fallback: <span className="font-mono">TWILIO_VOICE_FORWARD_TO</span>).
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => saveAgentControlsMutation.mutate()} disabled={saveAgentControlsMutation.isPending || !controlsAgentKey.trim()}>
                  {saveAgentControlsMutation.isPending ? "Saving..." : "Save agent controls"}
                </Button>
                <Button type="button" variant="secondary" onClick={resetAgentControlsForm} disabled={saveAgentControlsMutation.isPending}>
                  New / reset
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-gray-500">Existing controls</div>
              <ScrollArea className="h-[420px] pr-3 rounded-lg border border-gray-800 bg-gray-950/20">
                <div className="p-3 space-y-2">
                  {(agentControlsQuery.data?.items ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => loadAgentControls(c)}
                      className="w-full text-left rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 hover:bg-gray-950/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white font-semibold truncate">{c.agentKey}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant={c.smsEnabled ? "default" : "secondary"}>SMS</Badge>
                          <Badge variant={c.whatsappEnabled ? "default" : "secondary"}>WA</Badge>
                          <Badge variant={c.voiceEnabled ? "default" : "secondary"}>Voice</Badge>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Limits: SMS {formatLimit(c.smsDailyOutboundLimit)}, WA {formatLimit(c.whatsappDailyOutboundLimit)}, Voice {formatLimit(c.voiceDailyOutboundLimit)}
                      </div>
                      {c.voiceDialToE164 ? <div className="text-xs text-gray-500 mt-1 truncate">Dial to: {c.voiceDialToE164}</div> : null}
                    </button>
                  ))}
                  {(agentControlsQuery.data?.items?.length ?? 0) === 0 ? <div className="text-sm text-gray-500">No agent controls yet.</div> : null}
                </div>
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
