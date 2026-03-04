import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MindbaseLayout from "./MindbaseLayout";
import { mindbasePath } from "./routing";

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    description: "Build your profile, create one Agent, and test chat workflows.",
    points: ["1 MindBase profile", "1 Agent", "Private and public knowledge"],
  },
  {
    name: "Creator",
    price: "Credits",
    description: "Publish paid Agents and monetize outcomes with usage-based credits.",
    points: ["Multiple Agents", "Paid access mode", "Workspace attach APIs"],
  },
  {
    name: "Company",
    price: "Credits + API",
    description: "Attach MindBase Agents to team workspaces and systems.",
    points: ["Workspace API keys", "Agent invocation endpoint", "Operational audit trail"],
  },
];

export default function MindbasePricingPage() {
  return (
    <MindbaseLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Badge className="mb-2 bg-[#007BFF]/10 text-[#007BFF]">Pricing</Badge>
          <h1 className="text-3xl font-semibold text-slate-900" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
            Credits-based pricing for MindBase MVP
          </h1>
          <p className="mt-2 text-slate-600">
            Stripe is not required in MVP. Paid Agents use usage credits from the wallet ledger.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Card key={plan.name} className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-slate-900">{plan.name}</CardTitle>
                <div className="text-sm font-medium text-[#007BFF]">{plan.price}</div>
                <p className="text-sm text-slate-600">{plan.description}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {plan.points.map((point) => (
                  <div key={point} className="text-sm text-slate-700">
                    • {point}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild className="bg-[#007BFF] hover:bg-[#006AE0]">
            <Link href={mindbasePath("/build/chat")}>Build My MindBase</Link>
          </Button>
          <Button asChild variant="outline" className="border-slate-300">
            <Link href={mindbasePath("/discover")}>Hire an Agent</Link>
          </Button>
        </div>
      </main>
    </MindbaseLayout>
  );
}
