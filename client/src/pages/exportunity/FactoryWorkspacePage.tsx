import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  Factory,
  FileCheck2,
  FileUp,
  PackageCheck,
  PackagePlus,
  Pencil,
  Plus,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";

import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Language = "fr" | "en";

export type FactoryWorkspaceTaxonomyCategory = {
  code: string;
  classification: string;
  label: { fr: string; en: string };
};

type OwnedFactory = {
  id: string;
  legalName: string;
  displayName: string;
  primaryIndustry: string;
  countryCode: string;
  region?: string | null;
  city?: string | null;
  industrialZone?: string | null;
  factoryStatus: string;
  verificationStatus: string;
  publicVisibility: string;
};

type WorkspaceCatalogItem = {
  id: string;
  classification: string;
  categoryCode: string;
  name: string;
  productCode?: string | null;
  minimumOrderQuantity?: string | null;
  leadTimeText?: string | null;
  approvalStatus: string;
  visibility: string;
  updatedAt?: string | null;
};

type RecurringRequirementStatus = "draft" | "active" | "paused" | "closed";

type RecurringRequirement = {
  id: string;
  machineId?: string | null;
  assemblyId?: string | null;
  componentId?: string | null;
  requirementType:
    "raw_material" | "industrial_input" | "spare_part" | "industrial_service";
  categoryCode: string;
  title: string;
  details?: string | null;
  quantityText?: string | null;
  frequency: string;
  reorderThreshold?: string | null;
  preferredDeliveryDate?: string | null;
  preferredSupplier?: string | null;
  alternativeSupplier?: string | null;
  priceAgreementPeriod?: string | null;
  contractStartAt?: string | null;
  contractEndAt?: string | null;
  approvalWorkflow: string;
  approvalRequired: boolean;
  status: RecurringRequirementStatus;
  nextReviewAt?: string | null;
  internalNotes?: string | null;
  updatedAt?: string | null;
};

type IndustrialChallengeStatus =
  | "submitted"
  | "triaged"
  | "grouped"
  | "sourcing_review"
  | "engineering_review"
  | "local_manufacturing_review"
  | "resolved"
  | "declined"
  | "closed";

type IndustrialChallengeRequirementType =
  | "machinery"
  | "raw_material"
  | "industrial_input"
  | "spare_part"
  | "custom_manufacturing"
  | "industrial_service";

type IndustrialChallengeOutcome =
  | "review_required"
  | "stock_candidate"
  | "group_procurement"
  | "reverse_engineering"
  | "local_manufacturing"
  | "redesign"
  | "engineering_partner"
  | "declined";

type IndustrialChallengeAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  createdAt?: string | null;
};

type IndustrialChallenge = {
  id: string;
  requirementId: string;
  requirementReferenceCode?: string | null;
  machineId?: string | null;
  assemblyId?: string | null;
  componentId?: string | null;
  requirementType: IndustrialChallengeRequirementType;
  categoryCode: string;
  title: string;
  details: string;
  problemType: string;
  productionStopped: boolean;
  impactText?: string | null;
  recurrenceFrequency?: string | null;
  estimatedDowntime?: string | null;
  currentWorkaround?: string | null;
  desiredOutcome: IndustrialChallengeOutcome;
  urgency: "standard" | "urgent" | "critical";
  status: IndustrialChallengeStatus;
  resolutionNotes?: string | null;
  reviewedAt?: string | null;
  resolvedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  attachmentCount: number;
  attachments: IndustrialChallengeAttachment[];
};

type IndustrialPartRecordStatus =
  | "captured"
  | "digitization"
  | "technical_review"
  | "route_review"
  | "route_selected"
  | "prototype"
  | "validated"
  | "catalog_candidate"
  | "archived";

type IndustrialPartRecordDocument = {
  id: string;
  documentType: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  createdAt?: string | null;
};

type IndustrialPartRecord = {
  id: string;
  referenceCode: string;
  sourceRequirementId?: string | null;
  challengeId?: string | null;
  machineId?: string | null;
  assemblyId?: string | null;
  componentId?: string | null;
  title: string;
  partNumber?: string | null;
  requirementType: IndustrialChallengeRequirementType;
  categoryCode: string;
  technicalDetails?: string | null;
  material?: string | null;
  dimensionsText?: string | null;
  weightText?: string | null;
  application?: string | null;
  currentSource?: string | null;
  demandSignalText?: string | null;
  status: IndustrialPartRecordStatus;
  routeDecision: string;
  routeRationale?: string | null;
  reviewNotes?: string | null;
  revision: number;
  reviewedAt?: string | null;
  updatedAt?: string | null;
  documentCount: number;
  documents: IndustrialPartRecordDocument[];
};

type FactoryOrder = {
  id: string;
  referenceCode: string;
  quoteReferenceCode?: string | null;
  requirementReferenceCode?: string | null;
  requirementTitle?: string | null;
  catalogItemName?: string | null;
  status:
    | "confirmed"
    | "procurement"
    | "manufacturing"
    | "quality_control"
    | "delivery"
    | "completed"
    | "cancelled";
  currencyCode: string;
  totalAmount?: string | null;
  lineItems: Array<{
    description?: string | null;
    quantity?: string | null;
    unit?: string | null;
    amount?: string | null;
  }>;
  commercialTerms?: string | null;
  plannedDeliveryAt?: string | null;
  confirmedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  updatedAt?: string | null;
};

type FactoryRequirement = {
  id: string;
  referenceCode: string;
  requirementType: string;
  categoryCode: string;
  title: string;
  quantityText?: string | null;
  urgency: string;
  status: string;
  requiredBy?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
};

type FactoryQuote = {
  id: string;
  referenceCode: string;
  requirementId: string;
  requirementReferenceCode?: string | null;
  requirementTitle?: string | null;
  catalogItemName?: string | null;
  status: string;
  currencyCode: string;
  totalAmount?: string | null;
  leadTimeText?: string | null;
  validUntil?: string | null;
  issuedAt?: string | null;
  closedAt?: string | null;
  updatedAt?: string | null;
};

type FactoryDocument = {
  id: string;
  documentType: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  expiresAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type FactoryDocumentGap = {
  documentType: string;
  reason: "verification" | "export" | "certification";
};

type FactoryDashboard = {
  openRequirements: number;
  quotationsAwaitingDecision: number;
  activeOrders: number;
  machineryProjects: number;
  rawMaterialRequests: number;
  sparePartEmergencies: number;
  scheduledDeliveries: number;
  maintenanceRequests: number;
  criticalChallengesWithoutEvidence: number;
  verificationEvidenceToAdd: number;
  documentsOnFile: number;
};

type TechnicalAssetType =
  "production_line" | "machine" | "assembly" | "component";

type MachineTechnicalDetails = {
  brand?: string | null;
  purpose?: string | null;
  countryOfOrigin?: string | null;
  manufactureYear?: string | null;
  installationDate?: string | null;
  powerRating?: string | null;
  capacity?: string | null;
  supplier?: string | null;
  warranty?: string | null;
  maintenanceSchedule?: string | null;
};

type TechnicalAssetDraft = {
  id: string | null;
  assetType: TechnicalAssetType;
  name: string;
  industry: string;
  purpose: string;
  operatingStatus:
    "operational" | "partially_operational" | "maintenance" | "unknown";
  productionLineId: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  machineCategory: string;
  machineId: string;
  assemblyId: string;
  assemblyType: string;
  componentType: string;
  partNumber: string;
  criticality: "standard" | "important" | "critical";
  technicalDetails: Required<MachineTechnicalDetails>;
};

function createTechnicalAssetDraft(
  assetType: TechnicalAssetType = "production_line",
): TechnicalAssetDraft {
  return {
    id: null,
    assetType,
    name: "",
    industry: "",
    purpose: "",
    operatingStatus: "unknown",
    productionLineId: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    machineCategory: "",
    machineId: "",
    assemblyId: "",
    assemblyType: "",
    componentType: "",
    partNumber: "",
    criticality: "standard",
    technicalDetails: {
      brand: "",
      purpose: "",
      countryOfOrigin: "",
      manufactureYear: "",
      installationDate: "",
      powerRating: "",
      capacity: "",
      supplier: "",
      warranty: "",
      maintenanceSchedule: "",
    },
  };
}

type FactoryWorkspace = {
  factory: OwnedFactory & {
    publicDescription?: string | null;
    publicWebsite?: string | null;
    publicEmail?: string | null;
    publicPhone?: string | null;
    publicAddress?: string | null;
    publicCertifications?: string[];
    exportMarkets?: string[];
  };
  productionLines: Array<{
    id: string;
    name: string;
    industry?: string | null;
    operatingStatus: string;
    visibility: string;
    publicSummary?: string | null;
    purpose?: string | null;
  }>;
  machines: Array<{
    id: string;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    machineCategory?: string | null;
    operatingStatus: string;
    visibility: string;
    productionLineId?: string | null;
    technicalDetails?: MachineTechnicalDetails;
  }>;
  assemblies: Array<{
    id: string;
    machineId: string;
    name: string;
    assemblyType?: string | null;
    operatingStatus: string;
    visibility: string;
    publicSummary?: string | null;
  }>;
  components: Array<{
    id: string;
    machineId: string;
    assemblyId?: string | null;
    name: string;
    componentType?: string | null;
    partNumber?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    criticality: string;
    operatingStatus: string;
    visibility: string;
  }>;
  catalog: WorkspaceCatalogItem[];
  requirements: FactoryRequirement[];
  quotes: FactoryQuote[];
  recurringRequirements: RecurringRequirement[];
  challenges: IndustrialChallenge[];
  orders: FactoryOrder[];
  documents: FactoryDocument[];
  documentGaps: FactoryDocumentGap[];
  dashboard: FactoryDashboard;
  relationship: {
    accountManagerAssigned: boolean;
    lastReviewedAt?: string | null;
  };
};

type WorkspaceStatus = {
  kind: "idle" | "loading" | "success" | "error";
  text: string;
};

const FACTORY_WORKSPACE_SECTION_IDS = [
  "factory-overview",
  "factory-commercial",
  "factory-documents",
  "factory-profile",
  "factory-products",
  "factory-technical",
  "factory-part-records",
  "industrial-challenges",
  "factory-recurring",
] as const;

type FactoryWorkspaceSectionId = (typeof FACTORY_WORKSPACE_SECTION_IDS)[number];

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20 dark:border-white/15 dark:bg-[#05070B] dark:text-white dark:placeholder:text-slate-500";
const labelClass = "text-sm font-semibold text-slate-800 dark:text-slate-100";

function messageFor(language: Language, fr: string, en: string) {
  return language === "fr" ? fr : en;
}

function getFactoryWorkspaceNextStep(
  workspace: FactoryWorkspace,
  language: Language,
) {
  if (workspace.dashboard.criticalChallengesWithoutEvidence > 0) {
    return {
      sectionId: "industrial-challenges" as const,
      eyebrow: messageFor(
        language,
        "Priorite operationnelle",
        "Operational priority",
      ),
      title: messageFor(
        language,
        "Completer les preuves du cas critique",
        "Complete the evidence for the critical case",
      ),
      detail: messageFor(
        language,
        "Ajoutez les references, photos ou documents techniques manquants avant toute revue de routage industriel.",
        "Add the missing references, photos, or technical documents before industrial-routing review.",
      ),
      action: messageFor(language, "Ouvrir les defis", "Open challenges"),
    };
  }

  if (workspace.documentGaps.length > 0) {
    return {
      sectionId: "factory-documents" as const,
      eyebrow: messageFor(
        language,
        "Prochaine etape recommandee",
        "Recommended next step",
      ),
      title: messageFor(
        language,
        "Ajouter les preuves necessaires a la revue",
        "Add the evidence needed for review",
      ),
      detail: messageFor(
        language,
        "Les informations de l'usine restent protegees et les changements publics attendent la revue Exportunity.",
        "Factory information stays protected and public changes wait for Exportunity review.",
      ),
      action: messageFor(language, "Ouvrir les documents", "Open documents"),
    };
  }

  if (!workspace.productionLines.length && !workspace.machines.length) {
    return {
      sectionId: "factory-technical" as const,
      eyebrow: messageFor(
        language,
        "Prochaine etape recommandee",
        "Recommended next step",
      ),
      title: messageFor(
        language,
        "Cartographier votre ligne et vos machines",
        "Map your production line and machinery",
      ),
      detail: messageFor(
        language,
        "Commencez par les actifs critiques. Cette base facilite les besoins de pieces, de maintenance et de fabrication sur mesure.",
        "Start with critical assets. This foundation supports part, maintenance, and custom-manufacturing requirements.",
      ),
      action: messageFor(
        language,
        "Ouvrir la base technique",
        "Open technical base",
      ),
    };
  }

  if (!workspace.catalog.length) {
    return {
      sectionId: "factory-products" as const,
      eyebrow: messageFor(
        language,
        "Prochaine etape recommandee",
        "Recommended next step",
      ),
      title: messageFor(
        language,
        "Soumettre votre premiere offre industrielle",
        "Submit your first industrial offering",
      ),
      detail: messageFor(
        language,
        "Ajoutez un produit, un service ou une capacite avec ses informations techniques. Aucune publication n'est automatique.",
        "Add a product, service, or capability with technical information. Nothing is published automatically.",
      ),
      action: messageFor(language, "Ouvrir les offres", "Open offerings"),
    };
  }

  return {
    sectionId: "factory-commercial" as const,
    eyebrow: messageFor(language, "Flux de travail", "Workflow"),
    title: messageFor(
      language,
      "Revoir les besoins et decisions commerciales",
      "Review requirements and commercial decisions",
    ),
    detail: messageFor(
      language,
      "Consultez les besoins rattaches a l'usine, les devis en attente et les commandes actives avant la prochaine decision.",
      "Review factory requirements, pending quotations, and active orders before the next decision.",
    ),
    action: messageFor(
      language,
      "Ouvrir le flux commercial",
      "Open commercial workflow",
    ),
  };
}

function StatusMessage({ status }: { status: WorkspaceStatus }) {
  if (status.kind === "idle") return null;
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        status.kind === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100",
        status.kind === "error" &&
          "border-red-200 bg-red-50 text-red-900 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-100",
        status.kind === "loading" &&
          "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
      )}
    >
      {status.text}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  attention = false,
}: {
  label: string;
  value: number;
  detail?: string;
  attention?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        attention
          ? "border-[#F5A623]/45 bg-[#F5A623]/[0.08] dark:bg-[#F5A623]/[0.12]"
          : "border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.035]",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function isFactoryWorkspaceSectionId(
  value: string,
): value is FactoryWorkspaceSectionId {
  return (FACTORY_WORKSPACE_SECTION_IDS as readonly string[]).includes(value);
}

function FactoryWorkspaceNavigation({
  language,
  activeSection,
  onNavigate,
}: {
  language: Language;
  activeSection: FactoryWorkspaceSectionId;
  onNavigate: (sectionId: FactoryWorkspaceSectionId) => void;
}) {
  const sections = [
    {
      id: "factory-overview" as const,
      label: messageFor(language, "Vue d'ensemble", "Overview"),
      icon: Factory,
    },
    {
      id: "factory-commercial" as const,
      label: messageFor(language, "Commercial", "Commercial"),
      icon: PackageCheck,
    },
    {
      id: "factory-documents" as const,
      label: messageFor(language, "Documents", "Documents"),
      icon: FileCheck2,
    },
    {
      id: "factory-profile" as const,
      label: messageFor(language, "Profil", "Profile"),
      icon: ShieldCheck,
    },
    {
      id: "factory-products" as const,
      label: messageFor(language, "Produits", "Products"),
      icon: PackagePlus,
    },
    {
      id: "factory-technical" as const,
      label: messageFor(language, "Technique", "Technical"),
      icon: Wrench,
    },
    {
      id: "factory-part-records" as const,
      label: messageFor(language, "Numériser une pièce", "Digitize a part"),
      icon: FileCheck2,
    },
    {
      id: "industrial-challenges" as const,
      label: messageFor(language, "Defis", "Challenges"),
      icon: AlertTriangle,
    },
    {
      id: "factory-recurring" as const,
      label: messageFor(language, "Recurrent", "Recurring"),
      icon: ClipboardList,
    },
  ] as const;

  return (
    <nav
      aria-label={messageFor(
        language,
        "Navigation de l'espace usine",
        "Factory workspace navigation",
      )}
      className="sticky top-3 z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/95"
    >
      <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a96f0b]">
          {messageFor(language, "Modules de l'usine", "Factory modules")}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto p-2">
        {sections.map(({ id, label, icon: Icon }) => {
          const active = activeSection === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(id)}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30",
                active
                  ? "border-[#F5A623]/60 bg-[#F5A623]/12 text-slate-950 dark:text-white"
                  : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/[0.05] dark:hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function recurringStatusClass(status: RecurringRequirementStatus) {
  if (status === "active")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-200";
  if (status === "paused")
    return "bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-100";
  if (status === "closed")
    return "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200";
  return "bg-sky-100 text-sky-800 dark:bg-sky-300/15 dark:text-sky-100";
}

function challengeStatusClass(status: IndustrialChallengeStatus) {
  if (status === "resolved")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-200";
  if (status === "declined" || status === "closed")
    return "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200";
  if (status === "sourcing_review" || status === "grouped")
    return "bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-100";
  if (
    status === "engineering_review" ||
    status === "local_manufacturing_review"
  )
    return "bg-violet-100 text-violet-800 dark:bg-violet-300/15 dark:text-violet-100";
  return "bg-sky-100 text-sky-800 dark:bg-sky-300/15 dark:text-sky-100";
}

function challengeStatusLabel(
  language: Language,
  status: IndustrialChallengeStatus,
) {
  const labels: Record<IndustrialChallengeStatus, [string, string]> = {
    submitted: ["Reçu", "Submitted"],
    triaged: ["Qualifié", "Triaged"],
    grouped: ["Regroupé", "Grouped"],
    sourcing_review: ["Étude sourcing", "Sourcing review"],
    engineering_review: ["Étude ingénierie", "Engineering review"],
    local_manufacturing_review: [
      "Étude fabrication locale",
      "Local manufacturing review",
    ],
    resolved: ["Résolu", "Resolved"],
    declined: ["Non retenu", "Declined"],
    closed: ["Clôturé", "Closed"],
  };
  return labels[status][language === "fr" ? 0 : 1];
}

function partRecordStatusClass(status: IndustrialPartRecordStatus) {
  if (status === "validated" || status === "catalog_candidate") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-200";
  }
  if (status === "archived") {
    return "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200";
  }
  if (status === "route_selected" || status === "prototype") {
    return "bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-100";
  }
  if (status === "technical_review" || status === "route_review") {
    return "bg-violet-100 text-violet-800 dark:bg-violet-300/15 dark:text-violet-100";
  }
  return "bg-sky-100 text-sky-800 dark:bg-sky-300/15 dark:text-sky-100";
}

function partRecordStatusLabel(
  language: Language,
  status: IndustrialPartRecordStatus,
) {
  const labels: Record<IndustrialPartRecordStatus, [string, string]> = {
    captured: ["Pièce enregistrée", "Part captured"],
    digitization: ["Numérisation", "Digitization"],
    technical_review: ["Revue technique", "Technical review"],
    route_review: ["Revue d'orientation", "Route review"],
    route_selected: ["Orientation choisie", "Route selected"],
    prototype: ["Prototype", "Prototype"],
    validated: ["Validée", "Validated"],
    catalog_candidate: ["Candidat catalogue", "Catalog candidate"],
    archived: ["Archivée", "Archived"],
  };
  return labels[status][language === "fr" ? 0 : 1];
}

function partRecordDocumentTypeForFile(file: File) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "photo";
  if (/\.(dxf|dwg|step|stp|stl|iges|igs)$/i.test(name)) return "cad";
  if (/\.(pdf|docx)$/i.test(name)) return "drawing";
  if (/\.xlsx$/i.test(name)) return "bom";
  return "other";
}

function technicalEvidenceSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${Math.max(0, Math.trunc(sizeBytes || 0))} B`;
}

function factoryDocumentTypeLabel(language: Language, documentType: string) {
  const labels: Record<string, [string, string]> = {
    registration: ["Immatriculation", "Registration"],
    operating_permit: ["Autorisation d'exploitation", "Operating permit"],
    quality_certificate: ["Certificat qualite", "Quality certificate"],
    technical_specification: [
      "Specification technique",
      "Technical specification",
    ],
    maintenance_record: ["Dossier maintenance", "Maintenance record"],
    export_document: ["Document export", "Export document"],
    other: ["Autre document", "Other document"],
  };
  const value = labels[documentType] || [documentType, documentType];
  return value[language === "fr" ? 0 : 1];
}

function factoryDocumentGapLabel(language: Language, gap: FactoryDocumentGap) {
  if (gap.reason === "export")
    return messageFor(
      language,
      "Ajoutez une piece export pour documenter les marches declares.",
      "Add an export document to support the declared markets.",
    );
  if (gap.reason === "certification")
    return messageFor(
      language,
      "Ajoutez une preuve de certificat pour la certification declaree.",
      "Add certificate evidence for the declared certification.",
    );
  return messageFor(
    language,
    "Ajoutez le document d'immatriculation pour la revue de verification.",
    "Add the registration document for verification review.",
  );
}

function orderStatusClass(status: FactoryOrder["status"]) {
  if (status === "completed")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-200";
  if (status === "cancelled")
    return "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200";
  if (status === "confirmed")
    return "bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-100";
  return "bg-sky-100 text-sky-800 dark:bg-sky-300/15 dark:text-sky-100";
}

function orderStatusLabel(language: Language, status: FactoryOrder["status"]) {
  const labels: Record<FactoryOrder["status"], [string, string]> = {
    confirmed: ["Confirmee", "Confirmed"],
    procurement: ["Approvisionnement", "Procurement"],
    manufacturing: ["Fabrication", "Manufacturing"],
    quality_control: ["Controle qualite", "Quality control"],
    delivery: ["Livraison", "Delivery"],
    completed: ["Terminee", "Completed"],
    cancelled: ["Annulee", "Cancelled"],
  };
  return labels[status][language === "fr" ? 0 : 1];
}

export default function FactoryWorkspacePage({
  language,
  taxonomy,
}: {
  language: Language;
  taxonomy: FactoryWorkspaceTaxonomyCategory[];
}) {
  const { isAuthenticated, token } = useSession();
  const [factories, setFactories] = useState<OwnedFactory[]>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState("");
  const [workspace, setWorkspace] = useState<FactoryWorkspace | null>(null);
  const [loadStatus, setLoadStatus] = useState<WorkspaceStatus>({
    kind: "idle",
    text: "",
  });
  const [profileStatus, setProfileStatus] = useState<WorkspaceStatus>({
    kind: "idle",
    text: "",
  });
  const [catalogStatus, setCatalogStatus] = useState<WorkspaceStatus>({
    kind: "idle",
    text: "",
  });
  const [recurringStatus, setRecurringStatus] = useState<WorkspaceStatus>({
    kind: "idle",
    text: "",
  });
  const [industrialChallengeStatus, setIndustrialChallengeStatus] =
    useState<WorkspaceStatus>({ kind: "idle", text: "" });
  const [partRecords, setPartRecords] = useState<IndustrialPartRecord[]>([]);
  const [partRecordLoadStatus, setPartRecordLoadStatus] =
    useState<WorkspaceStatus>({ kind: "idle", text: "" });
  const [partRecordStatus, setPartRecordStatus] = useState<WorkspaceStatus>({
    kind: "idle",
    text: "",
  });
  const [partRecordDocumentStatus, setPartRecordDocumentStatus] = useState<
    Record<string, WorkspaceStatus>
  >({});
  const [uploadingPartRecordId, setUploadingPartRecordId] = useState<
    string | null
  >(null);
  const [challengeAttachmentStatus, setChallengeAttachmentStatus] = useState<
    Record<string, WorkspaceStatus>
  >({});
  const [uploadingChallengeId, setUploadingChallengeId] = useState<
    string | null
  >(null);
  const [technicalAssetStatus, setTechnicalAssetStatus] =
    useState<WorkspaceStatus>({ kind: "idle", text: "" });
  const [factoryDocumentStatus, setFactoryDocumentStatus] =
    useState<WorkspaceStatus>({ kind: "idle", text: "" });
  const [factoryDocumentFile, setFactoryDocumentFile] = useState<File | null>(
    null,
  );
  const [archivingFactoryDocumentId, setArchivingFactoryDocumentId] = useState<
    string | null
  >(null);
  const [activeWorkspaceSection, setActiveWorkspaceSection] =
    useState<FactoryWorkspaceSectionId>("factory-overview");
  const [profileDraft, setProfileDraft] = useState({
    displayName: "",
    publicDescription: "",
    publicWebsite: "",
    publicEmail: "",
    publicPhone: "",
  });
  const [factoryDocumentDraft, setFactoryDocumentDraft] = useState({
    documentType: "registration",
    title: "",
    expiresAt: "",
  });
  const [catalogDraft, setCatalogDraft] = useState({
    classification: "export_ready_factory_product",
    categoryCode: "",
    name: "",
    publicDescription: "",
    minimumOrderQuantity: "",
    leadTimeText: "",
  });
  const [recurringDraft, setRecurringDraft] = useState({
    requirementType: "raw_material" as RecurringRequirement["requirementType"],
    categoryCode: "",
    machineId: "",
    assemblyId: "",
    componentId: "",
    title: "",
    details: "",
    quantityText: "",
    frequency: "monthly",
    reorderThreshold: "",
    preferredDeliveryDate: "",
    preferredSupplier: "",
    alternativeSupplier: "",
    priceAgreementPeriod: "",
    contractStartAt: "",
    contractEndAt: "",
    approvalWorkflow: "factory_owner_approval",
    approvalRequired: true,
    status: "draft" as RecurringRequirementStatus,
    nextReviewAt: "",
    internalNotes: "",
  });
  const [industrialChallengeDraft, setIndustrialChallengeDraft] = useState({
    requirementType: "spare_part" as IndustrialChallengeRequirementType,
    categoryCode: "",
    machineId: "",
    assemblyId: "",
    componentId: "",
    title: "",
    details: "",
    problemType: "recurring_component_failure",
    productionStopped: false,
    impactText: "",
    recurrenceFrequency: "",
    estimatedDowntime: "",
    currentWorkaround: "",
    desiredOutcome: "review_required" as IndustrialChallengeOutcome,
    urgency: "standard" as IndustrialChallenge["urgency"],
  });
  const [partRecordDraft, setPartRecordDraft] = useState({
    requirementType: "spare_part" as IndustrialChallengeRequirementType,
    categoryCode: "",
    machineId: "",
    assemblyId: "",
    componentId: "",
    title: "",
    partNumber: "",
    technicalDetails: "",
    material: "",
    dimensionsText: "",
    weightText: "",
    application: "",
    currentSource: "",
    demandSignalText: "",
    urgency: "standard" as IndustrialChallenge["urgency"],
  });
  const [technicalAssetDraft, setTechnicalAssetDraft] =
    useState<TechnicalAssetDraft>(() => createTechnicalAssetDraft());

  const authHeaders = useMemo<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    if (token) next.Authorization = `Bearer ${token}`;
    return next;
  }, [token]);
  const headers = useMemo<Record<string, string>>(
    () => ({
      "content-type": "application/json",
      ...authHeaders,
    }),
    [authHeaders],
  );

  const navigateWorkspaceSection = useCallback(
    (
      sectionId: FactoryWorkspaceSectionId,
      behavior: ScrollBehavior = "smooth",
    ) => {
      if (typeof window === "undefined") return;
      setActiveWorkspaceSection(sectionId);
      window.history.replaceState(null, "", `#${sectionId}`);
      window.document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior, block: "start" });
    },
    [],
  );

  useEffect(() => {
    if (!workspace || typeof window === "undefined") return;

    const requestedSection = window.location.hash.replace(/^#/, "");
    if (!isFactoryWorkspaceSectionId(requestedSection)) {
      setActiveWorkspaceSection("factory-overview");
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      navigateWorkspaceSection(requestedSection, "auto");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [navigateWorkspaceSection, workspace?.factory.id]);

  useEffect(() => {
    if (
      !workspace ||
      typeof window === "undefined" ||
      typeof window.IntersectionObserver === "undefined"
    ) {
      return;
    }

    const targets = FACTORY_WORKSPACE_SECTION_IDS.map((sectionId) =>
      window.document.getElementById(sectionId),
    ).filter((target): target is HTMLElement => Boolean(target));
    if (!targets.length) return;

    const observer = new window.IntersectionObserver(
      (entries) => {
        const nextSection = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio,
          )[0];
        if (nextSection && isFactoryWorkspaceSectionId(nextSection.target.id)) {
          setActiveWorkspaceSection(nextSection.target.id);
        }
      },
      { rootMargin: "-14% 0px -70% 0px", threshold: [0, 0.2, 0.45] },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [workspace?.factory.id]);

  const categoriesForClassification = useMemo(
    () =>
      taxonomy.filter(
        (category) => category.classification === catalogDraft.classification,
      ),
    [catalogDraft.classification, taxonomy],
  );
  const recurringCategories = useMemo(
    () =>
      taxonomy.filter(
        (category) =>
          category.classification === recurringDraft.requirementType,
      ),
    [recurringDraft.requirementType, taxonomy],
  );
  const challengeCategories = useMemo(
    () =>
      taxonomy.filter(
        (category) =>
          category.classification === industrialChallengeDraft.requirementType,
      ),
    [industrialChallengeDraft.requirementType, taxonomy],
  );
  const partRecordCategories = useMemo(
    () =>
      taxonomy.filter(
        (category) =>
          category.classification === partRecordDraft.requirementType ||
          (partRecordDraft.requirementType === "custom_manufacturing" &&
            category.classification === "spare_part"),
      ),
    [partRecordDraft.requirementType, taxonomy],
  );

  const loadPartRecords = async (factoryId: string) => {
    if (!token || !factoryId) return;
    setPartRecordLoadStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Chargement des dossiers techniques de pièces...",
        "Loading technical part records...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${factoryId}/part-records`,
        { headers, credentials: "include" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Les dossiers techniques de pièces sont indisponibles.",
              "Technical part records are unavailable.",
            ),
        );
      }
      setPartRecords(
        Array.isArray(payload.partRecords)
          ? (payload.partRecords as IndustrialPartRecord[])
          : [],
      );
      setPartRecordLoadStatus({ kind: "idle", text: "" });
    } catch (error: any) {
      setPartRecords([]);
      setPartRecordLoadStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Les dossiers techniques de pièces sont indisponibles.",
              "Technical part records are unavailable.",
            ),
        ),
      });
    }
  };

  const loadWorkspace = async (factoryId: string) => {
    if (!token || !factoryId) return;
    setLoadStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Chargement de l'espace usine...",
        "Loading the factory workspace...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${factoryId}/workspace`,
        { headers, credentials: "include" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok)
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "L'espace usine est indisponible.",
              "The factory workspace is unavailable.",
            ),
        );
      const nextWorkspace = payload as FactoryWorkspace & { ok: true };
      setWorkspace(nextWorkspace);
      setProfileDraft({
        displayName: nextWorkspace.factory.displayName || "",
        publicDescription: nextWorkspace.factory.publicDescription || "",
        publicWebsite: nextWorkspace.factory.publicWebsite || "",
        publicEmail: nextWorkspace.factory.publicEmail || "",
        publicPhone: nextWorkspace.factory.publicPhone || "",
      });
      void loadPartRecords(factoryId);
      setLoadStatus({ kind: "idle", text: "" });
    } catch (error: any) {
      setWorkspace(null);
      setPartRecords([]);
      setLoadStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "L'espace usine est indisponible.",
              "The factory workspace is unavailable.",
            ),
        ),
      });
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let active = true;
    setLoadStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Chargement de vos usines...",
        "Loading your factories...",
      ),
    });
    fetch("/api/industrial/me/factories", { headers, credentials: "include" })
      .then(async (response) => ({
        response,
        payload: await response.json().catch(() => null),
      }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok || !payload?.ok)
          throw new Error(
            payload?.message ||
              messageFor(
                language,
                "Vos usines sont indisponibles.",
                "Your factories are unavailable.",
              ),
          );
        const owned = Array.isArray(payload.factories)
          ? (payload.factories as OwnedFactory[])
          : [];
        setFactories(owned);
        setSelectedFactoryId((current) =>
          current && owned.some((factory) => factory.id === current)
            ? current
            : owned[0]?.id || "",
        );
        setLoadStatus({ kind: "idle", text: "" });
      })
      .catch((error: any) => {
        if (!active) return;
        setLoadStatus({
          kind: "error",
          text: String(
            error?.message ||
              messageFor(
                language,
                "Vos usines sont indisponibles.",
                "Your factories are unavailable.",
              ),
          ),
        });
      });
    return () => {
      active = false;
    };
  }, [headers, isAuthenticated, language, token]);

  useEffect(() => {
    if (selectedFactoryId) void loadWorkspace(selectedFactoryId);
  }, [selectedFactoryId]);

  useEffect(() => {
    if (
      categoriesForClassification.some(
        (category) => category.code === catalogDraft.categoryCode,
      )
    )
      return;
    setCatalogDraft((current) => ({
      ...current,
      categoryCode: categoriesForClassification[0]?.code || "",
    }));
  }, [catalogDraft.categoryCode, categoriesForClassification]);

  useEffect(() => {
    if (
      recurringCategories.some(
        (category) => category.code === recurringDraft.categoryCode,
      )
    )
      return;
    setRecurringDraft((current) => ({
      ...current,
      categoryCode: recurringCategories[0]?.code || "",
    }));
  }, [recurringCategories, recurringDraft.categoryCode]);

  useEffect(() => {
    if (
      challengeCategories.some(
        (category) => category.code === industrialChallengeDraft.categoryCode,
      )
    )
      return;
    setIndustrialChallengeDraft((current) => ({
      ...current,
      categoryCode: challengeCategories[0]?.code || "",
    }));
  }, [challengeCategories, industrialChallengeDraft.categoryCode]);

  useEffect(() => {
    if (
      partRecordCategories.some(
        (category) => category.code === partRecordDraft.categoryCode,
      )
    )
      return;
    setPartRecordDraft((current) => ({
      ...current,
      categoryCode: partRecordCategories[0]?.code || "",
    }));
  }, [partRecordCategories, partRecordDraft.categoryCode]);

  const startTechnicalAssetEdit = (
    assetType: TechnicalAssetType,
    asset: any,
  ) => {
    const draft = createTechnicalAssetDraft(assetType);
    if (assetType === "production_line") {
      setTechnicalAssetDraft({
        ...draft,
        id: asset.id,
        name: asset.name || "",
        industry: asset.industry || "",
        purpose: asset.purpose || "",
        operatingStatus: asset.operatingStatus || "unknown",
      });
      return;
    }
    if (assetType === "machine") {
      setTechnicalAssetDraft({
        ...draft,
        id: asset.id,
        name: asset.name || "",
        productionLineId: asset.productionLineId || "",
        manufacturer: asset.manufacturer || "",
        model: asset.model || "",
        serialNumber: asset.serialNumber || "",
        machineCategory: asset.machineCategory || "",
        operatingStatus: asset.operatingStatus || "unknown",
        technicalDetails: {
          ...draft.technicalDetails,
          ...(asset.technicalDetails || {}),
        },
      });
      return;
    }
    if (assetType === "assembly") {
      setTechnicalAssetDraft({
        ...draft,
        id: asset.id,
        name: asset.name || "",
        machineId: asset.machineId || "",
        assemblyType: asset.assemblyType || "",
        operatingStatus: asset.operatingStatus || "unknown",
      });
      return;
    }
    setTechnicalAssetDraft({
      ...draft,
      id: asset.id,
      name: asset.name || "",
      machineId: asset.machineId || "",
      assemblyId: asset.assemblyId || "",
      componentType: asset.componentType || "",
      partNumber: asset.partNumber || "",
      manufacturer: asset.manufacturer || "",
      model: asset.model || "",
      criticality: asset.criticality || "standard",
      operatingStatus: asset.operatingStatus || "unknown",
    });
  };

  const submitTechnicalAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace) return;
    if (
      ["assembly", "component"].includes(technicalAssetDraft.assetType) &&
      !technicalAssetDraft.machineId
    ) {
      setTechnicalAssetStatus({
        kind: "error",
        text: messageFor(
          language,
          "Selectionnez la machine parente.",
          "Select the parent machine.",
        ),
      });
      return;
    }
    const updating = Boolean(technicalAssetDraft.id);
    setTechnicalAssetStatus({
      kind: "loading",
      text: messageFor(
        language,
        updating
          ? "Mise a jour de l'actif technique..."
          : "Ajout de l'actif technique...",
        updating
          ? "Updating the technical asset..."
          : "Adding the technical asset...",
      ),
    });
    try {
      const assetId = technicalAssetDraft.id;
      const response = await fetch(
        assetId
          ? `/api/industrial/me/factories/${workspace.factory.id}/technical-assets/${assetId}`
          : `/api/industrial/me/factories/${workspace.factory.id}/technical-assets`,
        {
          method: assetId ? "PATCH" : "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            ...technicalAssetDraft,
            productionLineId: technicalAssetDraft.productionLineId || null,
            machineId: technicalAssetDraft.machineId || null,
            assemblyId: technicalAssetDraft.assemblyId || null,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok)
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "L'actif technique n'a pas pu etre enregistre.",
              "The technical asset could not be saved.",
            ),
        );
      setTechnicalAssetStatus({
        kind: "success",
        text:
          payload.message ||
          messageFor(
            language,
            "Actif technique enregistre. Il reste prive par defaut.",
            "Technical asset saved. It remains private by default.",
          ),
      });
      setTechnicalAssetDraft(
        createTechnicalAssetDraft(technicalAssetDraft.assetType),
      );
      await loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setTechnicalAssetStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "L'actif technique n'a pas pu etre enregistre.",
              "The technical asset could not be saved.",
            ),
        ),
      });
    }
  };

  const updateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace) return;
    setProfileStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Mise a jour du profil public...",
        "Updating the public profile...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/public-profile`,
        {
          method: "PATCH",
          headers,
          credentials: "include",
          body: JSON.stringify(profileDraft),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok)
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le profil public n'a pas pu etre mis a jour.",
              "The public profile could not be updated.",
            ),
        );
      setProfileStatus({
        kind: "success",
        text:
          payload.message ||
          messageFor(
            language,
            "Profil public mis a jour. Le statut de verification ne change pas.",
            "Public profile updated. Verification status was not changed.",
          ),
      });
      await loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setProfileStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Le profil public n'a pas pu etre mis a jour.",
              "The public profile could not be updated.",
            ),
        ),
      });
    }
  };

  const submitCatalogItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace || !catalogDraft.categoryCode) return;
    setCatalogStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Envoi du produit pour revue...",
        "Sending the product for review...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/catalog`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            classification: catalogDraft.classification,
            categoryCode: catalogDraft.categoryCode,
            name: catalogDraft.name,
            publicDescription: catalogDraft.publicDescription || null,
            supplyModes: [],
            priceMode: "request_quotation",
            availabilityStatus: "subject_to_confirmation",
            technicalSpecifications: {},
            compatibleMachinery: [],
            minimumOrderQuantity: catalogDraft.minimumOrderQuantity || null,
            leadTimeText: catalogDraft.leadTimeText || null,
            certifications: [],
            publicMedia: [],
            privateMetadata: {},
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok)
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le produit n'a pas pu etre envoye en revue.",
              "The product could not be sent for review.",
            ),
        );
      setCatalogDraft((current) => ({
        ...current,
        name: "",
        publicDescription: "",
        minimumOrderQuantity: "",
        leadTimeText: "",
      }));
      setCatalogStatus({
        kind: "success",
        text:
          payload.message ||
          messageFor(
            language,
            "Produit envoye pour revue. Il ne sera pas public avant validation.",
            "Product submitted for review. It will not be public before approval.",
          ),
      });
      await loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setCatalogStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Le produit n'a pas pu etre envoye en revue.",
              "The product could not be sent for review.",
            ),
        ),
      });
    }
  };

  const submitRecurringRequirement = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!workspace || !recurringDraft.categoryCode) return;
    setRecurringStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Enregistrement du plan d'approvisionnement recurrent...",
        "Saving the recurring procurement plan...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/recurring-requirements`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(recurringDraft),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok)
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le plan d'approvisionnement n'a pas pu etre enregistre.",
              "The procurement plan could not be saved.",
            ),
        );
      setRecurringDraft((current) => ({
        ...current,
        machineId: "",
        assemblyId: "",
        componentId: "",
        title: "",
        details: "",
        quantityText: "",
        reorderThreshold: "",
        preferredDeliveryDate: "",
        preferredSupplier: "",
        alternativeSupplier: "",
        priceAgreementPeriod: "",
        contractStartAt: "",
        contractEndAt: "",
        nextReviewAt: "",
        internalNotes: "",
        status: "draft",
      }));
      setRecurringStatus({
        kind: "success",
        text:
          payload.message ||
          messageFor(
            language,
            "Plan recurrent enregistre. Aucune commande n'a ete creee.",
            "Recurring plan saved. No order was created.",
          ),
      });
      await loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setRecurringStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Le plan d'approvisionnement n'a pas pu etre enregistre.",
              "The procurement plan could not be saved.",
            ),
        ),
      });
    }
  };

  const submitPartRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace || !partRecordDraft.categoryCode) return;
    setPartRecordStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Création du dossier technique pour revue contrôlée...",
        "Creating the technical record for controlled review...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/part-records`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(partRecordDraft),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le dossier technique n'a pas pu être créé.",
              "The technical part record could not be created.",
            ),
        );
      }
      setPartRecordDraft((current) => ({
        ...current,
        machineId: "",
        assemblyId: "",
        componentId: "",
        title: "",
        partNumber: "",
        technicalDetails: "",
        material: "",
        dimensionsText: "",
        weightText: "",
        application: "",
        currentSource: "",
        demandSignalText: "",
        urgency: "standard",
      }));
      setPartRecordStatus({
        kind: "success",
        text:
          payload.message ||
          messageFor(
            language,
            "Dossier technique créé. Aucun contact fournisseur, devis, commande, production ou paiement n'a été créé.",
            "Technical record created. No supplier contact, quotation, order, production job, or payment was created.",
          ),
      });
      await loadPartRecords(workspace.factory.id);
      void loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setPartRecordStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Le dossier technique n'a pas pu être créé.",
              "The technical part record could not be created.",
            ),
        ),
      });
    }
  };

  const uploadPartRecordDocument = async (
    partRecord: IndustrialPartRecord,
    file: File | null,
  ) => {
    if (!workspace || !file) return;
    setUploadingPartRecordId(partRecord.id);
    setPartRecordDocumentStatus((current) => ({
      ...current,
      [partRecord.id]: {
        kind: "loading",
        text: messageFor(
          language,
          "Enregistrement privé de la preuve technique...",
          "Storing the technical evidence privately...",
        ),
      },
    }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", partRecordDocumentTypeForFile(file));
      formData.append("title", file.name.slice(0, 240));
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/part-records/${partRecord.id}/documents`,
        {
          method: "POST",
          headers: authHeaders,
          credentials: "include",
          body: formData,
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le document technique n'a pas pu être enregistré.",
              "The technical document could not be stored.",
            ),
        );
      }
      setPartRecordDocumentStatus((current) => ({
        ...current,
        [partRecord.id]: {
          kind: "success",
          text:
            payload.message ||
            messageFor(
              language,
              "Preuve technique ajoutée au dossier privé.",
              "Technical evidence added to the private record.",
            ),
        },
      }));
      await loadPartRecords(workspace.factory.id);
    } catch (error: any) {
      setPartRecordDocumentStatus((current) => ({
        ...current,
        [partRecord.id]: {
          kind: "error",
          text: String(
            error?.message ||
              messageFor(
                language,
                "Le document technique n'a pas pu être enregistré.",
                "The technical document could not be stored.",
              ),
          ),
        },
      }));
    } finally {
      setUploadingPartRecordId(null);
    }
  };

  const downloadPartRecordDocument = async (
    partRecord: IndustrialPartRecord,
    documentRecord: IndustrialPartRecordDocument,
  ) => {
    if (!workspace) return;
    setPartRecordDocumentStatus((current) => ({
      ...current,
      [partRecord.id]: {
        kind: "loading",
        text: messageFor(
          language,
          "Préparation du téléchargement sécurisé...",
          "Preparing the secure download...",
        ),
      },
    }));
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/part-records/${partRecord.id}/documents/${documentRecord.id}/download`,
        { headers: authHeaders, credentials: "include" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le document technique est indisponible.",
              "The technical document is unavailable.",
            ),
        );
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = documentRecord.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setPartRecordDocumentStatus((current) => ({
        ...current,
        [partRecord.id]: { kind: "idle", text: "" },
      }));
    } catch (error: any) {
      setPartRecordDocumentStatus((current) => ({
        ...current,
        [partRecord.id]: {
          kind: "error",
          text: String(
            error?.message ||
              messageFor(
                language,
                "Le document technique est indisponible.",
                "The technical document is unavailable.",
              ),
          ),
        },
      }));
    }
  };

  const submitIndustrialChallenge = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!workspace || !industrialChallengeDraft.categoryCode) return;
    setIndustrialChallengeStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Transmission du défi industriel pour revue contrôlée...",
        "Submitting the industrial challenge for controlled review...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/challenges`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(industrialChallengeDraft),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le défi industriel n'a pas pu être transmis.",
              "The industrial challenge could not be submitted.",
            ),
        );
      }
      setIndustrialChallengeDraft((current) => ({
        ...current,
        machineId: "",
        assemblyId: "",
        componentId: "",
        title: "",
        details: "",
        impactText: "",
        recurrenceFrequency: "",
        estimatedDowntime: "",
        currentWorkaround: "",
        productionStopped: false,
        desiredOutcome: "review_required",
        urgency: "standard",
      }));
      setIndustrialChallengeStatus({
        kind: "success",
        text:
          payload.message ||
          messageFor(
            language,
            "Défi transmis. Aucun message fournisseur, devis, commande ou paiement n'a été créé.",
            "Challenge submitted. No supplier message, quotation, order, or payment was created.",
          ),
      });
      await loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setIndustrialChallengeStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Le défi industriel n'a pas pu être transmis.",
              "The industrial challenge could not be submitted.",
            ),
        ),
      });
    }
  };

  const uploadChallengeAttachment = async (
    challenge: IndustrialChallenge,
    file: File | null,
  ) => {
    if (!workspace || !file) return;
    setUploadingChallengeId(challenge.id);
    setChallengeAttachmentStatus((current) => ({
      ...current,
      [challenge.id]: {
        kind: "loading",
        text: messageFor(
          language,
          "Enregistrement prive du document technique...",
          "Storing the technical document privately...",
        ),
      },
    }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/challenges/${challenge.id}/attachments`,
        {
          method: "POST",
          headers: authHeaders,
          credentials: "include",
          body: formData,
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le document technique n'a pas pu etre enregistre.",
              "The technical document could not be stored.",
            ),
        );
      }
      setChallengeAttachmentStatus((current) => ({
        ...current,
        [challenge.id]: {
          kind: "success",
          text:
            payload.message ||
            messageFor(
              language,
              "Document technique ajoute a la revue privee.",
              "Technical document added to the private review.",
            ),
        },
      }));
      await loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setChallengeAttachmentStatus((current) => ({
        ...current,
        [challenge.id]: {
          kind: "error",
          text: String(
            error?.message ||
              messageFor(
                language,
                "Le document technique n'a pas pu etre enregistre.",
                "The technical document could not be stored.",
              ),
          ),
        },
      }));
    } finally {
      setUploadingChallengeId(null);
    }
  };

  const downloadChallengeAttachment = async (
    challenge: IndustrialChallenge,
    attachment: IndustrialChallengeAttachment,
  ) => {
    if (!workspace) return;
    setChallengeAttachmentStatus((current) => ({
      ...current,
      [challenge.id]: {
        kind: "loading",
        text: messageFor(
          language,
          "Preparation du telechargement securise...",
          "Preparing the secure download...",
        ),
      },
    }));
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/challenges/${challenge.id}/attachments/${attachment.id}/download`,
        { headers: authHeaders, credentials: "include" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le document technique est indisponible.",
              "The technical document is unavailable.",
            ),
        );
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setChallengeAttachmentStatus((current) => ({
        ...current,
        [challenge.id]: { kind: "idle", text: "" },
      }));
    } catch (error: any) {
      setChallengeAttachmentStatus((current) => ({
        ...current,
        [challenge.id]: {
          kind: "error",
          text: String(
            error?.message ||
              messageFor(
                language,
                "Le document technique est indisponible.",
                "The technical document is unavailable.",
              ),
          ),
        },
      }));
    }
  };

  const uploadFactoryDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || !factoryDocumentFile) {
      setFactoryDocumentStatus({
        kind: "error",
        text: messageFor(
          language,
          "Choisissez un document avant de l'enregistrer.",
          "Choose a document before storing it.",
        ),
      });
      return;
    }
    setFactoryDocumentStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Enregistrement prive du document de l'usine...",
        "Storing the factory document privately...",
      ),
    });
    try {
      const formData = new FormData();
      formData.append("file", factoryDocumentFile);
      formData.append("documentType", factoryDocumentDraft.documentType);
      formData.append("title", factoryDocumentDraft.title);
      if (factoryDocumentDraft.expiresAt)
        formData.append("expiresAt", factoryDocumentDraft.expiresAt);
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/documents`,
        {
          method: "POST",
          headers: authHeaders,
          credentials: "include",
          body: formData,
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le document de l'usine n'a pas pu etre enregistre.",
              "The factory document could not be stored.",
            ),
        );
      }
      setFactoryDocumentFile(null);
      setFactoryDocumentDraft({
        documentType: "registration",
        title: "",
        expiresAt: "",
      });
      setFactoryDocumentStatus({
        kind: "success",
        text:
          payload.message ||
          messageFor(
            language,
            "Document de l'usine ajoute au registre prive.",
            "Factory document added to the private register.",
          ),
      });
      await loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setFactoryDocumentStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Le document de l'usine n'a pas pu etre enregistre.",
              "The factory document could not be stored.",
            ),
        ),
      });
    }
  };

  const downloadFactoryDocument = async (factoryDocument: FactoryDocument) => {
    if (!workspace) return;
    setFactoryDocumentStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Preparation du telechargement securise...",
        "Preparing the secure download...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/documents/${factoryDocument.id}/download`,
        { headers: authHeaders, credentials: "include" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le document de l'usine est indisponible.",
              "The factory document is unavailable.",
            ),
        );
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = factoryDocument.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setFactoryDocumentStatus({ kind: "idle", text: "" });
    } catch (error: any) {
      setFactoryDocumentStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Le document de l'usine est indisponible.",
              "The factory document is unavailable.",
            ),
        ),
      });
    }
  };

  const archiveFactoryDocument = async (factoryDocument: FactoryDocument) => {
    if (!workspace) return;
    setArchivingFactoryDocumentId(factoryDocument.id);
    setFactoryDocumentStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Archivage du document de l'usine...",
        "Archiving the factory document...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/documents/${factoryDocument.id}`,
        {
          method: "DELETE",
          headers: authHeaders,
          credentials: "include",
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le document de l'usine n'a pas pu etre archive.",
              "The factory document could not be archived.",
            ),
        );
      }
      setFactoryDocumentStatus({
        kind: "success",
        text:
          payload.message ||
          messageFor(
            language,
            "Document archive du registre actif.",
            "Document archived from the active register.",
          ),
      });
      await loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setFactoryDocumentStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Le document de l'usine n'a pas pu etre archive.",
              "The factory document could not be archived.",
            ),
        ),
      });
    } finally {
      setArchivingFactoryDocumentId(null);
    }
  };

  const updateRecurringRequirementStatus = async (
    requirement: RecurringRequirement,
    status: RecurringRequirementStatus,
  ) => {
    if (!workspace) return;
    setRecurringStatus({
      kind: "loading",
      text: messageFor(
        language,
        "Mise a jour du plan recurrent...",
        "Updating the recurring plan...",
      ),
    });
    try {
      const response = await fetch(
        `/api/industrial/me/factories/${workspace.factory.id}/recurring-requirements/${requirement.id}`,
        {
          method: "PATCH",
          headers,
          credentials: "include",
          body: JSON.stringify({ status }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok)
        throw new Error(
          payload?.message ||
            messageFor(
              language,
              "Le plan recurrent n'a pas pu etre mis a jour.",
              "The recurring plan could not be updated.",
            ),
        );
      setRecurringStatus({
        kind: "success",
        text:
          payload.message ||
          messageFor(
            language,
            "Plan recurrent mis a jour. Aucune commande n'a ete creee.",
            "Recurring plan updated. No order was created.",
          ),
      });
      await loadWorkspace(workspace.factory.id);
    } catch (error: any) {
      setRecurringStatus({
        kind: "error",
        text: String(
          error?.message ||
            messageFor(
              language,
              "Le plan recurrent n'a pas pu etre mis a jour.",
              "The recurring plan could not be updated.",
            ),
        ),
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-9">
        <ShieldCheck className="h-8 w-8 text-[#a96f0b]" />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#a96f0b]">
          {messageFor(language, "Espace propriétaire", "Owner workspace")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {messageFor(
            language,
            "Gérez votre usine après vérification",
            "Manage your factory after verification",
          )}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          {messageFor(
            language,
            "Connectez-vous avec le compte approuvé pour votre usine. Les informations de production, les produits soumis et les statuts restent privés tant qu'Exportunity ne les publie pas après revue.",
            "Sign in with the approved account for your factory. Production information, submitted products, and statuses remain private until Exportunity publishes them after review.",
          )}
        </p>
        <Link
          href="/login?next=%2Fmy-factory"
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
        >
          <ArrowRight className="h-4 w-4" />
          {messageFor(language, "Se connecter", "Sign in")}
        </Link>
      </section>
    );
  }

  if (!factories.length && loadStatus.kind !== "loading") {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-9">
        <Factory className="h-8 w-8 text-[#a96f0b]" />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#a96f0b]">
          {messageFor(language, "Espace propriétaire", "Owner workspace")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {messageFor(
            language,
            "Aucune usine liée à ce compte",
            "No factory is linked to this account",
          )}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          {messageFor(
            language,
            "Enregistrez une usine ou demandez la propriété d'un profil vérifié. L'accès est ajouté seulement après revue par Exportunity.",
            "Register a factory or claim a verified profile. Access is added only after Exportunity review.",
          )}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/factories/register"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
          >
            <Factory className="h-4 w-4" />
            {messageFor(
              language,
              "Enregistrer une usine",
              "Register a factory",
            )}
          </Link>
          <Link
            href="/factories"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-[#05070B] dark:text-white dark:hover:bg-white/10"
          >
            <ShieldCheck className="h-4 w-4" />
            {messageFor(
              language,
              "Trouver un profil à revendiquer",
              "Find a profile to claim",
            )}
          </Link>
        </div>
        <div className="mt-5">
          <StatusMessage status={loadStatus} />
        </div>
      </section>
    );
  }

  const factoryNextStep = workspace
    ? getFactoryWorkspaceNextStep(workspace, language)
    : null;

  return (
    <section className="space-y-7">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a96f0b]">
              {messageFor(language, "Espace propriétaire", "Owner workspace")}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {messageFor(language, "Mon usine", "My factory")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              {messageFor(
                language,
                "Suivez les informations publiques, les produits soumis et les capacités de votre usine. Les changements publics et les nouveaux produits restent contrôlés par le processus Exportunity.",
                "Manage your public details, submitted products, and factory capabilities. Public changes and new products remain controlled by the Exportunity review process.",
              )}
            </p>
          </div>
          <div className="min-w-[240px]">
            {factories.length > 1 ? (
              <>
                <label className={labelClass}>
                  {messageFor(language, "Usine active", "Active factory")}
                </label>
                <select
                  value={selectedFactoryId}
                  onChange={(event) => setSelectedFactoryId(event.target.value)}
                  className={inputClass}
                >
                  {factories.map((factory) => (
                    <option key={factory.id} value={factory.id}>
                      {factory.displayName}
                    </option>
                  ))}
                </select>
              </>
            ) : workspace ? (
              <div className="rounded-xl border border-[#F5A623]/35 bg-[#F5A623]/10 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a96f0b]">
                  {messageFor(language, "Usine gérée", "Managed factory")}
                </p>
                <p className="mt-1 font-semibold text-slate-950 dark:text-white">
                  {workspace.factory.displayName}
                </p>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-5">
          <StatusMessage status={loadStatus} />
        </div>
      </div>

      {workspace ? (
        <>
          <FactoryWorkspaceNavigation
            language={language}
            activeSection={activeWorkspaceSection}
            onNavigate={navigateWorkspaceSection}
          />

          {factoryNextStep ? (
            <section className="flex flex-col gap-4 rounded-2xl border border-[#F5A623]/35 bg-[#F5A623]/[0.08] p-5 dark:bg-[#F5A623]/[0.12] sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#865400] dark:text-[#F5A623]">
                  {factoryNextStep.eyebrow}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                  {factoryNextStep.title}
                </h2>
                <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-700 dark:text-slate-200">
                  {factoryNextStep.detail}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigateWorkspaceSection(factoryNextStep.sectionId)
                }
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#F5A623] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] focus:outline-none focus:ring-2 focus:ring-[#F5A623]/35"
              >
                {factoryNextStep.action}
                <ArrowRight className="h-4 w-4" />
              </button>
            </section>
          ) : null}

          <section
            id="factory-overview"
            aria-labelledby="factory-operations-heading"
            className="scroll-mt-28"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                  {messageFor(
                    language,
                    "Vue operationnelle",
                    "Operational view",
                  )}
                </p>
                <h2
                  id="factory-operations-heading"
                  className="mt-1 text-xl font-semibold text-slate-950 dark:text-white"
                >
                  {messageFor(
                    language,
                    "Ce qui demande une decision",
                    "What needs a decision",
                  )}
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {messageFor(
                  language,
                  "Ces indicateurs sont calcules a partir de vos besoins, devis, commandes, defis et documents enregistres.",
                  "These indicators are calculated from your recorded requirements, quotations, orders, challenges, and documents.",
                )}
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              <Metric
                label={messageFor(
                  language,
                  "Besoins ouverts",
                  "Open requirements",
                )}
                value={workspace.dashboard.openRequirements}
              />
              <Metric
                label={messageFor(
                  language,
                  "Devis en attente de decision",
                  "Quotations awaiting decision",
                )}
                value={workspace.dashboard.quotationsAwaitingDecision}
              />
              <Metric
                label={messageFor(
                  language,
                  "Commandes actives",
                  "Active orders",
                )}
                value={workspace.dashboard.activeOrders}
              />
              <Metric
                label={messageFor(
                  language,
                  "Projets machines",
                  "Machinery projects",
                )}
                value={workspace.dashboard.machineryProjects}
              />
              <Metric
                label={messageFor(
                  language,
                  "Demandes matieres premieres",
                  "Raw-material requests",
                )}
                value={workspace.dashboard.rawMaterialRequests}
              />
              <Metric
                label={messageFor(
                  language,
                  "Urgences pieces detachees",
                  "Spare-part emergencies",
                )}
                value={workspace.dashboard.sparePartEmergencies}
                attention={workspace.dashboard.sparePartEmergencies > 0}
              />
              <Metric
                label={messageFor(
                  language,
                  "Livraisons programmees",
                  "Scheduled deliveries",
                )}
                value={workspace.dashboard.scheduledDeliveries}
              />
              <Metric
                label={messageFor(
                  language,
                  "Demandes maintenance",
                  "Maintenance requests",
                )}
                value={workspace.dashboard.maintenanceRequests}
              />
              <Metric
                label={messageFor(
                  language,
                  "Cas critiques sans preuve",
                  "Critical cases without evidence",
                )}
                value={workspace.dashboard.criticalChallengesWithoutEvidence}
                attention={
                  workspace.dashboard.criticalChallengesWithoutEvidence > 0
                }
              />
              <Metric
                label={messageFor(
                  language,
                  "Preuves de verification a ajouter",
                  "Verification evidence to add",
                )}
                value={workspace.dashboard.verificationEvidenceToAdd}
                detail={messageFor(
                  language,
                  `${workspace.dashboard.documentsOnFile} document(s) actif(s)`,
                  `${workspace.dashboard.documentsOnFile} active document(s)`,
                )}
                attention={workspace.dashboard.verificationEvidenceToAdd > 0}
              />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Metric
                label={messageFor(language, "Produits", "Products")}
                value={workspace.catalog.length}
              />
              <Metric
                label={messageFor(
                  language,
                  "Lignes de production",
                  "Production lines",
                )}
                value={workspace.productionLines.length}
              />
              <Metric
                label={messageFor(language, "Machines", "Machines")}
                value={workspace.machines.length}
              />
              <Metric
                label={messageFor(language, "Sous-ensembles", "Assemblies")}
                value={workspace.assemblies.length}
              />
              <Metric
                label={messageFor(language, "Composants", "Components")}
                value={workspace.components.length}
              />
              <Metric
                label={messageFor(
                  language,
                  "Plans recurrents",
                  "Recurring plans",
                )}
                value={
                  workspace.recurringRequirements.filter(
                    (item) => item.status !== "closed",
                  ).length
                }
              />
            </div>
          </section>

          <section className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/[0.06] px-4 py-3 dark:bg-[#F5A623]/[0.08]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a96f0b]">
              {messageFor(language, "Suivi Exportunity", "Exportunity support")}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
              {workspace.relationship.accountManagerAssigned
                ? messageFor(
                    language,
                    "Un responsable Exportunity est affecte a votre dossier.",
                    "An Exportunity account manager is assigned to your factory record.",
                  )
                : messageFor(
                    language,
                    "Votre dossier reste dans le flux de revue Exportunity.",
                    "Your factory record remains in Exportunity's review workflow.",
                  )}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {messageFor(
                language,
                "Ce statut ne lance aucun contact, devis, commande ou paiement automatiquement.",
                "This status does not start any contact, quotation, order, or payment automatically.",
              )}
            </p>
          </section>

          <section
            id="factory-commercial"
            className="grid scroll-mt-28 gap-7 xl:grid-cols-2"
            aria-label={messageFor(
              language,
              "Flux commercial de l'usine",
              "Factory commercial workflow",
            )}
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <ClipboardList className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(
                      language,
                      "Besoins industriels",
                      "Industrial requirements",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Besoins rattaches a l'usine",
                      "Requirements linked to your factory",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Suivez les besoins rattaches a vos machines, produits ou capacites. Les coordonnees privees du demandeur ne sont pas exposees ici.",
                      "Review requirements linked to your machinery, products, or capabilities. The requester's private contact details are not exposed here.",
                    )}
                  </p>
                </div>
              </div>
              {workspace.requirements.length ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.1em] text-slate-500 dark:border-white/10 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-3">
                          {messageFor(language, "Besoin", "Requirement")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Priorite", "Priority")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Etat", "Status")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.requirements.map((requirement) => (
                        <tr
                          key={requirement.id}
                          className="border-b border-slate-100 last:border-0 dark:border-white/[0.06]"
                        >
                          <td className="px-3 py-4">
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {requirement.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {[
                                requirement.referenceCode,
                                requirement.requirementType.replace(/_/g, " "),
                                requirement.quantityText,
                              ]
                                .filter(Boolean)
                                .join(" - ")}
                            </p>
                          </td>
                          <td className="px-3 py-4 text-slate-600 dark:text-slate-300">
                            {requirement.urgency}
                          </td>
                          <td className="px-3 py-4">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-100">
                              {requirement.status.replace(/_/g, " ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                  {messageFor(
                    language,
                    "Aucun besoin industriel n'est encore rattache a cette usine.",
                    "No industrial requirement is linked to this factory yet.",
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <PackageCheck className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(language, "Devis", "Quotations")}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Decisions commerciales",
                      "Commercial decisions",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Les devis emis restent lisibles ici. Leur acceptation et toute commande restent controlees et tracees par Exportunity.",
                      "Issued quotations remain visible here. Acceptance and every resulting order remain controlled and audited by Exportunity.",
                    )}
                  </p>
                </div>
              </div>
              {workspace.quotes.length ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.1em] text-slate-500 dark:border-white/10 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-3">
                          {messageFor(language, "Devis", "Quotation")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Montant", "Amount")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Etat", "Status")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.quotes.map((quote) => (
                        <tr
                          key={quote.id}
                          className="border-b border-slate-100 last:border-0 dark:border-white/[0.06]"
                        >
                          <td className="px-3 py-4">
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {quote.referenceCode}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {quote.catalogItemName ||
                                quote.requirementTitle ||
                                quote.requirementReferenceCode ||
                                messageFor(
                                  language,
                                  "A preciser",
                                  "To be confirmed",
                                )}
                            </p>
                          </td>
                          <td className="px-3 py-4 text-slate-600 dark:text-slate-300">
                            {quote.totalAmount
                              ? `${quote.totalAmount} ${quote.currencyCode}`
                              : messageFor(language, "A definir", "To be set")}
                          </td>
                          <td className="px-3 py-4">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-100">
                              {quote.status.replace(/_/g, " ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                  {messageFor(
                    language,
                    "Aucun devis n'est encore rattache a cette usine.",
                    "No quotation is linked to this factory yet.",
                  )}
                </div>
              )}
            </div>
          </section>

          <section
            id="factory-documents"
            className="grid scroll-mt-28 gap-7 xl:grid-cols-[minmax(0,0.88fr)_minmax(420px,1.12fr)]"
            aria-label={messageFor(
              language,
              "Registre de documents de l'usine",
              "Factory document register",
            )}
          >
            <form
              onSubmit={uploadFactoryDocument}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <FileUp className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(
                      language,
                      "Documents prives",
                      "Private documents",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Registre de l'usine",
                      "Factory register",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Ajoutez des pieces de verification, d'export, de qualite ou de maintenance. Elles restent privees et ne changent aucun statut sans revue humaine.",
                      "Add verification, export, quality, or maintenance evidence. It remains private and never changes a status without human review.",
                    )}
                  </p>
                </div>
              </div>
              {workspace.documentGaps.length ? (
                <ul className="mt-5 space-y-2 rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/[0.06] p-4 text-sm text-slate-800 dark:bg-[#F5A623]/[0.1] dark:text-slate-100">
                  {workspace.documentGaps.map((gap) => (
                    <li
                      key={`${gap.reason}-${gap.documentType}`}
                      className="flex gap-2"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#a96f0b]" />
                      <span>{factoryDocumentGapLabel(language, gap)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-6 space-y-5">
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Type de document", "Document type")}
                  </label>
                  <select
                    value={factoryDocumentDraft.documentType}
                    onChange={(event) =>
                      setFactoryDocumentDraft((current) => ({
                        ...current,
                        documentType: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    {[
                      "registration",
                      "operating_permit",
                      "quality_certificate",
                      "technical_specification",
                      "maintenance_record",
                      "export_document",
                      "other",
                    ].map((documentType) => (
                      <option key={documentType} value={documentType}>
                        {factoryDocumentTypeLabel(language, documentType)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Titre", "Title")}
                  </label>
                  <input
                    required
                    maxLength={240}
                    value={factoryDocumentDraft.title}
                    onChange={(event) =>
                      setFactoryDocumentDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Ex. Registre de commerce 2027",
                      "E.g. 2027 business registration",
                    )}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Echeance, si applicable",
                      "Expiry date, if applicable",
                    )}
                  </label>
                  <input
                    type="date"
                    value={factoryDocumentDraft.expiresAt}
                    onChange={(event) =>
                      setFactoryDocumentDraft((current) => ({
                        ...current,
                        expiresAt: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Fichier", "File")}
                  </label>
                  <input
                    required
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx,.dxf,.dwg,.step,.stp,.stl,.iges,.igs"
                    onChange={(event) =>
                      setFactoryDocumentFile(event.target.files?.[0] || null)
                    }
                    className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-[#F5A623] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-[#f9a800] dark:text-slate-200"
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {factoryDocumentFile
                      ? `${factoryDocumentFile.name} - ${technicalEvidenceSize(factoryDocumentFile.size)}`
                      : messageFor(
                          language,
                          "PDF, image, Office ou fichier technique, 15 MB maximum.",
                          "PDF, image, Office, or technical file, up to 15 MB.",
                        )}
                  </p>
                </div>
              </div>
              <div className="mt-5">
                <StatusMessage status={factoryDocumentStatus} />
              </div>
              <button
                type="submit"
                disabled={
                  factoryDocumentStatus.kind === "loading" ||
                  !factoryDocumentFile
                }
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileUp className="h-4 w-4" />
                {messageFor(
                  language,
                  "Ajouter au registre prive",
                  "Add to private register",
                )}
              </button>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(
                      language,
                      "Preuves enregistrees",
                      "Recorded evidence",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Documents actifs",
                      "Active documents",
                    )}
                  </h2>
                </div>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100">
                  {workspace.documents.length}
                </span>
              </div>
              {workspace.documents.length ? (
                <div className="mt-5 space-y-3">
                  {workspace.documents.map((factoryDocument) => (
                    <article
                      key={factoryDocument.id}
                      className="rounded-xl border border-slate-200 p-4 dark:border-white/10"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">
                            {factoryDocument.title}
                          </p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {factoryDocumentTypeLabel(
                              language,
                              factoryDocument.documentType,
                            )}{" "}
                            - {factoryDocument.fileName} -{" "}
                            {technicalEvidenceSize(factoryDocument.sizeBytes)}
                          </p>
                          {factoryDocument.expiresAt ? (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {messageFor(language, "Echeance", "Expires")}{" "}
                              {new Intl.DateTimeFormat(
                                language === "fr" ? "fr-FR" : "en-GB",
                                { dateStyle: "medium" },
                              ).format(new Date(factoryDocument.expiresAt))}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void downloadFactoryDocument(factoryDocument)
                            }
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-[#07111F] dark:text-slate-100 dark:hover:bg-white/10"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {messageFor(language, "Telecharger", "Download")}
                          </button>
                          <button
                            type="button"
                            disabled={
                              archivingFactoryDocumentId === factoryDocument.id
                            }
                            onClick={() =>
                              void archiveFactoryDocument(factoryDocument)
                            }
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-[#07111F] dark:text-slate-100 dark:hover:bg-white/10"
                          >
                            <X className="h-3.5 w-3.5" />
                            {messageFor(language, "Archiver", "Archive")}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                  {messageFor(
                    language,
                    "Aucun document d'usine actif n'est encore enregistre. Les dossiers de verification et d'export restent prives jusqu'a revue humaine.",
                    "No active factory document is registered yet. Verification and export evidence remain private until human review.",
                  )}
                </div>
              )}
            </div>
          </section>

          <div className="grid gap-7 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <form
              id="factory-profile"
              onSubmit={updateProfile}
              className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(language, "Profil public", "Public profile")}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Informations visibles apres validation",
                      "Information visible after review",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Ces informations de contact peuvent etre mises a jour. La verification de l'usine ne change jamais automatiquement.",
                      "You can update these contact details. The factory verification state never changes automatically.",
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {messageFor(language, "Nom affiche", "Display name")}
                  </label>
                  <input
                    required
                    maxLength={240}
                    value={profileDraft.displayName}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Site web", "Website")}
                  </label>
                  <input
                    type="url"
                    maxLength={500}
                    value={profileDraft.publicWebsite}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        publicWebsite: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "E-mail public", "Public email")}
                  </label>
                  <input
                    type="email"
                    maxLength={240}
                    value={profileDraft.publicEmail}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        publicEmail: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Telephone public", "Public phone")}
                  </label>
                  <input
                    maxLength={80}
                    value={profileDraft.publicPhone}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        publicPhone: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Description publique",
                      "Public description",
                    )}
                  </label>
                  <textarea
                    rows={5}
                    maxLength={4000}
                    value={profileDraft.publicDescription}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        publicDescription: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Decrivez l'activite, les produits et les capacites que vous acceptez de rendre publiques.",
                      "Describe the activity, products, and capabilities you agree to make public.",
                    )}
                  />
                </div>
              </div>
              <div className="mt-5">
                <StatusMessage status={profileStatus} />
              </div>
              <button
                type="submit"
                disabled={profileStatus.kind === "loading"}
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {messageFor(
                  language,
                  "Enregistrer le profil public",
                  "Save public profile",
                )}
              </button>
            </form>

            <form
              onSubmit={submitCatalogItem}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <PackagePlus className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(
                      language,
                      "Catalogue de l'usine",
                      "Factory catalog",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Soumettre un produit pour revue",
                      "Submit a product for review",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Le produit reste interne tant qu'Exportunity ne l'a pas valide et publie.",
                      "The product remains internal until Exportunity has reviewed and published it.",
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-6 space-y-5">
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Type d'offre", "Offer type")}
                  </label>
                  <select
                    value={catalogDraft.classification}
                    onChange={(event) =>
                      setCatalogDraft((current) => ({
                        ...current,
                        classification: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    {Array.from(
                      new Set(
                        taxonomy.map((category) => category.classification),
                      ),
                    ).map((classification) => (
                      <option key={classification} value={classification}>
                        {classification.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Categorie industrielle",
                      "Industrial category",
                    )}
                  </label>
                  <select
                    required
                    disabled={!categoriesForClassification.length}
                    value={catalogDraft.categoryCode}
                    onChange={(event) =>
                      setCatalogDraft((current) => ({
                        ...current,
                        categoryCode: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">
                      {messageFor(
                        language,
                        "Selectionnez une categorie",
                        "Select a category",
                      )}
                    </option>
                    {categoriesForClassification.map((category) => (
                      <option key={category.code} value={category.code}>
                        {category.label[language]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Nom du produit ou de l'offre",
                      "Product or offer name",
                    )}
                  </label>
                  <input
                    required
                    minLength={2}
                    maxLength={240}
                    value={catalogDraft.name}
                    onChange={(event) =>
                      setCatalogDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Description pour revue",
                      "Description for review",
                    )}
                  </label>
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={catalogDraft.publicDescription}
                    onChange={(event) =>
                      setCatalogDraft((current) => ({
                        ...current,
                        publicDescription: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>MOQ</label>
                    <input
                      maxLength={180}
                      value={catalogDraft.minimumOrderQuantity}
                      onChange={(event) =>
                        setCatalogDraft((current) => ({
                          ...current,
                          minimumOrderQuantity: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={messageFor(
                        language,
                        "Ex. 500 unites",
                        "E.g. 500 units",
                      )}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Delai indicatif",
                        "Indicative lead time",
                      )}
                    </label>
                    <input
                      maxLength={240}
                      value={catalogDraft.leadTimeText}
                      onChange={(event) =>
                        setCatalogDraft((current) => ({
                          ...current,
                          leadTimeText: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={messageFor(
                        language,
                        "Ex. sous confirmation",
                        "E.g. subject to confirmation",
                      )}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <StatusMessage status={catalogStatus} />
              </div>
              <button
                type="submit"
                disabled={
                  catalogStatus.kind === "loading" || !catalogDraft.categoryCode
                }
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <PackagePlus className="h-4 w-4" />
                {messageFor(language, "Envoyer en revue", "Send for review")}
              </button>
            </form>
          </div>

          <section
            id="factory-products"
            className="grid scroll-mt-28 gap-7 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]"
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(
                      language,
                      "Publication controlee",
                      "Controlled publication",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Produits de votre usine",
                      "Your factory products",
                    )}
                  </h2>
                </div>
                <Link
                  href="/request-quote"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#a96f0b] hover:text-[#8a5907] dark:hover:text-[#F5A623]"
                >
                  <ClipboardList className="h-4 w-4" />
                  {messageFor(
                    language,
                    "Creer un besoin industriel",
                    "Create an industrial requirement",
                  )}
                </Link>
              </div>
              {workspace.catalog.length ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.1em] text-slate-500 dark:border-white/10 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-3">
                          {messageFor(language, "Produit", "Product")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Categorie", "Category")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Revue", "Review")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Visibilite", "Visibility")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.catalog.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-100 last:border-0 dark:border-white/[0.06]"
                        >
                          <td className="px-3 py-4">
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {item.name}
                            </p>
                            {item.productCode ? (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {item.productCode}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-4 text-slate-600 dark:text-slate-300">
                            {item.categoryCode}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={cn(
                                "rounded-md px-2 py-1 text-xs font-semibold",
                                item.approvalStatus === "approved"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-200"
                                  : "bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-100",
                              )}
                            >
                              {item.approvalStatus.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-slate-600 dark:text-slate-300">
                            {item.visibility.replace(/_/g, " ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                  {messageFor(
                    language,
                    "Aucun produit n'est encore soumis. Ajoutez uniquement une offre industrielle que votre usine peut confirmer.",
                    "No products have been submitted yet. Add only an industrial offer your factory can confirm.",
                  )}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <Wrench className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(
                      language,
                      "Capacites privees",
                      "Private capabilities",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Lignes et machines",
                      "Lines and machines",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Ces donnees sont visibles seulement dans votre espace et dans le circuit Exportunity autorise.",
                      "This data is visible only in your workspace and the authorized Exportunity workflow.",
                    )}
                  </p>
                </div>
              </div>
              <form
                onSubmit={submitTechnicalAsset}
                className="mt-5 rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/[0.055] p-4 dark:bg-[#F5A623]/[0.08]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">
                      {technicalAssetDraft.id
                        ? messageFor(
                            language,
                            "Mettre a jour l'actif",
                            "Update asset",
                          )
                        : messageFor(
                            language,
                            "Ajouter au registre",
                            "Add to registry",
                          )}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {messageFor(
                        language,
                        "Les actifs restent prives. Ils aident a qualifier les besoins et les pieces.",
                        "Assets remain private. They help qualify requirements and spare parts.",
                      )}
                    </p>
                  </div>
                  {technicalAssetDraft.id ? (
                    <button
                      type="button"
                      onClick={() =>
                        setTechnicalAssetDraft(
                          createTechnicalAssetDraft(
                            technicalAssetDraft.assetType,
                          ),
                        )
                      }
                      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-[#07111F] dark:text-slate-100 dark:hover:bg-white/10"
                    >
                      <X className="h-3.5 w-3.5" />
                      {messageFor(language, "Annuler", "Cancel")}
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      {messageFor(language, "Type d'actif", "Asset type")}
                    </label>
                    <select
                      value={technicalAssetDraft.assetType}
                      disabled={Boolean(technicalAssetDraft.id)}
                      onChange={(event) =>
                        setTechnicalAssetDraft(
                          createTechnicalAssetDraft(
                            event.target.value as TechnicalAssetType,
                          ),
                        )
                      }
                      className={inputClass}
                    >
                      <option value="production_line">
                        {messageFor(
                          language,
                          "Ligne de production",
                          "Production line",
                        )}
                      </option>
                      <option value="machine">
                        {messageFor(language, "Machine", "Machine")}
                      </option>
                      <option value="assembly">
                        {messageFor(language, "Sous-ensemble", "Assembly")}
                      </option>
                      <option value="component">
                        {messageFor(language, "Composant", "Component")}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(language, "Nom", "Name")}
                    </label>
                    <input
                      required
                      minLength={2}
                      maxLength={180}
                      value={technicalAssetDraft.name}
                      onChange={(event) =>
                        setTechnicalAssetDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={messageFor(
                        language,
                        "Ex. ligne de conditionnement",
                        "E.g. packaging line",
                      )}
                    />
                  </div>

                  {technicalAssetDraft.assetType === "production_line" ? (
                    <>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Industrie", "Industry")}
                        </label>
                        <input
                          value={technicalAssetDraft.industry}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              industry: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder={messageFor(
                            language,
                            "Ex. agroalimentaire",
                            "E.g. food processing",
                          )}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Statut", "Operating status")}
                        </label>
                        <select
                          value={technicalAssetDraft.operatingStatus}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              operatingStatus: event.target
                                .value as TechnicalAssetDraft["operatingStatus"],
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="operational">
                            {messageFor(
                              language,
                              "Operationnelle",
                              "Operational",
                            )}
                          </option>
                          <option value="partially_operational">
                            {messageFor(
                              language,
                              "Partiellement operationnelle",
                              "Partially operational",
                            )}
                          </option>
                          <option value="maintenance">
                            {messageFor(language, "Maintenance", "Maintenance")}
                          </option>
                          <option value="unknown">
                            {messageFor(language, "A qualifier", "To qualify")}
                          </option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          {messageFor(
                            language,
                            "Role de la ligne",
                            "Line purpose",
                          )}
                        </label>
                        <input
                          value={technicalAssetDraft.purpose}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              purpose: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder={messageFor(
                            language,
                            "Ex. ensachage et palettisation",
                            "E.g. bagging and palletising",
                          )}
                        />
                      </div>
                    </>
                  ) : null}

                  {technicalAssetDraft.assetType === "machine" ? (
                    <>
                      <div>
                        <label className={labelClass}>
                          {messageFor(
                            language,
                            "Ligne de production",
                            "Production line",
                          )}
                        </label>
                        <select
                          value={technicalAssetDraft.productionLineId}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              productionLineId: event.target.value,
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="">
                            {messageFor(
                              language,
                              "Non rattachee",
                              "Not assigned",
                            )}
                          </option>
                          {workspace.productionLines.map((line) => (
                            <option key={line.id} value={line.id}>
                              {line.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Categorie", "Category")}
                        </label>
                        <input
                          value={technicalAssetDraft.machineCategory}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              machineCategory: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder={messageFor(
                            language,
                            "Ex. extrudeuse",
                            "E.g. extruder",
                          )}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Fabricant", "Manufacturer")}
                        </label>
                        <input
                          value={technicalAssetDraft.manufacturer}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              manufacturer: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Modele", "Model")}
                        </label>
                        <input
                          value={technicalAssetDraft.model}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              model: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(
                            language,
                            "Numero de serie",
                            "Serial number",
                          )}
                        </label>
                        <input
                          value={technicalAssetDraft.serialNumber}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              serialNumber: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Statut", "Operating status")}
                        </label>
                        <select
                          value={technicalAssetDraft.operatingStatus}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              operatingStatus: event.target
                                .value as TechnicalAssetDraft["operatingStatus"],
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="operational">
                            {messageFor(
                              language,
                              "Operationnelle",
                              "Operational",
                            )}
                          </option>
                          <option value="partially_operational">
                            {messageFor(
                              language,
                              "Partiellement operationnelle",
                              "Partially operational",
                            )}
                          </option>
                          <option value="maintenance">
                            {messageFor(language, "Maintenance", "Maintenance")}
                          </option>
                          <option value="unknown">
                            {messageFor(language, "A qualifier", "To qualify")}
                          </option>
                        </select>
                      </div>
                      <details className="sm:col-span-2 rounded-lg border border-slate-200 bg-white/75 p-3 dark:border-white/10 dark:bg-[#07111F]/70">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {messageFor(
                            language,
                            "Details techniques prives",
                            "Private technical details",
                          )}
                        </summary>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className={labelClass}>
                              {messageFor(language, "Marque", "Brand")}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails.brand || ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    brand: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>
                              {messageFor(language, "Usage", "Purpose")}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails.purpose ||
                                ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    purpose: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>
                              {messageFor(
                                language,
                                "Pays d'origine",
                                "Country of origin",
                              )}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails
                                  .countryOfOrigin || ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    countryOfOrigin: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>
                              {messageFor(
                                language,
                                "Annee de fabrication",
                                "Manufacture year",
                              )}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails
                                  .manufactureYear || ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    manufactureYear: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>
                              {messageFor(
                                language,
                                "Puissance",
                                "Power rating",
                              )}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails
                                  .powerRating || ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    powerRating: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>
                              {messageFor(language, "Capacite", "Capacity")}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails.capacity ||
                                ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    capacity: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>
                              {messageFor(
                                language,
                                "Date d'installation",
                                "Installation date",
                              )}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails
                                  .installationDate || ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    installationDate: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                              placeholder="YYYY-MM-DD"
                            />
                          </div>
                          <div>
                            <label className={labelClass}>
                              {messageFor(language, "Fournisseur", "Supplier")}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails.supplier ||
                                ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    supplier: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelClass}>
                              {messageFor(language, "Garantie", "Warranty")}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails.warranty ||
                                ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    warranty: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelClass}>
                              {messageFor(
                                language,
                                "Programme de maintenance",
                                "Maintenance schedule",
                              )}
                            </label>
                            <input
                              value={
                                technicalAssetDraft.technicalDetails
                                  .maintenanceSchedule || ""
                              }
                              onChange={(event) =>
                                setTechnicalAssetDraft((current) => ({
                                  ...current,
                                  technicalDetails: {
                                    ...current.technicalDetails,
                                    maintenanceSchedule: event.target.value,
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                        </div>
                      </details>
                    </>
                  ) : null}

                  {technicalAssetDraft.assetType === "assembly" ? (
                    <>
                      <div>
                        <label className={labelClass}>
                          {messageFor(
                            language,
                            "Machine parente",
                            "Parent machine",
                          )}
                        </label>
                        <select
                          required
                          disabled={Boolean(technicalAssetDraft.id)}
                          value={technicalAssetDraft.machineId}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              machineId: event.target.value,
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="">
                            {messageFor(
                              language,
                              "Selectionnez une machine",
                              "Select a machine",
                            )}
                          </option>
                          {workspace.machines.map((machine) => (
                            <option key={machine.id} value={machine.id}>
                              {machine.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Type", "Type")}
                        </label>
                        <input
                          value={technicalAssetDraft.assemblyType}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              assemblyType: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder={messageFor(
                            language,
                            "Ex. convoyeur",
                            "E.g. conveyor",
                          )}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Statut", "Operating status")}
                        </label>
                        <select
                          value={technicalAssetDraft.operatingStatus}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              operatingStatus: event.target
                                .value as TechnicalAssetDraft["operatingStatus"],
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="operational">
                            {messageFor(
                              language,
                              "Operationnel",
                              "Operational",
                            )}
                          </option>
                          <option value="partially_operational">
                            {messageFor(
                              language,
                              "Partiellement operationnel",
                              "Partially operational",
                            )}
                          </option>
                          <option value="maintenance">
                            {messageFor(language, "Maintenance", "Maintenance")}
                          </option>
                          <option value="unknown">
                            {messageFor(language, "A qualifier", "To qualify")}
                          </option>
                        </select>
                      </div>
                    </>
                  ) : null}

                  {technicalAssetDraft.assetType === "component" ? (
                    <>
                      <div>
                        <label className={labelClass}>
                          {messageFor(
                            language,
                            "Machine parente",
                            "Parent machine",
                          )}
                        </label>
                        <select
                          required
                          disabled={Boolean(technicalAssetDraft.id)}
                          value={technicalAssetDraft.machineId}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              machineId: event.target.value,
                              assemblyId: "",
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="">
                            {messageFor(
                              language,
                              "Selectionnez une machine",
                              "Select a machine",
                            )}
                          </option>
                          {workspace.machines.map((machine) => (
                            <option key={machine.id} value={machine.id}>
                              {machine.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Sous-ensemble", "Assembly")}
                        </label>
                        <select
                          disabled={
                            Boolean(technicalAssetDraft.id) ||
                            !technicalAssetDraft.machineId
                          }
                          value={technicalAssetDraft.assemblyId}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              assemblyId: event.target.value,
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="">
                            {messageFor(
                              language,
                              "Non renseigne",
                              "Not specified",
                            )}
                          </option>
                          {workspace.assemblies
                            .filter(
                              (assembly) =>
                                assembly.machineId ===
                                technicalAssetDraft.machineId,
                            )
                            .map((assembly) => (
                              <option key={assembly.id} value={assembly.id}>
                                {assembly.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Type", "Type")}
                        </label>
                        <input
                          value={technicalAssetDraft.componentType}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              componentType: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder={messageFor(
                            language,
                            "Ex. roulement",
                            "E.g. bearing",
                          )}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(
                            language,
                            "Numero de piece",
                            "Part number",
                          )}
                        </label>
                        <input
                          value={technicalAssetDraft.partNumber}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              partNumber: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Fabricant", "Manufacturer")}
                        </label>
                        <input
                          value={technicalAssetDraft.manufacturer}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              manufacturer: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Modele", "Model")}
                        </label>
                        <input
                          value={technicalAssetDraft.model}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              model: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Criticite", "Criticality")}
                        </label>
                        <select
                          value={technicalAssetDraft.criticality}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              criticality: event.target
                                .value as TechnicalAssetDraft["criticality"],
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="standard">
                            {messageFor(language, "Standard", "Standard")}
                          </option>
                          <option value="important">
                            {messageFor(language, "Important", "Important")}
                          </option>
                          <option value="critical">
                            {messageFor(language, "Critique", "Critical")}
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Statut", "Operating status")}
                        </label>
                        <select
                          value={technicalAssetDraft.operatingStatus}
                          onChange={(event) =>
                            setTechnicalAssetDraft((current) => ({
                              ...current,
                              operatingStatus: event.target
                                .value as TechnicalAssetDraft["operatingStatus"],
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="operational">
                            {messageFor(
                              language,
                              "Operationnel",
                              "Operational",
                            )}
                          </option>
                          <option value="partially_operational">
                            {messageFor(
                              language,
                              "Partiellement operationnel",
                              "Partially operational",
                            )}
                          </option>
                          <option value="maintenance">
                            {messageFor(language, "Maintenance", "Maintenance")}
                          </option>
                          <option value="unknown">
                            {messageFor(language, "A qualifier", "To qualify")}
                          </option>
                        </select>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="mt-4">
                  <StatusMessage status={technicalAssetStatus} />
                </div>
                <button
                  type="submit"
                  disabled={technicalAssetStatus.kind === "loading"}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {technicalAssetDraft.id
                    ? messageFor(
                        language,
                        "Enregistrer les modifications",
                        "Save changes",
                      )
                    : messageFor(
                        language,
                        "Ajouter au registre",
                        "Add to registry",
                      )}
                </button>
              </form>

              <div className="mt-5 space-y-3">
                {workspace.productionLines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-white/10"
                  >
                    <div>
                      <p className="font-semibold text-slate-950 dark:text-white">
                        {line.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        {[line.industry, line.operatingStatus, line.purpose]
                          .filter(Boolean)
                          .join(" - ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        startTechnicalAssetEdit("production_line", line)
                      }
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-[#07111F] dark:text-slate-100 dark:hover:bg-white/10"
                      aria-label={messageFor(
                        language,
                        "Modifier la ligne",
                        "Edit production line",
                      )}
                      title={messageFor(language, "Modifier", "Edit")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {workspace.machines.map((machine) => {
                  const lineName = workspace.productionLines.find(
                    (line) => line.id === machine.productionLineId,
                  )?.name;
                  return (
                    <div
                      key={machine.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-white/10"
                    >
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">
                          {machine.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {[
                            machine.machineCategory,
                            machine.manufacturer,
                            machine.model,
                            lineName,
                            machine.operatingStatus,
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          startTechnicalAssetEdit("machine", machine)
                        }
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-[#07111F] dark:text-slate-100 dark:hover:bg-white/10"
                        aria-label={messageFor(
                          language,
                          "Modifier la machine",
                          "Edit machine",
                        )}
                        title={messageFor(language, "Modifier", "Edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
                {!workspace.productionLines.length &&
                !workspace.machines.length ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                    <AlertCircle className="mb-2 h-5 w-5 text-[#a96f0b]" />
                    {messageFor(
                      language,
                      "Commencez par ajouter une ligne de production ou une machine. Les donnees restent privees par defaut.",
                      "Start with a production line or machine. Data remains private by default.",
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section
            id="factory-technical"
            className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <PackageCheck className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                  {messageFor(
                    language,
                    "Suivi commercial",
                    "Commercial tracking",
                  )}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                  {messageFor(
                    language,
                    "Commandes de votre usine",
                    "Your factory orders",
                  )}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {messageFor(
                    language,
                    "Consultez les commandes confirmees et leurs etapes. Les changements de statut restent controles et traces par l'equipe Exportunity.",
                    "Review confirmed orders and their stages. Status changes remain controlled and audited by the Exportunity team.",
                  )}
                </p>
              </div>
            </div>
            {workspace.orders.length ? (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.1em] text-slate-500 dark:border-white/10 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-3">
                        {messageFor(language, "Commande", "Order")}
                      </th>
                      <th className="px-3 py-3">
                        {messageFor(
                          language,
                          "Article ou besoin",
                          "Item or requirement",
                        )}
                      </th>
                      <th className="px-3 py-3">
                        {messageFor(language, "Suivi", "Status")}
                      </th>
                      <th className="px-3 py-3">
                        {messageFor(
                          language,
                          "Livraison prevue",
                          "Planned delivery",
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.orders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-slate-100 last:border-0 dark:border-white/[0.06]"
                      >
                        <td className="px-3 py-4">
                          <p className="font-semibold text-slate-950 dark:text-white">
                            {order.referenceCode}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {order.quoteReferenceCode ||
                              messageFor(
                                language,
                                "Devis confirme",
                                "Confirmed quotation",
                              )}
                            {order.totalAmount
                              ? ` - ${order.totalAmount} ${order.currencyCode}`
                              : ""}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          <p className="font-medium text-slate-800 dark:text-slate-100">
                            {order.catalogItemName ||
                              order.requirementTitle ||
                              messageFor(
                                language,
                                "A preciser",
                                "To be confirmed",
                              )}
                          </p>
                          {order.lineItems[0]?.description ? (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {order.lineItems[0].description}
                              {order.lineItems.length > 1
                                ? ` +${order.lineItems.length - 1}`
                                : ""}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={cn(
                              "rounded-md px-2 py-1 text-xs font-semibold",
                              orderStatusClass(order.status),
                            )}
                          >
                            {orderStatusLabel(language, order.status)}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-slate-600 dark:text-slate-300">
                          {order.plannedDeliveryAt
                            ? new Intl.DateTimeFormat(
                                language === "fr" ? "fr-FR" : "en-GB",
                                { dateStyle: "medium" },
                              ).format(new Date(order.plannedDeliveryAt))
                            : messageFor(
                                language,
                                "A confirmer",
                                "To be confirmed",
                              )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                {messageFor(
                  language,
                  "Aucune commande confirmee n'est encore rattachee a cette usine. Les devis acceptes deviennent des commandes suivies seulement apres confirmation humaine par Exportunity.",
                  "No confirmed order is linked to this factory yet. Accepted quotations become tracked orders only after human confirmation by Exportunity.",
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <Wrench className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                  {messageFor(
                    language,
                    "Hierarchie technique privee",
                    "Private technical hierarchy",
                  )}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                  {messageFor(
                    language,
                    "Machines, sous-ensembles et composants",
                    "Machines, assemblies, and components",
                  )}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {messageFor(
                    language,
                    "Cette structure sert a rattacher precisement les besoins de maintenance, de pieces et de consommables. Elle reste privee par defaut.",
                    "This structure links maintenance, spare-part, and consumable needs precisely. It remains private by default.",
                  )}
                </p>
              </div>
            </div>
            {workspace.machines.length ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {workspace.machines.map((machine) => {
                  const machineAssemblies = workspace.assemblies.filter(
                    (assembly) => assembly.machineId === machine.id,
                  );
                  const machineComponents = workspace.components.filter(
                    (component) => component.machineId === machine.id,
                  );
                  return (
                    <article
                      key={machine.id}
                      className="rounded-xl border border-slate-200 p-4 dark:border-white/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-950 dark:text-white">
                          {machine.name}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            startTechnicalAssetEdit("machine", machine)
                          }
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-[#07111F] dark:text-slate-100 dark:hover:bg-white/10"
                          aria-label={messageFor(
                            language,
                            "Modifier la machine",
                            "Edit machine",
                          )}
                          title={messageFor(language, "Modifier", "Edit")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        {[
                          machine.machineCategory,
                          machine.manufacturer,
                          machine.model,
                        ]
                          .filter(Boolean)
                          .join(" - ") ||
                          messageFor(
                            language,
                            "Machine a qualifier",
                            "Machine to qualify",
                          )}
                      </p>
                      <div className="mt-4 space-y-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            {messageFor(
                              language,
                              "Sous-ensembles",
                              "Assemblies",
                            )}
                          </p>
                          {machineAssemblies.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {machineAssemblies.map((assembly) => (
                                <button
                                  type="button"
                                  onClick={() =>
                                    startTechnicalAssetEdit(
                                      "assembly",
                                      assembly,
                                    )
                                  }
                                  key={assembly.id}
                                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:border-[#F5A623]/60 hover:bg-[#F5A623]/10 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-200"
                                >
                                  {assembly.name}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              {messageFor(
                                language,
                                "Aucun sous-ensemble enregistre.",
                                "No assembly recorded.",
                              )}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            {messageFor(language, "Composants", "Components")}
                          </p>
                          {machineComponents.length ? (
                            <div className="mt-2 space-y-1.5">
                              {machineComponents
                                .slice(0, 6)
                                .map((component) => (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startTechnicalAssetEdit(
                                        "component",
                                        component,
                                      )
                                    }
                                    key={component.id}
                                    className="block text-left text-sm text-slate-700 transition hover:text-[#a96f0b] dark:text-slate-200 dark:hover:text-[#F5A623]"
                                  >
                                    {[
                                      component.name,
                                      component.partNumber,
                                      component.criticality === "critical"
                                        ? messageFor(
                                            language,
                                            "critique",
                                            "critical",
                                          )
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" - ")}
                                  </button>
                                ))}
                              {machineComponents.length > 6 ? (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  +{machineComponents.length - 6}{" "}
                                  {messageFor(
                                    language,
                                    "autres composants",
                                    "more components",
                                  )}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              {messageFor(
                                language,
                                "Aucun composant enregistre.",
                                "No component recorded.",
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                {messageFor(
                  language,
                  "Les machines doivent etre enregistrees avant de pouvoir relier des sous-ensembles et des composants.",
                  "Machinery must be recorded before assemblies and components can be linked.",
                )}
              </div>
            )}
          </section>

          <section
            id="factory-part-records"
            className="grid scroll-mt-28 gap-7 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]"
          >
            <form
              onSubmit={submitPartRecord}
              className="rounded-2xl border border-[#F5A623]/35 bg-white p-6 shadow-sm dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(
                      language,
                      "Numeriser une piece",
                      "Digitize a part",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Creer un dossier technique",
                      "Create a technical part record",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Enregistrez une piece, rattachez-la a une machine si utile, puis ajoutez photos, mesures, plans ou fichiers CAD. Exportunity examine ensuite l'orientation technique de maniere controlee.",
                      "Record a part, link it to a machine when useful, then add photos, measurements, drawings, or CAD files. Exportunity reviews the technical route in a controlled workflow.",
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Type de besoin", "Requirement type")}
                  </label>
                  <select
                    value={partRecordDraft.requirementType}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        requirementType: event.target
                          .value as IndustrialChallengeRequirementType,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="spare_part">
                      {messageFor(language, "Piece detachee", "Spare part")}
                    </option>
                    <option value="custom_manufacturing">
                      {messageFor(
                        language,
                        "Fabrication sur mesure",
                        "Custom manufacturing",
                      )}
                    </option>
                    <option value="machinery">
                      {messageFor(
                        language,
                        "Machine ou equipement",
                        "Machinery",
                      )}
                    </option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Categorie", "Category")}
                  </label>
                  <select
                    required
                    value={partRecordDraft.categoryCode}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        categoryCode: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    {partRecordCategories.map((category) => (
                      <option key={category.code} value={category.code}>
                        {category.label[language]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {messageFor(language, "Nom de la piece", "Part name")}
                  </label>
                  <input
                    required
                    minLength={3}
                    maxLength={240}
                    value={partRecordDraft.title}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Ex. Palier de roulement pour convoyeur",
                      "E.g. Conveyor bearing housing",
                    )}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Reference ou numero de piece",
                      "Part number or reference",
                    )}
                  </label>
                  <input
                    maxLength={240}
                    value={partRecordDraft.partNumber}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        partNumber: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="6205 / REF-..."
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Urgence", "Urgency")}
                  </label>
                  <select
                    value={partRecordDraft.urgency}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        urgency: event.target
                          .value as IndustrialChallenge["urgency"],
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="standard">
                      {messageFor(language, "Standard", "Standard")}
                    </option>
                    <option value="urgent">
                      {messageFor(language, "Urgent", "Urgent")}
                    </option>
                    <option value="critical">
                      {messageFor(language, "Critique", "Critical")}
                    </option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Machine associee",
                      "Related machine",
                    )}
                  </label>
                  <select
                    value={partRecordDraft.machineId}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        machineId: event.target.value,
                        assemblyId: "",
                        componentId: "",
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">
                      {messageFor(
                        language,
                        "Aucune machine precisee",
                        "No machine selected",
                      )}
                    </option>
                    {workspace.machines.map((machine) => (
                      <option key={machine.id} value={machine.id}>
                        {machine.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Sous-ensemble", "Assembly")}
                  </label>
                  <select
                    disabled={!partRecordDraft.machineId}
                    value={partRecordDraft.assemblyId}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        assemblyId: event.target.value,
                        componentId: "",
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">
                      {messageFor(language, "Non precise", "Not specified")}
                    </option>
                    {workspace.assemblies
                      .filter(
                        (assembly) =>
                          assembly.machineId === partRecordDraft.machineId,
                      )
                      .map((assembly) => (
                        <option key={assembly.id} value={assembly.id}>
                          {assembly.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Composant existant",
                      "Existing component",
                    )}
                  </label>
                  <select
                    disabled={!partRecordDraft.machineId}
                    value={partRecordDraft.componentId}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        componentId: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">
                      {messageFor(
                        language,
                        "Nouveau composant ou non precise",
                        "New or unspecified component",
                      )}
                    </option>
                    {workspace.components
                      .filter(
                        (component) =>
                          component.machineId === partRecordDraft.machineId &&
                          (!partRecordDraft.assemblyId ||
                            component.assemblyId ===
                              partRecordDraft.assemblyId),
                      )
                      .map((component) => (
                        <option key={component.id} value={component.id}>
                          {[component.name, component.partNumber]
                            .filter(Boolean)
                            .join(" - ")}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Details techniques connus",
                      "Known technical details",
                    )}
                  </label>
                  <textarea
                    rows={4}
                    maxLength={6000}
                    value={partRecordDraft.technicalDetails}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        technicalDetails: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Fonction, defaut observe, contraintes de montage ou informations a verifier.",
                      "Function, observed failure, fit constraints, or information to verify.",
                    )}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Materiau", "Material")}
                  </label>
                  <input
                    maxLength={400}
                    value={partRecordDraft.material}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        material: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Ex. acier, fonte",
                      "E.g. steel, cast iron",
                    )}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Dimensions ou mesures",
                      "Dimensions or measurements",
                    )}
                  </label>
                  <input
                    maxLength={1000}
                    value={partRecordDraft.dimensionsText}
                    onChange={(event) =>
                      setPartRecordDraft((current) => ({
                        ...current,
                        dimensionsText: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="Ex. 80 mm x 120 mm"
                  />
                </div>
              </div>

              <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {messageFor(
                    language,
                    "Ajouter le contexte d'approvisionnement",
                    "Add sourcing context",
                  )}
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      {messageFor(language, "Application", "Application")}
                    </label>
                    <textarea
                      rows={3}
                      maxLength={1200}
                      value={partRecordDraft.application}
                      onChange={(event) =>
                        setPartRecordDraft((current) => ({
                          ...current,
                          application: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Source actuelle",
                        "Current source",
                      )}
                    </label>
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={partRecordDraft.currentSource}
                      onChange={(event) =>
                        setPartRecordDraft((current) => ({
                          ...current,
                          currentSource: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Signal de demande",
                        "Demand signal",
                      )}
                    </label>
                    <textarea
                      rows={3}
                      maxLength={1600}
                      value={partRecordDraft.demandSignalText}
                      onChange={(event) =>
                        setPartRecordDraft((current) => ({
                          ...current,
                          demandSignalText: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={messageFor(
                        language,
                        "Frequence, volumes, delai ou impact de l'indisponibilite.",
                        "Frequency, volumes, lead time, or impact of unavailability.",
                      )}
                    />
                  </div>
                </div>
              </details>

              <div className="mt-5">
                <StatusMessage status={partRecordStatus} />
              </div>
              <button
                type="submit"
                disabled={
                  partRecordStatus.kind === "loading" ||
                  !partRecordDraft.categoryCode
                }
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileCheck2 className="h-4 w-4" />
                {messageFor(
                  language,
                  "Creer le dossier technique",
                  "Create technical record",
                )}
              </button>
            </form>

            <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(language, "Dossiers prives", "Private records")}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Pieces en revue",
                      "Parts under review",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Les fichiers sont prives. Une orientation stock, distribution, assemblage, fabrication locale ou import reste une decision humaine tracee.",
                      "Files are private. A stock, distribution, assembly, local-manufacturing, or import route remains a logged human decision.",
                    )}
                  </p>
                </div>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100">
                  {partRecords.length}
                </span>
              </div>
              <div className="mt-4">
                <StatusMessage status={partRecordLoadStatus} />
              </div>

              {partRecords.length ? (
                <div className="mt-5 space-y-3">
                  {partRecords.map((partRecord) => (
                    <article
                      key={partRecord.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950 dark:text-white">
                            {partRecord.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {[
                              partRecord.referenceCode,
                              partRecord.partNumber,
                              partRecord.categoryCode,
                            ]
                              .filter(Boolean)
                              .join(" - ")}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-md px-2 py-1 text-xs font-semibold",
                            partRecordStatusClass(partRecord.status),
                          )}
                        >
                          {partRecordStatusLabel(language, partRecord.status)}
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        {messageFor(language, "Orientation", "Route")}:{" "}
                        {partRecord.routeDecision.replace(/_/g, " ")}
                        {partRecord.revision > 1
                          ? ` - v${partRecord.revision}`
                          : ""}
                      </p>
                      {partRecord.technicalDetails ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {partRecord.technicalDetails}
                        </p>
                      ) : null}
                      <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-3 dark:border-white/10 dark:bg-slate-950/30">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                            {messageFor(
                              language,
                              "Preuves techniques privees",
                              "Private technical evidence",
                            )}
                          </p>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                            {partRecord.documentCount}/{12}
                          </span>
                        </div>
                        {partRecord.documents.length ? (
                          <div className="mt-3 space-y-2">
                            {partRecord.documents.map((documentRecord) => (
                              <div
                                key={documentRecord.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-2.5 py-2 dark:border-white/10"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                    {documentRecord.title}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {documentRecord.documentType} -{" "}
                                    {technicalEvidenceSize(
                                      documentRecord.sizeBytes,
                                    )}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void downloadPartRecordDocument(
                                      partRecord,
                                      documentRecord,
                                    )
                                  }
                                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 hover:border-[#F5A623] hover:text-[#9d5b00] dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  {messageFor(language, "Ouvrir", "Open")}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <label
                          htmlFor={`part-record-evidence-${partRecord.id}`}
                          className={cn(
                            "mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:border-[#F5A623] hover:text-[#9d5b00] dark:border-white/15 dark:bg-white/5 dark:text-slate-100",
                            (uploadingPartRecordId === partRecord.id ||
                              partRecord.status === "archived" ||
                              partRecord.documentCount >= 12) &&
                              "cursor-not-allowed opacity-50",
                          )}
                        >
                          <FileUp className="h-3.5 w-3.5" />
                          {uploadingPartRecordId === partRecord.id
                            ? messageFor(language, "Ajout...", "Adding...")
                            : messageFor(
                                language,
                                "Ajouter une preuve technique",
                                "Add technical evidence",
                              )}
                        </label>
                        <input
                          id={`part-record-evidence-${partRecord.id}`}
                          type="file"
                          className="sr-only"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx,.dxf,.dwg,.step,.stp,.stl,.iges,.igs"
                          disabled={
                            uploadingPartRecordId === partRecord.id ||
                            partRecord.status === "archived" ||
                            partRecord.documentCount >= 12
                          }
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            event.target.value = "";
                            void uploadPartRecordDocument(partRecord, file);
                          }}
                        />
                        {partRecordDocumentStatus[partRecord.id] ? (
                          <div className="mt-3">
                            <StatusMessage
                              status={partRecordDocumentStatus[partRecord.id]}
                            />
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                  {messageFor(
                    language,
                    "Aucune piece n'est encore enregistree. Commencez par capturer une piece reelle, ses informations connues et ses preuves techniques.",
                    "No part has been recorded yet. Start by capturing a real part, its known information, and its technical evidence.",
                  )}
                </div>
              )}
            </aside>
          </section>

          <section
            id="industrial-challenges"
            className="grid scroll-mt-28 gap-7 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]"
          >
            <form
              onSubmit={submitIndustrialChallenge}
              className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm dark:border-[#F5A623]/25 dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(
                      language,
                      "Défi industriel",
                      "Industrial challenge",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Signaler un blocage de production",
                      "Report a production blocker",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Décrivez une pièce qui échoue, un délai excessif, un équipement inadapté ou un processus à automatiser. Exportunity qualifie le dossier avant toute démarche commerciale.",
                      "Describe a failing part, excessive lead time, unsuitable equipment, or process to automate. Exportunity qualifies the record before any commercial action.",
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Type de besoin", "Requirement type")}
                  </label>
                  <select
                    value={industrialChallengeDraft.requirementType}
                    onChange={(event) =>
                      setIndustrialChallengeDraft((current) => ({
                        ...current,
                        requirementType: event.target
                          .value as IndustrialChallengeRequirementType,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="spare_part">
                      {messageFor(language, "Pièce détachée", "Spare part")}
                    </option>
                    <option value="machinery">
                      {messageFor(
                        language,
                        "Machine ou équipement",
                        "Machinery",
                      )}
                    </option>
                    <option value="industrial_input">
                      {messageFor(
                        language,
                        "Intrant industriel",
                        "Industrial input",
                      )}
                    </option>
                    <option value="raw_material">
                      {messageFor(language, "Matière première", "Raw material")}
                    </option>
                    <option value="custom_manufacturing">
                      {messageFor(
                        language,
                        "Fabrication sur mesure",
                        "Custom manufacturing",
                      )}
                    </option>
                    <option value="industrial_service">
                      {messageFor(
                        language,
                        "Service industriel",
                        "Industrial service",
                      )}
                    </option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Catégorie", "Category")}
                  </label>
                  <select
                    required
                    value={industrialChallengeDraft.categoryCode}
                    onChange={(event) =>
                      setIndustrialChallengeDraft((current) => ({
                        ...current,
                        categoryCode: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    {challengeCategories.map((category) => (
                      <option key={category.code} value={category.code}>
                        {category.label[language]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Titre du blocage",
                      "Production blocker title",
                    )}
                  </label>
                  <input
                    required
                    minLength={3}
                    maxLength={240}
                    value={industrialChallengeDraft.title}
                    onChange={(event) =>
                      setIndustrialChallengeDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Ex. Roulement de convoyeur indisponible",
                      "E.g. Conveyor bearing unavailable",
                    )}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Type de problème", "Problem type")}
                  </label>
                  <select
                    value={industrialChallengeDraft.problemType}
                    onChange={(event) =>
                      setIndustrialChallengeDraft((current) => ({
                        ...current,
                        problemType: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="recurring_component_failure">
                      {messageFor(
                        language,
                        "Défaillance récurrente",
                        "Recurring component failure",
                      )}
                    </option>
                    <option value="long_lead_time">
                      {messageFor(
                        language,
                        "Délai trop long",
                        "Long lead time",
                      )}
                    </option>
                    <option value="equipment_gap">
                      {messageFor(
                        language,
                        "Équipement manquant",
                        "Equipment gap",
                      )}
                    </option>
                    <option value="equipment_cost">
                      {messageFor(
                        language,
                        "Équipement trop coûteux",
                        "Equipment cost",
                      )}
                    </option>
                    <option value="manual_process">
                      {messageFor(
                        language,
                        "Processus manuel à automatiser",
                        "Manual process to automate",
                      )}
                    </option>
                    <option value="unavailable_part">
                      {messageFor(
                        language,
                        "Pièce introuvable",
                        "Unavailable part",
                      )}
                    </option>
                    <option value="production_bottleneck">
                      {messageFor(
                        language,
                        "Goulot d'étranglement",
                        "Production bottleneck",
                      )}
                    </option>
                    <option value="quality_issue">
                      {messageFor(
                        language,
                        "Problème qualité",
                        "Quality issue",
                      )}
                    </option>
                    <option value="maintenance_gap">
                      {messageFor(
                        language,
                        "Maintenance insuffisante",
                        "Maintenance gap",
                      )}
                    </option>
                    <option value="local_manufacturing_opportunity">
                      {messageFor(
                        language,
                        "Opportunité de fabrication locale",
                        "Local manufacturing opportunity",
                      )}
                    </option>
                    <option value="other">
                      {messageFor(language, "Autre", "Other")}
                    </option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Urgence", "Urgency")}
                  </label>
                  <select
                    value={industrialChallengeDraft.urgency}
                    onChange={(event) =>
                      setIndustrialChallengeDraft((current) => ({
                        ...current,
                        urgency: event.target
                          .value as IndustrialChallenge["urgency"],
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="standard">
                      {messageFor(language, "Standard", "Standard")}
                    </option>
                    <option value="urgent">
                      {messageFor(language, "Urgente", "Urgent")}
                    </option>
                    <option value="critical">
                      {messageFor(language, "Critique", "Critical")}
                    </option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Contexte et conséquences",
                      "Context and operational impact",
                    )}
                  </label>
                  <textarea
                    required
                    minLength={8}
                    maxLength={6000}
                    rows={4}
                    value={industrialChallengeDraft.details}
                    onChange={(event) =>
                      setIndustrialChallengeDraft((current) => ({
                        ...current,
                        details: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Décrivez la machine, la pièce, la fréquence, l'impact sur la production et ce qui a déjà été essayé.",
                      "Describe the machine or part, frequency, production impact, and what has already been tried.",
                    )}
                  />
                </div>
                <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950 dark:border-[#F5A623]/25 dark:bg-[#F5A623]/10 dark:text-amber-50">
                  <input
                    type="checkbox"
                    checked={industrialChallengeDraft.productionStopped}
                    onChange={(event) =>
                      setIndustrialChallengeDraft((current) => ({
                        ...current,
                        productionStopped: event.target.checked,
                        urgency: event.target.checked
                          ? current.urgency === "standard"
                            ? "urgent"
                            : current.urgency
                          : current.urgency,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 accent-[#F5A623]"
                  />
                  <span>
                    <span className="block font-semibold">
                      {messageFor(
                        language,
                        "La production est arrêtée ou fortement dégradée",
                        "Production is stopped or materially degraded",
                      )}
                    </span>
                    <span className="mt-1 block leading-5 text-amber-800 dark:text-amber-100/80">
                      {messageFor(
                        language,
                        "Le dossier devient au minimum urgent, mais aucune action externe n'est lancée sans revue humaine.",
                        "The record becomes at least urgent, but no external action begins without human review.",
                      )}
                    </span>
                  </span>
                </label>
              </div>

              {workspace.machines.length ? (
                <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {messageFor(
                      language,
                      "Lier à un actif technique privé",
                      "Link a private technical asset",
                    )}
                  </summary>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Cette information reste dans l'équipe de l'usine et le dossier de revue Exportunity.",
                      "This context remains within the factory team and Exportunity review record.",
                    )}
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className={labelClass}>
                        {messageFor(language, "Machine", "Machine")}
                      </label>
                      <select
                        value={industrialChallengeDraft.machineId}
                        onChange={(event) =>
                          setIndustrialChallengeDraft((current) => ({
                            ...current,
                            machineId: event.target.value,
                            assemblyId: "",
                            componentId: "",
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">
                          {messageFor(
                            language,
                            "Non précisée",
                            "Not specified",
                          )}
                        </option>
                        {workspace.machines.map((machine) => (
                          <option key={machine.id} value={machine.id}>
                            {machine.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        {messageFor(language, "Sous-ensemble", "Assembly")}
                      </label>
                      <select
                        disabled={!industrialChallengeDraft.machineId}
                        value={industrialChallengeDraft.assemblyId}
                        onChange={(event) =>
                          setIndustrialChallengeDraft((current) => ({
                            ...current,
                            assemblyId: event.target.value,
                            componentId: "",
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">
                          {messageFor(language, "Non précisé", "Not specified")}
                        </option>
                        {workspace.assemblies
                          .filter(
                            (assembly) =>
                              assembly.machineId ===
                              industrialChallengeDraft.machineId,
                          )
                          .map((assembly) => (
                            <option key={assembly.id} value={assembly.id}>
                              {assembly.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        {messageFor(language, "Composant", "Component")}
                      </label>
                      <select
                        disabled={!industrialChallengeDraft.machineId}
                        value={industrialChallengeDraft.componentId}
                        onChange={(event) =>
                          setIndustrialChallengeDraft((current) => ({
                            ...current,
                            componentId: event.target.value,
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">
                          {messageFor(language, "Non précisé", "Not specified")}
                        </option>
                        {workspace.components
                          .filter(
                            (component) =>
                              component.machineId ===
                                industrialChallengeDraft.machineId &&
                              (!industrialChallengeDraft.assemblyId ||
                                component.assemblyId ===
                                  industrialChallengeDraft.assemblyId),
                          )
                          .map((component) => (
                            <option key={component.id} value={component.id}>
                              {[component.name, component.partNumber]
                                .filter(Boolean)
                                .join(" - ")}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </details>
              ) : null}

              <details className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {messageFor(
                    language,
                    "Préciser l'impact et l'orientation souhaitée",
                    "Add impact and preferred review path",
                  )}
                </summary>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      {messageFor(language, "Impact", "Impact")}
                    </label>
                    <input
                      maxLength={2000}
                      value={industrialChallengeDraft.impactText}
                      onChange={(event) =>
                        setIndustrialChallengeDraft((current) => ({
                          ...current,
                          impactText: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={messageFor(
                        language,
                        "Ex. 15 % de capacité perdue",
                        "E.g. 15% of capacity lost",
                      )}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(language, "Fréquence", "Frequency")}
                    </label>
                    <input
                      maxLength={160}
                      value={industrialChallengeDraft.recurrenceFrequency}
                      onChange={(event) =>
                        setIndustrialChallengeDraft((current) => ({
                          ...current,
                          recurrenceFrequency: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={messageFor(
                        language,
                        "Ex. tous les 3 mois",
                        "E.g. every 3 months",
                      )}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Arrêt estimé",
                        "Estimated downtime",
                      )}
                    </label>
                    <input
                      maxLength={240}
                      value={industrialChallengeDraft.estimatedDowntime}
                      onChange={(event) =>
                        setIndustrialChallengeDraft((current) => ({
                          ...current,
                          estimatedDowntime: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={messageFor(
                        language,
                        "Ex. 12 heures par incident",
                        "E.g. 12 hours per incident",
                      )}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Orientation souhaitée",
                        "Preferred path",
                      )}
                    </label>
                    <select
                      value={industrialChallengeDraft.desiredOutcome}
                      onChange={(event) =>
                        setIndustrialChallengeDraft((current) => ({
                          ...current,
                          desiredOutcome: event.target
                            .value as IndustrialChallengeOutcome,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="review_required">
                        {messageFor(language, "À qualifier", "Needs review")}
                      </option>
                      <option value="stock_candidate">
                        {messageFor(
                          language,
                          "Candidat au stock",
                          "Stock candidate",
                        )}
                      </option>
                      <option value="group_procurement">
                        {messageFor(
                          language,
                          "Achat groupé",
                          "Group procurement",
                        )}
                      </option>
                      <option value="reverse_engineering">
                        {messageFor(
                          language,
                          "Rétro-ingénierie",
                          "Reverse engineering",
                        )}
                      </option>
                      <option value="local_manufacturing">
                        {messageFor(
                          language,
                          "Fabrication locale",
                          "Local manufacturing",
                        )}
                      </option>
                      <option value="redesign">
                        {messageFor(language, "Re-conception", "Redesign")}
                      </option>
                      <option value="engineering_partner">
                        {messageFor(
                          language,
                          "Partenaire ingénierie",
                          "Engineering partner",
                        )}
                      </option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Solution provisoire",
                        "Current workaround",
                      )}
                    </label>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={industrialChallengeDraft.currentWorkaround}
                      onChange={(event) =>
                        setIndustrialChallengeDraft((current) => ({
                          ...current,
                          currentWorkaround: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </details>

              <div className="mt-5">
                <StatusMessage status={industrialChallengeStatus} />
              </div>
              <button
                type="submit"
                disabled={
                  industrialChallengeStatus.kind === "loading" ||
                  !industrialChallengeDraft.categoryCode
                }
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <AlertTriangle className="h-4 w-4" />
                {messageFor(
                  language,
                  "Transmettre le défi pour revue",
                  "Submit challenge for review",
                )}
              </button>
            </form>

            <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                {messageFor(language, "Suivi des défis", "Challenge follow-up")}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                {messageFor(
                  language,
                  "Vos blocages de production",
                  "Your production blockers",
                )}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {messageFor(
                  language,
                  "Les étapes visibles ici suivent une revue Exportunity. Un regroupement, un sourcing ou une étude technique ne déclenche rien sans contrôle humain.",
                  "Visible stages follow an Exportunity review. Grouping, sourcing, or technical review never triggers anything without human control.",
                )}
              </p>

              {workspace.challenges.length ? (
                <div className="mt-5 space-y-3">
                  {workspace.challenges.map((challenge) => (
                    <article
                      key={challenge.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950 dark:text-white">
                            {challenge.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {[
                              challenge.requirementReferenceCode,
                              challenge.categoryCode,
                            ]
                              .filter(Boolean)
                              .join(" - ")}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-md px-2 py-1 text-xs font-semibold",
                            challengeStatusClass(challenge.status),
                          )}
                        >
                          {challengeStatusLabel(language, challenge.status)}
                        </span>
                      </div>
                      {challenge.productionStopped ? (
                        <p className="mt-3 inline-flex rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-300/15 dark:text-amber-100">
                          {messageFor(
                            language,
                            "Production dégradée ou arrêtée",
                            "Production degraded or stopped",
                          )}
                        </p>
                      ) : null}
                      {challenge.impactText ? (
                        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {challenge.impactText}
                        </p>
                      ) : null}
                      {challenge.resolutionNotes ? (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm leading-6 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100">
                          {challenge.resolutionNotes}
                        </div>
                      ) : null}
                      <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-3 dark:border-white/10 dark:bg-slate-950/30">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                              {messageFor(
                                language,
                                "Preuves techniques privees",
                                "Private technical evidence",
                              )}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                              {messageFor(
                                language,
                                "Plans, photos, rapports et fichiers CAD sont visibles uniquement par votre equipe et les reviseurs Exportunity.",
                                "Drawings, photos, reports, and CAD files are visible only to your team and Exportunity reviewers.",
                              )}
                            </p>
                          </div>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                            {challenge.attachmentCount}/5
                          </span>
                        </div>
                        {challenge.attachments.length ? (
                          <div className="mt-3 space-y-2">
                            {challenge.attachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-2.5 py-2 dark:border-white/10"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                    {attachment.fileName}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {attachment.mimeType} ·{" "}
                                    {technicalEvidenceSize(
                                      attachment.sizeBytes,
                                    )}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void downloadChallengeAttachment(
                                      challenge,
                                      attachment,
                                    )
                                  }
                                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 hover:border-[#F5A623] hover:text-[#9d5b00] dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  {messageFor(language, "Ouvrir", "Open")}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <label
                          htmlFor={`challenge-evidence-${challenge.id}`}
                          className={cn(
                            "mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:border-[#F5A623] hover:text-[#9d5b00] dark:border-white/15 dark:bg-white/5 dark:text-slate-100",
                            (uploadingChallengeId === challenge.id ||
                              ["resolved", "declined", "closed"].includes(
                                challenge.status,
                              )) &&
                              "cursor-not-allowed opacity-50",
                          )}
                        >
                          <FileUp className="h-3.5 w-3.5" />
                          {uploadingChallengeId === challenge.id
                            ? messageFor(language, "Ajout...", "Adding...")
                            : messageFor(
                                language,
                                "Ajouter un fichier technique",
                                "Add technical file",
                              )}
                        </label>
                        <input
                          id={`challenge-evidence-${challenge.id}`}
                          type="file"
                          className="sr-only"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx,.dxf,.dwg,.step,.stp,.stl,.iges,.igs"
                          disabled={
                            uploadingChallengeId === challenge.id ||
                            ["resolved", "declined", "closed"].includes(
                              challenge.status,
                            )
                          }
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            event.target.value = "";
                            void uploadChallengeAttachment(challenge, file);
                          }}
                        />
                        {challengeAttachmentStatus[challenge.id] ? (
                          <div className="mt-3">
                            <StatusMessage
                              status={challengeAttachmentStatus[challenge.id]}
                            />
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                  {messageFor(
                    language,
                    "Aucun défi industriel n'est enregistré. Utilisez ce formulaire pour signaler les pannes récurrentes, pièces indisponibles, processus manuels ou besoins de fabrication locale.",
                    "No industrial challenge is recorded. Use this form for recurring failures, unavailable parts, manual processes, or local-manufacturing needs.",
                  )}
                </div>
              )}
            </aside>
          </section>

          <section
            id="factory-recurring"
            className="grid scroll-mt-28 gap-7 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]"
          >
            <form
              onSubmit={submitRecurringRequirement}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <ClipboardList className="mt-0.5 h-5 w-5 text-[#a96f0b]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                    {messageFor(
                      language,
                      "Approvisionnement recurrent",
                      "Recurring procurement",
                    )}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {messageFor(
                      language,
                      "Planifier un besoin regulier",
                      "Plan a repeat requirement",
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {messageFor(
                      language,
                      "Le plan cree un suivi et une revue. Il ne cree jamais de commande, de paiement ou de message fournisseur automatiquement.",
                      "This plan creates follow-up and review only. It never creates an order, payment, or supplier message automatically.",
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Type de besoin", "Requirement type")}
                  </label>
                  <select
                    value={recurringDraft.requirementType}
                    onChange={(event) =>
                      setRecurringDraft((current) => ({
                        ...current,
                        requirementType: event.target
                          .value as RecurringRequirement["requirementType"],
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="raw_material">
                      {messageFor(language, "Matiere premiere", "Raw material")}
                    </option>
                    <option value="industrial_input">
                      {messageFor(
                        language,
                        "Intrant industriel",
                        "Industrial input",
                      )}
                    </option>
                    <option value="spare_part">
                      {messageFor(language, "Piece detachee", "Spare part")}
                    </option>
                    <option value="industrial_service">
                      {messageFor(
                        language,
                        "Service industriel",
                        "Industrial service",
                      )}
                    </option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Categorie industrielle",
                      "Industrial category",
                    )}
                  </label>
                  <select
                    required
                    value={recurringDraft.categoryCode}
                    onChange={(event) =>
                      setRecurringDraft((current) => ({
                        ...current,
                        categoryCode: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">
                      {messageFor(
                        language,
                        "Selectionnez une categorie",
                        "Select a category",
                      )}
                    </option>
                    {recurringCategories.map((category) => (
                      <option key={category.code} value={category.code}>
                        {category.label[language]}
                      </option>
                    ))}
                  </select>
                </div>
                {workspace.machines.length ? (
                  <details className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {messageFor(
                        language,
                        "Lier a un actif technique",
                        "Link to a technical asset",
                      )}
                    </summary>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {messageFor(
                        language,
                        "Facultatif. Le lien reste prive et aide Exportunity a qualifier exactement la piece, le service ou l'intrant recurrent.",
                        "Optional. This private link helps Exportunity qualify the exact part, service, or recurring input.",
                      )}
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Machine", "Machine")}
                        </label>
                        <select
                          value={recurringDraft.machineId}
                          onChange={(event) =>
                            setRecurringDraft((current) => ({
                              ...current,
                              machineId: event.target.value,
                              assemblyId: "",
                              componentId: "",
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="">
                            {messageFor(
                              language,
                              "Aucune machine",
                              "No machine",
                            )}
                          </option>
                          {workspace.machines.map((machine) => (
                            <option key={machine.id} value={machine.id}>
                              {machine.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Sous-ensemble", "Assembly")}
                        </label>
                        <select
                          disabled={!recurringDraft.machineId}
                          value={recurringDraft.assemblyId}
                          onChange={(event) =>
                            setRecurringDraft((current) => ({
                              ...current,
                              assemblyId: event.target.value,
                              componentId: "",
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="">
                            {messageFor(
                              language,
                              "Non renseigne",
                              "Not specified",
                            )}
                          </option>
                          {workspace.assemblies
                            .filter(
                              (assembly) =>
                                assembly.machineId === recurringDraft.machineId,
                            )
                            .map((assembly) => (
                              <option key={assembly.id} value={assembly.id}>
                                {assembly.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          {messageFor(language, "Composant", "Component")}
                        </label>
                        <select
                          disabled={!recurringDraft.machineId}
                          value={recurringDraft.componentId}
                          onChange={(event) =>
                            setRecurringDraft((current) => ({
                              ...current,
                              componentId: event.target.value,
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="">
                            {messageFor(
                              language,
                              "Non renseigne",
                              "Not specified",
                            )}
                          </option>
                          {workspace.components
                            .filter(
                              (component) =>
                                component.machineId ===
                                  recurringDraft.machineId &&
                                (!recurringDraft.assemblyId ||
                                  component.assemblyId ===
                                    recurringDraft.assemblyId),
                            )
                            .map((component) => (
                              <option key={component.id} value={component.id}>
                                {[component.name, component.partNumber]
                                  .filter(Boolean)
                                  .join(" - ")}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </details>
                ) : null}
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Produit ou fourniture",
                      "Product or supply",
                    )}
                  </label>
                  <input
                    required
                    minLength={3}
                    maxLength={240}
                    value={recurringDraft.title}
                    onChange={(event) =>
                      setRecurringDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Ex. huile hydraulique ISO 46",
                      "E.g. ISO 46 hydraulic oil",
                    )}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Quantite", "Quantity")}
                  </label>
                  <input
                    maxLength={200}
                    value={recurringDraft.quantityText}
                    onChange={(event) =>
                      setRecurringDraft((current) => ({
                        ...current,
                        quantityText: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Ex. 20 futs",
                      "E.g. 20 drums",
                    )}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Frequence", "Frequency")}
                  </label>
                  <select
                    value={recurringDraft.frequency}
                    onChange={(event) =>
                      setRecurringDraft((current) => ({
                        ...current,
                        frequency: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="weekly">
                      {messageFor(language, "Hebdomadaire", "Weekly")}
                    </option>
                    <option value="monthly">
                      {messageFor(language, "Mensuelle", "Monthly")}
                    </option>
                    <option value="quarterly">
                      {messageFor(language, "Trimestrielle", "Quarterly")}
                    </option>
                    <option value="annual">
                      {messageFor(language, "Annuelle", "Annual")}
                    </option>
                    <option value="custom">
                      {messageFor(
                        language,
                        "Selon planning",
                        "Custom schedule",
                      )}
                    </option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Seuil de reapprovisionnement",
                      "Reorder threshold",
                    )}
                  </label>
                  <input
                    maxLength={240}
                    value={recurringDraft.reorderThreshold}
                    onChange={(event) =>
                      setRecurringDraft((current) => ({
                        ...current,
                        reorderThreshold: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Ex. sous 5 futs",
                      "E.g. below 5 drums",
                    )}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {messageFor(language, "Prochaine revue", "Next review")}
                  </label>
                  <input
                    type="date"
                    value={recurringDraft.nextReviewAt}
                    onChange={(event) =>
                      setRecurringDraft((current) => ({
                        ...current,
                        nextReviewAt: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {messageFor(
                      language,
                      "Note operationnelle",
                      "Operational note",
                    )}
                  </label>
                  <textarea
                    rows={3}
                    maxLength={6000}
                    value={recurringDraft.details}
                    onChange={(event) =>
                      setRecurringDraft((current) => ({
                        ...current,
                        details: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={messageFor(
                      language,
                      "Specification, condition de stockage ou information utile pour la revue.",
                      "Specification, storage condition, or context useful for review.",
                    )}
                  />
                </div>
              </div>

              <details className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {messageFor(
                    language,
                    "Fournisseurs, contrat et validation",
                    "Suppliers, contract, and approval",
                  )}
                </summary>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Fournisseur prefere",
                        "Preferred supplier",
                      )}
                    </label>
                    <input
                      maxLength={240}
                      value={recurringDraft.preferredSupplier}
                      onChange={(event) =>
                        setRecurringDraft((current) => ({
                          ...current,
                          preferredSupplier: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Fournisseur alternatif",
                        "Alternative supplier",
                      )}
                    </label>
                    <input
                      maxLength={240}
                      value={recurringDraft.alternativeSupplier}
                      onChange={(event) =>
                        setRecurringDraft((current) => ({
                          ...current,
                          alternativeSupplier: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Livraison preferee",
                        "Preferred delivery",
                      )}
                    </label>
                    <input
                      maxLength={240}
                      value={recurringDraft.preferredDeliveryDate}
                      onChange={(event) =>
                        setRecurringDraft((current) => ({
                          ...current,
                          preferredDeliveryDate: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={messageFor(
                        language,
                        "Ex. le premier lundi",
                        "E.g. first Monday",
                      )}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Periode d'accord prix",
                        "Price agreement period",
                      )}
                    </label>
                    <input
                      maxLength={240}
                      value={recurringDraft.priceAgreementPeriod}
                      onChange={(event) =>
                        setRecurringDraft((current) => ({
                          ...current,
                          priceAgreementPeriod: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={messageFor(
                        language,
                        "Ex. 12 mois",
                        "E.g. 12 months",
                      )}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Debut du contrat",
                        "Contract start",
                      )}
                    </label>
                    <input
                      type="date"
                      value={recurringDraft.contractStartAt}
                      onChange={(event) =>
                        setRecurringDraft((current) => ({
                          ...current,
                          contractStartAt: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {messageFor(language, "Fin du contrat", "Contract end")}
                    </label>
                    <input
                      type="date"
                      value={recurringDraft.contractEndAt}
                      onChange={(event) =>
                        setRecurringDraft((current) => ({
                          ...current,
                          contractEndAt: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      {messageFor(
                        language,
                        "Circuit de validation",
                        "Approval workflow",
                      )}
                    </label>
                    <select
                      value={recurringDraft.approvalWorkflow}
                      onChange={(event) =>
                        setRecurringDraft((current) => ({
                          ...current,
                          approvalWorkflow: event.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="factory_owner_approval">
                        {messageFor(
                          language,
                          "Validation proprietaire",
                          "Factory owner approval",
                        )}
                      </option>
                      <option value="procurement_manager_approval">
                        {messageFor(
                          language,
                          "Validation achats",
                          "Procurement approval",
                        )}
                      </option>
                      <option value="account_manager_review">
                        {messageFor(
                          language,
                          "Revue Exportunity",
                          "Exportunity review",
                        )}
                      </option>
                    </select>
                  </div>
                  <label className="sm:col-span-2 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={recurringDraft.approvalRequired}
                      onChange={(event) =>
                        setRecurringDraft((current) => ({
                          ...current,
                          approvalRequired: event.target.checked,
                        }))
                      }
                      className="mt-0.5 h-4 w-4 accent-[#F5A623]"
                    />
                    {messageFor(
                      language,
                      "Une validation explicite reste requise avant tout engagement commercial.",
                      "Explicit approval remains required before any commercial commitment.",
                    )}
                  </label>
                </div>
              </details>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {messageFor(language, "Etat initial", "Initial status")}
                </label>
                <select
                  value={recurringDraft.status}
                  onChange={(event) =>
                    setRecurringDraft((current) => ({
                      ...current,
                      status: event.target.value as RecurringRequirementStatus,
                    }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20 dark:border-white/15 dark:bg-[#05070B] dark:text-white"
                >
                  <option value="draft">
                    {messageFor(language, "Brouillon", "Draft")}
                  </option>
                  <option value="active">
                    {messageFor(language, "Actif", "Active")}
                  </option>
                </select>
              </div>
              <div className="mt-5">
                <StatusMessage status={recurringStatus} />
              </div>
              <button
                type="submit"
                disabled={
                  recurringStatus.kind === "loading" ||
                  !recurringDraft.categoryCode
                }
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ClipboardList className="h-4 w-4" />
                {messageFor(
                  language,
                  "Enregistrer le plan recurrent",
                  "Save recurring plan",
                )}
              </button>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                {messageFor(
                  language,
                  "Suivi des besoins",
                  "Requirement follow-up",
                )}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                {messageFor(
                  language,
                  "Plans d'approvisionnement actifs",
                  "Recurring procurement plans",
                )}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {messageFor(
                  language,
                  "Activez, mettez en pause ou cloturez un plan. Les changements sont traces et ne declenchent aucune commande automatique.",
                  "Activate, pause, or close a plan. Changes are audited and do not trigger an automatic order.",
                )}
              </p>
              {workspace.recurringRequirements.length ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.1em] text-slate-500 dark:border-white/10 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-3">
                          {messageFor(language, "Besoin", "Requirement")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Cadence", "Cadence")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Revue", "Review")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Etat", "Status")}
                        </th>
                        <th className="px-3 py-3">
                          {messageFor(language, "Action", "Action")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.recurringRequirements.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-100 last:border-0 dark:border-white/[0.06]"
                        >
                          <td className="px-3 py-4">
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {item.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {[item.categoryCode, item.quantityText]
                                .filter(Boolean)
                                .join(" - ")}
                            </p>
                          </td>
                          <td className="px-3 py-4 text-slate-600 dark:text-slate-300">
                            {item.frequency}
                          </td>
                          <td className="px-3 py-4 text-slate-600 dark:text-slate-300">
                            {item.nextReviewAt
                              ? new Intl.DateTimeFormat(
                                  language === "fr" ? "fr-FR" : "en-GB",
                                  { dateStyle: "medium" },
                                ).format(new Date(item.nextReviewAt))
                              : messageFor(language, "A definir", "Not set")}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={cn(
                                "rounded-md px-2 py-1 text-xs font-semibold",
                                recurringStatusClass(item.status),
                              )}
                            >
                              {item.status === "active"
                                ? messageFor(language, "Actif", "Active")
                                : item.status === "paused"
                                  ? messageFor(language, "En pause", "Paused")
                                  : item.status === "closed"
                                    ? messageFor(language, "Cloture", "Closed")
                                    : messageFor(
                                        language,
                                        "Brouillon",
                                        "Draft",
                                      )}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            {item.status === "active" ? (
                              <button
                                type="button"
                                disabled={recurringStatus.kind === "loading"}
                                onClick={() =>
                                  void updateRecurringRequirementStatus(
                                    item,
                                    "paused",
                                  )
                                }
                                className="text-xs font-semibold text-[#8a5907] hover:text-[#F5A623] disabled:opacity-60"
                              >
                                {messageFor(
                                  language,
                                  "Mettre en pause",
                                  "Pause",
                                )}
                              </button>
                            ) : item.status === "draft" ||
                              item.status === "paused" ? (
                              <button
                                type="button"
                                disabled={recurringStatus.kind === "loading"}
                                onClick={() =>
                                  void updateRecurringRequirementStatus(
                                    item,
                                    "active",
                                  )
                                }
                                className="text-xs font-semibold text-[#8a5907] hover:text-[#F5A623] disabled:opacity-60"
                              >
                                {item.status === "paused"
                                  ? messageFor(language, "Reprendre", "Resume")
                                  : messageFor(language, "Activer", "Activate")}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-6 text-slate-600 dark:border-white/15 dark:bg-white/[0.035] dark:text-slate-300">
                  {messageFor(
                    language,
                    "Aucun plan recurrent n'est encore defini. Ajoutez les consommables, pieces ou services que votre usine doit revoir regulierement.",
                    "No recurring plan is defined yet. Add the consumables, parts, or services your factory needs to review regularly.",
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
