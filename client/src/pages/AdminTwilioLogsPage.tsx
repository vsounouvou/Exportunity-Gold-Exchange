import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { Search, MessageSquare } from "lucide-react";

type TwilioMessageRow = {
  id: number;
  tenantId: number;
  agentKey: string;
  threadId: number;
  direction: "inbound" | "outbound";
  status: string;
  provider: string;
  channel: "sms" | "whatsapp" | "voice";
  fromAddress: string;
  toAddress: string;
  body: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type LogsResponse = {
  ok: boolean;
  items: TwilioMessageRow[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

function statusLabel(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (!s) return "—";
  if (s === "queued") return "QUEUED";
  if (s === "sent") return "SENT";
  if (s === "delivered") return "DELIVERED";
  if (s === "read") return "READ";
  if (s === "failed") return "FAILED";
  if (s === "undelivered") return "UNDELIVERED";
  return s.toUpperCase();
}

export default function AdminTwilioLogsPage() {
  const { tenant } = useTenant();
  const [, navigate] = useLocation();

  const [to, setTo] = useState("");
  const [channel, setChannel] = useState<"all" | "whatsapp" | "sms" | "voice">("whatsapp");
  const [direction, setDirection] = useState<"all" | "outbound" | "inbound">("all");
  const [status, setStatus] = useState<"all" | "queued" | "sent" | "delivered" | "read" | "failed" | "undelivered">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    setOffset(0);
  }, [to, channel, direction, status, dateFrom, dateTo]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (to.trim()) params.set("to", to.trim());
    if (channel !== "all") params.set("channel", channel);
    if (direction !== "all") params.set("direction", direction);
    if (status !== "all") params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }, [to, channel, direction, status, dateFrom, dateTo, offset]);

  const { data, isLoading, error } = useQuery<LogsResponse>({
    queryKey: ["/api/admin/twilio/messages", queryString],
    queryFn: async () => {
      return await apiRequest(`/api/admin/twilio/messages?${queryString}`, { method: "GET" });
    },
  });

  const items = data?.items || [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Search className="h-5 w-5 text-amber-400" />
            Twilio Logs
          </h1>
          <p className="text-gray-400 text-sm">Tenant: {tenant?.name || "-"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate("/admin/communications/twilio")}>
            Inbox
          </Button>
          <Button onClick={() => navigate("/admin/settings/communications/twilio")}>Settings</Button>
        </div>
      </div>

      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Label className="text-gray-300">To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+225..." className="bg-gray-950 border-gray-800 text-white" />
          </div>

          <div>
            <Label className="text-gray-300">Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
              <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="voice">Voice</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-300">Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
              <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                <SelectItem value="outbound">Outbound</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-300">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="undelivered">Undelivered</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-300">Date from</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-gray-950 border-gray-800 text-white" />
          </div>

          <div>
            <Label className="text-gray-300">Date to</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-gray-950 border-gray-800 text-white" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Messages
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {error ? (
            <div className="text-sm text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
              {(error as any)?.message || "Failed to load logs"}
            </div>
          ) : null}

          <ScrollArea className="h-[66vh] pr-3 rounded-lg border border-gray-800 bg-gray-950/20">
            <div className="p-3 space-y-2">
              {isLoading ? (
                <div className="text-sm text-gray-400 py-8">Loading…</div>
              ) : items.length ? (
                items.map((m) => (
                  <details key={m.id} className="rounded-lg border border-gray-800 bg-gray-950/30 px-3 py-2">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-white font-semibold truncate">{m.toAddress}</div>
                          <div className="text-xs text-gray-400 truncate">{m.body || `[${m.channel}]`}</div>
                          {m.errorMessage ? <div className="text-xs text-rose-200 truncate">{m.errorMessage}</div> : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary">{m.channel.toUpperCase()}</Badge>
                          <Badge variant={m.direction === "outbound" ? "default" : "secondary"}>{m.direction.toUpperCase()}</Badge>
                          <Badge variant={m.status === "failed" || m.status === "undelivered" ? "destructive" : "secondary"}>{statusLabel(m.status)}</Badge>
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">{new Date(m.createdAt).toLocaleString()}</div>
                    </summary>
                    <div className="mt-3 space-y-2 text-[12px] text-gray-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] text-gray-500">twilio_message_sid</div>
                          <div className="break-words">{m.providerMessageId || "—"}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-gray-500">agent</div>
                          <div className="break-words">{m.agentKey}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-gray-500">from</div>
                          <div className="break-words">{m.fromAddress}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-gray-500">error_code</div>
                          <div className="break-words">{m.errorCode || "—"}</div>
                        </div>
                      </div>

                      <div className="text-[11px] text-gray-500">metadata</div>
                      <pre className="text-[11px] text-gray-300 bg-black/40 border border-gray-800 rounded-lg p-3 overflow-auto">
                        {JSON.stringify(m.metadata, null, 2)}
                      </pre>
                    </div>
                  </details>
                ))
              ) : (
                <div className="text-sm text-gray-400 py-8">No messages.</div>
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setOffset((v) => Math.max(0, v - limit))}
              disabled={offset === 0}
            >
              Prev
            </Button>
            <div className="text-xs text-gray-500">
              Offset {offset} · Limit {limit}
            </div>
            <Button
              variant="secondary"
              onClick={() => setOffset((v) => v + limit)}
              disabled={!data?.hasMore}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
