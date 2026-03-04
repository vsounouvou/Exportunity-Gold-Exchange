import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, Search, User, XCircle, MessageSquare, Circle } from "lucide-react";
import { Agent } from "@db/schema";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';

interface ChatRoom {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  conversationId: string;
  agents: Agent[];
}

interface ChatSidebarProps {
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  agents: Agent[];
  onNewChat: () => void;
  onAddAgent?: (agent: Agent) => void;
  onRemoveAgent?: (agent: Agent) => void;
  activeAgents: Agent[];
  chatRooms: ChatRoom[];
  currentChatRoom: ChatRoom | null;
  onSelectChatRoom: (chatRoom: ChatRoom) => void;
}

export function ChatSidebar({
  selectedAgent,
  onSelectAgent,
  agents,
  onNewChat,
  onAddAgent,
  onRemoveAgent,
  activeAgents = [],
  chatRooms = [],
  currentChatRoom,
  onSelectChatRoom,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter agents based on search
  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group agents by role
  const groupedAgents = filteredAgents.reduce((groups, agent) => {
    const role = agent.role;
    if (!groups[role]) {
      groups[role] = [];
    }
    groups[role].push(agent);
    return groups;
  }, {} as Record<string, Agent[]>);

  const isAgentActive = (agent: Agent) => activeAgents.some(a => a.id === agent.id);

  return (
    <div className="w-80 bg-gray-900/95 backdrop-blur-sm flex flex-col h-full">
      {/* Chat History Section */}
      <div className="p-4 space-y-2 border-b border-gray-800">
        <h2 className="text-xl font-semibold mb-3 text-gray-200">Chat History</h2>
        <Button
          onClick={onNewChat}
          variant="secondary"
          className="w-full justify-start gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300"
        >
          <PlusCircle className="h-4 w-4" />
          New Chat
        </Button>

        <ScrollArea className="h-40 mt-3">
          <div className="space-y-1">
            {chatRooms.map((room) => (
              <Button
                key={room.id}
                variant="ghost"
                className={`w-full justify-start gap-2 text-left ${
                  currentChatRoom?.id === room.id
                    ? "bg-gray-800 text-blue-400 border-l-4 border-blue-500"
                    : "hover:bg-gray-800/50"
                }`}
                onClick={() => onSelectChatRoom(room)}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="truncate w-full">{room.name}</span>
                  <span className="text-xs text-gray-400">
                    {format(new Date(room.createdAt), "MMM d, yyyy")}
                  </span>
                </div>
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Agent Selection Section */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-xl font-semibold mb-3 text-gray-200">Agents</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-gray-800 border-gray-700 text-gray-300 placeholder-gray-500"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          {Object.entries(groupedAgents).map(([role, roleAgents]) => (
            <div key={role} className="space-y-2">
              <h3 className="text-sm font-medium text-gray-400 mb-2">{role}</h3>
              <div className="space-y-1">
                {roleAgents.map((agent) => {
                  const active = isAgentActive(agent);
                  return (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`
                        group rounded-lg p-3 flex items-center gap-3 transition-colors duration-200 cursor-pointer
                        ${active ? 'bg-gray-800/50 border-l-4 border-blue-500' : 'hover:bg-gray-800/50'}
                      `}
                      onClick={() => onSelectAgent(agent)}
                    >
                      <div className={`h-8 w-8 rounded-full ${active ? 'bg-blue-600/20' : 'bg-gray-800'} flex items-center justify-center`}>
                        <User className={`h-4 w-4 ${active ? 'text-blue-400' : 'text-gray-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-200 truncate">{agent.name}</span>
                          {active && (
                            <div className="flex items-center gap-1">
                              <Circle className="h-2 w-2 fill-blue-500 text-blue-500" />
                              <span className="text-xs text-blue-400">Active</span>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{agent.role}</div>
                      </div>
                      {active ? (
                        onRemoveAgent && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveAgent(agent);
                            }}
                          >
                            <XCircle className="h-5 w-5" />
                          </Button>
                        )
                      ) : (
                        onAddAgent && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddAgent(agent);
                            }}
                          >
                            <PlusCircle className="h-5 w-5" />
                          </Button>
                        )
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default ChatSidebar;