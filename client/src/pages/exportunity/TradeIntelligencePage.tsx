import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  Database,
  Globe2,
  Landmark,
  LoaderCircle,
  Newspaper,
  PackageSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocale } from "@/contexts/LocaleContext";
import { apiRequest } from "@/lib/queryClient";

type TradeCountry = { code: string; name: string; slug: string };
type PhaseSector = { code: string; name: string };
type CoverageCell = {
  countryCode: string;
  dimension: string;
  sectorCode: string;
  status: "empty" | "researching" | "partial" | "verified" | "stale";
  coveragePercent: number;
  qualityScore: number;
  lastVerifiedAt: string | null;
};
type TradeEntity = {
  id: string;
  entityType: string;
  slug: string;
  displayName: string;
  countryCode: string | null;
  sectorCode: string | null;
  summary: string | null;
  lastVerifiedAt: string | null;
  publishedAt: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  facts: Array<{
    id: string;
    fieldKey: string;
    valueText: string | null;
    unit: string | null;
    sourceUrl: string;
    sourceDocumentTitle: string | null;
    sourceName: string;
    retrievedAt: string;
  }>;
};
type DemandSignal = {
  product: string;
  destinationCountryCode: string | null;
  sectorCode: string | null;
  eventCount: number;
  zeroResultCount: number;
  commercialEventCount: number;
  demandScore: number;
  averageDifficulty: number;
};
type TradeOverview = {
  ok: boolean;
  phaseOne: { countries: TradeCountry[]; sectors: PhaseSector[] };
  coveragePlan: {
    scope: "africa_54";
    countryCount: number;
    priorityCountryCount: number;
    countries: TradeCountry[];
    priorityCountries: TradeCountry[];
    sectors: PhaseSector[];
    activeSectorCount: number;
    proposedSectorCount: number;
    emptyCoverageIsNotEvidence: boolean;
  };
  entities: TradeEntity[];
  coverage: CoverageCell[];
  demandRadar: DemandSignal[];
  disclosure: {
    publicationRule: string;
    demandPrivacyThreshold: number;
    emptyCoverageIsNotEvidence: boolean;
  };
};
type NewsroomArticle = {
  id: string;
  storyType: string;
  slug: string;
  title: string;
  dek: string | null;
  countryCode: string | null;
  sectorCode: string | null;
  tags: string[];
  citations: Array<{
    id: string;
    sourceId: string;
    sourceName: string;
  }>;
  publishedAt: string | null;
};
type NewsroomResponse = {
  ok: boolean;
  articles: NewsroomArticle[];
  disclosure: {
    editorialRule: string;
    automaticPublication: boolean;
  };
};

const STATUS_STYLES: Record<CoverageCell["status"], string> = {
  empty: "border-slate-200 bg-slate-50 text-slate-600",
  researching: "border-blue-200 bg-blue-50 text-blue-700",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  verified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  stale: "border-rose-200 bg-rose-50 text-rose-700",
};

function readRouteScope() {
  if (typeof window === "undefined") return { country: "", sector: "" };
  const country = window.location.pathname.match(/^\/trade\/countries\/([^/]+)/i)?.[1];
  const sector = window.location.pathname.match(/^\/trade\/sectors\/([^/]+)/i)?.[1];
  return {
    country: country ? decodeURIComponent(country).toUpperCase() : "",
    sector: sector ? decodeURIComponent(sector) : "",
  };
}

function getAnonymousTradeSession() {
  const key = "exportunity_trade_intelligence_session";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `trade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, next);
  return next;
}

function readable(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function TradeIntelligencePage() {
  const { language } = useLocale();
  const fr = language === "fr";
  const routeScope = useMemo(readRouteScope, []);
  const [country, setCountry] = useState(routeScope.country);
  const [sector, setSector] = useState(routeScope.sector);
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = fr
      ? "Intelligence commerciale Afrique | Exportunity"
      : "African Trade Intelligence | Exportunity";
    const description = fr
      ? "Données sourcées sur les marchés, entreprises, produits, règles, logistique et demande commerciale en Afrique."
      : "Source-backed intelligence on African markets, companies, products, rules, logistics, and commercial demand.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [fr]);

  const overviewUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (sector) params.set("sector", sector);
    const suffix = params.toString();
    return `/api/trade/overview${suffix ? `?${suffix}` : ""}`;
  }, [country, sector]);
  const overviewQuery = useQuery<TradeOverview>({
    queryKey: [overviewUrl],
  });
  const newsroomUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (sector) params.set("sector", sector);
    const suffix = params.toString();
    return `/api/trade/newsroom${suffix ? `?${suffix}` : ""}`;
  }, [country, sector]);
  const newsroomQuery = useQuery<NewsroomResponse>({
    queryKey: [newsroomUrl],
  });
  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const params = new URLSearchParams();
      if (country) params.set("country", country);
      if (sector) params.set("sector", sector);
      params.set("q", searchQuery);
      const result = (await apiRequest(
        `/api/trade/overview?${params.toString()}`,
        { method: "GET" },
      )) as TradeOverview;
      const resultCount = result.entities.length;
      await apiRequest("/api/trade/demand-events", "POST", {
        eventType: resultCount === 0 ? "zero_result" : "search",
        sourceSurface: "trade_intelligence_search",
        sessionId: getAnonymousTradeSession(),
        queryText: searchQuery,
        normalizedProduct: searchQuery,
        destinationCountryCode: country || undefined,
        sectorCode: sector || undefined,
        commercialIntent: "market_research",
        resultCount,
        difficultyScore: resultCount === 0 ? 60 : 20,
        locale: language,
      });
      return result;
    },
  });
  const data = searchMutation.data || overviewQuery.data;
  const countries = data?.coveragePlan?.countries || data?.phaseOne.countries || [];
  const priorityCountries = data?.phaseOne.countries || [];
  const sectors = data?.coveragePlan?.sectors || data?.phaseOne.sectors || [];
  const coverageByCountry = useMemo(() => {
    const rows = new Map<string, CoverageCell[]>();
    for (const cell of data?.coverage || []) {
      rows.set(cell.countryCode, [...(rows.get(cell.countryCode) || []), cell]);
    }
    const selectedCountry = countries.find((item) => item.code === country);
    const displayedCountries = selectedCountry && !priorityCountries.some(
      (item) => item.code === selectedCountry.code,
    )
      ? [...priorityCountries, selectedCountry]
      : priorityCountries;
    return displayedCountries.map((item) => {
      const cells = rows.get(item.code) || [];
      const average = cells.length
        ? Math.round(
            cells.reduce((sum, cell) => sum + cell.coveragePercent, 0) /
              cells.length,
          )
        : 0;
      return { ...item, cells, average };
    });
  }, [countries, country, data?.coverage, priorityCountries]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) return;
    searchMutation.mutate(value);
  };

  const resetSearch = () => {
    setQuery("");
    searchMutation.reset();
  };

  return (
    <main className="min-h-screen bg-[#F5F1E8] text-[#10231D]">
      <header className="border-b border-[#153F35]/15 bg-[#0B2F27] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 font-black tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#D6A84B] text-[#0B2F27]">
              <Globe2 className="h-5 w-5" />
            </span>
            Exportunity
          </Link>
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <Link href="/industrial" className="hidden rounded-full px-4 py-2 hover:bg-white/10 sm:inline-flex">
              {fr ? "Réseau industriel" : "Industrial network"}
            </Link>
            <Link href="/request-quote" className="rounded-full bg-[#D6A84B] px-4 py-2 text-[#0B2F27] hover:bg-[#E5BC67]">
              {fr ? "Déposer un besoin" : "Submit a requirement"}
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#0B2F27] text-white">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,#D6A84B_0,transparent_35%),radial-gradient(circle_at_80%_80%,#2B7A68_0,transparent_40%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_.8fr] lg:px-8 lg:py-24">
          <div>
            <Badge className="mb-5 border border-[#D6A84B]/40 bg-[#D6A84B]/15 text-[#F4D99E] hover:bg-[#D6A84B]/15">
              <Database className="mr-2 h-3.5 w-3.5" />
              {fr ? "Intelligence commerciale avec sources" : "Source-backed trade intelligence"}
            </Badge>
            <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              {fr
                ? "Comprendre les marchés africains avant d’agir."
                : "Understand African markets before you act."}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-emerald-50/80 sm:text-lg">
              {fr
                ? "Pays, secteurs, entreprises, règles, logistique et signaux de demande reliés à des preuves vérifiables. Les zones vides restent visibles : nous ne remplaçons jamais une donnée manquante par une supposition."
                : "Countries, sectors, companies, rules, logistics, and demand signals connected to verifiable evidence. Empty coverage stays visible—we never replace missing data with a guess."}
            </p>
            <form onSubmit={submitSearch} className="mt-8 flex max-w-2xl flex-col gap-3 rounded-2xl bg-white p-2 shadow-2xl sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={fr ? "Ex. huile de palme raffinée en Côte d’Ivoire" : "e.g. refined palm oil in Côte d’Ivoire"}
                  className="h-12 border-0 pl-12 text-slate-900 shadow-none focus-visible:ring-0"
                />
              </div>
              <Button type="submit" disabled={searchMutation.isPending} className="h-12 bg-[#D6A84B] px-6 font-bold text-[#0B2F27] hover:bg-[#E5BC67]">
                {searchMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <PackageSearch className="mr-2 h-4 w-4" />}
                {fr ? "Explorer" : "Explore"}
              </Button>
            </form>
          </div>

          <Card className="self-end border-white/15 bg-white/10 text-white shadow-2xl backdrop-blur">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-6 w-6 text-[#F4D99E]" />
                <div>
                  <h2 className="font-bold">{fr ? "Règle de publication" : "Publication rule"}</h2>
                  <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                    {fr
                      ? "Au moins deux sources indépendantes, des faits vérifiés et une validation humaine."
                      : "At least two independent sources, verified facts, and human approval."}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                  <div className="text-3xl font-black">{data?.coveragePlan?.countryCount || 54}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-emerald-50/65">{fr ? "pays dans le périmètre" : "countries in scope"}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                  <div className="text-3xl font-black">{data?.coveragePlan?.activeSectorCount || 7}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-emerald-50/65">{fr ? "secteurs actifs" : "active sectors"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-50/65">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                {fr ? "Les demandes réelles alimentent le radar de demande." : "Real requirements feed the demand radar."}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-14 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[.18em] text-[#9A6D17]">{fr ? "Périmètre Afrique 54" : "Africa 54 scope"}</div>
              <h2 className="mt-2 text-3xl font-black tracking-tight">{fr ? "Marchés prioritaires et couverture pays" : "Priority markets and country coverage"}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {fr ? "Les cinq marchés de lancement restent prioritaires, tandis que les 54 pays sont inscrits au programme de recherche. Un pourcentage ne représente que des faits sourcés et vérifiés." : "The five launch markets remain priorities while all 54 countries are enrolled in the research plan. Percentages represent only sourced and verified facts."}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-64">
              <Select
                value={country || "__all__"}
                onValueChange={(value) => {
                  setCountry(value === "__all__" ? "" : value);
                  resetSearch();
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder={fr ? "Choisir un pays" : "Choose a country"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{fr ? "Marchés prioritaires" : "Priority markets"}</SelectItem>
                  {countries.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.code} · {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(country || sector || searchMutation.data) && (
                <Button variant="outline" onClick={() => { setCountry(""); setSector(""); resetSearch(); }}>
                  {fr ? "Réinitialiser" : "Reset view"}
                </Button>
              )}
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {coverageByCountry.map((item) => (
              <article
                key={item.code}
                className={`rounded-2xl border p-5 text-left transition ${item.code === country ? "border-[#0B2F27] bg-[#0B2F27] text-white shadow-lg" : "border-[#0B2F27]/10 bg-white hover:-translate-y-0.5 hover:border-[#0B2F27]/30 hover:shadow-md"}`}
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => { setCountry(item.code === country ? "" : item.code); resetSearch(); }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black">{item.code}</span>
                    <Landmark className={`h-4 w-4 ${item.code === country ? "text-[#F4D99E]" : "text-[#9A6D17]"}`} />
                  </div>
                  <div className="mt-6 text-lg font-bold">{item.name}</div>
                  <div className="mt-4 flex items-center gap-3">
                    <Progress value={item.average} className="h-1.5 flex-1 bg-slate-200" />
                    <span className="text-xs font-bold">{item.average}%</span>
                  </div>
                </button>
                <Link href={`/trade/countries/${item.code}`} className={`mt-4 inline-flex items-center text-xs font-bold ${item.code === country ? "text-[#F4D99E]" : "text-[#0B2F27]"}`}>
                  {fr ? "Page pays" : "Country page"} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-[#9A6D17]">
                <Newspaper className="h-4 w-4" />
                {fr ? "Salle de rédaction commerciale" : "Trade newsroom"}
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight">
                {fr ? "Analyses avec preuves consultables" : "Analysis with inspectable evidence"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {fr
                  ? "Chaque article public a franchi la revue de recherche, la revue éditoriale et une publication humaine explicite avec au moins deux sources actives vérifiées."
                  : "Every public story passed research review, editor review, and explicit human release with at least two verified active sources."}
              </p>
            </div>
          </div>

          {newsroomQuery.isLoading ? (
            <div className="mt-6 grid min-h-40 place-items-center rounded-2xl border border-[#0B2F27]/10 bg-white text-sm text-slate-500">
              <LoaderCircle className="h-7 w-7 animate-spin text-[#0B2F27]" />
            </div>
          ) : newsroomQuery.data?.articles.length ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {newsroomQuery.data.articles.slice(0, 6).map((article) => (
                <article key={article.id} className="flex flex-col rounded-2xl border border-[#0B2F27]/10 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-[#D6A84B]/50 bg-[#FFF8E8] text-[#7A5514]">
                      {readable(article.storyType)}
                    </Badge>
                    {article.countryCode ? <Badge variant="outline">{article.countryCode}</Badge> : null}
                  </div>
                  <h3 className="mt-4 text-xl font-black leading-7 text-[#10231D]">{article.title}</h3>
                  {article.dek ? <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">{article.dek}</p> : null}
                  <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{article.citations.length} {fr ? "citations vérifiées" : "verified citations"}</span>
                    <span>{new Set(article.citations.map((citation) => citation.sourceId)).size} {fr ? "sources" : "sources"}</span>
                    {article.publishedAt ? <span>{new Date(article.publishedAt).toLocaleDateString()}</span> : null}
                  </div>
                  <Link href={`/trade/articles/${article.slug}`} className="mt-6 inline-flex items-center text-sm font-black text-[#0B2F27] hover:underline">
                    {fr ? "Lire avec les sources" : "Read with sources"}<ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-[#0B2F27]/20 bg-white/60 p-8 text-sm leading-6 text-slate-600">
              {fr
                ? "Aucun article n’a encore satisfait les contrôles éditoriaux dans ce périmètre. Cette absence n’est pas remplacée par du contenu généré."
                : "No story has passed the editorial controls in this scope yet. The empty state is not replaced with generated content."}
            </div>
          )}
        </section>

        <section className="grid gap-8 lg:grid-cols-[.75fr_1.25fr]">
          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-[#9A6D17]">{fr ? "Secteurs" : "Sectors"}</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight">{fr ? "Choisir un angle de marché" : "Choose a market lens"}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {fr ? "Le périmètre initial est volontairement concentré pour produire une base fiable avant l’extension aux 54 pays." : "The initial scope is deliberately focused so the evidence model is reliable before expanding across 54 countries."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {sectors.map((item) => (
                <Button
                  key={item.code}
                  type="button"
                  variant={sector === item.code ? "default" : "outline"}
                  className={sector === item.code ? "bg-[#0B2F27] text-white hover:bg-[#17483C]" : "border-[#0B2F27]/20 bg-white"}
                  onClick={() => { setSector(item.code === sector ? "" : item.code); resetSearch(); }}
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </div>

          <Card className="border-[#0B2F27]/10 bg-white shadow-sm">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[.16em] text-[#9A6D17]">{fr ? "Graphe public" : "Public graph"}</div>
                  <h3 className="mt-2 text-2xl font-black">{fr ? "Entités vérifiées" : "Verified entities"}</h3>
                </div>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  <BookOpenCheck className="mr-1.5 h-3.5 w-3.5" />
                  {data?.entities.length || 0}
                </Badge>
              </div>

              {overviewQuery.isLoading || searchMutation.isPending ? (
                <div className="grid min-h-52 place-items-center text-sm text-slate-500">
                  <LoaderCircle className="mb-3 h-7 w-7 animate-spin text-[#0B2F27]" />
                </div>
              ) : data?.entities.length ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {data.entities.slice(0, 8).map((entity) => (
                    <article key={entity.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <Badge variant="outline" className="text-[10px]">{readable(entity.entityType)}</Badge>
                        {entity.countryCode && <span className="text-xs font-black text-slate-500">{entity.countryCode}</span>}
                      </div>
                      <h4 className="mt-3 font-bold text-[#10231D]">{entity.displayName}</h4>
                      {entity.summary && <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{entity.summary}</p>}
                      {entity.facts.slice(0, 2).map((fact) => (
                        <div key={fact.id} className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs">
                          <div className="font-bold text-slate-700">{readable(fact.fieldKey)}</div>
                          <div className="mt-1 text-slate-600">{fact.valueText}{fact.unit ? ` ${fact.unit}` : ""}</div>
                          <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex font-bold text-[#1F6B59] hover:underline">
                            {fact.sourceDocumentTitle || fact.sourceName}
                          </a>
                        </div>
                      ))}
                      {entity.sourceUrl && (
                        <a href={entity.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center text-xs font-bold text-[#1F6B59] hover:underline">
                          {entity.sourceName || (fr ? "Voir la source" : "View source")}
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 text-amber-700" />
                    <div>
                      <h4 className="font-bold text-amber-950">{searchMutation.data ? (fr ? "Demande non couverte enregistrée" : "Unmet demand recorded") : (fr ? "Aucune fiche publiable dans ce périmètre" : "No publishable profile in this scope")}</h4>
                      <p className="mt-2 text-sm leading-6 text-amber-900/75">
                        {fr ? "Cela ne signifie pas que le marché n’existe pas. Cela signifie que nous n’avons pas encore assez de preuves validées pour publier." : "This does not mean the market does not exist. It means we do not yet have enough validated evidence to publish."}
                      </p>
                      <Link href="/request-quote" className="mt-4 inline-flex items-center text-sm font-black text-amber-950 hover:underline">
                        {fr ? "Transformer ce besoin en dossier commercial" : "Turn this need into a commercial case"} <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="rounded-3xl bg-[#10231D] p-6 text-white sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D6A84B] text-[#10231D]">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-3xl font-black">{fr ? "Radar de demande" : "Demand radar"}</h2>
              <p className="mt-3 text-sm leading-6 text-emerald-50/70">
                {fr ? "Les signaux ne sont affichés au public qu’après le seuil de confidentialité. Les recherches individuelles ne sont jamais exposées." : "Signals become public only after the privacy threshold. Individual searches are never exposed."}
              </p>
            </div>
            <div className="space-y-3">
              {data?.demandRadar.length ? data.demandRadar.slice(0, 6).map((signal, index) => (
                <div key={`${signal.product}-${signal.destinationCountryCode}-${index}`} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div>
                    <div className="font-bold">{readable(signal.product)}</div>
                    <div className="mt-1 text-xs text-emerald-50/60">{signal.destinationCountryCode || (fr ? "Marché à qualifier" : "Market to qualify")} · {signal.eventCount} {fr ? "signaux agrégés" : "aggregated signals"}</div>
                  </div>
                  <Badge className="bg-[#D6A84B] text-[#10231D] hover:bg-[#D6A84B]">{signal.demandScore.toFixed(0)}</Badge>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/20 p-6 text-sm leading-6 text-emerald-50/65">
                  {fr ? "Aucun groupe n’a encore atteint le seuil public de trois signaux. Les dossiers commerciaux continuent d’alimenter le radar interne." : "No cluster has reached the public threshold of three signals yet. Commercial cases continue to feed the internal radar."}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Building2, title: fr ? "Acheteurs et fournisseurs" : "Buyers and suppliers", text: fr ? "Relier une demande qualifiée à des entreprises et produits vérifiés." : "Connect qualified demand to verified companies and products." },
            { icon: Truck, title: fr ? "Logistique et corridors" : "Logistics and corridors", text: fr ? "Structurer ports, itinéraires, services et contraintes de livraison." : "Structure ports, routes, services, and delivery constraints." },
            { icon: ShieldCheck, title: fr ? "Règles et confiance" : "Rules and trust", text: fr ? "Suivre règlements, tarifs, certifications et changements avec provenance." : "Track regulations, tariffs, certifications, and changes with provenance." },
          ].map(({ icon: Icon, title, text }) => (
            <Card key={title} className="border-[#0B2F27]/10 bg-white">
              <CardContent className="p-6">
                <Icon className="h-6 w-6 text-[#9A6D17]" />
                <h3 className="mt-4 font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-[#0B2F27]/15 bg-white p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-black">{fr ? "Vous avez un besoin concret ?" : "Do you have a concrete need?"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{fr ? "Décrivez le produit, la quantité, la destination et le délai. Exportunity ouvrira un dossier suivi par l’équipe commerciale." : "Describe the product, quantity, destination, and deadline. Exportunity will open a case tracked by the commercial team."}</p>
          </div>
          <Button asChild className="bg-[#0B2F27] text-white hover:bg-[#17483C]">
            <Link href="/request-quote">{fr ? "Déposer le besoin" : "Submit the need"}<ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </section>
      </div>
    </main>
  );
}
