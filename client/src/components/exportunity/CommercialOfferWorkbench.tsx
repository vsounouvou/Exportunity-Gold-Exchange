import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  CheckCircle2,
  FileCheck2,
  Loader2,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export type SupplierQuoteForOffer = {
  id: string;
  referenceCode: string;
  status: string;
  values: {
    productName: string | null;
    specification: string | null;
    offeredQuantity: string | null;
    unitOfMeasure: string | null;
    currencyCode: string | null;
    totalAmount: string | null;
    leadTime: string | null;
    incoterm: string | null;
  };
  readiness: {
    offerPreparation: { ready: boolean; blockers: string[] };
  };
};

type OfferStatus =
  | "draft"
  | "under_review"
  | "ready_for_account_manager"
  | "issued"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";
type CommercialOffer = {
  id: string;
  referenceCode: string;
  requirementId: string;
  status: OfferStatus;
  visibility: "exportunity_internal" | "parties_to_transaction";
  source: {
    supplierQuoteId: string;
    supplierQuoteReferenceCode: string | null;
    supplierQuoteHash: string | null;
    supplierLegalName: string | null;
  };
  pricing: {
    version: string;
    hash: string;
    currencyCode: string;
    supplierCostMinor: string;
    additionalCostsMinor: string;
    totalCostMinor: string;
    targetGrossMarginBps: number;
    marginMinor: string;
    customerPriceMinor: string;
    display: {
      supplierCost: string;
      additionalCosts: string;
      totalCost: string;
      margin: string;
      customerPrice: string;
    };
    costStack: Array<{
      code: string;
      label: string;
      amountMinor: string;
      currencyCode: string;
      evidenceReference: string;
    }>;
    checklist: Record<string, boolean>;
    notes: string | null;
  };
  customerDraft: {
    totalAmount: string;
    lineItems: Array<Record<string, string>>;
    leadTime: string | null;
    validUntil: string;
    commercialTerms: string;
    customerNotes: string | null;
  };
  review: {
    submittedByUserId: number | null;
    submittedAt: string | null;
    approvedByUserId: number | null;
    approvedAt: string | null;
    decisionNotes: string | null;
  };
  customerResponse: {
    status: "accepted" | "declined" | null;
    hash: string | null;
    channel: string | null;
    reference: string | null;
    evidence: Record<string, unknown>;
    recordedByUserId: number | null;
    receivedAt: string | null;
  };
  order: {
    id: string;
    referenceCode: string | null;
    status: string | null;
    paymentStatus: string | null;
  } | null;
  governance: {
    exactMinorUnits: true;
    currencyConversionPerformed: false;
    customerOfferIssued: boolean;
    customerResponseRecorded: boolean;
    orderCreated: boolean;
    paymentCreated: false;
    separateIssueActionRequired: boolean;
    separateOrderActionRequired: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

type CommercialOffersResponse = {
  ok: boolean;
  items: CommercialOffer[];
  governance: {
    lifecycleLedger: true;
    internalDraftsOnly: false;
    exactMinorUnits: true;
    currencyConversionPerformed: false;
    automatedSupplierRanking: false;
    customerOfferIssuanceEnabled: true;
    externalOfferDeliveryEnabled: false;
    customerResponseRecordingEnabled: true;
    orderCreationEnabled: true;
    paymentCreationEnabled: false;
  };
};

const COST_FIELDS = [
  ["logistics", "Logistics"],
  ["customs_duties", "Customs and duties"],
  ["insurance", "Insurance"],
  ["inspection", "Inspection"],
  ["payment_provider", "Payment provider"],
  ["handling", "Handling"],
  ["taxes", "Taxes"],
  ["other", "Other approved cost"],
] as const;
type CostCode = (typeof COST_FIELDS)[number][0];
type CostForm = { amount: string; evidenceReference: string };
type OfferDraftForm = {
  targetGrossMarginBps: string;
  validUntil: string;
  commercialTerms: string;
  customerNotes: string;
  internalNotes: string;
  costs: Record<CostCode, CostForm>;
};

const SUBMISSION_CHECKLIST = [
  ["sourceQuoteReviewed", "I reviewed the qualified supplier quote and its source evidence"],
  ["costEvidenceReviewed", "Every included cost has a current evidence reference"],
  ["currencyAndNoConversionReviewed", "All amounts use one currency and no conversion was performed"],
  ["marginPolicyReviewed", "The gross-margin basis points are within the approved policy ceiling"],
  ["validityReviewed", "The customer validity does not overstate the reviewed supplier validity"],
  ["separateIssueRequired", "I understand review submission does not issue or send this offer"],
] as const;
type SubmissionKey = (typeof SUBMISSION_CHECKLIST)[number][0];

const APPROVAL_CHECKLIST = [
  ["sourceLineageApproved", "I approve the canonical supplier-quote lineage"],
  ["costStackApproved", "I approve every exact cost and its evidence"],
  ["marginApproved", "I approve the gross margin and resulting customer price"],
  ["customerTermsApproved", "I reviewed the customer-facing draft terms"],
  ["validityApproved", "I approve the bounded offer validity"],
  ["separateIssueRequired", "I understand pricing approval still does not issue or send the offer"],
] as const;
type ApprovalKey = (typeof APPROVAL_CHECKLIST)[number][0];

const ISSUE_CHECKLIST = [
  ["sourceQualificationRechecked", "I rechecked that the canonical supplier quote is still qualified"],
  ["approvedPricingHashRechecked", "I rechecked the approved exact pricing hash"],
  ["customerTermsAndPriceRechecked", "I rechecked the customer-facing price and terms"],
  ["validityWindowRechecked", "I rechecked that the offer validity window is still current"],
  ["customerContextConfirmed", "I confirmed the tenant-scoped customer context"],
  ["separateDeliveryRequired", "I understand issuance creates no email, SMS, WhatsApp, or other external delivery"],
] as const;
type IssueKey = (typeof ISSUE_CHECKLIST)[number][0];

const RESPONSE_CHECKLIST = [
  ["pricingHashRechecked", "I rechecked the exact pricing hash shown to the customer"],
  ["customerIdentityConfirmed", "I confirmed the response belongs to the tenant-scoped customer"],
  ["customerResponseEvidenceReviewed", "I reviewed the referenced response evidence"],
  ["responseRecordedWithoutExternalContact", "I understand this only records evidence and sends no message"],
  ["separateOrderActionRequired", "I understand acceptance does not create an order"],
] as const;
type ResponseKey = (typeof RESPONSE_CHECKLIST)[number][0];

const ORDER_CHECKLIST = [
  ["customerAcceptanceRechecked", "I rechecked the evidenced customer acceptance"],
  ["exactPriceRechecked", "I rechecked the accepted exact customer price"],
  ["noPaymentCollected", "No payment is being recorded by this action"],
  ["procurementNotStarted", "Procurement has not started"],
  ["separatePaymentActionRequired", "Payment requires a separate governed action"],
  ["separateFulfillmentActionRequired", "Fulfilment requires a separate governed action"],
] as const;
type OrderKey = (typeof ORDER_CHECKLIST)[number][0];

type ReviewForm = {
  decisionNotes: string;
  submission: Record<SubmissionKey, boolean>;
  approval: Record<ApprovalKey, boolean>;
  issuance: Record<IssueKey, boolean>;
  responseReceivedAt: string;
  responseChannel: string;
  responseEvidenceReference: string;
  customerStatement: string;
  response: Record<ResponseKey, boolean>;
  orderConfirmationNote: string;
  plannedDeliveryAt: string;
  order: Record<OrderKey, boolean>;
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100";

function localDateTimeInDays(days: number) {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function localDateTimeNow() {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function defaultDraft(): OfferDraftForm {
  return {
    targetGrossMarginBps: "1500",
    validUntil: localDateTimeInDays(14),
    commercialTerms:
      "Supply is subject to final procurement, compliance, and logistics validation by Exportunity.",
    customerNotes: "",
    internalNotes: "",
    costs: Object.fromEntries(
      COST_FIELDS.map(([code]) => [
        code,
        { amount: "", evidenceReference: "" },
      ]),
    ) as Record<CostCode, CostForm>,
  };
}

function defaultReview(): ReviewForm {
  return {
    decisionNotes: "",
    submission: Object.fromEntries(
      SUBMISSION_CHECKLIST.map(([key]) => [key, false]),
    ) as Record<SubmissionKey, boolean>,
    approval: Object.fromEntries(
      APPROVAL_CHECKLIST.map(([key]) => [key, false]),
    ) as Record<ApprovalKey, boolean>,
    issuance: Object.fromEntries(
      ISSUE_CHECKLIST.map(([key]) => [key, false]),
    ) as Record<IssueKey, boolean>,
    responseReceivedAt: localDateTimeNow(),
    responseChannel: "email",
    responseEvidenceReference: "",
    customerStatement: "",
    response: Object.fromEntries(
      RESPONSE_CHECKLIST.map(([key]) => [key, false]),
    ) as Record<ResponseKey, boolean>,
    orderConfirmationNote: "",
    plannedDeliveryAt: "",
    order: Object.fromEntries(
      ORDER_CHECKLIST.map(([key]) => [key, false]),
    ) as Record<OrderKey, boolean>,
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-600">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Not recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusStyle(status: OfferStatus) {
  if (status === "ready_for_account_manager") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }
  if (status === "under_review") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  return "border-sky-200 bg-sky-50 text-sky-950";
}

export function CommercialOfferWorkbench({
  supplierQuotes,
  requirementId,
}: {
  supplierQuotes: SupplierQuoteForOffer[];
  requirementId?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draftForms, setDraftForms] = useState<Record<string, OfferDraftForm>>({});
  const [reviewForms, setReviewForms] = useState<Record<string, ReviewForm>>({});
  const offersUrl = requirementId
    ? `/api/exportunity/commercial-offers?requirementId=${encodeURIComponent(requirementId)}`
    : "/api/exportunity/commercial-offers";
  const offersQuery = useQuery<CommercialOffersResponse>({
    queryKey: [offersUrl],
    staleTime: 10_000,
  });

  const draftForm = (quoteId: string) => draftForms[quoteId] || defaultDraft();
  const updateDraft = (quoteId: string, update: Partial<OfferDraftForm>) =>
    setDraftForms((current) => ({
      ...current,
      [quoteId]: { ...(current[quoteId] || defaultDraft()), ...update },
    }));
  const updateCost = (quoteId: string, code: CostCode, update: Partial<CostForm>) => {
    const current = draftForm(quoteId);
    updateDraft(quoteId, {
      costs: {
        ...current.costs,
        [code]: { ...current.costs[code], ...update },
      },
    });
  };
  const reviewForm = (offerId: string) => reviewForms[offerId] || defaultReview();
  const updateReview = (offerId: string, update: Partial<ReviewForm>) =>
    setReviewForms((current) => ({
      ...current,
      [offerId]: { ...(current[offerId] || defaultReview()), ...update },
    }));
  const invalidateOffers = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [offersUrl] }),
      ...(requirementId
        ? [
            queryClient.invalidateQueries({
              queryKey: [
                `/api/industrial/admin/requirements/${requirementId}/commercial-room`,
              ],
            }),
          ]
        : []),
    ]);

  const createMutation = useMutation({
    mutationFn: async (quote: SupplierQuoteForOffer) => {
      const form = draftForm(quote.id);
      if (!quote.readiness.offerPreparation.ready || !quote.values.totalAmount) {
        throw new Error(
          "The canonical supplier quote needs a source-backed total and complete offer-preparation evidence.",
        );
      }
      if (!/^\d{1,4}$/.test(form.targetGrossMarginBps)) {
        throw new Error("Enter gross margin as integer basis points; 1500 means 15%. ");
      }
      const validUntil = new Date(form.validUntil);
      if (Number.isNaN(validUntil.valueOf())) throw new Error("Choose a valid offer expiry.");
      if (form.commercialTerms.trim().length < 24) {
        throw new Error("Customer-facing commercial terms need at least 24 characters.");
      }
      const additionalCosts = COST_FIELDS.flatMap(([code, label]) => {
        const cost = form.costs[code];
        if (!cost.amount.trim()) return [];
        if (cost.evidenceReference.trim().length < 8) {
          throw new Error(`${label} needs an evidence reference of at least 8 characters.`);
        }
        return [
          {
            code,
            label,
            amount: cost.amount.trim(),
            evidenceReference: cost.evidenceReference.trim(),
          },
        ];
      });
      return apiRequest("/api/exportunity/commercial-offers", "POST", {
        sourceSupplierQuoteId: quote.id,
        targetGrossMarginBps: form.targetGrossMarginBps,
        validUntil: validUntil.toISOString(),
        commercialTerms: form.commercialTerms.trim(),
        customerNotes: form.customerNotes.trim() || undefined,
        internalNotes: form.internalNotes.trim() || undefined,
        additionalCosts,
      });
    },
    onSuccess: (data: any) => {
      invalidateOffers();
      toast({
        title: data?.created ? "Internal offer draft created" : "Existing exact draft returned",
        description:
          "Supplier cost, cost stack, and margin are hash-bound. No offer, order, payment, or message was issued.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Offer preparation was blocked",
        description: error?.message || "Review the source quote and exact cost inputs.",
        variant: "destructive",
      }),
  });

  const submitMutation = useMutation({
    mutationFn: async (offer: CommercialOffer) => {
      const form = reviewForm(offer.id);
      if (form.decisionNotes.trim().length < 24) {
        throw new Error("Record at least 24 characters of pricing-review rationale.");
      }
      if (!SUBMISSION_CHECKLIST.every(([key]) => form.submission[key])) {
        throw new Error("Every pricing submission attestation must be confirmed.");
      }
      return apiRequest(
        `/api/exportunity/commercial-offers/${offer.id}/submit`,
        "POST",
        {
          expectedPricingHash: offer.pricing.hash,
          decisionNotes: form.decisionNotes.trim(),
          checklist: form.submission,
        },
      );
    },
    onSuccess: () => {
      invalidateOffers();
      toast({
        title: "Pricing submitted for approval",
        description: "The exact pricing hash is frozen. The customer offer remains internal.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Pricing submission was blocked",
        description: error?.message || "Review all source and pricing attestations.",
        variant: "destructive",
      }),
  });

  const approveMutation = useMutation({
    mutationFn: async (offer: CommercialOffer) => {
      const form = reviewForm(offer.id);
      if (form.decisionNotes.trim().length < 24) {
        throw new Error("Record at least 24 characters of approval rationale.");
      }
      if (!APPROVAL_CHECKLIST.every(([key]) => form.approval[key])) {
        throw new Error("Every pricing approval attestation must be confirmed.");
      }
      return apiRequest(
        `/api/exportunity/commercial-offers/${offer.id}/approve`,
        "POST",
        {
          expectedPricingHash: offer.pricing.hash,
          decisionNotes: form.decisionNotes.trim(),
          checklist: form.approval,
        },
      );
    },
    onSuccess: () => {
      invalidateOffers();
      toast({
        title: "Pricing approved for account-manager preparation",
        description:
          "This is not customer issuance. No message, order, payment, or procurement action was created.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Pricing approval was blocked",
        description: error?.message || "Review the exact pricing hash and attestations.",
        variant: "destructive",
      }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (offer: CommercialOffer) => {
      const notes = reviewForm(offer.id).decisionNotes.trim();
      if (notes.length < 24) {
        throw new Error("Record at least 24 characters explaining the pricing rejection.");
      }
      return apiRequest(
        `/api/exportunity/commercial-offers/${offer.id}/reject`,
        "POST",
        { expectedPricingHash: offer.pricing.hash, decisionNotes: notes },
      );
    },
    onSuccess: () => {
      invalidateOffers();
      toast({
        title: "Pricing returned to draft",
        description: "The rejection rationale remains in the audit trail. Nothing was issued.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Pricing rejection was blocked",
        description: error?.message || "Reload and review the current pricing state.",
        variant: "destructive",
      }),
  });

  const issueMutation = useMutation({
    mutationFn: async (offer: CommercialOffer) => {
      const form = reviewForm(offer.id);
      if (form.decisionNotes.trim().length < 24) {
        throw new Error("Record at least 24 characters of issuance rationale.");
      }
      if (!ISSUE_CHECKLIST.every(([key]) => form.issuance[key])) {
        throw new Error("Every customer-offer issuance attestation must be confirmed.");
      }
      return apiRequest(
        `/api/exportunity/commercial-offers/${offer.id}/issue`,
        "POST",
        {
          expectedPricingHash: offer.pricing.hash,
          decisionNotes: form.decisionNotes.trim(),
          checklist: form.issuance,
        },
      );
    },
    onSuccess: () => {
      invalidateOffers();
      toast({
        title: "Exact customer offer issued",
        description:
          "The governed quotation is now recorded for the customer. No email, SMS, WhatsApp, order, or payment was created.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Customer-offer issuance was blocked",
        description:
          error?.message || "Reload and recheck the current source, pricing hash, customer, and validity.",
        variant: "destructive",
      }),
  });

  const customerResponseMutation = useMutation({
    mutationFn: async (input: {
      offer: CommercialOffer;
      response: "accepted" | "declined";
    }) => {
      const form = reviewForm(input.offer.id);
      const responseReceivedAt = new Date(form.responseReceivedAt);
      if (Number.isNaN(responseReceivedAt.valueOf())) {
        throw new Error("Record the actual customer-response time.");
      }
      if (form.responseEvidenceReference.trim().length < 8) {
        throw new Error("Record an evidence reference of at least 8 characters.");
      }
      if (form.customerStatement.trim().length < 4) {
        throw new Error("Record the customer's actual statement.");
      }
      if (form.decisionNotes.trim().length < 24) {
        throw new Error("Record at least 24 characters explaining the response evidence.");
      }
      if (!RESPONSE_CHECKLIST.every(([key]) => form.response[key])) {
        throw new Error("Every customer-response evidence attestation must be confirmed.");
      }
      return apiRequest(
        `/api/exportunity/commercial-offers/${input.offer.id}/customer-response`,
        "POST",
        {
          expectedPricingHash: input.offer.pricing.hash,
          response: input.response,
          responseReceivedAt: responseReceivedAt.toISOString(),
          channel: form.responseChannel,
          evidenceReference: form.responseEvidenceReference.trim(),
          customerStatement: form.customerStatement.trim(),
          decisionNotes: form.decisionNotes.trim(),
          checklist: form.response,
        },
      );
    },
    onSuccess: (_data: unknown, variables) => {
      invalidateOffers();
      toast({
        title:
          variables.response === "accepted"
            ? "Customer acceptance recorded"
            : "Customer decline recorded",
        description:
          "The response is bound to the exact pricing hash. No message, order, payment, or procurement action occurred.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Customer response was blocked",
        description:
          error?.message || "Reload and review the issued offer and response evidence.",
        variant: "destructive",
      }),
  });

  const createOrderMutation = useMutation({
    mutationFn: async (offer: CommercialOffer) => {
      const form = reviewForm(offer.id);
      if (!offer.customerResponse.hash || offer.customerResponse.status !== "accepted") {
        throw new Error("An evidenced customer acceptance is required first.");
      }
      if (form.orderConfirmationNote.trim().length < 24) {
        throw new Error("Record at least 24 characters of order-confirmation rationale.");
      }
      if (!ORDER_CHECKLIST.every(([key]) => form.order[key])) {
        throw new Error("Every exact-order separation attestation must be confirmed.");
      }
      const plannedDeliveryAt = form.plannedDeliveryAt
        ? new Date(form.plannedDeliveryAt)
        : null;
      if (plannedDeliveryAt && Number.isNaN(plannedDeliveryAt.valueOf())) {
        throw new Error("Choose a valid planned delivery time or leave it empty.");
      }
      return apiRequest(
        `/api/exportunity/commercial-offers/${offer.id}/order`,
        "POST",
        {
          expectedPricingHash: offer.pricing.hash,
          expectedCustomerResponseHash: offer.customerResponse.hash,
          confirmationNote: form.orderConfirmationNote.trim(),
          plannedDeliveryAt: plannedDeliveryAt?.toISOString() || null,
          checklist: form.order,
        },
      );
    },
    onSuccess: (data: any) => {
      invalidateOffers();
      toast({
        title: data?.created ? "Exact unpaid order created" : "Existing exact order returned",
        description:
          "The accepted price and response evidence are hash-bound. No payment, procurement, booking, or fulfilment action occurred.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Order creation was blocked",
        description:
          error?.message || "Reload and review the accepted price and customer evidence.",
        variant: "destructive",
      }),
  });

  const eligibleQuotes = supplierQuotes.filter(
    (quote) => quote.status === "qualified" && quote.readiness.offerPreparation.ready,
  );

  return (
    <section className="mt-6 rounded-3xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-indigo-800">
            <Calculator className="h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-[0.14em]">
              Phase F–G commercial execution
            </span>
          </div>
          <h2 className="mt-2 text-xl font-black text-slate-950">
            Exact offer, customer response, and unpaid order ledger
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Prepare Exportunity&apos;s customer price from one qualified supplier quote, evidence-backed costs,
            and an integer gross-margin policy. Supplier cost stays internal. Issuance, evidenced customer
            response, order creation, payment, procurement, and fulfilment remain separate governed actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border border-indigo-200 bg-white text-indigo-950">Exact minor units</Badge>
          <Badge className="border border-slate-200 bg-white text-slate-800">No currency conversion</Badge>
          <Badge className="border border-amber-200 bg-amber-50 text-amber-950">External delivery disabled</Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {eligibleQuotes.map((quote) => {
          const form = draftForm(quote.id);
          return (
            <details key={quote.id} className="rounded-2xl border border-indigo-200 bg-white p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">
                      {quote.values.productName || "Qualified supplier quote"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {quote.referenceCode} • {quote.values.offeredQuantity || "Quantity missing"}{" "}
                      {quote.values.unitOfMeasure || ""}
                    </div>
                  </div>
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-950">
                    {quote.values.totalAmount || "Total missing"} {quote.values.currencyCode || ""}
                  </Badge>
                </div>
                <div className="mt-3 text-sm font-bold text-indigo-800">Prepare internal offer draft</div>
              </summary>

              <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
                <Field label="Target gross margin (bps)" hint="1500 = 15%; policy ceiling is 5000.">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={form.targetGrossMarginBps}
                    onChange={(event) =>
                      updateDraft(quote.id, { targetGrossMarginBps: event.target.value.replace(/\D/g, "").slice(0, 4) })
                    }
                  />
                </Field>
                <Field label="Customer offer valid until" hint="Must remain within reviewed supplier validity.">
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={form.validUntil}
                    onChange={(event) => updateDraft(quote.id, { validUntil: event.target.value })}
                  />
                </Field>
              </div>

              <div className="mt-4 grid gap-3">
                <Field label="Customer-facing commercial terms" hint="Draft only; approval will not issue it.">
                  <textarea
                    className={`${inputClass} min-h-24`}
                    value={form.commercialTerms}
                    maxLength={4000}
                    onChange={(event) => updateDraft(quote.id, { commercialTerms: event.target.value })}
                  />
                </Field>
                <Field label="Customer note">
                  <textarea
                    className={`${inputClass} min-h-16`}
                    value={form.customerNotes}
                    maxLength={2000}
                    onChange={(event) => updateDraft(quote.id, { customerNotes: event.target.value })}
                  />
                </Field>
                <Field label="Internal pricing note">
                  <textarea
                    className={`${inputClass} min-h-16`}
                    value={form.internalNotes}
                    maxLength={2000}
                    onChange={(event) => updateDraft(quote.id, { internalNotes: event.target.value })}
                  />
                </Field>
              </div>

              <div className="mt-4">
                <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-600">
                  Additional cost stack
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Use exact decimals with a dot and no grouping separator. Empty rows are omitted.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {COST_FIELDS.map(([code, label]) => (
                    <div key={code} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-sm font-black text-slate-800">{label}</div>
                      <input
                        className={`${inputClass} mt-2`}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={form.costs[code].amount}
                        onChange={(event) => updateCost(quote.id, code, { amount: event.target.value })}
                      />
                      <input
                        className={`${inputClass} mt-2`}
                        placeholder="Evidence reference"
                        value={form.costs[code].evidenceReference}
                        onChange={(event) =>
                          updateCost(quote.id, code, { evidenceReference: event.target.value })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  className="bg-indigo-800 font-black text-white hover:bg-indigo-900"
                  disabled={createMutation.isPending}
                  onClick={() => createMutation.mutate(quote)}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LockKeyhole className="mr-2 h-4 w-4" />
                  )}
                  Create hash-bound internal draft
                </Button>
              </div>
            </details>
          );
        })}
      </div>

      {!eligibleQuotes.length ? (
        <div className="mt-5 rounded-2xl border border-dashed border-indigo-200 bg-white p-6 text-sm text-slate-600">
          No qualified canonical supplier quote is offer-preparation-ready yet. Missing source facts remain visible
          above and cannot be invented here.
        </div>
      ) : null}

      <div className="mt-6 border-t border-indigo-200 pt-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-800" />
          <h3 className="font-black text-slate-950">Internal offer review ledger</h3>
        </div>
        {offersQuery.isLoading ? (
          <div className="grid min-h-24 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-700" />
          </div>
        ) : offersQuery.isError ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            Commercial offer drafts could not be loaded. No pricing state was changed.
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {(offersQuery.data?.items || []).map((offer) => {
              const form = reviewForm(offer.id);
              return (
                <article key={offer.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-slate-950">{offer.referenceCode}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Source {offer.source.supplierQuoteReferenceCode || offer.source.supplierQuoteId} •{" "}
                        {offer.source.supplierLegalName || "Supplier identity retained in source ledger"}
                      </div>
                    </div>
                    <Badge className={statusStyle(offer.status)}>{offer.status.replace(/_/g, " ")}</Badge>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      ["Supplier cost", offer.pricing.display.supplierCost],
                      ["Additional costs", offer.pricing.display.additionalCosts],
                      ["Total cost", offer.pricing.display.totalCost],
                      [`Margin (${offer.pricing.targetGrossMarginBps} bps)`, offer.pricing.display.margin],
                      ["Customer price", offer.pricing.display.customerPrice],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
                        <div className="mt-1 font-black text-slate-950">{value}</div>
                      </div>
                    ))}
                  </div>

                  <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-black">Exact evidence-backed cost stack</summary>
                    <div className="mt-2 space-y-2">
                      {offer.pricing.costStack.map((cost) => (
                        <div key={cost.code} className="rounded-lg bg-white p-2 text-xs">
                          <div className="font-black">{cost.label}: {cost.amountMinor} minor units</div>
                          <div className="mt-1 break-all text-slate-500">{cost.evidenceReference}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 break-all font-mono text-[10px] text-slate-500">
                      Pricing hash {offer.pricing.hash}
                    </div>
                  </details>

                  <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-sm">
                    <div className="font-black">
                      {offer.governance.customerOfferIssued
                        ? "Issued exact customer offer"
                        : "Customer draft — not issued"}
                    </div>
                    <div className="mt-1">Valid until {formatDate(offer.customerDraft.validUntil)}</div>
                    <div className="mt-1 text-slate-600">{offer.customerDraft.commercialTerms}</div>
                  </div>

                  {offer.status === "draft" || offer.status === "under_review" ? (
                    <div className="mt-4 rounded-xl border border-slate-200 p-4">
                      <Field label={offer.status === "draft" ? "Submission rationale" : "Approval or rejection rationale"}>
                        <textarea
                          className={`${inputClass} min-h-20`}
                          value={form.decisionNotes}
                          maxLength={2000}
                          onChange={(event) => updateReview(offer.id, { decisionNotes: event.target.value })}
                        />
                      </Field>

                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {(offer.status === "draft" ? SUBMISSION_CHECKLIST : APPROVAL_CHECKLIST).map(
                          ([key, label]) => {
                            const checked =
                              offer.status === "draft"
                                ? form.submission[key as SubmissionKey]
                                : form.approval[key as ApprovalKey];
                            return (
                              <label key={key} className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 accent-indigo-700"
                                  checked={checked}
                                  onChange={(event) => {
                                    if (offer.status === "draft") {
                                      updateReview(offer.id, {
                                        submission: { ...form.submission, [key]: event.target.checked },
                                      });
                                    } else {
                                      updateReview(offer.id, {
                                        approval: { ...form.approval, [key]: event.target.checked },
                                      });
                                    }
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            );
                          },
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        {offer.status === "draft" ? (
                          <Button
                            className="bg-indigo-800 font-black text-white hover:bg-indigo-900"
                            disabled={submitMutation.isPending}
                            onClick={() => submitMutation.mutate(offer)}
                          >
                            {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
                            Submit exact pricing for approval
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              className="border-red-300 text-red-800 hover:bg-red-50"
                              disabled={rejectMutation.isPending}
                              onClick={() => rejectMutation.mutate(offer)}
                            >
                              <XCircle className="mr-2 h-4 w-4" /> Reject pricing
                            </Button>
                            <Button
                              className="bg-emerald-700 font-black text-white hover:bg-emerald-800"
                              disabled={approveMutation.isPending}
                              onClick={() => approveMutation.mutate(offer)}
                            >
                              {approveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                              Approve pricing only
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : offer.status === "ready_for_account_manager" ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                      <div className="flex items-center gap-2 font-black">
                        <CheckCircle2 className="h-5 w-5" /> Pricing approved for governed issuance
                      </div>
                      <p className="mt-1">
                        Approval recorded {formatDate(offer.review.approvedAt)}. Issuance finalizes the exact
                        customer quotation in Exportunity; it does not send a message or create an order.
                      </p>
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
                        <Field label="Issuance rationale" hint="Record the customer context and why the approved offer is ready now.">
                          <textarea
                            className={`${inputClass} min-h-20`}
                            value={form.decisionNotes}
                            maxLength={2000}
                            onChange={(event) => updateReview(offer.id, { decisionNotes: event.target.value })}
                          />
                        </Field>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {ISSUE_CHECKLIST.map(([key, label]) => (
                            <label key={key} className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-emerald-700"
                                checked={form.issuance[key]}
                                onChange={(event) =>
                                  updateReview(offer.id, {
                                    issuance: { ...form.issuance, [key]: event.target.checked },
                                  })
                                }
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button
                            className="bg-emerald-800 font-black text-white hover:bg-emerald-900"
                            disabled={issueMutation.isPending}
                            onClick={() => issueMutation.mutate(offer)}
                          >
                            {issueMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <FileCheck2 className="mr-2 h-4 w-4" />
                            )}
                            Issue exact customer offer
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : offer.status === "issued" ? (
                    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                      <div className="flex items-center gap-2 font-black">
                        <FileCheck2 className="h-5 w-5" /> Record evidenced customer response
                      </div>
                      <p className="mt-1">
                        This internal action records what the customer already communicated. It does not contact
                        the customer and acceptance does not create an order.
                      </p>
                      <div className="mt-4 grid gap-3 rounded-xl border border-sky-200 bg-white p-4 md:grid-cols-2">
                        <Field label="Response received at">
                          <input
                            type="datetime-local"
                            className={inputClass}
                            value={form.responseReceivedAt}
                            onChange={(event) =>
                              updateReview(offer.id, { responseReceivedAt: event.target.value })
                            }
                          />
                        </Field>
                        <Field label="Approved response channel">
                          <select
                            className={inputClass}
                            value={form.responseChannel}
                            onChange={(event) =>
                              updateReview(offer.id, { responseChannel: event.target.value })
                            }
                          >
                            <option value="email">Email</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="phone">Phone</option>
                            <option value="platform">Exportunity platform</option>
                            <option value="signed_document">Signed document</option>
                            <option value="in_person">In person</option>
                            <option value="other">Other governed evidence</option>
                          </select>
                        </Field>
                        <Field label="Evidence reference" hint="Message ID, signed document, call record, or audit reference.">
                          <input
                            className={inputClass}
                            value={form.responseEvidenceReference}
                            maxLength={500}
                            onChange={(event) =>
                              updateReview(offer.id, {
                                responseEvidenceReference: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label="Customer statement">
                          <textarea
                            className={`${inputClass} min-h-20`}
                            value={form.customerStatement}
                            maxLength={1000}
                            onChange={(event) =>
                              updateReview(offer.id, { customerStatement: event.target.value })
                            }
                          />
                        </Field>
                        <div className="md:col-span-2">
                          <Field label="Response evidence rationale">
                            <textarea
                              className={`${inputClass} min-h-20`}
                              value={form.decisionNotes}
                              maxLength={2000}
                              onChange={(event) =>
                                updateReview(offer.id, { decisionNotes: event.target.value })
                              }
                            />
                          </Field>
                        </div>
                        <div className="grid gap-2 md:col-span-2 md:grid-cols-2">
                          {RESPONSE_CHECKLIST.map(([key, label]) => (
                            <label key={key} className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-sky-700"
                                checked={form.response[key]}
                                onChange={(event) =>
                                  updateReview(offer.id, {
                                    response: {
                                      ...form.response,
                                      [key]: event.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
                          <Button
                            variant="outline"
                            className="border-red-300 text-red-800 hover:bg-red-50"
                            disabled={customerResponseMutation.isPending}
                            onClick={() =>
                              customerResponseMutation.mutate({ offer, response: "declined" })
                            }
                          >
                            <XCircle className="mr-2 h-4 w-4" /> Record decline
                          </Button>
                          <Button
                            className="bg-emerald-800 font-black text-white hover:bg-emerald-900"
                            disabled={customerResponseMutation.isPending}
                            onClick={() =>
                              customerResponseMutation.mutate({ offer, response: "accepted" })
                            }
                          >
                            {customerResponseMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Record acceptance evidence
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : offer.status === "accepted" ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                      <div className="flex items-center gap-2 font-black">
                        <CheckCircle2 className="h-5 w-5" /> Exact customer acceptance recorded
                      </div>
                      <p className="mt-1">
                        Received {formatDate(offer.customerResponse.receivedAt)} via {offer.customerResponse.channel || "governed evidence"}.
                        The response hash remains bound to the accepted pricing hash.
                      </p>
                      <div className="mt-2 break-all font-mono text-[10px] text-emerald-800">
                        Response hash {offer.customerResponse.hash}
                      </div>
                      {offer.order ? (
                        <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2 font-black">
                            <PackageCheck className="h-5 w-5" />
                            {offer.order.referenceCode || "Exact order"}
                            <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-950">
                              {offer.order.status || "confirmed"}
                            </Badge>
                            <Badge className="border border-amber-200 bg-amber-50 text-amber-950">
                              Payment {offer.order.paymentStatus || "unpaid"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-slate-600">
                            Order creation did not collect payment, start procurement, contact a provider, or initialize fulfilment.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
                          <div className="flex items-center gap-2 font-black text-slate-950">
                            <ShoppingCart className="h-5 w-5 text-emerald-800" /> Create exact unpaid order
                          </div>
                          <p className="mt-1 text-slate-600">
                            This creates the internal order ledger only. Payment, procurement, carrier booking,
                            and fulfilment remain separate governed actions.
                          </p>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <Field label="Order confirmation rationale">
                              <textarea
                                className={`${inputClass} min-h-20`}
                                value={form.orderConfirmationNote}
                                maxLength={2000}
                                onChange={(event) =>
                                  updateReview(offer.id, {
                                    orderConfirmationNote: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label="Planned delivery" hint="Optional; it must be in the future.">
                              <input
                                type="datetime-local"
                                className={inputClass}
                                value={form.plannedDeliveryAt}
                                onChange={(event) =>
                                  updateReview(offer.id, {
                                    plannedDeliveryAt: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <div className="grid gap-2 md:col-span-2 md:grid-cols-2">
                              {ORDER_CHECKLIST.map(([key, label]) => (
                                <label key={key} className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 accent-emerald-700"
                                    checked={form.order[key]}
                                    onChange={(event) =>
                                      updateReview(offer.id, {
                                        order: {
                                          ...form.order,
                                          [key]: event.target.checked,
                                        },
                                      })
                                    }
                                  />
                                  <span>{label}</span>
                                </label>
                              ))}
                            </div>
                            <div className="flex justify-end md:col-span-2">
                              <Button
                                className="bg-emerald-900 font-black text-white hover:bg-emerald-950"
                                disabled={createOrderMutation.isPending}
                                onClick={() => createOrderMutation.mutate(offer)}
                              >
                                {createOrderMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <ShoppingCart className="mr-2 h-4 w-4" />
                                )}
                                Create exact unpaid order
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                      <div className="flex items-center gap-2 font-black">
                        {offer.status === "declined" ? (
                          <XCircle className="h-5 w-5 text-red-700" />
                        ) : (
                          <ShieldCheck className="h-5 w-5 text-slate-700" />
                        )}
                        Customer offer {offer.status.replace(/_/g, " ")}
                      </div>
                      <p className="mt-1">
                        The exact quotation, response evidence, and audit history remain preserved. No order or
                        payment was created by this state.
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
            {!(offersQuery.data?.items.length || 0) ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                No internal Exportunity offer draft has been prepared yet.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
