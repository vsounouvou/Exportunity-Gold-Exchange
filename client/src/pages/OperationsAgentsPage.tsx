import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type AgentListItem = {
  id: number;
  name: string;
  role: string;
  domain: "INTERNAL" | "MARKETPLACE";
  department_key: string | null;
  statusV2: "ACTIVE" | "PAUSED" | "ARCHIVED";
  open_tasks_count?: number;
  last_action_at?: string | null;
  last_workstation_started_at?: string | null;
};

type AgentListResponse = {
  ok: boolean;
  items: AgentListItem[];
};

export default function OperationsAgentsPage() {
  const { toast } = useToast();
  const [departmentKey, setDepartmentKey] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Operations Agent");
  const [newDepartment, setNewDepartment] = useState("operations");
  const [newModel, setNewModel] = useState("");

  const query = useQuery<AgentListResponse>({
    queryKey: ["/api/v2/agents", "INTERNAL", departmentKey, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("domain", "INTERNAL");
      if (departmentKey !== "all") params.set("departmentKey", departmentKey);
      if (status !== "all") params.set("status", status);
      return apiRequest(`/api/v2/agents?${params.toString()}`, "GET");
    },
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/v2/agents/internal/create", "POST", {
        name: newName,
        role: newRole,
        departmentKey: newDepartment,
        runtimeModel: newModel || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Agent created", description: "Internal agent record created successfully." });
      setCreateOpen(false);
      setNewName("");
      setNewRole("Operations Agent");
      setNewDepartment("operations");
      setNewModel("");
      queryClient.invalidateQueries({ queryKey: ["/api/v2/agents"] });
    },
    onError: (error: any) => {
      toast({ title: "Creation failed", description: error?.message || "Unable to create agent", variant: "destructive" });
    },
  });

  const items = query.data?.items || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.name, item.role, item.department_key || ""].join(" ").toLowerCase().includes(q),
    );
  }, [items, search]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.department_key) set.add(item.department_key);
    }
    return Array.from(set).sort();
  }, [items]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Internal Agents</h1>
          <p className="text-xs text-gray-400">Operations / HR ownership view (domain: INTERNAL)</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 text-black hover:bg-amber-400">
              <Plus className="h-4 w-4 mr-2" />
              Create Internal Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-gray-800 text-white">
            <DialogHeader>
              <DialogTitle>Create Internal Agent</DialogTitle>
              <DialogDescription className="text-gray-400">
                This inserts a real row in the agents table (not contacts).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-gray-800 border-gray-700" />
              </div>
              <div>
                <Label>Role</Label>
                <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} className="bg-gray-800 border-gray-700" />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} className="bg-gray-800 border-gray-700" />
              </div>
              <div>
                <Label>Runtime Model (optional)</Label>
                <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} className="bg-gray-800 border-gray-700" />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!newName.trim() || createMutation.isPending}
                className="bg-emerald-500 text-black hover:bg-emerald-400"
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input
              placeholder="Search by name/role/department"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-gray-800 border-gray-700"
            />
            <Select value={departmentKey} onValueChange={setDepartmentKey}>
              <SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                <SelectItem value="all">All departments</SelectItem>
                {departmentOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-gray-400 flex items-center">{filtered.length} agent(s)</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {query.isLoading ? (
          <Card className="bg-gray-900 border-gray-800"><CardContent className="pt-6 text-gray-400">Loading internal agents...</CardContent></Card>
        ) : null}
        {query.isError ? (
          <Card className="bg-gray-900 border-red-500/40">
            <CardContent className="pt-6 space-y-3">
              <div className="text-sm text-red-300">
                Failed to load internal agents: {(query.error as Error)?.message || "Unknown error"}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-red-400/50 text-red-200 hover:bg-red-500/10"
                onClick={() => query.refetch()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {!query.isLoading && !query.isError && filtered.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800"><CardContent className="pt-6 text-gray-400">No internal agents found.</CardContent></Card>
        ) : null}
        {filtered.map((item) => (
          <Link key={item.id} href={`/operations/agents/${item.id}`}>
            <a className="block">
              <Card className="bg-gray-900 border-gray-800 hover:border-amber-500/40 transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-white flex items-center justify-between gap-2">
                    <span className="truncate">{item.name}</span>
                    <Badge variant="outline" className="text-[10px]">{item.statusV2}</Badge>
                  </CardTitle>
                  <div className="text-xs text-gray-400">{item.role}</div>
                </CardHeader>
                <CardContent className="text-xs text-gray-300 space-y-1">
                  <div>Department: <span className="text-gray-100">{item.department_key || "-"}</span></div>
                  <div>Open tasks: <span className="text-gray-100">{Number(item.open_tasks_count || 0)}</span></div>
                  <div>Last action: <span className="text-gray-100">{item.last_action_at ? new Date(item.last_action_at).toLocaleString() : "n/a"}</span></div>
                  <div>Last workstation: <span className="text-gray-100">{item.last_workstation_started_at ? new Date(item.last_workstation_started_at).toLocaleString() : "n/a"}</span></div>
                </CardContent>
              </Card>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
