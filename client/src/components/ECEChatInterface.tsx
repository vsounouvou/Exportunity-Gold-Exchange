import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Send, 
  Loader2, 
  Gem, 
  User,
  LogOut,
  Building2,
  BarChart3,
  Settings,
  FileText,
  TrendingUp,
  Package,
  Truck,
  Shield
} from "lucide-react";
import { Link, useLocation } from "wouter";

export type UserRole = 'buyer' | 'supplier' | 'shareholder' | 'admin';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

interface ECEUser {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  companyName?: string;
  verificationStatus?: string;
}

const roleConfig: Record<UserRole, {
  title: string;
  icon: any;
  color: string;
  quickActions: Array<{ label: string; prompt: string }>;
}> = {
  buyer: {
    title: "Buyer Portal",
    icon: Building2,
    color: "text-blue-500",
    quickActions: [
      { label: "Request Quote", prompt: "I'd like to request a quote for gold purchase" },
      { label: "View Contracts", prompt: "Show me my active contracts" },
      { label: "Track Shipments", prompt: "What's the status of my current shipments?" },
      { label: "Assay Reports", prompt: "Show me the latest assay reports for my orders" }
    ]
  },
  supplier: {
    title: "Supplier Portal",
    icon: Package,
    color: "text-green-500",
    quickActions: [
      { label: "Declare Inventory", prompt: "I want to declare new gold inventory" },
      { label: "Upload Documents", prompt: "Help me upload my compliance documents" },
      { label: "Check Status", prompt: "What's the status of my current declarations?" },
      { label: "Export Process", prompt: "Guide me through the export process" }
    ]
  },
  shareholder: {
    title: "Investor Dashboard",
    icon: BarChart3,
    color: "text-purple-500",
    quickActions: [
      { label: "Rotation Summary", prompt: "Show me the latest rotation summary" },
      { label: "Margin Report", prompt: "Generate a margin report for this period" },
      { label: "Country Exposure", prompt: "Analyze our country exposure and risk" },
      { label: "Performance Trends", prompt: "Show platform performance trends" }
    ]
  },
  admin: {
    title: "Admin Console",
    icon: Settings,
    color: "text-amber-500",
    quickActions: [
      { label: "Supplier Lists", prompt: "Show pending government supplier list uploads" },
      { label: "Pending Approvals", prompt: "List all pending buyer approvals" },
      { label: "Compliance Status", prompt: "Show overall platform compliance status" },
      { label: "System Health", prompt: "Generate a system health report" }
    ]
  }
};

interface ECEChatInterfaceProps {
  role: UserRole;
}

export function ECEChatInterface({ role }: ECEChatInterfaceProps) {
  const [message, setMessage] = useState("");
  const [, setLocation] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const config = roleConfig[role];
  const Icon = config.icon;

  const storedUser = localStorage.getItem("ece_user");
  const user: ECEUser | null = storedUser ? JSON.parse(storedUser) : null;

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['/api/ece/chat/messages', role],
    enabled: !!user
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("/api/ece/chat/send", {
        method: "POST",
        body: JSON.stringify({ content, role })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ece/chat/messages', role] });
      setMessage("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessageMutation.mutate(message);
  };

  const handleQuickAction = (prompt: string) => {
    sendMessageMutation.mutate(prompt);
  };

  const handleLogout = () => {
    localStorage.removeItem("ece_session");
    localStorage.removeItem("ece_user");
    setLocation("/");
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!user) {
    setLocation("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col">
      <header className="border-b border-gray-800/50 backdrop-blur-sm sticky top-0 z-50 bg-gray-950/80">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer hover:opacity-80">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                  <Gem className="h-5 w-5 text-black" />
                </div>
                <span className="text-lg font-semibold text-white hidden sm:inline">Exportunity</span>
              </div>
            </Link>
            <div className="h-6 w-px bg-gray-700 hidden sm:block" />
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <span className="text-white font-medium">{config.title}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 border border-gray-700">
                <AvatarFallback className="bg-gray-800 text-white text-sm">
                  {user.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <div className="text-sm text-white">{user.displayName}</div>
                <div className="text-xs text-gray-500 capitalize">{user.role}</div>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              className="text-gray-400 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex max-w-5xl mx-auto w-full">
        <div className="hidden md:flex flex-col w-64 border-r border-gray-800/50 p-4 space-y-4">
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Quick Actions</h3>
            {config.quickActions.map((action, idx) => (
              <Button
                key={idx}
                variant="ghost"
                className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800/50"
                onClick={() => handleQuickAction(action.prompt)}
                disabled={sendMessageMutation.isPending}
              >
                {action.label}
              </Button>
            ))}
          </div>

          {role === 'buyer' && (
            <div className="space-y-2 pt-4 border-t border-gray-800">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Verification</span>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
                    Verified
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Proof of Funds</span>
                  <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                    Pending
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {role === 'supplier' && (
            <div className="space-y-2 pt-4 border-t border-gray-800">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Gov. List Match</span>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
                    Matched
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">License Status</span>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
                    Valid
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 p-4">
            {messagesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                  <Icon className={`h-8 w-8 ${config.color}`} />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Welcome to {config.title}
                </h3>
                <p className="text-gray-400 max-w-md mb-6">
                  {role === 'buyer' && "Request gold, track shipments, and manage your contracts with complete transparency."}
                  {role === 'supplier' && "Declare inventory, upload compliance documents, and track your export process."}
                  {role === 'shareholder' && "Access real-time reports, margins, and platform performance metrics."}
                  {role === 'admin' && "Manage suppliers, approve buyers, and oversee all platform operations."}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {config.quickActions.slice(0, 2).map((action, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      className="border-gray-700 text-gray-300 hover:bg-gray-800"
                      onClick={() => handleQuickAction(action.prompt)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {msg.role === 'assistant' && (
                      <Avatar className="h-8 w-8 border border-amber-500/30">
                        <AvatarFallback className="bg-amber-500/10 text-amber-500">
                          <Gem className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === 'user'
                          ? 'bg-amber-500/10 border border-amber-500/30 text-white'
                          : 'bg-gray-800 border border-gray-700 text-gray-200'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <span className="text-xs text-gray-500 mt-2 block">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    {msg.role === 'user' && (
                      <Avatar className="h-8 w-8 border border-gray-700">
                        <AvatarFallback className="bg-gray-800 text-white">
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                {sendMessageMutation.isPending && (
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 border border-amber-500/30">
                      <AvatarFallback className="bg-amber-500/10 text-amber-500">
                        <Gem className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          <div className="border-t border-gray-800/50 p-4">
            <div className="flex gap-2 max-w-3xl mx-auto">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={`Message ${config.title}...`}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                disabled={sendMessageMutation.isPending}
              />
              <Button
                onClick={handleSend}
                disabled={!message.trim() || sendMessageMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-600 text-center mt-2">
              All communications are encrypted and logged for compliance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
