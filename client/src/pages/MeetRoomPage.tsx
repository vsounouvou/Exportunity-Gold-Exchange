import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { useLocation, useParams } from "wouter";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangle,
  Copy,
  DoorOpen,
  Loader2,
  Lock,
  LockOpen,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  UserX,
  Video,
  VideoOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/runtimeConfig";

type MeetParticipantRole = "host" | "cohost" | "attendee" | "observer";
type MeetStatus = "scheduled" | "live" | "ended";

type MeetParticipant = {
  id: number;
  role: MeetParticipantRole;
  displayName: string | null;
  userId: number | null;
  guestEmail: string | null;
  isMuted: boolean;
  isKicked: boolean;
  joinedAt: string | null;
  leftAt: string | null;
};

type MeetArtifact = {
  id: number;
  type: "recording" | "transcript" | "summary" | "email_draft";
  storageUrl: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type MeetEventRow = {
  id: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type MeetSnapshotResponse = {
  ok: boolean;
  access:
    | { kind: "staff" }
    | { kind: "invite"; role: MeetParticipantRole; participantId: number; sub: string };
  meeting: {
    id: string;
    title: string;
    status: MeetStatus;
    locked: boolean;
    recordingEnabled: boolean;
    startsAt: string | null;
    endsAt: string | null;
    createdAt: string;
  };
  participants: MeetParticipant[];
  artifacts: MeetArtifact[];
  events: MeetEventRow[];
};

type JoinAck = {
  ok: boolean;
  meetingId?: string;
  participantId?: number;
  role?: MeetParticipantRole;
  displayName?: string;
  hostControls?: boolean;
  mediasoupEnabled?: boolean;
  error?: string;
};

type ChatMessage = {
  id: string;
  displayName: string;
  role: string;
  text: string;
  at: string;
};

function getTokenFromUrl() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return String(params.get("t") || params.get("token") || "").trim();
}

function getSocketBaseUrl() {
  if (typeof window === "undefined") return "";
  const probe = resolveApiUrl("/api/health");
  const parsed = new URL(probe, window.location.origin);
  return `${parsed.protocol}//${parsed.host}`;
}

function initials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "P";
  const parts = cleaned.split(/\s+/g).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "P";
}

function displayParticipantName(participant: MeetParticipant) {
  const byName = String(participant.displayName || "").trim();
  if (byName) return byName;
  if (participant.guestEmail) return participant.guestEmail;
  if (participant.userId) return `User ${participant.userId}`;
  return `Participant #${participant.id}`;
}

function sortParticipants(list: MeetParticipant[]) {
  const roleRank = (role: MeetParticipantRole) => {
    if (role === "host") return 0;
    if (role === "cohost") return 1;
    if (role === "attendee") return 2;
    return 3;
  };
  return [...list].sort((left, right) => {
    const rankDiff = roleRank(left.role) - roleRank(right.role);
    if (rankDiff !== 0) return rankDiff;
    return displayParticipantName(left).localeCompare(displayParticipantName(right));
  });
}

function normalizeChatHistory(events: MeetEventRow[]) {
  return events
    .filter((event) => event.event_type === "chat_message")
    .map((event) => {
      const payload = event.payload || {};
      return {
        id: `event-${event.id}`,
        displayName: String(payload.displayName || payload.author || payload.sub || "Participant"),
        role: String(payload.role || "attendee"),
        text: String(payload.text || ""),
        at: String(event.created_at || new Date().toISOString()),
      } satisfies ChatMessage;
    })
    .filter((entry) => entry.text.trim().length > 0)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export default function MeetRoomPage() {
  const params = useParams<{ id: string }>();
  const meetingId = String(params?.id || "").trim();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteToken, setInviteToken] = useState(getTokenFromUrl());
  const [displayName, setDisplayName] = useState("");
  const [prejoinReady, setPrejoinReady] = useState(false);
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [hostControls, setHostControls] = useState(false);
  const [mediaRelayReady, setMediaRelayReady] = useState(false);
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<MeetParticipant[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "connected" | "error">("idle");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token = getTokenFromUrl();
    if (token !== inviteToken) setInviteToken(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  useEffect(() => {
    const viewport = chatScrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!viewport) return;
    viewport.scrollTop = (viewport as HTMLElement).scrollHeight;
  }, [chatMessages.length]);

  const meetingQuery = useQuery<MeetSnapshotResponse>({
    queryKey: ["/api/meet/meeting", meetingId, inviteToken],
    enabled: Boolean(meetingId),
    queryFn: async () => {
      const suffix = inviteToken ? `?t=${encodeURIComponent(inviteToken)}` : "";
      const response = await fetch(resolveApiUrl(`/api/meet/meetings/${encodeURIComponent(meetingId)}${suffix}`));
      const json = (await response.json()) as MeetSnapshotResponse & { message?: string };
      if (!response.ok || !json.ok) throw new Error(json.message || "Failed to load meeting");
      return json;
    },
    refetchInterval: joined ? 15_000 : 30_000,
  });

  useEffect(() => {
    const snapshot = meetingQuery.data;
    if (!snapshot) return;
    setParticipants(sortParticipants(snapshot.participants || []));
    setChatMessages(normalizeChatHistory(snapshot.events || []));
    if (!displayName) {
      if (snapshot.access.kind === "invite" && snapshot.access.sub.startsWith("guest:")) {
        setDisplayName(snapshot.access.sub.slice(6));
      } else {
        setDisplayName("Host");
      }
    }
  }, [meetingQuery.data, displayName]);

  const summaryArtifact = useMemo(
    () => meetingQuery.data?.artifacts.find((artifact) => artifact.type === "summary") || null,
    [meetingQuery.data?.artifacts],
  );

  const transcriptArtifact = useMemo(
    () => meetingQuery.data?.artifacts.find((artifact) => artifact.type === "transcript") || null,
    [meetingQuery.data?.artifacts],
  );

  const ensureJoinToken = useMutation({
    mutationFn: async () => {
      const response = await fetch(resolveApiUrl(`/api/meet/meetings/${encodeURIComponent(meetingId)}/join-token`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "host" }),
      });
      const json = (await response.json()) as { ok: boolean; token?: string; message?: string };
      if (!response.ok || !json.ok || !json.token) {
        throw new Error(json.message || "Unable to create join token");
      }
      return json.token;
    },
  });

  const generateSummary = useMutation({
    mutationFn: async () => {
      const response = await fetch(resolveApiUrl(`/api/meet/meetings/${encodeURIComponent(meetingId)}/summary`), {
        method: "POST",
      });
      const json = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !json.ok) throw new Error(json.message || "Failed to generate summary");
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/meet/meeting", meetingId, inviteToken] });
      toast({ title: "Summary generated", description: "Meeting recap has been refreshed." });
    },
    onError: (error: any) => {
      toast({ title: "Summary failed", description: error?.message || "Unable to generate recap", variant: "destructive" });
    },
  });

  const endMeeting = useMutation({
    mutationFn: async () => {
      const response = await fetch(resolveApiUrl(`/api/meet/meetings/${encodeURIComponent(meetingId)}/end`), {
        method: "POST",
      });
      const json = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !json.ok) throw new Error(json.message || "Failed to end meeting");
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/meet/meeting", meetingId, inviteToken] });
      toast({ title: "Meeting ended", description: "Auto-summary has been requested." });
    },
    onError: (error: any) => {
      toast({ title: "End meeting failed", description: error?.message || "Unable to end meeting", variant: "destructive" });
    },
  });

  const toggleLock = useMutation({
    mutationFn: async (locked: boolean) => {
      const response = await fetch(resolveApiUrl(`/api/meet/meetings/${encodeURIComponent(meetingId)}/lock`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked }),
      });
      const json = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !json.ok) throw new Error(json.message || "Failed to update lock");
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/meet/meeting", meetingId, inviteToken] });
    },
    onError: (error: any) => {
      toast({ title: "Lock update failed", description: error?.message || "Unable to change lock state", variant: "destructive" });
    },
  });

  const withSocketHostAction = async (eventName: "muteParticipant" | "kickParticipant", payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket) return false;
    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      socket.emit(eventName, payload, (ack: any) => {
        resolve({ ok: Boolean(ack?.ok), error: ack?.error ? String(ack.error) : undefined });
      });
    });
    if (!result.ok) throw new Error(result.error || "Host action failed");
    return true;
  };

  async function applyMute(participant: MeetParticipant, isMuted: boolean) {
    try {
      if (socketRef.current) {
        await withSocketHostAction("muteParticipant", { participantId: participant.id, isMuted });
      } else {
        const response = await fetch(resolveApiUrl(`/api/meet/meetings/${encodeURIComponent(meetingId)}/mute`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: participant.id, isMuted }),
        });
        const json = await response.json();
        if (!response.ok || !json?.ok) throw new Error(json?.message || "Mute request failed");
      }
      setParticipants((prev) =>
        sortParticipants(prev.map((item) => (item.id === participant.id ? { ...item, isMuted } : item))),
      );
    } catch (error: any) {
      toast({ title: "Mute failed", description: error?.message || "Unable to mute participant", variant: "destructive" });
    }
  }

  async function applyKick(participant: MeetParticipant) {
    try {
      if (socketRef.current) {
        await withSocketHostAction("kickParticipant", { participantId: participant.id });
      } else {
        const response = await fetch(resolveApiUrl(`/api/meet/meetings/${encodeURIComponent(meetingId)}/kick`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: participant.id }),
        });
        const json = await response.json();
        if (!response.ok || !json?.ok) throw new Error(json?.message || "Kick request failed");
      }
      setParticipants((prev) =>
        sortParticipants(
          prev.map((item) => (item.id === participant.id ? { ...item, isKicked: true, leftAt: new Date().toISOString() } : item)),
        ),
      );
    } catch (error: any) {
      toast({ title: "Kick failed", description: error?.message || "Unable to remove participant", variant: "destructive" });
    }
  }

  async function startPreview() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast({ title: "Media unavailable", description: "Browser media APIs are not available.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setPrejoinReady(true);
    } catch (error: any) {
      toast({
        title: "Device check failed",
        description: error?.message || "Camera or microphone permission was denied.",
        variant: "destructive",
      });
    }
  }

  function stopPreview() {
    const stream = localStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setPrejoinReady(false);
  }

  function patchParticipantFromEvent(next: Partial<MeetParticipant> & { participantId?: number; id?: number; displayName?: string; role?: string }) {
    const id = Number(next.participantId ?? next.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return;
    setParticipants((prev) => {
      const existing = prev.find((participant) => participant.id === id);
      if (existing) {
        const updated: MeetParticipant = {
          ...existing,
          displayName: typeof next.displayName === "string" ? next.displayName : existing.displayName,
          role: (next.role as MeetParticipantRole) || existing.role,
          isMuted: typeof next.isMuted === "boolean" ? next.isMuted : existing.isMuted,
          isKicked: typeof next.isKicked === "boolean" ? next.isKicked : existing.isKicked,
          leftAt: typeof next.leftAt === "string" ? next.leftAt : existing.leftAt,
        };
        return sortParticipants(prev.map((participant) => (participant.id === id ? updated : participant)));
      }
      const created: MeetParticipant = {
        id,
        role: (next.role as MeetParticipantRole) || "attendee",
        displayName: typeof next.displayName === "string" ? next.displayName : "Participant",
        userId: null,
        guestEmail: null,
        isMuted: Boolean(next.isMuted),
        isKicked: Boolean(next.isKicked),
        joinedAt: new Date().toISOString(),
        leftAt: null,
      };
      return sortParticipants([...prev, created]);
    });
  }

  async function connectAndJoin() {
    if (!meetingId) return;
    setJoining(true);
    setConnectionState("connecting");
    try {
      let token = inviteToken;
      if (!token) {
        token = await ensureJoinToken.mutateAsync();
        setInviteToken(token);
        if (typeof window !== "undefined") {
          const nextUrl = `/m/${encodeURIComponent(meetingId)}?t=${encodeURIComponent(token)}`;
          window.history.replaceState({}, "", nextUrl);
        }
      }

      const socket = io(`${getSocketBaseUrl()}/meet`, {
        transports: ["websocket"],
        auth: { token },
      });
      socketRef.current = socket;

      socket.on("disconnect", () => {
        setConnectionState("error");
        setJoined(false);
      });

      socket.on("participant_joined", (payload: any) => {
        patchParticipantFromEvent(payload);
      });

      socket.on("participant_left", (payload: any) => {
        patchParticipantFromEvent({ participantId: payload?.participantId, leftAt: new Date().toISOString() });
      });

      socket.on("participant_muted", (payload: any) => {
        patchParticipantFromEvent({ participantId: payload?.participantId, isMuted: Boolean(payload?.isMuted) });
      });

      socket.on("participant_kicked", (payload: any) => {
        patchParticipantFromEvent({
          participantId: payload?.participantId,
          isKicked: true,
          leftAt: new Date().toISOString(),
        });
      });

      socket.on("chat_message", (payload: any) => {
        const message: ChatMessage = {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          displayName: String(payload?.displayName || "Participant"),
          role: String(payload?.role || "attendee"),
          text: String(payload?.text || ""),
          at: String(payload?.at || new Date().toISOString()),
        };
        if (!message.text.trim()) return;
        setChatMessages((prev) => [...prev, message]);
      });

      const ack = await new Promise<JoinAck>((resolve) => {
        socket.emit(
          "join",
          {
            token,
            meetingId,
            displayName: displayName.trim() || undefined,
          },
          (result: JoinAck) => resolve(result),
        );
      });

      if (!ack.ok) throw new Error(ack.error || "Join failed");
      setHostControls(Boolean(ack.hostControls));
      setMediaRelayReady(Boolean(ack.mediasoupEnabled));
      setParticipantId(Number(ack.participantId || 0) || null);
      setJoined(true);
      setConnectionState("connected");
      patchParticipantFromEvent({
        participantId: ack.participantId,
        displayName: ack.displayName || displayName || "You",
        role: ack.role || "attendee",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/meet/meeting", meetingId, token] });
      toast({
        title: "Joined meeting",
        description: ack.mediasoupEnabled ? "Connected to SFU relay." : "Connected (chat/control mode).",
      });
    } catch (error: any) {
      setConnectionState("error");
      toast({
        title: "Join failed",
        description: error?.message || "Unable to join this meeting",
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  }

  function leaveMeeting() {
    const socket = socketRef.current;
    if (socket) {
      socket.emit("leave", () => {
        socket.disconnect();
      });
      socketRef.current = null;
    }
    setJoined(false);
    setConnectionState("idle");
    setHostControls(false);
    setMediaRelayReady(false);
    setParticipantId(null);
  }

  async function sendChat() {
    const text = chatText.trim();
    if (!text) return;
    const socket = socketRef.current;
    if (!socket) {
      toast({ title: "Not connected", description: "Join the meeting first.", variant: "destructive" });
      return;
    }
    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      socket.emit("chat_message", { text }, (ack: any) => resolve({ ok: Boolean(ack?.ok), error: ack?.error }));
    });
    if (!result.ok) {
      toast({ title: "Send failed", description: result.error || "Unable to send message", variant: "destructive" });
      return;
    }
    setChatText("");
  }

  useEffect(() => {
    return () => {
      leaveMeeting();
      stopPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = camEnabled;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = micEnabled;
  }, [camEnabled, micEnabled]);

  if (!meetingId) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gray-950 p-6 text-gray-100">
        <Card className="mx-auto max-w-xl border-gray-800 bg-gray-900">
          <CardContent className="p-6">
            <p className="text-sm text-gray-300">Invalid meeting id.</p>
            <Button className="mt-4" onClick={() => setLocation("/meetings")}>
              Back to meetings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (meetingQuery.isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gray-950 p-6">
        <div className="mx-auto flex max-w-xl items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4 text-gray-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading meeting room...
        </div>
      </div>
    );
  }

  if (meetingQuery.isError || !meetingQuery.data) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gray-950 p-6">
        <Card className="mx-auto max-w-xl border-red-900/40 bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-red-300">Unable to open meeting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-red-100/80">
            <p>{(meetingQuery.error as any)?.message || "The meeting link is invalid or expired."}</p>
            <Button variant="outline" onClick={() => setLocation("/meetings")}>
              Return
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const snapshot = meetingQuery.data;
  const meeting = snapshot.meeting;
  const canControl = hostControls || snapshot.access.kind === "staff";
  const you = participants.find((participant) => participant.id === participantId) || null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-100">{meeting.title}</h1>
              <p className="mt-1 text-sm text-gray-400">
                Created {formatDistanceToNowStrict(new Date(meeting.createdAt), { addSuffix: true })} • Room {meeting.id.slice(0, 8)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className="border-blue-600/30 bg-blue-600/15 text-blue-200">{meeting.status}</Badge>
                <Badge className={meeting.locked ? "border-amber-600/30 bg-amber-600/15 text-amber-200" : "border-emerald-600/30 bg-emerald-600/15 text-emerald-200"}>
                  {meeting.locked ? "Locked" : "Open"}
                </Badge>
                <Badge className="border-gray-700 bg-gray-800 text-gray-300">{meeting.recordingEnabled ? "Recording enabled" : "Recording disabled"}</Badge>
                <Badge className={connectionState === "connected" ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-gray-700 bg-gray-800 text-gray-300"}>
                  {connectionState === "connected" ? "Connected" : connectionState === "connecting" ? "Connecting..." : "Disconnected"}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="border-gray-700 bg-gray-900 text-gray-200"
                onClick={async () => {
                  if (!inviteToken) return;
                  const link = `${window.location.origin}/m/${encodeURIComponent(meetingId)}?t=${encodeURIComponent(inviteToken)}`;
                  await navigator.clipboard.writeText(link);
                  toast({ title: "Copied", description: "Invite link copied." });
                }}
                disabled={!inviteToken}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                Copy invite
              </Button>
              {canControl ? (
                <Button
                  variant="outline"
                  className="border-gray-700 bg-gray-900 text-gray-200"
                  onClick={() => toggleLock.mutate(!meeting.locked)}
                  disabled={toggleLock.isPending}
                >
                  {meeting.locked ? <LockOpen className="mr-1.5 h-4 w-4" /> : <Lock className="mr-1.5 h-4 w-4" />}
                  {meeting.locked ? "Unlock" : "Lock"}
                </Button>
              ) : null}
              {canControl ? (
                <Button variant="destructive" onClick={() => endMeeting.mutate()} disabled={endMeeting.isPending || meeting.status === "ended"}>
                  <PhoneOff className="mr-1.5 h-4 w-4" />
                  End
                </Button>
              ) : null}
            </div>
          </div>
          {!mediaRelayReady && joined ? (
            <div className="rounded-md border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              SFU media relay is unavailable. Chat and host controls still work, but live A/V is degraded.
            </div>
          ) : null}
        </div>

        {!joined ? (
          <Card className="mb-4 border-gray-800 bg-gray-900">
            <CardHeader>
              <CardTitle className="text-gray-100">Pre-join check</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
              <div className="space-y-3">
                <div className="aspect-video overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
                  {prejoinReady ? (
                    <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">Camera preview not started</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!prejoinReady ? (
                    <Button onClick={startPreview} className="bg-blue-600 hover:bg-blue-500">
                      <Video className="mr-1.5 h-4 w-4" />
                      Start preview
                    </Button>
                  ) : (
                    <Button variant="outline" className="border-gray-700 bg-gray-900 text-gray-200" onClick={stopPreview}>
                      <VideoOff className="mr-1.5 h-4 w-4" />
                      Stop preview
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="border-gray-700 bg-gray-900 text-gray-200"
                    onClick={() => setCamEnabled((value) => !value)}
                    disabled={!prejoinReady}
                  >
                    {camEnabled ? <Video className="mr-1.5 h-4 w-4" /> : <VideoOff className="mr-1.5 h-4 w-4" />}
                    Camera
                  </Button>
                  <Button
                    variant="outline"
                    className="border-gray-700 bg-gray-900 text-gray-200"
                    onClick={() => setMicEnabled((value) => !value)}
                    disabled={!prejoinReady}
                  >
                    {micEnabled ? <Mic className="mr-1.5 h-4 w-4" /> : <MicOff className="mr-1.5 h-4 w-4" />}
                    Microphone
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <label className="block text-sm text-gray-300">Display name</label>
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                  className="border-gray-700 bg-gray-950"
                />
                <Button onClick={connectAndJoin} disabled={joining || !displayName.trim()} className="w-full bg-blue-600 hover:bg-blue-500">
                  {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DoorOpen className="mr-2 h-4 w-4" />}
                  Join call
                </Button>
                <p className="text-xs text-gray-500">Joining requires a secure invite token. Staff users can self-issue one automatically.</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <Card className="border-gray-800 bg-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-gray-100">Participants ({participants.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {participants.map((participant) => {
                  const name = displayParticipantName(participant);
                  const isSelf = participantId === participant.id || you?.id === participant.id;
                  return (
                    <div key={participant.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/25 text-xs font-semibold text-blue-200">
                            {initials(name)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-100">{name}{isSelf ? " (you)" : ""}</p>
                            <p className="text-xs text-gray-500">{participant.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {participant.isMuted ? <MicOff className="h-4 w-4 text-amber-300" /> : <Mic className="h-4 w-4 text-emerald-300" />}
                          {participant.isKicked ? <UserX className="h-4 w-4 text-rose-300" /> : null}
                        </div>
                      </div>
                      {canControl && !isSelf ? (
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 bg-transparent text-gray-200"
                            onClick={() => applyMute(participant, !participant.isMuted)}
                          >
                            {participant.isMuted ? "Unmute" : "Mute"}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => applyKick(participant)}>
                            Kick
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-gray-100">Live chat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScrollArea ref={chatScrollRef} className="h-64 rounded-md border border-gray-800 bg-gray-950 p-3">
                <div className="space-y-2">
                  {chatMessages.length === 0 ? (
                    <p className="text-xs text-gray-500">No messages yet.</p>
                  ) : (
                    chatMessages.map((message) => (
                      <div key={message.id} className="rounded-md border border-gray-800 bg-gray-900 p-2">
                        <p className="text-xs text-gray-400">
                          {message.displayName} • {formatDistanceToNowStrict(new Date(message.at), { addSuffix: true })}
                        </p>
                        <p className="mt-1 text-sm text-gray-100">{message.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              <div className="flex gap-2">
                <Input
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder="Write a message..."
                  className="border-gray-700 bg-gray-950"
                />
                <Button onClick={sendChat} className="bg-blue-600 hover:bg-blue-500" disabled={!joined}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" className="w-full border-gray-700 bg-gray-900 text-gray-200" onClick={leaveMeeting}>
                Leave room
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="border-gray-800 bg-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-gray-100">Meeting recap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Button className="bg-blue-600 hover:bg-blue-500" onClick={() => generateSummary.mutate()} disabled={generateSummary.isPending}>
                  {generateSummary.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Generate recap
                </Button>
              </div>
              {summaryArtifact ? (
                <div className="rounded-md border border-gray-800 bg-gray-950 p-3">
                  <p className="text-xs text-gray-500">Latest summary</p>
                  <p className="mt-2 whitespace-pre-wrap text-gray-100">
                    {String((summaryArtifact.metadata?.summaryText as string) || "Summary generated.")}
                  </p>
                </div>
              ) : (
                <p className="text-gray-500">No summary artifact yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-gray-100">Transcript & artifacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-200">
              {transcriptArtifact ? (
                <div className="rounded-md border border-gray-800 bg-gray-950 p-3">
                  <p className="text-xs text-gray-500">Transcript excerpt</p>
                  <p className="mt-2 whitespace-pre-wrap text-gray-100">
                    {String((transcriptArtifact.metadata?.text as string) || "").slice(0, 1200) || "Transcript available."}
                  </p>
                </div>
              ) : (
                <p className="text-gray-500">No transcript artifact yet.</p>
              )}
              <div className="space-y-1 text-xs text-gray-400">
                {snapshot.artifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded border border-gray-800 bg-gray-950 px-2 py-1">
                    {artifact.type} • {formatDistanceToNowStrict(new Date(artifact.createdAt), { addSuffix: true })}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
