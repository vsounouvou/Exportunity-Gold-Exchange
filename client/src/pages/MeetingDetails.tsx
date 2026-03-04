import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MeetingSummary } from "@/components/MeetingSummary";
import { ChatInterface } from "@/components/ChatInterface";
import { Clock, Users, Video, Calendar } from "lucide-react";
import type { Agent } from "@db/schema";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface RouteParams {
  id: string;
}

interface Meeting {
  id: number;
  title: string;
  description: string;
  startTime: string;
  duration: number;
  type: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  conversationId: string;
}

export function MeetingDetails() {
  const { id } = useParams<RouteParams>();
  const meetingId = parseInt(id);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const { data: meeting, isLoading: isLoadingMeeting } = useQuery<Meeting>({
    queryKey: ["/api/meetings", meetingId],
    queryFn: async () => {
      const response = await fetch(resolveApiUrl(`/api/meetings/${meetingId}`));
      if (!response.ok) throw new Error("Failed to fetch meeting");
      return response.json();
    },
    enabled: !!meetingId && !isNaN(meetingId),
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const handleEndMeeting = async () => {
    try {
      const response = await fetch(resolveApiUrl(`/api/meetings/${meetingId}/end`), {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to end meeting");
      }

      toast({
        title: "Meeting Ended",
        description: "The meeting summary will be generated shortly.",
      });
    } catch (error) {
      console.error("Error ending meeting:", error);
      toast({
        title: "Error",
        description: "Failed to end the meeting",
        variant: "destructive",
      });
    }
  };

  if (isLoadingMeeting) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-950">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-400">Loading meeting details...</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-950 p-4">
        <div className="text-center space-y-4 bg-gray-900 border border-gray-800 rounded-lg p-8 max-w-md">
          <h2 className="text-2xl font-bold text-white">Meeting not found</h2>
          <p className="text-gray-400">The meeting you're looking for doesn't exist or has been deleted.</p>
          <Button onClick={() => window.location.href = '/meetings'} className="mt-4">
            Back to Meetings
          </Button>
        </div>
      </div>
    );
  }

  const startTimeStr = meeting.startTime ? format(new Date(meeting.startTime), "PPp") : "Not scheduled";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="container mx-auto py-8 px-6 space-y-6">
        {/* Header Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-2">{meeting.title}</h1>
              <p className="text-gray-400 mb-4">{meeting.description}</p>

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-2 rounded-md">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-gray-300">{startTimeStr}</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-2 rounded-md">
                  <Clock className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-gray-300">{meeting.duration} minutes</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-2 rounded-md">
                  <Video className="h-4 w-4 text-purple-400" />
                  <span className="text-sm text-gray-300 capitalize">{meeting.type} Meeting</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-2 rounded-md">
                  <Users className="h-4 w-4 text-orange-400" />
                  <span className="text-sm text-gray-300 capitalize">{meeting.status.replace('_', ' ')}</span>
                </div>
              </div>
            </div>

            {meeting.status === "in_progress" && (
              <Button
                onClick={handleEndMeeting}
                variant="destructive"
                className="ml-4"
              >
                End Meeting
              </Button>
            )}
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chat Section */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="border-b border-gray-800 px-6 py-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" />
                Meeting Chat
              </h2>
            </div>
            <div className="h-[600px]">
              <ChatInterface
                selectedAgent={selectedAgent}
                agents={agents}
                chatRoomId={meeting.conversationId}
                activeAgents={[]}
              />
            </div>
          </div>

          {/* Summary Section */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="border-b border-gray-800 px-6 py-4">
              <h2 className="text-xl font-semibold text-white">Meeting Summary</h2>
            </div>
            <div className="p-6">
              <MeetingSummary meetingId={meetingId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MeetingDetails;
