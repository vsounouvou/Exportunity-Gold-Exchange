import { db } from "@db";
import { agents, agentRoleTemplates, activityLog, tasks } from "@db/schema";
import { eq, and, desc, gte, count, sql } from "drizzle-orm";
import { logAgentActivity } from "./agentProfileService";
import Anthropic from "@anthropic-ai/sdk";

let anthropic: Anthropic | null = null;
const anthropicApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const anthropicBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const anthropicModel =
  process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL_QUALITY ||
  process.env.ANTHROPIC_MODEL_BALANCED ||
  "claude-sonnet-4-5";
if (anthropicApiKey) {
  anthropic = new Anthropic({
    apiKey: anthropicApiKey,
    ...(anthropicBaseURL ? { baseURL: anthropicBaseURL } : {}),
  });
} else {
  console.warn('[DynamicAgentGenerator] Anthropic not configured, using fallback profile generation');
}

export interface AgentGenerationRequest {
  companyId: number;
  department?: string;
  role?: string;
  reason: 'workload' | 'skill_gap' | 'expansion' | 'replacement';
  requiredSkills?: string[];
  managerId?: number;
}

export interface GeneratedAgentProfile {
  name: string;
  role: string;
  department: string;
  mission: string;
  responsibilities: string[];
  skills: string[];
  personality: {
    tone: 'formal' | 'friendly' | 'neutral';
    riskTolerance: 'conservative' | 'moderate' | 'bold';
    speed: 'deliberate' | 'moderate' | 'fast';
    detailLevel: 'high_level' | 'moderate' | 'very_detailed';
  };
  roleLevel: number;
  contextWindowTokens: number;
  decisionAuthority: 'low' | 'medium' | 'high' | 'executive';
  autonomyLevel: 'draft_only' | 'partial' | 'full';
}

export interface WorkloadAnalysis {
  department: string;
  currentAgentCount: number;
  pendingTaskCount: number;
  avgTasksPerAgent: number;
  overloadThreshold: number;
  isOverloaded: boolean;
  recommendedNewAgents: number;
  skillGaps: string[];
}

function generateAgentIdentifier(department: string, role: string): string {
  const deptCode = department.substring(0, 3).toUpperCase();
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
  const roleShort = role.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 3);
  return `${deptCode}-${roleShort}-${timestamp}`;
}

export async function analyzeWorkload(companyId: number): Promise<WorkloadAnalysis[]> {
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });
  
  const pendingTasks = await db.query.tasks?.findMany({
    where: and(
      eq(tasks.companyId, companyId),
      eq(tasks.status, 'pending')
    ),
  }) || [];
  
  const departmentAnalysis: Map<string, WorkloadAnalysis> = new Map();
  
  for (const agent of companyAgents) {
    const dept = inferDepartment(agent.role || '');
    if (!departmentAnalysis.has(dept)) {
      departmentAnalysis.set(dept, {
        department: dept,
        currentAgentCount: 0,
        pendingTaskCount: 0,
        avgTasksPerAgent: 0,
        overloadThreshold: 10,
        isOverloaded: false,
        recommendedNewAgents: 0,
        skillGaps: [],
      });
    }
    departmentAnalysis.get(dept)!.currentAgentCount++;
  }
  
  for (const task of pendingTasks) {
    const taskAgent = companyAgents.find(a => a.id === task.agentId);
    if (taskAgent) {
      const dept = inferDepartment(taskAgent.role || '');
      if (departmentAnalysis.has(dept)) {
        departmentAnalysis.get(dept)!.pendingTaskCount++;
      }
    }
  }
  
  for (const [dept, analysis] of departmentAnalysis) {
    if (analysis.currentAgentCount > 0) {
      analysis.avgTasksPerAgent = analysis.pendingTaskCount / analysis.currentAgentCount;
      analysis.isOverloaded = analysis.avgTasksPerAgent > analysis.overloadThreshold;
      if (analysis.isOverloaded) {
        analysis.recommendedNewAgents = Math.ceil(
          (analysis.pendingTaskCount - (analysis.currentAgentCount * analysis.overloadThreshold)) / 
          analysis.overloadThreshold
        );
      }
    }
  }
  
  return Array.from(departmentAnalysis.values());
}

function inferDepartment(role: string): string {
  const roleLower = role.toLowerCase();
  if (roleLower.includes('sales') || roleLower.includes('sdr') || roleLower.includes('closer') || roleLower.includes('account')) {
    return 'Sales';
  }
  if (roleLower.includes('marketing') || roleLower.includes('content') || roleLower.includes('social') || roleLower.includes('brand')) {
    return 'Marketing';
  }
  if (roleLower.includes('operations') || roleLower.includes('automation') || roleLower.includes('data') || roleLower.includes('analyst')) {
    return 'Operations';
  }
  if (roleLower.includes('engineering') || roleLower.includes('developer') || roleLower.includes('tech')) {
    return 'Engineering';
  }
  if (roleLower.includes('hr') || roleLower.includes('people') || roleLower.includes('talent')) {
    return 'HR';
  }
  if (roleLower.includes('finance') || roleLower.includes('accounting') || roleLower.includes('cfo')) {
    return 'Finance';
  }
  return 'Management';
}

export async function generateAgentProfile(request: AgentGenerationRequest): Promise<GeneratedAgentProfile> {
  const department = request.department || 'Operations';
  const existingAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, request.companyId),
  });
  
  const deptAgents = existingAgents.filter(a => inferDepartment(a.role || '') === department);
  const existingRoles = deptAgents.map(a => a.role).join(', ');
  
  if (!anthropic) {
    console.warn('[DynamicAgentGenerator] Anthropic not available, using fallback profile');
    return getDefaultProfile(department, request.reason);
  }
  
  try {
    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `Generate a new AI agent profile for a ${department} department.

Existing team roles: ${existingRoles || 'None yet'}
Reason for hiring: ${request.reason}
Required skills: ${request.requiredSkills?.join(', ') || 'General department skills'}

The new agent should complement the existing team without duplicating roles.

Provide a JSON response with this structure:
{
  "role": "Specific job title",
  "mission": "One-sentence mission statement",
  "responsibilities": ["responsibility1", "responsibility2", "responsibility3"],
  "skills": ["skill1", "skill2", "skill3", "skill4"],
  "personality": {
    "tone": "formal" | "friendly" | "neutral",
    "riskTolerance": "conservative" | "moderate" | "bold",
    "speed": "deliberate" | "moderate" | "fast",
    "detailLevel": "high_level" | "moderate" | "very_detailed"
  },
  "roleLevel": 1-5 (1=junior, 5=executive),
  "autonomyLevel": "draft_only" | "partial" | "full"
}`
        }
      ]
    });
    
    const textContent = response.content.find(c => c.type === 'text');
    const jsonMatch = textContent?.text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const role = parsed.role || `${department} Specialist`;
      const validatedResponsibilities = Array.isArray(parsed.responsibilities) 
        ? parsed.responsibilities.filter((r: unknown) => typeof r === 'string').slice(0, 5)
        : ['Support team operations', 'Complete assigned tasks'];
      const validatedSkills = Array.isArray(parsed.skills)
        ? parsed.skills.filter((s: unknown) => typeof s === 'string').slice(0, 6)
        : ['Communication', 'Problem solving'];
      const roleLevel = Math.min(Math.max(parseInt(parsed.roleLevel) || 2, 1), 5);
      
      return {
        name: generateAgentIdentifier(department, role),
        role,
        department,
        mission: typeof parsed.mission === 'string' ? parsed.mission.slice(0, 200) : `Support ${department} operations`,
        responsibilities: validatedResponsibilities,
        skills: validatedSkills,
        personality: {
          tone: ['formal', 'friendly', 'neutral'].includes(parsed.personality?.tone) ? parsed.personality.tone : 'neutral',
          riskTolerance: ['conservative', 'moderate', 'bold'].includes(parsed.personality?.riskTolerance) ? parsed.personality.riskTolerance : 'moderate',
          speed: ['deliberate', 'moderate', 'fast'].includes(parsed.personality?.speed) ? parsed.personality.speed : 'moderate',
          detailLevel: ['high_level', 'moderate', 'very_detailed'].includes(parsed.personality?.detailLevel) ? parsed.personality.detailLevel : 'moderate',
        },
        roleLevel,
        contextWindowTokens: getContextWindowForLevel(roleLevel),
        decisionAuthority: getAuthorityForLevel(roleLevel),
        autonomyLevel: ['draft_only', 'partial', 'full'].includes(parsed.autonomyLevel) ? parsed.autonomyLevel : 'partial',
      };
    }
  } catch (error) {
    console.error('[DynamicAgentGenerator] Failed to generate profile with AI:', error);
  }
  
  return getDefaultProfile(department, request.reason);
}

function getContextWindowForLevel(level: number): number {
  const windows: Record<number, number> = { 1: 2000, 2: 4000, 3: 8000, 4: 15000, 5: 30000 };
  return windows[Math.min(Math.max(level, 1), 5)] || 4000;
}

function getAuthorityForLevel(level: number): 'low' | 'medium' | 'high' | 'executive' {
  if (level >= 5) return 'executive';
  if (level >= 4) return 'high';
  if (level >= 3) return 'medium';
  return 'low';
}

function getDefaultProfile(department: string, reason: string): GeneratedAgentProfile {
  const defaults: Record<string, Partial<GeneratedAgentProfile>> = {
    Sales: {
      role: 'Sales Development Representative',
      mission: 'Generate and qualify leads for the sales team',
      responsibilities: ['Prospect new leads', 'Qualify opportunities', 'Schedule demos'],
      skills: ['Lead generation', 'CRM management', 'Communication'],
    },
    Marketing: {
      role: 'Content Marketing Specialist',
      mission: 'Create engaging content to drive brand awareness',
      responsibilities: ['Create content', 'Manage social media', 'Track engagement'],
      skills: ['Content writing', 'Social media', 'Analytics'],
    },
    Operations: {
      role: 'Operations Analyst',
      mission: 'Optimize processes and improve operational efficiency',
      responsibilities: ['Analyze workflows', 'Identify improvements', 'Implement automation'],
      skills: ['Data analysis', 'Process optimization', 'Automation'],
    },
    Engineering: {
      role: 'Software Engineer',
      mission: 'Build and maintain high-quality software solutions',
      responsibilities: ['Write code', 'Review PRs', 'Debug issues'],
      skills: ['Programming', 'System design', 'Testing'],
    },
  };
  
  const deptDefault = defaults[department] || defaults.Operations;
  const role = deptDefault.role || `${department} Specialist`;
  
  return {
    name: generateAgentIdentifier(department, role),
    role,
    department,
    mission: deptDefault.mission || `Support ${department} operations`,
    responsibilities: deptDefault.responsibilities || ['Support team operations'],
    skills: deptDefault.skills || ['Communication'],
    personality: { tone: 'neutral', riskTolerance: 'moderate', speed: 'moderate', detailLevel: 'moderate' },
    roleLevel: 2,
    contextWindowTokens: 4000,
    decisionAuthority: 'low',
    autonomyLevel: 'partial',
  };
}

export async function createAgent(
  companyId: number,
  profile: GeneratedAgentProfile,
  managerId?: number
): Promise<number> {
  const [newAgent] = await db.insert(agents)
    .values({
      companyId,
      name: profile.name,
      role: profile.role,
      mission: profile.mission,
      responsibilities: profile.responsibilities,
      skills: profile.skills,
      personality: profile.personality,
      roleLevel: profile.roleLevel,
      contextWindowTokens: profile.contextWindowTokens,
      decisionAuthority: profile.decisionAuthority,
      autonomyLevel: profile.autonomyLevel,
      managerId: managerId || null,
      status: 'active',
      baseBudget: '100.00',
      budgetUsed: '0.00',
      budgetBonus: '0.00',
    })
    .returning();
  
  await logAgentActivity(
    companyId,
    newAgent.id,
    'agent_created',
    `New agent ${profile.name} joined as ${profile.role}`,
    `Auto-generated agent for ${profile.department} department`,
    { generationType: 'dynamic', profile }
  );
  
  return newAgent.id;
}

export async function autoGenerateAgentsIfNeeded(companyId: number): Promise<{
  generated: number;
  agents: { id: number; name: string; role: string }[];
}> {
  const analysis = await analyzeWorkload(companyId);
  const generatedAgents: { id: number; name: string; role: string }[] = [];
  
  for (const dept of analysis) {
    if (dept.isOverloaded && dept.recommendedNewAgents > 0) {
      const toGenerate = Math.min(dept.recommendedNewAgents, 3);
      
      for (let i = 0; i < toGenerate; i++) {
        const profile = await generateAgentProfile({
          companyId,
          department: dept.department,
          reason: 'workload',
          requiredSkills: dept.skillGaps,
        });
        
        const existingManagers = await db.query.agents.findMany({
          where: and(
            eq(agents.companyId, companyId),
            gte(agents.roleLevel, 3)
          ),
          orderBy: [desc(agents.roleLevel)],
          limit: 1,
        });
        
        const managerId = existingManagers[0]?.id;
        const agentId = await createAgent(companyId, profile, managerId);
        
        generatedAgents.push({
          id: agentId,
          name: profile.name,
          role: profile.role,
        });
      }
    }
  }
  
  return {
    generated: generatedAgents.length,
    agents: generatedAgents,
  };
}

export async function suggestAgentHires(companyId: number): Promise<{
  suggestions: {
    department: string;
    reason: string;
    suggestedRole: string;
    priority: 'low' | 'medium' | 'high';
  }[];
}> {
  const analysis = await analyzeWorkload(companyId);
  const suggestions: {
    department: string;
    reason: string;
    suggestedRole: string;
    priority: 'low' | 'medium' | 'high';
  }[] = [];
  
  for (const dept of analysis) {
    if (dept.isOverloaded) {
      suggestions.push({
        department: dept.department,
        reason: `${dept.department} is overloaded with ${dept.avgTasksPerAgent.toFixed(1)} tasks per agent`,
        suggestedRole: `${dept.department} Specialist`,
        priority: dept.avgTasksPerAgent > 15 ? 'high' : 'medium',
      });
    }
    
    if (dept.currentAgentCount === 0 && dept.pendingTaskCount > 0) {
      suggestions.push({
        department: dept.department,
        reason: `No agents in ${dept.department} but ${dept.pendingTaskCount} pending tasks`,
        suggestedRole: `${dept.department} Lead`,
        priority: 'high',
      });
    }
  }
  
  return { suggestions };
}
