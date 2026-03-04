import { io, Socket } from "socket.io-client";
import { toast } from "@/hooks/use-toast";
import { getSocketBaseUrl } from "./runtimeConfig";

interface SocketConfig {
  reconnection: boolean;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  timeout: number;
  transports: string[];
  query?: Record<string, string>;
}

let socket: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 1000;
const RECONNECT_DELAY_MAX = 5000;

const debug = (message: string, ...args: any[]) => {
  console.log(`[Socket] ${message}`, ...args);
};

const defaultConfig: SocketConfig = {
  reconnection: true,
  reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
  reconnectionDelay: RECONNECT_DELAY,
  timeout: 10000,
  transports: ['websocket', 'polling'],
};

class SocketManager {
  private static instance: SocketManager;
  private messageQueue: Array<{ event: string; data: any }> = [];
  private isConnected = false;
  private isAuthenticated = false;
  private currentAgentId: number | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  public connect(config: Partial<SocketConfig> = {}) {
    if (socket?.connected) return socket;

    const finalConfig = { ...defaultConfig, ...config };
    socket = io(getSocketBaseUrl() ?? "/", finalConfig);

    this.setupEventListeners();
    this.startHeartbeat();

    return socket;
  }

  private setupEventListeners() {
    if (!socket) return;

    socket.on("connect", () => {
      debug("Connected to WebSocket server");
      this.isConnected = true;
      reconnectAttempts = 0;

      // If we have a current agent ID, automatically rejoin their room
      if (this.currentAgentId) {
        this.joinAgentRoom(this.currentAgentId);
      }

      toast({
        title: "Connected",
        description: "Successfully connected to the chat server",
      });
    });

    socket.on("joined", (data: { success: boolean; agentId: number; }) => {
      if (data.success) {
        this.isAuthenticated = true;
        this.currentAgentId = data.agentId;
        debug(`Authenticated as agent ${data.agentId}`);
        this.processMessageQueue();
      }
    });

    socket.on("connect_error", (error) => {
      debug("Connection error:", error);
      this.handleConnectionError(error);
    });

    socket.on("disconnect", (reason) => {
      debug("Disconnected from WebSocket server:", reason);
      this.isAuthenticated = false;
      this.handleDisconnect(reason);
    });

    socket.on("error", (error) => {
      debug("Socket error:", error);
      this.handleError(error);
    });

    socket.on("pong", () => {
      debug("Received pong from server");
    });
  }

  private handleConnectionError(error: Error) {
    this.isConnected = false;
    this.isAuthenticated = false;
    reconnectAttempts++;

    const delay = Math.min(
      RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1),
      RECONNECT_DELAY_MAX
    );

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      debug("Max reconnection attempts reached");
      this.cleanup();
      toast({
        title: "Connection Failed",
        description: "Unable to connect to the chat server. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Connection Lost",
      description: `Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`,
    });

    this.reconnectTimeout = setTimeout(() => {
      debug(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      socket?.connect();
    }, delay);
  }

  private handleDisconnect(reason: string) {
    this.isConnected = false;
    this.isAuthenticated = false;

    if (reason === "io server disconnect") {
      debug("Server disconnected us, attempting to reconnect");
      socket?.connect();
    }

    if (reason === "transport close" || reason === "ping timeout") {
      debug("Connection lost, attempting to reconnect");
      this.attemptReconnect();
    }
  }

  private handleError(error: any) {
    debug("Socket error:", error);

    if (error.type === "TransportError") {
      socket?.disconnect();
      this.attemptReconnect();
    }

    toast({
      title: "Connection Error",
      description: error.message || "An error occurred with the chat connection",
      variant: "destructive",
    });
  }

  private attemptReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      debug("Attempting to reconnect...");
      socket?.connect();
    }, RECONNECT_DELAY);
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (socket?.connected) {
        socket.emit("ping");
      }
    }, 30000);
  }

  private processMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected && this.isAuthenticated) {
      const message = this.messageQueue.shift();
      if (message && socket) {
        socket.emit(message.event, message.data);
      }
    }
  }

  public emit(event: string, data: any) {
    if (!this.isConnected || !this.isAuthenticated) {
      debug(`Socket not ready, queueing message: ${event}`);
      this.messageQueue.push({ event, data });
      return;
    }

    try {
      socket?.emit(event, data);
    } catch (error) {
      debug("Error sending message:", error);
      this.messageQueue.push({ event, data });
      throw error;
    }
  }

  public joinAgentRoom(agentId: number) {
    try {
      debug(`Joining room for agent: ${agentId}`);
      this.currentAgentId = agentId;
      socket?.emit("join", { agentId });
    } catch (error) {
      debug("Error joining agent room:", error);
      throw error;
    }
  }

  public leaveAgentRoom() {
    if (this.currentAgentId) {
      debug(`Leaving room for agent: ${this.currentAgentId}`);
      socket?.emit("leave", { agentId: this.currentAgentId });
      this.currentAgentId = null;
      this.isAuthenticated = false;
    }
  }

  public cleanup() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    this.isConnected = false;
    this.isAuthenticated = false;
    this.currentAgentId = null;
    reconnectAttempts = 0;
    this.messageQueue = [];
  }
}

// Export singleton instance methods
export function getSocket(config: Partial<SocketConfig> = {}): Socket {
  return SocketManager.getInstance().connect(config);
}

export function cleanupSocket() {
  SocketManager.getInstance().cleanup();
}

export function joinAgentRoom(agentId: number) {
  SocketManager.getInstance().joinAgentRoom(agentId);
}

export function leaveAgentRoom() {
  SocketManager.getInstance().leaveAgentRoom();
}

export function sendMessage(msg: {
  content: string;
  fromAgentId: number;
  toAgentId: number;
  type: string;
  metadata?: Record<string, unknown>;
}) {
  debug("Sending message:", msg);
  SocketManager.getInstance().emit("chat message", msg);
}
