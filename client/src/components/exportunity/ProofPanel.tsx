import { MediaThumb } from "@/components/exportunity/marketing-ui";
import { cn } from "@/lib/utils";

type ProofMetric = {
  label: string;
  value: string;
};

type ProofLogo = {
  label: string;
  href?: string;
};

type ProofScreenshot = {
  id: string;
  title: string;
  image: string;
  href?: string;
};

export function ProofPanel({
  title = "Proof",
  description,
  screenshots,
  metrics = [],
  logos = [],
  className,
}: {
  title?: string;
  description?: string;
  screenshots: ProofScreenshot[];
  metrics?: ProofMetric[];
  logos?: ProofLogo[];
  className?: string;
}) {
  const trimmedScreenshots = screenshots.slice(0, 4);
  const trimmedMetrics = metrics.slice(0, 3);
  const trimmedLogos = logos.slice(0, 6);

  return (
    <section className={cn("rounded-3xl border border-white/10 bg-black/25 p-5 md:p-7", className)}>
      <div className="space-y-2">
        <div className="text-xs font-semibold tracking-[0.2em] text-sky-200/70">PROOF</div>
        <h2 className="text-2xl font-semibold text-white md:text-3xl">{title}</h2>
        {description ? <p className="max-w-3xl text-sm text-white/70">{description}</p> : null}
      </div>

      {trimmedMetrics.length ? (
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {trimmedMetrics.map((metric) => (
            <div key={`${metric.label}-${metric.value}`} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-2xl font-semibold text-white">{metric.value}</div>
              <div className="text-xs uppercase tracking-[0.14em] text-white/60">{metric.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {trimmedScreenshots.map((shot) => {
          const card = (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3 transition-all hover:-translate-y-0.5 hover:border-white/25">
              <MediaThumb src={shot.image} alt={shot.title} className="rounded-xl" />
              <div className="pt-3 text-sm font-semibold text-white">{shot.title}</div>
            </div>
          );

          if (!shot.href) return <div key={shot.id}>{card}</div>;
          return (
            <a key={shot.id} href={shot.href} className="block">
              {card}
            </a>
          );
        })}
      </div>

      {trimmedLogos.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {trimmedLogos.map((logo) =>
            logo.href ? (
              <a
                key={logo.label}
                href={logo.href}
                className="rounded-full border border-white/20 bg-white/[0.03] px-3 py-1 text-xs text-white/75 hover:border-white/35 hover:text-white"
              >
                {logo.label}
              </a>
            ) : (
              <span key={logo.label} className="rounded-full border border-white/20 bg-white/[0.03] px-3 py-1 text-xs text-white/75">
                {logo.label}
              </span>
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
