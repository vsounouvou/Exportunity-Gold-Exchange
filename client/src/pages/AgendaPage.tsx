import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from "date-fns";
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, Download, Loader2, Plus, Clock, Users, FileText, MapPin, Target } from "lucide-react";

import { useCompany } from "@/hooks/use-company";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type AgendaEvent = {
  id: string;
  source: "meetings" | "chatrooms";
  eventType: "meeting";
  meetingId: number | null;
  roomId: number | null;
  title: string;
  description: string | null;
  companyId: number | null;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  conversationId: string;
  organizerId: number | null;
  metadata: Record<string, any>;
};

type MeetingSummary = {
  summary?: string;
  keyPoints?: string[];
  actionItems?: Array<{ text: string; owner?: string; dueDate?: string } | string>;
  decisions?: Array<{ decision: string; rationale?: string } | string>;
};

type ViewMode = "month" | "week" | "day";

type RoomOption = {
  id: number;
  name: string;
  locationLabel?: string | null;
  capacityHumans?: number | null;
  isVirtual?: boolean | null;
  defaultAgentsJson?: unknown;
};

type DurationPresetResponse = {
  ok: boolean;
  presets: number[];
  min: number;
  max: number;
};

type RoomsResponse = {
  ok: boolean;
  rooms: RoomOption[];
};

type StaffUser = {
  id: number;
  displayName?: string | null;
  email?: string | null;
  isActive?: boolean | null;
};

type StaffUsersResponse = {
  users: StaffUser[];
};

type AgentOption = {
  id: number;
  name: string;
  role?: string | null;
};

type MeetingParticipant = {
  id: number;
  participantType: "agent" | "human";
  userId?: number | null;
  guestEmail?: string | null;
  agentId?: number | null;
  role?: string | null;
  status?: string | null;
  agent?: AgentOption | null;
};

type MeetingDetail = {
  id: number;
  title: string;
  conversationId: string;
  roomId?: number | null;
  meetingType?: string | null;
  metadata?: Record<string, any> | null;
  participants?: MeetingParticipant[];
};

type ObjectiveOption = {
  id: number;
  title: string;
  status?: string | null;
  priority?: string | null;
};

function buildAuthHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("ece_session") : null;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

function safeDate(value: string) {
  try {
    const parsed = parseISO(value);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseEmailList(raw: string) {
  return raw
    .split(/[,\n;]+/g)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function meetingStatusClasses(status: AgendaEvent["status"]) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "in_progress") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "cancelled") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-[#FFF8E8] text-[#8A5700]";
}

function meetingStatusLabel(status: AgendaEvent["status"]) {
  return status.replaceAll("_", " ");
}

export default function AgendaPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedCompanyId, selectedCompany, isLoading: companyLoading } = useCompany();

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);

  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [meetingDefaultsInitialized, setMeetingDefaultsInitialized] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMeetingType, setNewMeetingType] = useState("weekly_ops_sync");
  const [newObjectiveId, setNewObjectiveId] = useState<number | null>(null);
  const [newStartLocal, setNewStartLocal] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [newDuration, setNewDuration] = useState(30);
  const [newRoomId, setNewRoomId] = useState<number | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const [selectedAgentRoles, setSelectedAgentRoles] = useState<Record<number, string>>({});
  const [selectedHumanIds, setSelectedHumanIds] = useState<number[]>([]);
  const [selectedHumanRoles, setSelectedHumanRoles] = useState<Record<number, string>>({});
  const [externalGuestsRaw, setExternalGuestsRaw] = useState("");
  const [recordingPolicy, setRecordingPolicy] = useState("off");
  const [transcriptPolicy, setTranscriptPolicy] = useState("off");

  const range = useMemo(() => {
    if (viewMode === "day") {
      return { start: startOfDay(cursorDate), end: endOfDay(cursorDate) };
    }
    if (viewMode === "week") {
      return { start: startOfWeek(cursorDate), end: endOfWeek(cursorDate) };
    }
    return { start: startOfMonth(cursorDate), end: endOfMonth(cursorDate) };
  }, [cursorDate, viewMode]);

  const meetingTypeDefaults = useMemo(
    () =>
      ({
        weekly_ops_sync: 30,
        incident: 45,
        investor_call: 60,
      }) as Record<string, number>,
    [],
  );

  const eventsUrl = useMemo(() => {
    const from = encodeURIComponent(range.start.toISOString());
    const to = encodeURIComponent(range.end.toISOString());
    return `/api/agenda-events?from=${from}&to=${to}`;
  }, [range.start, range.end]);

  const { data: events = [], isLoading: eventsLoading } = useQuery<AgendaEvent[]>({
    queryKey: ["/api/agenda-events", eventsUrl],
    queryFn: async () => {
      const payload = await apiRequest(eventsUrl, { method: "GET" });
      return Array.isArray(payload?.items) ? payload.items : [];
    },
    enabled: !companyLoading && !!selectedCompanyId,
    staleTime: 15_000,
  });

  const { data: roomsResponse } = useQuery<RoomsResponse>({
    queryKey: ["/api/rooms"],
    enabled: !companyLoading && !!selectedCompanyId,
    queryFn: () => apiRequest("/api/rooms", { method: "GET" }),
    staleTime: 30_000,
  });

  const rooms = useMemo(() => (Array.isArray(roomsResponse?.rooms) ? roomsResponse?.rooms : []), [roomsResponse?.rooms]);

  const { data: presetsResponse } = useQuery<DurationPresetResponse>({
    queryKey: ["/api/meetings/duration-presets"],
    enabled: !companyLoading && !!selectedCompanyId,
    queryFn: () => apiRequest("/api/meetings/duration-presets", { method: "GET" }),
    staleTime: 60_000,
  });

  const durationPresets = useMemo(() => {
    const presets = Array.isArray(presetsResponse?.presets) ? presetsResponse?.presets : [];
    return presets.length ? presets : [5, 10, 15, 20, 30, 45, 60, 90, 120];
  }, [presetsResponse?.presets]);

  const { data: agentRows = [] } = useQuery<AgentOption[]>({
    queryKey: ["/api/agents"],
    enabled: !companyLoading && !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: objectiveRows = [] } = useQuery<ObjectiveOption[]>({
    queryKey: [`/api/goals/company/${selectedCompanyId}`],
    enabled: !companyLoading && !!selectedCompanyId,
    staleTime: 15_000,
  });

  const activeObjectives = useMemo(
    () => objectiveRows.filter((objective) => objective.status === "planned" || objective.status === "in_progress"),
    [objectiveRows],
  );

  useEffect(() => {
    if (newObjectiveId && activeObjectives.some((objective) => objective.id === newObjectiveId)) return;
    setNewObjectiveId(activeObjectives[0]?.id ?? null);
  }, [activeObjectives, newObjectiveId]);

  useEffect(() => {
    if (!newMeetingOpen) {
      setMeetingDefaultsInitialized(false);
      return;
    }
    if (meetingDefaultsInitialized || !rooms.length || !activeObjectives.length || !agentRows.length) return;

    const operationsRoom = rooms.find((room) => /operations/i.test(room.name)) || rooms[0];
    const fenou = agentRows.find((agent) => /^fenou$/i.test(agent.name.trim()));
    setNewRoomId((current) => current ?? operationsRoom?.id ?? null);
    setNewObjectiveId((current) => current ?? activeObjectives[0]?.id ?? null);
    if (fenou && selectedAgentIds.length === 0) {
      setSelectedAgentIds([fenou.id]);
      setSelectedAgentRoles({ [fenou.id]: "note_taker" });
    }
    setMeetingDefaultsInitialized(true);
  }, [activeObjectives, agentRows, meetingDefaultsInitialized, newMeetingOpen, rooms, selectedAgentIds.length]);

  const { data: usersResponse } = useQuery<StaffUsersResponse>({
    queryKey: ["/api/admin/users", "agenda-attendance"],
    enabled: !companyLoading && !!selectedCompanyId,
    queryFn: () => apiRequest("/api/admin/users?limit=100&status=active", { method: "GET" }),
    staleTime: 30_000,
  });

  const activeUsers = useMemo(
    () => (Array.isArray(usersResponse?.users) ? usersResponse.users.filter((user) => user.id > 0) : []),
    [usersResponse?.users],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const ev of events) {
      const dt = safeDate(ev.startTime);
      if (!dt) continue;
      const key = format(dt, "yyyy-MM-dd");
      const prev = map.get(key) ?? [];
      prev.push(ev);
      map.set(key, prev);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const da = safeDate(a.startTime)?.getTime() ?? 0;
        const db = safeDate(b.startTime)?.getTime() ?? 0;
        return da - db;
      });
    }
    return map;
  }, [events]);

  const createMeetingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Select a company first");
      const start = parseISO(newStartLocal);
      if (!Number.isFinite(start.getTime())) throw new Error("Invalid start time");
      const duration = Number(newDuration || 0);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid duration");
      if (!newRoomId) throw new Error("Room is required");
      if (!newObjectiveId) throw new Error("Objective is required");

      const externalGuests = parseEmailList(externalGuestsRaw);
      const attendees: Array<Record<string, unknown>> = [];

      for (const agentId of selectedAgentIds) {
        attendees.push({
          participantType: "agent",
          agentId,
          role: selectedAgentRoles[agentId] || "participant",
          required: true,
        });
      }
      for (const userId of selectedHumanIds) {
        attendees.push({
          participantType: "human",
          userId,
          role: selectedHumanRoles[userId] || "participant",
          required: true,
        });
      }
      for (const guestEmail of externalGuests) {
        attendees.push({
          participantType: "human",
          guestEmail,
          role: "participant",
          required: false,
        });
      }

      if (!attendees.length) throw new Error("Add at least one attendee (agent or human)");

      if (externalGuests.length && (!recordingPolicy || !transcriptPolicy)) {
        throw new Error("External guests require recording + transcript policy selection");
      }

      return apiRequest("/api/agenda-events", {
        method: "POST",
        body: JSON.stringify({
          company_id: selectedCompanyId,
          title: newTitle.trim() || "Meeting",
          description: newDescription.trim() || null,
          meeting_type: newMeetingType,
          objective_id: newObjectiveId,
          room_id: newRoomId,
          start_at: start.toISOString(),
          duration_minutes: duration,
          attendees,
          recording_policy: externalGuests.length ? recordingPolicy : null,
          transcript_policy: externalGuests.length ? transcriptPolicy : null,
        }),
      });
    },
    onSuccess: () => {
      setNewMeetingOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewMeetingType("weekly_ops_sync");
      setNewDuration(30);
      setNewRoomId(null);
      setSelectedAgentIds([]);
      setSelectedAgentRoles({});
      setSelectedHumanIds([]);
      setSelectedHumanRoles({});
      setExternalGuestsRaw("");
      setRecordingPolicy("off");
      setTranscriptPolicy("off");
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Meeting not created",
        description: error.message || "Review the required fields and try again.",
        variant: "destructive",
      });
    },
  });

  const { data: transcript = [], isLoading: transcriptLoading } = useQuery<any[]>({
    queryKey: selectedEvent?.conversationId ? [`/api/messages/${selectedEvent.conversationId}`] : [""],
    enabled: !!selectedEvent?.conversationId,
    staleTime: 10_000,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<MeetingSummary | null>({
    queryKey: selectedEvent?.meetingId ? [`/api/meetings/${selectedEvent.meetingId}/summary`] : [""],
    enabled: !!selectedEvent?.meetingId,
    queryFn: async () => {
      if (!selectedEvent?.meetingId) return null;
      const res = await fetch(resolveApiUrl(`/api/meetings/${selectedEvent.meetingId}/summary`), {
        cache: "no-store",
        credentials: "include",
        headers: buildAuthHeaders(),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as MeetingSummary;
    },
    staleTime: 10_000,
    retry: false,
  });

  const { data: selectedMeetingDetail, isLoading: meetingDetailLoading } = useQuery<MeetingDetail | null>({
    queryKey: selectedEvent?.meetingId ? [`/api/meetings/${selectedEvent.meetingId}`, "agenda-detail"] : [""],
    enabled: !!selectedEvent?.meetingId,
    queryFn: async () => {
      if (!selectedEvent?.meetingId) return null;
      return apiRequest(`/api/meetings/${selectedEvent.meetingId}`, { method: "GET" });
    },
    staleTime: 10_000,
  });

  const selectedObjectiveId = useMemo(() => {
    const raw =
      selectedMeetingDetail?.metadata?.objectiveId ??
      selectedMeetingDetail?.metadata?.goalId ??
      selectedEvent?.metadata?.objectiveId ??
      selectedEvent?.metadata?.goalId;
    const parsed = Number(raw || 0);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [selectedEvent?.metadata, selectedMeetingDetail?.metadata]);

  const selectedObjective = useMemo(
    () => objectiveRows.find((objective) => objective.id === selectedObjectiveId) || null,
    [objectiveRows, selectedObjectiveId],
  );

  const selectedRoom = useMemo(() => {
    const roomId = Number(selectedMeetingDetail?.roomId ?? selectedEvent?.roomId ?? 0);
    return rooms.find((room) => room.id === roomId) || null;
  }, [rooms, selectedEvent?.roomId, selectedMeetingDetail?.roomId]);

  const participantLabels = useMemo(() => {
    const participants = Array.isArray(selectedMeetingDetail?.participants)
      ? selectedMeetingDetail.participants
      : [];
    return participants.map((participant) => {
      const activeUser = participant.userId
        ? activeUsers.find((user) => user.id === participant.userId)
        : null;
      const name =
        participant.agent?.name ||
        activeUser?.displayName ||
        activeUser?.email ||
        participant.guestEmail ||
        (participant.participantType === "agent" ? `Agent #${participant.agentId}` : `User #${participant.userId}`);
      return {
        id: participant.id,
        name,
        role: String(participant.role || "participant").replaceAll("_", " "),
        type: participant.participantType,
      };
    });
  }, [activeUsers, selectedMeetingDetail?.participants]);

  const openMeetingConversation = (meeting: AgendaEvent) => {
    if (!meeting.conversationId) {
      toast({
        title: "Conversation unavailable",
        description: "This calendar entry is not linked to an Operations Center conversation.",
        variant: "destructive",
      });
      return;
    }
    window.location.assign(`/ai-team?conversation=${encodeURIComponent(meeting.conversationId)}`);
  };

  const startMeetingMutation = useMutation({
    mutationFn: async (meeting: AgendaEvent) => {
      if (!meeting.meetingId || meeting.status !== "scheduled") return meeting;
      await apiRequest(`/api/agenda-events/${meeting.meetingId}/meet`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      return meeting;
    },
    onSuccess: (meeting) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      setSelectedEvent(null);
      openMeetingConversation(meeting);
    },
    onError: (error: Error) => {
      toast({
        title: "Meeting could not start",
        description: error.message || "Review the meeting objective and participants, then try again.",
        variant: "destructive",
      });
    },
  });

  const downloadIcsMutation = useMutation({
    mutationFn: async (meeting: AgendaEvent) => {
      if (!meeting.meetingId) throw new Error("Calendar invite not available for legacy meeting rooms yet");
      const res = await fetch(resolveApiUrl(`/api/meetings/${meeting.meetingId}/ics`), {
        cache: "no-store",
        credentials: "include",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      return { blob, filename: `meeting-${meeting.meetingId}.ics` };
    },
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (error: Error) => {
      toast({
        title: "Calendar invite unavailable",
        description: error.message || "The calendar file could not be downloaded.",
        variant: "destructive",
      });
    },
  });

  const confirmMeetingCreation = () => {
    const title = newTitle.trim() || "Meeting";
    const attendeeCount = selectedAgentIds.length + selectedHumanIds.length + parseEmailList(externalGuestsRaw).length;
    const scheduledStart = safeDate(newStartLocal);
    const startLabel = scheduledStart ? format(scheduledStart, "PPpp") : newStartLocal;
    const approved = window.confirm(
      `Schedule “${title}” for ${startLabel} with ${attendeeCount} attendee${attendeeCount === 1 ? "" : "s"}?`,
    );
    if (!approved) return;
    createMeetingMutation.mutate();
  };

  const confirmMeetingStart = (meeting: AgendaEvent) => {
    if (meeting.status !== "scheduled" || !meeting.meetingId) {
      openMeetingConversation(meeting);
      return;
    }
    const approved = window.confirm(
      `Start “${meeting.title}” now? This records the meeting as in progress and opens its Operations Center context.`,
    );
    if (!approved) return;
    startMeetingMutation.mutate(meeting);
  };

  const headerTitle = useMemo(() => {
    if (viewMode === "day") return format(cursorDate, "EEEE, MMM d, yyyy");
    if (viewMode === "week") return `Week of ${format(range.start, "MMM d, yyyy")}`;
    return format(cursorDate, "MMMM yyyy");
  }, [cursorDate, range.start, viewMode]);

  const movePrev = () => {
    if (viewMode === "day") return setCursorDate((d) => subDays(d, 1));
    if (viewMode === "week") return setCursorDate((d) => subWeeks(d, 1));
    return setCursorDate((d) => subMonths(d, 1));
  };

  const moveNext = () => {
    if (viewMode === "day") return setCursorDate((d) => addDays(d, 1));
    if (viewMode === "week") return setCursorDate((d) => addWeeks(d, 1));
    return setCursorDate((d) => addMonths(d, 1));
  };

  const MonthView = () => {
    const days = eachDayOfInterval({ start: range.start, end: range.end });
    const daysSet = days.map((d) => format(d, "yyyy-MM-dd"));
    return (
      <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
        <CardHeader className="border-b border-slate-200 pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-black text-[#07111F]">
            <Calendar className="h-4 w-4 text-[#A56600]" />
            Monthly execution calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="-mx-1 overflow-x-auto px-1 pb-2">
            <div className="grid min-w-[760px] grid-cols-7 gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div key={label} className="px-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  {label}
                </div>
              ))}
              {daysSet.map((dayKey) => {
                const day = parseISO(dayKey);
                const isTodayDate = isToday(day);
                const dayEvents = eventsByDay.get(dayKey) ?? [];
                return (
                  <div
                    key={dayKey}
                    className={cn(
                      "min-h-[118px] rounded-xl border p-2 transition-colors",
                      "border-slate-200 bg-slate-50/70 hover:border-amber-200 hover:bg-[#FFFBF2]",
                      isTodayDate ? "border-[#F5A623] ring-2 ring-[#F5A623]/20" : null,
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className={cn("text-xs font-bold", isTodayDate ? "text-[#8A5700]" : "text-slate-600")}>
                        {format(day, "d")}
                      </div>
                      {dayEvents.length ? (
                        <Badge variant="outline" className="border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                          {dayEvents.length}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const t = safeDate(ev.startTime);
                        const time = t ? format(t, "HH:mm") : "--:--";
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelectedEvent(ev)}
                            className={cn(
                              "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs transition hover:border-[#F5A623] hover:bg-[#FFF8E8]",
                              ev.status === "completed" ? "opacity-70" : null,
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums text-slate-500">{time}</span>
                              <span className="truncate font-semibold text-slate-800">{ev.title}</span>
                            </div>
                          </button>
                        );
                      })}
                      {dayEvents.length > 3 ? (
                        <div className="px-2 text-[11px] font-medium text-slate-500">+{dayEvents.length - 3} more…</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const WeekView = () => {
    const days = eachDayOfInterval({ start: range.start, end: range.end });
    return (
      <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
        <CardHeader className="border-b border-slate-200 pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-black text-[#07111F]">
            <Calendar className="h-4 w-4 text-[#A56600]" />
            Weekly execution calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm text-slate-900">
                    <span className={cn("font-black", isToday(day) ? "text-[#8A5700]" : "text-slate-800")}>
                      {format(day, "EEE")}
                    </span>
                    <span className="text-slate-500">{format(day, "MMM d")}</span>
                  </div>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {dayEvents.length}
                  </Badge>
                </div>
                <div className="p-2 space-y-1">
                  {dayEvents.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-slate-500">No events</div>
                  ) : (
                    dayEvents.map((ev) => {
                      const t = safeDate(ev.startTime);
                      const time = t ? format(t, "HH:mm") : "--:--";
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setSelectedEvent(ev)}
                          className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-left text-xs shadow-sm transition hover:border-[#F5A623] hover:bg-[#FFF8E8]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="tabular-nums text-slate-500">{time}</span>
                              <span className="truncate font-semibold text-slate-800">{ev.title}</span>
                            </div>
                            <Badge variant="outline" className={cn("text-[10px] font-bold capitalize", meetingStatusClasses(ev.status))}>
                              {meetingStatusLabel(ev.status)}
                            </Badge>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  const DayView = () => {
    const key = format(range.start, "yyyy-MM-dd");
    const dayEvents = eventsByDay.get(key) ?? [];
    return (
      <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
        <CardHeader className="border-b border-slate-200 pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-black text-[#07111F]">
            <Calendar className="h-4 w-4 text-[#A56600]" />
            Daily execution calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dayEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No events scheduled.
            </div>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((ev) => {
                const start = safeDate(ev.startTime);
                const end = ev.endTime ? safeDate(ev.endTime) : null;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#F5A623] hover:bg-[#FFF8E8]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">{ev.title}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                          <span className="tabular-nums">
                            {start ? format(start, "HH:mm") : "--:--"}–{end ? format(end, "HH:mm") : "…"}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0 text-[10px] font-bold capitalize", meetingStatusClasses(ev.status))}>
                        {meetingStatusLabel(ev.status)}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div data-testid="exportunity-agenda-workspace" className="min-h-full bg-[#F7F8FA] p-4 text-[#07111F] md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between md:p-7">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-[#F5A623]/35 bg-[#FFF8E8] text-[10px] font-black uppercase tracking-[0.16em] text-[#8A5700] hover:bg-[#FFF8E8]">
                  Exportunity · Global Trade Network
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
                  Governed execution
                </Badge>
              </div>
              <h1 className="mt-4 flex items-center gap-3 text-3xl font-black tracking-tight sm:text-4xl">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#07111F] text-[#F8C45B]">
                  <Calendar className="h-5 w-5" />
                </span>
                Agenda &amp; objectives
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                Coordinate Awa-qualified work, GDIZ sourcing, accountable participants, and reviewable outcomes against a real company objective.
                {selectedCompany ? <span className="font-bold text-slate-800"> · {selectedCompany.name}</span> : null}
              </p>
            </div>
            <div className="shrink-0">
        <Dialog open={newMeetingOpen} onOpenChange={setNewMeetingOpen}>
          <DialogTrigger asChild>
                  <Button className="gap-2 bg-[#F5A623] font-black text-[#07111F] hover:bg-[#E49A17]" disabled={!selectedCompanyId}>
              <Plus className="h-4 w-4" />
                    Schedule meeting
            </Button>
          </DialogTrigger>
          <DialogContent
                  className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden border-slate-200 bg-white p-0 text-slate-950 shadow-2xl"
          >
            <DialogHeader>
                    <DialogTitle className="border-b border-slate-200 px-6 pb-4 pt-6 text-xl font-black text-[#07111F]">
                      Schedule governed meeting
                    </DialogTitle>
            </DialogHeader>
                  <div className="max-h-[calc(92vh-5rem)] space-y-5 overflow-y-auto px-5 pb-6 sm:px-6">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-2 xl:col-span-2">
                  <Label className="font-bold text-slate-700">Title</Label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Weekly operations sync"
                    className="border-slate-200 bg-white text-slate-950 focus-visible:ring-[#F5A623]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">Description</Label>
                  <Input
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Purpose / expected outcome"
                    className="border-slate-200 bg-white text-slate-950 focus-visible:ring-[#F5A623]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">Meeting type</Label>
                  <Select
                    value={newMeetingType}
                    onValueChange={(value) => {
                      setNewMeetingType(value);
                      const defaultDuration = meetingTypeDefaults[value];
                      if (defaultDuration) setNewDuration(defaultDuration);
                    }}
                  >
                    <SelectTrigger className="border-slate-200 bg-white text-slate-950 focus:ring-[#F5A623]">
                      <SelectValue placeholder="Select meeting type" />
                    </SelectTrigger>
                    <SelectContent className="z-[140] border-slate-200 bg-white text-slate-950">
                      <SelectItem value="weekly_ops_sync">Weekly Ops Sync</SelectItem>
                      <SelectItem value="incident">Incident</SelectItem>
                      <SelectItem value="investor_call">Investor Call</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">Objective</Label>
                  <Select
                    value={newObjectiveId ? String(newObjectiveId) : ""}
                    onValueChange={(value) => setNewObjectiveId(Number(value))}
                  >
                    <SelectTrigger className="border-slate-200 bg-white text-slate-950 focus:ring-[#F5A623]">
                      <SelectValue placeholder="Select the objective this meeting advances" />
                    </SelectTrigger>
                    <SelectContent className="z-[140] border-slate-200 bg-white text-slate-950">
                      {activeObjectives.map((objective) => (
                        <SelectItem key={objective.id} value={String(objective.id)}>
                          {objective.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeObjectives.length === 0 ? (
                    <p className="text-xs font-medium text-[#8A5700]">Create an active objective before scheduling a meeting.</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">Room</Label>
                  <Select
                    value={newRoomId ? String(newRoomId) : ""}
                    onValueChange={(value) => setNewRoomId(Number(value))}
                  >
                    <SelectTrigger className="border-slate-200 bg-white text-slate-950 focus:ring-[#F5A623]">
                      <SelectValue placeholder="Select room" />
                    </SelectTrigger>
                    <SelectContent className="z-[140] border-slate-200 bg-white text-slate-950">
                      {rooms.map((room) => (
                        <SelectItem key={room.id} value={String(room.id)}>
                          {room.name}
                          {room.locationLabel ? ` • ${room.locationLabel}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">Start</Label>
                  <Input
                    type="datetime-local"
                    value={newStartLocal}
                    onChange={(e) => setNewStartLocal(e.target.value)}
                    className="border-slate-200 bg-white text-slate-950 focus-visible:ring-[#F5A623]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">Duration presets</Label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {durationPresets.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant={newDuration === preset ? "default" : "outline"}
                        className={newDuration === preset
                          ? "h-9 bg-[#07111F] font-bold text-white hover:bg-slate-800"
                          : "h-9 border-slate-200 bg-white font-bold text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"}
                        onClick={() => setNewDuration(preset)}
                      >
                        {preset}m
                      </Button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    min={1}
                    max={480}
                    placeholder="Custom minutes (1-480)"
                    className="border-slate-200 bg-white text-slate-950 focus-visible:ring-[#F5A623]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <Card className="border-slate-200 bg-slate-50/70">
                  <CardHeader className="border-b border-slate-200 pb-3">
                    <CardTitle className="text-sm font-black text-[#07111F]">Agents attendance</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[280px] space-y-2 overflow-auto pt-4">
                    {agentRows.map((agent) => {
                      const checked = selectedAgentIds.includes(agent.id);
                      return (
                        <div key={agent.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(nextChecked) => {
                                  if (nextChecked) {
                                    setSelectedAgentIds((prev) => Array.from(new Set([...prev, agent.id])));
                                    setSelectedAgentRoles((prev) => ({ ...prev, [agent.id]: prev[agent.id] || "participant" }));
                                  } else {
                                    setSelectedAgentIds((prev) => prev.filter((id) => id !== agent.id));
                                    setSelectedAgentRoles((prev) => {
                                      const next = { ...prev };
                                      delete next[agent.id];
                                      return next;
                                    });
                                  }
                                }}
                              />
                              <span>{agent.name}</span>
                            </label>
                            {checked ? (
                              <Select
                                value={selectedAgentRoles[agent.id] || "participant"}
                                onValueChange={(value) =>
                                  setSelectedAgentRoles((prev) => ({ ...prev, [agent.id]: value }))
                                }
                              >
                                <SelectTrigger className="h-8 w-full border-slate-200 bg-white text-slate-950 sm:w-40">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="z-[140] border-slate-200 bg-white text-slate-950">
                                  <SelectItem value="host">Host</SelectItem>
                                  <SelectItem value="facilitator">Facilitator</SelectItem>
                                  <SelectItem value="note_taker">Note-taker</SelectItem>
                                  <SelectItem value="participant">Participant</SelectItem>
                                  <SelectItem value="observer">Observer</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : null}
                          </div>
                          {agent.role ? <div className="mt-1 text-[11px] text-slate-500">{agent.role}</div> : null}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-slate-50/70">
                  <CardHeader className="border-b border-slate-200 pb-3">
                    <CardTitle className="text-sm font-black text-[#07111F]">Humans attendance</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[280px] space-y-2 overflow-auto pt-4">
                    {activeUsers.map((user) => {
                      const checked = selectedHumanIds.includes(user.id);
                      const label = user.displayName || user.email || `User ${user.id}`;
                      return (
                        <div key={user.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(nextChecked) => {
                                  if (nextChecked) {
                                    setSelectedHumanIds((prev) => Array.from(new Set([...prev, user.id])));
                                    setSelectedHumanRoles((prev) => ({ ...prev, [user.id]: prev[user.id] || "participant" }));
                                  } else {
                                    setSelectedHumanIds((prev) => prev.filter((id) => id !== user.id));
                                    setSelectedHumanRoles((prev) => {
                                      const next = { ...prev };
                                      delete next[user.id];
                                      return next;
                                    });
                                  }
                                }}
                              />
                              <span>{label}</span>
                            </label>
                            {checked ? (
                              <Select
                                value={selectedHumanRoles[user.id] || "participant"}
                                onValueChange={(value) =>
                                  setSelectedHumanRoles((prev) => ({ ...prev, [user.id]: value }))
                                }
                              >
                                <SelectTrigger className="h-8 w-full border-slate-200 bg-white text-slate-950 sm:w-40">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="z-[140] border-slate-200 bg-white text-slate-950">
                                  <SelectItem value="host">Host</SelectItem>
                                  <SelectItem value="facilitator">Facilitator</SelectItem>
                                  <SelectItem value="participant">Participant</SelectItem>
                                  <SelectItem value="observer">Observer</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <Label className="font-bold text-slate-700">External guests (emails)</Label>
                <Input
                  value={externalGuestsRaw}
                  onChange={(e) => setExternalGuestsRaw(e.target.value)}
                  placeholder="guest1@example.com, guest2@example.com"
                  className="border-slate-200 bg-white text-slate-950 focus-visible:ring-[#F5A623]"
                />
                <p className="text-xs leading-5 text-slate-500">External participants require an explicit recording and transcript policy.</p>
              </div>

              {parseEmailList(externalGuestsRaw).length > 0 ? (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-amber-200 bg-[#FFF8E8] p-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">Recording policy</Label>
                    <Select value={recordingPolicy} onValueChange={setRecordingPolicy}>
                      <SelectTrigger className="border-amber-200 bg-white text-slate-950">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[140] border-slate-200 bg-white text-slate-950">
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="on">On</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">Transcript policy</Label>
                    <Select value={transcriptPolicy} onValueChange={setTranscriptPolicy}>
                      <SelectTrigger className="border-amber-200 bg-white text-slate-950">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[140] border-slate-200 bg-white text-slate-950">
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="on">On</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setNewMeetingOpen(false)}
                  className="font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmMeetingCreation}
                  disabled={
                    createMeetingMutation.isPending ||
                    !newTitle.trim() ||
                    !newRoomId ||
                    !newObjectiveId ||
                    selectedAgentIds.length + selectedHumanIds.length + parseEmailList(externalGuestsRaw).length === 0
                  }
                  className="bg-[#07111F] font-black text-white hover:bg-slate-800"
                >
                  {createMeetingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
            </div>
          </div>
          <div className="grid border-t border-slate-200 bg-[#07111F] text-white sm:grid-cols-3">
            <div className="border-b border-white/10 px-5 py-3 sm:border-b-0 sm:border-r">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F8C45B]">Awa</p>
              <p className="mt-1 text-xs text-slate-300">Qualified demand and accountable follow-up</p>
            </div>
            <div className="border-b border-white/10 px-5 py-3 sm:border-b-0 sm:border-r">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F8C45B]">GDIZ</p>
              <p className="mt-1 text-xs text-slate-300">Industrial sourcing and execution reviews</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F8C45B]">Control</p>
              <p className="mt-1 text-xs text-slate-300">Objectives, participants, and evidence</p>
            </div>
          </div>
        </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList className="w-full border border-slate-200 bg-slate-100 sm:w-auto">
            <TabsTrigger value="month" className="font-bold data-[state=active]:bg-white data-[state=active]:text-[#07111F]">Month</TabsTrigger>
            <TabsTrigger value="week" className="font-bold data-[state=active]:bg-white data-[state=active]:text-[#07111F]">Week</TabsTrigger>
            <TabsTrigger value="day" className="font-bold data-[state=active]:bg-white data-[state=active]:text-[#07111F]">Day</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={movePrev} className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCursorDate(new Date())} className="border-slate-200 bg-white font-bold text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]">
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={moveNext} className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="ml-1 text-sm font-black text-[#07111F] sm:ml-2">{headerTitle}</div>
        </div>

        <div className="flex-1" />

        {eventsLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading events…
          </div>
        ) : (
          <Badge variant="outline" className="border-slate-200 bg-slate-50 font-bold text-slate-600">
            {events.length} events
          </Badge>
        )}
      </section>

      {!selectedCompanyId ? (
        <Card className="border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
          <CardContent className="p-8 text-center text-slate-500">
            Select a company to view its agenda.
          </CardContent>
        </Card>
      ) : viewMode === "month" ? (
        <MonthView />
      ) : viewMode === "week" ? (
        <WeekView />
      ) : (
        <DayView />
      )}

      <Dialog open={!!selectedEvent} onOpenChange={(open) => (!open ? setSelectedEvent(null) : null)}>
        <DialogContent
          className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto border-slate-200 bg-white text-slate-950 shadow-2xl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-6 text-xl font-black text-[#07111F]">
              <span className="min-w-0 truncate">{selectedEvent?.title || "Meeting"}</span>
              {selectedEvent ? (
                <Badge variant="outline" className={cn("shrink-0 text-[10px] font-bold capitalize", meetingStatusClasses(selectedEvent.status))}>
                  {meetingStatusLabel(selectedEvent.status)}
                </Badge>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {selectedEvent ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-slate-200 bg-slate-50/70">
                <CardHeader className="border-b border-slate-200 pb-4">
                  <CardTitle className="flex items-center gap-2 text-sm font-black text-[#07111F]">
                    <FileText className="h-4 w-4 text-[#A56600]" />
                    Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedEvent.description ? (
                    <div className="text-sm leading-6 text-slate-700">{selectedEvent.description}</div>
                  ) : (
                    <div className="text-sm text-slate-500">No description.</div>
                  )}

                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">
                      {safeDate(selectedEvent.startTime) ? format(parseISO(selectedEvent.startTime), "PPpp") : "—"}
                    </span>
                  </div>

                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-2">
                      <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#A56600]" />
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Objective</div>
                        <div className="text-sm font-semibold text-slate-800">
                          {selectedObjective?.title || (meetingDetailLoading ? "Loading objective..." : "No objective linked")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#A56600]" />
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Room</div>
                        <div className="text-sm font-semibold text-slate-800">
                          {selectedRoom?.name || (meetingDetailLoading ? "Loading room..." : "Operations Center")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#A56600]" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Participants</div>
                        {meetingDetailLoading ? (
                          <div className="text-sm text-slate-500">Loading participants...</div>
                        ) : participantLabels.length ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {participantLabels.map((participant) => (
                              <Badge
                                key={participant.id}
                                variant="outline"
                                className="border-slate-200 bg-slate-50 text-slate-700"
                              >
                                {participant.name} · {participant.role}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">No participant roster available.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className="gap-2 bg-[#07111F] font-black text-white hover:bg-slate-800"
                      onClick={() => confirmMeetingStart(selectedEvent)}
                      disabled={startMeetingMutation.isPending || !selectedEvent.conversationId}
                    >
                      {startMeetingMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      {selectedEvent.status === "scheduled"
                        ? "Start in Operations Center"
                        : selectedEvent.status === "completed"
                          ? "Review in Operations Center"
                          : "Open in Operations Center"}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 border-slate-200 bg-white font-bold text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
                      onClick={() => downloadIcsMutation.mutate(selectedEvent)}
                      disabled={downloadIcsMutation.isPending || !selectedEvent.meetingId}
                    >
                      {downloadIcsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Download ICS
                    </Button>
                  </div>

                  <Card className="border-slate-200 bg-white">
                    <CardHeader className="border-b border-slate-200 py-3">
                      <CardTitle className="flex items-center gap-2 text-xs font-black text-[#07111F]">
                        <Users className="h-3 w-3 text-[#A56600]" />
                        Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {!selectedEvent.meetingId ? (
                        <div className="pt-4 text-xs text-slate-500">This room does not have a meeting archive yet.</div>
                      ) : summaryLoading ? (
                        <div className="flex items-center gap-2 pt-4 text-xs text-slate-500">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading…
                        </div>
                      ) : !summary ? (
                        <div className="pt-4 text-xs text-slate-500">No summary yet.</div>
                      ) : (
                        <div className="space-y-3 pt-4">
                          {summary.summary ? (
                            <div className="text-sm leading-6 text-slate-700">{summary.summary}</div>
                          ) : null}
                          {Array.isArray(summary.decisions) && summary.decisions.length ? (
                            <div>
                              <div className="mb-1 text-xs font-black text-slate-700">Decisions</div>
                              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
                                {summary.decisions.slice(0, 5).map((d, idx) => (
                                  <li key={idx}>
                                    {typeof d === "string" ? d : d.decision}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {Array.isArray(summary.actionItems) && summary.actionItems.length ? (
                            <div>
                              <div className="mb-1 text-xs font-black text-slate-700">Action items</div>
                              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
                                {summary.actionItems.slice(0, 5).map((a, idx) => (
                                  <li key={idx}>
                                    {typeof a === "string" ? a : a.text}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white">
                <CardHeader className="border-b border-slate-200 pb-4">
                  <CardTitle className="text-sm font-black text-[#07111F]">Transcript</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[420px] pr-3">
                    {transcriptLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading…
                      </div>
                    ) : transcript.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No messages yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {transcript.slice(-80).map((msg: any) => {
                          const createdAt = msg?.createdAt ? new Date(msg.createdAt) : null;
                          const from = msg?.fromAgent?.name || (msg?.fromAgentId ? `Agent #${msg.fromAgentId}` : "System");
                          return (
                            <div key={msg.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="truncate text-xs font-black text-slate-700">{from}</div>
                                <div className="tabular-nums text-[10px] text-slate-500">
                                  {createdAt && Number.isFinite(createdAt.getTime()) ? format(createdAt, "HH:mm") : ""}
                                </div>
                              </div>
                              <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{String(msg?.content || "")}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
