import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { useQuery } from "@tanstack/react-query";
import type { Agent } from "@db/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { resolveApiUrl } from "@/lib/runtimeConfig";

type AgentAvailability = {
  id: number;
  agentId: number;
  meetingId?: number | null;
  startTime: string;
  endTime: string;
  status?: string;
};

interface AgentAvailabilityCalendarProps {
  selectedAgents: Agent[];
  selectedDate?: Date;
  onSelect: (date: Date | undefined) => void;
}

export function AgentAvailabilityCalendar({
  selectedAgents,
  selectedDate,
  onSelect,
}: AgentAvailabilityCalendarProps) {
  const [conflicts, setConflicts] = useState<AgentAvailability[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch availability for selected agents when date changes
  const { data: availability, isLoading } = useQuery({
    queryKey: [
      "/api/availability/check-conflicts",
      selectedDate?.toISOString(),
      selectedAgents.map(a => a.id).join(","),
    ],
    queryFn: async () => {
      if (!selectedDate || selectedAgents.length === 0) return null;

      const startTime = new Date(selectedDate);
      startTime.setHours(0, 0, 0, 0);

      const endTime = new Date(selectedDate);
      endTime.setHours(23, 59, 59, 999);

      try {
        const response = await fetch(resolveApiUrl("/api/availability/check-conflicts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            agentIds: selectedAgents.map(a => a.id),
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch availability");
        }

        const data = await response.json();
        setConflicts(data.conflicts || []);
        setError(null);
        return data;
      } catch (err) {
        setError("Failed to check availability. Please try again.");
        return null;
      }
    },
    enabled: !!selectedDate && selectedAgents.length > 0,
  });

  // Custom day render to show availability status
  const renderDay = (day: Date) => {
    const hasConflicts = conflicts.some(conflict => {
      const conflictDate = new Date(conflict.startTime);
      return (
        conflictDate.getDate() === day.getDate() &&
        conflictDate.getMonth() === day.getMonth() &&
        conflictDate.getFullYear() === day.getFullYear()
      );
    });

    const isSelected = selectedDate && 
      day.getDate() === selectedDate.getDate() &&
      day.getMonth() === selectedDate.getMonth() &&
      day.getFullYear() === selectedDate.getFullYear();

    return (
      <div
        className={cn(
          "w-full h-full flex items-center justify-center relative",
          hasConflicts && "bg-destructive/10",
          isSelected && "bg-primary/20"
        )}
      >
        <div className="relative w-10 h-10 flex items-center justify-center">
          {day.getDate()}
          {hasConflicts && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 w-2 h-2 p-0"
            />
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="w-full h-[350px]" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Checking availability...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={onSelect}
        components={{
          Day: ({ date }) => renderDay(date),
        }}
        className="rounded-md border"
        disabled={(date) => {
          // Disable past dates
          return date < new Date();
        }}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {selectedAgents.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {`Selected: ${selectedAgents.length} participant${selectedAgents.length > 1 ? 's' : ''}`}
          </div>
          {conflicts.length > 0 && selectedDate && (
            <div className="text-sm text-destructive">
              {`${conflicts.length} scheduling conflict${conflicts.length > 1 ? 's' : ''} found on ${format(selectedDate, 'PPP')}`}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {selectedAgents.map(agent => (
              <Badge key={agent.id} variant="outline">
                {agent.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
