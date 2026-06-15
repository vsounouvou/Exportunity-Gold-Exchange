import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, Plus, Video, Link as LinkIcon, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type MeetStatus = "scheduled" | "live" | "ended";

type MeetSession = {
  id: string;
  title: string;
  status: MeetStatus;
  startsAt: string | null;
  endsAt: string | null;
  locked: boolean;
  recordingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type ListMeetingsResponse = {
  ok: boolean;
  items: MeetSession[];
};

type CreateMeetingResponse = {
  ok: boolean;
  meeting: MeetSession;
  hostInvite: { token: string; link: string; expiresAt: string; inviteId: string };
  invites: Array<{ email: string; token: string; link: string; expiresAt: string; inviteId: string; role: string }>;
  internalInvites: Array<{ userId: number; email: string | null; token: string; link: string; expiresAt: string; inviteId: string }>;
};

type JoinTokenResponse = {
  ok: boolean;
  token: string;
  link: string;
  expiresAt: string;
  meetingId: string;
};

function parseEmailList(raw: string) {
  return raw
    .split(/[,\n;]+/g)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function statusClass(status: MeetStatus) {
  if (status === "live") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "scheduled") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export default function MeetingsHubPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [openCreate, setOpenCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [emailsRaw, setEmailsRaw] = useState("");
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, isLoading, isRefetching, refetch } = useQuery<ListMeetingsResponse>({
    queryKey: ["/api/meet/meetings"],
    queryFn: async () => {
      return (await apiRequest("/api/meet/meetings")) as ListMeetingsResponse;
    },
  });

  const meetings = data?.items ?? [];

  const grouped = useMemo(() => {
    const live = meetings.filter((meeting) => meeting.status === "live");
    const scheduled = meetings.filter((meeting) => meeting.status === "scheduled");
    const ended = meetings.filter((meeting) => meeting.status === "ended");
    return { live, scheduled, ended };
  }, [meetings]);

  const createMeeting = useMutation({
    mutationFn: async () => {
      setCreateError(null);
      const payload = {
        title: title.trim(),
        emails: parseEmailList(emailsRaw),
        recordingEnabled,
      };
      const json = (await apiRequest("/api/meet/meetings", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as CreateMeetingResponse & { message?: string };
      if (!json.ok) {
        throw new Error(json.message || "Failed to create meeting");
      }
      return json;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/meet/meetings"] });
      setOpenCreate(false);
      setTitle("");
      setEmailsRaw("");
      setCreateError(null);
      toast({
        title: "Meeting created",
        description: "Host link copied and meeting is ready to join.",
      });
      try {
        await navigator.clipboard.writeText(result.hostInvite.link);
      } catch {
        // noop
      }
      setLocation(`/m/${encodeURIComponent(result.meeting.id)}?t=${encodeURIComponent(result.hostInvite.token)}`);
    },
    onError: (error: any) => {
      const detail = error?.message || "Unable to create meeting";
      setCreateError(detail);
      toast({
        title: "Create failed",
        description: detail,
        variant: "destructive",
      });
    },
  });

  const joinAsHost = useMutation({
    mutationFn: async (meetingId: string) => {
      const json = (await apiRequest(`/api/meet/meetings/${encodeURIComponent(meetingId)}/join-token`, {
        method: "POST",
        body: JSON.stringify({ role: "host" }),
      })) as JoinTokenResponse & { message?: string };
      if (!json.ok) throw new Error(json.message || "Failed to create join token");
      return json;
    },
    onSuccess: (result) => {
      setLocation(`/m/${encodeURIComponent(result.meetingId)}?t=${encodeURIComponent(result.token)}`);
    },
    onError: (error: any) => {
      toast({
        title: "Join failed",
        description: error?.message || "Unable to join meeting",
        variant: "destructive",
      });
    },
  });

  const copyHostLink = useMutation({
    mutationFn: async (meetingId: string) => {
      const json = (await apiRequest(`/api/meet/meetings/${encodeURIComponent(meetingId)}/join-token`, {
        method: "POST",
        body: JSON.stringify({ role: "host" }),
      })) as JoinTokenResponse & { message?: string };
      if (!json.ok) throw new Error(json.message || "Failed to issue host link");
      await navigator.clipboard.writeText(json.link);
      return json;
    },
    onSuccess: () => {
      toast({ title: "Copied", description: "Host invite link copied to clipboard." });
    },
    onError: (error: any) => {
      toast({
        title: "Copy failed",
        description: error?.message || "Unable to copy host link",
        variant: "destructive",
      });
    },
  });

  const sections: Array<{ title: string; empty: string; items: MeetSession[] }> = [
    { title: "Live now", empty: "No live meetings.", items: grouped.live },
    { title: "Scheduled", empty: "No scheduled meetings.", items: grouped.scheduled },
    { title: "Ended", empty: "No ended meetings yet.", items: grouped.ended },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F7F8FA] text-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Exportunity Meet</h1>
            <p className="text-sm text-slate-600">Create secure meeting links, host calls, and generate AI recaps.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-800 hover:bg-slate-50" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Dialog
              open={openCreate}
              onOpenChange={(nextOpen) => {
                setOpenCreate(nextOpen);
                if (!nextOpen) setCreateError(null);
              }}
            >
              <DialogTrigger asChild>
                <Button className="bg-[#F5A623] text-slate-950 hover:bg-[#F9A800]">
                  <Plus className="mr-2 h-4 w-4" />
                  Create meeting
                </Button>
              </DialogTrigger>
              <DialogContent className="border-slate-200 bg-white text-slate-950 sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>New meeting</DialogTitle>
                  <DialogDescription className="text-slate-600">
                    Create a secure room and optionally issue attendee links in one step.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {createError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-semibold">Meeting could not be created.</p>
                          <p className="mt-1">{createError}</p>
                          {/MEET_INVITE_SECRET|JWT_SECRET|SESSION_SECRET/i.test(createError) ? (
                            <p className="mt-1 text-xs text-rose-700">
                              Configure `MEET_INVITE_SECRET` in production, or provide a valid `JWT_SECRET` / `SESSION_SECRET` fallback, then retry.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="meeting-title" className="text-slate-700">Title</Label>
                    <Input
                      id="meeting-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Weekly operations review"
                      className="border-slate-300 bg-white text-slate-950 placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meeting-emails" className="text-slate-700">Guest emails (optional)</Label>
                    <textarea
                      id="meeting-emails"
                      value={emailsRaw}
                      onChange={(event) => setEmailsRaw(event.target.value)}
                      className="min-h-[90px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none ring-[#F5A623]/30 placeholder:text-slate-400 focus:ring"
                      placeholder="partner@company.com, investor@domain.com"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Enable recording</p>
                      <p className="text-xs text-slate-500">Used for transcript and AI summary generation.</p>
                    </div>
                    <Switch checked={recordingEnabled} onCheckedChange={setRecordingEnabled} />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createMeeting.mutate()}
                    disabled={!title.trim() || createMeeting.isPending}
                    className="bg-[#F5A623] text-slate-950 hover:bg-[#F9A800]"
                  >
                    {createMeeting.isPending ? "Creating..." : "Create & join"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Loading meetings...</div>
        ) : (
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.title} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{section.title}</h2>
                {section.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">{section.empty}</div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {section.items.map((meeting) => (
                      <Card key={meeting.id} className="border-slate-200 bg-white shadow-sm">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base text-slate-950">{meeting.title}</CardTitle>
                            <Badge className={statusClass(meeting.status)}>{meeting.status}</Badge>
                          </div>
                          <CardDescription className="text-slate-500">
                            Created {formatDistanceToNowStrict(new Date(meeting.createdAt), { addSuffix: true })}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>Room: {meeting.id.slice(0, 8)}</span>
                            <span>{meeting.recordingEnabled ? "Recording on" : "Recording off"}</span>
                            <span>{meeting.locked ? "Locked" : "Open"}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="bg-[#F5A623] text-slate-950 hover:bg-[#F9A800]"
                              onClick={() => joinAsHost.mutate(meeting.id)}
                              disabled={joinAsHost.isPending}
                            >
                              <Video className="mr-1.5 h-4 w-4" />
                              Join
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                              onClick={() => copyHostLink.mutate(meeting.id)}
                              disabled={copyHostLink.isPending}
                            >
                              <LinkIcon className="mr-1.5 h-4 w-4" />
                              Copy host link
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

