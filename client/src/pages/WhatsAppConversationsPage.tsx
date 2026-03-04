import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { MessageSquare, Search, Send } from "lucide-react";

function createClientMessageId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatDeliveryStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (s === "sent") return "SENT_TO_PROVIDER";
  if (s === "delivered") return "DELIVERED";
  if (s === "read") return "READ";
  if (s === "failed") return "FAILED";
  return status || "—";
}

type ConversationRow = {
  conversationId: string;
  phone: string;
  lastMessage:
    | {
        id: number;
        direction: "in" | "out";
        messageType: string;
        textBody: string | null;
        createdAt: string;
      }
    | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  status?: string | null;
  updatedAt?: string | null;
};

type WaMessage = {
  id: number;
  direction: "in" | "out";
  messageType: string;
  textBody: string | null;
  waPhoneE164: string;
  createdAt: string;
  deliveryStatus: string;
};

type WaAdminStatus = {
  provider: string;
  connected: boolean;
  dryRun: boolean;
  dryRunAllowed: boolean;
  phoneNumberIdPresent: boolean;
  wabaIdPresent: boolean;
  verifyTokenPresent: boolean;
  appSecretPresent: boolean;
  graphBaseUrl: string;
};

type WaTemplateInfo = {
  name: string;
  language?: string | null;
  status?: string | null;
  category?: string | null;
};

type TwilioAdminStatusResponse = {
  ok: boolean;
  twilio?: {
    accountSidPresent?: boolean;
    authTokenPresent?: boolean;
    whatsappFromPresent?: boolean;
  };
};

export default function WhatsAppConversationsPage() {
  const session = useSession();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const [testTo, setTestTo] = useState("");
  const [testMode, setTestMode] = useState<"template" | "text">("template");
  const [testTemplateName, setTestTemplateName] = useState("ORDER_STATUS_UPDATE");
  const [testLanguageCode, setTestLanguageCode] = useState("en_US");
  const [testMessage, setTestMessage] = useState("");
  const [testDryRun, setTestDryRun] = useState(true);
  const dryRunInitializedRef = useRef(false);

  const isAdmin = session.hasRole("admin");

  const { data: conversations = [], isLoading } = useQuery<ConversationRow[]>({
    queryKey: ["/api/whatsapp/admin/conversations"],
    enabled: session.isAuthenticated && isAdmin,
    queryFn: async () => {
      return await apiRequest("/api/whatsapp/admin/conversations", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.phone.toLowerCase().includes(q) || c.conversationId.toLowerCase().includes(q));
  }, [conversations, search]);

  const activeConversationId = selectedConversationId || filtered[0]?.conversationId || null;

  const { data: messages = [], isLoading: messagesLoading } = useQuery<WaMessage[]>({
    queryKey: ["/api/whatsapp/admin/conversations/messages", activeConversationId],
    enabled: session.isAuthenticated && isAdmin && !!activeConversationId,
    queryFn: async () => {
      return await apiRequest(`/api/whatsapp/admin/conversations/${activeConversationId}/messages`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
  });

  const { data: waStatus } = useQuery<{ ok: boolean; status: WaAdminStatus }>({
    queryKey: ["/api/whatsapp/admin/status"],
    enabled: session.isAuthenticated && isAdmin,
    queryFn: async () => {
      return await apiRequest("/api/whatsapp/admin/status", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
  });

  useEffect(() => {
    if (dryRunInitializedRef.current) return;
    const serverDryRun = waStatus?.status?.dryRun;
    const dryRunAllowed = waStatus?.status?.dryRunAllowed;
    if (typeof serverDryRun !== "boolean") return;
    setTestDryRun(dryRunAllowed === false ? false : serverDryRun);
    dryRunInitializedRef.current = true;
  }, [waStatus?.status?.dryRun, waStatus?.status?.dryRunAllowed]);

  const { data: waTemplates } = useQuery<{ ok: boolean; templates: WaTemplateInfo[] }>({
    queryKey: ["/api/whatsapp/admin/templates"],
    enabled: session.isAuthenticated && isAdmin,
    queryFn: async () => {
      return await apiRequest("/api/whatsapp/admin/templates", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
  });

  const { data: twilioStatus } = useQuery<TwilioAdminStatusResponse>({
    queryKey: ["/api/admin/twilio/status"],
    enabled: session.isAuthenticated && isAdmin,
    queryFn: async () => {
      return await apiRequest("/api/admin/twilio/status", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
  });

  const twilioWhatsAppConfigured =
    twilioStatus?.twilio?.accountSidPresent === true &&
    twilioStatus?.twilio?.authTokenPresent === true &&
    twilioStatus?.twilio?.whatsappFromPresent === true;

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const clientMessageId = createClientMessageId();
      const payload =
        testMode === "template"
          ? {
              to: testTo,
              templateName: testTemplateName,
              languageCode: testLanguageCode,
              dryRun: testDryRun,
              clientMessageId,
              agent: "ops",
            }
          : {
              to: testTo,
              message: testMessage,
              dryRun: testDryRun,
              clientMessageId,
              agent: "ops",
            };

      return await apiRequest("/api/whatsapp/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(payload),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/admin/conversations"] });
      if (activeConversationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/admin/conversations/messages", activeConversationId] });
      }
    },
  });

  if (!session.isAuthenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-400" />
              WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-white/70 text-sm">Sign in to access this page.</p>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Go to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-400" />
              WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-white/70 text-sm">Admin access required.</p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
              Back to map
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold">WhatsApp</h1>
          <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-400/30">Template-first</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-white/15 text-white/80 hover:bg-white/10"
            onClick={() => navigate("/admin/communications/whatsapp/logs")}
          >
            Logs
          </Button>
          <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10" onClick={() => navigate("/")}>
            Back
          </Button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-white/85">Provider note</div>
            <div className="mt-1">
              This page tests <span className="font-mono">Meta WhatsApp Cloud API</span> (provider{" "}
              <span className="font-mono">{waStatus?.status?.provider || "meta_cloud"}</span>).
              {" "}If you configured <span className="font-mono">Twilio</span>, use the Twilio Control Center instead.
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-white/15 text-white/80 hover:bg-white/10"
            onClick={() => navigate("/admin/settings/communications/twilio")}
          >
            Open Twilio Control Center
          </Button>
        </div>
      </div>

      {twilioWhatsAppConfigured && !waStatus?.status?.connected ? (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          Twilio WhatsApp is configured on this server, but this page sends through Meta Cloud API. Use{" "}
          <span className="font-semibold">Twilio Control Center</span> for live Twilio sends.
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">Connect status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-white/70">Provider</div>
              <Badge className="bg-white/10 border-white/15 text-white/70">{waStatus?.status?.provider || "meta_cloud"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-white/70">Connected</div>
              <Badge
                className={
                  waStatus?.status?.connected
                    ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-200"
                    : waStatus?.status?.dryRun
                      ? "bg-amber-500/15 border-amber-400/30 text-amber-200"
                      : "bg-rose-500/15 border-rose-400/30 text-rose-200"
                }
              >
                {waStatus?.status?.connected ? "Yes" : waStatus?.status?.dryRun ? "Dry-run" : "Missing config"}
              </Badge>
            </div>
            <div className="text-[11px] text-white/50 break-words">Graph base: {waStatus?.status?.graphBaseUrl || "—"}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">Test send</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {testDryRun ? (
              <div className="text-xs text-amber-100 bg-amber-500/10 border border-amber-400/20 rounded-lg p-3">
                Dry run is <span className="font-semibold">ON</span>. Messages will not be sent to the WhatsApp provider. Turn it off to send real messages.
              </div>
            ) : null}
            {!waStatus?.status?.connected && !testDryRun ? (
              <div className="text-xs text-rose-100 bg-rose-500/10 border border-rose-400/20 rounded-lg p-3">
                WhatsApp is <span className="font-semibold">not configured</span> on this server. Real sends will fail until env vars are set.
              </div>
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-white/70">To (E.164)</Label>
                <Input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="+225..."
                  className="bg-black/30 border-white/10 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-white/70">Mode</Label>
                <Select value={testMode} onValueChange={(v) => setTestMode(v as any)}>
                  <SelectTrigger className="bg-black/30 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="template">Template (first contact)</SelectItem>
                    <SelectItem value="text">Text (24h window)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {testMode === "template" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-white/70">Template name</Label>
                  <Input
                    value={testTemplateName}
                    onChange={(e) => setTestTemplateName(e.target.value)}
                    className="bg-black/30 border-white/10 text-white"
                  />
                  <div className="text-[11px] text-white/50">
                    Known: {(waTemplates?.templates || []).slice(0, 6).map((t) => t.name).join(", ") || "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-white/70">Language code</Label>
                  <Input
                    value={testLanguageCode}
                    onChange={(e) => setTestLanguageCode(e.target.value)}
                    className="bg-black/30 border-white/10 text-white"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs text-white/70">Message</Label>
                <Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} className="bg-black/30 border-white/10 text-white" />
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  checked={testDryRun}
                  onCheckedChange={(checked) => {
                    if (waStatus?.status?.dryRunAllowed === false) return;
                    setTestDryRun(checked);
                  }}
                  disabled={waStatus?.status?.dryRunAllowed === false}
                />
                <div className="text-xs text-white/70">
                  Dry run (no provider send){waStatus?.status?.dryRunAllowed === false ? " — disabled" : ""}
                </div>
              </div>
              <Button
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => sendTestMutation.mutate()}
                disabled={sendTestMutation.isPending || !testTo.trim() || (testMode === "text" && !testMessage.trim())}
              >
                <Send className="h-4 w-4 mr-2" />
                {sendTestMutation.isPending ? "Sending..." : testDryRun ? "Send (dry-run)" : "Send"}
              </Button>
            </div>

            {sendTestMutation.isError ? (
              <div className="text-sm text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                {(sendTestMutation.error as any)?.message || "Send failed"}
              </div>
            ) : null}
            {sendTestMutation.data ? (
              <div className="text-[11px] text-white/60 bg-white/5 border border-white/10 rounded-lg p-3 break-words">
                {JSON.stringify(sendTestMutation.data)}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">Inbox</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search phone"
                className="pl-9 bg-black/30 border-white/10 text-white placeholder:text-white/40"
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[70vh]">
              <div className="space-y-2 pr-3">
                {isLoading ? (
                  <div className="text-white/60 text-sm py-8">Loading...</div>
                ) : filtered.length ? (
                  filtered.map((c) => (
                    <button
                      key={c.conversationId}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        (activeConversationId || "") === c.conversationId ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                      onClick={() => setSelectedConversationId(c.conversationId)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{c.phone}</div>
                          <div className="text-[11px] text-white/55 truncate">{c.lastMessage?.textBody || c.lastMessage?.messageType || "—"}</div>
                        </div>
                        <Badge className="text-[10px] bg-white/10 border-white/15 text-white/70">
                          {c.lastMessage?.direction?.toUpperCase?.() || "—"}
                        </Badge>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-white/60 text-sm py-8">No conversations found.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">Messages</CardTitle>
            <div className="text-[11px] text-white/60">{activeConversationId || "—"}</div>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[70vh]">
              <div className="space-y-2 pr-3">
                {messagesLoading ? (
                  <div className="text-white/60 text-sm py-8">Loading...</div>
                ) : messages.length ? (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-xl border px-3 py-2 ${
                        m.direction === "out" ? "ml-auto bg-emerald-500/10 border-emerald-400/20" : "bg-white/5 border-white/10"
                      }`}
                    >
                      <div className="text-[11px] text-white/50 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span>{m.direction.toUpperCase()}</span>
                          {m.direction === "out" ? (
                            <Badge className="text-[10px] bg-white/10 border-white/15 text-white/70">{formatDeliveryStatus(m.deliveryStatus)}</Badge>
                          ) : null}
                        </span>
                        <span>{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="text-sm text-white whitespace-pre-wrap mt-1">{m.textBody || `[${m.messageType}]`}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-white/60 text-sm py-8">No messages.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
