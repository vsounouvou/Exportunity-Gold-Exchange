import { Router } from "express";
import { db } from "@db";
import { 
  cloneProfiles, 
  companyCloneAssignments, 
  knowledgeLayers, 
  agentDiagnostics,
  companies 
} from "@db/schema";
import { eq, and, desc, asc, sql, inArray, or, gte } from "drizzle-orm";
import { 
  createProfileSchema, 
  updateProfileSchema,
  createAssignmentRequestSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  createKnowledgeSchema,
  updateKnowledgeSchema,
  validateStatusTransition,
  type AssignmentStatus
} from "../validation/expert-clones";
import { AssignmentService } from "../lib/expert-clones/AssignmentService";

const router = Router();

// ========================================
// CLONE PROFILES ENDPOINTS
// ========================================

// GET /api/expert-clones/profiles - List all clone profiles
router.get("/profiles", async (req, res) => {
  try {
    const { visibility, category, trainingStatus, isPublished } = req.query;
    
    const conditions = [];
    if (visibility) {
      conditions.push(eq(cloneProfiles.visibility, visibility as any));
    }
    if (category) {
      conditions.push(eq(cloneProfiles.category, category as any));
    }
    if (trainingStatus) {
      conditions.push(eq(cloneProfiles.trainingStatus, trainingStatus as any));
    }
    if (isPublished !== undefined) {
      conditions.push(eq(cloneProfiles.isPublished, isPublished === 'true'));
    }
    
    const query = db.select().from(cloneProfiles);
    const profiles = await (conditions.length > 0 
      ? query.where(and(...conditions))
      : query
    ).orderBy(desc(cloneProfiles.createdAt));
    
    res.json(profiles);
  } catch (error: any) {
    console.error("[Expert Clones] Error fetching profiles:", error);
    res.status(500).json({ message: "Failed to fetch clone profiles", error: error.message });
  }
});

// GET /api/expert-clones/profiles/:id - Get specific profile
router.get("/profiles/:id", async (req, res) => {
  try {
    const profileId = parseInt(req.params.id);
    
    const profile = await db.query.cloneProfiles.findFirst({
      where: eq(cloneProfiles.id, profileId)
    });
    
    if (!profile) {
      return res.status(404).json({ message: "Clone profile not found" });
    }
    
    res.json(profile);
  } catch (error: any) {
    console.error("[Expert Clones] Error fetching profile:", error);
    res.status(500).json({ message: "Failed to fetch clone profile", error: error.message });
  }
});

// POST /api/expert-clones/profiles - Create new profile
router.post("/profiles", async (req, res) => {
  try {
    // Validate and parse input with Zod
    const validatedData = createProfileSchema.parse(req.body);
    
    const [newProfile] = await db.insert(cloneProfiles)
      .values(validatedData)
      .returning();
    
    res.status(201).json(newProfile);
  } catch (error: any) {
    console.error("[Expert Clones] Error creating profile:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: error.errors 
      });
    }
    res.status(500).json({ message: "Failed to create clone profile", error: error.message });
  }
});

// PATCH /api/expert-clones/profiles/:id - Update profile
router.patch("/profiles/:id", async (req, res) => {
  try {
    const profileId = parseInt(req.params.id);
    
    // Validate and parse input with Zod
    const validatedData = updateProfileSchema.parse(req.body);
    
    if (Object.keys(validatedData).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    
    const updates = {
      ...validatedData,
      updatedAt: new Date()
    };

    if (typeof (updates as any).startDate === "string") {
      (updates as any).startDate = new Date((updates as any).startDate);
    }
    if (typeof (updates as any).endDate === "string") {
      (updates as any).endDate = new Date((updates as any).endDate);
    }
    
    const [updatedProfile] = await db.update(cloneProfiles)
      .set(updates)
      .where(eq(cloneProfiles.id, profileId))
      .returning();
    
    if (!updatedProfile) {
      return res.status(404).json({ message: "Clone profile not found" });
    }
    
    res.json(updatedProfile);
  } catch (error: any) {
    console.error("[Expert Clones] Error updating profile:", error);
    res.status(500).json({ message: "Failed to update clone profile", error: error.message });
  }
});

// DELETE /api/expert-clones/profiles/:id - Delete profile
router.delete("/profiles/:id", async (req, res) => {
  try {
    const profileId = parseInt(req.params.id);
    
    const [deletedProfile] = await db.delete(cloneProfiles)
      .where(eq(cloneProfiles.id, profileId))
      .returning();
    
    if (!deletedProfile) {
      return res.status(404).json({ message: "Clone profile not found" });
    }
    
    res.json({ message: "Clone profile deleted successfully", profile: deletedProfile });
  } catch (error: any) {
    console.error("[Expert Clones] Error deleting profile:", error);
    res.status(500).json({ message: "Failed to delete clone profile", error: error.message });
  }
});

// ========================================
// COMPANY ASSIGNMENTS ENDPOINTS
// ========================================

// GET /api/expert-clones/companies/:companyId/assignments - List company assignments
router.get("/companies/:companyId/assignments", async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    const { status } = req.query;
    
  // Build filter conditions
  const conditions = [eq(companyCloneAssignments.companyId, companyId)];
  if (status) {
      const statusValue = String(status);
      if (
        statusValue === "pending" ||
        statusValue === "learning" ||
        statusValue === "active" ||
        statusValue === "paused" ||
        statusValue === "terminated"
      ) {
        conditions.push(eq(companyCloneAssignments.status, statusValue));
      }
  }
    
    // Use relational query to get assignments with clone profiles
    const assignments = await db.query.companyCloneAssignments.findMany({
      where: and(...conditions),
      with: {
        cloneProfile: true,
      },
      orderBy: [desc(companyCloneAssignments.createdAt)],
    });
    
    res.json(assignments);
  } catch (error: any) {
    console.error("[Expert Clones] Error fetching assignments:", error);
    res.status(500).json({ message: "Failed to fetch assignments", error: error.message });
  }
});

// POST /api/expert-clones/companies/:companyId/assignments - Create assignment
router.post("/companies/:companyId/assignments", async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    // Validate request with Zod schema
    const validatedData = createAssignmentRequestSchema.parse(req.body);
    
    // Use AssignmentService to create assignment (service calculates costs)
    const newAssignment = await AssignmentService.createAssignment({
      companyId,
      ...validatedData,
    });
    
    res.status(201).json(newAssignment);
  } catch (error: any) {
    console.error("[Expert Clones] Error creating assignment:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: error.errors 
      });
    }
    if (error.message.includes('already assigned')) {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: "Failed to create assignment", error: error.message });
  }
});

// PATCH /api/expert-clones/assignments/:id - Update assignment
router.patch("/assignments/:id", async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const { companyId: rawCompanyId, ...updateFields } = req.body;
    
    // Company scoping validation (multi-tenant isolation)
    if (!rawCompanyId) {
      return res.status(400).json({ message: "companyId is required for assignment updates" });
    }
    
    // Parse and validate companyId as number (prevent string bypass)
    const companyId = parseInt(rawCompanyId);
    if (isNaN(companyId)) {
      return res.status(400).json({ message: "companyId must be a valid number" });
    }
    
    // Validate and parse input with Zod (NOTE: status field is excluded from updateSchema)
    // companyId is destructured out above to avoid strict() rejection
    const validatedData = updateAssignmentSchema.parse(updateFields);
    
    if (Object.keys(validatedData).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    
    // Fetch current assignment to verify ownership
    const assignment = await db.query.companyCloneAssignments.findFirst({
      where: eq(companyCloneAssignments.id, assignmentId)
    });
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    
    // CRITICAL: Verify assignment belongs to the requesting company (prevent cross-company access)
    if (assignment.companyId !== companyId) {
      return res.status(403).json({ 
        message: "Forbidden: Assignment belongs to a different company" 
      });
    }
    
    const { startDate: startDateRaw, endDate: endDateRaw, ...rest } = validatedData as any;

    const startDate =
      startDateRaw === undefined ? undefined : startDateRaw === null ? null : new Date(startDateRaw);
    const endDate =
      endDateRaw === undefined ? undefined : endDateRaw === null ? null : new Date(endDateRaw);

    const updates = {
      ...rest,
      startDate,
      endDate,
      updatedAt: new Date(),
    };
    
    const [updatedAssignment] = await db.update(companyCloneAssignments)
      .set(updates)
      .where(eq(companyCloneAssignments.id, assignmentId))
      .returning();
    
    res.json(updatedAssignment);
  } catch (error: any) {
    console.error("[Expert Clones] Error updating assignment:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: error.errors 
      });
    }
    res.status(500).json({ message: "Failed to update assignment", error: error.message });
  }
});

// POST /api/expert-clones/assignments/:id/activate - Activate assignment
router.post("/assignments/:id/activate", async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const { companyId: rawCompanyId } = req.body;
    
    // Company scoping validation (multi-tenant isolation)
    if (!rawCompanyId) {
      return res.status(400).json({ message: "companyId is required for status changes" });
    }
    
    // Parse and validate companyId as number (prevent string bypass)
    const companyId = parseInt(rawCompanyId);
    if (isNaN(companyId)) {
      return res.status(400).json({ message: "companyId must be a valid number" });
    }
    
    // Fetch current assignment to validate ownership and status transition
    const assignment = await db.query.companyCloneAssignments.findFirst({
      where: eq(companyCloneAssignments.id, assignmentId)
    });
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    
    // CRITICAL: Verify assignment belongs to the requesting company (prevent cross-company access)
    if (assignment.companyId !== companyId) {
      return res.status(403).json({ 
        message: "Forbidden: Assignment belongs to a different company" 
      });
    }
    
    // Validate status transition
    try {
      validateStatusTransition(assignment.status as AssignmentStatus, 'active');
    } catch (transitionError: any) {
      return res.status(400).json({ message: transitionError.message });
    }
    
    const [updatedAssignment] = await db.update(companyCloneAssignments)
      .set({
        status: 'active',
        lastActiveAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(companyCloneAssignments.id, assignmentId))
      .returning();
    
    res.json(updatedAssignment);
  } catch (error: any) {
    console.error("[Expert Clones] Error activating assignment:", error);
    res.status(500).json({ message: "Failed to activate assignment", error: error.message });
  }
});

// POST /api/expert-clones/assignments/:id/pause - Pause assignment
router.post("/assignments/:id/pause", async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const { companyId: rawCompanyId } = req.body;
    
    // Company scoping validation (multi-tenant isolation)
    if (!rawCompanyId) {
      return res.status(400).json({ message: "companyId is required for status changes" });
    }
    
    // Parse and validate companyId as number (prevent string bypass)
    const companyId = parseInt(rawCompanyId);
    if (isNaN(companyId)) {
      return res.status(400).json({ message: "companyId must be a valid number" });
    }
    
    // Fetch current assignment to validate ownership and status transition
    const assignment = await db.query.companyCloneAssignments.findFirst({
      where: eq(companyCloneAssignments.id, assignmentId)
    });
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    
    // CRITICAL: Verify assignment belongs to the requesting company (prevent cross-company access)
    if (assignment.companyId !== companyId) {
      return res.status(403).json({ 
        message: "Forbidden: Assignment belongs to a different company" 
      });
    }
    
    // Validate status transition
    try {
      validateStatusTransition(assignment.status as AssignmentStatus, 'paused');
    } catch (transitionError: any) {
      return res.status(400).json({ message: transitionError.message });
    }
    
    const [updatedAssignment] = await db.update(companyCloneAssignments)
      .set({
        status: 'paused',
        updatedAt: new Date()
      })
      .where(eq(companyCloneAssignments.id, assignmentId))
      .returning();
    
    res.json(updatedAssignment);
  } catch (error: any) {
    console.error("[Expert Clones] Error pausing assignment:", error);
    res.status(500).json({ message: "Failed to pause assignment", error: error.message });
  }
});

// POST /api/expert-clones/assignments/:id/terminate - Terminate assignment
router.post("/assignments/:id/terminate", async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const { companyId: rawCompanyId } = req.body;
    
    // Company scoping validation (multi-tenant isolation)
    if (!rawCompanyId) {
      return res.status(400).json({ message: "companyId is required for status changes" });
    }
    
    // Parse and validate companyId as number (prevent string bypass)
    const companyId = parseInt(rawCompanyId);
    if (isNaN(companyId)) {
      return res.status(400).json({ message: "companyId must be a valid number" });
    }
    
    // Fetch current assignment to validate ownership and status transition
    const assignment = await db.query.companyCloneAssignments.findFirst({
      where: eq(companyCloneAssignments.id, assignmentId)
    });
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    
    // CRITICAL: Verify assignment belongs to the requesting company (prevent cross-company access)
    if (assignment.companyId !== companyId) {
      return res.status(403).json({ 
        message: "Forbidden: Assignment belongs to a different company" 
      });
    }
    
    // Validate status transition
    try {
      validateStatusTransition(assignment.status as AssignmentStatus, 'terminated');
    } catch (transitionError: any) {
      return res.status(400).json({ message: transitionError.message });
    }
    
    const [updatedAssignment] = await db.update(companyCloneAssignments)
      .set({
        status: 'terminated',
        endDate: new Date(),
        updatedAt: new Date()
      })
      .where(eq(companyCloneAssignments.id, assignmentId))
      .returning();
    
    res.json(updatedAssignment);
  } catch (error: any) {
    console.error("[Expert Clones] Error terminating assignment:", error);
    res.status(500).json({ message: "Failed to terminate assignment", error: error.message });
  }
});

// DELETE /api/expert-clones/assignments/:id - Delete assignment
router.delete("/assignments/:id", async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const { companyId: rawCompanyId } = req.body;
    
    // Company scoping validation (multi-tenant isolation)
    if (!rawCompanyId) {
      return res.status(400).json({ message: "companyId is required for assignment deletion" });
    }
    
    // Parse and validate companyId as number (prevent string bypass)
    const companyId = parseInt(rawCompanyId);
    if (isNaN(companyId)) {
      return res.status(400).json({ message: "companyId must be a valid number" });
    }
    
    // Fetch current assignment to verify ownership before deletion
    const assignment = await db.query.companyCloneAssignments.findFirst({
      where: eq(companyCloneAssignments.id, assignmentId)
    });
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    
    // CRITICAL: Verify assignment belongs to the requesting company (prevent cross-company access)
    if (assignment.companyId !== companyId) {
      return res.status(403).json({ 
        message: "Forbidden: Assignment belongs to a different company" 
      });
    }
    
    const [deletedAssignment] = await db.delete(companyCloneAssignments)
      .where(eq(companyCloneAssignments.id, assignmentId))
      .returning();
    
    res.json({ message: "Assignment deleted successfully", assignment: deletedAssignment });
  } catch (error: any) {
    console.error("[Expert Clones] Error deleting assignment:", error);
    res.status(500).json({ message: "Failed to delete assignment", error: error.message });
  }
});

// ========================================
// KNOWLEDGE LAYERS ENDPOINTS
// ========================================

// GET /api/expert-clones/knowledge - List knowledge items
router.get("/knowledge", async (req, res) => {
  try {
    const { scope, companyId, assignmentId, category, itemType } = req.query;
    
    const conditions = [];
    
    if (scope) {
      const scopeValue = String(scope);
      if (scopeValue === "global" || scopeValue === "company" || scopeValue === "agent") {
        conditions.push(eq(knowledgeLayers.scope, scopeValue));
      }
    }
    if (companyId) {
      conditions.push(eq(knowledgeLayers.companyId, parseInt(companyId as string)));
    }
    if (assignmentId) {
      conditions.push(eq(knowledgeLayers.assignmentId, parseInt(assignmentId as string)));
    }
    if (category) {
      conditions.push(eq(knowledgeLayers.category, category as string));
    }
    if (itemType) {
      const itemTypeValue = String(itemType);
      if (
        itemTypeValue === "document" ||
        itemTypeValue === "framework" ||
        itemTypeValue === "case_study" ||
        itemTypeValue === "memory" ||
        itemTypeValue === "conversation" ||
        itemTypeValue === "training_material" ||
        itemTypeValue === "note"
      ) {
        conditions.push(eq(knowledgeLayers.itemType, itemTypeValue));
      }
    }
    
    const knowledge = await db.select()
      .from(knowledgeLayers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(knowledgeLayers.createdAt));
    
    res.json(knowledge);
  } catch (error: any) {
    console.error("[Expert Clones] Error fetching knowledge:", error);
    res.status(500).json({ message: "Failed to fetch knowledge", error: error.message });
  }
});

// POST /api/expert-clones/knowledge - Create knowledge item
router.post("/knowledge", async (req, res) => {
  try {
    const {
      scope,
      companyId,
      assignmentId,
      itemType,
      title,
      content,
      summary,
      sourceType,
      sourceUrl,
      category,
      tags,
      keywords,
      isPublic,
      accessLevel,
      metadata
    } = req.body;
    
    // Validation
    if (!scope || !itemType || !title) {
      return res.status(400).json({ message: "Scope, item type, and title are required" });
    }
    
    // Validate scope requirements
    if (scope === 'global' && (companyId || assignmentId)) {
      return res.status(400).json({ message: "Global scope cannot have company or assignment ID" });
    }
    if (scope === 'company' && (!companyId || assignmentId)) {
      return res.status(400).json({ message: "Company scope requires company ID and no assignment ID" });
    }
    if (scope === 'agent' && (!companyId || !assignmentId)) {
      return res.status(400).json({ message: "Agent scope requires both company ID and assignment ID" });
    }
    
    const [newKnowledge] = await db.insert(knowledgeLayers)
      .values({
        scope,
        companyId: companyId || null,
        assignmentId: assignmentId || null,
        itemType,
        title,
        content: content || null,
        summary: summary || null,
        sourceType: sourceType || 'uploaded',
        sourceUrl: sourceUrl || null,
        category: category || null,
        tags: tags || [],
        keywords: keywords || [],
        isPublic: isPublic || false,
        accessLevel: accessLevel || 'agent_only',
        metadata: metadata || {}
      })
      .returning();
    
    res.status(201).json(newKnowledge);
  } catch (error: any) {
    console.error("[Expert Clones] Error creating knowledge:", error);
    res.status(500).json({ message: "Failed to create knowledge", error: error.message });
  }
});

// PATCH /api/expert-clones/knowledge/:id - Update knowledge item
router.patch("/knowledge/:id", async (req, res) => {
  try {
    const knowledgeId = parseInt(req.params.id);
    const updates: any = {};
    
    // Whitelist updatable fields
    const updatableFields = [
      'title', 'content', 'summary', 'category', 'tags', 'keywords',
      'isPublic', 'accessLevel', 'qualityScore', 'relevanceScore', 'metadata'
    ];
    
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    
    updates.updatedAt = new Date();
    
    const [updatedKnowledge] = await db.update(knowledgeLayers)
      .set(updates)
      .where(eq(knowledgeLayers.id, knowledgeId))
      .returning();
    
    if (!updatedKnowledge) {
      return res.status(404).json({ message: "Knowledge item not found" });
    }
    
    res.json(updatedKnowledge);
  } catch (error: any) {
    console.error("[Expert Clones] Error updating knowledge:", error);
    res.status(500).json({ message: "Failed to update knowledge", error: error.message });
  }
});

// DELETE /api/expert-clones/knowledge/:id - Delete knowledge item
router.delete("/knowledge/:id", async (req, res) => {
  try {
    const knowledgeId = parseInt(req.params.id);
    
    const [deletedKnowledge] = await db.delete(knowledgeLayers)
      .where(eq(knowledgeLayers.id, knowledgeId))
      .returning();
    
    if (!deletedKnowledge) {
      return res.status(404).json({ message: "Knowledge item not found" });
    }
    
    res.json({ message: "Knowledge item deleted successfully", knowledge: deletedKnowledge });
  } catch (error: any) {
    console.error("[Expert Clones] Error deleting knowledge:", error);
    res.status(500).json({ message: "Failed to delete knowledge", error: error.message });
  }
});

// ========================================
// DIAGNOSTICS ENDPOINTS
// ========================================

// GET /api/expert-clones/diagnostics/company/:companyId - Get company diagnostics
router.get("/diagnostics/company/:companyId", async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    const daysRaw = req.query.days as string | undefined;
    const days = Math.min(Math.max(parseInt(daysRaw || "30", 10) || 30, 1), 365);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Get company metrics from AssignmentService
    const metrics = await AssignmentService.getCompanyMetrics(companyId);
    
    // Get diagnostics with joined assignment and clone profile data for top performers
    const diagnosticsWithProfiles = await db.query.agentDiagnostics.findMany({
      where: and(
        eq(agentDiagnostics.companyId, companyId),
        gte(agentDiagnostics.metricDate, startDate)
      ),
      with: {
        assignment: {
          with: {
            cloneProfile: true,
          },
        },
      },
    });
    
    // Aggregate diagnostics by assignment for "top performers" (last N days)
    const perAssignment = new Map<
      number,
      {
        assignmentId: number;
        roleName: string;
        cloneProfile: { displayName: string; title: string; category: string } | null;
        tasksCompleted: number;
        tasksFailed: number;
        tokensUsed: number;
      }
    >();

    for (const diag of diagnosticsWithProfiles) {
      const assignmentId = diag.assignmentId;
      if (!assignmentId) continue;

      const assignment = (diag as any).assignment as any;
      if (!assignment) continue;
      if (!(assignment.status === "active" || assignment.status === "learning")) continue;

      const existing =
        perAssignment.get(assignmentId) ??
        {
          assignmentId,
          roleName: assignment.roleWithinCompany || "Unknown role",
          cloneProfile: assignment.cloneProfile
            ? {
                displayName: assignment.cloneProfile.displayName,
                title: assignment.cloneProfile.title,
                category: assignment.cloneProfile.category,
              }
            : null,
          tasksCompleted: 0,
          tasksFailed: 0,
          tokensUsed: 0,
        };

      existing.tasksCompleted += diag.tasksCompleted || 0;
      existing.tasksFailed += diag.tasksFailed || 0;
      existing.tokensUsed += Number((diag.metadata as any)?.tokensUsed || 0);

      perAssignment.set(assignmentId, existing);
    }

    const assignmentsWithDiagnostics = Array.from(perAssignment.values()).map((a) => {
      const total = a.tasksCompleted + a.tasksFailed;
      const successRate = total > 0 ? ((a.tasksCompleted / total) * 100).toFixed(2) : "0";
      return {
        assignmentId: a.assignmentId,
        roleName: a.roleName,
        cloneProfile: a.cloneProfile,
        successRate,
        tasksCompleted: a.tasksCompleted,
      };
    });
    
    // Sort by success rate and tasks completed
    const topPerformers = assignmentsWithDiagnostics
      .filter(a => a.tasksCompleted > 0)
      .sort((a, b) => {
        const rateA = parseFloat(a.successRate);
        const rateB = parseFloat(b.successRate);
        if (rateB !== rateA) return rateB - rateA;
        return b.tasksCompleted - a.tasksCompleted;
      })
      .slice(0, 5);
    
    // Calculate aggregate metrics from diagnostics
    const allDiagnostics = diagnosticsWithProfiles;
    
    const totalCompleted = allDiagnostics.reduce((sum, d) => sum + (d.tasksCompleted || 0), 0);
    const totalFailed = allDiagnostics.reduce((sum, d) => sum + (d.tasksFailed || 0), 0);
    const totalTasks = totalCompleted + totalFailed;

    const totalResponseTimeMs = allDiagnostics.reduce(
      (sum, d) => sum + ((d.avgResponseTimeSeconds || 0) * 1000),
      0
    );
    const responseSamples = allDiagnostics.length;

    const totalCost = allDiagnostics.reduce((sum, d) => sum + parseFloat((d.totalCost as any) || "0"), 0);
    const totalTokens = allDiagnostics.reduce((sum, d) => sum + Number((d.metadata as any)?.tokensUsed || 0), 0);
    
    const successRate = totalTasks > 0 ? ((totalCompleted / totalTasks) * 100).toFixed(2) : '0';
    const averageResponseTime = responseSamples > 0 
      ? Math.round(totalResponseTimeMs / responseSamples)
      : 0;
    
    res.json({
      companyId,
      metrics: {
        totalAssignments: metrics.totalAssignments,
        activeAssignments: metrics.activeAssignments,
        totalTasks,
        successRate,
        averageResponseTime,
        totalCost: totalCost.toFixed(4),
        tokensUsed: totalTokens,
      },
      topPerformers,
    });
  } catch (error: any) {
    console.error("[Expert Clones] Error fetching company diagnostics:", error);
    res.status(500).json({ message: "Failed to fetch diagnostics", error: error.message });
  }
});

// GET /api/expert-clones/diagnostics/assignment/:assignmentId - Get assignment diagnostics
router.get("/diagnostics/assignment/:assignmentId", async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId);
    const period = (req.query.period as string) || "last_30_days";
    const daysRaw = req.query.days as string | undefined;
    const days = Math.min(Math.max(parseInt(daysRaw || "30", 10) || 30, 1), 365);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const diagnosticsRows = await db.query.agentDiagnostics.findMany({
      where: and(eq(agentDiagnostics.assignmentId, assignmentId), gte(agentDiagnostics.metricDate, startDate)),
      orderBy: [desc(agentDiagnostics.metricDate)],
    });
    
    const tasksCompleted = diagnosticsRows.reduce((sum, d) => sum + (d.tasksCompleted || 0), 0);
    const tasksFailed = diagnosticsRows.reduce((sum, d) => sum + (d.tasksFailed || 0), 0);
    const tasksReceived = tasksCompleted + tasksFailed;

    const totalResponseTimeMs = diagnosticsRows.reduce(
      (sum, d) => sum + ((d.avgResponseTimeSeconds || 0) * 1000),
      0
    );
    const responseSamples = diagnosticsRows.length;
    const averageResponseTime = responseSamples > 0 ? Math.round(totalResponseTimeMs / responseSamples) : 0;

    const costIncurred = diagnosticsRows
      .reduce((sum, d) => sum + parseFloat((d.totalCost as any) || "0"), 0)
      .toFixed(4);

    const tokensUsed = diagnosticsRows.reduce((sum, d) => sum + Number((d.metadata as any)?.tokensUsed || 0), 0);

    const messagesReceived = diagnosticsRows.reduce((sum, d) => sum + (d.messagesReceived || 0), 0);
    const messagesSent = diagnosticsRows.reduce((sum, d) => sum + (d.messagesSent || 0), 0);

    const qualityScoreAvg =
      responseSamples > 0
        ? diagnosticsRows.reduce((sum, d) => sum + parseFloat((d.qualityScore as any) || "0"), 0) / responseSamples
        : 0;

    const successRate =
      tasksReceived > 0 ? ((tasksCompleted / tasksReceived) * 100).toFixed(2) : "0";
    
    res.json({
      id: diagnosticsRows[0]?.id || 0,
      assignmentId,
      period,
      tasksReceived,
      tasksCompleted,
      tasksSucceeded: tasksCompleted,
      tasksFailed,
      averageResponseTime,
      successRate,
      tokensUsed,
      costIncurred,
      messagesReceived,
      messagesSent,
      conversationsHandled: 0,
      qualityScore: qualityScoreAvg.toFixed(2),
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Expert Clones] Error fetching assignment diagnostics:", error);
    res.status(500).json({ message: "Failed to fetch diagnostics", error: error.message });
  }
});

export default router;
