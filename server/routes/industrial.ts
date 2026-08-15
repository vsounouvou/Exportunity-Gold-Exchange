import { createReadStream, promises as fs } from "node:fs";
import { Router } from "express";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import multer from "multer";
import { z } from "zod";

import { db } from "@db";
import {
  actionRequests,
  industrialAuditLogs,
  industrialCatalogItems,
  industrialChallenges,
  industrialCommercialOffers,
  industrialFactoryClaims,
  industrialFactoryDocuments,
  industrialFactories,
  industrialFactoryRelationships,
  industrialLegacyProductReviews,
  industrialMachineAssemblies,
  industrialMachineComponents,
  industrialMachines,
  industrialOrders,
  industrialPartRecordDocuments,
  industrialPartRecords,
  industrialProductRequirements,
  industrialProductionLines,
  industrialRequirementAttachments,
  industrialRequirementMatches,
  industrialRequirementSupplierMatches,
  industrialRequirements,
  industrialRecurringRequirements,
  industrialQuotes,
  industrialSupplierQuotes,
  industrialSupplierProfiles,
  productCategories,
  sellerProducts,
  sellers,
} from "@db/schema";
import {
  ensureTenantAdmin,
  ensureTenantStaff,
  ensureTenantUser,
} from "./utils/auth";
import {
  INDUSTRIAL_REQUIREMENT_TYPES,
  INDUSTRIAL_TAXONOMY,
  isIndustrialCategoryCode,
  normalizeIndustrialText,
} from "../lib/industrial/taxonomy";
import { findPublicIndustrialCatalog } from "../lib/industrial/publicProductCatalog";
import { generateIndustrialIntakeReply } from "../lib/industrial/intakeAssistant";
import {
  industrialSearchRequirementContext,
  industrialSearchTerms,
} from "../lib/industrial/searchTerms";
import {
  canCancelFactoryClaim,
  canReviewFactoryClaim,
  INDUSTRIAL_FACTORY_CLAIM_STATUSES,
  nextFactoryClaimStatus,
} from "../lib/industrial/factoryClaims";
import {
  canTransitionFactoryRelationshipStage,
  INDUSTRIAL_FACTORY_RELATIONSHIP_STAGES,
  nextFactoryRelationshipStages,
} from "../lib/industrial/factoryRelationships";
import {
  canTransitionIndustrialQuote,
  classificationForRequirementType,
  INDUSTRIAL_CATALOG_STATUSES,
  INDUSTRIAL_QUOTE_STATUSES,
  INDUSTRIAL_REQUIREMENT_MATCH_STATUSES,
} from "../lib/industrial/workflow";
import {
  canTransitionIndustrialRequirement,
  deriveIndustrialRequirementLifecycle,
  INDUSTRIAL_REQUIREMENT_CLOSURE_OUTCOMES,
  INDUSTRIAL_REQUIREMENT_COMMERCIAL_PHASES,
  INDUSTRIAL_REQUIREMENT_STATUSES,
  nextIndustrialRequirementStatuses,
} from "../lib/industrial/requirementPipeline";
import {
  canTransitionIndustrialOrder,
  INDUSTRIAL_ORDER_STATUSES,
} from "../lib/industrial/orders";
import {
  canTransitionRecurringRequirement,
  INDUSTRIAL_RECURRING_REQUIREMENT_STATUSES,
  INDUSTRIAL_RECURRING_REQUIREMENT_TYPES,
} from "../lib/industrial/recurringRequirements";
import {
  canTransitionIndustrialChallenge,
  INDUSTRIAL_CHALLENGE_OUTCOMES,
  INDUSTRIAL_CHALLENGE_PROBLEM_TYPES,
  INDUSTRIAL_CHALLENGE_REQUIREMENT_TYPES,
  INDUSTRIAL_CHALLENGE_STATUSES,
  isOpenIndustrialChallenge,
  nextIndustrialChallengeStatuses,
  requirementStatusForIndustrialChallenge,
  suggestIndustrialChallengeGroupKey,
} from "../lib/industrial/challenges";
import {
  canFinalizeIndustrialPartRoute,
  canTransitionIndustrialPartRecord,
  industrialPartRecordNextAction,
  INDUSTRIAL_PART_RECORD_DOCUMENT_TYPES,
  INDUSTRIAL_PART_RECORD_STATUSES,
  INDUSTRIAL_PART_ROUTE_DECISIONS,
  nextIndustrialPartRecordStatuses,
} from "../lib/industrial/partRecords";
import { resolveTechnicalHierarchy } from "../lib/industrial/technicalHierarchy";
import {
  createIndustrialRequirementAttachmentUploadToken,
  INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_BYTES,
  INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES,
  INDUSTRIAL_REQUIREMENT_ATTACHMENT_UPLOAD_TTL_MS,
  matchesIndustrialRequirementAttachmentUploadToken,
  persistIndustrialRequirementAttachment,
  resolveIndustrialRequirementAttachment,
  validateIndustrialRequirementAttachment,
} from "../lib/industrial/requirementAttachments";
import {
  persistIndustrialPartRecordDocument,
  resolveIndustrialPartRecordDocument,
} from "../lib/industrial/partRecordDocuments";
import {
  buildIndustrialFactoryDocumentGaps,
  INDUSTRIAL_FACTORY_DOCUMENT_TYPES,
  persistIndustrialFactoryDocument,
  resolveIndustrialFactoryDocument,
} from "../lib/industrial/factoryDocuments";
import { buildIndustrialFactoryDashboard } from "../lib/industrial/factoryDashboard";
import {
  googlePlacesRuntimeStatus,
  googleTextSearch,
} from "../lib/google/placesClient";
import { resolveGoogleSettingsScope } from "../lib/google/placesSettings";
import {
  INDUSTRIAL_FACTORY_LEAD_STATUSES,
  mapGooglePlacesToIndustrialFactoryLeads,
} from "../lib/industrial/factoryLeadIntake";
import {
  INDUSTRIAL_OUTREACH_BASES,
  INDUSTRIAL_OUTREACH_CHANNELS,
} from "../lib/industrial/factoryLeadOutreach";
import {
  BENIN_INDUSTRIAL_PROSPECTS,
  beninIndustrialProspectSummary,
  findBeninIndustrialProspects,
  mapBeninIndustrialProspectsToFactoryLeads,
} from "../lib/industrial/beninIndustrialProspects";
import {
  convertIndustrialFactoryLead,
  importIndustrialFactoryLeads,
  listIndustrialFactoryLeads,
  reviewIndustrialFactoryLead,
} from "../lib/industrial/factoryLeadRepository";
import {
  INDUSTRIAL_SUPPLIER_NDA_STATUSES,
  INDUSTRIAL_SUPPLIER_STATUSES,
  isSupplierEligibleForCapabilityMatching,
  nextIndustrialSupplierReviewState,
  normalizeIndustrialSupplierProfileInput,
  scoreIndustrialSupplierCapabilityMatch,
} from "../lib/industrial/supplierCapabilities";
import {
  buildIndustrialDemandSignals,
  calculateIndustrialQuoteDecisionMetrics,
  INDUSTRIAL_OPEN_REQUIREMENT_STATUSES,
  rankRecordedSupplierPerformance,
  summarizeIndustrialCommercialValues,
} from "../lib/industrial/intelligence";
import {
  classificationForApprovedLegacyProductReviewStatus,
  INDUSTRIAL_LEGACY_PRODUCT_REVIEW_STATUSES,
  normalizeLegacyProductName,
  recommendLegacyProductReview,
} from "../lib/industrial/legacyProductReview";
import { createIndustrialRequirementOperationsHandoff } from "../lib/industrial/operationsHandoff";
import {
  loadIndustrialOpportunityExecutions,
  nextActionForIndustrialExecution,
  type IndustrialOpportunityExecution,
} from "../lib/industrial/opportunityExecution";
import {
  COMMERCIAL_ACTION_MODES,
  COMMERCIAL_INTENTS,
  resolveCommercialQualification,
} from "../lib/industrial/commercialIntentEngine";
import { proposeCommercialStaffing } from "../lib/industrial/workforcePlanning";
import {
  discoverVerifiedCommercialSuppliers,
  ensureIndustrialCustomerContact,
} from "../lib/industrial/commercialExecution";
import {
  buildCustomerQuoteSnapshot,
  buildIndustrialRfqMessage,
  calculateIndustrialCommercialPricing,
} from "../lib/industrial/commercialPricing";
import { createActionRequest } from "../lib/actions/ActionRouter";
import {
  queueIndustrialOpportunityAgentWork,
  queueIndustrialOpportunityWorkstream,
  type QueuedIndustrialAgentWork,
} from "../lib/industrial/agentWorkExecution";
import { externalCommunicationsEnabled } from "../lib/actions/externalCommunications";
import {
  updateTaskStatus,
  type TaskStatus,
} from "../lib/taskLifecycleService";

const router = Router();

const PUBLIC_SUBMISSION_LIMIT = 8;
const PUBLIC_SUBMISSION_WINDOW_MS = 60 * 60 * 1000;
const submissionWindows = new Map<string, { count: number; resetAt: number }>();
const PUBLIC_INTAKE_PREVIEW_LIMIT = 24;
const intakePreviewWindows = new Map<
  string,
  { count: number; resetAt: number }
>();
const PUBLIC_ATTACHMENT_UPLOAD_LIMIT = 24;
const publicAttachmentUploadWindows = new Map<
  string,
  { count: number; resetAt: number }
>();
const FACTORY_CLAIM_LIMIT = 4;
const FACTORY_CLAIM_WINDOW_MS = 60 * 60 * 1000;
const INDUSTRIAL_FACTORY_DOCUMENT_MAX_FILES = 80;
const INDUSTRIAL_PART_RECORD_DOCUMENT_MAX_FILES = 12;
const factoryClaimWindows = new Map<
  string,
  { count: number; resetAt: number }
>();
const industrialRequirementAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_BYTES, files: 1 },
});

function handleIndustrialRequirementAttachmentUpload(
  req: any,
  res: any,
  next: any,
) {
  industrialRequirementAttachmentUpload.single("file")(
    req,
    res,
    (error: any) => {
      if (!error) return next();
      if (
        error instanceof multer.MulterError &&
        error.code === "LIMIT_FILE_SIZE"
      ) {
        return res.status(413).json({
          ok: false,
          message: "Each technical document must be 15 MB or smaller.",
        });
      }
      return res.status(400).json({
        ok: false,
        message: "The technical document upload could not be processed.",
      });
    },
  );
}

const FACTORY_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "active",
  "suspended",
  "archived",
] as const;
const REQUIREMENT_STATUSES = INDUSTRIAL_REQUIREMENT_STATUSES;
const CATALOG_STATUSES = INDUSTRIAL_CATALOG_STATUSES;
const MATCH_STATUSES = INDUSTRIAL_REQUIREMENT_MATCH_STATUSES;
const SUPPLIER_STATUSES = INDUSTRIAL_SUPPLIER_STATUSES;
const SUPPLIER_NDA_STATUSES = INDUSTRIAL_SUPPLIER_NDA_STATUSES;
const QUOTE_STATUSES = INDUSTRIAL_QUOTE_STATUSES;
const ORDER_STATUSES = INDUSTRIAL_ORDER_STATUSES;
const ACTIVE_INDUSTRIAL_ORDER_STATUSES = [
  "confirmed",
  "procurement",
  "manufacturing",
  "quality_control",
  "delivery",
] as const;
const FACTORY_CLAIM_STATUSES = INDUSTRIAL_FACTORY_CLAIM_STATUSES;
const RECURRING_REQUIREMENT_STATUSES =
  INDUSTRIAL_RECURRING_REQUIREMENT_STATUSES;
const LEGACY_PRODUCT_REVIEW_STATUSES =
  INDUSTRIAL_LEGACY_PRODUCT_REVIEW_STATUSES;
const CATALOG_CLASSIFICATIONS = [
  "export_ready_factory_product",
  "machinery",
  "raw_material",
  "industrial_input",
  "spare_part",
  "industrial_service",
] as const;

const factoryProductionLineSchema = z.object({
  name: z.string().trim().min(2).max(180),
  industry: z.string().trim().max(180).optional().nullable(),
  purpose: z.string().trim().max(500).optional().nullable(),
  operatingStatus: z
    .enum(["operational", "partially_operational", "maintenance", "unknown"])
    .default("unknown"),
});

const factoryMachineSchema = z.object({
  name: z.string().trim().min(2).max(180),
  manufacturer: z.string().trim().max(180).optional().nullable(),
  model: z.string().trim().max(180).optional().nullable(),
  machineCategory: z.string().trim().max(180).optional().nullable(),
  productionLineIndex: z.number().int().min(0).optional().nullable(),
  operatingStatus: z
    .enum(["operational", "partially_operational", "maintenance", "unknown"])
    .default("unknown"),
});

const factoryAssemblySchema = z.object({
  name: z.string().trim().min(2).max(180),
  assemblyType: z.string().trim().max(180).optional().nullable(),
  machineIndex: z.number().int().min(0),
  operatingStatus: z
    .enum(["operational", "partially_operational", "maintenance", "unknown"])
    .default("unknown"),
});

const factoryComponentSchema = z.object({
  name: z.string().trim().min(2).max(180),
  componentType: z.string().trim().max(180).optional().nullable(),
  partNumber: z.string().trim().max(180).optional().nullable(),
  manufacturer: z.string().trim().max(180).optional().nullable(),
  model: z.string().trim().max(180).optional().nullable(),
  criticality: z
    .enum(["standard", "important", "critical"])
    .default("standard"),
  machineIndex: z.number().int().min(0),
  assemblyIndex: z.number().int().min(0).optional().nullable(),
  operatingStatus: z
    .enum(["operational", "partially_operational", "maintenance", "unknown"])
    .default("unknown"),
});

const industrialOperatingStatusSchema = z.enum([
  "operational",
  "partially_operational",
  "maintenance",
  "unknown",
]);
const industrialComponentCriticalitySchema = z.enum([
  "standard",
  "important",
  "critical",
]);

const factoryMachineTechnicalDetailsSchema = z
  .object({
    brand: z.string().trim().max(180).optional().nullable(),
    purpose: z.string().trim().max(500).optional().nullable(),
    countryOfOrigin: z.string().trim().max(120).optional().nullable(),
    manufactureYear: z.string().trim().max(12).optional().nullable(),
    installationDate: z.string().trim().max(80).optional().nullable(),
    powerRating: z.string().trim().max(120).optional().nullable(),
    capacity: z.string().trim().max(180).optional().nullable(),
    supplier: z.string().trim().max(240).optional().nullable(),
    warranty: z.string().trim().max(240).optional().nullable(),
    maintenanceSchedule: z.string().trim().max(500).optional().nullable(),
  })
  .default({});

const ownedTechnicalAssetSchema = z.discriminatedUnion("assetType", [
  z.object({
    assetType: z.literal("production_line"),
    name: z.string().trim().min(2).max(180),
    industry: z.string().trim().max(180).optional().nullable(),
    purpose: z.string().trim().max(500).optional().nullable(),
    operatingStatus: industrialOperatingStatusSchema.default("unknown"),
  }),
  z.object({
    assetType: z.literal("machine"),
    name: z.string().trim().min(2).max(180),
    manufacturer: z.string().trim().max(180).optional().nullable(),
    model: z.string().trim().max(180).optional().nullable(),
    serialNumber: z.string().trim().max(180).optional().nullable(),
    machineCategory: z.string().trim().max(180).optional().nullable(),
    productionLineId: z.string().uuid().optional().nullable(),
    operatingStatus: industrialOperatingStatusSchema.default("unknown"),
    technicalDetails: factoryMachineTechnicalDetailsSchema,
  }),
  z.object({
    assetType: z.literal("assembly"),
    name: z.string().trim().min(2).max(180),
    machineId: z.string().uuid(),
    assemblyType: z.string().trim().max(180).optional().nullable(),
    operatingStatus: industrialOperatingStatusSchema.default("unknown"),
  }),
  z.object({
    assetType: z.literal("component"),
    name: z.string().trim().min(2).max(180),
    machineId: z.string().uuid(),
    assemblyId: z.string().uuid().optional().nullable(),
    componentType: z.string().trim().max(180).optional().nullable(),
    partNumber: z.string().trim().max(180).optional().nullable(),
    manufacturer: z.string().trim().max(180).optional().nullable(),
    model: z.string().trim().max(180).optional().nullable(),
    criticality: industrialComponentCriticalitySchema.default("standard"),
    operatingStatus: industrialOperatingStatusSchema.default("unknown"),
  }),
]);

type OwnedTechnicalAssetInput = z.infer<typeof ownedTechnicalAssetSchema>;

const factoryRegistrationSchema = z.object({
  legalName: z.string().trim().min(2).max(240),
  displayName: z.string().trim().min(2).max(240).optional(),
  registrationNumber: z.string().trim().max(160).optional().nullable(),
  countryCode: z
    .string()
    .trim()
    .min(2)
    .max(3)
    .transform((value) => value.toUpperCase()),
  region: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().max(160).optional().nullable(),
  industrialZone: z.string().trim().max(160).optional().nullable(),
  publicAddress: z.string().trim().max(500).optional().nullable(),
  primaryIndustry: z.string().trim().min(2).max(180),
  publicDescription: z.string().trim().max(1600).optional().nullable(),
  contactName: z.string().trim().min(2).max(180),
  contactEmail: z.string().trim().email().max(240),
  contactPhone: z.string().trim().max(80).optional().nullable(),
  website: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("")),
  foundingYear: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .optional()
    .nullable()
    .or(z.literal("")),
  employeeRange: z.string().trim().max(120).optional().nullable(),
  factorySize: z.string().trim().max(180).optional().nullable(),
  productionCapacity: z.string().trim().max(500).optional().nullable(),
  productsManufactured: z
    .array(z.string().trim().min(2).max(180))
    .max(30)
    .optional()
    .default([]),
  exportMarkets: z
    .array(z.string().trim().min(2).max(120))
    .max(30)
    .optional()
    .default([]),
  certifications: z
    .array(z.string().trim().min(2).max(180))
    .max(30)
    .optional()
    .default([]),
  rawMaterials: z
    .array(z.string().trim().min(2).max(180))
    .max(40)
    .optional()
    .default([]),
  industrialInputs: z
    .array(z.string().trim().min(2).max(180))
    .max(40)
    .optional()
    .default([]),
  recurringSpareParts: z
    .array(z.string().trim().min(2).max(180))
    .max(40)
    .optional()
    .default([]),
  procurementFrequency: z.string().trim().max(120).optional().nullable(),
  productionLines: z
    .array(factoryProductionLineSchema)
    .max(20)
    .optional()
    .default([]),
  principalMachines: z
    .array(factoryMachineSchema)
    .max(80)
    .optional()
    .default([]),
  assemblies: z.array(factoryAssemblySchema).max(160).optional().default([]),
  components: z.array(factoryComponentSchema).max(500).optional().default([]),
});

const industrialRequirementSchema = z.object({
  requirementType: z.enum(INDUSTRIAL_REQUIREMENT_TYPES),
  categoryCode: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(240),
  details: z.string().trim().min(10).max(6000),
  quantityText: z.string().trim().max(200).optional().nullable(),
  deliveryCountryCode: z
    .string()
    .trim()
    .min(2)
    .max(3)
    .transform((value) => value.toUpperCase())
    .optional()
    .nullable(),
  deliveryCity: z.string().trim().max(160).optional().nullable(),
  requiredBy: z.string().trim().max(80).optional().nullable(),
  urgency: z.enum(["standard", "urgent", "planned"]).default("standard"),
  requesterCompany: z.string().trim().max(240).optional().nullable(),
  requesterName: z.string().trim().min(2).max(180),
  requesterEmail: z.string().trim().email().max(240).optional().nullable(),
  requesterPhone: z
    .string()
    .trim()
    .min(8)
    .max(80)
    .refine((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 8 && digits.length <= 15;
    }, "Provide a valid international phone number.")
    .optional()
    .nullable(),
  factoryId: z.string().uuid().optional().nullable(),
  technicalDetails: z
    .record(z.string(), z.string().trim().max(600))
    .optional()
    .default({}),
  commercialContext: z
    .object({
      intent: z.enum(COMMERCIAL_INTENTS),
      confidence: z.number().min(0).max(1).optional().default(0),
      suggestedAction: z.enum(COMMERCIAL_ACTION_MODES),
      product: z
        .object({
          name: z.string().trim().max(240).optional(),
          category: z.string().trim().max(160).optional(),
          specification: z.string().trim().max(600).optional(),
          quantity: z.string().trim().max(160).optional(),
          unit: z.string().trim().max(80).optional(),
        })
        .optional()
        .default({}),
      origin: z.string().trim().max(240).optional(),
      destination: z.string().trim().max(240).optional(),
      targetPrice: z.string().trim().max(160).optional(),
      currency: z.string().trim().max(16).optional(),
      deadline: z.string().trim().max(160).optional(),
      frequency: z.string().trim().max(160).optional(),
      incoterm: z.string().trim().max(16).optional(),
      customerType: z.string().trim().max(160).optional(),
      missingFields: z.array(z.string().trim().max(120)).max(30).default([]),
      sourceConversationId: z.string().trim().max(160).optional(),
    })
    .optional(),
}).refine(
  (value) => Boolean(value.requesterEmail || value.requesterPhone),
  {
    message: "Provide an email address or WhatsApp phone number.",
    path: ["requesterEmail"],
  },
);

const factoryReviewSchema = z.object({
  action: z.enum(["verify", "request_changes", "suspend", "archive"]),
  publicVisibility: z
    .enum([
      "public",
      "verified_users_only",
      "parties_to_transaction",
      "factory_team_only",
      "exportunity_internal",
      "admin_only",
    ])
    .optional(),
  reason: z.string().trim().min(2).max(1200),
  adminNotes: z.string().trim().max(6000).optional().nullable(),
  assignToSelf: z.boolean().optional().default(false),
});

const factoryRelationshipUpdateSchema = z
  .object({
    stage: z.enum(INDUSTRIAL_FACTORY_RELATIONSHIP_STAGES).optional(),
    nextAction: z.string().trim().max(600).optional().nullable(),
    nextReviewAt: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    internalNotes: z.string().trim().max(6000).optional().nullable(),
    assignToSelf: z.boolean().optional().default(false),
    recordContact: z.boolean().optional().default(false),
    contactSummary: z.string().trim().min(4).max(1200).optional().nullable(),
  })
  .refine(
    (value) =>
      value.stage !== undefined ||
      value.nextAction !== undefined ||
      value.nextReviewAt !== undefined ||
      value.internalNotes !== undefined ||
      value.assignToSelf ||
      value.recordContact,
    {
      message: "Provide at least one relationship update.",
    },
  )
  .refine(
    (value) => !value.recordContact || Boolean(value.contactSummary?.trim()),
    {
      message: "A completed contact requires a brief internal summary.",
      path: ["contactSummary"],
    },
  );

const requirementTriageSchema = z.object({
  status: z.enum(REQUIREMENT_STATUSES),
  reviewNote: z.string().trim().min(2).max(6000),
  nextAction: z.string().trim().max(600).optional().nullable(),
  commercialPhase: z
    .enum(INDUSTRIAL_REQUIREMENT_COMMERCIAL_PHASES)
    .optional()
    .nullable(),
  closureOutcome: z
    .enum(INDUSTRIAL_REQUIREMENT_CLOSURE_OUTCOMES)
    .optional()
    .nullable(),
  assignToSelf: z.boolean().optional().default(false),
});

const industrialCatalogItemSchema = z.object({
  factoryId: z.string().uuid(),
  classification: z.enum([
    "export_ready_factory_product",
    "machinery",
    "raw_material",
    "industrial_input",
    "spare_part",
    "industrial_service",
  ]),
  categoryCode: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(240),
  publicDescription: z.string().trim().max(4000).optional().nullable(),
  productCode: z.string().trim().max(160).optional().nullable(),
  supplyModes: z
    .array(z.string().trim().min(2).max(120))
    .max(12)
    .optional()
    .default([]),
  priceMode: z
    .enum([
      "fixed_price",
      "price_range",
      "request_quotation",
      "technical_review_required",
      "contact_account_manager",
    ])
    .default("request_quotation"),
  availabilityStatus: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .default("subject_to_confirmation"),
  manufacturer: z.string().trim().max(180).optional().nullable(),
  brand: z.string().trim().max(180).optional().nullable(),
  model: z.string().trim().max(180).optional().nullable(),
  partNumber: z.string().trim().max(180).optional().nullable(),
  countryOfOrigin: z.string().trim().max(120).optional().nullable(),
  technicalSpecifications: z
    .record(z.string(), z.string().trim().max(1000))
    .optional()
    .default({}),
  application: z.string().trim().max(1600).optional().nullable(),
  compatibleMachinery: z
    .array(z.string().trim().min(2).max(180))
    .max(40)
    .optional()
    .default([]),
  material: z.string().trim().max(180).optional().nullable(),
  unitOfMeasure: z.string().trim().max(80).optional().nullable(),
  minimumOrderQuantity: z.string().trim().max(180).optional().nullable(),
  availableQuantityText: z.string().trim().max(180).optional().nullable(),
  productionCapacityText: z.string().trim().max(240).optional().nullable(),
  leadTimeText: z.string().trim().max(240).optional().nullable(),
  supplyFrequency: z.string().trim().max(160).optional().nullable(),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .optional()
    .nullable(),
  priceText: z.string().trim().max(240).optional().nullable(),
  certifications: z
    .array(z.string().trim().min(2).max(180))
    .max(30)
    .optional()
    .default([]),
  publicMedia: z
    .array(z.string().trim().min(1).max(500))
    .max(12)
    .optional()
    .default([]),
  privateMetadata: z
    .record(z.string(), z.string().trim().max(2000))
    .optional()
    .default({}),
});

const catalogReviewSchema = z.object({
  action: z.enum(["approve", "request_changes", "archive"]),
  publicVisibility: z
    .enum([
      "public",
      "verified_users_only",
      "parties_to_transaction",
      "factory_team_only",
      "exportunity_internal",
      "admin_only",
    ])
    .optional(),
  reason: z.string().trim().min(2).max(1200),
});

const legacyProductReviewSchema = z
  .object({
    reviewStatus: z.enum(LEGACY_PRODUCT_REVIEW_STATUSES),
    proposedClassification: z
      .enum(CATALOG_CLASSIFICATIONS)
      .optional()
      .nullable(),
    industrialCatalogItemId: z.string().uuid().optional().nullable(),
    duplicateOfLegacyProductId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .nullable(),
    reason: z.string().trim().min(2).max(2000),
  })
  .superRefine((value, context) => {
    if (
      value.reviewStatus === "DUPLICATE" &&
      !value.duplicateOfLegacyProductId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duplicateOfLegacyProductId"],
        message: "Select the retained legacy product for a duplicate review.",
      });
    }
  });

const industrialAssistantIntakeSchema = z.object({
  message: z.string().trim().min(10).max(6000),
  language: z.enum(["fr", "en"]).optional().default("fr"),
  requirementType: z.enum(INDUSTRIAL_REQUIREMENT_TYPES).optional(),
  agentMode: z
    .enum(["concierge", "commercial"])
    .optional()
    .default("concierge"),
});

const requirementMatchSchema = z.object({
  catalogItemId: z.string().uuid(),
  status: z.enum(MATCH_STATUSES).default("candidate"),
  matchScore: z.number().int().min(0).max(100).optional().nullable(),
  matchReason: z.string().trim().min(2).max(1600),
  internalNotes: z.string().trim().max(4000).optional().nullable(),
});

const requirementMatchUpdateSchema = z.object({
  status: z.enum(MATCH_STATUSES),
  matchScore: z.number().int().min(0).max(100).optional().nullable(),
  matchReason: z.string().trim().min(2).max(1600),
  internalNotes: z.string().trim().max(4000).optional().nullable(),
});

const industrialSupplierProfileSchema = z.object({
  linkedFactoryId: z.string().uuid().optional().nullable(),
  legalName: z.string().trim().min(2).max(240),
  displayName: z.string().trim().min(2).max(240).optional(),
  countryCode: z
    .string()
    .trim()
    .min(2)
    .max(3)
    .transform((value) => value.toUpperCase()),
  region: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().max(160).optional().nullable(),
  industrialZone: z.string().trim().max(160).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  website: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .email()
    .max(240)
    .optional()
    .nullable()
    .or(z.literal("")),
  phone: z.string().trim().max(80).optional().nullable(),
  industriesServed: z
    .array(z.string().trim().min(2).max(180))
    .max(50)
    .optional()
    .default([]),
  categoryCodes: z
    .array(z.string().trim().min(2).max(120))
    .max(50)
    .optional()
    .default([]),
  capabilities: z
    .array(z.string().trim().min(2).max(180))
    .max(80)
    .optional()
    .default([]),
  equipmentAvailable: z
    .array(z.string().trim().min(2).max(180))
    .max(100)
    .optional()
    .default([]),
  materialsHandled: z
    .array(z.string().trim().min(2).max(180))
    .max(80)
    .optional()
    .default([]),
  maximumDimensions: z.string().trim().max(500).optional().nullable(),
  tolerances: z.string().trim().max(500).optional().nullable(),
  productionCapacityText: z.string().trim().max(1000).optional().nullable(),
  certifications: z
    .array(z.string().trim().min(2).max(180))
    .max(50)
    .optional()
    .default([]),
  qualityControlCapability: z.string().trim().max(1200).optional().nullable(),
  leadTimeText: z.string().trim().max(240).optional().nullable(),
  previousPerformanceNotes: z.string().trim().max(4000).optional().nullable(),
  onTimeDeliveryRate: z.coerce.number().min(0).max(100).optional().nullable(),
  technicalDocumentReferences: z
    .array(z.string().trim().min(1).max(500))
    .max(50)
    .optional()
    .default([]),
  mediaReferences: z
    .array(z.string().trim().min(1).max(500))
    .max(50)
    .optional()
    .default([]),
  ndaStatus: z.enum(SUPPLIER_NDA_STATUSES).default("not_assessed"),
  adminNotes: z.string().trim().max(6000).optional().nullable(),
});

const industrialSupplierReviewSchema = z.object({
  action: z.enum(["request_changes", "approve", "suspend", "archive"]),
  reason: z.string().trim().min(2).max(1200),
  adminNotes: z.string().trim().max(6000).optional().nullable(),
});

const supplierCapabilityMatchSchema = z.object({
  supplierProfileId: z.string().uuid(),
  status: z.enum(MATCH_STATUSES).default("candidate"),
  matchReason: z.string().trim().min(2).max(1600),
  internalNotes: z.string().trim().max(4000).optional().nullable(),
});

const supplierCapabilityMatchUpdateSchema = z.object({
  status: z.enum(MATCH_STATUSES),
  matchReason: z.string().trim().min(2).max(1600),
  internalNotes: z.string().trim().max(4000).optional().nullable(),
});

const quoteLineItemSchema = z.object({
  description: z.string().trim().min(2).max(500),
  quantity: z.string().trim().max(120).optional().nullable(),
  unit: z.string().trim().max(80).optional().nullable(),
  amount: z.string().trim().max(120).optional().nullable(),
});

const industrialQuoteCreateSchema = z.object({
  requirementMatchId: z.string().uuid(),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .default("XOF"),
  totalAmount: z.coerce
    .number()
    .nonnegative()
    .max(99999999999999.99)
    .optional()
    .nullable(),
  lineItems: z.array(quoteLineItemSchema).max(30).optional().default([]),
  leadTimeText: z.string().trim().max(240).optional().nullable(),
  validUntil: z.string().trim().max(80).optional().nullable(),
  commercialTerms: z.string().trim().max(6000).optional().nullable(),
  customerNotes: z.string().trim().max(6000).optional().nullable(),
  internalNotes: z.string().trim().max(6000).optional().nullable(),
});

const industrialQuoteStatusSchema = z.object({
  status: z.enum(QUOTE_STATUSES),
  reason: z.string().trim().min(2).max(1200),
  customerNotes: z.string().trim().max(6000).optional().nullable(),
  internalNotes: z.string().trim().max(6000).optional().nullable(),
});

const industrialOrderCreateSchema = z.object({
  humanConfirmed: z.literal(true),
  confirmationNote: z.string().trim().min(2).max(1600),
  plannedDeliveryAt: z.string().trim().max(80).optional().nullable(),
});

const industrialOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z.string().trim().min(2).max(1600),
  plannedDeliveryAt: z.string().trim().max(80).optional().nullable(),
  deliveryNotes: z.string().trim().max(6000).optional().nullable(),
  internalNotes: z.string().trim().max(6000).optional().nullable(),
});

const industrialRfqDraftSchema = z
  .object({
    supplierMatchIds: z.array(z.string().uuid()).min(1).max(12),
    channel: z.enum(["email", "whatsapp"]).default("email"),
    language: z.enum(["fr", "en"]).default("fr"),
    message: z.string().trim().min(40).max(8000).optional(),
    whatsappOptInEvidence: z.string().trim().max(2000).optional(),
    contentSid: z.string().trim().max(160).optional(),
  })
  .superRefine((value, context) => {
    if (value.channel !== "whatsapp") return;
    if (value.supplierMatchIds.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supplierMatchIds"],
        message:
          "Prepare one WhatsApp draft at a time so its opt-in evidence belongs to one recipient.",
      });
    }
    if (!value.contentSid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentSid"],
        message: "An approved WhatsApp template SID is required.",
      });
    }
    if (!value.whatsappOptInEvidence || value.whatsappOptInEvidence.length < 12) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["whatsappOptInEvidence"],
        message: "Explicit WhatsApp opt-in evidence is required.",
      });
    }
  });

const industrialSupplierQuoteCreateSchema = z.object({
  supplierMatchId: z.string().uuid(),
  product: z.string().trim().max(240).optional(),
  specification: z.string().trim().max(2000).optional().nullable(),
  quantityText: z.string().trim().max(240).optional().nullable(),
  unit: z.string().trim().max(80).optional().nullable(),
  unitPrice: z.coerce.number().nonnegative().max(99999999999999.9999).optional().nullable(),
  totalCost: z.coerce.number().positive().max(99999999999999.99),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .default("XOF"),
  incoterm: z.string().trim().max(16).optional().nullable(),
  origin: z.string().trim().max(240).optional().nullable(),
  destination: z.string().trim().max(240).optional().nullable(),
  packaging: z.string().trim().max(500).optional().nullable(),
  minimumOrderQuantity: z.string().trim().max(240).optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
  paymentTerms: z.string().trim().max(2000).optional().nullable(),
  validUntil: z.string().trim().max(80).optional().nullable(),
  certifications: z.array(z.string().trim().min(1).max(180)).max(30).optional().default([]),
  sourceChannel: z.enum(["email", "whatsapp", "phone", "document", "manual"]).default("manual"),
  sourceText: z.string().trim().min(10).max(12000),
  internalNotes: z.string().trim().max(6000).optional().nullable(),
  humanReviewed: z.literal(true),
});

const industrialCommercialOfferCreateSchema = z.object({
  supplierQuoteIds: z.array(z.string().uuid()).min(1).max(20),
  additionalCosts: z
    .record(z.string().trim().min(1).max(120), z.coerce.number().nonnegative().max(99999999999999.99))
    .optional()
    .default({}),
  customerPrice: z.coerce.number().positive().max(99999999999999.99),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .default("XOF"),
  incoterm: z.string().trim().max(16).optional().nullable(),
  deliveryEstimate: z.string().trim().max(500).optional().nullable(),
  paymentTerms: z.string().trim().max(2000).optional().nullable(),
  offerValidUntil: z.string().trim().max(80).optional().nullable(),
  terms: z.string().trim().max(6000).optional().nullable(),
});

const industrialCommercialOfferApprovalSchema = z.object({
  humanApproved: z.literal(true),
  reason: z.string().trim().min(2).max(1600),
});

const factoryClaimSchema = z
  .object({
    relationship: z.enum([
      "factory_administrator",
      "managing_director",
      "procurement_manager",
      "authorized_representative",
      "factory_technician",
    ]),
    contactEmail: z
      .string()
      .trim()
      .email()
      .max(240)
      .optional()
      .nullable()
      .or(z.literal("")),
    contactPhone: z.string().trim().max(80).optional().nullable(),
    authorizationReference: z.string().trim().max(240).optional().nullable(),
    message: z.string().trim().min(12).max(2000),
  })
  .refine((value) => Boolean(value.contactEmail || value.contactPhone), {
    message:
      "Provide an email address or telephone number for this ownership claim.",
    path: ["contactEmail"],
  });

const factoryClaimReviewSchema = z.object({
  action: z.enum(["approve", "request_information", "reject"]),
  reason: z.string().trim().min(2).max(1600),
});

const industrialFactoryLeadSearchSchema = z.object({
  query: z.string().trim().min(3).max(240),
  city: z.string().trim().max(160).optional().nullable(),
  countryCode: z.string().trim().min(2).max(3).optional().nullable(),
  limit: z.number().int().min(1).max(20).optional().default(12),
});

const industrialFactoryLeadImportSchema =
  industrialFactoryLeadSearchSchema.extend({
    selectedGooglePlaceIds: z
      .array(z.string().trim().min(2).max(300))
      .min(1)
      .max(20),
  });

const beninIndustrialProspectImportSchema = z.object({
  selectedProspectIds: z
    .array(z.string().trim().min(3).max(160))
    .min(1)
    .max(100),
});

const industrialContactReadinessSchema = z.object({
  contactName: z.string().trim().min(2).max(180),
  contactRole: z.string().trim().min(2).max(180),
  channel: z.enum(INDUSTRIAL_OUTREACH_CHANNELS),
  contactPoint: z.string().trim().min(4).max(320),
  contactSourceUrl: z
    .string()
    .trim()
    .url()
    .max(600)
    .refine((value) => value.startsWith("https://"), {
      message: "Use an HTTPS source for the public business contact.",
    }),
  businessReason: z.string().trim().min(20).max(1600),
  complianceBasis: z.enum(INDUSTRIAL_OUTREACH_BASES),
  senderIdentity: z.string().trim().min(3).max(240),
  senderVerified: z.literal(true),
  approvalOwner: z.string().trim().min(2).max(240),
  language: z.enum(["fr", "en"]).default("fr"),
  draftMessage: z.string().trim().min(40).max(6000),
  suppressionChecked: z.literal(true),
  quietHoursChecked: z.literal(true),
  whatsappOptInEvidence: z.string().trim().max(2000).optional().nullable(),
});

const industrialFactoryLeadReviewSchema = z
  .object({
    leadStatus: z.enum([
      "new",
      "under_review",
      "qualified",
      "contact_ready",
      "rejected",
    ]),
    screeningNotes: z.string().trim().max(4000).optional().nullable(),
    contactReadiness: industrialContactReadinessSchema.optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.leadStatus === "contact_ready" && !value.contactReadiness) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactReadiness"],
        message:
          "A complete contact dossier is required before a lead can be marked contact ready.",
      });
    }
  });

const industrialFactoryLeadConversionSchema = z.object({
  legalName: z.string().trim().min(2).max(240).optional().nullable(),
  displayName: z.string().trim().min(2).max(240).optional().nullable(),
  primaryIndustry: z.string().trim().min(2).max(180),
  countryCode: z.string().trim().min(2).max(3),
  city: z.string().trim().max(160).optional().nullable(),
  region: z.string().trim().max(160).optional().nullable(),
  industrialZone: z.string().trim().max(160).optional().nullable(),
});

const ownedFactoryPublicProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(240),
  publicDescription: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .nullable()
    .or(z.literal("")),
  publicWebsite: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("")),
  publicEmail: z
    .string()
    .trim()
    .email()
    .max(240)
    .optional()
    .nullable()
    .or(z.literal("")),
  publicPhone: z.string().trim().max(80).optional().nullable(),
});

const ownedCatalogItemSchema = industrialCatalogItemSchema.omit({
  factoryId: true,
});

const recurringRequirementValuesSchema = z.object({
  requirementType: z.enum(INDUSTRIAL_RECURRING_REQUIREMENT_TYPES),
  categoryCode: z.string().trim().min(2).max(120),
  machineId: z.string().uuid().optional().nullable().or(z.literal("")),
  assemblyId: z.string().uuid().optional().nullable().or(z.literal("")),
  componentId: z.string().uuid().optional().nullable().or(z.literal("")),
  title: z.string().trim().min(3).max(240),
  details: z.string().trim().max(6000).optional().nullable(),
  quantityText: z.string().trim().max(200).optional().nullable(),
  frequency: z.string().trim().min(2).max(120),
  reorderThreshold: z.string().trim().max(240).optional().nullable(),
  preferredDeliveryDate: z.string().trim().max(240).optional().nullable(),
  preferredSupplier: z.string().trim().max(240).optional().nullable(),
  alternativeSupplier: z.string().trim().max(240).optional().nullable(),
  priceAgreementPeriod: z.string().trim().max(240).optional().nullable(),
  contractStartAt: z.string().trim().max(80).optional().nullable(),
  contractEndAt: z.string().trim().max(80).optional().nullable(),
  approvalWorkflow: z.enum([
    "factory_owner_approval",
    "procurement_manager_approval",
    "account_manager_review",
  ]),
  approvalRequired: z.boolean(),
  nextReviewAt: z.string().trim().max(80).optional().nullable(),
  internalNotes: z.string().trim().max(6000).optional().nullable(),
});

const recurringRequirementCreateSchema =
  recurringRequirementValuesSchema.extend({
    approvalWorkflow: z
      .enum([
        "factory_owner_approval",
        "procurement_manager_approval",
        "account_manager_review",
      ])
      .default("factory_owner_approval"),
    approvalRequired: z.boolean().default(true),
    status: z.enum(RECURRING_REQUIREMENT_STATUSES).default("draft"),
  });

const recurringRequirementUpdateSchema = recurringRequirementValuesSchema
  .partial()
  .extend({
    status: z.enum(RECURRING_REQUIREMENT_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one recurring requirement field to update.",
  });

const industrialChallengeCreateSchema = z.object({
  requirementType: z.enum(INDUSTRIAL_CHALLENGE_REQUIREMENT_TYPES),
  categoryCode: z.string().trim().min(2).max(120),
  machineId: z.string().uuid().optional().nullable().or(z.literal("")),
  assemblyId: z.string().uuid().optional().nullable().or(z.literal("")),
  componentId: z.string().uuid().optional().nullable().or(z.literal("")),
  title: z.string().trim().min(3).max(240),
  details: z.string().trim().min(8).max(6000),
  problemType: z.enum(INDUSTRIAL_CHALLENGE_PROBLEM_TYPES),
  productionStopped: z.boolean().default(false),
  impactText: z.string().trim().max(2000).optional().nullable(),
  recurrenceFrequency: z.string().trim().max(160).optional().nullable(),
  estimatedDowntime: z.string().trim().max(240).optional().nullable(),
  currentWorkaround: z.string().trim().max(2000).optional().nullable(),
  desiredOutcome: z
    .enum(INDUSTRIAL_CHALLENGE_OUTCOMES)
    .default("review_required"),
  urgency: z.enum(["standard", "urgent", "critical"]).default("standard"),
});

const industrialChallengeUpdateSchema = z
  .object({
    status: z.enum(INDUSTRIAL_CHALLENGE_STATUSES).optional(),
    outcome: z.enum(INDUSTRIAL_CHALLENGE_OUTCOMES).optional(),
    reviewNote: z.string().trim().max(6000).optional().nullable(),
    groupKey: z.string().trim().max(180).optional().nullable(),
    assignToSelf: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide a review update for the industrial challenge.",
  });

const industrialPartRecordCreateSchema = z.object({
  requirementType: z
    .enum(INDUSTRIAL_CHALLENGE_REQUIREMENT_TYPES)
    .default("spare_part"),
  categoryCode: z.string().trim().min(2).max(120),
  machineId: z.string().uuid().optional().nullable().or(z.literal("")),
  assemblyId: z.string().uuid().optional().nullable().or(z.literal("")),
  componentId: z.string().uuid().optional().nullable().or(z.literal("")),
  challengeId: z.string().uuid().optional().nullable().or(z.literal("")),
  title: z.string().trim().min(3).max(240),
  partNumber: z.string().trim().max(240).optional().nullable(),
  technicalDetails: z.string().trim().max(6000).optional().nullable(),
  material: z.string().trim().max(400).optional().nullable(),
  dimensionsText: z.string().trim().max(1000).optional().nullable(),
  weightText: z.string().trim().max(240).optional().nullable(),
  application: z.string().trim().max(1200).optional().nullable(),
  currentSource: z.string().trim().max(500).optional().nullable(),
  demandSignalText: z.string().trim().max(1600).optional().nullable(),
  urgency: z.enum(["standard", "urgent", "critical"]).default("standard"),
});

const industrialPartRecordReviewSchema = z
  .object({
    status: z.enum(INDUSTRIAL_PART_RECORD_STATUSES).optional(),
    routeDecision: z.enum(INDUSTRIAL_PART_ROUTE_DECISIONS).optional(),
    routeRationale: z.string().trim().max(6000).optional().nullable(),
    reviewNotes: z.string().trim().max(6000).optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide a part-record review update.",
  });

const industrialPartRecordDocumentUploadSchema = z.object({
  documentType: z.enum(INDUSTRIAL_PART_RECORD_DOCUMENT_TYPES),
  title: z.string().trim().min(2).max(240),
});

const factoryDocumentUploadSchema = z.object({
  documentType: z.enum(INDUSTRIAL_FACTORY_DOCUMENT_TYPES),
  title: z.string().trim().min(2).max(240),
  expiresAt: z.string().trim().max(80).optional().nullable().or(z.literal("")),
});

function resolveExportunityTenant(req: any, res: any) {
  const tenant = req?.tenant;
  if (
    !tenant?.id ||
    String(tenant?.key || "").toLowerCase() !== "exportunity"
  ) {
    res.status(404).json({
      ok: false,
      message: "Industrial services are available on Exportunity only.",
    });
    return null;
  }
  return tenant;
}

function submissionKey(req: any, tenantId: number) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    ?.trim();
  const address =
    forwarded || String(req.ip || req.socket?.remoteAddress || "unknown");
  return `${tenantId}:${address || "unknown"}`;
}

function consumePublicSubmission(req: any, tenantId: number) {
  const key = submissionKey(req, tenantId);
  const now = Date.now();
  const existing = submissionWindows.get(key);
  const current =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + PUBLIC_SUBMISSION_WINDOW_MS };

  if (current.count >= PUBLIC_SUBMISSION_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  submissionWindows.set(key, current);
  return { allowed: true, remaining: PUBLIC_SUBMISSION_LIMIT - current.count };
}

function consumePublicIntakePreview(req: any, tenantId: number) {
  const key = submissionKey(req, tenantId);
  const now = Date.now();
  const existing = intakePreviewWindows.get(key);
  const current =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + PUBLIC_SUBMISSION_WINDOW_MS };

  if (current.count >= PUBLIC_INTAKE_PREVIEW_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  intakePreviewWindows.set(key, current);
  return {
    allowed: true,
    remaining: PUBLIC_INTAKE_PREVIEW_LIMIT - current.count,
  };
}

function consumePublicAttachmentUpload(req: any, tenantId: number) {
  const key = submissionKey(req, tenantId);
  const now = Date.now();
  const existing = publicAttachmentUploadWindows.get(key);
  const current =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + PUBLIC_SUBMISSION_WINDOW_MS };

  if (current.count >= PUBLIC_ATTACHMENT_UPLOAD_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  publicAttachmentUploadWindows.set(key, current);
  return {
    allowed: true,
    remaining: PUBLIC_ATTACHMENT_UPLOAD_LIMIT - current.count,
  };
}

function consumeFactoryClaim(req: any, tenantId: number) {
  const userId = Number(req?.tenantUser?.id);
  const key = `${tenantId}:${Number.isFinite(userId) ? userId : submissionKey(req, tenantId)}`;
  const now = Date.now();
  const existing = factoryClaimWindows.get(key);
  const current =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + FACTORY_CLAIM_WINDOW_MS };

  if (current.count >= FACTORY_CLAIM_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  factoryClaimWindows.set(key, current);
  return { allowed: true, remaining: FACTORY_CLAIM_LIMIT - current.count };
}

function publicFactory(row: any) {
  return {
    id: row.id,
    name: row.displayName,
    industry: row.primaryIndustry,
    countryCode: row.countryCode,
    region: row.region,
    city: row.city,
    industrialZone: row.industrialZone,
    description: row.publicDescription,
    website: row.publicWebsite,
    email: row.publicEmail,
    phone: row.publicPhone,
    certifications: Array.isArray(row.publicCertifications)
      ? row.publicCertifications
      : [],
    exportMarkets: Array.isArray(row.exportMarkets) ? row.exportMarkets : [],
    latitude:
      row.latitude === null || row.latitude === undefined
        ? null
        : Number(row.latitude),
    longitude:
      row.longitude === null || row.longitude === undefined
        ? null
        : Number(row.longitude),
    verification: "verified",
  };
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalText(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function machineTechnicalDetails(metadata: unknown) {
  const registry = safeRecord(safeRecord(metadata).machineRegistry);
  return {
    brand: typeof registry.brand === "string" ? registry.brand : null,
    purpose: typeof registry.purpose === "string" ? registry.purpose : null,
    countryOfOrigin:
      typeof registry.countryOfOrigin === "string"
        ? registry.countryOfOrigin
        : null,
    manufactureYear:
      typeof registry.manufactureYear === "string"
        ? registry.manufactureYear
        : null,
    installationDate:
      typeof registry.installationDate === "string"
        ? registry.installationDate
        : null,
    powerRating:
      typeof registry.powerRating === "string" ? registry.powerRating : null,
    capacity: typeof registry.capacity === "string" ? registry.capacity : null,
    supplier: typeof registry.supplier === "string" ? registry.supplier : null,
    warranty: typeof registry.warranty === "string" ? registry.warranty : null,
    maintenanceSchedule:
      typeof registry.maintenanceSchedule === "string"
        ? registry.maintenanceSchedule
        : null,
  };
}

function mergeMachineTechnicalDetails(
  metadata: unknown,
  details: Record<string, string | null | undefined>,
) {
  const currentMetadata = safeRecord(metadata);
  const currentRegistry = safeRecord(currentMetadata.machineRegistry);
  const nextRegistry = { ...currentRegistry } as Record<string, unknown>;
  for (const [key, value] of Object.entries(details)) {
    if (value !== undefined) nextRegistry[key] = optionalText(value);
  }
  return { ...currentMetadata, machineRegistry: nextRegistry };
}

function mergeProductionLineMetadata(
  metadata: unknown,
  purpose: string | null | undefined,
) {
  const nextMetadata = { ...safeRecord(metadata) } as Record<string, unknown>;
  if (purpose !== undefined) nextMetadata.purpose = optionalText(purpose);
  return nextMetadata;
}

async function resolveOwnedTechnicalAssetLinks(
  tenantId: number,
  factoryId: string,
  input: OwnedTechnicalAssetInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.assetType === "machine" && input.productionLineId) {
    const productionLine = await db.query.industrialProductionLines.findFirst({
      where: and(
        eq(industrialProductionLines.id, input.productionLineId),
        eq(industrialProductionLines.tenantId, tenantId),
        eq(industrialProductionLines.factoryId, factoryId),
      ),
    });
    if (!productionLine)
      return {
        ok: false,
        message:
          "The selected production line is not available for this factory.",
      };
  }

  if (input.assetType === "assembly") {
    const machine = await db.query.industrialMachines.findFirst({
      where: and(
        eq(industrialMachines.id, input.machineId),
        eq(industrialMachines.tenantId, tenantId),
        eq(industrialMachines.factoryId, factoryId),
      ),
    });
    if (!machine)
      return {
        ok: false,
        message: "The selected machine is not available for this factory.",
      };
  }

  if (input.assetType === "component") {
    const [machine, assembly] = await Promise.all([
      db.query.industrialMachines.findFirst({
        where: and(
          eq(industrialMachines.id, input.machineId),
          eq(industrialMachines.tenantId, tenantId),
          eq(industrialMachines.factoryId, factoryId),
        ),
      }),
      input.assemblyId
        ? db.query.industrialMachineAssemblies.findFirst({
            where: and(
              eq(industrialMachineAssemblies.id, input.assemblyId),
              eq(industrialMachineAssemblies.tenantId, tenantId),
              eq(industrialMachineAssemblies.factoryId, factoryId),
            ),
          })
        : Promise.resolve(null),
    ]);
    if (!machine)
      return {
        ok: false,
        message: "The selected machine is not available for this factory.",
      };
    if (input.assemblyId && !assembly)
      return {
        ok: false,
        message: "The selected assembly is not available for this factory.",
      };
    if (assembly && assembly.machineId !== machine.id) {
      return {
        ok: false,
        message:
          "The selected assembly does not belong to the selected machine.",
      };
    }
  }

  return { ok: true };
}

async function resolveFactoryTechnicalContext(
  tenantId: number,
  factoryId: string,
  input: {
    machineId?: string | null;
    assemblyId?: string | null;
    componentId?: string | null;
  },
) {
  const machineId = optionalText(input.machineId);
  const assemblyId = optionalText(input.assemblyId);
  const componentId = optionalText(input.componentId);

  const [machine, assembly, component] = await Promise.all([
    machineId
      ? db.query.industrialMachines.findFirst({
          where: and(
            eq(industrialMachines.id, machineId),
            eq(industrialMachines.tenantId, tenantId),
            eq(industrialMachines.factoryId, factoryId),
          ),
        })
      : Promise.resolve(null),
    assemblyId
      ? db.query.industrialMachineAssemblies.findFirst({
          where: and(
            eq(industrialMachineAssemblies.id, assemblyId),
            eq(industrialMachineAssemblies.tenantId, tenantId),
            eq(industrialMachineAssemblies.factoryId, factoryId),
          ),
        })
      : Promise.resolve(null),
    componentId
      ? db.query.industrialMachineComponents.findFirst({
          where: and(
            eq(industrialMachineComponents.id, componentId),
            eq(industrialMachineComponents.tenantId, tenantId),
            eq(industrialMachineComponents.factoryId, factoryId),
          ),
        })
      : Promise.resolve(null),
  ]);

  return resolveTechnicalHierarchy(
    { machineId, assemblyId, componentId },
    {
      machineExists: !machineId || Boolean(machine),
      assembly: assembly
        ? { id: assembly.id, machineId: assembly.machineId }
        : null,
      component: component
        ? {
            id: component.id,
            machineId: component.machineId,
            assemblyId: component.assemblyId,
          }
        : null,
    },
  );
}

function staffFactoryRelationshipSummary(
  row: any | null | undefined,
  fallbackAccountManagerUserId?: number | null,
  includePrivateNotes = false,
) {
  const accountManagerUserId =
    row?.accountManagerUserId ?? fallbackAccountManagerUserId ?? null;
  return {
    id: row?.id || null,
    stage: row?.stage || "identified",
    accountManagerUserId,
    nextAction: row?.nextAction || null,
    nextReviewAt: row?.nextReviewAt || null,
    lastContactedAt: row?.lastContactedAt || null,
    lastContactedByUserId: row?.lastContactedByUserId || null,
    lastContactSummary: row?.lastContactSummary || null,
    internalNotes: includePrivateNotes ? row?.internalNotes || null : undefined,
    updatedAt: row?.updatedAt || null,
    relationshipExists: Boolean(row),
  };
}

function factoryOwnerRelationshipSummary(
  row: any | null | undefined,
  fallbackAccountManagerUserId?: number | null,
) {
  return {
    accountManagerAssigned: Boolean(
      row?.accountManagerUserId ?? fallbackAccountManagerUserId,
    ),
    lastReviewedAt: row?.updatedAt || null,
  };
}

function staffFactorySummary(row: any, relationship?: any | null) {
  const privateProfile = safeRecord(row.privateProfile);
  const registrationContact = safeRecord(privateProfile.registrationContact);
  return {
    id: row.id,
    legalName: row.legalName,
    displayName: row.displayName,
    registrationNumber: row.registrationNumber,
    primaryIndustry: row.primaryIndustry,
    countryCode: row.countryCode,
    region: row.region,
    city: row.city,
    industrialZone: row.industrialZone,
    factoryStatus: row.factoryStatus,
    verificationStatus: row.verificationStatus,
    publicVisibility: row.publicVisibility,
    contactName:
      typeof registrationContact.name === "string"
        ? registrationContact.name
        : null,
    contactEmail:
      typeof registrationContact.email === "string"
        ? registrationContact.email
        : row.publicEmail,
    contactPhone:
      typeof registrationContact.phone === "string"
        ? registrationContact.phone
        : row.publicPhone,
    accountManagerUserId: row.accountManagerUserId,
    relationship:
      relationship === undefined
        ? undefined
        : staffFactoryRelationshipSummary(
            relationship,
            row.accountManagerUserId,
          ),
    ownerUserId: row.ownerUserId,
    submittedAt: row.submittedAt,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function staffFactoryClaimSummary(row: any, factory?: any) {
  return {
    id: row.id,
    factoryId: row.factoryId,
    factoryName: factory?.displayName || null,
    factoryIndustry: factory?.primaryIndustry || null,
    factoryCity:
      factory?.city || factory?.industrialZone || factory?.countryCode || null,
    claimantUserId: row.claimantUserId,
    relationship: row.relationship,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    authorizationReference: row.authorizationReference,
    message: row.message,
    status: row.status,
    reviewNotes: row.reviewNotes,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function requirementLifecycleFor(
  requirement: any,
  quotes: any[] = [],
  orders: any[] = [],
) {
  const metadata = safeRecord(requirement.metadata);
  const workflow = safeRecord(metadata.internalWorkflow);
  const commercialPhase =
    workflow.commercialPhase === "negotiation" ? "negotiation" : null;
  const closureOutcome =
    workflow.closureOutcome === "completed" ||
    workflow.closureOutcome === "lost"
      ? workflow.closureOutcome
      : null;

  return deriveIndustrialRequirementLifecycle({
    requirementStatus: requirement.status as any,
    quotes: quotes.map((quote) => ({
      id: quote.id,
      referenceCode: quote.referenceCode,
      status: quote.status,
      updatedAt: quote.updatedAt,
      createdAt: quote.createdAt,
    })),
    orders: orders.map((order) => ({
      id: order.id,
      quoteId: order.quoteId,
      referenceCode: order.referenceCode,
      status: order.status,
      updatedAt: order.updatedAt,
      createdAt: order.createdAt,
    })),
    commercialPhase,
    closureOutcome,
  });
}

async function loadRequirementLifecycles(
  tenantId: number,
  requirementIds: string[],
) {
  const uniqueIds = Array.from(new Set(requirementIds.filter(Boolean)));
  const lifecycleByRequirementId = new Map<
    string,
    ReturnType<typeof requirementLifecycleFor>
  >();
  if (!uniqueIds.length) return lifecycleByRequirementId;

  const [requirements, quotes, orders] = await Promise.all([
    db
      .select()
      .from(industrialRequirements)
      .where(
        and(
          eq(industrialRequirements.tenantId, tenantId),
          inArray(industrialRequirements.id, uniqueIds),
        ),
      ),
    db
      .select()
      .from(industrialQuotes)
      .where(
        and(
          eq(industrialQuotes.tenantId, tenantId),
          inArray(industrialQuotes.requirementId, uniqueIds),
        ),
      ),
    db
      .select()
      .from(industrialOrders)
      .where(
        and(
          eq(industrialOrders.tenantId, tenantId),
          inArray(industrialOrders.requirementId, uniqueIds),
        ),
      ),
  ]);
  const quotesByRequirement = new Map<string, any[]>();
  const ordersByRequirement = new Map<string, any[]>();

  for (const quote of quotes) {
    const records = quotesByRequirement.get(quote.requirementId) || [];
    records.push(quote);
    quotesByRequirement.set(quote.requirementId, records);
  }
  for (const order of orders) {
    const records = ordersByRequirement.get(order.requirementId) || [];
    records.push(order);
    ordersByRequirement.set(order.requirementId, records);
  }
  for (const requirement of requirements) {
    lifecycleByRequirementId.set(
      requirement.id,
      requirementLifecycleFor(
        requirement,
        quotesByRequirement.get(requirement.id) || [],
        ordersByRequirement.get(requirement.id) || [],
      ),
    );
  }
  return lifecycleByRequirementId;
}

function staffRequirementSummary(
  row: any,
  lifecycle?: ReturnType<typeof requirementLifecycleFor>,
  productRequirement?: any,
  execution?: IndustrialOpportunityExecution,
) {
  const metadata = safeRecord(row.metadata);
  const workflow = safeRecord(metadata.internalWorkflow);
  const technicalDetails = safeRecord(metadata.technicalDetails);
  const operationsHandoff = safeRecord(metadata.operationsHandoff);
  const participants = Array.isArray(operationsHandoff.participants)
    ? operationsHandoff.participants.filter(
        (participant): participant is Record<string, unknown> =>
          Boolean(participant) && typeof participant === "object",
      )
    : [];
  const workstreams = Array.isArray(operationsHandoff.workstreams)
    ? operationsHandoff.workstreams.filter(
        (workstream): workstream is Record<string, unknown> =>
          Boolean(workstream) && typeof workstream === "object",
      )
    : [];
  const missingSpecialistKeys = Array.isArray(
    operationsHandoff.missingSpecialistKeys,
  )
    ? operationsHandoff.missingSpecialistKeys
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];
  return {
    id: row.id,
    referenceCode: row.referenceCode,
    requirementType: row.requirementType,
    categoryCode: row.categoryCode,
    title: row.title,
    quantityText: row.quantityText,
    deliveryCountryCode: row.deliveryCountryCode,
    deliveryCity: row.deliveryCity,
    urgency: row.urgency,
    requesterCompany: row.requesterCompany,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    requesterPhone: row.requesterPhone,
    factoryId: row.factoryId,
    assignedAccountManagerUserId: row.assignedAccountManagerUserId,
    status: row.status,
    visibility: row.visibility,
    nextAction:
      typeof row.nextAction === "string" && row.nextAction.trim()
        ? row.nextAction
        : typeof workflow.nextAction === "string"
          ? workflow.nextAction
          : null,
    nextActionAt: row.nextActionAt || null,
    commercialIntent: row.commercialIntent || null,
    commercialActionMode: row.commercialActionMode || null,
    intentConfidence:
      row.intentConfidence == null ? null : Number(row.intentConfidence),
    assignedCommercialAgentId: row.assignedCommercialAgentId || null,
    sourceConversationId: row.sourceConversationId || null,
    productRequirement: productRequirement
      ? {
          id: productRequirement.id,
          productName: productRequirement.productName,
          productCategory: productRequirement.productCategory,
          specification: productRequirement.specification,
          quantityText: productRequirement.quantityText,
          unit: productRequirement.unit,
          origin: productRequirement.origin,
          destination: productRequirement.destination,
          targetPrice: productRequirement.targetPrice,
          currency: productRequirement.currency,
          deadlineText: productRequirement.deadlineText,
          frequency: productRequirement.frequency,
          incoterm: productRequirement.incoterm,
          customerType: productRequirement.customerType,
          missingFields: Array.isArray(productRequirement.missingFields)
            ? productRequirement.missingFields
            : [],
        }
      : null,
    operationsHandoff: execution?.parentTask
      ? {
          taskId: execution.parentTask.id,
          status: execution.status,
          assignedAgentId: execution.parentTask.agentId,
          assignedAgentName: execution.parentTask.agentName,
          participants: execution.team.map((participant) => ({
            key: participant.key,
            agentId: participant.agentId,
            agentName: participant.agentName,
            role: participant.role,
            avatarUrl: participant.avatarUrl,
            taskId: participant.taskId,
            taskStatus: participant.taskStatus,
          })),
          workstreams: execution.workstreams.map((workstream) => ({
            key: workstream.key,
            taskId: workstream.id,
            agentId: workstream.agentId,
            agentName: workstream.agentName,
            role: workstream.agentRole,
            title: workstream.title,
            status: workstream.status,
            approvalStatus: workstream.approvalStatus,
            allowedNextStatuses: workstream.allowedNextStatuses,
            updatedAt: workstream.updatedAt,
          })),
          missingSpecialistKeys: execution.missingSpecialistKeys,
          progress: execution.progress,
        }
      : operationsHandoff.taskId
      ? {
          taskId: Number(operationsHandoff.taskId),
          status: String(operationsHandoff.status || "created"),
          assignedAgentId: Number(operationsHandoff.assignedAgentId || 0) || null,
          assignedAgentName:
            typeof operationsHandoff.assignedAgentName === "string"
              ? operationsHandoff.assignedAgentName
              : null,
          participants: participants.map((participant) => ({
            key: String(participant.key || ""),
            agentId: Number(participant.agentId || 0) || null,
            agentName: String(participant.agentName || ""),
            role: String(participant.role || ""),
          })),
          workstreams: workstreams.map((workstream) => ({
            key: String(workstream.key || ""),
            taskId: Number(workstream.taskId || 0) || null,
            agentId: Number(workstream.agentId || 0) || null,
            agentName: String(workstream.agentName || ""),
            role: String(workstream.role || ""),
            title: String(workstream.title || ""),
            status: String(workstream.status || "backlog"),
          })),
          missingSpecialistKeys,
        }
      : null,
    financingDiscussionRequested:
      row.requirementType === "machinery" &&
      String(technicalDetails.financingDiscussion || "").toLowerCase() ===
        "yes",
    allowedNextStatuses: nextIndustrialRequirementStatuses(row.status as any),
    ...(lifecycle ? { lifecycle } : {}),
    submittedAt: row.submittedAt,
    requiredBy: row.requiredBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function staffRecurringRequirementSummary(row: any, factory?: any) {
  return {
    id: row.id,
    factoryId: row.factoryId,
    machineId: row.machineId,
    assemblyId: row.assemblyId,
    componentId: row.componentId,
    factoryName: factory?.displayName || null,
    factoryIndustry: factory?.primaryIndustry || null,
    requirementType: row.requirementType,
    categoryCode: row.categoryCode,
    title: row.title,
    details: row.details,
    quantityText: row.quantityText,
    frequency: row.frequency,
    reorderThreshold: row.reorderThreshold,
    preferredDeliveryDate: row.preferredDeliveryDate,
    preferredSupplier: row.preferredSupplier,
    alternativeSupplier: row.alternativeSupplier,
    priceAgreementPeriod: row.priceAgreementPeriod,
    contractStartAt: row.contractStartAt,
    contractEndAt: row.contractEndAt,
    approvalWorkflow: row.approvalWorkflow,
    approvalRequired: row.approvalRequired,
    status: row.status,
    nextReviewAt: row.nextReviewAt,
    lastReminderAt: row.lastReminderAt,
    internalNotes: row.internalNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function industrialRequirementAttachmentSummary(row: any) {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility,
    createdAt: row.createdAt,
  };
}

function factoryDocumentSummary(row: any) {
  return {
    id: row.id,
    documentType: row.documentType,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function factoryRequirementSummary(row: any) {
  return {
    id: row.id,
    referenceCode: row.referenceCode,
    requirementType: row.requirementType,
    categoryCode: row.categoryCode,
    title: row.title,
    quantityText: row.quantityText,
    urgency: row.urgency,
    status: row.status,
    requiredBy: row.requiredBy,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function factoryQuoteSummary(quote: any, requirement?: any, catalogItem?: any) {
  return {
    id: quote.id,
    referenceCode: quote.referenceCode,
    requirementId: quote.requirementId,
    requirementReferenceCode: requirement?.referenceCode || null,
    requirementTitle: requirement?.title || null,
    catalogItemName: catalogItem?.name || null,
    status: quote.status,
    currencyCode: quote.currencyCode,
    totalAmount:
      quote.totalAmount === null || quote.totalAmount === undefined
        ? null
        : String(quote.totalAmount),
    leadTimeText: quote.leadTimeText,
    validUntil: quote.validUntil,
    issuedAt: quote.issuedAt,
    closedAt: quote.closedAt,
    updatedAt: quote.updatedAt,
  };
}

function factoryChallengeSummary(
  row: any,
  requirement?: any,
  attachments: any[] = [],
) {
  return {
    id: row.id,
    factoryId: row.factoryId,
    requirementId: row.requirementId,
    requirementReferenceCode: requirement?.referenceCode || null,
    machineId: row.machineId,
    assemblyId: row.assemblyId,
    componentId: row.componentId,
    requirementType: row.requirementType,
    categoryCode: row.categoryCode,
    title: row.title,
    details: row.details,
    problemType: row.problemType,
    productionStopped: row.productionStopped,
    impactText: row.impactText,
    recurrenceFrequency: row.recurrenceFrequency,
    estimatedDowntime: row.estimatedDowntime,
    currentWorkaround: row.currentWorkaround,
    desiredOutcome: row.desiredOutcome,
    urgency: row.urgency,
    status: row.status,
    resolutionNotes: row.resolutionNotes,
    reviewedAt: row.reviewedAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    attachmentCount: attachments.length,
    attachments: attachments.map(industrialRequirementAttachmentSummary),
  };
}

function industrialPartRecordDocumentSummary(row: any) {
  return {
    id: row.id,
    documentType: row.documentType,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility,
    createdAt: row.createdAt,
  };
}

function factoryPartRecordSummary(row: any, documents: any[] = []) {
  return {
    id: row.id,
    factoryId: row.factoryId,
    sourceRequirementId: row.sourceRequirementId,
    challengeId: row.challengeId,
    machineId: row.machineId,
    assemblyId: row.assemblyId,
    componentId: row.componentId,
    referenceCode: row.referenceCode,
    title: row.title,
    partNumber: row.partNumber,
    requirementType: row.requirementType,
    categoryCode: row.categoryCode,
    technicalDetails: row.technicalDetails,
    material: row.material,
    dimensionsText: row.dimensionsText,
    weightText: row.weightText,
    application: row.application,
    currentSource: row.currentSource,
    demandSignalText: row.demandSignalText,
    status: row.status,
    routeDecision: row.routeDecision,
    routeRationale: row.routeRationale,
    reviewNotes: row.reviewNotes,
    visibility: row.visibility,
    revision: row.revision,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    documentCount: documents.length,
    documents: documents.map(industrialPartRecordDocumentSummary),
  };
}

function staffIndustrialPartRecordSummary(
  row: any,
  factory?: any,
  documents: any[] = [],
) {
  return {
    ...factoryPartRecordSummary(row, documents),
    factoryName: factory?.displayName || null,
    factoryIndustry: factory?.primaryIndustry || null,
    factoryCity:
      factory?.city || factory?.industrialZone || factory?.countryCode || null,
    createdByUserId: row.createdByUserId,
    reviewedByUserId: row.reviewedByUserId,
  };
}

function industrialPartRecordRouteStage(status: string) {
  return [
    "route_review",
    "route_selected",
    "prototype",
    "validated",
    "catalog_candidate",
  ].includes(status);
}

function staffIndustrialChallengeSummary(
  row: any,
  factory?: any,
  requirement?: any,
) {
  return {
    ...factoryChallengeSummary(row, requirement),
    factoryName: factory?.displayName || null,
    factoryIndustry: factory?.primaryIndustry || null,
    factoryCity:
      factory?.city || factory?.industrialZone || factory?.countryCode || null,
    assignedStaffUserId: row.assignedStaffUserId,
    reviewedByUserId: row.reviewedByUserId,
    visibility: row.visibility,
    groupKey: row.groupKey,
    triageNotes: row.triageNotes,
    requirementStatus: requirement?.status || null,
  };
}

function industrialChallengeNextAction(status: string) {
  const actions: Record<string, string> = {
    submitted: "Industrial challenge triage",
    triaged: "Confirm the review path for this production blocker",
    grouped: "Review the approved industrial demand group",
    sourcing_review: "Assess controlled supplier sourcing options",
    engineering_review: "Assess engineering or redesign feasibility",
    local_manufacturing_review:
      "Assess controlled local manufacturing feasibility",
    resolved: "Confirm the documented resolution with the factory",
    declined: "Record the decline rationale and factory follow-up",
    closed: "Retain the completed industrial challenge record",
  };
  return actions[status] || "Industrial challenge review";
}

function staffCatalogSummary(row: any, factory?: any) {
  return {
    id: row.id,
    factoryId: row.factoryId,
    factoryName: factory?.displayName || null,
    factoryStatus: factory?.factoryStatus || null,
    factoryVerificationStatus: factory?.verificationStatus || null,
    classification: row.classification,
    categoryCode: row.categoryCode,
    name: row.name,
    productCode: row.productCode,
    manufacturer: row.manufacturer,
    brand: row.brand,
    model: row.model,
    partNumber: row.partNumber,
    minimumOrderQuantity: row.minimumOrderQuantity,
    leadTimeText: row.leadTimeText,
    priceMode: row.priceMode,
    availabilityStatus: row.availabilityStatus,
    approvalStatus: row.approvalStatus,
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function staffMatchSummary(row: any, catalogItem?: any, factory?: any) {
  return {
    id: row.id,
    requirementId: row.requirementId,
    factoryId: row.factoryId,
    catalogItemId: row.catalogItemId,
    catalogItemName: catalogItem?.name || null,
    catalogItemCode: catalogItem?.productCode || null,
    factoryName: factory?.displayName || null,
    status: row.status,
    matchScore:
      row.matchScore === null || row.matchScore === undefined
        ? null
        : Number(row.matchScore),
    matchReason: row.matchReason,
    internalNotes: row.internalNotes,
    selectedAt: row.selectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function supplierStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function staffSupplierSummary(row: any, linkedFactory?: any) {
  return {
    id: row.id,
    linkedFactoryId: row.linkedFactoryId,
    linkedFactoryName: linkedFactory?.displayName || null,
    legalName: row.legalName,
    displayName: row.displayName,
    supplierStatus: row.supplierStatus,
    verificationStatus: row.verificationStatus,
    visibility: row.visibility,
    publiclyListed: false,
    countryCode: row.countryCode,
    region: row.region,
    city: row.city,
    industrialZone: row.industrialZone,
    address: row.address,
    website: row.website,
    email: row.email,
    phone: row.phone,
    industriesServed: supplierStringList(row.industriesServed),
    categoryCodes: supplierStringList(row.categoryCodes),
    capabilities: supplierStringList(row.capabilities),
    equipmentAvailable: supplierStringList(row.equipmentAvailable),
    materialsHandled: supplierStringList(row.materialsHandled),
    maximumDimensions: row.maximumDimensions,
    tolerances: row.tolerances,
    productionCapacityText: row.productionCapacityText,
    certifications: supplierStringList(row.certifications),
    qualityControlCapability: row.qualityControlCapability,
    leadTimeText: row.leadTimeText,
    previousPerformanceNotes: row.previousPerformanceNotes,
    onTimeDeliveryRate:
      row.onTimeDeliveryRate === null || row.onTimeDeliveryRate === undefined
        ? null
        : Number(row.onTimeDeliveryRate),
    technicalDocumentReferences: supplierStringList(
      row.technicalDocumentReferences,
    ),
    mediaReferences: supplierStringList(row.mediaReferences),
    ndaStatus: row.ndaStatus,
    adminNotes: row.adminNotes,
    ownerUserId: row.ownerUserId,
    verifiedAt: row.verifiedAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function staffSupplierCapabilityMatchSummary(row: any, supplier?: any) {
  return {
    id: row.id,
    requirementId: row.requirementId,
    supplierProfileId: row.supplierProfileId,
    supplier: supplier ? staffSupplierSummary(supplier) : null,
    status: row.status,
    matchScore:
      row.matchScore === null || row.matchScore === undefined
        ? null
        : Number(row.matchScore),
    matchReason: row.matchReason,
    source: row.source || "internal_supplier_network",
    discoveryUrl: row.discoveryUrl || null,
    discoveryAgentId: row.discoveryAgentId || null,
    verificationScore:
      row.verificationScore == null ? null : Number(row.verificationScore),
    relevanceScore:
      row.relevanceScore == null ? null : Number(row.relevanceScore),
    contactabilityScore:
      row.contactabilityScore == null ? null : Number(row.contactabilityScore),
    lastVerifiedAt: row.lastVerifiedAt || null,
    internalNotes: row.internalNotes,
    selectedAt: row.selectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function staffSupplierQuoteSummary(row: any, supplier?: any) {
  return {
    id: row.id,
    referenceCode: row.referenceCode,
    requirementId: row.requirementId,
    supplierProfileId: row.supplierProfileId,
    supplierMatchId: row.supplierMatchId,
    supplierName: supplier?.displayName || null,
    product: row.product,
    specification: row.specification,
    quantityText: row.quantityText,
    unit: row.unit,
    unitPrice: row.unitPrice == null ? null : String(row.unitPrice),
    totalCost: row.totalCost == null ? null : String(row.totalCost),
    currencyCode: row.currencyCode,
    incoterm: row.incoterm,
    origin: row.origin,
    destination: row.destination,
    packaging: row.packaging,
    minimumOrderQuantity: row.minimumOrderQuantity,
    leadTimeDays: row.leadTimeDays,
    paymentTerms: row.paymentTerms,
    validUntil: row.validUntil,
    certifications: Array.isArray(row.certifications) ? row.certifications : [],
    sourceChannel: row.sourceChannel,
    status: row.status,
    internalNotes: row.internalNotes,
    receivedAt: row.receivedAt,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function staffCommercialOfferSummary(row: any) {
  return {
    id: row.id,
    referenceCode: row.referenceCode,
    requirementId: row.requirementId,
    customerContactId: row.customerContactId,
    version: row.version,
    supplierQuoteIds: Array.isArray(row.supplierQuoteIds)
      ? row.supplierQuoteIds
      : [],
    costStack: safeRecord(row.costStack),
    totalCost: String(row.totalCost),
    internalMargin: String(row.internalMargin),
    marginPercent: String(row.marginPercent),
    customerPrice: String(row.customerPrice),
    currencyCode: row.currencyCode,
    incoterm: row.incoterm,
    deliveryEstimate: row.deliveryEstimate,
    paymentTerms: row.paymentTerms,
    offerValidUntil: row.offerValidUntil,
    terms: row.terms,
    status: row.status,
    pricingPolicy: safeRecord(row.pricingPolicy),
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function staffActionRequestSummary(row: any) {
  return {
    id: row.id,
    publicActionId: row.publicActionId,
    actionType: row.actionType,
    status: row.status,
    lifecycleState: row.lifecycleState,
    mode: row.mode,
    outcome: row.outcome,
    requestedByAgentKey: row.requestedByAgentKey,
    payload: safeRecord(row.payload),
    metadata: safeRecord(row.metadata),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type LegacyProductReviewRow = {
  product: any;
  category: any | null;
  seller: any | null;
  review: any | null;
};

async function loadLegacyProductReviewRows(
  tenantId: number,
): Promise<LegacyProductReviewRow[]> {
  return db
    .select({
      product: sellerProducts,
      category: productCategories,
      seller: sellers,
      review: industrialLegacyProductReviews,
    })
    .from(sellerProducts)
    .leftJoin(
      productCategories,
      and(
        eq(sellerProducts.categoryId, productCategories.id),
        eq(sellerProducts.tenantId, productCategories.tenantId),
      ),
    )
    .leftJoin(
      sellers,
      and(
        eq(sellerProducts.sellerId, sellers.id),
        eq(sellerProducts.tenantId, sellers.tenantId),
      ),
    )
    .leftJoin(
      industrialLegacyProductReviews,
      and(
        eq(
          industrialLegacyProductReviews.legacySellerProductId,
          sellerProducts.id,
        ),
        eq(industrialLegacyProductReviews.tenantId, sellerProducts.tenantId),
      ),
    )
    .where(eq(sellerProducts.tenantId, tenantId))
    .orderBy(desc(sellerProducts.updatedAt), desc(sellerProducts.id));
}

function legacyProductSnapshot(row: LegacyProductReviewRow) {
  return {
    legacySellerProductId: row.product.id,
    legacySellerId: row.product.sellerId,
    legacyCategoryId: row.product.categoryId,
    name: row.product.name,
    sourceStatus: row.product.status,
    categorySlug: row.category?.slug || null,
    categoryName: row.category?.name || null,
    sellerName: row.seller?.shopName || null,
    sellerIsDemo: Boolean(row.seller?.isDemo),
    sellerIsProducer: Boolean(row.seller?.isProducer),
    sellerProductionType: row.seller?.productionType || null,
    sku: row.product.sku || null,
    hasImages: Array.isArray(row.product.images)
      ? row.product.images.some((item: unknown) => String(item || "").trim())
      : Boolean(String(row.product.images || "").trim()),
    description:
      row.product.description || row.product.shortDescription || null,
  };
}

function legacyProductRecommendation(row: LegacyProductReviewRow) {
  return recommendLegacyProductReview({
    name: row.product.name,
    categorySlug: row.category?.slug,
    categoryName: row.category?.name,
    description: row.product.description,
    shortDescription: row.product.shortDescription,
    sku: row.product.sku,
    images: row.product.images,
    isDemo: row.seller?.isDemo,
    isProducer: row.seller?.isProducer,
    productionType: row.seller?.productionType,
  });
}

function legacyDuplicateMap(rows: LegacyProductReviewRow[]) {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const normalizedName = normalizeLegacyProductName(row.product.name || "");
    if (!normalizedName) continue;
    const key = `${row.product.sellerId}:${normalizedName}`;
    const values = groups.get(key) || [];
    values.push(row.product.id);
    groups.set(key, values);
  }

  const result = new Map<number, number[]>();
  for (const productIds of groups.values()) {
    if (productIds.length < 2) continue;
    for (const productId of productIds) {
      result.set(
        productId,
        productIds.filter((candidateId) => candidateId !== productId),
      );
    }
  }
  return result;
}

function staffLegacyProductReviewSummary(
  row: LegacyProductReviewRow,
  duplicateIds: number[] = [],
) {
  const recommendation = legacyProductRecommendation(row);
  const reviewStatus = row.review?.reviewStatus || recommendation.status;
  return {
    id: row.product.id,
    sellerId: row.product.sellerId,
    sellerName: row.seller?.shopName || null,
    sellerIsDemo: Boolean(row.seller?.isDemo),
    sellerIsProducer: Boolean(row.seller?.isProducer),
    sourceStatus: row.product.status,
    name: row.product.name,
    description:
      row.product.description || row.product.shortDescription || null,
    sku: row.product.sku || null,
    categoryId: row.product.categoryId,
    categorySlug: row.category?.slug || null,
    categoryName: row.category?.name || null,
    hasImages: Array.isArray(row.product.images)
      ? row.product.images.some((item: unknown) => String(item || "").trim())
      : Boolean(String(row.product.images || "").trim()),
    createdAt: row.product.createdAt,
    updatedAt: row.product.updatedAt,
    reviewStatus,
    reviewed: Boolean(row.review),
    recommendation,
    potentialDuplicateIds: duplicateIds,
    review: row.review
      ? {
          id: row.review.id,
          reviewStatus: row.review.reviewStatus,
          suggestedStatus: row.review.suggestedStatus,
          suggestedClassification: row.review.suggestedClassification,
          proposedClassification: row.review.proposedClassification,
          industrialCatalogItemId: row.review.industrialCatalogItemId,
          duplicateOfLegacyProductId: row.review.duplicateOfLegacyProductId,
          reviewReason: row.review.reviewReason,
          reviewedByUserId: row.review.reviewedByUserId,
          reviewedAt: row.review.reviewedAt,
          archivedAt: row.review.archivedAt,
          createdAt: row.review.createdAt,
          updatedAt: row.review.updatedAt,
        }
      : null,
    publicIndustrialEligibility: false,
  };
}

function staffQuoteSummary(
  row: any,
  requirement?: any,
  factory?: any,
  catalogItem?: any,
) {
  return {
    id: row.id,
    referenceCode: row.referenceCode,
    requirementId: row.requirementId,
    requirementReferenceCode: requirement?.referenceCode || null,
    requirementTitle: requirement?.title || null,
    requirementMatchId: row.requirementMatchId,
    commercialOfferId: row.commercialOfferId || null,
    factoryId: row.factoryId,
    factoryName: factory?.displayName || null,
    catalogItemId: row.catalogItemId,
    catalogItemName: catalogItem?.name || null,
    status: row.status,
    currencyCode: row.currencyCode,
    totalAmount:
      row.totalAmount === null || row.totalAmount === undefined
        ? null
        : String(row.totalAmount),
    lineItems: Array.isArray(row.lineItems) ? row.lineItems : [],
    leadTimeText: row.leadTimeText,
    validUntil: row.validUntil,
    commercialTerms: row.commercialTerms,
    customerNotes: row.customerNotes,
    internalNotes: row.internalNotes,
    visibility: row.visibility,
    issuedAt: row.issuedAt,
    respondedAt: row.respondedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function staffOrderSummary(
  order: any,
  quote?: any,
  requirement?: any,
  factory?: any,
  catalogItem?: any,
) {
  return {
    id: order.id,
    referenceCode: order.referenceCode,
    quoteId: order.quoteId,
    quoteReferenceCode: quote?.referenceCode || null,
    requirementId: order.requirementId,
    requirementReferenceCode: requirement?.referenceCode || null,
    requirementTitle: requirement?.title || null,
    factoryId: order.factoryId,
    factoryName: factory?.displayName || null,
    catalogItemId: order.catalogItemId,
    catalogItemName: catalogItem?.name || null,
    status: order.status,
    currencyCode: order.currencyCode,
    totalAmount:
      order.totalAmount === null || order.totalAmount === undefined
        ? null
        : String(order.totalAmount),
    lineItems: Array.isArray(order.lineItems) ? order.lineItems : [],
    commercialTerms: order.commercialTerms,
    deliveryNotes: order.deliveryNotes,
    internalNotes: order.internalNotes,
    visibility: order.visibility,
    confirmedAt: order.confirmedAt,
    plannedDeliveryAt: order.plannedDeliveryAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

// Factory owners are a party to the fulfilment, not to the requester's private dossier.
// Keep the workspace projection deliberately narrow and read-only.
function factoryOrderSummary(
  order: any,
  quote?: any,
  requirement?: any,
  catalogItem?: any,
) {
  return {
    id: order.id,
    referenceCode: order.referenceCode,
    quoteReferenceCode: quote?.referenceCode || null,
    requirementReferenceCode: requirement?.referenceCode || null,
    requirementTitle: requirement?.title || null,
    catalogItemName: catalogItem?.name || null,
    status: order.status,
    currencyCode: order.currencyCode,
    totalAmount:
      order.totalAmount === null || order.totalAmount === undefined
        ? null
        : String(order.totalAmount),
    lineItems: Array.isArray(order.lineItems) ? order.lineItems : [],
    commercialTerms: order.commercialTerms,
    plannedDeliveryAt: order.plannedDeliveryAt,
    confirmedAt: order.confirmedAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    updatedAt: order.updatedAt,
  };
}

function actorIdFor(
  req: any,
  property: "staffUser" | "adminUser" | "tenantUser" = "staffUser",
) {
  const value = Number(req?.[property]?.id);
  return Number.isFinite(value) ? value : null;
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function safeLimit(value: unknown, fallback = 24) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function makeReference(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const nonce = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${date}-${nonce}`;
}

router.get("/taxonomy", (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  res.json({
    ok: true,
    taxonomy: INDUSTRIAL_TAXONOMY,
    requirementTypes: INDUSTRIAL_REQUIREMENT_TYPES,
  });
});

router.post("/assistant/intake-preview", async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const rate = consumePublicIntakePreview(req, tenant.id);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSeconds));
    return res.status(429).json({
      ok: false,
      message:
        "Too many intake messages were sent from this connection. Please try again shortly.",
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  const parsed = industrialAssistantIntakeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Please describe the industrial need before sending it.",
      issues: parsed.error.flatten(),
    });
  }

  const intake = await generateIndustrialIntakeReply(
    parsed.data.message,
    parsed.data.language,
    submissionKey(req, tenant.id),
    parsed.data.agentMode,
    parsed.data.requirementType,
  );
  return res.json({
    ok: true,
    assistant: {
      name: parsed.data.agentMode === "commercial" ? "Awa Kouadio" : "Tassi",
      response: intake.response,
      intake: {
        requirementType: intake.requirementType,
        categoryCode: intake.categoryCode,
        title: intake.title,
        urgency: intake.urgency,
        facts: intake.facts,
        intent: intake.intent,
        confidence: intake.confidence,
        commercial: intake.commercial,
        product: intake.product,
        origin: intake.origin,
        targetPrice: intake.targetPrice,
        currency: intake.currency,
        deadline: intake.deadline,
        frequency: intake.frequency,
        incoterm: intake.incoterm,
        customerType: intake.customerType,
        missingFields: intake.missingFields,
        suggestedAction: intake.suggestedAction,
      },
    },
  });
});

router.get("/factories", async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  try {
    const query = String(req.query?.q || "").trim();
    const city = String(req.query?.city || "").trim();
    const countryCode = String(req.query?.country || "")
      .trim()
      .toUpperCase();
    const limit = safeLimit(req.query?.limit, 36);
    const searchConditions = industrialSearchTerms(query).flatMap((term) => {
      const like = `%${term}%`;
      return [
        ilike(industrialFactories.displayName, like),
        ilike(industrialFactories.legalName, like),
        ilike(industrialFactories.primaryIndustry, like),
        ilike(industrialFactories.city, like),
        ilike(industrialFactories.industrialZone, like),
      ];
    });
    const rows = await db
      .select()
      .from(industrialFactories)
      .where(
        and(
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.factoryStatus, "active"),
          eq(industrialFactories.verificationStatus, "verified"),
          eq(industrialFactories.publicVisibility, "public"),
          query ? or(...searchConditions) : undefined,
          city ? ilike(industrialFactories.city, `%${city}%`) : undefined,
          countryCode
            ? eq(industrialFactories.countryCode, countryCode)
            : undefined,
        ),
      )
      .orderBy(
        desc(industrialFactories.verifiedAt),
        industrialFactories.displayName,
      )
      .limit(limit);

    res.json({
      ok: true,
      factories: rows.map(publicFactory),
      total: rows.length,
      searchContext: industrialSearchRequirementContext(query),
    });
  } catch (error: any) {
    res.status(503).json({
      ok: false,
      message: "The verified factory directory is temporarily unavailable.",
      code: "INDUSTRIAL_DIRECTORY_UNAVAILABLE",
    });
  }
});

router.get("/factories/:factoryId", async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const factoryId = String(req.params?.factoryId || "").trim();
  if (!z.string().uuid().safeParse(factoryId).success) {
    return res
      .status(400)
      .json({ ok: false, message: "Invalid factory identifier." });
  }

  try {
    const [factory, catalog, productionLines, machines] = await Promise.all([
      db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.factoryStatus, "active"),
          eq(industrialFactories.verificationStatus, "verified"),
          eq(industrialFactories.publicVisibility, "public"),
        ),
      }),
      db
        .select({
          id: industrialCatalogItems.id,
          name: industrialCatalogItems.name,
          description: industrialCatalogItems.publicDescription,
          categoryCode: industrialCatalogItems.categoryCode,
          classification: industrialCatalogItems.classification,
          productCode: industrialCatalogItems.productCode,
          supplyModes: industrialCatalogItems.supplyModes,
          priceMode: industrialCatalogItems.priceMode,
          availabilityStatus: industrialCatalogItems.availabilityStatus,
          manufacturer: industrialCatalogItems.manufacturer,
          brand: industrialCatalogItems.brand,
          model: industrialCatalogItems.model,
          partNumber: industrialCatalogItems.partNumber,
          countryOfOrigin: industrialCatalogItems.countryOfOrigin,
          application: industrialCatalogItems.application,
          compatibleMachinery: industrialCatalogItems.compatibleMachinery,
          material: industrialCatalogItems.material,
          unitOfMeasure: industrialCatalogItems.unitOfMeasure,
          minimumOrderQuantity: industrialCatalogItems.minimumOrderQuantity,
          productionCapacityText: industrialCatalogItems.productionCapacityText,
          leadTimeText: industrialCatalogItems.leadTimeText,
          certifications: industrialCatalogItems.certifications,
          media: industrialCatalogItems.publicMedia,
        })
        .from(industrialCatalogItems)
        .where(
          and(
            eq(industrialCatalogItems.tenantId, tenant.id),
            eq(industrialCatalogItems.factoryId, factoryId),
            eq(industrialCatalogItems.approvalStatus, "approved"),
            eq(industrialCatalogItems.visibility, "public"),
          ),
        )
        .orderBy(
          desc(industrialCatalogItems.updatedAt),
          industrialCatalogItems.name,
        )
        .limit(48),
      db
        .select({
          id: industrialProductionLines.id,
          name: industrialProductionLines.name,
          industry: industrialProductionLines.industry,
          summary: industrialProductionLines.publicSummary,
          operatingStatus: industrialProductionLines.operatingStatus,
        })
        .from(industrialProductionLines)
        .where(
          and(
            eq(industrialProductionLines.tenantId, tenant.id),
            eq(industrialProductionLines.factoryId, factoryId),
            eq(industrialProductionLines.visibility, "public"),
          ),
        )
        .orderBy(asc(industrialProductionLines.createdAt))
        .limit(20),
      db
        .select({
          id: industrialMachines.id,
          name: industrialMachines.name,
          manufacturer: industrialMachines.manufacturer,
          model: industrialMachines.model,
          machineCategory: industrialMachines.machineCategory,
          operatingStatus: industrialMachines.operatingStatus,
          productionLineId: industrialMachines.productionLineId,
        })
        .from(industrialMachines)
        .where(
          and(
            eq(industrialMachines.tenantId, tenant.id),
            eq(industrialMachines.factoryId, factoryId),
            eq(industrialMachines.visibility, "public"),
          ),
        )
        .orderBy(asc(industrialMachines.createdAt))
        .limit(80),
    ]);
    if (!factory)
      return res
        .status(404)
        .json({ ok: false, message: "Verified factory not found." });
    return res.json({
      ok: true,
      factory: publicFactory(factory),
      catalog,
      productionLines,
      machines,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The factory profile is temporarily unavailable.",
    });
  }
});

router.post(
  "/factories/:factoryId/claim",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const factoryId = String(req.params?.factoryId || "").trim();
    if (!z.string().uuid().safeParse(factoryId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid factory identifier." });
    }
    const parsed = factoryClaimSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Complete the factory ownership claim details.",
        issues: parsed.error.flatten(),
      });
    }
    const claimantUserId = actorIdFor(req, "tenantUser");
    if (!claimantUserId)
      return res.status(401).json({
        ok: false,
        message: "Authentication is required to claim a factory profile.",
      });

    const rate = consumeFactoryClaim(req, tenant.id);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message:
          "Too many factory ownership claims were submitted. Please try again later.",
      });
    }

    try {
      const [factory, activeClaim] = await Promise.all([
        db.query.industrialFactories.findFirst({
          where: and(
            eq(industrialFactories.id, factoryId),
            eq(industrialFactories.tenantId, tenant.id),
            eq(industrialFactories.factoryStatus, "active"),
            eq(industrialFactories.verificationStatus, "verified"),
            eq(industrialFactories.publicVisibility, "public"),
          ),
        }),
        db.query.industrialFactoryClaims.findFirst({
          where: and(
            eq(industrialFactoryClaims.tenantId, tenant.id),
            eq(industrialFactoryClaims.factoryId, factoryId),
            eq(industrialFactoryClaims.claimantUserId, claimantUserId),
            or(
              eq(industrialFactoryClaims.status, "submitted"),
              eq(industrialFactoryClaims.status, "under_review"),
            ),
          ),
        }),
      ]);
      if (!factory)
        return res.status(404).json({
          ok: false,
          message:
            "This verified factory profile is not available for a claim.",
        });
      if (factory.ownerUserId === claimantUserId) {
        return res.json({
          ok: true,
          alreadyOwner: true,
          message:
            "This Exportunity account already manages the factory profile.",
        });
      }
      if (factory.ownerUserId) {
        return res.status(409).json({
          ok: false,
          message:
            "This factory profile already has an approved owner. Contact Exportunity if the ownership record must be changed.",
        });
      }
      if (activeClaim) {
        return res.json({
          ok: true,
          existing: true,
          claim: staffFactoryClaimSummary(activeClaim, factory),
          message:
            "Your ownership claim is already awaiting Exportunity review.",
        });
      }

      const [claim] = await db
        .insert(industrialFactoryClaims)
        .values({
          tenantId: tenant.id,
          factoryId,
          claimantUserId,
          relationship: parsed.data.relationship,
          contactEmail:
            parsed.data.contactEmail || req.tenantUser?.email || null,
          contactPhone: parsed.data.contactPhone || null,
          authorizationReference: parsed.data.authorizationReference || null,
          message: parsed.data.message,
          status: "submitted",
        })
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: claimantUserId,
        action: "industrial_factory_claim.submitted",
        entityType: "industrial_factory_claim",
        entityId: claim.id,
        nextValue: { status: claim.status, factoryId },
        metadata: {
          relationship: claim.relationship,
          source: "factory_public_profile",
        },
      });

      return res.status(201).json({
        ok: true,
        claim: staffFactoryClaimSummary(claim, factory),
        message:
          "Your ownership claim has been sent to Exportunity for review. Profile ownership is not transferred until an administrator approves it.",
      });
    } catch (error: any) {
      if (
        String(error?.message || "").includes(
          "industrial_factory_claims_active_claimant_unique",
        )
      ) {
        return res.status(409).json({
          ok: false,
          message: "An active ownership claim already exists for this factory.",
        });
      }
      return res.status(500).json({
        ok: false,
        message: "The factory ownership claim could not be saved.",
      });
    }
  },
);

router.get("/me/factory-claims", ensureTenantUser, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const claimantUserId = actorIdFor(req, "tenantUser");
  if (!claimantUserId)
    return res
      .status(401)
      .json({ ok: false, message: "Authentication is required." });

  try {
    const rows = await db
      .select({ claim: industrialFactoryClaims, factory: industrialFactories })
      .from(industrialFactoryClaims)
      .innerJoin(
        industrialFactories,
        and(
          eq(industrialFactoryClaims.factoryId, industrialFactories.id),
          eq(industrialFactoryClaims.tenantId, industrialFactories.tenantId),
        ),
      )
      .where(
        and(
          eq(industrialFactoryClaims.tenantId, tenant.id),
          eq(industrialFactoryClaims.claimantUserId, claimantUserId),
        ),
      )
      .orderBy(desc(industrialFactoryClaims.updatedAt))
      .limit(safeLimit(req.query?.limit, 40));

    return res.json({
      ok: true,
      claims: rows.map((row) =>
        staffFactoryClaimSummary(row.claim, row.factory),
      ),
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "Factory ownership claims are temporarily unavailable.",
    });
  }
});

router.get("/me/factories", ensureTenantUser, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const ownerUserId = actorIdFor(req, "tenantUser");
  if (!ownerUserId)
    return res
      .status(401)
      .json({ ok: false, message: "Authentication is required." });

  try {
    const factories = await db
      .select()
      .from(industrialFactories)
      .where(
        and(
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      )
      .orderBy(desc(industrialFactories.updatedAt))
      .limit(safeLimit(req.query?.limit, 30));
    return res.json({
      ok: true,
      factories: factories.map(staffFactorySummary),
      total: factories.length,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "Your factory workspace is temporarily unavailable.",
    });
  }
});

router.get(
  "/me/factories/:factoryId/workspace",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid factory workspace identifier." });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (!factory)
        return res.status(404).json({
          ok: false,
          message: "This factory is not managed by your account.",
        });

      const [
        productionLines,
        machines,
        assemblies,
        components,
        catalog,
        recurringRequirements,
        challenges,
        challengeAttachments,
        requirements,
        quotes,
        orders,
        documents,
        relationship,
      ] = await Promise.all([
        db
          .select({
            id: industrialProductionLines.id,
            name: industrialProductionLines.name,
            industry: industrialProductionLines.industry,
            operatingStatus: industrialProductionLines.operatingStatus,
            visibility: industrialProductionLines.visibility,
            publicSummary: industrialProductionLines.publicSummary,
            privateMetadata: industrialProductionLines.privateMetadata,
            createdAt: industrialProductionLines.createdAt,
          })
          .from(industrialProductionLines)
          .where(
            and(
              eq(industrialProductionLines.tenantId, tenant.id),
              eq(industrialProductionLines.factoryId, factory.id),
            ),
          )
          .orderBy(asc(industrialProductionLines.createdAt)),
        db
          .select({
            id: industrialMachines.id,
            name: industrialMachines.name,
            manufacturer: industrialMachines.manufacturer,
            model: industrialMachines.model,
            serialNumber: industrialMachines.serialNumber,
            machineCategory: industrialMachines.machineCategory,
            operatingStatus: industrialMachines.operatingStatus,
            visibility: industrialMachines.visibility,
            productionLineId: industrialMachines.productionLineId,
            privateMetadata: industrialMachines.privateMetadata,
            createdAt: industrialMachines.createdAt,
          })
          .from(industrialMachines)
          .where(
            and(
              eq(industrialMachines.tenantId, tenant.id),
              eq(industrialMachines.factoryId, factory.id),
            ),
          )
          .orderBy(asc(industrialMachines.createdAt)),
        db
          .select({
            id: industrialMachineAssemblies.id,
            machineId: industrialMachineAssemblies.machineId,
            name: industrialMachineAssemblies.name,
            assemblyType: industrialMachineAssemblies.assemblyType,
            operatingStatus: industrialMachineAssemblies.operatingStatus,
            visibility: industrialMachineAssemblies.visibility,
            publicSummary: industrialMachineAssemblies.publicSummary,
            createdAt: industrialMachineAssemblies.createdAt,
          })
          .from(industrialMachineAssemblies)
          .where(
            and(
              eq(industrialMachineAssemblies.tenantId, tenant.id),
              eq(industrialMachineAssemblies.factoryId, factory.id),
            ),
          )
          .orderBy(asc(industrialMachineAssemblies.createdAt)),
        db
          .select({
            id: industrialMachineComponents.id,
            machineId: industrialMachineComponents.machineId,
            assemblyId: industrialMachineComponents.assemblyId,
            name: industrialMachineComponents.name,
            componentType: industrialMachineComponents.componentType,
            partNumber: industrialMachineComponents.partNumber,
            manufacturer: industrialMachineComponents.manufacturer,
            model: industrialMachineComponents.model,
            criticality: industrialMachineComponents.criticality,
            operatingStatus: industrialMachineComponents.operatingStatus,
            visibility: industrialMachineComponents.visibility,
            createdAt: industrialMachineComponents.createdAt,
          })
          .from(industrialMachineComponents)
          .where(
            and(
              eq(industrialMachineComponents.tenantId, tenant.id),
              eq(industrialMachineComponents.factoryId, factory.id),
            ),
          )
          .orderBy(asc(industrialMachineComponents.createdAt)),
        db
          .select()
          .from(industrialCatalogItems)
          .where(
            and(
              eq(industrialCatalogItems.tenantId, tenant.id),
              eq(industrialCatalogItems.factoryId, factory.id),
            ),
          )
          .orderBy(
            desc(industrialCatalogItems.updatedAt),
            industrialCatalogItems.name,
          )
          .limit(120),
        db
          .select()
          .from(industrialRecurringRequirements)
          .where(
            and(
              eq(industrialRecurringRequirements.tenantId, tenant.id),
              eq(industrialRecurringRequirements.factoryId, factory.id),
            ),
          )
          .orderBy(desc(industrialRecurringRequirements.updatedAt))
          .limit(120),
        db
          .select({
            challenge: industrialChallenges,
            requirement: industrialRequirements,
          })
          .from(industrialChallenges)
          .innerJoin(
            industrialRequirements,
            and(
              eq(industrialChallenges.requirementId, industrialRequirements.id),
              eq(
                industrialChallenges.tenantId,
                industrialRequirements.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialChallenges.tenantId, tenant.id),
              eq(industrialChallenges.factoryId, factory.id),
            ),
          )
          .orderBy(desc(industrialChallenges.updatedAt))
          .limit(120),
        db
          .select({ attachment: industrialRequirementAttachments })
          .from(industrialRequirementAttachments)
          .innerJoin(
            industrialChallenges,
            and(
              eq(
                industrialRequirementAttachments.requirementId,
                industrialChallenges.requirementId,
              ),
              eq(
                industrialRequirementAttachments.tenantId,
                industrialChallenges.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialRequirementAttachments.tenantId, tenant.id),
              eq(industrialChallenges.factoryId, factory.id),
            ),
          )
          .orderBy(desc(industrialRequirementAttachments.createdAt)),
        db
          .select()
          .from(industrialRequirements)
          .where(
            and(
              eq(industrialRequirements.tenantId, tenant.id),
              eq(industrialRequirements.factoryId, factory.id),
            ),
          )
          .orderBy(desc(industrialRequirements.updatedAt))
          .limit(120),
        db
          .select({
            quote: industrialQuotes,
            requirement: industrialRequirements,
            item: industrialCatalogItems,
          })
          .from(industrialQuotes)
          .innerJoin(
            industrialRequirements,
            and(
              eq(industrialQuotes.requirementId, industrialRequirements.id),
              eq(industrialQuotes.tenantId, industrialRequirements.tenantId),
            ),
          )
          .leftJoin(
            industrialCatalogItems,
            and(
              eq(industrialQuotes.catalogItemId, industrialCatalogItems.id),
              eq(industrialQuotes.tenantId, industrialCatalogItems.tenantId),
            ),
          )
          .where(
            and(
              eq(industrialQuotes.tenantId, tenant.id),
              eq(industrialQuotes.factoryId, factory.id),
            ),
          )
          .orderBy(desc(industrialQuotes.updatedAt))
          .limit(120),
        db
          .select({
            order: industrialOrders,
            quote: industrialQuotes,
            requirement: industrialRequirements,
            item: industrialCatalogItems,
          })
          .from(industrialOrders)
          .innerJoin(
            industrialQuotes,
            and(
              eq(industrialOrders.quoteId, industrialQuotes.id),
              eq(industrialOrders.tenantId, industrialQuotes.tenantId),
            ),
          )
          .innerJoin(
            industrialRequirements,
            and(
              eq(industrialOrders.requirementId, industrialRequirements.id),
              eq(industrialOrders.tenantId, industrialRequirements.tenantId),
            ),
          )
          .leftJoin(
            industrialCatalogItems,
            and(
              eq(industrialOrders.catalogItemId, industrialCatalogItems.id),
              eq(industrialOrders.tenantId, industrialCatalogItems.tenantId),
            ),
          )
          .where(
            and(
              eq(industrialOrders.tenantId, tenant.id),
              eq(industrialOrders.factoryId, factory.id),
            ),
          )
          .orderBy(
            desc(industrialOrders.updatedAt),
            desc(industrialOrders.createdAt),
          )
          .limit(120),
        db
          .select()
          .from(industrialFactoryDocuments)
          .where(
            and(
              eq(industrialFactoryDocuments.tenantId, tenant.id),
              eq(industrialFactoryDocuments.factoryId, factory.id),
              isNull(industrialFactoryDocuments.archivedAt),
            ),
          )
          .orderBy(desc(industrialFactoryDocuments.updatedAt))
          .limit(120),
        db.query.industrialFactoryRelationships.findFirst({
          where: and(
            eq(industrialFactoryRelationships.tenantId, tenant.id),
            eq(industrialFactoryRelationships.factoryId, factory.id),
          ),
        }),
      ]);

      const challengeAttachmentsByRequirement = new Map<string, any[]>();
      for (const row of challengeAttachments) {
        const attachments =
          challengeAttachmentsByRequirement.get(row.attachment.requirementId) ||
          [];
        attachments.push(row.attachment);
        challengeAttachmentsByRequirement.set(
          row.attachment.requirementId,
          attachments,
        );
      }

      const challengeSummaries = challenges.map((row) =>
        factoryChallengeSummary(
          row.challenge,
          row.requirement,
          challengeAttachmentsByRequirement.get(row.challenge.requirementId) ||
            [],
        ),
      );
      const documentSummaries = documents.map(factoryDocumentSummary);
      const documentGaps = buildIndustrialFactoryDocumentGaps({
        verificationStatus: factory.verificationStatus,
        exportMarkets: factory.exportMarkets,
        publicCertifications: factory.publicCertifications,
        documentTypes: documentSummaries.map(
          (document) => document.documentType,
        ),
      });
      const dashboard = buildIndustrialFactoryDashboard({
        requirements,
        quotes: quotes.map((row) => row.quote),
        orders: orders.map((row) => row.order),
        challenges: challengeSummaries,
        documentGapCount: documentGaps.length,
        documentsOnFile: documentSummaries.length,
      });

      return res.json({
        ok: true,
        factory: {
          ...staffFactorySummary(factory),
          publicDescription: factory.publicDescription,
          publicWebsite: factory.publicWebsite,
          publicEmail: factory.publicEmail,
          publicPhone: factory.publicPhone,
          publicAddress: factory.publicAddress,
          publicCertifications: factory.publicCertifications,
          exportMarkets: factory.exportMarkets,
        },
        relationship: factoryOwnerRelationshipSummary(
          relationship,
          factory.accountManagerUserId,
        ),
        productionLines: productionLines.map(
          ({ privateMetadata, ...line }) => ({
            ...line,
            purpose:
              typeof safeRecord(privateMetadata).purpose === "string"
                ? (safeRecord(privateMetadata).purpose as string)
                : null,
          }),
        ),
        machines: machines.map(({ privateMetadata, ...machine }) => ({
          ...machine,
          technicalDetails: machineTechnicalDetails(privateMetadata),
        })),
        assemblies,
        components,
        catalog: catalog.map((item) => staffCatalogSummary(item, factory)),
        requirements: requirements.map(factoryRequirementSummary),
        quotes: quotes.map((row) =>
          factoryQuoteSummary(row.quote, row.requirement, row.item),
        ),
        recurringRequirements: recurringRequirements.map((item) =>
          staffRecurringRequirementSummary(item, factory),
        ),
        challenges: challengeSummaries,
        orders: orders.map((row) =>
          factoryOrderSummary(row.order, row.quote, row.requirement, row.item),
        ),
        documents: documentSummaries,
        documentGaps,
        dashboard,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The factory workspace is temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/me/factories/:factoryId/documents",
  ensureTenantUser,
  handleIndustrialRequirementAttachmentUpload,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory document identifier.",
      });
    }
    const parsed = factoryDocumentUploadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Choose a document type and provide a clear title.",
        issues: parsed.error.flatten(),
      });
    }
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({
        ok: false,
        message: "Attach one private factory document under the file field.",
      });
    }
    const validation = validateIndustrialRequirementAttachment(file);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, message: validation.message });
    }
    const expiresAt = parseOptionalDate(parsed.data.expiresAt);
    if (parsed.data.expiresAt && !expiresAt) {
      return res.status(400).json({
        ok: false,
        message: "Provide a valid document expiry date or leave it empty.",
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (!factory) {
        return res.status(404).json({
          ok: false,
          message: "This factory is not managed by your account.",
        });
      }
      if (["archived", "suspended"].includes(factory.factoryStatus)) {
        return res.status(409).json({
          ok: false,
          message:
            "Documents cannot be added to an archived or suspended factory.",
        });
      }

      const [existingCount] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(industrialFactoryDocuments)
        .where(
          and(
            eq(industrialFactoryDocuments.tenantId, tenant.id),
            eq(industrialFactoryDocuments.factoryId, factory.id),
            isNull(industrialFactoryDocuments.archivedAt),
          ),
        );
      if (
        Number(existingCount?.total || 0) >=
        INDUSTRIAL_FACTORY_DOCUMENT_MAX_FILES
      ) {
        return res.status(409).json({
          ok: false,
          message: `This factory already has the maximum of ${INDUSTRIAL_FACTORY_DOCUMENT_MAX_FILES} active documents. Archive an obsolete document before adding another.`,
        });
      }

      const persisted = await persistIndustrialFactoryDocument({
        tenantId: tenant.id,
        factoryId: factory.id,
        file,
        attachment: validation.attachment,
      });
      try {
        const [document] = await db.transaction(async (tx) => {
          const [countRow] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(industrialFactoryDocuments)
            .where(
              and(
                eq(industrialFactoryDocuments.tenantId, tenant.id),
                eq(industrialFactoryDocuments.factoryId, factory.id),
                isNull(industrialFactoryDocuments.archivedAt),
              ),
            );
          if (
            Number(countRow?.total || 0) >=
            INDUSTRIAL_FACTORY_DOCUMENT_MAX_FILES
          ) {
            throw new Error("industrial_factory_document_limit_reached");
          }
          const [created] = await tx
            .insert(industrialFactoryDocuments)
            .values({
              tenantId: tenant.id,
              factoryId: factory.id,
              uploadedByUserId: ownerUserId,
              documentType: parsed.data.documentType,
              title: parsed.data.title,
              fileName: validation.attachment.fileName,
              storageKey: persisted.storageKey,
              mimeType: validation.attachment.mimeType,
              sizeBytes: validation.attachment.sizeBytes,
              visibility: "factory_team_only",
              expiresAt,
            })
            .returning();
          await tx.insert(industrialAuditLogs).values({
            tenantId: tenant.id,
            actorUserId: ownerUserId,
            action: "industrial_factory_document.uploaded_by_factory_owner",
            entityType: "industrial_factory_document",
            entityId: created.id,
            metadata: {
              factoryId: factory.id,
              documentType: created.documentType,
              fileName: created.fileName,
              mimeType: created.mimeType,
              sizeBytes: created.sizeBytes,
              visibility: created.visibility,
              changesVerification: false,
              createsSupplierOutreach: false,
              createsPurchaseOrder: false,
              createsManufacturingJob: false,
            },
          });
          return [created] as const;
        });
        return res.status(201).json({
          ok: true,
          document: factoryDocumentSummary(document),
          message:
            "The document is stored privately for your factory team and Exportunity reviewers. It does not change verification or create commercial activity.",
        });
      } catch (error: any) {
        await fs.unlink(persisted.absolutePath).catch(() => undefined);
        if (
          String(error?.message || "").includes(
            "industrial_factory_document_limit_reached",
          )
        ) {
          return res.status(409).json({
            ok: false,
            message: `This factory already has the maximum of ${INDUSTRIAL_FACTORY_DOCUMENT_MAX_FILES} active documents. Archive an obsolete document before adding another.`,
          });
        }
        throw error;
      }
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The private factory document could not be stored.",
      });
    }
  },
);

router.get(
  "/me/factories/:factoryId/documents/:documentId/download",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    const documentId = String(req.params?.documentId || "").trim();
    if (
      !ownerUserId ||
      !z.string().uuid().safeParse(factoryId).success ||
      !z.string().uuid().safeParse(documentId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory document identifier.",
      });
    }
    try {
      const [row] = await db
        .select({
          factory: industrialFactories,
          document: industrialFactoryDocuments,
        })
        .from(industrialFactoryDocuments)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialFactoryDocuments.factoryId, industrialFactories.id),
            eq(
              industrialFactoryDocuments.tenantId,
              industrialFactories.tenantId,
            ),
          ),
        )
        .where(
          and(
            eq(industrialFactoryDocuments.id, documentId),
            eq(industrialFactoryDocuments.factoryId, factoryId),
            eq(industrialFactoryDocuments.tenantId, tenant.id),
            eq(industrialFactories.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      if (!row) {
        return res.status(404).json({
          ok: false,
          message: "The private factory document was not found.",
        });
      }
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: ownerUserId,
        action: "industrial_factory_document.downloaded_by_factory_owner",
        entityType: "industrial_factory_document",
        entityId: row.document.id,
        metadata: { factoryId: row.factory.id },
      });
      const file = await resolveIndustrialFactoryDocument(
        row.document.storageKey,
      );
      const safeFileName = String(
        row.document.fileName || "factory-document",
      ).replace(/[\\\"\r\n]/g, "_");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        row.document.mimeType || "application/octet-stream",
      );
      res.setHeader("Content-Length", String(file.sizeBytes));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName}"`,
      );
      const stream = createReadStream(file.absolutePath);
      stream.on("error", () => {
        if (!res.headersSent)
          res.status(404).json({
            ok: false,
            message: "The private factory document is unavailable.",
          });
        else res.end();
      });
      stream.pipe(res);
    } catch {
      return res.status(404).json({
        ok: false,
        message: "The private factory document is unavailable.",
      });
    }
  },
);

router.delete(
  "/me/factories/:factoryId/documents/:documentId",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    const documentId = String(req.params?.documentId || "").trim();
    if (
      !ownerUserId ||
      !z.string().uuid().safeParse(factoryId).success ||
      !z.string().uuid().safeParse(documentId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory document identifier.",
      });
    }
    try {
      const [document] = await db
        .select({ document: industrialFactoryDocuments })
        .from(industrialFactoryDocuments)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialFactoryDocuments.factoryId, industrialFactories.id),
            eq(
              industrialFactoryDocuments.tenantId,
              industrialFactories.tenantId,
            ),
          ),
        )
        .where(
          and(
            eq(industrialFactoryDocuments.id, documentId),
            eq(industrialFactoryDocuments.factoryId, factoryId),
            eq(industrialFactoryDocuments.tenantId, tenant.id),
            eq(industrialFactories.ownerUserId, ownerUserId),
            isNull(industrialFactoryDocuments.archivedAt),
          ),
        )
        .limit(1);
      if (!document) {
        return res.status(404).json({
          ok: false,
          message: "The active private factory document was not found.",
        });
      }
      const now = new Date();
      const [archived] = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(industrialFactoryDocuments)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(industrialFactoryDocuments.id, document.document.id),
              eq(industrialFactoryDocuments.tenantId, tenant.id),
              isNull(industrialFactoryDocuments.archivedAt),
            ),
          )
          .returning();
        if (!updated) throw new Error("industrial_factory_document_not_active");
        await tx.insert(industrialAuditLogs).values({
          tenantId: tenant.id,
          actorUserId: ownerUserId,
          action: "industrial_factory_document.archived_by_factory_owner",
          entityType: "industrial_factory_document",
          entityId: updated.id,
          previousValue: { archivedAt: null },
          nextValue: { archivedAt: now.toISOString() },
          metadata: { factoryId, fileName: updated.fileName },
        });
        return [updated] as const;
      });
      return res.json({
        ok: true,
        document: factoryDocumentSummary(archived),
        message:
          "The factory document was archived from the active workspace. Its audit record is retained.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The private factory document could not be archived.",
      });
    }
  },
);

router.post(
  "/me/factories/:factoryId/technical-assets",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory technical registry identifier.",
      });
    }
    const parsed = ownedTechnicalAssetSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Complete the technical asset fields.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (!factory)
        return res.status(404).json({
          ok: false,
          message: "This factory is not managed by your account.",
        });
      if (["archived", "suspended"].includes(factory.factoryStatus)) {
        return res.status(400).json({
          ok: false,
          message:
            "Technical assets cannot be changed for an archived or suspended factory.",
        });
      }

      const links = await resolveOwnedTechnicalAssetLinks(
        tenant.id,
        factory.id,
        parsed.data,
      );
      if (!links.ok)
        return res.status(400).json({ ok: false, message: links.message });

      const now = new Date();
      let created: { id: string; name: string } | undefined;
      if (parsed.data.assetType === "production_line") {
        [created] = await db
          .insert(industrialProductionLines)
          .values({
            tenantId: tenant.id,
            factoryId: factory.id,
            name: parsed.data.name,
            industry: optionalText(parsed.data.industry),
            operatingStatus: parsed.data.operatingStatus,
            visibility: "factory_team_only",
            privateMetadata: mergeProductionLineMetadata(
              {},
              parsed.data.purpose,
            ),
            updatedAt: now,
          })
          .returning({
            id: industrialProductionLines.id,
            name: industrialProductionLines.name,
          });
      } else if (parsed.data.assetType === "machine") {
        [created] = await db
          .insert(industrialMachines)
          .values({
            tenantId: tenant.id,
            factoryId: factory.id,
            productionLineId: optionalText(parsed.data.productionLineId),
            name: parsed.data.name,
            manufacturer: optionalText(parsed.data.manufacturer),
            model: optionalText(parsed.data.model),
            serialNumber: optionalText(parsed.data.serialNumber),
            machineCategory: optionalText(parsed.data.machineCategory),
            operatingStatus: parsed.data.operatingStatus,
            visibility: "factory_team_only",
            privateMetadata: mergeMachineTechnicalDetails(
              {},
              parsed.data.technicalDetails,
            ),
            updatedAt: now,
          })
          .returning({
            id: industrialMachines.id,
            name: industrialMachines.name,
          });
      } else if (parsed.data.assetType === "assembly") {
        [created] = await db
          .insert(industrialMachineAssemblies)
          .values({
            tenantId: tenant.id,
            factoryId: factory.id,
            machineId: parsed.data.machineId,
            name: parsed.data.name,
            assemblyType: optionalText(parsed.data.assemblyType),
            operatingStatus: parsed.data.operatingStatus,
            visibility: "factory_team_only",
            privateMetadata: { source: "factory_workspace" },
            updatedAt: now,
          })
          .returning({
            id: industrialMachineAssemblies.id,
            name: industrialMachineAssemblies.name,
          });
      } else {
        [created] = await db
          .insert(industrialMachineComponents)
          .values({
            tenantId: tenant.id,
            factoryId: factory.id,
            machineId: parsed.data.machineId,
            assemblyId: optionalText(parsed.data.assemblyId),
            name: parsed.data.name,
            componentType: optionalText(parsed.data.componentType),
            partNumber: optionalText(parsed.data.partNumber),
            manufacturer: optionalText(parsed.data.manufacturer),
            model: optionalText(parsed.data.model),
            criticality: parsed.data.criticality,
            operatingStatus: parsed.data.operatingStatus,
            visibility: "factory_team_only",
            privateMetadata: { source: "factory_workspace" },
            updatedAt: now,
          })
          .returning({
            id: industrialMachineComponents.id,
            name: industrialMachineComponents.name,
          });
      }

      if (!created)
        return res.status(500).json({
          ok: false,
          message:
            "The technical asset could not be added to the factory registry.",
        });
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: ownerUserId,
        action: "industrial_technical_asset.created_by_factory_owner",
        entityType: `industrial_${parsed.data.assetType}`,
        entityId: created.id,
        nextValue: {
          assetType: parsed.data.assetType,
          name: created.name,
          operatingStatus: parsed.data.operatingStatus,
        },
        metadata: {
          factoryId: factory.id,
          source: "factory_workspace",
          visibility: "factory_team_only",
        },
      });

      return res.status(201).json({
        ok: true,
        asset: { ...created, assetType: parsed.data.assetType },
        message:
          "The private technical asset has been added to the factory registry.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message:
          "The technical asset could not be added to the factory registry.",
      });
    }
  },
);

router.patch(
  "/me/factories/:factoryId/technical-assets/:assetId",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    const assetId = String(req.params?.assetId || "").trim();
    if (
      !ownerUserId ||
      !z.string().uuid().safeParse(factoryId).success ||
      !z.string().uuid().safeParse(assetId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory technical asset identifier.",
      });
    }
    const parsed = ownedTechnicalAssetSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Complete the technical asset fields.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (!factory)
        return res.status(404).json({
          ok: false,
          message: "This factory is not managed by your account.",
        });
      if (["archived", "suspended"].includes(factory.factoryStatus)) {
        return res.status(400).json({
          ok: false,
          message:
            "Technical assets cannot be changed for an archived or suspended factory.",
        });
      }

      const links = await resolveOwnedTechnicalAssetLinks(
        tenant.id,
        factory.id,
        parsed.data,
      );
      if (!links.ok)
        return res.status(400).json({ ok: false, message: links.message });

      const now = new Date();
      let previousValue: Record<string, unknown> = {};
      let updated: { id: string; name: string } | undefined;
      if (parsed.data.assetType === "production_line") {
        const existing = await db.query.industrialProductionLines.findFirst({
          where: and(
            eq(industrialProductionLines.id, assetId),
            eq(industrialProductionLines.tenantId, tenant.id),
            eq(industrialProductionLines.factoryId, factory.id),
          ),
        });
        if (!existing)
          return res.status(404).json({
            ok: false,
            message: "This production line is not available for this factory.",
          });
        previousValue = {
          assetType: "production_line",
          name: existing.name,
          industry: existing.industry,
          operatingStatus: existing.operatingStatus,
        };
        [updated] = await db
          .update(industrialProductionLines)
          .set({
            name: parsed.data.name,
            industry: optionalText(parsed.data.industry),
            operatingStatus: parsed.data.operatingStatus,
            privateMetadata: mergeProductionLineMetadata(
              existing.privateMetadata,
              parsed.data.purpose,
            ),
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialProductionLines.id, existing.id),
              eq(industrialProductionLines.tenantId, tenant.id),
              eq(industrialProductionLines.factoryId, factory.id),
            ),
          )
          .returning({
            id: industrialProductionLines.id,
            name: industrialProductionLines.name,
          });
      } else if (parsed.data.assetType === "machine") {
        const existing = await db.query.industrialMachines.findFirst({
          where: and(
            eq(industrialMachines.id, assetId),
            eq(industrialMachines.tenantId, tenant.id),
            eq(industrialMachines.factoryId, factory.id),
          ),
        });
        if (!existing)
          return res.status(404).json({
            ok: false,
            message: "This machine is not available for this factory.",
          });
        previousValue = {
          assetType: "machine",
          name: existing.name,
          manufacturer: existing.manufacturer,
          model: existing.model,
          serialNumber: existing.serialNumber,
          operatingStatus: existing.operatingStatus,
        };
        [updated] = await db
          .update(industrialMachines)
          .set({
            productionLineId: optionalText(parsed.data.productionLineId),
            name: parsed.data.name,
            manufacturer: optionalText(parsed.data.manufacturer),
            model: optionalText(parsed.data.model),
            serialNumber: optionalText(parsed.data.serialNumber),
            machineCategory: optionalText(parsed.data.machineCategory),
            operatingStatus: parsed.data.operatingStatus,
            privateMetadata: mergeMachineTechnicalDetails(
              existing.privateMetadata,
              parsed.data.technicalDetails,
            ),
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialMachines.id, existing.id),
              eq(industrialMachines.tenantId, tenant.id),
              eq(industrialMachines.factoryId, factory.id),
            ),
          )
          .returning({
            id: industrialMachines.id,
            name: industrialMachines.name,
          });
      } else if (parsed.data.assetType === "assembly") {
        const existing = await db.query.industrialMachineAssemblies.findFirst({
          where: and(
            eq(industrialMachineAssemblies.id, assetId),
            eq(industrialMachineAssemblies.tenantId, tenant.id),
            eq(industrialMachineAssemblies.factoryId, factory.id),
          ),
        });
        if (!existing)
          return res.status(404).json({
            ok: false,
            message: "This assembly is not available for this factory.",
          });
        if (existing.machineId !== parsed.data.machineId) {
          return res.status(409).json({
            ok: false,
            message:
              "An existing assembly cannot be moved to a different machine. Register a new assembly to preserve its maintenance history.",
          });
        }
        previousValue = {
          assetType: "assembly",
          name: existing.name,
          machineId: existing.machineId,
          operatingStatus: existing.operatingStatus,
        };
        [updated] = await db
          .update(industrialMachineAssemblies)
          .set({
            name: parsed.data.name,
            assemblyType: optionalText(parsed.data.assemblyType),
            operatingStatus: parsed.data.operatingStatus,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialMachineAssemblies.id, existing.id),
              eq(industrialMachineAssemblies.tenantId, tenant.id),
              eq(industrialMachineAssemblies.factoryId, factory.id),
            ),
          )
          .returning({
            id: industrialMachineAssemblies.id,
            name: industrialMachineAssemblies.name,
          });
      } else {
        const existing = await db.query.industrialMachineComponents.findFirst({
          where: and(
            eq(industrialMachineComponents.id, assetId),
            eq(industrialMachineComponents.tenantId, tenant.id),
            eq(industrialMachineComponents.factoryId, factory.id),
          ),
        });
        if (!existing)
          return res.status(404).json({
            ok: false,
            message: "This component is not available for this factory.",
          });
        if (
          existing.machineId !== parsed.data.machineId ||
          (existing.assemblyId || null) !==
            (optionalText(parsed.data.assemblyId) || null)
        ) {
          return res.status(409).json({
            ok: false,
            message:
              "An existing component cannot be moved to a different technical parent. Register a new component to preserve its requirement history.",
          });
        }
        previousValue = {
          assetType: "component",
          name: existing.name,
          machineId: existing.machineId,
          assemblyId: existing.assemblyId,
          partNumber: existing.partNumber,
          operatingStatus: existing.operatingStatus,
        };
        [updated] = await db
          .update(industrialMachineComponents)
          .set({
            name: parsed.data.name,
            componentType: optionalText(parsed.data.componentType),
            partNumber: optionalText(parsed.data.partNumber),
            manufacturer: optionalText(parsed.data.manufacturer),
            model: optionalText(parsed.data.model),
            criticality: parsed.data.criticality,
            operatingStatus: parsed.data.operatingStatus,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialMachineComponents.id, existing.id),
              eq(industrialMachineComponents.tenantId, tenant.id),
              eq(industrialMachineComponents.factoryId, factory.id),
            ),
          )
          .returning({
            id: industrialMachineComponents.id,
            name: industrialMachineComponents.name,
          });
      }

      if (!updated)
        return res.status(500).json({
          ok: false,
          message: "The technical asset could not be updated.",
        });
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: ownerUserId,
        action: "industrial_technical_asset.updated_by_factory_owner",
        entityType: `industrial_${parsed.data.assetType}`,
        entityId: updated.id,
        previousValue,
        nextValue: {
          assetType: parsed.data.assetType,
          name: updated.name,
          operatingStatus: parsed.data.operatingStatus,
        },
        metadata: {
          factoryId: factory.id,
          source: "factory_workspace",
          visibility: "factory_team_only",
        },
      });

      return res.json({
        ok: true,
        asset: { ...updated, assetType: parsed.data.assetType },
        message: "The private technical asset has been updated.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The technical asset could not be updated.",
      });
    }
  },
);

router.get(
  "/me/factories/:factoryId/recurring-requirements",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory recurring requirement identifier.",
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (!factory)
        return res.status(404).json({
          ok: false,
          message: "This factory is not managed by your account.",
        });

      const requirements = await db
        .select()
        .from(industrialRecurringRequirements)
        .where(
          and(
            eq(industrialRecurringRequirements.tenantId, tenant.id),
            eq(industrialRecurringRequirements.factoryId, factory.id),
          ),
        )
        .orderBy(desc(industrialRecurringRequirements.updatedAt))
        .limit(safeLimit(req.query?.limit, 120));

      return res.json({
        ok: true,
        recurringRequirements: requirements.map((item) =>
          staffRecurringRequirementSummary(item, factory),
        ),
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "Recurring procurement plans are temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/me/factories/:factoryId/recurring-requirements",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory recurring requirement identifier.",
      });
    }
    const parsed = recurringRequirementCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Complete the recurring procurement fields.",
        issues: parsed.error.flatten(),
      });
    }

    const category = INDUSTRIAL_TAXONOMY.find(
      (entry) => entry.code === parsed.data.categoryCode,
    );
    if (
      !category ||
      category.classification !==
        classificationForRequirementType(parsed.data.requirementType)
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "The industrial category must match the recurring requirement type.",
      });
    }

    const contractStartAt = parseOptionalDate(parsed.data.contractStartAt);
    const contractEndAt = parseOptionalDate(parsed.data.contractEndAt);
    const nextReviewAt = parseOptionalDate(parsed.data.nextReviewAt);
    if (
      (parsed.data.contractStartAt && !contractStartAt) ||
      (parsed.data.contractEndAt && !contractEndAt) ||
      (parsed.data.nextReviewAt && !nextReviewAt)
    ) {
      return res.status(400).json({
        ok: false,
        message: "Use valid dates for the contract or the next review.",
      });
    }
    if (contractStartAt && contractEndAt && contractEndAt < contractStartAt) {
      return res.status(400).json({
        ok: false,
        message: "The contract end date must be after the start date.",
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (
        !factory ||
        ["archived", "suspended"].includes(factory.factoryStatus)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Choose an active factory profile before planning recurring procurement.",
        });
      }

      const technicalContext = await resolveFactoryTechnicalContext(
        tenant.id,
        factory.id,
        parsed.data,
      );
      if (!technicalContext.ok) {
        return res
          .status(400)
          .json({ ok: false, message: technicalContext.message });
      }

      const [requirement] = await db
        .insert(industrialRecurringRequirements)
        .values({
          tenantId: tenant.id,
          factoryId: factory.id,
          machineId: technicalContext.machineId,
          assemblyId: technicalContext.assemblyId,
          componentId: technicalContext.componentId,
          createdByUserId: ownerUserId,
          updatedByUserId: ownerUserId,
          requirementType: parsed.data.requirementType,
          categoryCode: parsed.data.categoryCode,
          title: parsed.data.title,
          details: optionalText(parsed.data.details) || "",
          quantityText: optionalText(parsed.data.quantityText),
          frequency: parsed.data.frequency,
          reorderThreshold: optionalText(parsed.data.reorderThreshold),
          preferredDeliveryDate: optionalText(
            parsed.data.preferredDeliveryDate,
          ),
          preferredSupplier: optionalText(parsed.data.preferredSupplier),
          alternativeSupplier: optionalText(parsed.data.alternativeSupplier),
          priceAgreementPeriod: optionalText(parsed.data.priceAgreementPeriod),
          contractStartAt,
          contractEndAt,
          approvalWorkflow: parsed.data.approvalWorkflow,
          approvalRequired: parsed.data.approvalRequired,
          status: parsed.data.status,
          nextReviewAt,
          internalNotes: optionalText(parsed.data.internalNotes),
        })
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: ownerUserId,
        action: "industrial_recurring_requirement.created_by_factory_owner",
        entityType: "industrial_recurring_requirement",
        entityId: requirement.id,
        nextValue: {
          status: requirement.status,
          frequency: requirement.frequency,
          approvalWorkflow: requirement.approvalWorkflow,
        },
        metadata: {
          factoryId: factory.id,
          machineId: technicalContext.machineId,
          assemblyId: technicalContext.assemblyId,
          componentId: technicalContext.componentId,
          requirementType: requirement.requirementType,
          categoryCode: requirement.categoryCode,
          createsPurchaseOrder: false,
          source: "factory_workspace",
        },
      });

      return res.status(201).json({
        ok: true,
        recurringRequirement: staffRecurringRequirementSummary(
          requirement,
          factory,
        ),
        message:
          "Recurring procurement was saved as a controlled plan. No order, supplier message, or payment was created.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The recurring procurement plan could not be saved.",
      });
    }
  },
);

router.patch(
  "/me/factories/:factoryId/recurring-requirements/:recurringRequirementId",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    const recurringRequirementId = String(
      req.params?.recurringRequirementId || "",
    ).trim();
    if (
      !ownerUserId ||
      !z.string().uuid().safeParse(factoryId).success ||
      !z.string().uuid().safeParse(recurringRequirementId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid recurring procurement identifier.",
      });
    }
    const parsed = recurringRequirementUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Provide valid recurring procurement changes.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const [factory, existing] = await Promise.all([
        db.query.industrialFactories.findFirst({
          where: and(
            eq(industrialFactories.id, factoryId),
            eq(industrialFactories.tenantId, tenant.id),
            eq(industrialFactories.ownerUserId, ownerUserId),
          ),
        }),
        db.query.industrialRecurringRequirements.findFirst({
          where: and(
            eq(industrialRecurringRequirements.id, recurringRequirementId),
            eq(industrialRecurringRequirements.tenantId, tenant.id),
            eq(industrialRecurringRequirements.factoryId, factoryId),
          ),
        }),
      ]);
      if (!factory || !existing)
        return res.status(404).json({
          ok: false,
          message:
            "This recurring procurement plan is not managed by your account.",
        });
      if (["archived", "suspended"].includes(factory.factoryStatus)) {
        return res.status(400).json({
          ok: false,
          message:
            "Recurring procurement cannot be changed for a suspended or archived factory.",
        });
      }

      const nextRequirementType =
        parsed.data.requirementType ?? existing.requirementType;
      const nextCategoryCode =
        parsed.data.categoryCode ?? existing.categoryCode;
      const category = INDUSTRIAL_TAXONOMY.find(
        (entry) => entry.code === nextCategoryCode,
      );
      if (
        !category ||
        category.classification !==
          classificationForRequirementType(nextRequirementType)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "The industrial category must match the recurring requirement type.",
        });
      }

      const contractStartAt =
        parsed.data.contractStartAt === undefined
          ? existing.contractStartAt
          : parseOptionalDate(parsed.data.contractStartAt);
      const contractEndAt =
        parsed.data.contractEndAt === undefined
          ? existing.contractEndAt
          : parseOptionalDate(parsed.data.contractEndAt);
      const nextReviewAt =
        parsed.data.nextReviewAt === undefined
          ? existing.nextReviewAt
          : parseOptionalDate(parsed.data.nextReviewAt);
      if (
        (parsed.data.contractStartAt && !contractStartAt) ||
        (parsed.data.contractEndAt && !contractEndAt) ||
        (parsed.data.nextReviewAt && !nextReviewAt)
      ) {
        return res.status(400).json({
          ok: false,
          message: "Use valid dates for the contract or the next review.",
        });
      }
      if (contractStartAt && contractEndAt && contractEndAt < contractStartAt) {
        return res.status(400).json({
          ok: false,
          message: "The contract end date must be after the start date.",
        });
      }

      const nextStatus = parsed.data.status ?? existing.status;
      if (!canTransitionRecurringRequirement(existing.status, nextStatus)) {
        return res.status(400).json({
          ok: false,
          message:
            "This recurring procurement status cannot be changed from its current state.",
        });
      }

      const technicalContext = await resolveFactoryTechnicalContext(
        tenant.id,
        factory.id,
        {
          machineId:
            parsed.data.machineId === undefined
              ? existing.machineId
              : parsed.data.machineId,
          assemblyId:
            parsed.data.assemblyId === undefined
              ? existing.assemblyId
              : parsed.data.assemblyId,
          componentId:
            parsed.data.componentId === undefined
              ? existing.componentId
              : parsed.data.componentId,
        },
      );
      if (!technicalContext.ok) {
        return res
          .status(400)
          .json({ ok: false, message: technicalContext.message });
      }

      const now = new Date();
      const [updated] = await db
        .update(industrialRecurringRequirements)
        .set({
          requirementType: nextRequirementType,
          categoryCode: nextCategoryCode,
          machineId: technicalContext.machineId,
          assemblyId: technicalContext.assemblyId,
          componentId: technicalContext.componentId,
          title: parsed.data.title ?? existing.title,
          details:
            parsed.data.details === undefined
              ? existing.details
              : optionalText(parsed.data.details) || "",
          quantityText:
            parsed.data.quantityText === undefined
              ? existing.quantityText
              : optionalText(parsed.data.quantityText),
          frequency: parsed.data.frequency ?? existing.frequency,
          reorderThreshold:
            parsed.data.reorderThreshold === undefined
              ? existing.reorderThreshold
              : optionalText(parsed.data.reorderThreshold),
          preferredDeliveryDate:
            parsed.data.preferredDeliveryDate === undefined
              ? existing.preferredDeliveryDate
              : optionalText(parsed.data.preferredDeliveryDate),
          preferredSupplier:
            parsed.data.preferredSupplier === undefined
              ? existing.preferredSupplier
              : optionalText(parsed.data.preferredSupplier),
          alternativeSupplier:
            parsed.data.alternativeSupplier === undefined
              ? existing.alternativeSupplier
              : optionalText(parsed.data.alternativeSupplier),
          priceAgreementPeriod:
            parsed.data.priceAgreementPeriod === undefined
              ? existing.priceAgreementPeriod
              : optionalText(parsed.data.priceAgreementPeriod),
          contractStartAt,
          contractEndAt,
          approvalWorkflow:
            parsed.data.approvalWorkflow ?? existing.approvalWorkflow,
          approvalRequired:
            parsed.data.approvalRequired ?? existing.approvalRequired,
          status: nextStatus,
          nextReviewAt,
          internalNotes:
            parsed.data.internalNotes === undefined
              ? existing.internalNotes
              : optionalText(parsed.data.internalNotes),
          updatedByUserId: ownerUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialRecurringRequirements.id, existing.id),
            eq(industrialRecurringRequirements.tenantId, tenant.id),
            eq(industrialRecurringRequirements.factoryId, factory.id),
          ),
        )
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: ownerUserId,
        action: "industrial_recurring_requirement.updated_by_factory_owner",
        entityType: "industrial_recurring_requirement",
        entityId: updated.id,
        previousValue: {
          status: existing.status,
          frequency: existing.frequency,
          nextReviewAt: existing.nextReviewAt?.toISOString?.() || null,
        },
        nextValue: {
          status: updated.status,
          frequency: updated.frequency,
          nextReviewAt: updated.nextReviewAt?.toISOString?.() || null,
        },
        metadata: {
          factoryId: factory.id,
          machineId: technicalContext.machineId,
          assemblyId: technicalContext.assemblyId,
          componentId: technicalContext.componentId,
          createsPurchaseOrder: false,
          source: "factory_workspace",
        },
      });

      return res.json({
        ok: true,
        recurringRequirement: staffRecurringRequirementSummary(
          updated,
          factory,
        ),
        message:
          "Recurring procurement plan updated. No order, supplier message, or payment was created.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The recurring procurement plan could not be updated.",
      });
    }
  },
);

router.get(
  "/me/factories/:factoryId/challenges",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory industrial challenge identifier.",
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (!factory) {
        return res.status(404).json({
          ok: false,
          message: "This factory is not managed by your account.",
        });
      }

      const [rows, attachmentRows] = await Promise.all([
        db
          .select({
            challenge: industrialChallenges,
            requirement: industrialRequirements,
          })
          .from(industrialChallenges)
          .innerJoin(
            industrialRequirements,
            and(
              eq(industrialChallenges.requirementId, industrialRequirements.id),
              eq(
                industrialChallenges.tenantId,
                industrialRequirements.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialChallenges.tenantId, tenant.id),
              eq(industrialChallenges.factoryId, factory.id),
            ),
          )
          .orderBy(desc(industrialChallenges.updatedAt))
          .limit(safeLimit(req.query?.limit, 120)),
        db
          .select({ attachment: industrialRequirementAttachments })
          .from(industrialRequirementAttachments)
          .innerJoin(
            industrialChallenges,
            and(
              eq(
                industrialRequirementAttachments.requirementId,
                industrialChallenges.requirementId,
              ),
              eq(
                industrialRequirementAttachments.tenantId,
                industrialChallenges.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialRequirementAttachments.tenantId, tenant.id),
              eq(industrialChallenges.factoryId, factory.id),
            ),
          )
          .orderBy(desc(industrialRequirementAttachments.createdAt)),
      ]);
      const attachmentsByRequirement = new Map<string, any[]>();
      for (const row of attachmentRows) {
        const attachments =
          attachmentsByRequirement.get(row.attachment.requirementId) || [];
        attachments.push(row.attachment);
        attachmentsByRequirement.set(row.attachment.requirementId, attachments);
      }

      return res.json({
        ok: true,
        challenges: rows.map((row) =>
          factoryChallengeSummary(
            row.challenge,
            row.requirement,
            attachmentsByRequirement.get(row.challenge.requirementId) || [],
          ),
        ),
        total: rows.length,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "Industrial challenges are temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/me/factories/:factoryId/challenges",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory industrial challenge identifier.",
      });
    }
    const parsed = industrialChallengeCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Complete the industrial challenge fields.",
        issues: parsed.error.flatten(),
      });
    }

    const category = INDUSTRIAL_TAXONOMY.find(
      (entry) => entry.code === parsed.data.categoryCode,
    );
    if (
      !category ||
      category.classification !==
        classificationForRequirementType(parsed.data.requirementType)
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "The industrial category must match the challenge requirement type.",
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (
        !factory ||
        ["archived", "suspended"].includes(factory.factoryStatus)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Choose an active factory profile before reporting an industrial challenge.",
        });
      }

      const contact = staffFactorySummary(factory);
      if (!contact.contactName || !contact.contactEmail) {
        return res.status(400).json({
          ok: false,
          message:
            "Add a named industrial contact and email to the factory profile before reporting a challenge.",
        });
      }
      const requesterName = contact.contactName;
      const requesterEmail = contact.contactEmail;

      const technicalContext = await resolveFactoryTechnicalContext(
        tenant.id,
        factory.id,
        parsed.data,
      );
      if (!technicalContext.ok) {
        return res
          .status(400)
          .json({ ok: false, message: technicalContext.message });
      }

      const now = new Date();
      const urgency =
        parsed.data.productionStopped && parsed.data.urgency === "standard"
          ? "urgent"
          : parsed.data.urgency;
      const groupKey = suggestIndustrialChallengeGroupKey(
        parsed.data.categoryCode,
        parsed.data.title,
      );

      const created = await db.transaction(async (tx) => {
        const [requirement] = await tx
          .insert(industrialRequirements)
          .values({
            tenantId: tenant.id,
            factoryId: factory.id,
            machineId: technicalContext.machineId,
            assemblyId: technicalContext.assemblyId,
            componentId: technicalContext.componentId,
            requesterUserId: ownerUserId,
            referenceCode: makeReference("CHL"),
            requirementType: parsed.data.requirementType,
            categoryCode: parsed.data.categoryCode,
            title: parsed.data.title,
            details: parsed.data.details,
            deliveryCountryCode: factory.countryCode,
            deliveryCity: factory.city || null,
            urgency,
            requesterCompany: factory.legalName,
            requesterName,
            requesterEmail,
            requesterPhone: contact.contactPhone || null,
            status: "submitted",
            visibility: "factory_team_only",
            submittedAt: now,
            metadata: {
              source: "factory_industrial_challenge",
              industrialChallenge: {
                problemType: parsed.data.problemType,
                productionStopped: parsed.data.productionStopped,
                impactText: optionalText(parsed.data.impactText),
                recurrenceFrequency: optionalText(
                  parsed.data.recurrenceFrequency,
                ),
                estimatedDowntime: optionalText(parsed.data.estimatedDowntime),
                currentWorkaround: optionalText(parsed.data.currentWorkaround),
                desiredOutcome: parsed.data.desiredOutcome,
              },
              internalWorkflow: {
                nextAction: "Industrial challenge triage",
                challengeStatus: "submitted",
              },
            },
          })
          .returning();

        const [challenge] = await tx
          .insert(industrialChallenges)
          .values({
            tenantId: tenant.id,
            factoryId: factory.id,
            requirementId: requirement.id,
            machineId: technicalContext.machineId,
            assemblyId: technicalContext.assemblyId,
            componentId: technicalContext.componentId,
            createdByUserId: ownerUserId,
            requirementType: parsed.data.requirementType,
            categoryCode: parsed.data.categoryCode,
            title: parsed.data.title,
            normalizedTitle: normalizeIndustrialText(parsed.data.title),
            details: parsed.data.details,
            problemType: parsed.data.problemType,
            productionStopped: parsed.data.productionStopped,
            impactText: optionalText(parsed.data.impactText),
            recurrenceFrequency: optionalText(parsed.data.recurrenceFrequency),
            estimatedDowntime: optionalText(parsed.data.estimatedDowntime),
            currentWorkaround: optionalText(parsed.data.currentWorkaround),
            desiredOutcome: parsed.data.desiredOutcome,
            urgency,
            status: "submitted",
            visibility: "factory_team_only",
            groupKey,
          })
          .returning();

        await tx.insert(industrialAuditLogs).values([
          {
            tenantId: tenant.id,
            actorUserId: ownerUserId,
            action: "industrial_requirement.created_from_factory_challenge",
            entityType: "industrial_requirement",
            entityId: requirement.id,
            nextValue: { status: requirement.status },
            metadata: {
              factoryId: factory.id,
              challengeId: challenge.id,
              createsPurchaseOrder: false,
              createsSupplierOutreach: false,
              createsManufacturingJob: false,
              source: "factory_workspace",
            },
          },
          {
            tenantId: tenant.id,
            actorUserId: ownerUserId,
            action: "industrial_challenge.created_by_factory_owner",
            entityType: "industrial_challenge",
            entityId: challenge.id,
            nextValue: {
              status: challenge.status,
              desiredOutcome: challenge.desiredOutcome,
              urgency: challenge.urgency,
            },
            metadata: {
              factoryId: factory.id,
              requirementId: requirement.id,
              machineId: technicalContext.machineId,
              assemblyId: technicalContext.assemblyId,
              componentId: technicalContext.componentId,
              suggestedGroupKey: groupKey,
              groupingRequiresStaffReview: true,
              createsPurchaseOrder: false,
              createsSupplierOutreach: false,
              createsManufacturingJob: false,
            },
          },
        ]);

        return { challenge, requirement };
      });

      return res.status(201).json({
        ok: true,
        challenge: factoryChallengeSummary(
          created.challenge,
          created.requirement,
        ),
        message:
          "Industrial challenge submitted for controlled review. No supplier message, order, manufacturing job, or payment was created.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The industrial challenge could not be submitted.",
      });
    }
  },
);

router.post(
  "/me/factories/:factoryId/challenges/:challengeId/attachments",
  ensureTenantUser,
  handleIndustrialRequirementAttachmentUpload,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    const challengeId = String(req.params?.challengeId || "").trim();
    if (
      !ownerUserId ||
      !z.string().uuid().safeParse(factoryId).success ||
      !z.string().uuid().safeParse(challengeId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory challenge attachment identifier.",
      });
    }
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({
        ok: false,
        message: "Attach one technical document under the file field.",
      });
    }
    const validation = validateIndustrialRequirementAttachment(file);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, message: validation.message });
    }

    try {
      const [row] = await db
        .select({
          factory: industrialFactories,
          challenge: industrialChallenges,
          requirement: industrialRequirements,
        })
        .from(industrialChallenges)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialChallenges.factoryId, industrialFactories.id),
            eq(industrialChallenges.tenantId, industrialFactories.tenantId),
          ),
        )
        .innerJoin(
          industrialRequirements,
          and(
            eq(industrialChallenges.requirementId, industrialRequirements.id),
            eq(industrialChallenges.tenantId, industrialRequirements.tenantId),
          ),
        )
        .where(
          and(
            eq(industrialChallenges.id, challengeId),
            eq(industrialChallenges.factoryId, factoryId),
            eq(industrialChallenges.tenantId, tenant.id),
            eq(industrialFactories.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      if (!row) {
        return res.status(404).json({
          ok: false,
          message: "This factory challenge is not managed by your account.",
        });
      }
      if (["archived", "suspended"].includes(row.factory.factoryStatus)) {
        return res.status(409).json({
          ok: false,
          message:
            "Technical evidence cannot be added to an archived or suspended factory.",
        });
      }
      if (!isOpenIndustrialChallenge(row.challenge.status)) {
        return res.status(409).json({
          ok: false,
          message:
            "Technical evidence cannot be added after the industrial challenge is closed. Contact Exportunity to reopen it if needed.",
        });
      }

      const [existingCount] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(industrialRequirementAttachments)
        .where(
          and(
            eq(industrialRequirementAttachments.tenantId, tenant.id),
            eq(
              industrialRequirementAttachments.requirementId,
              row.requirement.id,
            ),
          ),
        );
      if (
        Number(existingCount?.total || 0) >=
        INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES
      ) {
        return res.status(409).json({
          ok: false,
          message: `This challenge already has the maximum of ${INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES} technical documents.`,
        });
      }

      const persisted = await persistIndustrialRequirementAttachment({
        tenantId: tenant.id,
        requirementId: row.requirement.id,
        file,
        attachment: validation.attachment,
      });
      try {
        const [attachment] = await db.transaction(async (tx) => {
          const [countRow] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(industrialRequirementAttachments)
            .where(
              and(
                eq(industrialRequirementAttachments.tenantId, tenant.id),
                eq(
                  industrialRequirementAttachments.requirementId,
                  row.requirement.id,
                ),
              ),
            );
          if (
            Number(countRow?.total || 0) >=
            INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES
          ) {
            throw new Error("industrial_requirement_attachment_limit_reached");
          }
          const [created] = await tx
            .insert(industrialRequirementAttachments)
            .values({
              tenantId: tenant.id,
              requirementId: row.requirement.id,
              uploadedByUserId: ownerUserId,
              fileName: validation.attachment.fileName,
              storageKey: persisted.storageKey,
              mimeType: validation.attachment.mimeType,
              sizeBytes: validation.attachment.sizeBytes,
              visibility: "factory_team_only",
            })
            .returning();
          await tx.insert(industrialAuditLogs).values([
            {
              tenantId: tenant.id,
              actorUserId: ownerUserId,
              action:
                "industrial_requirement.attachment_uploaded_by_factory_owner",
              entityType: "industrial_requirement",
              entityId: row.requirement.id,
              metadata: {
                attachmentId: created.id,
                challengeId: row.challenge.id,
                factoryId: row.factory.id,
                fileName: created.fileName,
                mimeType: created.mimeType,
                sizeBytes: created.sizeBytes,
                visibility: created.visibility,
                source: "factory_challenge_owner_evidence",
              },
            },
            {
              tenantId: tenant.id,
              actorUserId: ownerUserId,
              action: "industrial_challenge.attachment_added_by_factory_owner",
              entityType: "industrial_challenge",
              entityId: row.challenge.id,
              metadata: {
                attachmentId: created.id,
                requirementId: row.requirement.id,
                factoryId: row.factory.id,
                fileName: created.fileName,
                mimeType: created.mimeType,
                sizeBytes: created.sizeBytes,
                visibility: created.visibility,
                createsSupplierOutreach: false,
                createsPurchaseOrder: false,
                createsManufacturingJob: false,
                source: "factory_workspace",
              },
            },
          ]);
          return [created] as const;
        });
        return res.status(201).json({
          ok: true,
          attachment: industrialRequirementAttachmentSummary(attachment),
          message:
            "Technical evidence was stored privately for your factory team and Exportunity reviewers. No supplier contact, quotation, order, manufacturing job, or payment was created.",
        });
      } catch (error: any) {
        await fs.unlink(persisted.absolutePath).catch(() => undefined);
        if (
          String(error?.message || "").includes(
            "industrial_requirement_attachment_limit_reached",
          )
        ) {
          return res.status(409).json({
            ok: false,
            message: `This challenge already has the maximum of ${INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES} technical documents.`,
          });
        }
        throw error;
      }
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The technical evidence could not be stored privately.",
      });
    }
  },
);

router.get(
  "/me/factories/:factoryId/challenges/:challengeId/attachments/:attachmentId/download",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    const challengeId = String(req.params?.challengeId || "").trim();
    const attachmentId = String(req.params?.attachmentId || "").trim();
    if (
      !ownerUserId ||
      !z.string().uuid().safeParse(factoryId).success ||
      !z.string().uuid().safeParse(challengeId).success ||
      !z.string().uuid().safeParse(attachmentId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory challenge attachment identifier.",
      });
    }

    try {
      const [row] = await db
        .select({
          challenge: industrialChallenges,
          factory: industrialFactories,
          attachment: industrialRequirementAttachments,
        })
        .from(industrialChallenges)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialChallenges.factoryId, industrialFactories.id),
            eq(industrialChallenges.tenantId, industrialFactories.tenantId),
          ),
        )
        .innerJoin(
          industrialRequirementAttachments,
          and(
            eq(
              industrialChallenges.requirementId,
              industrialRequirementAttachments.requirementId,
            ),
            eq(
              industrialChallenges.tenantId,
              industrialRequirementAttachments.tenantId,
            ),
          ),
        )
        .where(
          and(
            eq(industrialChallenges.id, challengeId),
            eq(industrialChallenges.factoryId, factoryId),
            eq(industrialChallenges.tenantId, tenant.id),
            eq(industrialFactories.ownerUserId, ownerUserId),
            eq(industrialRequirementAttachments.id, attachmentId),
          ),
        )
        .limit(1);
      if (!row) {
        return res.status(404).json({
          ok: false,
          message:
            "Technical evidence was not found for this factory challenge.",
        });
      }

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: ownerUserId,
        action: "industrial_challenge.attachment_downloaded_by_factory_owner",
        entityType: "industrial_challenge",
        entityId: row.challenge.id,
        metadata: {
          attachmentId: row.attachment.id,
          requirementId: row.challenge.requirementId,
          factoryId: row.factory.id,
          source: "factory_workspace",
        },
      });

      const file = await resolveIndustrialRequirementAttachment(
        row.attachment.storageKey,
      );
      const safeFileName = String(
        row.attachment.fileName || "technical-document",
      ).replace(/[\\\"\r\n]/g, "_");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        row.attachment.mimeType || "application/octet-stream",
      );
      res.setHeader("Content-Length", String(file.sizeBytes));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName}"`,
      );
      const stream = createReadStream(file.absolutePath);
      stream.on("error", () => {
        if (!res.headersSent)
          res.status(404).json({
            ok: false,
            message: "Technical evidence is unavailable.",
          });
        else res.end();
      });
      stream.pipe(res);
    } catch {
      return res.status(404).json({
        ok: false,
        message: "Technical evidence is unavailable.",
      });
    }
  },
);

router.get(
  "/me/factories/:factoryId/part-records",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory part-record identifier.",
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
        columns: { id: true },
      });
      if (!factory) {
        return res.status(404).json({
          ok: false,
          message: "This factory is not managed by your account.",
        });
      }

      const [records, documentRows] = await Promise.all([
        db
          .select()
          .from(industrialPartRecords)
          .where(
            and(
              eq(industrialPartRecords.tenantId, tenant.id),
              eq(industrialPartRecords.factoryId, factoryId),
            ),
          )
          .orderBy(desc(industrialPartRecords.updatedAt))
          .limit(safeLimit(req.query?.limit, 120)),
        db
          .select({ document: industrialPartRecordDocuments })
          .from(industrialPartRecordDocuments)
          .innerJoin(
            industrialPartRecords,
            and(
              eq(
                industrialPartRecordDocuments.partRecordId,
                industrialPartRecords.id,
              ),
              eq(
                industrialPartRecordDocuments.tenantId,
                industrialPartRecords.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialPartRecordDocuments.tenantId, tenant.id),
              eq(industrialPartRecords.factoryId, factoryId),
            ),
          )
          .orderBy(desc(industrialPartRecordDocuments.createdAt)),
      ]);
      const documentsByPartRecord = new Map<string, any[]>();
      for (const row of documentRows) {
        const documents =
          documentsByPartRecord.get(row.document.partRecordId) || [];
        documents.push(row.document);
        documentsByPartRecord.set(row.document.partRecordId, documents);
      }

      return res.json({
        ok: true,
        partRecords: records.map((record) =>
          factoryPartRecordSummary(
            record,
            documentsByPartRecord.get(record.id) || [],
          ),
        ),
        total: records.length,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "Factory part records are temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/me/factories/:factoryId/part-records",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory part-record identifier.",
      });
    }
    const parsed = industrialPartRecordCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Complete the technical part-record fields.",
        issues: parsed.error.flatten(),
      });
    }

    const category = INDUSTRIAL_TAXONOMY.find(
      (entry) => entry.code === parsed.data.categoryCode,
    );
    if (
      !category ||
      category.classification !==
        classificationForRequirementType(parsed.data.requirementType)
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "The industrial category must match the part-record requirement type.",
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (
        !factory ||
        ["archived", "suspended"].includes(factory.factoryStatus)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Choose an active factory profile before recording a technical part.",
        });
      }
      const contact = staffFactorySummary(factory);
      if (!contact.contactName || !contact.contactEmail) {
        return res.status(400).json({
          ok: false,
          message:
            "Add a named industrial contact and email to the factory profile before recording a part.",
        });
      }
      const requesterName = contact.contactName;
      const requesterEmail = contact.contactEmail;

      const technicalContext = await resolveFactoryTechnicalContext(
        tenant.id,
        factory.id,
        parsed.data,
      );
      if (!technicalContext.ok) {
        return res
          .status(400)
          .json({ ok: false, message: technicalContext.message });
      }
      const challengeId = optionalText(parsed.data.challengeId);
      if (challengeId) {
        const challenge = await db.query.industrialChallenges.findFirst({
          where: and(
            eq(industrialChallenges.id, challengeId),
            eq(industrialChallenges.tenantId, tenant.id),
            eq(industrialChallenges.factoryId, factory.id),
          ),
          columns: { id: true },
        });
        if (!challenge) {
          return res.status(400).json({
            ok: false,
            message:
              "The linked production challenge is not available for this factory.",
          });
        }
      }

      const now = new Date();
      const referenceCode = makeReference("PRT");
      const technicalDetails =
        optionalText(parsed.data.technicalDetails) ||
        "Technical part record submitted for controlled digitization and route review.";
      const created = await db.transaction(async (tx) => {
        const [requirement] = await tx
          .insert(industrialRequirements)
          .values({
            tenantId: tenant.id,
            factoryId: factory.id,
            machineId: technicalContext.machineId,
            assemblyId: technicalContext.assemblyId,
            componentId: technicalContext.componentId,
            requesterUserId: ownerUserId,
            referenceCode,
            requirementType: parsed.data.requirementType,
            categoryCode: parsed.data.categoryCode,
            title: parsed.data.title,
            details: technicalDetails,
            deliveryCountryCode: factory.countryCode,
            deliveryCity: factory.city || null,
            urgency: parsed.data.urgency,
            requesterCompany: factory.legalName,
            requesterName,
            requesterEmail,
            requesterPhone: contact.contactPhone || null,
            status: "submitted",
            visibility: "factory_team_only",
            submittedAt: now,
            metadata: {
              source: "factory_scan_to_manufacture",
              internalWorkflow: {
                nextAction: "Technical part-record capture review",
                createsSupplierOutreach: false,
                createsPurchaseOrder: false,
                createsManufacturingJob: false,
                createsPayment: false,
              },
            },
          })
          .returning();

        const [partRecord] = await tx
          .insert(industrialPartRecords)
          .values({
            tenantId: tenant.id,
            factoryId: factory.id,
            sourceRequirementId: requirement.id,
            challengeId,
            machineId: technicalContext.machineId,
            assemblyId: technicalContext.assemblyId,
            componentId: technicalContext.componentId,
            createdByUserId: ownerUserId,
            referenceCode,
            title: parsed.data.title,
            normalizedTitle: normalizeIndustrialText(parsed.data.title),
            partNumber: optionalText(parsed.data.partNumber),
            requirementType: parsed.data.requirementType,
            categoryCode: parsed.data.categoryCode,
            technicalDetails,
            material: optionalText(parsed.data.material),
            dimensionsText: optionalText(parsed.data.dimensionsText),
            weightText: optionalText(parsed.data.weightText),
            application: optionalText(parsed.data.application),
            currentSource: optionalText(parsed.data.currentSource),
            demandSignalText: optionalText(parsed.data.demandSignalText),
            status: "captured",
            routeDecision: "review_required",
            visibility: "factory_team_only",
            metadata: {
              source: "factory_scan_to_manufacture",
              recordPurpose: "controlled_technical_review",
              externalActionsCreated: false,
            },
          })
          .returning();

        await tx
          .update(industrialRequirements)
          .set({
            metadata: {
              source: "factory_scan_to_manufacture",
              partRecord: {
                id: partRecord.id,
                referenceCode: partRecord.referenceCode,
                status: partRecord.status,
              },
              internalWorkflow: {
                nextAction: "Technical part-record capture review",
                createsSupplierOutreach: false,
                createsPurchaseOrder: false,
                createsManufacturingJob: false,
                createsPayment: false,
              },
            },
            updatedAt: now,
          })
          .where(eq(industrialRequirements.id, requirement.id));

        await tx.insert(industrialAuditLogs).values([
          {
            tenantId: tenant.id,
            actorUserId: ownerUserId,
            action: "industrial_requirement.created_from_factory_part_record",
            entityType: "industrial_requirement",
            entityId: requirement.id,
            nextValue: { status: requirement.status },
            metadata: {
              factoryId: factory.id,
              partRecordId: partRecord.id,
              source: "factory_workspace",
              createsSupplierOutreach: false,
              createsPurchaseOrder: false,
              createsManufacturingJob: false,
              createsPayment: false,
            },
          },
          {
            tenantId: tenant.id,
            actorUserId: ownerUserId,
            action: "industrial_part_record.created_by_factory_owner",
            entityType: "industrial_part_record",
            entityId: partRecord.id,
            nextValue: {
              status: partRecord.status,
              routeDecision: partRecord.routeDecision,
              revision: partRecord.revision,
            },
            metadata: {
              factoryId: factory.id,
              requirementId: requirement.id,
              challengeId,
              machineId: technicalContext.machineId,
              assemblyId: technicalContext.assemblyId,
              componentId: technicalContext.componentId,
              source: "factory_workspace",
              createsSupplierOutreach: false,
              createsPurchaseOrder: false,
              createsManufacturingJob: false,
              createsPayment: false,
            },
          },
        ]);
        return { partRecord, requirement };
      });

      return res.status(201).json({
        ok: true,
        partRecord: factoryPartRecordSummary(created.partRecord),
        requirement: factoryRequirementSummary(created.requirement),
        message:
          "Technical part record created for controlled digitization and route review. No supplier message, quotation, order, production job, or payment was created.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The technical part record could not be saved.",
      });
    }
  },
);

router.post(
  "/me/factories/:factoryId/part-records/:partRecordId/documents",
  ensureTenantUser,
  handleIndustrialRequirementAttachmentUpload,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    const partRecordId = String(req.params?.partRecordId || "").trim();
    if (
      !ownerUserId ||
      !z.string().uuid().safeParse(factoryId).success ||
      !z.string().uuid().safeParse(partRecordId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory part-record document identifier.",
      });
    }
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({
        ok: false,
        message: "Attach one technical document under the file field.",
      });
    }
    const documentFields = industrialPartRecordDocumentUploadSchema.safeParse(
      req.body || {},
    );
    if (!documentFields.success) {
      return res.status(400).json({
        ok: false,
        message:
          "Provide the evidence type and title for this technical document.",
        issues: documentFields.error.flatten(),
      });
    }
    const validation = validateIndustrialRequirementAttachment(file);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, message: validation.message });
    }

    try {
      const [row] = await db
        .select({
          factory: industrialFactories,
          partRecord: industrialPartRecords,
        })
        .from(industrialPartRecords)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialPartRecords.factoryId, industrialFactories.id),
            eq(industrialPartRecords.tenantId, industrialFactories.tenantId),
          ),
        )
        .where(
          and(
            eq(industrialPartRecords.id, partRecordId),
            eq(industrialPartRecords.factoryId, factoryId),
            eq(industrialPartRecords.tenantId, tenant.id),
            eq(industrialFactories.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      if (!row) {
        return res.status(404).json({
          ok: false,
          message: "Technical part record not found for this factory.",
        });
      }
      if (row.partRecord.status === "archived") {
        return res.status(409).json({
          ok: false,
          message:
            "Archived technical part records cannot receive new evidence.",
        });
      }

      const [existingCount] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(industrialPartRecordDocuments)
        .where(
          and(
            eq(industrialPartRecordDocuments.tenantId, tenant.id),
            eq(industrialPartRecordDocuments.partRecordId, partRecordId),
          ),
        );
      if (
        Number(existingCount?.total || 0) >=
        INDUSTRIAL_PART_RECORD_DOCUMENT_MAX_FILES
      ) {
        return res.status(409).json({
          ok: false,
          message: `This technical part record already has the maximum of ${INDUSTRIAL_PART_RECORD_DOCUMENT_MAX_FILES} evidence files.`,
        });
      }

      const persisted = await persistIndustrialPartRecordDocument({
        tenantId: tenant.id,
        partRecordId,
        file,
        attachment: validation.attachment,
      });
      try {
        const [document] = await db.transaction(async (tx) => {
          const [countRow] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(industrialPartRecordDocuments)
            .where(
              and(
                eq(industrialPartRecordDocuments.tenantId, tenant.id),
                eq(industrialPartRecordDocuments.partRecordId, partRecordId),
              ),
            );
          if (
            Number(countRow?.total || 0) >=
            INDUSTRIAL_PART_RECORD_DOCUMENT_MAX_FILES
          ) {
            throw new Error("industrial_part_record_document_limit_reached");
          }
          const [created] = await tx
            .insert(industrialPartRecordDocuments)
            .values({
              tenantId: tenant.id,
              partRecordId,
              uploadedByUserId: ownerUserId,
              documentType: documentFields.data.documentType,
              title: documentFields.data.title,
              fileName: validation.attachment.fileName,
              storageKey: persisted.storageKey,
              mimeType: validation.attachment.mimeType,
              sizeBytes: validation.attachment.sizeBytes,
              visibility: "factory_team_only",
            })
            .returning();
          await tx
            .update(industrialPartRecords)
            .set({ updatedAt: new Date() })
            .where(eq(industrialPartRecords.id, partRecordId));
          await tx.insert(industrialAuditLogs).values({
            tenantId: tenant.id,
            actorUserId: ownerUserId,
            action: "industrial_part_record.document_added_by_factory_owner",
            entityType: "industrial_part_record",
            entityId: partRecordId,
            metadata: {
              factoryId: row.factory.id,
              documentId: created.id,
              documentType: created.documentType,
              fileName: created.fileName,
              mimeType: created.mimeType,
              sizeBytes: created.sizeBytes,
              visibility: created.visibility,
              source: "factory_workspace",
              createsSupplierOutreach: false,
              createsPurchaseOrder: false,
              createsManufacturingJob: false,
              createsPayment: false,
            },
          });
          return [created] as const;
        });
        return res.status(201).json({
          ok: true,
          document: industrialPartRecordDocumentSummary(document),
          message:
            "Technical evidence was stored privately for your factory team and Exportunity reviewers. No supplier contact, quotation, order, production job, or payment was created.",
        });
      } catch (error: any) {
        await fs.unlink(persisted.absolutePath).catch(() => undefined);
        if (
          String(error?.message || "").includes(
            "industrial_part_record_document_limit_reached",
          )
        ) {
          return res.status(409).json({
            ok: false,
            message: `This technical part record already has the maximum of ${INDUSTRIAL_PART_RECORD_DOCUMENT_MAX_FILES} evidence files.`,
          });
        }
        throw error;
      }
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The technical evidence could not be stored privately.",
      });
    }
  },
);

router.get(
  "/me/factories/:factoryId/part-records/:partRecordId/documents/:documentId/download",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    const partRecordId = String(req.params?.partRecordId || "").trim();
    const documentId = String(req.params?.documentId || "").trim();
    if (
      !ownerUserId ||
      !z.string().uuid().safeParse(factoryId).success ||
      !z.string().uuid().safeParse(partRecordId).success ||
      !z.string().uuid().safeParse(documentId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory part-record document identifier.",
      });
    }

    try {
      const [row] = await db
        .select({
          factory: industrialFactories,
          partRecord: industrialPartRecords,
          document: industrialPartRecordDocuments,
        })
        .from(industrialPartRecordDocuments)
        .innerJoin(
          industrialPartRecords,
          and(
            eq(
              industrialPartRecordDocuments.partRecordId,
              industrialPartRecords.id,
            ),
            eq(
              industrialPartRecordDocuments.tenantId,
              industrialPartRecords.tenantId,
            ),
          ),
        )
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialPartRecords.factoryId, industrialFactories.id),
            eq(industrialPartRecords.tenantId, industrialFactories.tenantId),
          ),
        )
        .where(
          and(
            eq(industrialPartRecordDocuments.id, documentId),
            eq(industrialPartRecords.id, partRecordId),
            eq(industrialPartRecords.factoryId, factoryId),
            eq(industrialPartRecords.tenantId, tenant.id),
            eq(industrialFactories.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      if (!row) {
        return res.status(404).json({
          ok: false,
          message:
            "Technical evidence was not found for this factory part record.",
        });
      }

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: ownerUserId,
        action: "industrial_part_record.document_downloaded_by_factory_owner",
        entityType: "industrial_part_record",
        entityId: row.partRecord.id,
        metadata: {
          factoryId: row.factory.id,
          documentId: row.document.id,
          source: "factory_workspace",
        },
      });
      const file = await resolveIndustrialPartRecordDocument(
        row.document.storageKey,
      );
      const safeFileName = String(
        row.document.fileName || "technical-part-document",
      ).replace(/[\\\"\r\n]/g, "_");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        row.document.mimeType || "application/octet-stream",
      );
      res.setHeader("Content-Length", String(file.sizeBytes));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName}"`,
      );
      const stream = createReadStream(file.absolutePath);
      stream.on("error", () => {
        if (!res.headersSent) {
          res.status(404).json({
            ok: false,
            message: "Technical evidence is unavailable.",
          });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    } catch {
      return res.status(404).json({
        ok: false,
        message: "Technical evidence is unavailable.",
      });
    }
  },
);

router.patch(
  "/me/factories/:factoryId/public-profile",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid factory profile identifier." });
    }
    const parsed = ownedFactoryPublicProfileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Complete the public factory profile fields.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (!factory)
        return res.status(404).json({
          ok: false,
          message: "This factory is not managed by your account.",
        });

      const now = new Date();
      const [updated] = await db
        .update(industrialFactories)
        .set({
          displayName: parsed.data.displayName,
          publicDescription: parsed.data.publicDescription || null,
          publicWebsite: parsed.data.publicWebsite || null,
          publicEmail: parsed.data.publicEmail || null,
          publicPhone: parsed.data.publicPhone || null,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialFactories.id, factory.id),
            eq(industrialFactories.tenantId, tenant.id),
            eq(industrialFactories.ownerUserId, ownerUserId),
          ),
        )
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: ownerUserId,
        action: "industrial_factory.public_profile_updated_by_owner",
        entityType: "industrial_factory",
        entityId: factory.id,
        previousValue: {
          displayName: factory.displayName,
          publicDescription: factory.publicDescription,
          publicWebsite: factory.publicWebsite,
          publicEmail: factory.publicEmail,
          publicPhone: factory.publicPhone,
        },
        nextValue: {
          displayName: updated.displayName,
          publicDescription: updated.publicDescription,
          publicWebsite: updated.publicWebsite,
          publicEmail: updated.publicEmail,
          publicPhone: updated.publicPhone,
        },
        metadata: { source: "factory_workspace" },
      });

      return res.json({
        ok: true,
        factory: staffFactorySummary(updated),
        message:
          "The public factory profile has been updated. Existing verification status was not changed.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The public factory profile could not be updated.",
      });
    }
  },
);

router.post(
  "/me/factories/:factoryId/catalog",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const ownerUserId = actorIdFor(req, "tenantUser");
    const factoryId = String(req.params?.factoryId || "").trim();
    if (!ownerUserId || !z.string().uuid().safeParse(factoryId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid factory catalog identifier." });
    }
    const parsed = ownedCatalogItemSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Complete the catalog item fields.",
        issues: parsed.error.flatten(),
      });
    }
    const category = INDUSTRIAL_TAXONOMY.find(
      (entry) => entry.code === parsed.data.categoryCode,
    );
    if (!category || category.classification !== parsed.data.classification) {
      return res.status(400).json({
        ok: false,
        message:
          "The industrial category must match the selected classification.",
      });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.ownerUserId, ownerUserId),
        ),
      });
      if (
        !factory ||
        ["archived", "suspended"].includes(factory.factoryStatus)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Choose an active factory profile before adding a catalog item.",
        });
      }

      const normalizedName = normalizeIndustrialText(parsed.data.name);
      const duplicate = await db.query.industrialCatalogItems.findFirst({
        where: and(
          eq(industrialCatalogItems.tenantId, tenant.id),
          eq(industrialCatalogItems.factoryId, factory.id),
          eq(industrialCatalogItems.normalizedName, normalizedName),
        ),
      });
      if (duplicate && duplicate.approvalStatus !== "archived") {
        return res.status(409).json({
          ok: false,
          message:
            "A catalog item with this factory and name already exists. Review the existing record instead.",
        });
      }

      const [item] = await db
        .insert(industrialCatalogItems)
        .values({
          tenantId: tenant.id,
          factoryId: factory.id,
          classification: parsed.data.classification,
          categoryCode: parsed.data.categoryCode,
          name: parsed.data.name,
          normalizedName,
          publicDescription: parsed.data.publicDescription || null,
          productCode: parsed.data.productCode || null,
          supplyModes: parsed.data.supplyModes,
          priceMode: parsed.data.priceMode,
          availabilityStatus: parsed.data.availabilityStatus,
          manufacturer: parsed.data.manufacturer || null,
          brand: parsed.data.brand || null,
          model: parsed.data.model || null,
          partNumber: parsed.data.partNumber || null,
          countryOfOrigin: parsed.data.countryOfOrigin || null,
          technicalSpecifications: parsed.data.technicalSpecifications,
          application: parsed.data.application || null,
          compatibleMachinery: parsed.data.compatibleMachinery,
          material: parsed.data.material || null,
          unitOfMeasure: parsed.data.unitOfMeasure || null,
          minimumOrderQuantity: parsed.data.minimumOrderQuantity || null,
          availableQuantityText: parsed.data.availableQuantityText || null,
          productionCapacityText: parsed.data.productionCapacityText || null,
          leadTimeText: parsed.data.leadTimeText || null,
          supplyFrequency: parsed.data.supplyFrequency || null,
          currencyCode: parsed.data.currencyCode || null,
          priceText: parsed.data.priceText || null,
          certifications: parsed.data.certifications,
          visibility: "exportunity_internal",
          approvalStatus: "under_review",
          publicMedia: parsed.data.publicMedia,
          privateMetadata: parsed.data.privateMetadata,
        })
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: ownerUserId,
        action: "industrial_catalog_item.submitted_by_factory_owner",
        entityType: "industrial_catalog_item",
        entityId: item.id,
        nextValue: {
          approvalStatus: item.approvalStatus,
          visibility: item.visibility,
        },
        metadata: {
          factoryId: factory.id,
          classification: item.classification,
          categoryCode: item.categoryCode,
          source: "factory_workspace",
        },
      });

      return res.status(201).json({
        ok: true,
        item: staffCatalogSummary(item, factory),
        message:
          "The catalog item was sent to Exportunity for review. It is not public until approval.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The factory catalog item could not be saved.",
      });
    }
  },
);

router.post(
  "/me/factory-claims/:claimId/cancel",
  ensureTenantUser,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const claimantUserId = actorIdFor(req, "tenantUser");
    const claimId = String(req.params?.claimId || "").trim();
    if (!claimantUserId || !z.string().uuid().safeParse(claimId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid ownership claim." });
    }

    const claim = await db.query.industrialFactoryClaims.findFirst({
      where: and(
        eq(industrialFactoryClaims.id, claimId),
        eq(industrialFactoryClaims.tenantId, tenant.id),
        eq(industrialFactoryClaims.claimantUserId, claimantUserId),
      ),
    });
    if (!claim)
      return res
        .status(404)
        .json({ ok: false, message: "Factory ownership claim not found." });
    if (!canCancelFactoryClaim(claim.status)) {
      return res.status(400).json({
        ok: false,
        message: "Only a pending ownership claim can be cancelled.",
      });
    }

    const [updated] = await db
      .update(industrialFactoryClaims)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(industrialFactoryClaims.id, claim.id))
      .returning();
    await db.insert(industrialAuditLogs).values({
      tenantId: tenant.id,
      actorUserId: claimantUserId,
      action: "industrial_factory_claim.cancelled",
      entityType: "industrial_factory_claim",
      entityId: claim.id,
      previousValue: { status: claim.status },
      nextValue: { status: updated.status },
    });
    return res.json({
      ok: true,
      claim: staffFactoryClaimSummary(updated),
      message: "The factory ownership claim was cancelled.",
    });
  },
);

router.get("/catalog", async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  try {
    const query = String(req.query?.q || "").trim();
    const category = String(req.query?.category || "").trim();
    const classification = String(req.query?.classification || "").trim();
    const limit = safeLimit(req.query?.limit, 36);
    const searchConditions = industrialSearchTerms(query).flatMap((term) => {
      const like = `%${term}%`;
      return [
        ilike(industrialCatalogItems.name, like),
        ilike(industrialCatalogItems.publicDescription, like),
        ilike(industrialCatalogItems.productCode, like),
        ilike(industrialCatalogItems.manufacturer, like),
        ilike(industrialCatalogItems.brand, like),
        ilike(industrialCatalogItems.model, like),
        ilike(industrialCatalogItems.partNumber, like),
        ilike(industrialCatalogItems.application, like),
        ilike(industrialCatalogItems.material, like),
        sql`coalesce(${industrialCatalogItems.compatibleMachinery}::text, '') ilike ${like}`,
        sql`coalesce(${industrialCatalogItems.technicalSpecifications}::text, '') ilike ${like}`,
        sql`coalesce(${industrialCatalogItems.certifications}::text, '') ilike ${like}`,
      ];
    });
    const rows = await db
      .select({
        id: industrialCatalogItems.id,
        name: industrialCatalogItems.name,
        description: industrialCatalogItems.publicDescription,
        categoryCode: industrialCatalogItems.categoryCode,
        classification: industrialCatalogItems.classification,
        productCode: industrialCatalogItems.productCode,
        supplyModes: industrialCatalogItems.supplyModes,
        priceMode: industrialCatalogItems.priceMode,
        availabilityStatus: industrialCatalogItems.availabilityStatus,
        manufacturer: industrialCatalogItems.manufacturer,
        brand: industrialCatalogItems.brand,
        model: industrialCatalogItems.model,
        partNumber: industrialCatalogItems.partNumber,
        countryOfOrigin: industrialCatalogItems.countryOfOrigin,
        application: industrialCatalogItems.application,
        compatibleMachinery: industrialCatalogItems.compatibleMachinery,
        material: industrialCatalogItems.material,
        unitOfMeasure: industrialCatalogItems.unitOfMeasure,
        minimumOrderQuantity: industrialCatalogItems.minimumOrderQuantity,
        productionCapacityText: industrialCatalogItems.productionCapacityText,
        leadTimeText: industrialCatalogItems.leadTimeText,
        certifications: industrialCatalogItems.certifications,
        media: industrialCatalogItems.publicMedia,
        factoryId: industrialFactories.id,
        factoryName: industrialFactories.displayName,
        factoryCity: industrialFactories.city,
        factoryCountryCode: industrialFactories.countryCode,
      })
      .from(industrialCatalogItems)
      .innerJoin(
        industrialFactories,
        and(
          eq(industrialCatalogItems.factoryId, industrialFactories.id),
          eq(industrialCatalogItems.tenantId, industrialFactories.tenantId),
        ),
      )
      .where(
        and(
          eq(industrialCatalogItems.tenantId, tenant.id),
          eq(industrialCatalogItems.approvalStatus, "approved"),
          eq(industrialCatalogItems.visibility, "public"),
          eq(industrialFactories.factoryStatus, "active"),
          eq(industrialFactories.verificationStatus, "verified"),
          eq(industrialFactories.publicVisibility, "public"),
          category
            ? eq(industrialCatalogItems.categoryCode, category)
            : undefined,
          classification
            ? eq(industrialCatalogItems.classification, classification as any)
            : undefined,
          query ? or(...searchConditions) : undefined,
        ),
      )
      .orderBy(
        desc(industrialCatalogItems.updatedAt),
        industrialCatalogItems.name,
      )
      .limit(limit);

    const verifiedItems = rows.map((item) => ({
      ...item,
      listingKind: "verified_factory_catalog" as const,
      sourceUrl: null,
      sourceLabel: null,
      inventoryVerified: false,
      requestMode: "availability_request" as const,
      displayPriority: 0,
    }));
    const verifiedKeys = new Set(
      verifiedItems.map((item) =>
        normalizeIndustrialText(`${item.factoryName} ${item.name}`),
      ),
    );
    const curatedItems = findPublicIndustrialCatalog({
      query,
      category,
      classification,
      limit,
    }).filter(
      (item) =>
        !verifiedKeys.has(
          normalizeIndustrialText(`${item.factoryName} ${item.name}`),
        ),
    );
    const items = [...verifiedItems, ...curatedItems].slice(0, limit);

    res.json({
      ok: true,
      items,
      total: items.length,
      verifiedCatalogCount: verifiedItems.length,
      documentedOrSourcingCount: curatedItems.length,
      searchContext: industrialSearchRequirementContext(query),
    });
  } catch {
    res.status(503).json({
      ok: false,
      message: "The industrial catalog is temporarily unavailable.",
      code: "INDUSTRIAL_CATALOG_UNAVAILABLE",
    });
  }
});

router.post("/requirements", async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const rate = consumePublicSubmission(req, tenant.id);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSeconds));
    return res.status(429).json({
      ok: false,
      message:
        "Too many industrial requirements were submitted from this connection. Please try again shortly.",
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  const parsed = industrialRequirementSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Please complete the industrial requirement fields.",
      issues: parsed.error.flatten(),
    });
  }
  if (!isIndustrialCategoryCode(parsed.data.categoryCode)) {
    return res.status(400).json({
      ok: false,
      message: "The selected industrial category is not recognized.",
    });
  }

  try {
    if (parsed.data.factoryId) {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, parsed.data.factoryId),
          eq(industrialFactories.tenantId, tenant.id),
          eq(industrialFactories.factoryStatus, "active"),
          eq(industrialFactories.verificationStatus, "verified"),
          eq(industrialFactories.publicVisibility, "public"),
        ),
        columns: { id: true },
      });
      if (!factory) {
        return res.status(400).json({
          ok: false,
          message:
            "The selected factory is not available for a public industrial requirement.",
        });
      }
    }

    const referenceCode = makeReference("REQ");
    const submittedAt = new Date();
    const attachmentUpload = createIndustrialRequirementAttachmentUploadToken();
    const attachmentUploadExpiresAt = new Date(
      submittedAt.valueOf() + INDUSTRIAL_REQUIREMENT_ATTACHMENT_UPLOAD_TTL_MS,
    );
    const parsedRequiredBy = parsed.data.requiredBy
      ? new Date(parsed.data.requiredBy)
      : null;
    const requiredBy =
      parsedRequiredBy && !Number.isNaN(parsedRequiredBy.valueOf())
        ? parsedRequiredBy
        : null;
    const submittedCommercialContext = parsed.data.commercialContext;
    const commercialContext = submittedCommercialContext
      ? resolveCommercialQualification({
          analysis: {
            ...submittedCommercialContext,
            commercial:
              submittedCommercialContext.intent !== "GENERAL_QUESTION",
          },
          fallback: {
            productName:
              parsed.data.technicalDetails.productName ||
              parsed.data.technicalDetails.detectedProductName,
            productCategory:
              parsed.data.technicalDetails.detectedProductCategory,
            specification: parsed.data.technicalDetails.qualityRequirements,
            quantity: parsed.data.quantityText,
            unit: parsed.data.technicalDetails.unitOfMeasure,
            destination: parsed.data.deliveryCity,
            frequency: parsed.data.technicalDetails.frequency,
            incoterm: parsed.data.technicalDetails.incoterm,
            customerType: parsed.data.technicalDetails.customerType,
          },
        })
      : undefined;
    const customerContact = await ensureIndustrialCustomerContact({
      tenantId: tenant.id,
      requesterName: parsed.data.requesterName,
      requesterCompany: parsed.data.requesterCompany,
      requesterEmail: parsed.data.requesterEmail || null,
      requesterPhone: parsed.data.requesterPhone,
    });
    const nextAction = commercialContext
      ? commercialContext.suggestedAction === "ASK"
        ? `Complete qualification: ${commercialContext.missingFields.join(", ") || "commercial details"}`
        : commercialContext.suggestedAction === "ACT"
          ? "Review the qualified case and prepare approved specialist execution."
          : commercialContext.suggestedAction === "ESCALATE"
            ? "Escalate the case for human review."
            : "Provide an evidence-backed answer."
      : "Review and qualify the industrial requirement.";
    const [requirement] = await db
      .insert(industrialRequirements)
      .values({
        tenantId: tenant.id,
        factoryId: parsed.data.factoryId || null,
        customerContactId: customerContact.contactId,
        referenceCode,
        requirementType: parsed.data.requirementType,
        categoryCode: parsed.data.categoryCode,
        title: parsed.data.title,
        details: parsed.data.details,
        quantityText: parsed.data.quantityText || null,
        deliveryCountryCode: parsed.data.deliveryCountryCode || null,
        deliveryCity: parsed.data.deliveryCity || null,
        requiredBy,
        urgency: parsed.data.urgency,
        requesterCompany: parsed.data.requesterCompany || null,
        requesterName: parsed.data.requesterName,
        requesterEmail: parsed.data.requesterEmail || null,
        requesterPhone: parsed.data.requesterPhone || null,
        commercialIntent: commercialContext?.intent || null,
        commercialActionMode: commercialContext?.suggestedAction || null,
        intentConfidence: commercialContext
          ? String(commercialContext.confidence)
          : null,
        sourceConversationId:
          submittedCommercialContext?.sourceConversationId || null,
        nextAction,
        status: "submitted",
        visibility: "exportunity_internal",
        submittedAt,
        metadata: {
          intake: "public_industrial_requirement",
          source: "exportunity.net",
          customerContactId: customerContact.contactId,
          requiredByText: parsed.data.requiredBy || null,
          technicalDetails: parsed.data.technicalDetails,
          attachmentUpload: {
            tokenHash: attachmentUpload.tokenHash,
            expiresAt: attachmentUploadExpiresAt.toISOString(),
            maxFiles: INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES,
          },
        },
      })
      .returning({
        id: industrialRequirements.id,
        referenceCode: industrialRequirements.referenceCode,
        status: industrialRequirements.status,
        createdAt: industrialRequirements.createdAt,
      });

    if (commercialContext) {
      await db.insert(industrialProductRequirements).values({
        tenantId: tenant.id,
        requirementId: requirement.id,
        intent: commercialContext.intent,
        intentConfidence: String(commercialContext.confidence),
        suggestedAction: commercialContext.suggestedAction,
        productName:
          commercialContext.product.name ||
          parsed.data.technicalDetails.productName ||
          parsed.data.technicalDetails.detectedProductName ||
          null,
        productCategory:
          commercialContext.product.category ||
          parsed.data.technicalDetails.detectedProductCategory ||
          null,
        specification:
          commercialContext.product.specification ||
          parsed.data.technicalDetails.qualityRequirements ||
          null,
        quantityText:
          commercialContext.product.quantity || parsed.data.quantityText || null,
        unit:
          commercialContext.product.unit ||
          parsed.data.technicalDetails.unitOfMeasure ||
          null,
        origin:
          commercialContext.origin ||
          parsed.data.technicalDetails.originPreference ||
          null,
        destination:
          commercialContext.destination || parsed.data.deliveryCity || null,
        targetPrice:
          commercialContext.targetPrice ||
          parsed.data.technicalDetails.targetPrice ||
          parsed.data.technicalDetails.budget ||
          null,
        currency: commercialContext.currency || null,
        deadlineText:
          commercialContext.deadline || parsed.data.requiredBy || null,
        frequency:
          commercialContext.frequency ||
          parsed.data.technicalDetails.frequency ||
          null,
        incoterm:
          commercialContext.incoterm ||
          parsed.data.technicalDetails.incoterm ||
          null,
        customerType:
          commercialContext.customerType ||
          parsed.data.technicalDetails.customerType ||
          null,
        missingFields: commercialContext.missingFields,
        metadata: {
          source: "exportunity_ai_commercial_intake",
          requirementType: parsed.data.requirementType,
          categoryCode: parsed.data.categoryCode,
        },
      });
    }

    await db.insert(industrialAuditLogs).values({
      tenantId: tenant.id,
      action: "industrial_requirement.submitted",
      entityType: "industrial_requirement",
      entityId: requirement.id,
      nextValue: { status: requirement.status },
      metadata: {
        requirementType: parsed.data.requirementType,
        categoryCode: parsed.data.categoryCode,
        intake: "public",
        commercialIntent: commercialContext?.intent || null,
        suggestedAction: commercialContext?.suggestedAction || null,
        missingFields: commercialContext?.missingFields || [],
      },
    });

    // A front-office requirement becomes a visible Operations Center case.
    // Qualified requests may launch internal employee reviews; supplier outreach,
    // payments, and commercial commitments remain approval-gated external actions.
    let operationsHandoff: Awaited<
      ReturnType<typeof createIndustrialRequirementOperationsHandoff>
    > | null = null;
    let queuedAgentWork: QueuedIndustrialAgentWork[] = [];
    try {
      const handoff = await createIndustrialRequirementOperationsHandoff({
        tenantId: tenant.id,
        requirementId: requirement.id,
        referenceCode: requirement.referenceCode,
        requirementType: parsed.data.requirementType,
        categoryCode: parsed.data.categoryCode,
        title: parsed.data.title,
        details: parsed.data.details,
        quantityText: parsed.data.quantityText,
        deliveryCountryCode: parsed.data.deliveryCountryCode,
        deliveryCity: parsed.data.deliveryCity,
        urgency: parsed.data.urgency,
        requesterCompany: parsed.data.requesterCompany,
        requesterName: parsed.data.requesterName,
      });
      operationsHandoff = handoff;

      if (handoff.taskId) {
        await db
          .update(industrialRequirements)
          .set({
            metadata: {
              intake: "public_industrial_requirement",
              source: "exportunity.net",
              customerContactId: customerContact.contactId,
              requiredByText: parsed.data.requiredBy || null,
              technicalDetails: parsed.data.technicalDetails,
              attachmentUpload: {
                tokenHash: attachmentUpload.tokenHash,
                expiresAt: attachmentUploadExpiresAt.toISOString(),
                maxFiles: INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES,
              },
              operationsHandoff: {
                taskId: handoff.taskId,
                assignedAgentId: handoff.assignedAgentId,
                assignedAgentName: handoff.assignedAgentName,
                participantAgentIds: handoff.participantAgentIds,
                participants: handoff.participants,
                workstreams: handoff.workstreams,
                missingSpecialistKeys: handoff.missingSpecialistKeys,
                status: handoff.status,
                createdAt: new Date().toISOString(),
              },
            },
            assignedCommercialAgentId: handoff.assignedAgentId || null,
            updatedAt: new Date(),
          })
          .where(eq(industrialRequirements.id, requirement.id));

        await db.insert(industrialAuditLogs).values({
          tenantId: tenant.id,
          action: "industrial_requirement.operations_handoff_created",
          entityType: "industrial_requirement",
          entityId: requirement.id,
          metadata: {
            taskId: handoff.taskId,
            assignedAgentId: handoff.assignedAgentId,
            participantAgentIds: handoff.participantAgentIds,
            workstreamTaskIds: handoff.workstreams.map((item) => item.taskId),
            missingSpecialistKeys: handoff.missingSpecialistKeys,
            source: "exportunity_industrial_front_office",
          },
        });

        try {
          if (commercialContext?.suggestedAction === "ACT") {
            queuedAgentWork = await queueIndustrialOpportunityAgentWork({
              tenantId: tenant.id,
              requirementId: requirement.id,
              referenceCode: requirement.referenceCode,
              sourceConversationId:
                submittedCommercialContext?.sourceConversationId || null,
              handoff,
            });
          } else {
            await db.insert(industrialAuditLogs).values({
              tenantId: tenant.id,
              action: "industrial_requirement.agent_work_deferred",
              entityType: "industrial_requirement",
              entityId: requirement.id,
              reason: "Commercial qualification is incomplete.",
              metadata: {
                taskId: handoff.taskId,
                missingFields: commercialContext?.missingFields || [],
                externalActionStarted: false,
              },
            });
          }
        } catch (queueError) {
          const message =
            queueError instanceof Error
              ? queueError.message
              : "unknown queue error";
          console.error("industrial_requirement_agent_work_queue_failed", {
            requirementId: requirement.id,
            message,
          });
          await db.insert(industrialAuditLogs).values({
            tenantId: tenant.id,
            action: "industrial_requirement.agent_work_queue_failed",
            entityType: "industrial_requirement",
            entityId: requirement.id,
            reason: message,
            metadata: {
              taskId: handoff.taskId,
              workstreamTaskIds: handoff.workstreams.map(
                (item) => item.taskId,
              ),
              externalActionStarted: false,
            },
          });
        }
      } else if (handoff.status === "unavailable") {
        await db.insert(industrialAuditLogs).values({
          tenantId: tenant.id,
          action: "industrial_requirement.operations_handoff_unavailable",
          entityType: "industrial_requirement",
          entityId: requirement.id,
          metadata: { reason: handoff.reason || "unknown" },
        });
      }
    } catch (handoffError) {
      console.error("industrial_requirement_operations_handoff_failed", {
        requirementId: requirement.id,
        message:
          handoffError instanceof Error
            ? handoffError.message
            : "unknown error",
      });
    }

    let staffingProposals: Awaited<
      ReturnType<typeof proposeCommercialStaffing>
    > = [];
    if (commercialContext) {
      try {
        staffingProposals = await proposeCommercialStaffing({
          tenantId: tenant.id,
          companyId: operationsHandoff?.companyId || null,
          requirementId: requirement.id,
          referenceCode: requirement.referenceCode,
          proposedByAgentId: operationsHandoff?.assignedAgentId || null,
          context: {
            intent: commercialContext.intent,
            productName: commercialContext.product.name,
            productCategory: commercialContext.product.category,
            requirementType: parsed.data.requirementType,
            missingSpecialistKeys:
              operationsHandoff?.missingSpecialistKeys || [],
          },
        });
        if (staffingProposals.length) {
          await db.insert(industrialAuditLogs).values({
            tenantId: tenant.id,
            action: "industrial_requirement.workforce_signal_recorded",
            entityType: "industrial_requirement",
            entityId: requirement.id,
            metadata: {
              staffingRequestIds: staffingProposals.map((item) => item.id),
              roles: staffingProposals.map((item) => item.roleTitle),
              reviewReady: staffingProposals.filter((item) => item.reviewReady).map((item) => item.id),
              demandProgress: staffingProposals.map((item) => ({
                requestId: item.id,
                count: item.demandCount,
                threshold: item.demandThreshold,
                signalType: item.signalType,
                capacityLimit: item.capacityLimit,
                openCaseCount: item.openCaseCount,
                activeEmployeeCount: item.activeEmployeeCount,
                capacityExpansion: item.capacityExpansion,
              })),
              activeEmployeeAssignments: staffingProposals
                .filter((item) => item.assignmentTaskId)
                .map((item) => ({
                  requestId: item.id,
                  agentId: item.existingRuntimeAgentId,
                  taskId: item.assignmentTaskId,
                })),
              runtimeAgentWorkQueued: queuedAgentWork.length,
              runtimeAgentsStarted: 0,
            },
          });
        }
      } catch (staffingError) {
        console.error("industrial_requirement_staffing_proposal_failed", {
          requirementId: requirement.id,
          message:
            staffingError instanceof Error
              ? staffingError.message
              : "unknown error",
        });
      }
    }

    let commercialExecution: Awaited<
      ReturnType<typeof discoverVerifiedCommercialSuppliers>
    > | null = null;
    if (commercialContext?.suggestedAction === "ACT") {
      try {
        commercialExecution = await discoverVerifiedCommercialSuppliers({
          tenantId: tenant.id,
          requirementId: requirement.id,
          discoveryAgentId: operationsHandoff?.assignedAgentId || null,
        });
      } catch (supplierError) {
        console.error("industrial_requirement_supplier_discovery_failed", {
          requirementId: requirement.id,
          message:
            supplierError instanceof Error
              ? supplierError.message
              : "unknown error",
        });
      }
    }

    return res.status(201).json({
      ok: true,
      requirement: {
        id: requirement.id,
        referenceCode: requirement.referenceCode,
        status:
          commercialExecution?.status === "matched"
            ? "supplier_matching"
            : commercialExecution?.status === "research_required"
              ? "under_review"
              : requirement.status,
        createdAt: requirement.createdAt,
        attachmentUpload: {
          token: attachmentUpload.token,
          expiresAt: attachmentUploadExpiresAt.toISOString(),
          maxFiles: INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES,
        },
        operationsHandoff:
          operationsHandoff?.taskId && operationsHandoff.assignedAgentName
            ? {
                status: operationsHandoff.status,
                assignedAgentName: operationsHandoff.assignedAgentName,
                participants: operationsHandoff.participants,
                workstreams: operationsHandoff.workstreams,
                agentWork: queuedAgentWork,
                missingSpecialistKeys:
                  operationsHandoff.missingSpecialistKeys,
              }
            : null,
        staffingProposals: staffingProposals.map((item) => ({
          id: item.id,
          roleTitle: item.roleTitle,
          status: item.status,
          approvalRequired: item.reviewReady,
          demandCount: item.demandCount,
          demandThreshold: item.demandThreshold,
          dynamicRoleSeat: item.dynamicRoleSeat,
          signalType: item.signalType,
          capacityLimit: item.capacityLimit,
          openCaseCount: item.openCaseCount,
          activeEmployeeCount: item.activeEmployeeCount,
          capacityExpansion: item.capacityExpansion,
          existingRuntimeAgentId: item.existingRuntimeAgentId,
          assignmentTaskId: item.assignmentTaskId,
        })),
        qualification: commercialContext
          ? {
              intent: commercialContext.intent,
              suggestedAction: commercialContext.suggestedAction,
              missingFields: commercialContext.missingFields,
            }
          : null,
        commercialExecution: commercialExecution
          ? {
              status: commercialExecution.status,
              nextAction: commercialExecution.nextAction,
              candidateCount: commercialExecution.candidates.length,
              candidates: commercialExecution.candidates.map((candidate) => ({
                supplierProfileId: candidate.supplierProfileId,
                displayName: candidate.displayName,
                countryCode: candidate.countryCode,
                city: candidate.city,
                score: candidate.score,
              })),
              outreachCreated: 0,
              approvalRequiredBeforeOutreach: true,
            }
          : null,
      },
      message:
        commercialContext?.suggestedAction === "ASK"
          ? `Your requirement is saved. Complete these commercial terms before the employee team starts: ${(commercialContext.missingFields || []).join(", ") || "remaining qualification details"}.`
          : "Your industrial requirement has been received. The internal employee team can review it before any supplier contact begins.",
    });
  } catch {
    return res.status(500).json({
      ok: false,
      message: "The industrial requirement could not be saved.",
    });
  }
});

router.post(
  "/requirements/:requirementId/attachments",
  handleIndustrialRequirementAttachmentUpload,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }
    const file = req.file as Express.Multer.File | undefined;
    if (!file)
      return res.status(400).json({
        ok: false,
        message: "Attach one technical document under the file field.",
      });

    const rate = consumePublicAttachmentUpload(req, tenant.id);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        message:
          "Too many technical documents were uploaded from this connection. Please try again later.",
      });
    }

    const validation = validateIndustrialRequirementAttachment(file);
    if (!validation.ok)
      return res.status(400).json({ ok: false, message: validation.message });

    try {
      const requirement = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (!requirement)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });

      const metadata =
        requirement.metadata &&
        typeof requirement.metadata === "object" &&
        !Array.isArray(requirement.metadata)
          ? (requirement.metadata as Record<string, unknown>)
          : {};
      const uploadConfig =
        metadata.attachmentUpload &&
        typeof metadata.attachmentUpload === "object" &&
        !Array.isArray(metadata.attachmentUpload)
          ? (metadata.attachmentUpload as Record<string, unknown>)
          : null;
      const uploadToken = String(
        req.get("x-industrial-upload-token") || "",
      ).trim();
      const expiresAt = new Date(String(uploadConfig?.expiresAt || ""));
      if (
        !uploadConfig ||
        !uploadToken ||
        !matchesIndustrialRequirementAttachmentUploadToken(
          uploadConfig.tokenHash,
          uploadToken,
        )
      ) {
        return res.status(403).json({
          ok: false,
          message:
            "The secure document-upload session is not valid for this requirement.",
        });
      }
      if (
        Number.isNaN(expiresAt.valueOf()) ||
        expiresAt.valueOf() <= Date.now()
      ) {
        return res.status(410).json({
          ok: false,
          message:
            "The secure document-upload session has expired. Contact Exportunity with your requirement reference to add evidence.",
        });
      }

      const configuredMaxFiles = Number(
        uploadConfig.maxFiles || INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES,
      );
      const maxFiles = Number.isInteger(configuredMaxFiles)
        ? Math.max(
            1,
            Math.min(
              INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES,
              configuredMaxFiles,
            ),
          )
        : INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES;
      const [existingCount] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(industrialRequirementAttachments)
        .where(
          and(
            eq(industrialRequirementAttachments.tenantId, tenant.id),
            eq(industrialRequirementAttachments.requirementId, requirement.id),
          ),
        );
      if (Number(existingCount?.total || 0) >= maxFiles) {
        return res.status(409).json({
          ok: false,
          message: `This requirement already has the maximum of ${maxFiles} technical documents.`,
        });
      }

      const persisted = await persistIndustrialRequirementAttachment({
        tenantId: tenant.id,
        requirementId: requirement.id,
        file,
        attachment: validation.attachment,
      });

      try {
        const [attachment] = await db.transaction(async (tx) => {
          const [countRow] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(industrialRequirementAttachments)
            .where(
              and(
                eq(industrialRequirementAttachments.tenantId, tenant.id),
                eq(
                  industrialRequirementAttachments.requirementId,
                  requirement.id,
                ),
              ),
            );
          if (Number(countRow?.total || 0) >= maxFiles) {
            throw new Error("industrial_requirement_attachment_limit_reached");
          }
          const [created] = await tx
            .insert(industrialRequirementAttachments)
            .values({
              tenantId: tenant.id,
              requirementId: requirement.id,
              uploadedByUserId: null,
              fileName: validation.attachment.fileName,
              storageKey: persisted.storageKey,
              mimeType: validation.attachment.mimeType,
              sizeBytes: validation.attachment.sizeBytes,
              visibility: "exportunity_internal",
            })
            .returning();
          await tx.insert(industrialAuditLogs).values({
            tenantId: tenant.id,
            action: "industrial_requirement.attachment_uploaded",
            entityType: "industrial_requirement",
            entityId: requirement.id,
            metadata: {
              attachmentId: created.id,
              fileName: created.fileName,
              mimeType: created.mimeType,
              sizeBytes: created.sizeBytes,
              visibility: created.visibility,
              source: "public_requirement_upload",
            },
          });
          return [created] as const;
        });
        return res.status(201).json({
          ok: true,
          attachment: {
            id: attachment.id,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            visibility: attachment.visibility,
            createdAt: attachment.createdAt,
          },
        });
      } catch (error: any) {
        await fs.unlink(persisted.absolutePath).catch(() => undefined);
        if (
          String(error?.message || "").includes(
            "industrial_requirement_attachment_limit_reached",
          )
        ) {
          return res.status(409).json({
            ok: false,
            message: `This requirement already has the maximum of ${maxFiles} technical documents.`,
          });
        }
        throw error;
      }
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The technical document could not be stored privately.",
      });
    }
  },
);

router.post("/factories/register", async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const rate = consumePublicSubmission(req, tenant.id);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSeconds));
    return res.status(429).json({
      ok: false,
      message:
        "Too many registrations were submitted from this connection. Please try again shortly.",
    });
  }

  const parsed = factoryRegistrationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Please complete the factory registration fields.",
      issues: parsed.error.flatten(),
    });
  }

  try {
    const legalName = parsed.data.legalName;
    const normalizedName = normalizeIndustrialText(legalName);
    const invalidMachineLine = parsed.data.principalMachines.some(
      (machine) =>
        machine.productionLineIndex !== null &&
        machine.productionLineIndex !== undefined &&
        machine.productionLineIndex >= parsed.data.productionLines.length,
    );
    if (invalidMachineLine) {
      return res.status(400).json({
        ok: false,
        message:
          "A listed machine references a production line that is not part of this registration.",
      });
    }
    const invalidAssemblyMachine = parsed.data.assemblies.some(
      (assembly) =>
        assembly.machineIndex >= parsed.data.principalMachines.length,
    );
    if (invalidAssemblyMachine) {
      return res.status(400).json({
        ok: false,
        message:
          "A listed assembly references a machine that is not part of this registration.",
      });
    }
    const invalidComponentMachine = parsed.data.components.some(
      (component) =>
        component.machineIndex >= parsed.data.principalMachines.length,
    );
    if (invalidComponentMachine) {
      return res.status(400).json({
        ok: false,
        message:
          "A listed component references a machine that is not part of this registration.",
      });
    }
    const invalidComponentAssembly = parsed.data.components.some(
      (component) =>
        component.assemblyIndex !== null &&
        component.assemblyIndex !== undefined &&
        (component.assemblyIndex >= parsed.data.assemblies.length ||
          parsed.data.assemblies[component.assemblyIndex]?.machineIndex !==
            component.machineIndex),
    );
    if (invalidComponentAssembly) {
      return res.status(400).json({
        ok: false,
        message:
          "A listed component references an assembly that does not belong to its machine.",
      });
    }

    const factory = await db.transaction(async (tx) => {
      const [createdFactory] = await tx
        .insert(industrialFactories)
        .values({
          tenantId: tenant.id,
          legalName,
          displayName: parsed.data.displayName || legalName,
          normalizedName,
          registrationNumber: parsed.data.registrationNumber || null,
          factoryStatus: "submitted",
          verificationStatus: "submitted",
          publicVisibility: "exportunity_internal",
          countryCode: parsed.data.countryCode,
          region: parsed.data.region || null,
          city: parsed.data.city || null,
          industrialZone: parsed.data.industrialZone || null,
          publicAddress: parsed.data.publicAddress || null,
          primaryIndustry: parsed.data.primaryIndustry,
          industries: [parsed.data.primaryIndustry],
          publicDescription: parsed.data.publicDescription || null,
          publicWebsite: parsed.data.website || null,
          privateProfile: {
            registrationContact: {
              name: parsed.data.contactName,
              email: parsed.data.contactEmail,
              phone: parsed.data.contactPhone || null,
            },
            industrialProfile: {
              foundingYear: parsed.data.foundingYear || null,
              employeeRange: parsed.data.employeeRange || null,
              factorySize: parsed.data.factorySize || null,
              productionCapacity: parsed.data.productionCapacity || null,
              productsManufactured: parsed.data.productsManufactured,
              exportMarkets: parsed.data.exportMarkets,
              certifications: parsed.data.certifications,
            },
            procurementProfile: {
              rawMaterials: parsed.data.rawMaterials,
              industrialInputs: parsed.data.industrialInputs,
              recurringSpareParts: parsed.data.recurringSpareParts,
              procurementFrequency: parsed.data.procurementFrequency || null,
            },
          },
          submittedAt: new Date(),
        })
        .returning({
          id: industrialFactories.id,
          factoryStatus: industrialFactories.factoryStatus,
          createdAt: industrialFactories.createdAt,
        });

      const lines = parsed.data.productionLines.length
        ? await tx
            .insert(industrialProductionLines)
            .values(
              parsed.data.productionLines.map((line) => ({
                tenantId: tenant.id,
                factoryId: createdFactory.id,
                name: line.name,
                industry: line.industry || parsed.data.primaryIndustry,
                operatingStatus: line.operatingStatus,
                visibility: "factory_team_only" as const,
                publicSummary: null,
                privateMetadata: {
                  purpose: line.purpose || null,
                  intake: "factory_registration",
                },
              })),
            )
            .returning({ id: industrialProductionLines.id })
        : [];

      const machines = parsed.data.principalMachines.length
        ? await tx
            .insert(industrialMachines)
            .values(
              parsed.data.principalMachines.map((machine) => ({
                tenantId: tenant.id,
                factoryId: createdFactory.id,
                productionLineId:
                  machine.productionLineIndex === null ||
                  machine.productionLineIndex === undefined
                    ? null
                    : lines[machine.productionLineIndex]?.id || null,
                name: machine.name,
                manufacturer: machine.manufacturer || null,
                model: machine.model || null,
                machineCategory: machine.machineCategory || null,
                operatingStatus: machine.operatingStatus,
                visibility: "factory_team_only" as const,
                privateMetadata: { intake: "factory_registration" },
              })),
            )
            .returning({ id: industrialMachines.id })
        : [];

      const assemblies = parsed.data.assemblies.length
        ? await tx
            .insert(industrialMachineAssemblies)
            .values(
              parsed.data.assemblies.map((assembly) => ({
                tenantId: tenant.id,
                factoryId: createdFactory.id,
                machineId: machines[assembly.machineIndex]!.id,
                name: assembly.name,
                assemblyType: assembly.assemblyType || null,
                operatingStatus: assembly.operatingStatus,
                visibility: "factory_team_only" as const,
                publicSummary: null,
                privateMetadata: { intake: "factory_registration" },
              })),
            )
            .returning({ id: industrialMachineAssemblies.id })
        : [];

      if (parsed.data.components.length) {
        await tx.insert(industrialMachineComponents).values(
          parsed.data.components.map((component) => ({
            tenantId: tenant.id,
            factoryId: createdFactory.id,
            machineId: machines[component.machineIndex]!.id,
            assemblyId:
              component.assemblyIndex === null ||
              component.assemblyIndex === undefined
                ? null
                : assemblies[component.assemblyIndex]?.id || null,
            name: component.name,
            componentType: component.componentType || null,
            partNumber: component.partNumber || null,
            manufacturer: component.manufacturer || null,
            model: component.model || null,
            criticality: component.criticality,
            operatingStatus: component.operatingStatus,
            visibility: "factory_team_only" as const,
            privateMetadata: { intake: "factory_registration" },
          })),
        );
      }

      await tx.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        action: "industrial_factory.registration_submitted",
        entityType: "industrial_factory",
        entityId: createdFactory.id,
        nextValue: {
          factoryStatus: createdFactory.factoryStatus,
          verificationStatus: "submitted",
        },
        metadata: {
          intake: "public",
          primaryIndustry: parsed.data.primaryIndustry,
          productionLines: lines.length,
          principalMachines: machines.length,
          assemblies: assemblies.length,
          components: parsed.data.components.length,
        },
      });

      return createdFactory;
    });

    return res.status(201).json({
      ok: true,
      factory: {
        id: factory.id,
        status: factory.factoryStatus,
        createdAt: factory.createdAt,
      },
      message:
        "Your factory registration is now in review. It will not be published until Exportunity verifies the profile.",
    });
  } catch (error: any) {
    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("industrial_factories_tenant_name_unique")
    ) {
      return res.status(409).json({
        ok: false,
        message:
          "A factory with this name is already registered for this Exportunity tenant.",
      });
    }
    return res.status(500).json({
      ok: false,
      message: "The factory registration could not be saved.",
    });
  }
});

router.get(
  "/admin/factory-claims",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const statusFilter = z
      .enum(FACTORY_CLAIM_STATUSES)
      .safeParse(String(req.query?.status || "").trim());
    const query = String(req.query?.q || "").trim();
    const like = `%${query}%`;
    try {
      const rows = await db
        .select({
          claim: industrialFactoryClaims,
          factory: industrialFactories,
        })
        .from(industrialFactoryClaims)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialFactoryClaims.factoryId, industrialFactories.id),
            eq(industrialFactoryClaims.tenantId, industrialFactories.tenantId),
          ),
        )
        .where(
          and(
            eq(industrialFactoryClaims.tenantId, tenant.id),
            statusFilter.success
              ? eq(industrialFactoryClaims.status, statusFilter.data)
              : undefined,
            query
              ? or(
                  ilike(industrialFactories.displayName, like),
                  ilike(industrialFactories.legalName, like),
                  ilike(industrialFactoryClaims.contactEmail, like),
                  ilike(industrialFactoryClaims.contactPhone, like),
                )
              : undefined,
          ),
        )
        .orderBy(
          asc(industrialFactoryClaims.status),
          desc(industrialFactoryClaims.createdAt),
        )
        .limit(safeLimit(req.query?.limit, 100));
      return res.json({
        ok: true,
        claims: rows.map((row) =>
          staffFactoryClaimSummary(row.claim, row.factory),
        ),
        total: rows.length,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message:
          "The factory ownership claim queue is temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/admin/factory-claims/:claimId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const claimId = String(req.params?.claimId || "").trim();
    if (!z.string().uuid().safeParse(claimId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory ownership claim identifier.",
      });
    }
    const parsed = factoryClaimReviewSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A review decision and note are required.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const result = await db.transaction(async (tx) => {
        const claim = await tx.query.industrialFactoryClaims.findFirst({
          where: and(
            eq(industrialFactoryClaims.id, claimId),
            eq(industrialFactoryClaims.tenantId, tenant.id),
          ),
        });
        if (!claim) throw new Error("claim_not_found");
        if (!canReviewFactoryClaim(claim.status, parsed.data.action))
          throw new Error("claim_not_reviewable");

        const factory = await tx.query.industrialFactories.findFirst({
          where: and(
            eq(industrialFactories.id, claim.factoryId),
            eq(industrialFactories.tenantId, tenant.id),
          ),
        });
        if (!factory) throw new Error("factory_not_found");

        const now = new Date();
        const reviewerUserId = actorIdFor(req, "adminUser");
        const nextStatus = nextFactoryClaimStatus(parsed.data.action);

        if (parsed.data.action === "approve") {
          if (
            factory.ownerUserId &&
            factory.ownerUserId !== claim.claimantUserId
          )
            throw new Error("factory_owner_exists");
          if (!factory.ownerUserId) {
            const [ownership] = await tx
              .update(industrialFactories)
              .set({
                ownerUserId: claim.claimantUserId,
                privateProfile: {
                  ...safeRecord(factory.privateProfile),
                  ownership: {
                    claimedAt: now.toISOString(),
                    claimId: claim.id,
                    reviewedByUserId: reviewerUserId,
                  },
                },
                updatedAt: now,
              })
              .where(
                and(
                  eq(industrialFactories.id, factory.id),
                  eq(industrialFactories.tenantId, tenant.id),
                  isNull(industrialFactories.ownerUserId),
                ),
              )
              .returning({
                id: industrialFactories.id,
                ownerUserId: industrialFactories.ownerUserId,
              });
            if (!ownership) throw new Error("factory_owner_changed");
          }
        }

        const [updatedClaim] = await tx
          .update(industrialFactoryClaims)
          .set({
            status: nextStatus,
            reviewNotes: parsed.data.reason,
            reviewedByUserId: reviewerUserId,
            reviewedAt: now,
            updatedAt: now,
          })
          .where(eq(industrialFactoryClaims.id, claim.id))
          .returning();

        await tx.insert(industrialAuditLogs).values({
          tenantId: tenant.id,
          actorUserId: reviewerUserId,
          action: "industrial_factory_claim.reviewed",
          entityType: "industrial_factory_claim",
          entityId: claim.id,
          reason: parsed.data.reason,
          previousValue: { status: claim.status },
          nextValue: {
            status: updatedClaim.status,
            action: parsed.data.action,
          },
          metadata: {
            factoryId: claim.factoryId,
            claimantUserId: claim.claimantUserId,
          },
        });

        if (parsed.data.action === "approve" && !factory.ownerUserId) {
          await tx.insert(industrialAuditLogs).values({
            tenantId: tenant.id,
            actorUserId: reviewerUserId,
            action: "industrial_factory.owner_assigned",
            entityType: "industrial_factory",
            entityId: factory.id,
            reason: parsed.data.reason,
            previousValue: { ownerUserId: null },
            nextValue: { ownerUserId: claim.claimantUserId },
            metadata: { claimId: claim.id },
          });
        }

        return { claim: updatedClaim, factory };
      });

      return res.json({
        ok: true,
        claim: staffFactoryClaimSummary(result.claim, result.factory),
        message:
          parsed.data.action === "approve"
            ? "Factory ownership was approved and recorded."
            : parsed.data.action === "request_information"
              ? "The ownership claim now requires additional information."
              : "The factory ownership claim was rejected.",
      });
    } catch (error: any) {
      const code = String(error?.message || "");
      if (code === "claim_not_found")
        return res
          .status(404)
          .json({ ok: false, message: "Factory ownership claim not found." });
      if (code === "factory_not_found")
        return res.status(404).json({
          ok: false,
          message: "Factory linked to this claim was not found.",
        });
      if (code === "claim_not_reviewable")
        return res.status(409).json({
          ok: false,
          message: "This factory ownership claim has already been closed.",
        });
      if (code === "factory_owner_exists" || code === "factory_owner_changed") {
        return res.status(409).json({
          ok: false,
          message:
            "The factory already has an approved owner. Ownership was not changed.",
        });
      }
      return res.status(500).json({
        ok: false,
        message: "The factory ownership review could not be saved.",
      });
    }
  },
);

router.get(
  "/admin/factory-leads/status",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    try {
      const google = await googlePlacesRuntimeStatus(
        resolveGoogleSettingsScope(req),
      );
      return res.json({
        ok: true,
        google: {
          configured: Boolean(google.enabled),
          source: google.source,
          placesApiKeyPresent: Boolean(google.apiKeyPresent),
          browserMapKeyPresent: Boolean(google.browserMapKeyPresent),
          mapIdPresent: Boolean(google.mapIdPresent),
          defaultCountry: google.defaultCountry,
          defaultCity: google.defaultCity,
          defaultLanguage: google.defaultLanguage,
          dailyImportLimit: google.dailyImportLimit,
          rateLimitPerMinute: google.rateLimitPerMinute,
          limits: google.limits,
        },
        message: google.enabled
          ? "Google Places factory discovery is ready for staff preview and review."
          : "Google Places must be configured before Exportunity can discover public factory leads.",
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "Factory discovery configuration is temporarily unavailable.",
      });
    }
  },
);

router.get("/admin/factory-leads", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const status = z
    .enum(INDUSTRIAL_FACTORY_LEAD_STATUSES)
    .safeParse(String(req.query?.status || "").trim());
  try {
    const leads = await listIndustrialFactoryLeads(tenant.id, {
      query: String(req.query?.q || "").trim(),
      city: String(req.query?.city || "").trim(),
      countryCode: String(req.query?.countryCode || "").trim(),
      industry: String(req.query?.industry || "").trim(),
      leadStatus: status.success ? status.data : null,
      limit: safeLimit(req.query?.limit, 100),
    });
    return res.json({ ok: true, leads, total: leads.length });
  } catch {
    return res.status(503).json({
      ok: false,
      message:
        "The private factory discovery queue is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/factory-leads/benin-official-preview",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    return res.json({
      ok: true,
      checkedAt: BENIN_INDUSTRIAL_PROSPECTS[0]?.checkedAt || null,
      summary: beninIndustrialProspectSummary(),
      prospects: BENIN_INDUSTRIAL_PROSPECTS,
      message:
        "Staff planning universe only. Records come from cited official or industry sources, remain private, and cannot be contacted or published without review.",
    });
  },
);

router.post(
  "/admin/factory-leads/benin-official-import",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const parsed = beninIndustrialProspectImportSchema.safeParse(
      req.body || {},
    );
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Select at least one importable industrial prospect.",
        issues: parsed.error.flatten(),
      });
    }

    const selected = findBeninIndustrialProspects(
      parsed.data.selectedProspectIds,
    );
    const candidates = mapBeninIndustrialProspectsToFactoryLeads(selected);
    if (!candidates.length) {
      return res.status(400).json({
        ok: false,
        message:
          "The selection contains no factory, industrial buyer, manufacturer, inventory partner or technical supplier that can enter the factory review queue.",
      });
    }

    const requested = new Set(parsed.data.selectedProspectIds);
    const recognized = new Set(selected.map((item) => item.id));
    const unknownIds = Array.from(requested).filter(
      (id) => !recognized.has(id),
    );

    try {
      const imported = await importIndustrialFactoryLeads({
        tenantId: tenant.id,
        actorUserId:
          actorIdFor(req, "adminUser") || actorIdFor(req, "staffUser"),
        candidates,
        query: "Benin officially sourced industrial prospect universe",
        countryCode: "BJ",
      });

      return res.status(201).json({
        ok: true,
        ...imported,
        skippedNonFactoryActors: selected.length - candidates.length,
        unknownIds,
        message:
          "Selected prospects were stored in the private review queue. No outreach, public profile, inventory claim or commercial engagement was created.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message:
          "The selected industrial prospects could not be added to the private review queue.",
      });
    }
  },
);

router.post(
  "/admin/factory-leads/google-preview",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const parsed = industrialFactoryLeadSearchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message:
          "Provide an industrial factory search query of at least three characters.",
        issues: parsed.error.flatten(),
      });
    }

    const scope = resolveGoogleSettingsScope(req);
    try {
      const google = await googlePlacesRuntimeStatus(scope);
      if (!google.enabled) {
        return res.status(424).json({
          ok: false,
          message:
            "Google Places is not configured for industrial factory discovery. Configure the server Places key and enable the integration before importing public listings.",
        });
      }

      const city = parsed.data.city || google.defaultCity;
      const countryCode = (
        parsed.data.countryCode || google.defaultCountry
      ).toUpperCase();
      const places = await googleTextSearch({
        query: parsed.data.query,
        city,
        country: countryCode,
        limit: parsed.data.limit,
        scope,
      });
      const candidates = mapGooglePlacesToIndustrialFactoryLeads(places, {
        query: parsed.data.query,
        city,
        countryCode,
      }).filter((candidate) => Boolean(candidate.googlePlaceId));

      return res.json({
        ok: true,
        provider: "google_places",
        query: parsed.data.query,
        city,
        countryCode,
        candidates,
        total: candidates.length,
        message:
          "Preview only. Imported leads stay private until Exportunity independently verifies a factory and approves publication.",
      });
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      return res
        .status(statusCode === 429 ? 429 : statusCode === 424 ? 424 : 502)
        .json({
          ok: false,
          message:
            statusCode === 429
              ? "Google Places discovery is temporarily rate limited. Wait before running another preview."
              : statusCode === 424
                ? "Google Places is not enabled for industrial factory discovery."
                : "Google Places could not complete the factory discovery preview.",
        });
    }
  },
);

router.post(
  "/admin/factory-leads/google-import",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const parsed = industrialFactoryLeadImportSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message:
          "Select at least one factory lead from a valid Google Places preview.",
        issues: parsed.error.flatten(),
      });
    }

    const scope = resolveGoogleSettingsScope(req);
    try {
      const google = await googlePlacesRuntimeStatus(scope);
      if (!google.enabled) {
        return res.status(424).json({
          ok: false,
          message:
            "Google Places is not configured for industrial factory discovery.",
        });
      }

      const city = parsed.data.city || google.defaultCity;
      const countryCode = (
        parsed.data.countryCode || google.defaultCountry
      ).toUpperCase();
      const places = await googleTextSearch({
        query: parsed.data.query,
        city,
        country: countryCode,
        limit: Math.max(
          parsed.data.limit,
          parsed.data.selectedGooglePlaceIds.length,
        ),
        scope,
      });
      const selected = new Set(parsed.data.selectedGooglePlaceIds);
      const candidates = mapGooglePlacesToIndustrialFactoryLeads(places, {
        query: parsed.data.query,
        city,
        countryCode,
      }).filter(
        (candidate) =>
          Boolean(candidate.googlePlaceId) &&
          selected.has(String(candidate.googlePlaceId)),
      );

      if (!candidates.length) {
        return res.status(400).json({
          ok: false,
          message:
            "The selected Google listings were not returned by the current preview. Run a fresh preview before importing.",
        });
      }

      const actorUserId =
        actorIdFor(req, "adminUser") || actorIdFor(req, "staffUser");
      const imported = await importIndustrialFactoryLeads({
        tenantId: tenant.id,
        actorUserId,
        candidates,
        query: parsed.data.query,
        city,
        countryCode,
      });
      return res.status(201).json({
        ok: true,
        ...imported,
        message:
          "Factory leads were stored in the private review queue. No public factory profile, outreach, or supplier engagement was created.",
      });
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      return res
        .status(statusCode === 429 ? 429 : statusCode === 424 ? 424 : 500)
        .json({
          ok: false,
          message:
            statusCode === 429
              ? "Google Places discovery is temporarily rate limited. No factory leads were imported."
              : statusCode === 424
                ? "Google Places is not enabled for industrial factory discovery."
                : "The selected factory leads could not be imported.",
        });
    }
  },
);

router.patch(
  "/admin/factory-leads/:leadId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const leadId = String(req.params?.leadId || "").trim();
    if (!z.string().uuid().safeParse(leadId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory lead identifier.",
      });
    }
    const parsed = industrialFactoryLeadReviewSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Choose a valid private review status for this factory lead.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const lead = await reviewIndustrialFactoryLead({
        tenantId: tenant.id,
        leadId,
        actorUserId:
          actorIdFor(req, "adminUser") || actorIdFor(req, "staffUser"),
        review: parsed.data,
      });
      if (!lead) {
        return res.status(404).json({
          ok: false,
          message: "Factory lead not found.",
        });
      }
      return res.json({
        ok: true,
        lead,
        message:
          "Lead reviewed. It remains private until a separate factory verification and publication decision.",
      });
    } catch (error: any) {
      const errorCode = String(error?.message || "");
      if (errorCode === "lead_converted") {
        return res.status(409).json({
          ok: false,
          message:
            "This lead has already been converted. Use the factory record for further verification work.",
        });
      }
      if (errorCode === "lead_not_qualified_for_contact_plan") {
        return res.status(409).json({
          ok: false,
          message:
            "Qualify the industrial lead before preparing it for contact approval.",
        });
      }
      if (errorCode.startsWith("contact_plan_incomplete:")) {
        const missing = errorCode
          .slice("contact_plan_incomplete:".length)
          .split("|")
          .filter(Boolean);
        return res.status(400).json({
          ok: false,
          message: `The contact dossier is incomplete: ${missing.join(", ")}.`,
          missing,
        });
      }
      return res.status(500).json({
        ok: false,
        message: "The factory lead review could not be saved.",
      });
    }
  },
);

router.post(
  "/admin/requirements/:requirementId/workstreams/:taskId/run",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const requirementId = String(req.params?.requirementId || "").trim();
    const taskId = Number(req.params?.taskId || 0);
    if (
      !z.string().uuid().safeParse(requirementId).success ||
      !Number.isInteger(taskId) ||
      taskId <= 0
    ) {
      return res.status(400).json({
        ok: false,
        message: "A valid opportunity workstream is required.",
      });
    }

    try {
      const requirement = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (!requirement) {
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      }
      const execution = (
        await loadIndustrialOpportunityExecutions({
          tenantId: tenant.id,
          requirements: [{ id: requirement.id, metadata: requirement.metadata }],
          includeTimeline: true,
        })
      ).get(requirement.id);
      const workstream = execution?.workstreams.find(
        (item) => item.id === taskId,
      );
      if (!workstream) {
        return res.status(404).json({
          ok: false,
          message: "This task is not linked to the selected opportunity.",
        });
      }
      if (!workstream.agentId) {
        return res.status(409).json({
          ok: false,
          message: "Assign an active employee before running this workstream.",
        });
      }

      const action = await queueIndustrialOpportunityWorkstream({
        tenantId: tenant.id,
        requirementId: requirement.id,
        taskId,
        requestedByUserId: actorIdFor(req),
        sourceConversationId:
          String(req.body?.sourceConversationId || "").trim() || null,
      });
      return res.status(action.reused ? 200 : 202).json({
        ok: true,
        action,
        message: action.reused
          ? "The assigned employee is already queued for this workstream."
          : `${action.agentName} is now executing this workstream through Agent OS.`,
        externalActionStarted: false,
      });
    } catch (error: any) {
      const message =
        String(error?.message || "").trim() ||
        "The employee workstream could not be queued.";
      return res
        .status(/already running|only queued or blocked/i.test(message) ? 409 : 500)
        .json({ ok: false, message });
    }
  },
);

router.post(
  "/admin/factory-leads/:leadId/convert",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const leadId = String(req.params?.leadId || "").trim();
    if (!z.string().uuid().safeParse(leadId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid factory lead identifier.",
      });
    }
    const parsed = industrialFactoryLeadConversionSchema.safeParse(
      req.body || {},
    );
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message:
          "Provide the industry and country before creating an internal factory verification dossier.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const converted = await convertIndustrialFactoryLead({
        tenantId: tenant.id,
        leadId,
        actorUserId:
          actorIdFor(req, "adminUser") || actorIdFor(req, "staffUser"),
        conversion: parsed.data,
      });
      return res.status(201).json({
        ok: true,
        ...converted,
        message:
          "An internal factory verification dossier was created. It is not public and remains under Exportunity review.",
      });
    } catch (error: any) {
      const code = String(error?.message || "");
      if (code === "lead_not_found") {
        return res.status(404).json({
          ok: false,
          message: "Factory lead not found.",
        });
      }
      if (code === "lead_converted") {
        return res.status(409).json({
          ok: false,
          message:
            "This lead already has an internal factory dossier. Continue verification from the factory record.",
        });
      }
      if (code === "lead_not_qualified") {
        return res.status(409).json({
          ok: false,
          message:
            "Only a qualified or contact-ready lead can become an internal factory verification dossier.",
        });
      }
      if (code === "factory_already_exists") {
        return res.status(409).json({
          ok: false,
          message:
            "A factory dossier with this normalized name already exists. Review that existing dossier instead of creating a duplicate.",
        });
      }
      if (code === "factory_profile_missing_data") {
        return res.status(400).json({
          ok: false,
          message:
            "The factory dossier needs a legal name, display name, industry, and country.",
        });
      }
      return res.status(500).json({
        ok: false,
        message:
          "The internal factory verification dossier could not be created.",
      });
    }
  },
);

router.get("/admin/suppliers", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const query = String(req.query?.q || "").trim();
  const statusFilter = z
    .enum(SUPPLIER_STATUSES)
    .safeParse(String(req.query?.status || "").trim());
  const verificationFilter = z
    .enum([
      "unverified",
      "submitted",
      "under_review",
      "verified",
      "rejected",
      "suspended",
    ])
    .safeParse(String(req.query?.verification || "").trim());
  const countryCode = String(req.query?.countryCode || "")
    .trim()
    .toUpperCase();
  const city = String(req.query?.city || "").trim();
  const category = String(req.query?.category || "").trim();
  const capability = String(req.query?.capability || "").trim();
  const like = `%${query}%`;

  try {
    const rows = await db
      .select({
        supplier: industrialSupplierProfiles,
        linkedFactory: industrialFactories,
      })
      .from(industrialSupplierProfiles)
      .leftJoin(
        industrialFactories,
        and(
          eq(
            industrialSupplierProfiles.linkedFactoryId,
            industrialFactories.id,
          ),
          eq(industrialSupplierProfiles.tenantId, industrialFactories.tenantId),
        ),
      )
      .where(
        and(
          eq(industrialSupplierProfiles.tenantId, tenant.id),
          statusFilter.success
            ? eq(industrialSupplierProfiles.supplierStatus, statusFilter.data)
            : undefined,
          verificationFilter.success
            ? eq(
                industrialSupplierProfiles.verificationStatus,
                verificationFilter.data,
              )
            : undefined,
          countryCode
            ? eq(industrialSupplierProfiles.countryCode, countryCode)
            : undefined,
          city
            ? ilike(industrialSupplierProfiles.city, `%${city}%`)
            : undefined,
          query
            ? or(
                ilike(industrialSupplierProfiles.legalName, like),
                ilike(industrialSupplierProfiles.displayName, like),
                ilike(industrialSupplierProfiles.city, like),
                ilike(industrialSupplierProfiles.industrialZone, like),
              )
            : undefined,
        ),
      )
      .orderBy(
        asc(industrialSupplierProfiles.supplierStatus),
        desc(industrialSupplierProfiles.updatedAt),
      )
      .limit(safeLimit(req.query?.limit, 100));

    const normalizedCategory = category.toLocaleLowerCase("fr");
    const normalizedCapability = capability.toLocaleLowerCase("fr");
    const filtered = rows.filter(({ supplier }) => {
      const categoryMatch = !normalizedCategory
        ? true
        : supplierStringList(supplier.categoryCodes).some((value) =>
            value.toLocaleLowerCase("fr").includes(normalizedCategory),
          );
      const capabilityMatch = !normalizedCapability
        ? true
        : supplierStringList(supplier.capabilities).some((value) =>
            value.toLocaleLowerCase("fr").includes(normalizedCapability),
          );
      return categoryMatch && capabilityMatch;
    });

    return res.json({
      ok: true,
      suppliers: filtered.map(({ supplier, linkedFactory }) =>
        staffSupplierSummary(supplier, linkedFactory),
      ),
      total: filtered.length,
      internalOnly: true,
      contactOrOutreachAllowed: false,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The internal supplier registry is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/suppliers/:supplierId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const supplierId = String(req.params?.supplierId || "").trim();
    if (!z.string().uuid().safeParse(supplierId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid supplier identifier." });
    }

    try {
      const [row] = await db
        .select({
          supplier: industrialSupplierProfiles,
          linkedFactory: industrialFactories,
        })
        .from(industrialSupplierProfiles)
        .leftJoin(
          industrialFactories,
          and(
            eq(
              industrialSupplierProfiles.linkedFactoryId,
              industrialFactories.id,
            ),
            eq(
              industrialSupplierProfiles.tenantId,
              industrialFactories.tenantId,
            ),
          ),
        )
        .where(
          and(
            eq(industrialSupplierProfiles.id, supplierId),
            eq(industrialSupplierProfiles.tenantId, tenant.id),
          ),
        )
        .limit(1);
      if (!row)
        return res.status(404).json({
          ok: false,
          message: "Supplier profile not found.",
        });

      const audit = await db
        .select()
        .from(industrialAuditLogs)
        .where(
          and(
            eq(industrialAuditLogs.tenantId, tenant.id),
            eq(industrialAuditLogs.entityType, "industrial_supplier_profile"),
            eq(industrialAuditLogs.entityId, row.supplier.id),
          ),
        )
        .orderBy(desc(industrialAuditLogs.createdAt))
        .limit(40);

      return res.json({
        ok: true,
        supplier: staffSupplierSummary(row.supplier, row.linkedFactory),
        audit,
        internalOnly: true,
        contactOrOutreachAllowed: false,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The supplier profile is temporarily unavailable.",
      });
    }
  },
);

router.post("/admin/suppliers", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const parsed = industrialSupplierProfileSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message:
        "Complete the supplier identity, location, and capability details.",
      issues: parsed.error.flatten(),
    });
  }

  try {
    const linkedFactory = parsed.data.linkedFactoryId
      ? await db.query.industrialFactories.findFirst({
          where: and(
            eq(industrialFactories.id, parsed.data.linkedFactoryId),
            eq(industrialFactories.tenantId, tenant.id),
          ),
        })
      : null;
    if (parsed.data.linkedFactoryId && !linkedFactory) {
      return res.status(400).json({
        ok: false,
        message: "The linked factory is not available in this tenant.",
      });
    }

    const normalized = normalizeIndustrialSupplierProfileInput(parsed.data);
    const actorUserId = actorIdFor(req, "adminUser");
    const [supplier] = await db
      .insert(industrialSupplierProfiles)
      .values({
        tenantId: tenant.id,
        linkedFactoryId: parsed.data.linkedFactoryId || null,
        legalName: parsed.data.legalName,
        displayName: parsed.data.displayName || parsed.data.legalName,
        normalizedName: normalizeIndustrialText(parsed.data.legalName),
        supplierStatus: "draft",
        verificationStatus: "unverified",
        visibility: "exportunity_internal",
        countryCode: normalized.countryCode,
        region: optionalText(parsed.data.region),
        city: optionalText(parsed.data.city),
        industrialZone: optionalText(parsed.data.industrialZone),
        address: optionalText(parsed.data.address),
        website: optionalText(parsed.data.website),
        email: optionalText(parsed.data.email),
        phone: optionalText(parsed.data.phone),
        industriesServed: normalized.industriesServed,
        categoryCodes: normalized.categoryCodes,
        capabilities: normalized.capabilities,
        equipmentAvailable: normalized.equipmentAvailable,
        materialsHandled: normalized.materialsHandled,
        maximumDimensions: optionalText(parsed.data.maximumDimensions),
        tolerances: optionalText(parsed.data.tolerances),
        productionCapacityText: optionalText(
          parsed.data.productionCapacityText,
        ),
        certifications: normalized.certifications,
        qualityControlCapability: optionalText(
          parsed.data.qualityControlCapability,
        ),
        leadTimeText: optionalText(parsed.data.leadTimeText),
        previousPerformanceNotes: optionalText(
          parsed.data.previousPerformanceNotes,
        ),
        onTimeDeliveryRate:
          parsed.data.onTimeDeliveryRate === undefined ||
          parsed.data.onTimeDeliveryRate === null
            ? null
            : String(parsed.data.onTimeDeliveryRate),
        technicalDocumentReferences: normalized.technicalDocumentReferences,
        mediaReferences: normalized.mediaReferences,
        ndaStatus: parsed.data.ndaStatus,
        adminNotes: optionalText(parsed.data.adminNotes),
      })
      .returning();

    await db.insert(industrialAuditLogs).values({
      tenantId: tenant.id,
      actorUserId,
      action: "industrial_supplier_profile.created",
      entityType: "industrial_supplier_profile",
      entityId: supplier.id,
      nextValue: {
        supplierStatus: supplier.supplierStatus,
        verificationStatus: supplier.verificationStatus,
        visibility: supplier.visibility,
        linkedFactoryId: supplier.linkedFactoryId,
      },
      metadata: {
        categoryCodes: supplierStringList(supplier.categoryCodes),
        capabilities: supplierStringList(supplier.capabilities),
        internalOnly: true,
      },
    });

    return res.status(201).json({
      ok: true,
      supplier: staffSupplierSummary(supplier, linkedFactory),
      message:
        "The supplier capability profile was saved as an internal draft for review.",
    });
  } catch (error: any) {
    if (
      String(error?.message || "").includes(
        "industrial_supplier_profiles_tenant_name_unique",
      )
    ) {
      return res.status(409).json({
        ok: false,
        message:
          "An internal supplier profile with this legal name already exists.",
      });
    }
    return res.status(500).json({
      ok: false,
      message: "The supplier capability profile could not be saved.",
    });
  }
});

router.post(
  "/admin/suppliers/:supplierId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const supplierId = String(req.params?.supplierId || "").trim();
    if (!z.string().uuid().safeParse(supplierId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid supplier identifier." });
    }
    const parsed = industrialSupplierReviewSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid supplier review action and reason are required.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const existing = await db.query.industrialSupplierProfiles.findFirst({
        where: and(
          eq(industrialSupplierProfiles.id, supplierId),
          eq(industrialSupplierProfiles.tenantId, tenant.id),
        ),
      });
      if (!existing) {
        return res
          .status(404)
          .json({ ok: false, message: "Supplier profile not found." });
      }

      const now = new Date();
      const state = nextIndustrialSupplierReviewState(parsed.data.action);
      const [supplier] = await db
        .update(industrialSupplierProfiles)
        .set({
          ...state,
          visibility: "exportunity_internal",
          verifiedAt:
            parsed.data.action === "approve" ? now : existing.verifiedAt,
          archivedAt:
            parsed.data.action === "archive" ? now : existing.archivedAt,
          adminNotes:
            parsed.data.adminNotes === undefined
              ? existing.adminNotes
              : optionalText(parsed.data.adminNotes),
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialSupplierProfiles.id, supplierId),
            eq(industrialSupplierProfiles.tenantId, tenant.id),
          ),
        )
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: actorIdFor(req, "adminUser"),
        action: `industrial_supplier_profile.${parsed.data.action}`,
        entityType: "industrial_supplier_profile",
        entityId: supplier.id,
        reason: parsed.data.reason,
        previousValue: {
          supplierStatus: existing.supplierStatus,
          verificationStatus: existing.verificationStatus,
          visibility: existing.visibility,
        },
        nextValue: {
          supplierStatus: supplier.supplierStatus,
          verificationStatus: supplier.verificationStatus,
          visibility: supplier.visibility,
        },
      });

      return res.json({
        ok: true,
        supplier: staffSupplierSummary(supplier),
        message:
          parsed.data.action === "approve"
            ? "The supplier is active for internal capability matching only. No outreach or quote has been created."
            : "The supplier review decision was recorded in the industrial audit trail.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The supplier review decision could not be recorded.",
      });
    }
  },
);

router.get("/admin/catalog", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const query = String(req.query?.q || "").trim();
  const statusFilter = z
    .enum(CATALOG_STATUSES)
    .safeParse(String(req.query?.status || "").trim());
  const classification = String(req.query?.classification || "").trim();
  const like = `%${query}%`;

  try {
    const rows = await db
      .select({ item: industrialCatalogItems, factory: industrialFactories })
      .from(industrialCatalogItems)
      .innerJoin(
        industrialFactories,
        and(
          eq(industrialCatalogItems.factoryId, industrialFactories.id),
          eq(industrialCatalogItems.tenantId, industrialFactories.tenantId),
        ),
      )
      .where(
        and(
          eq(industrialCatalogItems.tenantId, tenant.id),
          statusFilter.success
            ? eq(industrialCatalogItems.approvalStatus, statusFilter.data)
            : undefined,
          classification
            ? eq(industrialCatalogItems.classification, classification as any)
            : undefined,
          query
            ? or(
                ilike(industrialCatalogItems.name, like),
                ilike(industrialCatalogItems.productCode, like),
                ilike(industrialCatalogItems.partNumber, like),
                ilike(industrialFactories.displayName, like),
              )
            : undefined,
        ),
      )
      .orderBy(
        desc(industrialCatalogItems.updatedAt),
        industrialCatalogItems.name,
      )
      .limit(safeLimit(req.query?.limit, 100));

    return res.json({
      ok: true,
      items: rows.map((row) => staffCatalogSummary(row.item, row.factory)),
      total: rows.length,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The industrial catalog queue is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/catalog/:catalogItemId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const catalogItemId = String(req.params?.catalogItemId || "").trim();
    if (!z.string().uuid().safeParse(catalogItemId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid industrial catalog identifier." });
    }

    try {
      const item = await db.query.industrialCatalogItems.findFirst({
        where: and(
          eq(industrialCatalogItems.id, catalogItemId),
          eq(industrialCatalogItems.tenantId, tenant.id),
        ),
      });
      if (!item)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial catalog item not found." });

      const [factory, audit] = await Promise.all([
        db.query.industrialFactories.findFirst({
          where: and(
            eq(industrialFactories.id, item.factoryId),
            eq(industrialFactories.tenantId, tenant.id),
          ),
        }),
        db
          .select()
          .from(industrialAuditLogs)
          .where(
            and(
              eq(industrialAuditLogs.tenantId, tenant.id),
              eq(industrialAuditLogs.entityType, "industrial_catalog_item"),
              eq(industrialAuditLogs.entityId, item.id),
            ),
          )
          .orderBy(desc(industrialAuditLogs.createdAt))
          .limit(30),
      ]);

      return res.json({
        ok: true,
        item: {
          ...staffCatalogSummary(item, factory),
          publicDescription: item.publicDescription,
          supplyModes: item.supplyModes,
          countryOfOrigin: item.countryOfOrigin,
          technicalSpecifications: item.technicalSpecifications,
          application: item.application,
          compatibleMachinery: item.compatibleMachinery,
          material: item.material,
          unitOfMeasure: item.unitOfMeasure,
          availableQuantityText: item.availableQuantityText,
          productionCapacityText: item.productionCapacityText,
          supplyFrequency: item.supplyFrequency,
          currencyCode: item.currencyCode,
          priceText: item.priceText,
          certifications: item.certifications,
          publicMedia: item.publicMedia,
          privateMetadata: item.privateMetadata,
        },
        factory: factory ? staffFactorySummary(factory) : null,
        audit,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The industrial catalog item is temporarily unavailable.",
      });
    }
  },
);

router.post("/admin/catalog", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const parsed = industrialCatalogItemSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Please complete the industrial catalog fields.",
      issues: parsed.error.flatten(),
    });
  }
  const category = INDUSTRIAL_TAXONOMY.find(
    (entry) => entry.code === parsed.data.categoryCode,
  );
  if (!category || category.classification !== parsed.data.classification) {
    return res.status(400).json({
      ok: false,
      message:
        "The industrial category must match the selected classification.",
    });
  }

  try {
    const factory = await db.query.industrialFactories.findFirst({
      where: and(
        eq(industrialFactories.id, parsed.data.factoryId),
        eq(industrialFactories.tenantId, tenant.id),
      ),
    });
    if (!factory || ["archived", "suspended"].includes(factory.factoryStatus)) {
      return res.status(400).json({
        ok: false,
        message:
          "Choose an active factory profile before adding a catalog item.",
      });
    }

    const normalizedName = normalizeIndustrialText(parsed.data.name);
    const duplicate = await db.query.industrialCatalogItems.findFirst({
      where: and(
        eq(industrialCatalogItems.tenantId, tenant.id),
        eq(industrialCatalogItems.factoryId, factory.id),
        eq(industrialCatalogItems.normalizedName, normalizedName),
      ),
    });
    if (duplicate && duplicate.approvalStatus !== "archived") {
      return res.status(409).json({
        ok: false,
        message:
          "A catalog item with this factory and name already exists. Review the existing record instead.",
      });
    }

    const actorUserId = actorIdFor(req);
    const [item] = await db
      .insert(industrialCatalogItems)
      .values({
        tenantId: tenant.id,
        factoryId: factory.id,
        classification: parsed.data.classification,
        categoryCode: parsed.data.categoryCode,
        name: parsed.data.name,
        normalizedName,
        publicDescription: parsed.data.publicDescription || null,
        productCode: parsed.data.productCode || null,
        supplyModes: parsed.data.supplyModes,
        priceMode: parsed.data.priceMode,
        availabilityStatus: parsed.data.availabilityStatus,
        manufacturer: parsed.data.manufacturer || null,
        brand: parsed.data.brand || null,
        model: parsed.data.model || null,
        partNumber: parsed.data.partNumber || null,
        countryOfOrigin: parsed.data.countryOfOrigin || null,
        technicalSpecifications: parsed.data.technicalSpecifications,
        application: parsed.data.application || null,
        compatibleMachinery: parsed.data.compatibleMachinery,
        material: parsed.data.material || null,
        unitOfMeasure: parsed.data.unitOfMeasure || null,
        minimumOrderQuantity: parsed.data.minimumOrderQuantity || null,
        availableQuantityText: parsed.data.availableQuantityText || null,
        productionCapacityText: parsed.data.productionCapacityText || null,
        leadTimeText: parsed.data.leadTimeText || null,
        supplyFrequency: parsed.data.supplyFrequency || null,
        currencyCode: parsed.data.currencyCode || null,
        priceText: parsed.data.priceText || null,
        certifications: parsed.data.certifications,
        visibility: "exportunity_internal",
        approvalStatus: "under_review",
        publicMedia: parsed.data.publicMedia,
        privateMetadata: parsed.data.privateMetadata,
      })
      .returning();

    await db.insert(industrialAuditLogs).values({
      tenantId: tenant.id,
      actorUserId,
      action: "industrial_catalog_item.submitted_for_review",
      entityType: "industrial_catalog_item",
      entityId: item.id,
      nextValue: {
        approvalStatus: item.approvalStatus,
        visibility: item.visibility,
      },
      metadata: {
        factoryId: factory.id,
        classification: item.classification,
        categoryCode: item.categoryCode,
      },
    });

    return res
      .status(201)
      .json({ ok: true, item: staffCatalogSummary(item, factory) });
  } catch {
    return res.status(500).json({
      ok: false,
      message: "The industrial catalog item could not be saved.",
    });
  }
});

router.post(
  "/admin/catalog/:catalogItemId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const catalogItemId = String(req.params?.catalogItemId || "").trim();
    if (!z.string().uuid().safeParse(catalogItemId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid industrial catalog identifier." });
    }
    const parsed = catalogReviewSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid catalog review action and reason are required.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const item = await db.query.industrialCatalogItems.findFirst({
        where: and(
          eq(industrialCatalogItems.id, catalogItemId),
          eq(industrialCatalogItems.tenantId, tenant.id),
        ),
      });
      if (!item)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial catalog item not found." });
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, item.factoryId),
          eq(industrialFactories.tenantId, tenant.id),
        ),
      });
      if (!factory)
        return res.status(400).json({
          ok: false,
          message: "The factory linked to this catalog item is unavailable.",
        });

      const requestedVisibility =
        parsed.data.publicVisibility || item.visibility;
      if (
        parsed.data.action === "approve" &&
        requestedVisibility === "public"
      ) {
        const factoryIsPublic =
          factory.factoryStatus === "active" &&
          factory.verificationStatus === "verified" &&
          factory.publicVisibility === "public";
        if (!factoryIsPublic) {
          return res.status(400).json({
            ok: false,
            message:
              "A public catalog item requires an active, verified, publicly visible factory.",
          });
        }
      }

      const now = new Date();
      const updates =
        parsed.data.action === "approve"
          ? {
              approvalStatus: "approved" as const,
              visibility: requestedVisibility as any,
              updatedAt: now,
            }
          : parsed.data.action === "archive"
            ? {
                approvalStatus: "archived" as const,
                visibility: "exportunity_internal" as const,
                updatedAt: now,
              }
            : {
                approvalStatus: "under_review" as const,
                visibility: "exportunity_internal" as const,
                updatedAt: now,
              };
      const [updated] = await db
        .update(industrialCatalogItems)
        .set(updates)
        .where(
          and(
            eq(industrialCatalogItems.id, item.id),
            eq(industrialCatalogItems.tenantId, tenant.id),
          ),
        )
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: actorIdFor(req, "adminUser"),
        action: `industrial_catalog_item.${parsed.data.action}`,
        entityType: "industrial_catalog_item",
        entityId: updated.id,
        reason: parsed.data.reason,
        previousValue: {
          approvalStatus: item.approvalStatus,
          visibility: item.visibility,
        },
        nextValue: {
          approvalStatus: updated.approvalStatus,
          visibility: updated.visibility,
        },
        metadata: {
          factoryId: item.factoryId,
          classification: item.classification,
          categoryCode: item.categoryCode,
        },
      });

      return res.json({
        ok: true,
        item: staffCatalogSummary(updated, factory),
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The industrial catalog review could not be saved.",
      });
    }
  },
);

router.get(
  "/admin/legacy-products",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const query = String(req.query?.q || "")
      .trim()
      .toLocaleLowerCase("fr");
    const category = String(req.query?.category || "")
      .trim()
      .toLocaleLowerCase("fr");
    const requestedStatus = String(req.query?.status || "").trim();
    const statusFilter = requestedStatus
      ? z.enum(LEGACY_PRODUCT_REVIEW_STATUSES).safeParse(requestedStatus)
      : null;
    if (
      requestedStatus &&
      requestedStatus !== "unreviewed" &&
      !statusFilter?.success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid legacy product review status.",
      });
    }

    const limit = safeLimit(req.query?.limit, 36);
    const rawPage = Number(req.query?.page || 1);
    const page = Number.isFinite(rawPage)
      ? Math.max(1, Math.min(10000, Math.trunc(rawPage)))
      : 1;

    try {
      const rows = await loadLegacyProductReviewRows(tenant.id);
      const duplicateMap = legacyDuplicateMap(rows);
      const summaries = rows.map((row) =>
        staffLegacyProductReviewSummary(
          row,
          duplicateMap.get(row.product.id) || [],
        ),
      );
      const filtered = summaries.filter((item) => {
        const text = [
          item.name,
          item.description,
          item.sellerName,
          item.categorySlug,
          item.categoryName,
          item.sku,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("fr");
        const queryMatch = !query || text.includes(query);
        const categoryMatch =
          !category ||
          `${item.categorySlug || ""} ${item.categoryName || ""}`
            .toLocaleLowerCase("fr")
            .includes(category);
        const statusMatch = !requestedStatus
          ? true
          : requestedStatus === "unreviewed"
            ? !item.reviewed
            : item.reviewStatus === statusFilter?.data;
        return queryMatch && categoryMatch && statusMatch;
      });
      const statusCounts = summaries.reduce<Record<string, number>>(
        (counts, item) => {
          counts[item.reviewStatus] = (counts[item.reviewStatus] || 0) + 1;
          return counts;
        },
        {},
      );
      const total = filtered.length;
      const pageCount = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, pageCount);
      const start = (safePage - 1) * limit;

      return res.json({
        ok: true,
        products: filtered.slice(start, start + limit),
        page: safePage,
        pageCount,
        limit,
        total,
        summary: {
          totalLegacyRecords: summaries.length,
          reviewedRecords: summaries.filter((item) => item.reviewed).length,
          unreviewedRecords: summaries.filter((item) => !item.reviewed).length,
          demoSourceRecords: summaries.filter((item) => item.sellerIsDemo)
            .length,
          potentialDuplicateRecords: summaries.filter(
            (item) => item.potentialDuplicateIds.length > 0,
          ).length,
          statusCounts,
        },
        sourcePolicy: {
          legacyProductsArePubliclyBlocked: true,
          reviewDoesNotMutateLegacySource: true,
          approvedStatusRequiresIndustrialCatalogEvidence: true,
        },
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The legacy product review queue is temporarily unavailable.",
      });
    }
  },
);

router.get(
  "/admin/legacy-products/:legacyProductId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const parsedProductId = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(req.params?.legacyProductId);
    if (!parsedProductId.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid legacy product identifier.",
      });
    }

    try {
      const rows = await loadLegacyProductReviewRows(tenant.id);
      const row = rows.find(
        (candidate) => candidate.product.id === parsedProductId.data,
      );
      if (!row) {
        return res.status(404).json({
          ok: false,
          message: "Legacy product record not found.",
        });
      }

      const duplicateMap = legacyDuplicateMap(rows);
      const duplicateIds = duplicateMap.get(row.product.id) || [];
      const [linkedCatalogItem, audit] = await Promise.all([
        row.review?.industrialCatalogItemId
          ? db.query.industrialCatalogItems.findFirst({
              where: and(
                eq(
                  industrialCatalogItems.id,
                  row.review.industrialCatalogItemId,
                ),
                eq(industrialCatalogItems.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
        row.review?.id
          ? db
              .select()
              .from(industrialAuditLogs)
              .where(
                and(
                  eq(industrialAuditLogs.tenantId, tenant.id),
                  eq(
                    industrialAuditLogs.entityType,
                    "industrial_legacy_product_review",
                  ),
                  eq(industrialAuditLogs.entityId, row.review.id),
                ),
              )
              .orderBy(desc(industrialAuditLogs.createdAt))
              .limit(40)
          : Promise.resolve([]),
      ]);

      return res.json({
        ok: true,
        product: staffLegacyProductReviewSummary(row, duplicateIds),
        potentialDuplicates: rows
          .filter((candidate) => duplicateIds.includes(candidate.product.id))
          .map((candidate) => ({
            id: candidate.product.id,
            name: candidate.product.name,
            sellerName: candidate.seller?.shopName || null,
            categoryName: candidate.category?.name || null,
            sourceStatus: candidate.product.status,
          })),
        sourceSnapshot: legacyProductSnapshot(row),
        linkedCatalogItem: linkedCatalogItem
          ? staffCatalogSummary(linkedCatalogItem)
          : null,
        audit,
        sourcePolicy: {
          legacyProductsArePubliclyBlocked: true,
          reviewDoesNotMutateLegacySource: true,
        },
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The legacy product review record is temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/admin/legacy-products/:legacyProductId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const parsedProductId = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(req.params?.legacyProductId);
    const parsed = legacyProductReviewSchema.safeParse(req.body || {});
    if (!parsedProductId.success || !parsed.success) {
      return res.status(400).json({
        ok: false,
        message:
          "A valid review status, reason, and any required industrial evidence are required.",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    }

    try {
      const rows = await loadLegacyProductReviewRows(tenant.id);
      const row = rows.find(
        (candidate) => candidate.product.id === parsedProductId.data,
      );
      if (!row) {
        return res.status(404).json({
          ok: false,
          message: "Legacy product record not found.",
        });
      }

      const approvedClassification =
        classificationForApprovedLegacyProductReviewStatus(
          parsed.data.reviewStatus,
        );
      if (approvedClassification && !parsed.data.industrialCatalogItemId) {
        return res.status(400).json({
          ok: false,
          message:
            "An approved legacy classification requires a reviewed industrial catalog item. The legacy record itself cannot be published.",
        });
      }
      if (!approvedClassification && parsed.data.industrialCatalogItemId) {
        return res.status(400).json({
          ok: false,
          message:
            "Link an industrial catalog item only when approving a legacy record into a controlled industrial classification.",
        });
      }
      if (
        approvedClassification &&
        parsed.data.proposedClassification &&
        parsed.data.proposedClassification !== approvedClassification
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "The proposed classification must match the selected approved review status.",
        });
      }

      let linkedCatalogItem: any = null;
      if (parsed.data.industrialCatalogItemId) {
        linkedCatalogItem = await db.query.industrialCatalogItems.findFirst({
          where: and(
            eq(industrialCatalogItems.id, parsed.data.industrialCatalogItemId),
            eq(industrialCatalogItems.tenantId, tenant.id),
          ),
        });
        if (
          !linkedCatalogItem ||
          linkedCatalogItem.approvalStatus !== "approved" ||
          linkedCatalogItem.classification !== approvedClassification
        ) {
          return res.status(400).json({
            ok: false,
            message:
              "The linked industrial catalog item must be approved and match the selected industrial classification.",
          });
        }
      }

      if (parsed.data.duplicateOfLegacyProductId) {
        if (parsed.data.duplicateOfLegacyProductId === row.product.id) {
          return res.status(400).json({
            ok: false,
            message:
              "A legacy product cannot be marked as a duplicate of itself.",
          });
        }
        const retainedRecord = rows.find(
          (candidate) =>
            candidate.product.id === parsed.data.duplicateOfLegacyProductId,
        );
        if (!retainedRecord) {
          return res.status(400).json({
            ok: false,
            message:
              "The selected retained legacy product is not available in this tenant.",
          });
        }
      }

      const recommendation = legacyProductRecommendation(row);
      const now = new Date();
      const nextValues = {
        legacySellerId: row.product.sellerId,
        legacyCategoryId: row.product.categoryId || null,
        sourceSnapshot: legacyProductSnapshot(row),
        reviewStatus: parsed.data.reviewStatus,
        suggestedStatus: recommendation.status,
        suggestedClassification: recommendation.classification,
        proposedClassification:
          approvedClassification || parsed.data.proposedClassification || null,
        industrialCatalogItemId: parsed.data.industrialCatalogItemId || null,
        duplicateOfLegacyProductId:
          parsed.data.duplicateOfLegacyProductId || null,
        reviewReason: parsed.data.reason,
        reviewedByUserId:
          actorIdFor(req, "adminUser") || actorIdFor(req, "staffUser"),
        reviewedAt: now,
        archivedAt: parsed.data.reviewStatus === "ARCHIVED" ? now : null,
        updatedAt: now,
      };
      const existing = row.review;
      const reviewed = existing
        ? (
            await db
              .update(industrialLegacyProductReviews)
              .set(nextValues)
              .where(
                and(
                  eq(industrialLegacyProductReviews.id, existing.id),
                  eq(industrialLegacyProductReviews.tenantId, tenant.id),
                ),
              )
              .returning()
          )[0]
        : (
            await db
              .insert(industrialLegacyProductReviews)
              .values({
                tenantId: tenant.id,
                legacySellerProductId: row.product.id,
                ...nextValues,
              })
              .returning()
          )[0];

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId:
          actorIdFor(req, "adminUser") || actorIdFor(req, "staffUser"),
        action: "industrial_legacy_product_review.recorded",
        entityType: "industrial_legacy_product_review",
        entityId: reviewed.id,
        reason: parsed.data.reason,
        previousValue: existing
          ? {
              reviewStatus: existing.reviewStatus,
              proposedClassification: existing.proposedClassification,
              industrialCatalogItemId: existing.industrialCatalogItemId,
              duplicateOfLegacyProductId: existing.duplicateOfLegacyProductId,
            }
          : {},
        nextValue: {
          reviewStatus: reviewed.reviewStatus,
          proposedClassification: reviewed.proposedClassification,
          industrialCatalogItemId: reviewed.industrialCatalogItemId,
          duplicateOfLegacyProductId: reviewed.duplicateOfLegacyProductId,
        },
        metadata: {
          legacySellerProductId: row.product.id,
          legacySellerId: row.product.sellerId,
          legacyCategoryId: row.product.categoryId || null,
          sourceWasMutated: false,
        },
      });

      const duplicateMap = legacyDuplicateMap(rows);
      return res.json({
        ok: true,
        product: staffLegacyProductReviewSummary(
          { ...row, review: reviewed },
          duplicateMap.get(row.product.id) || [],
        ),
        linkedCatalogItem: linkedCatalogItem
          ? staffCatalogSummary(linkedCatalogItem)
          : null,
        message:
          "The legacy source record remains unchanged. This decision is stored only in the internal industrial review ledger.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The legacy product review could not be recorded.",
      });
    }
  },
);

router.get("/admin/factories", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const query = String(req.query?.q || "").trim();
  const statusFilter = z
    .enum(FACTORY_STATUSES)
    .safeParse(String(req.query?.status || "").trim());
  const limit = safeLimit(req.query?.limit, 80);
  const like = `%${query}%`;

  try {
    const rows = await db
      .select()
      .from(industrialFactories)
      .where(
        and(
          eq(industrialFactories.tenantId, tenant.id),
          statusFilter.success
            ? eq(industrialFactories.factoryStatus, statusFilter.data)
            : undefined,
          query
            ? or(
                ilike(industrialFactories.displayName, like),
                ilike(industrialFactories.legalName, like),
                ilike(industrialFactories.primaryIndustry, like),
                ilike(industrialFactories.city, like),
                ilike(industrialFactories.industrialZone, like),
              )
            : undefined,
        ),
      )
      .orderBy(
        desc(industrialFactories.submittedAt),
        desc(industrialFactories.createdAt),
      )
      .limit(limit);

    const factoryIds = rows.map((factory) => factory.id);
    const relationships = factoryIds.length
      ? await db
          .select()
          .from(industrialFactoryRelationships)
          .where(
            and(
              eq(industrialFactoryRelationships.tenantId, tenant.id),
              inArray(industrialFactoryRelationships.factoryId, factoryIds),
            ),
          )
      : [];
    const relationshipByFactoryId = new Map(
      relationships.map((relationship) => [
        relationship.factoryId,
        relationship,
      ]),
    );

    return res.json({
      ok: true,
      factories: rows.map((factory) =>
        staffFactorySummary(
          factory,
          relationshipByFactoryId.get(factory.id) || null,
        ),
      ),
      total: rows.length,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The factory review queue is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/factories/:factoryId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const factoryId = String(req.params?.factoryId || "").trim();
    if (!z.string().uuid().safeParse(factoryId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid factory identifier." });
    }

    try {
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
        ),
      });
      if (!factory)
        return res
          .status(404)
          .json({ ok: false, message: "Factory not found." });

      const [
        productionLines,
        machines,
        assemblies,
        components,
        relationship,
        audit,
      ] = await Promise.all([
        db
          .select()
          .from(industrialProductionLines)
          .where(
            and(
              eq(industrialProductionLines.factoryId, factory.id),
              eq(industrialProductionLines.tenantId, tenant.id),
            ),
          )
          .orderBy(asc(industrialProductionLines.createdAt)),
        db
          .select()
          .from(industrialMachines)
          .where(
            and(
              eq(industrialMachines.factoryId, factory.id),
              eq(industrialMachines.tenantId, tenant.id),
            ),
          )
          .orderBy(asc(industrialMachines.createdAt)),
        db
          .select()
          .from(industrialMachineAssemblies)
          .where(
            and(
              eq(industrialMachineAssemblies.factoryId, factory.id),
              eq(industrialMachineAssemblies.tenantId, tenant.id),
            ),
          )
          .orderBy(asc(industrialMachineAssemblies.createdAt)),
        db
          .select()
          .from(industrialMachineComponents)
          .where(
            and(
              eq(industrialMachineComponents.factoryId, factory.id),
              eq(industrialMachineComponents.tenantId, tenant.id),
            ),
          )
          .orderBy(asc(industrialMachineComponents.createdAt)),
        db.query.industrialFactoryRelationships.findFirst({
          where: and(
            eq(industrialFactoryRelationships.tenantId, tenant.id),
            eq(industrialFactoryRelationships.factoryId, factory.id),
          ),
        }),
        db
          .select()
          .from(industrialAuditLogs)
          .where(
            and(
              eq(industrialAuditLogs.tenantId, tenant.id),
              or(
                and(
                  eq(industrialAuditLogs.entityType, "industrial_factory"),
                  eq(industrialAuditLogs.entityId, factory.id),
                ),
                and(
                  eq(
                    industrialAuditLogs.entityType,
                    "industrial_factory_relationship",
                  ),
                  eq(industrialAuditLogs.entityId, factory.id),
                ),
              ),
            ),
          )
          .orderBy(desc(industrialAuditLogs.createdAt))
          .limit(30),
      ]);

      return res.json({
        ok: true,
        factory: {
          ...staffFactorySummary(factory, relationship),
          publicAddress: factory.publicAddress,
          publicDescription: factory.publicDescription,
          publicWebsite: factory.publicWebsite,
          publicCertifications: factory.publicCertifications,
          exportMarkets: factory.exportMarkets,
          privateProfile: factory.privateProfile,
          adminNotes: factory.adminNotes,
        },
        relationship: {
          ...staffFactoryRelationshipSummary(
            relationship,
            factory.accountManagerUserId,
            true,
          ),
          allowedNextStages: nextFactoryRelationshipStages(
            relationship?.stage || "identified",
          ),
        },
        productionLines,
        machines,
        assemblies,
        components,
        audit,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The factory profile is temporarily unavailable.",
      });
    }
  },
);

router.patch(
  "/admin/factories/:factoryId/relationship",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const factoryId = String(req.params?.factoryId || "").trim();
    if (!z.string().uuid().safeParse(factoryId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid factory identifier." });
    }

    const parsed = factoryRelationshipUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Provide a valid internal relationship update.",
        issues: parsed.error.flatten(),
      });
    }

    const actorUserId =
      actorIdFor(req, "staffUser") || actorIdFor(req, "adminUser");
    if (!actorUserId) {
      return res.status(401).json({
        ok: false,
        message: "An authenticated Exportunity staff account is required.",
      });
    }

    const [factory, existingRelationship] = await Promise.all([
      db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
        ),
      }),
      db.query.industrialFactoryRelationships.findFirst({
        where: and(
          eq(industrialFactoryRelationships.factoryId, factoryId),
          eq(industrialFactoryRelationships.tenantId, tenant.id),
        ),
      }),
    ]);
    if (!factory) {
      return res.status(404).json({ ok: false, message: "Factory not found." });
    }

    const currentStage = existingRelationship?.stage || "identified";
    const nextStage = parsed.data.stage || currentStage;
    if (!canTransitionFactoryRelationshipStage(currentStage, nextStage)) {
      return res.status(409).json({
        ok: false,
        message:
          "That relationship stage cannot follow the current controlled pipeline stage.",
        allowedNextStages: nextFactoryRelationshipStages(currentStage),
      });
    }

    let nextReviewAt =
      parsed.data.nextReviewAt === undefined
        ? existingRelationship?.nextReviewAt || null
        : null;
    if (parsed.data.nextReviewAt) {
      const candidate = new Date(`${parsed.data.nextReviewAt}T12:00:00.000Z`);
      if (
        Number.isNaN(candidate.valueOf()) ||
        candidate.toISOString().slice(0, 10) !== parsed.data.nextReviewAt
      ) {
        return res.status(400).json({
          ok: false,
          message: "Provide a valid next review date.",
        });
      }
      nextReviewAt = candidate;
    }

    const now = new Date();
    const accountManagerUserId = parsed.data.assignToSelf
      ? actorUserId
      : (existingRelationship?.accountManagerUserId ??
        factory.accountManagerUserId ??
        null);
    const nextAction =
      parsed.data.nextAction === undefined
        ? existingRelationship?.nextAction || null
        : parsed.data.nextAction || null;
    const internalNotes =
      parsed.data.internalNotes === undefined
        ? existingRelationship?.internalNotes || null
        : parsed.data.internalNotes || null;
    const recordContact = parsed.data.recordContact;
    const lastContactedAt = recordContact
      ? now
      : existingRelationship?.lastContactedAt || null;
    const lastContactedByUserId = recordContact
      ? actorUserId
      : existingRelationship?.lastContactedByUserId || null;
    const lastContactSummary = recordContact
      ? parsed.data.contactSummary?.trim() || null
      : existingRelationship?.lastContactSummary || null;

    try {
      const result = await db.transaction(async (tx) => {
        const [relationship] = await tx
          .insert(industrialFactoryRelationships)
          .values({
            tenantId: tenant.id,
            factoryId,
            accountManagerUserId,
            stage: nextStage,
            nextAction,
            nextReviewAt,
            lastContactedAt,
            lastContactedByUserId,
            lastContactSummary,
            internalNotes,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: industrialFactoryRelationships.factoryId,
            set: {
              accountManagerUserId,
              stage: nextStage,
              nextAction,
              nextReviewAt,
              lastContactedAt,
              lastContactedByUserId,
              lastContactSummary,
              internalNotes,
              updatedByUserId: actorUserId,
              updatedAt: now,
            },
          })
          .returning();

        const [updatedFactory] =
          accountManagerUserId !== factory.accountManagerUserId
            ? await tx
                .update(industrialFactories)
                .set({ accountManagerUserId, updatedAt: now })
                .where(
                  and(
                    eq(industrialFactories.id, factoryId),
                    eq(industrialFactories.tenantId, tenant.id),
                  ),
                )
                .returning()
            : [factory];

        await tx.insert(industrialAuditLogs).values({
          tenantId: tenant.id,
          actorUserId,
          action: recordContact
            ? "industrial_factory_relationship.contact_recorded"
            : "industrial_factory_relationship.updated",
          entityType: "industrial_factory_relationship",
          entityId: factoryId,
          reason: recordContact
            ? lastContactSummary
            : "Internal factory relationship workflow updated.",
          previousValue: {
            stage: currentStage,
            accountManagerUserId:
              existingRelationship?.accountManagerUserId ??
              factory.accountManagerUserId ??
              null,
            nextAction: existingRelationship?.nextAction || null,
            nextReviewAt: existingRelationship?.nextReviewAt || null,
            lastContactedAt: existingRelationship?.lastContactedAt || null,
          },
          nextValue: {
            stage: relationship.stage,
            accountManagerUserId: relationship.accountManagerUserId,
            nextAction: relationship.nextAction,
            nextReviewAt: relationship.nextReviewAt,
            lastContactedAt: relationship.lastContactedAt,
          },
          metadata: {
            contactRecorded: recordContact,
            relationshipId: relationship.id,
            externalOutreachCreated: false,
          },
        });

        return { relationship, factory: updatedFactory };
      });

      return res.json({
        ok: true,
        factory: staffFactorySummary(result.factory, result.relationship),
        relationship: staffFactoryRelationshipSummary(
          result.relationship,
          result.factory.accountManagerUserId,
          true,
        ),
        message:
          "Internal relationship management was updated. No message, quote, order, manufacturing job, or payment was created.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The factory relationship update could not be saved.",
      });
    }
  },
);

router.get("/admin/requirements", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const query = String(req.query?.q || "").trim();
  const statusFilter = z
    .enum(REQUIREMENT_STATUSES)
    .safeParse(String(req.query?.status || "").trim());
  const limit = safeLimit(req.query?.limit, 100);
  const like = `%${query}%`;

  try {
    const rows = await db
      .select()
      .from(industrialRequirements)
      .where(
        and(
          eq(industrialRequirements.tenantId, tenant.id),
          statusFilter.success
            ? eq(industrialRequirements.status, statusFilter.data)
            : undefined,
          query
            ? or(
                ilike(industrialRequirements.referenceCode, like),
                ilike(industrialRequirements.title, like),
                ilike(industrialRequirements.requesterCompany, like),
                ilike(industrialRequirements.requesterName, like),
                ilike(industrialRequirements.deliveryCity, like),
              )
            : undefined,
        ),
      )
      .orderBy(
        desc(industrialRequirements.submittedAt),
        desc(industrialRequirements.createdAt),
      )
      .limit(limit);
    const lifecycleByRequirementId = await loadRequirementLifecycles(
      tenant.id,
      rows.map((row) => row.id),
    );
    const productRequirements = rows.length
      ? await db
          .select()
          .from(industrialProductRequirements)
          .where(
            and(
              eq(industrialProductRequirements.tenantId, tenant.id),
              inArray(
                industrialProductRequirements.requirementId,
                rows.map((row) => row.id),
              ),
            ),
          )
      : [];
    const productByRequirementId = new Map(
      productRequirements.map((item) => [item.requirementId, item] as const),
    );
    const executionByRequirementId = await loadIndustrialOpportunityExecutions({
      tenantId: tenant.id,
      requirements: rows.map((row) => ({ id: row.id, metadata: row.metadata })),
    });

    return res.json({
      ok: true,
      requirements: rows.map((row) =>
        staffRequirementSummary(
          row,
          lifecycleByRequirementId.get(row.id),
          productByRequirementId.get(row.id),
          executionByRequirementId.get(row.id),
        ),
      ),
      total: rows.length,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The industrial requirement queue is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/requirements/:requirementId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }

    try {
      const requirement = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (!requirement)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });

      const [factory, attachments, audit, quotes, orders, productRequirement] = await Promise.all([
        requirement.factoryId
          ? db.query.industrialFactories.findFirst({
              where: and(
                eq(industrialFactories.id, requirement.factoryId),
                eq(industrialFactories.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
        db
          .select()
          .from(industrialRequirementAttachments)
          .where(
            and(
              eq(
                industrialRequirementAttachments.requirementId,
                requirement.id,
              ),
              eq(industrialRequirementAttachments.tenantId, tenant.id),
            ),
          )
          .orderBy(desc(industrialRequirementAttachments.createdAt)),
        db
          .select()
          .from(industrialAuditLogs)
          .where(
            and(
              eq(industrialAuditLogs.tenantId, tenant.id),
              eq(industrialAuditLogs.entityType, "industrial_requirement"),
              eq(industrialAuditLogs.entityId, requirement.id),
            ),
          )
          .orderBy(desc(industrialAuditLogs.createdAt))
          .limit(30),
        db
          .select()
          .from(industrialQuotes)
          .where(
            and(
              eq(industrialQuotes.tenantId, tenant.id),
              eq(industrialQuotes.requirementId, requirement.id),
            ),
          )
          .orderBy(desc(industrialQuotes.updatedAt)),
        db
          .select()
          .from(industrialOrders)
          .where(
            and(
              eq(industrialOrders.tenantId, tenant.id),
              eq(industrialOrders.requirementId, requirement.id),
            ),
          )
          .orderBy(desc(industrialOrders.updatedAt)),
        db.query.industrialProductRequirements.findFirst({
          where: and(
            eq(industrialProductRequirements.tenantId, tenant.id),
            eq(industrialProductRequirements.requirementId, requirement.id),
          ),
        }),
      ]);
      const lifecycle = requirementLifecycleFor(requirement, quotes, orders);
      const execution = (
        await loadIndustrialOpportunityExecutions({
          tenantId: tenant.id,
          requirements: [{ id: requirement.id, metadata: requirement.metadata }],
          includeTimeline: true,
        })
      ).get(requirement.id);

      return res.json({
        ok: true,
        requirement: {
          ...staffRequirementSummary(
            requirement,
            lifecycle,
            productRequirement,
            execution,
          ),
          details: requirement.details,
          internalNotes: requirement.internalNotes,
          metadata: requirement.metadata,
        },
        factory: factory ? staffFactorySummary(factory) : null,
        attachments,
        audit,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The industrial requirement is temporarily unavailable.",
      });
    }
  },
);

router.get(
  "/admin/requirements/:requirementId/attachments/:attachmentId/download",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    const attachmentId = String(req.params?.attachmentId || "").trim();
    if (
      !z.string().uuid().safeParse(requirementId).success ||
      !z.string().uuid().safeParse(attachmentId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial attachment identifier.",
      });
    }

    try {
      const attachment =
        await db.query.industrialRequirementAttachments.findFirst({
          where: and(
            eq(industrialRequirementAttachments.id, attachmentId),
            eq(industrialRequirementAttachments.requirementId, requirementId),
            eq(industrialRequirementAttachments.tenantId, tenant.id),
          ),
        });
      if (!attachment)
        return res
          .status(404)
          .json({ ok: false, message: "Technical document not found." });

      const file = await resolveIndustrialRequirementAttachment(
        attachment.storageKey,
      );
      const safeFileName = String(
        attachment.fileName || "technical-document",
      ).replace(/[\\"\r\n]/g, "_");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        attachment.mimeType || "application/octet-stream",
      );
      res.setHeader("Content-Length", String(file.sizeBytes));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName}"`,
      );
      const stream = createReadStream(file.absolutePath);
      stream.on("error", () => {
        if (!res.headersSent)
          res
            .status(404)
            .json({ ok: false, message: "Technical document is unavailable." });
        else res.end();
      });
      stream.pipe(res);
    } catch {
      return res
        .status(404)
        .json({ ok: false, message: "Technical document is unavailable." });
    }
  },
);

router.get(
  "/admin/requirements/:requirementId/supplier-capability-candidates",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res
        .status(400)
        .json({
          ok: false,
          message: "Invalid industrial requirement identifier.",
        });
    }

    try {
      const requirement = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (!requirement) {
        return res.status(404).json({
          ok: false,
          message: "Industrial requirement not found.",
        });
      }

      const [supplierRows, existingRows] = await Promise.all([
        db
          .select({
            supplier: industrialSupplierProfiles,
            linkedFactory: industrialFactories,
          })
          .from(industrialSupplierProfiles)
          .leftJoin(
            industrialFactories,
            and(
              eq(
                industrialSupplierProfiles.linkedFactoryId,
                industrialFactories.id,
              ),
              eq(
                industrialSupplierProfiles.tenantId,
                industrialFactories.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialSupplierProfiles.tenantId, tenant.id),
              eq(industrialSupplierProfiles.supplierStatus, "active"),
              eq(industrialSupplierProfiles.verificationStatus, "verified"),
              eq(industrialSupplierProfiles.visibility, "exportunity_internal"),
            ),
          )
          .orderBy(desc(industrialSupplierProfiles.updatedAt))
          .limit(100),
        db
          .select({
            match: industrialRequirementSupplierMatches,
            supplier: industrialSupplierProfiles,
          })
          .from(industrialRequirementSupplierMatches)
          .innerJoin(
            industrialSupplierProfiles,
            and(
              eq(
                industrialRequirementSupplierMatches.supplierProfileId,
                industrialSupplierProfiles.id,
              ),
              eq(
                industrialRequirementSupplierMatches.tenantId,
                industrialSupplierProfiles.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
              eq(
                industrialRequirementSupplierMatches.requirementId,
                requirement.id,
              ),
            ),
          )
          .orderBy(
            desc(industrialRequirementSupplierMatches.selectedAt),
            desc(industrialRequirementSupplierMatches.updatedAt),
          ),
      ]);

      const candidates = supplierRows
        .map(({ supplier, linkedFactory }) => {
          const score = scoreIndustrialSupplierCapabilityMatch(
            supplier,
            requirement,
          );
          return {
            supplier: staffSupplierSummary(supplier, linkedFactory),
            ...score,
          };
        })
        .filter((candidate) => candidate.eligible && candidate.score > 0)
        .sort((left, right) => right.score - left.score);

      return res.json({
        ok: true,
        requirement: staffRequirementSummary(requirement),
        candidates,
        matches: existingRows.map(({ match, supplier }) =>
          staffSupplierCapabilityMatchSummary(match, supplier),
        ),
        rules: {
          verifiedAndActiveOnly: true,
          visibility: "exportunity_internal",
          quoteCreation: "not_available_from_capability_match",
          outreach: "not_available_from_capability_match",
        },
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message:
          "Internal supplier capability matching is temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/admin/requirements/:requirementId/supplier-capability-matches",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res
        .status(400)
        .json({
          ok: false,
          message: "Invalid industrial requirement identifier.",
        });
    }
    const parsed = supplierCapabilityMatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message:
          "Select a verified supplier and record the capability-match rationale.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const [requirement, supplier] = await Promise.all([
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        db.query.industrialSupplierProfiles.findFirst({
          where: and(
            eq(industrialSupplierProfiles.id, parsed.data.supplierProfileId),
            eq(industrialSupplierProfiles.tenantId, tenant.id),
          ),
        }),
      ]);
      if (!requirement) {
        return res.status(404).json({
          ok: false,
          message: "Industrial requirement not found.",
        });
      }
      if (!supplier) {
        return res.status(404).json({
          ok: false,
          message: "Supplier profile not found.",
        });
      }
      if (!isSupplierEligibleForCapabilityMatching(supplier)) {
        return res.status(409).json({
          ok: false,
          message:
            "Only active, verified internal suppliers can be assigned to a requirement.",
        });
      }

      const deterministicScore = scoreIndustrialSupplierCapabilityMatch(
        supplier,
        requirement,
      );
      const now = new Date();
      const actorUserId = actorIdFor(req);
      if (parsed.data.status === "selected") {
        await db
          .update(industrialRequirementSupplierMatches)
          .set({
            status: "shortlisted",
            selectedByUserId: null,
            selectedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
              eq(
                industrialRequirementSupplierMatches.requirementId,
                requirement.id,
              ),
              eq(industrialRequirementSupplierMatches.status, "selected"),
            ),
          );
      }

      const existing =
        await db.query.industrialRequirementSupplierMatches.findFirst({
          where: and(
            eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
            eq(
              industrialRequirementSupplierMatches.requirementId,
              requirement.id,
            ),
            eq(
              industrialRequirementSupplierMatches.supplierProfileId,
              supplier.id,
            ),
          ),
        });
      const values = {
        status: parsed.data.status,
        matchScore: deterministicScore.score,
        matchReason: parsed.data.matchReason,
        internalNotes: optionalText(parsed.data.internalNotes),
        selectedByUserId:
          parsed.data.status === "selected" ? actorUserId : null,
        selectedAt: parsed.data.status === "selected" ? now : null,
        updatedAt: now,
      };
      const match = existing
        ? (
            await db
              .update(industrialRequirementSupplierMatches)
              .set(values)
              .where(eq(industrialRequirementSupplierMatches.id, existing.id))
              .returning()
          )[0]
        : (
            await db
              .insert(industrialRequirementSupplierMatches)
              .values({
                tenantId: tenant.id,
                requirementId: requirement.id,
                supplierProfileId: supplier.id,
                createdByUserId: actorUserId,
                ...values,
              })
              .returning()
          )[0];

      if (
        ["draft", "submitted", "triaged", "under_review"].includes(
          requirement.status,
        )
      ) {
        await db
          .update(industrialRequirements)
          .set({ status: "supplier_matching", updatedAt: now })
          .where(
            and(
              eq(industrialRequirements.id, requirement.id),
              eq(industrialRequirements.tenantId, tenant.id),
            ),
          );
      }

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: existing
          ? "industrial_requirement_supplier_match.updated"
          : "industrial_requirement_supplier_match.created",
        entityType: "industrial_requirement_supplier_match",
        entityId: match.id,
        reason: parsed.data.matchReason,
        previousValue: existing
          ? {
              status: existing.status,
              matchScore: existing.matchScore,
              supplierProfileId: existing.supplierProfileId,
            }
          : {},
        nextValue: {
          status: match.status,
          matchScore: match.matchScore,
          supplierProfileId: match.supplierProfileId,
          requirementId: match.requirementId,
        },
        metadata: {
          deterministicScore,
          internalOnly: true,
          outreachCreated: false,
          quoteCreated: false,
        },
      });

      return res.status(existing ? 200 : 201).json({
        ok: true,
        match: staffSupplierCapabilityMatchSummary(match, supplier),
        message:
          "The supplier capability match was recorded. It does not contact the supplier or create a quotation.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The supplier capability match could not be recorded.",
      });
    }
  },
);

router.get(
  "/admin/requirements/:requirementId/match-candidates",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }

    try {
      const requirement = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (!requirement)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });

      const classification = classificationForRequirementType(
        requirement.requirementType as any,
      );
      const [candidateRows, matchRows] = await Promise.all([
        db
          .select({
            item: industrialCatalogItems,
            factory: industrialFactories,
          })
          .from(industrialCatalogItems)
          .innerJoin(
            industrialFactories,
            and(
              eq(industrialCatalogItems.factoryId, industrialFactories.id),
              eq(industrialCatalogItems.tenantId, industrialFactories.tenantId),
            ),
          )
          .where(
            and(
              eq(industrialCatalogItems.tenantId, tenant.id),
              eq(industrialCatalogItems.approvalStatus, "approved"),
              eq(industrialCatalogItems.categoryCode, requirement.categoryCode),
              eq(industrialCatalogItems.classification, classification as any),
              eq(industrialFactories.factoryStatus, "active"),
              eq(industrialFactories.verificationStatus, "verified"),
            ),
          )
          .orderBy(
            desc(industrialCatalogItems.updatedAt),
            industrialCatalogItems.name,
          )
          .limit(80),
        db
          .select({
            match: industrialRequirementMatches,
            item: industrialCatalogItems,
            factory: industrialFactories,
          })
          .from(industrialRequirementMatches)
          .innerJoin(
            industrialCatalogItems,
            and(
              eq(
                industrialRequirementMatches.catalogItemId,
                industrialCatalogItems.id,
              ),
              eq(
                industrialRequirementMatches.tenantId,
                industrialCatalogItems.tenantId,
              ),
            ),
          )
          .innerJoin(
            industrialFactories,
            and(
              eq(
                industrialRequirementMatches.factoryId,
                industrialFactories.id,
              ),
              eq(
                industrialRequirementMatches.tenantId,
                industrialFactories.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialRequirementMatches.tenantId, tenant.id),
              eq(industrialRequirementMatches.requirementId, requirement.id),
            ),
          )
          .orderBy(
            desc(industrialRequirementMatches.selectedAt),
            desc(industrialRequirementMatches.updatedAt),
          ),
      ]);

      return res.json({
        ok: true,
        requirement: staffRequirementSummary(requirement),
        candidates: candidateRows.map((row) =>
          staffCatalogSummary(row.item, row.factory),
        ),
        matches: matchRows.map((row) =>
          staffMatchSummary(row.match, row.item, row.factory),
        ),
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "Supplier matching is temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/admin/requirements/:requirementId/matches",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }
    const parsed = requirementMatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid matching record is required.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const [requirement, catalogItem] = await Promise.all([
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        db.query.industrialCatalogItems.findFirst({
          where: and(
            eq(industrialCatalogItems.id, parsed.data.catalogItemId),
            eq(industrialCatalogItems.tenantId, tenant.id),
          ),
        }),
      ]);
      if (!requirement)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      if (!catalogItem || catalogItem.approvalStatus !== "approved") {
        return res.status(400).json({
          ok: false,
          message: "Choose an approved industrial catalog item for matching.",
        });
      }
      const expectedClassification = classificationForRequirementType(
        requirement.requirementType as any,
      );
      if (
        catalogItem.categoryCode !== requirement.categoryCode ||
        catalogItem.classification !== expectedClassification
      ) {
        return res.status(400).json({
          ok: false,
          message: "The catalog item does not match this requirement category.",
        });
      }
      const factory = await db.query.industrialFactories.findFirst({
        where: and(
          eq(industrialFactories.id, catalogItem.factoryId),
          eq(industrialFactories.tenantId, tenant.id),
        ),
      });
      if (
        !factory ||
        factory.factoryStatus !== "active" ||
        factory.verificationStatus !== "verified"
      ) {
        return res.status(400).json({
          ok: false,
          message: "The matched factory must be active and verified.",
        });
      }

      const actorUserId = actorIdFor(req);
      const now = new Date();
      if (parsed.data.status === "selected") {
        await db
          .update(industrialRequirementMatches)
          .set({
            status: "shortlisted",
            selectedByUserId: null,
            selectedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialRequirementMatches.tenantId, tenant.id),
              eq(industrialRequirementMatches.requirementId, requirement.id),
              eq(industrialRequirementMatches.status, "selected"),
            ),
          );
      }

      const existing = await db.query.industrialRequirementMatches.findFirst({
        where: and(
          eq(industrialRequirementMatches.tenantId, tenant.id),
          eq(industrialRequirementMatches.requirementId, requirement.id),
          eq(industrialRequirementMatches.catalogItemId, catalogItem.id),
        ),
      });
      const values = {
        status: parsed.data.status,
        matchScore: parsed.data.matchScore ?? null,
        matchReason: parsed.data.matchReason,
        internalNotes: parsed.data.internalNotes || null,
        selectedByUserId:
          parsed.data.status === "selected" ? actorUserId : null,
        selectedAt: parsed.data.status === "selected" ? now : null,
        updatedAt: now,
      };
      const match = existing
        ? (
            await db
              .update(industrialRequirementMatches)
              .set(values)
              .where(eq(industrialRequirementMatches.id, existing.id))
              .returning()
          )[0]
        : (
            await db
              .insert(industrialRequirementMatches)
              .values({
                tenantId: tenant.id,
                requirementId: requirement.id,
                factoryId: factory.id,
                catalogItemId: catalogItem.id,
                ...values,
                createdByUserId: actorUserId,
              })
              .returning()
          )[0];

      const shouldEnterMatching = [
        "submitted",
        "triaged",
        "under_review",
      ].includes(requirement.status);
      if (shouldEnterMatching) {
        await db
          .update(industrialRequirements)
          .set({ status: "supplier_matching", updatedAt: now })
          .where(
            and(
              eq(industrialRequirements.id, requirement.id),
              eq(industrialRequirements.tenantId, tenant.id),
            ),
          );
      }

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_requirement.match_saved",
        entityType: "industrial_requirement_match",
        entityId: match.id,
        reason: parsed.data.matchReason,
        nextValue: {
          status: match.status,
          requirementId: requirement.id,
          catalogItemId: catalogItem.id,
          factoryId: factory.id,
        },
        metadata: {
          requirementType: requirement.requirementType,
          categoryCode: requirement.categoryCode,
        },
      });

      return res.status(existing ? 200 : 201).json({
        ok: true,
        match: staffMatchSummary(match, catalogItem, factory),
      });
    } catch {
      return res
        .status(500)
        .json({ ok: false, message: "The supplier match could not be saved." });
    }
  },
);

router.patch(
  "/admin/requirements/:requirementId/matches/:matchId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    const matchId = String(req.params?.matchId || "").trim();
    if (
      !z.string().uuid().safeParse(requirementId).success ||
      !z.string().uuid().safeParse(matchId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial matching identifier.",
      });
    }
    const parsed = requirementMatchUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid matching update is required.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const existing = await db.query.industrialRequirementMatches.findFirst({
        where: and(
          eq(industrialRequirementMatches.id, matchId),
          eq(industrialRequirementMatches.requirementId, requirementId),
          eq(industrialRequirementMatches.tenantId, tenant.id),
        ),
      });
      if (!existing)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial match not found." });

      const now = new Date();
      const actorUserId = actorIdFor(req);
      if (parsed.data.status === "selected") {
        await db
          .update(industrialRequirementMatches)
          .set({
            status: "shortlisted",
            selectedByUserId: null,
            selectedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialRequirementMatches.tenantId, tenant.id),
              eq(industrialRequirementMatches.requirementId, requirementId),
              eq(industrialRequirementMatches.status, "selected"),
            ),
          );
      }
      const [updated] = await db
        .update(industrialRequirementMatches)
        .set({
          status: parsed.data.status,
          matchScore: parsed.data.matchScore ?? null,
          matchReason: parsed.data.matchReason,
          internalNotes: parsed.data.internalNotes || null,
          selectedByUserId:
            parsed.data.status === "selected" ? actorUserId : null,
          selectedAt: parsed.data.status === "selected" ? now : null,
          updatedAt: now,
        })
        .where(eq(industrialRequirementMatches.id, existing.id))
        .returning();
      const [catalogItem, factory] = await Promise.all([
        db.query.industrialCatalogItems.findFirst({
          where: eq(industrialCatalogItems.id, updated.catalogItemId),
        }),
        db.query.industrialFactories.findFirst({
          where: eq(industrialFactories.id, updated.factoryId),
        }),
      ]);

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_requirement.match_updated",
        entityType: "industrial_requirement_match",
        entityId: updated.id,
        reason: parsed.data.matchReason,
        previousValue: {
          status: existing.status,
          matchScore: existing.matchScore,
        },
        nextValue: { status: updated.status, matchScore: updated.matchScore },
        metadata: {
          requirementId,
          catalogItemId: updated.catalogItemId,
          factoryId: updated.factoryId,
        },
      });

      return res.json({
        ok: true,
        match: staffMatchSummary(updated, catalogItem, factory),
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The industrial match could not be updated.",
      });
    }
  },
);

router.patch(
  "/admin/requirements/:requirementId/supplier-capability-matches/:matchId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    const matchId = String(req.params?.matchId || "").trim();
    if (
      !z.string().uuid().safeParse(requirementId).success ||
      !z.string().uuid().safeParse(matchId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement or supplier-match identifier.",
      });
    }
    const parsed = supplierCapabilityMatchUpdateSchema.safeParse(
      req.body || {},
    );
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message:
          "A valid match status and capability-review rationale are required.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const existing =
        await db.query.industrialRequirementSupplierMatches.findFirst({
          where: and(
            eq(industrialRequirementSupplierMatches.id, matchId),
            eq(
              industrialRequirementSupplierMatches.requirementId,
              requirementId,
            ),
            eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
          ),
        });
      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: "Supplier capability match not found.",
        });
      }
      const supplier = await db.query.industrialSupplierProfiles.findFirst({
        where: and(
          eq(industrialSupplierProfiles.id, existing.supplierProfileId),
          eq(industrialSupplierProfiles.tenantId, tenant.id),
        ),
      });
      if (!supplier) {
        return res.status(409).json({
          ok: false,
          message:
            "The supplier profile attached to this match is unavailable.",
        });
      }
      if (
        parsed.data.status === "selected" &&
        !isSupplierEligibleForCapabilityMatching(supplier)
      ) {
        return res.status(409).json({
          ok: false,
          message:
            "A suspended or unverified supplier cannot be selected for a requirement.",
        });
      }

      const now = new Date();
      const actorUserId = actorIdFor(req);
      if (parsed.data.status === "selected") {
        await db
          .update(industrialRequirementSupplierMatches)
          .set({
            status: "shortlisted",
            selectedByUserId: null,
            selectedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
              eq(
                industrialRequirementSupplierMatches.requirementId,
                requirementId,
              ),
              eq(industrialRequirementSupplierMatches.status, "selected"),
              sql`${industrialRequirementSupplierMatches.id} <> ${existing.id}`,
            ),
          );
      }

      const [match] = await db
        .update(industrialRequirementSupplierMatches)
        .set({
          status: parsed.data.status,
          matchReason: parsed.data.matchReason,
          internalNotes: optionalText(parsed.data.internalNotes),
          selectedByUserId:
            parsed.data.status === "selected" ? actorUserId : null,
          selectedAt: parsed.data.status === "selected" ? now : null,
          updatedAt: now,
        })
        .where(eq(industrialRequirementSupplierMatches.id, existing.id))
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_requirement_supplier_match.status_updated",
        entityType: "industrial_requirement_supplier_match",
        entityId: match.id,
        reason: parsed.data.matchReason,
        previousValue: {
          status: existing.status,
          matchScore: existing.matchScore,
        },
        nextValue: {
          status: match.status,
          matchScore: match.matchScore,
          selectedAt: match.selectedAt,
        },
        metadata: {
          internalOnly: true,
          outreachCreated: false,
          quoteCreated: false,
        },
      });

      return res.json({
        ok: true,
        match: staffSupplierCapabilityMatchSummary(match, supplier),
        message:
          "The supplier capability match was updated. Commercial contact remains a separate controlled workflow.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The supplier capability match could not be updated.",
      });
    }
  },
);

router.get(
  "/admin/requirements/:requirementId/commercial-room",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }

    try {
      const requirement = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (!requirement) {
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      }

      const [
        productRequirement,
        matchRows,
        supplierQuoteRows,
        commercialOffers,
        quotes,
        orders,
        attachments,
        tenantAudit,
        tenantActions,
      ] = await Promise.all([
        db.query.industrialProductRequirements.findFirst({
          where: and(
            eq(industrialProductRequirements.tenantId, tenant.id),
            eq(industrialProductRequirements.requirementId, requirement.id),
          ),
        }),
        db
          .select({
            match: industrialRequirementSupplierMatches,
            supplier: industrialSupplierProfiles,
          })
          .from(industrialRequirementSupplierMatches)
          .innerJoin(
            industrialSupplierProfiles,
            and(
              eq(
                industrialRequirementSupplierMatches.supplierProfileId,
                industrialSupplierProfiles.id,
              ),
              eq(
                industrialRequirementSupplierMatches.tenantId,
                industrialSupplierProfiles.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
              eq(
                industrialRequirementSupplierMatches.requirementId,
                requirement.id,
              ),
            ),
          )
          .orderBy(
            desc(industrialRequirementSupplierMatches.matchScore),
            desc(industrialRequirementSupplierMatches.updatedAt),
          ),
        db
          .select({
            quote: industrialSupplierQuotes,
            supplier: industrialSupplierProfiles,
          })
          .from(industrialSupplierQuotes)
          .leftJoin(
            industrialSupplierProfiles,
            and(
              eq(
                industrialSupplierQuotes.supplierProfileId,
                industrialSupplierProfiles.id,
              ),
              eq(
                industrialSupplierQuotes.tenantId,
                industrialSupplierProfiles.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialSupplierQuotes.tenantId, tenant.id),
              eq(industrialSupplierQuotes.requirementId, requirement.id),
            ),
          )
          .orderBy(desc(industrialSupplierQuotes.updatedAt)),
        db
          .select()
          .from(industrialCommercialOffers)
          .where(
            and(
              eq(industrialCommercialOffers.tenantId, tenant.id),
              eq(industrialCommercialOffers.requirementId, requirement.id),
            ),
          )
          .orderBy(desc(industrialCommercialOffers.version)),
        db
          .select()
          .from(industrialQuotes)
          .where(
            and(
              eq(industrialQuotes.tenantId, tenant.id),
              eq(industrialQuotes.requirementId, requirement.id),
            ),
          )
          .orderBy(desc(industrialQuotes.updatedAt)),
        db
          .select()
          .from(industrialOrders)
          .where(
            and(
              eq(industrialOrders.tenantId, tenant.id),
              eq(industrialOrders.requirementId, requirement.id),
            ),
          )
          .orderBy(desc(industrialOrders.updatedAt)),
        db
          .select()
          .from(industrialRequirementAttachments)
          .where(
            and(
              eq(industrialRequirementAttachments.tenantId, tenant.id),
              eq(
                industrialRequirementAttachments.requirementId,
                requirement.id,
              ),
            ),
          )
          .orderBy(desc(industrialRequirementAttachments.createdAt)),
        db
          .select()
          .from(industrialAuditLogs)
          .where(eq(industrialAuditLogs.tenantId, tenant.id))
          .orderBy(desc(industrialAuditLogs.createdAt))
          .limit(300),
        db
          .select()
          .from(actionRequests)
          .where(eq(actionRequests.tenantId, tenant.id))
          .orderBy(desc(actionRequests.createdAt))
          .limit(300),
      ]);

      const relatedIds = new Set<string>([
        requirement.id,
        ...matchRows.map(({ match }) => String(match.id)),
        ...supplierQuoteRows.map(({ quote }) => String(quote.id)),
        ...commercialOffers.map((offer) => String(offer.id)),
        ...quotes.map((quote) => String(quote.id)),
        ...orders.map((order) => String(order.id)),
      ]);
      const audit = tenantAudit.filter((row) => {
        const metadata = safeRecord(row.metadata);
        return (
          relatedIds.has(String(row.entityId || "")) ||
          String(metadata.requirementId || "") === requirement.id
        );
      });
      const actions = tenantActions.filter(
        (row) =>
          String(safeRecord(row.payload).requirementId || "") ===
          requirement.id,
      );
      const lifecycle = requirementLifecycleFor(requirement, quotes, orders);
      const execution = (
        await loadIndustrialOpportunityExecutions({
          tenantId: tenant.id,
          requirements: [{ id: requirement.id, metadata: requirement.metadata }],
          includeTimeline: true,
        })
      ).get(requirement.id);

      return res.json({
        ok: true,
        room: {
          requirement: {
            ...staffRequirementSummary(
              requirement,
              lifecycle,
              productRequirement,
              execution,
            ),
            details: requirement.details,
            internalNotes: requirement.internalNotes,
          },
          supplierMatches: matchRows.map(({ match, supplier }) =>
            staffSupplierCapabilityMatchSummary(match, supplier),
          ),
          supplierQuotes: supplierQuoteRows.map(({ quote, supplier }) =>
            staffSupplierQuoteSummary(quote, supplier),
          ),
          commercialOffers: commercialOffers.map(
            staffCommercialOfferSummary,
          ),
          customerQuotes: quotes.map((quote) =>
            staffQuoteSummary(quote, requirement),
          ),
          orders: orders.map((order) =>
            staffOrderSummary(order, undefined, requirement),
          ),
          approvalActions: actions.map(staffActionRequestSummary),
          attachments,
          audit,
          execution: execution || null,
          controls: {
            externalCommunicationsEnabled: externalCommunicationsEnabled(
              process.env.FEATURE_EXTERNAL_COMMUNICATIONS,
            ),
            supplierCostsArePrivate: true,
            customerQuoteRequiresApprovedOffer: true,
          },
        },
      });
    } catch (error) {
      console.error("[industrial] commercial room failed", error);
      return res.status(503).json({
        ok: false,
        message: "The private commercial room is temporarily unavailable.",
      });
    }
  },
);

router.patch(
  "/admin/requirements/:requirementId/workstreams/:taskId/status",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const requirementId = String(req.params?.requirementId || "").trim();
    const taskId = Number(req.params?.taskId || 0);
    const parsed = z
      .object({
        status: z.enum([
          "backlog",
          "in_progress",
          "blocked",
          "done",
          "canceled",
        ]),
        reason: z.string().trim().max(600).optional(),
      })
      .safeParse(req.body || {});
    if (
      !z.string().uuid().safeParse(requirementId).success ||
      !Number.isInteger(taskId) ||
      taskId <= 0 ||
      !parsed.success
    ) {
      return res.status(400).json({
        ok: false,
        message: "A valid opportunity workstream update is required.",
      });
    }

    try {
      const requirement = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (!requirement) {
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      }
      const beforeExecution = (
        await loadIndustrialOpportunityExecutions({
          tenantId: tenant.id,
          requirements: [{ id: requirement.id, metadata: requirement.metadata }],
        })
      ).get(requirement.id);
      const workstream = beforeExecution?.workstreams.find(
        (item) => item.id === taskId,
      );
      if (!workstream) {
        return res.status(404).json({
          ok: false,
          message: "This task is not a workstream for the selected opportunity.",
        });
      }
      const previousStatus = workstream.status;
      const result = await updateTaskStatus(
        taskId,
        parsed.data.status as TaskStatus,
        parsed.data.reason || "Updated from the industrial opportunity room.",
      );
      if (!result.success) {
        return res.status(409).json({ ok: false, message: result.error });
      }
      const execution = (
        await loadIndustrialOpportunityExecutions({
          tenantId: tenant.id,
          requirements: [{ id: requirement.id, metadata: requirement.metadata }],
          includeTimeline: true,
        })
      ).get(requirement.id);
      if (!execution) {
        return res.status(409).json({
          ok: false,
          message: "The opportunity execution record could not be refreshed.",
        });
      }
      const now = new Date();
      const nextAction = nextActionForIndustrialExecution(execution);
      await Promise.all([
        db
          .update(industrialRequirements)
          .set({ nextAction, nextActionAt: now, updatedAt: now })
          .where(
            and(
              eq(industrialRequirements.id, requirement.id),
              eq(industrialRequirements.tenantId, tenant.id),
            ),
          ),
        db.insert(industrialAuditLogs).values({
          tenantId: tenant.id,
          actorUserId: actorIdFor(req),
          action: "industrial_requirement.workstream_status_updated",
          entityType: "industrial_requirement",
          entityId: requirement.id,
          reason:
            parsed.data.reason ||
            "Updated from the private industrial opportunity room.",
          previousValue: { taskId, status: previousStatus },
          nextValue: { taskId, status: parsed.data.status, nextAction },
          metadata: {
            requirementId: requirement.id,
            referenceCode: requirement.referenceCode,
            taskId,
            agentId: workstream.agentId,
            executionStatus: execution.status,
            progress: execution.progress,
            externalActionStarted: false,
          },
        }),
      ]);
      return res.json({
        ok: true,
        task: result.task,
        execution,
        nextAction,
        externalActionStarted: false,
      });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        message:
          String(error?.message || "").trim() ||
          "The opportunity workstream could not be updated.",
      });
    }
  },
);

router.post(
  "/admin/requirements/:requirementId/discover-suppliers",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }
    try {
      const requirement = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (!requirement) {
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      }
      const handoff = safeRecord(safeRecord(requirement.metadata).operationsHandoff);
      const participants = Array.isArray(handoff.participants)
        ? handoff.participants
        : [];
      const sourcingParticipant = participants.find(
        (participant: any) =>
          String(safeRecord(participant).key || "") === "sourcing",
      );
      const discoveryAgentId = Number(
        safeRecord(sourcingParticipant).agentId ||
          requirement.assignedCommercialAgentId ||
          0,
      );
      const result = await discoverVerifiedCommercialSuppliers({
        tenantId: tenant.id,
        requirementId: requirement.id,
        discoveryAgentId: Number.isFinite(discoveryAgentId)
          ? discoveryAgentId
          : null,
        createdByUserId: actorIdFor(req),
      });
      return res.json({ ok: true, ...result, outreachCreated: 0 });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        message:
          String(error?.message || "").trim() ||
          "Verified supplier discovery could not be completed.",
      });
    }
  },
);

router.post(
  "/admin/requirements/:requirementId/rfq-actions",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }
    const parsed = industrialRfqDraftSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid, controlled RFQ draft is required.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const [requirement, productRequirement, matches] = await Promise.all([
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        db.query.industrialProductRequirements.findFirst({
          where: and(
            eq(industrialProductRequirements.requirementId, requirementId),
            eq(industrialProductRequirements.tenantId, tenant.id),
          ),
        }),
        db
          .select({
            match: industrialRequirementSupplierMatches,
            supplier: industrialSupplierProfiles,
          })
          .from(industrialRequirementSupplierMatches)
          .innerJoin(
            industrialSupplierProfiles,
            and(
              eq(
                industrialRequirementSupplierMatches.supplierProfileId,
                industrialSupplierProfiles.id,
              ),
              eq(
                industrialRequirementSupplierMatches.tenantId,
                industrialSupplierProfiles.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
              eq(
                industrialRequirementSupplierMatches.requirementId,
                requirementId,
              ),
              inArray(
                industrialRequirementSupplierMatches.id,
                parsed.data.supplierMatchIds,
              ),
            ),
          ),
      ]);
      if (!requirement) {
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      }
      if (matches.length !== parsed.data.supplierMatchIds.length) {
        return res.status(409).json({
          ok: false,
          message:
            "One or more selected suppliers no longer belong to this requirement.",
        });
      }

      const actorUserId = actorIdFor(req);
      const product =
        productRequirement?.productName || requirement.title;
      const destination =
        productRequirement?.destination ||
        [requirement.deliveryCity, requirement.deliveryCountryCode]
          .filter(Boolean)
          .join(", ");
      const created: any[] = [];
      const skipped: Array<{ supplierProfileId: string; reason: string }> = [];

      for (const { match, supplier } of matches) {
        if (!isSupplierEligibleForCapabilityMatching(supplier)) {
          skipped.push({
            supplierProfileId: supplier.id,
            reason: "Supplier is not active and verified.",
          });
          continue;
        }
        const recipient =
          parsed.data.channel === "email" ? supplier.email : supplier.phone;
        if (!String(recipient || "").trim()) {
          skipped.push({
            supplierProfileId: supplier.id,
            reason: `No verified ${parsed.data.channel} contact route.`,
          });
          continue;
        }
        const generatedMessage = buildIndustrialRfqMessage({
          language: parsed.data.language,
          supplierName: supplier.displayName,
          referenceCode: requirement.referenceCode,
          product,
          specification: productRequirement?.specification,
          quantity:
            productRequirement?.quantityText || requirement.quantityText,
          unit: productRequirement?.unit,
          destination,
          incoterm: productRequirement?.incoterm,
          requiredBy:
            productRequirement?.deadlineText ||
            requirement.requiredBy?.toISOString().slice(0, 10) ||
            null,
        });
        const message = parsed.data.message
          ? parsed.data.message.replaceAll(
              "{supplier_name}",
              supplier.displayName,
            )
          : generatedMessage;
        const commonPayload = {
          agentKey: "sourcing",
          requirementId: requirement.id,
          requirementReferenceCode: requirement.referenceCode,
          supplierProfileId: supplier.id,
          supplierMatchId: match.id,
          product,
          humanApprovalRequired: true,
          externalActivationRequired: true,
          recipientProvenance: {
            source: "verified_internal_supplier_profile",
            verificationStatus: supplier.verificationStatus,
            lastVerifiedAt: supplier.verifiedAt,
          },
        };
        try {
          const action = await createActionRequest({
            tenantId: tenant.id,
            requestedByUserId: actorUserId,
            requestedByAgentKey: "sourcing",
            actionType:
              parsed.data.channel === "email"
                ? "SEND_EMAIL"
                : "SEND_WHATSAPP",
            payload:
              parsed.data.channel === "email"
                ? {
                    ...commonPayload,
                    to: [String(recipient).trim()],
                    subject: `${requirement.referenceCode} - Request for quotation - ${product}`,
                    body: { text: message },
                  }
                : {
                    ...commonPayload,
                    toE164: String(recipient).trim(),
                    mode: "template",
                    contentSid: parsed.data.contentSid,
                    contentVariables: {
                      "1": supplier.displayName,
                      "2": product,
                      "3": requirement.referenceCode,
                    },
                    body: message,
                    whatsappOptInEvidence:
                      parsed.data.whatsappOptInEvidence,
                  },
            mode: "REAL",
            priority: requirement.urgency === "critical" ? 10 : 5,
            idempotencyKey: `industrial-rfq:${requirement.id}:${match.id}:${parsed.data.channel}:v1`,
            correlationId: `industrial:${requirement.referenceCode}`,
            relatedConversationId: requirement.sourceConversationId,
            forceApproval: true,
          });
          created.push(staffActionRequestSummary(action));
        } catch (error: any) {
          skipped.push({
            supplierProfileId: supplier.id,
            reason:
              String(error?.message || "").trim() ||
              "The action draft could not be prepared.",
          });
        }
      }

      if (created.length) {
        const now = new Date();
        await db
          .update(industrialRequirementSupplierMatches)
          .set({ status: "shortlisted", updatedAt: now })
          .where(
            and(
              eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
              eq(
                industrialRequirementSupplierMatches.requirementId,
                requirement.id,
              ),
              inArray(
                industrialRequirementSupplierMatches.id,
                matches.map(({ match }) => match.id),
              ),
            ),
          );
        await db
          .update(industrialRequirements)
          .set({
            status: "supplier_matching",
            nextAction:
              "Review RFQ drafts in Actions. External communications remain disabled until separately activated.",
            nextActionAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialRequirements.id, requirement.id),
              eq(industrialRequirements.tenantId, tenant.id),
            ),
          );
        await db.insert(industrialAuditLogs).values({
          tenantId: tenant.id,
          actorUserId,
          action: "industrial_requirement.rfq_drafts_created",
          entityType: "industrial_requirement",
          entityId: requirement.id,
          reason:
            "Human-review RFQ actions were prepared without sending external communication.",
          nextValue: {
            actionIds: created.map((action) => action.id),
            channel: parsed.data.channel,
          },
          metadata: {
            requirementId: requirement.id,
            sent: 0,
            externalCommunicationsEnabled: externalCommunicationsEnabled(
              process.env.FEATURE_EXTERNAL_COMMUNICATIONS,
            ),
            skipped,
          },
        });
      }

      return res.status(201).json({
        ok: true,
        actions: created,
        skipped,
        sent: 0,
        message:
          "RFQ drafts were created for visible human review. Nothing was sent.",
      });
    } catch (error) {
      console.error("[industrial] RFQ draft preparation failed", error);
      return res.status(500).json({
        ok: false,
        message: "The RFQ drafts could not be prepared.",
      });
    }
  },
);

router.post(
  "/admin/requirements/:requirementId/supplier-quotes",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }
    const parsed = industrialSupplierQuoteCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A human-reviewed supplier quotation is required.",
        issues: parsed.error.flatten(),
      });
    }
    const validUntil = parseOptionalDate(parsed.data.validUntil);
    if (parsed.data.validUntil && !validUntil) {
      return res.status(400).json({
        ok: false,
        message: "The supplier quotation validity date is invalid.",
      });
    }

    try {
      const [requirement, productRequirement, matchRow] = await Promise.all([
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        db.query.industrialProductRequirements.findFirst({
          where: and(
            eq(industrialProductRequirements.requirementId, requirementId),
            eq(industrialProductRequirements.tenantId, tenant.id),
          ),
        }),
        db
          .select({
            match: industrialRequirementSupplierMatches,
            supplier: industrialSupplierProfiles,
          })
          .from(industrialRequirementSupplierMatches)
          .innerJoin(
            industrialSupplierProfiles,
            and(
              eq(
                industrialRequirementSupplierMatches.supplierProfileId,
                industrialSupplierProfiles.id,
              ),
              eq(
                industrialRequirementSupplierMatches.tenantId,
                industrialSupplierProfiles.tenantId,
              ),
            ),
          )
          .where(
            and(
              eq(
                industrialRequirementSupplierMatches.id,
                parsed.data.supplierMatchId,
              ),
              eq(
                industrialRequirementSupplierMatches.requirementId,
                requirementId,
              ),
              eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
            ),
          )
          .limit(1),
      ]);
      if (!requirement) {
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      }
      const matched = matchRow[0];
      if (!matched || !isSupplierEligibleForCapabilityMatching(matched.supplier)) {
        return res.status(409).json({
          ok: false,
          message: "The supplier match is unavailable or no longer eligible.",
        });
      }

      const now = new Date();
      const actorUserId = actorIdFor(req);
      const [quote] = await db
        .insert(industrialSupplierQuotes)
        .values({
          tenantId: tenant.id,
          requirementId: requirement.id,
          supplierProfileId: matched.supplier.id,
          supplierMatchId: matched.match.id,
          referenceCode: makeReference("SQ"),
          product:
            parsed.data.product ||
            productRequirement?.productName ||
            requirement.title,
          specification:
            parsed.data.specification ??
            productRequirement?.specification ??
            null,
          quantityText:
            parsed.data.quantityText ??
            productRequirement?.quantityText ??
            requirement.quantityText ??
            null,
          unit: parsed.data.unit ?? productRequirement?.unit ?? null,
          unitPrice:
            parsed.data.unitPrice == null
              ? null
              : String(parsed.data.unitPrice),
          totalCost: String(parsed.data.totalCost),
          currencyCode: parsed.data.currencyCode,
          incoterm:
            parsed.data.incoterm ?? productRequirement?.incoterm ?? null,
          origin: parsed.data.origin ?? productRequirement?.origin ?? null,
          destination:
            parsed.data.destination ??
            productRequirement?.destination ??
            ([requirement.deliveryCity, requirement.deliveryCountryCode]
              .filter(Boolean)
              .join(", ") || null),
          packaging: parsed.data.packaging || null,
          minimumOrderQuantity: parsed.data.minimumOrderQuantity || null,
          leadTimeDays: parsed.data.leadTimeDays ?? null,
          paymentTerms: parsed.data.paymentTerms || null,
          validUntil,
          certifications: parsed.data.certifications,
          sourceChannel: parsed.data.sourceChannel,
          rawSourceText: parsed.data.sourceText,
          status: "reviewed",
          internalNotes: parsed.data.internalNotes || null,
          createdByUserId: actorUserId,
          receivedAt: now,
          reviewedAt: now,
          updatedAt: now,
        })
        .returning();

      await Promise.all([
        db
          .update(industrialRequirementSupplierMatches)
          .set({ status: "shortlisted", updatedAt: now })
          .where(
            and(
              eq(
                industrialRequirementSupplierMatches.id,
                matched.match.id,
              ),
              eq(industrialRequirementSupplierMatches.tenantId, tenant.id),
            ),
          ),
        db
          .update(industrialRequirements)
          .set({
            status: "quote_preparation",
            nextAction:
              "Review supplier costs and prepare the internal commercial offer.",
            nextActionAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialRequirements.id, requirement.id),
              eq(industrialRequirements.tenantId, tenant.id),
            ),
          ),
      ]);
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_supplier_quote.reviewed_recorded",
        entityType: "industrial_supplier_quote",
        entityId: quote.id,
        reason: "A human reviewed and recorded the supplier source evidence.",
        nextValue: {
          status: quote.status,
          supplierProfileId: quote.supplierProfileId,
          referenceCode: quote.referenceCode,
        },
        metadata: {
          requirementId: requirement.id,
          internalOnly: true,
          customerVisible: false,
        },
      });

      return res.status(201).json({
        ok: true,
        supplierQuote: staffSupplierQuoteSummary(quote, matched.supplier),
      });
    } catch (error) {
      console.error("[industrial] supplier quote capture failed", error);
      return res.status(500).json({
        ok: false,
        message: "The supplier quotation could not be recorded.",
      });
    }
  },
);

router.post(
  "/admin/requirements/:requirementId/commercial-offers",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }
    const parsed = industrialCommercialOfferCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid internal commercial offer is required.",
        issues: parsed.error.flatten(),
      });
    }
    const offerValidUntil = parseOptionalDate(parsed.data.offerValidUntil);
    if (parsed.data.offerValidUntil && !offerValidUntil) {
      return res.status(400).json({
        ok: false,
        message: "The commercial offer validity date is invalid.",
      });
    }

    try {
      const uniqueQuoteIds = Array.from(new Set(parsed.data.supplierQuoteIds));
      const [requirement, supplierQuotes, existingOffers] = await Promise.all([
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        db
          .select()
          .from(industrialSupplierQuotes)
          .where(
            and(
              eq(industrialSupplierQuotes.tenantId, tenant.id),
              eq(industrialSupplierQuotes.requirementId, requirementId),
              inArray(industrialSupplierQuotes.id, uniqueQuoteIds),
            ),
          ),
        db
          .select({ version: industrialCommercialOffers.version })
          .from(industrialCommercialOffers)
          .where(
            and(
              eq(industrialCommercialOffers.tenantId, tenant.id),
              eq(industrialCommercialOffers.requirementId, requirementId),
            ),
          )
          .orderBy(desc(industrialCommercialOffers.version))
          .limit(1),
      ]);
      if (!requirement) {
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      }
      if (supplierQuotes.length !== uniqueQuoteIds.length) {
        return res.status(409).json({
          ok: false,
          message: "One or more supplier quotations are unavailable.",
        });
      }
      if (supplierQuotes.some((quote) => quote.status !== "reviewed")) {
        return res.status(409).json({
          ok: false,
          message: "Only human-reviewed supplier quotations can be priced.",
        });
      }
      if (
        supplierQuotes.some(
          (quote) => quote.currencyCode !== parsed.data.currencyCode,
        )
      ) {
        return res.status(409).json({
          ok: false,
          message:
            "Supplier quotation currencies must match the commercial offer currency.",
        });
      }

      let pricing;
      try {
        pricing = calculateIndustrialCommercialPricing({
          supplierCosts: supplierQuotes.map((quote) => Number(quote.totalCost)),
          additionalCosts: parsed.data.additionalCosts,
          customerPrice: parsed.data.customerPrice,
        });
      } catch (error: any) {
        return res.status(400).json({
          ok: false,
          message:
            String(error?.message || "").trim() ||
            "The internal pricing calculation is invalid.",
        });
      }

      const now = new Date();
      const actorUserId = actorIdFor(req);
      const version = Number(existingOffers[0]?.version || 0) + 1;
      const [offer] = await db
        .insert(industrialCommercialOffers)
        .values({
          tenantId: tenant.id,
          requirementId: requirement.id,
          customerContactId: requirement.customerContactId || null,
          referenceCode: makeReference("CO"),
          version,
          supplierQuoteIds: uniqueQuoteIds,
          costStack: pricing.costStack,
          totalCost: pricing.totalCost.toFixed(2),
          internalMargin: pricing.internalMargin.toFixed(2),
          marginPercent: pricing.marginPercent.toFixed(3),
          customerPrice: pricing.customerPrice.toFixed(2),
          currencyCode: parsed.data.currencyCode,
          incoterm: parsed.data.incoterm || null,
          deliveryEstimate: parsed.data.deliveryEstimate || null,
          paymentTerms: parsed.data.paymentTerms || null,
          offerValidUntil,
          terms: parsed.data.terms || null,
          status: "draft",
          pricingPolicy: {
            calculatedServerSide: true,
            supplierQuoteCount: uniqueQuoteIds.length,
            supplyPlanMode:
              uniqueQuoteIds.length > 1
                ? "combined_supplier_plan"
                : "single_supplier_quote",
            additionalCostLabels: Object.keys(parsed.data.additionalCosts),
            approvalRequired: true,
          },
          createdByUserId: actorUserId,
          updatedAt: now,
        })
        .returning();
      await db
        .update(industrialRequirements)
        .set({
          status: "quote_preparation",
          nextAction:
            "A tenant administrator must approve the internal price before a customer quote is created.",
          nextActionAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialRequirements.id, requirement.id),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        );
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_commercial_offer.draft_created",
        entityType: "industrial_commercial_offer",
        entityId: offer.id,
        reason:
          "The internal commercial price was calculated from reviewed supplier evidence.",
        nextValue: {
          status: offer.status,
          version: offer.version,
          referenceCode: offer.referenceCode,
        },
        metadata: {
          requirementId: requirement.id,
          supplierQuoteIds: uniqueQuoteIds,
          internalOnly: true,
          customerQuoteCreated: false,
        },
      });
      return res.status(201).json({
        ok: true,
        commercialOffer: staffCommercialOfferSummary(offer),
      });
    } catch (error) {
      console.error("[industrial] commercial offer creation failed", error);
      return res.status(500).json({
        ok: false,
        message: "The internal commercial offer could not be prepared.",
      });
    }
  },
);

router.post(
  "/admin/commercial-offers/:offerId/approve",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const offerId = String(req.params?.offerId || "").trim();
    if (!z.string().uuid().safeParse(offerId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid commercial offer identifier.",
      });
    }
    const parsed = industrialCommercialOfferApprovalSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Human approval and a reason are required.",
        issues: parsed.error.flatten(),
      });
    }
    try {
      const existing = await db.query.industrialCommercialOffers.findFirst({
        where: and(
          eq(industrialCommercialOffers.id, offerId),
          eq(industrialCommercialOffers.tenantId, tenant.id),
        ),
      });
      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: "Internal commercial offer not found.",
        });
      }
      if (!['draft', 'under_review'].includes(existing.status)) {
        return res.status(409).json({
          ok: false,
          message: "Only a draft or reviewed internal offer can be approved.",
        });
      }
      const now = new Date();
      const actorUserId = actorIdFor(req, "adminUser");
      const [offer] = await db
        .update(industrialCommercialOffers)
        .set({
          status: "approved",
          approvedByUserId: actorUserId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialCommercialOffers.id, existing.id),
            eq(industrialCommercialOffers.tenantId, tenant.id),
          ),
        )
        .returning();
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_commercial_offer.approved",
        entityType: "industrial_commercial_offer",
        entityId: offer.id,
        reason: parsed.data.reason,
        previousValue: { status: existing.status },
        nextValue: { status: offer.status, approvedAt: offer.approvedAt },
        metadata: {
          requirementId: offer.requirementId,
          humanApproved: true,
        },
      });
      return res.json({
        ok: true,
        commercialOffer: staffCommercialOfferSummary(offer),
      });
    } catch (error) {
      console.error("[industrial] commercial offer approval failed", error);
      return res.status(500).json({
        ok: false,
        message: "The internal commercial offer could not be approved.",
      });
    }
  },
);

router.post(
  "/admin/commercial-offers/:offerId/customer-quote",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const offerId = String(req.params?.offerId || "").trim();
    if (!z.string().uuid().safeParse(offerId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid commercial offer identifier.",
      });
    }
    try {
      const [offer, existingQuote] = await Promise.all([
        db.query.industrialCommercialOffers.findFirst({
          where: and(
            eq(industrialCommercialOffers.id, offerId),
            eq(industrialCommercialOffers.tenantId, tenant.id),
          ),
        }),
        db.query.industrialQuotes.findFirst({
          where: and(
            eq(industrialQuotes.commercialOfferId, offerId),
            eq(industrialQuotes.tenantId, tenant.id),
          ),
        }),
      ]);
      if (!offer) {
        return res.status(404).json({
          ok: false,
          message: "Internal commercial offer not found.",
        });
      }
      if (offer.status !== "approved" || !offer.approvedAt) {
        return res.status(409).json({
          ok: false,
          message:
            "The internal commercial offer must be human-approved first.",
        });
      }
      if (existingQuote) {
        return res.status(409).json({
          ok: false,
          message: "This internal offer already has a customer quotation.",
          quoteId: existingQuote.id,
        });
      }
      const [requirement, productRequirement] = await Promise.all([
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, offer.requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        db.query.industrialProductRequirements.findFirst({
          where: and(
            eq(
              industrialProductRequirements.requirementId,
              offer.requirementId,
            ),
            eq(industrialProductRequirements.tenantId, tenant.id),
          ),
        }),
      ]);
      if (!requirement) {
        return res.status(409).json({
          ok: false,
          message: "The source industrial requirement is unavailable.",
        });
      }
      const customerPrice = Number(offer.customerPrice);
      const lineItems = buildCustomerQuoteSnapshot({
        product: productRequirement?.productName || requirement.title,
        specification: productRequirement?.specification,
        quantity:
          productRequirement?.quantityText || requirement.quantityText,
        unit: productRequirement?.unit,
        customerPrice,
      });
      const commercialTerms = [
        offer.incoterm ? `Incoterm: ${offer.incoterm}` : null,
        offer.paymentTerms ? `Payment terms: ${offer.paymentTerms}` : null,
        offer.terms,
      ]
        .filter(Boolean)
        .join("\n");
      const now = new Date();
      const actorUserId = actorIdFor(req);
      const [quote] = await db
        .insert(industrialQuotes)
        .values({
          tenantId: tenant.id,
          requirementId: requirement.id,
          requirementMatchId: null,
          factoryId: null,
          catalogItemId: null,
          commercialOfferId: offer.id,
          referenceCode: makeReference("QT"),
          status: "draft",
          currencyCode: offer.currencyCode,
          totalAmount: offer.customerPrice,
          lineItems,
          leadTimeText: offer.deliveryEstimate,
          validUntil: offer.offerValidUntil,
          commercialTerms: commercialTerms || null,
          customerNotes: null,
          internalNotes: `Generated from approved internal commercial offer ${offer.referenceCode}.`,
          visibility: "parties_to_transaction",
          createdByUserId: actorUserId,
          updatedAt: now,
        })
        .returning();
      await db
        .update(industrialRequirements)
        .set({
          status: "quote_preparation",
          nextAction:
            "Review the sanitized customer quotation, then move it through account-manager approval before issue.",
          nextActionAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialRequirements.id, requirement.id),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        );
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_quote.created_from_approved_offer",
        entityType: "industrial_quote",
        entityId: quote.id,
        reason:
          "A customer quotation was generated from a human-approved internal commercial offer.",
        nextValue: {
          status: quote.status,
          referenceCode: quote.referenceCode,
          commercialOfferId: offer.id,
        },
        metadata: {
          requirementId: requirement.id,
          supplierCostsExcluded: true,
          marginExcluded: true,
        },
      });
      return res.status(201).json({
        ok: true,
        quote: staffQuoteSummary(quote, requirement),
      });
    } catch (error) {
      console.error("[industrial] customer quote conversion failed", error);
      return res.status(500).json({
        ok: false,
        message: "The customer quotation could not be created.",
      });
    }
  },
);

router.get("/admin/quotes", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const statusFilter = z
    .enum(QUOTE_STATUSES)
    .safeParse(String(req.query?.status || "").trim());
  try {
    const rows = await db
      .select({
        quote: industrialQuotes,
        requirement: industrialRequirements,
        factory: industrialFactories,
        item: industrialCatalogItems,
      })
      .from(industrialQuotes)
      .innerJoin(
        industrialRequirements,
        and(
          eq(industrialQuotes.requirementId, industrialRequirements.id),
          eq(industrialQuotes.tenantId, industrialRequirements.tenantId),
        ),
      )
      .leftJoin(
        industrialFactories,
        and(
          eq(industrialQuotes.factoryId, industrialFactories.id),
          eq(industrialQuotes.tenantId, industrialFactories.tenantId),
        ),
      )
      .leftJoin(
        industrialCatalogItems,
        and(
          eq(industrialQuotes.catalogItemId, industrialCatalogItems.id),
          eq(industrialQuotes.tenantId, industrialCatalogItems.tenantId),
        ),
      )
      .where(
        and(
          eq(industrialQuotes.tenantId, tenant.id),
          statusFilter.success
            ? eq(industrialQuotes.status, statusFilter.data)
            : undefined,
        ),
      )
      .orderBy(
        desc(industrialQuotes.updatedAt),
        desc(industrialQuotes.createdAt),
      )
      .limit(safeLimit(req.query?.limit, 100));

    return res.json({
      ok: true,
      quotes: rows.map((row) =>
        staffQuoteSummary(row.quote, row.requirement, row.factory, row.item),
      ),
      total: rows.length,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The industrial quotation queue is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/quotes/:quoteId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const quoteId = String(req.params?.quoteId || "").trim();
    if (!z.string().uuid().safeParse(quoteId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid quotation identifier." });
    }
    try {
      const quote = await db.query.industrialQuotes.findFirst({
        where: and(
          eq(industrialQuotes.id, quoteId),
          eq(industrialQuotes.tenantId, tenant.id),
        ),
      });
      if (!quote)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial quotation not found." });
      const [requirement, factory, catalogItem, audit] = await Promise.all([
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, quote.requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        quote.factoryId
          ? db.query.industrialFactories.findFirst({
              where: and(
                eq(industrialFactories.id, quote.factoryId),
                eq(industrialFactories.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
        quote.catalogItemId
          ? db.query.industrialCatalogItems.findFirst({
              where: and(
                eq(industrialCatalogItems.id, quote.catalogItemId),
                eq(industrialCatalogItems.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
        db
          .select()
          .from(industrialAuditLogs)
          .where(
            and(
              eq(industrialAuditLogs.tenantId, tenant.id),
              eq(industrialAuditLogs.entityType, "industrial_quote"),
              eq(industrialAuditLogs.entityId, quote.id),
            ),
          )
          .orderBy(desc(industrialAuditLogs.createdAt))
          .limit(30),
      ]);
      return res.json({
        ok: true,
        quote: staffQuoteSummary(quote, requirement, factory, catalogItem),
        audit,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The industrial quotation is temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/admin/requirements/:requirementId/quotes",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }
    const parsed = industrialQuoteCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid quotation draft is required.",
        issues: parsed.error.flatten(),
      });
    }
    const validUntil = parseOptionalDate(parsed.data.validUntil);
    if (parsed.data.validUntil && !validUntil) {
      return res.status(400).json({
        ok: false,
        message: "The quotation validity date is not valid.",
      });
    }

    try {
      const [requirement, match] = await Promise.all([
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        db.query.industrialRequirementMatches.findFirst({
          where: and(
            eq(industrialRequirementMatches.id, parsed.data.requirementMatchId),
            eq(industrialRequirementMatches.requirementId, requirementId),
            eq(industrialRequirementMatches.tenantId, tenant.id),
          ),
        }),
      ]);
      if (!requirement)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      if (!match || match.status !== "selected") {
        return res.status(400).json({
          ok: false,
          message:
            "Select a verified catalog match before preparing a quotation.",
        });
      }
      const [catalogItem, factory] = await Promise.all([
        db.query.industrialCatalogItems.findFirst({
          where: and(
            eq(industrialCatalogItems.id, match.catalogItemId),
            eq(industrialCatalogItems.tenantId, tenant.id),
          ),
        }),
        db.query.industrialFactories.findFirst({
          where: and(
            eq(industrialFactories.id, match.factoryId),
            eq(industrialFactories.tenantId, tenant.id),
          ),
        }),
      ]);
      if (!catalogItem || !factory)
        return res.status(400).json({
          ok: false,
          message: "The selected match is no longer available.",
        });

      const lineItems = parsed.data.lineItems.map((line) =>
        Object.entries(line).reduce<Record<string, string>>(
          (output, [key, value]) => {
            if (typeof value === "string" && value.trim().length > 0)
              output[key] = value;
            return output;
          },
          {},
        ),
      );
      const now = new Date();
      const actorUserId = actorIdFor(req);
      const [quote] = await db
        .insert(industrialQuotes)
        .values({
          tenantId: tenant.id,
          requirementId: requirement.id,
          requirementMatchId: match.id,
          factoryId: factory.id,
          catalogItemId: catalogItem.id,
          referenceCode: makeReference("QT"),
          status: "draft",
          currencyCode: parsed.data.currencyCode,
          totalAmount:
            parsed.data.totalAmount === null ||
            parsed.data.totalAmount === undefined
              ? null
              : String(parsed.data.totalAmount),
          lineItems,
          leadTimeText: parsed.data.leadTimeText || null,
          validUntil,
          commercialTerms: parsed.data.commercialTerms || null,
          customerNotes: parsed.data.customerNotes || null,
          internalNotes: parsed.data.internalNotes || null,
          visibility: "parties_to_transaction",
          createdByUserId: actorUserId,
        })
        .returning();

      if (!["closed", "cancelled"].includes(requirement.status)) {
        await db
          .update(industrialRequirements)
          .set({ status: "quote_preparation", updatedAt: now })
          .where(
            and(
              eq(industrialRequirements.id, requirement.id),
              eq(industrialRequirements.tenantId, tenant.id),
            ),
          );
      }
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_quote.draft_created",
        entityType: "industrial_quote",
        entityId: quote.id,
        nextValue: {
          status: quote.status,
          requirementId: requirement.id,
          matchId: match.id,
        },
        metadata: {
          referenceCode: quote.referenceCode,
          factoryId: factory.id,
          catalogItemId: catalogItem.id,
        },
      });

      return res.status(201).json({
        ok: true,
        quote: staffQuoteSummary(quote, requirement, factory, catalogItem),
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The industrial quotation draft could not be saved.",
      });
    }
  },
);

router.post(
  "/admin/quotes/:quoteId/status",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const quoteId = String(req.params?.quoteId || "").trim();
    if (!z.string().uuid().safeParse(quoteId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid quotation identifier." });
    }
    const parsed = industrialQuoteStatusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid quotation status and note are required.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const quote = await db.query.industrialQuotes.findFirst({
        where: and(
          eq(industrialQuotes.id, quoteId),
          eq(industrialQuotes.tenantId, tenant.id),
        ),
      });
      if (!quote)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial quotation not found." });
      if (
        !canTransitionIndustrialQuote(
          quote.status as any,
          parsed.data.status as any,
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "This quotation cannot move to the requested status from its current state.",
        });
      }
      const hasLineItems =
        Array.isArray(quote.lineItems) && quote.lineItems.length > 0;
      if (
        parsed.data.status === "issued" &&
        quote.totalAmount === null &&
        !hasLineItems
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Record a price or at least one quotation line before marking a quotation as issued.",
        });
      }

      const now = new Date();
      const actorUserId = actorIdFor(req);
      const [updated] = await db
        .update(industrialQuotes)
        .set({
          status: parsed.data.status,
          customerNotes:
            parsed.data.customerNotes === undefined
              ? quote.customerNotes
              : parsed.data.customerNotes || null,
          internalNotes:
            parsed.data.internalNotes === undefined
              ? quote.internalNotes
              : parsed.data.internalNotes || null,
          issuedByUserId:
            parsed.data.status === "issued"
              ? actorUserId
              : quote.issuedByUserId,
          issuedAt: parsed.data.status === "issued" ? now : quote.issuedAt,
          respondedAt: ["accepted", "declined"].includes(parsed.data.status)
            ? now
            : quote.respondedAt,
          closedAt: ["accepted", "cancelled", "expired"].includes(
            parsed.data.status,
          )
            ? now
            : quote.closedAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialQuotes.id, quote.id),
            eq(industrialQuotes.tenantId, tenant.id),
          ),
        )
        .returning();

      const requirement = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, quote.requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (requirement) {
        const metadata = safeRecord(requirement.metadata);
        const workflow = safeRecord(metadata.internalWorkflow);
        const requirementUpdate =
          parsed.data.status === "issued"
            ? {
                status: "quoted" as const,
                nextAction:
                  "Record account-manager follow-up after presenting the quotation.",
              }
            : parsed.data.status === "accepted"
              ? {
                  status: "closed" as const,
                  nextAction:
                    "Create the order only after the accepted quotation is confirmed.",
                }
              : parsed.data.status === "declined"
                ? {
                    status: "supplier_matching" as const,
                    nextAction:
                      "Select an alternative supplier or close the requirement.",
                  }
                : null;
        if (requirementUpdate) {
          await db
            .update(industrialRequirements)
            .set({
              status: requirementUpdate.status,
              metadata: {
                ...metadata,
                internalWorkflow: {
                  ...workflow,
                  nextAction: requirementUpdate.nextAction,
                  quoteStatus: updated.status,
                  quoteReferenceCode: updated.referenceCode,
                  commercialPhase: null,
                  closureOutcome: null,
                  lastReviewedAt: now.toISOString(),
                  lastReviewedByUserId: actorUserId,
                },
              },
              updatedAt: now,
            })
            .where(
              and(
                eq(industrialRequirements.id, requirement.id),
                eq(industrialRequirements.tenantId, tenant.id),
              ),
            );
        }
      }

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_quote.status_updated",
        entityType: "industrial_quote",
        entityId: updated.id,
        reason: parsed.data.reason,
        previousValue: { status: quote.status },
        nextValue: {
          status: updated.status,
          issuedAt: updated.issuedAt,
          respondedAt: updated.respondedAt,
        },
        metadata: {
          referenceCode: updated.referenceCode,
          requirementId: updated.requirementId,
        },
      });

      const [factory, catalogItem] = await Promise.all([
        updated.factoryId
          ? db.query.industrialFactories.findFirst({
              where: and(
                eq(industrialFactories.id, updated.factoryId),
                eq(industrialFactories.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
        updated.catalogItemId
          ? db.query.industrialCatalogItems.findFirst({
              where: and(
                eq(industrialCatalogItems.id, updated.catalogItemId),
                eq(industrialCatalogItems.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
      ]);
      return res.json({
        ok: true,
        quote: staffQuoteSummary(updated, requirement, factory, catalogItem),
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The industrial quotation status could not be updated.",
      });
    }
  },
);

router.post(
  "/admin/quotes/:quoteId/orders",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const quoteId = String(req.params?.quoteId || "").trim();
    if (!z.string().uuid().safeParse(quoteId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid quotation identifier." });
    }
    const parsed = industrialOrderCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message:
          "A human confirmation and a documented reason are required before creating an industrial order.",
        issues: parsed.error.flatten(),
      });
    }
    const plannedDeliveryAt = parseOptionalDate(
      parsed.data.plannedDeliveryAt || null,
    );
    if (parsed.data.plannedDeliveryAt && !plannedDeliveryAt) {
      return res.status(400).json({
        ok: false,
        message: "The planned delivery date is not valid.",
      });
    }

    try {
      const [quote, existingOrder] = await Promise.all([
        db.query.industrialQuotes.findFirst({
          where: and(
            eq(industrialQuotes.id, quoteId),
            eq(industrialQuotes.tenantId, tenant.id),
          ),
        }),
        db.query.industrialOrders.findFirst({
          where: and(
            eq(industrialOrders.quoteId, quoteId),
            eq(industrialOrders.tenantId, tenant.id),
          ),
        }),
      ]);
      if (!quote)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial quotation not found." });
      if (quote.status !== "accepted") {
        return res.status(400).json({
          ok: false,
          message:
            "Only a recorded accepted quotation can be converted into an industrial order.",
        });
      }
      if (existingOrder) {
        return res.status(409).json({
          ok: false,
          message:
            "This accepted quotation already has a tracked industrial order.",
          orderId: existingOrder.id,
        });
      }

      const [requirement, factory, catalogItem] = await Promise.all([
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, quote.requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        quote.factoryId
          ? db.query.industrialFactories.findFirst({
              where: and(
                eq(industrialFactories.id, quote.factoryId),
                eq(industrialFactories.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
        quote.catalogItemId
          ? db.query.industrialCatalogItems.findFirst({
              where: and(
                eq(industrialCatalogItems.id, quote.catalogItemId),
                eq(industrialCatalogItems.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
      ]);
      if (!requirement)
        return res.status(409).json({
          ok: false,
          message: "The source industrial requirement is no longer available.",
        });

      const now = new Date();
      const actorUserId = actorIdFor(req);
      const [order] = await db
        .insert(industrialOrders)
        .values({
          tenantId: tenant.id,
          quoteId: quote.id,
          requirementId: quote.requirementId,
          factoryId: quote.factoryId,
          catalogItemId: quote.catalogItemId,
          referenceCode: makeReference("ORD"),
          status: "confirmed",
          currencyCode: quote.currencyCode,
          totalAmount:
            quote.totalAmount === null || quote.totalAmount === undefined
              ? null
              : String(quote.totalAmount),
          lineItems: Array.isArray(quote.lineItems) ? quote.lineItems : [],
          commercialTerms: quote.commercialTerms,
          internalNotes: parsed.data.confirmationNote,
          sourceQuoteSnapshot: {
            quoteReferenceCode: quote.referenceCode,
            quoteStatus: quote.status,
            totalAmount:
              quote.totalAmount === null || quote.totalAmount === undefined
                ? null
                : String(quote.totalAmount),
            currencyCode: quote.currencyCode,
            leadTimeText: quote.leadTimeText,
            validUntil: quote.validUntil
              ? new Date(quote.validUntil).toISOString()
              : null,
            issuedAt: quote.issuedAt
              ? new Date(quote.issuedAt).toISOString()
              : null,
            acceptedAt: quote.respondedAt
              ? new Date(quote.respondedAt).toISOString()
              : null,
          },
          visibility: "parties_to_transaction",
          confirmedByUserId: actorUserId,
          confirmedAt: now,
          plannedDeliveryAt,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        })
        .onConflictDoNothing({
          target: [industrialOrders.tenantId, industrialOrders.quoteId],
        })
        .returning();

      if (!order) {
        return res.status(409).json({
          ok: false,
          message:
            "This accepted quotation already has a tracked industrial order.",
        });
      }
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_order.confirmed_from_accepted_quote",
        entityType: "industrial_order",
        entityId: order.id,
        reason: parsed.data.confirmationNote,
        nextValue: {
          status: order.status,
          quoteId: quote.id,
          requirementId: quote.requirementId,
        },
        metadata: {
          orderReferenceCode: order.referenceCode,
          quoteReferenceCode: quote.referenceCode,
          factoryId: quote.factoryId,
          catalogItemId: quote.catalogItemId,
        },
      });
      return res.status(201).json({
        ok: true,
        order: staffOrderSummary(
          order,
          quote,
          requirement,
          factory,
          catalogItem,
        ),
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The industrial order could not be created.",
      });
    }
  },
);

router.get("/admin/orders", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const statusFilter = z
    .enum(ORDER_STATUSES)
    .safeParse(String(req.query?.status || "").trim());
  const query = String(req.query?.q || "").trim();
  const like = `%${query}%`;
  try {
    const rows = await db
      .select({
        order: industrialOrders,
        quote: industrialQuotes,
        requirement: industrialRequirements,
        factory: industrialFactories,
        item: industrialCatalogItems,
      })
      .from(industrialOrders)
      .innerJoin(
        industrialQuotes,
        and(
          eq(industrialOrders.quoteId, industrialQuotes.id),
          eq(industrialOrders.tenantId, industrialQuotes.tenantId),
        ),
      )
      .innerJoin(
        industrialRequirements,
        and(
          eq(industrialOrders.requirementId, industrialRequirements.id),
          eq(industrialOrders.tenantId, industrialRequirements.tenantId),
        ),
      )
      .leftJoin(
        industrialFactories,
        and(
          eq(industrialOrders.factoryId, industrialFactories.id),
          eq(industrialOrders.tenantId, industrialFactories.tenantId),
        ),
      )
      .leftJoin(
        industrialCatalogItems,
        and(
          eq(industrialOrders.catalogItemId, industrialCatalogItems.id),
          eq(industrialOrders.tenantId, industrialCatalogItems.tenantId),
        ),
      )
      .where(
        and(
          eq(industrialOrders.tenantId, tenant.id),
          statusFilter.success
            ? eq(industrialOrders.status, statusFilter.data)
            : undefined,
          query
            ? or(
                ilike(industrialOrders.referenceCode, like),
                ilike(industrialQuotes.referenceCode, like),
                ilike(industrialRequirements.referenceCode, like),
                ilike(industrialRequirements.title, like),
                ilike(industrialFactories.displayName, like),
              )
            : undefined,
        ),
      )
      .orderBy(
        desc(industrialOrders.updatedAt),
        desc(industrialOrders.createdAt),
      )
      .limit(safeLimit(req.query?.limit, 100));
    return res.json({
      ok: true,
      orders: rows.map((row) =>
        staffOrderSummary(
          row.order,
          row.quote,
          row.requirement,
          row.factory,
          row.item,
        ),
      ),
      total: rows.length,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The industrial order queue is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/orders/:orderId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const orderId = String(req.params?.orderId || "").trim();
    if (!z.string().uuid().safeParse(orderId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid industrial order identifier." });
    }
    try {
      const order = await db.query.industrialOrders.findFirst({
        where: and(
          eq(industrialOrders.id, orderId),
          eq(industrialOrders.tenantId, tenant.id),
        ),
      });
      if (!order)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial order not found." });
      const [quote, requirement, factory, catalogItem, audit] =
        await Promise.all([
          db.query.industrialQuotes.findFirst({
            where: and(
              eq(industrialQuotes.id, order.quoteId),
              eq(industrialQuotes.tenantId, tenant.id),
            ),
          }),
          db.query.industrialRequirements.findFirst({
            where: and(
              eq(industrialRequirements.id, order.requirementId),
              eq(industrialRequirements.tenantId, tenant.id),
            ),
          }),
          order.factoryId
            ? db.query.industrialFactories.findFirst({
                where: and(
                  eq(industrialFactories.id, order.factoryId),
                  eq(industrialFactories.tenantId, tenant.id),
                ),
              })
            : Promise.resolve(null),
          order.catalogItemId
            ? db.query.industrialCatalogItems.findFirst({
                where: and(
                  eq(industrialCatalogItems.id, order.catalogItemId),
                  eq(industrialCatalogItems.tenantId, tenant.id),
                ),
              })
            : Promise.resolve(null),
          db
            .select()
            .from(industrialAuditLogs)
            .where(
              and(
                eq(industrialAuditLogs.tenantId, tenant.id),
                eq(industrialAuditLogs.entityType, "industrial_order"),
                eq(industrialAuditLogs.entityId, order.id),
              ),
            )
            .orderBy(desc(industrialAuditLogs.createdAt))
            .limit(30),
        ]);
      return res.json({
        ok: true,
        order: staffOrderSummary(
          order,
          quote,
          requirement,
          factory,
          catalogItem,
        ),
        audit,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The industrial order is temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/admin/orders/:orderId/status",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const orderId = String(req.params?.orderId || "").trim();
    if (!z.string().uuid().safeParse(orderId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid industrial order identifier." });
    }
    const parsed = industrialOrderStatusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid order status and documented reason are required.",
        issues: parsed.error.flatten(),
      });
    }
    const plannedDeliveryAt =
      parsed.data.plannedDeliveryAt === undefined
        ? undefined
        : parseOptionalDate(parsed.data.plannedDeliveryAt || null);
    if (parsed.data.plannedDeliveryAt && !plannedDeliveryAt) {
      return res.status(400).json({
        ok: false,
        message: "The planned delivery date is not valid.",
      });
    }

    try {
      const order = await db.query.industrialOrders.findFirst({
        where: and(
          eq(industrialOrders.id, orderId),
          eq(industrialOrders.tenantId, tenant.id),
        ),
      });
      if (!order)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial order not found." });
      if (
        !canTransitionIndustrialOrder(
          order.status as any,
          parsed.data.status as any,
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "This industrial order cannot move to the requested status from its current state.",
        });
      }

      const now = new Date();
      const actorUserId = actorIdFor(req);
      const [updated] = await db
        .update(industrialOrders)
        .set({
          status: parsed.data.status,
          ...(plannedDeliveryAt !== undefined ? { plannedDeliveryAt } : {}),
          ...(parsed.data.deliveryNotes !== undefined
            ? { deliveryNotes: parsed.data.deliveryNotes || null }
            : {}),
          ...(parsed.data.internalNotes !== undefined
            ? { internalNotes: parsed.data.internalNotes || null }
            : {}),
          completedAt:
            parsed.data.status === "completed" ? now : order.completedAt,
          cancelledAt:
            parsed.data.status === "cancelled" ? now : order.cancelledAt,
          updatedByUserId: actorUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialOrders.id, order.id),
            eq(industrialOrders.tenantId, tenant.id),
          ),
        )
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId,
        action: "industrial_order.status_updated",
        entityType: "industrial_order",
        entityId: updated.id,
        reason: parsed.data.reason,
        previousValue: { status: order.status },
        nextValue: {
          status: updated.status,
          plannedDeliveryAt: updated.plannedDeliveryAt,
        },
        metadata: {
          orderReferenceCode: updated.referenceCode,
          quoteId: updated.quoteId,
          requirementId: updated.requirementId,
        },
      });

      const [quote, requirement, factory, catalogItem] = await Promise.all([
        db.query.industrialQuotes.findFirst({
          where: and(
            eq(industrialQuotes.id, updated.quoteId),
            eq(industrialQuotes.tenantId, tenant.id),
          ),
        }),
        db.query.industrialRequirements.findFirst({
          where: and(
            eq(industrialRequirements.id, updated.requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        }),
        updated.factoryId
          ? db.query.industrialFactories.findFirst({
              where: and(
                eq(industrialFactories.id, updated.factoryId),
                eq(industrialFactories.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
        updated.catalogItemId
          ? db.query.industrialCatalogItems.findFirst({
              where: and(
                eq(industrialCatalogItems.id, updated.catalogItemId),
                eq(industrialCatalogItems.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
      ]);
      return res.json({
        ok: true,
        order: staffOrderSummary(
          updated,
          quote,
          requirement,
          factory,
          catalogItem,
        ),
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The industrial order could not be updated.",
      });
    }
  },
);

router.get("/admin/audit", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  try {
    const rows = await db
      .select()
      .from(industrialAuditLogs)
      .where(eq(industrialAuditLogs.tenantId, tenant.id))
      .orderBy(desc(industrialAuditLogs.createdAt))
      .limit(safeLimit(req.query?.limit, 80));

    return res.json({ ok: true, audit: rows });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The industrial audit trail is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/recurring-requirements",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const statusFilter = z
      .enum(RECURRING_REQUIREMENT_STATUSES)
      .safeParse(String(req.query?.status || "").trim());
    const query = String(req.query?.q || "").trim();
    const like = `%${query}%`;

    try {
      const rows = await db
        .select({
          requirement: industrialRecurringRequirements,
          factory: industrialFactories,
        })
        .from(industrialRecurringRequirements)
        .innerJoin(
          industrialFactories,
          eq(industrialRecurringRequirements.factoryId, industrialFactories.id),
        )
        .where(
          and(
            eq(industrialRecurringRequirements.tenantId, tenant.id),
            eq(industrialFactories.tenantId, tenant.id),
            statusFilter.success
              ? eq(industrialRecurringRequirements.status, statusFilter.data)
              : undefined,
            query
              ? or(
                  ilike(industrialRecurringRequirements.title, like),
                  ilike(
                    industrialRecurringRequirements.preferredSupplier,
                    like,
                  ),
                  ilike(industrialFactories.displayName, like),
                )
              : undefined,
          ),
        )
        .orderBy(
          asc(industrialRecurringRequirements.nextReviewAt),
          desc(industrialRecurringRequirements.updatedAt),
        )
        .limit(safeLimit(req.query?.limit, 100));

      return res.json({
        ok: true,
        recurringRequirements: rows.map((row) =>
          staffRecurringRequirementSummary(row.requirement, row.factory),
        ),
        total: rows.length,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The recurring procurement queue is temporarily unavailable.",
      });
    }
  },
);

router.get("/admin/challenges", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  const query = String(req.query?.q || "").trim();
  const statusFilter = z
    .enum(INDUSTRIAL_CHALLENGE_STATUSES)
    .safeParse(String(req.query?.status || "").trim());
  const limit = safeLimit(req.query?.limit, 100);
  const like = `%${query}%`;

  try {
    const rows = await db
      .select({
        challenge: industrialChallenges,
        factory: industrialFactories,
        requirement: industrialRequirements,
      })
      .from(industrialChallenges)
      .innerJoin(
        industrialFactories,
        and(
          eq(industrialChallenges.factoryId, industrialFactories.id),
          eq(industrialChallenges.tenantId, industrialFactories.tenantId),
        ),
      )
      .innerJoin(
        industrialRequirements,
        and(
          eq(industrialChallenges.requirementId, industrialRequirements.id),
          eq(industrialChallenges.tenantId, industrialRequirements.tenantId),
        ),
      )
      .where(
        and(
          eq(industrialChallenges.tenantId, tenant.id),
          statusFilter.success
            ? eq(industrialChallenges.status, statusFilter.data)
            : undefined,
          query
            ? or(
                ilike(industrialChallenges.title, like),
                ilike(industrialChallenges.groupKey, like),
                ilike(industrialFactories.displayName, like),
                ilike(industrialRequirements.referenceCode, like),
              )
            : undefined,
        ),
      )
      .orderBy(
        desc(industrialChallenges.productionStopped),
        desc(industrialChallenges.updatedAt),
      )
      .limit(limit);

    return res.json({
      ok: true,
      challenges: rows.map((row) =>
        staffIndustrialChallengeSummary(
          row.challenge,
          row.factory,
          row.requirement,
        ),
      ),
      total: rows.length,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The industrial challenge queue is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/challenges/:challengeId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const challengeId = String(req.params?.challengeId || "").trim();
    if (!z.string().uuid().safeParse(challengeId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial challenge identifier.",
      });
    }

    try {
      const [row] = await db
        .select({
          challenge: industrialChallenges,
          factory: industrialFactories,
          requirement: industrialRequirements,
        })
        .from(industrialChallenges)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialChallenges.factoryId, industrialFactories.id),
            eq(industrialChallenges.tenantId, industrialFactories.tenantId),
          ),
        )
        .innerJoin(
          industrialRequirements,
          and(
            eq(industrialChallenges.requirementId, industrialRequirements.id),
            eq(industrialChallenges.tenantId, industrialRequirements.tenantId),
          ),
        )
        .where(
          and(
            eq(industrialChallenges.id, challengeId),
            eq(industrialChallenges.tenantId, tenant.id),
          ),
        )
        .limit(1);
      if (!row) {
        return res
          .status(404)
          .json({ ok: false, message: "Industrial challenge not found." });
      }

      const [attachments, audit] = await Promise.all([
        db
          .select()
          .from(industrialRequirementAttachments)
          .where(
            and(
              eq(industrialRequirementAttachments.tenantId, tenant.id),
              eq(
                industrialRequirementAttachments.requirementId,
                row.requirement.id,
              ),
            ),
          )
          .orderBy(desc(industrialRequirementAttachments.createdAt)),
        db
          .select()
          .from(industrialAuditLogs)
          .where(
            and(
              eq(industrialAuditLogs.tenantId, tenant.id),
              eq(industrialAuditLogs.entityType, "industrial_challenge"),
              eq(industrialAuditLogs.entityId, row.challenge.id),
            ),
          )
          .orderBy(desc(industrialAuditLogs.createdAt))
          .limit(40),
      ]);

      return res.json({
        ok: true,
        challenge: {
          ...staffIndustrialChallengeSummary(
            row.challenge,
            row.factory,
            row.requirement,
          ),
          attachmentCount: attachments.length,
          attachments: attachments.map(industrialRequirementAttachmentSummary),
          allowedNextStatuses: nextIndustrialChallengeStatuses(
            row.challenge.status,
          ),
          requirement: {
            ...staffRequirementSummary(row.requirement),
            details: row.requirement.details,
            metadata: row.requirement.metadata,
          },
        },
        factory: staffFactorySummary(row.factory),
        audit,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The industrial challenge is temporarily unavailable.",
      });
    }
  },
);

router.patch(
  "/admin/challenges/:challengeId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const challengeId = String(req.params?.challengeId || "").trim();
    if (!z.string().uuid().safeParse(challengeId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial challenge identifier.",
      });
    }
    const parsed = industrialChallengeUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Provide a valid industrial challenge review update.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const [existingRow] = await db
        .select({
          challenge: industrialChallenges,
          factory: industrialFactories,
          requirement: industrialRequirements,
        })
        .from(industrialChallenges)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialChallenges.factoryId, industrialFactories.id),
            eq(industrialChallenges.tenantId, industrialFactories.tenantId),
          ),
        )
        .innerJoin(
          industrialRequirements,
          and(
            eq(industrialChallenges.requirementId, industrialRequirements.id),
            eq(industrialChallenges.tenantId, industrialRequirements.tenantId),
          ),
        )
        .where(
          and(
            eq(industrialChallenges.id, challengeId),
            eq(industrialChallenges.tenantId, tenant.id),
          ),
        )
        .limit(1);
      if (!existingRow) {
        return res
          .status(404)
          .json({ ok: false, message: "Industrial challenge not found." });
      }

      const currentStatus = existingRow.challenge.status;
      const nextStatus = parsed.data.status || currentStatus;
      if (
        parsed.data.status &&
        !canTransitionIndustrialChallenge(currentStatus, nextStatus)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "This industrial challenge cannot be moved to that status from its current stage.",
        });
      }

      const actorUserId = actorIdFor(req, "staffUser");
      const now = new Date();
      const finalStatus = ["resolved", "declined", "closed"].includes(
        nextStatus,
      );
      const desiredOutcome =
        parsed.data.outcome ||
        (nextStatus === "declined"
          ? "declined"
          : existingRow.challenge.desiredOutcome);
      const reviewNote =
        parsed.data.reviewNote === undefined
          ? existingRow.challenge.triageNotes
          : optionalText(parsed.data.reviewNote);
      const groupKey =
        parsed.data.groupKey === undefined
          ? existingRow.challenge.groupKey
          : optionalText(parsed.data.groupKey);
      const assignedStaffUserId = parsed.data.assignToSelf
        ? actorUserId || null
        : existingRow.challenge.assignedStaffUserId;
      const shouldUpdateRequirement =
        parsed.data.status !== undefined &&
        requirementStatusForIndustrialChallenge(nextStatus) !==
          existingRow.requirement.status;

      const updated = await db.transaction(async (tx) => {
        const [challenge] = await tx
          .update(industrialChallenges)
          .set({
            status: nextStatus,
            desiredOutcome,
            assignedStaffUserId,
            reviewedByUserId: actorUserId || null,
            triageNotes: reviewNote,
            groupKey,
            resolutionNotes: finalStatus
              ? reviewNote || existingRow.challenge.resolutionNotes
              : existingRow.challenge.resolutionNotes,
            reviewedAt: now,
            resolvedAt: finalStatus
              ? existingRow.challenge.resolvedAt || now
              : existingRow.challenge.resolvedAt,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialChallenges.id, existingRow.challenge.id),
              eq(industrialChallenges.tenantId, tenant.id),
            ),
          )
          .returning();

        let requirement = existingRow.requirement;
        if (shouldUpdateRequirement) {
          const metadata = safeRecord(existingRow.requirement.metadata);
          const previousWorkflow = safeRecord(metadata.internalWorkflow);
          const previousChallenge = safeRecord(metadata.industrialChallenge);
          const [updatedRequirement] = await tx
            .update(industrialRequirements)
            .set({
              status: requirementStatusForIndustrialChallenge(nextStatus),
              internalNotes:
                parsed.data.reviewNote === undefined
                  ? existingRow.requirement.internalNotes
                  : reviewNote,
              metadata: {
                ...metadata,
                industrialChallenge: {
                  ...previousChallenge,
                  challengeId: challenge.id,
                  status: nextStatus,
                  desiredOutcome,
                  lastReviewedAt: now.toISOString(),
                  lastReviewedByUserId: actorUserId || null,
                },
                internalWorkflow: {
                  ...previousWorkflow,
                  challengeStatus: nextStatus,
                  nextAction: industrialChallengeNextAction(nextStatus),
                  lastReviewedAt: now.toISOString(),
                  lastReviewedByUserId: actorUserId || null,
                },
              },
              updatedAt: now,
            })
            .where(
              and(
                eq(industrialRequirements.id, existingRow.requirement.id),
                eq(industrialRequirements.tenantId, tenant.id),
              ),
            )
            .returning();
          requirement = updatedRequirement;
        }

        await tx.insert(industrialAuditLogs).values({
          tenantId: tenant.id,
          actorUserId: actorUserId || null,
          action: "industrial_challenge.reviewed_by_staff",
          entityType: "industrial_challenge",
          entityId: challenge.id,
          reason: reviewNote,
          previousValue: {
            status: existingRow.challenge.status,
            desiredOutcome: existingRow.challenge.desiredOutcome,
            assignedStaffUserId: existingRow.challenge.assignedStaffUserId,
            groupKey: existingRow.challenge.groupKey,
          },
          nextValue: {
            status: challenge.status,
            desiredOutcome: challenge.desiredOutcome,
            assignedStaffUserId: challenge.assignedStaffUserId,
            groupKey: challenge.groupKey,
          },
          metadata: {
            factoryId: existingRow.factory.id,
            requirementId: requirement.id,
            requirementStatus: requirement.status,
            createsSupplierOutreach: false,
            createsQuote: false,
            createsOrder: false,
            createsManufacturingJob: false,
          },
        });

        if (shouldUpdateRequirement) {
          await tx.insert(industrialAuditLogs).values({
            tenantId: tenant.id,
            actorUserId: actorUserId || null,
            action: "industrial_requirement.status_updated_from_challenge",
            entityType: "industrial_requirement",
            entityId: requirement.id,
            reason: reviewNote,
            previousValue: { status: existingRow.requirement.status },
            nextValue: { status: requirement.status },
            metadata: {
              challengeId: challenge.id,
              source: "controlled_challenge_triage",
              createsSupplierOutreach: false,
              createsQuote: false,
              createsOrder: false,
              createsManufacturingJob: false,
            },
          });
        }

        return { challenge, requirement };
      });

      return res.json({
        ok: true,
        challenge: staffIndustrialChallengeSummary(
          updated.challenge,
          existingRow.factory,
          updated.requirement,
        ),
        message:
          "Industrial challenge updated. No supplier outreach, quotation, order, or manufacturing job was created.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The industrial challenge review could not be saved.",
      });
    }
  },
);

router.get("/admin/intelligence", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  try {
    const [
      factoryMetrics,
      factoriesByCountry,
      factoriesByIndustry,
      requirementsByZone,
      requirementDemand,
      recurringDemand,
      quoteCommercialRows,
      activeOrderCommercialRows,
      lateDeliveryRows,
      requirementTypeDemand,
      machineBrands,
      challengeFailureModes,
      challengeOutcomes,
      supplierNetwork,
      capabilityMatches,
      supplierPerformance,
    ] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`,
          mapped: sql<number>`coalesce(sum(case when ${industrialFactories.latitude} is not null and ${industrialFactories.longitude} is not null then 1 else 0 end), 0)`,
          verified: sql<number>`coalesce(sum(case when ${industrialFactories.verificationStatus} = 'verified' then 1 else 0 end), 0)`,
          activeAccounts: sql<number>`coalesce(sum(case when ${industrialFactories.factoryStatus} = 'active' then 1 else 0 end), 0)`,
        })
        .from(industrialFactories)
        .where(eq(industrialFactories.tenantId, tenant.id)),
      db
        .select({
          countryCode: industrialFactories.countryCode,
          total: sql<number>`count(*)`,
        })
        .from(industrialFactories)
        .where(eq(industrialFactories.tenantId, tenant.id))
        .groupBy(industrialFactories.countryCode),
      db
        .select({
          primaryIndustry: industrialFactories.primaryIndustry,
          total: sql<number>`count(*)`,
        })
        .from(industrialFactories)
        .where(eq(industrialFactories.tenantId, tenant.id))
        .groupBy(industrialFactories.primaryIndustry),
      db
        .select({
          industrialZone: industrialFactories.industrialZone,
          total: sql<number>`count(*)`,
        })
        .from(industrialRequirements)
        .leftJoin(
          industrialFactories,
          and(
            eq(industrialRequirements.factoryId, industrialFactories.id),
            eq(industrialRequirements.tenantId, industrialFactories.tenantId),
          ),
        )
        .where(
          and(
            eq(industrialRequirements.tenantId, tenant.id),
            inArray(industrialRequirements.status, [
              ...INDUSTRIAL_OPEN_REQUIREMENT_STATUSES,
            ]),
          ),
        )
        .groupBy(industrialFactories.industrialZone),
      db
        .select({
          categoryCode: industrialRequirements.categoryCode,
          requirementType: industrialRequirements.requirementType,
          urgency: industrialRequirements.urgency,
          total: sql<number>`count(*)`,
        })
        .from(industrialRequirements)
        .where(
          and(
            eq(industrialRequirements.tenantId, tenant.id),
            inArray(industrialRequirements.status, [
              ...INDUSTRIAL_OPEN_REQUIREMENT_STATUSES,
            ]),
          ),
        )
        .groupBy(
          industrialRequirements.categoryCode,
          industrialRequirements.requirementType,
          industrialRequirements.urgency,
        ),
      db
        .select({
          categoryCode: industrialRecurringRequirements.categoryCode,
          total: sql<number>`count(*)`,
        })
        .from(industrialRecurringRequirements)
        .where(
          and(
            eq(industrialRecurringRequirements.tenantId, tenant.id),
            eq(industrialRecurringRequirements.status, "active"),
          ),
        )
        .groupBy(industrialRecurringRequirements.categoryCode),
      db
        .select({
          status: industrialQuotes.status,
          currencyCode: industrialQuotes.currencyCode,
          total: sql<number>`count(*)`,
          totalAmount: sql<string>`coalesce(sum(${industrialQuotes.totalAmount}), 0)`,
        })
        .from(industrialQuotes)
        .where(eq(industrialQuotes.tenantId, tenant.id))
        .groupBy(industrialQuotes.status, industrialQuotes.currencyCode),
      db
        .select({
          currencyCode: industrialOrders.currencyCode,
          total: sql<number>`count(*)`,
          totalAmount: sql<string>`coalesce(sum(${industrialOrders.totalAmount}), 0)`,
        })
        .from(industrialOrders)
        .where(
          and(
            eq(industrialOrders.tenantId, tenant.id),
            inArray(industrialOrders.status, [
              ...ACTIVE_INDUSTRIAL_ORDER_STATUSES,
            ]),
          ),
        )
        .groupBy(industrialOrders.currencyCode),
      db
        .select({ total: sql<number>`count(*)` })
        .from(industrialOrders)
        .where(
          and(
            eq(industrialOrders.tenantId, tenant.id),
            inArray(industrialOrders.status, [
              ...ACTIVE_INDUSTRIAL_ORDER_STATUSES,
            ]),
            lt(industrialOrders.plannedDeliveryAt, new Date()),
          ),
        ),
      db
        .select({
          requirementType: industrialRequirements.requirementType,
          categoryCode: industrialRequirements.categoryCode,
          total: sql<number>`count(*)`,
        })
        .from(industrialRequirements)
        .where(
          and(
            eq(industrialRequirements.tenantId, tenant.id),
            inArray(industrialRequirements.status, [
              ...INDUSTRIAL_OPEN_REQUIREMENT_STATUSES,
            ]),
          ),
        )
        .groupBy(
          industrialRequirements.requirementType,
          industrialRequirements.categoryCode,
        ),
      db
        .select({
          manufacturer: industrialMachines.manufacturer,
          total: sql<number>`count(*)`,
        })
        .from(industrialMachines)
        .where(
          and(
            eq(industrialMachines.tenantId, tenant.id),
            sql`${industrialMachines.manufacturer} is not null and trim(${industrialMachines.manufacturer}) <> ''`,
          ),
        )
        .groupBy(industrialMachines.manufacturer),
      db
        .select({
          problemType: industrialChallenges.problemType,
          total: sql<number>`count(*)`,
        })
        .from(industrialChallenges)
        .where(eq(industrialChallenges.tenantId, tenant.id))
        .groupBy(industrialChallenges.problemType),
      db
        .select({
          desiredOutcome: industrialChallenges.desiredOutcome,
          total: sql<number>`count(*)`,
        })
        .from(industrialChallenges)
        .where(eq(industrialChallenges.tenantId, tenant.id))
        .groupBy(industrialChallenges.desiredOutcome),
      db
        .select({
          supplierStatus: industrialSupplierProfiles.supplierStatus,
          verificationStatus: industrialSupplierProfiles.verificationStatus,
          total: sql<number>`count(*)`,
        })
        .from(industrialSupplierProfiles)
        .where(eq(industrialSupplierProfiles.tenantId, tenant.id))
        .groupBy(
          industrialSupplierProfiles.supplierStatus,
          industrialSupplierProfiles.verificationStatus,
        ),
      db
        .select({
          status: industrialRequirementSupplierMatches.status,
          total: sql<number>`count(*)`,
        })
        .from(industrialRequirementSupplierMatches)
        .where(eq(industrialRequirementSupplierMatches.tenantId, tenant.id))
        .groupBy(industrialRequirementSupplierMatches.status),
      db
        .select({
          id: industrialSupplierProfiles.id,
          displayName: industrialSupplierProfiles.displayName,
          supplierStatus: industrialSupplierProfiles.supplierStatus,
          verificationStatus: industrialSupplierProfiles.verificationStatus,
          countryCode: industrialSupplierProfiles.countryCode,
          city: industrialSupplierProfiles.city,
          leadTimeText: industrialSupplierProfiles.leadTimeText,
          onTimeDeliveryRate: industrialSupplierProfiles.onTimeDeliveryRate,
        })
        .from(industrialSupplierProfiles)
        .where(
          and(
            eq(industrialSupplierProfiles.tenantId, tenant.id),
            eq(industrialSupplierProfiles.supplierStatus, "active"),
            eq(industrialSupplierProfiles.verificationStatus, "verified"),
          ),
        )
        .limit(100),
    ]);

    const categoryLabels = new Map(
      INDUSTRIAL_TAXONOMY.map((category) => [category.code, category.label.fr]),
    );
    const demandSignals = buildIndustrialDemandSignals(
      requirementDemand,
      recurringDemand,
    ).map((signal) => ({
      ...signal,
      label: categoryLabels.get(signal.categoryCode) || signal.categoryCode,
    }));
    const toCount = (value: unknown) => Number(value || 0);
    const sortTotal = <T extends { total: unknown }>(rows: T[]) =>
      rows
        .map((row) => ({ ...row, total: toCount(row.total) }))
        .sort((left, right) => right.total - left.total);
    const factoryMetric = factoryMetrics[0] || {
      total: 0,
      mapped: 0,
      verified: 0,
      activeAccounts: 0,
    };
    const activeRecurringPlanCount = demandSignals.reduce(
      (total, signal) => total + signal.activeRecurringPlans,
      0,
    );
    const commercial = {
      quotationValues: summarizeIndustrialCommercialValues(quoteCommercialRows),
      quoteDecision:
        calculateIndustrialQuoteDecisionMetrics(quoteCommercialRows),
      activeOrderValues: summarizeIndustrialCommercialValues(
        activeOrderCommercialRows,
      ),
      activeOrderCount: activeOrderCommercialRows.reduce(
        (total, row) => total + toCount(row.total),
        0,
      ),
      lateDeliveryCount: toCount(lateDeliveryRows[0]?.total),
      recurringProcurement: {
        activePlanCount: activeRecurringPlanCount,
        valueRecorded: false,
        reason:
          "Recurring procurement plans do not yet store an approved monetary value.",
      },
    };
    const topRequestsFor = (requirementType: string) =>
      sortTotal(
        requirementTypeDemand.filter(
          (row) => row.requirementType === requirementType,
        ),
      )
        .map((row) => ({
          ...row,
          label: categoryLabels.get(row.categoryCode) || row.categoryCode,
        }))
        .slice(0, 8);
    const challengeOutcomeCounts = new Map(
      sortTotal(challengeOutcomes).map((row) => [
        row.desiredOutcome,
        row.total,
      ]),
    );

    return res.json({
      ok: true,
      scope: "exportunity_internal",
      generatedAt: new Date().toISOString(),
      factoryMetrics: {
        total: toCount(factoryMetric.total),
        mapped: toCount(factoryMetric.mapped),
        verified: toCount(factoryMetric.verified),
        activeAccounts: toCount(factoryMetric.activeAccounts),
      },
      factoryCoverage: {
        countries: sortTotal(factoriesByCountry)
          .filter((row) => Boolean(row.countryCode))
          .slice(0, 12),
        industries: sortTotal(factoriesByIndustry)
          .filter((row) => Boolean(row.primaryIndustry))
          .slice(0, 12),
      },
      requirementsByZone: sortTotal(requirementsByZone)
        .filter((row) => Boolean(row.industrialZone))
        .slice(0, 12),
      demandSignals,
      topRequested: {
        machinery: topRequestsFor("machinery"),
        rawMaterials: topRequestsFor("raw_material"),
        spareParts: topRequestsFor("spare_part"),
      },
      commercial,
      machineBrands: sortTotal(machineBrands)
        .filter((row) => Boolean(row.manufacturer))
        .slice(0, 12),
      challengeFailureModes: sortTotal(challengeFailureModes)
        .filter((row) => Boolean(row.problemType))
        .slice(0, 12),
      opportunityCandidates: {
        localManufacturing: toCount(
          challengeOutcomeCounts.get("local_manufacturing"),
        ),
        stocking: toCount(challengeOutcomeCounts.get("stock_candidate")),
      },
      localManufacturingReview: demandSignals.filter(
        (signal) => signal.customManufacturingRequirements > 0,
      ),
      recurringSupplyReview: demandSignals.filter(
        (signal) => signal.activeRecurringPlans > 0,
      ),
      supplierNetwork: sortTotal(supplierNetwork),
      capabilityMatches: sortTotal(capabilityMatches),
      supplierPerformance: rankRecordedSupplierPerformance(
        supplierPerformance,
      ).slice(0, 12),
      rules: {
        noAutomaticOutreach: true,
        noAutomaticQuotation: true,
        noAutomaticStocking: true,
        noAutomaticManufacturingDecision: true,
      },
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "Industrial intelligence is temporarily unavailable.",
    });
  }
});

router.get("/admin/overview", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;

  try {
    const [
      factoryRows,
      requirementRows,
      recurringRequirementRows,
      challengeRows,
      orderRows,
    ] = await Promise.all([
      db
        .select({
          status: industrialFactories.factoryStatus,
          total: sql<number>`count(*)`,
        })
        .from(industrialFactories)
        .where(eq(industrialFactories.tenantId, tenant.id))
        .groupBy(industrialFactories.factoryStatus),
      db
        .select({
          status: industrialRequirements.status,
          total: sql<number>`count(*)`,
        })
        .from(industrialRequirements)
        .where(eq(industrialRequirements.tenantId, tenant.id))
        .groupBy(industrialRequirements.status),
      db
        .select({
          status: industrialRecurringRequirements.status,
          total: sql<number>`count(*)`,
        })
        .from(industrialRecurringRequirements)
        .where(eq(industrialRecurringRequirements.tenantId, tenant.id))
        .groupBy(industrialRecurringRequirements.status),
      db
        .select({
          status: industrialChallenges.status,
          total: sql<number>`count(*)`,
        })
        .from(industrialChallenges)
        .where(eq(industrialChallenges.tenantId, tenant.id))
        .groupBy(industrialChallenges.status),
      db
        .select({
          status: industrialOrders.status,
          total: sql<number>`count(*)`,
        })
        .from(industrialOrders)
        .where(eq(industrialOrders.tenantId, tenant.id))
        .groupBy(industrialOrders.status),
    ]);

    res.json({
      ok: true,
      factories: factoryRows.map((row) => ({
        status: row.status,
        total: Number(row.total || 0),
      })),
      requirements: requirementRows.map((row) => ({
        status: row.status,
        total: Number(row.total || 0),
      })),
      recurringRequirements: recurringRequirementRows.map((row) => ({
        status: row.status,
        total: Number(row.total || 0),
      })),
      challenges: challengeRows.map((row) => ({
        status: row.status,
        total: Number(row.total || 0),
      })),
      orders: orderRows.map((row) => ({
        status: row.status,
        total: Number(row.total || 0),
      })),
    });
  } catch {
    res.status(503).json({
      ok: false,
      message: "The industrial operations overview is temporarily unavailable.",
    });
  }
});

router.post(
  "/admin/requirements/:requirementId/triage",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const requirementId = String(req.params?.requirementId || "").trim();
    if (!z.string().uuid().safeParse(requirementId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial requirement identifier.",
      });
    }

    const parsed = requirementTriageSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A status and review note are required.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const existing = await db.query.industrialRequirements.findFirst({
        where: and(
          eq(industrialRequirements.id, requirementId),
          eq(industrialRequirements.tenantId, tenant.id),
        ),
      });
      if (!existing)
        return res
          .status(404)
          .json({ ok: false, message: "Industrial requirement not found." });
      if (
        !canTransitionIndustrialRequirement(
          existing.status as any,
          parsed.data.status as any,
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "This requirement cannot move to the requested workflow state from its current state.",
        });
      }
      if (parsed.data.commercialPhase === "negotiation") {
        if (parsed.data.status !== "quoted") {
          return res.status(400).json({
            ok: false,
            message:
              "A negotiation can only be recorded while the requirement is in the submitted quotation state.",
          });
        }
        const issuedQuote = await db.query.industrialQuotes.findFirst({
          where: and(
            eq(industrialQuotes.tenantId, tenant.id),
            eq(industrialQuotes.requirementId, existing.id),
            eq(industrialQuotes.status, "issued"),
          ),
        });
        if (!issuedQuote) {
          return res.status(400).json({
            ok: false,
            message:
              "Record an issued quotation before documenting a negotiation.",
          });
        }
      }
      if (
        existing.status !== "closed" &&
        parsed.data.status === "closed" &&
        parsed.data.closureOutcome !== "completed" &&
        parsed.data.closureOutcome !== "lost"
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Classify a manual closure as completed or lost before closing the requirement.",
        });
      }

      const now = new Date();
      const metadata = safeRecord(existing.metadata);
      const previousWorkflow = safeRecord(metadata.internalWorkflow);
      const actorId = Number(req.staffUser?.id);
      const nextAction =
        parsed.data.nextAction === undefined
          ? typeof previousWorkflow.nextAction === "string"
            ? previousWorkflow.nextAction
            : null
          : parsed.data.nextAction || null;
      const assignedAccountManagerUserId =
        parsed.data.assignToSelf && Number.isFinite(actorId)
          ? actorId
          : existing.assignedAccountManagerUserId;
      const commercialPhase =
        parsed.data.status === "quoted" &&
        parsed.data.commercialPhase === "negotiation"
          ? "negotiation"
          : null;
      const previousClosureOutcome =
        previousWorkflow.closureOutcome === "completed" ||
        previousWorkflow.closureOutcome === "lost"
          ? previousWorkflow.closureOutcome
          : null;
      const closureOutcome =
        parsed.data.status === "closed"
          ? parsed.data.closureOutcome || previousClosureOutcome
          : null;

      const [updated] = await db
        .update(industrialRequirements)
        .set({
          status: parsed.data.status,
          internalNotes: parsed.data.reviewNote,
          assignedAccountManagerUserId,
          metadata: {
            ...metadata,
            internalWorkflow: {
              ...previousWorkflow,
              nextAction,
              commercialPhase,
              closureOutcome,
              lastReviewedAt: now.toISOString(),
              lastReviewedByUserId: Number.isFinite(actorId) ? actorId : null,
            },
          },
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialRequirements.id, requirementId),
            eq(industrialRequirements.tenantId, tenant.id),
          ),
        )
        .returning();

      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: Number.isFinite(actorId) ? actorId : null,
        action: "industrial_requirement.workflow_updated",
        entityType: "industrial_requirement",
        entityId: requirementId,
        reason: parsed.data.reviewNote,
        previousValue: {
          status: existing.status,
          assignedAccountManagerUserId: existing.assignedAccountManagerUserId,
          nextAction:
            typeof previousWorkflow.nextAction === "string"
              ? previousWorkflow.nextAction
              : null,
          commercialPhase:
            previousWorkflow.commercialPhase === "negotiation"
              ? "negotiation"
              : null,
          closureOutcome:
            previousWorkflow.closureOutcome === "completed" ||
            previousWorkflow.closureOutcome === "lost"
              ? previousWorkflow.closureOutcome
              : null,
        },
        nextValue: {
          status: updated.status,
          assignedAccountManagerUserId: updated.assignedAccountManagerUserId,
          nextAction,
          commercialPhase,
          closureOutcome,
        },
        metadata: {
          requirementType: existing.requirementType,
          categoryCode: existing.categoryCode,
        },
      });

      return res.json({
        ok: true,
        requirement: staffRequirementSummary(updated),
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The industrial requirement workflow could not be updated.",
      });
    }
  },
);

router.post(
  "/admin/factories/:factoryId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;

    const parsed = factoryReviewSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "A valid review action and reason are required.",
        issues: parsed.error.flatten(),
      });
    }

    const factoryId = String(req.params?.factoryId || "").trim();
    if (!z.string().uuid().safeParse(factoryId).success) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid factory identifier." });
    }

    const existing = await db.query.industrialFactories.findFirst({
      where: and(
        eq(industrialFactories.id, factoryId),
        eq(industrialFactories.tenantId, tenant.id),
      ),
    });
    if (!existing)
      return res.status(404).json({ ok: false, message: "Factory not found." });

    const now = new Date();
    const statusUpdates =
      parsed.data.action === "verify"
        ? {
            factoryStatus: "active" as const,
            verificationStatus: "verified" as const,
            publicVisibility: parsed.data.publicVisibility || "public",
            verifiedAt: now,
            updatedAt: now,
          }
        : parsed.data.action === "suspend"
          ? {
              factoryStatus: "suspended" as const,
              verificationStatus: "suspended" as const,
              publicVisibility: "exportunity_internal" as const,
              updatedAt: now,
            }
          : parsed.data.action === "archive"
            ? {
                factoryStatus: "archived" as const,
                publicVisibility: "exportunity_internal" as const,
                archivedAt: now,
                updatedAt: now,
              }
            : {
                factoryStatus: "under_review" as const,
                verificationStatus: "under_review" as const,
                updatedAt: now,
              };

    const adminActorId = Number(req.adminUser?.id);
    const updates = {
      ...statusUpdates,
      adminNotes:
        parsed.data.adminNotes === undefined
          ? existing.adminNotes
          : parsed.data.adminNotes || null,
      accountManagerUserId:
        parsed.data.assignToSelf && Number.isFinite(adminActorId)
          ? adminActorId
          : existing.accountManagerUserId,
    };

    const [updated] = await db
      .update(industrialFactories)
      .set(updates)
      .where(
        and(
          eq(industrialFactories.id, factoryId),
          eq(industrialFactories.tenantId, tenant.id),
        ),
      )
      .returning();

    await db.insert(industrialAuditLogs).values({
      tenantId: tenant.id,
      actorUserId: Number.isFinite(adminActorId) ? adminActorId : null,
      action: `industrial_factory.${parsed.data.action}`,
      entityType: "industrial_factory",
      entityId: factoryId,
      reason: parsed.data.reason,
      previousValue: {
        factoryStatus: existing.factoryStatus,
        verificationStatus: existing.verificationStatus,
        publicVisibility: existing.publicVisibility,
      },
      nextValue: {
        factoryStatus: updated.factoryStatus,
        verificationStatus: updated.verificationStatus,
        publicVisibility: updated.publicVisibility,
        accountManagerUserId: updated.accountManagerUserId,
      },
    });

    return res.json({
      ok: true,
      factory: staffFactorySummary(updated),
      status: updated.factoryStatus,
    });
  },
);

router.get("/admin/part-records", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const query = String(req.query?.q || "").trim();
  const statusFilter = z
    .enum(INDUSTRIAL_PART_RECORD_STATUSES)
    .safeParse(String(req.query?.status || "").trim());
  const routeFilter = z
    .enum(INDUSTRIAL_PART_ROUTE_DECISIONS)
    .safeParse(String(req.query?.route || "").trim());
  const factoryId = String(req.query?.factoryId || "").trim();

  try {
    const like = `%${query}%`;
    const rows = await db
      .select({
        partRecord: industrialPartRecords,
        factory: industrialFactories,
      })
      .from(industrialPartRecords)
      .innerJoin(
        industrialFactories,
        and(
          eq(industrialPartRecords.factoryId, industrialFactories.id),
          eq(industrialPartRecords.tenantId, industrialFactories.tenantId),
        ),
      )
      .where(
        and(
          eq(industrialPartRecords.tenantId, tenant.id),
          statusFilter.success
            ? eq(industrialPartRecords.status, statusFilter.data)
            : undefined,
          routeFilter.success
            ? eq(industrialPartRecords.routeDecision, routeFilter.data)
            : undefined,
          z.string().uuid().safeParse(factoryId).success
            ? eq(industrialPartRecords.factoryId, factoryId)
            : undefined,
          query
            ? or(
                ilike(industrialPartRecords.referenceCode, like),
                ilike(industrialPartRecords.title, like),
                ilike(industrialPartRecords.partNumber, like),
                ilike(industrialFactories.displayName, like),
                ilike(industrialFactories.legalName, like),
              )
            : undefined,
        ),
      )
      .orderBy(desc(industrialPartRecords.updatedAt))
      .limit(safeLimit(req.query?.limit, 100));
    const recordIds = rows.map((row) => row.partRecord.id);
    const documentRows = recordIds.length
      ? await db
          .select({ document: industrialPartRecordDocuments })
          .from(industrialPartRecordDocuments)
          .where(
            and(
              eq(industrialPartRecordDocuments.tenantId, tenant.id),
              inArray(industrialPartRecordDocuments.partRecordId, recordIds),
            ),
          )
          .orderBy(desc(industrialPartRecordDocuments.createdAt))
      : [];
    const documentsByPartRecord = new Map<string, any[]>();
    for (const row of documentRows) {
      const documents =
        documentsByPartRecord.get(row.document.partRecordId) || [];
      documents.push(row.document);
      documentsByPartRecord.set(row.document.partRecordId, documents);
    }
    return res.json({
      ok: true,
      partRecords: rows.map((row) =>
        staffIndustrialPartRecordSummary(
          row.partRecord,
          row.factory,
          documentsByPartRecord.get(row.partRecord.id) || [],
        ),
      ),
      total: rows.length,
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "The technical part-record queue is temporarily unavailable.",
    });
  }
});

router.get(
  "/admin/part-records/:partRecordId",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const partRecordId = String(req.params?.partRecordId || "").trim();
    if (!z.string().uuid().safeParse(partRecordId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial part-record identifier.",
      });
    }

    try {
      const [row] = await db
        .select({
          partRecord: industrialPartRecords,
          factory: industrialFactories,
        })
        .from(industrialPartRecords)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialPartRecords.factoryId, industrialFactories.id),
            eq(industrialPartRecords.tenantId, industrialFactories.tenantId),
          ),
        )
        .where(
          and(
            eq(industrialPartRecords.id, partRecordId),
            eq(industrialPartRecords.tenantId, tenant.id),
          ),
        )
        .limit(1);
      if (!row) {
        return res.status(404).json({
          ok: false,
          message: "Industrial part record not found.",
        });
      }
      const [documents, audit, sourceRequirement] = await Promise.all([
        db
          .select()
          .from(industrialPartRecordDocuments)
          .where(
            and(
              eq(industrialPartRecordDocuments.tenantId, tenant.id),
              eq(industrialPartRecordDocuments.partRecordId, row.partRecord.id),
            ),
          )
          .orderBy(desc(industrialPartRecordDocuments.createdAt)),
        db
          .select()
          .from(industrialAuditLogs)
          .where(
            and(
              eq(industrialAuditLogs.tenantId, tenant.id),
              eq(industrialAuditLogs.entityType, "industrial_part_record"),
              eq(industrialAuditLogs.entityId, row.partRecord.id),
            ),
          )
          .orderBy(desc(industrialAuditLogs.createdAt))
          .limit(50),
        row.partRecord.sourceRequirementId
          ? db.query.industrialRequirements.findFirst({
              where: and(
                eq(
                  industrialRequirements.id,
                  row.partRecord.sourceRequirementId,
                ),
                eq(industrialRequirements.tenantId, tenant.id),
              ),
            })
          : Promise.resolve(null),
      ]);
      return res.json({
        ok: true,
        partRecord: {
          ...staffIndustrialPartRecordSummary(
            row.partRecord,
            row.factory,
            documents,
          ),
          allowedNextStatuses: nextIndustrialPartRecordStatuses(
            row.partRecord.status,
          ),
          nextAction: industrialPartRecordNextAction(
            row.partRecord.status,
            row.partRecord.routeDecision,
          ),
          sourceRequirement: sourceRequirement
            ? {
                ...staffRequirementSummary(sourceRequirement),
                details: sourceRequirement.details,
                metadata: sourceRequirement.metadata,
              }
            : null,
        },
        factory: staffFactorySummary(row.factory),
        audit,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        message: "The industrial part record is temporarily unavailable.",
      });
    }
  },
);

router.patch(
  "/admin/part-records/:partRecordId/review",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const partRecordId = String(req.params?.partRecordId || "").trim();
    if (!z.string().uuid().safeParse(partRecordId).success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial part-record identifier.",
      });
    }
    const parsed = industrialPartRecordReviewSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Provide a valid technical part-record review update.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const [existingRow] = await db
        .select({
          partRecord: industrialPartRecords,
          factory: industrialFactories,
        })
        .from(industrialPartRecords)
        .innerJoin(
          industrialFactories,
          and(
            eq(industrialPartRecords.factoryId, industrialFactories.id),
            eq(industrialPartRecords.tenantId, industrialFactories.tenantId),
          ),
        )
        .where(
          and(
            eq(industrialPartRecords.id, partRecordId),
            eq(industrialPartRecords.tenantId, tenant.id),
          ),
        )
        .limit(1);
      if (!existingRow) {
        return res.status(404).json({
          ok: false,
          message: "Industrial part record not found.",
        });
      }
      const nextStatus = parsed.data.status || existingRow.partRecord.status;
      if (
        !canTransitionIndustrialPartRecord(
          existingRow.partRecord.status,
          nextStatus,
        )
      ) {
        return res.status(409).json({
          ok: false,
          message:
            "This technical part record cannot move to that review stage.",
          allowedNextStatuses: nextIndustrialPartRecordStatuses(
            existingRow.partRecord.status,
          ),
        });
      }
      const nextRouteDecision =
        parsed.data.routeDecision || existingRow.partRecord.routeDecision;
      if (
        nextRouteDecision !== "review_required" &&
        !industrialPartRecordRouteStage(nextStatus)
      ) {
        return res.status(409).json({
          ok: false,
          message:
            "A route can only be selected during route review or a later controlled stage.",
        });
      }
      if (
        [
          "route_selected",
          "prototype",
          "validated",
          "catalog_candidate",
        ].includes(nextStatus) &&
        !canFinalizeIndustrialPartRoute(nextStatus, nextRouteDecision)
      ) {
        return res.status(409).json({
          ok: false,
          message:
            "Choose a reviewed stock, distribution, assembly, local-manufacturing, or import route before progressing beyond route review.",
        });
      }

      const staffUserId = actorIdFor(req, "staffUser");
      const now = new Date();
      const [updated] = await db
        .update(industrialPartRecords)
        .set({
          status: nextStatus,
          routeDecision: nextRouteDecision,
          routeRationale:
            parsed.data.routeRationale === undefined
              ? existingRow.partRecord.routeRationale
              : optionalText(parsed.data.routeRationale),
          reviewNotes:
            parsed.data.reviewNotes === undefined
              ? existingRow.partRecord.reviewNotes
              : optionalText(parsed.data.reviewNotes),
          reviewedByUserId: staffUserId || null,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialPartRecords.id, partRecordId),
            eq(industrialPartRecords.tenantId, tenant.id),
          ),
        )
        .returning();
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: staffUserId || null,
        action: "industrial_part_record.reviewed_by_staff",
        entityType: "industrial_part_record",
        entityId: updated.id,
        previousValue: {
          status: existingRow.partRecord.status,
          routeDecision: existingRow.partRecord.routeDecision,
        },
        nextValue: {
          status: updated.status,
          routeDecision: updated.routeDecision,
          routeRationale: updated.routeRationale,
        },
        metadata: {
          factoryId: updated.factoryId,
          sourceRequirementId: updated.sourceRequirementId,
          nextAction: industrialPartRecordNextAction(
            updated.status,
            updated.routeDecision,
          ),
          createsSupplierOutreach: false,
          createsPurchaseOrder: false,
          createsManufacturingJob: false,
          createsPayment: false,
        },
      });
      return res.json({
        ok: true,
        partRecord: staffIndustrialPartRecordSummary(
          updated,
          existingRow.factory,
        ),
        message:
          "Technical route review saved. No supplier contact, quotation, order, production job, or payment was created.",
      });
    } catch {
      return res.status(500).json({
        ok: false,
        message: "The technical part-record review could not be saved.",
      });
    }
  },
);

router.get(
  "/admin/part-records/:partRecordId/documents/:documentId/download",
  ensureTenantStaff,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const partRecordId = String(req.params?.partRecordId || "").trim();
    const documentId = String(req.params?.documentId || "").trim();
    if (
      !z.string().uuid().safeParse(partRecordId).success ||
      !z.string().uuid().safeParse(documentId).success
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid industrial part-record document identifier.",
      });
    }
    try {
      const [row] = await db
        .select({
          partRecord: industrialPartRecords,
          document: industrialPartRecordDocuments,
        })
        .from(industrialPartRecordDocuments)
        .innerJoin(
          industrialPartRecords,
          and(
            eq(
              industrialPartRecordDocuments.partRecordId,
              industrialPartRecords.id,
            ),
            eq(
              industrialPartRecordDocuments.tenantId,
              industrialPartRecords.tenantId,
            ),
          ),
        )
        .where(
          and(
            eq(industrialPartRecordDocuments.id, documentId),
            eq(industrialPartRecords.id, partRecordId),
            eq(industrialPartRecords.tenantId, tenant.id),
          ),
        )
        .limit(1);
      if (!row) {
        return res.status(404).json({
          ok: false,
          message: "Technical evidence is not available for this part record.",
        });
      }
      const staffUserId = actorIdFor(req, "staffUser");
      await db.insert(industrialAuditLogs).values({
        tenantId: tenant.id,
        actorUserId: staffUserId || null,
        action: "industrial_part_record.document_downloaded_by_staff",
        entityType: "industrial_part_record",
        entityId: row.partRecord.id,
        metadata: { documentId: row.document.id },
      });
      const file = await resolveIndustrialPartRecordDocument(
        row.document.storageKey,
      );
      const safeFileName = String(
        row.document.fileName || "technical-part-document",
      ).replace(/[\\\"\r\n]/g, "_");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        row.document.mimeType || "application/octet-stream",
      );
      res.setHeader("Content-Length", String(file.sizeBytes));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName}"`,
      );
      const stream = createReadStream(file.absolutePath);
      stream.on("error", () => {
        if (!res.headersSent) {
          res.status(404).json({
            ok: false,
            message: "Technical evidence is unavailable.",
          });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    } catch {
      return res.status(404).json({
        ok: false,
        message: "Technical evidence is unavailable.",
      });
    }
  },
);

export default router;
