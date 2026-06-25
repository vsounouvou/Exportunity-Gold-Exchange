import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BatteryCharging,
  Building2,
  Bus,
  CalendarDays,
  CheckCircle2,
  FileText,
  Globe2,
  Handshake,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type BootstrapPayload = {
  ok: boolean;
  teams: Array<{ id: number; name: string; mission?: string | null; status?: string | null; visibility?: string | null }>;
  partners: Array<{ id: number; name: string; category: string; status: string; description?: string | null; website?: string | null }>;
  milestones: Array<{ id: number; title: string; description?: string | null; date?: string | null; status?: string | null; visibility?: string | null }>;
  media: Array<{ id: number; title: string; description?: string | null; mediaType?: string | null; fileUrl?: string | null; category?: string | null }>;
};

const nav = [
  ["/", "Accueil"],
  ["/vision", "Vision"],
  ["/history", "Histoire"],
  ["/challenge", "Challenge"],
  ["/teams", "Équipes"],
  ["/partners", "Partenaires"],
  ["/sponsors", "Sponsors"],
  ["/media", "Médias"],
  ["/contact", "Contact"],
] as const;

const phases = [
  "Phase 1 — Mobilisation des talents",
  "Phase 2 — Formation des équipes",
  "Phase 3 — Préparation technique",
  "Phase 4 — Assemblage du prototype",
  "Phase 5 — Assemblage public en direct",
  "Phase 6 — Révélation",
  "Phase 7 — Documentaire et mobilisation de capital",
];

const defaultTeams = [
  "Direction & coordination",
  "Ingénierie",
  "Design",
  "Logiciel & IA",
  "Communication & médias",
  "Juridique & gouvernance",
  "Sponsoring & partenariats",
  "Industrie & chaîne d'approvisionnement",
  "Écoles & talents",
];

const publicLabelMap: Record<string, string> = {
  active: "actif",
  planned: "planifié",
  in_progress: "en cours",
  done: "terminé",
  delayed: "retardé",
  Confirmed: "Confirmé",
  "In discussion": "En discussion",
  Prospect: "Prospect",
  "Sponsor prospect": "Sponsor prospect",
  "Technical contributor": "Contributeur technique",
  "Institutional stakeholder": "Partie prenante institutionnelle",
  "Media partner": "Partenaire média",
  Supplier: "Fournisseur",
  Initiator: "Initiateur",
  "Co-lead / Accelerator Partner": "Co-lead / partenaire accélérateur",
  "Industrial Partners": "Partenaires industriels",
  "Technical Partners": "Partenaires techniques",
  "Schools & Universities": "Écoles & universités",
  Sponsors: "Sponsors",
  "Media Partners": "Partenaires médias",
  "Institutional Partners": "Partenaires institutionnels",
  "Supplier Partners": "Fournisseurs partenaires",
  Investor: "Investisseur",
  press: "presse",
  image: "image",
  video: "vidéo",
};

function publicLabel(value?: string | null) {
  const raw = String(value || "").trim();
  return publicLabelMap[raw] || raw;
}

const sponsorPackages = [
  ["Partenaire fondateur", "Visibilité principale sur le challenge, le reveal gala, le documentaire et les supports institutionnels."],
  ["Sponsor industriel", "Association forte à l'assemblage, aux composants, à l'atelier et à la trajectoire de production locale."],
  ["Sponsor média", "Présence dans les contenus, coulisses, interviews, presse, documentaire et diffusion publique."],
  ["Sponsor talent", "Soutien direct aux étudiants, ingénieurs, développeurs, designers et équipes de construction."],
] as const;

const visionCards = [
  { Icon: FactoryIcon, label: "Assembler localement" },
  { Icon: BatteryCharging, label: "Former les talents EV" },
  { Icon: ShieldCheck, label: "Porter une gouvernance sérieuse" },
  { Icon: Globe2, label: "Construire pour l'Afrique" },
] as const;

const mediaCards = [
  { Icon: Video, title: "Documentaire", text: "Coulisses de la construction du premier prototype." },
  { Icon: FileText, title: "Presse", text: "Communiqués, dossiers et éléments officiels." },
  { Icon: Sparkles, title: "Kit média", text: "Logos, images, prompts et assets remplaçables." },
] as const;

function useAgoojyeBootstrap() {
  return useQuery<BootstrapPayload>({
    queryKey: ["/api/agoojye/public/bootstrap"],
    queryFn: () => apiRequest("/api/agoojye/public/bootstrap", "GET"),
    staleTime: 30_000,
  });
}

function AgoojyeLayout({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080808] text-[#F7F2E8]">
      <header className="sticky top-0 z-30 border-b border-[#C99A36]/20 bg-[#080808]/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-3" aria-label="AGOOJYE accueil">
            <img src="/tenants/agoojye/logo-icon.svg" alt="" className="h-9 w-9" />
            <span className="font-semibold tracking-[0.22em] text-[#F7F2E8]">AGOOJYE</span>
          </a>
          <nav className="hidden items-center gap-5 text-sm text-[#D8CFBF] lg:flex">
            {nav.map(([href, label]) => (
              <a key={href} href={href} className={active === href ? "text-[#E4C46A]" : "hover:text-[#E4C46A]"}>
                {label}
              </a>
            ))}
          </nav>
          <a
            href="/admin"
            className="rounded-md border border-[#C99A36]/45 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#E4C46A] hover:bg-[#C99A36]/10"
          >
            Admin
          </a>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-[#C99A36]/20 bg-[#050505]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-[#E4C46A]">AGOOJYE</p>
            <p className="mt-2 max-w-2xl text-sm text-[#B8AE9D]">
              Mobilité électrique née au Bénin, inspirée par l'héritage des Amazones du Dahomey et tournée vers la souveraineté industrielle africaine.
            </p>
          </div>
          <div className="text-sm text-[#B8AE9D]">
            <p>contact@agoojiye.com</p>
            <p>Fait au Bénin. Conçu pour l'Afrique.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Band({ eyebrow, title, children, dark = false }: { eyebrow?: string; title: string; children: ReactNode; dark?: boolean }) {
  return (
    <section className={dark ? "bg-[#0E0E0E]" : "bg-[#F7F2E8] text-[#171717]"}>
      <div className="mx-auto max-w-7xl px-4 py-16">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C99A36]">{eyebrow}</p> : null}
        <h2 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight md:text-5xl">{title}</h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-l border-[#C99A36]/50 pl-4">
      <p className="text-2xl font-semibold text-[#E4C46A]">{value}</p>
      <p className="mt-1 text-sm text-[#CFC5B4]">{label}</p>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  return <span className="rounded-sm border border-[#C99A36]/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#C99A36]">{publicLabel(label)}</span>;
}

function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-[#080808]">
      <div className="absolute inset-0 opacity-70">
        <img src="/tenants/agoojye/hero-bus.svg" alt="" className="h-full w-full object-cover" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/82 to-[#080808]/20" />
      <div className="relative mx-auto grid min-h-[calc(100vh-74px)] max-w-7xl items-center gap-10 px-4 py-20 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E4C46A]">Mobilité électrique née au Bénin</p>
          <h1 className="mt-5 text-6xl font-black leading-none tracking-normal text-[#F7F2E8] md:text-8xl">AGOOJYE</h1>
          <p className="mt-5 max-w-2xl text-2xl font-semibold text-[#F7F2E8]">
            Fait au Bénin. Conçu pour l'Afrique. Regardé par le monde.
          </p>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#D8CFBF]">
            Un mouvement de mobilité électrique inspiré par les Agojie, les légendaires Amazones du Dahomey, qui rassemble ingénieurs, designers, bâtisseurs, écoles, sponsors et institutions pour construire depuis le Bénin l'avenir du transport africain.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/contact" className="inline-flex items-center gap-2 rounded-md bg-[#C99A36] px-5 py-3 text-sm font-semibold text-[#080808] hover:bg-[#E4C46A]">
              Rejoindre le mouvement <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/sponsors" className="inline-flex items-center gap-2 rounded-md border border-[#C99A36]/55 px-5 py-3 text-sm font-semibold text-[#F7F2E8] hover:bg-[#C99A36]/10">
              Devenir partenaire <Handshake className="h-4 w-4" />
            </a>
            <a href="/challenge" className="inline-flex items-center gap-2 rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-[#F7F2E8] hover:bg-white/10">
              Voir le projet <Bus className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div className="self-end pb-10">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <Stat value="2026" label="Premier jalon public du Challenge Véhicule Électrique" />
            <Stat value="9" label="Départements mobilisés autour du prototype" />
            <Stat value="Bénin" label="Point de départ d'une ambition industrielle africaine" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function AgoojyeHomePage() {
  const query = useAgoojyeBootstrap();
  const teams = query.data?.teams?.length ? query.data.teams : defaultTeams.map((name, index) => ({ id: index, name, mission: "Mission en cours de structuration." }));
  const partners = query.data?.partners || [];
  const milestones = query.data?.milestones || [];

  return (
    <AgoojyeLayout active="/">
      <HomeHero />
      <Band eyebrow="Vision" title="Un projet industriel, pas seulement un prototype.">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <p className="text-lg leading-8 text-[#3D372D]">
            AGOOJYE est né de l'ambition de prouver que le Bénin peut concevoir, assembler et industrialiser des solutions de mobilité électrique adaptées aux réalités africaines. Le Challenge Véhicule Électrique est la première étape visible d'une trajectoire plus large : créer une vraie société de véhicules électriques.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {visionCards.map(({ Icon, label }) => (
              <div key={label} className="rounded-md border border-[#D9C79B] bg-white p-4">
                <Icon className="h-5 w-5 text-[#C99A36]" />
                <p className="mt-3 font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </Band>
      <Band dark eyebrow="Pourquoi le Bénin" title="Le futur industriel africain doit aussi sortir des ateliers béninois.">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["Héritage", "L'énergie des Agojie devient une discipline de construction, de leadership et de souveraineté."],
            ["Capacité", "Le projet mobilise étudiants techniques, ingénieurs, designers, développeurs, juristes et communicants."],
            ["Industrie", "La vision dépasse l'importation : assembler, apprendre, fabriquer des pièces et préparer l'industrialisation."],
          ].map(([title, text]) => (
            <article key={title} className="rounded-md border border-[#C99A36]/25 bg-[#171717] p-5">
              <h3 className="text-lg font-semibold text-[#E4C46A]">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#D8CFBF]">{text}</p>
            </article>
          ))}
        </div>
      </Band>
      <Band eyebrow="Challenge Véhicule Électrique" title="Un programme d'exécution structuré, pas un simple hackathon.">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="leading-7 text-[#3D372D]">
              Le challenge identifie les talents, organise les équipes, valide la faisabilité technique et assemble un prototype fonctionnel de bus électrique au Bénin.
            </p>
            <a href="/challenge" className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#080808] px-4 py-2 text-sm font-semibold text-[#F7F2E8]">
              Comprendre le challenge <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div className="grid gap-3">
            {phases.map((phase) => (
              <div key={phase} className="flex items-center gap-3 rounded-md border border-[#D9C79B] bg-white px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-[#C99A36]" />
                <span className="text-sm font-medium">{phase}</span>
              </div>
            ))}
          </div>
        </div>
      </Band>
      <Band dark eyebrow="Jalons" title="Une cadence publique et éditable depuis l'administration.">
        <Timeline items={milestones} dark />
      </Band>
      <Band eyebrow="Équipes" title="Des départements conçus pour construire, documenter et industrialiser.">
        <TeamGrid teams={teams} />
      </Band>
      <Band dark eyebrow="Partenaires et sponsors" title="Chaque statut doit rester précis, vérifiable et non exagéré.">
        <PartnerGrid partners={partners} dark />
      </Band>
      <Band eyebrow="Média et documentaire" title="Montrer la construction réelle, pas seulement annoncer l'ambition.">
        <div className="grid gap-5 md:grid-cols-3">
          {mediaCards.map(({ Icon, title, text }) => (
            <article key={title} className="rounded-md border border-[#D9C79B] bg-white p-5">
              <Icon className="h-5 w-5 text-[#C99A36]" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#5B5347]">{text}</p>
            </article>
          ))}
        </div>
      </Band>
      <CtaBand />
    </AgoojyeLayout>
  );
}

function FactoryIcon(props: { className?: string }) {
  return <Building2 {...props} />;
}

function Timeline({ items, dark = false }: { items: BootstrapPayload["milestones"]; dark?: boolean }) {
  const source = items.length
    ? items
    : MILESTONES_FALLBACK.map((item, index) => ({ id: index, title: item[0], description: item[1], date: item[2], status: item[3] }));
  return (
    <div className="relative grid gap-4">
      {source.map((item, index) => (
        <article key={item.id} className={`relative rounded-md border p-5 ${dark ? "border-[#C99A36]/25 bg-[#171717]" : "border-[#D9C79B] bg-white"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#C99A36]">0{index + 1}</p>
            <StatusBadge label={item.status || "planned"} />
          </div>
          <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
          <p className={`mt-2 text-sm leading-6 ${dark ? "text-[#D8CFBF]" : "text-[#5B5347]"}`}>{item.description || "Jalon à préciser."}</p>
          {item.date ? <p className="mt-3 text-xs text-[#C99A36]">{new Date(item.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</p> : null}
        </article>
      ))}
    </div>
  );
}

const MILESTONES_FALLBACK = [
  ["Préparation du projet", "Cadrage, partenaires, équipes et ressources initiales.", "2026-06-01", "en cours"],
  ["Assemblage public", "Cible d'assemblage public du prototype de bus électrique.", "2026-07-15", "planifié"],
  ["Reveal gala", "Présentation du prototype, sponsors, presse et partenaires.", "2026-07-25", "planifié"],
] as const;

function TeamGrid({ teams }: { teams: BootstrapPayload["teams"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {teams.map((team) => (
        <article key={team.id || team.name} className="rounded-md border border-[#D9C79B] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <Users className="h-5 w-5 text-[#C99A36]" />
            <StatusBadge label={team.status || "active"} />
          </div>
          <h3 className="mt-4 text-lg font-semibold">{team.name}</h3>
          <p className="mt-2 text-sm leading-6 text-[#5B5347]">{team.mission || "Mission en cours de structuration."}</p>
          <p className="mt-4 text-xs uppercase tracking-wide text-[#8A5A2B]">Participants: à compléter depuis l'administration</p>
        </article>
      ))}
    </div>
  );
}

function PartnerGrid({ partners, dark = false }: { partners: BootstrapPayload["partners"]; dark?: boolean }) {
  const source = partners.length ? partners : PARTNER_FALLBACK;
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {source.map((partner) => (
        <article key={partner.id || partner.name} className={`rounded-md border p-5 ${dark ? "border-[#C99A36]/25 bg-[#171717]" : "border-[#D9C79B] bg-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <Handshake className="h-5 w-5 text-[#C99A36]" />
            <StatusBadge label={partner.status} />
          </div>
          <h3 className="mt-4 text-lg font-semibold">{partner.name}</h3>
          <p className="mt-1 text-xs uppercase tracking-wide text-[#C99A36]">{publicLabel(partner.category)}</p>
          <p className={`mt-3 text-sm leading-6 ${dark ? "text-[#D8CFBF]" : "text-[#5B5347]"}`}>{partner.description || "Description à compléter."}</p>
        </article>
      ))}
    </div>
  );
}

const PARTNER_FALLBACK = [
  { id: 1, name: "Exportunity Machinery", category: "Initiator", status: "Confirmed", description: "Initiateur de la vision industrielle." },
  { id: 2, name: "Future Studio", category: "Co-lead / Accelerator Partner", status: "Confirmed", description: "Support innovation, digital et accélérateur." },
  { id: 3, name: "Sponsors", category: "Sponsors", status: "Sponsor prospect", description: "Prospects à qualifier." },
];

export function AgoojyeVisionPage() {
  return (
    <AgoojyeLayout active="/vision">
      <Band dark eyebrow="Vision" title="L'Afrique ne fera pas que consommer le futur. Elle le construira.">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <p className="text-lg leading-8 text-[#D8CFBF]">
            AGOOJYE défend une mobilité électrique construite localement : assemblage, compétences industrielles, formation des jeunes, fabrication de pièces, logiciels embarqués, systèmes de transport propres et ambition de production depuis le Bénin.
          </p>
          <div className="grid gap-3">
            {["Assemblage local", "Compétences industrielles", "Jeunesse formée sous pression réelle", "GDIZ et ambition d'industrialisation", "Transport africain propre et crédible"].map((item) => (
              <div key={item} className="rounded-md border border-[#C99A36]/25 bg-[#171717] px-4 py-3 text-sm">{item}</div>
            ))}
          </div>
        </div>
      </Band>
      <Band title="Ne pas importer le futur : le bâtir localement.">
        <p className="max-w-4xl text-lg leading-8 text-[#3D372D]">
          La première étape est le Challenge Véhicule Électrique. La trajectoire complète vise la création d'une entreprise de véhicules électriques, capable de mobiliser talents, partenaires, capitaux, fournisseurs et capacités industrielles autour du Bénin.
        </p>
      </Band>
      <CtaBand />
    </AgoojyeLayout>
  );
}

export function AgoojyeHistoryPage() {
  return (
    <AgoojyeLayout active="/history">
      <Band dark eyebrow="Origine" title="AGOOJYE naît d'une ambition industrielle portée par Exportunity Machinery.">
        <div className="max-w-4xl space-y-5 text-lg leading-8 text-[#D8CFBF]">
          <p>
            La vision du véhicule électrique a été initiée par Exportunity / Exportunity Machinery, qui porte le projet de bus électrique dans un cadre d'accélération deep-tech co-dirigé avec Future Studio.
          </p>
          <p>
            Future Studio contribue à l'innovation, au digital, au design, aux talents logiciels et au support accélérateur. Les étudiants et contributeurs construisent le prototype. Les sponsors et partenaires soutiennent le mouvement.
          </p>
        </div>
      </Band>
      <Band title="Chronologie du mouvement.">
        <Timeline
          items={[
            { id: 1, title: "Ambition industrielle", description: "Prouver que le Bénin peut concevoir, assembler et industrialiser.", status: "origine" },
            { id: 2, title: "Rôle d'Exportunity Machinery", description: "Initiation et leadership de la vision industrielle de mobilité électrique.", status: "lead" },
            { id: 3, title: "Partenariat avec Future Studio", description: "Co-lead accélérateur, innovation, software, design et coordination.", status: "co-lead" },
            { id: 4, title: "Mobilisation des talents", description: "Étudiants, ingénieurs, architectes, développeurs, communicants, juristes et partenaires.", status: "mobilisation" },
            { id: 5, title: "Challenge Véhicule Électrique", description: "Programme structuré pour tester les équipes et assembler le premier prototype.", status: "challenge" },
            { id: 6, title: "Prototype, reveal et documentaire", description: "Construction visible, gala, vidéo publique et mobilisation de capital.", status: "suite" },
          ]}
        />
      </Band>
    </AgoojyeLayout>
  );
}

export function AgoojyeChallengePage() {
  const query = useAgoojyeBootstrap();
  return (
    <AgoojyeLayout active="/challenge">
      <Band dark eyebrow="Challenge Véhicule Électrique" title="Identifier les talents, organiser les équipes, valider la faisabilité et assembler un bus électrique fonctionnel.">
        <div className="grid gap-4 md:grid-cols-2">
          {phases.map((phase) => (
            <div key={phase} className="rounded-md border border-[#C99A36]/25 bg-[#171717] p-4 text-sm font-medium">
              {phase}
            </div>
          ))}
        </div>
      </Band>
      <Band title="Dates connues, éditables depuis l'administration.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[
            ["Préparation", "Juin 2026"],
            ["Assemblage public", "15 juillet 2026"],
            ["Reveal gala", "25 juillet 2026"],
            ["Documentaire", "Fin juillet 2026"],
            ["Sortie publique", "1 août 2026"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-[#D9C79B] bg-white p-4">
              <CalendarDays className="h-5 w-5 text-[#C99A36]" />
              <p className="mt-3 text-sm text-[#5B5347]">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </Band>
      <Band dark eyebrow="Timeline" title="Jalons publics du challenge.">
        <Timeline items={query.data?.milestones || []} dark />
      </Band>
    </AgoojyeLayout>
  );
}

export function AgoojyeTeamsPage() {
  const query = useAgoojyeBootstrap();
  const teams = query.data?.teams?.length ? query.data.teams : defaultTeams.map((name, index) => ({ id: index, name, mission: "Mission en cours de structuration." }));
  return (
    <AgoojyeLayout active="/teams">
      <Band title="Équipes du projet AGOOJYE.">
        <TeamGrid teams={teams} />
      </Band>
    </AgoojyeLayout>
  );
}

export function AgoojyePartnersPage() {
  const query = useAgoojyeBootstrap();
  return (
    <AgoojyeLayout active="/partners">
      <Band dark title="Partenaires, sponsors et institutions, avec statuts explicites.">
        <PartnerGrid partners={query.data?.partners || []} dark />
      </Band>
    </AgoojyeLayout>
  );
}

export function AgoojyeSponsorsPage() {
  return (
    <AgoojyeLayout active="/sponsors">
      <Band dark eyebrow="Sponsors" title="Associer votre entreprise à la première fondation visible d'une mobilité électrique béninoise.">
        <div className="grid gap-4 md:grid-cols-2">
          {sponsorPackages.map(([title, text]) => (
            <article key={title} className="rounded-md border border-[#C99A36]/25 bg-[#171717] p-5">
              <h3 className="text-lg font-semibold text-[#E4C46A]">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#D8CFBF]">{text}</p>
            </article>
          ))}
        </div>
      </Band>
      <Band title="Devenir sponsor.">
        <SponsorForm />
      </Band>
    </AgoojyeLayout>
  );
}

export function AgoojyeMediaPage() {
  const query = useAgoojyeBootstrap();
  const media = query.data?.media || [];
  return (
    <AgoojyeLayout active="/media">
      <Band title="Médias, documentaire, communiqués et assets officiels.">
        <div className="grid gap-4 md:grid-cols-3">
          {(media.length ? media : [
            { id: 1, title: "Communiqués de presse", description: "À publier depuis l'administration.", mediaType: "press" },
            { id: 2, title: "Images officielles", description: "Logos, visuels et galerie du projet.", mediaType: "image" },
            { id: 3, title: "Documentaire", description: "Suivi de production vidéo fin juillet 2026.", mediaType: "video" },
          ]).map((item) => (
            <article key={item.id} className="rounded-md border border-[#D9C79B] bg-white p-5">
              <Video className="h-5 w-5 text-[#C99A36]" />
              <h3 className="mt-3 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#5B5347]">{item.description}</p>
              <p className="mt-4 text-xs uppercase tracking-wide text-[#8A5A2B]">{publicLabel(item.mediaType)}</p>
            </article>
          ))}
        </div>
      </Band>
    </AgoojyeLayout>
  );
}

export function AgoojyeContactPage() {
  return (
    <AgoojyeLayout active="/contact">
      <Band dark title="Entrer en contact avec AGOOJYE.">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4 text-[#D8CFBF]">
            <p>Choisissez le bon type de demande : générale, sponsor, talent, média ou institutionnelle.</p>
            <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#C99A36]" /> contact@agoojiye.com</p>
            <p className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#C99A36]" /> Les demandes sont enregistrées dans le CRM interne.</p>
          </div>
          <ContactForm />
        </div>
      </Band>
    </AgoojyeLayout>
  );
}

function SponsorForm() {
  const [form, setForm] = useState({
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    interest: "Sponsoring Challenge Véhicule Électrique",
    budgetRange: "",
    message: "",
    website: "",
  });
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/public/sponsors", "POST", form),
    onSuccess: () => setForm({ companyName: "", contactPerson: "", email: "", phone: "", interest: "Sponsoring Challenge Véhicule Électrique", budgetRange: "", message: "", website: "" }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-md border border-[#D9C79B] bg-white p-5">
      <input className="hidden" value={form.website} onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))} tabIndex={-1} autoComplete="off" />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Entreprise" value={form.companyName} onChange={(value) => setForm((prev) => ({ ...prev, companyName: value }))} required />
        <Field label="Personne contact" value={form.contactPerson} onChange={(value) => setForm((prev) => ({ ...prev, contactPerson: value }))} required />
        <Field label="Email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} required type="email" />
        <Field label="Téléphone" value={form.phone} onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
        <Field label="Intérêt sponsoring" value={form.interest} onChange={(value) => setForm((prev) => ({ ...prev, interest: value }))} />
        <Field label="Budget indicatif" value={form.budgetRange} onChange={(value) => setForm((prev) => ({ ...prev, budgetRange: value }))} />
      </div>
      <label className="text-sm font-medium text-[#3D372D]">
        Message
        <textarea value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} rows={4} className="mt-2 w-full rounded-md border border-[#D9C79B] px-3 py-2 text-sm outline-none focus:border-[#C99A36]" />
      </label>
      {mutation.isSuccess ? <p className="text-sm font-medium text-[#123C2F]">Demande enregistrée. L'équipe AGOOJYE pourra la suivre dans le CRM.</p> : null}
      {mutation.isError ? <p className="text-sm font-medium text-red-700">{String((mutation.error as Error)?.message || "Erreur")}</p> : null}
      <button disabled={mutation.isPending} className="inline-flex w-fit items-center gap-2 rounded-md bg-[#080808] px-5 py-3 text-sm font-semibold text-[#F7F2E8]">
        {mutation.isPending ? "Envoi..." : "Devenir sponsor"} <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}

function ContactForm() {
  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    email: "",
    phone: "",
    inquiryType: "Demande générale",
    message: "",
    website: "",
  });
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/public/contact", "POST", form),
    onSuccess: () => setForm({ fullName: "", companyName: "", email: "", phone: "", inquiryType: "Demande générale", message: "", website: "" }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-md border border-[#C99A36]/25 bg-[#171717] p-5">
      <input className="hidden" value={form.website} onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))} tabIndex={-1} autoComplete="off" />
      <div className="grid gap-3 md:grid-cols-2">
        <DarkField label="Nom complet" value={form.fullName} onChange={(value) => setForm((prev) => ({ ...prev, fullName: value }))} required />
        <DarkField label="Entreprise / école" value={form.companyName} onChange={(value) => setForm((prev) => ({ ...prev, companyName: value }))} />
        <DarkField label="Email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} required type="email" />
        <DarkField label="Téléphone" value={form.phone} onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
      </div>
      <label className="text-sm font-medium text-[#F7F2E8]">
        Type de demande
        <select value={form.inquiryType} onChange={(event) => setForm((prev) => ({ ...prev, inquiryType: event.target.value }))} className="mt-2 w-full rounded-md border border-[#C99A36]/35 bg-[#080808] px-3 py-2 text-sm outline-none focus:border-[#E4C46A]">
          <option>Demande générale</option>
          <option>Demande sponsoring</option>
          <option>Candidature talent / participant</option>
          <option>Demande média</option>
          <option>Demande institutionnelle</option>
        </select>
      </label>
      <label className="text-sm font-medium text-[#F7F2E8]">
        Message
        <textarea value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} rows={4} className="mt-2 w-full rounded-md border border-[#C99A36]/35 bg-[#080808] px-3 py-2 text-sm outline-none focus:border-[#E4C46A]" />
      </label>
      {mutation.isSuccess ? <p className="text-sm font-medium text-[#E4C46A]">Message enregistré dans le CRM AGOOJYE.</p> : null}
      {mutation.isError ? <p className="text-sm font-medium text-red-300">{String((mutation.error as Error)?.message || "Erreur")}</p> : null}
      <button disabled={mutation.isPending} className="inline-flex w-fit items-center gap-2 rounded-md bg-[#C99A36] px-5 py-3 text-sm font-semibold text-[#080808]">
        {mutation.isPending ? "Envoi..." : "Envoyer"} <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return (
    <label className="text-sm font-medium text-[#3D372D]">
      {props.label}
      <input required={props.required} type={props.type || "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[#D9C79B] px-3 text-sm outline-none focus:border-[#C99A36]" />
    </label>
  );
}

function DarkField(props: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return (
    <label className="text-sm font-medium text-[#F7F2E8]">
      {props.label}
      <input required={props.required} type={props.type || "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[#C99A36]/35 bg-[#080808] px-3 text-sm outline-none focus:border-[#E4C46A]" />
    </label>
  );
}

function CtaBand() {
  return (
    <section className="bg-[#123C2F]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-12 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E4C46A]">AGOOJYE</p>
          <h2 className="mt-2 max-w-3xl text-2xl font-semibold text-[#F7F2E8]">
            Construire la première fondation visible d'une entreprise béninoise de véhicules électriques.
          </h2>
        </div>
        <a href="/contact" className="inline-flex w-fit items-center gap-2 rounded-md bg-[#C99A36] px-5 py-3 text-sm font-semibold text-[#080808]">
          Prendre contact <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
