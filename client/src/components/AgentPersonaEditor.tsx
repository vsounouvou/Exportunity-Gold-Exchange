import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Agent } from "@db/schema";
import { resolveApiUrl } from "@/lib/runtimeConfig";

const personalitySchema = z.object({
  tone: z.enum(["professional", "casual", "friendly", "technical", "empathetic"]),
  style: z.enum(["formal", "informal", "direct", "elaborate", "concise"]),
  traits: z.array(z.string()),
  interests: z.array(z.string()),
  background: z.string(),
  communication_preferences: z.record(z.string(), z.boolean()),
  learning_style: z.enum(["analytical", "practical", "creative", "theoretical"]),
  decision_making: z.enum(["structured", "intuitive", "collaborative", "data-driven"]),
  conversationMemory: z.object({
    recentTopics: z.array(z.string()),
    keyInsights: z.array(z.string()),
    lastInteractions: z.array(z.object({
      timestamp: z.string(),
      topic: z.string(),
      sentiment: z.string()
    }))
  }).default({
    recentTopics: [],
    keyInsights: [],
    lastInteractions: []
  })
});

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: z.string().min(2, "Role must be at least 2 characters"),
  avatar: z.string().optional(),
  personality: personalitySchema,
});

interface AgentPersonaEditorProps {
  agent: Agent;
  onClose?: () => void;
}

export function AgentPersonaEditor({ agent, onClose }: AgentPersonaEditorProps) {
  const [trait, setTrait] = useState("");
  const [interest, setInterest] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: agent.name,
      role: agent.role,
      avatar: agent.avatar || "",
      personality: (agent.personality as any) || {
        tone: "professional",
        style: "formal",
        traits: [],
        interests: [],
        background: "",
        communication_preferences: {},
        learning_style: "analytical",
        decision_making: "structured",
        conversationMemory: {
          recentTopics: [],
          keyInsights: [],
          lastInteractions: []
        }
      },
    },
  });

  const addTrait = () => {
    if (trait && !form.getValues("personality.traits").includes(trait)) {
      form.setValue("personality.traits", [...form.getValues("personality.traits"), trait]);
      setTrait("");
    }
  };

  const removeTrait = (traitToRemove: string) => {
    form.setValue(
      "personality.traits",
      form.getValues("personality.traits").filter((t) => t !== traitToRemove)
    );
  };

  const addInterest = () => {
    if (interest && !form.getValues("personality.interests").includes(interest)) {
      form.setValue("personality.interests", [...form.getValues("personality.interests"), interest]);
      setInterest("");
    }
  };

  const removeInterest = (interestToRemove: string) => {
    form.setValue(
      "personality.interests",
      form.getValues("personality.interests").filter((i) => i !== interestToRemove)
    );
  };

  const updateAgentMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const response = await fetch(resolveApiUrl(`/api/agents/${agent.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Failed to update agent");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({
        title: "Success",
        description: "Agent persona updated successfully",
      });
      onClose?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    updateAgentMutation.mutate(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="personality.tone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Communication Tone</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tone" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="empathetic">Empathetic</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Defines how the agent communicates in conversations
              </FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="personality.style"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Communication Style</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a style" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="informal">Informal</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="elaborate">Elaborate</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="personality.learning_style"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Learning Style</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a learning style" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="analytical">Analytical</SelectItem>
                  <SelectItem value="practical">Practical</SelectItem>
                  <SelectItem value="creative">Creative</SelectItem>
                  <SelectItem value="theoretical">Theoretical</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                How the agent processes and learns from new information
              </FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="personality.decision_making"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Decision Making Style</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a decision making style" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="structured">Structured</SelectItem>
                  <SelectItem value="intuitive">Intuitive</SelectItem>
                  <SelectItem value="collaborative">Collaborative</SelectItem>
                  <SelectItem value="data-driven">Data-driven</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <div className="space-y-4">
          <FormLabel>Personality Traits</FormLabel>
          <div className="flex gap-2">
            <Input
              value={trait}
              onChange={(e) => setTrait(e.target.value)}
              placeholder="Add a trait"
              onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addTrait())}
            />
            <Button type="button" onClick={addTrait}>
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.getValues("personality.traits").map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button
                  type="button"
                  onClick={() => removeTrait(t)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <FormLabel>Interests & Expertise</FormLabel>
          <div className="flex gap-2">
            <Input
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="Add an interest"
              onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addInterest())}
            />
            <Button type="button" onClick={addInterest}>
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.getValues("personality.interests").map((i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {i}
                <button
                  type="button"
                  onClick={() => removeInterest(i)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <FormField
          control={form.control}
          name="personality.background"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Background Story</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Enter a background story for your agent..."
                  className="min-h-[100px]"
                />
              </FormControl>
              <FormDescription>
                Provide context and history that shapes your agent's personality
              </FormDescription>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateAgentMutation.isPending}>
            {updateAgentMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
