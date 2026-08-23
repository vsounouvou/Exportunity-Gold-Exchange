import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ContactRow = {
  id: number;
  displayName: string;
  company: string | null;
  jobTitle: string | null;
  phones: string[];
  emails: string[];
  primaryPhoneE164: string | null;
  primaryEmail: string | null;
  tags: string[];
  status: string;
  consentStatus: string;
  isDnc: boolean;
  source: string | null;
  sourceSystem: string | null;
  notes: string | null;
  hasWhatsapp: boolean;
  lastInteractionAt: string | null;
  lastOutreachAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ContactsResponse = {
  ok: boolean;
  items: ContactRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDuration(seconds?: number | null) {
  const total = Math.max(0, Math.trunc(asNumber(seconds, 0)));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function importStatusClass(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  if (normalized === "running" || normalized === "queued") return "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50";
  if (normalized === "rolled_back") return "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100";
  return "border border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
}

function asDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function AdminContactsPage() {
  const [tab, setTab] = useState("contacts");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [consent, setConsent] = useState("all");
  const [source, setSource] = useState("all");
  const [hasWhatsapp, setHasWhatsapp] = useState("all");
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [selectedContact, setSelectedContact] = useState<ContactRow | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImportResult, setCsvImportResult] = useState<any>(null);
  const [editor, setEditor] = useState({
    displayName: "",
    company: "",
    jobTitle: "",
    emails: "",
    phones: "",
    tags: "",
    status: "lead",
    consentStatus: "unknown",
    notes: "",
  });
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [captureSave, setCaptureSave] = useState(false);
  const [captureTags, setCaptureTags] = useState("business_card");
  const [captureResult, setCaptureResult] = useState<any>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryKey = ["tenant-contacts", { search, status, consent, source, hasWhatsapp, offset, limit }];
  const contactsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (status !== "all") params.set("status", status);
      if (consent !== "all") params.set("consent", consent);
      if (source !== "all") params.set("source", source);
      if (hasWhatsapp !== "all") params.set("hasWhatsapp", hasWhatsapp);
      params.set("offset", String(offset));
      params.set("limit", String(limit));
      const suffix = params.toString();
      return apiRequest(`/api/tenant/contacts${suffix ? `?${suffix}` : ""}`, { method: "GET" }) as Promise<ContactsResponse>;
    },
  });

  const diagnosticsQuery = useQuery({
    queryKey: ["tenant-contacts-diagnostics"],
    queryFn: async () => apiRequest("/api/tenant/contacts/diagnostics", { method: "POST" }),
    enabled: false,
  });

  const importsQuery = useQuery({
    queryKey: ["admin-contacts-imports"],
    queryFn: async () => apiRequest("/api/admin/contacts/imports?limit=100", { method: "GET" }),
    enabled: tab === "imports",
    refetchInterval: tab === "imports" ? 3_000 : false,
  });

  const mergeSuggestionsQuery = useQuery({
    queryKey: ["admin-contacts-merge-suggestions", selectedContact?.id],
    queryFn: async () => {
      if (!selectedContact) return { items: [] };
      return apiRequest(`/api/admin/contacts/${selectedContact.id}/merge-suggestions`, { method: "GET" });
    },
    enabled: Boolean(selectedContact?.id),
  });

  const contacts = contactsQuery.data?.items || [];
  const total = contactsQuery.data?.total || 0;
  const importItems = useMemo(() => (Array.isArray(importsQuery.data?.items) ? importsQuery.data.items : []), [importsQuery.data?.items]);
  const activeImport = useMemo(
    () =>
      importItems.find((batch: any) => {
        const statusValue = String(batch?.status || "").toLowerCase();
        return statusValue === "running" || statusValue === "queued";
      }) || null,
    [importItems],
  );

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of contacts) {
      const value = item.sourceSystem || item.source || "";
      if (value) set.add(value);
    }
    return Array.from(set).sort();
  }, [contacts]);

  const syncEditor = (contact: ContactRow | null) => {
    if (!contact) {
      setEditor({
        displayName: "",
        company: "",
        jobTitle: "",
        emails: "",
        phones: "",
        tags: "",
        status: "lead",
        consentStatus: "unknown",
        notes: "",
      });
      return;
    }
    setEditor({
      displayName: contact.displayName || "",
      company: contact.company || "",
      jobTitle: contact.jobTitle || "",
      emails: (contact.emails || []).join(", "),
      phones: (contact.phones || []).join(", "),
      tags: (contact.tags || []).join(", "),
      status: contact.status || "lead",
      consentStatus: contact.consentStatus || "unknown",
      notes: contact.notes || "",
    });
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContact) throw new Error("Select a contact first.");
      return apiRequest(`/api/admin/contacts/${selectedContact.id}`, "PATCH", {
        displayName: editor.displayName,
        company: editor.company,
        jobTitle: editor.jobTitle,
        emails: editor.emails
          .split(/[;,]/g)
          .map((item) => item.trim())
          .filter(Boolean),
        phones: editor.phones
          .split(/[;,]/g)
          .map((item) => item.trim())
          .filter(Boolean),
        tags: editor.tags
          .split(/[;,]/g)
          .map((item) => item.trim())
          .filter(Boolean),
        status: editor.status,
        consentStatus: editor.consentStatus,
        notes: editor.notes,
        isDnc: editor.status === "dnc",
      });
    },
    onSuccess: async () => {
      toast({ title: "Contact saved" });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts-diagnostics"] });
    },
    onError: (error: any) => toast({ title: "Save failed", description: error?.message || "Unable to save contact.", variant: "destructive" }),
  });

  const dncMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContact) throw new Error("Select a contact first.");
      return apiRequest(`/api/admin/contacts/${selectedContact.id}`, "PATCH", {
        status: "dnc",
        consentStatus: "opt_out",
        isDnc: true,
      });
    },
    onSuccess: async () => {
      toast({ title: "Marked DNC" });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts-diagnostics"] });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (batchId: number) => apiRequest(`/api/admin/contacts/imports/${batchId}/rollback`, "POST", {}),
    onSuccess: async () => {
      toast({ title: "Rollback complete" });
      await queryClient.invalidateQueries({ queryKey: ["admin-contacts-imports"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts"] });
    },
  });

  const csvImportMutation = useMutation({
    mutationFn: async () => {
      if (!csvFile) throw new Error("Choose a CSV file first.");
      const formData = new FormData();
      formData.append("file", csvFile);
      return apiRequest("/api/tenant/contacts/import/csv", { method: "POST", body: formData });
    },
    onSuccess: async (result: any) => {
      setCsvImportResult(result);
      toast({
        title: "Import complete",
        description: `Rows ${result?.totalRows ?? 0} • created ${result?.createdContacts ?? 0} • linked ${result?.linkedExisting ?? 0} • errors ${Array.isArray(result?.errors) ? result.errors.length : 0}`,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-contacts-imports"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts-diagnostics"] });
    },
    onError: (error: any) => toast({ title: "Import failed", description: error?.message || "Could not import CSV.", variant: "destructive" }),
  });

  const captureMutation = useMutation({
    mutationFn: async () => {
      if (!captureFile) throw new Error("Choose an image first.");
      const formData = new FormData();
      formData.append("file", captureFile);
      formData.append("save", String(captureSave));
      formData.append("tags", captureTags);
      return apiRequest("/api/admin/contacts/capture", { method: "POST", body: formData });
    },
    onSuccess: (result) => {
      setCaptureResult(result);
      queryClient.invalidateQueries({ queryKey: ["tenant-contacts"] });
      toast({ title: "Capture processed" });
    },
    onError: (error: any) => toast({ title: "Capture failed", description: error?.message || "Could not process image.", variant: "destructive" }),
  });

  const mergeMutation = useMutation({
    mutationFn: async (secondaryId: number) => {
      if (!selectedContact) throw new Error("Select a contact first.");
      return apiRequest(`/api/admin/contacts/${selectedContact.id}/merge`, "POST", { secondaryContactId: secondaryId });
    },
    onSuccess: async () => {
      toast({ title: "Contacts merged" });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts"] });
      setSelectedContact(null);
      syncEditor(null);
    },
  });

  return (
    <div
      data-testid="exportunity-contacts-workspace"
      className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] p-4 pb-24 text-[#07111F] md:p-6"
    >
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN relationship operations</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Contact registry</h1>
            <p className="mt-1 text-sm text-slate-500">Tenant-scoped identities, consent, imports, and attributable merge controls.</p>
          </div>
          <Button
            variant="outline"
            className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
            onClick={async () => {
              const result = await diagnosticsQuery.refetch();
              if (result.error) {
                toast({ title: "Diagnostics failed", description: String((result.error as any)?.message || result.error), variant: "destructive" });
              }
            }}
            disabled={diagnosticsQuery.isFetching}
          >
            {diagnosticsQuery.isFetching ? "Running diagnostics…" : "Run diagnostics"}
          </Button>
        </div>

        <Card className="mb-6 border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader><CardTitle className="text-base text-slate-950">Contact data integrity</CardTitle></CardHeader>
          <CardContent>
            {diagnosticsQuery.data ? (
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <DiagStat label="All contacts" value={diagnosticsQuery.data.totals?.contactsTotal} />
                <DiagStat label="Current tenant" value={diagnosticsQuery.data.totals?.tenantContactsTotal} />
                <DiagStat label="Orphan (me)" value={diagnosticsQuery.data.totals?.orphanContactsCreatedByMe} />
                <DiagStat label="Wrong tenant (me)" value={diagnosticsQuery.data.totals?.wrongTenantLinksCreatedByMe} />
                <DiagStat label="Staging pending" value={diagnosticsQuery.data.totals?.stagingRowsPending} />
              </div>
            ) : (
              <div className="text-sm text-slate-500">Run the read-only diagnostic to inspect tenant distribution and imported-contact staging.</div>
            )}
            {csvImportResult ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-[#FBFCFD] p-3 text-xs text-slate-700">
                <div className="mb-2 font-bold text-slate-500">Last CSV import</div>
                <pre className="whitespace-pre-wrap break-all">{JSON.stringify(csvImportResult, null, 2)}</pre>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="border border-slate-200 bg-white p-1 text-slate-600">
            <TabsTrigger value="contacts" className="data-[state=active]:bg-[#07111F] data-[state=active]:text-white">Contacts</TabsTrigger>
            <TabsTrigger value="imports" className="data-[state=active]:bg-[#07111F] data-[state=active]:text-white">Imports</TabsTrigger>
            <TabsTrigger value="capture" className="data-[state=active]:bg-[#07111F] data-[state=active]:text-white">Capture</TabsTrigger>
          </TabsList>

          <TabsContent value="contacts">
            <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <Card className="min-w-0 border-slate-200 bg-white text-slate-950 shadow-sm">
                <CardHeader className="space-y-3">
                  <CardTitle className="text-slate-950">Contacts</CardTitle>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                    <Input value={search} onChange={(event) => { setOffset(0); setSearch(event.target.value); }} placeholder="Search name / phone / email" className="border-slate-200 bg-white text-slate-950 md:col-span-2" />
                    <Select value={status} onChange={(value) => { setOffset(0); setStatus(value); }} options={[["all", "Status"], ["lead", "Lead"], ["warm", "Warm"], ["customer", "Customer"], ["vip", "VIP"], ["dnc", "DNC"]]} />
                    <Select value={consent} onChange={(value) => { setOffset(0); setConsent(value); }} options={[["all", "Consent"], ["unknown", "Unknown"], ["opt_in", "Opt-in"], ["opt_out", "Opt-out"]]} />
                    <Select value={hasWhatsapp} onChange={(value) => { setOffset(0); setHasWhatsapp(value); }} options={[["all", "WhatsApp"], ["yes", "Has WhatsApp"], ["no", "No WhatsApp"]]} />
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <Select value={source} onChange={(value) => { setOffset(0); setSource(value); }} options={[["all", "All sources"], ...sourceOptions.map((item) => [item, item] as [string, string])]} />
                    <div className="flex items-center text-xs text-slate-500 md:col-span-3">Filters operate on the canonical tenant contact registry.</div>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 text-left">Name</th>
                        <th className="py-2 text-left">Phone</th>
                        <th className="py-2 text-left">Email</th>
                        <th className="py-2 text-left">Source</th>
                        <th className="py-2 text-left">Consent</th>
                        <th className="py-2 text-left">Last interaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((item) => (
                        <tr key={item.id} data-testid="exportunity-contact-record" className={`border-b border-slate-100 hover:bg-[#FFF8E8] ${selectedContact?.id === item.id ? "bg-[#FFF0C7]" : ""}`}>
                          <td className="py-2 pr-4">
                            <button type="button" className="text-left" onClick={() => { setSelectedContact(item); syncEditor(item); }}>
                              <div className="font-bold text-slate-950">{item.displayName}</div>
                              <div className="text-xs text-slate-500">{item.company || "—"} {item.jobTitle ? `• ${item.jobTitle}` : ""}</div>
                            </button>
                          </td>
                          <td className="py-2 pr-4 text-slate-700">{item.primaryPhoneE164 || "—"} {item.hasWhatsapp ? <Badge className="ml-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">WA</Badge> : null}</td>
                          <td className="py-2 pr-4 text-slate-700">{item.primaryEmail || "—"}</td>
                          <td className="py-2 pr-4 text-slate-700">{item.sourceSystem || item.source || "—"}</td>
                          <td className="py-2 pr-4"><Badge variant={item.isDnc ? "destructive" : "outline"} className={item.isDnc ? "" : "border-slate-200 bg-white text-slate-700 hover:bg-white"}>{item.consentStatus}</Badge></td>
                          <td className="py-2 text-slate-700">{asDate(item.lastInteractionAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {contactsQuery.isLoading ? <div className="py-8 text-center text-sm text-slate-500">Loading contacts…</div> : null}
                  {contactsQuery.isError ? <div className="py-8 text-center text-sm text-red-700">Unable to load contacts.</div> : null}
                  {!contactsQuery.isLoading && !contactsQuery.isError && contacts.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">No contacts match the current filters.</div> : null}

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <div>Total: {total}</div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
                      <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" disabled={!contactsQuery.data?.hasMore} onClick={() => setOffset(offset + limit)}>Next</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
                <CardHeader><CardTitle className="text-slate-950">{selectedContact ? `Contact #${selectedContact.id}` : "Contact profile"}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {selectedContact ? (
                    <>
                      <Input value={editor.displayName} onChange={(event) => setEditor((prev) => ({ ...prev, displayName: event.target.value }))} placeholder="Name" className="border-slate-200 bg-white text-slate-950" />
                      <Input value={editor.company} onChange={(event) => setEditor((prev) => ({ ...prev, company: event.target.value }))} placeholder="Company" className="border-slate-200 bg-white text-slate-950" />
                      <Input value={editor.jobTitle} onChange={(event) => setEditor((prev) => ({ ...prev, jobTitle: event.target.value }))} placeholder="Job title" className="border-slate-200 bg-white text-slate-950" />
                      <Input value={editor.emails} onChange={(event) => setEditor((prev) => ({ ...prev, emails: event.target.value }))} placeholder="Emails (comma separated)" className="border-slate-200 bg-white text-slate-950" />
                      <Input value={editor.phones} onChange={(event) => setEditor((prev) => ({ ...prev, phones: event.target.value }))} placeholder="Phones (comma separated)" className="border-slate-200 bg-white text-slate-950" />
                      <Input value={editor.tags} onChange={(event) => setEditor((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Tags (comma separated)" className="border-slate-200 bg-white text-slate-950" />
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={editor.status} onChange={(value) => setEditor((prev) => ({ ...prev, status: value }))} options={[["lead", "Lead"], ["warm", "Warm"], ["customer", "Customer"], ["vip", "VIP"], ["dnc", "DNC"]]} />
                        <Select value={editor.consentStatus} onChange={(value) => setEditor((prev) => ({ ...prev, consentStatus: value }))} options={[["unknown", "Unknown"], ["opt_in", "Opt-in"], ["opt_out", "Opt-out"]]} />
                      </div>
                      <Textarea value={editor.notes} onChange={(event) => setEditor((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" className="min-h-[120px] border-slate-200 bg-white text-slate-950" />
                      <div className="flex flex-wrap gap-2">
                        <Button className="bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving…" : "Save contact"}</Button>
                        <Button variant="destructive" onClick={() => { if (window.confirm(`Mark ${selectedContact.displayName} as do-not-contact and opt out?`)) dncMutation.mutate(); }} disabled={dncMutation.isPending}>Mark DNC</Button>
                      </div>
                      <div className="border-t border-slate-200 pt-3">
                        <div className="mb-2 text-xs font-bold text-slate-500">Merge suggestions</div>
                        <div className="space-y-2">
                          {(mergeSuggestionsQuery.data?.items || []).map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-[#FBFCFD] p-2 text-xs">
                              <div><div className="font-bold text-slate-950">{item.display_name}</div><div className="text-slate-500">{item.primary_email || item.primary_phone_e164 || "No primary identity"}</div></div>
                              <Button size="sm" variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => { if (window.confirm(`Merge ${item.display_name || `contact #${item.id}`} into ${selectedContact.displayName}?`)) mergeMutation.mutate(Number(item.id)); }} disabled={mergeMutation.isPending}>Merge</Button>
                            </div>
                          ))}
                          {!(mergeSuggestionsQuery.data?.items || []).length ? <div className="text-xs text-slate-500">No likely duplicates.</div> : null}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-500">Select a contact to review or edit its attributable profile, tags, and consent.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="imports">
            <Card className="mt-4 border-slate-200 bg-white text-slate-950 shadow-sm">
              <CardHeader><CardTitle className="text-slate-950">Import from CSV</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} className="border-slate-200 bg-white text-slate-950" />
                <Button className="bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]" onClick={() => csvImportMutation.mutate()} disabled={!csvFile || csvImportMutation.isPending}>{csvImportMutation.isPending ? "Importing…" : "Import CSV"}</Button>
                {csvFile ? <div className="text-xs text-slate-500">Selected file: <span className="font-medium text-slate-700">{csvFile.name}</span> ({Math.round(csvFile.size / 1024)} KB)</div> : null}
                <div className="text-xs text-slate-500">Import creates canonical contacts and links them to the current tenant.</div>
                {activeImport ? (
                  <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="flex items-center justify-between gap-2"><div className="text-sm font-bold text-blue-900">Active batch #{activeImport.id}{activeImport.fileName ? ` • ${activeImport.fileName}` : ""}</div><Badge className={importStatusClass(String(activeImport.status || ""))}>{String(activeImport.status || "running")}</Badge></div>
                    <div className="h-2 overflow-hidden rounded bg-blue-100"><div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, asNumber(activeImport.progressPct, 0)))}%` }} /></div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 md:grid-cols-4"><div>Processed: {asNumber(activeImport.processedRows, 0)} / {asNumber(activeImport.totalRows, 0)}</div><div>Created: {asNumber(activeImport.createdContacts, 0)}</div><div>Linked: {asNumber(activeImport.linkedExisting, 0)}</div><div>Errors: {asNumber(activeImport.errorCount, 0)}</div></div>
                    {activeImport.runningForSeconds != null ? <div className="text-[11px] text-slate-500">Running for {formatDuration(activeImport.runningForSeconds)}</div> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="mt-4 border-slate-200 bg-white text-slate-950 shadow-sm">
              <CardHeader><CardTitle className="text-slate-950">Import batches</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Number(importsQuery.data?.staleFailed || 0) > 0 ? <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">Auto-marked {Number(importsQuery.data?.staleFailed || 0)} stale running import batch(es) as failed.</div> : null}
                {(importsQuery.data?.items || []).map((batch: any) => (
                  <div key={batch.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-[#FBFCFD] p-3 text-sm sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-950">Batch #{batch.id} • {batch.source}</div>
                      <div className="text-xs text-slate-500">{batch.status} • {asDate(batch.created_at)} • mode={batch.mode}</div>
                      <div className="mt-2 h-2 overflow-hidden rounded bg-slate-200"><div className={`h-full transition-all ${String(batch.status || "").toLowerCase() === "failed" ? "bg-red-600" : "bg-blue-600"}`} style={{ width: `${Math.max(0, Math.min(100, asNumber(batch.progressPct, 0)))}%` }} /></div>
                      <div className="mt-1 text-[11px] text-slate-500">{asNumber(batch.processedRows, 0)}/{asNumber(batch.totalRows, 0)} processed • created {asNumber(batch.createdContacts, 0)} • linked {asNumber(batch.linkedExisting, 0)} • errors {asNumber(batch.errorCount, 0)}{batch.runningForSeconds != null ? ` • running ${formatDuration(batch.runningForSeconds)}` : ""}</div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => { if (window.confirm(`Rollback import batch #${batch.id}? This reverses records created by the batch.`)) rollbackMutation.mutate(Number(batch.id)); }} disabled={rollbackMutation.isPending || String(batch.status || "").toLowerCase() === "rolled_back" || String(batch.status || "").toLowerCase() === "running" || String(batch.status || "").toLowerCase() === "queued"}>Rollback</Button>
                  </div>
                ))}
                {!(importsQuery.data?.items || []).length ? <div className="text-sm text-slate-500">No import history yet.</div> : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="capture">
            <Card className="mt-4 border-slate-200 bg-white text-slate-950 shadow-sm">
              <CardHeader><CardTitle className="text-slate-950">Business card capture</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2"><Label className="text-slate-700">Image</Label><Input type="file" accept="image/*" onChange={(event) => setCaptureFile(event.target.files?.[0] || null)} className="border-slate-200 bg-white text-slate-950" /></div>
                  <div className="space-y-2"><Label className="text-slate-700">Tags</Label><Input value={captureTags} onChange={(event) => setCaptureTags(event.target.value)} placeholder="business_card,event_2026" className="border-slate-200 bg-white text-slate-950" /></div>
                </div>
                <div className="flex items-center gap-2"><Checkbox checked={captureSave} onCheckedChange={(checked) => setCaptureSave(Boolean(checked))} /><Label className="text-slate-700">Save or merge after successful extraction</Label></div>
                <Button className="bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]" onClick={() => captureMutation.mutate()} disabled={captureMutation.isPending || !captureFile}>{captureMutation.isPending ? "Extracting…" : captureSave ? "Extract and save contacts" : "Extract without saving"}</Button>
                {captureResult ? <div className="rounded-lg border border-slate-200 bg-[#FBFCFD] p-3 text-sm"><div className="mb-2 text-xs font-bold text-slate-500">Extraction result</div><pre className="whitespace-pre-wrap break-all text-xs text-slate-700">{JSON.stringify(captureResult, null, 2)}</pre></div> : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950">
      {options.map(([optValue, label]) => (
        <option key={optValue} value={optValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function DiagStat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-[#FBFCFD] p-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-950">{String(value ?? "—")}</div>
    </div>
  );
}
