import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { useLocale } from "@/contexts/LocaleContext";

type IndustrialOrderPaymentResponse = {
  ok: true;
  order: {
    id: string;
    referenceCode: string;
    status: string;
    currencyCode: string;
    totalAmount: string | null;
    lineItems: Array<Record<string, string>>;
    commercialTerms: string | null;
    deliveryNotes: string | null;
    plannedDeliveryAt: string | null;
    confirmedAt: string | null;
    completedAt: string | null;
    paymentStatus: string;
    paidAmount: string | null;
    paidCurrencyCode: string | null;
    paidAt: string | null;
  };
  requirement: {
    id: string;
    referenceCode: string;
    title: string;
    quantityText: string | null;
    deliveryCountryCode: string | null;
    deliveryCity: string | null;
    requiredBy: string | null;
  };
  fulfillment: {
    trackingCode: string;
    kind: string;
    status: string;
    publicEta: string | null;
    deliveredAt: string | null;
    services: Array<{
      serviceType: string;
      status: string;
      label: string | null;
    }>;
    timeline: Array<{
      id: string;
      sequence: number;
      eventType: string;
      planStatus: string | null;
      title: string;
      message: string | null;
      occurredAt: string;
      evidence: Array<{
        label: string;
        url: string | null;
        reference: string | null;
      }>;
      proof: {
        method: string;
        recipientName: string | null;
        condition: string | null;
        deliveredAt: string | null;
        reference: string | null;
      } | null;
    }>;
  } | null;
  payment: {
    payable: boolean;
    amount: string | null;
    currency: string;
    blockCode: string | null;
    blockMessage: string | null;
    provider: "flutterwave";
  };
};

type FlutterwaveCheckout =
  | { type: "redirect"; link: string }
  | {
      type: "otp" | "pin";
      chargeId: string | null;
      returnPath: string;
      message?: string | null;
    }
  | { type: "status"; returnPath: string };

type FlutterwaveResponse = {
  ok: true;
  paymentId: string;
  checkout: FlutterwaveCheckout;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatCardNumber(value: string) {
  return digitsOnly(value)
    .slice(0, 19)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

function relativePath(value: string) {
  const path = String(value || "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "/industrial";
}

function money(value: number | string | null, currency: string) {
  const exact = String(value ?? "").trim();
  const match = exact.match(/^(0|[1-9]\d*)(?:\.(\d{1,3}))?$/);
  if (!match) return `-- ${currency}`;
  const whole = match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${whole}${match[2] ? `.${match[2]}` : ""}`;
}

function readable(value: string) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function IndustrialOrderPaymentPage({ orderId }: { orderId: string }) {
  const session = useSession();
  const { language } = useLocale();
  const [, navigate] = useLocation();
  const french = String(language || "").toLowerCase().startsWith("fr");
  const copy = french
    ? {
        eyebrow: "Paiement de commande industrielle",
        title: "Confirmer le paiement en toute securite",
        back: "Retour a Exportunity",
        loading: "Chargement de la commande...",
        unavailable: "Cette commande ne peut pas etre chargee.",
        requirement: "Besoin commercial",
        order: "Commande",
        amount: "Montant confirme par Exportunity",
        card: "Carte de paiement",
        cardNumber: "Numero de carte",
        month: "Mois",
        year: "Annee",
        cvv: "CVV",
        pay: "Payer la commande",
        paying: "Securisation du paiement...",
        paid: "Paiement confirme",
        paidDetail:
          "Le paiement est verifie. Le suivi gouverne relie maintenant l'approvisionnement, l'inspection, le transport, la douane et la livraison.",
        tracking: "Suivi de livraison",
        trackingPending: "Le plan de suivi est en cours d'initialisation.",
        eta: "Estimation publique",
        services: "Etapes de service",
        timeline: "Jalons verifies",
        refresh: "Actualiser",
        blocked: "Paiement indisponible",
        governed:
          "Le montant et la devise proviennent de la commande acceptee. Ils ne peuvent pas etre modifies depuis cette page.",
        challenge: "Code de verification",
        authorize: "Confirmer le code",
      }
    : {
        eyebrow: "Industrial order payment",
        title: "Confirm payment securely",
        back: "Back to Exportunity",
        loading: "Loading the order...",
        unavailable: "This order could not be loaded.",
        requirement: "Commercial requirement",
        order: "Order",
        amount: "Exportunity-confirmed amount",
        card: "Payment card",
        cardNumber: "Card number",
        month: "Month",
        year: "Year",
        cvv: "CVV",
        pay: "Pay this order",
        paying: "Securing payment...",
        paid: "Payment confirmed",
        paidDetail:
          "Payment is verified. Governed tracking now connects procurement, inspection, freight, customs, and final delivery.",
        tracking: "Delivery tracking",
        trackingPending: "The tracking plan is being initialized.",
        eta: "Public estimate",
        services: "Service stages",
        timeline: "Verified milestones",
        refresh: "Refresh",
        blocked: "Payment unavailable",
        governed:
          "The amount and currency come from the accepted order. They cannot be changed from this page.",
        challenge: "Verification code",
        authorize: "Confirm code",
      };

  const headers = useMemo(() => {
    const next: Record<string, string> = {};
    if (session.token) next.Authorization = `Bearer ${session.token}`;
    return next;
  }, [session.token]);
  const query = useQuery<IndustrialOrderPaymentResponse>({
    queryKey: ["/api/industrial/orders", orderId, session.token],
    queryFn: () =>
      apiRequest(`/api/industrial/orders/${encodeURIComponent(orderId)}`, {
        headers,
      }) as Promise<IndustrialOrderPaymentResponse>,
    enabled: Boolean(orderId && session.token),
    staleTime: 0,
  });

  const [card, setCard] = useState({
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{
    paymentId: string;
    chargeId: string | null;
    type: "otp" | "pin";
    returnPath: string;
    value: string;
    message: string | null;
  } | null>(null);

  const cardValid = useMemo(() => {
    const cardDigits = digitsOnly(card.cardNumber);
    const month = Number.parseInt(card.expiryMonth || "0", 10);
    const year = digitsOnly(card.expiryYear);
    const cvv = digitsOnly(card.cvv);
    return (
      cardDigits.length >= 12 &&
      cardDigits.length <= 19 &&
      month >= 1 &&
      month <= 12 &&
      (year.length === 2 || year.length === 4) &&
      cvv.length >= 3 &&
      cvv.length <= 4
    );
  }, [card]);

  const returnPath = `/industrial/orders/${encodeURIComponent(orderId)}/pay`;

  const handleCheckout = (paymentId: string, checkout: FlutterwaveCheckout) => {
    if (checkout.type === "redirect") {
      const link = String(checkout.link || "").trim();
      if (!link) throw new Error("Flutterwave checkout link is missing.");
      window.location.assign(link);
      return;
    }
    if (checkout.type === "otp" || checkout.type === "pin") {
      setChallenge({
        paymentId,
        chargeId: checkout.chargeId || null,
        type: checkout.type,
        returnPath: checkout.returnPath,
        value: "",
        message: checkout.message || null,
      });
      return;
    }
    navigate(relativePath(checkout.returnPath));
  };

  const startPayment = async () => {
    if (!cardValid || !query.data?.payment.payable) return;
    setBusy(true);
    setError(null);
    try {
      const response = (await apiRequest("/api/payments/flutterwave/init", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "INDUSTRIAL_ORDER_PAYMENT",
          industrialOrderId: orderId,
          returnUrl: returnPath,
          paymentMethod: {
            type: "card",
            card: {
              cardNumber: digitsOnly(card.cardNumber),
              expiryMonth: card.expiryMonth,
              expiryYear: card.expiryYear,
              cvv: digitsOnly(card.cvv),
            },
          },
        }),
      })) as FlutterwaveResponse;
      handleCheckout(response.paymentId, response.checkout);
    } catch (paymentError: any) {
      setError(paymentError?.message || "Payment could not be initialized.");
    } finally {
      setBusy(false);
    }
  };

  const authorize = async () => {
    if (!challenge || !digitsOnly(challenge.value)) return;
    setBusy(true);
    setError(null);
    try {
      const response = (await apiRequest("/api/payments/flutterwave/authorize", {
        method: "POST",
        headers,
        body: JSON.stringify({
          paymentId: challenge.paymentId,
          chargeId: challenge.chargeId,
          next: returnPath,
          type: challenge.type,
          [challenge.type]: digitsOnly(challenge.value),
        }),
      })) as FlutterwaveResponse;
      handleCheckout(response.paymentId, response.checkout);
    } catch (authorizationError: any) {
      setError(authorizationError?.message || "Payment authorization failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F4F6F8] text-[#07121F]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" onClick={() => navigate("/industrial")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {copy.back}
          </Button>
          <img
            src="/tenants/exportunity/logo.svg"
            alt="Exportunity"
            className="h-9 w-auto"
          />
        </div>

        <div className="mx-auto my-auto grid w-full max-w-5xl gap-6 py-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-5">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#A87308]">
                {copy.eyebrow}
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                {copy.title}
              </h1>
            </div>

            {query.isLoading ? (
              <Card className="border-slate-200 bg-white">
                <CardContent className="flex items-center gap-3 py-10 text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {copy.loading}
                </CardContent>
              </Card>
            ) : query.isError || !query.data ? (
              <Card className="border-rose-200 bg-rose-50">
                <CardContent className="py-8 text-rose-800">{copy.unavailable}</CardContent>
              </Card>
            ) : (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>{query.data.requirement.title}</CardTitle>
                    <Badge variant="outline">{readable(query.data.order.status)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        {copy.requirement}
                      </div>
                      <div className="mt-1 font-black">{query.data.requirement.referenceCode}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        {[query.data.requirement.quantityText, query.data.requirement.deliveryCity]
                          .filter(Boolean)
                          .join(" / ") || "--"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        {copy.order}
                      </div>
                      <div className="mt-1 font-black">{query.data.order.referenceCode}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        {readable(query.data.order.paymentStatus)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                    <div className="text-xs font-black uppercase tracking-wide text-amber-800">
                      {copy.amount}
                    </div>
                    <div className="mt-2 text-3xl font-black text-[#07121F]">
                      {money(query.data.payment.amount, query.data.payment.currency)}
                    </div>
                  </div>

                  <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>{copy.governed}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          <section>
            {query.data?.order.paymentStatus === "paid" ? (
              <Card className="border-emerald-200 bg-white shadow-sm">
                <CardContent className="space-y-6 py-7">
                  <div className="text-center">
                    <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" />
                    <h2 className="mt-3 text-2xl font-black">{copy.paid}</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                      {copy.paidDetail}
                    </p>
                  </div>

                  {query.data.fulfillment ? (
                    <div className="space-y-5 border-t border-slate-200 pt-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-black text-[#07121F]">
                            <Truck className="h-4 w-4 text-[#A87308]" />
                            {copy.tracking}
                          </div>
                          <div className="mt-1 font-mono text-sm font-black text-slate-800">
                            {query.data.fulfillment.trackingCode}
                          </div>
                        </div>
                        <Badge className="bg-[#07121F] text-white">
                          {readable(query.data.fulfillment.status)}
                        </Badge>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                          {copy.services}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {query.data.fulfillment.services.map((service) => (
                            <Badge
                              key={service.serviceType}
                              variant="outline"
                              className="border-slate-300 bg-white text-slate-700"
                            >
                              {service.label || readable(service.serviceType)}: {readable(service.status)}
                            </Badge>
                          ))}
                        </div>
                        {query.data.fulfillment.publicEta ? (
                          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <Clock3 className="h-3.5 w-3.5" />
                            {copy.eta}: {new Intl.DateTimeFormat(undefined, {
                              dateStyle: "medium",
                            }).format(new Date(query.data.fulfillment.publicEta))}
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                          {copy.timeline}
                        </div>
                        <div className="mt-2 space-y-2">
                          {[...query.data.fulfillment.timeline]
                            .reverse()
                            .map((event) => (
                              <div
                                key={event.id}
                                className="border-l-2 border-emerald-300 py-1 pl-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-black text-[#07121F]">
                                    {event.title}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    {new Intl.DateTimeFormat(undefined, {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    }).format(new Date(event.occurredAt))}
                                  </span>
                                </div>
                                {event.message ? (
                                  <p className="mt-1 text-xs leading-5 text-slate-600">
                                    {event.message}
                                  </p>
                                ) : null}
                                {event.proof ? (
                                  <p className="mt-1 text-xs font-semibold text-emerald-800">
                                    {readable(event.proof.method)}
                                    {event.proof.reference ? ` / ${event.proof.reference}` : ""}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      {copy.trackingPending}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-center gap-2 border-t border-slate-200 pt-5">
                    <Button
                      variant="outline"
                      disabled={query.isFetching}
                      onClick={() => query.refetch()}
                    >
                      {query.isFetching ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {copy.refresh}
                    </Button>
                    <Button className="bg-[#07121F] text-white" onClick={() => navigate("/industrial")}>
                      <PackageCheck className="mr-2 h-4 w-4" />
                      {copy.back}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : query.data && !query.data.payment.payable ? (
              <Card className="border-amber-200 bg-white shadow-sm">
                <CardContent className="py-10 text-center">
                  <ShieldCheck className="mx-auto h-11 w-11 text-amber-600" />
                  <h2 className="mt-4 text-xl font-black">{copy.blocked}</h2>
                  <p className="mt-3 text-sm text-slate-600">
                    {query.data.payment.blockMessage || copy.blocked}
                  </p>
                </CardContent>
              </Card>
            ) : query.data ? (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-[#A87308]" />
                    {copy.card}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!challenge ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="industrial-card-number">{copy.cardNumber}</Label>
                        <Input
                          id="industrial-card-number"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          placeholder="4242 4242 4242 4242"
                          value={card.cardNumber}
                          onChange={(event) =>
                            setCard((current) => ({
                              ...current,
                              cardNumber: formatCardNumber(event.target.value),
                            }))
                          }
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="industrial-card-month">{copy.month}</Label>
                          <Input
                            id="industrial-card-month"
                            inputMode="numeric"
                            autoComplete="cc-exp-month"
                            placeholder="MM"
                            value={card.expiryMonth}
                            onChange={(event) =>
                              setCard((current) => ({
                                ...current,
                                expiryMonth: digitsOnly(event.target.value).slice(0, 2),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="industrial-card-year">{copy.year}</Label>
                          <Input
                            id="industrial-card-year"
                            inputMode="numeric"
                            autoComplete="cc-exp-year"
                            placeholder="YYYY"
                            value={card.expiryYear}
                            onChange={(event) =>
                              setCard((current) => ({
                                ...current,
                                expiryYear: digitsOnly(event.target.value).slice(0, 4),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="industrial-card-cvv">{copy.cvv}</Label>
                          <Input
                            id="industrial-card-cvv"
                            type="password"
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            placeholder="123"
                            value={card.cvv}
                            onChange={(event) =>
                              setCard((current) => ({
                                ...current,
                                cvv: digitsOnly(event.target.value).slice(0, 4),
                              }))
                            }
                          />
                        </div>
                      </div>
                      <Button
                        className="w-full bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
                        disabled={!cardValid || busy}
                        onClick={startPayment}
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                        {busy ? copy.paying : copy.pay}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        {challenge.message || copy.challenge}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="industrial-payment-challenge">{copy.challenge}</Label>
                        <Input
                          id="industrial-payment-challenge"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={challenge.value}
                          onChange={(event) =>
                            setChallenge((current) =>
                              current
                                ? {
                                    ...current,
                                    value: digitsOnly(event.target.value).slice(0, 10),
                                  }
                                : current,
                            )
                          }
                        />
                      </div>
                      <Button
                        className="w-full bg-[#07121F] font-black text-white"
                        disabled={!digitsOnly(challenge.value) || busy}
                        onClick={authorize}
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {copy.authorize}
                      </Button>
                    </>
                  )}
                  {error ? (
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      {error}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
