import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant";
import { useLocale } from "@/contexts/LocaleContext";
import type { Agent, Department } from "@db/schema";
import { AgentPhotoEditorCard } from "@/components/AgentPhotoEditorCard";
import {
  User,
  Briefcase,
  Brain,
  Target,
  Lock,
  Settings,
  Calendar,
  Save,
  X,
} from "lucide-react";

type AiConsentPlan = {
  what: string;
  why: string;
  forHowLong: string;
  resources: string[];
  howToAuthorize: string[];
  howToStop?: string[];
  visibility?: string;
};

type AgentSuggestionResponse = {
  generatedAt: string;
  mode: "offline" | "ai";
  text: {
    cv: string[];
    lifeStory: string[];
    personalGoals: string[];
    mission: string[];
  };
  tags: {
    skills: string[];
    industryFocus: string[];
    responsibilities: string[];
    languages: string[];
  };
};

interface AgentProfileDialogProps {
  agent: Agent | null;
  runtimeAgentId?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentProfileDialog({ agent, runtimeAgentId, open, onOpenChange }: AgentProfileDialogProps) {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const { language } = useLocale();
  const isFr = language !== "en";
  const tr = (fr: string, en: string) => (isFr ? fr : en);
  const queryClient = useQueryClient();
  const [newSkill, setNewSkill] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newLanguage, setNewLanguage] = useState("");
  const [newResponsibility, setNewResponsibility] = useState("");
  const [suggestions, setSuggestions] = useState<AgentSuggestionResponse | null>(null);
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const [aiConsentPlan, setAiConsentPlan] = useState<AiConsentPlan | null>(null);
  const [aiConsentOpen, setAiConsentOpen] = useState(false);
  const [sectionGenerating, setSectionGenerating] = useState<string | null>(null);

  const effectiveAgentId = useMemo(() => {
    const candidateIds = [Number(runtimeAgentId || 0), Number((agent as any)?.runtimeAgentId || 0), Number(agent?.id || 0)];
    return candidateIds.find((value) => Number.isInteger(value) && value > 0) || 0;
  }, [agent, runtimeAgentId]);
  const hasResolvableAgentId = Number.isInteger(effectiveAgentId) && effectiveAgentId > 0;
  const isGovernedRoleSeat = Number((agent?.metadata as any)?.roleSeatTemplateId || 0) > 0;

  const form = useForm({
    defaultValues: {
      name: "",
      role: "",
      departmentId: "",
      managerId: "",
      isDepartmentHead: false,
      status: "active",
      country: "",
      timezone: "UTC",
      birthday: "",
      hiredDate: "",
      promotedDate: "",
      cv: "",
      lifeStory: "",
      personalGoals: "",
      mission: "",
      skills: [] as string[],
      industryFocus: [] as string[],
      languages: [] as string[],
      responsibilities: [] as string[],
      personalityTone: "neutral",
      personalityRisk: "moderate",
      personalitySpeed: "moderate",
      personalityDetail: "moderate",
      autonomyLevel: "partial",
      permissionsEmail: false,
      permissionsCalendar: false,
      permissionsCrm: false,
      permissionsKnowledge: false,
      permissionsPayments: false,
      permissionsWebResearch: false,
    },
  });

  useEffect(() => {
    if (agent) {
      const persona = (agent.metadata as any)?.persona || {};
      form.reset({
        name: agent.name || "",
        role: agent.role || "",
        departmentId: agent.departmentId ? String(agent.departmentId) : "",
        managerId: agent.managerId ? String(agent.managerId) : "",
        isDepartmentHead: !!agent.isDepartmentHead,
        status: agent.status || "active",
        country: agent.country || "",
        timezone: agent.timezone || "UTC",
        birthday: agent.birthday ? new Date(agent.birthday).toISOString().split('T')[0] : "",
        hiredDate: agent.hiredDate ? new Date(agent.hiredDate).toISOString().split('T')[0] : "",
        promotedDate: agent.promotedDate ? new Date(agent.promotedDate).toISOString().split('T')[0] : "",
        cv: agent.cv || "",
        lifeStory: persona.lifeStory || "",
        personalGoals: persona.personalGoals || "",
        mission: agent.mission || "",
        skills: (agent.skills as string[]) || [],
        industryFocus: (agent.industryFocus as string[]) || [],
        languages: (agent.languages as string[]) || [],
        responsibilities: (agent.responsibilities as string[]) || [],
        personalityTone: (agent.personality as any)?.tone || "neutral",
        personalityRisk: (agent.personality as any)?.riskTolerance || "moderate",
        personalitySpeed: (agent.personality as any)?.speed || "moderate",
        personalityDetail: (agent.personality as any)?.detailLevel || "moderate",
        autonomyLevel: agent.autonomyLevel || "partial",
        permissionsEmail: (agent.permissions as any)?.email || false,
        permissionsCalendar: (agent.permissions as any)?.calendar || false,
        permissionsCrm: (agent.permissions as any)?.crm || false,
        permissionsKnowledge: (agent.permissions as any)?.knowledge || false,
        permissionsPayments: (agent.permissions as any)?.payments || false,
        permissionsWebResearch: (agent.permissions as any)?.webResearch || false,
      });
    }
  }, [agent, form]);

  useEffect(() => {
    if (!open) return;
    setSuggestions(null);
    setAiConfirmOpen(false);
    setAiConsentOpen(false);
    setAiConsentPlan(null);
  }, [open, agent?.id]);

  const { data: companyDepartments = [] } = useQuery<Department[]>({
    queryKey: agent?.companyId ? [`/api/companies/${agent.companyId}/departments`] : ["__no_company_departments__"],
    enabled: open && !!agent?.companyId,
  });

  const { data: companyAgents = [] } = useQuery<Agent[]>({
    queryKey: agent?.companyId ? [`/api/companies/${agent.companyId}/agents`] : ["__no_company_agents__"],
    enabled: open && !!agent?.companyId,
  });

  const updateAgentMutation = useMutation({
    mutationFn: async ({ agentId, companyId, updateData }: { agentId: number, companyId: number | null, updateData: any }) => {
      const response = await fetch(resolveApiUrl(`/api/agents/${agentId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      return { data: await response.json(), companyId };
    },
    onSuccess: ({ companyId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      if (companyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/agents`] });
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/departments`] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({
        title: tr("Profil enregistré", "Profile saved"),
        description: tr("Le profil de l'agent a été mis à jour.", "Agent profile updated successfully"),
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: tr("Erreur", "Error"),
        description: error instanceof Error ? error.message : tr("Échec de la mise à jour du profil", "Failed to update agent profile"),
        variant: "destructive",
      });
    },
  });

  const suggestionsMutation = useMutation({
    mutationFn: async (mode: "offline" | "ai") => {
      if (!agent || !effectiveAgentId) throw new Error("No agent selected");

      const response = await fetch(resolveApiUrl(`/api/agents/${effectiveAgentId}/suggestions`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });

      if (response.status === 428) {
        let payload: any = null;
        try {
          payload = await response.json();
        } catch {
          // ignore
        }
        const err: any = new Error(payload?.message || "AI consent required");
        err.requiresConsent = true;
        err.plan = payload?.plan;
        throw err;
      }

      if (!response.ok) throw new Error(await response.text());
      return (await response.json()) as AgentSuggestionResponse;
    },
    onSuccess: (data) => {
      setSuggestions(data);
      toast({
        title: tr("Suggestions prêtes", "Suggestions ready"),
        description: data.mode === "ai" ? tr("Suggestions IA chargées", "AI suggestions loaded") : tr("Options chargées", "Options loaded"),
      });
    },
    onError: (error: any) => {
      if (error?.requiresConsent && error?.plan) {
        setAiConsentPlan(error.plan as AiConsentPlan);
        setAiConsentOpen(true);
        return;
      }
      toast({
        title: tr("Échec des suggestions", "Suggestions failed"),
        description: error instanceof Error ? error.message : tr("Impossible de charger les suggestions", "Failed to load suggestions"),
        variant: "destructive",
      });
    },
  });

  const queueProfileActionMutation = useMutation({
    mutationFn: async (input: { section: string; scope: "targeted" | "bulk" }) => {
      if (!agent || !effectiveAgentId) throw new Error("No agent selected");
      const payload = {
        title:
          input.scope === "bulk"
            ? `HR bulk profile generation (${input.section})`
            : `HR targeted profile generation (${input.section})`,
        description: `Generate ${input.section} profile fields for ${agent.name}`,
        targetAgentId: effectiveAgentId,
        section: input.section,
        scope: input.scope,
      };
      const response = await fetch(resolveApiUrl("/api/actions/request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "CREATE_TASK",
          payload,
          requestedByAgentKey: "hr",
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: tr("Action RH ajoutée", "HR action queued"),
        description: tr("La demande est visible dans la file des actions.", "Action request created and visible in the action queue."),
      });
    },
    onError: (error) => {
      toast({
        title: tr("Échec de la mise en file", "Action queue failed"),
        description: error instanceof Error ? error.message : tr("Impossible d'ajouter l'action RH", "Failed to queue HR action"),
        variant: "destructive",
      });
    },
  });

  const mergeUnique = (current: string[], incoming: string[]) => {
    const merged = new Set<string>([...(current || []), ...(incoming || [])].map((value) => String(value || "").trim()).filter(Boolean));
    return Array.from(merged);
  };

  const applyGeneratedSection = (section: "background" | "personality" | "job" | "permissions" | "lifecycle", data: AgentSuggestionResponse) => {
    if (section === "background") {
      form.setValue("cv", data.text.cv[0] || form.getValues("cv") || "", { shouldDirty: true });
      form.setValue("lifeStory", data.text.lifeStory[0] || form.getValues("lifeStory") || "", { shouldDirty: true });
      form.setValue("personalGoals", data.text.personalGoals[0] || form.getValues("personalGoals") || "", { shouldDirty: true });
      form.setValue("skills", mergeUnique(form.getValues("skills") || [], data.tags.skills || []), { shouldDirty: true });
      form.setValue("industryFocus", mergeUnique(form.getValues("industryFocus") || [], data.tags.industryFocus || []), { shouldDirty: true });
      return;
    }

    if (section === "personality") {
      const role = String(form.getValues("role") || "").toLowerCase();
      const isCompliance = role.includes("compliance") || role.includes("legal") || role.includes("risk");
      const isTreasury = role.includes("treasury") || role.includes("finance") || role.includes("payment");
      form.setValue("personalityTone", isCompliance ? "formal" : "neutral", { shouldDirty: true });
      form.setValue("personalityRisk", isCompliance || isTreasury ? "conservative" : "moderate", { shouldDirty: true });
      form.setValue("personalitySpeed", isTreasury ? "fast" : "moderate", { shouldDirty: true });
      form.setValue("personalityDetail", isCompliance ? "very_detailed" : "moderate", { shouldDirty: true });
      return;
    }

    if (section === "job") {
      form.setValue("mission", data.text.mission[0] || form.getValues("mission") || "", { shouldDirty: true });
      form.setValue("responsibilities", mergeUnique(form.getValues("responsibilities") || [], data.tags.responsibilities || []), { shouldDirty: true });
      return;
    }

    if (section === "permissions") {
      const role = String(form.getValues("role") || "").toLowerCase();
      form.setValue("permissionsEmail", true, { shouldDirty: true });
      form.setValue("permissionsCalendar", true, { shouldDirty: true });
      form.setValue("permissionsCrm", true, { shouldDirty: true });
      form.setValue("permissionsKnowledge", true, { shouldDirty: true });
      form.setValue("permissionsPayments", role.includes("treasury") || role.includes("finance"), { shouldDirty: true });
      form.setValue("permissionsWebResearch", true, { shouldDirty: true });
      form.setValue("autonomyLevel", role.includes("chairman") || role.includes("chief") ? "full" : "partial", { shouldDirty: true });
      return;
    }

    if (section === "lifecycle") {
      form.setValue("status", form.getValues("status") || "active", { shouldDirty: true });
      if (!form.getValues("hiredDate")) {
        form.setValue("hiredDate", new Date().toISOString().slice(0, 10), { shouldDirty: true });
      }
    }
  };

  const runSectionGenerate = async (
    section: "background" | "personality" | "job" | "permissions" | "lifecycle",
    mode: "offline" | "ai" = "offline",
  ) => {
    try {
      setSectionGenerating(section);
      const data = await suggestionsMutation.mutateAsync(mode);
      setSuggestions(data);
      applyGeneratedSection(section, data);
      toast({
        title: tr("Section générée", "Section generated"),
        description: isFr
          ? "Les champs de la section ont été générés."
          : `${section[0].toUpperCase()}${section.slice(1)} fields were generated.`,
      });
    } catch (error: any) {
      if (error?.requiresConsent && error?.plan) {
        setAiConsentPlan(error.plan as AiConsentPlan);
        setAiConsentOpen(true);
        return;
      }
      toast({
        title: tr("Échec de la génération", "Generate failed"),
        description: error instanceof Error ? error.message : tr("Impossible de générer cette section", "Failed to generate section"),
        variant: "destructive",
      });
    } finally {
      setSectionGenerating(null);
    }
  };

  const applyTextSuggestion = (
    field: "cv" | "lifeStory" | "personalGoals" | "mission",
    text: string,
    mode: "replace" | "append" = "replace",
  ) => {
    const current = (form.getValues(field) as string) || "";
    const next = mode === "append" && current.trim() ? `${current.trim()}\n\n${text}` : text;
    form.setValue(field, next, { shouldDirty: true });
  };

  const onSubmit = (data: any) => {
    if (!agent || !effectiveAgentId) {
      toast({
        title: tr("Erreur", "Error"),
        description: tr("L'identifiant de l'agent est introuvable. Actualisez puis réessayez.", "Agent id could not be resolved. Refresh and try again."),
        variant: "destructive",
      });
      return;
    }
    
    const updateData = {
      name: data.name,
      role: data.role,
      departmentId: data.departmentId ? parseInt(data.departmentId, 10) : null,
      managerId: data.managerId ? parseInt(data.managerId, 10) : null,
      isDepartmentHead: !!data.isDepartmentHead,
      status: data.status,
      country: data.country,
      timezone: data.timezone,
      birthday: data.birthday ? new Date(data.birthday).toISOString() : null,
      hiredDate: data.hiredDate ? new Date(data.hiredDate).toISOString() : null,
      promotedDate: data.promotedDate ? new Date(data.promotedDate).toISOString() : null,
      cv: data.cv,
      metadata: {
        persona: {
          lifeStory: data.lifeStory || "",
          personalGoals: data.personalGoals || "",
        },
      },
      mission: data.mission,
      skills: data.skills,
      industryFocus: data.industryFocus,
      languages: data.languages,
      responsibilities: data.responsibilities,
      personality: {
        tone: data.personalityTone,
        riskTolerance: data.personalityRisk,
        speed: data.personalitySpeed,
        detailLevel: data.personalityDetail,
      },
      permissions: {
        email: data.permissionsEmail,
        calendar: data.permissionsCalendar,
        crm: data.permissionsCrm,
        knowledge: data.permissionsKnowledge,
        payments: data.permissionsPayments,
        webResearch: data.permissionsWebResearch,
      },
      autonomyLevel: data.autonomyLevel,
    };

    updateAgentMutation.mutate({
      agentId: effectiveAgentId,
      companyId: agent.companyId,
      updateData,
    });
  };

  const handleAddItem = (type: 'skill' | 'industry' | 'language' | 'responsibility', value: string) => {
    if (!value.trim()) return;
    
    const trimmedValue = value.trim();
    const formFieldMap = {
      skill: 'skills',
      industry: 'industryFocus',
      language: 'languages',
      responsibility: 'responsibilities',
    };
    
    const fieldName = formFieldMap[type] as 'skills' | 'industryFocus' | 'languages' | 'responsibilities';
    const currentValues = form.watch(fieldName) || [];
    
    if (!currentValues.includes(trimmedValue)) {
      form.setValue(fieldName, [...currentValues, trimmedValue]);
    }
  };

  const handleRemoveItem = (type: 'skill' | 'industry' | 'language' | 'responsibility', item: string) => {
    const formFieldMap = {
      skill: 'skills',
      industry: 'industryFocus',
      language: 'languages',
      responsibility: 'responsibilities',
    };
    
    const fieldName = formFieldMap[type] as 'skills' | 'industryFocus' | 'languages' | 'responsibilities';
    const currentValues = form.watch(fieldName) || [];
    form.setValue(fieldName, currentValues.filter((v: string) => v !== item));
  };

  const renderSectionActions = (
    section: "background" | "personality" | "job" | "permissions" | "lifecycle",
    label: string,
  ) => (
    <div className="rounded-lg border p-3 bg-secondary/10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">{tr(`Outils : ${label}`, `${label} tools`)}</div>
          <div className="text-xs text-muted-foreground">
            {tr("Générez, affinez ou placez une action RH dans la file d'exécution.", "Generate, refine, and queue HR execution actions.")}
          </div>
          {!hasResolvableAgentId ? (
            <div className="text-xs text-amber-500 mt-1">
              {tr("Enregistrez puis rechargez cet agent avant de lancer une action.", "Agent id not resolved yet. Save/reload this agent first.")}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasResolvableAgentId || sectionGenerating === section || suggestionsMutation.isPending}
            onClick={() => runSectionGenerate(section, "offline")}
          >
            {sectionGenerating === section ? tr("Génération...", "Generating...") : tr("Générer", "Generate")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!hasResolvableAgentId || sectionGenerating === section || suggestionsMutation.isPending}
            onClick={() => runSectionGenerate(section, "ai")}
          >
            {tr("Générer avec l'IA", "AI generate")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasResolvableAgentId || queueProfileActionMutation.isPending}
            onClick={() => queueProfileActionMutation.mutate({ section, scope: "targeted" })}
          >
            {tr("Créer une action ciblée", "Queue targeted action")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasResolvableAgentId || queueProfileActionMutation.isPending}
            onClick={() => queueProfileActionMutation.mutate({ section, scope: "bulk" })}
          >
            {tr("Créer une action groupée", "Queue bulk action")}
          </Button>
        </div>
      </div>
    </div>
  );

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${tenant.key === "exportunity" ? "exportunity-operations-light bg-white text-slate-900 border-slate-200" : ""} w-[calc(100vw-2rem)] max-w-5xl max-h-[92vh] overflow-y-auto`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {tr("Profil de l'agent", "Agent Profile")}: {agent.name}
          </DialogTitle>
          <DialogDescription>
            {tr("Modifiez l'identité, le rattachement, les autorisations et le cycle de vie de cet agent.", "View and edit comprehensive HR-style profile information")}
          </DialogDescription>
        </DialogHeader>

        <AlertDialog open={aiConfirmOpen} onOpenChange={setAiConfirmOpen}>
          <AlertDialogContent className={tenant.key === "exportunity" ? "exportunity-operations-light bg-white text-slate-900 border-slate-200" : ""}>
            <AlertDialogHeader>
              <AlertDialogTitle>{tr("Utiliser l'IA pour générer des suggestions ?", "Use AI to generate suggestions?")}</AlertDialogTitle>
              <AlertDialogDescription>
                {tr(
                  "Cette action appelle un fournisseur de modèle externe et peut entraîner un coût. Les suggestions locales restent disponibles sans appel externe.",
                  "This will call an external LLM provider (may cost money). Offline suggestions are always available without API calls.",
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tr("Annuler", "Cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setAiConfirmOpen(false);
                  suggestionsMutation.mutate("ai");
                }}
              >
                {tr("Continuer", "Continue")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={aiConsentOpen} onOpenChange={setAiConsentOpen}>
          <AlertDialogContent className={`${tenant.key === "exportunity" ? "exportunity-operations-light bg-white text-slate-900 border-slate-200" : ""} max-w-2xl`}>
            <AlertDialogHeader>
              <AlertDialogTitle>{tr("Autorisation IA requise", "AI consent required")}</AlertDialogTitle>
              <AlertDialogDescription>
                {tr("L'IA est désactivée sur le serveur. Activez-la explicitement, puis relancez la suggestion.", "AI is currently disabled on the server. Enable it explicitly, then retry AI suggestions.")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {aiConsentPlan && (
              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <div className="font-medium">{aiConsentPlan.what}</div>
                  <div className="text-muted-foreground">{aiConsentPlan.why}</div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium text-muted-foreground">{tr("Durée", "For how long")}</div>
                    <div>{aiConsentPlan.forHowLong}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium text-muted-foreground">{tr("Ressources", "Resources")}</div>
                    <ul className="list-disc pl-4">
                      {aiConsentPlan.resources?.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs font-medium text-muted-foreground">{tr("Comment autoriser", "How to authorize")}</div>
                  <ul className="list-disc pl-4">
                    {aiConsentPlan.howToAuthorize?.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
                {aiConsentPlan.howToStop?.length ? (
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium text-muted-foreground">{tr("Comment arrêter", "How to stop")}</div>
                    <ul className="list-disc pl-4">
                      {aiConsentPlan.howToStop.map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  </div>
                ) : null}
                {aiConsentPlan.visibility ? (
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium text-muted-foreground">{tr("Visibilité", "Visibility")}</div>
                    <div>{aiConsentPlan.visibility}</div>
                  </div>
                ) : null}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>{tr("Fermer", "Close")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!aiConsentPlan) return;
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(aiConsentPlan, null, 2));
                    toast({ title: tr("Copié", "Copied"), description: tr("Le plan d'autorisation a été copié.", "Consent plan copied to clipboard") });
                  } catch {
                    toast({ title: tr("Échec de la copie", "Copy failed"), description: tr("Impossible de copier le plan", "Could not copy plan"), variant: "destructive" });
                  }
                }}
              >
                {tr("Copier le plan", "Copy plan")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="identity" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-6">
                <TabsTrigger value="identity">
                  <User className="h-4 w-4 mr-1" /> {tr("Identité", "Identity")}
                </TabsTrigger>
                <TabsTrigger value="background">
                  <Briefcase className="h-4 w-4 mr-1" /> {tr("Parcours", "Background")}
                </TabsTrigger>
                <TabsTrigger value="personality">
                  <Brain className="h-4 w-4 mr-1" /> {tr("Personnalité", "Personality")}
                </TabsTrigger>
                <TabsTrigger value="job">
                  <Target className="h-4 w-4 mr-1" /> {tr("Mission", "Job")}
                </TabsTrigger>
                <TabsTrigger value="permissions">
                  <Lock className="h-4 w-4 mr-1" /> {tr("Accès", "Access")}
                </TabsTrigger>
                <TabsTrigger value="lifecycle">
                  <Calendar className="h-4 w-4 mr-1" /> {tr("Cycle de vie", "Lifecycle")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="identity" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    {effectiveAgentId ? (
                      <AgentPhotoEditorCard agentId={effectiveAgentId} />
                    ) : (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                        {tr("Enregistrez puis rechargez cet agent avant de générer sa photo.", "Agent id is not resolved yet. Save/reload this agent before generating a photo.")}
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tr("Nom", "Name")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={tr("Nom de l'agent", "Agent Name")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Fonction", "Role")}</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={tr("ex. Responsable commercial", "e.g., Sales Agent")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="departmentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Département", "Department")}</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(v === "__unassigned__" ? "" : v)}
                          value={field.value || "__unassigned__"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={tr("Non affecté", "Unassigned")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__unassigned__">{tr("Non affecté", "Unassigned")}</SelectItem>
                            {companyDepartments.map((d) => (
                              <SelectItem key={d.id} value={String(d.id)}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="managerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Responsable hiérarchique", "Manager")}</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(v === "__no_manager__" ? "" : v)}
                          value={field.value || "__no_manager__"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={tr("Aucun responsable (niveau supérieur)", "No manager (top-level)")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__no_manager__">{tr("Aucun responsable (niveau supérieur)", "No manager (top-level)")}</SelectItem>
                            {companyAgents
                              .filter((a) => a.id !== agent.id)
                              .map((a) => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                  {a.name} - {a.role}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isDepartmentHead"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{tr("Responsable de département", "Department Head")}</FormLabel>
                          <FormDescription>
                            {tr("Désigne cet agent comme responsable du département.", "Marks this agent as the department leader")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Pays d'origine", "Country of Origin")}</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={tr("ex. Côte d'Ivoire", "e.g., Ghana")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Fuseau horaire", "Timezone")}</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., Africa/Accra" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="birthday"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Date de naissance", "Birthday")}</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div>
                  <FormLabel>{tr("Langues", "Languages")}</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newLanguage}
                      onChange={(e) => setNewLanguage(e.target.value)}
                      placeholder={tr("Ajouter une langue", "Add a language")}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddItem('language', newLanguage);
                          setNewLanguage("");
                        }
                      }}
                    />
                    <Button type="button" onClick={() => {
                      handleAddItem('language', newLanguage);
                      setNewLanguage("");
                    }}>{tr("Ajouter", "Add")}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(form.watch('languages') || []).map((lang: string) => (
                      <Badge key={lang} variant="secondary">
                        {lang}
                        <X
                          className="h-3 w-3 ml-1 cursor-pointer"
                          onClick={() => handleRemoveItem('language', lang)}
                        />
                      </Badge>
                    ))}
                  </div>
                  {suggestions?.tags?.languages?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.tags.languages.slice(0, 10).map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => handleAddItem("language", s)}
                        >
                          + {s}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="background" className="space-y-4">
                {renderSectionActions("background", tr("Parcours", "Background"))}
                <div className="rounded-lg border p-3 bg-secondary/10">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium">{tr("Suggestions", "Suggestions")}</div>
                      <div className="text-xs text-muted-foreground">
                        {tr("Les suggestions locales sont gratuites. Chaque appel IA exige une autorisation explicite.", "Offline suggestions are free. AI suggestions require explicit consent per request.")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={suggestionsMutation.isPending}
                        onClick={() => suggestionsMutation.mutate("offline")}
                      >
                        {tr("Proposer des options", "Suggest options")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={suggestionsMutation.isPending}
                        onClick={() => setAiConfirmOpen(true)}
                      >
                        {tr("Suggestion IA", "AI suggest")}
                      </Button>
                    </div>
                  </div>
                  {suggestions ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {tr("Suggestions chargées", "Loaded suggestions")} ({suggestions.mode}) - {new Date(suggestions.generatedAt).toLocaleString(isFr ? "fr-FR" : "en-GB")}
                    </div>
                  ) : null}
                </div>

                <FormField
                  control={form.control}
                  name="cv"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tr("CV / parcours", "CV / Background")}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={tr("ex. Dix ans d'expérience en vente B2B en Afrique de l'Ouest...", "e.g., Has 10 years of experience in B2B sales across West Africa...")}
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>{tr("Résumé de l'expérience professionnelle", "Brief professional background and experience")}</FormDescription>
                      {suggestions?.text?.cv?.length ? (
                        <div className="mt-2 space-y-2">
                          {suggestions.text.cv.map((option) => (
                            <div key={option} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-sm">{option}</div>
                              <div className="flex gap-2 sm:flex-col">
                                <Button type="button" size="sm" onClick={() => applyTextSuggestion("cv", option, "replace")}>
                                  {tr("Utiliser", "Use")}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => applyTextSuggestion("cv", option, "append")}>
                                  {tr("Ajouter à la suite", "Append")}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lifeStory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tr("Histoire personnelle", "Life Story")}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={tr("Parcours, moments décisifs et faits marquants de sa carrière...", "A short human-like background: upbringing, turning points, career highlights...")}
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>{tr("Conservé dans la fiche de personnalité", "Stored in metadata (persona)")}</FormDescription>
                      {suggestions?.text?.lifeStory?.length ? (
                        <div className="mt-2 space-y-2">
                          {suggestions.text.lifeStory.map((option) => (
                            <div key={option} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-sm">{option}</div>
                              <div className="flex gap-2 sm:flex-col">
                                <Button type="button" size="sm" onClick={() => applyTextSuggestion("lifeStory", option, "replace")}>
                                  {tr("Utiliser", "Use")}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => applyTextSuggestion("lifeStory", option, "append")}>
                                  {tr("Ajouter à la suite", "Append")}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="personalGoals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tr("Objectifs personnels", "Personal Goals")}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={tr("Quels résultats cet agent poursuit-il au quotidien ?", "What does this agent strive for? What motivates them day-to-day?")}
                          rows={3}
                        />
                      </FormControl>
                      <FormDescription>{tr("Conservé dans la fiche de personnalité", "Stored in metadata (persona)")}</FormDescription>
                      {suggestions?.text?.personalGoals?.length ? (
                        <div className="mt-2 space-y-2">
                          {suggestions.text.personalGoals.map((option) => (
                            <div key={option} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-sm">{option}</div>
                              <div className="flex gap-2 sm:flex-col">
                                <Button type="button" size="sm" onClick={() => applyTextSuggestion("personalGoals", option, "replace")}>
                                  {tr("Utiliser", "Use")}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => applyTextSuggestion("personalGoals", option, "append")}>
                                  {tr("Ajouter à la suite", "Append")}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel>{tr("Compétences", "Skills")}</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      placeholder={tr("Ajouter une compétence", "Add a skill")}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddItem('skill', newSkill);
                          setNewSkill("");
                        }
                      }}
                    />
                    <Button type="button" onClick={() => {
                      handleAddItem('skill', newSkill);
                      setNewSkill("");
                    }}>{tr("Ajouter", "Add")}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(form.watch('skills') || []).map((skill: string) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                        <X
                          className="h-3 w-3 ml-1 cursor-pointer"
                          onClick={() => handleRemoveItem('skill', skill)}
                        />
                      </Badge>
                    ))}
                  </div>
                  {suggestions?.tags?.skills?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.tags.skills.slice(0, 12).map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => handleAddItem("skill", s)}
                        >
                          + {s}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
                  <FormLabel>{tr("Secteurs d'intervention", "Industry Focus")}</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newIndustry}
                      onChange={(e) => setNewIndustry(e.target.value)}
                      placeholder={tr("Ajouter un secteur", "Add an industry")}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddItem('industry', newIndustry);
                          setNewIndustry("");
                        }
                      }}
                    />
                    <Button type="button" onClick={() => {
                      handleAddItem('industry', newIndustry);
                      setNewIndustry("");
                    }}>{tr("Ajouter", "Add")}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(form.watch('industryFocus') || []).map((industry: string) => (
                      <Badge key={industry} variant="secondary">
                        {industry}
                        <X
                          className="h-3 w-3 ml-1 cursor-pointer"
                          onClick={() => handleRemoveItem('industry', industry)}
                        />
                      </Badge>
                    ))}
                  </div>
                  {suggestions?.tags?.industryFocus?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.tags.industryFocus.slice(0, 12).map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => handleAddItem("industry", s)}
                        >
                          + {s}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="personality" className="space-y-4">
                {renderSectionActions("personality", tr("Personnalité", "Personality"))}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="personalityTone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Ton", "Tone")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="formal">{tr("Formel", "Formal")}</SelectItem>
                            <SelectItem value="neutral">{tr("Neutre", "Neutral")}</SelectItem>
                            <SelectItem value="friendly">{tr("Chaleureux", "Friendly")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="personalityRisk"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Tolérance au risque", "Risk Tolerance")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="conservative">{tr("Prudente", "Conservative")}</SelectItem>
                            <SelectItem value="moderate">{tr("Modérée", "Moderate")}</SelectItem>
                            <SelectItem value="bold">{tr("Audacieuse", "Bold")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="personalitySpeed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Rythme de travail", "Working Speed")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="deliberate">{tr("Réfléchi", "Deliberate")}</SelectItem>
                            <SelectItem value="moderate">{tr("Modéré", "Moderate")}</SelectItem>
                            <SelectItem value="fast">{tr("Rapide", "Fast")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="personalityDetail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Niveau de détail", "Detail Level")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="high_level">{tr("Synthétique", "High-level")}</SelectItem>
                            <SelectItem value="moderate">{tr("Modéré", "Moderate")}</SelectItem>
                            <SelectItem value="very_detailed">{tr("Très détaillé", "Very Detailed")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormDescription>
                  {tr("Ces paramètres influencent la façon dont l'agent communique et travaille.", "These personality traits influence how the agent communicates and works")}
                </FormDescription>
              </TabsContent>

              <TabsContent value="job" className="space-y-4">
                {renderSectionActions("job", tr("Mission", "Job"))}
                {!suggestions ? (
                  <div className="rounded-lg border p-3 bg-secondary/10">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium">{tr("Suggestions", "Suggestions")}</div>
                        <div className="text-xs text-muted-foreground">
                          {tr("Chargez des suggestions locales ou autorisez explicitement une suggestion IA.", "Load offline suggestions or request AI suggestions explicitly.")}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={suggestionsMutation.isPending}
                          onClick={() => suggestionsMutation.mutate("offline")}
                        >
                          {tr("Proposer des options", "Suggest options")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={suggestionsMutation.isPending}
                          onClick={() => setAiConfirmOpen(true)}
                        >
                          {tr("Suggestion IA", "AI suggest")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <FormField
                  control={form.control}
                  name="mission"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tr("Énoncé de mission", "Mission Statement")}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={tr("ex. Développer les ventes B2B en Afrique francophone...", "e.g., Drive B2B sales growth across Francophone West Africa...")}
                          rows={3}
                        />
                      </FormControl>
                      <FormDescription>{tr("Une à trois phrases décrivant la mission principale de l'agent", "1-3 sentences describing the agent's core mission")}</FormDescription>
                      {suggestions?.text?.mission?.length ? (
                        <div className="mt-2 space-y-2">
                          {suggestions.text.mission.map((option) => (
                            <div key={option} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-sm">{option}</div>
                              <div className="flex gap-2 sm:flex-col">
                                <Button type="button" size="sm" onClick={() => applyTextSuggestion("mission", option, "replace")}>
                                  {tr("Utiliser", "Use")}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => applyTextSuggestion("mission", option, "append")}>
                                  {tr("Ajouter à la suite", "Append")}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel>{tr("Responsabilités", "Responsibilities")}</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newResponsibility}
                      onChange={(e) => setNewResponsibility(e.target.value)}
                      placeholder={tr("Ajouter une responsabilité", "Add a responsibility")}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddItem('responsibility', newResponsibility);
                          setNewResponsibility("");
                        }
                      }}
                    />
                    <Button type="button" onClick={() => {
                      handleAddItem('responsibility', newResponsibility);
                      setNewResponsibility("");
                    }}>{tr("Ajouter", "Add")}</Button>
                  </div>
                  <div className="space-y-2 mt-2">
                    {(form.watch('responsibilities') || []).map((resp: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-secondary rounded">
                        <span className="flex-1">{resp}</span>
                        <X
                          className="h-4 w-4 cursor-pointer"
                          onClick={() => handleRemoveItem('responsibility', resp)}
                        />
                      </div>
                    ))}
                  </div>
                  {suggestions?.tags?.responsibilities?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.tags.responsibilities.slice(0, 10).map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => handleAddItem("responsibility", s)}
                        >
                          + {s}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="permissions" className="space-y-4">
                {renderSectionActions("permissions", tr("Accès", "Access"))}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="permissionsEmail"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{tr("Accès aux e-mails", "Email Access")}</FormLabel>
                          <FormDescription>{tr("Peut envoyer et recevoir des e-mails", "Can send and receive emails")}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permissionsCalendar"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{tr("Accès au calendrier", "Calendar Access")}</FormLabel>
                          <FormDescription>{tr("Peut planifier et gérer des réunions", "Can schedule and manage meetings")}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permissionsCrm"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{tr("Accès au CRM", "CRM Access")}</FormLabel>
                          <FormDescription>{tr("Peut consulter et mettre à jour les données CRM", "Can access and update CRM data")}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permissionsKnowledge"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{tr("Accès à la base de connaissances", "Knowledge Base Access")}</FormLabel>
                          <FormDescription>{tr("Peut lire et enrichir la base de connaissances", "Can read and write to knowledge base")}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permissionsPayments"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{tr("Accès aux paiements", "Payments Access")}</FormLabel>
                          <FormDescription>{tr("Peut traiter des paiements et opérations financières", "Can process payments and financial transactions")}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permissionsWebResearch"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{tr("Recherche web", "Web Research")}</FormLabel>
                          <FormDescription>{tr("Peut naviguer sur le web et effectuer des recherches", "Can browse the web and conduct research")}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                <FormField
                  control={form.control}
                  name="autonomyLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tr("Niveau d'autonomie", "Autonomy Level")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft_only">{tr("Brouillons uniquement", "Draft Only")}</SelectItem>
                          <SelectItem value="partial">{tr("Autonomie partielle", "Partial Autonomy")}</SelectItem>
                          <SelectItem value="full" disabled={isGovernedRoleSeat}>{tr("Autonomie complète", "Full Autonomy")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {isGovernedRoleSeat
                          ? tr(
                              "Les employés Workforce restent en autonomie partielle avec validations humaines.",
                              "Workforce employees remain partially autonomous with human approvals.",
                            )
                          : tr("Détermine jusqu'où l'agent peut agir sans validation humaine.", "Controls how much the agent can act independently")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="lifecycle" className="space-y-4">
                {renderSectionActions("lifecycle", tr("Cycle de vie", "Lifecycle"))}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Statut", "Status")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isGovernedRoleSeat}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">{tr("Actif", "Active")}</SelectItem>
                            <SelectItem value="inactive">{tr("Inactif", "Inactive")}</SelectItem>
                            <SelectItem value="paused">{tr("En pause", "Paused")}</SelectItem>
                            <SelectItem value="archived">{tr("Archivé", "Archived")}</SelectItem>
                          </SelectContent>
                        </Select>
                        {isGovernedRoleSeat ? (
                          <FormDescription>
                            {tr(
                              "Le cycle de vie de cet employ\u00e9 est g\u00e9r\u00e9 dans Agents OS > Workforce.",
                              "This employee's lifecycle is managed in Agents OS > Workforce.",
                            )}
                          </FormDescription>
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="hiredDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Date d'affectation", "Hired Date")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="promotedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tr("Date de promotion", "Promoted Date")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-2 p-4 bg-secondary/30 rounded-lg">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">{tr("Créé le", "Created")}</span>
                    <span className="text-sm text-muted-foreground">
                      {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString(isFr ? "fr-FR" : "en-GB") : tr("Non disponible", "N/A")}
                    </span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t bg-background/95 py-3 backdrop-blur sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
              >
                {tr("Annuler", "Cancel")}
              </Button>
              <Button
                type="submit"
                className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400 sm:w-auto"
                disabled={updateAgentMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {updateAgentMutation.isPending ? tr("Enregistrement...", "Saving...") : tr("Enregistrer les modifications", "Save Changes")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
