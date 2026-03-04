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
        title: "Success",
        description: "Agent profile updated successfully",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update agent profile",
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
        title: "Suggestions ready",
        description: data.mode === "ai" ? "AI suggestions loaded" : "Options loaded",
      });
    },
    onError: (error: any) => {
      if (error?.requiresConsent && error?.plan) {
        setAiConsentPlan(error.plan as AiConsentPlan);
        setAiConsentOpen(true);
        return;
      }
      toast({
        title: "Suggestions failed",
        description: error instanceof Error ? error.message : "Failed to load suggestions",
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
        title: "HR action queued",
        description: "Action request created and visible in the action queue.",
      });
    },
    onError: (error) => {
      toast({
        title: "Action queue failed",
        description: error instanceof Error ? error.message : "Failed to queue HR action",
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
        title: "Section generated",
        description: `${section[0].toUpperCase()}${section.slice(1)} fields were generated.`,
      });
    } catch (error: any) {
      if (error?.requiresConsent && error?.plan) {
        setAiConsentPlan(error.plan as AiConsentPlan);
        setAiConsentOpen(true);
        return;
      }
      toast({
        title: "Generate failed",
        description: error instanceof Error ? error.message : "Failed to generate section",
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
        title: "Error",
        description: "Agent id could not be resolved. Refresh and try again.",
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
          <div className="text-sm font-medium">{label} tools</div>
          <div className="text-xs text-muted-foreground">Generate, refine, and queue HR execution actions.</div>
          {!hasResolvableAgentId ? (
            <div className="text-xs text-amber-500 mt-1">Agent id not resolved yet. Save/reload this agent first.</div>
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
            {sectionGenerating === section ? "Generating..." : "Generate"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!hasResolvableAgentId || sectionGenerating === section || suggestionsMutation.isPending}
            onClick={() => runSectionGenerate(section, "ai")}
          >
            AI generate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasResolvableAgentId || queueProfileActionMutation.isPending}
            onClick={() => queueProfileActionMutation.mutate({ section, scope: "targeted" })}
          >
            Queue targeted action
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasResolvableAgentId || queueProfileActionMutation.isPending}
            onClick={() => queueProfileActionMutation.mutate({ section, scope: "bulk" })}
          >
            Queue bulk action
          </Button>
        </div>
      </div>
    </div>
  );

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Agent Profile: {agent.name}
          </DialogTitle>
          <DialogDescription>
            View and edit comprehensive HR-style profile information
          </DialogDescription>
        </DialogHeader>

        <AlertDialog open={aiConfirmOpen} onOpenChange={setAiConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Use AI to generate suggestions?</AlertDialogTitle>
              <AlertDialogDescription>
                This will call an external LLM provider (may cost money). Offline suggestions are always available without API calls.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setAiConfirmOpen(false);
                  suggestionsMutation.mutate("ai");
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={aiConsentOpen} onOpenChange={setAiConsentOpen}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>AI consent required</AlertDialogTitle>
              <AlertDialogDescription>
                AI is currently disabled on the server. Enable it explicitly, then retry AI suggestions.
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
                    <div className="text-xs font-medium text-muted-foreground">For how long</div>
                    <div>{aiConsentPlan.forHowLong}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium text-muted-foreground">Resources</div>
                    <ul className="list-disc pl-4">
                      {aiConsentPlan.resources?.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs font-medium text-muted-foreground">How to authorize</div>
                  <ul className="list-disc pl-4">
                    {aiConsentPlan.howToAuthorize?.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
                {aiConsentPlan.howToStop?.length ? (
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium text-muted-foreground">How to stop</div>
                    <ul className="list-disc pl-4">
                      {aiConsentPlan.howToStop.map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  </div>
                ) : null}
                {aiConsentPlan.visibility ? (
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium text-muted-foreground">Visibility</div>
                    <div>{aiConsentPlan.visibility}</div>
                  </div>
                ) : null}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!aiConsentPlan) return;
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(aiConsentPlan, null, 2));
                    toast({ title: "Copied", description: "Consent plan copied to clipboard" });
                  } catch {
                    toast({ title: "Copy failed", description: "Could not copy plan", variant: "destructive" });
                  }
                }}
              >
                Copy plan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="identity" className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="identity">
                  <User className="h-4 w-4 mr-1" /> Identity
                </TabsTrigger>
                <TabsTrigger value="background">
                  <Briefcase className="h-4 w-4 mr-1" /> Background
                </TabsTrigger>
                <TabsTrigger value="personality">
                  <Brain className="h-4 w-4 mr-1" /> Personality
                </TabsTrigger>
                <TabsTrigger value="job">
                  <Target className="h-4 w-4 mr-1" /> Job
                </TabsTrigger>
                <TabsTrigger value="permissions">
                  <Lock className="h-4 w-4 mr-1" /> Access
                </TabsTrigger>
                <TabsTrigger value="lifecycle">
                  <Calendar className="h-4 w-4 mr-1" /> Lifecycle
                </TabsTrigger>
              </TabsList>

              <TabsContent value="identity" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-1">
                    {effectiveAgentId ? (
                      <AgentPhotoEditorCard agentId={effectiveAgentId} />
                    ) : (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                        Agent id is not resolved yet. Save/reload this agent before generating a photo.
                      </div>
                    )}
                  </div>
                  <div className="lg:col-span-2 space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Agent Name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., Sales Agent" />
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
                        <FormLabel>Department</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(v === "__unassigned__" ? "" : v)}
                          value={field.value || "__unassigned__"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Unassigned" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__unassigned__">Unassigned</SelectItem>
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="managerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Manager</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(v === "__no_manager__" ? "" : v)}
                          value={field.value || "__no_manager__"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="No manager (top-level)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__no_manager__">No manager (top-level)</SelectItem>
                            {companyAgents
                              .filter((a) => a.id !== agent.id)
                              .map((a) => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                  {a.name} — {a.role}
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
                          <FormLabel className="text-base">Department Head</FormLabel>
                          <FormDescription>
                            Marks this agent as the department leader
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country of Origin</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., Ghana" />
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
                        <FormLabel>Timezone</FormLabel>
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
                        <FormLabel>Birthday</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div>
                  <FormLabel>Languages</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newLanguage}
                      onChange={(e) => setNewLanguage(e.target.value)}
                      placeholder="Add a language"
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
                    }}>Add</Button>
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
                {renderSectionActions("background", "Background")}
                <div className="rounded-lg border p-3 bg-secondary/10">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium">Suggestions</div>
                      <div className="text-xs text-muted-foreground">
                        Offline suggestions are free. AI suggestions require explicit consent per request.
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
                        Suggest options
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={suggestionsMutation.isPending}
                        onClick={() => setAiConfirmOpen(true)}
                      >
                        AI suggest
                      </Button>
                    </div>
                  </div>
                  {suggestions ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Loaded {suggestions.mode} suggestions · {new Date(suggestions.generatedAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>

                <FormField
                  control={form.control}
                  name="cv"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CV / Background</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="e.g., Has 10 years of experience in B2B sales across West Africa..."
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>Brief professional background and experience</FormDescription>
                      {suggestions?.text?.cv?.length ? (
                        <div className="mt-2 space-y-2">
                          {suggestions.text.cv.map((option) => (
                            <div key={option} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-sm">{option}</div>
                              <div className="flex gap-2 sm:flex-col">
                                <Button type="button" size="sm" onClick={() => applyTextSuggestion("cv", option, "replace")}>
                                  Use
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => applyTextSuggestion("cv", option, "append")}>
                                  Append
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
                      <FormLabel>Life Story</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="A short human-like background: upbringing, turning points, career highlights..."
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>Stored in metadata (persona)</FormDescription>
                      {suggestions?.text?.lifeStory?.length ? (
                        <div className="mt-2 space-y-2">
                          {suggestions.text.lifeStory.map((option) => (
                            <div key={option} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-sm">{option}</div>
                              <div className="flex gap-2 sm:flex-col">
                                <Button type="button" size="sm" onClick={() => applyTextSuggestion("lifeStory", option, "replace")}>
                                  Use
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => applyTextSuggestion("lifeStory", option, "append")}>
                                  Append
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
                      <FormLabel>Personal Goals</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="What does this agent strive for? What motivates them day-to-day?"
                          rows={3}
                        />
                      </FormControl>
                      <FormDescription>Stored in metadata (persona)</FormDescription>
                      {suggestions?.text?.personalGoals?.length ? (
                        <div className="mt-2 space-y-2">
                          {suggestions.text.personalGoals.map((option) => (
                            <div key={option} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-sm">{option}</div>
                              <div className="flex gap-2 sm:flex-col">
                                <Button type="button" size="sm" onClick={() => applyTextSuggestion("personalGoals", option, "replace")}>
                                  Use
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => applyTextSuggestion("personalGoals", option, "append")}>
                                  Append
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
                  <FormLabel>Skills</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      placeholder="Add a skill"
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
                    }}>Add</Button>
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
                  <FormLabel>Industry Focus</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newIndustry}
                      onChange={(e) => setNewIndustry(e.target.value)}
                      placeholder="Add an industry"
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
                    }}>Add</Button>
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
                {renderSectionActions("personality", "Personality")}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="personalityTone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tone</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="formal">Formal</SelectItem>
                            <SelectItem value="neutral">Neutral</SelectItem>
                            <SelectItem value="friendly">Friendly</SelectItem>
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
                        <FormLabel>Risk Tolerance</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="conservative">Conservative</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="bold">Bold</SelectItem>
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
                        <FormLabel>Working Speed</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="deliberate">Deliberate</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="fast">Fast</SelectItem>
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
                        <FormLabel>Detail Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="high_level">High-level</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="very_detailed">Very Detailed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormDescription>
                  These personality traits influence how the agent communicates and works
                </FormDescription>
              </TabsContent>

              <TabsContent value="job" className="space-y-4">
                {renderSectionActions("job", "Job")}
                {!suggestions ? (
                  <div className="rounded-lg border p-3 bg-secondary/10">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium">Suggestions</div>
                        <div className="text-xs text-muted-foreground">
                          Load offline suggestions or request AI suggestions explicitly.
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
                          Suggest options
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={suggestionsMutation.isPending}
                          onClick={() => setAiConfirmOpen(true)}
                        >
                          AI suggest
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
                      <FormLabel>Mission Statement</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="e.g., Drive B2B sales growth across Francophone West Africa..."
                          rows={3}
                        />
                      </FormControl>
                      <FormDescription>1-3 sentences describing the agent's core mission</FormDescription>
                      {suggestions?.text?.mission?.length ? (
                        <div className="mt-2 space-y-2">
                          {suggestions.text.mission.map((option) => (
                            <div key={option} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-sm">{option}</div>
                              <div className="flex gap-2 sm:flex-col">
                                <Button type="button" size="sm" onClick={() => applyTextSuggestion("mission", option, "replace")}>
                                  Use
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => applyTextSuggestion("mission", option, "append")}>
                                  Append
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
                  <FormLabel>Responsibilities</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newResponsibility}
                      onChange={(e) => setNewResponsibility(e.target.value)}
                      placeholder="Add a responsibility"
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
                    }}>Add</Button>
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
                {renderSectionActions("permissions", "Access")}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="permissionsEmail"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Email Access</FormLabel>
                          <FormDescription>Can send and receive emails</FormDescription>
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
                          <FormLabel className="text-base">Calendar Access</FormLabel>
                          <FormDescription>Can schedule and manage meetings</FormDescription>
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
                          <FormLabel className="text-base">CRM Access</FormLabel>
                          <FormDescription>Can access and update CRM data</FormDescription>
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
                          <FormLabel className="text-base">Knowledge Base Access</FormLabel>
                          <FormDescription>Can read and write to knowledge base</FormDescription>
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
                          <FormLabel className="text-base">Payments Access</FormLabel>
                          <FormDescription>Can process payments and financial transactions</FormDescription>
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
                          <FormLabel className="text-base">Web Research</FormLabel>
                          <FormDescription>Can browse the web and conduct research</FormDescription>
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
                      <FormLabel>Autonomy Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft_only">Draft Only</SelectItem>
                          <SelectItem value="partial">Partial Autonomy</SelectItem>
                          <SelectItem value="full">Full Autonomy</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Controls how much the agent can act independently
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="lifecycle" className="space-y-4">
                {renderSectionActions("lifecycle", "Lifecycle")}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="hiredDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hired Date</FormLabel>
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
                        <FormLabel>Promoted Date</FormLabel>
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
                    <span className="text-sm font-medium">Created</span>
                    <span className="text-sm text-muted-foreground">
                      {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateAgentMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateAgentMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
