import { GlassCard, MarketingKicker } from "@/components/exportunity/marketing-ui";
import { cn } from "@/lib/utils";

const DEFAULT_STEPS = [
  {
    title: "Capital / Orders / Actions",
    description: "Investment funding, purchase intent, and agent execution all start here.",
  },
  {
    title: "Contract rules",
    description: "Digital contract terms define who can do what, when, and with what evidence.",
  },
  {
    title: "Approved spend",
    description: "Approvals and policy gates control high-impact actions and disbursements.",
  },
  {
    title: "Evidence",
    description: "Documents, receipts, deliveries, and checkpoints attach to each milestone.",
  },
  {
    title: "Reporting",
    description: "Investors and operators see outcomes from the underlying execution log.",
  },
];

export function PlatformExecutionDiagram({
  title = "How execution works",
  description = "A single execution contract connects intent to evidence and investor-grade reporting.",
  steps = DEFAULT_STEPS,
  className,
}: {
  title?: string;
  description?: string;
  steps?: Array<{ title: string; description: string }>;
  className?: string;
}) {
  const safeSteps = Array.isArray(steps) && steps.length ? steps : DEFAULT_STEPS;

  return (
    <section className={cn("space-y-4", className)} id="execution">
      <div className="space-y-2">
        <MarketingKicker>EXECUTION</MarketingKicker>
        <h2 className="text-2xl font-semibold md:text-3xl">{title}</h2>
        <div className="max-w-3xl text-sm text-white/70">{description}</div>
      </div>

      <GlassCard className="p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:justify-between">
          {safeSteps.map((step, index) => (
            <div key={`${step.title}-${index}`} className="flex flex-1 flex-col md:flex-row md:items-center md:gap-3">
              <div className="flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
                <div className="text-sm font-semibold text-white">{step.title}</div>
                <div className="mt-2 text-sm text-white/70">{step.description}</div>
              </div>

              {index < safeSteps.length - 1 ? (
                <div className="flex justify-center md:min-w-[32px] md:flex-col md:justify-center">
                  <div className="hidden select-none text-xl text-white/30 md:block" aria-hidden>
                    -&gt;
                  </div>
                  <div className="md:hidden select-none text-xl text-white/30" aria-hidden>
                    v
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </GlassCard>
    </section>
  );
}
