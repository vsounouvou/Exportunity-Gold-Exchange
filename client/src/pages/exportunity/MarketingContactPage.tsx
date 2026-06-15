import { useMemo, useState } from "react";
import { Redirect } from "wouter";
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";

import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, GlassCard, setMarketingPageMetadata } from "@/components/exportunity/marketing-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import marketingSiteConfig from "@/content/marketing/site";

export default function MarketingContactPage() {
  const isMarketingHost = isExportunityMarketingHost();

  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [country, setCountry] = useState("");
  const [interest, setInterest] = useState("Trade");

  const payload = useMemo(
    () => ({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      company: company.trim() || null,
      message: [
        role.trim() ? `Role: ${role.trim()}` : "",
        country.trim() ? `Country: ${country.trim()}` : "",
        interest.trim() ? `Interest: ${interest.trim()}` : "",
        message.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
      source: "exportunity_marketing",
    }),
    [company, country, email, firstName, interest, lastName, message, phone, role],
  );

  const sendMutation = useMutation({
    mutationFn: async () => apiRequest("/api/contact", "POST", payload),
    onSuccess: () => {
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setCompany("");
      setRole("");
      setCountry("");
      setInterest("Trade");
      setMessage("");
      toast({ title: "Request received", description: "The Exportunity team will review it and respond." });
    },
    onError: (err: any) => toast({ title: "Send failed", description: err?.message || "Unable to submit form", variant: "destructive" }),
  });

  useEffect(() => {
    if (!isMarketingHost) return;
    setMarketingPageMetadata({
      title: "Work With Exportunity \u2014 Trade, Gold, Machinery, Advisory, and Platform Access",
      description: "Contact Exportunity for trade, gold, machinery, advisory, platform access, or institutional collaboration.",
      image: marketingSiteConfig.images?.contact,
    });
  }, [isMarketingHost]);

  if (!isMarketingHost) return <Redirect to="/zone" />;

  return (
    <MarketingShell active="work">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.contact} imageAlt="Contact Exportunity">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>WORK WITH EXPORTUNITY</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Contact Exportunity</MarketingTitle>
            <MarketingLead>Send a request for trade, gold, machinery, advisory, platform access, or institutional collaboration.</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
          <GlassCard>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label className="text-white/80" htmlFor="contact-first-name">First name</Label>
                <Input id="contact-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-2 border-white/20 bg-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/80" htmlFor="contact-last-name">Last name</Label>
                <Input id="contact-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-2 border-white/20 bg-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/80" htmlFor="contact-email">Email</Label>
                <Input id="contact-email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 border-white/20 bg-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/80" htmlFor="contact-phone">Phone / WhatsApp</Label>
                <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-2 border-white/20 bg-white/10 text-white" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-white/80" htmlFor="contact-company">Company (optional)</Label>
                <Input id="contact-company" value={company} onChange={(e) => setCompany(e.target.value)} className="mt-2 border-white/20 bg-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/80" htmlFor="contact-role">Role</Label>
                <Input id="contact-role" value={role} onChange={(e) => setRole(e.target.value)} className="mt-2 border-white/20 bg-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/80" htmlFor="contact-country">Country</Label>
                <Input id="contact-country" value={country} onChange={(e) => setCountry(e.target.value)} className="mt-2 border-white/20 bg-white/10 text-white" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-white/80" htmlFor="contact-interest">Interest area</Label>
                <select
                  id="contact-interest"
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-white/20 bg-[#0b1020] px-3 text-sm text-white"
                >
                  {[
                    "Trade",
                    "Gold and mining",
                    "Machinery",
                    "Government / B2G",
                    "Platform access",
                    "Payments / XportCARD",
                    "Partnership",
                    "Media",
                    "Other",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-white/80" htmlFor="contact-message">Message</Label>
                <Textarea id="contact-message" value={message} onChange={(e) => setMessage(e.target.value)} className="mt-2 min-h-[160px] border-white/20 bg-white/10 text-white" />
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || !payload.email || !payload.message || !payload.firstName || !payload.lastName} className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                {sendMutation.isPending ? "Sending..." : "Send request"}
              </Button>
            </div>
          </GlassCard>

          <div className="space-y-4">
            <GlassCard>
              <div className="text-xs uppercase tracking-[0.12em] text-white/60">General</div>
              <a className="mt-2 block text-lg font-semibold hover:text-amber-200" href="mailto:info@exportunity.com">info@exportunity.com</a>
            </GlassCard>
            <GlassCard>
              <div className="text-xs uppercase tracking-[0.12em] text-white/60">Platform</div>
              <a className="mt-2 block text-lg font-semibold hover:text-amber-200" href={marketingSiteConfig.platformLink} target="_blank" rel="noreferrer">{marketingSiteConfig.platformLink}</a>
            </GlassCard>
            <GlassCard>
              <div className="text-xs uppercase tracking-[0.12em] text-white/60">Platform access</div>
              <a className="mt-2 block text-lg font-semibold hover:text-amber-200" href={marketingSiteConfig.memberLoginLink} target="_blank" rel="noreferrer">Open secure login</a>
            </GlassCard>
          </div>
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

