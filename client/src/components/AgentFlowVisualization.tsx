import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import type { Agent, Message } from "@db/schema";
import { getSocket } from "@/lib/socket";
import { Brain, MessageSquare, Users, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AgentNode {
  id: number;
  x: number;
  y: number;
  agent: Agent;
  isActive: boolean;
}

interface MessageFlow {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  message: Message;
  isActive: boolean;
  type: "chat" | "task_update" | "reflection" | "decision" | "announcement";
}

export function AgentFlowVisualization() {
  const [nodes, setNodes] = useState<AgentNode[]>([]);
  const [flows, setFlows] = useState<MessageFlow[]>([]);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  // Fetch active agents
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const calculateNodePositions = useCallback(() => {
    const radius = Math.min(dimensions.width, dimensions.height) * 0.35;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    return agents.map((agent, index) => {
      const angle = (2 * Math.PI * index) / agents.length;
      return {
        id: agent.id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        agent,
        isActive: false,
      };
    });
  }, [agents, dimensions]);

  useEffect(() => {
    const newNodes = calculateNodePositions();
    setNodes(newNodes);
  }, [agents, dimensions, calculateNodePositions]);

  useEffect(() => {
    try {
      const socket = getSocket();

      const handleMessage = (message: Message) => {
        console.log("Received message in visualization:", message);
        const fromNode = nodes.find((n) => n.id === message.fromAgentId);
        const toNode = nodes.find((n) => n.id === message.toAgentId);

        if (fromNode && toNode) {
          const newFlow: MessageFlow = {
            id: message.id,
            fromX: fromNode.x,
            fromY: fromNode.y,
            toX: toNode.x,
            toY: toNode.y,
            message,
            isActive: true,
            type: message.type as MessageFlow["type"],
          };

          setFlows((prev) => [...prev, newFlow]);

          // Highlight active nodes
          setNodes((prev) =>
            prev.map((node) =>
              node.id === message.fromAgentId || node.id === message.toAgentId
                ? { ...node, isActive: true }
                : node
            )
          );

          // Reset node highlight after animation
          setTimeout(() => {
            setNodes((prev) =>
              prev.map((node) => ({ ...node, isActive: false }))
            );
          }, 2000);

          // Deactivate flow after animation
          setTimeout(() => {
            setFlows((prev) =>
              prev.map((flow) =>
                flow.id === message.id ? { ...flow, isActive: false } : flow
              )
            );
          }, 2000);

          // Remove old flows
          setTimeout(() => {
            setFlows((prev) => prev.filter((flow) => flow.id !== message.id));
          }, 3000);
        }
      };

      const handleError = (err: Error) => {
        console.error("Socket error in visualization:", err);
        setError(err.message);
      };

      socket.on("chat message", handleMessage);
      socket.on("error", handleError);

      return () => {
        socket.off("chat message", handleMessage);
        socket.off("error", handleError);
      };
    } catch (error) {
      console.error("Error setting up socket in visualization:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
    }
  }, [nodes]);

  useEffect(() => {
    const handleResize = () => {
      const container = document.getElementById("flow-container");
      if (container) {
        setDimensions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const getMessageColor = (type: MessageFlow["type"]) => {
    switch (type) {
      case "task_update":
        return "#10b981"; // green
      case "reflection":
        return "#8b5cf6"; // purple
      case "decision":
        return "#f59e0b"; // amber
      case "announcement":
        return "#ef4444"; // red
      default:
        return "#3b82f6"; // blue
    }
  };

  const getNodeIcon = (role: string) => {
    switch (role.toLowerCase()) {
      case "ceo":
      case "director":
      case "manager":
        return <Brain className="h-6 w-6" />;
      case "analyst":
      case "specialist":
      case "expert":
        return <MessageSquare className="h-6 w-6" />;
      default:
        return <Users className="h-6 w-6" />;
    }
  };

  return (
    <TooltipProvider>
      <div
        id="flow-container"
        className="w-full h-[600px] bg-gray-950/50 rounded-lg backdrop-blur-sm relative overflow-hidden"
      >
        {error && (
          <div className="absolute top-4 right-4 bg-red-500/20 text-red-400 px-4 py-2 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        <svg
          width={dimensions.width}
          height={dimensions.height}
          className="absolute inset-0"
        >
          {/* Connection lines between agents */}
          <g className="connections">
            {nodes.map((fromNode, i) =>
              nodes.slice(i + 1).map((toNode) => (
                <motion.line
                  key={`${fromNode.id}-${toNode.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.1 }}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
              ))
            )}
          </g>

          {/* Message flows */}
          <AnimatePresence>
            {flows.map((flow) => (
              <g key={flow.id} className="message-flow">
                {/* Pulse effect */}
                <motion.circle
                  initial={{ cx: flow.fromX, cy: flow.fromY, r: 0, opacity: 0 }}
                  animate={{
                    cx: [flow.fromX, flow.toX],
                    cy: [flow.fromY, flow.toY],
                    r: [0, 20, 0],
                    opacity: [0, 0.5, 0],
                  }}
                  transition={{ duration: 2, ease: "easeInOut" }}
                  fill={getMessageColor(flow.type)}
                />

                {/* Message particle */}
                <motion.circle
                  initial={{ cx: flow.fromX, cy: flow.fromY, r: 4, opacity: 0 }}
                  animate={{
                    cx: flow.toX,
                    cy: flow.toY,
                    opacity: [0, 1, 0],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1, ease: "easeInOut" }}
                  fill={getMessageColor(flow.type)}
                />

                {/* Message trail */}
                <motion.path
                  d={`M ${flow.fromX} ${flow.fromY} L ${flow.toX} ${flow.toY}`}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: 1,
                    opacity: flow.isActive ? 0.5 : 0,
                  }}
                  transition={{ duration: 1, ease: "easeInOut" }}
                  stroke={getMessageColor(flow.type)}
                  strokeWidth={2}
                  fill="none"
                />
              </g>
            ))}
          </AnimatePresence>
        </svg>

        {/* Agent nodes */}
        <AnimatePresence>
          {nodes.map((node) => (
            <motion.div
              key={node.id}
              className="absolute"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ 
                opacity: 1, 
                scale: node.isActive ? 1.1 : 1,
                x: node.x - 30,
                y: node.y - 30,
              }}
              transition={{ duration: 0.2 }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <Tooltip>
                <TooltipTrigger>
                  <div 
                    className={`w-[60px] h-[60px] rounded-full bg-gray-800/80 border-2 flex items-center justify-center shadow-lg transition-all duration-200 ${
                      node.isActive 
                        ? 'border-blue-400 shadow-blue-400/20' 
                        : hoveredNode === node.id
                        ? 'border-blue-600/50'
                        : 'border-gray-700'
                    }`}
                  >
                    {getNodeIcon(node.agent.role)}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p className="font-medium">{node.agent.name}</p>
                    <p className="text-sm text-muted-foreground">{node.agent.role}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
              <div className="absolute top-16 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm text-gray-400">
                {node.agent.name}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}

export default AgentFlowVisualization;