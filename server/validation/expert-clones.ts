import { z } from "zod";

// ========================================
// CLONE PROFILE VALIDATION
// ========================================

export const createProfileSchema = z.object({
  createdByUserId: z.number().int().positive().optional().nullable(),
  displayName: z.string().min(1).max(100),
  shortCode: z.string().min(2).max(50).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  longDescription: z.string().max(5000).optional().nullable(),
  avatar: z.string().url().optional().nullable(),
  coverImage: z.string().url().optional().nullable(),
  title: z.string().min(1).max(100),
  category: z.enum(['social', 'business', 'productivity', 'sales', 'content', 'expert', 'personal']),
  primaryExpertise: z.string().min(1).max(200),
  skills: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  languages: z.array(z.string()).default(['en']),
  trainingStatus: z.enum(['draft', 'training', 'ready', 'active', 'paused', 'archived']).default('draft'),
  visibility: z.enum(['private', 'company_only', 'public_marketplace']).default('private'),
  pricingModel: z.enum(['per_hour', 'per_day', 'per_task', 'monthly_subscription', 'custom']).default('per_day'),
  baseDailyCost: z.string().regex(/^\d+\.\d{2}$/).default('5.00'),
  baseHourlyRate: z.string().regex(/^\d+\.\d{2}$/).default('10.00'),
  metadata: z.record(z.unknown()).default({})
});

export const updateProfileSchema = createProfileSchema.partial().strict();

// ========================================
// COMPANY CLONE ASSIGNMENT VALIDATION
// ========================================

// Minimal schema for creating assignments (costs calculated by service)
export const createAssignmentRequestSchema = z.object({
  cloneProfileId: z.number().int().positive(),
  roleWithinCompany: z.string().min(1).max(100),
  departmentId: z.number().int().positive().optional().nullable(),
  managerAgentId: z.number().int().positive().optional().nullable(),
  tierId: z.number().int().positive().optional().nullable(),
  accessScope: z.object({
    modules: z.array(z.string()).optional(),
    dataCategories: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional()
  }).optional().default({}),
  config: z.object({
    autoReply: z.boolean().optional(),
    autoPost: z.boolean().optional(),
    workingHours: z.string().optional(),
    notifications: z.boolean().optional(),
    customInstructions: z.string().optional()
  }).optional().default({}),
}).strict();

// Full schema for database insertions (includes costs)
export const createAssignmentSchema = z.object({
  cloneProfileId: z.number().int().positive(),
  roleWithinCompany: z.string().min(1).max(100),
  departmentId: z.number().int().positive().optional().nullable(),
  managerAgentId: z.number().int().positive().optional().nullable(),
  reportingLevel: z.number().int().min(0).max(10).default(0),
  status: z.enum(['pending', 'learning', 'active', 'paused', 'terminated']).default('pending'),
  accessScope: z.object({
    modules: z.array(z.string()).optional(),
    dataCategories: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional()
  }).default({}),
  tierId: z.number().int().positive().optional().nullable(),
  dailyCost: z.string().regex(/^\d+\.\d{2}$/),
  weeklyCost: z.string().regex(/^\d+\.\d{2}$/),
  monthlyCost: z.string().regex(/^\d+\.\d{2}$/),
  config: z.object({
    autoReply: z.boolean().optional(),
    autoPost: z.boolean().optional(),
    workingHours: z.string().optional(),
    notifications: z.boolean().optional(),
    customInstructions: z.string().optional()
  }).default({}),
  hireId: z.number().int().positive().optional().nullable(),
  agreedPrice: z.string().regex(/^\d+\.\d{2}$/).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  metadata: z.record(z.unknown()).default({})
});

// CRITICAL: Remove status from updatable fields - status changes MUST go through dedicated endpoints
// (activate/pause/terminate) where transition validation and company scoping are enforced
export const updateAssignmentSchema = createAssignmentSchema.partial().omit({ 
  cloneProfileId: true,
  status: true // Status changes only via activate/pause/terminate endpoints
}).strict();

// ========================================
// KNOWLEDGE LAYER VALIDATION
// ========================================

export const createKnowledgeSchema = z.object({
  scope: z.enum(['global', 'company', 'agent']),
  companyId: z.number().int().positive().optional().nullable(),
  agentAssignmentId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1).max(200),
  contentType: z.enum(['document', 'faq', 'procedure', 'template', 'guideline', 'reference']),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  createdByUserId: z.number().int().positive().optional().nullable()
}).refine((data) => {
  // Scope validation: ensure company_id and agent_assignment_id match scope
  if (data.scope === 'global') {
    return data.companyId === null && data.agentAssignmentId === null;
  } else if (data.scope === 'company') {
    return data.companyId !== null && data.agentAssignmentId === null;
  } else if (data.scope === 'agent') {
    return data.companyId !== null && data.agentAssignmentId !== null;
  }
  return false;
}, {
  message: "scope must match companyId and agentAssignmentId: global (both null), company (companyId only), agent (both set)"
});

// For updates, we create a base schema without refine, then apply partial
const baseKnowledgeSchema = z.object({
  scope: z.enum(['global', 'company', 'agent']),
  companyId: z.number().int().positive().optional().nullable(),
  agentAssignmentId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1).max(200),
  contentType: z.enum(['document', 'faq', 'procedure', 'template', 'guideline', 'reference']),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  createdByUserId: z.number().int().positive().optional().nullable()
});

export const updateKnowledgeSchema = baseKnowledgeSchema.partial().omit({ scope: true }).strict();

// ========================================
// STATUS TRANSITION VALIDATION
// ========================================

export type AssignmentStatus = 'pending' | 'learning' | 'active' | 'paused' | 'terminated';

const STATUS_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  'pending': ['learning', 'terminated'],
  'learning': ['active', 'paused', 'terminated'],
  'active': ['paused', 'terminated'],
  'paused': ['active', 'terminated'],
  'terminated': [] // Cannot transition from terminated
};

export function isValidStatusTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateStatusTransition(currentStatus: AssignmentStatus, newStatus: AssignmentStatus): void {
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid status transition from '${currentStatus}' to '${newStatus}'. ` +
      `Valid transitions: ${STATUS_TRANSITIONS[currentStatus]?.join(', ') || 'none'}`
    );
  }
}
