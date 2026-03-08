import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/hooks/use-toast";
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
    authTokenLooksValid?: boolean;
    whatsappFromPresent: boolean;
    smsFromPresent: boolean;
    messagingServiceSidPresent: boolean;
    verifyServiceSidPresent?: boolean;
    statusCallbackBaseUrlPresent?: boolean;
    sandboxMode?: boolean;
    whatsappFrom: string | null;
    smsFrom: string | null;
    messagingServiceSid: string | null;
    webhookPath?: string | null;
  };
};

type TenantMessagingProfile = {
  id: number;
  isActive: boolean;
  defaultChannel: "sms" | "whatsapp" | "verify_sms" | "verify_whatsapp";
  smsFrom: string | null;
  whatsappFrom: string | null;
  verifyServiceSid: string | null;
  senderLabel: string | null;
  defaultSignature: string | null;
  messagingServiceSid: string | null;
  whatsappSenderStatus: string | null;
  useSandboxForDev: boolean;
};

type ProfileResponse = { ok: boolean; item: TenantMessagingProfile | null; fallback: TwilioStatusResponse["twilio"] };
type AgentSenderProfile = {
  id: number;
  agentId: number;
  agentKey: string | null;
  productionDisplayName: string | null;
  isActive: boolean;
  displayName: string | null;
  signature: string | null;
  allowedChannels: string[];
  smsFrom: string | null;
  whatsappFrom: string | null;
  fallbackToTenantDefault: boolean;
};
type AgentSendersResponse = { ok: boolean; items: AgentSenderProfile[] };
type EventsResponse = { ok: boolean; items: Array<{ id: number; eventType: string; eventAt: string; data: Record<string, unknown> }> };

function allowed(channels: string[], key: string) {
  return Array.isArray(channels) && channels.includes(key);
}

export function AdminTwilioControlCenterPage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const statusQuery = useQuery<TwilioStatusResponse>({ queryKey: ["/api/admin/twilio/status"], staleTime: 15_000 });
  const profileQuery = useQuery<ProfileResponse>({ queryKey: ["/api/admin/twilio/profile"], staleTime: 5_000 });
  const agentSendersQuery = useQuery<AgentSendersResponse>({ queryKey: ["/api/admin/twilio/agent-senders"], staleTime: 5_000 });
  const eventsQuery = useQuery<EventsResponse>({ queryKey: ["/api/admin/twilio/events?limit=20"], staleTime: 5_000 });

  const cfg = statusQuery.data?.twilio ?? null;
  const profile = profileQuery.data?.item ?? null;
  const smsEnabled = !!(profile?.smsFrom || profile?.messagingServiceSid || cfg?.smsFromPresent || cfg?.messagingServiceSidPresent);
  const whatsappEnabled = !!(profile?.whatsappFrom || cfg?.whatsappFromPresent);
  const canSendSms = !!cfg?.accountSidPresent && !!cfg?.authTokenPresent && smsEnabled;
  const canSendWhatsApp = !!cfg?.accountSidPresent && !!cfg?.authTokenPresent && whatsappEnabled;

  const [profileActive, setProfileActive] = useState(true);
  const [profileDefaultChannel, setProfileDefaultChannel] = useState<"sms" | "whatsapp" | "verify_sms" | "verify_whatsapp">("sms");
  const [profileSmsFrom, setProfileSmsFrom] = useState("");
  const [profileWhatsAppFrom, setProfileWhatsAppFrom] = useState("");
  const [profileMessagingServiceSid, setProfileMessagingServiceSid] = useState("");
  const [profileVerifyServiceSid, setProfileVerifyServiceSid] = useState("");
  const [profileSenderLabel, setProfileSenderLabel] = useState("");
  const [profileSignature, setProfileSignature] = useState("");
  const [profileWhatsappStatus, setProfileWhatsappStatus] = useState("");
  const [profileSandbox, setProfileSandbox] = useState(false);

  useEffect(() => {
    const fallback = profileQuery.data?.fallback;
    setProfileActive(profile?.isActive ?? true);
    setProfileDefaultChannel(profile?.defaultChannel ?? (fallback?.whatsappFrom ? "whatsapp" : "sms"));
    setProfileSmsFrom(profile?.smsFrom || fallback?.smsFrom || "");
    setProfileWhatsAppFrom(profile?.whatsappFrom || fallback?.whatsappFrom || "");
    setProfileMessagingServiceSid(profile?.messagingServiceSid || fallback?.messagingServiceSid || "");
    setProfileVerifyServiceSid(profile?.verifyServiceSid || "");
    setProfileSenderLabel(profile?.senderLabel || tenant?.name || "");
    setProfileSignature(profile?.defaultSignature || "");
    setProfileWhatsappStatus(profile?.whatsappSenderStatus || "");
    setProfileSandbox(Boolean(profile?.useSandboxForDev));
  }, [profile, profileQuery.data?.fallback, tenant?.name]);

  const saveProfileMutation = useMutation({
    mutationFn: async () =>
      await apiRequest("/api/admin/twilio/profile", "PUT", {
        isActive: profileActive,
        defaultChannel: profileDefaultChannel,
        smsFrom: profileSmsFrom.trim() || null,
        whatsappFrom: profileWhatsAppFrom.trim() || null,
        messagingServiceSid: profileMessagingServiceSid.trim() || null,
        verifyServiceSid: profileVerifyServiceSid.trim() || null,
        senderLabel: profileSenderLabel.trim() || null,
        defaultSignature: profileSignature.trim() || null,
        whatsappSenderStatus: profileWhatsappStatus.trim() || null,
        useSandboxForDev: profileSandbox,
      }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Tenant messaging profile updated." });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/profile"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/status"] });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message || "Unable to save tenant profile", variant: "destructive" }),
  });

  const [senderAgentKey, setSenderAgentKey] = useState("support");
  const [senderActive, setSenderActive] = useState(true);
  const [senderDisplayName, setSenderDisplayName] = useState("");
  const [senderSignature, setSenderSignature] = useState("");
  const [senderSmsAllowed, setSenderSmsAllowed] = useState(true);
  const [senderWhatsAppAllowed, setSenderWhatsAppAllowed] = useState(true);
  const [senderVerifySmsAllowed, setSenderVerifySmsAllowed] = useState(false);
  const [senderVerifyWhatsAppAllowed, setSenderVerifyWhatsAppAllowed] = useState(false);
  const [senderSmsFrom, setSenderSmsFrom] = useState("");
  const [senderWhatsAppFrom, setSenderWhatsAppFrom] = useState("");
  const [senderFallback, setSenderFallback] = useState(true);

  const loadAgentSender = (item: AgentSenderProfile) => {
    setSenderAgentKey(item.agentKey || "support");
    setSenderActive(Boolean(item.isActive));
    setSenderDisplayName(item.displayName || item.productionDisplayName || "");
    setSenderSignature(item.signature || "");
    setSenderSmsAllowed(allowed(item.allowedChannels, "sms"));
    setSenderWhatsAppAllowed(allowed(item.allowedChannels, "whatsapp"));
    setSenderVerifySmsAllowed(allowed(item.allowedChannels, "verify_sms"));
    setSenderVerifyWhatsAppAllowed(allowed(item.allowedChannels, "verify_whatsapp"));
    setSenderSmsFrom(item.smsFrom || "");
    setSenderWhatsAppFrom(item.whatsappFrom || "");
    setSenderFallback(Boolean(item.fallbackToTenantDefault));
  };

  const saveAgentSenderMutation = useMutation({
    mutationFn: async () =>
      await apiRequest("/api/admin/twilio/agent-senders", "PUT", {
        agentKey: senderAgentKey.trim(),
        isActive: senderActive,
        displayName: senderDisplayName.trim() || null,
        signature: senderSignature.trim() || null,
        allowedChannels: [
          ...(senderSmsAllowed ? ["sms"] : []),
          ...(senderWhatsAppAllowed ? ["whatsapp"] : []),
          ...(senderVerifySmsAllowed ? ["verify_sms"] : []),
          ...(senderVerifyWhatsAppAllowed ? ["verify_whatsapp"] : []),
        ],
        smsFrom: senderSmsFrom.trim() || null,
        whatsappFrom: senderWhatsAppFrom.trim() || null,
        fallbackToTenantDefault: senderFallback,
      }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Agent sender profile updated." });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/agent-senders"] });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message || "Unable to save agent sender", variant: "destructive" }),
  });

  const [testChannel, setTestChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [testMode, setTestMode] = useState<"text" | "template">("text");
  const [testTo, setTestTo] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testContentSid, setTestContentSid] = useState("");
  const [testContentVariables, setTestContentVariables] = useState('{"1":"12/1","2":"3pm"}');
  const [lastSendResult, setLastSendResult] = useState<any>(null);

  const defaultMessage = useMemo(() => `Bonjour depuis ${tenant?.name || "Exportunity"} (${tenant?.key || "tenant"}).`, [tenant?.key, tenant?.name]);

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        channel: testChannel,
        mode: testMode,
        to: testTo,
        agentKey: senderAgentKey || "support",
        ...(testMessage.trim() ? { message: testMessage.trim() } : { message: defaultMessage }),
      };
      if (testMode === "template") {
        payload.contentSid = testContentSid.trim();
        payload.contentVariables = JSON.parse(testContentVariables || "{}");
      }
      return await apiRequest("/api/admin/twilio/send-test", "POST", payload);
    },
    onSuccess: (data: any) => {
      setLastSendResult(data);
      toast({ title: "Sent", description: data?.result?.providerMessageId || "Twilio send queued." });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/events?limit=20"] });
    },
    onError: (err: any) => toast({ title: "Send failed", description: err?.message || "Unable to send test message", variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Twilio Control Center</h1>
        <p className="text-gray-400 text-sm">Tenant: {tenant?.name || "-"}</p>
      </div>

      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader><CardTitle className="text-white">Runtime health</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={cfg?.accountSidPresent ? "default" : "destructive"}>Account SID</Badge>
            <Badge variant={cfg?.authTokenPresent ? "default" : "destructive"}>Auth token</Badge>
            <Badge variant={smsEnabled ? "default" : "secondary"}>SMS</Badge>
            <Badge variant={whatsappEnabled ? "default" : "secondary"}>WhatsApp</Badge>
            <Badge variant={profile?.verifyServiceSid || cfg?.verifyServiceSidPresent ? "default" : "secondary"}>Verify</Badge>
            {profile?.useSandboxForDev ? <Badge variant="secondary">Sandbox fallback</Badge> : <Badge variant="default">Production-first</Badge>}
          </div>
          <div className="text-xs text-gray-400">
            Status callback: <span className="text-gray-200">{cfg?.webhookPath || "/api/webhooks/twilio/status"}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader><CardTitle className="text-white">Tenant messaging profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 flex items-center gap-3"><span className="text-sm text-white">Active</span><Switch checked={profileActive} onCheckedChange={(v) => setProfileActive(Boolean(v))} /></div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 flex items-center gap-3"><span className="text-sm text-white">Sandbox fallback</span><Switch checked={profileSandbox} onCheckedChange={(v) => setProfileSandbox(Boolean(v))} /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["sms", "whatsapp", "verify_sms", "verify_whatsapp"] as const).map((entry) => (
                <Button key={entry} type="button" variant={profileDefaultChannel === entry ? "default" : "secondary"} onClick={() => setProfileDefaultChannel(entry)}>{entry}</Button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label className="text-gray-300">SMS from</Label><Input value={profileSmsFrom} onChange={(e) => setProfileSmsFrom(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              <div><Label className="text-gray-300">WhatsApp from</Label><Input value={profileWhatsAppFrom} onChange={(e) => setProfileWhatsAppFrom(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              <div><Label className="text-gray-300">Messaging Service SID</Label><Input value={profileMessagingServiceSid} onChange={(e) => setProfileMessagingServiceSid(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              <div><Label className="text-gray-300">Verify Service SID</Label><Input value={profileVerifyServiceSid} onChange={(e) => setProfileVerifyServiceSid(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              <div><Label className="text-gray-300">Sender label</Label><Input value={profileSenderLabel} onChange={(e) => setProfileSenderLabel(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              <div><Label className="text-gray-300">WhatsApp sender status</Label><Input value={profileWhatsappStatus} onChange={(e) => setProfileWhatsappStatus(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
            </div>
            <div><Label className="text-gray-300">Default signature</Label><Textarea value={profileSignature} onChange={(e) => setProfileSignature(e.target.value)} className="bg-gray-950 border-gray-800 text-white min-h-[90px]" /></div>
            <Button onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending}>{saveProfileMutation.isPending ? "Saving..." : "Save tenant profile"}</Button>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader><CardTitle className="text-white">Agent sender profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label className="text-gray-300">Agent key</Label><Input value={senderAgentKey} onChange={(e) => setSenderAgentKey(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              <div><Label className="text-gray-300">Display name</Label><Input value={senderDisplayName} onChange={(e) => setSenderDisplayName(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
            </div>
            <div><Label className="text-gray-300">Signature</Label><Textarea value={senderSignature} onChange={(e) => setSenderSignature(e.target.value)} className="bg-gray-950 border-gray-800 text-white min-h-[80px]" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 flex items-center justify-between"><span className="text-sm text-white">Active</span><Switch checked={senderActive} onCheckedChange={(v) => setSenderActive(Boolean(v))} /></div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 flex items-center justify-between"><span className="text-sm text-white">Fallback</span><Switch checked={senderFallback} onCheckedChange={(v) => setSenderFallback(Boolean(v))} /></div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 flex items-center justify-between"><span className="text-sm text-white">SMS</span><Switch checked={senderSmsAllowed} onCheckedChange={(v) => setSenderSmsAllowed(Boolean(v))} /></div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 flex items-center justify-between"><span className="text-sm text-white">WhatsApp</span><Switch checked={senderWhatsAppAllowed} onCheckedChange={(v) => setSenderWhatsAppAllowed(Boolean(v))} /></div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 flex items-center justify-between"><span className="text-sm text-white">Verify SMS</span><Switch checked={senderVerifySmsAllowed} onCheckedChange={(v) => setSenderVerifySmsAllowed(Boolean(v))} /></div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 flex items-center justify-between"><span className="text-sm text-white">Verify WA</span><Switch checked={senderVerifyWhatsAppAllowed} onCheckedChange={(v) => setSenderVerifyWhatsAppAllowed(Boolean(v))} /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label className="text-gray-300">SMS override</Label><Input value={senderSmsFrom} onChange={(e) => setSenderSmsFrom(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              <div><Label className="text-gray-300">WhatsApp override</Label><Input value={senderWhatsAppFrom} onChange={(e) => setSenderWhatsAppFrom(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
            </div>
            <Button onClick={() => saveAgentSenderMutation.mutate()} disabled={saveAgentSenderMutation.isPending || !senderAgentKey.trim()}>{saveAgentSenderMutation.isPending ? "Saving..." : "Save agent sender"}</Button>
            <ScrollArea className="h-[180px] pr-3"><div className="space-y-2">{(agentSendersQuery.data?.items ?? []).map((item) => <button key={item.id} type="button" onClick={() => loadAgentSender(item)} className="w-full text-left rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2 hover:bg-gray-950/50"><div className="text-sm text-white font-semibold">{item.agentKey || `agent:${item.agentId}`}</div><div className="text-xs text-gray-500 mt-1">{(item.allowedChannels || []).join(", ")}</div></button>)}</div></ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader><CardTitle className="text-white">Test send</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label className="text-gray-300">Recipient</Label><Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+2250100000229" className="bg-gray-950 border-gray-800 text-white" /></div>
            <div><Label className="text-gray-300">Channel / mode</Label><div className="flex flex-wrap gap-2 mt-2"><Button type="button" variant={testChannel === "whatsapp" ? "default" : "secondary"} onClick={() => setTestChannel("whatsapp")}>WhatsApp</Button><Button type="button" variant={testChannel === "sms" ? "default" : "secondary"} onClick={() => { setTestChannel("sms"); setTestMode("text"); }} disabled={!canSendSms}>SMS</Button><Button type="button" variant={testMode === "text" ? "default" : "secondary"} onClick={() => setTestMode("text")}>Text</Button><Button type="button" variant={testMode === "template" ? "default" : "secondary"} onClick={() => setTestMode("template")} disabled={testChannel !== "whatsapp"}>Template</Button></div></div>
            <div className="flex items-end"><Button onClick={() => sendTestMutation.mutate()} disabled={sendTestMutation.isPending || !testTo.trim() || (testChannel === "sms" ? !canSendSms : !canSendWhatsApp) || (testMode === "template" && !testContentSid.trim())}>{sendTestMutation.isPending ? "Sending..." : "Send test"}</Button></div>
          </div>
          <div><Label className="text-gray-300">Message</Label><Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder={defaultMessage} className="bg-gray-950 border-gray-800 text-white" /></div>
          {testMode === "template" ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><Label className="text-gray-300">Content SID</Label><Input value={testContentSid} onChange={(e) => setTestContentSid(e.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div><div><Label className="text-gray-300">Content variables JSON</Label><Textarea value={testContentVariables} onChange={(e) => setTestContentVariables(e.target.value)} className="bg-gray-950 border-gray-800 text-white min-h-[88px]" /></div></div> : null}
          {lastSendResult ? <pre className="text-[11px] text-gray-300 bg-black/40 border border-gray-800 rounded-lg p-3 overflow-auto">{JSON.stringify(lastSendResult, null, 2)}</pre> : null}
          <div className="flex items-center gap-2"><Link href="/admin/communications/twilio/logs"><Button type="button" variant="secondary">View logs</Button></Link><span className="text-xs text-gray-500">Inbound: /api/webhooks/twilio/sms/inbound and /api/webhooks/twilio/whatsapp/inbound</span></div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader><CardTitle className="text-white">Recent webhook events</CardTitle></CardHeader>
        <CardContent><ScrollArea className="h-[320px] pr-4"><div className="space-y-2">{(eventsQuery.data?.items ?? []).map((e) => <div key={e.id} className="rounded-lg border border-gray-800 bg-gray-950/30 p-3"><div className="flex items-center justify-between gap-2"><div className="text-sm text-white">{e.eventType}</div><div className="text-xs text-gray-500">{new Date(e.eventAt).toLocaleString()}</div></div><pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap break-words">{JSON.stringify(e.data ?? {}, null, 2)}</pre></div>)}</div></ScrollArea></CardContent>
      </Card>
    </div>
  );
}
