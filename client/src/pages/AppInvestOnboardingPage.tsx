import { useMemo, useState } from "react";
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

function parseOpSlug(location: string) {
  const idx = location.indexOf("?");
  if (idx === -1) return null;
  try {
    const params = new URLSearchParams(location.slice(idx + 1));
    const slug = String(params.get("op") || "").trim();
    return slug || null;
  } catch {
    return null;
  }
}

export default function AppInvestOnboardingPage() {
  const session = useSession();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  const opSlug = useMemo(() => parseOpSlug(location), [location]);

  const [name, setName] = useState(() => String((session.user as any)?.displayName || "").trim());
  const [email, setEmail] = useState(() => String((session.user as any)?.email || "").trim());
  const [country, setCountry] = useState("");
  const [intent, setIntent] = useState("invest");
  const [message, setMessage] = useState(opSlug ? `I want to onboard for opportunity: ${opSlug}` : "I want to invest with contract-based controls.");

  const submit = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        country: country.trim() || null,
        investorType: intent,
        interestTags: ["invest", opSlug].filter(Boolean),
        message: message.trim() || null,
        sourceUrl: typeof window !== "undefined" ? window.location.href : "/app/invest/onboarding",
      };
      if (!payload.name) throw new Error("Name is required");
      if (!payload.email) throw new Error("Email is required");
      return apiRequest("/api/invest/leads", "POST", payload);
    },
    onSuccess: () => {
      toast({ title: "Submitted", description: "An operator will follow up with contract suitability and next steps." });
      setLocation("/app/invest/opportunities");
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: String(err?.message || "Could not submit"), variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-gray-950 pb-32 text-white">
      <AppProTopBar subtitle="Invest onboarding" />
      <main className="mx-auto w-full max-w-xl px-4 pb-4 pt-6">
        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-5 space-y-4">
            <div className="text-sm text-white/70">
              Submit onboarding. You land back in the module immediately after submission.
            </div>
            <div className="space-y-2">
              <Label className="text-white/80">Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="border-white/15 bg-black/30 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-white/80">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} className="border-white/15 bg-black/30 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-white/80">Country (optional)</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} className="border-white/15 bg-black/30 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-white/80">Intent</Label>
              <select
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                className="h-10 w-full rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white"
              >
                <option value="invest">Invest</option>
                <option value="demo">Demo</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/80">Message</Label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[110px] w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10"
                onClick={() => setLocation("/app/invest/opportunities")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                onClick={() => submit.mutate()}
                disabled={submit.isPending}
              >
                {submit.isPending ? "Submitting..." : "Submit onboarding"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
