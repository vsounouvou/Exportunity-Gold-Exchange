import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  SendHorizontal,
  ShieldCheck,
  Scale,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommercialOfferWorkbench } from "@/components/exportunity/CommercialOfferWorkbench";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type RfqStatus =
  | "draft"
  | "approval_pending"
  | "approved_for_outreach"
  | "rejected"
  | "cancelled";

type EligiblePromotion = {
  promotionId: string;
  requirementId: string;
  supplierProfileId: string;
  requirementReferenceCode: string;
  requirementTitle: string;
  productRequirementId?: string | null;
  productRequirementSource?:
    | "canonical_product_requirement"
    | "industrial_requirement_legacy";
  productName?: string | null;
  specification?: string | null;
  quantityText: string | null;
  destination?: string | null;
  deliveryCountryCode: string | null;
  deliveryCity: string | null;
  supplierLegalName: string;
  supplierCountryCode: string;
  confirmedContact: { type: "email" | "phone" | "website"; value: string };
  verificationScope: string;
  latestRfqStatus: RfqStatus | null;
  canCreateDraft: boolean;
};

type RfqDecision = {
  id: string;
  decision: "approved" | "rejected";
  contentHash: string;
  checklist: Record<string, boolean>;
  decisionNotes: string;
  decidedAt: string;
  authorizationExpiresAt: string | null;
  outreachAuthorized: boolean;
  dispatchCreated: boolean;
};

type RfqDraft = {
  id: string;
  promotionId: string;
  requirementId: string;
  supplierProfileId: string;
  referenceCode: string;
  revision: number;
  status: RfqStatus;
  subject: string;
  messageBody: string;
  requestedFields: string[];
  requirementSnapshot: Record<string, any>;
  supplierSnapshot: Record<string, any>;
  supplierLegalName: string;
  buyerInstructions: string | null;
  responseDeadline: string;
  contentHash: string;
  submittedAt: string | null;
  delivery: {
    status: "not_sent";
    channel: null;
    deliveredAt: null;
    externalMessageId: null;
  };
  decision: RfqDecision | null;
  createdAt: string;
  updatedAt: string;
};

type RfqQueueResponse = {
  ok: boolean;
  items: RfqDraft[];
  eligiblePromotions: EligiblePromotion[];
  governance: {
    humanApprovalRequired: true;
    contentHashBound: true;
    externalSideEffect: false;
    deliveryCreated: false;
    supportedDeliveryChannels: [];
    separateDispatchRequired: true;
  };
};

type DispatchChannel = "email" | "whatsapp";
type ContactControl = {
  id: string;
  supplierProfileId: string;
  sourcePromotionId: string | null;
  channel: DispatchChannel;
  contactHash: string;
  contactMasked: string;
  state: "authorized" | "suppressed";
  authorizationBasis: string | null;
  evidenceReference: string | null;
  notes: string;
  authorizedAt: string | null;
  authorizationExpiresAt: string | null;
  suppressedAt: string | null;
  suppressionReason: string | null;
  updatedAt: string;
};
type RfqDispatch = {
  id: string;
  rfqDraftId: string;
  channel: DispatchChannel;
  contactAuthorizationBasis: string;
  contactEvidenceReference: string;
  contactAuthorizedAt: string;
  contactAuthorizationExpiresAt: string;
  contentHash: string;
  recipientHash: string;
  recipientMasked: string;
  status: "reserved" | "sending" | "accepted" | "failed" | "unknown";
  attemptCount: number;
  providerMessageId: string | null;
  providerStatus: string | null;
  errorMessage: string | null;
  attemptedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};
type ContactSuppression = {
  id: string;
  channel: DispatchChannel;
  contactHash: string;
  contactMasked: string;
  reason: string;
  sourceKind: "recipient_opt_out";
  sourceEmailMessageId: number | null;
  sourceCommunicationsMessageId: number | null;
  createdAt: string;
  updatedAt: string;
};
type DispatchGovernanceResponse = {
  ok: boolean;
  contactControls: ContactControl[];
  contactSuppressions: ContactSuppression[];
  dispatches: RfqDispatch[];
  governance: {
    verifiedContactIsNotPermission: true;
    explicitControlRequired: true;
    suppressionWins: true;
    oneDecisionOneDispatch: true;
    maximumProviderAttempts: 1;
    automaticRetry: false;
    acceptedIsNotDelivered: true;
    supportedChannels: readonly DispatchChannel[];
  };
};

type SupplierQuoteField = {
  state: "provided" | "missing" | "ambiguous";
  value: string | null;
  sourceLocator: string | null;
  evidenceExcerpt: string | null;
};
type SupplierQuoteValues = {
  supplierQuoteReference: string | null;
  productName: string | null;
  specification: string | null;
  offeredQuantity: string | null;
  unitOfMeasure: string | null;
  currencyCode: string | null;
  unitPrice: string | null;
  totalAmount: string | null;
  minimumOrderQuantity: string | null;
  packaging: string | null;
  leadTime: string | null;
  incoterm: string | null;
  paymentTerms: string | null;
  validity: string | null;
  countryOfOrigin: string | null;
  certifications: string | null;
  warranty: string | null;
  supplierNotes: string | null;
};
type CanonicalSupplierQuote = {
  id: string;
  referenceCode: string;
  status: "qualified" | "superseded" | "withdrawn" | "expired";
  quoteIntakeId: string;
  requirementId: string;
  supplierProfileId: string;
  values: SupplierQuoteValues;
  evidence: {
    projectionVersion: string;
    normalizationVersion: string;
    quoteHash: string;
    providedFields: string[];
    missingFields: string[];
    ambiguousFields: string[];
    inventedFields: false;
  };
  readiness: {
    comparison: { ready: boolean; blockers: string[] };
    offerPreparation: { ready: boolean; blockers: string[] };
  };
  qualified: { byUserId: number | null; at: string };
};
type SupplierQuoteIntake = {
  id: string;
  rfqDispatchId: string | null;
  rfqDraftId: string | null;
  requirementId: string | null;
  supplierProfileId: string | null;
  rfqReferenceCode: string | null;
  supplierLegalName: string | null;
  channel: DispatchChannel;
  source: {
    emailMessageId: number | null;
    communicationsMessageId: number | null;
    providerMessageId: string;
    agentKey: string;
    contactHash: string;
    contactMasked: string;
    receivedAt: string;
    attachments: Array<Record<string, any>>;
    rawMessageStoredInNativeInbox: true;
  };
  correlation: {
    status: "exact" | "inferred" | "ambiguous" | "unmatched";
    method: string;
    candidateDispatchIds: string[];
  };
  normalization: {
    version: string;
    fields: Record<string, SupplierQuoteField>;
    missingFields: string[];
    ambiguousFields: string[];
    quoteLikeSignals: string[];
    inventedFields: false;
  };
  optOut: {
    detected: boolean;
    suppressionRegistryId: string | null;
    suppressionAppliedAt: string | null;
    suppressedControlIds: string[];
  };
  review: {
    status: "needs_review" | "qualified" | "rejected";
    checklist: Record<string, boolean>;
    notes: string | null;
    reviewedAt: string | null;
  };
  canonicalQuote: CanonicalSupplierQuote | null;
  createdAt: string;
  updatedAt: string;
};
type SupplierQuoteComparison = {
  requirementId: string;
  intakeCount: number;
  qualifiedCount: number;
  comparisonReadyCount: number;
  offerPreparationReadyCount: number;
  currencies: string[];
  sameCurrency: boolean;
  rankingPerformed: false;
  warning: string;
  items: Array<{
    id: string;
    intakeId: string;
    referenceCode: string;
    supplierQuoteReference: string | null;
    supplierProfileId: string | null;
    supplierLegalName: string | null;
    rfqReferenceCode: string | null;
    productName: string | null;
    specification: string | null;
    offeredQuantity: string | null;
    unitOfMeasure: string | null;
    currencyCode: string | null;
    unitPrice: string | null;
    totalAmount: string | null;
    minimumOrderQuantity: string | null;
    packaging: string | null;
    leadTime: string | null;
    incoterm: string | null;
    paymentTerms: string | null;
    validity: string | null;
    countryOfOrigin: string | null;
    certifications: string | null;
    missingFields: string[];
    ambiguousFields: string[];
    comparisonReady: boolean;
    comparisonBlockers: string[];
    offerPreparationReady: boolean;
    offerPreparationBlockers: string[];
  }>;
};
type SupplierQuoteIntakesResponse = {
  ok: boolean;
  items: SupplierQuoteIntake[];
  supplierQuotes: CanonicalSupplierQuote[];
  comparisons: SupplierQuoteComparison[];
  governance: {
    deterministicNormalization: true;
    inventedFields: false;
    missingAndAmbiguousExplicit: true;
    humanQualificationRequired: true;
    canonicalSupplierQuoteRequired: true;
    comparisonsUseQualifiedCanonicalQuotes: true;
    ambiguousCorrelationQualifiable: false;
    automatedSupplierRanking: false;
    currencyConversionPerformed: false;
    customerOfferCreated: false;
    recipientOptOutSuppressesContact: true;
  };
};

type DraftForm = { responseDeadline: string; buyerInstructions: string };
type ApprovalKey =
  | "contentReviewed"
  | "recipientMatchesVerifiedContact"
  | "requirementStillCurrent"
  | "noUnsupportedCommercialClaims"
  | "buyerDataApprovedForDisclosure"
  | "separateDispatchRequired";
type ApprovalForm = {
  authorizationWindowHours: string;
  decisionNotes: string;
  checklist: Record<ApprovalKey, boolean>;
};
type ContactControlForm = {
  authorizationBasis:
    | "explicit_consent"
    | "existing_business_relationship"
    | "supplier_initiated_inquiry";
  evidenceReference: string;
  authorizationExpiresAt: string;
  notes: string;
  suppressionReason: string;
};
type DispatchChecklistKey =
  | "exactApprovedContent"
  | "recipientMatchesVerifiedPromotion"
  | "contactAuthorizationCurrent"
  | "suppressionRegistryChecked"
  | "singleRecipientOnly"
  | "noAutomaticRetry";
type DispatchForm = {
  dispatchNotes: string;
  checklist: Record<DispatchChecklistKey, boolean>;
};
type QuoteReviewChecklistKey =
  | "sourceMessageReviewed"
  | "correlationReviewed"
  | "noInventedFields"
  | "missingFieldsAcknowledged";
type QuoteReviewForm = {
  reviewNotes: string;
  checklist: Record<QuoteReviewChecklistKey, boolean>;
};

const APPROVAL_CHECKLIST: Array<{ key: ApprovalKey; label: string }> = [
  { key: "contentReviewed", label: "I reviewed the exact subject and message content" },
  { key: "recipientMatchesVerifiedContact", label: "The recipient matches the verified promotion contact" },
  { key: "requirementStillCurrent", label: "The requirement, quantity, and destination are still current" },
  { key: "noUnsupportedCommercialClaims", label: "The draft makes no unsupported price, capacity, or certification claim" },
  { key: "buyerDataApprovedForDisclosure", label: "The displayed buyer information is approved for disclosure" },
  { key: "separateDispatchRequired", label: "I understand approval does not send or schedule this RFQ" },
];

const DISPATCH_CHECKLIST: Array<{ key: DispatchChecklistKey; label: string }> = [
  { key: "exactApprovedContent", label: "The exact approved content hash is displayed and unchanged" },
  { key: "recipientMatchesVerifiedPromotion", label: "The recipient matches the human-verified promotion" },
  { key: "contactAuthorizationCurrent", label: "The exact contact and channel have current authorization" },
  { key: "suppressionRegistryChecked", label: "Suppression and email unsubscribe controls must pass at send time" },
  { key: "singleRecipientOnly", label: "This dispatch contains one supplier recipient only" },
  { key: "noAutomaticRetry", label: "I understand there is one provider attempt and no automatic retry" },
];

const QUOTE_REVIEW_CHECKLIST: Array<{
  key: QuoteReviewChecklistKey;
  label: string;
}> = [
  {
    key: "sourceMessageReviewed",
    label: "I reviewed the native source message and attachment metadata",
  },
  {
    key: "correlationReviewed",
    label: "I confirmed the RFQ correlation method and supplier identity",
  },
  {
    key: "noInventedFields",
    label: "I confirmed that every provided value has source evidence",
  },
  {
    key: "missingFieldsAcknowledged",
    label: "I acknowledge every field marked missing or ambiguous",
  },
];

const STATUS_LABELS: Record<RfqStatus, string> = {
  draft: "Draft",
  approval_pending: "Approval pending",
  approved_for_outreach: "Approved for outreach",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function defaultDeadline() {
  const value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function defaultApproval(): ApprovalForm {
  return {
    authorizationWindowHours: "24",
    decisionNotes: "",
    checklist: {
      contentReviewed: false,
      recipientMatchesVerifiedContact: false,
      requirementStillCurrent: false,
      noUnsupportedCommercialClaims: false,
      buyerDataApprovedForDisclosure: false,
      separateDispatchRequired: false,
    },
  };
}

function localDateTimeInDays(days: number) {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function defaultContactControl(): ContactControlForm {
  return {
    authorizationBasis: "explicit_consent",
    evidenceReference: "",
    authorizationExpiresAt: localDateTimeInDays(30),
    notes: "",
    suppressionReason: "",
  };
}

function defaultDispatch(): DispatchForm {
  return {
    dispatchNotes: "",
    checklist: {
      exactApprovedContent: false,
      recipientMatchesVerifiedPromotion: false,
      contactAuthorizationCurrent: false,
      suppressionRegistryChecked: false,
      singleRecipientOnly: false,
      noAutomaticRetry: false,
    },
  };
}

function defaultQuoteReview(): QuoteReviewForm {
  return {
    reviewNotes: "",
    checklist: {
      sourceMessageReviewed: false,
      correlationReviewed: false,
      noInventedFields: false,
      missingFieldsAcknowledged: false,
    },
  };
}

function channelForDraft(draft: RfqDraft): DispatchChannel | null {
  const contactType = String(draft.supplierSnapshot?.contactType || "").toLowerCase();
  if (contactType === "email") return "email";
  if (contactType === "phone") return "whatsapp";
  return null;
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Not recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function statusClass(status: RfqStatus) {
  if (status === "approved_for_outreach") {
    return "border-emerald-300 bg-emerald-100 text-emerald-950";
  }
  if (status === "approval_pending") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  if (status === "rejected" || status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-900";
  }
  return "border-sky-200 bg-sky-50 text-sky-950";
}

function Field({ label, children, hint }: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export default function AdminExportunitySupplierRfqsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RfqStatus | "all">("all");
  const [draftForms, setDraftForms] = useState<Record<string, DraftForm>>({});
  const [approvalForms, setApprovalForms] = useState<Record<string, ApprovalForm>>({});
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});
  const [contactControlForms, setContactControlForms] = useState<
    Record<string, ContactControlForm>
  >({});
  const [dispatchForms, setDispatchForms] = useState<Record<string, DispatchForm>>({});
  const [quoteReviewForms, setQuoteReviewForms] = useState<
    Record<string, QuoteReviewForm>
  >({});
  const queryPath =
    status === "all"
      ? "/api/exportunity/supplier-rfqs"
      : `/api/exportunity/supplier-rfqs?status=${status}`;
  const queueQuery = useQuery<RfqQueueResponse>({
    queryKey: [queryPath],
    staleTime: 10_000,
  });
  const governanceQuery = useQuery<DispatchGovernanceResponse>({
    queryKey: ["/api/exportunity/supplier-rfqs/dispatch-governance"],
    staleTime: 10_000,
  });
  const quoteIntakesQuery = useQuery<SupplierQuoteIntakesResponse>({
    queryKey: ["/api/exportunity/supplier-rfqs/quote-intakes"],
    staleTime: 10_000,
  });

  const invalidateQueue = () =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        String(query.queryKey[0] || "").startsWith(
          "/api/exportunity/supplier-rfqs",
        ),
    });

  const createMutation = useMutation({
    mutationFn: async (promotion: EligiblePromotion) => {
      const form = draftForms[promotion.promotionId] || {
        responseDeadline: defaultDeadline(),
        buyerInstructions: "",
      };
      const deadline = new Date(form.responseDeadline);
      if (Number.isNaN(deadline.valueOf())) throw new Error("Choose a valid response deadline.");
      return apiRequest("/api/exportunity/supplier-rfqs", "POST", {
        promotionId: promotion.promotionId,
        responseDeadline: deadline.toISOString(),
        buyerInstructions: form.buyerInstructions.trim() || undefined,
      });
    },
    onSuccess: () => {
      invalidateQueue();
      toast({
        title: "RFQ draft created",
        description: "The content is hash-bound and remains internal. Nothing was sent.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "RFQ draft was blocked",
        description: error?.message || "Review the requirement and supplier promotion.",
        variant: "destructive",
      }),
  });

  const submitMutation = useMutation({
    mutationFn: (draft: RfqDraft) =>
      apiRequest(`/api/exportunity/supplier-rfqs/${draft.id}/submit`, "POST", {}),
    onSuccess: () => {
      invalidateQueue();
      toast({
        title: "RFQ submitted for approval",
        description: "Its content hash is frozen. No outreach was created.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "RFQ submission was blocked",
        description: error?.message || "Reload and review the current requirement.",
        variant: "destructive",
      }),
  });

  const approveMutation = useMutation({
    mutationFn: async (draft: RfqDraft) => {
      const form = approvalForms[draft.id] || defaultApproval();
      if (!APPROVAL_CHECKLIST.every(({ key }) => form.checklist[key])) {
        throw new Error("Every approval attestation must be explicitly confirmed.");
      }
      return apiRequest(`/api/exportunity/supplier-rfqs/${draft.id}/approve`, "POST", {
        authorizationWindowHours: Number(form.authorizationWindowHours),
        decisionNotes: form.decisionNotes.trim(),
        checklist: form.checklist,
      });
    },
    onSuccess: () => {
      invalidateQueue();
      toast({
        title: "Time-limited outreach authorization recorded",
        description: "The exact content hash is approved, but no message or provider job was created.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "RFQ approval was blocked",
        description: error?.message || "Review every attestation and the current source data.",
        variant: "destructive",
      }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (draft: RfqDraft) => {
      const notes = String(rejectionNotes[draft.id] || "").trim();
      if (notes.length < 24) throw new Error("Record at least 24 characters of rejection rationale.");
      return apiRequest(`/api/exportunity/supplier-rfqs/${draft.id}/reject`, "POST", {
        decisionNotes: notes,
      });
    },
    onSuccess: () => {
      invalidateQueue();
      toast({ title: "RFQ revision rejected", description: "No outreach was authorized or created." });
    },
    onError: (error: any) =>
      toast({
        title: "RFQ rejection was not saved",
        description: error?.message || "Reload the queue and try again.",
        variant: "destructive",
      }),
  });

  const contactControlMutation = useMutation({
    mutationFn: async ({
      draft,
      state,
    }: {
      draft: RfqDraft;
      state: "authorized" | "suppressed";
    }) => {
      const channel = channelForDraft(draft);
      const contactValue = String(draft.supplierSnapshot?.contactValue || "").trim();
      if (!channel || !contactValue) {
        throw new Error("Only a verified email or phone promotion can be governed for dispatch.");
      }
      const form = contactControlForm(draft.id);
      const common = {
        supplierProfileId: draft.supplierProfileId,
        sourcePromotionId: draft.promotionId,
        channel,
        contactValue,
        state,
        notes: form.notes.trim(),
      };
      if (state === "suppressed") {
        return apiRequest(
          "/api/exportunity/supplier-rfqs/contact-controls",
          "POST",
          { ...common, suppressionReason: form.suppressionReason.trim() },
        );
      }
      const expiresAt = new Date(form.authorizationExpiresAt);
      if (Number.isNaN(expiresAt.valueOf())) {
        throw new Error("Choose a valid contact authorization expiry.");
      }
      return apiRequest(
        "/api/exportunity/supplier-rfqs/contact-controls",
        "POST",
        {
          ...common,
          authorizationBasis: form.authorizationBasis,
          evidenceReference: form.evidenceReference.trim(),
          authorizationExpiresAt: expiresAt.toISOString(),
        },
      );
    },
    onSuccess: (_data, variables) => {
      invalidateQueue();
      toast({
        title:
          variables.state === "authorized"
            ? "Exact contact authorized"
            : "Exact contact suppressed",
        description:
          variables.state === "authorized"
            ? "Permission is evidence-bound and time-limited; nothing was sent."
            : "Suppression now wins over any previous permission; nothing was sent.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Contact control was blocked",
        description: error?.message || "Review the permission evidence and exact contact.",
        variant: "destructive",
      }),
  });

  const dispatchMutation = useMutation({
    mutationFn: async (draft: RfqDraft) => {
      const channel = channelForDraft(draft);
      const control = contactControlForDraft(draft);
      const form = dispatchForm(draft.id);
      if (!channel) throw new Error("This promotion has no supported dispatch channel.");
      if (!control || control.state !== "authorized") {
        throw new Error("Authorize the exact verified contact before dispatch.");
      }
      if (!DISPATCH_CHECKLIST.every(({ key }) => form.checklist[key])) {
        throw new Error("Every one-time dispatch attestation must be explicitly confirmed.");
      }
      return apiRequest(
        `/api/exportunity/supplier-rfqs/${draft.id}/dispatch`,
        "POST",
        {
          channel,
          expectedContentHash: draft.contentHash,
          expectedRecipientHash: control.contactHash,
          dispatchNotes: form.dispatchNotes.trim(),
          checklist: form.checklist,
        },
      );
    },
    onSuccess: (data: any) => {
      invalidateQueue();
      toast({
        title: data?.created ? "Single provider attempt recorded" : "Duplicate send prevented",
        description: data?.created
          ? "Accepted by provider—not proof of delivery. No automatic retry is allowed."
          : "The existing dispatch ledger was returned; no second message was sent.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "RFQ dispatch was blocked or failed",
        description:
          error?.message || "No automatic retry will run. Review the immutable dispatch record.",
        variant: "destructive",
      }),
  });

  const quoteReviewMutation = useMutation({
    mutationFn: async ({
      intake,
      decision,
    }: {
      intake: SupplierQuoteIntake;
      decision: "qualified" | "rejected";
    }) => {
      const form = quoteReviewForm(intake.id);
      if (form.reviewNotes.trim().length < 24) {
        throw new Error("Record at least 24 characters of quote review rationale.");
      }
      if (
        decision === "qualified" &&
        !QUOTE_REVIEW_CHECKLIST.every(({ key }) => form.checklist[key])
      ) {
        throw new Error("Every quote qualification attestation must be confirmed.");
      }
      if (
        decision === "qualified" &&
        intake.correlation.status !== "exact" &&
        intake.correlation.status !== "inferred"
      ) {
        throw new Error(
          "Ambiguous or unmatched replies cannot be qualified until correlation is resolved.",
        );
      }
      return apiRequest(
        `/api/exportunity/supplier-rfqs/quote-intakes/${intake.id}/review`,
        "POST",
        {
          decision,
          reviewNotes: form.reviewNotes.trim(),
          checklist: form.checklist,
        },
      );
    },
    onSuccess: (_data, variables) => {
      invalidateQueue();
      toast({
        title:
          variables.decision === "qualified"
            ? "Supplier quote qualified"
            : "Supplier quote rejected",
        description:
          variables.decision === "qualified"
            ? "A canonical source-backed supplier quote is now available for comparison. No customer offer or order was created."
            : "The intake remains in the audit trail and is excluded from qualified comparison.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Quote review was blocked",
        description:
          error?.message || "Review the source, correlation, and missing fields.",
        variant: "destructive",
      }),
  });

  const counts = useMemo(() => {
    const values: Record<RfqStatus, number> = {
      draft: 0,
      approval_pending: 0,
      approved_for_outreach: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const item of queueQuery.data?.items || []) values[item.status] += 1;
    return values;
  }, [queueQuery.data?.items]);

  function draftForm(promotionId: string) {
    return draftForms[promotionId] || {
      responseDeadline: defaultDeadline(),
      buyerInstructions: "",
    };
  }

  function updateDraftForm(promotionId: string, update: Partial<DraftForm>) {
    setDraftForms((current) => {
      const previous = current[promotionId] || {
        responseDeadline: defaultDeadline(),
        buyerInstructions: "",
      };
      return {
        ...current,
        [promotionId]: { ...previous, ...update },
      };
    });
  }

  function updateApproval(draftId: string, update: Partial<ApprovalForm>) {
    setApprovalForms((current) => {
      const previous = current[draftId] || defaultApproval();
      return {
        ...current,
        [draftId]: {
          ...previous,
          ...update,
          checklist: update.checklist
            ? { ...previous.checklist, ...update.checklist }
            : previous.checklist,
        },
      };
    });
  }

  function contactControlForm(draftId: string) {
    return contactControlForms[draftId] || defaultContactControl();
  }

  function updateContactControl(
    draftId: string,
    update: Partial<ContactControlForm>,
  ) {
    setContactControlForms((current) => ({
      ...current,
      [draftId]: { ...(current[draftId] || defaultContactControl()), ...update },
    }));
  }

  function dispatchForm(draftId: string) {
    return dispatchForms[draftId] || defaultDispatch();
  }

  function updateDispatch(draftId: string, update: Partial<DispatchForm>) {
    setDispatchForms((current) => {
      const previous = current[draftId] || defaultDispatch();
      return {
        ...current,
        [draftId]: {
          ...previous,
          ...update,
          checklist: update.checklist
            ? { ...previous.checklist, ...update.checklist }
            : previous.checklist,
        },
      };
    });
  }

  function quoteReviewForm(quoteIntakeId: string) {
    return quoteReviewForms[quoteIntakeId] || defaultQuoteReview();
  }

  function updateQuoteReview(
    quoteIntakeId: string,
    update: Partial<QuoteReviewForm>,
  ) {
    setQuoteReviewForms((current) => {
      const previous = current[quoteIntakeId] || defaultQuoteReview();
      return {
        ...current,
        [quoteIntakeId]: {
          ...previous,
          ...update,
          checklist: update.checklist
            ? { ...previous.checklist, ...update.checklist }
            : previous.checklist,
        },
      };
    });
  }

  function contactControlForDraft(draft: RfqDraft) {
    const channel = channelForDraft(draft);
    if (!channel) return null;
    return (
      governanceQuery.data?.contactControls.find(
        (control) =>
          control.supplierProfileId === draft.supplierProfileId &&
          control.sourcePromotionId === draft.promotionId &&
          control.channel === channel,
      ) || null
    );
  }

  function dispatchForDraft(draftId: string) {
    return (
      governanceQuery.data?.dispatches.find(
        (dispatch) => dispatch.rfqDraftId === draftId,
      ) || null
    );
  }

  const statuses: Array<RfqStatus | "all"> = [
    "all",
    "draft",
    "approval_pending",
    "approved_for_outreach",
    "rejected",
  ];

  return (
    <div className="min-h-screen bg-[#f5f6f3] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,.08)]">
          <div className="border-b border-slate-200 bg-[linear-gradient(120deg,#0f2f26,#174c3a)] p-6 text-white md:p-8">
            <a
              href="/admin/exportunity/supplier-discovery"
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Supplier discovery
            </a>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.28em] text-[#f5ba4d]">
                  Exportunity governed sourcing
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
                  Supplier RFQ approvals
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-50/85">
                  Draft from verified private supplier promotions, freeze exact content,
                  record a human decision, then use a separate permission-controlled
                  dispatch. Verified contact data alone never grants permission.
                </p>
              </div>
              <Button
                variant="outline"
                className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() =>
                  void Promise.all([queueQuery.refetch(), governanceQuery.refetch()])
                }
                disabled={queueQuery.isFetching || governanceQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${queueQuery.isFetching || governanceQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-3 md:p-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 font-black text-emerald-950">
                <ShieldCheck className="h-5 w-5" /> Promotion required
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-900/80">
                Only an active, verified, Exportunity-internal supplier with promotion provenance is eligible.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-center gap-2 font-black text-sky-950">
                <FileCheck2 className="h-5 w-5" /> Exact content hash
              </div>
              <p className="mt-2 text-sm leading-6 text-sky-900/80">
                Requirement changes or contact changes invalidate the draft before approval.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 font-black text-amber-950">
                <SendHorizontal className="h-5 w-5" /> Separate one-time dispatch
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-900/80">
                Approval never sends. A second admin action checks consent and suppression, then permits one provider attempt with no automatic retry.
              </p>
              <div className="mt-2 text-xs font-bold text-amber-950">
                {governanceQuery.data?.contactSuppressions.length || 0} tenant-wide recipient opt-out{governanceQuery.data?.contactSuppressions.length === 1 ? "" : "s"} enforced
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Eligible promoted suppliers</h2>
              <p className="mt-1 text-sm text-slate-600">
                A complete quantity and delivery country are required. Draft creation makes no external call.
              </p>
            </div>
            <Badge className="bg-slate-900 text-white">
              {queueQuery.data?.eligiblePromotions.length || 0} promoted
            </Badge>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {(queueQuery.data?.eligiblePromotions || []).map((promotion) => {
              const form = draftForm(promotion.promotionId);
              return (
                <article key={promotion.promotionId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">
                        {promotion.requirementReferenceCode}
                      </div>
                      <h3 className="mt-1 text-lg font-black">{promotion.supplierLegalName}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {promotion.productName || promotion.requirementTitle}
                      </p>
                    </div>
                    <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-900">
                      Verified private profile
                    </Badge>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="font-bold text-slate-500">Quantity</dt><dd>{promotion.quantityText || "Missing"}</dd></div>
                    <div>
                      <dt className="font-bold text-slate-500">Destination</dt>
                      <dd>
                        {promotion.destination ||
                          [promotion.deliveryCity, promotion.deliveryCountryCode]
                            .filter(Boolean)
                            .join(", ") ||
                          "Missing"}
                      </dd>
                    </div>
                    <div><dt className="font-bold text-slate-500">Specification</dt><dd>{promotion.specification || "Not captured"}</dd></div>
                    <div>
                      <dt className="font-bold text-slate-500">Requirement source</dt>
                      <dd>
                        {promotion.productRequirementSource === "canonical_product_requirement"
                          ? "Canonical Product Requirement"
                          : "Historical requirement"}
                      </dd>
                    </div>
                    <div><dt className="font-bold text-slate-500">Confirmed contact</dt><dd>{promotion.confirmedContact.type}: {promotion.confirmedContact.value}</dd></div>
                    <div><dt className="font-bold text-slate-500">Latest RFQ</dt><dd>{promotion.latestRfqStatus ? STATUS_LABELS[promotion.latestRfqStatus] : "None"}</dd></div>
                  </dl>
                  {promotion.canCreateDraft ? (
                    <div className="mt-4 grid gap-3">
                      <Field label="Response deadline">
                        <input
                          className={inputClass}
                          type="datetime-local"
                          value={form.responseDeadline}
                          onChange={(event) => updateDraftForm(promotion.promotionId, { responseDeadline: event.target.value })}
                        />
                      </Field>
                      <Field label="Buyer instructions" hint="Optional; do not add invented commercial terms.">
                        <textarea
                          className={`${inputClass} min-h-20`}
                          value={form.buyerInstructions}
                          maxLength={1000}
                          onChange={(event) => updateDraftForm(promotion.promotionId, { buyerInstructions: event.target.value })}
                          placeholder="Packaging, standards, or response format requested by the buyer"
                        />
                      </Field>
                      <Button
                        className="bg-emerald-800 font-black text-white hover:bg-emerald-900"
                        disabled={createMutation.isPending}
                        onClick={() => createMutation.mutate(promotion)}
                      >
                        {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                        Create internal draft
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      Resolve the current RFQ revision before creating another.
                    </p>
                  )}
                </article>
              );
            })}
            {!queueQuery.isLoading && !(queueQuery.data?.eligiblePromotions.length || 0) ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 lg:col-span-2">
                No governed supplier promotions are eligible for RFQ drafting yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">RFQ decision queue</h2>
              <p className="mt-1 text-sm text-slate-600">Approval remains internal; dispatch and provider acceptance are tracked separately from delivery.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {statuses.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStatus(item)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black ${status === item ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                >
                  {item === "all" ? "All" : STATUS_LABELS[item]}
                  {item !== "all" ? ` ${counts[item]}` : ""}
                </button>
              ))}
            </div>
          </div>

          {queueQuery.isLoading ? (
            <div className="grid min-h-40 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-700" /></div>
          ) : queueQuery.isError ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              The RFQ queue could not be loaded. Confirm the Exportunity staff session and retry.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {(queueQuery.data?.items || []).map((draft) => {
                const approval = approvalForms[draft.id] || defaultApproval();
                const channel = channelForDraft(draft);
                const contactControl = contactControlForDraft(draft);
                const contactState = contactControlForm(draft.id);
                const dispatchState = dispatchForm(draft.id);
                const rfqDispatch = dispatchForDraft(draft.id);
                const contactAuthorizationCurrent = Boolean(
                  contactControl?.state === "authorized" &&
                    contactControl.authorizationExpiresAt &&
                    new Date(contactControl.authorizationExpiresAt).getTime() > Date.now(),
                );
                return (
                  <article key={draft.id} className="rounded-2xl border border-slate-200 p-4 md:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                          {draft.referenceCode} • revision {draft.revision}
                        </div>
                        <h3 className="mt-1 text-lg font-black">{draft.supplierLegalName}</h3>
                        <p className="mt-1 text-sm text-slate-600">{draft.subject}</p>
                      </div>
                      <Badge className={statusClass(draft.status)}>{STATUS_LABELS[draft.status]}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 p-3 text-sm"><div className="font-bold text-slate-500">Response deadline</div>{formatDate(draft.responseDeadline)}</div>
                      <div className="rounded-xl bg-slate-50 p-3 text-sm"><div className="font-bold text-slate-500">Content hash</div><span className="font-mono text-xs">{draft.contentHash.slice(0, 20)}…</span></div>
                      <div className="rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="font-bold text-slate-500">Dispatch / delivery</div>
                        {rfqDispatch
                          ? `${rfqDispatch.status} via ${rfqDispatch.channel} • delivery unconfirmed`
                          : "No dispatch • delivery not sent"}
                      </div>
                    </div>
                    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <summary className="cursor-pointer text-sm font-black">Review exact RFQ content</summary>
                      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-700">{draft.messageBody}</pre>
                    </details>

                    {draft.status === "draft" ? (
                      <div className="mt-4 flex justify-end">
                        <Button
                          className="bg-sky-800 font-black text-white hover:bg-sky-900"
                          disabled={submitMutation.isPending}
                          onClick={() => submitMutation.mutate(draft)}
                        >
                          {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}
                          Freeze and submit for approval
                        </Button>
                      </div>
                    ) : null}

                    {draft.status === "approval_pending" ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <h4 className="font-black text-amber-950">Human outreach decision</h4>
                        <p className="mt-1 text-sm text-amber-900/80">
                          Approval is bound to this hash and expires. It still does not dispatch.
                        </p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <Field label="Authorization hours" hint="1–168 hours; capped at the RFQ response deadline.">
                            <input
                              className={inputClass}
                              type="number"
                              min={1}
                              max={168}
                              value={approval.authorizationWindowHours}
                              onChange={(event) => updateApproval(draft.id, { authorizationWindowHours: event.target.value })}
                            />
                          </Field>
                          <Field label="Decision notes">
                            <textarea
                              className={`${inputClass} min-h-24`}
                              value={approval.decisionNotes}
                              maxLength={2000}
                              onChange={(event) => updateApproval(draft.id, { decisionNotes: event.target.value })}
                              placeholder="Record why this exact RFQ and contact are appropriate"
                            />
                          </Field>
                        </div>
                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          {APPROVAL_CHECKLIST.map(({ key, label }) => (
                            <label key={key} className="flex gap-2 rounded-xl border border-amber-200 bg-white p-3 text-sm">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-emerald-700"
                                checked={approval.checklist[key]}
                                onChange={(event) => updateApproval(draft.id, { checklist: { ...approval.checklist, [key]: event.target.checked } })}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                        <Field label="Rejection rationale">
                          <textarea
                            className={`${inputClass} mt-3 min-h-20`}
                            value={rejectionNotes[draft.id] || ""}
                            maxLength={2000}
                            onChange={(event) => setRejectionNotes((current) => ({ ...current, [draft.id]: event.target.value }))}
                            placeholder="Required only when rejecting; minimum 24 characters"
                          />
                        </Field>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            className="border-red-300 text-red-800 hover:bg-red-50"
                            disabled={rejectMutation.isPending}
                            onClick={() => rejectMutation.mutate(draft)}
                          >
                            <XCircle className="mr-2 h-4 w-4" /> Reject revision
                          </Button>
                          <Button
                            className="bg-emerald-800 font-black text-white hover:bg-emerald-900"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(draft)}
                          >
                            {approveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Approve exact hash
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {draft.decision ? (
                      <div className={`mt-4 rounded-xl border p-3 text-sm ${draft.decision.decision === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-900"}`}>
                        <div className="font-black">
                          {draft.decision.decision === "approved" ? "Outreach authorization recorded" : "RFQ rejected"}
                        </div>
                        <p className="mt-1">{draft.decision.decisionNotes}</p>
                        {draft.decision.authorizationExpiresAt ? <p className="mt-1">Authorization expires {formatDate(draft.decision.authorizationExpiresAt)}.</p> : null}
                        <p className="mt-1 font-bold">
                          Dispatch created: {draft.decision.dispatchCreated ? "yes" : "no"}.
                        </p>
                      </div>
                    ) : null}

                    {draft.decision?.decision === "approved" ? (
                      <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="font-black text-indigo-950">
                              Permission control and one-time dispatch
                            </h4>
                            <p className="mt-1 text-sm leading-6 text-indigo-900/80">
                              Verified contact is not permission. The exact {channel || "unsupported"} contact must be authorized and unsuppressed before the approved revision can consume one provider attempt.
                            </p>
                          </div>
                          <Badge className="border border-indigo-200 bg-white text-indigo-900">
                            No automatic retry
                          </Badge>
                        </div>

                        {governanceQuery.isError ? (
                          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                            Dispatch governance could not be loaded. Do not dispatch until it is refreshed.
                          </div>
                        ) : null}

                        <div className="mt-4 grid gap-4 xl:grid-cols-2">
                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <h5 className="font-black">1. Exact contact control</h5>
                              <Badge
                                className={
                                  contactAuthorizationCurrent
                                    ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                                    : contactControl?.state === "suppressed"
                                      ? "border border-red-200 bg-red-50 text-red-900"
                                      : "border border-slate-200 bg-slate-50 text-slate-700"
                                }
                              >
                                {contactAuthorizationCurrent
                                  ? "Authorized"
                                  : contactControl?.state === "suppressed"
                                    ? "Suppressed"
                                    : contactControl?.state === "authorized"
                                      ? "Authorization expired"
                                      : "No permission recorded"}
                              </Badge>
                            </div>
                            {contactControl ? (
                              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                                <div>{contactControl.contactMasked} • {contactControl.channel}</div>
                                <div className="font-mono">hash {contactControl.contactHash.slice(0, 18)}…</div>
                                {contactControl.authorizationExpiresAt ? (
                                  <div>Permission expires {formatDate(contactControl.authorizationExpiresAt)}</div>
                                ) : null}
                                {contactControl.suppressionReason ? (
                                  <div>Suppression: {contactControl.suppressionReason}</div>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="mt-3 grid gap-3">
                              <Field label="Permission basis">
                                <select
                                  className={inputClass}
                                  value={contactState.authorizationBasis}
                                  onChange={(event) =>
                                    updateContactControl(draft.id, {
                                      authorizationBasis: event.target.value as ContactControlForm["authorizationBasis"],
                                    })
                                  }
                                >
                                  <option value="explicit_consent">Explicit consent</option>
                                  <option value="existing_business_relationship">Existing business relationship</option>
                                  <option value="supplier_initiated_inquiry">Supplier-initiated inquiry</option>
                                </select>
                              </Field>
                              <Field label="Permission evidence" hint="Consent record, contract, or traceable inquiry reference.">
                                <input
                                  className={inputClass}
                                  value={contactState.evidenceReference}
                                  maxLength={500}
                                  onChange={(event) => updateContactControl(draft.id, { evidenceReference: event.target.value })}
                                  placeholder="Evidence URL, CRM record, or signed consent reference"
                                />
                              </Field>
                              <Field label="Permission expiry" hint="Between 1 hour and 90 days from now.">
                                <input
                                  className={inputClass}
                                  type="datetime-local"
                                  value={contactState.authorizationExpiresAt}
                                  onChange={(event) => updateContactControl(draft.id, { authorizationExpiresAt: event.target.value })}
                                />
                              </Field>
                              <Field label="Governance notes" hint="Minimum 24 characters; no raw secrets.">
                                <textarea
                                  className={`${inputClass} min-h-20`}
                                  value={contactState.notes}
                                  maxLength={1000}
                                  onChange={(event) => updateContactControl(draft.id, { notes: event.target.value })}
                                  placeholder="Record the reviewer, scope, and reason for this contact decision"
                                />
                              </Field>
                              <Field label="Suppression reason" hint="Required only when suppressing this contact.">
                                <textarea
                                  className={`${inputClass} min-h-16`}
                                  value={contactState.suppressionReason}
                                  maxLength={1000}
                                  onChange={(event) => updateContactControl(draft.id, { suppressionReason: event.target.value })}
                                  placeholder="Opt-out, revoked consent, complaint, or do-not-contact reason"
                                />
                              </Field>
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                  variant="outline"
                                  className="border-red-300 text-red-800 hover:bg-red-50"
                                  disabled={!channel || contactControlMutation.isPending}
                                  onClick={() => contactControlMutation.mutate({ draft, state: "suppressed" })}
                                >
                                  <Ban className="mr-2 h-4 w-4" /> Suppress exact contact
                                </Button>
                                <Button
                                  className="bg-indigo-800 font-black text-white hover:bg-indigo-900"
                                  disabled={!channel || contactControlMutation.isPending}
                                  onClick={() => contactControlMutation.mutate({ draft, state: "authorized" })}
                                >
                                  {contactControlMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                  Authorize exact contact
                                </Button>
                              </div>
                            </div>
                          </section>

                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <h5 className="font-black">2. Consume dispatch once</h5>
                              <Badge className="border border-amber-200 bg-amber-50 text-amber-900">
                                Maximum attempts: 1
                              </Badge>
                            </div>
                            {rfqDispatch ? (
                              <div className={`mt-3 rounded-xl border p-3 text-sm ${rfqDispatch.status === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : rfqDispatch.status === "failed" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
                                <div className="font-black">
                                  {rfqDispatch.status === "accepted"
                                    ? "Accepted by provider—not proof of delivery"
                                    : `Dispatch ${rfqDispatch.status}`}
                                </div>
                                <div className="mt-1">Attempt count: {rfqDispatch.attemptCount} of 1</div>
                                <div>Provider status: {rfqDispatch.providerStatus || "not recorded"}</div>
                                <div>Permission basis: {rfqDispatch.contactAuthorizationBasis.replace(/_/g, " ")}</div>
                                <div>Permission evidence: {rfqDispatch.contactEvidenceReference}</div>
                                <div>Permission snapshot expires {formatDate(rfqDispatch.contactAuthorizationExpiresAt)}</div>
                                {rfqDispatch.errorMessage ? <div className="mt-1">{rfqDispatch.errorMessage}</div> : null}
                                <div className="mt-1 font-bold">No automatic retry will run.</div>
                              </div>
                            ) : (
                              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                                No provider attempt exists. Dispatch remains blocked until the exact contact permission is current and every attestation is checked.
                              </p>
                            )}
                            <div className="mt-3 grid gap-3">
                              <Field label="Dispatch rationale" hint="Minimum 24 characters; this is bound to the immutable ledger.">
                                <textarea
                                  className={`${inputClass} min-h-20`}
                                  value={dispatchState.dispatchNotes}
                                  maxLength={1000}
                                  onChange={(event) => updateDispatch(draft.id, { dispatchNotes: event.target.value })}
                                  placeholder="Explain why this exact approved RFQ should be sent now"
                                />
                              </Field>
                              <div className="grid gap-2">
                                {DISPATCH_CHECKLIST.map(({ key, label }) => (
                                  <label key={key} className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 accent-indigo-700"
                                      checked={dispatchState.checklist[key]}
                                      disabled={Boolean(rfqDispatch)}
                                      onChange={(event) => updateDispatch(draft.id, { checklist: { ...dispatchState.checklist, [key]: event.target.checked } })}
                                    />
                                    <span>{label}</span>
                                  </label>
                                ))}
                              </div>
                              <Button
                                className="bg-slate-950 font-black text-white hover:bg-slate-800"
                                disabled={
                                  dispatchMutation.isPending ||
                                  !channel ||
                                  !contactAuthorizationCurrent ||
                                  Boolean(rfqDispatch) ||
                                  Boolean(draft.decision.dispatchCreated)
                                }
                                onClick={() => dispatchMutation.mutate(draft)}
                              >
                                {dispatchMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizontal className="mr-2 h-4 w-4" />}
                                Dispatch once via {channel || "unsupported channel"}
                              </Button>
                              <p className="text-xs leading-5 text-slate-500">
                                One approved revision, one hashed recipient, one provider attempt. Provider acceptance does not establish delivery or a supplier reply.
                              </p>
                            </div>
                          </section>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!(queueQuery.data?.items.length || 0) ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
                  No RFQ revisions match this filter.
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-800">
                <Inbox className="h-5 w-5" />
                <span className="text-xs font-black uppercase tracking-[0.14em]">
                  Native reply intake
                </span>
              </div>
              <h2 className="mt-2 text-xl font-black">
                Supplier quote intake, ledger, and comparison
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                Email and WhatsApp replies remain in their native inboxes. This ledger stores source pointers,
                deterministic field evidence, and explicit missing or ambiguous values. Human qualification
                promotes one canonical supplier quote before it can appear in comparison.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-900">
                No invented fields
              </Badge>
              <Badge className="border border-slate-200 bg-slate-50 text-slate-800">
                No automated ranking
              </Badge>
            </div>
          </div>

          {quoteIntakesQuery.isLoading ? (
            <div className="grid min-h-36 place-items-center">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-700" />
            </div>
          ) : quoteIntakesQuery.isError ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              Supplier quote intake could not be loaded. No source or review state was changed.
            </div>
          ) : (
            <>
              {(quoteIntakesQuery.data?.comparisons || []).some(
                (comparison) => comparison.qualifiedCount > 0,
              ) ? (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Scale className="h-5 w-5 text-indigo-700" />
                    <h3 className="font-black">Qualified comparison sets</h3>
                  </div>
                  {(quoteIntakesQuery.data?.comparisons || [])
                    .filter((comparison) => comparison.qualifiedCount > 0)
                    .map((comparison) => (
                      <article
                        key={comparison.requirementId}
                        className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-black uppercase tracking-[0.12em] text-indigo-700">
                              Requirement {comparison.requirementId.slice(0, 12)}…
                            </div>
                            <div className="mt-1 text-sm text-indigo-950">
                              {comparison.qualifiedCount} canonical of {comparison.intakeCount} captured •{" "}
                              {comparison.comparisonReadyCount} comparison-ready •{" "}
                              {comparison.offerPreparationReadyCount} offer-preparation-ready
                            </div>
                          </div>
                          <Badge
                            className={
                              comparison.sameCurrency
                                ? "border border-emerald-200 bg-white text-emerald-900"
                                : "border border-amber-200 bg-amber-50 text-amber-950"
                            }
                          >
                            {comparison.currencies.length
                              ? comparison.currencies.join(", ")
                              : "Currency missing"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-indigo-900/80">
                          {comparison.warning}
                        </p>
                        <div className="mt-3 overflow-x-auto">
                          <table className="min-w-full text-left text-xs">
                            <thead className="text-indigo-900">
                              <tr>
                                <th className="px-2 py-2">Supplier</th>
                                <th className="px-2 py-2">Product / specification</th>
                                <th className="px-2 py-2">Offered quantity</th>
                                <th className="px-2 py-2">Unit price</th>
                                <th className="px-2 py-2">Total</th>
                                <th className="px-2 py-2">MOQ</th>
                                <th className="px-2 py-2">Packaging</th>
                                <th className="px-2 py-2">Lead time</th>
                                <th className="px-2 py-2">Incoterm</th>
                                <th className="px-2 py-2">Origin</th>
                                <th className="px-2 py-2">Certifications</th>
                                <th className="px-2 py-2">Readiness</th>
                              </tr>
                            </thead>
                            <tbody>
                              {comparison.items.map((item) => (
                                <tr key={item.id} className="border-t border-indigo-100 bg-white/70">
                                  <td className="px-2 py-2 font-bold">
                                    <div>{item.supplierLegalName || "Unresolved supplier"}</div>
                                    <div className="mt-1 font-mono text-[10px] font-normal text-slate-500">
                                      {item.referenceCode}
                                    </div>
                                  </td>
                                  <td className="px-2 py-2">
                                    <div className="font-bold">{item.productName || "Missing"}</div>
                                    <div className="text-slate-500">{item.specification || "Specification missing"}</div>
                                  </td>
                                  <td className="px-2 py-2">
                                    {[item.offeredQuantity || "Missing", item.unitOfMeasure].filter(Boolean).join(" ")}
                                  </td>
                                  <td className="px-2 py-2">{item.unitPrice || "Missing"}</td>
                                  <td className="px-2 py-2">{item.totalAmount || "Missing"}</td>
                                  <td className="px-2 py-2">{item.minimumOrderQuantity || "Missing"}</td>
                                  <td className="px-2 py-2">{item.packaging || "Missing"}</td>
                                  <td className="px-2 py-2">{item.leadTime || "Missing"}</td>
                                  <td className="px-2 py-2">{item.incoterm || "Missing"}</td>
                                  <td className="px-2 py-2">{item.countryOfOrigin || "Missing"}</td>
                                  <td className="px-2 py-2">{item.certifications || "Missing"}</td>
                                  <td className="min-w-48 px-2 py-2">
                                    <div className="flex flex-wrap gap-1">
                                      <Badge
                                        className={
                                          item.comparisonReady
                                            ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                                            : "border border-amber-200 bg-amber-50 text-amber-950"
                                        }
                                      >
                                        {item.comparisonReady ? "comparison ready" : "comparison blocked"}
                                      </Badge>
                                      <Badge
                                        className={
                                          item.offerPreparationReady
                                            ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                                            : "border border-slate-200 bg-slate-50 text-slate-800"
                                        }
                                      >
                                        {item.offerPreparationReady ? "offer prep ready" : "offer prep blocked"}
                                      </Badge>
                                    </div>
                                    {!item.offerPreparationReady ? (
                                      <div className="mt-1 text-[10px] leading-4 text-slate-500">
                                        {item.offerPreparationBlockers.join(", ")}
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </article>
                    ))}
                </div>
              ) : null}

              <div className="mt-5 space-y-4">
                {(quoteIntakesQuery.data?.items || []).map((intake) => {
                  const form = quoteReviewForm(intake.id);
                  const correlationResolved =
                    intake.correlation.status === "exact" ||
                    intake.correlation.status === "inferred";
                  return (
                    <article
                      key={intake.id}
                      className="rounded-2xl border border-slate-200 p-4 md:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                            {intake.rfqReferenceCode || "Unresolved RFQ"} • {intake.channel}
                          </div>
                          <h3 className="mt-1 text-lg font-black">
                            {intake.supplierLegalName || "Supplier correlation required"}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {intake.source.contactMasked} • received {formatDate(intake.source.receivedAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            className={
                              correlationResolved
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                                : "border border-amber-200 bg-amber-50 text-amber-950"
                            }
                          >
                            {intake.correlation.status} correlation
                          </Badge>
                          <Badge
                            className={
                              intake.review.status === "qualified"
                                ? "border border-indigo-200 bg-indigo-50 text-indigo-900"
                                : intake.review.status === "rejected"
                                  ? "border border-red-200 bg-red-50 text-red-900"
                                  : "border border-slate-200 bg-slate-50 text-slate-800"
                            }
                          >
                            {intake.review.status.replace(/_/g, " ")}
                          </Badge>
                          {intake.canonicalQuote ? (
                            <Badge className="border border-indigo-200 bg-indigo-50 text-indigo-900">
                              canonical quote
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      {!correlationResolved ? (
                        <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            {intake.correlation.status === "ambiguous"
                              ? `${intake.correlation.candidateDispatchIds.length} candidate dispatches remain. Qualification is blocked.`
                              : "No governed RFQ dispatch matched this reply. Qualification is blocked."}
                          </span>
                        </div>
                      ) : null}

                      {intake.canonicalQuote ? (
                        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm text-indigo-950">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-black">{intake.canonicalQuote.referenceCode}</div>
                              <div className="mt-1 text-xs text-indigo-900/75">
                                Source-backed hash {intake.canonicalQuote.evidence.quoteHash.slice(0, 12)}… • promoted{" "}
                                {formatDate(intake.canonicalQuote.qualified.at)}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Badge
                                className={
                                  intake.canonicalQuote.readiness.comparison.ready
                                    ? "border border-emerald-200 bg-white text-emerald-900"
                                    : "border border-amber-200 bg-amber-50 text-amber-950"
                                }
                              >
                                {intake.canonicalQuote.readiness.comparison.ready
                                  ? "comparison ready"
                                  : "comparison blocked"}
                              </Badge>
                              <Badge
                                className={
                                  intake.canonicalQuote.readiness.offerPreparation.ready
                                    ? "border border-emerald-200 bg-white text-emerald-900"
                                    : "border border-slate-200 bg-white text-slate-700"
                                }
                              >
                                {intake.canonicalQuote.readiness.offerPreparation.ready
                                  ? "offer prep ready"
                                  : "offer prep blocked"}
                              </Badge>
                            </div>
                          </div>
                          {!intake.canonicalQuote.readiness.offerPreparation.ready ? (
                            <div className="mt-2 text-xs leading-5 text-indigo-900/75">
                              Remaining evidence: {intake.canonicalQuote.readiness.offerPreparation.blockers.join(", ")}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {intake.optOut.detected ? (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                          <div className="font-black">Recipient opt-out detected</div>
                          <p className="mt-1">
                            Generic auto-reply was suppressed. Matching contact controls and the email suppression
                            registry were updated where applicable.
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {Object.entries(intake.normalization.fields).map(([key, field]) => (
                          <div
                            key={key}
                            className={`rounded-xl border p-3 text-sm ${
                              field.state === "provided"
                                ? "border-emerald-200 bg-emerald-50/50"
                                : field.state === "ambiguous"
                                  ? "border-amber-200 bg-amber-50"
                                  : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <div className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                              {key.replace(/([A-Z])/g, " $1")}
                            </div>
                            <div className="mt-1 font-bold">
                              {field.state === "provided" ? field.value : field.state}
                            </div>
                            {field.evidenceExcerpt ? (
                              <div className="mt-1 text-xs leading-5 text-slate-600">
                                {field.sourceLocator}: {field.evidenceExcerpt}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                          <div className="font-black">Missing fields</div>
                          <div>{intake.normalization.missingFields.join(", ") || "None"}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                          <div className="font-black">Ambiguous fields</div>
                          <div>{intake.normalization.ambiguousFields.join(", ") || "None"}</div>
                        </div>
                      </div>

                      {intake.source.attachments.length ? (
                        <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <summary className="cursor-pointer text-sm font-black">
                            {intake.source.attachments.length} source attachment record(s)
                          </summary>
                          <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
                            {JSON.stringify(intake.source.attachments, null, 2)}
                          </pre>
                        </details>
                      ) : null}

                      {intake.review.status === "needs_review" ? (
                        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                          <h4 className="font-black text-indigo-950">Human quote qualification</h4>
                          <p className="mt-1 text-sm text-indigo-900/80">
                            Review the native inbox source before deciding. Qualification creates one canonical
                            supplier quote; it creates no customer offer, order, payment, message, or ranking.
                          </p>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {QUOTE_REVIEW_CHECKLIST.map(({ key, label }) => (
                              <label key={key} className="flex gap-2 rounded-xl border border-indigo-100 bg-white p-3 text-sm">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 accent-indigo-700"
                                  checked={form.checklist[key]}
                                  onChange={(event) =>
                                    updateQuoteReview(intake.id, {
                                      checklist: {
                                        ...form.checklist,
                                        [key]: event.target.checked,
                                      },
                                    })
                                  }
                                />
                                <span>{label}</span>
                              </label>
                            ))}
                          </div>
                          <Field label="Review rationale" hint="Minimum 24 characters; preserved in the audit trail.">
                            <textarea
                              className={`${inputClass} mt-3 min-h-20`}
                              value={form.reviewNotes}
                              maxLength={2000}
                              onChange={(event) =>
                                updateQuoteReview(intake.id, {
                                  reviewNotes: event.target.value,
                                })
                              }
                              placeholder="Explain the source review, correlation, and qualification decision"
                            />
                          </Field>
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <Button
                              variant="outline"
                              className="border-red-300 text-red-800 hover:bg-red-50"
                              disabled={quoteReviewMutation.isPending}
                              onClick={() =>
                                quoteReviewMutation.mutate({
                                  intake,
                                  decision: "rejected",
                                })
                              }
                            >
                              <XCircle className="mr-2 h-4 w-4" /> Reject intake
                            </Button>
                            <Button
                              className="bg-indigo-800 font-black text-white hover:bg-indigo-900"
                              disabled={
                                quoteReviewMutation.isPending || !correlationResolved
                              }
                              onClick={() =>
                                quoteReviewMutation.mutate({
                                  intake,
                                  decision: "qualified",
                                })
                              }
                            >
                              {quoteReviewMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <FileCheck2 className="mr-2 h-4 w-4" />
                              )}
                              Qualify source-backed quote
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                          <div className="font-black">
                            Review {intake.review.status.replace(/_/g, " ")}
                          </div>
                          <p className="mt-1">{intake.review.notes}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Recorded {formatDate(intake.review.reviewedAt)}. No external action was created.
                          </p>
                        </div>
                      )}
                    </article>
                  );
                })}

                {!(quoteIntakesQuery.data?.items.length || 0) ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
                    No supplier replies have been captured yet. New native email or WhatsApp replies will be
                    normalized without sending an acknowledgement automatically.
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
        <CommercialOfferWorkbench
          supplierQuotes={quoteIntakesQuery.data?.supplierQuotes || []}
        />
      </div>
    </div>
  );
}
