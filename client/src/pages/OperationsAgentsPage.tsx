import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BrainCircuit, Eye, Pencil, Plus, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useTenant } from "@/lib/tenant";
import { getAgentAvatarUrl } from "@/lib/agentAvatar";
import { useLocale } from "@/contexts/LocaleContext";

type AgentListItem = {
  id: number;
  name: string;
  role: string;
  domain: "INTERNAL" | "MARKETPLACE";
  department_key: string | null;
  department_name?: string | null;
  statusV2: "ACTIVE" | "PAUSED" | "ARCHIVED";
  open_tasks_count?: number;
  last_action_at?: string | null;
  last_workstation_started_at?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
};

type AgentListResponse = {
  ok: boolean;
  items: AgentListItem[];
};

export default function OperationsAgentsPage() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const { language } = useLocale();
  const isFr = language !== "en";
  const tr = (fr: string, en: string) => (isFr ? fr : en);
  const [, navigate] = useLocation();
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
    onSuccess: (payload: any) => {
      const createdAgentId = Number(payload?.agent?.id || 0);
      toast({
        title: tr("Agent créé", "Agent created"),
        description: tr(
          "Complétez maintenant son identité, son visage, son rattachement et ses autorisations.",
          "Complete the identity, face, reporting line, and permissions now.",
        ),
      });
      setCreateOpen(false);
      setNewName("");
      setNewRole("Operations Agent");
      setNewDepartment("operations");
      setNewModel("");
      queryClient.invalidateQueries({ queryKey: ["/api/v2/agents"] });
      if (createdAgentId > 0) navigate(`/operations/agents/${createdAgentId}?edit=1`);
    },
    onError: (error: any) => {
      toast({
        title: tr("Échec de la création", "Creation failed"),
        description:
          error?.message || tr("Impossible de créer l'agent", "Unable to create agent"),
        variant: "destructive",
      });
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
    <div className={tenant.key === "exportunity" ? "exportunity-operations-light min-h-screen bg-[#f7f8fa] p-4 md:p-6 space-y-4" : "p-4 md:p-6 space-y-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">
            {tr("Équipe et agents", "Team & Agents")}
          </h1>
          <p className="text-xs text-gray-400">
            {tr(
              "Créez, modifiez, testez et affectez les agents opérationnels d'Exportunity.",
              "Create, edit, test, and assign Exportunity's working agents.",
            )}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 text-black hover:bg-amber-400">
              <Plus className="h-4 w-4 mr-2" />
              {tr("Créer un agent", "Create agent")}
            </Button>
          </DialogTrigger>
          <DialogContent
            className={
              tenant.key === "exportunity"
                ? "border-slate-200 bg-white text-slate-950"
                : "bg-gray-900 border-gray-800 text-white"
            }
          >
            <DialogHeader>
              <DialogTitle>{tr("Créer un agent opérationnel", "Create a working agent")}</DialogTitle>
              <DialogDescription className={tenant.key === "exportunity" ? "text-slate-600" : "text-gray-400"}>
                {tr(
                  "Après la création, l'éditeur d'identité et de visage s'ouvre automatiquement.",
                  "After creation, the identity and face editor opens automatically.",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{tr("Nom", "Name")}</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className={tenant.key === "exportunity" ? "border-slate-300 bg-white text-slate-950" : "bg-gray-800 border-gray-700"} />
              </div>
              <div>
                <Label>{tr("Fonction", "Role")}</Label>
                <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} className={tenant.key === "exportunity" ? "border-slate-300 bg-white text-slate-950" : "bg-gray-800 border-gray-700"} />
              </div>
              <div>
                <Label>{tr("Département", "Department")}</Label>
                <Input value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} className={tenant.key === "exportunity" ? "border-slate-300 bg-white text-slate-950" : "bg-gray-800 border-gray-700"} />
              </div>
              <div>
                <Label>{tr("Modèle d'exécution (facultatif)", "Runtime Model (optional)")}</Label>
                <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} className={tenant.key === "exportunity" ? "border-slate-300 bg-white text-slate-950" : "bg-gray-800 border-gray-700"} />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!newName.trim() || createMutation.isPending}
                className="bg-emerald-500 text-black hover:bg-emerald-400"
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                {tr("Créer et configurer", "Create and edit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input
              placeholder={tr(
                "Rechercher par nom, fonction ou département",
                "Search by name/role/department",
              )}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-gray-800 border-gray-700"
            />
            <Select value={departmentKey} onValueChange={setDepartmentKey}>
                <SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue placeholder={tr("Département", "Department")} /></SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                  <SelectItem value="all">{tr("Tous les départements", "All departments")}</SelectItem>
                {departmentOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue placeholder={tr("Statut", "Status")} /></SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                  <SelectItem value="all">{tr("Tous les statuts", "All statuses")}</SelectItem>
                  <SelectItem value="ACTIVE">{tr("Actif", "Active")}</SelectItem>
                  <SelectItem value="PAUSED">{tr("En pause", "Paused")}</SelectItem>
                  <SelectItem value="ARCHIVED">{tr("Archivé", "Archived")}</SelectItem>
              </SelectContent>
            </Select>
              <div className="text-xs text-gray-400 flex items-center">
                {filtered.length} {tr("agent(s) opérationnel(s)", "working agent(s)")}
              </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {query.isLoading ? (
          <Card className="bg-gray-900 border-gray-800"><CardContent className="pt-6 text-gray-400">{tr("Chargement des agents internes...", "Loading internal agents...")}</CardContent></Card>
        ) : null}
        {query.isError ? (
          <Card className="bg-gray-900 border-red-500/40">
            <CardContent className="pt-6 space-y-3">
              <div className="text-sm text-red-300">
                {tr("Impossible de charger les agents internes", "Failed to load internal agents")}: {(query.error as Error)?.message || tr("Erreur inconnue", "Unknown error")}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-red-400/50 text-red-200 hover:bg-red-500/10"
                onClick={() => query.refetch()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {tr("Réessayer", "Retry")}
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {!query.isLoading && !query.isError && filtered.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800"><CardContent className="pt-6 text-gray-400">{tr("Aucun agent interne trouvé.", "No internal agents found.")}</CardContent></Card>
        ) : null}
        {filtered.map((item) => (
          <Card key={item.id} className="bg-gray-900 border-gray-800 hover:border-amber-500/40 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 shrink-0 border border-amber-500/30 bg-slate-950">
                  <AvatarImage
                    src={
                      String(item.avatar_url || item.avatar || "") ||
                      getAgentAvatarUrl({ id: item.id, name: item.name, label: item.name, size: 96 })
                    }
                    alt={item.name}
                    className="object-cover"
                  />
                  <AvatarFallback>{item.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm text-white flex items-center justify-between gap-2">
                    <span className="truncate">{item.name}</span>
                    <Badge variant="outline" className="text-[10px]">{item.statusV2}</Badge>
                  </CardTitle>
                  <div className="mt-1 text-xs text-gray-400">{item.role}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-gray-300 space-y-3">
              <div className="space-y-1">
                <div>{tr("Département", "Department")}: <span className="text-gray-100">{item.department_name || item.department_key || tr("Non affecté", "Unassigned")}</span></div>
                <div>{tr("Tâches ouvertes", "Open tasks")}: <span className="text-gray-100">{Number(item.open_tasks_count || 0)}</span></div>
                <div>{tr("Dernière action", "Last action")}: <span className="text-gray-100">{item.last_action_at ? new Date(item.last_action_at).toLocaleString(isFr ? "fr-FR" : "en-GB") : tr("aucune", "n/a")}</span></div>
                <div>{tr("Dernier poste de travail", "Last workstation")}: <span className="text-gray-100">{item.last_workstation_started_at ? new Date(item.last_workstation_started_at).toLocaleString(isFr ? "fr-FR" : "en-GB") : tr("aucun", "n/a")}</span></div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-gray-800 pt-3">
                <Link href={`/operations/agents/${item.id}`}>
                  <Button type="button" size="sm" variant="outline" className="h-8">
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    {tr("Profil complet", "Full profile")}
                  </Button>
                </Link>
                <Link href={`/operations/agents/${item.id}?edit=1`}>
                  <Button type="button" size="sm" className="h-8 bg-amber-500 text-slate-950 hover:bg-amber-400">
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    {tr("Modifier l'identité et le visage", "Edit identity & face")}
                  </Button>
                </Link>
                <Link href={`/operations/agents/${item.id}?tab=memory`}>
                  <Button type="button" size="sm" variant="outline" className="h-8">
                    <BrainCircuit className="mr-2 h-3.5 w-3.5" />
                    {tr("Mémoire et contexte", "Memory & context")}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
