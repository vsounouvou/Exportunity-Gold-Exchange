import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileCheck2, Film, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Row = Record<string, any>;

type WorkspaceResponse = {
  ok: boolean;
  sessions: Row[];
  claims: Row[];
  projects: Row[];
  assets: Row[];
  versions: Row[];
  renderJobs: Row[];
  workItems: Row[];
  invariants: {
    providerNeutral: true;
    backgroundExecutionStarted: false;
    externalRenderExecuted: false;
    externalPublicationExecuted: false;
    tasksPausedByDefault: true;
    credentialsExposed: false;
  };
};

const API = "/api/admin/marketing/studio";

const MODES = [
  "asynchronous_mobile",
  "live_browser",
  "live_audio",
  "recorded_video_call",
  "in_person_field",
  "human_presented_ai_prepared",
  "guided_self_recording",
];

const FACT_STATUSES = [
  "VERIFIED",
  "SUPPORTED_BY_DOCUMENT",
  "PRODUCER_CLAIM",
  "CREATOR_CLAIM",
  "INFERENCE",
  "UNVERIFIED",
  "OUTDATED",
];

const CLAIM_CATEGORIES = [
  "identity",
  "story",
  "product",
  "capacity",
  "price",
  "packaging",
  "certification",
  "buyer_segment",
  "export_experience",
  "delivery",
  "constraint",
  "call_to_action",
  "correction",
  "other",
];

const OUTPUT_FORMATS = [
  "vertical_9_16",
  "feed_4_5",
  "square_1_1",
  "landscape_16_9",
  "duration_15s",
  "duration_30s",
  "duration_60s",
  "feature_3m",
  "long_form_interview",
  "audio_only",
  "article",
  "transcript",
  "subtitle_file",
  "thumbnail",
];

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function commaList(value: string) {
  return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
}

function pretty(value: unknown) {
  return String(value || "unknown").replace(/_/g, " ");
}

function StateBadge({ status }: { status: unknown }) {
  const normalized = String(status || "unknown").toLowerCase();
  const positive = ["approved", "ready", "granted", "succeeded", "clear"].includes(normalized);
  const blocked = ["rejected", "restricted", "revoked", "failed", "cancelled"].includes(normalized);
  return (
    <Badge className={positive ? "bg-emerald-500/15 text-emerald-100" : blocked ? "bg-rose-500/15 text-rose-100" : "bg-amber-500/15 text-amber-100"}>
      {pretty(status)}
    </Badge>
  );
}

function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-10 w-full rounded-md border border-white/15 bg-slate-950 px-3 text-sm text-white ${props.className || ""}`} />;
}

function Confirmation({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (value: boolean) => void; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-500/5 p-3">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <div className="text-xs text-amber-50/85">{label}</div>
    </div>
  );
}

export default function AdminMediaStudioPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const workspace = useQuery<WorkspaceResponse>({ queryKey: [`${API}/workspace?limit=200`], staleTime: 0 });

  const action = useMutation({
    mutationFn: async (input: { path: string; method?: "POST" | "PUT"; body: Record<string, unknown>; success: string }) => {
      const result = await apiRequest(input.path, input.method || "POST", input.body);
      return { result, success: input.success };
    },
    onSuccess: ({ success }) => {
      toast({ title: success, description: "Internal state was recorded. No provider rendered, published, contacted, or charged." });
      void queryClient.invalidateQueries({ queryKey: [`${API}/workspace?limit=200`] });
    },
    onError: (error: any) => toast({ title: "Governed action blocked", description: error?.message || "Request failed", variant: "destructive" }),
  });

  const [interviewForm, setInterviewForm] = useState({
    idempotencyKey: newKey("interview"),
    mode: "asynchronous_mobile",
    intervieweeName: "",
    intervieweeRole: "Producer",
    organizationName: "",
    language: "en",
    territoryId: "",
    contactId: "",
    sourceReferenceId: "",
    intendedUses: "organic_publication, website, sales",
    consentReference: "",
    recordingConsentStatus: "pending",
    publicationConsentStatus: "pending",
    aiProcessingConsentStatus: "pending",
    confirmed: false,
  });
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const currentSessionId = selectedSessionId || workspace.data?.sessions?.[0]?.id || "";
  const [claimForm, setClaimForm] = useState({
    questionKey: "",
    questionText: "",
    answerText: "",
    claimCategory: "product",
    factStatus: "UNVERIFIED",
    confidenceBps: "0",
    evidenceReferences: "",
    evidenceNote: "",
    isMaterial: true,
    intervieweeApproved: false,
    confirmed: false,
  });
  const [interviewApprovalReference, setInterviewApprovalReference] = useState("");
  const [interviewApprovalConfirmed, setInterviewApprovalConfirmed] = useState(false);

  const [projectForm, setProjectForm] = useState({
    idempotencyKey: newKey("studio-project"),
    title: "",
    storyAngle: "",
    sourceReferenceId: "",
    rightsGrantId: "",
    outputFormats: "vertical_9_16, feed_4_5, landscape_16_9, transcript, subtitle_file",
    confirmed: false,
  });
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const currentProjectId = selectedProjectId || workspace.data?.projects?.[0]?.id || "";
  const [assetForm, setAssetForm] = useState({
    assetRole: "interview_recording",
    storageReference: "",
    originalSource: "",
    ownerName: "",
    mimeType: "video/mp4",
    sha256: "",
    rightsStatus: "granted",
    subjectConsentStatus: "granted",
    musicLicenseStatus: "not_applicable",
    aiGenerated: false,
    confirmed: false,
  });

  const currentProject = workspace.data?.projects?.find((row) => row.id === currentProjectId) || null;
  const currentClaims = useMemo(
    () => (workspace.data?.claims || []).filter((claim) => claim.sessionId === currentProject?.interviewSessionId),
    [currentProject?.interviewSessionId, workspace.data?.claims],
  );
  const [versionForm, setVersionForm] = useState({
    storyboard: "Opening identity and context; product story; capacity and trade facts; buyer call to action.",
    commands: "Create truthful captions; retain fact tags; include source attribution",
    claimIds: "",
    reviewComment: "",
    confirmed: false,
  });
  const projectVersions = (workspace.data?.versions || []).filter((row) => row.projectId === currentProjectId);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const currentVersionId = selectedVersionId || projectVersions[0]?.id || "";
  const [versionApprovalReference, setVersionApprovalReference] = useState("");
  const [versionApprovalConfirmed, setVersionApprovalConfirmed] = useState(false);
  const [renderForm, setRenderForm] = useState({
    idempotencyKey: newKey("render"),
    outputFormat: "vertical_9_16",
    instructions: "Prepare a provider-neutral render manifest from the approved version and hashed assets.",
    confirmed: false,
  });

  const data = workspace.data;
  const factCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const claim of data?.claims || []) counts[claim.factStatus] = (counts[claim.factStatus] || 0) + 1;
    return counts;
  }, [data?.claims]);

  const submitInterview = () => {
    action.mutate({
      path: `${API}/interviews`,
      body: {
        ...interviewForm,
        territoryId: Number(interviewForm.territoryId || 0) || null,
        contactId: Number(interviewForm.contactId || 0) || null,
        sourceReferenceId: Number(interviewForm.sourceReferenceId || 0) || null,
        intendedUses: commaList(interviewForm.intendedUses),
        consentEvidence: { explanationReference: interviewForm.consentReference },
        questionPlan: [
          { key: "identity", prompt: "Confirm identity, role, organization, and authority to speak." },
          { key: "story", prompt: "Tell the origin and producer story." },
          { key: "product", prompt: "Describe products, capacity, price/MOQ, packaging, and certifications." },
          { key: "trade", prompt: "Describe buyers, export experience, delivery, constraints, and call to action." },
          { key: "corrections", prompt: "Review corrections and final approval." },
        ],
      },
      success: "Interview workspace prepared",
    });
  };

  const submitClaim = () => {
    if (!currentSessionId) return toast({ title: "Select an interview", variant: "destructive" });
    action.mutate({
      path: `${API}/interviews/${currentSessionId}/claims`,
      method: "PUT",
      body: {
        ...claimForm,
        confidenceBps: Number(claimForm.confidenceBps || 0),
        evidenceReferences: commaList(claimForm.evidenceReferences),
        evidence: claimForm.evidenceNote.trim() ? { reviewerNote: claimForm.evidenceNote.trim() } : {},
      },
      success: "Interview claim recorded",
    });
  };

  const createProject = () => {
    if (!currentSessionId) return toast({ title: "Select an approved interview", variant: "destructive" });
    action.mutate({
      path: `${API}/projects`,
      body: {
        ...projectForm,
        interviewSessionId: currentSessionId,
        sourceReferenceId: Number(projectForm.sourceReferenceId || 0) || null,
        rightsGrantId: Number(projectForm.rightsGrantId || 0),
        outputFormats: commaList(projectForm.outputFormats),
        contentPlan: {
          canonicalOutputs: ["producer_profile", "product_records", "capacity_record", "wholesale_offer", "export_assessment", "transcript", "subtitles", "episodes", "clips", "article", "newsletter", "sales_tasks"],
          publicClaimsMustRemainEvidenceBacked: true,
        },
      },
      success: "Studio project prepared",
    });
  };

  const addAsset = () => {
    if (!currentProjectId) return toast({ title: "Select a studio project", variant: "destructive" });
    action.mutate({
      path: `${API}/projects/${currentProjectId}/assets`,
      body: { ...assetForm, metadata: { credentialMaterialIncluded: false }, modifications: [] },
      success: "Provenance asset recorded",
    });
  };

  const createVersion = () => {
    if (!currentProjectId) return toast({ title: "Select a studio project", variant: "destructive" });
    const selectedClaims = commaList(versionForm.claimIds).length ? commaList(versionForm.claimIds) : currentClaims.map((claim) => claim.id);
    action.mutate({
      path: `${API}/projects/${currentProjectId}/versions`,
      body: {
        confirmed: versionForm.confirmed,
        storyboard: [{ order: 1, instruction: versionForm.storyboard }],
        editDecisionList: [],
        naturalLanguageCommands: commaList(versionForm.commands),
        outputSpecifications: { providerNeutral: true, truthfulFactLabelsRequired: true },
        claimIds: selectedClaims,
        reviewComments: versionForm.reviewComment.trim() ? [{ comment: versionForm.reviewComment.trim() }] : [],
      },
      success: "Studio version created for review",
    });
  };

  return (
    <div className="mx-auto max-w-[1550px] space-y-6 p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Interview & Media Studio</h1>
          <p className="mt-1 text-sm text-white/60">Consent-led interviews, exact fact tags, source/rights provenance, version approval, and provider-neutral render preparation.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/media"><Button variant="outline">Canonical media & rights</Button></Link>
          <Button variant="outline" onClick={() => workspace.refetch()} disabled={workspace.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${workspace.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-3 rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
        <div className="text-sm text-emerald-50/90">
          This release stores references, consent evidence, fact decisions, edits, hashes, and approvals. It never asks for credentials, starts a recording, contacts an interviewee, submits a render provider job, publishes content, runs ads, or spends money. A prepared render is not a rendered asset.
        </div>
      </div>

      {workspace.isError ? (
        <div className="flex gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100"><TriangleAlert className="h-5 w-5" />{(workspace.error as any)?.message || "Workspace unavailable"}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Interviews", data?.sessions?.length || 0],
          ["Approved interviews", (data?.sessions || []).filter((row) => row.status === "approved").length],
          ["Material claims", (data?.claims || []).filter((row) => row.isMaterial !== false).length],
          ["Studio projects", data?.projects?.length || 0],
          ["Versions", data?.versions?.length || 0],
          ["Prepared renders", (data?.renderJobs || []).filter((row) => row.status === "prepared").length],
        ].map(([label, value]) => <Card key={String(label)} className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-white/55">{label}</div></CardContent></Card>)}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-4 w-4" />1. Prepare interview intake</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mode</Label><NativeSelect value={interviewForm.mode} onChange={(e) => setInterviewForm({ ...interviewForm, mode: e.target.value })}>{MODES.map((mode) => <option key={mode}>{mode}</option>)}</NativeSelect></div>
              <div><Label>Language</Label><Input value={interviewForm.language} onChange={(e) => setInterviewForm({ ...interviewForm, language: e.target.value })} /></div>
              <div><Label>Interviewee name</Label><Input value={interviewForm.intervieweeName} onChange={(e) => setInterviewForm({ ...interviewForm, intervieweeName: e.target.value })} /></div>
              <div><Label>Role</Label><Input value={interviewForm.intervieweeRole} onChange={(e) => setInterviewForm({ ...interviewForm, intervieweeRole: e.target.value })} /></div>
              <div className="col-span-2"><Label>Organization</Label><Input value={interviewForm.organizationName} onChange={(e) => setInterviewForm({ ...interviewForm, organizationName: e.target.value })} /></div>
              <div><Label>Territory ID (optional)</Label><Input value={interviewForm.territoryId} onChange={(e) => setInterviewForm({ ...interviewForm, territoryId: e.target.value })} /></div>
              <div><Label>CRM contact ID (optional)</Label><Input value={interviewForm.contactId} onChange={(e) => setInterviewForm({ ...interviewForm, contactId: e.target.value })} /></div>
              <div className="col-span-2"><Label>Source reference ID</Label><Input value={interviewForm.sourceReferenceId} onChange={(e) => setInterviewForm({ ...interviewForm, sourceReferenceId: e.target.value })} /></div>
            </div>
            <div><Label>Intended uses</Label><Input value={interviewForm.intendedUses} onChange={(e) => setInterviewForm({ ...interviewForm, intendedUses: e.target.value })} /></div>
            <div><Label>Consent explanation/form reference (never paste credentials)</Label><Input value={interviewForm.consentReference} onChange={(e) => setInterviewForm({ ...interviewForm, consentReference: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              {(["recordingConsentStatus", "publicationConsentStatus", "aiProcessingConsentStatus"] as const).map((key) => <div key={key}><Label>{pretty(key)}</Label><NativeSelect value={interviewForm[key]} onChange={(e) => setInterviewForm({ ...interviewForm, [key]: e.target.value })}>{["pending", "granted", "declined", "revoked", "unknown"].map((status) => <option key={status}>{status}</option>)}</NativeSelect></div>)}
            </div>
            <Confirmation checked={interviewForm.confirmed} onCheckedChange={(confirmed) => setInterviewForm({ ...interviewForm, confirmed })} label="I confirm this internal intake and its consent evidence. This does not contact or record the interviewee." />
            <Button onClick={submitInterview} disabled={action.isPending} className="w-full">Prepare interview workspace</Button>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle className="text-base">2. Capture progressive claim</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Interview</Label><NativeSelect value={currentSessionId} onChange={(e) => setSelectedSessionId(e.target.value)}><option value="">Select</option>{(data?.sessions || []).map((row) => <option key={row.id} value={row.id}>{row.intervieweeName} — {pretty(row.status)}</option>)}</NativeSelect></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Question key</Label><Input value={claimForm.questionKey} onChange={(e) => setClaimForm({ ...claimForm, questionKey: e.target.value })} placeholder="product_capacity" /></div>
              <div><Label>Category</Label><NativeSelect value={claimForm.claimCategory} onChange={(e) => setClaimForm({ ...claimForm, claimCategory: e.target.value })}>{CLAIM_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</NativeSelect></div>
            </div>
            <div><Label>Question</Label><Input value={claimForm.questionText} onChange={(e) => setClaimForm({ ...claimForm, questionText: e.target.value })} /></div>
            <div><Label>Answer / claim</Label><Textarea value={claimForm.answerText} onChange={(e) => setClaimForm({ ...claimForm, answerText: e.target.value })} rows={4} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Fact status</Label><NativeSelect value={claimForm.factStatus} onChange={(e) => setClaimForm({ ...claimForm, factStatus: e.target.value })}>{FACT_STATUSES.map((status) => <option key={status}>{status}</option>)}</NativeSelect></div>
              <div><Label>Confidence (0–10000 bps)</Label><Input value={claimForm.confidenceBps} onChange={(e) => setClaimForm({ ...claimForm, confidenceBps: e.target.value })} /></div>
            </div>
            <div><Label>Document/source references</Label><Input value={claimForm.evidenceReferences} onChange={(e) => setClaimForm({ ...claimForm, evidenceReferences: e.target.value })} placeholder="drive-file-id, inspection-report-id" /></div>
            <div><Label>Reviewer evidence note</Label><Textarea value={claimForm.evidenceNote} onChange={(e) => setClaimForm({ ...claimForm, evidenceNote: e.target.value })} rows={2} /></div>
            <div className="flex gap-5 text-sm"><label className="flex items-center gap-2"><Checkbox checked={claimForm.isMaterial} onCheckedChange={(value) => setClaimForm({ ...claimForm, isMaterial: value === true })} />Material claim</label><label className="flex items-center gap-2"><Checkbox checked={claimForm.intervieweeApproved} onCheckedChange={(value) => setClaimForm({ ...claimForm, intervieweeApproved: value === true })} />Interviewee approved</label></div>
            <Confirmation checked={claimForm.confirmed} onCheckedChange={(confirmed) => setClaimForm({ ...claimForm, confirmed })} label="I confirm this exact claim, tag, and evidence entry. Unverified material claims remain blocked from production." />
            <Button onClick={submitClaim} disabled={action.isPending} className="w-full">Record or update claim</Button>
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">{FACT_STATUSES.map((status) => <Badge key={status} variant="outline">{status}: {factCounts[status] || 0}</Badge>)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-white/5">
        <CardHeader><CardTitle className="text-base">3. Evidence review and interview approval</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <div><Label>Selected interview</Label><NativeSelect value={currentSessionId} onChange={(e) => setSelectedSessionId(e.target.value)}><option value="">Select</option>{(data?.sessions || []).map((row) => <option key={row.id} value={row.id}>{row.intervieweeName} — {pretty(row.status)}</option>)}</NativeSelect></div>
          <div><Label>Approval evidence reference</Label><Input value={interviewApprovalReference} onChange={(e) => setInterviewApprovalReference(e.target.value)} /></div>
          <label className="flex h-10 items-center gap-2 text-sm"><Checkbox checked={interviewApprovalConfirmed} onCheckedChange={(value) => setInterviewApprovalConfirmed(value === true)} />Confirm approval</label>
          <div className="flex gap-2"><Button variant="outline" disabled={!currentSessionId || action.isPending} onClick={() => action.mutate({ path: `${API}/interviews/${currentSessionId}/submit`, body: { confirmed: true }, success: "Interview submitted; evidence gaps became paused tasks" })}>Submit review</Button><Button disabled={!currentSessionId || action.isPending} onClick={() => action.mutate({ path: `${API}/interviews/${currentSessionId}/approve`, body: { confirmed: interviewApprovalConfirmed, approvalEvidence: { approvalReference: interviewApprovalReference } }, success: "Interview approved for production" })}>Approve</Button></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Film className="h-4 w-4" />4. Prepare studio project</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Approved interview</Label><NativeSelect value={currentSessionId} onChange={(e) => setSelectedSessionId(e.target.value)}><option value="">Select</option>{(data?.sessions || []).map((row) => <option key={row.id} value={row.id}>{row.intervieweeName} — {pretty(row.status)}</option>)}</NativeSelect></div>
            <div><Label>Title</Label><Input value={projectForm.title} onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })} /></div>
            <div><Label>Story angle</Label><Textarea value={projectForm.storyAngle} onChange={(e) => setProjectForm({ ...projectForm, storyAngle: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Source reference ID</Label><Input value={projectForm.sourceReferenceId} onChange={(e) => setProjectForm({ ...projectForm, sourceReferenceId: e.target.value })} /></div><div><Label>Active rights grant ID</Label><Input value={projectForm.rightsGrantId} onChange={(e) => setProjectForm({ ...projectForm, rightsGrantId: e.target.value })} /></div></div>
            <div><Label>Planned formats</Label><Textarea value={projectForm.outputFormats} onChange={(e) => setProjectForm({ ...projectForm, outputFormats: e.target.value })} rows={2} /></div>
            <Confirmation checked={projectForm.confirmed} onCheckedChange={(confirmed) => setProjectForm({ ...projectForm, confirmed })} label="I confirm the approved interview, source reference, rights grant, and output plan. No render or publication will occur." />
            <Button onClick={createProject} disabled={action.isPending} className="w-full">Prepare studio project</Button>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle className="text-base">5. Record provenance asset</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Project</Label><NativeSelect value={currentProjectId} onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedVersionId(""); }}><option value="">Select</option>{(data?.projects || []).map((row) => <option key={row.id} value={row.id}>{row.title} — {pretty(row.status)}</option>)}</NativeSelect></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Asset role</Label><NativeSelect value={assetForm.assetRole} onChange={(e) => setAssetForm({ ...assetForm, assetRole: e.target.value })}>{["source_video", "source_audio", "interview_recording", "licensed_creator_media", "product_photo", "brand_file", "logo", "document", "voice_recording", "generated_image", "generated_video_segment", "stock_media", "transcript", "subtitle", "thumbnail", "music", "other"].map((role) => <option key={role}>{role}</option>)}</NativeSelect></div><div><Label>MIME type</Label><Input value={assetForm.mimeType} onChange={(e) => setAssetForm({ ...assetForm, mimeType: e.target.value })} /></div></div>
            <div><Label>Storage reference (non-secret path/URI)</Label><Input value={assetForm.storageReference} onChange={(e) => setAssetForm({ ...assetForm, storageReference: e.target.value })} /></div>
            <div><Label>Original source</Label><Input value={assetForm.originalSource} onChange={(e) => setAssetForm({ ...assetForm, originalSource: e.target.value })} /></div>
            <div><Label>Owner / rights holder</Label><Input value={assetForm.ownerName} onChange={(e) => setAssetForm({ ...assetForm, ownerName: e.target.value })} /></div>
            <div><Label>SHA-256 digest</Label><Input value={assetForm.sha256} onChange={(e) => setAssetForm({ ...assetForm, sha256: e.target.value })} placeholder="64 hex characters" /></div>
            <div className="grid grid-cols-3 gap-3"><div><Label>Rights</Label><NativeSelect value={assetForm.rightsStatus} onChange={(e) => setAssetForm({ ...assetForm, rightsStatus: e.target.value })}>{["unknown", "pending", "granted", "restricted", "revoked"].map((v) => <option key={v}>{v}</option>)}</NativeSelect></div><div><Label>Subject consent</Label><NativeSelect value={assetForm.subjectConsentStatus} onChange={(e) => setAssetForm({ ...assetForm, subjectConsentStatus: e.target.value })}>{["unknown", "pending", "granted", "declined", "revoked", "not_applicable"].map((v) => <option key={v}>{v}</option>)}</NativeSelect></div><div><Label>Music license</Label><NativeSelect value={assetForm.musicLicenseStatus} onChange={(e) => setAssetForm({ ...assetForm, musicLicenseStatus: e.target.value })}>{["unknown", "pending", "granted", "restricted", "revoked", "not_applicable"].map((v) => <option key={v}>{v}</option>)}</NativeSelect></div></div>
            <Confirmation checked={assetForm.confirmed} onCheckedChange={(confirmed) => setAssetForm({ ...assetForm, confirmed })} label="I confirm this reference, hash, ownership, rights, consent, and license state. I did not paste a token, password, cookie, or signed credential URL." />
            <Button onClick={addAsset} disabled={action.isPending} className="w-full">Record provenance asset</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle className="text-base">6. Create and approve edit version</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Project</Label><NativeSelect value={currentProjectId} onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedVersionId(""); }}><option value="">Select</option>{(data?.projects || []).map((row) => <option key={row.id} value={row.id}>{row.title} — {pretty(row.status)}</option>)}</NativeSelect></div>
            <div><Label>Storyboard</Label><Textarea value={versionForm.storyboard} onChange={(e) => setVersionForm({ ...versionForm, storyboard: e.target.value })} rows={3} /></div>
            <div><Label>Natural-language edit commands</Label><Textarea value={versionForm.commands} onChange={(e) => setVersionForm({ ...versionForm, commands: e.target.value })} rows={2} /></div>
            <div><Label>Claim IDs (blank uses all claims from the project interview)</Label><Textarea value={versionForm.claimIds} onChange={(e) => setVersionForm({ ...versionForm, claimIds: e.target.value })} rows={2} placeholder={currentClaims.map((claim) => claim.id).join(", ")} /></div>
            <Confirmation checked={versionForm.confirmed} onCheckedChange={(confirmed) => setVersionForm({ ...versionForm, confirmed })} label="I confirm this edit manifest and exact claim set for compliance review." />
            <Button onClick={createVersion} disabled={action.isPending} className="w-full">Create review version</Button>
            <div className="border-t border-white/10 pt-3 space-y-3">
              <div><Label>Version</Label><NativeSelect value={currentVersionId} onChange={(e) => setSelectedVersionId(e.target.value)}><option value="">Select</option>{projectVersions.map((row) => <option key={row.id} value={row.id}>v{row.versionNumber} — {pretty(row.status)}</option>)}</NativeSelect></div>
              <div><Label>Approval evidence reference</Label><Input value={versionApprovalReference} onChange={(e) => setVersionApprovalReference(e.target.value)} /></div>
              <Confirmation checked={versionApprovalConfirmed} onCheckedChange={setVersionApprovalConfirmed} label="I confirm source, consent, rights, material facts, asset hashes, and this exact content version." />
              <Button disabled={!currentProjectId || !currentVersionId || action.isPending} onClick={() => action.mutate({ path: `${API}/projects/${currentProjectId}/versions/${currentVersionId}/approve`, body: { confirmed: versionApprovalConfirmed, approvalEvidence: { approvalReference: versionApprovalReference } }, success: "Studio version approved" })} className="w-full">Approve exact version</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle className="text-base">7. Prepare render manifest</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-sky-300/20 bg-sky-500/10 p-3 text-xs text-sky-50">This creates a <strong>prepared</strong> database record only. It has no provider adapter, provider job ID, output URL, or claim of rendering.</div>
            <div><Label>Approved project</Label><NativeSelect value={currentProjectId} onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedVersionId(""); }}><option value="">Select</option>{(data?.projects || []).map((row) => <option key={row.id} value={row.id}>{row.title} — {pretty(row.status)}</option>)}</NativeSelect></div>
            <div><Label>Approved version</Label><NativeSelect value={currentVersionId} onChange={(e) => setSelectedVersionId(e.target.value)}><option value="">Select</option>{projectVersions.map((row) => <option key={row.id} value={row.id}>v{row.versionNumber} — {pretty(row.status)}</option>)}</NativeSelect></div>
            <div><Label>Output format</Label><NativeSelect value={renderForm.outputFormat} onChange={(e) => setRenderForm({ ...renderForm, outputFormat: e.target.value })}>{OUTPUT_FORMATS.map((format) => <option key={format}>{format}</option>)}</NativeSelect></div>
            <div><Label>Preparation instructions</Label><Textarea value={renderForm.instructions} onChange={(e) => setRenderForm({ ...renderForm, instructions: e.target.value })} rows={3} /></div>
            <Confirmation checked={renderForm.confirmed} onCheckedChange={(confirmed) => setRenderForm({ ...renderForm, confirmed })} label="I authorize only the internal render manifest. I do not authorize provider submission, external rendering, publication, advertising, or spend." />
            <Button disabled={!currentProjectId || !currentVersionId || action.isPending} onClick={() => action.mutate({ path: `${API}/renders/prepare`, body: { projectId: currentProjectId, versionId: currentVersionId, idempotencyKey: renderForm.idempotencyKey, outputFormat: renderForm.outputFormat, renderSpecification: { instructions: renderForm.instructions, providerNeutral: true }, confirmed: renderForm.confirmed }, success: "Render manifest prepared — no render executed" })} className="w-full">Prepare only (no provider call)</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="border-white/10 bg-white/5 xl:col-span-2">
          <CardHeader><CardTitle className="text-base">Current workflow records</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(data?.projects || []).length ? data?.projects.map((project) => {
              const assetCount = (data.assets || []).filter((asset) => asset.projectId === project.id).length;
              const versionCount = (data.versions || []).filter((version) => version.projectId === project.id).length;
              return <div key={project.id} className="rounded-lg border border-white/10 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{project.title}</div><div className="text-xs text-white/45">{project.id}</div></div><StateBadge status={project.status} /></div><div className="mt-2 flex gap-3 text-xs text-white/55"><span>{assetCount} assets</span><span>{versionCount} versions</span><span>external render: {String(project.externalRenderExecuted)}</span></div>{project.blockers?.length ? <div className="mt-2 text-xs text-amber-200">{project.blockers.join(" · ")}</div> : null}</div>;
            }) : <div className="text-sm text-white/50">No studio project yet.</div>}
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle className="text-base">Prepared render truth</CardTitle></CardHeader>
          <CardContent className="space-y-3">{(data?.renderJobs || []).length ? data?.renderJobs.map((job) => <div key={job.id} className="rounded-lg border border-white/10 p-3 text-sm"><div className="flex justify-between gap-2"><span>{pretty(job.outputFormat)}</span><StateBadge status={job.status} /></div><div className="mt-2 text-xs text-white/50">provider: {job.provider || "none"}<br />provider job: {job.providerJobReference || "none"}<br />external render: {String(job.externalRenderExecuted)}</div></div>) : <div className="text-sm text-white/50">No render manifest prepared.</div>}</CardContent>
        </Card>
      </div>

      <div className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/65">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
        <div>Canonical public output remains <code>marketing_media_items</code>. Source truth remains in <code>source_content_references</code> and <code>media_rights_grants</code>. Studio records extend those systems; they do not create a competing CMS or a second rights ledger.</div>
      </div>
    </div>
  );
}
