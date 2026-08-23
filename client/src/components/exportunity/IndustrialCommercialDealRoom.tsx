import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowRight,
  AlertTriangle,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  Loader2,
  LockKeyhole,
  Mail,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Truck,
  UserRoundCog,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  IndustrialAttachmentIntelligenceReviewPanel,
  type IndustrialAttachmentVisionStatus,
  type IndustrialAttachmentWithReview,
} from "./IndustrialAttachmentIntelligenceReview";
import {
  CommercialOfferWorkbench,
  type SupplierQuoteForOffer,
} from "./CommercialOfferWorkbench";

export type IndustrialCommercialOpportunitySummary = {
  id: string;
  referenceCode: string;
  title: string;
  status: string;
  requesterCompany: string | null;
  nextAction: string | null;
  productRequirement: {
    productName: string | null;
    specification: string | null;
    quantityText: string | null;
    unit: string | null;
    destination: string | null;
    incoterm: string | null;
  } | null;
  operationsHandoff: {
    assignedAgentName: string | null;
    participants: Array<{
      key: string;
      agentId: number | null;
      agentName: string;
      role: string;
      avatarUrl?: string | null;
      taskId?: number | null;
      taskStatus?: string;
    }>;
    progress?: ExecutionProgress;
  } | null;
};

type ExecutionProgress = {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  backlog: number;
  percent: number;
};

type OpportunityExecutionTask = {
  id: number;
  parentTaskId: number | null;
  agentId: number | null;
  agentName: string | null;
  agentRole: string | null;
  agentAvatarUrl: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  executionType: string | null;
  approvalStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  key: string;
  allowedNextStatuses: string[];
};

type OpportunityExecution = {
  requirementId: string;
  parentTask: OpportunityExecutionTask | null;
  workstreams: OpportunityExecutionTask[];
  team: Array<{
    key: string;
    agentId: number | null;
    agentName: string;
    role: string;
    avatarUrl: string | null;
    taskId: number | null;
    taskStatus: string;
  }>;
  missingSpecialistKeys: string[];
  status: string;
  progress: ExecutionProgress;
  timeline: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    agentName: string | null;
    taskId: number | null;
    createdAt: string | null;
    output?: string | null;
  }>;
};

type Supplier = {
  id: string;
  displayName: string;
  countryCode: string;
  city: string | null;
  email: string | null;
  phone: string | null;
  verificationStatus: string;
  capabilities: string[];
};

type SupplierMatch = {
  id: string;
  supplierProfileId: string;
  supplier: Supplier | null;
  status: string;
  matchScore: number | null;
  matchReason: string;
  source: string;
  verificationScore: number | null;
  relevanceScore: number | null;
  contactabilityScore: number | null;
  lastVerifiedAt: string | null;
};

type SupplierQuote = SupplierQuoteForOffer & {
  id: string;
  referenceCode: string;
  supplierProfileId: string | null;
  supplierMatchId: string | null;
  supplierName: string | null;
  product: string | null;
  totalCost: string | null;
  currencyCode: string | null;
  incoterm: string | null;
  leadTimeDays: number | null;
  status: string;
  sourceChannel: string;
  reviewedAt: string | null;
};

type CustomerQuote = {
  id: string;
  referenceCode: string;
  commercialOfferId: string | null;
  status: string;
  currencyCode: string;
  totalAmount: string | null;
  leadTimeText: string | null;
  lineItems: Array<Record<string, string>>;
  issuedAt: string | null;
  respondedAt: string | null;
  updatedAt: string;
};

type TrackedOrder = {
  id: string;
  quoteId: string;
  referenceCode: string;
  status: string;
  currencyCode: string;
  totalAmount: string | null;
  paymentStatus: string;
  paidAmount: string | null;
  paidCurrencyCode: string | null;
  paidAt: string | null;
  plannedDeliveryAt: string | null;
  fulfillment: IndustrialFulfillment | null;
  procurementAuthorization: ProcurementAuthorization | null;
  supplierPurchaseOrderPackage: SupplierPurchaseOrderPackage | null;
  deliveryAccounting: DeliveryAccounting;
  relationshipContinuity: RelationshipContinuity;
};

type ProcurementAuthorization = {
  id: string;
  orderId: string;
  referenceCode: string;
  status: string;
  supplierQuoteId: string;
  supplierProfileId: string;
  currencyCode: string;
  supplierCostMinor: string;
  additionalCostsMinor: string;
  totalCostMinor: string;
  marginMinor: string;
  customerPriceMinor: string;
  releaseHash: string;
  sourceSnapshot: Record<string, unknown>;
  preparedReason: string;
  preparedAt: string;
  approvedReason: string | null;
  approvedAt: string | null;
  externalActionExecuted: false;
  supplierContacted: false;
  supplierCommitmentCreated: false;
};

type SupplierPurchaseOrderPackage = {
  id: string;
  orderId: string;
  procurementAuthorizationId: string;
  referenceCode: string;
  status: "approval_required" | "approved_for_submission" | "cancelled";
  supplierQuoteId: string;
  supplierProfileId: string;
  currencyCode: string;
  supplierTotalMinor: string;
  productName: string;
  specification: string | null;
  offeredQuantity: string;
  unitOfMeasure: string;
  unitPriceText: string | null;
  packaging: string | null;
  leadTime: string;
  incoterm: string;
  paymentTerms: string;
  destination: string;
  countryOfOrigin: string | null;
  warranty: string | null;
  supplierQuoteReference: string;
  supplierQuoteValidUntil: string;
  packageHash: string;
  preparedReason: string;
  preparedAt: string;
  approvedReason: string | null;
  approvedAt: string | null;
  externalActionExecuted: false;
  transmittedToSupplier: false;
  supplierAccepted: false;
  externalPurchaseOrderReference: null;
};

type ActualCostEntry = {
  id: string;
  referenceCode: string;
  direction: "cost" | "reversal";
  category:
    | "supplier"
    | "inspection"
    | "freight"
    | "customs"
    | "last_mile"
    | "duties_taxes"
    | "banking_provider_fees"
    | "other";
  currencyCode: string;
  amountMinor: string;
  costReference: string;
  description: string;
  entryHash: string;
  incurredAt: string;
  recordedAt: string;
  externalAccountingPosted: false;
};

type RevenueRecognition = {
  id: string;
  referenceCode: string;
  status: "approval_required" | "recognized";
  currencyCode: string;
  revenueMinor: string;
  actualCostMinor: string;
  actualGrossMarginMinor: string;
  plannedCostMinor: string;
  plannedMarginMinor: string;
  costVarianceMinor: string;
  marginVarianceMinor: string;
  recognitionHash: string;
  preparedAt: string;
  recognizedAt: string | null;
  externalJournalPosted: false;
};

type DeliveryAccounting = {
  actualCosts: ActualCostEntry[];
  recognition: RevenueRecognition | null;
};

type RelationshipContinuity = {
  memory: {
    id: string;
    referenceCode: string;
    productName: string;
    specification: string | null;
    quantityText: string;
    unitOfMeasure: string;
    destination: string;
    countryOfOrigin: string | null;
    cadenceText: string | null;
    deliveredAt: string;
    currencyCode: string;
    revenueMinor: string;
    actualCostMinor: string;
    actualGrossMarginMinor: string;
    customerMemory: Record<string, unknown>;
    supplierMemory: Record<string, unknown>;
    evidenceHash: string;
    memoryHash: string;
    recordedAt: string;
    privateFinancialEvidence: true;
  } | null;
  review: {
    id: string;
    status: "review_required" | "approved_internal";
    recommendedAction: string;
    proposedNextReviewAt: string | null;
    consentStatus: string;
    isDnc: boolean;
    decisionReason: string | null;
    approvedAt: string | null;
    externalCommunicationAuthorized: false;
    externalCommunicationExecuted: false;
  } | null;
};

type FulfillmentService = {
  id: string;
  serviceType: "procurement" | "inspection" | "freight" | "customs" | "last_mile";
  status: string;
  providerKind: string;
  providerName: string | null;
  providerReference: string | null;
  externalReference: string | null;
  publicLabel: string | null;
  quotedCost: string | null;
  currencyCode: string | null;
  linkedDeliveryReference: string | null;
  carrierProfileId?: string | null;
  carrierDeliveryQuoteId?: string | null;
  carrierBookingAuthorizationId?: string | null;
  performanceRating: number | null;
  onTime: boolean | null;
  issueCount: number;
  nextStatuses: string[];
};

type IndustrialFulfillment = {
  id: string;
  trackingCode: string;
  kind: string;
  status: string;
  publicEta: string | null;
  exceptionSummary: string | null;
  nextStatuses: string[];
  services: FulfillmentService[];
  events: Array<{
    id: string;
    sequence: number;
    eventType: string;
    title: string;
    customerMessage: string | null;
    customerVisible: boolean;
    occurredAt: string;
  }>;
};

type ApprovalAction = {
  id: number;
  publicActionId: string;
  actionType: string;
  status: string;
  requestedByAgentKey: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type CommercialRoomResponse = {
  ok: boolean;
  room: {
    requirement: IndustrialCommercialOpportunitySummary & {
      details?: string | null;
      internalNotes?: string | null;
    };
    supplierMatches: SupplierMatch[];
    supplierQuotes: SupplierQuote[];
    customerQuotes: CustomerQuote[];
    orders: TrackedOrder[];
    approvalActions: ApprovalAction[];
    attachments: IndustrialAttachmentWithReview[];
    audit: Array<{
      id: string;
      action: string;
      reason: string | null;
      createdAt: string;
    }>;
    execution: OpportunityExecution | null;
    controls: {
      externalCommunicationsEnabled: boolean;
      supplierCostsArePrivate: boolean;
      customerQuoteRequiresApprovedOffer: boolean;
      legacyCommercialUiRetired: boolean;
      historicalCommercialRowsPreserved: boolean;
      attachmentVision: IndustrialAttachmentVisionStatus;
    };
  };
};

function readable(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function outboundPolicyForAction(action: ApprovalAction) {
  const metadata = recordValue(action.metadata);
  const nestedPolicy = recordValue(metadata.policy);
  const evaluation = recordValue(
    metadata.outboundExecutionPolicy ??
      metadata.outboundApprovalPolicy ??
      metadata.outboundCommunicationPolicy ??
      nestedPolicy.outboundCommunication,
  );
  const decision = String(evaluation.decision || "").trim();
  const reasons = Array.isArray(evaluation.reasons)
    ? evaluation.reasons
        .map((reason) => String(reason || "").trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];
  return decision ? { decision, reasons } : null;
}

function money(value: string | null | undefined, currency = "XOF") {
  const raw = String(value ?? "").trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return "Not recorded";
  const sign = match[1];
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const fraction = String(match[3] || "").replace(/0+$/, "");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  return `${sign}${grouped}${fraction ? `,${fraction}` : ""} ${currency}`;
}

function minorMoney(value: string, currency: string) {
  const normalized = String(value || "").trim();
  const match = /^(-?)(\d+)$/.exec(normalized);
  if (!match) return "Not recorded";
  const sign = match[1];
  const digits = match[2];
  const scales: Record<string, number> = {
    BHD: 3,
    BIF: 0,
    CLP: 0,
    DJF: 0,
    GNF: 0,
    IQD: 3,
    JPY: 0,
    JOD: 3,
    KMF: 0,
    KRW: 0,
    KWD: 3,
    LYD: 3,
    MGA: 0,
    OMR: 3,
    PYG: 0,
    RWF: 0,
    TND: 3,
    UGX: 0,
    VND: 0,
    VUV: 0,
    XAF: 0,
    XOF: 0,
    XPF: 0,
  };
  const scale = scales[currency] ?? 2;
  const padded = digits.padStart(scale + 1, "0");
  const integer = scale ? padded.slice(0, -scale) : padded;
  const fraction = scale ? padded.slice(-scale) : "";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  return `${sign}${grouped}${fraction ? `.${fraction}` : ""} ${currency}`;
}

function shortDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusClass(status: string) {
  if (
    ["approved", "accepted", "completed", "reviewed", "done", "review_ready"].includes(
      status,
    )
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (
    ["declined", "cancelled", "canceled", "expired", "rejected", "blocked"].includes(
      status,
    )
  ) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (["in_progress", "working"].includes(status)) {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function workstreamAction(status: string) {
  if (status === "canceled") {
    return { status: "backlog", label: "Reopen", icon: RotateCcw };
  }
  return null;
}

function toggleId(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function clientEventKey(prefix: string) {
  const nonce =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${nonce}`;
}

function providerKindForService(serviceType: FulfillmentService["serviceType"]) {
  if (serviceType === "procurement" || serviceType === "inspection") {
    return "internal_team";
  }
  if (serviceType === "last_mile") return "existing_delivery_network";
  return "verified_partner";
}

export function IndustrialCommercialDealRoom({
  opportunity,
}: {
  opportunity: IndustrialCommercialOpportunitySummary;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const autoDispatchSignatureRef = useRef("");
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [eventNote, setEventNote] = useState("");
  const [plannedDeliveryAt, setPlannedDeliveryAt] = useState("");
  const [confirmedProcurementApprovalIds, setConfirmedProcurementApprovalIds] =
    useState<Set<string>>(new Set());
  const [confirmedSupplierPoPackageIds, setConfirmedSupplierPoPackageIds] =
    useState<Set<string>>(new Set());
  const [confirmedRevenueRecognitionIds, setConfirmedRevenueRecognitionIds] =
    useState<Set<string>>(new Set());
  const [confirmedContinuityReviewIds, setConfirmedContinuityReviewIds] =
    useState<Set<string>>(new Set());
  const [continuityReviewAt, setContinuityReviewAt] = useState("");
  const [actualCostForm, setActualCostForm] = useState({
    category: "supplier" as ActualCostEntry["category"],
    amountMinor: "",
    costReference: "",
  });
  const [fulfillmentServiceForm, setFulfillmentServiceForm] = useState({
    serviceType: "inspection" as FulfillmentService["serviceType"],
    providerName: "Exportunity Quality Team",
    providerReference: "",
    quotedCost: "",
    currencyCode: "XOF",
  });

  const roomUrl = `/api/industrial/admin/requirements/${opportunity.id}/commercial-room`;
  const roomQuery = useQuery<CommercialRoomResponse>({
    queryKey: [roomUrl],
    enabled: open,
    staleTime: 5_000,
  });
  const room = roomQuery.data?.room;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [roomUrl] }),
      queryClient.invalidateQueries({
        queryKey: ["/api/industrial/admin/requirements?limit=25"],
      }),
    ]);
  };

  const downloadAttachment = async (
    attachment: IndustrialAttachmentWithReview,
  ) => {
    try {
      const token = localStorage.getItem("ece_session");
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(
        `/api/industrial/admin/requirements/${opportunity.id}/attachments/${attachment.id}/download`,
        { headers, credentials: "include", cache: "no-store" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "The original evidence is unavailable.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error: any) {
      toast({
        title: "Evidence download failed",
        description: String(
          error?.message || "The original evidence could not be downloaded.",
        ),
        variant: "destructive",
      });
    }
  };

  const discoverMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/industrial/admin/requirements/${opportunity.id}/discover-suppliers`,
        "POST",
        {},
      ),
    onSuccess: async (result: any) => {
      await refresh();
      toast({
        title: "Verified supplier review completed",
        description:
          result?.nextAction ||
          "The sourcing agent refreshed the internal supplier ranking.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Supplier discovery could not be completed",
        description: error?.message || "Review the supplier records and try again.",
        variant: "destructive",
      }),
  });

  const rfqMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/industrial/admin/requirements/${opportunity.id}/rfq-actions`,
        "POST",
        {
          supplierMatchIds: Array.from(selectedMatchIds),
          channel: "email",
          language: "fr",
        },
      ),
    onSuccess: async (result: any) => {
      setSelectedMatchIds(new Set());
      await refresh();
      toast({
        title: "RFQ drafts prepared for approval",
        description: `${Number(result?.actions?.length || 0)} approval item(s) created. Nothing was sent.`,
      });
    },
    onError: (error: any) =>
      toast({
        title: "RFQ drafts could not be prepared",
        description: error?.message || "Review the selected suppliers.",
        variant: "destructive",
      }),
  });

  const fulfillmentInitializeMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest(
        `/api/industrial/admin/orders/${orderId}/fulfillment/initialize`,
        "POST",
        {
          kind: "standard_order",
          reason: eventNote.trim(),
        },
      ),
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Fulfillment ledger initialized",
        description:
          "The governed service plan is ready; no provider was contacted or booked.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Fulfillment could not be initialized",
        description: error?.message || "Verified payment is required.",
        variant: "destructive",
      }),
  });

  const procurementPrepareMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest(
        `/api/industrial/admin/orders/${orderId}/procurement/prepare`,
        "POST",
        { reason: eventNote.trim() },
      ),
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Exact procurement authorization prepared",
        description:
          "Paid-order and supplier-quote evidence are now bound for approval. No supplier was contacted.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Procurement authorization was blocked",
        description:
          error?.message || "Reconcile payment, supplier evidence, and fulfillment first.",
        variant: "destructive",
      }),
  });

  const procurementApproveMutation = useMutation({
    mutationFn: (input: {
      orderId: string;
      authorization: ProcurementAuthorization;
    }) =>
      apiRequest(
        `/api/industrial/admin/orders/${input.orderId}/procurement/${input.authorization.id}/approve`,
        "POST",
        {
          expectedReleaseHash: input.authorization.releaseHash,
          reason: eventNote.trim(),
          checklist: {
            paymentEvidenceMatches: true,
            supplierQuoteEvidenceMatches: true,
            supplierTermsReconfirmed: true,
            amountsReconciled: true,
            tenantScopeConfirmed: true,
            internalProcurementOnly: true,
            externalSupplierActionSeparated: true,
          },
        },
      ),
    onSuccess: async (_result: unknown, input) => {
      setConfirmedProcurementApprovalIds((current) => {
        const next = new Set(current);
        next.delete(input.authorization.id);
        return next;
      });
      await refresh();
      toast({
        title: "Internal procurement released",
        description:
          "The exact paid-order workstream is active. Supplier contact and purchase-order submission remain separate.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Procurement approval was blocked",
        description:
          error?.message || "Reload and recheck the exact procurement evidence.",
        variant: "destructive",
      }),
  });

  const supplierPoPrepareMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest(
        `/api/industrial/admin/orders/${orderId}/procurement/purchase-order-package/prepare`,
        "POST",
        { reason: eventNote.trim() },
      ),
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Supplier purchase-order package prepared",
        description:
          "The exact internal package is awaiting approval. Nothing was transmitted to the supplier.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Purchase-order preparation was blocked",
        description:
          error?.message || "Reconfirm the supplier quote and exact procurement evidence.",
        variant: "destructive",
      }),
  });

  const supplierPoApproveMutation = useMutation({
    mutationFn: (input: {
      orderId: string;
      purchaseOrderPackage: SupplierPurchaseOrderPackage;
    }) =>
      apiRequest(
        `/api/industrial/admin/orders/${input.orderId}/procurement/purchase-order-package/${input.purchaseOrderPackage.id}/approve`,
        "POST",
        {
          expectedPackageHash: input.purchaseOrderPackage.packageHash,
          reason: eventNote.trim(),
          checklist: {
            paidOrderEvidenceMatches: true,
            procurementAuthorizationMatches: true,
            supplierQuoteCurrentAndValid: true,
            productQuantityDestinationReviewed: true,
            supplierTermsReviewed: true,
            exactSupplierTotalReconciled: true,
            tenantScopeConfirmed: true,
            internalPackageOnly: true,
            externalSubmissionSeparated: true,
          },
        },
      ),
    onSuccess: async (_result: unknown, input) => {
      setConfirmedSupplierPoPackageIds((current) => {
        const next = new Set(current);
        next.delete(input.purchaseOrderPackage.id);
        return next;
      });
      await refresh();
      toast({
        title: "Supplier purchase-order package approved internally",
        description:
          "The package is ready for a separately governed submission. It was not transmitted or accepted.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Purchase-order approval was blocked",
        description:
          error?.message || "Reload and recheck the exact supplier package.",
        variant: "destructive",
      }),
  });

  const actualCostMutation = useMutation({
    mutationFn: (input: { orderId: string; currencyCode: string }) =>
      apiRequest(
        `/api/industrial/admin/orders/${input.orderId}/accounting/actual-costs`,
        "POST",
        {
          direction: "cost",
          category: actualCostForm.category,
          currencyCode: input.currencyCode,
          amountMinor: actualCostForm.amountMinor.trim(),
          costReference: actualCostForm.costReference.trim(),
          description: eventNote.trim(),
          evidence: [
            {
              kind: "document_reference",
              reference: actualCostForm.costReference.trim(),
            },
          ],
          incurredAt: new Date().toISOString(),
          reason: eventNote.trim(),
        },
      ),
    onSuccess: async () => {
      setActualCostForm((current) => ({
        ...current,
        amountMinor: "",
        costReference: "",
      }));
      await refresh();
      toast({
        title: "Immutable actual cost recorded",
        description:
          "The exact private evidence was added to the order ledger. No external accounting journal was posted.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Actual cost was blocked",
        description:
          error?.message || "Check the paid order, evidence reference, service lineage, and exact minor-unit amount.",
        variant: "destructive",
      }),
  });

  const recognitionPrepareMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest(
        `/api/industrial/admin/orders/${orderId}/accounting/recognition/prepare`,
        "POST",
        { reason: eventNote.trim() },
      ),
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Delivery-bound recognition prepared",
        description:
          "Exact revenue, actual cost, and gross margin are awaiting administrator approval. No external journal was posted.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Recognition preparation was blocked",
        description:
          error?.message || "Complete actual-cost evidence and proof-backed delivery first.",
        variant: "destructive",
      }),
  });

  const recognitionApproveMutation = useMutation({
    mutationFn: (input: {
      orderId: string;
      recognition: RevenueRecognition;
    }) =>
      apiRequest(
        `/api/industrial/admin/orders/${input.orderId}/accounting/recognition/${input.recognition.id}/approve`,
        "POST",
        {
          expectedRecognitionHash: input.recognition.recognitionHash,
          reason: eventNote.trim(),
          checklist: {
            successfulPaymentMatches: true,
            acceptedCustomerPriceMatches: true,
            actualCostEvidenceComplete: true,
            supplierCostEvidencePresent: true,
            deliveryPlanCompleted: true,
            deliveryProofVerified: true,
            tenantAndOrderLineageConfirmed: true,
            revenueAndMarginReconciled: true,
            privateAccountingOnly: true,
            externalJournalSeparated: true,
          },
        },
      ),
    onSuccess: async (_result: unknown, input) => {
      setConfirmedRevenueRecognitionIds((current) => {
        const next = new Set(current);
        next.delete(input.recognition.id);
        return next;
      });
      await refresh();
      toast({
        title: "Revenue and gross margin recognized",
        description:
          "The internal ledger is now immutable and delivery-bound. No external accounting journal was posted.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Recognition approval was blocked",
        description:
          error?.message || "Reload and recheck payment, costs, and delivery proof.",
        variant: "destructive",
      }),
  });

  const continuityApproveMutation = useMutation({
    mutationFn: (input: {
      orderId: string;
      continuity: RelationshipContinuity;
    }) => {
      const memory = input.continuity.memory!;
      const review = input.continuity.review!;
      return apiRequest(
        `/api/industrial/admin/orders/${input.orderId}/relationship-continuity/${review.id}/approve`,
        "POST",
        {
          expectedMemoryHash: memory.memoryHash,
          reason: eventNote.trim(),
          nextReviewAt: new Date(continuityReviewAt).toISOString(),
          checklist: {
            transactionOutcomeReviewed: true,
            customerIdentityAndConsentReviewed: true,
            supplierEvidenceReviewed: true,
            reviewTimingConfirmed: true,
            noExternalCommunication: true,
          },
        },
      );
    },
    onSuccess: async (_result: unknown, input) => {
      const reviewId = input.continuity.review!.id;
      setConfirmedContinuityReviewIds((current) => {
        const next = new Set(current);
        next.delete(reviewId);
        return next;
      });
      setContinuityReviewAt("");
      await refresh();
      toast({
        title: "Internal relationship review scheduled",
        description:
          "The completed trade is now durable customer/supplier memory. No message was sent or authorized.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Relationship continuity approval was blocked",
        description:
          error?.message ||
          "Reload and review the delivered transaction, consent, supplier evidence, and review date.",
        variant: "destructive",
      }),
  });

  const fulfillmentConfigureServiceMutation = useMutation({
    mutationFn: (input: { orderId: string; serviceType: FulfillmentService["serviceType"] }) =>
      apiRequest(
        `/api/industrial/admin/orders/${input.orderId}/fulfillment/services/${input.serviceType}`,
        "PUT",
        {
          providerKind: providerKindForService(input.serviceType),
          providerName: fulfillmentServiceForm.providerName.trim() || null,
          providerReference:
            fulfillmentServiceForm.providerReference.trim() || null,
          externalReference:
            fulfillmentServiceForm.providerReference.trim() || null,
          publicLabel: readable(input.serviceType),
          quotedCost: fulfillmentServiceForm.quotedCost || null,
          currencyCode: fulfillmentServiceForm.quotedCost
            ? fulfillmentServiceForm.currencyCode.trim().toUpperCase()
            : null,
          reason: eventNote.trim(),
        },
      ),
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Service evidence configured",
        description:
          "Provider details were recorded privately. No provider action was executed.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Service could not be configured",
        description: error?.message || "Review the provider evidence and private cost.",
        variant: "destructive",
      }),
  });

  const fulfillmentServiceStatusMutation = useMutation({
    mutationFn: (input: {
      orderId: string;
      serviceId: string;
      status: string;
    }) =>
      apiRequest(
        `/api/industrial/admin/orders/${input.orderId}/fulfillment/services/${input.serviceId}/status`,
        "POST",
        {
          status: input.status,
          reason: eventNote.trim(),
          humanConfirmed: ["approved", "in_progress"].includes(input.status),
        },
      ),
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Service status recorded",
        description: "The ledger reflects the real service state; no external call was made.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Service status was blocked",
        description: error?.message || "Record the required approval or provider reference.",
        variant: "destructive",
      }),
  });

  const fulfillmentStatusMutation = useMutation({
    mutationFn: (input: { orderId: string; status: string }) =>
      apiRequest(
        `/api/industrial/admin/orders/${input.orderId}/fulfillment/status`,
        "POST",
        {
          status: input.status,
          reason: eventNote.trim(),
          publicEta: plannedDeliveryAt || null,
        },
      ),
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Fulfillment stage updated",
        description: "Operational prerequisites and evidence were validated.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Fulfillment transition was blocked",
        description: error?.message || "Complete the required service and evidence first.",
        variant: "destructive",
      }),
  });

  const fulfillmentMilestoneMutation = useMutation({
    mutationFn: (input: {
      orderId: string;
      eventType: "inspection_passed" | "delivery_proof_recorded";
    }) => {
      const deliveryProof = input.eventType === "delivery_proof_recorded";
      return apiRequest(
        `/api/industrial/admin/orders/${input.orderId}/fulfillment/milestones`,
        "POST",
        {
          idempotencyKey: clientEventKey(input.eventType),
          eventType: input.eventType,
          title: deliveryProof ? "Delivery proof recorded" : "Inspection passed",
          customerMessage: deliveryProof
            ? "Delivery proof was recorded for this order."
            : "Quality inspection passed with recorded evidence.",
          internalNotes: eventNote.trim(),
          customerVisible: true,
          evidence: deliveryProof
            ? []
            : [
                {
                  label: "Inspection evidence reference",
                  reference: eventNote.trim(),
                  public: false,
                },
              ],
          proof: deliveryProof
            ? {
                method: "document",
                deliveredAt: new Date().toISOString(),
                reference: eventNote.trim(),
              }
            : {},
        },
      );
    },
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Immutable milestone recorded",
        description: "The customer-safe timeline and private audit record were updated.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Milestone could not be recorded",
        description: error?.message || "Provide an evidence reference.",
        variant: "destructive",
      }),
  });

  const workstreamMutation = useMutation({
    mutationFn: (input: { taskId: number; status: string }) =>
      apiRequest(
        `/api/industrial/admin/requirements/${opportunity.id}/workstreams/${input.taskId}/status`,
        "PATCH",
        {
          status: input.status,
          reason:
            eventNote.trim() ||
            "Updated from the private industrial opportunity room.",
        },
      ),
    onSuccess: async (result: any) => {
      setEventNote("");
      await refresh();
      toast({
        title: "Employee workstream updated",
        description:
          result?.nextAction ||
          "The real Operations Center task and opportunity timeline were updated.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Workstream could not be updated",
        description: error?.message || "Review the allowed task transition.",
        variant: "destructive",
      }),
  });

  const autoDispatchMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/industrial/admin/requirements/${opportunity.id}/workstreams/auto-dispatch`,
        "POST",
        {},
      ),
    onSuccess: async () => {
      await refresh();
    },
    onError: (error: any) => {
      toast({
        title: "Automatic employee dispatch needs attention",
        description:
          error?.message ||
          "The Operations Center will retain the workstream for reconciliation.",
        variant: "destructive",
      });
    },
  });

  const automaticBacklogTaskIds = (room?.execution?.workstreams || [])
    .filter((workstream) => workstream.status === "backlog" && workstream.agentId)
    .map((workstream) => workstream.id);
  const automaticDispatchSignature = automaticBacklogTaskIds.join(":");

  useEffect(() => {
    if (!open || !automaticDispatchSignature || autoDispatchMutation.isPending) {
      return;
    }
    if (autoDispatchSignatureRef.current === automaticDispatchSignature) return;
    autoDispatchSignatureRef.current = automaticDispatchSignature;
    autoDispatchMutation.mutate();
  }, [open, automaticDispatchSignature, autoDispatchMutation.isPending]);

  const busy =
    discoverMutation.isPending ||
    rfqMutation.isPending ||
    fulfillmentInitializeMutation.isPending ||
    procurementPrepareMutation.isPending ||
    procurementApproveMutation.isPending ||
    supplierPoPrepareMutation.isPending ||
    supplierPoApproveMutation.isPending ||
    actualCostMutation.isPending ||
    recognitionPrepareMutation.isPending ||
    recognitionApproveMutation.isPending ||
    continuityApproveMutation.isPending ||
    fulfillmentConfigureServiceMutation.isPending ||
    fulfillmentServiceStatusMutation.isPending ||
    fulfillmentStatusMutation.isPending ||
    fulfillmentMilestoneMutation.isPending ||
    workstreamMutation.isPending ||
    autoDispatchMutation.isPending;

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="mt-3 bg-[#07121F] font-black text-white hover:bg-[#14273B]"
      >
        <BriefcaseBusiness className="mr-2 h-4 w-4" />
        Open deal room
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[96vh] w-[calc(100vw-1rem)] max-w-[1240px] gap-0 overflow-hidden border-slate-200 bg-[#F7F8FA] p-0 text-slate-950 shadow-2xl sm:rounded-lg">
          <DialogHeader className="border-b border-slate-200 bg-white px-5 py-4 pr-12 text-left sm:px-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase text-[#9A6700]">
                {opportunity.referenceCode}
              </span>
              <Badge variant="outline" className={statusClass(opportunity.status)}>
                {readable(opportunity.status)}
              </Badge>
              <Badge
                variant="outline"
                className="border-slate-200 bg-slate-50 text-slate-700"
              >
                Private commercial workspace
              </Badge>
            </div>
            <DialogTitle className="mt-2 text-xl font-black text-[#07121F] sm:text-2xl">
              {opportunity.productRequirement?.productName || opportunity.title}
            </DialogTitle>
            <DialogDescription className="mt-1 max-w-4xl leading-6 text-slate-600">
              {opportunity.requesterCompany
                ? `${opportunity.requesterCompany}. `
                : ""}
              One governed record from client demand to supplier evidence, internal
              pricing, customer quotation and fulfilment.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(96vh-125px)] overflow-y-auto">
            {roomQuery.isLoading ? (
              <div className="flex min-h-[460px] items-center justify-center gap-3 text-sm font-semibold text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin text-[#9A6700]" />
                Loading the private commercial record...
              </div>
            ) : roomQuery.isError || !room ? (
              <div className="m-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-900">
                The commercial room could not be loaded. Confirm the staff session and
                database migration status, then try again.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                <section className="bg-white px-5 py-5 sm:px-7">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-black text-[#07121F]">
                        <UserRoundCog className="h-5 w-5 text-[#9A6700]" />
                        Accountable agent team
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(room.execution?.team ||
                          room.requirement.operationsHandoff?.participants ||
                          opportunity.operationsHandoff?.participants ||
                          []).map(
                          (participant) => (
                            <span
                              key={`${participant.key}-${participant.agentId || "open"}`}
                              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
                            >
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#07121F] text-[10px] font-black text-white">
                                {participant.avatarUrl ? (
                                  <img
                                    src={participant.avatarUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  (participant.agentName || participant.key)
                                    .slice(0, 1)
                                    .toUpperCase()
                                )}
                              </span>
                              <span>
                                {participant.agentName || readable(participant.key)}
                              </span>
                              <span className="font-medium text-slate-500">
                                / {participant.role}
                              </span>
                              {participant.taskStatus ? (
                                <Badge
                                  variant="outline"
                                  className={statusClass(participant.taskStatus)}
                                >
                                  {readable(participant.taskStatus)}
                                </Badge>
                              ) : null}
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                    <div className="border-slate-200 lg:border-l lg:pl-5">
                      <div className="text-xs font-black uppercase text-slate-500">
                        Current next action
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
                        {room.requirement.nextAction ||
                          "Review the requirement and assign the next controlled action."}
                      </p>
                    </div>
                  </div>
                  {room.execution ? (
                    <div className="mt-5 border-t border-slate-200 pt-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-black text-[#07121F]">
                            <Clock3 className="h-4 w-4 text-[#9A6700]" />
                            Live execution
                            <Badge
                              variant="outline"
                              className={statusClass(room.execution.status)}
                            >
                              {readable(room.execution.status)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {room.execution.progress.completed} of {room.execution.progress.total} specialist workstreams completed
                          </p>
                        </div>
                        <div className="min-w-48 sm:w-64">
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full bg-[#E2A416] transition-[width] duration-500"
                              style={{ width: `${room.execution.progress.percent}%` }}
                            />
                          </div>
                          <div className="mt-1 text-right text-xs font-black text-slate-600">
                            {room.execution.progress.percent}%
                          </div>
                        </div>
                      </div>

                      {room.execution.workstreams.length ? (
                        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">
                          {room.execution.workstreams.map((workstream) => {
                            const action = workstreamAction(workstream.status);
                            const ActionIcon = action?.icon;
                            return (
                              <div
                                key={workstream.id}
                                className="grid gap-3 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-black text-[#07121F]">
                                      {workstream.agentName || readable(workstream.key)}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-500">
                                      {workstream.agentRole || readable(workstream.key)}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className={statusClass(workstream.status)}
                                    >
                                      {readable(workstream.status)}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                                    {workstream.title}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {workstream.status === "backlog" &&
                                  workstream.agentId ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled
                                      className="border-blue-200 bg-blue-50 font-black text-blue-800"
                                    >
                                      {autoDispatchMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <Bot className="mr-2 h-4 w-4" />
                                      )}
                                      Automatic dispatch
                                    </Button>
                                  ) : null}
                                  {workstream.status === "blocked" ? (
                                    <Badge
                                      variant="outline"
                                      className="border-rose-200 bg-rose-50 text-rose-800"
                                    >
                                      Operations escalation
                                    </Badge>
                                  ) : null}
                                  {workstream.status === "in_progress" &&
                                  workstream.allowedNextStatuses.includes("blocked") ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={busy}
                                      onClick={() =>
                                        workstreamMutation.mutate({
                                          taskId: workstream.id,
                                          status: "blocked",
                                        })
                                      }
                                      className="border-slate-300 bg-white text-slate-700"
                                    >
                                      <CircleSlash2 className="mr-2 h-4 w-4" />
                                      Block
                                    </Button>
                                  ) : null}
                                  {workstream.status === "in_progress" ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled
                                      className="border-blue-200 bg-blue-50 text-blue-800"
                                    >
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Agent working
                                    </Button>
                                  ) : null}
                                  {action &&
                                  workstream.allowedNextStatuses.includes(
                                    action.status,
                                  ) &&
                                  ActionIcon ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() =>
                                        workstreamMutation.mutate({
                                          taskId: workstream.id,
                                          status: action.status,
                                        })
                                      }
                                      className="bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                    >
                                      <ActionIcon className="mr-2 h-4 w-4" />
                                      {action.label}
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          No specialist task is linked yet. Review the staffing signal before claiming work has started.
                        </div>
                      )}

                      {room.execution.timeline.length ? (
                        <div className="mt-5">
                          <div className="text-xs font-black uppercase text-slate-500">
                            Factual timeline
                          </div>
                          <div className="mt-2 divide-y divide-slate-100 border-l-2 border-amber-300 pl-4">
                            {room.execution.timeline.slice(0, 8).map((event) => (
                              <div key={event.id} className="relative py-2.5 first:pt-0">
                                <span className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#E2A416]" />
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-black text-[#07121F]">
                                    {event.title}
                                  </span>
                                  {event.createdAt ? (
                                    <span className="text-xs text-slate-500">
                                      {shortDate(event.createdAt)}
                                    </span>
                                  ) : null}
                                </div>
                                {event.description ? (
                                  <p className="mt-0.5 text-xs leading-5 text-slate-600">
                                    {event.description}
                                  </p>
                                ) : null}
                                {event.output ? (
                                  <details className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                    <summary className="cursor-pointer text-xs font-black text-[#07121F]">
                                      Review employee output
                                    </summary>
                                    <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                                      {event.output}
                                    </div>
                                  </details>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className={`mt-5 flex items-start gap-3 rounded-lg border p-3 text-sm leading-6 ${
                      room.controls.externalCommunicationsEnabled
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-amber-200 bg-amber-50 text-amber-950"
                    }`}
                  >
                    <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <div className="font-black">
                        {room.controls.externalCommunicationsEnabled
                          ? "External communication is enabled under approval controls"
                          : "External communication kill switch is off"}
                      </div>
                      <p>
                        Agents can research, rank suppliers and prepare drafts. Nothing is
                        sent from this room without the separate activation and approval
                        policy.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="px-5 py-6 sm:px-7">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-base font-black text-[#07121F]">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#FFF1CC] text-xs text-[#704700]">
                          1
                        </span>
                        Verified supplier candidates
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Only active, verified internal supplier profiles are ranked here.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => discoverMutation.mutate()}
                      className="border-slate-300 bg-white text-slate-800"
                    >
                      <RefreshCw
                        className={`mr-2 h-4 w-4 ${discoverMutation.isPending ? "animate-spin" : ""}`}
                      />
                      Refresh verified matches
                    </Button>
                  </div>

                  {room.supplierMatches.length ? (
                    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="divide-y divide-slate-100">
                        {room.supplierMatches.map((match) => (
                          <label
                            key={match.id}
                            className="grid cursor-pointer gap-3 p-4 hover:bg-slate-50 sm:grid-cols-[24px_minmax(0,1fr)_auto] sm:items-center"
                          >
                            <input
                              type="checkbox"
                              checked={selectedMatchIds.has(match.id)}
                              onChange={() =>
                                setSelectedMatchIds((current) =>
                                  toggleId(current, match.id),
                                )
                              }
                              className="h-4 w-4 accent-[#E2A416]"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-[#07121F]">
                                  {match.supplier?.displayName || "Verified supplier"}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="border-emerald-200 bg-emerald-50 text-emerald-800"
                                >
                                  <ShieldCheck className="mr-1 h-3 w-3" /> Verified
                                </Badge>
                                {match.supplier?.email ? (
                                  <Badge
                                    variant="outline"
                                    className="border-slate-200 bg-white text-slate-600"
                                  >
                                    <Mail className="mr-1 h-3 w-3" /> Email route
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {[match.supplier?.city, match.supplier?.countryCode]
                                  .filter(Boolean)
                                  .join(", ") || "Location not recorded"}
                                {match.lastVerifiedAt
                                  ? ` / verified ${shortDate(match.lastVerifiedAt)}`
                                  : ""}
                              </p>
                              <p className="mt-1 text-sm leading-5 text-slate-700">
                                {match.matchReason}
                              </p>
                            </div>
                            <div className="sm:text-right">
                              <div className="text-2xl font-black text-[#07121F]">
                                {match.matchScore ?? 0}
                              </div>
                              <div className="text-xs font-bold uppercase text-slate-500">
                                Match score
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-semibold leading-5 text-slate-600">
                          {selectedMatchIds.size} selected. RFQs become visible approval
                          items; this action never sends them.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!selectedMatchIds.size || busy}
                          onClick={() => rfqMutation.mutate()}
                          className="bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
                        >
                          <ClipboardCheck className="mr-2 h-4 w-4" />
                          Prepare email RFQ drafts
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
                      <ShieldCheck className="mx-auto h-7 w-7 text-slate-300" />
                      <div className="mt-2 font-black text-[#07121F]">
                        No verified capability match yet
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        Refresh the internal network. If no match exists, the Sourcing
                        Agent must begin documented research before contact.
                      </p>
                    </div>
                  )}

                  {room.approvalActions.length ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                      <div className="text-xs font-black uppercase text-slate-500">
                        Approval queue
                      </div>
                      <div className="mt-3 divide-y divide-slate-100">
                        {room.approvalActions.slice(0, 8).map((action) => (
                          <div
                            key={action.id}
                            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="text-sm font-black text-[#07121F]">
                                {readable(action.actionType)}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {action.requestedByAgentKey
                                  ? `${readable(action.requestedByAgentKey)} Agent / `
                                  : ""}
                                {shortDate(action.createdAt)}
                              </div>
                              {outboundPolicyForAction(action) ? (
                                <div className="mt-2 text-xs leading-5 text-slate-600">
                                  <span className="font-black text-slate-800">
                                    Policy: {readable(outboundPolicyForAction(action)?.decision)}
                                  </span>
                                  {outboundPolicyForAction(action)?.reasons.length
                                    ? ` / ${outboundPolicyForAction(action)?.reasons
                                        .map((reason) => readable(reason))
                                        .join(" / ")}`
                                    : null}
                                </div>
                              ) : null}
                            </div>
                            <Badge variant="outline" className={statusClass(action.status)}>
                              {readable(action.status)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="bg-white px-5 py-6 sm:px-7">
                  <div className="flex items-center gap-2 text-base font-black text-[#07121F]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#FFF1CC] text-xs text-[#704700]">
                      2
                    </span>
                    Reviewed supplier evidence
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    A human records the real supplier response. Raw source text and cost
                    remain private to Exportunity staff.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-black text-indigo-950">Canonical supplier evidence only</div>
                      <p className="mt-1 text-sm leading-6 text-indigo-900/75">
                        Direct manual quote entry has been retired. Supplier replies now pass through the source-linked
                        RFQ intake, human qualification, and canonical evidence ledger.
                      </p>
                    </div>
                    <Button asChild type="button" className="shrink-0 bg-indigo-800 font-black text-white hover:bg-indigo-900">
                      <Link href="/admin/exportunity/supplier-rfqs">
                        Open supplier RFQ workspace
                      </Link>
                    </Button>
                  </div>

                  {room.supplierQuotes.length ? (
                    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                      <div className="divide-y divide-slate-100 bg-white">
                        {room.supplierQuotes.map((quote) => (
                          <div
                            key={quote.id}
                            className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                          >
                            <div>
                              <div className="font-black text-[#07121F]">
                                {quote.supplierName || "Supplier"} / {quote.referenceCode}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {readable(quote.sourceChannel)} source
                                {quote.values.leadTime ? ` / ${quote.values.leadTime}` : ""}
                                {quote.values.incoterm ? ` / ${quote.values.incoterm}` : ""}
                              </div>
                              {!quote.readiness.offerPreparation.ready ? (
                                <p className="mt-2 text-xs leading-5 text-amber-800">
                                  Offer preparation blocked:{" "}
                                  {quote.readiness.offerPreparation.blockers.join(", ") ||
                                    "canonical evidence is incomplete"}
                                </p>
                              ) : null}
                            </div>
                            <div className="sm:text-right">
                              <div className="font-black text-[#07121F]">
                                {money(quote.totalCost, quote.currencyCode || "XOF")}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2 sm:justify-end">
                                <Badge variant="outline" className={statusClass(quote.status)}>
                                  {readable(quote.status)}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={
                                    quote.readiness.offerPreparation.ready
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : "border-amber-200 bg-amber-50 text-amber-800"
                                  }
                                >
                                  {quote.readiness.offerPreparation.ready
                                    ? "Offer ready"
                                    : "Evidence incomplete"}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                      No canonical supplier quote has been qualified for this opportunity yet.
                    </div>
                  )}
                </section>

                <section className="px-5 py-6 sm:px-7">
                  <div className="flex items-center gap-2 text-base font-black text-[#07121F]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#FFF1CC] text-xs text-[#704700]">
                      3
                    </span>
                    Private pricing and approval
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    The server calculates total cost and margin. These economics never
                    enter the customer quotation.
                  </p>

                  <CommercialOfferWorkbench
                    supplierQuotes={room.supplierQuotes}
                    requirementId={opportunity.id}
                  />
                </section>

                <section className="bg-white px-5 py-6 sm:px-7">
                  <div className="flex items-center gap-2 text-base font-black text-[#07121F]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#FFF1CC] text-xs text-[#704700]">
                      4
                    </span>
                    Customer quotation and order
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Canonical offer issuance, customer response, and exact-order creation are handled in the
                    Exportunity workbench above. This section is the read-only transaction and fulfilment view.
                  </p>

                  {room.customerQuotes.length ? (
                    <div className="mt-4 space-y-4">
                      {room.orders.some((order) => order.paymentStatus === "paid") ? (
                        <div className="grid gap-4 rounded-lg border border-slate-200 bg-[#F7F8FA] p-4 sm:grid-cols-[1fr_220px]">
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800" htmlFor={`event-note-${opportunity.id}`}>
                            Fulfilment evidence for the next real event
                          </Label>
                          <Input
                            id={`event-note-${opportunity.id}`}
                            value={eventNote}
                            onChange={(event) => setEventNote(event.target.value)}
                            placeholder="Who confirmed what, through which approved channel, and when?"
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800" htmlFor={`planned-delivery-${opportunity.id}`}>
                            Customer-safe ETA
                          </Label>
                          <Input
                            id={`planned-delivery-${opportunity.id}`}
                            type="date"
                            value={plannedDeliveryAt}
                            onChange={(event) => setPlannedDeliveryAt(event.target.value)}
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        </div>
                      ) : null}

                      {room.customerQuotes.map((quote) => {
                        const order = room.orders.find(
                          (candidate) => candidate.quoteId === quote.id,
                        );
                        return (
                          <div
                            key={quote.id}
                            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-black text-[#07121F]">
                                    {quote.referenceCode}
                                  </span>
                                  <Badge variant="outline" className={statusClass(quote.status)}>
                                    {readable(quote.status)}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-200 bg-emerald-50 text-emerald-800"
                                  >
                                    Supplier costs excluded
                                  </Badge>
                                </div>
                                <div className="mt-3 text-2xl font-black text-[#07121F]">
                                  {money(quote.totalAmount, quote.currencyCode)}
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                  {quote.lineItems.length} customer line item(s)
                                  {quote.leadTimeText ? ` / ${quote.leadTimeText}` : ""}
                                </p>
                                {order ? (
                                  <div className="mt-3 space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <PackageCheck className="h-4 w-4" />
                                      {order.referenceCode} / {readable(order.status)}
                                      <Badge
                                        variant="outline"
                                        className="border-emerald-300 bg-white text-emerald-900"
                                      >
                                        Payment: {readable(order.paymentStatus || "unpaid")}
                                      </Badge>
                                    </div>
                                    {order.paymentStatus !== "paid" ? (
                                      <Button
                                        asChild
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                                      >
                                        <a
                                          href={`/industrial/orders/${encodeURIComponent(order.id)}/pay`}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <CreditCard className="mr-2 h-4 w-4" />
                                          Open governed payment page
                                        </a>
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <div className="max-w-xl rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                                Lifecycle writes use the hash-bound Exportunity workbench. Historical quotation
                                and order records remain visible here without duplicate controls.
                              </div>
                            </div>

                            {order?.paymentStatus === "paid" ? (
                              <div className="mt-5 border-t border-slate-200 pt-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2 font-black text-[#07121F]">
                                      <Truck className="h-5 w-5 text-[#9A6700]" />
                                      Procurement-to-delivery control
                                    </div>
                                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                                      Service records and milestones are internal until explicitly marked customer-safe. These controls record real events; they do not contact or book providers.
                                    </p>
                                  </div>
                                  {order.fulfillment ? (
                                    <div className="text-right">
                                      <Badge
                                        variant="outline"
                                        className={statusClass(order.fulfillment.status)}
                                      >
                                        {readable(order.fulfillment.status)}
                                      </Badge>
                                      <div className="mt-1 font-mono text-xs font-black text-slate-600">
                                        {order.fulfillment.trackingCode}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>

                                {!order.fulfillment ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy || eventNote.trim().length < 8}
                                    onClick={() =>
                                      fulfillmentInitializeMutation.mutate(order.id)
                                    }
                                    className="mt-4 bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                  >
                                    <PackageCheck className="mr-2 h-4 w-4" />
                                    Initialize fulfillment ledger
                                  </Button>
                                ) : (
                                  <div className="mt-4 space-y-4">
                                    <div className="rounded-lg border border-[#E2A416]/40 bg-[#FFF9EA] p-4">
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <div className="flex items-center gap-2 text-sm font-black text-[#07121F]">
                                            <FileCheck2 className="h-4 w-4 text-[#9A6700]" />
                                            Exact procurement authorization
                                          </div>
                                          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                                            This internal control binds the successful payment to the accepted customer price and qualified supplier quote. It cannot contact the supplier or submit a purchase order.
                                          </p>
                                        </div>
                                        {order.procurementAuthorization ? (
                                          <Badge
                                            variant="outline"
                                            className={statusClass(
                                              order.procurementAuthorization.status,
                                            )}
                                          >
                                            {readable(
                                              order.procurementAuthorization.status,
                                            )}
                                          </Badge>
                                        ) : null}
                                      </div>

                                      {!order.procurementAuthorization ? (
                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-white p-3">
                                          <div className="text-xs leading-5 text-slate-600">
                                            Prepare only after the procurement service is approved and the shared decision note documents the review.
                                          </div>
                                          <Button
                                            type="button"
                                            size="sm"
                                            disabled={
                                              busy ||
                                              eventNote.trim().length < 12 ||
                                              !order.fulfillment.services.some(
                                                (service) =>
                                                  service.serviceType ===
                                                    "procurement" &&
                                                  ["approved", "in_progress"].includes(
                                                    service.status,
                                                  ),
                                              )
                                            }
                                            onClick={() =>
                                              procurementPrepareMutation.mutate(order.id)
                                            }
                                            className="bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                          >
                                            <ClipboardCheck className="mr-2 h-4 w-4" />
                                            Prepare exact release
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="mt-3 space-y-3 rounded-md border border-amber-200 bg-white p-3">
                                          <div className="grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-5">
                                            <div>
                                              <div className="font-bold text-slate-500">Reference</div>
                                              <div className="mt-1 font-mono font-black text-slate-800">
                                                {order.procurementAuthorization.referenceCode}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Supplier cost</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {minorMoney(
                                                  order.procurementAuthorization
                                                    .supplierCostMinor,
                                                  order.procurementAuthorization.currencyCode,
                                                )}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Additional costs</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {minorMoney(
                                                  order.procurementAuthorization
                                                    .additionalCostsMinor,
                                                  order.procurementAuthorization.currencyCode,
                                                )}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Internal margin</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {minorMoney(
                                                  order.procurementAuthorization.marginMinor,
                                                  order.procurementAuthorization.currencyCode,
                                                )}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Paid customer total</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {minorMoney(
                                                  order.procurementAuthorization
                                                    .customerPriceMinor,
                                                  order.procurementAuthorization.currencyCode,
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <Badge
                                              variant="outline"
                                              className="border-slate-300 bg-slate-50 text-slate-700"
                                            >
                                              No supplier contact
                                            </Badge>
                                            <Badge
                                              variant="outline"
                                              className="border-slate-300 bg-slate-50 text-slate-700"
                                            >
                                              No purchase commitment
                                            </Badge>
                                            <span className="self-center font-mono text-[10px] text-slate-400">
                                              {order.procurementAuthorization.releaseHash.slice(
                                                0,
                                                20,
                                              )}
                                            </span>
                                          </div>
                                          {order.procurementAuthorization.status ===
                                          "approval_required" ? (
                                            <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 lg:flex-row lg:items-center lg:justify-between">
                                              <label className="flex max-w-3xl items-start gap-2 text-xs leading-5 text-slate-700">
                                                <input
                                                  type="checkbox"
                                                  className="mt-1 h-4 w-4 accent-[#07121F]"
                                                  checked={confirmedProcurementApprovalIds.has(
                                                    order.procurementAuthorization.id,
                                                  )}
                                                  onChange={(event) =>
                                                    setConfirmedProcurementApprovalIds(
                                                      (current) => {
                                                        const next = new Set(current);
                                                        if (event.target.checked) {
                                                          next.add(
                                                            order.procurementAuthorization!.id,
                                                          );
                                                        } else {
                                                          next.delete(
                                                            order.procurementAuthorization!.id,
                                                          );
                                                        }
                                                        return next;
                                                      },
                                                    )
                                                  }
                                                />
                                                <span>
                                                  I rechecked payment, tenant scope, supplier evidence, current terms, exact amounts, and confirm this approval performs no external supplier action.
                                                </span>
                                              </label>
                                              <Button
                                                type="button"
                                                size="sm"
                                                disabled={
                                                  busy ||
                                                  eventNote.trim().length < 12 ||
                                                  !confirmedProcurementApprovalIds.has(
                                                    order.procurementAuthorization.id,
                                                  )
                                                }
                                                onClick={() =>
                                                  procurementApproveMutation.mutate({
                                                    orderId: order.id,
                                                    authorization:
                                                      order.procurementAuthorization!,
                                                  })
                                                }
                                                className="shrink-0 bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
                                              >
                                                <ShieldCheck className="mr-2 h-4 w-4" />
                                                Approve internal procurement
                                              </Button>
                                            </div>
                                          ) : (
                                            <p className="border-t border-slate-200 pt-3 text-xs font-bold leading-5 text-emerald-800">
                                              Internal procurement is active. Reconfirming or contacting the supplier remains a separate governed action.
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <div className="flex items-center gap-2 text-sm font-black text-[#07121F]">
                                            <PackageCheck className="h-4 w-4 text-[#9A6700]" />
                                            Supplier purchase-order package
                                          </div>
                                          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                                            Internal package — not issued. It binds the approved exact procurement release to current supplier terms, but cannot transmit an order or record supplier acceptance.
                                          </p>
                                        </div>
                                        {order.supplierPurchaseOrderPackage ? (
                                          <Badge
                                            variant="outline"
                                            className={statusClass(
                                              order.supplierPurchaseOrderPackage.status,
                                            )}
                                          >
                                            {readable(
                                              order.supplierPurchaseOrderPackage.status,
                                            )}
                                          </Badge>
                                        ) : (
                                          <Badge
                                            variant="outline"
                                            className="border-slate-300 bg-slate-50 text-slate-600"
                                          >
                                            Not prepared
                                          </Badge>
                                        )}
                                      </div>

                                      {!order.supplierPurchaseOrderPackage ? (
                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                                          <div className="max-w-3xl text-xs leading-5 text-slate-600">
                                            A current qualified supplier quote and an approved exact procurement authorization are required. Use the shared decision note to document the review.
                                          </div>
                                          <Button
                                            type="button"
                                            size="sm"
                                            disabled={
                                              busy ||
                                              eventNote.trim().length < 12 ||
                                              order.procurementAuthorization?.status !==
                                                "approved"
                                            }
                                            onClick={() =>
                                              supplierPoPrepareMutation.mutate(order.id)
                                            }
                                            className="bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                          >
                                            <ClipboardCheck className="mr-2 h-4 w-4" />
                                            Prepare supplier package
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                                          <div className="grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                                            <div>
                                              <div className="font-bold text-slate-500">Reference</div>
                                              <div className="mt-1 font-mono font-black text-slate-800">
                                                {order.supplierPurchaseOrderPackage.referenceCode}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Product and quantity</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {order.supplierPurchaseOrderPackage.productName} · {order.supplierPurchaseOrderPackage.offeredQuantity} {order.supplierPurchaseOrderPackage.unitOfMeasure}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Exact supplier total</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {minorMoney(
                                                  order.supplierPurchaseOrderPackage.supplierTotalMinor,
                                                  order.supplierPurchaseOrderPackage.currencyCode,
                                                )}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Supplier quote</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {order.supplierPurchaseOrderPackage.supplierQuoteReference}
                                              </div>
                                              <div className="mt-1 text-slate-500">
                                                Valid until {shortDate(order.supplierPurchaseOrderPackage.supplierQuoteValidUntil)}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Incoterm</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {order.supplierPurchaseOrderPackage.incoterm}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Destination</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {order.supplierPurchaseOrderPackage.destination}
                                              </div>
                                            </div>
                                            <div className="sm:col-span-2">
                                              <div className="font-bold text-slate-500">Terms and lead time</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {order.supplierPurchaseOrderPackage.paymentTerms} · {order.supplierPurchaseOrderPackage.leadTime}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <Badge
                                              variant="outline"
                                              className="border-slate-300 bg-white text-slate-700"
                                            >
                                              Not transmitted
                                            </Badge>
                                            <Badge
                                              variant="outline"
                                              className="border-slate-300 bg-white text-slate-700"
                                            >
                                              No supplier acceptance
                                            </Badge>
                                            <span className="self-center font-mono text-[10px] text-slate-400">
                                              {order.supplierPurchaseOrderPackage.packageHash.slice(
                                                0,
                                                20,
                                              )}
                                            </span>
                                          </div>
                                          {order.supplierPurchaseOrderPackage.status ===
                                          "approval_required" ? (
                                            <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 lg:flex-row lg:items-center lg:justify-between">
                                              <label className="flex max-w-3xl items-start gap-2 text-xs leading-5 text-slate-700">
                                                <input
                                                  type="checkbox"
                                                  className="mt-1 h-4 w-4 accent-[#07121F]"
                                                  checked={confirmedSupplierPoPackageIds.has(
                                                    order.supplierPurchaseOrderPackage.id,
                                                  )}
                                                  onChange={(event) =>
                                                    setConfirmedSupplierPoPackageIds(
                                                      (current) => {
                                                        const next = new Set(current);
                                                        if (event.target.checked) {
                                                          next.add(
                                                            order.supplierPurchaseOrderPackage!.id,
                                                          );
                                                        } else {
                                                          next.delete(
                                                            order.supplierPurchaseOrderPackage!.id,
                                                          );
                                                        }
                                                        return next;
                                                      },
                                                    )
                                                  }
                                                />
                                                <span>
                                                  I rechecked the paid order, exact procurement release, current supplier quote, product, quantity, destination, supplier terms, total, tenant scope, and confirm submission remains a separate action.
                                                </span>
                                              </label>
                                              <Button
                                                type="button"
                                                size="sm"
                                                disabled={
                                                  busy ||
                                                  eventNote.trim().length < 12 ||
                                                  !confirmedSupplierPoPackageIds.has(
                                                    order.supplierPurchaseOrderPackage.id,
                                                  )
                                                }
                                                onClick={() =>
                                                  supplierPoApproveMutation.mutate({
                                                    orderId: order.id,
                                                    purchaseOrderPackage:
                                                      order.supplierPurchaseOrderPackage!,
                                                  })
                                                }
                                                className="shrink-0 bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
                                              >
                                                <ShieldCheck className="mr-2 h-4 w-4" />
                                                Approve internal package
                                              </Button>
                                            </div>
                                          ) : (
                                            <p className="border-t border-slate-200 pt-3 text-xs font-bold leading-5 text-emerald-800">
                                              Approved internally for a future governed submission. The package is still not transmitted and has no supplier acceptance.
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[170px_minmax(180px,1fr)_minmax(180px,1fr)_130px_100px_auto]">
                                      <div>
                                        <Label className="text-xs font-bold">Service</Label>
                                        <select
                                          value={fulfillmentServiceForm.serviceType}
                                          onChange={(event) => {
                                            const serviceType = event.target.value as FulfillmentService["serviceType"];
                                            setFulfillmentServiceForm((current) => ({
                                              ...current,
                                              serviceType,
                                              providerName:
                                                serviceType === "inspection"
                                                  ? "Exportunity Quality Team"
                                                  : serviceType === "procurement"
                                                    ? "Exportunity Procurement Team"
                                                    : "",
                                              providerReference: "",
                                            }));
                                          }}
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                                        >
                                          {order.fulfillment.services.map((service) => (
                                            <option key={service.id} value={service.serviceType}>
                                              {readable(service.serviceType)}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <Label className="text-xs font-bold">Accountable provider/team</Label>
                                        <Input
                                          value={fulfillmentServiceForm.providerName}
                                          onChange={(event) =>
                                            setFulfillmentServiceForm((current) => ({
                                              ...current,
                                              providerName: event.target.value,
                                            }))
                                          }
                                          placeholder="Verified provider or internal team"
                                          className="mt-1 h-9 bg-white"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs font-bold">Existing reference / tracking</Label>
                                        <Input
                                          value={fulfillmentServiceForm.providerReference}
                                          onChange={(event) =>
                                            setFulfillmentServiceForm((current) => ({
                                              ...current,
                                              providerReference: event.target.value,
                                            }))
                                          }
                                          placeholder="Contract, booking or carrier ref"
                                          className="mt-1 h-9 bg-white"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs font-bold">Private cost</Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={fulfillmentServiceForm.quotedCost}
                                          onChange={(event) =>
                                            setFulfillmentServiceForm((current) => ({
                                              ...current,
                                              quotedCost: event.target.value,
                                            }))
                                          }
                                          className="mt-1 h-9 bg-white"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs font-bold">Currency</Label>
                                        <Input
                                          value={fulfillmentServiceForm.currencyCode}
                                          maxLength={3}
                                          onChange={(event) =>
                                            setFulfillmentServiceForm((current) => ({
                                              ...current,
                                              currencyCode: event.target.value.toUpperCase(),
                                            }))
                                          }
                                          className="mt-1 h-9 bg-white"
                                        />
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={
                                          busy ||
                                          eventNote.trim().length < 8 ||
                                          !fulfillmentServiceForm.providerName.trim() ||
                                          ["freight", "customs", "last_mile"].includes(
                                            fulfillmentServiceForm.serviceType,
                                          )
                                        }
                                        onClick={() =>
                                          fulfillmentConfigureServiceMutation.mutate({
                                            orderId: order.id,
                                            serviceType: fulfillmentServiceForm.serviceType,
                                          })
                                        }
                                        className="self-end bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                      >
                                        Save evidence
                                      </Button>
                                    </div>

                                    {["freight", "customs", "last_mile"].includes(
                                      fulfillmentServiceForm.serviceType,
                                    ) ? (
                                      <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                          <div className="font-black">Use a verified carrier record</div>
                                          <p className="mt-1 max-w-3xl text-xs leading-5 text-amber-800">
                                            External logistics cannot be configured from a free-text provider name. Match exact coverage, record a current quote, and prepare governed booking authority against this paid order.
                                          </p>
                                        </div>
                                        <Button asChild type="button" size="sm" className="shrink-0 bg-[#07121F] font-black text-white hover:bg-[#14273B]">
                                          <Link href={`/admin/carrier-network?orderId=${order.id}`}>
                                            Open carrier network
                                          </Link>
                                        </Button>
                                      </div>
                                    ) : null}

                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                      {order.fulfillment.services.map((service) => (
                                        <div
                                          key={service.id}
                                          className="rounded-lg border border-slate-200 bg-white p-3"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm font-black text-[#07121F]">
                                              {readable(service.serviceType)}
                                            </span>
                                            <Badge
                                              variant="outline"
                                              className={statusClass(service.status)}
                                            >
                                              {readable(service.status)}
                                            </Badge>
                                          </div>
                                          <p className="mt-2 min-h-8 text-xs leading-4 text-slate-500">
                                            {service.providerName || "Provider evidence pending"}
                                            {service.providerReference
                                              ? ` / ${service.providerReference}`
                                              : ""}
                                          </p>
                                          {service.carrierProfileId ? (
                                            <Link
                                              href={`/admin/carrier-network?orderId=${order.id}`}
                                              className="mt-1 block text-xs font-bold text-[#855900] underline underline-offset-2"
                                            >
                                              View verified carrier evidence
                                            </Link>
                                          ) : null}
                                          {service.quotedCost ? (
                                            <div className="mt-1 text-xs font-black text-slate-700">
                                              Private: {money(service.quotedCost, service.currencyCode || "XOF")}
                                            </div>
                                          ) : null}
                                          <div className="mt-3 flex flex-wrap gap-1.5">
                                            {service.nextStatuses
                                              .filter((status) => status !== "cancelled")
                                              .map((status) => (
                                                <Button
                                                  key={status}
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  disabled={
                                                    busy || eventNote.trim().length < 8
                                                  }
                                                  onClick={() =>
                                                    fulfillmentServiceStatusMutation.mutate({
                                                      orderId: order.id,
                                                      serviceId: service.id,
                                                      status,
                                                    })
                                                  }
                                                  className="h-7 border-slate-300 px-2 text-[11px]"
                                                >
                                                  {readable(status)}
                                                </Button>
                                              ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                      <span className="mr-1 text-xs font-black uppercase text-slate-500">
                                        Evidence milestones
                                      </span>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={
                                          busy ||
                                          eventNote.trim().length < 8 ||
                                          order.fulfillment.events.some(
                                            (event) => event.eventType === "inspection_passed",
                                          )
                                        }
                                        onClick={() =>
                                          fulfillmentMilestoneMutation.mutate({
                                            orderId: order.id,
                                            eventType: "inspection_passed",
                                          })
                                        }
                                        className="border-slate-300 bg-white"
                                      >
                                        <ClipboardCheck className="mr-2 h-4 w-4" />
                                        Record inspection proof
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={
                                          busy ||
                                          eventNote.trim().length < 8 ||
                                          order.fulfillment.events.some(
                                            (event) =>
                                              event.eventType === "delivery_proof_recorded",
                                          )
                                        }
                                        onClick={() =>
                                          fulfillmentMilestoneMutation.mutate({
                                            orderId: order.id,
                                            eventType: "delivery_proof_recorded",
                                          })
                                        }
                                        className="border-slate-300 bg-white"
                                      >
                                        <PackageCheck className="mr-2 h-4 w-4" />
                                        Record delivery proof
                                      </Button>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="mr-1 text-xs font-black uppercase text-slate-500">
                                        Allowed plan transitions
                                      </span>
                                      {order.fulfillment.nextStatuses.map((status) => (
                                        <Button
                                          key={status}
                                          type="button"
                                          size="sm"
                                          disabled={busy || eventNote.trim().length < 8}
                                          onClick={() =>
                                            fulfillmentStatusMutation.mutate({
                                              orderId: order.id,
                                              status,
                                            })
                                          }
                                          className={
                                            status === "exception" || status === "cancelled"
                                              ? "bg-slate-600 font-black text-white hover:bg-slate-700"
                                              : "bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
                                          }
                                        >
                                          <ArrowRight className="mr-2 h-4 w-4" />
                                          {readable(status)}
                                        </Button>
                                      ))}
                                    </div>

                                    <div className="rounded-lg border border-[#E2A416]/40 bg-[#FFF9EA] p-4">
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <div className="flex items-center gap-2 text-sm font-black text-[#07121F]">
                                            <CreditCard className="h-4 w-4 text-[#9A6700]" />
                                            Actual cost and delivery accounting
                                          </div>
                                          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                                            Private finance ledger. Costs use exact minor units and immutable evidence; revenue and gross margin cannot be recognized until delivery proof is complete.
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          <Badge
                                            variant="outline"
                                            className="border-slate-300 bg-white text-slate-700"
                                          >
                                            Private
                                          </Badge>
                                          <Badge
                                            variant="outline"
                                            className="border-slate-300 bg-white text-slate-700"
                                          >
                                            No external journal
                                          </Badge>
                                        </div>
                                      </div>

                                      {order.deliveryAccounting.recognition?.status !==
                                      "recognized" ? (
                                        <div className="mt-4 grid gap-3 rounded-md border border-amber-200 bg-white p-3 md:grid-cols-[180px_160px_minmax(220px,1fr)_auto]">
                                          <div>
                                            <Label className="text-xs font-bold">Cost category</Label>
                                            <select
                                              value={actualCostForm.category}
                                              onChange={(event) =>
                                                setActualCostForm((current) => ({
                                                  ...current,
                                                  category: event.target
                                                    .value as ActualCostEntry["category"],
                                                }))
                                              }
                                              className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                                            >
                                              {[
                                                "supplier",
                                                "inspection",
                                                "freight",
                                                "customs",
                                                "last_mile",
                                                "duties_taxes",
                                                "banking_provider_fees",
                                                "other",
                                              ].map((category) => (
                                                <option key={category} value={category}>
                                                  {readable(category)}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <div>
                                            <Label className="text-xs font-bold">
                                              Exact minor units
                                            </Label>
                                            <Input
                                              inputMode="numeric"
                                              pattern="[0-9]*"
                                              value={actualCostForm.amountMinor}
                                              onChange={(event) =>
                                                setActualCostForm((current) => ({
                                                  ...current,
                                                  amountMinor: event.target.value.replace(
                                                    /\D/g,
                                                    "",
                                                  ),
                                                }))
                                              }
                                              placeholder={
                                                order.currencyCode === "XOF"
                                                  ? "e.g. 250000"
                                                  : "e.g. 25000 = 250.00"
                                              }
                                              className="mt-1 h-9 bg-white font-mono"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs font-bold">
                                              Invoice / receipt reference
                                            </Label>
                                            <Input
                                              value={actualCostForm.costReference}
                                              onChange={(event) =>
                                                setActualCostForm((current) => ({
                                                  ...current,
                                                  costReference: event.target.value,
                                                }))
                                              }
                                              placeholder="Attributable document or receipt reference"
                                              className="mt-1 h-9 bg-white"
                                            />
                                          </div>
                                          <Button
                                            type="button"
                                            size="sm"
                                            disabled={
                                              busy ||
                                              eventNote.trim().length < 12 ||
                                              !/^[1-9]\d*$/.test(
                                                actualCostForm.amountMinor,
                                              ) ||
                                              actualCostForm.costReference.trim()
                                                .length < 3 ||
                                              order.supplierPurchaseOrderPackage
                                                ?.status !==
                                                "approved_for_submission"
                                            }
                                            onClick={() =>
                                              actualCostMutation.mutate({
                                                orderId: order.id,
                                                currencyCode: order.currencyCode,
                                              })
                                            }
                                            className="self-end bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                          >
                                            <FileCheck2 className="mr-2 h-4 w-4" />
                                            Record immutable cost
                                          </Button>
                                        </div>
                                      ) : null}

                                      {order.deliveryAccounting.actualCosts.length ? (
                                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                          {order.deliveryAccounting.actualCosts.map(
                                            (entry) => (
                                              <div
                                                key={entry.id}
                                                className="rounded-md border border-slate-200 bg-white px-3 py-2"
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="text-xs font-black text-slate-800">
                                                    {readable(entry.category)}
                                                  </span>
                                                  <span className="text-xs font-black text-[#855900]">
                                                    {entry.direction === "reversal"
                                                      ? "−"
                                                      : ""}
                                                    {minorMoney(
                                                      entry.amountMinor,
                                                      entry.currencyCode,
                                                    )}
                                                  </span>
                                                </div>
                                                <div className="mt-1 truncate text-xs text-slate-500">
                                                  {entry.costReference} · {entry.description}
                                                </div>
                                                <div className="mt-1 font-mono text-[10px] text-slate-400">
                                                  Immutable {entry.entryHash.slice(0, 16)}
                                                </div>
                                              </div>
                                            ),
                                          )}
                                        </div>
                                      ) : (
                                        <p className="mt-3 text-xs font-bold text-amber-800">
                                          No actual-cost evidence recorded yet.
                                        </p>
                                      )}

                                      {!order.deliveryAccounting.recognition ? (
                                        <div className="mt-4 flex flex-col gap-3 border-t border-amber-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                          <p className="max-w-3xl text-xs leading-5 text-slate-600">
                                            Preparation unlocks only when the order is completed, a delivery-proof milestone exists, and the immutable ledger includes attributable supplier cost.
                                          </p>
                                          <Button
                                            type="button"
                                            size="sm"
                                            disabled={
                                              busy ||
                                              eventNote.trim().length < 12 ||
                                              order.fulfillment.status !== "delivered" ||
                                              !order.deliveryAccounting.actualCosts.length
                                            }
                                            onClick={() =>
                                              recognitionPrepareMutation.mutate(order.id)
                                            }
                                            className="shrink-0 bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
                                          >
                                            <ClipboardCheck className="mr-2 h-4 w-4" />
                                            Prepare recognition
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="mt-4 space-y-3 border-t border-amber-200 pt-4">
                                          <div className="grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                                            <div>
                                              <div className="font-bold text-slate-500">Revenue</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {minorMoney(
                                                  order.deliveryAccounting.recognition
                                                    .revenueMinor,
                                                  order.deliveryAccounting.recognition
                                                    .currencyCode,
                                                )}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Actual cost</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {minorMoney(
                                                  order.deliveryAccounting.recognition
                                                    .actualCostMinor,
                                                  order.deliveryAccounting.recognition
                                                    .currencyCode,
                                                )}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Actual gross margin</div>
                                              <div className="mt-1 font-black text-slate-800">
                                                {minorMoney(
                                                  order.deliveryAccounting.recognition
                                                    .actualGrossMarginMinor,
                                                  order.deliveryAccounting.recognition
                                                    .currencyCode,
                                                )}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="font-bold text-slate-500">Status</div>
                                              <Badge
                                                variant="outline"
                                                className={statusClass(
                                                  order.deliveryAccounting.recognition
                                                    .status,
                                                )}
                                              >
                                                {readable(
                                                  order.deliveryAccounting.recognition
                                                    .status,
                                                )}
                                              </Badge>
                                            </div>
                                          </div>
                                          {order.deliveryAccounting.recognition.status ===
                                          "approval_required" ? (
                                            <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
                                              <label className="flex max-w-3xl items-start gap-2 text-xs leading-5 text-slate-700">
                                                <input
                                                  type="checkbox"
                                                  className="mt-1 h-4 w-4 accent-[#07121F]"
                                                  checked={confirmedRevenueRecognitionIds.has(
                                                    order.deliveryAccounting.recognition
                                                      .id,
                                                  )}
                                                  onChange={() =>
                                                    setConfirmedRevenueRecognitionIds(
                                                      (current) =>
                                                        toggleId(
                                                          current,
                                                          order.deliveryAccounting
                                                            .recognition!.id,
                                                        ),
                                                    )
                                                  }
                                                />
                                                <span>
                                                  I verified the successful payment, accepted price, complete actual-cost evidence, supplier cost, completed delivery proof, exact margin, privacy, tenant lineage, and confirm external journal posting remains separate.
                                                </span>
                                              </label>
                                              <Button
                                                type="button"
                                                size="sm"
                                                disabled={
                                                  busy ||
                                                  eventNote.trim().length < 12 ||
                                                  !confirmedRevenueRecognitionIds.has(
                                                    order.deliveryAccounting.recognition
                                                      .id,
                                                  )
                                                }
                                                onClick={() =>
                                                  recognitionApproveMutation.mutate({
                                                    orderId: order.id,
                                                    recognition:
                                                      order.deliveryAccounting
                                                        .recognition!,
                                                  })
                                                }
                                                className="shrink-0 bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                              >
                                                <ShieldCheck className="mr-2 h-4 w-4" />
                                                Recognize internally
                                              </Button>
                                            </div>
                                          ) : (
                                            <p className="text-xs font-bold leading-5 text-emerald-800">
                                              Delivery-bound revenue and actual gross margin are recognized internally and immutable. No external accounting journal was posted.
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {order.relationshipContinuity.memory &&
                                    order.relationshipContinuity.review ? (
                                      <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div>
                                            <div className="flex items-center gap-2 text-sm font-black text-[#07121F]">
                                              <RefreshCw className="h-4 w-4 text-sky-700" />
                                              Relationship continuity and repeat business
                                            </div>
                                            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                                              Immutable delivered-transaction memory connects the customer, supplier, product, outcome, and next internal review without creating a new order or sending a message.
                                            </p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline" className="border-sky-300 bg-white text-sky-800">
                                              Internal memory
                                            </Badge>
                                            <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                                              No message
                                            </Badge>
                                          </div>
                                        </div>

                                        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                                          <div>
                                            <div className="font-bold text-slate-500">Delivered requirement</div>
                                            <div className="mt-1 font-black text-slate-800">
                                              {order.relationshipContinuity.memory.productName}
                                            </div>
                                            <div className="mt-0.5 text-slate-500">
                                              {order.relationshipContinuity.memory.quantityText} {order.relationshipContinuity.memory.unitOfMeasure} · {order.relationshipContinuity.memory.destination}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="font-bold text-slate-500">Supplier memory</div>
                                            <div className="mt-1 font-black text-slate-800">
                                              {String(order.relationshipContinuity.memory.supplierMemory.supplierName || "Canonical delivered supplier")}
                                            </div>
                                            <div className="mt-0.5 text-slate-500">
                                              {order.relationshipContinuity.memory.countryOfOrigin || "Origin retained from supplier evidence"}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="font-bold text-slate-500">Customer contact basis</div>
                                            <div className="mt-1 font-black text-slate-800">
                                              {readable(order.relationshipContinuity.review.consentStatus)}
                                            </div>
                                            <div className={`mt-0.5 ${order.relationshipContinuity.review.isDnc ? "font-black text-red-700" : "text-slate-500"}`}>
                                              {order.relationshipContinuity.review.isDnc
                                                ? "Do not contact"
                                                : "Any outreach remains separately governed"}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="font-bold text-slate-500">Private outcome</div>
                                            <div className="mt-1 font-black text-slate-800">
                                              {minorMoney(
                                                order.relationshipContinuity.memory.actualGrossMarginMinor,
                                                order.relationshipContinuity.memory.currencyCode,
                                              )} gross margin
                                            </div>
                                            <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                                              Immutable {order.relationshipContinuity.memory.memoryHash.slice(0, 16)}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="mt-4 rounded-md border border-sky-200 bg-white p-3">
                                          <div className="text-xs font-black uppercase text-slate-500">Recommended internal action</div>
                                          <p className="mt-1 text-xs leading-5 text-slate-700">
                                            {order.relationshipContinuity.review.recommendedAction}
                                          </p>
                                          {order.relationshipContinuity.review.proposedNextReviewAt ? (
                                            <p className="mt-1 text-xs font-bold text-sky-800">
                                              Evidence-derived suggestion: {new Date(order.relationshipContinuity.review.proposedNextReviewAt).toLocaleString()}
                                            </p>
                                          ) : null}
                                        </div>

                                        {order.relationshipContinuity.review.status === "review_required" ? (
                                          <div className="mt-3 grid gap-3 rounded-md border border-slate-200 bg-white p-3 lg:grid-cols-[230px_minmax(340px,1fr)_auto] lg:items-end">
                                            <div>
                                              <Label className="text-xs font-bold">Next internal review</Label>
                                              <Input
                                                type="datetime-local"
                                                value={continuityReviewAt}
                                                onChange={(event) => setContinuityReviewAt(event.target.value)}
                                                className="mt-1 h-9 bg-white"
                                              />
                                            </div>
                                            <label className="flex items-start gap-2 text-xs leading-5 text-slate-700">
                                              <input
                                                type="checkbox"
                                                className="mt-1 h-4 w-4 accent-[#07121F]"
                                                checked={confirmedContinuityReviewIds.has(order.relationshipContinuity.review.id)}
                                                onChange={() =>
                                                  setConfirmedContinuityReviewIds((current) =>
                                                    toggleId(current, order.relationshipContinuity.review!.id),
                                                  )
                                                }
                                              />
                                              <span>
                                                I reviewed the delivered outcome, canonical customer and consent/DNC state, supplier evidence, and review timing. This approves only an internal reminder; it does not authorize contact.
                                              </span>
                                            </label>
                                            <Button
                                              type="button"
                                              size="sm"
                                              disabled={
                                                busy ||
                                                eventNote.trim().length < 12 ||
                                                !continuityReviewAt ||
                                                !confirmedContinuityReviewIds.has(order.relationshipContinuity.review.id)
                                              }
                                              onClick={() =>
                                                continuityApproveMutation.mutate({
                                                  orderId: order.id,
                                                  continuity: order.relationshipContinuity,
                                                })
                                              }
                                              className="shrink-0 bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                            >
                                              <ShieldCheck className="mr-2 h-4 w-4" />
                                              Approve internal review
                                            </Button>
                                          </div>
                                        ) : (
                                          <p className="mt-3 text-xs font-bold leading-5 text-emerald-800">
                                            Internal review scheduled for {order.relationshipContinuity.review.proposedNextReviewAt
                                              ? new Date(order.relationshipContinuity.review.proposedNextReviewAt).toLocaleString()
                                              : "the recorded date"}. No customer or supplier message was authorized or sent.
                                          </p>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-[#F7F8FA] p-6 text-center">
                      <FileCheck2 className="mx-auto h-7 w-7 text-slate-300" />
                      <div className="mt-2 font-black text-[#07121F]">
                        No customer quotation yet
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        Approve an internal offer, then create the sanitized customer
                        quotation from that approved price.
                      </p>
                    </div>
                  )}
                </section>

                <section className="px-5 py-6 sm:px-7">
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div>
                      <div className="text-sm font-black text-[#07121F]">
                        Linked evidence
                      </div>
                      {room.attachments.length ? (
                        <div className="mt-3 space-y-2">
                          {room.attachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className="rounded-md border border-slate-200 bg-white px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="truncate text-sm font-semibold text-slate-700">
                                  {attachment.fileName}
                                </span>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => downloadAttachment(attachment)}
                                  >
                                    <FileCheck2 className="mr-1 h-3.5 w-3.5" />
                                    Original
                                  </Button>
                                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                                    {attachment.extractionStatus === "extracted"
                                      ? "Text extracted"
                                      : attachment.extractionStatus === "ocr_required"
                                        ? "OCR required"
                                        : attachment.extractionStatus === "visual_review_required"
                                          ? "Visual review"
                                          : attachment.extractionStatus === "unsupported"
                                            ? "Manual review"
                                            : attachment.extractionStatus === "failed"
                                              ? "Extraction failed"
                                              : "Evidence"}
                                  </Badge>
                                </div>
                              </div>
                              {attachment.extractionWarning ? (
                                <p className="mt-2 text-xs leading-5 text-amber-700">
                                  {attachment.extractionWarning}
                                </p>
                              ) : null}
                              {attachment.extractedText ? (
                                <div className="mt-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-600">
                                  <span className="font-bold text-slate-700">Extracted preview: </span>
                                  {attachment.extractedText.slice(0, 420)}
                                  {attachment.extractedText.length > 420 ? "…" : ""}
                                </div>
                              ) : null}
                              <IndustrialAttachmentIntelligenceReviewPanel
                                requirementId={opportunity.id}
                                attachment={attachment}
                                vision={room.controls.attachmentVision}
                                onUpdated={refresh}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">
                          No requirement attachments are linked yet.
                        </p>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-black text-[#07121F]">
                        Recent audit trail
                      </div>
                      <div className="mt-3 space-y-2">
                        {room.audit.slice(0, 8).map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-md border border-slate-200 bg-white px-3 py-2"
                          >
                            <div className="text-sm font-bold text-slate-800">
                              {readable(entry.action)}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">
                              {entry.reason || "Recorded system event"}
                              {entry.createdAt ? ` / ${shortDate(entry.createdAt)}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
