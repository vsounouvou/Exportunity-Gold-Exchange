import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  FileText,
  Upload,
  Link as LinkIcon,
  Sparkles,
  Search,
  Folder,
  Cloud,
  File,
  Plus,
  Tag,
  Clock,
  User,
  Building2,
  Download,
  Edit,
  Trash2,
  Eye,
  FileUp,
  Globe,
  Filter,
  FolderOpen
} from "lucide-react";
import { format } from "date-fns";
import { useCompany } from "@/hooks/use-company";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Loader2 } from "lucide-react";

// Document types
interface Document {
  id: string;
  title: string;
  type: "pdf" | "note" | "ai_doc" | "web_import" | "file";
  companyId: number;
  companyName: string;
  spaceId?: string;
  spaceName?: string;
  tags: string[];
  createdBy: string;
  createdByType: "human" | "agent";
  createdAt: string;
  updatedAt: string;
  size?: string;
  preview?: string;
}

// Space types
interface Space {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  lastActivity: string;
  color: string;
}

// Source types
interface Source {
  id: string;
  type: "google_drive" | "notion" | "confluence" | "dropbox";
  name: string;
  connected: boolean;
  lastSync?: string;
  documentsCount: number;
}

type AddMode = "menu" | "upload" | "note" | "url" | "ai";

interface FormProps {
  onBack: () => void;
  onClose: () => void;
  spaces: Space[];
}

function UploadFileForm({ onBack, onClose, spaces }: FormProps) {
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/knowledge/upload", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({ title: "File uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge/documents'] });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to upload file", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    
    const formData = {
      title: title || file.name,
      spaceId,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      fileName: file.name,
      fileSize: file.size,
    };
    
    uploadMutation.mutate(formData);
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <DialogTitle className="text-white">Upload File</DialogTitle>
        </div>
        <DialogDescription className="text-gray-400">
          Upload a file to your knowledge base
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="file" className="text-white">File</Label>
          <Input
            id="file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="bg-gray-800 border-gray-700"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title" className="text-white">Title (optional)</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter document title..."
            className="bg-gray-800 border-gray-700"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="space" className="text-white">Space</Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger className="bg-gray-800 border-gray-700">
              <SelectValue placeholder="Select a space (optional)" />
            </SelectTrigger>
            <SelectContent>
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags" className="text-white">Tags</Label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated tags..."
            className="bg-gray-800 border-gray-700"
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="submit" disabled={!file || uploadMutation.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700">
            {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Upload
          </Button>
        </div>
      </form>
    </>
  );
}

function CreateNoteForm({ onBack, onClose, spaces }: FormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [tags, setTags] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/knowledge/note", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({ title: "Note created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge/documents'] });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to create note", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title,
      content,
      spaceId,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
    });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <DialogTitle className="text-white">Create Note</DialogTitle>
        </div>
        <DialogDescription className="text-gray-400">
          Write a new note for your knowledge base
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="note-title" className="text-white">Title</Label>
          <Input
            id="note-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter note title..."
            className="bg-gray-800 border-gray-700"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content" className="text-white">Content</Label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note content..."
            className="bg-gray-800 border-gray-700 min-h-[200px]"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="note-space" className="text-white">Space</Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger className="bg-gray-800 border-gray-700">
              <SelectValue placeholder="Select a space (optional)" />
            </SelectTrigger>
            <SelectContent>
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="note-tags" className="text-white">Tags</Label>
          <Input
            id="note-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated tags..."
            className="bg-gray-800 border-gray-700"
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="submit" disabled={createMutation.isPending} className="flex-1 bg-green-600 hover:bg-green-700">
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Note
          </Button>
        </div>
      </form>
    </>
  );
}

function ImportUrlForm({ onBack, onClose, spaces }: FormProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [tags, setTags] = useState("");
  const { toast } = useToast();

  const importMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/knowledge/import-url", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({ title: "URL imported successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge/documents'] });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to import URL", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    importMutation.mutate({
      url,
      title,
      spaceId,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
    });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <DialogTitle className="text-white">Import from URL</DialogTitle>
        </div>
        <DialogDescription className="text-gray-400">
          Import content from a web page
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="url" className="text-white">URL</Label>
          <Input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="bg-gray-800 border-gray-700"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="url-title" className="text-white">Title (optional)</Label>
          <Input
            id="url-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter document title..."
            className="bg-gray-800 border-gray-700"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="url-space" className="text-white">Space</Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger className="bg-gray-800 border-gray-700">
              <SelectValue placeholder="Select a space (optional)" />
            </SelectTrigger>
            <SelectContent>
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="url-tags" className="text-white">Tags</Label>
          <Input
            id="url-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated tags..."
            className="bg-gray-800 border-gray-700"
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="submit" disabled={importMutation.isPending} className="flex-1 bg-purple-600 hover:bg-purple-700">
            {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import
          </Button>
        </div>
      </form>
    </>
  );
}

function CreateWithAIForm({ onBack, onClose, spaces }: FormProps) {
  const [prompt, setPrompt] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [tags, setTags] = useState("");
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/knowledge/generate-ai", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({ title: "Document generated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge/documents'] });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to generate document", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    generateMutation.mutate({
      prompt,
      spaceId,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
    });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <DialogTitle className="text-white">Create with AI</DialogTitle>
        </div>
        <DialogDescription className="text-gray-400">
          Generate a document using AI
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="prompt" className="text-white">What do you want to create?</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want the AI to generate... e.g., 'Create a comprehensive guide for onboarding new sales agents in West Africa'"
            className="bg-gray-800 border-gray-700 min-h-[150px]"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-space" className="text-white">Space</Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger className="bg-gray-800 border-gray-700">
              <SelectValue placeholder="Select a space (optional)" />
            </SelectTrigger>
            <SelectContent>
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-tags" className="text-white">Tags</Label>
          <Input
            id="ai-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated tags..."
            className="bg-gray-800 border-gray-700"
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="submit" disabled={generateMutation.isPending} className="flex-1 bg-yellow-600 hover:bg-yellow-700">
            {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Generate
          </Button>
        </div>
      </form>
    </>
  );
}

export function KnowledgeBasePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSpace, setFilterSpace] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("menu");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const { selectedCompanyId } = useCompany();
  
  const resetAddDialog = () => {
    setShowAddDialog(false);
    setAddMode("menu");
  };
  
  // Fetch companies to get name
  const { data: companies = [] } = useQuery<any[]>({
    queryKey: ["/api/companies"],
  });

  // Fetch real data from API
  const { data: documentsData = [], isLoading: documentsLoading } = useQuery<any[]>({
    queryKey: ['/api/knowledge/documents'],
  });

  const { data: spacesData = [], isLoading: spacesLoading } = useQuery<any[]>({
    queryKey: ['/api/knowledge/spaces'],
  });

  // Transform data to match frontend format
  const mockDocuments: Document[] = documentsData.map((doc: any) => ({
    id: doc.id.toString(),
    title: doc.title,
    type: doc.type,
    companyId: doc.companyId,
    companyName: companies.find(c => c.id === doc.companyId)?.name || 'Unknown',
    spaceId: doc.spaceId?.toString(),
    spaceName: doc.space?.name,
    tags: doc.tags || [],
    createdBy: doc.createdByAgent?.name || 'Platform',
    createdByType: doc.createdByType,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    size: doc.fileSize ? `${(doc.fileSize / 1024 / 1024).toFixed(1)} MB` : undefined,
    preview: doc.preview
  }));

  const mockSpaces: Space[] = spacesData.map((space: any) => ({
    id: space.id.toString(),
    name: space.name,
    description: space.description || '',
    documentCount: space.documentCount || 0,
    lastActivity: space.updatedAt,
    color: space.color || 'bg-gray-500/10 text-gray-400'
  }));

  const mockSources: Source[] = [
    { id: "1", type: "google_drive", name: "Company Shared Drive", connected: true, lastSync: new Date(Date.now() - 3600000).toISOString(), documentsCount: 45 },
    { id: "2", type: "notion", name: "Product Wiki", connected: true, lastSync: new Date(Date.now() - 7200000).toISOString(), documentsCount: 28 },
    { id: "3", type: "dropbox", name: "Marketing Assets", connected: false, documentsCount: 0 },
  ];

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);
  
  // Filter documents
  const filteredDocuments = mockDocuments.filter(doc => {
    if (selectedCompanyId && doc.companyId !== selectedCompanyId) return false;
    if (filterType !== "all" && doc.type !== filterType) return false;
    if (filterSpace !== "all" && doc.spaceId !== filterSpace) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return doc.title.toLowerCase().includes(query) ||
        doc.tags.some(tag => tag.toLowerCase().includes(query)) ||
        (doc.preview && doc.preview.toLowerCase().includes(query));
    }
    return true;
  });

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case "pdf": return <FileText className="h-4 w-4 text-red-400" />;
      case "note": return <File className="h-4 w-4 text-blue-400" />;
      case "ai_doc": return <Sparkles className="h-4 w-4 text-purple-400" />;
      case "web_import": return <Globe className="h-4 w-4 text-green-400" />;
      default: return <File className="h-4 w-4 text-gray-400" />;
    }
  };

  const getDocumentTypeBadge = (type: string) => {
    const labels = {
      pdf: "PDF",
      note: "Note",
      ai_doc: "AI Doc",
      web_import: "Web Import",
      file: "File"
    };
    return labels[type as keyof typeof labels] || "Unknown";
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "google_drive": return "🗂️";
      case "notion": return "📝";
      case "confluence": return "🌐";
      case "dropbox": return "📦";
      default: return "☁️";
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      <div className="container mx-auto px-4 md:px-6 py-4 md:py-8 space-y-4 md:space-y-6">
        {/* Header - stacks on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-white">Knowledge Base</h1>
            <p className="text-gray-400 text-sm mt-1">
              Shared documents for {selectedCompany ? selectedCompany.name : "all companies"}
            </p>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="bg-blue-600 hover:bg-blue-700 h-11 w-full sm:w-auto">
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Add to Knowledge Base</span>
            <span className="md:hidden">Add</span>
          </Button>
        </div>

        {/* Search Bar */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-800 h-11"
          />
        </div>

        {/* Metrics - horizontal scroll on mobile */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4">
          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="pb-2 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-medium text-gray-400">Documents</CardTitle>
                <FileText className="h-4 w-4 text-blue-400" />
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-xl md:text-2xl font-bold text-white">{mockDocuments.length}</div>
              <p className="text-[10px] md:text-xs text-gray-500 mt-1">All spaces</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="pb-2 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-medium text-gray-400">Spaces</CardTitle>
                <Folder className="h-4 w-4 text-purple-400" />
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-xl md:text-2xl font-bold text-white">{mockSpaces.length}</div>
              <p className="text-[10px] md:text-xs text-gray-500 mt-1">Collections</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="pb-2 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-medium text-gray-400">Sources</CardTitle>
                <Cloud className="h-4 w-4 text-green-400" />
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-xl md:text-2xl font-bold text-white">
                {mockSources.filter(s => s.connected).length}
              </div>
              <p className="text-[10px] md:text-xs text-gray-500 mt-1">Connected</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="pb-2 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-medium text-gray-400">AI Docs</CardTitle>
                <Sparkles className="h-4 w-4 text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-xl md:text-2xl font-bold text-white">
                {mockDocuments.filter(d => d.type === "ai_doc").length}
              </div>
              <p className="text-[10px] md:text-xs text-gray-500 mt-1">Generated</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="documents" className="space-y-4 md:space-y-6">
          <TabsList className="bg-gray-900 border-gray-800 w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="documents" className="h-10 text-xs sm:text-sm">Documents</TabsTrigger>
            <TabsTrigger value="spaces" className="h-10 text-xs sm:text-sm">Spaces</TabsTrigger>
            <TabsTrigger value="sources" className="h-10 text-xs sm:text-sm">Sources</TabsTrigger>
          </TabsList>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-3 md:space-y-4">
            {/* Filters - stack on mobile */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[180px] bg-gray-900 border-gray-800 h-11">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="ai_doc">AI Document</SelectItem>
                  <SelectItem value="web_import">Web Import</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterSpace} onValueChange={setFilterSpace}>
                <SelectTrigger className="w-full sm:w-[200px] bg-gray-900 border-gray-800 h-11">
                  <SelectValue placeholder="All Spaces" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Spaces</SelectItem>
                  {mockSpaces.map(space => (
                    <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Documents List */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-white text-base md:text-lg">Documents</CardTitle>
                <CardDescription className="text-xs md:text-sm">{filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''} found</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <div className="space-y-3">
                  {filteredDocuments.map((doc) => (
                    <Card 
                      key={doc.id} 
                      className="bg-gray-800/50 border-gray-700 hover:border-blue-500/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedDocument(doc)}
                    >
                      <CardContent className="p-3 md:p-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                            {getDocumentIcon(doc.type)}
                            <h4 className="text-xs md:text-sm font-medium text-white truncate flex-1">{doc.title}</h4>
                            <Badge variant="secondary" className="text-[10px] md:text-xs">
                              {getDocumentTypeBadge(doc.type)}
                            </Badge>
                          </div>
                          
                          {doc.preview && (
                            <p className="text-xs md:text-sm text-gray-400 line-clamp-2">{doc.preview}</p>
                          )}

                          <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs text-gray-400 flex-wrap">
                            {doc.spaceName && (
                              <span className="flex items-center gap-1">
                                <Folder className="h-3 w-3" />
                                {doc.spaceName}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {doc.createdBy}
                            </span>
                            <span className="flex items-center gap-1 hidden sm:flex">
                              <Building2 className="h-3 w-3" />
                              {doc.companyName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(doc.createdAt), "MMM d")}
                            </span>
                            {doc.size && (
                              <span className="hidden md:inline">{doc.size}</span>
                            )}
                          </div>

                          {doc.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 md:gap-2">
                              {doc.tags.slice(0, 3).map((tag, idx) => (
                                <Badge key={idx} variant="outline" className="text-[10px] md:text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              {doc.tags.length > 3 && (
                                <Badge variant="outline" className="text-[10px] md:text-xs">
                                  +{doc.tags.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {filteredDocuments.length === 0 && (
                    <div className="py-8 md:py-12 text-center">
                      <FileText className="h-12 w-12 md:h-16 md:w-16 text-gray-600 mx-auto mb-4" />
                      <h3 className="text-base md:text-lg font-medium text-gray-300">No documents found</h3>
                      <p className="text-gray-500 mt-2 text-sm">Try adjusting your filters or add new documents</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Spaces Tab */}
          <TabsContent value="spaces" className="space-y-3 md:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {mockSpaces.map((space) => (
                <Card 
                  key={space.id} 
                  className="bg-gray-900 border-gray-800 hover:border-blue-500/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedSpace(space)}
                >
                  <CardHeader className="p-3 md:p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${space.color} flex-shrink-0`}>
                        <Folder className="h-4 w-4 md:h-5 md:w-5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-white text-sm md:text-base truncate">{space.name}</CardTitle>
                        <CardDescription className="text-xs mt-1 line-clamp-2">{space.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 md:p-4 pt-0">
                    <div className="flex items-center justify-between text-xs md:text-sm">
                      <span className="text-gray-400">{space.documentCount} docs</span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(space.lastActivity), "MMM d")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button variant="outline" className="w-full border-gray-700 h-11">
              <Plus className="h-4 w-4 mr-2" />
              Create New Space
            </Button>
          </TabsContent>

          {/* Sources Tab */}
          <TabsContent value="sources" className="space-y-3 md:space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-white text-base md:text-lg">Connected Sources</CardTitle>
                <CardDescription className="text-xs md:text-sm">External integrations synced to your knowledge base</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <div className="space-y-3">
                  {mockSources.map((source) => (
                    <Card key={source.id} className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-3 md:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3 md:gap-4">
                            <div className="text-2xl md:text-3xl">{getSourceIcon(source.type)}</div>
                            <div className="min-w-0">
                              <h4 className="text-xs md:text-sm font-medium text-white truncate">{source.name}</h4>
                              <p className="text-[10px] md:text-xs text-gray-400 mt-1">
                                {source.type.replace('_', ' ').toUpperCase()}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between sm:justify-end gap-3">
                            {source.connected ? (
                              <>
                                <div className="text-left sm:text-right">
                                  <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">
                                    Connected
                                  </Badge>
                                  <p className="text-[10px] md:text-xs text-gray-500 mt-1">
                                    {source.documentsCount} docs
                                    <span className="hidden sm:inline"> • Synced {source.lastSync && format(new Date(source.lastSync), "h:mm a")}</span>
                                  </p>
                                </div>
                                <Button size="sm" variant="outline" className="h-9">Configure</Button>
                              </>
                            ) : (
                              <>
                                <Badge variant="outline" className="text-gray-400 text-xs">
                                  Not Connected
                                </Badge>
                                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-9">Connect</Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add to Knowledge Base Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        if (!open) resetAddDialog();
        else setShowAddDialog(true);
      }}>
        <DialogContent className="bg-gray-900 border-gray-800 sm:max-w-md">
          {addMode === "menu" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">Add to Knowledge Base</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Choose how you want to add content to your knowledge base
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-2 gap-4 py-4">
                <Button 
                  variant="outline" 
                  className="h-24 flex-col gap-2 border-gray-700 hover:border-blue-500"
                  onClick={() => setAddMode("upload")}
                >
                  <FileUp className="h-8 w-8 text-blue-400" />
                  <span className="text-sm">Upload File</span>
                </Button>

                <Button 
                  variant="outline" 
                  className="h-24 flex-col gap-2 border-gray-700 hover:border-green-500"
                  onClick={() => setAddMode("note")}
                >
                  <File className="h-8 w-8 text-green-400" />
                  <span className="text-sm">Create Note</span>
                </Button>

                <Button 
                  variant="outline" 
                  className="h-24 flex-col gap-2 border-gray-700 hover:border-purple-500"
                  onClick={() => setAddMode("url")}
                >
                  <LinkIcon className="h-8 w-8 text-purple-400" />
                  <span className="text-sm">Import from URL</span>
                </Button>

                <Button 
                  variant="outline" 
                  className="h-24 flex-col gap-2 border-gray-700 hover:border-yellow-500"
                  onClick={() => setAddMode("ai")}
                >
                  <Sparkles className="h-8 w-8 text-yellow-400" />
                  <span className="text-sm">Create with AI</span>
                </Button>
              </div>
            </>
          )}

          {addMode === "upload" && (
            <UploadFileForm onBack={() => setAddMode("menu")} onClose={resetAddDialog} spaces={mockSpaces} />
          )}

          {addMode === "note" && (
            <CreateNoteForm onBack={() => setAddMode("menu")} onClose={resetAddDialog} spaces={mockSpaces} />
          )}

          {addMode === "url" && (
            <ImportUrlForm onBack={() => setAddMode("menu")} onClose={resetAddDialog} spaces={mockSpaces} />
          )}

          {addMode === "ai" && (
            <CreateWithAIForm onBack={() => setAddMode("menu")} onClose={resetAddDialog} spaces={mockSpaces} />
          )}
        </DialogContent>
      </Dialog>

      {/* Document Detail Sheet */}
      <Sheet open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <SheetContent className="bg-gray-900 border-gray-800 sm:max-w-2xl overflow-y-auto">
          {selectedDocument && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  {getDocumentIcon(selectedDocument.type)}
                  <SheetTitle className="text-white text-xl">{selectedDocument.title}</SheetTitle>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="secondary">{getDocumentTypeBadge(selectedDocument.type)}</Badge>
                  {selectedDocument.tags.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Preview */}
                {selectedDocument.preview && (
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-sm text-white">Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-300">{selectedDocument.preview}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Metadata */}
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-sm text-white">Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Company:</span>
                      <span className="text-white">{selectedDocument.companyName}</span>
                    </div>
                    {selectedDocument.spaceName && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Space:</span>
                        <span className="text-white">{selectedDocument.spaceName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-400">Created by:</span>
                      <span className="text-white">{selectedDocument.createdBy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Created:</span>
                      <span className="text-white">{format(new Date(selectedDocument.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                    </div>
                    {selectedDocument.size && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Size:</span>
                        <span className="text-white">{selectedDocument.size}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <Button variant="outline" className="w-full justify-start">
                    <Eye className="h-4 w-4 mr-2" />
                    Open Full View
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Summarize with AI
                  </Button>
                  <Button variant="outline" className="w-full justify-start text-red-400 hover:text-red-300">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
