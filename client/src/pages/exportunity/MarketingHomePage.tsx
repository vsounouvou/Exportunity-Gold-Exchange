import { useEffect } from "react";
import { Link, Redirect } from "wouter";

import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, setMarketingPageMetadata } from "@/components/exportunity/marketing-ui";

const HERO_IMAGE = "/brand-assets/generated/operating-stack-hero.png";
const GOLD_IMAGE = "/brand-assets/generated/gold-mining-visual.png";
const MACHINERY_IMAGE = "/brand-assets/generated/machinery-visual.png";
const GOVERNMENT_IMAGE = "/brand-assets/generated/government-advisory-visual.png";
const PAYMENTS_IMAGE = "/brand-assets/generated/payments-wallet-visual.png";

const PROOF_STRIP = [
  { value: "2012", label: "Company foundation" },
  { value: "XportCARD", label: "Payments history" },
  { value: "rayOn", label: "SME commerce record" },
  { value: "Bourse de l'Or", label: "Gold platform direction" },
];

const ACTIVITIES = [
  {
    title: "Trade platforms",
    text: "We build platforms that connect sellers, buyers, producers, and traders.",
    href: "/what-we-do",
  },
  {
    title: "Gold and mining",
    text: "We support gold-related workflows with sourcing, verification, transaction coordination, and market access.",
    href: "/gold-mining",
  },
  {
    title: "Machinery and equipment",
    text: "We help operators access machinery, equipment, financing pathways, and procurement support.",
    href: "/machinery",
  },
  {
    title: "Government and institutions",
    text: "We advise public and institutional partners on trade, investment, digital systems, and execution.",
    href: "/government-institutions",
  },
  {
    title: "Payments and wallets",
    text: "We have built payment access tools for SMEs and cross-border activity.",
    href: "/platforms",
  },
  {
    title: "Operating systems",
    text: "We connect messages, tasks, approvals, payments, records, and follow-up in one operational layer.",
    href: "/operating-stack",
  },
];

const PUBLIC_RECORDS = [
  "Trade events and market access",
  "XportCARD and payments",
  "rayOn and SME commerce",
  "Advisory and institutions",
  "Bourse de l'Or and gold",
  "Machinery and equipment support",
];

const OPERATING_FIELDS = [
  {
    title: "Gold workflows",
    text: "Records, verification coordination, buyers, suppliers, and transaction steps.",
    image: GOLD_IMAGE,
    href: "/gold-mining",
  },
  {
    title: "Machinery access",
    text: "Requests, supplier coordination, financing pathways, delivery, and follow-up.",
    image: MACHINERY_IMAGE,
    href: "/machinery",
  },
  {
    title: "Institutional advisory",
    text: "Trade programs, platform strategy, SME systems, records, and execution.",
    image: GOVERNMENT_IMAGE,
    href: "/government-institutions",
  },
  {
    title: "Payments history",
    text: "XportCARD, wallet direction, transaction records, and platform-linked settlement.",
    image: PAYMENTS_IMAGE,
    href: "/platforms",
  },
];

const PLATFORMS = [
  {
    title: "Bourse de l'Or",
    text: "Gold products, document records, transaction management, and market coordination.",
    href: "/gold-mining",
    status: "Platform direction",
  },
  {
    title: "Maison en Terre",
    text: "Construction materials, production, stock, and orders.",
    href: "/platforms",
    status: "Connected platform",
  },
  {
    title: "rayOn",
    text: "Local commerce, seller tools, payments, training, and delivery workflows.",
    href: "/platforms",
    status: "Archive and platform record",
  },
  {
    title: "XportCARD",
    text: "Payment access, wallet direction, and transaction history.",
    href: "/platforms",
    status: "Payments history",
  },
  {
    title: "MindBase",
    text: "Agents, tasks, workflows, and internal operations.",
    href: "/operating-stack",
    status: "Operating stack",
  },
  {
    title: "House of Zogue",
    text: "Creative, cultural, and luxury products.",
    href: "/platforms",
    status: "Connected platform",
  },
];

const ARCHIVE_IMAGES = [
  {
    src: "/assets/exportunity/2759c4ea629c90837245379ae826bfce6ed7401205fe4a975b45bda4553cd577.jpg",
    title: "Investment summit record",
    caption: "Archive image from Exportunity public records. Context pending verification before final publication.",
  },
  {
    src: "/assets/exportunity/519f378b430f043d854a92e22300af362625c1982a1744d473515bb102e4cfdb.jpg",
    title: "Founder media record",
    caption: "Public media still connected to Exportunity leadership records. Context pending verification.",
  },
];

function PrimaryLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-400 px-5 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300">
      {children}
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">
      {children}
    </Link>
  );
}

export default function MarketingHomePage() {
  const isMarketingHost = isExportunityMarketingHost();

  useEffect(() => {
    if (!isMarketingHost) return;
    setMarketingPageMetadata({
      title: "Exportunity \u2014 Trade, Gold, Machinery, Payments, and Execution",
      description: "Exportunity builds and operates platforms for African trade, gold, machinery, payments, advisory, and operational execution.",
      image: HERO_IMAGE,
    });
  }, [isMarketingHost]);

  if (!isMarketingHost) return <Redirect to="/zone" />;

  return (
    <MarketingShell active="home">
      <section className="relative min-h-[720px] overflow-hidden border-b border-white/10">
        <img src={HERO_IMAGE} alt="Abstract Exportunity operating stack visual" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#050505_0%,rgba(5,5,5,0.92)_35%,rgba(5,5,5,0.62)_68%,rgba(5,5,5,0.18)_100%)]" />
        <MarketingContainer className="relative flex min-h-[720px] items-center py-20">
          <div className="max-w-4xl space-y-6">
            <MarketingKicker>EXPORTUNITY GROUP</MarketingKicker>
            <MarketingTitle className="text-5xl md:text-7xl">Platforms for trade, gold, machinery, and execution.</MarketingTitle>
            <MarketingLead className="max-w-2xl">
              Exportunity builds and operates digital platforms for African trade, payments, advisory, and operational workflows.
            </MarketingLead>
            <p className="max-w-2xl text-base leading-relaxed text-white/70">
              The company connects producers, miners, suppliers, buyers, businesses, and institutions through practical systems.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <PrimaryLink href="/what-we-do">Explore what we do</PrimaryLink>
              <SecondaryLink href="/platform">Platform access</SecondaryLink>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <MarketingContainer className="-mt-10 relative z-10">
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/12 bg-[#0c0b08]/95 shadow-2xl shadow-black/30 backdrop-blur md:grid-cols-4">
          {PROOF_STRIP.map((item) => (
            <div key={item.label} className="border-b border-r border-white/10 p-4 md:border-b-0 md:p-5">
              <div className="text-xl font-semibold text-amber-200">{item.value}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/55">{item.label}</div>
            </div>
          ))}
        </div>
      </MarketingContainer>

      <MarketingContainer className="py-16">
        <div className="mb-8 max-w-3xl">
          <MarketingKicker>WHAT EXPORTUNITY DOES</MarketingKicker>
          <h2 className="mt-3 text-3xl font-semibold text-white md:text-5xl">A practical operating company.</h2>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            Exportunity connects trade activity to platforms, records, approvals, payments, and follow-up.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ACTIVITIES.map((item) => (
            <Link key={item.title} href={item.href} className="group rounded-lg border border-white/10 bg-white/[0.035] p-5 transition hover:border-amber-300/45 hover:bg-white/[0.055]">
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/70">{item.text}</p>
              <div className="mt-5 text-sm font-semibold text-amber-200 group-hover:text-amber-100">Open platform</div>
            </Link>
          ))}
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-16">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {OPERATING_FIELDS.map((field) => (
            <Link key={field.title} href={field.href} className="group overflow-hidden rounded-lg border border-white/10 bg-[#0b0a08] transition hover:border-amber-300/45">
              <img src={field.image} alt={`${field.title} visual`} className="aspect-[4/3] w-full object-cover opacity-90 transition group-hover:scale-[1.02]" loading="lazy" />
              <div className="p-4">
                <h3 className="text-base font-semibold text-white">{field.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/70">{field.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-16">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-white/10 bg-[#0b0a08] p-6 md:p-8">
            <MarketingKicker>PUBLIC RECORD</MarketingKicker>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">A company with a public record.</h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              Exportunity's work includes trade promotion, SME platforms, payment tools, advisory activity, media features, and platform development.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PUBLIC_RECORDS.map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-6">
              <SecondaryLink href="/archive">View archive</SecondaryLink>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ARCHIVE_IMAGES.map((item) => (
              <figure key={item.src} className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
                <img src={item.src} alt={item.title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <figcaption className="p-4">
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <p className="mt-2 text-xs leading-5 text-white/60">{item.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-16">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <MarketingKicker>ACTIVE AND CONNECTED PLATFORMS</MarketingKicker>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-5xl">Platforms with operating roles.</h2>
          </div>
          <SecondaryLink href="/platforms">Open platform</SecondaryLink>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PLATFORMS.map((platform) => (
            <Link key={platform.title} href={platform.href} className="rounded-lg border border-white/10 bg-[#0b0a08] p-5 transition hover:border-amber-300/45">
              <div className="text-[11px] uppercase tracking-[0.16em] text-amber-200/75">{platform.status}</div>
              <h3 className="mt-3 text-xl font-semibold text-white">{platform.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/70">{platform.text}</p>
              <div className="mt-6 inline-flex rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950">Open platform</div>
            </Link>
          ))}
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-20">
        <div className="rounded-lg border border-amber-300/25 bg-[#171207] p-6 md:p-10">
          <MarketingKicker>WORK WITH EXPORTUNITY</MarketingKicker>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold text-white md:text-5xl">Trade, gold, machinery, advisory, or platform access.</h2>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-white/70">
                Contact the team for trade, gold, machinery, advisory, platform access, or institutional collaboration.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <PrimaryLink href="/contact">Contact</PrimaryLink>
              <SecondaryLink href="/work-with-us">Request access</SecondaryLink>
            </div>
          </div>
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}
