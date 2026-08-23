import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type MediaStatus = "discovered" | "reviewed" | "published" | "rejected";
type MediaType = "article" | "video" | "profile" | "press_release" | "podcast" | "post";
type SocialPlatform = "facebook" | "instagram" | "youtube" | "tiktok" | "linkedin" | "x";

type MediaRow = {
  id: string;
  type: MediaType;
  title: string;
  outlet: string | null;
  url: string;
  canonicalUrl: string | null;
  publishedAt: string | null;
  language: string | null;
  excerpt: string | null;
  summaryParagraph: string | null;
  tags: string[];
  status: MediaStatus;
  thumbnailLocalPath: string | null;
  thumbnailRemoteUrl: string | null;
  mediaEmbedUrl: string | null;
  author: string | null;
  duplicateOf: string | null;
  raw?: any;
  featured?: boolean;
};

type RightsState = {
  sourceReference:
    | ({
        id: number;
        takedownState: string | null;
        reuseStatus: string | null;
      } & any)
    | null;
  grants: any[];
  events: {
    id: number;
    createdAt: string | null;
    eventType: string;
    actorUserId: number | null;
    payload?: any;
  }[];
  eligibility: {
    eligible: boolean;
    blockers: string[];
    grantId: number | null;
  };
  legacyPublishedWithoutLedger?: boolean;
};

type SocialReadiness = {
  platform: SocialPlatform;
  provider: string;
  configured: boolean;
  missingEnv: string[];
  connectUrl: string | null;
  connection: null | {
    id: string;
    accountLabel: string | null;
    status: string;
    scopes: string[];
    scopeEvidenceVerified?: boolean;
  };
  target: null | {
    id: number;
    externalAccountLabel: string | null;
    authorizationStatus: string;
    healthStatus: string;
  };
  requiredScopes: string[];
  adapterAvailable?: boolean;
  adapter?: {
    enabled: boolean;
    configured: boolean;
    featureFlag: string;
    automaticRetry: false;
  } | null;
  officialPublicationReady: boolean;
  manualFallbackAvailable: boolean;
  blockers: string[];
  status: "READY" | "MANUAL_REQUIRED";
};

type DiscoveredSocialTarget = {
  candidateKey: string;
  connectionId: string;
  provider: "meta" | "google";
  platform: "facebook" | "instagram" | "youtube";
  channel: "page" | "professional_account" | "channel";
  externalAccountId: string;
  externalAccountLabel: string;
  parentAccountId: string | null;
  parentAccountLabel: string | null;
  capabilities: string[];
  permissions: string[];
  credentialsExcluded: true;
};

type SocialTargetDiscoveryResult = {
  discoveryActionRunId: number;
  platform: "facebook" | "instagram" | "youtube";
  connectionId: string;
  discoveredAt: string;
  candidates: DiscoveredSocialTarget[];
  providerReadPerformed: true;
  providerMutationPerformed: false;
  externalPublicationPerformed: false;
  credentialsExposed: false;
};

type SocialPublicationAttempt = {
  id: string;
  platform: SocialPlatform;
  channel: string;
  provider: string;
  mode: "official_api" | "manual_package";
  status: string;
  manualPackage: any;
  providerState: any;
  createdAt: string;
  events?: any[];
};

type MetaSocialWebhookReadiness = {
  enabled: boolean;
  endpoint: string;
  verificationReady: boolean;
  releaseReady: boolean;
  migrationRequired: string;
  migrationApplied: string;
  retentionDays: number;
  automaticBackgroundRetry: false;
  externalReplyAvailable: false;
};

type MetaSocialWebhookReceipt = {
  id: number | string;
  targetId: number | null;
  platform: "facebook" | "instagram" | null;
  eventKind: string;
  parseStatus: string;
  resolutionStatus: string;
  reasonCode: string | null;
  deliveryCount: number;
  attemptCount: number;
  receivedAt: string;
  lastReceivedAt: string;
  resolvedAt: string | null;
  retentionUntil: string;
  payloadChecksum: string;
};

function slugify(value: string, fallback: string) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || fallback;
}

function normalizePath(path: string) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function takedownActionLabel(action: string) {
  switch (action) {
    case "requested":
      return "Request takedown";
    case "disputed":
      return "Mark disputed";
    case "removed":
      return "Mark removed";
    case "clear":
      return "Clear state";
    default:
      return action || "Action";
  }
}

function formatRightsEventDate(rawDate: string | null | undefined) {
  if (!rawDate) return "Unknown time";
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return String(rawDate);
  return date.toLocaleString();
}

function humanizeRightsEventType(type: string | null | undefined) {
  if (!type) return "rights event";
  const map: Record<string, string> = {
    "rights.granted": "Rights grant recorded",
    "rights.revoked": "Rights grant revoked",
    "content.published": "Content published",
    "source.takedown_requested": "Takedown requested",
    "source.takedown_disputed": "Takedown disputed",
    "source.takedown_removed": "Content removed",
    "source.takedown_cleared": "Takedown state cleared",
  };
  return map[type] || type;
}

export default function AdminMarketingMediaPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageMode, setImageMode] = useState<"quality" | "fast">("quality");
  const [assetBusy, setAssetBusy] = useState(false);
  const [publicationPlatform, setPublicationPlatform] = useState<SocialPlatform>("facebook");
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [officialPublicationConfirmed, setOfficialPublicationConfirmed] = useState(false);
  const [officialPublicationKey, setOfficialPublicationKey] = useState("");
  const [targetDiscoveryConfirmed, setTargetDiscoveryConfirmed] = useState(false);
  const [targetSelectionConfirmed, setTargetSelectionConfirmed] = useState(false);
  const [metaReconcileConfirmed, setMetaReconcileConfirmed] = useState(false);
  const [targetAuthorityReference, setTargetAuthorityReference] = useState("");
  const [targetDiscoveryResult, setTargetDiscoveryResult] = useState<SocialTargetDiscoveryResult | null>(null);
  const [publicationForm, setPublicationForm] = useState({
    title: "",
    caption: "",
    hashtags: "",
    altText: "",
    assetUrl: "",
    thumbnailUrl: "",
    destinationLink: "",
  });
  const [rightsForm, setRightsForm] = useState({
    rightsHolderName: "",
    rightsBasis: "creator_grant",
    usageTypes: "organic_publication",
    channels: "web",
    allTerritories: true,
    expiresAt: "",
    producerConsentStatus: "unknown",
    subjectReleaseStatus: "unknown",
    musicLicenseStatus: "unknown",
    attributionText: "",
    evidenceReference: "",
    evidenceNotes: "",
    sourcePlatform: "",
    sourceCreatorUrl: "",
    confirmed: false,
  });
  const [takedownForm, setTakedownForm] = useState({
    action: "requested" as "requested" | "disputed" | "removed" | "clear",
    reason: "",
    evidenceReference: "",
    evidenceNotes: "",
    confirmed: false,
  });
  const [form, setForm] = useState({
    type: "article" as MediaType,
    title: "",
    outlet: "",
    url: "",
    canonicalUrl: "",
    publishedAt: "",
    language: "",
    excerpt: "",
    summaryParagraph: "",
    tags: "",
    status: "discovered" as MediaStatus,
    thumbnailLocalPath: "",
    thumbnailRemoteUrl: "",
    mediaEmbedUrl: "",
    author: "",
    duplicateOf: "",
    featured: false,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryResult = useQuery({
    queryKey: ["admin-marketing-media", query],
    queryFn: async () => {
      const suffix = query ? `?status=all&limit=250&q=${encodeURIComponent(query)}` : "?status=all&limit=250";
      const response = await apiRequest(`/api/admin/marketing/media${suffix}`, { method: "GET" });
      return Array.isArray(response?.items) ? (response.items as MediaRow[]) : [];
    },
  });

  const items = queryResult.data || [];

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  const rightsQuery = useQuery({
    queryKey: ["admin-marketing-media-rights", selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      const response = await apiRequest(
        `/api/admin/marketing/media/${selectedId}/rights?usageType=organic_publication&channel=web`,
        { method: "GET" },
      );
      return response as RightsState;
    },
    enabled: Boolean(selectedId),
  });

  const rightsState = rightsQuery.data || null;
  const publicationEligible = Boolean(rightsState?.eligibility?.eligible);
  const sourceTakedownState = String(rightsState?.sourceReference?.takedownState || "unknown").toLowerCase();
  const sourceReuseStatus = String(rightsState?.sourceReference?.reuseStatus || "reference_only").toLowerCase();
  const rightsEvents = Array.isArray(rightsState?.events) ? rightsState.events : [];
  const takedownNeedsClear = sourceTakedownState !== "clear";

  const socialReadinessQuery = useQuery({
    queryKey: ["admin-marketing-social-readiness"],
    queryFn: async () => {
      const response = await apiRequest("/api/admin/marketing/social/readiness", { method: "GET" });
      return {
        platforms: Array.isArray(response?.platforms) ? (response.platforms as SocialReadiness[]) : [],
        communications: response?.communications || {},
        webhooks: response?.webhooks || {},
        publicationAdapters: response?.publicationAdapters || {},
      };
    },
  });

  const publicationAttemptsQuery = useQuery({
    queryKey: ["admin-marketing-social-publications", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const response = await apiRequest(`/api/admin/marketing/media/${selectedId}/publications?limit=30`, {
        method: "GET",
      });
      return Array.isArray(response?.items) ? (response.items as SocialPublicationAttempt[]) : [];
    },
    enabled: Boolean(selectedId),
  });

  const selectedSocialReadiness = useMemo(
    () =>
      (socialReadinessQuery.data?.platforms || []).find(
        (entry: SocialReadiness) => entry.platform === publicationPlatform,
      ) || null,
    [publicationPlatform, socialReadinessQuery.data],
  );
  const targetDiscoverySupported = (["facebook", "instagram", "youtube"] as SocialPlatform[]).includes(
    publicationPlatform,
  );
  const metaWebhookReadiness = (socialReadinessQuery.data?.webhooks as any)?.metaSocial as
    | MetaSocialWebhookReadiness
    | undefined;
  const selectedMetaTargetId =
    publicationPlatform === "facebook" || publicationPlatform === "instagram"
      ? selectedSocialReadiness?.target?.id || null
      : null;

  const metaWebhookReceiptsQuery = useQuery({
    queryKey: ["admin-marketing-meta-webhook-receipts", selectedMetaTargetId],
    queryFn: async () => {
      if (!selectedMetaTargetId) return [];
      const response = await apiRequest(
        `/api/admin/marketing/social/inbox/meta/receipts?targetId=${selectedMetaTargetId}&limit=50`,
        { method: "GET" },
      );
      return Array.isArray(response?.items) ? (response.items as MetaSocialWebhookReceipt[]) : [];
    },
    enabled: Boolean(selectedMetaTargetId),
  });

  const syncForm = (item: MediaRow | null) => {
    if (!item) {
      setForm({
        type: "article",
        title: "",
        outlet: "",
        url: "",
        canonicalUrl: "",
        publishedAt: "",
        language: "",
        excerpt: "",
        summaryParagraph: "",
        tags: "",
        status: "discovered",
        thumbnailLocalPath: "",
        thumbnailRemoteUrl: "",
        mediaEmbedUrl: "",
        author: "",
        duplicateOf: "",
        featured: false,
      });
      setImagePrompt("");
      setRightsForm((prev) => ({ ...prev, rightsHolderName: "", sourceCreatorUrl: "", confirmed: false }));
      setTakedownForm({
        action: "requested",
        reason: "",
        evidenceReference: "",
        evidenceNotes: "",
        confirmed: false,
      });
      setPublicationForm({
        title: "",
        caption: "",
        hashtags: "",
        altText: "",
        assetUrl: "",
        thumbnailUrl: "",
        destinationLink: "",
      });
      setPublicationConfirmed(false);
      setOfficialPublicationConfirmed(false);
      setOfficialPublicationKey("");
      return;
    }
    setForm({
      type: item.type,
      title: item.title || "",
      outlet: item.outlet || "",
      url: item.url || "",
      canonicalUrl: item.canonicalUrl || "",
      publishedAt: item.publishedAt ? String(item.publishedAt).slice(0, 10) : "",
      language: item.language || "",
      excerpt: item.excerpt || "",
      summaryParagraph: item.summaryParagraph || "",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
      status: item.status,
      thumbnailLocalPath: item.thumbnailLocalPath || "",
      thumbnailRemoteUrl: item.thumbnailRemoteUrl || "",
      mediaEmbedUrl: item.mediaEmbedUrl || "",
      author: item.author || "",
      duplicateOf: item.duplicateOf || "",
      featured: Boolean(item.featured),
    });
    setImagePrompt(`Media card thumbnail for ${item.title}. outlet ${item.outlet || "media"}.`);
    setPublicationForm({
      title: item.title || "",
      caption: item.summaryParagraph || item.excerpt || item.title || "",
      hashtags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
      altText: item.excerpt || item.title || "",
      assetUrl:
        item.mediaEmbedUrl ||
        item.thumbnailLocalPath ||
        item.thumbnailRemoteUrl ||
        item.canonicalUrl ||
        item.url ||
        "",
      thumbnailUrl: item.thumbnailLocalPath || item.thumbnailRemoteUrl || "",
      destinationLink: item.canonicalUrl || item.url || "",
    });
    setPublicationConfirmed(false);
    setOfficialPublicationConfirmed(false);
    setOfficialPublicationKey("");
    setTakedownForm({
      action: "requested",
      reason: "",
      evidenceReference: "",
      evidenceNotes: "",
      confirmed: false,
    });
    setRightsForm((prev) => ({
      ...prev,
      rightsHolderName: item.author || "",
      sourceCreatorUrl: "",
      confirmed: false,
    }));
  };

  const assetKey = useMemo(() => {
    const slug = slugify(form.title, selectedId || "media-item");
    return `marketing/media/${slug}/thumbnail`;
  }, [form.title, selectedId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a media item to edit");
      const payload = {
        type: form.type,
        title: form.title,
        outlet: form.outlet,
        url: form.url,
        canonicalUrl: form.canonicalUrl.trim() || null,
        publishedAt: form.publishedAt || null,
        language: form.language.trim() || null,
        excerpt: form.excerpt,
        summaryParagraph: form.summaryParagraph,
        tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
        status: form.status,
        thumbnailLocalPath: form.thumbnailLocalPath,
        thumbnailRemoteUrl: form.thumbnailRemoteUrl,
        mediaEmbedUrl: form.mediaEmbedUrl.trim() || null,
        author: form.author.trim() || null,
        duplicateOf: form.duplicateOf || null,
        featured: form.featured,
      };
      return apiRequest(`/api/admin/marketing/media/${selectedId}`, "PATCH", payload);
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Media item updated." });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media"] });
    },
    onError: (error: any) => toast({ title: "Save failed", description: error?.message || "Unable to update media item.", variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a media item");
      return apiRequest(`/api/admin/marketing/media/${selectedId}/verify`, "POST", {});
    },
    onSuccess: async (res: any) => {
      const ok = Boolean(res?.verified);
      const status = Number(res?.status || 0);
      toast({
        title: ok ? "Verified" : "Verification failed",
        description: ok ? `Link responded with ${status || "OK"}.` : `Link check returned ${status || "no response"}.`,
        variant: ok ? "default" : "destructive",
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media"] });
    },
    onError: (error: any) =>
      toast({ title: "Verify failed", description: error?.message || "Unable to verify url.", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async (action: "published" | "reviewed" | "rejected" | "feature" | "unfeature") => {
      if (!selectedId) throw new Error("Select a media item");
      if (action === "feature" || action === "unfeature") {
        return apiRequest("/api/admin/marketing/media/bulk", "POST", { ids: [selectedId], action });
      }
      return apiRequest("/api/admin/marketing/media/bulk", "POST", { ids: [selectedId], action: action === "published" ? "publish" : action === "reviewed" ? "review" : "reject" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media-rights", selectedId] });
    },
    onError: (error: any) =>
      toast({
        title: "Status change blocked",
        description: error?.message || "Unable to change media status.",
        variant: "destructive",
      }),
  });

  const grantRightsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !selectedItem) throw new Error("Select a media item");
      return apiRequest(`/api/admin/marketing/media/${selectedId}/rights/grants`, "POST", {
        confirmed: rightsForm.confirmed,
        source: {
          sourceUrl: selectedItem.canonicalUrl || selectedItem.url,
          canonicalSourceUrl: selectedItem.canonicalUrl || null,
          sourcePlatform: rightsForm.sourcePlatform || null,
          sourceCreatorName: selectedItem.author || rightsForm.rightsHolderName,
          sourceCreatorUrl: rightsForm.sourceCreatorUrl || null,
          discoveryEvidence: {
            recordedFromAdminReview: true,
            sourceLinkVerifiedAt: selectedItem.raw?.linkCheck?.checkedAt || null,
          },
        },
        grant: {
          rightsHolderName: rightsForm.rightsHolderName,
          rightsBasis: rightsForm.rightsBasis,
          usageTypes: rightsForm.usageTypes.split(",").map((value) => value.trim()).filter(Boolean),
          channels: rightsForm.channels.split(",").map((value) => value.trim()).filter(Boolean),
          allTerritories: rightsForm.allTerritories,
          territoryIds: [],
          expiresAt: rightsForm.expiresAt || null,
          producerConsentStatus: rightsForm.producerConsentStatus,
          subjectReleaseStatus: rightsForm.subjectReleaseStatus,
          musicLicenseStatus: rightsForm.musicLicenseStatus,
          attributionText: rightsForm.attributionText || null,
          attributionRules: { required: Boolean(rightsForm.attributionText.trim()) },
          evidence: {
            reference: rightsForm.evidenceReference,
            notes: rightsForm.evidenceNotes,
          },
        },
      });
    },
    onSuccess: async () => {
      toast({ title: "Rights evidence recorded", description: "Publication eligibility was recalculated from the grant and consent evidence." });
      setRightsForm((prev) => ({ ...prev, confirmed: false }));
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media-rights", selectedId] });
    },
    onError: (error: any) =>
      toast({
        title: "Rights grant blocked",
        description: error?.message || "Rights evidence is incomplete.",
        variant: "destructive",
      }),
  });

  const revokeRightsMutation = useMutation({
    mutationFn: async ({ grantId, reason }: { grantId: number; reason: string }) => {
      if (!selectedId) throw new Error("Select a media item");
      return apiRequest(`/api/admin/marketing/media/${selectedId}/rights/grants/${grantId}/revoke`, "POST", { reason });
    },
    onSuccess: async () => {
      toast({ title: "Rights revoked", description: "Future publication attempts are blocked and the revocation is auditable." });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media-rights", selectedId] });
    },
    onError: (error: any) =>
      toast({ title: "Revocation failed", description: error?.message || "Unable to revoke rights.", variant: "destructive" }),
  });

  const takedownRightsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a media item");
      return apiRequest(`/api/admin/marketing/media/${selectedId}/rights/takedown`, "POST", {
        action: takedownForm.action,
        confirmed: takedownForm.confirmed,
        reason: takedownForm.reason,
        evidence: {
          reference: takedownForm.evidenceReference || null,
          notes: takedownForm.evidenceNotes || null,
        },
      });
    },
    onSuccess: async () => {
      toast({
        title: "Source state updated",
        description: `Takedown action ${takedownForm.action} applied for this media item.`,
      });
      setTakedownForm((prev) => ({ ...prev, confirmed: false }));
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media-rights", selectedId] });
    },
    onError: (error: any) =>
      toast({
        title: "Takedown update failed",
        description: error?.message || "Unable to update source takedown state.",
        variant: "destructive",
      }),
  });

  const preparePublicationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a media item");
      const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      return apiRequest(`/api/admin/marketing/media/${selectedId}/publications/prepare`, "POST", {
        platform: publicationPlatform,
        channel: publicationPlatform,
        idempotencyKey: `admin-${selectedId}-${publicationPlatform}-${randomPart}`,
        integrationConnectionId: selectedSocialReadiness?.connection?.id || null,
        targetId: selectedSocialReadiness?.target?.id || null,
        confirmed: publicationConfirmed,
        package: {
          title: publicationForm.title,
          caption: publicationForm.caption,
          hashtags: publicationForm.hashtags.split(",").map((value) => value.trim()).filter(Boolean),
          altText: publicationForm.altText,
          assetUrl: publicationForm.assetUrl,
          assetType: selectedItem?.type || "unspecified",
          thumbnailUrl: publicationForm.thumbnailUrl || null,
          destinationLink: publicationForm.destinationLink,
        },
      });
    },
    onSuccess: async (response: any) => {
      toast({
        title: "Manual publication package prepared",
        description: `${String(response?.attempt?.platform || publicationPlatform)} remains MANUAL_REQUIRED; no external publication was claimed.`,
      });
      setPublicationConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-social-publications", selectedId] });
    },
    onError: (error: any) =>
      toast({
        title: "Publication preparation blocked",
        description: error?.message || "Rights, consent, source evidence, or package fields are incomplete.",
        variant: "destructive",
      }),
  });

  const executeOfficialPublicationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a media item");
      if (publicationPlatform !== "facebook" && publicationPlatform !== "instagram") {
        throw new Error("The released official adapter supports Facebook and Instagram only");
      }
      if (!selectedSocialReadiness?.officialPublicationReady) {
        throw new Error("Official provider readiness is incomplete; resolve every displayed blocker first");
      }
      if (!selectedSocialReadiness.connection?.id || !selectedSocialReadiness.target?.id) {
        throw new Error("A verified provider connection and exact business target are required");
      }
      const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const idempotencyKey = officialPublicationKey || `official-${selectedId}-${publicationPlatform}-${randomPart}`;
      if (!officialPublicationKey) setOfficialPublicationKey(idempotencyKey);
      return apiRequest(`/api/admin/marketing/media/${selectedId}/publications/official`, "POST", {
        platform: publicationPlatform,
        channel: publicationPlatform,
        idempotencyKey,
        integrationConnectionId: selectedSocialReadiness.connection.id,
        targetId: selectedSocialReadiness.target.id,
        confirmed: officialPublicationConfirmed,
        package: {
          title: publicationForm.title,
          caption: publicationForm.caption,
          hashtags: publicationForm.hashtags.split(",").map((value) => value.trim()).filter(Boolean),
          altText: publicationForm.altText,
          assetUrl: publicationForm.assetUrl,
          assetType: selectedItem?.type || "unspecified",
          thumbnailUrl: publicationForm.thumbnailUrl || null,
          destinationLink: publicationForm.destinationLink,
        },
      });
    },
    onSuccess: async (response: any) => {
      const status = String(response?.attempt?.status || "PROCESSING");
      toast({
        title: status === "PUBLISHED" ? "Meta publication confirmed" : "Meta media is processing",
        description: status === "PUBLISHED"
          ? "The provider object was read back and its credential-free receipt was recorded."
          : "A provider container exists, but no published post is claimed. Continue it only through the explicit foreground control.",
      });
      setOfficialPublicationConfirmed(false);
      if (status === "PUBLISHED") setOfficialPublicationKey("");
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-social-publications", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-social-readiness"] });
    },
    onError: (error: any) =>
      toast({
        title: "Official publication stopped",
        description: `${error?.message || "The provider action did not complete."} Automatic retry is disabled; inspect the ledger and provider before any new attempt.`,
        variant: "destructive",
      }),
  });

  const continueOfficialPublicationMutation = useMutation({
    mutationFn: async (attempt: SocialPublicationAttempt) => {
      if (!selectedId) throw new Error("Select a media item");
      return apiRequest(
        `/api/admin/marketing/media/${selectedId}/publications/${attempt.id}/continue`,
        "POST",
        { confirmed: officialPublicationConfirmed },
      );
    },
    onSuccess: async (response: any) => {
      const status = String(response?.attempt?.status || "PROCESSING");
      toast({
        title: status === "PUBLISHED" ? "Instagram publication confirmed" : "Instagram container still processing",
        description: status === "PUBLISHED"
          ? "Meta confirmed the media object and the provider receipt was recorded."
          : "No background retry was started. Use this foreground control again only after reviewing the retained state.",
      });
      setOfficialPublicationConfirmed(false);
      if (status === "PUBLISHED") setOfficialPublicationKey("");
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-social-publications", selectedId] });
    },
    onError: (error: any) =>
      toast({
        title: "Publication continuation stopped",
        description: `${error?.message || "The provider continuation failed."} No automatic retry was started.`,
        variant: "destructive",
      }),
  });

  const discoverSocialTargetsMutation = useMutation({
    mutationFn: async () => {
      if (!targetDiscoverySupported) {
        throw new Error("Read-only account discovery currently supports Facebook, Instagram, and YouTube");
      }
      if (!selectedSocialReadiness?.connection?.id) {
        throw new Error(`Connect or renew ${publicationPlatform} authorization first`);
      }
      return apiRequest("/api/admin/marketing/social/targets/discover", "POST", {
        connectionId: selectedSocialReadiness.connection.id,
        platform: publicationPlatform,
        confirmed: targetDiscoveryConfirmed,
      });
    },
    onSuccess: (response: any) => {
      const result = response as SocialTargetDiscoveryResult;
      setTargetDiscoveryResult(result);
      setTargetDiscoveryConfirmed(false);
      setTargetSelectionConfirmed(false);
      toast({
        title: "Provider targets discovered",
        description: `${result.candidates?.length || 0} non-secret target candidate(s) recorded. No provider data was changed and nothing was published.`,
      });
    },
    onError: (error: any) =>
      toast({
        title: "Target discovery blocked",
        description: error?.message || "The provider authorization or permission evidence is incomplete.",
        variant: "destructive",
      }),
  });

  const selectSocialTargetMutation = useMutation({
    mutationFn: async (candidate: DiscoveredSocialTarget) => {
      if (!targetDiscoveryResult?.discoveryActionRunId) {
        throw new Error("Run read-only target discovery first");
      }
      return apiRequest("/api/admin/marketing/social/targets/select", "POST", {
        discoveryActionRunId: targetDiscoveryResult.discoveryActionRunId,
        candidateKey: candidate.candidateKey,
        authorityReference: targetAuthorityReference,
        confirmed: targetSelectionConfirmed,
      });
    },
    onSuccess: async (response: any) => {
      setTargetSelectionConfirmed(false);
      toast({
        title: "Publication target selected",
        description: `${String(response?.target?.externalAccountLabel || "Provider target")} is now bound to this tenant. No provider mutation or external publication occurred.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-social-readiness"] });
    },
    onError: (error: any) =>
      toast({
        title: "Target selection blocked",
        description: error?.message || "The discovery receipt or accountable authority reference is invalid.",
        variant: "destructive",
      }),
  });

  const reconcileMetaWebhookReceiptsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMetaTargetId) throw new Error("Select a verified Facebook or Instagram target first");
      return apiRequest("/api/admin/marketing/social/inbox/meta/reconcile-target", "POST", {
        targetId: selectedMetaTargetId,
        confirmed: metaReconcileConfirmed,
        limit: 100,
      });
    },
    onSuccess: async (response: any) => {
      const attempted = Number(response?.attemptedReceiptCount || 0);
      const statusCounts = response?.statusCounts && typeof response.statusCounts === "object"
        ? Object.entries(response.statusCounts)
            .map(([status, count]) => `${status}: ${Number(count || 0)}`)
            .join(", ")
        : "no status changes";
      setMetaReconcileConfirmed(false);
      toast({
        title: "Meta receipts reconciled",
        description: `${attempted} retained receipt(s) checked in the foreground (${statusCounts}). No external reply or provider mutation occurred.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-marketing-meta-webhook-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-marketing-social-inbox"] }),
      ]);
    },
    onError: (error: any) =>
      toast({
        title: "Meta receipt reconciliation blocked",
        description: error?.message || "The selected target or its verified authorization evidence is incomplete.",
        variant: "destructive",
      }),
  });

  const suggestPrompt = async () => {
    setAssetBusy(true);
    try {
      const res = await apiRequest("/api/admin/assets/images/suggest-prompt", "POST", {
        namespace: "exportunity",
        assetKey,
        description: `Media thumbnail for ${form.title}. ${form.excerpt}`,
        aspect: "16:9",
      });
      const prompt = String(res?.prompt || "").trim();
      if (prompt) {
        setImagePrompt(prompt);
        toast({ title: "Prompt suggested", description: "Prompt ready for generation." });
      }
    } catch (error: any) {
      toast({ title: "Suggest failed", description: error?.message || "Unable to suggest prompt", variant: "destructive" });
    } finally {
      setAssetBusy(false);
    }
  };

  const generateThumbnail = async () => {
    if (!imagePrompt.trim()) return;
    setAssetBusy(true);
    try {
      const res = await apiRequest("/api/admin/assets/images/generate", "POST", {
        namespace: "exportunity",
        assetKey,
        prompt: imagePrompt.trim(),
        mode: imageMode,
        input: { aspect_ratio: "16:9", output_format: "png" },
        setActive: true,
      });
      const nextPath = normalizePath(res?.image?.storedUrl || res?.image?.sourceUrl || "");
      if (nextPath) {
        setForm((prev) => ({ ...prev, thumbnailLocalPath: nextPath }));
        toast({ title: "Thumbnail generated", description: "Image generated and attached to media card." });
      }
    } catch (error: any) {
      toast({ title: "Generate failed", description: error?.message || "Unable to generate image", variant: "destructive" });
    } finally {
      setAssetBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[360px,1fr]">
        <Card className="border-gray-800 bg-gray-900">
          <CardHeader>
            <CardTitle>Media Review Queue</CardTitle>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" className="border-gray-700 bg-gray-950" />
          </CardHeader>
          <CardContent className="max-h-[72vh] space-y-2 overflow-auto">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  syncForm(item);
                }}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === item.id ? "border-sky-400 bg-sky-500/10" : "border-gray-800 bg-gray-950 hover:bg-gray-900"}`}
              >
                <div className="line-clamp-2 text-sm font-semibold">{item.title}</div>
                <div className="mt-1 text-xs text-gray-400">{item.type} • {item.status}{item.featured ? " • featured" : ""}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-gray-800 bg-gray-900">
          <CardHeader>
            <CardTitle>{selectedItem ? `Review ${selectedItem.type}` : "Select a media item"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <select value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as MediaType }))} className="h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm">
                <option value="article">article</option>
                <option value="video">video</option>
                <option value="profile">profile</option>
                <option value="press_release">press_release</option>
                <option value="podcast">podcast</option>
                <option value="post">post</option>
              </select>
              <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MediaStatus }))} className="h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm">
                <option value="discovered">discovered</option>
                <option value="reviewed">reviewed</option>
                <option value="published" disabled={selectedItem?.status !== "published"}>published (use governed Publish action)</option>
                <option value="rejected">rejected</option>
              </select>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Title" className="border-gray-700 bg-gray-950" />
              <Input value={form.outlet} onChange={(event) => setForm((prev) => ({ ...prev, outlet: event.target.value }))} placeholder="Outlet" className="border-gray-700 bg-gray-950" />
              <Input value={form.url} onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="URL" className="border-gray-700 bg-gray-950" />
              <Input value={form.canonicalUrl} onChange={(event) => setForm((prev) => ({ ...prev, canonicalUrl: event.target.value }))} placeholder="Canonical URL (optional)" className="border-gray-700 bg-gray-950" />
              <Input value={form.publishedAt} onChange={(event) => setForm((prev) => ({ ...prev, publishedAt: event.target.value }))} type="date" className="border-gray-700 bg-gray-950" />
              <Input value={form.language} onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))} placeholder="Language (e.g. en, fr)" className="border-gray-700 bg-gray-950" />
              <Input value={form.author} onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))} placeholder="Author (optional)" className="border-gray-700 bg-gray-950" />
              <Input value={form.mediaEmbedUrl} onChange={(event) => setForm((prev) => ({ ...prev, mediaEmbedUrl: event.target.value }))} placeholder="Media embed URL (video/podcast, optional)" className="border-gray-700 bg-gray-950" />
              <Input value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Tags comma-separated" className="border-gray-700 bg-gray-950" />
              <Input value={form.duplicateOf} onChange={(event) => setForm((prev) => ({ ...prev, duplicateOf: event.target.value }))} placeholder="Duplicate of media ID (optional)" className="border-gray-700 bg-gray-950" />
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input type="checkbox" checked={form.featured} onChange={(event) => setForm((prev) => ({ ...prev, featured: event.target.checked }))} />
                Feature this item on public media pages
              </label>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Link verification</div>
                  <div className="text-xs text-gray-400">
                    {selectedItem?.raw?.linkCheck?.checkedAt ? (
                      <span>
                        Last checked: {String(selectedItem.raw.linkCheck.checkedAt)} • status {String(selectedItem.raw.linkCheck.status ?? "")} •{" "}
                        {selectedItem.raw.linkCheck.ok ? "ok" : "failed"}
                      </span>
                    ) : (
                      <span>Not verified yet.</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    disabled={!selectedId || verifyMutation.isPending || !(form.canonicalUrl.trim() || form.url.trim())}
                    onClick={() => verifyMutation.mutate()}
                  >
                    {verifyMutation.isPending ? "Verifying..." : "Verify URL"}
                  </Button>
                  {selectedItem?.canonicalUrl || selectedItem?.url ? (
                    <a href={(selectedItem.canonicalUrl || selectedItem.url) as string} target="_blank" rel="noreferrer">
                      <Button variant="secondary">Open Canonical</Button>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Creator source, rights, and consent gate</div>
                  <div className="mt-1 text-xs text-gray-400">
                    The source is retained as a reference. Exportunity may not copy, edit, publish, advertise, translate, or dub it beyond the evidenced grant.
                  </div>
                </div>
              <div className={`rounded-full px-3 py-1 text-xs font-medium ${publicationEligible ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
                {rightsQuery.isLoading ? "checking…" : publicationEligible ? "eligible for web publication" : "publication blocked"}
              </div>
              <div className="text-right text-xs text-gray-400">
                <div>Source reuse: {sourceReuseStatus}</div>
                <div>Takedown state: {sourceTakedownState}</div>
              </div>
            </div>

              {rightsState?.legacyPublishedWithoutLedger ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100">
                  Legacy published item: production rights are unknown. It is queued for remediation; this change does not silently unpublish historical content.
                </div>
              ) : null}

              {!publicationEligible && rightsState?.eligibility?.blockers?.length ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100">
                  {rightsState.eligibility.blockers.map((blocker) => <div key={blocker}>• {blocker}</div>)}
                </div>
              ) : null}

              <div className="space-y-3 rounded-lg border border-gray-800 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source state action</div>
                <label className="space-y-1 text-xs text-gray-300">
                  Action
                  <select
                    value={takedownForm.action}
                    onChange={(event) =>
                      setTakedownForm((prev) => ({ ...prev, action: event.target.value as typeof prev.action }))}
                    className="h-10 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm text-white"
                  >
                    <option value="requested">request takedown</option>
                    <option value="disputed">mark disputed</option>
                    <option value="removed">mark removed</option>
                    <option value="clear">clear takedown state</option>
                  </select>
                </label>
                {takedownForm.action !== "clear" ? (
                  <Input
                    value={takedownForm.reason}
                    onChange={(event) => setTakedownForm((prev) => ({ ...prev, reason: event.target.value }))}
                    placeholder="Reason for this action"
                    className="border-gray-700 bg-gray-950"
                  />
                ) : null}
                <Input
                  value={takedownForm.evidenceReference}
                  onChange={(event) => setTakedownForm((prev) => ({ ...prev, evidenceReference: event.target.value }))}
                  placeholder="Evidence reference, platform notice, or ticket ID (optional)"
                  className="border-gray-700 bg-gray-950"
                />
                <Textarea
                  value={takedownForm.evidenceNotes}
                  onChange={(event) => setTakedownForm((prev) => ({ ...prev, evidenceNotes: event.target.value }))}
                  placeholder="Evidence notes"
                  className="min-h-[70px] border-gray-700 bg-gray-950"
                />
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={takedownForm.confirmed}
                    onChange={(event) => setTakedownForm((prev) => ({ ...prev, confirmed: event.target.checked }))}
                  />
                  I confirm this source state action.
                </label>
                <Button
                  variant="secondary"
                  onClick={() => takedownRightsMutation.mutate()}
                  disabled={
                    !selectedId ||
                    !rightsState?.sourceReference ||
                    takedownRightsMutation.isPending ||
                    !takedownForm.confirmed ||
                    (takedownForm.action !== "clear" && !takedownForm.reason.trim())
                  }
                >
                  {takedownRightsMutation.isPending
                    ? "Applying source state…"
                    : `${takedownActionLabel(takedownForm.action)}`
                  }
                </Button>
                {takedownNeedsClear ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-2 text-xs text-amber-100">
                    Source is currently blocked ({sourceTakedownState}). Publish actions remain blocked.
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input value={rightsForm.rightsHolderName} onChange={(event) => setRightsForm((prev) => ({ ...prev, rightsHolderName: event.target.value }))} placeholder="Rights holder name" className="border-gray-700 bg-gray-950" />
                <select value={rightsForm.rightsBasis} onChange={(event) => setRightsForm((prev) => ({ ...prev, rightsBasis: event.target.value }))} className="h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm">
                  <option value="creator_grant">creator_grant</option>
                  <option value="license">license</option>
                  <option value="commissioned">commissioned</option>
                  <option value="tenant_owned">tenant_owned</option>
                  <option value="public_domain">public_domain</option>
                </select>
                <Input value={rightsForm.sourcePlatform} onChange={(event) => setRightsForm((prev) => ({ ...prev, sourcePlatform: event.target.value }))} placeholder="Source platform (auto-detected if blank)" className="border-gray-700 bg-gray-950" />
                <Input value={rightsForm.sourceCreatorUrl} onChange={(event) => setRightsForm((prev) => ({ ...prev, sourceCreatorUrl: event.target.value }))} placeholder="Creator profile URL" className="border-gray-700 bg-gray-950" />
                <Input value={rightsForm.usageTypes} onChange={(event) => setRightsForm((prev) => ({ ...prev, usageTypes: event.target.value }))} placeholder="Usage types" className="border-gray-700 bg-gray-950" />
                <Input value={rightsForm.channels} onChange={(event) => setRightsForm((prev) => ({ ...prev, channels: event.target.value }))} placeholder="Channels" className="border-gray-700 bg-gray-950" />
                <label className="space-y-1 text-xs text-gray-300">
                  Rights expiry (optional)
                  <Input type="date" value={rightsForm.expiresAt} onChange={(event) => setRightsForm((prev) => ({ ...prev, expiresAt: event.target.value }))} className="border-gray-700 bg-gray-950" />
                </label>
                <Input value={rightsForm.attributionText} onChange={(event) => setRightsForm((prev) => ({ ...prev, attributionText: event.target.value }))} placeholder="Required attribution text (optional)" className="border-gray-700 bg-gray-950" />
                {([
                  ["producerConsentStatus", "Producer consent"],
                  ["subjectReleaseStatus", "Subject release"],
                  ["musicLicenseStatus", "Music license"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="space-y-1 text-xs text-gray-300">
                    {label}
                    <select value={rightsForm[key]} onChange={(event) => setRightsForm((prev) => ({ ...prev, [key]: event.target.value }))} className="h-10 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm text-white">
                      <option value="unknown">unknown</option>
                      <option value="not_required">not_required</option>
                      <option value="pending">pending</option>
                      <option value="granted">granted</option>
                      <option value="revoked">revoked</option>
                    </select>
                  </label>
                ))}
                <Input value={rightsForm.evidenceReference} onChange={(event) => setRightsForm((prev) => ({ ...prev, evidenceReference: event.target.value }))} placeholder="Evidence reference, signed release, message, or contract ID" className="border-gray-700 bg-gray-950" />
              </div>
              <Textarea value={rightsForm.evidenceNotes} onChange={(event) => setRightsForm((prev) => ({ ...prev, evidenceNotes: event.target.value }))} placeholder="Evidence notes and permitted scope" className="min-h-[90px] border-gray-700 bg-gray-950" />
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input type="checkbox" checked={rightsForm.allTerritories} onChange={(event) => setRightsForm((prev) => ({ ...prev, allTerritories: event.target.checked }))} />
                  Grant covers global web publication
                </label>
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input type="checkbox" checked={rightsForm.confirmed} onChange={(event) => setRightsForm((prev) => ({ ...prev, confirmed: event.target.checked }))} />
                  I reviewed the original evidence and am accountable for recording this grant.
                </label>
              </div>
              <Button
                variant="outline"
                onClick={() => grantRightsMutation.mutate()}
                disabled={!selectedId || grantRightsMutation.isPending || !rightsForm.confirmed || !rightsForm.rightsHolderName.trim() || !(rightsForm.evidenceReference.trim() || rightsForm.evidenceNotes.trim())}
              >
                {grantRightsMutation.isPending ? "Recording…" : "Record governed rights grant"}
              </Button>

              {rightsState?.grants?.length ? (
                <div className="space-y-2 border-t border-gray-800 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rights ledger</div>
                  {rightsState.grants.map((grant: any) => (
                    <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 p-3 text-xs">
                      <div>
                        <div className="font-medium text-gray-100">#{grant.id} · {grant.rightsHolderName} · {grant.status}</div>
                        <div className="mt-1 text-gray-400">{grant.rightsBasis} · {(grant.usageTypes || []).join(", ")} · {(grant.channels || []).join(", ")}</div>
                      </div>
                      {grant.status === "granted" ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={revokeRightsMutation.isPending}
                          onClick={() => {
                            const reason = window.prompt("Reason for revoking this rights grant?")?.trim();
                            if (reason) revokeRightsMutation.mutate({ grantId: Number(grant.id), reason });
                          }}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {rightsEvents.length ? (
                <div className="space-y-2 border-t border-gray-800 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rights event timeline</div>
                  {rightsEvents.map((event: any) => (
                    <div key={event.id} className="rounded-lg border border-gray-800 p-3 text-xs">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-gray-300">
                        <span className="font-semibold">{humanizeRightsEventType(event.eventType)}</span>
                        <span className="text-gray-500">{formatRightsEventDate(event.createdAt)}</span>
                      </div>
                      <div className="text-gray-400">
                        {event.actorUserId ? `actor ${event.actorUserId}` : "system"} · source event
                      </div>
                      {event.payload && typeof event.payload === "object" ? (
                        <div className="mt-1 max-w-4xl break-words text-gray-500">
                          {event.payload.reason ? <div>Reason: {String(event.payload.reason)}</div> : null}
                          {event.payload.takedownAction ? <div>Action: {String(event.payload.takedownAction)}</div> : null}
                          {event.payload.takedownActionLabel ? <div>Action label: {String(event.payload.takedownActionLabel)}</div> : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-950/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Governed social publication</div>
                  <div className="mt-1 max-w-3xl text-xs text-gray-400">
                    Provider credentials remain encrypted in Exportunity&apos;s native integration vault. Manual handoff always records MANUAL_REQUIRED—not PUBLISHED. The disabled-by-default Meta adapter can create one visible post only after current rights, permissions, target evidence, release configuration, and action-time confirmation all pass.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="/admin/advertising-governance">
                    <Button variant="outline" size="sm">Advertising governance</Button>
                  </Link>
                  <div className={`rounded-full px-3 py-1 text-xs font-medium ${selectedSocialReadiness?.officialPublicationReady ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
                    {socialReadinessQuery.isLoading
                      ? "checking…"
                      : selectedSocialReadiness?.officialPublicationReady
                        ? "official API ready"
                        : "manual fallback required"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs text-gray-300">
                  Destination platform
                  <select
                    value={publicationPlatform}
                    onChange={(event) => {
                      setPublicationPlatform(event.target.value as SocialPlatform);
                      setTargetDiscoveryResult(null);
                      setTargetDiscoveryConfirmed(false);
                      setTargetSelectionConfirmed(false);
                      setMetaReconcileConfirmed(false);
                      setOfficialPublicationConfirmed(false);
                      setOfficialPublicationKey("");
                    }}
                    className="h-10 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm text-white"
                  >
                    <option value="facebook">Facebook Page</option>
                    <option value="instagram">Instagram professional account</option>
                    <option value="youtube">YouTube channel</option>
                    <option value="tiktok">TikTok business account</option>
                    <option value="linkedin">LinkedIn Page</option>
                    <option value="x">X organization</option>
                  </select>
                </label>
                <div className="rounded-lg border border-gray-800 p-3 text-xs text-gray-300">
                  <div className="font-medium text-gray-100">
                    {selectedSocialReadiness?.connection?.accountLabel || "No authorized account recorded"}
                  </div>
                  <div className="mt-1">
                    Provider {selectedSocialReadiness?.provider || "unknown"} · app {selectedSocialReadiness?.configured ? "configured" : "setup needed"} · target {selectedSocialReadiness?.target?.healthStatus || "unverified"}
                  </div>
                  {selectedSocialReadiness?.connectUrl ? (
                    <a
                      className="mt-2 inline-flex font-semibold text-sky-300 hover:text-sky-200"
                      href={`${selectedSocialReadiness.connectUrl}?returnTo=${encodeURIComponent("/admin/media")}`}
                    >
                      Connect or renew {publicationPlatform} authorization
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-sky-500/25 bg-sky-950/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">Verified provider target</div>
                    <div className="mt-1 max-w-3xl text-xs text-gray-400">
                      Discovery performs one read-only provider request and stores only account identifiers, labels, capabilities, and permission evidence. Access tokens, refresh tokens, and page tokens are excluded from the receipt.
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <div>Selected: {selectedSocialReadiness?.target?.externalAccountLabel || "none"}</div>
                    <div>No publish · no provider mutation</div>
                  </div>
                </div>

                {targetDiscoverySupported ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex max-w-2xl items-start gap-2 text-xs text-gray-300">
                        <input
                          type="checkbox"
                          checked={targetDiscoveryConfirmed}
                          onChange={(event) => setTargetDiscoveryConfirmed(event.target.checked)}
                        />
                        I authorize a read-only account catalogue request for this connected provider. I understand it does not publish, message, advertise, spend, or change provider settings.
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => discoverSocialTargetsMutation.mutate()}
                        disabled={
                          discoverSocialTargetsMutation.isPending ||
                          !targetDiscoveryConfirmed ||
                          !selectedSocialReadiness?.connection?.id
                        }
                      >
                        {discoverSocialTargetsMutation.isPending ? "Discovering…" : "Discover authorized targets"}
                      </Button>
                    </div>

                    {targetDiscoveryResult ? (
                      <div className="space-y-3 border-t border-gray-800 pt-3">
                        <div className="text-xs text-gray-400">
                          Receipt #{targetDiscoveryResult.discoveryActionRunId} · {targetDiscoveryResult.candidates.length} candidate(s) · provider read confirmed · credentials excluded
                        </div>
                        {targetDiscoveryResult.candidates.length ? (
                          <>
                            <Input
                              value={targetAuthorityReference}
                              onChange={(event) => setTargetAuthorityReference(event.target.value)}
                              placeholder="Non-secret selection authority reference (decision note, ticket, or approval ID)"
                              className="border-gray-700 bg-gray-950"
                            />
                            <label className="flex max-w-3xl items-start gap-2 text-xs text-gray-300">
                              <input
                                type="checkbox"
                                checked={targetSelectionConfirmed}
                                onChange={(event) => setTargetSelectionConfirmed(event.target.checked)}
                              />
                              I confirm the chosen account is the official tenant destination and this non-secret authority reference is accurate. Selection only creates an internal target binding.
                            </label>
                            <div className="grid gap-2 md:grid-cols-2">
                              {targetDiscoveryResult.candidates.map((candidate) => (
                                <div key={candidate.candidateKey} className="rounded-lg border border-gray-800 bg-gray-950/70 p-3 text-xs">
                                  <div className="font-semibold text-gray-100">{candidate.externalAccountLabel}</div>
                                  <div className="mt-1 text-gray-400">
                                    {candidate.channel} · ID {candidate.externalAccountId}
                                  </div>
                                  {candidate.parentAccountLabel ? (
                                    <div className="mt-1 text-gray-500">Parent Page: {candidate.parentAccountLabel}</div>
                                  ) : null}
                                  <div className="mt-2 text-gray-500">
                                    Capabilities: {candidate.capabilities.length ? candidate.capabilities.join(", ") : "none reported"}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-3"
                                    onClick={() => selectSocialTargetMutation.mutate(candidate)}
                                    disabled={
                                      selectSocialTargetMutation.isPending ||
                                      !targetSelectionConfirmed ||
                                      !targetAuthorityReference.trim()
                                    }
                                  >
                                    {selectSocialTargetMutation.isPending ? "Selecting…" : "Select official target"}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-amber-200">
                            The provider returned no eligible {publicationPlatform} business target. Verify ownership and provider-side account linkage, then reconnect if permissions changed.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-xs text-amber-200">
                    Governed target discovery is not yet implemented for {publicationPlatform}; manual handoff remains available without claiming provider readiness.
                  </div>
                )}
              </div>

              {publicationPlatform === "facebook" || publicationPlatform === "instagram" ? (
                <div className="space-y-3 rounded-lg border border-violet-500/25 bg-violet-950/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-violet-200">
                        Signed Meta receipt ledger
                      </div>
                      <div className="mt-1 max-w-3xl text-xs text-gray-400">
                        Signed Facebook and Instagram webhook deliveries are retained before inbox projection. The ledger view excludes message bodies and sanitized source payloads; credentials are never returned here.
                      </div>
                    </div>
                    <div className="space-y-1 text-right text-xs text-gray-400">
                      <div>
                        Ingestion {metaWebhookReadiness?.enabled ? "enabled" : "disabled by release flag"} · signature {metaWebhookReadiness?.verificationReady ? "ready" : "not configured"}
                      </div>
                      <div>
                        Endpoint <code>{metaWebhookReadiness?.endpoint || "/api/webhooks/meta/social"}</code>
                      </div>
                      <div>No automatic background retry · no external reply</div>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs text-gray-300 md:grid-cols-3">
                    <div className="rounded border border-gray-800 p-2">
                      Release: {metaWebhookReadiness?.releaseReady ? "ready" : "blocked"}
                    </div>
                    <div className="rounded border border-gray-800 p-2">
                      Migration: {metaWebhookReadiness?.migrationApplied || "unknown—production evidence required"}
                    </div>
                    <div className="rounded border border-gray-800 p-2">
                      Retention: {metaWebhookReadiness?.retentionDays || 30} day(s)
                    </div>
                  </div>

                  {selectedMetaTargetId ? (
                    <>
                      <div className="flex flex-wrap items-center gap-3 border-t border-gray-800 pt-3">
                        <label className="flex max-w-3xl items-start gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={metaReconcileConfirmed}
                            onChange={(event) => setMetaReconcileConfirmed(event.target.checked)}
                          />
                          I authorize one foreground, target-scoped reconciliation of retained signed receipts into the internal social inbox. It sends no reply and changes no Meta setting.
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => reconcileMetaWebhookReceiptsMutation.mutate()}
                          disabled={!metaReconcileConfirmed || reconcileMetaWebhookReceiptsMutation.isPending}
                        >
                          {reconcileMetaWebhookReceiptsMutation.isPending
                            ? "Reconciling…"
                            : "Reconcile retained receipts"}
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-medium text-gray-200">
                          Target receipt history · {metaWebhookReceiptsQuery.data?.length || 0} retained
                        </div>
                        {metaWebhookReceiptsQuery.isLoading ? (
                          <div className="text-xs text-gray-500">Loading credential-free receipt metadata…</div>
                        ) : metaWebhookReceiptsQuery.data?.length ? (
                          metaWebhookReceiptsQuery.data.map((receipt) => (
                            <div
                              key={receipt.id}
                              className="flex flex-wrap items-start justify-between gap-3 rounded border border-gray-800 bg-gray-950/70 p-2 text-xs"
                            >
                              <div>
                                <div className="font-medium text-gray-100">
                                  {receipt.eventKind} · {receipt.resolutionStatus}
                                </div>
                                <div className="mt-1 text-gray-500">
                                  Parsed {receipt.parseStatus} · deliveries {receipt.deliveryCount} · projection attempts {receipt.attemptCount}
                                </div>
                              </div>
                              <div className="text-right text-gray-500">
                                <div>{new Date(receipt.receivedAt).toLocaleString()}</div>
                                {receipt.reasonCode ? <div>{receipt.reasonCode}</div> : null}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-gray-500">
                            No target-bound receipt metadata is available. Unmatched deliveries remain quarantined until an explicitly confirmed reconciliation can bind them.
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-amber-200">
                      Select a verified Meta provider target to inspect receipt metadata or run foreground reconciliation.
                    </div>
                  )}
                </div>
              ) : null}

              {selectedSocialReadiness?.blockers?.length ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100">
                  {selectedSocialReadiness.blockers.map((blocker) => <div key={blocker}>• {blocker}</div>)}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input value={publicationForm.title} onChange={(event) => setPublicationForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Platform title" className="border-gray-700 bg-gray-950" />
                <Input value={publicationForm.hashtags} onChange={(event) => setPublicationForm((prev) => ({ ...prev, hashtags: event.target.value }))} placeholder="Hashtags, comma-separated" className="border-gray-700 bg-gray-950" />
                <Input value={publicationForm.assetUrl} onChange={(event) => setPublicationForm((prev) => ({ ...prev, assetUrl: event.target.value }))} placeholder="Final asset URL or managed path" className="border-gray-700 bg-gray-950" />
                <Input value={publicationForm.thumbnailUrl} onChange={(event) => setPublicationForm((prev) => ({ ...prev, thumbnailUrl: event.target.value }))} placeholder="Thumbnail URL or managed path" className="border-gray-700 bg-gray-950" />
                <Input value={publicationForm.destinationLink} onChange={(event) => setPublicationForm((prev) => ({ ...prev, destinationLink: event.target.value }))} placeholder="Destination link" className="border-gray-700 bg-gray-950" />
                <Input value={publicationForm.altText} onChange={(event) => setPublicationForm((prev) => ({ ...prev, altText: event.target.value }))} placeholder="Alt text" className="border-gray-700 bg-gray-950" />
              </div>
              <Textarea value={publicationForm.caption} onChange={(event) => setPublicationForm((prev) => ({ ...prev, caption: event.target.value }))} placeholder="Platform-native caption" className="min-h-[120px] border-gray-700 bg-gray-950" />

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex max-w-2xl items-start gap-2 text-xs text-gray-300">
                  <input type="checkbox" checked={publicationConfirmed} onChange={(event) => setPublicationConfirmed(event.target.checked)} />
                  I confirm this item is reviewed, the package matches the approved rights scope, and I am accountable for preparing the manual handoff. This does not confirm external publication.
                </label>
                <Button
                  variant="outline"
                  onClick={() => preparePublicationMutation.mutate()}
                  disabled={
                    !selectedId ||
                    preparePublicationMutation.isPending ||
                    !publicationConfirmed ||
                    !publicationForm.title.trim() ||
                    !publicationForm.assetUrl.trim() ||
                    !publicationForm.destinationLink.trim()
                  }
                >
                  {preparePublicationMutation.isPending ? "Preparing…" : "Prepare governed manual package"}
                </Button>
                <span className="text-xs text-gray-400">
                  The active rights grant must explicitly include channel <code>{publicationPlatform}</code>.
                </span>
              </div>

              {publicationPlatform === "facebook" || publicationPlatform === "instagram" ? (
                <div className="space-y-3 rounded-lg border border-rose-500/35 bg-rose-950/15 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-rose-200">
                        Official Meta publication · consequential action
                      </div>
                      <div className="mt-1 max-w-3xl text-xs text-gray-400">
                        This performs one provider mutation and may create a publicly visible post immediately. It never creates an ad, spends a budget, sends a DM, or starts a background retry. Facebook accepts a public HTTPS image or link package; the first Instagram release accepts one public JPEG image.
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      <div>Adapter {selectedSocialReadiness?.adapter?.enabled ? "released" : "disabled"}</div>
                      <div>Automatic retry: off</div>
                    </div>
                  </div>
                  <label className="flex max-w-3xl items-start gap-2 text-xs text-gray-200">
                    <input
                      type="checkbox"
                      checked={officialPublicationConfirmed}
                      onChange={(event) => setOfficialPublicationConfirmed(event.target.checked)}
                    />
                    I authorize one immediate publication to the exact verified {publicationPlatform} business target shown above. I confirm the current asset, caption, rights, destination, and attribution are approved, and I understand the post may become public.
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      className="bg-rose-700 text-white hover:bg-rose-600"
                      onClick={() => executeOfficialPublicationMutation.mutate()}
                      disabled={
                        !selectedId ||
                        !selectedSocialReadiness?.officialPublicationReady ||
                        !officialPublicationConfirmed ||
                        executeOfficialPublicationMutation.isPending ||
                        !publicationForm.title.trim() ||
                        !publicationForm.assetUrl.trim().startsWith("https://") ||
                        !publicationForm.destinationLink.trim().startsWith("https://")
                      }
                    >
                      {executeOfficialPublicationMutation.isPending
                        ? "Publishing once…"
                        : `Publish once to verified ${publicationPlatform}`}
                    </Button>
                    <span className="text-xs text-gray-400">
                      {officialPublicationKey
                        ? "The current idempotency key is retained after a stopped or processing attempt."
                        : "A fresh one-shot idempotency key will be bound when this action begins."}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-gray-800 p-3 text-xs text-gray-300">
                Twilio messaging health: {String((socialReadinessQuery.data?.communications as any)?.twilio?.status || "unknown")}. WhatsApp/SMS/voice remain separately approval-governed and do not count as social publication. {" "}
                <Link href="/admin/settings/communications/twilio">
                  <span className="font-semibold text-sky-300 hover:text-sky-200">Open Twilio control center</span>
                </Link>
              </div>

              {publicationAttemptsQuery.data?.length ? (
                <div className="space-y-2 border-t border-gray-800 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Publication attempt ledger</div>
                  {publicationAttemptsQuery.data.map((attempt) => {
                    const manualPackage = attempt.manualPackage || {};
                    return (
                      <details key={attempt.id} className="rounded-lg border border-gray-800 p-3 text-xs">
                        <summary className="cursor-pointer font-medium text-gray-100">
                          {attempt.platform} · {attempt.mode} · {attempt.status} · {String(attempt.createdAt || "")}
                        </summary>
                        <div className="mt-3 space-y-2 text-gray-300">
                          <div><strong>Title:</strong> {String(manualPackage.title || "")}</div>
                          <div className="whitespace-pre-wrap"><strong>Caption:</strong> {String(manualPackage.caption || "")}</div>
                          <div><strong>Hashtags:</strong> {Array.isArray(manualPackage.hashtags) ? manualPackage.hashtags.join(" ") : ""}</div>
                          <div><strong>Alt text:</strong> {String(manualPackage.altText || "")}</div>
                          <div><strong>Asset:</strong> {String(manualPackage.finalAsset?.url || "")}</div>
                          <div><strong>Thumbnail:</strong> {String(manualPackage.thumbnail || "none")}</div>
                          <div><strong>Destination:</strong> {String(manualPackage.destinationLink || "")}</div>
                          <div><strong>Tracking:</strong> <code>{String(manualPackage.trackingCode || "")}</code></div>
                          {attempt.mode === "official_api" ? (
                            <div className="rounded border border-gray-800 bg-gray-950/70 p-2">
                              <div><strong>Provider phase:</strong> {String(attempt.providerState?.executionPhase || "unknown")}</div>
                              <div><strong>Provider object:</strong> {String(attempt.providerState?.providerObjectId || "not confirmed")}</div>
                              <div><strong>Provider URL:</strong> {String(attempt.providerState?.providerUrl || "not confirmed")}</div>
                              <div><strong>Automatic retry:</strong> disabled</div>
                            </div>
                          ) : null}
                          {attempt.mode === "official_api" && attempt.platform === "instagram" && attempt.status === "PROCESSING" ? (
                            <div className="space-y-2 rounded border border-amber-500/30 bg-amber-950/15 p-2">
                              <div>
                                Meta has a media container, but Exportunity does not claim a published post. Check the action-time confirmation above, then run one foreground status check/publication continuation.
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => continueOfficialPublicationMutation.mutate(attempt)}
                                disabled={!officialPublicationConfirmed || continueOfficialPublicationMutation.isPending}
                              >
                                {continueOfficialPublicationMutation.isPending
                                  ? "Checking Meta once…"
                                  : "Continue this Instagram publication once"}
                              </Button>
                            </div>
                          ) : null}
                          {Array.isArray(manualPackage.publishingInstructions) ? (
                            <div>
                              <strong>Instructions:</strong>
                              {manualPackage.publishingInstructions.map((instruction: string) => <div key={instruction}>• {instruction}</div>)}
                            </div>
                          ) : null}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-500">No social publication attempt has been recorded for this item.</div>
              )}
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-3">
              <div className="text-sm font-semibold">Thumbnail image</div>
              <Input value={form.thumbnailLocalPath} onChange={(event) => setForm((prev) => ({ ...prev, thumbnailLocalPath: event.target.value }))} placeholder="Thumbnail local path" className="border-gray-700 bg-gray-950" />
              <Input value={form.thumbnailRemoteUrl} onChange={(event) => setForm((prev) => ({ ...prev, thumbnailRemoteUrl: event.target.value }))} placeholder="Thumbnail remote URL" className="border-gray-700 bg-gray-950" />
              {form.thumbnailLocalPath || form.thumbnailRemoteUrl ? <img src={form.thumbnailLocalPath || form.thumbnailRemoteUrl} alt="Thumbnail preview" className="h-44 w-full rounded-lg border border-gray-800 object-cover" /> : null}
              <Input value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="Prompt for AI generation" className="border-gray-700 bg-gray-950" />
              <div className="flex flex-wrap gap-2">
                <Select value={imageMode} onValueChange={(value) => setImageMode(value as "quality" | "fast")}>
                  <SelectTrigger className="w-[130px] border-gray-700 bg-gray-950 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-gray-700 bg-gray-950 text-white">
                    <SelectItem value="quality">quality</SelectItem>
                    <SelectItem value="fast">fast</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" disabled={assetBusy || !form.title.trim()} onClick={suggestPrompt}>Suggest prompt</Button>
                <Button disabled={assetBusy || !imagePrompt.trim()} onClick={generateThumbnail}>{assetBusy ? "Working..." : "Generate thumbnail"}</Button>
                <a href={`/admin/media/assets?tab=library&namespace=exportunity&q=${encodeURIComponent(assetKey)}`} target="_blank" rel="noreferrer"><Button variant="secondary">Open Asset Studio</Button></a>
              </div>
            </div>

            <Textarea value={form.excerpt} onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))} placeholder="Excerpt" className="min-h-[120px] border-gray-700 bg-gray-950" />
            <Textarea value={form.summaryParagraph} onChange={(event) => setForm((prev) => ({ ...prev, summaryParagraph: event.target.value }))} placeholder="Summary paragraph" className="min-h-[180px] border-gray-700 bg-gray-950" />

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !selectedId || !form.title.trim() || !form.url.trim()}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" disabled={!selectedId || statusMutation.isPending} onClick={() => statusMutation.mutate("reviewed")}>Mark Reviewed</Button>
              <Button variant="secondary" disabled={!selectedId || statusMutation.isPending || !publicationEligible} onClick={() => statusMutation.mutate("published")}>Publish</Button>
              <Button variant="destructive" disabled={!selectedId || statusMutation.isPending} onClick={() => statusMutation.mutate("rejected")}>Reject</Button>
              <Button variant="outline" disabled={!selectedId || statusMutation.isPending} onClick={() => statusMutation.mutate("feature")}>Feature</Button>
              <Button variant="outline" disabled={!selectedId || statusMutation.isPending} onClick={() => statusMutation.mutate("unfeature")}>Unfeature</Button>
              {selectedItem?.url ? (
                <a href={selectedItem.url} target="_blank" rel="noreferrer">
                  <Button variant="outline">Open Source</Button>
                </a>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
