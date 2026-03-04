import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Globe2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AgentListItem = {
  id: number;
  name: string;
  role: string;
  domain: "INTERNAL" | "MARKETPLACE";
  department_key: string | null;
  statusV2: "ACTIVE" | "PAUSED" | "ARCHIVED";
  is_template?: boolean;
  parent_agent_id?: number | null;
  runtime_model?: string | null;
};

type AgentListResponse = {
  ok: boolean;
  items: AgentListItem[];
};

export default function MarketplaceAgentsPage() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const query = useQuery<AgentListResponse>({
    queryKey: ["/api/v2/agents", "MARKETPLACE", status],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("domain", "MARKETPLACE");
      if (status !== "all") params.set("status", status);
      return apiRequest(`/api/v2/agents?${params.toString()}`, "GET");
    },
    staleTime: 15_000,
  });

  const items = query.data?.items || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => [item.name, item.role, item.runtime_model || ""].join(" ").toLowerCase().includes(q));
  }, [items, search]);

  const templates = filtered.filter((item) => Boolean(item.is_template));
  const listed = filtered.filter((item) => !item.is_template);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">AI Marketplace Agents</h1>
        <p className="text-xs text-gray-400">Commercial catalog / templates (domain: MARKETPLACE)</p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              placeholder="Search templates/listings"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-gray-800 border-gray-700"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-gray-400 flex items-center">{filtered.length} marketplace agent(s)</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-sm text-white flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-amber-300" /> Templates
              <Badge variant="outline" className="ml-auto">{templates.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {query.isLoading ? <div className="text-xs text-gray-400">Loading templates...</div> : null}
            {!query.isLoading && templates.length === 0 ? <div className="text-xs text-gray-500">No templates.</div> : null}
            {templates.map((item) => (
              <Link key={item.id} href={`/commerce/ai-marketplace/agents/${item.id}`}>
                <a className="block rounded-lg border border-gray-800 hover:border-amber-500/40 p-3 transition-colors">
                  <div className="text-sm text-white font-medium truncate">{item.name}</div>
                  <div className="text-xs text-gray-400 truncate">{item.role}</div>
                  <div className="mt-1 text-[11px] text-gray-400">Model: {item.runtime_model || "default"}</div>
                </a>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-sm text-white flex items-center gap-2">
              Listed Agents
              <Badge variant="outline" className="ml-auto">{listed.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {query.isLoading ? <div className="text-xs text-gray-400">Loading listings...</div> : null}
            {!query.isLoading && listed.length === 0 ? <div className="text-xs text-gray-500">No listed marketplace agents.</div> : null}
            {listed.map((item) => (
              <Link key={item.id} href={`/commerce/ai-marketplace/agents/${item.id}`}>
                <a className="block rounded-lg border border-gray-800 hover:border-emerald-500/40 p-3 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-white font-medium truncate">{item.name}</div>
                    <Badge variant="outline" className="text-[10px]">{item.statusV2}</Badge>
                  </div>
                  <div className="text-xs text-gray-400 truncate">{item.role}</div>
                  <div className="mt-1 text-[11px] text-gray-400">Parent: {item.parent_agent_id || "-"}</div>
                </a>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
