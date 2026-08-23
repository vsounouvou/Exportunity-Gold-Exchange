import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Newspaper,
  ShieldCheck,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";

type PublicCitation = {
  id: string;
  sequence: number;
  sourceUrl: string;
  sourceTitle: string;
  citedClaim: string;
  evidenceExcerpt: string | null;
  sourcePublishedAt: string | null;
  retrievedAt: string;
  sourceId: string;
  sourceName: string;
};

type PublicArticle = {
  id: string;
  storyType: string;
  slug: string;
  primaryLanguage: string;
  title: string;
  dek: string | null;
  bodyMarkdown: string;
  originalAnalysis: string | null;
  countryCode: string | null;
  sectorCode: string | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
  citations: PublicCitation[];
};

type RelatedEntity = {
  id: string;
  entityType: string;
  slug: string;
  displayName: string;
  countryCode: string | null;
  sectorCode: string | null;
  summary: string | null;
};

type ArticleResponse = {
  ok: boolean;
  article: PublicArticle;
  relatedEntities: RelatedEntity[];
  disclosure: {
    editorialRule: string;
    automaticPublication: boolean;
  };
};

function readable(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export default function TradeNewsroomArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params?.slug || "");
  const { language } = useLocale();
  const fr = language === "fr";
  const articleQuery = useQuery<ArticleResponse>({
    queryKey: [`/api/trade/newsroom/${encodeURIComponent(slug)}`],
    enabled: Boolean(slug),
  });
  const article = articleQuery.data?.article;

  useEffect(() => {
    if (!article) return;
    document.title = article.seoTitle || `${article.title} | Exportunity`;
    const description = article.seoDescription || article.dek || article.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [article]);

  if (articleQuery.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F5F1E8] text-slate-600">
        <div className="text-center text-sm"><LoaderCircle className="mx-auto mb-3 h-8 w-8 animate-spin text-[#0B2F27]" />{fr ? "Chargement de l’article vérifié…" : "Loading verified article…"}</div>
      </main>
    );
  }

  if (articleQuery.isError || !article) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F5F1E8] px-4 text-[#10231D]">
        <Card className="max-w-xl border-[#0B2F27]/10 bg-white"><CardContent className="p-8 text-center"><Newspaper className="mx-auto h-9 w-9 text-[#9A6D17]" /><h1 className="mt-4 text-2xl font-black">{fr ? "Article indisponible" : "Article unavailable"}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{fr ? "L’article n’est pas publié ou ses preuves actives ne satisfont plus le seuil public." : "The article is not published, or its active evidence no longer satisfies the public threshold."}</p><Button asChild className="mt-6 bg-[#0B2F27] text-white hover:bg-[#17483C]"><Link href="/trade"><ArrowLeft className="mr-2 h-4 w-4" />{fr ? "Retour à l’intelligence commerciale" : "Back to trade intelligence"}</Link></Button></CardContent></Card>
      </main>
    );
  }

  const distinctSources = new Set(article.citations.map((citation) => citation.sourceId)).size;

  return (
    <main className="min-h-screen bg-[#F5F1E8] text-[#10231D]">
      <header className="border-b border-white/10 bg-[#0B2F27] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 font-black tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#D6A84B] text-[#0B2F27]"><Globe2 className="h-5 w-5" /></span>Exportunity</Link>
          <Link href="/trade" className="inline-flex items-center text-sm font-bold text-emerald-50/80 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />{fr ? "Intelligence commerciale" : "Trade intelligence"}</Link>
        </div>
      </header>

      <article>
        <section className="bg-[#0B2F27] text-white">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-[#D6A84B]/40 bg-[#D6A84B]/15 text-[#F4D99E] hover:bg-[#D6A84B]/15"><Newspaper className="mr-1.5 h-3.5 w-3.5" />{readable(article.storyType)}</Badge>
              {article.countryCode ? <Badge variant="outline" className="border-white/20 text-white">{article.countryCode}</Badge> : null}
              {article.sectorCode ? <Badge variant="outline" className="border-white/20 text-white">{readable(article.sectorCode)}</Badge> : null}
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">{article.title}</h1>
            {article.dek ? <p className="mt-6 max-w-3xl text-lg leading-8 text-emerald-50/80">{article.dek}</p> : null}
            <div className="mt-8 flex flex-wrap gap-4 text-xs font-bold uppercase tracking-wide text-emerald-50/60">
              <span>{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : ""}</span>
              <span>{article.citations.length} {fr ? "citations vérifiées" : "verified citations"}</span>
              <span>{distinctSources} {fr ? "sources actives" : "active sources"}</span>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8 lg:py-16">
          <div className="space-y-8">
            <Card className="border-[#0B2F27]/10 bg-white shadow-sm">
              <CardContent className="p-6 sm:p-10">
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => <h2 className="mb-4 mt-10 text-2xl font-black first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="mb-3 mt-8 text-xl font-black">{children}</h3>,
                    p: ({ children }) => <p className="my-5 text-base leading-8 text-slate-700">{children}</p>,
                    ul: ({ children }) => <ul className="my-5 list-disc space-y-2 pl-6 text-slate-700">{children}</ul>,
                    ol: ({ children }) => <ol className="my-5 list-decimal space-y-2 pl-6 text-slate-700">{children}</ol>,
                    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="font-bold text-[#1F6B59] underline">{children}</a>,
                    blockquote: ({ children }) => <blockquote className="my-6 border-l-4 border-[#D6A84B] bg-[#FFF8E8] p-4 text-slate-700">{children}</blockquote>,
                  }}
                >
                  {article.bodyMarkdown}
                </ReactMarkdown>
              </CardContent>
            </Card>

            {article.originalAnalysis ? (
              <Card className="border-[#D6A84B]/40 bg-[#FFF8E8]">
                <CardContent className="p-6 sm:p-8"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-[#7A5514]"><BookOpenCheck className="h-4 w-4" />{fr ? "Analyse originale Exportunity" : "Original Exportunity analysis"}</div><p className="mt-4 whitespace-pre-wrap text-base leading-8 text-slate-700">{article.originalAnalysis}</p></CardContent>
              </Card>
            ) : null}

            <section>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-[#9A6D17]"><ShieldCheck className="h-4 w-4" />{fr ? "Registre des preuves" : "Evidence ledger"}</div>
              <h2 className="mt-2 text-3xl font-black">{fr ? "Sources vérifiées" : "Verified sources"}</h2>
              <div className="mt-5 space-y-3">
                {article.citations.map((citation) => (
                  <Card key={citation.id} className="border-[#0B2F27]/10 bg-white"><CardContent className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-xs font-black uppercase tracking-wide text-slate-500">{citation.sequence}. {citation.sourceName}</div><p className="mt-2 font-bold leading-6 text-slate-800">{citation.citedClaim}</p>{citation.evidenceExcerpt ? <p className="mt-3 border-l-2 border-[#D6A84B] pl-3 text-sm leading-6 text-slate-600">{citation.evidenceExcerpt}</p> : null}<div className="mt-3 text-xs text-slate-500">{citation.sourcePublishedAt ? `${fr ? "Publié" : "Published"} ${new Date(citation.sourcePublishedAt).toLocaleDateString()} · ` : ""}{fr ? "Consulté" : "Retrieved"} {new Date(citation.retrievedAt).toLocaleDateString()}</div></div><a href={citation.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center text-sm font-black text-[#0B2F27] hover:underline">{citation.sourceTitle}<ExternalLink className="ml-1.5 h-4 w-4" /></a></div></CardContent></Card>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-6"><ShieldCheck className="h-6 w-6 text-emerald-800" /><h2 className="mt-4 font-black text-emerald-950">{fr ? "Publication contrôlée" : "Governed publication"}</h2><p className="mt-2 text-sm leading-6 text-emerald-900/75">{articleQuery.data?.disclosure.editorialRule}</p><div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 text-xs font-bold text-emerald-900">{fr ? "Publication automatique : désactivée" : "Automatic publication: off"}</div></CardContent></Card>

            {articleQuery.data?.relatedEntities.length ? <Card className="border-[#0B2F27]/10 bg-white"><CardContent className="p-6"><h2 className="font-black">{fr ? "Données reliées" : "Related verified data"}</h2><div className="mt-4 space-y-3">{articleQuery.data.relatedEntities.map((entity) => <div key={entity.id} className="rounded-xl bg-slate-50 p-3"><Badge variant="outline" className="text-[10px]">{readable(entity.entityType)}</Badge><div className="mt-2 text-sm font-black">{entity.displayName}</div>{entity.summary ? <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">{entity.summary}</p> : null}</div>)}</div></CardContent></Card> : null}

            <Card className="border-[#0B2F27]/10 bg-white"><CardContent className="p-6"><h2 className="font-black">{fr ? "Passer de l’analyse à l’action" : "Turn analysis into action"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{fr ? "Décrivez le produit, la quantité, la destination et le délai pour ouvrir un dossier commercial." : "Describe the product, quantity, destination, and deadline to open a commercial case."}</p><Button asChild className="mt-5 w-full bg-[#0B2F27] text-white hover:bg-[#17483C]"><Link href="/request-quote">{fr ? "Déposer un besoin" : "Submit a requirement"}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>
          </aside>
        </div>
      </article>
    </main>
  );
}
