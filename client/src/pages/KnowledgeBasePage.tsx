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
  Link as LinkIcon,
  Sparkles,
  Search,
  Folder,
  File,
  Plus,
  Clock,
  User,
  Building2,
  FileUp,
  Globe,
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
}

type AddMode = "menu" | "upload" | "note" | "url" | "ai";

interface FormProps {
  onBack: () => void;
  onClose: () => void;
  spaces: Space[];
}

const fieldClassName = "border-slate-200 bg-white text-slate-950";
const outlineActionClassName = "border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]";
const primaryActionClassName = "bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]";

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
          <DialogTitle className="text-slate-950">Upload file</DialogTitle>
        </div>
        <DialogDescription className="text-slate-500">
          Upload a file to your knowledge base
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="file" className="text-slate-700">File</Label>
          <Input
            id="file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className={fieldClassName}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title" className="text-slate-700">Title (optional)</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter document title..."
            className={fieldClassName}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="space" className="text-slate-700">Space</Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger className={fieldClassName}>
              <SelectValue placeholder="Select a space (optional)" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-950">
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags" className="text-slate-700">Tags</Label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated tags..."
            className={fieldClassName}
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className={`flex-1 ${outlineActionClassName}`}>
            Back
          </Button>
          <Button type="submit" disabled={!file || uploadMutation.isPending} className={`flex-1 ${primaryActionClassName}`}>
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
          <DialogTitle className="text-slate-950">Create note</DialogTitle>
        </div>
        <DialogDescription className="text-slate-500">
          Write a new note for your knowledge base
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="note-title" className="text-slate-700">Title</Label>
          <Input
            id="note-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter note title..."
            className={fieldClassName}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content" className="text-slate-700">Content</Label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note content..."
            className={`${fieldClassName} min-h-[200px]`}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="note-space" className="text-slate-700">Space</Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger className={fieldClassName}>
              <SelectValue placeholder="Select a space (optional)" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-950">
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="note-tags" className="text-slate-700">Tags</Label>
          <Input
            id="note-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated tags..."
            className={fieldClassName}
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className={`flex-1 ${outlineActionClassName}`}>
            Back
          </Button>
          <Button type="submit" disabled={createMutation.isPending} className={`flex-1 ${primaryActionClassName}`}>
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
          <DialogTitle className="text-slate-950">Import from URL</DialogTitle>
        </div>
        <DialogDescription className="text-slate-500">
          Import content from a web page
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="url" className="text-slate-700">URL</Label>
          <Input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className={fieldClassName}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="url-title" className="text-slate-700">Title (optional)</Label>
          <Input
            id="url-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter document title..."
            className={fieldClassName}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="url-space" className="text-slate-700">Space</Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger className={fieldClassName}>
              <SelectValue placeholder="Select a space (optional)" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-950">
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="url-tags" className="text-slate-700">Tags</Label>
          <Input
            id="url-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated tags..."
            className={fieldClassName}
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className={`flex-1 ${outlineActionClassName}`}>
            Back
          </Button>
          <Button type="submit" disabled={importMutation.isPending} className={`flex-1 ${primaryActionClassName}`}>
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
          <DialogTitle className="text-slate-950">Create with AI</DialogTitle>
        </div>
        <DialogDescription className="text-slate-500">
          Generate a document using AI
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="prompt" className="text-slate-700">What do you want to create?</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want the AI to generate... e.g., 'Create a comprehensive guide for onboarding new sales agents in West Africa'"
            className={`${fieldClassName} min-h-[150px]`}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-space" className="text-slate-700">Space</Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger className={fieldClassName}>
              <SelectValue placeholder="Select a space (optional)" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-950">
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-tags" className="text-slate-700">Tags</Label>
          <Input
            id="ai-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Comma-separated tags..."
            className={fieldClassName}
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className={`flex-1 ${outlineActionClassName}`}>
            Back
          </Button>
          <Button type="submit" disabled={generateMutation.isPending} className={`flex-1 ${primaryActionClassName}`}>
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

  // Normalize API records for the workspace.
  const documents: Document[] = documentsData.map((doc: any) => ({
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

  const spaces: Space[] = spacesData.map((space: any) => ({
    id: space.id.toString(),
    name: space.name,
    description: space.description || '',
    documentCount: space.documentCount || 0,
    lastActivity: space.updatedAt
  }));

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);
  
  // Filter documents
  const filteredDocuments = documents.filter(doc => {
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

  const isLoading = documentsLoading || spacesLoading;

  return (
    <div
      data-testid="exportunity-knowledge-workspace"
      className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] pb-24 text-[#07111F]"
    >
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 md:space-y-6 md:px-6 md:py-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN institutional memory</p>
            <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950 md:text-3xl">Knowledge workspace</h1>
            <p className="mt-1 text-sm text-slate-500">
              Shared documents for {selectedCompany ? selectedCompany.name : "all companies"}
            </p>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className={`h-11 w-full sm:w-auto ${primaryActionClassName}`}>
            <Plus className="mr-2 h-4 w-4" />
            Add knowledge
          </Button>
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 border-slate-200 bg-white pl-10 text-slate-950 shadow-sm"
          />
        </div>

        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:px-0">
          <Card className="min-w-[140px] flex-shrink-0 border-slate-200 bg-white text-slate-950 shadow-sm md:min-w-0">
            <CardHeader className="p-3 pb-2 md:p-4 md:pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 md:text-sm">Documents</CardTitle>
                <FileText className="h-4 w-4 text-[#8A5700]" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
              <div className="text-xl font-black text-slate-950 md:text-2xl">{documents.length}</div>
              <p className="mt-1 text-[10px] text-slate-500 md:text-xs">Stored records</p>
            </CardContent>
          </Card>

          <Card className="min-w-[140px] flex-shrink-0 border-slate-200 bg-white text-slate-950 shadow-sm md:min-w-0">
            <CardHeader className="p-3 pb-2 md:p-4 md:pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 md:text-sm">Spaces</CardTitle>
                <Folder className="h-4 w-4 text-[#8A5700]" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
              <div className="text-xl font-black text-slate-950 md:text-2xl">{spaces.length}</div>
              <p className="mt-1 text-[10px] text-slate-500 md:text-xs">Governed collections</p>
            </CardContent>
          </Card>

          <Card className="min-w-[140px] flex-shrink-0 border-slate-200 bg-white text-slate-950 shadow-sm md:min-w-0">
            <CardHeader className="p-3 pb-2 md:p-4 md:pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 md:text-sm">AI documents</CardTitle>
                <Sparkles className="h-4 w-4 text-[#8A5700]" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
              <div className="text-xl font-black text-slate-950 md:text-2xl">
                {documents.filter((document) => document.type === "ai_doc").length}
              </div>
              <p className="mt-1 text-[10px] text-slate-500 md:text-xs">Generated records</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#F5A623]" />
              Loading knowledge records…
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="documents" className="space-y-4 md:space-y-6">
            <TabsList className="w-full border border-slate-200 bg-white p-1 text-slate-600 sm:w-auto">
              <TabsTrigger value="documents" className="h-10 text-xs data-[state=active]:bg-[#07111F] data-[state=active]:text-white sm:text-sm">Documents</TabsTrigger>
              <TabsTrigger value="spaces" className="h-10 text-xs data-[state=active]:bg-[#07111F] data-[state=active]:text-white sm:text-sm">Spaces</TabsTrigger>
            </TabsList>

            <TabsContent value="documents" className="space-y-3 md:space-y-4">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-11 w-full border-slate-200 bg-white text-slate-950 sm:w-[180px]">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white text-slate-950">
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="ai_doc">AI document</SelectItem>
                    <SelectItem value="web_import">Web import</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterSpace} onValueChange={setFilterSpace}>
                  <SelectTrigger className="h-11 w-full border-slate-200 bg-white text-slate-950 sm:w-[200px]">
                    <SelectValue placeholder="All spaces" />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white text-slate-950">
                    <SelectItem value="all">All spaces</SelectItem>
                    {spaces.map((space) => (
                      <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
                <CardHeader className="p-4 md:p-6">
                  <CardTitle className="text-base text-slate-950 md:text-lg">Documents</CardTitle>
                  <CardDescription className="text-xs text-slate-500 md:text-sm">{filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''} found</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
                  <div className="space-y-3">
                    {filteredDocuments.map((document) => (
                      <button
                        type="button"
                        key={document.id}
                        className="block w-full rounded-xl border border-slate-200 bg-[#FBFCFD] p-3 text-left transition-colors hover:border-[#F5A623] hover:bg-[#FFF8E8] md:p-4"
                        onClick={() => setSelectedDocument(document)}
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 md:gap-3">
                            {getDocumentIcon(document.type)}
                            <h4 className="min-w-0 flex-1 truncate text-xs font-bold text-slate-950 md:text-sm">{document.title}</h4>
                            <Badge variant="secondary" className="bg-slate-100 text-[10px] text-slate-700 hover:bg-slate-100 md:text-xs">
                              {getDocumentTypeBadge(document.type)}
                            </Badge>
                          </div>

                          {document.preview && (
                            <p className="line-clamp-2 text-xs text-slate-500 md:text-sm">{document.preview}</p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 md:gap-4 md:text-xs">
                            {document.spaceName && <span className="flex items-center gap-1"><Folder className="h-3 w-3" />{document.spaceName}</span>}
                            <span className="flex items-center gap-1"><User className="h-3 w-3" />{document.createdBy}</span>
                            <span className="hidden items-center gap-1 sm:flex"><Building2 className="h-3 w-3" />{document.companyName}</span>
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(document.createdAt), "MMM d")}</span>
                            {document.size && <span className="hidden md:inline">{document.size}</span>}
                          </div>

                          {document.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 md:gap-2">
                              {document.tags.slice(0, 3).map((tag, index) => (
                                <Badge key={`${document.id}-${tag}-${index}`} variant="outline" className="border-slate-200 bg-white text-[10px] text-slate-600 hover:bg-white md:text-xs">{tag}</Badge>
                              ))}
                              {document.tags.length > 3 && <Badge variant="outline" className="border-slate-200 bg-white text-[10px] text-slate-600 hover:bg-white md:text-xs">+{document.tags.length - 3}</Badge>}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}

                    {filteredDocuments.length === 0 && (
                      <div className="py-8 text-center md:py-12">
                        <FileText className="mx-auto mb-4 h-12 w-12 text-slate-300 md:h-16 md:w-16" />
                        <h3 className="text-base font-bold text-slate-950 md:text-lg">No documents found</h3>
                        <p className="mt-2 text-sm text-slate-500">Adjust the filters or add an approved knowledge record.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="spaces" className="space-y-3 md:space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {spaces.map((space) => (
                  <Card key={space.id} className="border-slate-200 bg-white text-slate-950 shadow-sm">
                    <CardHeader className="p-3 md:p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 rounded-lg bg-[#FFF0C7] p-2 text-[#8A5700]">
                          <Folder className="h-4 w-4 md:h-5 md:w-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="truncate text-sm text-slate-950 md:text-base">{space.name}</CardTitle>
                          <CardDescription className="mt-1 line-clamp-2 text-xs text-slate-500">{space.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
                      <div className="flex items-center justify-between text-xs md:text-sm">
                        <span className="text-slate-600">{space.documentCount} docs</span>
                        <span className="text-xs text-slate-500">{format(new Date(space.lastActivity), "MMM d")}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {spaces.length === 0 && (
                <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
                  <CardContent className="py-10 text-center">
                    <Folder className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <h3 className="font-bold text-slate-950">No spaces available</h3>
                    <p className="mt-1 text-sm text-slate-500">Spaces will appear here when the knowledge service returns them.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={showAddDialog} onOpenChange={(open) => {
        if (!open) resetAddDialog();
        else setShowAddDialog(true);
      }}>
        <DialogContent className="border-slate-200 bg-white text-slate-950 sm:max-w-md">
          {addMode === "menu" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-950">Add knowledge</DialogTitle>
                <DialogDescription className="text-slate-500">Choose a supported path for creating a stored knowledge record.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <Button variant="outline" className={`h-24 flex-col gap-2 ${outlineActionClassName}`} onClick={() => setAddMode("upload")}>
                  <FileUp className="h-8 w-8 text-[#8A5700]" />
                  <span className="text-sm">Upload file</span>
                </Button>
                <Button variant="outline" className={`h-24 flex-col gap-2 ${outlineActionClassName}`} onClick={() => setAddMode("note")}>
                  <File className="h-8 w-8 text-[#8A5700]" />
                  <span className="text-sm">Create note</span>
                </Button>
                <Button variant="outline" className={`h-24 flex-col gap-2 ${outlineActionClassName}`} onClick={() => setAddMode("url")}>
                  <LinkIcon className="h-8 w-8 text-[#8A5700]" />
                  <span className="text-sm">Import URL</span>
                </Button>
                <Button variant="outline" className={`h-24 flex-col gap-2 ${outlineActionClassName}`} onClick={() => setAddMode("ai")}>
                  <Sparkles className="h-8 w-8 text-[#8A5700]" />
                  <span className="text-sm">Create with AI</span>
                </Button>
              </div>
            </>
          )}

          {addMode === "upload" && <UploadFileForm onBack={() => setAddMode("menu")} onClose={resetAddDialog} spaces={spaces} />}
          {addMode === "note" && <CreateNoteForm onBack={() => setAddMode("menu")} onClose={resetAddDialog} spaces={spaces} />}
          {addMode === "url" && <ImportUrlForm onBack={() => setAddMode("menu")} onClose={resetAddDialog} spaces={spaces} />}
          {addMode === "ai" && <CreateWithAIForm onBack={() => setAddMode("menu")} onClose={resetAddDialog} spaces={spaces} />}
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <SheetContent className="overflow-y-auto border-l-slate-200 bg-white text-slate-950 sm:max-w-2xl">
          {selectedDocument && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  {getDocumentIcon(selectedDocument.type)}
                  <SheetTitle className="text-xl text-slate-950">{selectedDocument.title}</SheetTitle>
                </div>
                <SheetDescription className="text-slate-500">Stored knowledge record and attributable metadata.</SheetDescription>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-100">{getDocumentTypeBadge(selectedDocument.type)}</Badge>
                  {selectedDocument.tags.map((tag, index) => (
                    <Badge key={`${selectedDocument.id}-${tag}-${index}`} variant="outline" className="border-slate-200 bg-white text-xs text-slate-600 hover:bg-white">{tag}</Badge>
                  ))}
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {selectedDocument.preview && (
                  <Card className="border-slate-200 bg-[#FBFCFD] text-slate-950 shadow-none">
                    <CardHeader><CardTitle className="text-sm text-slate-950">Preview</CardTitle></CardHeader>
                    <CardContent><p className="text-sm text-slate-700">{selectedDocument.preview}</p></CardContent>
                  </Card>
                )}

                <Card className="border-slate-200 bg-[#FBFCFD] text-slate-950 shadow-none">
                  <CardHeader><CardTitle className="text-sm text-slate-950">Details</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Company</span><span className="text-right font-medium text-slate-950">{selectedDocument.companyName}</span></div>
                    {selectedDocument.spaceName && <div className="flex justify-between gap-4"><span className="text-slate-500">Space</span><span className="text-right font-medium text-slate-950">{selectedDocument.spaceName}</span></div>}
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Created by</span><span className="text-right font-medium text-slate-950">{selectedDocument.createdBy}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Created</span><span className="text-right font-medium text-slate-950">{format(new Date(selectedDocument.createdAt), "MMM d, yyyy 'at' h:mm a")}</span></div>
                    {selectedDocument.size && <div className="flex justify-between gap-4"><span className="text-slate-500">Size</span><span className="text-right font-medium text-slate-950">{selectedDocument.size}</span></div>}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
