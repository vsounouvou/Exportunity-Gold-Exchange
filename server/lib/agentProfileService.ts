import { db } from "@db";
import { agents, agentRoleTemplates, activityLog } from "@db/schema";
import { eq, desc, and } from "drizzle-orm";

export interface RoleContextWindow {
  roleLevel: number;
  baseTokens: number;
  bonusTokens: number;
  totalTokens: number;
  decisionAuthority: 'low' | 'medium' | 'high' | 'executive';
  canApproveBelow: boolean;
}

export interface AgentProfile {
  id: number;
  name: string;
  role: string;
  department: string | null;
  roleLevel: number;
  contextWindowTokens: number;
  decisionAuthority: string;
  canApproveBelow: boolean;
  personality: any;
  communicationStyle: any;
  mission: string | null;
  responsibilities: string[];
  skills: string[];
  managerId: number | null;
}

const ROLE_LEVEL_CONFIG: Record<number, RoleContextWindow> = {
  1: { roleLevel: 1, baseTokens: 2000, bonusTokens: 0, totalTokens: 2000, decisionAuthority: 'low', canApproveBelow: false },
  2: { roleLevel: 2, baseTokens: 4000, bonusTokens: 1000, totalTokens: 5000, decisionAuthority: 'low', canApproveBelow: false },
  3: { roleLevel: 3, baseTokens: 6000, bonusTokens: 2000, totalTokens: 8000, decisionAuthority: 'medium', canApproveBelow: true },
  4: { roleLevel: 4, baseTokens: 10000, bonusTokens: 5000, totalTokens: 15000, decisionAuthority: 'high', canApproveBelow: true },
  5: { roleLevel: 5, baseTokens: 20000, bonusTokens: 10000, totalTokens: 30000, decisionAuthority: 'executive', canApproveBelow: true },
};

const ROLE_KEYWORDS: Record<string, number> = {
  'ceo': 5, 'chief': 5, 'president': 5, 'founder': 5, 'chairman': 5,
  'vp': 4, 'vice president': 4, 'director': 4, 'head': 4, 'cto': 5, 'cfo': 5, 'cmo': 5,
  'manager': 3, 'lead': 3, 'senior': 3, 'supervisor': 3, 'team lead': 3,
  'specialist': 2, 'analyst': 2, 'coordinator': 2, 'associate': 2,
  'junior': 1, 'intern': 1, 'assistant': 1, 'trainee': 1,
};

export function inferRoleLevelFromTitle(role: string): number {
  const roleLower = role.toLowerCase();
  for (const [keyword, level] of Object.entries(ROLE_KEYWORDS)) {
    if (roleLower.includes(keyword)) {
      return level;
    }
  }
  return 2;
}

export function getContextWindowForRole(roleLevel: number): RoleContextWindow {
  return ROLE_LEVEL_CONFIG[Math.min(Math.max(roleLevel, 1), 5)] || ROLE_LEVEL_CONFIG[2];
}

function inferDepartmentFromRole(role: string): string {
  const roleLower = role.toLowerCase();
  if (roleLower.includes('sales') || roleLower.includes('sdr') || roleLower.includes('closer')) return 'Sales';
  if (roleLower.includes('marketing') || roleLower.includes('content') || roleLower.includes('social')) return 'Marketing';
  if (roleLower.includes('operations') || roleLower.includes('automation') || roleLower.includes('data')) return 'Operations';
  if (roleLower.includes('engineering') || roleLower.includes('developer') || roleLower.includes('tech')) return 'Engineering';
  if (roleLower.includes('ceo') || roleLower.includes('director') || roleLower.includes('head')) return 'Management';
  return 'General';
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(v => typeof v === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v: unknown) => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function getAgentProfile(agentId: number): Promise<AgentProfile | null> {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });
  
  if (!agent) return null;
  
  const roleLevel = agent.roleLevel || inferRoleLevelFromTitle(agent.role || '');
  const contextConfig = getContextWindowForRole(roleLevel);
  const department = inferDepartmentFromRole(agent.role || '');
  
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role || '',
    department,
    roleLevel,
    contextWindowTokens: agent.contextWindowTokens || contextConfig.totalTokens,
    decisionAuthority: agent.decisionAuthority || contextConfig.decisionAuthority,
    canApproveBelow: agent.canApproveBelow ?? contextConfig.canApproveBelow,
    personality: agent.personality || {},
    communicationStyle: agent.communicationStyle || {},
    mission: agent.mission || null,
    responsibilities: parseStringArray(agent.responsibilities),
    skills: parseStringArray(agent.skills),
    managerId: agent.managerId || null,
  };
}

export async function updateAgentProfile(
  agentId: number, 
  updates: Partial<{
    roleLevel: number;
    contextWindowTokens: number;
    decisionAuthority: 'low' | 'medium' | 'high' | 'executive';
    canApproveBelow: boolean;
    communicationStyle: any;
    personality: any;
    mission: string;
    responsibilities: string[];
  }>
): Promise<boolean> {
  try {
    const updateData: any = { updatedAt: new Date() };
    if (updates.roleLevel !== undefined) updateData.roleLevel = updates.roleLevel;
    if (updates.contextWindowTokens !== undefined) updateData.contextWindowTokens = updates.contextWindowTokens;
    if (updates.decisionAuthority !== undefined) updateData.decisionAuthority = updates.decisionAuthority;
    if (updates.canApproveBelow !== undefined) updateData.canApproveBelow = updates.canApproveBelow;
    if (updates.communicationStyle !== undefined) updateData.communicationStyle = updates.communicationStyle;
    if (updates.personality !== undefined) updateData.personality = updates.personality;
    if (updates.mission !== undefined) updateData.mission = updates.mission;
    if (updates.responsibilities !== undefined) updateData.responsibilities = updates.responsibilities;
    
    await db.update(agents)
      .set(updateData)
      .where(eq(agents.id, agentId));
    return true;
  } catch (error) {
    console.error('[AgentProfile] Failed to update profile:', error);
    return false;
  }
}

export async function applyRoleTemplate(agentId: number, templateId: number): Promise<boolean> {
  try {
    const template = await db.query.agentRoleTemplates?.findFirst({
      where: eq(agentRoleTemplates.id, templateId),
    });
    
    if (!template) {
      console.warn('[AgentProfile] Template not found:', templateId);
      return false;
    }
    
    const updateData: any = {
      roleLevel: template.roleLevel,
      contextWindowTokens: template.contextWindowTokens,
      decisionAuthority: template.decisionAuthority,
      canApproveBelow: template.canApproveBelow,
      communicationStyle: template.communicationStyle,
      responsibilities: template.defaultResponsibilities,
      skills: template.defaultSkills,
      updatedAt: new Date(),
    };
    
    await db.update(agents)
      .set(updateData)
      .where(eq(agents.id, agentId));
    
    return true;
  } catch (error) {
    console.error('[AgentProfile] Failed to apply template:', error);
    return false;
  }
}

export async function getAgentHierarchy(companyId: number): Promise<{
  level: number;
  agents: AgentProfile[];
}[]> {
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
    orderBy: [desc(agents.roleLevel)],
  });
  
  const hierarchy: Map<number, AgentProfile[]> = new Map();
  
  for (const agent of companyAgents) {
    const roleLevel = agent.roleLevel || inferRoleLevelFromTitle(agent.role || '');
    const contextConfig = getContextWindowForRole(roleLevel);
    
    const profile: AgentProfile = {
      id: agent.id,
      name: agent.name,
      role: agent.role || '',
      department: null,
      roleLevel,
      contextWindowTokens: agent.contextWindowTokens || contextConfig.totalTokens,
      decisionAuthority: agent.decisionAuthority || contextConfig.decisionAuthority,
      canApproveBelow: agent.canApproveBelow ?? contextConfig.canApproveBelow,
      personality: agent.personality || {},
      communicationStyle: agent.communicationStyle || {},
      mission: agent.mission || null,
      responsibilities: (agent.responsibilities as string[]) || [],
      skills: (agent.skills as string[]) || [],
      managerId: agent.managerId || null,
    };
    
    if (!hierarchy.has(roleLevel)) {
      hierarchy.set(roleLevel, []);
    }
    hierarchy.get(roleLevel)!.push(profile);
  }
  
  return Array.from(hierarchy.entries())
    .sort(([a], [b]) => b - a)
    .map(([level, agents]) => ({ level, agents }));
}

export async function canAgentApprove(approverAgentId: number, targetAgentId: number): Promise<boolean> {
  const [approver, target] = await Promise.all([
    getAgentProfile(approverAgentId),
    getAgentProfile(targetAgentId),
  ]);
  
  if (!approver || !target) return false;
  if (!approver.canApproveBelow) return false;
  if (approver.roleLevel <= target.roleLevel) return false;
  
  if (target.managerId === approver.id) return true;
  
  return approver.roleLevel > target.roleLevel;
}

export async function getApprovalChain(agentId: number): Promise<AgentProfile[]> {
  const chain: AgentProfile[] = [];
  let currentAgent = await getAgentProfile(agentId);
  
  while (currentAgent && currentAgent.managerId) {
    const manager = await getAgentProfile(currentAgent.managerId);
    if (manager) {
      chain.push(manager);
      currentAgent = manager;
    } else {
      break;
    }
  }
  
  return chain;
}

export async function logAgentActivity(
  companyId: number,
  agentId: number | null,
  eventType: string,
  title: string,
  description?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await db.insert(activityLog).values({
      companyId,
      agentId,
      eventType,
      eventCategory: categorizeEvent(eventType),
      title,
      description,
      metadata: metadata || {},
    });
  } catch (error) {
    console.error('[AgentProfile] Failed to log activity:', error);
  }
}

function categorizeEvent(eventType: string): string {
  if (eventType.includes('task')) return 'task';
  if (eventType.includes('meeting')) return 'meeting';
  if (eventType.includes('message')) return 'communication';
  if (eventType.includes('approval')) return 'workflow';
  if (eventType.includes('agent')) return 'agent';
  return 'general';
}
