import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileUp, Download, Database, FileDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUpload } from "@/components/FileUpload";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { MemoryOrganizer } from "@/components/MemoryOrganizer";
import type { Memory } from "@/types/memory";
import type { Agent } from "@db/schema";
import { Brain, Search, RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { Zap } from "lucide-react"; // Added import
import { resolveApiUrl } from "@/lib/runtimeConfig";

export function AgentMemoryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const { toast } = useToast();

  const { data: agents = [], isLoading: isLoadingAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: fetchedMemories, isLoading: isLoadingMemories } = useQuery<Memory[]>({
    queryKey: ["/api/memories", selectedAgent],
    enabled: selectedAgent !== null && !searchQuery,
  });

  useEffect(() => {
    if (fetchedMemories) setMemories(fetchedMemories);
  }, [fetchedMemories]);

  const searchMemories = useMutation<Memory[], Error, { query: string; agentId: number | null }>({
    mutationFn: async ({ query, agentId }) => {
      const response = await fetch(resolveApiUrl("/api/memories/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, agentId }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (data) => {
      setMemories(data);
    },
    onError: (error) => {
      toast({
        title: "Search Error",
        description: error instanceof Error ? error.message : "Failed to search memories",
        variant: "destructive",
      });
    },
  });

  const uploadFile = useMutation({
    mutationFn: async ({ file, agentId }: { file: File; agentId: number }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("agentId", agentId.toString());

      const response = await fetch(resolveApiUrl("/api/memories/upload"), {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "File Uploaded",
        description: "File has been uploaded and processed successfully",
      });
      setIsUploadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/memories", selectedAgent] });
    },
    onError: (error) => {
      toast({
        title: "Upload Error",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (file: File) => {
    if (!selectedAgent) {
      toast({
        title: "Error",
        description: "Please select an agent first",
        variant: "destructive",
      });
      return;
    }

    await uploadFile.mutateAsync({ file, agentId: selectedAgent });
  };

  const handleDriveSelect = async (fileId: string, fileName: string) => {
    if (!selectedAgent) {
      toast({
        title: "Error",
        description: "Please select an agent first",
        variant: "destructive",
      });
      return;
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    await searchMemories.mutateAsync({
      query: searchQuery,
      agentId: selectedAgent,
    });
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (!selectedAgent) {
      toast({
        title: "Error",
        description: "Please select an agent first",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(
        resolveApiUrl(`/api/memories/${selectedAgent}/export?format=${format}`),
      );
      if (!response.ok) throw new Error(await response.text());

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || `memories.${format}`;

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: `Memories exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export memories",
        variant: "destructive",
      });
    }
  };

  const handleBackup = async () => {
    try {
      const response = await fetch(resolveApiUrl('/api/memories/backup'));
      if (!response.ok) throw new Error(await response.text());

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memory-backup-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Backup Created",
        description: "Full memory backup has been downloaded",
      });
    } catch (error) {
      toast({
        title: "Backup Failed",
        description: error instanceof Error ? error.message : "Failed to create backup",
        variant: "destructive",
      });
    }
  };

  const compressMemories = useMutation({
    mutationFn: async ({
      agentId,
      similarityThreshold = 0.85,
      lengthThreshold = 500,
    }: {
      agentId: number;
      similarityThreshold?: number;
      lengthThreshold?: number;
    }) => {
      const response = await fetch(resolveApiUrl(`/api/memories/${agentId}/compress`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ similarityThreshold, lengthThreshold }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (data) => {
      setMemories(data.memories);
      toast({
        title: "Memories Compressed",
        description: "Successfully compressed and optimized agent memories",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/memories", selectedAgent] });
    },
    onError: (error) => {
      toast({
        title: "Compression Failed",
        description: error instanceof Error ? error.message : "Failed to compress memories",
        variant: "destructive",
      });
    },
  });

  const handleCompression = async () => {
    if (!selectedAgent) {
      toast({
        title: "Error",
        description: "Please select an agent first",
        variant: "destructive",
      });
      return;
    }

    await compressMemories.mutateAsync({ agentId: selectedAgent });
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Agent Memory Management</h1>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={!selectedAgent}
                className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                <Download className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={handleBackup}
            className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
          >
            <Database className="h-4 w-4 mr-2" />
            Backup All
          </Button>

          <Button
            onClick={() => setIsUploadOpen(true)}
            disabled={!selectedAgent}
            className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
          >
            <FileUp className="h-4 w-4 mr-2" />
            Import File
          </Button>
          <Button
            onClick={handleCompression}
            disabled={!selectedAgent || compressMemories.isPending}
            className="bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
          >
            <Zap className="h-4 w-4 mr-2" />
            {compressMemories.isPending ? "Compressing..." : "Optimize Memories"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-100">
              <Brain className="h-5 w-5 text-blue-400" />
              Active Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingAgents ? (
              <div className="flex justify-center py-4">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
              </div>
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <TooltipProvider key={agent.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={selectedAgent === agent.id ? "secondary" : "ghost"}
                          className={`w-full justify-start transition-all duration-200 ${
                            selectedAgent === agent.id
                              ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                              : 'text-gray-300 hover:text-white hover:bg-gray-800'
                          }`}
                          onClick={() => setSelectedAgent(agent.id)}
                        >
                          <div className="mr-2 text-lg">{agent.avatar}</div>
                          <div className="text-left">
                            <div className="font-medium">{agent.name}</div>
                            <div className="text-xs text-gray-400">{agent.role}</div>
                          </div>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-gray-800 border-gray-700">
                        <p>Click to view {agent.name}'s memories</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="col-span-9 space-y-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="border-b border-gray-800">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-gray-100">
                  <Brain className="h-5 w-5 text-blue-400" />
                  Memory Network
                </CardTitle>
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Search memories using natural language..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-[400px] bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={!searchQuery.trim() || searchMemories.isPending}
                    className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                  >
                    {searchMemories.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      "Search"
                    )}
                  </Button>
                </form>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {isLoadingMemories || searchMemories.isPending ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
                </div>
              ) : selectedAgent ? (
                <MemoryOrganizer
                  memories={memories}
                  onOrderChange={(newMemories) => {
                    setMemories([...newMemories]);
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Brain className="h-12 w-12 text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-gray-300 mb-2">No Agent Selected</h3>
                  <p className="text-gray-400 max-w-md">
                    Select an agent from the sidebar to view their memories and knowledge base
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import File to Agent Memory</DialogTitle>
            <DialogDescription>
              Upload a file from your computer or select from Google Drive
            </DialogDescription>
          </DialogHeader>
          <FileUpload
            onFileSelect={handleFileSelect}
            onDriveSelect={handleDriveSelect}
            accept=".pdf,.doc,.docx,.txt,.csv,.json"
            maxSize={50 * 1024 * 1024}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AgentMemoryPage;
