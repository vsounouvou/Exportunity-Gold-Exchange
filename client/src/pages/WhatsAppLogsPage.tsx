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
import { useSession } from "@/lib/session";
import { MessageSquare, Search } from "lucide-react";

type WaLogRow = {
  id: number;
  direction: "in" | "out";
  waMessageId: string;
  clientMessageId: string | null;
  waPhoneE164: string;
  messageType: string;
  textBody: string | null;
  deliveryStatus: string;
  errorCode: string | null;
  errorMessage: string | null;
  conversationId: string | null;
  payloadJson: any;
  createdAt: string;
};

type LogsResponse = {
  ok: boolean;
  items: WaLogRow[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

function formatDeliveryStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (s === "sent") return "SENT_TO_PROVIDER";
  if (s === "delivered") return "DELIVERED";
  if (s === "read") return "READ";
  if (s === "failed") return "FAILED";
  return status || "—";
}

export default function WhatsAppLogsPage() {
  const session = useSession();
  const [, navigate] = useLocation();
  const isAdmin = session.hasRole("admin");

  const [phone, setPhone] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [status, setStatus] = useState<"all" | "sent" | "delivered" | "read" | "failed">("all");
  const [errorCode, setErrorCode] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    setOffset(0);
  }, [phone, direction, status, errorCode]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (phone.trim()) params.set("phone", phone.trim());
    if (direction !== "all") params.set("direction", direction);
    if (status !== "all") params.set("status", status);
    if (errorCode.trim()) params.set("errorCode", errorCode.trim());
    return params.toString();
  }, [phone, direction, status, errorCode, offset]);

  const { data, isLoading, error } = useQuery<LogsResponse>({
    queryKey: ["/api/whatsapp/admin/logs", queryString],
    enabled: session.isAuthenticated && isAdmin,
    queryFn: async () => {
      return await apiRequest(`/api/whatsapp/admin/logs?${queryString}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
  });

  if (!session.isAuthenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-400" />
              WhatsApp Logs
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
              WhatsApp Logs
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

  const items = data?.items || [];

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold">WhatsApp Logs</h1>
        </div>
        <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10" onClick={() => navigate("/admin/communications/whatsapp")}>
          Back
        </Button>
      </div>

      <Card className="bg-gray-900 border-gray-800 mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-white/70">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+225..." className="bg-black/30 border-white/10 text-white" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-white/70">Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
              <SelectTrigger className="bg-black/30 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="in">Inbound</SelectItem>
                <SelectItem value="out">Outbound</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-white/70">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="bg-black/30 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-white/70">Error code</Label>
            <Input value={errorCode} onChange={(e) => setErrorCode(e.target.value)} placeholder="e.g. 131047" className="bg-black/30 border-white/10 text-white" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm">Events</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[70vh]">
            <div className="space-y-2 pr-3">
              {isLoading ? (
                <div className="text-white/60 text-sm py-8">Loading...</div>
              ) : error ? (
                <div className="text-sm text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                  {(error as any)?.message || "Failed to load logs"}
                </div>
              ) : items.length ? (
                items.map((row) => (
                  <details key={row.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{row.waPhoneE164}</div>
                          <div className="text-[11px] text-white/55 truncate">
                            {row.textBody || `[${row.messageType}]`} {row.errorMessage ? `— ${row.errorMessage}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className="text-[10px] bg-white/10 border-white/15 text-white/70">{row.direction.toUpperCase()}</Badge>
                          <Badge className="text-[10px] bg-white/10 border-white/15 text-white/70">{formatDeliveryStatus(row.deliveryStatus)}</Badge>
                        </div>
                      </div>
                      <div className="text-[11px] text-white/50 mt-1">{new Date(row.createdAt).toLocaleString()}</div>
                    </summary>
                    <div className="mt-3 space-y-2 text-[12px] text-white/75">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] text-white/50">wa_message_id</div>
                          <div className="break-words">{row.waMessageId}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-white/50">client_message_id</div>
                          <div className="break-words">{row.clientMessageId || "—"}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-white/50">error_code</div>
                          <div className="break-words">{row.errorCode || "—"}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-white/50">conversation_id</div>
                          <div className="break-words">{row.conversationId || "—"}</div>
                        </div>
                      </div>

                      <div className="text-[11px] text-white/50">payload / provider response</div>
                      <pre className="text-[11px] text-white/60 bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto">
                        {JSON.stringify(row.payloadJson, null, 2)}
                      </pre>
                    </div>
                  </details>
                ))
              ) : (
                <div className="text-white/60 text-sm py-8">No events found.</div>
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between gap-3 pt-4">
            <Button
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10"
              onClick={() => setOffset((v) => Math.max(0, v - limit))}
              disabled={offset === 0}
            >
              Prev
            </Button>
            <div className="text-xs text-white/60">
              Offset {offset} · Limit {limit}
            </div>
            <Button
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10"
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

