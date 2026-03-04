import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";
import { formatPageTitle } from "@/lib/brand";
import { AuthModal } from "@/components/AuthModal";
import { useLocale } from "@/contexts/LocaleContext";
import { 
  Send, 
  Loader2, 
  Gem, 
  User,
  LogOut,
  Building2,
  BarChart3,
  Settings,
  TrendingUp,
  Package,
  Shield,
  Globe,
  Lock,
  FileCheck,
  MapPin,
  CheckCircle2,
  Truck,
  ArrowRight,
  Sparkles,
  MessageSquare
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

const buildDemoMessages = (brandName: string): ChatMessage[] => [
  {
    id: "demo-1",
    role: "assistant",
    content: `Welcome to ${brandName}! I'm your AI assistant. I can help you explore the platform, learn about trading workflows, understand verification, or answer any questions about transparent sourcing.\n\nWhat would you like to know?`,
    createdAt: new Date().toISOString()
  }
];

const quickActions = [
  { label: "How it works", prompt: "How does the platform ensure transparency in trading?" },
  { label: "Verification process", prompt: "Explain the supplier verification process" },
  { label: "Pricing info", prompt: "How is gold pricing determined on your platform?" },
  { label: "Get started", prompt: "How do I get started as a buyer or supplier?" }
];

const metrics = {
  totalRotations: 847,
  totalVolumeKg: 12450,
  totalValueUsd: 892000000,
  activeSuppliers: 156,
  activeBuyers: 43,
  countries: 12
};

const traceabilitySteps = [
  { icon: MapPin, title: "Verified Mine", description: "Government-recognized sources" },
  { icon: FileCheck, title: "National Assayer", description: "Official purity certification" },
  { icon: Truck, title: "BRINKS Logistics", description: "Secure worldwide transport" },
  { icon: CheckCircle2, title: "Delivered", description: "Full traceability guaranteed" }
];

export function ECEHomePage() {
  const { isAuthenticated, isGuest, user, logout, guestSessionId } = useSession();
  const [, setLocation] = useLocation();
  const { tenant, brand } = useTenant();
  const { t } = useLocale();
  const isGoldTenant = tenant.key === "bdo";
  const demoMessages = useMemo(() => buildDemoMessages(brand.name), [brand.name]);
  const [messages, setMessages] = useState<ChatMessage[]>(demoMessages);
  const [inputMessage, setInputMessage] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTitle, setAuthModalTitle] = useState("Sign in to continue");
  const [authModalDescription, setAuthModalDescription] = useState("Create an account to save your conversations and access all features");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    document.title = formatPageTitle("Commodities Exchange", brand);
  }, [brand]);

  useEffect(() => {
    if (isAuthenticated && user && !isGuest) {
      const hasAdminAccess = user.roles?.includes('admin') || user.roles?.includes('shareholder') || user.roles?.includes('buyer') || user.roles?.includes('supplier');
      if (hasAdminAccess) {
        setLocation("/admin/dashboard");
      }
    }
  }, [isAuthenticated, user, isGuest, setLocation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("/api/ece/chat/guest", {
        method: "POST",
        body: JSON.stringify({ 
          content,
          guestSessionId: isGuest ? guestSessionId : undefined
        })
      });
    },
    onSuccess: (data) => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: data.response,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
    onError: (error: any) => {
      const isRateLimited = error.message?.includes("Too many requests");
      toast({
        title: isRateLimited ? "Message limit reached" : "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      });
      if (isRateLimited && isGuest) {
        setAuthModalTitle("Upgrade to unlimited access");
        setAuthModalDescription("Sign up now to continue chatting without limits");
        setShowAuthModal(true);
      }
    }
  });

  const handleSendMessage = (content: string) => {
    if (!content.trim()) return;
    
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: content.trim(),
      createdAt: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    sendMessageMutation.mutate(content.trim());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputMessage);
  };

  const handleQuickAction = (prompt: string) => {
    handleSendMessage(prompt);
  };

  const requireAuthFor = (action: string) => {
    setAuthModalTitle(`Sign in to ${action}`);
    setAuthModalDescription("Create an account to access this feature and save your progress");
    setShowAuthModal(true);
  };

  const handleLogout = () => {
    logout();
    setMessages(demoMessages);
    toast({
      title: "Logged out",
      description: "You've been logged out successfully"
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      <header className="border-b border-gray-800/50 backdrop-blur-sm sticky top-0 z-50 bg-gray-950/80">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Gem className="h-6 w-6 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Exportunity</h1>
              <p className="text-xs text-gray-500">Commodities Exchange</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated && user ? (
              <>
                <div className="hidden md:flex items-center gap-2 text-sm text-gray-400">
                  <User className="h-4 w-4" />
                  <span>{user.displayName}</span>
                  <Badge variant="outline" className="text-amber-500 border-amber-500/30 capitalize">
                    {user.currentMode}
                  </Badge>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleLogout}
                  className="text-gray-400 hover:text-white"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {t("common.signOut")}
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="ghost" 
                  className="text-gray-300 hover:text-white"
                  onClick={() => setShowAuthModal(true)}
                >
                  {t("common.signIn")}
                </Button>
                <Button 
                  className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  onClick={() => setShowAuthModal(true)}
                >
                  {t("common.createAccount")}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            <Card className="bg-gray-900/50 border-gray-800 h-[600px] flex flex-col">
              <CardHeader className="border-b border-gray-800 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-black" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-white">ECE Assistant</CardTitle>
                      <p className="text-xs text-gray-500">Powered by AI</p>
                    </div>
                  </div>
                  {isGuest && (
                    <Badge variant="outline" className="text-gray-400 border-gray-700">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Guest Mode
                    </Badge>
                  )}
                </div>
              </CardHeader>
              
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="bg-amber-500/20 text-amber-500">
                            <Gem className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-amber-500 text-black'
                            : 'bg-gray-800 text-gray-100'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.role === 'user' && (
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="bg-gray-700 text-gray-300">
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                  
                  {sendMessageMutation.isPending && (
                    <div className="flex gap-3 justify-start">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="bg-amber-500/20 text-amber-500">
                          <Gem className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-gray-800 rounded-lg px-4 py-3">
                        <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="border-t border-gray-800 p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((action, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      className="text-xs bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                      onClick={() => handleQuickAction(action.prompt)}
                      disabled={sendMessageMutation.isPending}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
                
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask about gold trading, verification, pricing..."
                    className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                    disabled={sendMessageMutation.isPending}
                  />
                  <Button 
                    type="submit" 
                    className="bg-amber-500 hover:bg-amber-600 text-black"
                    disabled={sendMessageMutation.isPending || !inputMessage.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
                
                {isGuest && (
                  <p className="text-xs text-center text-gray-500">
                    <button 
                      className="text-amber-500 hover:underline"
                      onClick={() => setShowAuthModal(true)}
                    >
                      Create an account
                    </button>
                    {" "}to save your conversations and access all features
                  </p>
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-amber-500" />
                  Platform Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {[
                  { label: "Rotations", value: metrics.totalRotations.toLocaleString(), icon: TrendingUp },
                  { label: "Volume", value: `${(metrics.totalVolumeKg / 1000).toFixed(1)}t`, icon: Gem },
                  { label: "Value", value: `$${(metrics.totalValueUsd / 1000000).toFixed(0)}M`, icon: BarChart3 },
                  { label: "Countries", value: metrics.countries.toString(), icon: Globe }
                ].map((metric, idx) => (
                  <div key={idx} className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <metric.icon className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                    <div className="text-lg font-bold text-white">{metric.value}</div>
                    <div className="text-xs text-gray-500">{metric.label}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-amber-500" />
                  Traceability Chain
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {traceabilitySteps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                      <step.icon className="h-4 w-4 text-amber-500" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{step.title}</div>
                      <div className="text-xs text-gray-500">{step.description}</div>
                    </div>
                    {idx < traceabilitySteps.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-gray-600 ml-auto" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-lg font-semibold text-white">Ready to Trade?</h3>
                <p className="text-sm text-gray-400">
                  {isGoldTenant
                    ? `Trade with ${brand.name} as the sole counterparty: customers buy from ${brand.name}, suppliers sell to ${brand.name}.`
                    : `Trade across the ${brand.name} marketplace with verified counterparties and compliant workflows.`}
                </p>
                <div className="flex gap-2">
                  <Button 
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"
                    onClick={() => {
                      if (isAuthenticated) {
                        setLocation("/admin/dashboard");
                      } else {
                        setShowAuthModal(true);
                      }
                    }}
                  >
                    {isAuthenticated ? "Go to Dashboard" : "Get Started"}
                  </Button>
                </div>
                <div className="flex items-center justify-center gap-4 text-xs text-gray-500 pt-2">
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3 text-amber-500" />
                    Verified
                  </span>
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3 text-amber-500" />
                    Secure
                  </span>
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3 text-amber-500" />
                    Global
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AuthModal 
        open={showAuthModal} 
        onOpenChange={setShowAuthModal}
        title={authModalTitle}
        description={authModalDescription}
        onSuccess={() => setLocation("/admin/dashboard")}
      />
    </div>
  );
}
