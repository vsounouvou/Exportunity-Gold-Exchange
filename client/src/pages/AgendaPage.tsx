import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, Download, Loader2, Plus, Clock, Users, FileText } from "lucide-react";

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

export default function AgendaPage() {
  const queryClient = useQueryClient();
  const { selectedCompanyId, selectedCompany, isLoading: companyLoading } = useCompany();

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);

  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMeetingType, setNewMeetingType] = useState("weekly_ops_sync");
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
  });

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
      <Card className="bg-gray-900/40 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-400" />
            Month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="text-xs text-gray-500 font-medium px-2">
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
                    "min-h-[110px] rounded-lg border p-2 transition-colors",
                    "border-gray-800 bg-gray-950/30 hover:bg-gray-950/60",
                    isTodayDate ? "ring-1 ring-blue-600/60" : null
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={cn("text-xs", isTodayDate ? "text-blue-300 font-semibold" : "text-gray-400")}>
                      {format(day, "d")}
                    </div>
                    {dayEvents.length ? (
                      <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400">
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
                          onClick={() => setSelectedEvent(ev)}
                          className={cn(
                            "w-full text-left text-xs rounded-md px-2 py-1 border transition-colors",
                            "border-gray-800 bg-gray-900/40 hover:bg-gray-900/70",
                            ev.status === "completed" ? "opacity-70" : null
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 tabular-nums">{time}</span>
                            <span className="text-gray-200 truncate">{ev.title}</span>
                          </div>
                        </button>
                      );
                    })}
                    {dayEvents.length > 3 ? (
                      <div className="text-[11px] text-gray-500 px-2">+{dayEvents.length - 3} more…</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const WeekView = () => {
    const days = eachDayOfInterval({ start: range.start, end: range.end });
    return (
      <Card className="bg-gray-900/40 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-400" />
            Week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <div key={key} className="rounded-lg border border-gray-800 bg-gray-950/30">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                  <div className="text-sm text-white flex items-center gap-2">
                    <span className={cn(isToday(day) ? "text-blue-300 font-semibold" : "text-gray-200")}>
                      {format(day, "EEE")}
                    </span>
                    <span className="text-gray-500">{format(day, "MMM d")}</span>
                  </div>
                  <Badge variant="outline" className="border-gray-800 text-gray-400">
                    {dayEvents.length}
                  </Badge>
                </div>
                <div className="p-2 space-y-1">
                  {dayEvents.length === 0 ? (
                    <div className="text-xs text-gray-500 px-2 py-2">No events</div>
                  ) : (
                    dayEvents.map((ev) => {
                      const t = safeDate(ev.startTime);
                      const time = t ? format(t, "HH:mm") : "--:--";
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="w-full text-left text-xs rounded-md px-2 py-2 border border-gray-800 bg-gray-900/40 hover:bg-gray-900/70"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="text-gray-400 tabular-nums">{time}</span>
                              <span className="text-gray-200 truncate">{ev.title}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] border-gray-800 text-gray-400">
                              {ev.status}
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
      <Card className="bg-gray-900/40 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-400" />
            Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dayEvents.length === 0 ? (
            <div className="text-sm text-gray-500">No events scheduled.</div>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((ev) => {
                const start = safeDate(ev.startTime);
                const end = ev.endTime ? safeDate(ev.endTime) : null;
                return (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full text-left rounded-lg border border-gray-800 bg-gray-900/40 hover:bg-gray-900/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-white font-medium truncate">{ev.title}</div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          <span className="tabular-nums">
                            {start ? format(start, "HH:mm") : "--:--"}–{end ? format(end, "HH:mm") : "…"}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-gray-800 text-gray-400">
                        {ev.status}
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
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Calendar className="h-8 w-8 text-blue-400" />
            Agenda
          </h1>
          <p className="text-gray-400 mt-1">
            Company calendar for meetings and execution windows
            {selectedCompany ? <span className="text-gray-500"> • {selectedCompany.name}</span> : null}
          </p>
        </div>

        <Dialog open={newMeetingOpen} onOpenChange={setNewMeetingOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 gap-2" disabled={!selectedCompanyId}>
              <Plus className="h-4 w-4" />
              New Meeting
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-950 border-gray-800 w-[min(96vw,1080px)] max-w-none p-0">
            <DialogHeader>
              <DialogTitle className="text-white px-6 pt-6">Schedule meeting</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-4 max-h-[84vh] overflow-y-auto">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="space-y-2 xl:col-span-2">
                  <Label className="text-gray-300">Title</Label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Weekly operations sync"
                    className="bg-gray-900 border-gray-800 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Description</Label>
                  <Input
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Purpose / expected outcome"
                    className="bg-gray-900 border-gray-800 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Meeting type</Label>
                  <Select
                    value={newMeetingType}
                    onValueChange={(value) => {
                      setNewMeetingType(value);
                      const defaultDuration = meetingTypeDefaults[value];
                      if (defaultDuration) setNewDuration(defaultDuration);
                    }}
                  >
                    <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                      <SelectValue placeholder="Select meeting type" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-950 border-gray-800 text-white z-[140]">
                      <SelectItem value="weekly_ops_sync">Weekly Ops Sync</SelectItem>
                      <SelectItem value="incident">Incident</SelectItem>
                      <SelectItem value="investor_call">Investor Call</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Room</Label>
                  <Select
                    value={newRoomId ? String(newRoomId) : ""}
                    onValueChange={(value) => setNewRoomId(Number(value))}
                  >
                    <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                      <SelectValue placeholder="Select room" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-950 border-gray-800 text-white z-[140]">
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
                  <Label className="text-gray-300">Start</Label>
                  <Input
                    type="datetime-local"
                    value={newStartLocal}
                    onChange={(e) => setNewStartLocal(e.target.value)}
                    className="bg-gray-900 border-gray-800 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Duration presets</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {durationPresets.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant={newDuration === preset ? "default" : "outline"}
                        className={newDuration === preset ? "bg-blue-600 hover:bg-blue-700 h-9" : "border-gray-800 text-gray-200 h-9"}
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
                    className="bg-gray-900 border-gray-800 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Card className="bg-gray-900/40 border-gray-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-white">Agents attendance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[280px] overflow-auto">
                    {agentRows.map((agent) => {
                      const checked = selectedAgentIds.includes(agent.id);
                      return (
                        <div key={agent.id} className="rounded-md border border-gray-800 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-sm text-gray-200">
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
                                <SelectTrigger className="h-8 w-40 bg-gray-950 border-gray-700 text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-950 border-gray-700 text-white z-[140]">
                                  <SelectItem value="host">Host</SelectItem>
                                  <SelectItem value="facilitator">Facilitator</SelectItem>
                                  <SelectItem value="note_taker">Note-taker</SelectItem>
                                  <SelectItem value="participant">Participant</SelectItem>
                                  <SelectItem value="observer">Observer</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : null}
                          </div>
                          {agent.role ? <div className="text-[11px] text-gray-500 mt-1">{agent.role}</div> : null}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/40 border-gray-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-white">Humans attendance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[280px] overflow-auto">
                    {activeUsers.map((user) => {
                      const checked = selectedHumanIds.includes(user.id);
                      const label = user.displayName || user.email || `User ${user.id}`;
                      return (
                        <div key={user.id} className="rounded-md border border-gray-800 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-sm text-gray-200">
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
                                <SelectTrigger className="h-8 w-40 bg-gray-950 border-gray-700 text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-950 border-gray-700 text-white z-[140]">
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

              <div className="space-y-2">
                <Label className="text-gray-300">External guests (emails)</Label>
                <Input
                  value={externalGuestsRaw}
                  onChange={(e) => setExternalGuestsRaw(e.target.value)}
                  placeholder="guest1@example.com, guest2@example.com"
                  className="bg-gray-900 border-gray-800 text-white"
                />
              </div>

              {parseEmailList(externalGuestsRaw).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-gray-300">Recording policy</Label>
                    <Select value={recordingPolicy} onValueChange={setRecordingPolicy}>
                      <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-950 border-gray-800 text-white z-[140]">
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="on">On</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">Transcript policy</Label>
                    <Select value={transcriptPolicy} onValueChange={setTranscriptPolicy}>
                      <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-950 border-gray-800 text-white z-[140]">
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="on">On</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setNewMeetingOpen(false)}
                  className="text-gray-300 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createMeetingMutation.mutate()}
                  disabled={
                    createMeetingMutation.isPending ||
                    !newTitle.trim() ||
                    !newRoomId ||
                    selectedAgentIds.length + selectedHumanIds.length + parseEmailList(externalGuestsRaw).length === 0
                  }
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {createMeetingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="day">Day</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={movePrev} className="border-gray-800 bg-gray-950/30">
            <ChevronLeft className="h-4 w-4 text-gray-200" />
          </Button>
          <Button variant="outline" onClick={() => setCursorDate(new Date())} className="border-gray-800 bg-gray-950/30">
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={moveNext} className="border-gray-800 bg-gray-950/30">
            <ChevronRight className="h-4 w-4 text-gray-200" />
          </Button>
          <div className="text-sm text-white font-medium ml-2">{headerTitle}</div>
        </div>

        <div className="flex-1" />

        {eventsLoading ? (
          <div className="text-sm text-gray-400 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading events…
          </div>
        ) : (
          <Badge variant="outline" className="border-gray-800 text-gray-400">
            {events.length} events
          </Badge>
        )}
      </div>

      {!selectedCompanyId ? (
        <Card className="bg-gray-900/40 border-gray-800">
          <CardContent className="p-6 text-gray-400">
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
        <DialogContent className="bg-gray-950 border-gray-800 max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{selectedEvent?.title || "Meeting"}</span>
              {selectedEvent ? (
                <Badge variant="outline" className="border-gray-800 text-gray-400 shrink-0">
                  {selectedEvent.status}
                </Badge>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {selectedEvent ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-gray-900/40 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-400" />
                    Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedEvent.description ? (
                    <div className="text-sm text-gray-300">{selectedEvent.description}</div>
                  ) : (
                    <div className="text-sm text-gray-500">No description.</div>
                  )}

                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">
                      {safeDate(selectedEvent.startTime) ? format(parseISO(selectedEvent.startTime), "PPpp") : "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="border-gray-800 bg-gray-950/30 gap-2"
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

                  <Card className="bg-gray-950/40 border-gray-800">
                    <CardHeader className="py-3">
                      <CardTitle className="text-white text-xs flex items-center gap-2">
                        <Users className="h-3 w-3 text-blue-400" />
                        Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {!selectedEvent.meetingId ? (
                        <div className="text-xs text-gray-500">Legacy meeting room (no meeting archive yet).</div>
                      ) : summaryLoading ? (
                        <div className="text-xs text-gray-400 flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading…
                        </div>
                      ) : !summary ? (
                        <div className="text-xs text-gray-500">No summary yet.</div>
                      ) : (
                        <div className="space-y-3">
                          {summary.summary ? (
                            <div className="text-sm text-gray-300">{summary.summary}</div>
                          ) : null}
                          {Array.isArray(summary.decisions) && summary.decisions.length ? (
                            <div>
                              <div className="text-xs text-gray-400 mb-1">Decisions</div>
                              <ul className="text-xs text-gray-300 list-disc pl-4 space-y-1">
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
                              <div className="text-xs text-gray-400 mb-1">Action items</div>
                              <ul className="text-xs text-gray-300 list-disc pl-4 space-y-1">
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

              <Card className="bg-gray-900/40 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm">Transcript</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[420px] pr-3">
                    {transcriptLoading ? (
                      <div className="text-sm text-gray-400 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading…
                      </div>
                    ) : transcript.length === 0 ? (
                      <div className="text-sm text-gray-500">No messages yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {transcript.slice(-80).map((msg: any) => {
                          const createdAt = msg?.createdAt ? new Date(msg.createdAt) : null;
                          const from = msg?.fromAgent?.name || (msg?.fromAgentId ? `Agent #${msg.fromAgentId}` : "System");
                          return (
                            <div key={msg.id} className="rounded-lg border border-gray-800 bg-gray-950/30 p-3">
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="text-xs text-gray-300 truncate">{from}</div>
                                <div className="text-[10px] text-gray-500 tabular-nums">
                                  {createdAt && Number.isFinite(createdAt.getTime()) ? format(createdAt, "HH:mm") : ""}
                                </div>
                              </div>
                              <div className="text-sm text-gray-200 whitespace-pre-wrap">{String(msg?.content || "")}</div>
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
  );
}
