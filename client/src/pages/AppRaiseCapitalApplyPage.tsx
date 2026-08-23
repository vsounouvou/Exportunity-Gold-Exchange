import { useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";

import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

export default function AppRaiseCapitalApplyPage() {
  const session = useSession();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState(() => String((session.user as any)?.displayName || "").trim());
  const [email, setEmail] = useState(() => String((session.user as any)?.email || "").trim());
  const [country, setCountry] = useState("");
  const [type, setType] = useState("sme");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("I want to raise capital with contract-based controls and procurement-only disbursement.");

  const submit = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim() || companyName.trim() || "Raise capital applicant",
        email: email.trim(),
        country: country.trim() || null,
        investorType: "raise_capital",
        interestTags: ["raise_capital", type].filter(Boolean),
        message: [
          `Company: ${companyName.trim() || "(not provided)"}`,
          amount.trim() ? `Amount: ${amount.trim()}` : null,
          "",
          message.trim() || "",
        ]
          .filter(Boolean)
          .join("\n"),
        sourceUrl: typeof window !== "undefined" ? window.location.href : "/app/raise-capital/apply",
      };
      if (!payload.email) throw new Error("Email is required");
      if (!companyName.trim()) throw new Error("Company name is required");
      return apiRequest("/api/invest/leads", "POST", payload);
    },
    onSuccess: () => {
      toast({ title: "Submitted", description: "An operator will follow up with onboarding and contract setup." });
      setLocation("/app/invest/opportunities");
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: String(err?.message || "Could not submit"), variant: "destructive" });
    },
  });

  return (
    <div data-testid="exportunity-raise-capital" className="min-h-screen bg-[#F7F8FA] pb-24 text-[#07111F]">
      <AppProTopBar subtitle="Raise capital" />
      <main className="mx-auto w-full max-w-xl px-4 py-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="rounded-xl border border-[#F5A623]/25 bg-[#FFF8E8] p-3 text-sm leading-6 text-slate-700">
              Raise capital request ties to controlled procurement and milestone releases (no cash diversion).
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Company</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="border-slate-200 bg-white text-slate-950" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-700">Contact name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="border-slate-200 bg-white text-slate-950" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Contact email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} className="border-slate-200 bg-white text-slate-950" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-700">Country (optional)</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} className="border-slate-200 bg-white text-slate-950" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Class</Label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950"
                >
                  <option value="sme">SME / Online shop</option>
                  <option value="farm">Farm / Production</option>
                  <option value="machinery">Machinery / Equipment</option>
                  <option value="gold">Gold / Commodities</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Target amount (optional)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="border-slate-200 bg-white text-slate-950" placeholder="e.g. USD 120,000" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Message</Label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[110px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
                onClick={() => setLocation("/app/invest/opportunities")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
                onClick={() => submit.mutate()}
                disabled={submit.isPending}
              >
                {submit.isPending ? "Submitting..." : "Submit request"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
