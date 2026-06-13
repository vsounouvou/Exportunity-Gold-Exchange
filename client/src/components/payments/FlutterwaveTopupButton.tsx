import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

type FlutterwaveInitResponse = {
  ok: true;
  paymentId: string;
  tx_ref: string;
  checkout: {
    type: "redirect";
    link: string;
  };
};

export function FlutterwaveTopupButton(props: {
  amount: number;
  currency?: string;
  returnUrl?: string;
  label?: string;
  className?: string;
  next?: string;
  autoOpen?: boolean;
  buttonClassName?: string;
  experience?: string;
  allowSellerQr?: boolean;
  allowProviderSwitch?: boolean;
  preferredProvider?: string;
  title?: string;
  description?: string;
  summary?: {
    eyebrow?: string;
    title?: string;
    lines?: Array<{ label: string; value: string }>;
  };
  onExternalRedirect?: () => void;
}) {
  const [, navigate] = useLocation();
  const session = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async () => {
    setError(null);
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (session.token) headers.Authorization = `Bearer ${session.token}`;

      const resp = (await apiRequest("/api/payments/flutterwave/init", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "WALLET_TOPUP",
          amount: Math.max(1, Math.round(Number(props.amount || 0))),
          currency: String(props.currency || "XOF").toUpperCase(),
          returnUrl: props.returnUrl || null,
        }),
      })) as FlutterwaveInitResponse;

      const checkoutLink = String(resp?.checkout?.link || "").trim();
      if (!checkoutLink) throw new Error("Flutterwave checkout link missing");
      props.onExternalRedirect?.();
      window.location.assign(checkoutLink);
    } catch (err: any) {
      const message = String(err?.message || "Failed to open Flutterwave checkout");
      if (message.toLowerCase().includes("authentication required")) {
        const currentPath = `${window.location.pathname}${window.location.search}`;
        navigate(`/login?next=${encodeURIComponent(currentPath)}`);
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button className={props.buttonClassName || props.className} onClick={startCheckout} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        {props.label || "Pay with Flutterwave"}
      </Button>
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}
