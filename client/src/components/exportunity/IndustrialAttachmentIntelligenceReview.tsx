import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Loader2,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export type IndustrialAttachmentProposal = {
  objectIdentified: boolean;
  likelyProduct: string | null;
  productCategory: string | null;
  brand: string | null;
  model: string | null;
  specificationSummary: string | null;
  visibleText: string[];
  observableCharacteristics: string[];
  proposedSpecifications: Array<{
    field: string;
    value: string;
    evidence: string;
    confidence: number;
  }>;
  clarificationQuestions: string[];
  limitations: string[];
  internalSearchTerms: string[];
  overallConfidence: number;
};

export type IndustrialAttachmentReview = {
  id: string;
  attachmentId: string;
  reviewKind: "image_vision" | "scanned_document_ocr" | "cad_technical" | "manual";
  status:
    | "pending_analysis"
    | "analysis_ready"
    | "analysis_failed"
    | "under_review"
    | "approved"
    | "rejected"
    | "applied";
  analysisProposal: IndustrialAttachmentProposal;
  reviewedProposal: IndustrialAttachmentProposal;
  generationMetadata: {
    provider?: string | null;
    model?: string | null;
    promptVersion?: string | null;
    generatedAt?: string | null;
    failureCode?: string | null;
  };
  analysisWarning?: string | null;
  reviewNotes?: string | null;
  appliedFields: string[];
  revision: number;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  appliedAt?: string | null;
};

export type IndustrialAttachmentVisionStatus = {
  enabled: boolean;
  featureEnabled: boolean;
  aiEnabled: boolean;
  configured: boolean;
  model: string;
  automaticAnalysis: false;
  requiresExplicitImageConfirmation: true;
  requiresHumanApprovalBeforeApply: true;
};

export type IndustrialAttachmentWithReview = {
  id: string;
  fileName: string;
  mimeType: string;
  extractionStatus?: string | null;
  extractionMethod?: string | null;
  extractionWarning?: string | null;
  extractedText?: string | null;
  extractedAt?: string | null;
  createdAt: string;
  intelligenceReview?: IndustrialAttachmentReview | null;
};

const EMPTY_PROPOSAL: IndustrialAttachmentProposal = {
  objectIdentified: false,
  likelyProduct: null,
  productCategory: null,
  brand: null,
  model: null,
  specificationSummary: null,
  visibleText: [],
  observableCharacteristics: [],
  proposedSpecifications: [],
  clarificationQuestions: [],
  limitations: [],
  internalSearchTerms: [],
  overallConfidence: 0,
};

function proposalFor(review?: IndustrialAttachmentReview | null) {
  if (!review) return EMPTY_PROPOSAL;
  if (
    review.status === "analysis_ready" &&
    !review.reviewedProposal?.likelyProduct &&
    !review.reviewedProposal?.specificationSummary
  ) {
    return review.analysisProposal || EMPTY_PROPOSAL;
  }
  return review.reviewedProposal || review.analysisProposal || EMPTY_PROPOSAL;
}

function lines(value: string) {
  return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
}

function reviewKindFor(attachment: IndustrialAttachmentWithReview) {
  if (attachment.mimeType.startsWith("image/")) return "image_vision" as const;
  if (attachment.extractionStatus === "ocr_required") {
    return "scanned_document_ocr" as const;
  }
  if (/\.(?:dxf|dwg|step|stp|stl|iges|igs)$/i.test(attachment.fileName)) {
    return "cad_technical" as const;
  }
  return "manual" as const;
}

function statusLabel(status?: IndustrialAttachmentReview["status"]) {
  if (!status) return "No interpretation";
  return status.replaceAll("_", " ");
}

export function IndustrialAttachmentIntelligenceReviewPanel({
  requirementId,
  attachment,
  vision,
  onUpdated,
}: {
  requirementId: string;
  attachment: IndustrialAttachmentWithReview;
  vision: IndustrialAttachmentVisionStatus;
  onUpdated: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const review = attachment.intelligenceReview || null;
  const [proposal, setProposal] = useState<IndustrialAttachmentProposal>(() => ({
    ...proposalFor(review),
  }));
  const [reviewNotes, setReviewNotes] = useState(review?.reviewNotes || "");
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [applyFields, setApplyFields] = useState<string[]>([]);

  useEffect(() => {
    const next = proposalFor(attachment.intelligenceReview);
    setProposal({
      ...next,
      visibleText: [...(next.visibleText || [])],
      observableCharacteristics: [...(next.observableCharacteristics || [])],
      proposedSpecifications: [...(next.proposedSpecifications || [])],
      clarificationQuestions: [...(next.clarificationQuestions || [])],
      limitations: [...(next.limitations || [])],
      internalSearchTerms: [...(next.internalSearchTerms || [])],
    });
    setReviewNotes(attachment.intelligenceReview?.reviewNotes || "");
    setHumanConfirmed(false);
  }, [attachment.intelligenceReview]);

  useEffect(() => {
    const selected = [
      proposal.likelyProduct ? "productName" : null,
      proposal.productCategory ? "productCategory" : null,
      proposal.specificationSummary ? "specification" : null,
    ].filter((field): field is string => Boolean(field));
    setApplyFields(selected);
  }, [
    proposal.likelyProduct,
    proposal.productCategory,
    proposal.specificationSummary,
  ]);

  const endpoint = `/api/industrial/admin/requirements/${requirementId}/attachments/${attachment.id}`;
  const afterSuccess = async (title: string, description: string) => {
    await onUpdated();
    toast({ title, description });
  };
  const onError = (error: any) =>
    toast({
      title: "Attachment review not updated",
      description: String(error?.message || "The governed review action failed."),
      variant: "destructive",
    });

  const analyzeMutation = useMutation({
    mutationFn: () =>
      apiRequest(`${endpoint}/analyze`, "POST", { confirmedExternalAi: true }),
    onSuccess: () =>
      afterSuccess(
        "Candidate interpretation ready",
        "Review every field against the original image. Nothing was applied.",
      ),
    onError,
  });
  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`${endpoint}/review`, "PUT", {
        reviewKind: reviewKindFor(attachment),
        proposal,
        reviewNotes,
        humanConfirmed,
      }),
    onSuccess: () =>
      afterSuccess(
        "Human review saved",
        "The proposal remains non-authoritative until it is approved and applied.",
      ),
    onError,
  });
  const decisionMutation = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      apiRequest(`${endpoint}/decision`, "POST", {
        decision,
        reason: reviewNotes,
        humanConfirmed,
      }),
    onSuccess: (_result, decision) =>
      afterSuccess(
        decision === "approve" ? "Review approved" : "Review rejected",
        decision === "approve"
          ? "Applying fields still requires a separate administrator confirmation."
          : "No requirement fields were changed.",
      ),
    onError,
  });
  const applyMutation = useMutation({
    mutationFn: () =>
      apiRequest(`${endpoint}/apply`, "POST", {
        fields: applyFields,
        humanConfirmed,
      }),
    onSuccess: () =>
      afterSuccess(
        "Approved fields applied",
        "The selected changes and their prior values were added to the audit trail.",
      ),
    onError,
  });

  const busy =
    analyzeMutation.isPending ||
    saveMutation.isPending ||
    decisionMutation.isPending ||
    applyMutation.isPending;
  const canAnalyze =
    attachment.mimeType.startsWith("image/") &&
    (!review || review.status === "analysis_failed");
  const locked = review?.status === "pending_analysis" || review?.status === "applied";
  const providerDescription = useMemo(() => {
    if (!attachment.mimeType.startsWith("image/")) {
      return attachment.extractionStatus === "ocr_required"
        ? "Scanned-document OCR findings require manual verification in this path."
        : "CAD and other technical evidence stays in the manual engineering review path.";
    }
    if (vision.enabled) {
      return `A deliberate click can send this image to ${vision.model}; automatic analysis is off.`;
    }
    if (!vision.featureEnabled) return "Image interpretation is disabled by feature policy.";
    if (!vision.aiEnabled) return "Image interpretation is disabled by the global AI policy.";
    return "Image interpretation needs a configured OpenAI key.";
  }, [attachment.extractionStatus, attachment.mimeType, vision]);

  const updateOptional = (
    field:
      | "likelyProduct"
      | "productCategory"
      | "brand"
      | "model"
      | "specificationSummary",
    value: string,
  ) => setProposal((current) => ({ ...current, [field]: value.trimStart() || null }));

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-[#07121F]">
            <ShieldCheck className="h-4 w-4 text-[#0B7A53]" />
            Governed interpretation
          </div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-600">
            {providerDescription}
          </p>
        </div>
        <Badge variant="outline" className="capitalize">
          {statusLabel(review?.status)}
        </Badge>
      </div>

      {canAnalyze ? (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs leading-5 text-blue-900">
            This foreground action sends the private image to the configured OpenAI
            model once. The result is only a candidate and cannot change the case.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-2 bg-blue-700 font-black text-white hover:bg-blue-800"
            disabled={!vision.enabled || busy}
            onClick={() => {
              if (
                window.confirm(
                  "Send this private image to the configured OpenAI model for one visible analysis request? No requirement fields will be changed.",
                )
              ) {
                analyzeMutation.mutate();
              }
            }}
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Bot className="mr-2 h-4 w-4" />
            )}
            Analyze image for review
          </Button>
        </div>
      ) : null}

      {review?.analysisWarning ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {review.analysisWarning}
        </p>
      ) : null}

      {review?.generationMetadata?.model ? (
        <div className="mt-2 text-[11px] text-slate-500">
          Candidate source: {review.generationMetadata.provider || "configured provider"} / {review.generationMetadata.model} / {review.generationMetadata.promptVersion || "versioned prompt"}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs font-bold">Likely product</Label>
          <Input
            value={proposal.likelyProduct || ""}
            onChange={(event) => updateOptional("likelyProduct", event.target.value)}
            disabled={locked || busy}
            placeholder="Verified product or component name"
          />
        </div>
        <div>
          <Label className="text-xs font-bold">Product category</Label>
          <Input
            value={proposal.productCategory || ""}
            onChange={(event) => updateOptional("productCategory", event.target.value)}
            disabled={locked || busy}
            placeholder="Industrial category"
          />
        </div>
        <div>
          <Label className="text-xs font-bold">Visible brand</Label>
          <Input
            value={proposal.brand || ""}
            onChange={(event) => updateOptional("brand", event.target.value)}
            disabled={locked || busy}
            placeholder="Leave blank when not visible"
          />
        </div>
        <div>
          <Label className="text-xs font-bold">Visible model</Label>
          <Input
            value={proposal.model || ""}
            onChange={(event) => updateOptional("model", event.target.value)}
            disabled={locked || busy}
            placeholder="Leave blank when not visible"
          />
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-xs font-bold">Specification summary</Label>
        <Textarea
          value={proposal.specificationSummary || ""}
          onChange={(event) =>
            updateOptional("specificationSummary", event.target.value)
          }
          disabled={locked || busy}
          rows={3}
          placeholder="Human-verified technical summary; do not infer hidden dimensions or certifications."
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs font-bold">Visible text, one item per line</Label>
          <Textarea
            value={proposal.visibleText.join("\n")}
            onChange={(event) =>
              setProposal((current) => ({
                ...current,
                visibleText: lines(event.target.value),
              }))
            }
            disabled={locked || busy}
            rows={3}
          />
        </div>
        <div>
          <Label className="text-xs font-bold">Observable characteristics</Label>
          <Textarea
            value={proposal.observableCharacteristics.join("\n")}
            onChange={(event) =>
              setProposal((current) => ({
                ...current,
                observableCharacteristics: lines(event.target.value),
              }))
            }
            disabled={locked || busy}
            rows={3}
          />
        </div>
        <div>
          <Label className="text-xs font-bold">Clarification questions</Label>
          <Textarea
            value={proposal.clarificationQuestions.join("\n")}
            onChange={(event) =>
              setProposal((current) => ({
                ...current,
                clarificationQuestions: lines(event.target.value),
              }))
            }
            disabled={locked || busy}
            rows={3}
          />
        </div>
        <div>
          <Label className="text-xs font-bold">Internal catalog search terms</Label>
          <Textarea
            value={proposal.internalSearchTerms.join("\n")}
            onChange={(event) =>
              setProposal((current) => ({
                ...current,
                internalSearchTerms: lines(event.target.value),
              }))
            }
            disabled={locked || busy}
            rows={3}
          />
        </div>
      </div>

      {proposal.proposedSpecifications.length ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">
            Candidate specification evidence
          </div>
          {proposal.proposedSpecifications.slice(0, 8).map((item, index) => (
            <div key={`${item.field}-${index}`} className="rounded-md bg-white px-3 py-2 text-xs text-slate-600">
              <span className="font-black text-slate-800">{item.field}: {item.value}</span>
              <div className="mt-1">Evidence: {item.evidence} / confidence {Math.round(item.confidence * 100)}%</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3">
        <Label className="text-xs font-bold">Reviewer notes</Label>
        <Textarea
          value={reviewNotes}
          onChange={(event) => setReviewNotes(event.target.value)}
          disabled={locked || busy}
          rows={2}
          placeholder="State what you checked against the original evidence."
        />
      </div>

      {review?.status !== "applied" ? (
        <label className="mt-3 flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-700">
          <Checkbox
            checked={humanConfirmed}
            onCheckedChange={(checked) => setHumanConfirmed(checked === true)}
            disabled={busy || review?.status === "pending_analysis"}
          />
          I inspected the original evidence and accept responsibility for this review
          or apply decision.
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {!locked ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!humanConfirmed || busy}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save human review
          </Button>
        ) : null}
        {review?.status === "under_review" ? (
          <>
            <Button
              type="button"
              size="sm"
              className="bg-[#0B7A53] font-black text-white hover:bg-[#096542]"
              disabled={!humanConfirmed || reviewNotes.trim().length < 8 || busy}
              onClick={() => decisionMutation.mutate("approve")}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve reviewed proposal
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={reviewNotes.trim().length < 8 || busy}
              onClick={() => decisionMutation.mutate("reject")}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </>
        ) : null}
      </div>

      {review?.status === "approved" ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs font-black text-emerald-900">
            Select exactly which approved fields to apply
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-emerald-900">
            {[
              ["productName", "Product name", proposal.likelyProduct],
              ["productCategory", "Category", proposal.productCategory],
              ["specification", "Specification", proposal.specificationSummary],
            ].map(([field, label, value]) => (
              <label key={field} className="flex items-center gap-2">
                <Checkbox
                  checked={applyFields.includes(String(field))}
                  disabled={!value || busy}
                  onCheckedChange={(checked) =>
                    setApplyFields((current) =>
                      checked === true
                        ? [...new Set([...current, String(field)])]
                        : current.filter((item) => item !== field),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            className="mt-3 bg-[#07121F] font-black text-white hover:bg-slate-800"
            disabled={!humanConfirmed || !applyFields.length || busy}
            onClick={() => {
              if (
                window.confirm(
                  `Apply these approved fields to the product requirement: ${applyFields.join(", ")}? The prior values will remain in the audit trail.`,
                )
              ) {
                applyMutation.mutate();
              }
            }}
          >
            {applyMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Apply selected fields
          </Button>
        </div>
      ) : null}

      {review?.status === "applied" ? (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          Applied fields: {review.appliedFields.join(", ") || "recorded in audit"}. This review is now immutable.
        </p>
      ) : null}
    </div>
  );
}
