import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  ExternalLink,
  FilePenLine,
  LoaderCircle,
  Newspaper,
  Plus,
  Quote,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export type TradeNewsroomCitation = {
  id: string;
  sourceId: string;
  sequence: number;
  sourceUrl: string;
  sourceTitle: string;
  citedClaim: string;
  evidenceExcerpt: string | null;
  verificationStatus: string;
  reviewNotes: string | null;
  sourceName: string;
  sourceStatus: string;
};

export type TradeNewsroomArticle = {
  id: string;
  storyType: string;
  status: string;
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
  citationCount: number;
  verifiedCitationCount: number;
  distinctSourceCount: number;
  currentVersion: number;
  publishedAt: string | null;
  updatedAt: string;
  citations: TradeNewsroomCitation[];
  revisions: Array<{
    id: string;
    version: number;
    changeNote: string;
    createdAt: string;
  }>;
  reviewEvents: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    reason: string;
    createdAt: string;
  }>;
};

export type TradeNewsroomQueue = {
  articles: TradeNewsroomArticle[];
  metrics: {
    total: number;
    draft: number;
    inReview: number;
    approved: number;
    published: number;
    blockedByEvidence: number;
  };
  governance: {
    minimumVerifiedCitations: number;
    minimumDistinctActiveSources: number;
    automaticPublication: boolean;
    humanApprovalRequired: boolean;
  };
};

type SourceOption = {
  id: string;
  name: string;
  status: string;
  baseUrl: string;
};

type ArticleForm = {
  storyType: string;
  title: string;
  dek: string;
  bodyMarkdown: string;
  originalAnalysis: string;
  countryCode: string;
  sectorCode: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  changeNote: string;
};

type CitationForm = {
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  citedClaim: string;
  evidenceExcerpt: string;
  sourcePublishedAt: string;
};

const EMPTY_ARTICLE: ArticleForm = {
  storyType: "news_brief",
  title: "",
  dek: "",
  bodyMarkdown: "",
  originalAnalysis: "",
  countryCode: "",
  sectorCode: "",
  tags: "",
  seoTitle: "",
  seoDescription: "",
  changeNote: "",
};

const EMPTY_CITATION: CitationForm = {
  sourceId: "",
  sourceUrl: "",
  sourceTitle: "",
  citedClaim: "",
  evidenceExcerpt: "",
  sourcePublishedAt: "",
};

const STORY_TYPES = [
  "news_brief",
  "regulatory_update",
  "market_analysis",
  "trade_opportunity",
  "logistics_update",
  "original_report",
];

const NEXT_STATUSES: Record<string, string[]> = {
  draft: ["research_review", "rejected"],
  research_review: ["draft", "editor_review", "rejected"],
  editor_review: ["research_review", "approved", "rejected"],
  approved: ["editor_review", "published"],
  published: ["withdrawn"],
  withdrawn: ["editor_review"],
  rejected: ["draft"],
};

function readable(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  if (["verified", "active", "approved", "published"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["research_review", "editor_review", "under_review", "draft"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (["disputed", "stale", "rejected", "withdrawn"].includes(status)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function splitTags(value: string) {
  return [...new Set(value.split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean))];
}

function asIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function TradeNewsroomAdminPanel({
  newsroom,
  sources,
  dashboardQueryKey,
}: {
  newsroom: TradeNewsroomQueue;
  sources: SourceOption[];
  dashboardQueryKey: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingArticle, setEditingArticle] = useState<TradeNewsroomArticle | null>(null);
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [articleForm, setArticleForm] = useState<ArticleForm>(EMPTY_ARTICLE);
  const [citationArticle, setCitationArticle] = useState<TradeNewsroomArticle | null>(null);
  const [citationForm, setCitationForm] = useState<CitationForm>(EMPTY_CITATION);
  const [reviewCitation, setReviewCitation] = useState<TradeNewsroomCitation | null>(null);
  const [citationDecision, setCitationDecision] = useState<"verified" | "disputed" | "stale">("verified");
  const [citationReviewNotes, setCitationReviewNotes] = useState("");
  const [transition, setTransition] = useState<{
    article: TradeNewsroomArticle;
    toStatus: string;
  } | null>(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [humanConfirmed, setHumanConfirmed] = useState(false);

  const activeSources = useMemo(
    () => sources.filter((source) => source.status === "active"),
    [sources],
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [dashboardQueryKey] });

  const saveArticle = useMutation({
    mutationFn: async () => {
      const payload = {
        storyType: articleForm.storyType,
        title: articleForm.title,
        dek: articleForm.dek || null,
        bodyMarkdown: articleForm.bodyMarkdown,
        originalAnalysis: articleForm.originalAnalysis || null,
        countryCode: articleForm.countryCode || null,
        sectorCode: articleForm.sectorCode || null,
        tags: splitTags(articleForm.tags),
        seoTitle: articleForm.seoTitle || null,
        seoDescription: articleForm.seoDescription || null,
        ...(editingArticle
          ? { changeNote: articleForm.changeNote }
          : { draftOrigin: "human" }),
      };
      return apiRequest(
        editingArticle
          ? `/api/trade/admin/newsroom/articles/${editingArticle.id}`
          : "/api/trade/admin/newsroom/articles",
        editingArticle ? "PATCH" : "POST",
        payload,
      );
    },
    onSuccess: () => {
      refresh();
      setArticleDialogOpen(false);
      setEditingArticle(null);
      setArticleForm(EMPTY_ARTICLE);
      toast({
        title: editingArticle ? "Article revision saved" : "Newsroom draft created",
        description:
          "The content remains inside the governed editorial workflow until human publication.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Article not saved", description: error.message, variant: "destructive" }),
  });

  const addCitation = useMutation({
    mutationFn: async () => {
      if (!citationArticle) throw new Error("Select an article first.");
      return apiRequest(
        `/api/trade/admin/newsroom/articles/${citationArticle.id}/citations`,
        "POST",
        {
          ...citationForm,
          evidenceExcerpt: citationForm.evidenceExcerpt || null,
          sourcePublishedAt: asIsoOrNull(citationForm.sourcePublishedAt),
        },
      );
    },
    onSuccess: () => {
      refresh();
      setCitationArticle(null);
      setCitationForm(EMPTY_CITATION);
      toast({
        title: "Citation attached",
        description: "It remains under review and cannot count toward publication yet.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Citation not attached", description: error.message, variant: "destructive" }),
  });

  const decideCitation = useMutation({
    mutationFn: async () => {
      if (!reviewCitation) throw new Error("Select a citation first.");
      return apiRequest(
        `/api/trade/admin/newsroom/citations/${reviewCitation.id}/review`,
        "PATCH",
        {
          verificationStatus: citationDecision,
          reviewNotes: citationReviewNotes,
        },
      );
    },
    onSuccess: () => {
      refresh();
      setReviewCitation(null);
      setCitationReviewNotes("");
      toast({
        title: "Citation review saved",
        description: "The article evidence counters were recomputed from the review ledger.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Citation review not saved", description: error.message, variant: "destructive" }),
  });

  const transitionArticle = useMutation({
    mutationFn: async () => {
      if (!transition) throw new Error("Select an editorial transition first.");
      return apiRequest(
        `/api/trade/admin/newsroom/articles/${transition.article.id}/transition`,
        "POST",
        {
          toStatus: transition.toStatus,
          reason: transitionReason,
          humanConfirmed,
        },
      );
    },
    onSuccess: () => {
      refresh();
      const published = transition?.toStatus === "published";
      setTransition(null);
      setTransitionReason("");
      setHumanConfirmed(false);
      toast({
        title: published ? "Article published" : "Editorial status updated",
        description: published
          ? "The explicitly confirmed article is now available on the public trade hub."
          : "The append-only review history records this decision.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Status not changed", description: error.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingArticle(null);
    setArticleForm(EMPTY_ARTICLE);
    setArticleDialogOpen(true);
  };

  const openEdit = (article: TradeNewsroomArticle) => {
    setEditingArticle(article);
    setArticleForm({
      storyType: article.storyType,
      title: article.title,
      dek: article.dek || "",
      bodyMarkdown: article.bodyMarkdown,
      originalAnalysis: article.originalAnalysis || "",
      countryCode: article.countryCode || "",
      sectorCode: article.sectorCode || "",
      tags: article.tags.join(", "),
      seoTitle: article.seoTitle || "",
      seoDescription: article.seoDescription || "",
      changeNote: "",
    });
    setArticleDialogOpen(true);
  };

  const openCitation = (article: TradeNewsroomArticle) => {
    const source = activeSources[0];
    setCitationArticle(article);
    setCitationForm({
      ...EMPTY_CITATION,
      sourceId: source?.id || "",
      sourceUrl: source?.baseUrl || "",
      sourceTitle: source?.name || "",
    });
  };

  const openTransition = (article: TradeNewsroomArticle, toStatus: string) => {
    setTransition({ article, toStatus });
    setTransitionReason("");
    setHumanConfirmed(false);
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["All stories", newsroom.metrics.total],
          ["Drafts", newsroom.metrics.draft],
          ["In review", newsroom.metrics.inReview],
          ["Approved", newsroom.metrics.approved],
          ["Published", newsroom.metrics.published],
          ["Evidence blocked", newsroom.metrics.blockedByEvidence],
        ].map(([label, value]) => (
          <Card key={String(label)} className="border-slate-200 bg-white">
            <CardContent className="p-4">
              <div className="text-2xl font-black text-[#07121F]">{value}</div>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {label}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-800" />
            <div>
              <h3 className="font-black text-amber-950">Editorial release controls are enforced server-side</h3>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">
                Approval needs original analysis, two verified citations from two active sources,
                complete URLs and claims, plus an accountable human confirmation. AI-assisted copy
                never publishes itself.
              </p>
            </div>
          </div>
          <Button onClick={openCreate} className="shrink-0 bg-[#0B3D32] text-white hover:bg-[#155849]">
            <Plus className="mr-2 h-4 w-4" />New draft
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Newspaper className="h-5 w-5 text-[#0B3D32]" />Governed editorial queue
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {newsroom.articles.length ? (
            newsroom.articles.map((article) => {
              const editable = ["draft", "research_review", "editor_review"].includes(article.status);
              const evidenceReady =
                article.verifiedCitationCount >= newsroom.governance.minimumVerifiedCitations &&
                article.distinctSourceCount >= newsroom.governance.minimumDistinctActiveSources;
              return (
                <article key={article.id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{readable(article.storyType)}</Badge>
                        <Badge variant="outline" className={statusClass(article.status)}>
                          {readable(article.status)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            evidenceReady
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-amber-200 bg-amber-50 text-amber-800"
                          }
                        >
                          {evidenceReady ? "Evidence ready" : "Evidence incomplete"}
                        </Badge>
                      </div>
                      <h3 className="mt-3 text-lg font-black text-[#07121F]">{article.title}</h3>
                      {article.dek ? <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{article.dek}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>v{article.currentVersion}</span>
                        <span>{article.countryCode || "Global"}</span>
                        <span>{article.sectorCode ? readable(article.sectorCode) : "All sectors"}</span>
                        <span>{article.verifiedCitationCount}/{article.citationCount} verified citations</span>
                        <span>{article.distinctSourceCount} active source(s)</span>
                        <span>Updated {new Date(article.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {editable ? (
                        <Button size="sm" variant="outline" onClick={() => openEdit(article)}>
                          <FilePenLine className="mr-1.5 h-3.5 w-3.5" />Revise
                        </Button>
                      ) : null}
                      {!['approved', 'published'].includes(article.status) ? (
                        <Button size="sm" variant="outline" onClick={() => openCitation(article)} disabled={!activeSources.length}>
                          <Quote className="mr-1.5 h-3.5 w-3.5" />Add citation
                        </Button>
                      ) : null}
                      {(NEXT_STATUSES[article.status] || []).map((toStatus) => (
                        <Button
                          key={toStatus}
                          size="sm"
                          variant={["rejected", "withdrawn"].includes(toStatus) ? "outline" : "default"}
                          className={
                            ["rejected", "withdrawn"].includes(toStatus)
                              ? ""
                              : "bg-[#0B3D32] text-white hover:bg-[#155849]"
                          }
                          onClick={() => openTransition(article, toStatus)}
                        >
                          {toStatus === "published" ? "Publish with confirmation" : readable(toStatus)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    {article.citations.length ? (
                      article.citations.map((citation) => (
                        <div key={citation.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                                Citation {citation.sequence} · {citation.sourceName}
                              </div>
                              <p className="mt-2 text-sm font-bold leading-5 text-slate-800">{citation.citedClaim}</p>
                            </div>
                            <Badge variant="outline" className={statusClass(citation.verificationStatus)}>
                              {readable(citation.verificationStatus)}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <a href={citation.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-bold text-[#0B3D32] hover:underline">
                              {citation.sourceTitle}<ExternalLink className="ml-1 h-3 w-3" />
                            </a>
                            {!['approved', 'published'].includes(article.status) ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setReviewCitation(citation);
                                  setCitationDecision("verified");
                                  setCitationReviewNotes("");
                                }}
                              >
                                Review evidence
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="lg:col-span-2 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                        No citation is attached. This draft cannot enter approval until at least two independent sources are verified.
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
              No newsroom draft exists. Create one only when there is sourced trade information to report.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={articleDialogOpen} onOpenChange={setArticleDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <form onSubmit={(event) => { event.preventDefault(); saveArticle.mutate(); }}>
            <DialogHeader>
              <DialogTitle>{editingArticle ? "Revise newsroom article" : "Create newsroom draft"}</DialogTitle>
              <DialogDescription>
                Write original analysis and preserve precise source evidence separately. Saving never publishes the article.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Story type</Label>
                <Select value={articleForm.storyType} onValueChange={(storyType) => setArticleForm((current) => ({ ...current, storyType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STORY_TYPES.map((type) => <SelectItem key={type} value={type}>{readable(type)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="news-country">Country</Label><Input id="news-country" maxLength={2} value={articleForm.countryCode} onChange={(event) => setArticleForm((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))} placeholder="GH" /></div>
                <div className="space-y-2"><Label htmlFor="news-sector">Sector</Label><Input id="news-sector" value={articleForm.sectorCode} onChange={(event) => setArticleForm((current) => ({ ...current, sectorCode: event.target.value }))} /></div>
              </div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="news-title">Title</Label><Input id="news-title" required minLength={3} maxLength={500} value={articleForm.title} onChange={(event) => setArticleForm((current) => ({ ...current, title: event.target.value }))} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="news-dek">Dek</Label><Textarea id="news-dek" rows={3} maxLength={1000} value={articleForm.dek} onChange={(event) => setArticleForm((current) => ({ ...current, dek: event.target.value }))} placeholder="A concise, sourced explanation of why this matters." /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="news-body">Article body (Markdown)</Label><Textarea id="news-body" required rows={12} maxLength={100000} value={articleForm.bodyMarkdown} onChange={(event) => setArticleForm((current) => ({ ...current, bodyMarkdown: event.target.value }))} placeholder="Write original editorial copy. Publication requires at least 300 characters." /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="news-analysis">Original Exportunity analysis</Label><Textarea id="news-analysis" rows={6} maxLength={50000} value={articleForm.originalAnalysis} onChange={(event) => setArticleForm((current) => ({ ...current, originalAnalysis: event.target.value }))} placeholder="Explain consequences, uncertainties, and useful actions in original language." /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="news-tags">Tags</Label><Input id="news-tags" value={articleForm.tags} onChange={(event) => setArticleForm((current) => ({ ...current, tags: event.target.value }))} placeholder="ports, compliance, cocoa" /></div>
              <div className="space-y-2"><Label htmlFor="news-seo-title">SEO title</Label><Input id="news-seo-title" maxLength={500} value={articleForm.seoTitle} onChange={(event) => setArticleForm((current) => ({ ...current, seoTitle: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="news-seo-description">SEO description</Label><Input id="news-seo-description" maxLength={1000} value={articleForm.seoDescription} onChange={(event) => setArticleForm((current) => ({ ...current, seoDescription: event.target.value }))} /></div>
              {editingArticle ? <div className="space-y-2 sm:col-span-2"><Label htmlFor="news-change-note">Revision note</Label><Input id="news-change-note" required minLength={5} value={articleForm.changeNote} onChange={(event) => setArticleForm((current) => ({ ...current, changeNote: event.target.value }))} placeholder="Describe the evidence-backed change." /></div> : null}
            </div>
            <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setArticleDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saveArticle.isPending} className="bg-[#0B3D32] text-white hover:bg-[#155849]">{saveArticle.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{editingArticle ? "Save immutable revision" : "Create governed draft"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(citationArticle)} onOpenChange={(open) => !open && setCitationArticle(null)}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={(event: FormEvent) => { event.preventDefault(); addCitation.mutate(); }}>
            <DialogHeader><DialogTitle>Add precise citation</DialogTitle><DialogDescription>{citationArticle?.title}. Choose an active registry source and identify the exact claim supported by the URL.</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4">
              <div className="space-y-2"><Label>Registered source</Label><Select value={citationForm.sourceId} onValueChange={(sourceId) => { const source = activeSources.find((item) => item.id === sourceId); setCitationForm((current) => ({ ...current, sourceId, sourceUrl: source?.baseUrl || current.sourceUrl, sourceTitle: source?.name || current.sourceTitle })); }}><SelectTrigger><SelectValue placeholder="Select active source" /></SelectTrigger><SelectContent>{activeSources.map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="citation-url">Precise source URL</Label><Input id="citation-url" type="url" required value={citationForm.sourceUrl} onChange={(event) => setCitationForm((current) => ({ ...current, sourceUrl: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="citation-title">Source document title</Label><Input id="citation-title" required minLength={3} value={citationForm.sourceTitle} onChange={(event) => setCitationForm((current) => ({ ...current, sourceTitle: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="citation-claim">Claim supported by this source</Label><Textarea id="citation-claim" required minLength={12} rows={3} value={citationForm.citedClaim} onChange={(event) => setCitationForm((current) => ({ ...current, citedClaim: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="citation-excerpt">Short evidence excerpt or review note</Label><Textarea id="citation-excerpt" maxLength={2000} rows={4} value={citationForm.evidenceExcerpt} onChange={(event) => setCitationForm((current) => ({ ...current, evidenceExcerpt: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="citation-published">Source publication time</Label><Input id="citation-published" type="datetime-local" value={citationForm.sourcePublishedAt} onChange={(event) => setCitationForm((current) => ({ ...current, sourcePublishedAt: event.target.value }))} /></div>
            </div>
            <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setCitationArticle(null)}>Cancel</Button><Button type="submit" disabled={addCitation.isPending || !citationForm.sourceId} className="bg-[#0B3D32] text-white hover:bg-[#155849]">{addCitation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Attach for review</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reviewCitation)} onOpenChange={(open) => !open && setReviewCitation(null)}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={(event) => { event.preventDefault(); decideCitation.mutate(); }}>
            <DialogHeader><DialogTitle>Review citation evidence</DialogTitle><DialogDescription>{reviewCitation?.sourceName}: {reviewCitation?.citedClaim}</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4">
              <div className="space-y-2"><Label>Decision</Label><Select value={citationDecision} onValueChange={(value) => setCitationDecision(value as typeof citationDecision)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="verified">Verified</SelectItem><SelectItem value="disputed">Disputed</SelectItem><SelectItem value="stale">Stale</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="citation-review-notes">Accountable review notes</Label><Textarea id="citation-review-notes" required minLength={10} rows={5} value={citationReviewNotes} onChange={(event) => setCitationReviewNotes(event.target.value)} placeholder="Explain what you checked and why this decision is justified." /></div>
            </div>
            <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setReviewCitation(null)}>Cancel</Button><Button type="submit" disabled={decideCitation.isPending} className="bg-[#0B3D32] text-white hover:bg-[#155849]">{decideCitation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Save citation review</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(transition)} onOpenChange={(open) => !open && setTransition(null)}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={(event) => { event.preventDefault(); transitionArticle.mutate(); }}>
            <DialogHeader><DialogTitle>Move to {transition ? readable(transition.toStatus) : "next stage"}</DialogTitle><DialogDescription>{transition?.article.title}. This decision is written to the append-only editorial review history.</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4">
              <div className="space-y-2"><Label htmlFor="transition-reason">Reason and evidence reviewed</Label><Textarea id="transition-reason" required minLength={10} rows={5} value={transitionReason} onChange={(event) => setTransitionReason(event.target.value)} /></div>
              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <Checkbox checked={humanConfirmed} onCheckedChange={(checked) => setHumanConfirmed(checked === true)} className="mt-1" />
                <span><strong>I am the accountable human reviewer.</strong> I checked the article, claims, active source records, citation decisions, and release implications. This is not an automatic agent decision.</span>
              </label>
              {["approved", "published"].includes(transition?.toStatus || "") ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><BookOpenCheck className="mb-2 h-4 w-4 text-[#0B3D32]" />Server validation will refuse the action unless the article has sufficient original content and every attached citation is verified from at least two active independent sources.</div> : null}
            </div>
            <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setTransition(null)}>Cancel</Button><Button type="submit" disabled={transitionArticle.isPending || !humanConfirmed} className="bg-[#0B3D32] text-white hover:bg-[#155849]">{transitionArticle.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{transition?.toStatus === "published" ? "Confirm and publish" : "Record decision"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
