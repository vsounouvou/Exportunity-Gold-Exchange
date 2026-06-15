import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";

import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, setMarketingPageMetadata } from "@/components/exportunity/marketing-ui";
import {
  type VitrineCard,
  type VitrineKey,
  type VitrineSection,
  type VitrineSourceId,
  vitrinePageMeta,
  vitrineSections,
  vitrineSources,
  vitrineSeoMeta,
} from "@/content/marketing/vitrine";

function pageKeyFromPath(pathname: string): VitrineKey {
  if (pathname.includes("what-we-do")) return "what";
  if (pathname.includes("platforms")) return "platforms";
  if (pathname.includes("gold")) return "gold";
  if (pathname.includes("machinery")) return "machinery";
  if (pathname.includes("government")) return "government";
  if (pathname.includes("archive")) return "archive";
  if (pathname.includes("operating-stack")) return "stack";
  if (pathname.includes("work-with-us")) return "work";
  return "company";
}

function statusLabel(status: VitrineCard["status"] | undefined) {
  if (status === "verified") return "Verified source";
  if (status === "owner-provided") return "Owner-provided";
  if (status === "generated") return "Generated visual";
  if (status === "needs-approval") return "Needs approval";
  return null;
}

function SourceBadge({ status }: { status?: VitrineCard["status"] }) {
  const label = statusLabel(status);
  if (!label) return null;

  const tone =
    status === "verified"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "generated"
        ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
        : status === "needs-approval"
          ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
          : "border-white/15 bg-white/[0.05] text-white/60";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone}`}>{label}</span>;
}

function SourceChips({ sources, className = "" }: { sources?: VitrineSourceId[]; className?: string }) {
  if (!sources?.length) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {sources.map((sourceId) => {
        const source = vitrineSources[sourceId];
        const chipClass =
          "inline-flex min-h-8 items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/60 transition";

        return source.href ? (
          <a key={source.id} href={source.href} target="_blank" rel="noreferrer" className="group">
            <span className={`${chipClass} group-hover:border-amber-300/35 group-hover:text-amber-100`} title={source.note}>
              {source.label}
            </span>
          </a>
        ) : (
          <span key={source.id} className={chipClass} title={source.note}>
            {source.label}
          </span>
        );
      })}
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center rounded-lg bg-amber-400 px-5 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300">
      {children}
    </Link>
  );
}

function CardGrid({ cards }: { cards: VitrineCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <article key={card.title} className="h-full rounded-lg border border-white/10 bg-white/[0.035] p-5 transition hover:border-amber-300/45">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">{card.title}</h3>
            <SourceBadge status={card.status} />
          </div>
          <p className="mt-3 text-sm leading-6 text-white/70">{card.text}</p>
          <SourceChips sources={card.sources} className="mt-4" />
          {card.href ? (
            <Link href={card.href} className="mt-5 inline-flex text-sm font-semibold text-amber-200 hover:text-amber-100">
              {card.label || "Open platform"}
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function RequestForm() {
  const [sent, setSent] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(true);
  };

  if (sent) {
    return (
      <div id="request" className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-5 text-sm text-emerald-100">
        Your request has been received. The Exportunity team will review it and respond.
      </div>
    );
  }

  return (
    <form id="request" onSubmit={submit} className="grid grid-cols-1 gap-4 rounded-lg border border-white/10 bg-[#0b0a08] p-5 md:grid-cols-2">
      {["Full name", "Company / institution", "Role", "Email", "Phone / WhatsApp", "Country"].map((label) => (
        <label key={label} className="text-sm text-white/70">
          <span>{label}</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-white outline-none focus:border-amber-300/60" required={label === "Full name" || label === "Email"} />
        </label>
      ))}
      <label className="text-sm text-white/70">
        <span>Interest area</span>
        <select className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-white outline-none focus:border-amber-300/60" defaultValue="Trade">
          {["Trade", "Gold and mining", "Machinery", "Government / B2G", "Platform access", "Payments / XportCARD", "Partnership", "Media", "Other"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label className="text-sm text-white/70 md:col-span-2">
        <span>Message</span>
        <textarea className="mt-2 min-h-32 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-3 text-white outline-none focus:border-amber-300/60" required />
      </label>
      <div className="md:col-span-2">
        <button type="submit" className="rounded-lg bg-amber-400 px-5 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300">
          Send request
        </button>
      </div>
    </form>
  );
}

function VitrineSectionBlock({ section }: { section: VitrineSection }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#080806]/80 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {section.kicker ? <MarketingKicker>{section.kicker}</MarketingKicker> : null}
          <h2 className="mt-2 text-2xl font-semibold text-white md:text-4xl">{section.title}</h2>
        </div>
        <SourceBadge status={section.sourceStatus} />
      </div>

      {section.text ? <p className="mt-4 max-w-4xl text-base leading-relaxed text-white/70">{section.text}</p> : null}
      <SourceChips sources={section.sources} className="mt-4" />
      {section.cards ? <div className="mt-6"><CardGrid cards={section.cards} /></div> : null}

      {section.timeline ? (
        <div className="mt-6 grid grid-cols-1 gap-3">
          {section.timeline.map((item) => (
            <div key={`${item.year}-${item.title}`} className="grid gap-3 rounded-lg border border-white/10 bg-black/25 p-4 md:grid-cols-[120px_1fr_auto]">
              <div className="text-lg font-semibold text-amber-200">{item.year}</div>
              <div>
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-white/70">{item.text}</p>
                <SourceChips sources={item.sources} className="mt-3" />
              </div>
              <SourceBadge status={item.sourceStatus} />
            </div>
          ))}
        </div>
      ) : null}

      {section.image ? (
        <figure className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-black/25">
          <img src={section.image.src} alt={section.image.title} className="max-h-[520px] w-full object-cover" loading="lazy" />
          <figcaption className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <div className="text-sm font-semibold text-white">{section.image.title}</div>
              <p className="mt-2 text-xs leading-5 text-white/60">{section.image.caption}</p>
            </div>
            <SourceBadge status={section.image.status} />
          </figcaption>
        </figure>
      ) : null}
    </section>
  );
}

export default function MarketingVitrinePage() {
  const isMarketingHost = isExportunityMarketingHost();
  const [pathname] = useLocation();
  const key = pageKeyFromPath(pathname);
  const meta = vitrinePageMeta[key];
  const sections = useMemo(() => vitrineSections[key], [key]);

  useEffect(() => {
    if (!isMarketingHost) return;
    setMarketingPageMetadata({
      title: vitrineSeoMeta[key].title,
      description: vitrineSeoMeta[key].description,
      image: meta.image,
    });
  }, [isMarketingHost, key, meta.image]);

  if (!isMarketingHost) return <Redirect to="/zone" />;

  return (
    <MarketingShell active={meta.active}>
      <section className="relative overflow-hidden border-b border-white/10">
        <img src={meta.image} alt={`${meta.title} visual`} className="absolute inset-0 h-full w-full object-cover opacity-[0.42]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#050505_0%,rgba(5,5,5,0.9)_42%,rgba(5,5,5,0.55)_100%)]" />
        <MarketingContainer className="relative flex min-h-[520px] items-center py-16">
          <div className="max-w-4xl space-y-5">
            <MarketingKicker>{meta.kicker}</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-6xl">{meta.title}</MarketingTitle>
            <MarketingLead>{meta.lead}</MarketingLead>
            <div className="flex flex-wrap gap-3 pt-2">
              {meta.cta.map((item) => (
                <ActionLink key={item.title} href={item.href || "/contact"}>
                  {item.title}
                </ActionLink>
              ))}
            </div>
          </div>
        </MarketingContainer>
      </section>

      <MarketingContainer className="py-14">
        <div className="space-y-12">
          {sections.map((section) => (
            <VitrineSectionBlock key={section.title} section={section} />
          ))}
          {key === "work" ? <RequestForm /> : null}
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}
