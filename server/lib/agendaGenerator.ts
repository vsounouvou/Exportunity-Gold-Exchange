import OpenAI from "openai";
import { meetings } from "@db/schema";
import type { Agent, Meeting, Message, Task } from "@db/schema";
import { db } from "@db";
import { eq, and, lte, gte } from "drizzle-orm";

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface AgendaItem {
  title: string;
  duration: number;  // in minutes
  description: string;
  owner?: string;
  relatedTasks?: string[];
}

interface GeneratedAgenda {
  title: string;
  description: string;
  totalDuration: number;
  items: AgendaItem[];
  suggestedParticipants?: string[];
  preparationTasks?: string[];
}

export async function generateMeetingAgenda(
  meeting: Meeting,
  participants: Agent[],
  recentMessages?: Message[],
  relatedTasks?: Task[]
): Promise<GeneratedAgenda> {
  if (!openai) {
    return {
      title: meeting.title,
      description: meeting.description || "Meeting agenda",
      totalDuration: meeting.duration || 60,
      items: [{ title: "Agenda", duration: meeting.duration || 60, description: "Discuss meeting topics" }],
      suggestedParticipants: [],
      preparationTasks: []
    };
  }
  
  try {
    // Prepare context for GPT
    const context = {
      meetingTitle: meeting.title,
      meetingDescription: meeting.description,
      participants: participants.map(p => ({
        name: p.name,
        role: p.role,
        capabilities: p.capabilities
      })),
      duration: meeting.duration,
      recentDiscussions: recentMessages?.slice(0, 10).map(m => ({
        content: m.content,
        sender: m.fromAgentId
      })),
      relatedTasks: relatedTasks?.map(t => ({
        title: t.title,
        status: t.status,
        priority: t.priority
      }))
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an expert meeting facilitator and agenda planner. 
          Create a detailed, time-boxed agenda that maximizes meeting effectiveness 
          and ensures all key topics are covered efficiently. Consider participant roles 
          and any related tasks or discussions.`
        },
        {
          role: "user",
          content: `Generate a structured meeting agenda based on the following context. 
          Include specific time allocations, clear ownership, and any preparation tasks.
          Context: ${JSON.stringify(context, null, 2)}`
        }
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Failed to generate agenda: Empty response from OpenAI");
    }

    const generatedAgenda = JSON.parse(content);

    // Validate and transform the response
    return {
      title: generatedAgenda.title || meeting.title,
      description: generatedAgenda.description || "Generated agenda for " + meeting.title,
      totalDuration: generatedAgenda.items.reduce((acc: number, item: AgendaItem) => acc + item.duration, 0),
      items: generatedAgenda.items.map((item: AgendaItem) => ({
        title: item.title,
        duration: item.duration,
        description: item.description,
        owner: item.owner,
        relatedTasks: item.relatedTasks || []
      })),
      suggestedParticipants: generatedAgenda.suggestedParticipants || [],
      preparationTasks: generatedAgenda.preparationTasks || []
    };
  } catch (error) {
    console.error("Error generating meeting agenda:", error);
    throw error;
  }
}

export async function updateMeetingWithAgenda(
  meetingId: number,
  agenda: GeneratedAgenda
): Promise<void> {
  try {
    const existing = await db.query.meetings.findFirst({
      where: eq(meetings.id, meetingId),
    });

    await db.update(meetings).set({
      metadata: {
        ...(existing?.metadata ?? {}),
        agenda: JSON.stringify(agenda),
      },
      updatedAt: new Date(),
    }).where(eq(meetings.id, meetingId));
  } catch (error) {
    console.error("Error updating meeting with agenda:", error);
    throw error;
  }
}
