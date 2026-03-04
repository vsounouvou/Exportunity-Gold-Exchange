import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Check,
  Users,
  ListTodo,
  MessageSquare,
  Star,
  Smile,
  Frown,
  Meh,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface MeetingSummaryProps {
  meetingId: number;
}

interface ParticipantContribution {
  contribution: string;
  engagementLevel: number;
}

interface MeetingSummaryData {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
  participantContributions: {
    [agentId: number]: ParticipantContribution;
  };
  duration: number;
  sentiment: number;
}

export function MeetingSummary({ meetingId }: MeetingSummaryProps) {
  const { data: summary, isLoading } = useQuery<MeetingSummaryData>({
    queryKey: [`/api/meetings/${meetingId}/summary`],
    enabled: !!meetingId,
  });

  const getSentimentIcon = (sentiment: number) => {
    if (sentiment > 0.3) return <Smile className="h-5 w-5 text-green-400" />;
    if (sentiment < -0.3) return <Frown className="h-5 w-5 text-red-400" />;
    return <Meh className="h-5 w-5 text-yellow-400" />;
  };

  const getSentimentTrend = (value: number) => {
    if (value > 0.3) {
      return <ArrowUpRight className="h-4 w-4 text-green-400" />;
    }
    if (value < -0.3) {
      return <ArrowDownRight className="h-4 w-4 text-red-400" />;
    }
    return <Minus className="h-4 w-4 text-yellow-400" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-8 text-gray-500">
        No summary available for this meeting
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Meeting Summary
          </CardTitle>
          <CardDescription>
            Duration: {summary.duration} minutes | Overall Sentiment:{" "}
            {getSentimentIcon(summary.sentiment)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-24">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {summary.summary}
            </p>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Key Points */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Key Points
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-40">
            <ul className="space-y-2">
              {summary.keyPoints.map((point, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                >
                  <div className="mt-1">•</div>
                  {point}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Action Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            Action Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-40">
            <ul className="space-y-2">
              {summary.actionItems.map((item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                >
                  <Check className="h-4 w-4 mt-0.5 text-green-500" />
                  {item}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Decisions Made */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="h-5 w-5" />
            Decisions Made
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-40">
            <ul className="space-y-2">
              {summary.decisions.map((decision, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                >
                  <Badge variant="outline" className="mt-0.5">
                    Decision {index + 1}
                  </Badge>
                  {decision}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Participant Engagement */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Participant Engagement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-40">
            <div className="space-y-4">
              {Object.entries(summary.participantContributions).map(
                ([agentId, data]) => (
                  <div key={agentId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Agent {agentId}
                      </span>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={data.engagementLevel * 100}
                          className="w-24"
                        />
                        <span className="text-xs text-gray-500">
                          {Math.round(data.engagementLevel * 100)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {data.contribution}
                    </p>
                  </div>
                )
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
