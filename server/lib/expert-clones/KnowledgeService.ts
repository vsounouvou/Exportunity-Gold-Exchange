import { db } from "@db";
import { knowledgeLayers, companyCloneAssignments } from "@db/schema/unified_expert_clones";
import { eq, and, or, desc, sql } from "drizzle-orm";

export type KnowledgeScope = 'global' | 'company' | 'agent';
export type KnowledgeItemType = 'document' | 'framework' | 'case_study' | 'memory' | 'conversation' | 'training_material' | 'note';
export type AccessLevel = 'public' | 'company' | 'team' | 'agent_only';

export interface CreateKnowledgeParams {
  scope: KnowledgeScope;
  companyId?: number | null;
  assignmentId?: number | null;
  itemType: KnowledgeItemType;
  title: string;
  content?: string;
  summary?: string;
  category?: string;
  tags?: string[];
  keywords?: string[];
  isPublic?: boolean;
  accessLevel?: AccessLevel;
  sourceType?: 'uploaded' | 'generated' | 'learned' | 'imported' | 'conversation';
  sourceUrl?: string;
  metadata?: Record<string, any>;
}

export interface UpdateKnowledgeParams {
  title?: string;
  content?: string;
  summary?: string;
  category?: string;
  tags?: string[];
  keywords?: string[];
  isPublic?: boolean;
  accessLevel?: AccessLevel;
  qualityScore?: number;
  metadata?: Record<string, any>;
}

export interface KnowledgeQueryParams {
  scope?: KnowledgeScope;
  companyId?: number;
  assignmentId?: number;
  category?: string;
  itemType?: KnowledgeItemType;
  keywords?: string[];
  accessibleBy?: {
    companyId: number;
    assignmentId?: number;
  };
}

export class KnowledgeService {
  
  /**
   * Validate scope requirements
   */
  private static validateScope(
    scope: KnowledgeScope,
    companyId?: number | null,
    assignmentId?: number | null
  ): void {
    if (scope === 'global') {
      if (companyId !== null && companyId !== undefined) {
        throw new Error('Global scope knowledge cannot have companyId');
      }
      if (assignmentId !== null && assignmentId !== undefined) {
        throw new Error('Global scope knowledge cannot have assignmentId');
      }
    }
    
    if (scope === 'company') {
      if (!companyId) {
        throw new Error('Company scope knowledge requires companyId');
      }
      if (assignmentId !== null && assignmentId !== undefined) {
        throw new Error('Company scope knowledge cannot have assignmentId');
      }
    }
    
    if (scope === 'agent') {
      if (!companyId) {
        throw new Error('Agent scope knowledge requires companyId');
      }
      if (!assignmentId) {
        throw new Error('Agent scope knowledge requires assignmentId');
      }
    }
  }
  
  /**
   * Create a new knowledge item
   */
  static async createKnowledge(params: CreateKnowledgeParams) {
    try {
      const {
        scope,
        companyId,
        assignmentId,
        itemType,
        title,
        content,
        summary,
        category,
        tags = [],
        keywords = [],
        isPublic = false,
        accessLevel = 'agent_only',
        sourceType = 'uploaded',
        sourceUrl,
        metadata = {},
      } = params;
      
      // Validate scope requirements
      this.validateScope(scope, companyId, assignmentId);
      
      // If assignmentId is provided, verify it exists and belongs to the company
      if (assignmentId) {
        const assignment = await db.query.companyCloneAssignments.findFirst({
          where: eq(companyCloneAssignments.id, assignmentId),
        });
        
        if (!assignment) {
          throw new Error(`Assignment ${assignmentId} not found`);
        }
        
        if (assignment.companyId !== companyId) {
          throw new Error(`Assignment ${assignmentId} does not belong to company ${companyId}`);
        }
      }
      
      // Create knowledge item
      const [knowledge] = await db.insert(knowledgeLayers).values({
        scope,
        companyId: companyId || null,
        assignmentId: assignmentId || null,
        itemType,
        title,
        content: content || null,
        summary: summary || null,
        category: category || null,
        tags,
        keywords,
        isPublic,
        accessLevel,
        sourceType,
        sourceUrl: sourceUrl || null,
        metadata,
        usageCount: 0,
      }).returning();
      
      console.log(`[KnowledgeService] Created ${scope} knowledge item ${knowledge.id}: ${title}`);
      
      return knowledge;
    } catch (error: any) {
      console.error('[KnowledgeService] Error creating knowledge:', error);
      throw error;
    }
  }
  
  /**
   * Get accessible knowledge for a specific assignment (3-layer hierarchy)
   * Returns: Agent-specific + Company-specific + Global knowledge
   */
  static async getAccessibleKnowledge(
    companyId: number,
    assignmentId?: number,
    filters?: {
      itemType?: KnowledgeItemType;
      category?: string;
      keywords?: string[];
    }
  ) {
    try {
      const conditions = [];
      
      // Layer 1: Global knowledge (accessible to everyone)
      const globalCondition = eq(knowledgeLayers.scope, 'global');
      
      // Layer 2: Company knowledge (accessible to all company assignments)
      const companyCondition = and(
        eq(knowledgeLayers.scope, 'company'),
        eq(knowledgeLayers.companyId, companyId)
      );
      
      // Layer 3: Agent knowledge (accessible only to specific assignment)
      let agentCondition = null;
      if (assignmentId) {
        agentCondition = and(
          eq(knowledgeLayers.scope, 'agent'),
          eq(knowledgeLayers.assignmentId, assignmentId)
        );
      }
      
      // Combine all layers
      const scopeConditions = agentCondition
        ? or(globalCondition, companyCondition, agentCondition)
        : or(globalCondition, companyCondition);
      
      conditions.push(scopeConditions!);
      
      // Apply filters
      if (filters?.itemType) {
        conditions.push(eq(knowledgeLayers.itemType, filters.itemType));
      }
      if (filters?.category) {
        conditions.push(eq(knowledgeLayers.category, filters.category));
      }
      
      const knowledge = await db.query.knowledgeLayers.findMany({
        where: and(...conditions),
        orderBy: [desc(knowledgeLayers.relevanceScore), desc(knowledgeLayers.createdAt)],
      });
      
      // Filter by keywords if provided (manual filter since keywords is JSONB array)
      let filteredKnowledge = knowledge;
      if (filters?.keywords && filters.keywords.length > 0) {
        filteredKnowledge = knowledge.filter(k => {
          const kKeywords = k.keywords || [];
          return filters.keywords!.some(keyword => kKeywords.includes(keyword));
        });
      }
      
      return filteredKnowledge;
    } catch (error: any) {
      console.error('[KnowledgeService] Error getting accessible knowledge:', error);
      throw error;
    }
  }
  
  /**
   * Get knowledge by ID with access validation
   */
  static async getKnowledgeById(
    knowledgeId: number,
    accessContext?: {
      companyId: number;
      assignmentId?: number;
    }
  ) {
    try {
      const knowledge = await db.query.knowledgeLayers.findFirst({
        where: eq(knowledgeLayers.id, knowledgeId),
      });
      
      if (!knowledge) {
        throw new Error(`Knowledge item ${knowledgeId} not found`);
      }
      
      // Validate access if context is provided
      if (accessContext) {
        const hasAccess = this.checkAccess(knowledge, accessContext);
        if (!hasAccess) {
          throw new Error(`Access denied to knowledge item ${knowledgeId}`);
        }
      }
      
      // Increment usage count
      await db.update(knowledgeLayers)
        .set({
          usageCount: (knowledge.usageCount || 0) + 1,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(knowledgeLayers.id, knowledgeId));
      
      return knowledge;
    } catch (error: any) {
      console.error('[KnowledgeService] Error getting knowledge:', error);
      throw error;
    }
  }
  
  /**
   * Check if an assignment has access to a knowledge item
   */
  private static checkAccess(
    knowledge: any,
    context: { companyId: number; assignmentId?: number }
  ): boolean {
    // Global knowledge is accessible to everyone
    if (knowledge.scope === 'global') {
      return true;
    }
    
    // Company knowledge is accessible to all assignments in that company
    if (knowledge.scope === 'company') {
      return knowledge.companyId === context.companyId;
    }
    
    // Agent knowledge is accessible only to the specific assignment
    if (knowledge.scope === 'agent') {
      return (
        knowledge.companyId === context.companyId &&
        knowledge.assignmentId === context.assignmentId
      );
    }
    
    return false;
  }
  
  /**
   * Update knowledge item
   */
  static async updateKnowledge(
    knowledgeId: number,
    updates: UpdateKnowledgeParams,
    accessContext?: {
      companyId: number;
      assignmentId?: number;
    }
  ) {
    try {
      // Get and validate access
      const knowledge = await this.getKnowledgeById(knowledgeId, accessContext);
      
      const updateData: any = {
        ...updates,
        qualityScore: updates.qualityScore?.toString(),
        updatedAt: new Date(),
      };
      
      const [updated] = await db.update(knowledgeLayers)
        .set(updateData)
        .where(eq(knowledgeLayers.id, knowledgeId))
        .returning();
      
      console.log(`[KnowledgeService] Updated knowledge item ${knowledgeId}`);
      
      return updated;
    } catch (error: any) {
      console.error('[KnowledgeService] Error updating knowledge:', error);
      throw error;
    }
  }
  
  /**
   * Delete knowledge item
   */
  static async deleteKnowledge(
    knowledgeId: number,
    accessContext?: {
      companyId: number;
      assignmentId?: number;
    }
  ) {
    try {
      // Get and validate access
      await this.getKnowledgeById(knowledgeId, accessContext);
      
      const [deleted] = await db.delete(knowledgeLayers)
        .where(eq(knowledgeLayers.id, knowledgeId))
        .returning();
      
      console.log(`[KnowledgeService] Deleted knowledge item ${knowledgeId}`);
      
      return deleted;
    } catch (error: any) {
      console.error('[KnowledgeService] Error deleting knowledge:', error);
      throw error;
    }
  }
  
  /**
   * Search knowledge by keywords
   */
  static async searchKnowledge(
    query: string,
    companyId: number,
    assignmentId?: number,
    filters?: {
      scope?: KnowledgeScope;
      itemType?: KnowledgeItemType;
      category?: string;
    }
  ) {
    try {
      // Get accessible knowledge first
      const knowledge = await this.getAccessibleKnowledge(companyId, assignmentId, {
        itemType: filters?.itemType,
        category: filters?.category,
      });
      
      // Filter by scope if specified
      let filteredKnowledge = knowledge;
      if (filters?.scope) {
        filteredKnowledge = knowledge.filter(k => k.scope === filters.scope);
      }
      
      // Search in title, content, summary, keywords
      const searchLower = query.toLowerCase();
      const results = filteredKnowledge.filter(k => {
        const titleMatch = k.title?.toLowerCase().includes(searchLower);
        const contentMatch = k.content?.toLowerCase().includes(searchLower);
        const summaryMatch = k.summary?.toLowerCase().includes(searchLower);
        const keywordMatch = (k.keywords || []).some(kw => 
          kw.toLowerCase().includes(searchLower)
        );
        
        return titleMatch || contentMatch || summaryMatch || keywordMatch;
      });
      
      return results;
    } catch (error: any) {
      console.error('[KnowledgeService] Error searching knowledge:', error);
      throw error;
    }
  }
  
  /**
   * Get knowledge statistics for a company
   */
  static async getCompanyKnowledgeStats(companyId: number) {
    try {
      const knowledge = await db.query.knowledgeLayers.findMany({
        where: or(
          eq(knowledgeLayers.scope, 'global'),
          and(
            eq(knowledgeLayers.scope, 'company'),
            eq(knowledgeLayers.companyId, companyId)
          )
        ),
      });
      
      const agentKnowledge = await db.query.knowledgeLayers.findMany({
        where: and(
          eq(knowledgeLayers.scope, 'agent'),
          eq(knowledgeLayers.companyId, companyId)
        ),
      });
      
      const stats = {
        total: knowledge.length + agentKnowledge.length,
        global: knowledge.filter(k => k.scope === 'global').length,
        company: knowledge.filter(k => k.scope === 'company').length,
        agent: agentKnowledge.length,
        byType: {} as Record<string, number>,
        totalUsage: knowledge.reduce((sum, k) => sum + (k.usageCount || 0), 0) +
          agentKnowledge.reduce((sum, k) => sum + (k.usageCount || 0), 0),
      };
      
      // Count by type
      [...knowledge, ...agentKnowledge].forEach(k => {
        const type = k.itemType || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      });
      
      return stats;
    } catch (error: any) {
      console.error('[KnowledgeService] Error getting knowledge stats:', error);
      throw error;
    }
  }
}
