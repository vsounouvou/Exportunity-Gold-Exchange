import { Router } from "express";
import { db } from "@db/index";
import { tasks, taskDependencies } from "@db/schema/tasks";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Task creation schema
const createTaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  agentId: z.number().optional(),
  executionType: z.enum(["API", "Action"]).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dependencies: z.array(z.number()).optional(),
  dueDate: z.string().optional(),
  urgencyScore: z.number().min(0).max(10).optional(),
  importanceScore: z.number().min(0).max(10).optional(),
  isAutomated: z.boolean().optional(),
});

// Calculate priority based on scores and dependencies
function calculatePriority(urgency: number, importance: number, dependencies: number): number {
  // Weighted average of scores
  return Math.round((urgency * 0.4 + importance * 0.4 + dependencies * 0.2) * 10) / 10;
}

// Get all tasks
router.get("/", async (req, res) => {
  try {
    const { agentId, status, priority, search } = req.query;

    // Build the where clause based on filters
    let whereClause = {} as any;

    if (agentId) {
      whereClause.agentId = Number(agentId);
    }

    if (status) {
      whereClause.status = status;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    const allTasks = await db.select().from(tasks).where(whereClause).orderBy(desc(tasks.createdAt));

    // If there's a search query, filter in memory (since we can't do text search in the query)
    let filteredTasks = allTasks;
    if (search) {
      const searchLower = String(search).toLowerCase();
      filteredTasks = allTasks.filter(
        task => 
          task.title.toLowerCase().includes(searchLower) ||
          task.description.toLowerCase().includes(searchLower)
      );
    }

    // Get dependencies for each task
    const taskDeps = await db.select().from(taskDependencies);

    // Map dependencies to tasks
    const tasksWithDeps = filteredTasks.map(task => ({
      ...task,
      dependencies: taskDeps
        .filter(dep => dep.taskId === task.id)
        .map(dep => dep.dependencyId),
      blockedBy: taskDeps
        .filter(dep => dep.dependencyId === task.id)
        .map(dep => dep.taskId),
    }));

    res.json({ tasks: tasksWithDeps });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// Create a new task
router.post("/", async (req, res) => {
  try {
    const taskData = createTaskSchema.parse(req.body);
    const urgencyScore = taskData.urgencyScore || 5;
    const importanceScore = taskData.importanceScore || 5;
    const dependencyScore = taskData.dependencies?.length ? 10 : 5; // Higher if has dependencies

    const [newTask] = await db.insert(tasks).values({
      title: taskData.title,
      description: taskData.description,
      agentId: taskData.agentId,
      executionType: taskData.executionType,
      priority: taskData.priority,
      urgencyScore,
      importanceScore,
      dependencyScore,
      status: "pending",
      isAutomated: taskData.isAutomated || false,
      dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
    }).returning();

    // Add dependencies if any
    if (taskData.dependencies?.length) {
      await db.insert(taskDependencies).values(
        taskData.dependencies.map(depId => ({
          taskId: newTask.id,
          dependencyId: depId,
        }))
      );
    }

    res.status(201).json({ task: newTask });
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(400).json({ error: "Failed to create task" });
  }
});

// Update a task (generic PATCH endpoint)
router.patch("/:taskId", async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { status } = req.body;

    const [updatedTask] = await db
      .update(tasks)
      .set({ status })
      .where(eq(tasks.id, taskId))
      .returning();

    res.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// Update task status
router.patch("/:taskId/status", async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { status } = req.body;

    // Check if all dependencies are completed before allowing status change
    const deps = await db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskId));

    if (deps.length > 0) {
      const dependencyIds = deps.map(d => d.dependencyId);
      const dependencyTasks = await db
        .select()
        .from(tasks)
        .where(inArray(tasks.id, dependencyIds));

      const hasUncompletedDependencies = dependencyTasks.some(
        task => task.status !== "completed"
      );

      if (hasUncompletedDependencies && status === "completed") {
        return res.status(400).json({
          error: "Cannot complete task with incomplete dependencies",
        });
      }
    }

    const [updatedTask] = await db
      .update(tasks)
      .set({ status })
      .where(eq(tasks.id, taskId))
      .returning();

    res.json({ task: updatedTask });
  } catch (error) {
    console.error("Error updating task status:", error);
    res.status(500).json({ error: "Failed to update task status" });
  }
});

// Initialize sample tasks
router.post("/init-sample", async (req, res) => {
  try {
    const { agentId } = req.body;
    
    if (!agentId) {
      return res.status(400).json({ error: "agentId is required" });
    }

    // Delete existing tasks for this agent to avoid duplicates
    await db.delete(tasks).where(eq(tasks.agentId, agentId));

    // Create sample tasks with various priorities and dependencies
    const sampleTasks = [
      {
        title: "Review quarterly financial reports",
        description: "Analyze Q4 performance metrics and prepare summary for board meeting",
        priority: "high",
        agentId,
        urgencyScore: 9,
        importanceScore: 9,
        status: "pending",
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      },
      {
        title: "Update team onboarding documentation",
        description: "Revise and modernize the onboarding materials for new team members",
        priority: "medium",
        agentId,
        urgencyScore: 5,
        importanceScore: 6,
        status: "pending",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      },
      {
        title: "Optimize database query performance",
        description: "Identify and fix slow queries affecting application performance",
        priority: "high",
        agentId,
        urgencyScore: 8,
        importanceScore: 8,
        status: "in_progress",
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      },
      {
        title: "Schedule client feedback sessions",
        description: "Coordinate with key clients for Q1 feedback and feature requests",
        priority: "medium",
        agentId,
        urgencyScore: 6,
        importanceScore: 7,
        status: "pending",
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      },
      {
        title: "Implement automated testing suite",
        description: "Set up comprehensive automated tests for critical user flows",
        priority: "high",
        agentId,
        urgencyScore: 7,
        importanceScore: 9,
        status: "pending",
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
      },
      {
        title: "Research competitor analysis tools",
        description: "Evaluate and compare market intelligence platforms for adoption",
        priority: "low",
        agentId,
        urgencyScore: 3,
        importanceScore: 5,
        status: "pending",
        dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days from now
      },
      {
        title: "Conduct security audit",
        description: "Perform comprehensive security review of infrastructure and codebase",
        priority: "high",
        agentId,
        urgencyScore: 8,
        importanceScore: 10,
        status: "pending",
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      },
      {
        title: "Plan team building activities",
        description: "Organize monthly team events and morale-building initiatives",
        priority: "low",
        agentId,
        urgencyScore: 4,
        importanceScore: 5,
        status: "completed",
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      },
    ];

    const createdTasks = await db.insert(tasks).values(sampleTasks).returning();

    // Create some task dependencies
    if (createdTasks.length >= 3) {
      await db.insert(taskDependencies).values([
        {
          taskId: createdTasks[4].id, // "Implement automated testing suite"
          dependencyId: createdTasks[2].id, // depends on "Optimize database query performance"
        },
        {
          taskId: createdTasks[0].id, // "Review quarterly financial reports"
          dependencyId: createdTasks[3].id, // depends on "Schedule client feedback sessions"
        },
      ]);
    }

    res.json({ message: "Sample tasks created successfully", count: createdTasks.length });
  } catch (error) {
    console.error("Error creating sample tasks:", error);
    res.status(500).json({ error: "Failed to create sample tasks" });
  }
});

export default router;