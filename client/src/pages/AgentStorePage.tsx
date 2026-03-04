import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import {
  Bot,
  Sparkles,
  Check,
  Zap,
  TrendingUp,
  Users,
  MessageSquare,
  Phone,
  ShoppingCart,
  PenTool,
  Star,
  Loader2
} from "lucide-react";

interface AgentType {
  id: number;
  code: string;
  name: string;
  description: string;
  pitch: string;
  category: string;
  baseDailyCost: string;
  isStarter: boolean;
  icon: string | null;
  color: string | null;
}

interface AgentTier {
  id: number;
  name: string;
  displayName: string;
  description: string;
  features: string[];
  costMultiplier: string;
}

interface CatalogData {
  agentTypes: AgentType[];
  agentTiers: AgentTier[];
}

const categoryIcons: Record<string, React.ElementType> = {
  social: MessageSquare,
  business: TrendingUp,
  productivity: Zap,
  sales: ShoppingCart,
  content: PenTool
};

export function AgentStorePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [agentName, setAgentName] = useState("");
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  const { data: catalog, isLoading } = useQuery<CatalogData>({
    queryKey: ["/api/personal-clones/agent-types"]
  });

  const { data: userAgents } = useQuery({
    queryKey: ["/api/personal-clones/agents"]
  });

  const activateMutation = useMutation({
    mutationFn: async (data: { agentTypeId: number; tierId: number; name: string }) => {
      const response = await fetch(resolveApiUrl("/api/personal-clones/agents"), {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to activate agent (${response.status})`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personal-clones/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      toast({
        title: "Agent Activated!",
        description: "Your new agent is now learning. This will take about 24 hours.",
      });
      setShowActivateDialog(false);
      setSelectedAgent(null);
      setSelectedTier(null);
      setAgentName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Activation Failed",
        description: error.message || "Failed to activate agent. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleActivate = (agent: AgentType) => {
    setSelectedAgent(agent);
    setAgentName(agent.name);
    setSelectedTier(catalog?.agentTiers[0]?.id || null);
    setShowActivateDialog(true);
  };

  const confirmActivation = () => {
    if (!selectedAgent || !selectedTier || !agentName) {
      toast({
        title: "Missing Information",
        description: "Please select a tier and provide a name for your agent.",
        variant: "destructive"
      });
      return;
    }

    activateMutation.mutate({
      agentTypeId: selectedAgent.id,
      tierId: selectedTier,
      name: agentName
    });
  };

  const calculateCost = (baseCost: string, multiplier: string) => {
    const base = parseFloat(baseCost);
    const mult = parseFloat(multiplier);
    return (base * mult).toFixed(2);
  };

  const getCategoryIcon = (category: string) => {
    const Icon = categoryIcons[category] || Bot;
    return Icon;
  };

  const starterAgent = catalog?.agentTypes.find(a => a.isStarter);
  const otherAgents = catalog?.agentTypes.filter(a => !a.isStarter);

  const groupedAgents = otherAgents?.reduce((acc, agent) => {
    if (!acc[agent.category]) {
      acc[agent.category] = [];
    }
    acc[agent.category].push(agent);
    return acc;
  }, {} as Record<string, AgentType[]>);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 bg-gray-800" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64 bg-gray-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Bot className="h-8 w-8 text-blue-400" />
            Agent Store
          </h1>
          <p className="text-gray-400 mt-1">
            Activate AI agents to automate your workflows
          </p>
        </div>

        {/* Starter Agent (Personal Clone) */}
        {starterAgent && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-400" />
              <h2 className="text-xl font-semibold text-white">Start Here</h2>
              <Badge variant="outline" className="bg-yellow-900/20 text-yellow-400 border-yellow-600">
                Recommended First Agent
              </Badge>
            </div>
            
            <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-700">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl text-white flex items-center gap-2">
                      <Sparkles className="h-6 w-6 text-blue-400" />
                      {starterAgent.name}
                    </CardTitle>
                    <CardDescription className="text-gray-300 mt-2">
                      {starterAgent.description}
                    </CardDescription>
                  </div>
                  <Badge className="bg-blue-600 text-white">Starter</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4 italic">"{starterAgent.pitch}"</p>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-400">Starting at</div>
                    <div className="text-2xl font-bold text-white">
                      {parseFloat(starterAgent.baseDailyCost).toFixed(2)}
                      <span className="text-sm text-gray-400 ml-1">credits/day</span>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    onClick={() => handleActivate(starterAgent)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Activate Your Clone
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Other Agents by Category */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-white">More Agents</h2>
          
          <Tabs defaultValue={Object.keys(groupedAgents || {})[0]} className="w-full">
            <TabsList className="bg-gray-900 border border-gray-800">
              {Object.keys(groupedAgents || {}).map((category) => {
                const Icon = getCategoryIcon(category);
                return (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className="data-[state=active]:bg-gray-800 data-[state=active]:text-white"
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {Object.entries(groupedAgents || {}).map(([category, agents]) => (
              <TabsContent key={category} value={category} className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agents.map((agent) => {
                    const Icon = getCategoryIcon(category);
                    return (
                      <Card key={agent.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-gray-800 flex items-center justify-center">
                                <Icon className="h-5 w-5 text-blue-400" />
                              </div>
                              <div>
                                <CardTitle className="text-lg text-white">{agent.name}</CardTitle>
                                <Badge variant="outline" className="mt-1 text-xs">
                                  {category}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-400 mb-4">{agent.description}</p>
                          {agent.pitch && (
                            <p className="text-sm text-gray-300 italic mb-4">"{agent.pitch}"</p>
                          )}
                          <div className="text-sm text-gray-400">Starting at</div>
                          <div className="text-xl font-bold text-white">
                            {parseFloat(agent.baseDailyCost).toFixed(2)}
                            <span className="text-sm text-gray-400 ml-1">credits/day</span>
                          </div>
                        </CardContent>
                        <CardFooter>
                          <Button
                            className="w-full bg-gray-800 hover:bg-gray-700 text-white"
                            onClick={() => handleActivate(agent)}
                          >
                            Activate Agent
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>

      {/* Activation Dialog */}
      <Dialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Activate {selectedAgent?.name}</DialogTitle>
            <DialogDescription className="text-gray-400">
              Choose a tier and name your agent to get started
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Agent Name Input */}
            <div className="space-y-2">
              <Label htmlFor="agentName" className="text-white">Agent Name</Label>
              <Input
                id="agentName"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g., My Personal Clone"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            {/* Tier Selection */}
            <div className="space-y-3">
              <Label className="text-white">Select Tier</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {catalog?.agentTiers.map((tier) => {
                  const dailyCost = selectedAgent
                    ? calculateCost(selectedAgent.baseDailyCost, tier.costMultiplier)
                    : "0";
                  const isSelected = selectedTier === tier.id;

                  return (
                    <button
                      key={tier.id}
                      onClick={() => setSelectedTier(tier.id)}
                      className={`p-4 rounded-lg border-2 transition-all text-left ${
                        isSelected
                          ? "border-blue-500 bg-blue-900/20"
                          : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-white">{tier.displayName}</div>
                        {isSelected && <Check className="h-5 w-5 text-blue-400" />}
                      </div>
                      <div className="text-sm text-gray-400 mb-3">{tier.description}</div>
                      <div className="text-xl font-bold text-white">
                        {dailyCost}
                        <span className="text-xs text-gray-400 ml-1">credits/day</span>
                      </div>
                      {tier.features && tier.features.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {tier.features.map((feature, idx) => (
                            <li key={idx} className="text-xs text-gray-400 flex items-center gap-1">
                              <Check className="h-3 w-3 text-green-400" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cost Summary */}
            {selectedAgent && selectedTier && catalog && (
              <Alert className="bg-blue-900/20 border-blue-700">
                <AlertDescription className="text-gray-300">
                  Your agent will cost{" "}
                  <strong>
                    {calculateCost(
                      selectedAgent.baseDailyCost,
                      catalog.agentTiers.find(t => t.id === selectedTier)?.costMultiplier || "1"
                    )} credits/day
                  </strong>{" "}
                  and will take approximately 24 hours to complete initial learning.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowActivateDialog(false)}
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmActivation}
              disabled={!selectedTier || !agentName || activateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {activateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Activating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Activate Agent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
