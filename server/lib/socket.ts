import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { db } from "@db";
import { messages, agents } from "@db/schema";
import { eq } from "drizzle-orm";

// Enhanced logging with timestamp
const debug = (context: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${context}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

interface ConnectionState {
  agentId?: number;
  authenticated: boolean;
  lastActivity: Date;
  isTyping?: boolean;
  typingTimeout?: NodeJS.Timeout;
}

export type SocketServer = Server;

export function setupWebSocket(server: HttpServer) {
  const io = new Server(server, {
    path: "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const connections = new Map<string, ConnectionState>();

  io.on("connection", (socket) => {
    debug("socket", "New connection established");

    connections.set(socket.id, {
      authenticated: false,
      lastActivity: new Date()
    });

    socket.on("join", async (data: { agentId: number }) => {
      try {
        debug("socket:join", `Attempting to join with agentId: ${data.agentId}`);

        const agent = await db.query.agents.findFirst({
          where: eq(agents.id, data.agentId)
        });

        if (!agent) {
          debug("socket:join:error", "Agent not found", { agentId: data.agentId });
          socket.emit("error", { message: "Agent not found" });
          return;
        }

        const state = connections.get(socket.id);
        if (state) {
          state.agentId = data.agentId;
          state.authenticated = true;
          state.lastActivity = new Date();
        }

        socket.join(`agent:${data.agentId}`);
        socket.emit("joined", { success: true, agent });
        io.emit("agent_connected", { 
          agentId: data.agentId,
          agentName: agent.name,
          agentRole: agent.role
        });

        debug("socket:join", `Agent ${data.agentId} (${agent.name}) joined successfully`);
      } catch (error) {
        debug("socket:join:error", "Failed to handle join", {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined
        });
        socket.emit("error", { message: "Failed to join" });
      }
    });

    socket.on("message", async (message: any) => {
      try {
        debug("socket:message", "Received message", message);

        const state = connections.get(socket.id);
        if (!state?.authenticated) {
          debug("socket:message:error", "Unauthorized message attempt");
          socket.emit("error", { message: "Unauthorized" });
          return;
        }

        // Handle message processing
        io.emit("message", {
          ...message,
          timestamp: new Date().toISOString(),
          from: state.agentId
        });

        debug("socket:message", "Message broadcasted successfully");
      } catch (error) {
        debug("socket:message:error", "Failed to process message", {
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    socket.on("disconnect", async () => {
      const state = connections.get(socket.id);
      if (state?.agentId) {
        // Clear typing indicator and timeout on disconnect
        if (state.typingTimeout) {
          clearTimeout(state.typingTimeout);
        }
        if (state.isTyping) {
          io.emit("agent_typing_end", { 
            agentId: state.agentId,
            timestamp: new Date().toISOString()
          });
        }

        io.emit("agent_disconnected", { 
          agentId: state.agentId,
          timestamp: new Date().toISOString()
        });

        try {
          const agent = await db.query.agents.findFirst({
            where: eq(agents.id, state.agentId),
          });

          if (agent?.status === 'active') {
            await db.update(agents)
              .set({ status: "inactive" })
              .where(eq(agents.id, state.agentId));
          }
        } catch (error) {
          debug("socket:disconnect:error", "Failed to update agent status on disconnect", {
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
      connections.delete(socket.id);
      debug("socket", "Client disconnected", { socketId: socket.id });
    });
  });

  return io;
}