import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Check, X } from "lucide-react";

interface AgentPreviewProps {
  preview: {
    name: string;
    role: string;
    capabilities: {
      strategic_competencies: string[];
      operational_capabilities: {
        process_management: boolean;
        resource_allocation: boolean;
        performance_monitoring: boolean;
      };
      communication_channels: string[];
      authority_levels: {
        decision_making: "high" | "medium" | "low";
        approval_required: boolean;
        risk_management: string[];
      };
    };
    personality: {
      traits: string[];
      communicationStyle: string;
      decisionMaking: string;
      learningStyle: string;
    };
    responsibilities: string[];
    hierarchyLevel: number;
  } | null;
  isLoading: boolean;
  onConfirm: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}

export function AgentPreview({
  preview,
  isLoading,
  onConfirm,
  onRegenerate,
  onCancel,
}: AgentPreviewProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <ScrollArea className="h-[70vh]">
      <div className="space-y-6 p-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{preview.name}</CardTitle>
            <CardDescription>
              {preview.role} (Level {preview.hierarchyLevel})
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personality Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Key Traits</h4>
              <div className="flex flex-wrap gap-2">
                {preview.personality.traits.map((trait) => (
                  <Badge key={trait} variant="secondary">
                    {trait}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Communication Style</h4>
              <p className="text-sm text-muted-foreground">
                {preview.personality.communicationStyle}
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Decision Making</h4>
              <p className="text-sm text-muted-foreground">
                {preview.personality.decisionMaking}
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Learning Style</h4>
              <p className="text-sm text-muted-foreground">
                {preview.personality.learningStyle}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Capabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Strategic Competencies</h4>
              <div className="flex flex-wrap gap-2">
                {preview.capabilities.strategic_competencies.map((competency) => (
                  <Badge key={competency} variant="outline">
                    {competency}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Operational Capabilities</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={preview.capabilities.operational_capabilities.process_management ? "default" : "secondary"}>
                    Process Management
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={preview.capabilities.operational_capabilities.resource_allocation ? "default" : "secondary"}>
                    Resource Allocation
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={preview.capabilities.operational_capabilities.performance_monitoring ? "default" : "secondary"}>
                    Performance Monitoring
                  </Badge>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Authority Level</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Decision Making:</span>
                  <Badge>{preview.capabilities.authority_levels.decision_making}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Approval Required:</span>
                  <Badge variant="outline">
                    {preview.capabilities.authority_levels.approval_required ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Responsibilities</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-1">
              {preview.responsibilities.map((responsibility) => (
                <li key={responsibility} className="text-sm text-muted-foreground">
                  {responsibility}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 sticky bottom-0 bg-background p-4 border-t">
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button variant="outline" onClick={onRegenerate}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Regenerate
          </Button>
          <Button onClick={onConfirm}>
            <Check className="h-4 w-4 mr-2" />
            Confirm & Create
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}
