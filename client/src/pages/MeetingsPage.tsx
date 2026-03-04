import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarIcon, Clock, Users, Video, Plus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import type { Meeting, MeetingRoom, Agent } from "@db/schema";
import { AgentAvailabilityCalendar } from "@/components/ui/agent-availability-calendar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { resolveApiUrl } from "@/lib/runtimeConfig";

export function MeetingsPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [duration, setDuration] = useState("30");
  const [isScheduled, setIsScheduled] = useState(true);
  const [selectedParticipants, setSelectedParticipants] = useState<number[]>([]);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: rooms = [], isLoading: isLoadingRooms } = useQuery<MeetingRoom[]>({
    queryKey: ["/api/meeting-rooms"],
  });

  const { data: meetings = [], isLoading: isLoadingMeetings } = useQuery<Meeting[]>({
    queryKey: ["/api/meetings"],
  });

  const { data: agents = [], isLoading: isLoadingAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const handleParticipantToggle = (agentId: number) => {
    setSelectedParticipants(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleCreateMeeting = async () => {
    try {
      const organizerId = selectedParticipants[0] || (agents[0]?.id ?? 1);

      const response = await fetch(resolveApiUrl("/api/meetings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          roomId: parseInt(selectedRoom),
          type: isScheduled ? "scheduled" : "spontaneous",
          startTime: isScheduled ? selectedDate?.toISOString() : new Date().toISOString(),
          duration: parseInt(duration),
          organizerId,
          participants: selectedParticipants.length > 0 ? selectedParticipants : [organizerId],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create meeting");
      }

      const meeting = await response.json();
      setIsCreating(false);

      await queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });

      toast({
        title: "Meeting Created",
        description: isScheduled ? "Meeting scheduled successfully" : "Meeting started successfully",
      });

      setLocation(`/meetings/${meeting.id}`);
    } catch (error) {
      console.error("Error creating meeting:", error);
      toast({
        title: "Error",
        description: "Failed to create meeting",
        variant: "destructive",
      });
    }
  };

  const initializeTestRooms = async () => {
    try {
      const response = await fetch(resolveApiUrl("/api/meeting-rooms/init"), {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to initialize test rooms");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/meeting-rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/meetings"] })
      ]);

      toast({
        title: "Success",
        description: "Test meeting rooms and meetings initialized",
      });

    } catch (error) {
      console.error("Error initializing test rooms:", error);
      toast({
        title: "Error",
        description: "Failed to initialize test rooms",
        variant: "destructive",
      });
    }
  };

  if (isLoadingRooms || isLoadingMeetings || isLoadingAgents) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <div className="text-lg text-gray-400">Loading meetings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="container mx-auto py-4 md:py-8 px-4 md:px-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h1 className="text-xl md:text-3xl font-bold text-white">Meetings</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={initializeTestRooms} className="h-11 flex-1 sm:flex-initial text-sm">
              Initialize Rooms
            </Button>
            <Dialog open={isCreating} onOpenChange={setIsCreating}>
              <DialogTrigger asChild>
                <Button className="h-11 flex-1 sm:flex-initial gap-2">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create</span> Meeting
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Meeting</DialogTitle>
                  <DialogDescription className="text-gray-400">Schedule or start a meeting with your team.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Title</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Meeting title"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Description</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Meeting description"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Room</Label>
                    <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select a room" />
                      </SelectTrigger>
                      <SelectContent>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id.toString()}>
                            <div className="flex items-center gap-2">
                              <span>{room.name}</span>
                              <span className="text-xs text-muted-foreground">
                                (Cap: {room.capacity})
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Participants</Label>
                    <ScrollArea className="h-32 border rounded-md p-2">
                      <div className="grid grid-cols-2 gap-2">
                        {agents.map((agent) => (
                          <div
                            key={agent.id}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors min-h-[44px]",
                              selectedParticipants.includes(agent.id)
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-accent"
                            )}
                            onClick={() => handleParticipantToggle(agent.id)}
                          >
                            <Users className="h-4 w-4 flex-shrink-0" />
                            <span className="text-sm truncate">{agent.name}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Meeting Type</Label>
                    <Select
                      value={isScheduled ? "scheduled" : "spontaneous"}
                      onValueChange={(value) => setIsScheduled(value === "scheduled")}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="spontaneous">Spontaneous</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isScheduled && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Date & Time</Label>
                      <div className="space-y-4">
                        <AgentAvailabilityCalendar
                          selectedAgents={agents.filter(agent =>
                            selectedParticipants.includes(agent.id)
                          )}
                          selectedDate={selectedDate}
                          onSelect={setSelectedDate}
                        />
                        {selectedDate && selectedParticipants.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {selectedParticipants.length} participants
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {format(selectedDate, "PPp")}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Duration (minutes)</Label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setIsCreating(false)} className="h-11">
                      Cancel
                    </Button>
                    <Button onClick={handleCreateMeeting} className="h-11">
                      {isScheduled ? "Schedule" : "Start"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          {meetings.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-gray-900 border border-gray-800 rounded-lg">
              <CalendarIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">No meetings yet</h3>
              <p className="text-gray-400 mb-4">Create your first meeting to get started</p>
            </div>
          ) : (
            meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4 md:p-6 space-y-3 md:space-y-4 cursor-pointer hover:border-gray-700 hover:bg-gray-800/50 transition-all duration-200 group min-h-[120px]"
                onClick={() => setLocation(`/meetings/${meeting.id}`)}
              >
                <div>
                  <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors text-sm md:text-base">{meeting.title}</h3>
                  <p className="text-xs md:text-sm text-gray-400 mt-1 line-clamp-2">{meeting.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-3 text-xs md:text-sm">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-green-400" />
                    <span>{meeting.duration}m</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <Video className="h-3.5 w-3.5 md:h-4 md:w-4 text-purple-400" />
                    <span className="capitalize">{meeting.type}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-orange-400" />
                    <span className={cn(
                      "capitalize text-xs px-2 py-0.5 md:py-1 rounded-full",
                      meeting.status === "in_progress" && "bg-green-500/10 text-green-400",
                      meeting.status === "scheduled" && "bg-blue-500/10 text-blue-400",
                      meeting.status === "completed" && "bg-gray-500/10 text-gray-400"
                    )}>
                      {meeting.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default MeetingsPage;
