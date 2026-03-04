import { db } from "@db";
import { companyCloneAssignments, cloneProfiles, agentDiagnostics } from "@db/schema/unified_expert_clones";
import { eq, and, or, desc } from "drizzle-orm";
import { validateStatusTransition, type AssignmentStatus } from "../../validation/expert-clones";

export interface CreateAssignmentParams {
  companyId: number;
  cloneProfileId: number;
  roleWithinCompany: string;
  departmentId?: number | null;
  managerAgentId?: number | null;
  tierId?: number | null;
  accessScope?: any;
  config?: any;
}

export interface UpdateAssignmentParams {
  roleWithinCompany?: string;
  departmentId?: number | null;
  managerAgentId?: number | null;
  dailyCost?: number;
  weeklyCost?: number;
  monthlyCost?: number;
  accessScope?: any;
  config?: any;
}

export interface AssignmentMetrics {
  totalAssignments: number;
  activeAssignments: number;
  learningAssignments: number;
  pausedAssignments: number;
  terminatedAssignments: number;
  totalDailyCost: number;
  totalWeeklyCost: number;
  totalMonthlyCost: number;
}

export class AssignmentService {
  
  /**
   * Get company assignments with optional filtering
   */
  static async getCompanyAssignments(
    companyId: number,
    filters?: {
      status?: AssignmentStatus;
      cloneProfileId?: number;
      departmentId?: number;
    }
  ) {
    try {
      const conditions = [eq(companyCloneAssignments.companyId, companyId)];
      
      if (filters?.status) {
        conditions.push(eq(companyCloneAssignments.status, filters.status));
      }
      if (filters?.cloneProfileId) {
        conditions.push(eq(companyCloneAssignments.cloneProfileId, filters.cloneProfileId));
      }
      if (filters?.departmentId) {
        conditions.push(eq(companyCloneAssignments.departmentId, filters.departmentId));
      }
      
      const assignments = await db.query.companyCloneAssignments.findMany({
        where: and(...conditions),
        with: {
          cloneProfile: true,
        },
        orderBy: [desc(companyCloneAssignments.createdAt)],
      });
      
      return assignments;
    } catch (error: any) {
      console.error('[AssignmentService] Error fetching assignments:', error);
      throw new Error(`Failed to fetch assignments: ${error.message}`);
    }
  }
  
  /**
   * Get assignment by ID with company validation
   */
  static async getAssignment(assignmentId: number, companyId: number) {
    try {
      const assignment = await db.query.companyCloneAssignments.findFirst({
        where: and(
          eq(companyCloneAssignments.id, assignmentId),
          eq(companyCloneAssignments.companyId, companyId)
        ),
        with: {
          cloneProfile: true,
        },
      });
      
      if (!assignment) {
        throw new Error(`Assignment ${assignmentId} not found for company ${companyId}`);
      }
      
      return assignment;
    } catch (error: any) {
      console.error('[AssignmentService] Error fetching assignment:', error);
      throw error;
    }
  }
  
  /**
   * Create a new assignment
   */
  static async createAssignment(params: CreateAssignmentParams) {
    try {
      const {
        companyId,
        cloneProfileId,
        roleWithinCompany,
        departmentId,
        managerAgentId,
        tierId,
        accessScope,
        config,
      } = params;
      
      // Verify clone profile exists
      const profile = await db.query.cloneProfiles.findFirst({
        where: eq(cloneProfiles.id, cloneProfileId),
      });
      
      if (!profile) {
        throw new Error(`Clone profile ${cloneProfileId} not found`);
      }
      
      // Check for existing active assignment
      const existingAssignment = await db.query.companyCloneAssignments.findFirst({
        where: and(
          eq(companyCloneAssignments.companyId, companyId),
          eq(companyCloneAssignments.cloneProfileId, cloneProfileId),
          or(
            eq(companyCloneAssignments.status, 'active'),
            eq(companyCloneAssignments.status, 'learning'),
            eq(companyCloneAssignments.status, 'paused')
          )
        ),
      });
      
      if (existingAssignment) {
        throw new Error(`Clone ${profile.displayName} is already assigned to this company (assignment ${existingAssignment.id})`);
      }
      
      // Calculate costs from profile (TODO: implement tier pricing)
      const baseCost = parseFloat(profile.baseDailyCost || "0");
      const dailyCost = baseCost;
      const weeklyCost = baseCost * 7;
      const monthlyCost = baseCost * 30;
      
      // Create assignment with pending status
      const [assignment] = await db.insert(companyCloneAssignments).values({
        companyId,
        cloneProfileId,
        roleWithinCompany,
        departmentId,
        managerAgentId,
        tierId,
        status: 'pending',
        dailyCost: dailyCost.toFixed(2),
        weeklyCost: weeklyCost.toFixed(2),
        monthlyCost: monthlyCost.toFixed(2),
        accessScope: accessScope || {},
        config: config || {},
      }).returning();
      
      // Initialize diagnostics
      await this.initializeDiagnostics(assignment.id, companyId);
      
      console.log(`[AssignmentService] Created assignment ${assignment.id} for company ${companyId}`);
      
      return assignment;
    } catch (error: any) {
      console.error('[AssignmentService] Error creating assignment:', error);
      throw error;
    }
  }
  
  /**
   * Update assignment (non-status fields only)
   */
  static async updateAssignment(
    assignmentId: number,
    companyId: number,
    updates: UpdateAssignmentParams
  ) {
    try {
      // Verify ownership
      await this.getAssignment(assignmentId, companyId);
      
      const updateData: any = {
        ...updates,
        dailyCost: updates.dailyCost?.toString(),
        weeklyCost: updates.weeklyCost?.toString(),
        monthlyCost: updates.monthlyCost?.toString(),
        updatedAt: new Date(),
      };
      
      const [updatedAssignment] = await db.update(companyCloneAssignments)
        .set(updateData)
        .where(eq(companyCloneAssignments.id, assignmentId))
        .returning();
      
      console.log(`[AssignmentService] Updated assignment ${assignmentId}`);
      
      return updatedAssignment;
    } catch (error: any) {
      console.error('[AssignmentService] Error updating assignment:', error);
      throw error;
    }
  }
  
  /**
   * Activate assignment (status transition: pending/learning → active)
   */
  static async activateAssignment(assignmentId: number, companyId: number) {
    try {
      const assignment = await this.getAssignment(assignmentId, companyId);
      
      // Validate transition
      validateStatusTransition(assignment.status as AssignmentStatus, 'active');
      
      const [updatedAssignment] = await db.update(companyCloneAssignments)
        .set({
          status: 'active',
          startDate: new Date(),
          activatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companyCloneAssignments.id, assignmentId))
        .returning();
      
      console.log(`[AssignmentService] Activated assignment ${assignmentId}`);
      
      return updatedAssignment;
    } catch (error: any) {
      console.error('[AssignmentService] Error activating assignment:', error);
      throw error;
    }
  }
  
  /**
   * Pause assignment (status transition: active → paused)
   */
  static async pauseAssignment(assignmentId: number, companyId: number) {
    try {
      const assignment = await this.getAssignment(assignmentId, companyId);
      
      // Validate transition
      validateStatusTransition(assignment.status as AssignmentStatus, 'paused');
      
      const [updatedAssignment] = await db.update(companyCloneAssignments)
        .set({
          status: 'paused',
          updatedAt: new Date(),
        })
        .where(eq(companyCloneAssignments.id, assignmentId))
        .returning();
      
      console.log(`[AssignmentService] Paused assignment ${assignmentId}`);
      
      return updatedAssignment;
    } catch (error: any) {
      console.error('[AssignmentService] Error pausing assignment:', error);
      throw error;
    }
  }
  
  /**
   * Resume assignment (status transition: paused → active)
   */
  static async resumeAssignment(assignmentId: number, companyId: number) {
    try {
      const assignment = await this.getAssignment(assignmentId, companyId);
      
      // Validate transition (paused → active)
      validateStatusTransition(assignment.status as AssignmentStatus, 'active');
      
      const [updatedAssignment] = await db.update(companyCloneAssignments)
        .set({
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(companyCloneAssignments.id, assignmentId))
        .returning();
      
      console.log(`[AssignmentService] Resumed assignment ${assignmentId}`);
      
      return updatedAssignment;
    } catch (error: any) {
      console.error('[AssignmentService] Error resuming assignment:', error);
      throw error;
    }
  }
  
  /**
   * Terminate assignment (status transition: any → terminated)
   */
  static async terminateAssignment(assignmentId: number, companyId: number) {
    try {
      const assignment = await this.getAssignment(assignmentId, companyId);
      
      // Validate transition
      validateStatusTransition(assignment.status as AssignmentStatus, 'terminated');
      
      const [updatedAssignment] = await db.update(companyCloneAssignments)
        .set({
          status: 'terminated',
          endDate: new Date(),
          terminatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companyCloneAssignments.id, assignmentId))
        .returning();
      
      console.log(`[AssignmentService] Terminated assignment ${assignmentId}`);
      
      return updatedAssignment;
    } catch (error: any) {
      console.error('[AssignmentService] Error terminating assignment:', error);
      throw error;
    }
  }
  
  /**
   * Delete assignment (hard delete)
   */
  static async deleteAssignment(assignmentId: number, companyId: number) {
    try {
      // Verify ownership
      await this.getAssignment(assignmentId, companyId);
      
      // Delete diagnostics first
      await db.delete(agentDiagnostics)
        .where(eq(agentDiagnostics.assignmentId, assignmentId));
      
      // Delete assignment
      const [deletedAssignment] = await db.delete(companyCloneAssignments)
        .where(eq(companyCloneAssignments.id, assignmentId))
        .returning();
      
      console.log(`[AssignmentService] Deleted assignment ${assignmentId}`);
      
      return deletedAssignment;
    } catch (error: any) {
      console.error('[AssignmentService] Error deleting assignment:', error);
      throw error;
    }
  }
  
  /**
   * Get company assignment metrics
   */
  static async getCompanyMetrics(companyId: number): Promise<AssignmentMetrics> {
    try {
      const assignments = await db.query.companyCloneAssignments.findMany({
        where: eq(companyCloneAssignments.companyId, companyId),
      });
      
      const activeAssignments = assignments.filter(a => a.status === 'active');
      
      const metrics: AssignmentMetrics = {
        totalAssignments: assignments.length,
        activeAssignments: activeAssignments.length,
        learningAssignments: assignments.filter(a => a.status === 'learning').length,
        pausedAssignments: assignments.filter(a => a.status === 'paused').length,
        terminatedAssignments: assignments.filter(a => a.status === 'terminated').length,
        totalDailyCost: activeAssignments.reduce((sum, a) => sum + parseFloat(a.dailyCost || '0'), 0),
        totalWeeklyCost: activeAssignments.reduce((sum, a) => sum + parseFloat(a.weeklyCost || '0'), 0),
        totalMonthlyCost: activeAssignments.reduce((sum, a) => sum + parseFloat(a.monthlyCost || '0'), 0),
      };
      
      return metrics;
    } catch (error: any) {
      console.error('[AssignmentService] Error getting company metrics:', error);
      throw error;
    }
  }
  
  /**
   * Initialize diagnostics for new assignment
   */
  private static async initializeDiagnostics(assignmentId: number, companyId: number) {
    try {
      const metricDate = new Date();
      metricDate.setHours(0, 0, 0, 0);

      await db.insert(agentDiagnostics).values({
        companyId,
        assignmentId,
        metricDate,
        tasksCompleted: 0,
        tasksFailed: 0,
        messagesSent: 0,
        messagesReceived: 0,
        meetingsAttended: 0,
        knowledgeItemsAccessed: 0,
        avgResponseTimeSeconds: 0,
        totalCost: "0.00",
        qualityScore: "0.00",
        userSatisfactionScore: "0.00",
        errorsCount: 0,
        metadata: {},
        updatedAt: new Date(),
      });
      
      console.log(`[AssignmentService] Initialized diagnostics for assignment ${assignmentId}`);
    } catch (error: any) {
      console.error('[AssignmentService] Error initializing diagnostics:', error);
    }
  }
  
  /**
   * Record task completion for diagnostics
   */
  static async recordTaskCompletion(
    assignmentId: number,
    success: boolean,
    responseTime: number,
    tokensUsed: number,
    cost: number
  ) {
    try {
      const assignment = await db.query.companyCloneAssignments.findFirst({
        where: eq(companyCloneAssignments.id, assignmentId),
      });

      if (!assignment) return;

      const metricDate = new Date();
      metricDate.setHours(0, 0, 0, 0);

      let diagnostics = await db.query.agentDiagnostics.findFirst({
        where: and(
          eq(agentDiagnostics.assignmentId, assignmentId),
          eq(agentDiagnostics.companyId, assignment.companyId),
          eq(agentDiagnostics.metricDate, metricDate)
        ),
      });

      if (!diagnostics) {
        const [created] = await db.insert(agentDiagnostics).values({
          companyId: assignment.companyId,
          assignmentId,
          metricDate,
          tasksCompleted: 0,
          tasksFailed: 0,
          messagesSent: 0,
          messagesReceived: 0,
          meetingsAttended: 0,
          knowledgeItemsAccessed: 0,
          avgResponseTimeSeconds: 0,
          totalCost: "0.00",
          qualityScore: "0.00",
          userSatisfactionScore: "0.00",
          errorsCount: 0,
          metadata: {},
          updatedAt: new Date(),
        }).returning();

        diagnostics = created as any;
      }

      if (!diagnostics) return;

      const prevCompleted = diagnostics.tasksCompleted || 0;
      const prevFailed = diagnostics.tasksFailed || 0;
      const prevTotal = prevCompleted + prevFailed;
      const nextTotal = prevTotal + 1;

      const nextCompleted = prevCompleted + (success ? 1 : 0);
      const nextFailed = prevFailed + (success ? 0 : 1);

      const prevAvgSeconds = diagnostics.avgResponseTimeSeconds || 0;
      const nextAvgSeconds = Math.round(((prevAvgSeconds * prevTotal) + (responseTime / 1000)) / nextTotal);

      const prevTokens = Number((diagnostics.metadata as any)?.tokensUsed || 0);
      const nextTokens = prevTokens + tokensUsed;

      const prevCost = parseFloat((diagnostics.totalCost as any) || "0");
      const nextCost = (prevCost + cost).toFixed(2);

      await db.update(agentDiagnostics).set({
        tasksCompleted: nextCompleted,
        tasksFailed: nextFailed,
        avgResponseTimeSeconds: nextAvgSeconds,
        totalCost: nextCost,
        metadata: {
          ...((diagnostics.metadata as any) || {}),
          tokensUsed: nextTokens,
        },
        updatedAt: new Date(),
      }).where(eq(agentDiagnostics.id, diagnostics.id));
      
      // Update assignment's last active time
      await db.update(companyCloneAssignments)
        .set({
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companyCloneAssignments.id, assignmentId));
      
    } catch (error: any) {
      console.error('[AssignmentService] Error recording task completion:', error);
    }
  }
}
