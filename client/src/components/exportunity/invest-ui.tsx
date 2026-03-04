import type { ReactNode } from "react";
import { Link } from "wouter";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/exportunity/marketing-ui";

type MilestoneInput = {
  title: string;
  amount?: string | number | null;
  evidence?: string[];
};

type OpportunityInput = {
  slug: string;
  type: string;
  title: string;
  summary?: string | null;
  country?: string | null;
  trackRecordBadge?: string;
  fundingGoalMin?: string | null;
  fundingGoalMax?: string | null;
  currency?: string;
  contractDurationMonths?: number | null;
  trackedKpis?: string[];
};

export function ContractSnapshot({
  amount,
  purpose,
  milestones,
  evidenceRequired,
  reportingFrequency,
  returnLogic,
  className,
}: {
  amount: string;
  purpose: string;
  milestones: string;
  evidenceRequired: string;
  reportingFrequency: string;
  returnLogic: string;
  className?: string;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Amount", value: amount },
    { label: "Purpose", value: purpose },
    { label: "Milestones", value: milestones },
    { label: "Evidence required", value: evidenceRequired },
    { label: "Reporting frequency", value: reportingFrequency },
    { label: "Return model", value: returnLogic },
  ];

  return (
    <GlassCard className={cn("space-y-3", className)}>
      <div className="text-sm font-semibold tracking-[0.08em] text-amber-200/85">Investment Contract Snapshot</div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[150px,1fr] gap-3 border-b border-white/10 pb-2 text-sm last:border-none last:pb-0">
            <div className="text-white/60">{row.label}</div>
            <div className="font-medium text-white">{row.value}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function MilestoneTimeline({
  milestones,
  className,
}: {
  milestones: MilestoneInput[];
  className?: string;
}) {
  if (!milestones.length) return null;
  return (
    <div className={cn("space-y-3", className)}>
      {milestones.map((milestone, index) => (
        <div key={`${milestone.title}-${index}`} className="rounded-xl border border-white/12 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">{milestone.title}</div>
            {milestone.amount ? <div className="text-xs text-emerald-200/85">{String(milestone.amount)}</div> : null}
          </div>
          {Array.isArray(milestone.evidence) && milestone.evidence.length ? (
            <div className="mt-2 text-xs text-white/70">Evidence: {milestone.evidence.join(" • ")}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatFundingRange(opportunity: OpportunityInput) {
  const min = opportunity.fundingGoalMin ? String(opportunity.fundingGoalMin) : "";
  const max = opportunity.fundingGoalMax ? String(opportunity.fundingGoalMax) : "";
  const currency = String(opportunity.currency || "USD").trim().toUpperCase();
  if (min && max) return `${currency} ${min} – ${max}`;
  if (max) return `${currency} ${max}`;
  if (min) return `${currency} ${min}`;
  return "To be disclosed";
}

export function OpportunityCard({
  opportunity,
  ctaLabel = "View details",
  ctaHref,
  rightSlot,
}: {
  opportunity: OpportunityInput;
  ctaLabel?: string;
  ctaHref?: string;
  rightSlot?: ReactNode;
}) {
  const href = ctaHref || `/invest/opportunities/${encodeURIComponent(opportunity.slug)}`;
  return (
    <GlassCard className="h-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.12em] text-sky-200/80">{opportunity.type}</div>
        <div className="rounded-full border border-emerald-300/35 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-100">
          {opportunity.trackRecordBadge || "Verified on platform"}
        </div>
      </div>
      <div className="mt-3 text-lg font-semibold leading-tight">{opportunity.title}</div>
      {opportunity.summary ? <p className="mt-2 text-sm text-white/75">{opportunity.summary}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="text-white/45">Country</div>
          <div className="mt-1 text-white">{opportunity.country || "Multi-market"}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="text-white/45">Contract duration</div>
          <div className="mt-1 text-white">{opportunity.contractDurationMonths ? `${opportunity.contractDurationMonths} months` : "Flexible"}</div>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.08] p-2 text-sm">
        <div className="text-white/55">Funding goal</div>
        <div className="mt-1 font-semibold text-amber-100">{formatFundingRange(opportunity)}</div>
      </div>
      {Array.isArray(opportunity.trackedKpis) && opportunity.trackedKpis.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {opportunity.trackedKpis.slice(0, 4).map((kpi) => (
            <span key={kpi} className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/75">
              {kpi}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-2">
        <Link href={href}>
          <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">{ctaLabel}</Button>
        </Link>
        {rightSlot}
      </div>
    </GlassCard>
  );
}
