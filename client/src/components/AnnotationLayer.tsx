import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus, ThumbsUp, Archive, CheckCircle } from "lucide-react";
import type { Message, Agent } from "@db/schema";
import { resolveApiUrl } from "@/lib/runtimeConfig";

type Annotation = {
  id: number;
  content: string;
  type: "comment" | "insight" | "suggestion" | "feedback" | "note" | string;
  messageId: number;
  authorAgentId: number;
  targetAgentId: number;
  upvotes?: number;
  status?: "active" | "archived" | "resolved" | string;
  createdAt?: string;
};

interface AnnotationLayerProps {
  message: Message;
  fromAgent: Agent;
  toAgent: Agent;
}

export function AnnotationLayer({ message, fromAgent, toAgent }: AnnotationLayerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState("");
  const [annotationType, setAnnotationType] = useState<"comment" | "insight" | "suggestion" | "feedback" | "note">("comment");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch annotations for this message
  const { data: annotations = [] } = useQuery<Annotation[]>({
    queryKey: [`/api/messages/${message.id}/annotations`],
  });

  // Create new annotation
  const createAnnotation = useMutation({
    mutationFn: async (data: {
      content: string;
      type: string;
      messageId: number;
      authorAgentId: number;
      targetAgentId: number;
    }) => {
      const response = await fetch(resolveApiUrl(`/api/messages/${message.id}/annotations`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to create annotation");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/messages/${message.id}/annotations`] 
      });
      setIsCreating(false);
      setNewAnnotation("");
      toast({
        title: "Annotation Created",
        description: "Your annotation has been added successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create annotation",
        variant: "destructive",
      });
    },
  });

  // Upvote annotation
  const upvoteAnnotation = useMutation({
    mutationFn: async (annotationId: number) => {
      const response = await fetch(resolveApiUrl(`/api/annotations/${annotationId}/upvote`), {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to upvote annotation");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/messages/${message.id}/annotations`] 
      });
    },
  });

  const handleCreateAnnotation = () => {
    if (!newAnnotation.trim()) return;

    createAnnotation.mutate({
      content: newAnnotation,
      type: annotationType,
      messageId: message.id,
      authorAgentId: fromAgent.id,
      targetAgentId: toAgent.id,
    });
  };

  const getAnnotationTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      comment: "bg-blue-100 text-blue-800",
      insight: "bg-purple-100 text-purple-800",
      suggestion: "bg-green-100 text-green-800",
      feedback: "bg-yellow-100 text-yellow-800",
      note: "bg-gray-100 text-gray-800",
    };
    return colors[type] || colors.note;
  };

  return (
    <div className="mt-2 space-y-2">
      {annotations.length > 0 && (
        <div className="space-y-2">
          {annotations.map((annotation) => (
            <Card key={annotation.id} className="relative hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Badge 
                      variant="secondary"
                      className={getAnnotationTypeColor(annotation.type)}
                    >
                      {annotation.type}
                    </Badge>
                    <CardDescription className="text-xs">
                      {annotation.createdAt ? new Date(annotation.createdAt).toLocaleString() : ""}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => upvoteAnnotation.mutate(annotation.id)}
                      className="h-8 px-2"
                    >
                      <ThumbsUp className="h-4 w-4 mr-1" />
                      {annotation.upvotes ?? 0}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{annotation.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Add Annotation
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Annotation</DialogTitle>
            <DialogDescription>
              Add a note, insight, or feedback to this interaction
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select
              value={annotationType}
              onValueChange={(value: any) => setAnnotationType(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select annotation type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comment">Comment</SelectItem>
                <SelectItem value="insight">Insight</SelectItem>
                <SelectItem value="suggestion">Suggestion</SelectItem>
                <SelectItem value="feedback">Feedback</SelectItem>
                <SelectItem value="note">Note</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={newAnnotation}
              onChange={(e) => setNewAnnotation(e.target.value)}
              placeholder="Write your annotation..."
              className="min-h-[100px]"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCreating(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateAnnotation}
                disabled={createAnnotation.isPending}
              >
                {createAnnotation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
