import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  AlertTriangle,
  BriefcaseBusiness,
  Calculator,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  ClipboardCheck,
  FileCheck2,
  Loader2,
  LockKeyhole,
  Mail,
  PackageCheck,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
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

type SupplierQuote = {
  id: string;
  referenceCode: string;
  supplierProfileId: string;
  supplierMatchId: string;
  supplierName: string | null;
  product: string;
  totalCost: string;
  currencyCode: string;
  incoterm: string | null;
  leadTimeDays: number | null;
  status: string;
  sourceChannel: string;
  reviewedAt: string | null;
};

type CommercialOffer = {
  id: string;
  referenceCode: string;
  version: number;
  supplierQuoteIds: string[];
  costStack: Record<string, unknown>;
  totalCost: string;
  internalMargin: string;
  marginPercent: string;
  customerPrice: string;
  currencyCode: string;
  incoterm: string | null;
  deliveryEstimate: string | null;
  paymentTerms: string | null;
  status: string;
  approvedAt: string | null;
  updatedAt: string;
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
  plannedDeliveryAt: string | null;
};

type ApprovalAction = {
  id: number;
  publicActionId: string;
  actionType: string;
  status: string;
  requestedByAgentKey: string | null;
  payload: Record<string, unknown>;
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
    commercialOffers: CommercialOffer[];
    customerQuotes: CustomerQuote[];
    orders: TrackedOrder[];
    approvalActions: ApprovalAction[];
    attachments: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      createdAt: string;
    }>;
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
    };
  };
};

type QuoteTransition =
  | "draft"
  | "under_review"
  | "ready_for_account_manager"
  | "issued"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";

const QUOTE_NEXT_STATES: Record<string, QuoteTransition[]> = {
  draft: ["under_review", "ready_for_account_manager"],
  under_review: ["draft", "ready_for_account_manager"],
  ready_for_account_manager: ["under_review", "issued"],
  issued: ["accepted", "declined", "expired"],
  declined: ["draft"],
  expired: ["draft"],
};

function readable(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function money(value: string | number | null | undefined, currency = "XOF") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Not recorded";
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
  }).format(number)} ${currency}`;
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
  if (status === "backlog") {
    return { status: "in_progress", label: "Start", icon: Play };
  }
  if (status === "in_progress") {
    return { status: "done", label: "Complete", icon: CheckCircle2 };
  }
  if (status === "blocked") {
    return { status: "in_progress", label: "Resume", icon: RotateCcw };
  }
  if (status === "done") {
    return { status: "in_progress", label: "Reopen", icon: RotateCcw };
  }
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

export function IndustrialCommercialDealRoom({
  opportunity,
}: {
  opportunity: IndustrialCommercialOpportunitySummary;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedSupplierQuoteIds, setSelectedSupplierQuoteIds] = useState<
    Set<string>
  >(new Set());
  const [supplierQuoteForm, setSupplierQuoteForm] = useState({
    supplierMatchId: "",
    totalCost: "",
    currencyCode: "XOF",
    sourceChannel: "email",
    sourceText: "",
    leadTimeDays: "",
    incoterm: "",
  });
  const [pricingForm, setPricingForm] = useState({
    customerPrice: "",
    additionalCostLabel: "Logistics and handling",
    additionalCostValue: "",
    currencyCode: "XOF",
    incoterm: "",
    deliveryEstimate: "",
    paymentTerms: "",
  });
  const [eventNote, setEventNote] = useState("");
  const [plannedDeliveryAt, setPlannedDeliveryAt] = useState("");

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

  useEffect(() => {
    const matches = room?.supplierMatches || [];
    if (!matches.length) return;
    setSupplierQuoteForm((current) => {
      if (matches.some((match) => match.id === current.supplierMatchId)) {
        return current;
      }
      return { ...current, supplierMatchId: matches[0].id };
    });
  }, [room?.supplierMatches]);

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

  const supplierQuoteMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/industrial/admin/requirements/${opportunity.id}/supplier-quotes`,
        "POST",
        {
          supplierMatchId: supplierQuoteForm.supplierMatchId,
          totalCost: Number(supplierQuoteForm.totalCost),
          currencyCode: supplierQuoteForm.currencyCode,
          sourceChannel: supplierQuoteForm.sourceChannel,
          sourceText: supplierQuoteForm.sourceText,
          leadTimeDays: supplierQuoteForm.leadTimeDays
            ? Number(supplierQuoteForm.leadTimeDays)
            : null,
          incoterm: supplierQuoteForm.incoterm || null,
          humanReviewed: true,
        },
      ),
    onSuccess: async () => {
      setSupplierQuoteForm((current) => ({
        ...current,
        totalCost: "",
        sourceText: "",
        leadTimeDays: "",
      }));
      await refresh();
      toast({
        title: "Supplier evidence recorded",
        description:
          "The reviewed supplier cost is private and can now support internal pricing.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Supplier evidence could not be recorded",
        description: error?.message || "Review the source evidence and cost.",
        variant: "destructive",
      }),
  });

  const offerMutation = useMutation({
    mutationFn: () => {
      const additionalCost = Number(pricingForm.additionalCostValue || 0);
      return apiRequest(
        `/api/industrial/admin/requirements/${opportunity.id}/commercial-offers`,
        "POST",
        {
          supplierQuoteIds: Array.from(selectedSupplierQuoteIds),
          additionalCosts:
            additionalCost > 0
              ? {
                  [pricingForm.additionalCostLabel.trim() ||
                  "Additional commercial costs"]: additionalCost,
                }
              : {},
          customerPrice: Number(pricingForm.customerPrice),
          currencyCode: pricingForm.currencyCode,
          incoterm: pricingForm.incoterm || null,
          deliveryEstimate: pricingForm.deliveryEstimate || null,
          paymentTerms: pricingForm.paymentTerms || null,
        },
      );
    },
    onSuccess: async () => {
      setSelectedSupplierQuoteIds(new Set());
      setPricingForm((current) => ({
        ...current,
        customerPrice: "",
        additionalCostValue: "",
      }));
      await refresh();
      toast({
        title: "Internal offer prepared",
        description:
          "Costs and margin remain private until an administrator approves the customer price.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Internal offer could not be prepared",
        description: error?.message || "Review cost currencies and customer price.",
        variant: "destructive",
      }),
  });

  const approveOfferMutation = useMutation({
    mutationFn: (offerId: string) =>
      apiRequest(`/api/industrial/admin/commercial-offers/${offerId}/approve`, "POST", {
        humanApproved: true,
        reason:
          eventNote.trim() ||
          "Supplier evidence, total cost, margin and customer terms reviewed in the private deal room.",
      }),
    onSuccess: async () => {
      setEventNote("");
      await refresh();
      toast({
        title: "Customer price approved",
        description: "A sanitized customer quotation can now be generated.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Offer approval failed",
        description:
          error?.message || "Tenant administrator permission is required.",
        variant: "destructive",
      }),
  });

  const customerQuoteMutation = useMutation({
    mutationFn: (offerId: string) =>
      apiRequest(
        `/api/industrial/admin/commercial-offers/${offerId}/customer-quote`,
        "POST",
        {},
      ),
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Sanitized customer quotation created",
        description:
          "Supplier costs and Exportunity margin were excluded from the customer record.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Customer quotation could not be created",
        description: error?.message || "Approve the internal offer first.",
        variant: "destructive",
      }),
  });

  const quoteStatusMutation = useMutation({
    mutationFn: (input: { quoteId: string; status: QuoteTransition }) =>
      apiRequest(`/api/industrial/admin/quotes/${input.quoteId}/status`, "POST", {
        status: input.status,
        reason: eventNote.trim(),
      }),
    onSuccess: async () => {
      setEventNote("");
      await refresh();
      toast({
        title: "Quotation lifecycle updated",
        description: "The real commercial event was recorded in the audit trail.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Quotation status could not be updated",
        description: error?.message || "Check the required transition and note.",
        variant: "destructive",
      }),
  });

  const orderMutation = useMutation({
    mutationFn: (quoteId: string) =>
      apiRequest(`/api/industrial/admin/quotes/${quoteId}/orders`, "POST", {
        humanConfirmed: true,
        confirmationNote: eventNote.trim(),
        plannedDeliveryAt: plannedDeliveryAt || null,
      }),
    onSuccess: async () => {
      setEventNote("");
      setPlannedDeliveryAt("");
      await refresh();
      toast({
        title: "Tracked industrial order created",
        description:
          "The accepted quotation is now linked to a fulfilment record.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Order could not be created",
        description: error?.message || "Record an accepted quote first.",
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

  const selectedSupplierQuotes = useMemo(
    () =>
      (room?.supplierQuotes || []).filter((quote) =>
        selectedSupplierQuoteIds.has(quote.id),
      ),
    [room?.supplierQuotes, selectedSupplierQuoteIds],
  );
  const normalizedPricingCurrency = pricingForm.currencyCode.trim().toUpperCase();
  const selectedSupplierCurrencies = Array.from(
    new Set(
      selectedSupplierQuotes
        .map((quote) => quote.currencyCode.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  const pricingCurrencyValid = /^[A-Z]{3}$/.test(normalizedPricingCurrency);
  const displayPricingCurrency = pricingCurrencyValid
    ? normalizedPricingCurrency
    : selectedSupplierCurrencies[0] || "XOF";
  const hasCurrencyConflict =
    selectedSupplierCurrencies.length > 1 ||
    (selectedSupplierCurrencies.length === 1 &&
      selectedSupplierCurrencies[0] !== normalizedPricingCurrency);
  const selectedCost = selectedSupplierQuotes.reduce(
    (sum, quote) => sum + Number(quote.totalCost || 0),
    0,
  );
  const extraCost = Number(pricingForm.additionalCostValue || 0);
  const customerPrice = Number(pricingForm.customerPrice || 0);
  const previewMargin = hasCurrencyConflict
    ? Number.NaN
    : customerPrice - selectedCost - extraCost;
  const busy =
    discoverMutation.isPending ||
    rfqMutation.isPending ||
    supplierQuoteMutation.isPending ||
    offerMutation.isPending ||
    approveOfferMutation.isPending ||
    customerQuoteMutation.isPending ||
    quoteStatusMutation.isPending ||
    orderMutation.isPending ||
    workstreamMutation.isPending;

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

                  {room.supplierMatches.length ? (
                    <div className="mt-4 grid gap-4 rounded-lg border border-slate-200 bg-[#F7F8FA] p-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="font-bold text-slate-800" htmlFor={`supplier-match-${opportunity.id}`}>
                          Supplier
                        </Label>
                        <select
                          id={`supplier-match-${opportunity.id}`}
                          value={supplierQuoteForm.supplierMatchId}
                          onChange={(event) =>
                            setSupplierQuoteForm((current) => ({
                              ...current,
                              supplierMatchId: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#E2A416] focus:ring-2 focus:ring-amber-100"
                        >
                          {room.supplierMatches.map((match) => (
                            <option key={match.id} value={match.id}>
                              {match.supplier?.displayName || match.supplierProfileId}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800" htmlFor={`supplier-cost-${opportunity.id}`}>
                            Total supplier cost
                          </Label>
                          <Input
                            id={`supplier-cost-${opportunity.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={supplierQuoteForm.totalCost}
                            onChange={(event) =>
                              setSupplierQuoteForm((current) => ({
                                ...current,
                                totalCost: event.target.value,
                              }))
                            }
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800" htmlFor={`supplier-currency-${opportunity.id}`}>
                            Currency
                          </Label>
                          <Input
                            id={`supplier-currency-${opportunity.id}`}
                            value={supplierQuoteForm.currencyCode}
                            maxLength={3}
                            onChange={(event) =>
                              setSupplierQuoteForm((current) => ({
                                ...current,
                                currencyCode: event.target.value.toUpperCase(),
                              }))
                            }
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800">Source channel</Label>
                          <select
                            value={supplierQuoteForm.sourceChannel}
                            onChange={(event) =>
                              setSupplierQuoteForm((current) => ({
                                ...current,
                                sourceChannel: event.target.value,
                              }))
                            }
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                          >
                            {['email', 'whatsapp', 'phone', 'document', 'manual'].map(
                              (channel) => (
                                <option key={channel} value={channel}>
                                  {readable(channel)}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800">Lead time (days)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={supplierQuoteForm.leadTimeDays}
                            onChange={(event) =>
                              setSupplierQuoteForm((current) => ({
                                ...current,
                                leadTimeDays: event.target.value,
                              }))
                            }
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800">Incoterm</Label>
                          <Input
                            value={supplierQuoteForm.incoterm}
                            onChange={(event) =>
                              setSupplierQuoteForm((current) => ({
                                ...current,
                                incoterm: event.target.value.toUpperCase(),
                              }))
                            }
                            placeholder="EXW, FOB, CIF..."
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                      </div>
                      <div className="space-y-2 lg:col-span-2">
                        <Label className="font-bold text-slate-800" htmlFor={`supplier-source-${opportunity.id}`}>
                          Source evidence
                        </Label>
                        <Textarea
                          id={`supplier-source-${opportunity.id}`}
                          value={supplierQuoteForm.sourceText}
                          onChange={(event) =>
                            setSupplierQuoteForm((current) => ({
                              ...current,
                              sourceText: event.target.value,
                            }))
                          }
                          rows={4}
                          placeholder="Paste or summarize the dated supplier response, including scope, quantity, cost and conditions."
                          className="border-slate-300 bg-white text-slate-950"
                        />
                      </div>
                      <div className="flex justify-end lg:col-span-2">
                        <Button
                          type="button"
                          disabled={
                            busy ||
                            !supplierQuoteForm.supplierMatchId ||
                            Number(supplierQuoteForm.totalCost) <= 0 ||
                            supplierQuoteForm.sourceText.trim().length < 10
                          }
                          onClick={() => supplierQuoteMutation.mutate()}
                          className="bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                        >
                          <FileCheck2 className="mr-2 h-4 w-4" />
                          Record reviewed evidence
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {room.supplierQuotes.length ? (
                    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                      <div className="divide-y divide-slate-100 bg-white">
                        {room.supplierQuotes.map((quote) => (
                          <label
                            key={quote.id}
                            className="grid cursor-pointer gap-3 p-4 hover:bg-slate-50 sm:grid-cols-[24px_minmax(0,1fr)_auto] sm:items-center"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSupplierQuoteIds.has(quote.id)}
                              onChange={() => {
                                const wasSelected = selectedSupplierQuoteIds.has(
                                  quote.id,
                                );
                                setSelectedSupplierQuoteIds((current) =>
                                  toggleId(current, quote.id),
                                );
                                if (!wasSelected && !selectedSupplierQuoteIds.size) {
                                  setPricingForm((current) => ({
                                    ...current,
                                    currencyCode: quote.currencyCode,
                                  }));
                                }
                              }}
                              className="h-4 w-4 accent-[#E2A416]"
                            />
                            <div>
                              <div className="font-black text-[#07121F]">
                                {quote.supplierName || "Supplier"} / {quote.referenceCode}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {readable(quote.sourceChannel)} source
                                {quote.leadTimeDays != null
                                  ? ` / ${quote.leadTimeDays} day lead time`
                                  : ""}
                                {quote.incoterm ? ` / ${quote.incoterm}` : ""}
                              </div>
                            </div>
                            <div className="sm:text-right">
                              <div className="font-black text-[#07121F]">
                                {money(quote.totalCost, quote.currencyCode)}
                              </div>
                              <Badge variant="outline" className={statusClass(quote.status)}>
                                {readable(quote.status)}
                              </Badge>
                            </div>
                          </label>
                        ))}
                      </div>
                      <p className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                        Select one quote when suppliers are alternatives. Select
                        several only when they form one combined supply plan; their
                        costs will be added. Every selected quote must use the same
                        currency.
                      </p>
                    </div>
                  ) : null}
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

                  {room.supplierQuotes.length ? (
                    <div className="mt-4 grid gap-4 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800">Customer price</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={pricingForm.customerPrice}
                            onChange={(event) =>
                              setPricingForm((current) => ({
                                ...current,
                                customerPrice: event.target.value,
                              }))
                            }
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800">Currency</Label>
                          <Input
                            value={pricingForm.currencyCode}
                            maxLength={3}
                            onChange={(event) =>
                              setPricingForm((current) => ({
                                ...current,
                                currencyCode: event.target.value.toUpperCase(),
                              }))
                            }
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800">Additional cost label</Label>
                          <Input
                            value={pricingForm.additionalCostLabel}
                            onChange={(event) =>
                              setPricingForm((current) => ({
                                ...current,
                                additionalCostLabel: event.target.value,
                              }))
                            }
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800">Additional cost</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={pricingForm.additionalCostValue}
                            onChange={(event) =>
                              setPricingForm((current) => ({
                                ...current,
                                additionalCostValue: event.target.value,
                              }))
                            }
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800">Delivery estimate</Label>
                          <Input
                            value={pricingForm.deliveryEstimate}
                            onChange={(event) =>
                              setPricingForm((current) => ({
                                ...current,
                                deliveryEstimate: event.target.value,
                              }))
                            }
                            placeholder="For example, 21-30 days"
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800">Incoterm</Label>
                          <Input
                            value={pricingForm.incoterm}
                            onChange={(event) =>
                              setPricingForm((current) => ({
                                ...current,
                                incoterm: event.target.value.toUpperCase(),
                              }))
                            }
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="font-bold text-slate-800">Payment terms</Label>
                          <Textarea
                            value={pricingForm.paymentTerms}
                            onChange={(event) =>
                              setPricingForm((current) => ({
                                ...current,
                                paymentTerms: event.target.value,
                              }))
                            }
                            rows={3}
                            className="border-slate-300 bg-white text-slate-950"
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-[#07121F] p-5 text-white">
                        <div className="flex items-center gap-2 text-sm font-black">
                          <Calculator className="h-5 w-5 text-[#E2A416]" /> Pricing preview
                        </div>
                        <dl className="mt-4 space-y-3 text-sm">
                          <div className="flex justify-between gap-3">
                            <dt className="text-slate-300">Selected supplier cost</dt>
                            <dd className="font-bold">
                              {selectedSupplierCurrencies.length > 1
                                ? "Mixed currencies"
                                : money(
                                    selectedCost,
                                    selectedSupplierCurrencies[0] ||
                                      displayPricingCurrency,
                                  )}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-slate-300">Additional cost</dt>
                            <dd className="font-bold">
                              {money(extraCost, displayPricingCurrency)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3 border-t border-white/15 pt-3">
                            <dt className="text-slate-300">Internal margin</dt>
                            <dd
                              className={`font-black ${previewMargin > 0 ? "text-emerald-300" : "text-rose-300"}`}
                            >
                              {hasCurrencyConflict
                                ? "Resolve currency"
                                : money(previewMargin, displayPricingCurrency)}
                            </dd>
                          </div>
                        </dl>
                        {hasCurrencyConflict ? (
                          <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">
                            Supplier quote currency and customer offer currency must
                            match. Convert the supplier evidence before preparing an
                            offer.
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          disabled={
                            busy ||
                            !selectedSupplierQuoteIds.size ||
                            !pricingCurrencyValid ||
                            hasCurrencyConflict ||
                            customerPrice <= 0 ||
                            previewMargin <= 0
                          }
                          onClick={() => offerMutation.mutate()}
                          className="mt-5 w-full bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
                        >
                          <ArrowRight className="mr-2 h-4 w-4" />
                          Prepare internal offer
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                      Record at least one reviewed supplier quotation before pricing.
                    </div>
                  )}

                  {room.commercialOffers.length ? (
                    <div className="mt-5 space-y-3">
                      {room.commercialOffers.map((offer) => {
                        const existingCustomerQuote = room.customerQuotes.find(
                          (quote) => quote.commercialOfferId === offer.id,
                        );
                        return (
                          <div
                            key={offer.id}
                            className="rounded-lg border border-slate-200 bg-white p-4"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-black text-[#07121F]">
                                    {offer.referenceCode} / version {offer.version}
                                  </span>
                                  <Badge variant="outline" className={statusClass(offer.status)}>
                                    {readable(offer.status)}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="border-slate-200 bg-slate-50 text-slate-700"
                                  >
                                    <LockKeyhole className="mr-1 h-3 w-3" /> Private
                                  </Badge>
                                </div>
                                <div className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                                  <div>
                                    <span className="text-slate-500">Total cost</span>
                                    <div className="font-black text-[#07121F]">
                                      {money(offer.totalCost, offer.currencyCode)}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Internal margin</span>
                                    <div className="font-black text-[#07121F]">
                                      {money(offer.internalMargin, offer.currencyCode)} / {Number(offer.marginPercent).toFixed(1)}%
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Customer price</span>
                                    <div className="font-black text-[#07121F]">
                                      {money(offer.customerPrice, offer.currencyCode)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {offer.status === "draft" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => approveOfferMutation.mutate(offer.id)}
                                    className="bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Admin approve price
                                  </Button>
                                ) : null}
                                {offer.status === "approved" && !existingCustomerQuote ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => customerQuoteMutation.mutate(offer.id)}
                                    className="bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
                                  >
                                    <FileCheck2 className="mr-2 h-4 w-4" />
                                    Create customer quote
                                  </Button>
                                ) : null}
                                {existingCustomerQuote ? (
                                  <Badge
                                    variant="outline"
                                    className="h-9 border-emerald-200 bg-emerald-50 px-3 text-emerald-800"
                                  >
                                    Customer quote linked
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>

                <section className="bg-white px-5 py-6 sm:px-7">
                  <div className="flex items-center gap-2 text-base font-black text-[#07121F]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#FFF1CC] text-xs text-[#704700]">
                      4
                    </span>
                    Customer quotation and order
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    This record contains only customer-facing terms. Status buttons record
                    real events; they do not send email or WhatsApp messages.
                  </p>

                  {room.customerQuotes.length ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-4 rounded-lg border border-slate-200 bg-[#F7F8FA] p-4 sm:grid-cols-[1fr_220px]">
                        <div className="space-y-2">
                          <Label className="font-bold text-slate-800" htmlFor={`event-note-${opportunity.id}`}>
                            Evidence note for the next real event
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
                            Planned delivery (order only)
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

                      {room.customerQuotes.map((quote) => {
                        const order = room.orders.find(
                          (candidate) => candidate.quoteId === quote.id,
                        );
                        const nextStates = QUOTE_NEXT_STATES[quote.status] || [];
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
                                  <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
                                    <PackageCheck className="h-4 w-4" />
                                    {order.referenceCode} / {readable(order.status)}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex max-w-xl flex-wrap gap-2">
                                {nextStates.map((status) => (
                                  <Button
                                    key={status}
                                    type="button"
                                    size="sm"
                                    variant={status === "issued" || status === "accepted" ? "default" : "outline"}
                                    disabled={busy || eventNote.trim().length < 8}
                                    onClick={() =>
                                      quoteStatusMutation.mutate({
                                        quoteId: quote.id,
                                        status,
                                      })
                                    }
                                    className={
                                      status === "issued" || status === "accepted"
                                        ? "bg-[#07121F] font-black text-white hover:bg-[#14273B]"
                                        : "border-slate-300 bg-white text-slate-800"
                                    }
                                  >
                                    {status === "issued" ? (
                                      <FileCheck2 className="mr-2 h-4 w-4" />
                                    ) : null}
                                    Record {readable(status)}
                                  </Button>
                                ))}
                                {quote.status === "accepted" && !order ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy || eventNote.trim().length < 8}
                                    onClick={() => orderMutation.mutate(quote.id)}
                                    className="bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
                                  >
                                    <ShoppingCart className="mr-2 h-4 w-4" />
                                    Create tracked order
                                  </Button>
                                ) : null}
                              </div>
                            </div>
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
                              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                            >
                              <span className="truncate text-sm font-semibold text-slate-700">
                                {attachment.fileName}
                              </span>
                              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                                Evidence
                              </Badge>
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
