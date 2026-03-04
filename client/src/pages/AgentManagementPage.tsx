import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AgentHierarchyBuilder } from "@/components/AgentHierarchyBuilder";
import { AgentPreview } from "@/components/AgentPreview";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Network,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import type { Agent } from "@db/schema";
import { resolveApiUrl } from "@/lib/runtimeConfig";

export function AgentManagementPage() {
  const [agentDescription, setAgentDescription] = useState("");
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const previewAgent = useMutation({
    mutationFn: async (data: { description: string }) => {
      const response = await fetch(resolveApiUrl("/api/agents/preview"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedPreview(data);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to preview agent",
        variant: "destructive",
      });
    },
  });

  const generateAgent = useMutation({
    mutationFn: async (preview: any) => {
      const response = await fetch(resolveApiUrl("/api/agents/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({
        title: "Success",
        description: "Agent generated successfully",
      });
      setAgentDescription("");
      setGeneratedPreview(null);
      setIsGenerateDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate agent",
        variant: "destructive",
      });
    },
  });

  const handlePreviewAgent = () => {
    if (!agentDescription.trim()) {
      toast({
        title: "Error",
        description: "Please provide a description of the agent you want to generate",
        variant: "destructive",
      });
      return;
    }

    previewAgent.mutate({ description: agentDescription.trim() });
  };

  const handleConfirmGeneration = () => {
    if (!generatedPreview) return;
    generateAgent.mutate(generatedPreview);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-950">
        <div className="text-center space-y-4">
          <RefreshCw className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
          <p className="text-gray-400">Loading agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="container mx-auto py-8 px-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Hierarchy</h1>
          <p className="text-muted-foreground">
            Organize and manage your business simulation agents
          </p>
        </div>
        <Button onClick={() => setIsGenerateDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Generate Agent
        </Button>
      </div>

      <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate New Agent</DialogTitle>
            <DialogDescription>
              Describe the type of agent you want to generate. You can specify their role, personality traits, expertise, and any other relevant characteristics.
            </DialogDescription>
          </DialogHeader>
          {!generatedPreview ? (
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="description">Agent Description</Label>
                <Textarea
                  id="description"
                  placeholder="Example: A strategic marketing director with expertise in digital campaigns, strong analytical skills, and a collaborative leadership style..."
                  value={agentDescription}
                  onChange={(e) => setAgentDescription(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAgentDescription("");
                    setIsGenerateDialogOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handlePreviewAgent}
                  disabled={previewAgent.isPending}
                >
                  {previewAgent.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Previewing...
                    </>
                  ) : (
                    "Preview Agent"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <AgentPreview
              preview={generatedPreview}
              isLoading={generateAgent.isPending}
              onConfirm={handleConfirmGeneration}
              onRegenerate={handlePreviewAgent}
              onCancel={() => {
                setGeneratedPreview(null);
                setAgentDescription("");
                setIsGenerateDialogOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="border-b border-gray-800">
          <CardTitle className="flex items-center gap-2 text-white">
            <Network className="h-5 w-5 text-blue-400" />
            Agent Hierarchy
          </CardTitle>
          <CardDescription className="text-gray-400">
            Drag and drop agents to reorganize the hierarchy
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <AgentHierarchyBuilder agents={agents} />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

export default AgentManagementPage;
