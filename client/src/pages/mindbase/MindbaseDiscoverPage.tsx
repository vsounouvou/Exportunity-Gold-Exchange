import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import MindbaseLayout from "./MindbaseLayout";
import { mindbasePath } from "./routing";
import { operatingAgents, type StarterAgent } from "./starterAgents";

type DiscoverItem = {
  source?: "intellect" | "asset";
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description?: string | null;
  category: string;
  access_policy: "private" | "public" | "paid";
  price_per_100_messages: number;
  pricing_label?: string;
  plan_requirement?: string;
  tools?: string[];
  needs?: string[];
  rating?: number;
  creator: {
    display_name: string;
    share_slug: string | null;
  };
};

const FEATURED_MINDBASE_AGENTS: DiscoverItem[] = ([
  ["executive-assistant", "Executive Assistant", "Keeps priorities, decisions, calendars, and follow-up moving.", "Executive"],
  ["operations-manager", "Operations Manager", "Builds the execution rhythm for tasks, owners, workflows, and blockers.", "Operations"],
  ["sales-agent", "Sales Agent", "Qualifies leads, updates pipeline stages, and follows up on revenue opportunities.", "Sales"],
  ["marketing-agent", "Marketing Agent", "Plans campaigns, content, customer research, and launch calendars.", "Marketing"],
  ["accounting-agent", "Accounting Agent", "Tracks invoices, expenses, cashflow, and finance setup needs.", "Finance"],
  ["customer-support-agent", "Customer Support Agent", "Answers customer questions and escalates issues with company context.", "Support"],
  ["product-strategist", "Product Strategist", "Turns market signals and user needs into product priorities.", "Product"],
  ["hr-people-agent", "HR and People Agent", "Organizes hiring, onboarding, team policies, and employee records.", "People"],
  ["legal-ops-agent", "Legal Ops Agent", "Tracks contracts, policy requests, and compliance handoffs.", "Legal"],
  ["procurement-agent", "Procurement Agent", "Manages supplier intake, pricing, purchase requests, and vendor follow-up.", "Operations"],
  ["project-manager", "Project Manager", "Turns goals into milestones, owners, due dates, and execution status.", "Operations"],
  ["crm-agent", "CRM Agent", "Keeps contacts, deals, notes, and customer follow-ups organized.", "Sales"],
  ["research-agent", "Research Agent", "Collects market, competitor, and customer intelligence for decisions.", "Research"],
  ["data-analyst", "Data Analyst", "Builds operating metrics, dashboards, and weekly insight briefs.", "Analytics"],
  ["finance-controller", "Finance Controller", "Prepares budget views, cashflow checks, and finance controls.", "Finance"],
  ["content-planner", "Content Planner", "Builds channel calendars, post ideas, and campaign briefs.", "Marketing"],
  ["seo-agent", "SEO Agent", "Plans search content, keyword clusters, and technical SEO checks.", "Marketing"],
  ["ads-manager", "Ads Manager", "Drafts ad campaigns, audience tests, and performance reviews.", "Marketing"],
  ["community-manager", "Community Manager", "Plans community engagement, replies, and member feedback loops.", "Marketing"],
  ["partnerships-agent", "Partnerships Agent", "Finds partner targets and manages outreach follow-up.", "Sales"],
  ["customer-success-agent", "Customer Success Agent", "Guides onboarding, retention, account health, and renewal actions.", "Support"],
  ["implementation-agent", "Implementation Agent", "Turns new customer setup into a repeatable delivery checklist.", "Operations"],
  ["quality-assurance-agent", "Quality Assurance Agent", "Reviews work output, checks acceptance criteria, and flags risk.", "Operations"],
  ["sop-builder", "SOP Builder", "Turns repeated work into operating procedures and training checklists.", "Knowledge"],
  ["company-brain-librarian", "Company Brain Librarian", "Organizes documents, tags knowledge, and keeps retrieval clean.", "Knowledge"],
  ["meeting-brief-agent", "Meeting Brief Agent", "Prepares agendas, summaries, decisions, and next actions.", "Executive"],
  ["inbox-triage-agent", "Inbox Triage Agent", "Sorts incoming messages by urgency, owner, and next step.", "Support"],
  ["whatsapp-agent", "WhatsApp Agent", "Handles mobile-first customer intake, reminders, and follow-up.", "Support"],
  ["gmail-agent", "Gmail Agent", "Organizes email threads, labels, drafts, and follow-up queues.", "Support"],
  ["google-drive-agent", "Google Drive Agent", "Connects documents, folders, and company knowledge suggestions.", "Knowledge"],
  ["notion-agent", "Notion Agent", "Maintains docs, project pages, and lightweight operating systems.", "Knowledge"],
  ["slack-agent", "Slack Agent", "Summarizes channels, routes decisions, and catches missed action items.", "Operations"],
  ["microsoft-365-agent", "Microsoft 365 Agent", "Coordinates Outlook, Teams, files, and enterprise workspace setup.", "Operations"],
  ["billing-agent", "Billing Agent", "Prepares billing runs, subscription checks, and invoice follow-up.", "Finance"],
  ["payroll-agent", "Payroll Agent", "Tracks payroll inputs, approvals, and employee payment readiness.", "Finance"],
  ["tax-prep-agent", "Tax Prep Agent", "Organizes tax documents, deadlines, and accountant handoffs.", "Finance"],
  ["inventory-agent", "Inventory Agent", "Tracks stock, reorder points, vendor notes, and fulfillment issues.", "Operations"],
  ["logistics-agent", "Logistics Agent", "Coordinates deliveries, shipment status, and exception handling.", "Operations"],
  ["field-ops-agent", "Field Ops Agent", "Manages territory work, site visits, reports, and field evidence.", "Operations"],
  ["training-agent", "Training Agent", "Creates onboarding lessons, knowledge checks, and team enablement.", "People"],
  ["compliance-agent", "Compliance Agent", "Tracks compliance tasks, evidence, audits, and approvals.", "Legal"],
  ["risk-agent", "Risk Agent", "Monitors operational risks, incidents, and mitigation plans.", "Operations"],
  ["investor-relations-agent", "Investor Relations Agent", "Prepares investor updates, metrics, and diligence material.", "Finance"],
  ["fundraising-agent", "Fundraising Agent", "Organizes target lists, pitch follow-ups, and fundraising rooms.", "Finance"],
  ["grant-agent", "Grant Agent", "Finds grants, drafts applications, and tracks submission deadlines.", "Finance"],
  ["pricing-agent", "Pricing Agent", "Tests packaging, pricing, discount rules, and margin implications.", "Product"],
  ["onboarding-agent", "Onboarding Agent", "Creates first-run setup flows for customers, teams, and partners.", "Customer"],
  ["automation-builder", "Automation Builder", "Turns repeated work into trigger-based workflows and approvals.", "Automations"],
  ["agent-builder", "Agent Builder", "Designs custom role agents from your company structure and needs.", "Agents"],
  ["command-center-agent", "Command Center Agent", "Summarizes updates, pending decisions, and recommended actions.", "Executive"],
] as Array<[string, string, string, string]>).map(([slug, name, tagline, category], index) => ({
  id: `featured-${slug}`,
  name,
  slug,
  tagline,
  category,
  access_policy: "public" as const,
  price_per_100_messages: 0,
  usage_count: Math.max(0, 240 - index * 3),
  creator: {
    display_name: "MindBase",
    share_slug: null,
  },
}));

function portraitForAgent(name: string) {
  return operatingAgents.find((agent) => agent.role === name || agent.name === name || name.toLowerCase().includes(agent.role.toLowerCase().replace(" agent", "")));
}

function initialsFor(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function MarketplaceAgentPortrait({
  agent,
  label,
}: {
  agent: StarterAgent | undefined;
  label: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  if (agent && !imageFailed) {
    return (
      <img
        src={agent.avatar}
        alt={`${agent.name} portrait`}
        className="h-14 w-14 shrink-0 rounded-full object-cover object-center shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
        loading="lazy"
        decoding="async"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      aria-label={`${label} avatar`}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#23F6E7,#0B65FF)] text-sm font-black text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
    >
      {initialsFor(agent?.name || label)}
    </span>
  );
}

export default function MindbaseDiscoverPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "120");
    if (q.trim()) params.set("q", q.trim());
    if (category.trim()) params.set("category", category.trim());
    return `/api/mindbase/discover?${params.toString()}`;
  }, [q, category]);

  const { data, isLoading } = useQuery<{ ok: boolean; items: DiscoverItem[] }>({
    queryKey: [queryKey],
    staleTime: 15_000,
  });

  const items = Array.isArray(data?.items) ? data.items : [];
  const featuredItems = FEATURED_MINDBASE_AGENTS.filter((item) => {
    if (category && item.category !== category) return false;
    if (!q.trim()) return true;
    const text = `${item.name} ${item.tagline || ""} ${item.category}`.toLowerCase();
    return text.includes(q.trim().toLowerCase());
  });
  const displayItems = items.length ? items : !q.trim() ? featuredItems : [];
  const similarItems = featuredItems.length ? featuredItems.slice(0, 6) : FEATURED_MINDBASE_AGENTS.slice(0, 6);
  const categories = Array.from(new Set([...items, ...FEATURED_MINDBASE_AGENTS].map((item) => item.category).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <MindbaseLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold text-[var(--text)]" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
          Hire AI agents
        </h1>
        <p className="mb-4 max-w-2xl text-sm text-[var(--muted)]">
          Marketplace agents are capabilities you can chat with, configure, and hire into your company brain.
        </p>

        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Find by agent name, owner, or category"
            className="border-[var(--border)] bg-white text-[var(--text)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                !category
                  ? "border-[var(--border)] bg-[var(--chipActiveBg)] text-[var(--chipActiveText)]"
                  : "border-[var(--border)] bg-[var(--chipBg)] text-[var(--chipText)] hover:bg-slate-200"
              }`}
              onClick={() => setCategory("")}
            >
              All
            </button>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  category === item
                    ? "border-[var(--border)] bg-[var(--chipActiveBg)] text-[var(--chipActiveText)]"
                    : "border-[var(--border)] bg-[var(--chipBg)] text-[var(--chipText)] hover:bg-slate-200"
                }`}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div key={idx} className="h-44 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {displayItems.map((item) => {
              const pricing =
                item.pricing_label ||
                (item.access_policy === "paid" ? `${item.price_per_100_messages} credits / 100 msgs` : "Free");
              const portraitAgent = portraitForAgent(item.name);
              const isSeededAsset = item.source === "asset";
              const chatHref = isSeededAsset ? mindbasePath("/") : mindbasePath(`/i/${item.slug}`);
              const hireHref = isSeededAsset ? mindbasePath("/") : mindbasePath(`/i/${item.slug}`);
              return (
                <Card
                  key={item.id}
                  className="rounded-[14px] border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                  style={{ boxShadow: "0 6px 20px rgba(15, 23, 42, 0.06)" }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <MarketplaceAgentPortrait agent={portraitAgent} label={item.name} />
                      <div className="min-w-0">
                        <CardTitle className="text-lg text-[var(--text)]">{portraitAgent ? portraitAgent.name : item.name}</CardTitle>
                        <p className="text-sm font-medium text-[var(--muted)]">{portraitAgent ? item.name : item.category}</p>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-sm text-[var(--muted)]">
                      {portraitAgent?.purpose || item.tagline || "Digital expert profile focused on useful outcomes."}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-[var(--muted)]">
                      Owner: <span className="font-medium">{item.creator.display_name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--chipBg)] px-2.5 py-0.5 font-semibold text-[var(--chipText)]">
                        {item.category}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700">
                        {pricing}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-700">
                        Rating: {typeof item.rating === "number" && item.rating > 0 ? item.rating.toFixed(1) : "N/A"}
                      </span>
                      {item.plan_requirement ? (
                        <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-sky-50 px-2.5 py-0.5 font-semibold text-sky-700">
                          {item.plan_requirement}
                        </span>
                      ) : null}
                    </div>
                    {item.tools?.length ? (
                      <div className="text-xs leading-5 text-[var(--muted)]">
                        Tools: {item.tools.slice(0, 4).join(", ")}
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Link href={item.id.startsWith("featured-") ? mindbasePath("/") : chatHref}>
                          <a className="inline-flex min-w-[110px] items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--chipBg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-slate-200">
                            Chat first
                          </a>
                        </Link>
                        <Link href={item.id.startsWith("featured-") ? mindbasePath("/") : hireHref}>
                          <a className="inline-flex min-w-[110px] items-center justify-center rounded-[10px] bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primaryHover)]">
                            {isSeededAsset ? "Hire in chat" : "Hire agent"}
                          </a>
                        </Link>
                      </div>
                      {item.creator.share_slug ? (
                        <Link href={mindbasePath(`/c/${item.creator.share_slug}`)}>
                          <a className="text-sm font-medium text-[var(--primary)] hover:underline">Owner</a>
                        </Link>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!displayItems.length ? (
              <div className="md:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                <div className="text-lg font-semibold text-slate-950">I do not have an exact match yet, but I can create this agent for you.</div>
                <p className="mt-2">Tell MindBase Guide what role you need, or start from a similar agent below.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={mindbasePath("/")}>
                    <a className="inline-flex items-center justify-center rounded-[10px] bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primaryHover)]">
                      Create custom agent
                    </a>
                  </Link>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--chipBg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-slate-200"
                    onClick={() => {
                      setQ("");
                      setCategory("");
                    }}
                  >
                    Show featured agents
                  </button>
                  <Link href={mindbasePath("/")}>
                    <a className="inline-flex items-center justify-center rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-slate-50">
                      Ask MindBase Guide
                    </a>
                  </Link>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {similarItems.map((item) => (
                    <div key={item.id} className="rounded-[12px] border border-[var(--border)] bg-[var(--chipBg)] p-4">
                      <div className="font-semibold text-[var(--text)]">{item.name}</div>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.tagline}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </MindbaseLayout>
  );
}
