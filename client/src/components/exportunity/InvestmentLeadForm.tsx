import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitInvestorLead } from "@/lib/marketing-api";

export function InvestmentLeadForm({
  defaultMessage,
  sourceUrl,
  submitLabel = "Request access",
}: {
  defaultMessage?: string;
  sourceUrl?: string;
  submitLabel?: string;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    country: "",
    investorType: "investor",
    interestTags: "",
    message: defaultMessage || "",
  });
  const [sent, setSent] = useState(false);
  const [errorText, setErrorText] = useState("");

  const mutation = useMutation({
    mutationFn: async () =>
      submitInvestorLead({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        country: form.country.trim() || undefined,
        investorType: form.investorType.trim() || undefined,
        interestTags: form.interestTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        message: form.message.trim() || undefined,
        sourceUrl: sourceUrl || (typeof window !== "undefined" ? window.location.pathname : undefined),
      }),
    onSuccess: () => {
      setSent(true);
      setErrorText("");
    },
    onError: (error: any) => {
      setErrorText(String(error?.message || "Unable to submit lead right now."));
      setSent(false);
    },
  });

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-300/35 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        Your onboarding request was received. Our investment team will contact you shortly.
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Full name"
          className="border-white/20 bg-white/10 text-white"
          required
        />
        <Input
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          type="email"
          placeholder="Email"
          className="border-white/20 bg-white/10 text-white"
          required
        />
        <Input
          value={form.phone}
          onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          placeholder="Phone / WhatsApp"
          className="border-white/20 bg-white/10 text-white"
        />
        <Input
          value={form.country}
          onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
          placeholder="Country"
          className="border-white/20 bg-white/10 text-white"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px,1fr]">
        <select
          value={form.investorType}
          onChange={(event) => setForm((prev) => ({ ...prev, investorType: event.target.value }))}
          className="h-10 rounded-md border border-white/20 bg-white/10 px-3 text-sm text-white"
        >
          <option value="investor">Investor</option>
          <option value="family_office">Family office</option>
          <option value="institutional">Institutional</option>
          <option value="business_owner">Business seeking capital</option>
        </select>
        <Input
          value={form.interestTags}
          onChange={(event) => setForm((prev) => ({ ...prev, interestTags: event.target.value }))}
          placeholder="Interest tags (SME, Gold, Machinery, Farm)"
          className="border-white/20 bg-white/10 text-white"
        />
      </div>
      <Textarea
        value={form.message}
        onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
        placeholder="Tell us your intent, ticket size, and target markets."
        className="min-h-[110px] border-white/20 bg-white/10 text-white"
      />
      {errorText ? <div className="text-sm text-red-300">{errorText}</div> : null}
      <Button type="submit" className="bg-amber-400 text-slate-950 hover:bg-amber-300" disabled={mutation.isPending}>
        {mutation.isPending ? "Submitting..." : submitLabel}
      </Button>
    </form>
  );
}
