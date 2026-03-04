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
  if (normalized === "completed") return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  if (normalized === "running" || normalized === "queued") return "bg-blue-500/15 text-blue-300 border border-blue-500/30";
  if (normalized === "rolled_back") return "bg-slate-500/15 text-slate-300 border border-slate-500/30";
  return "bg-red-500/15 text-red-300 border border-red-500/30";
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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectAllMatching, setSelectAllMatching] = useState(false);
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
  const [captureSave, setCaptureSave] = useState(true);
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

  const contactIdsOnPage = useMemo(() => contacts.map((item) => item.id), [contacts]);
  const isPageFullySelected = useMemo(() => contactIdsOnPage.length > 0 && contactIdsOnPage.every((id) => selectedIds.includes(id)), [contactIdsOnPage, selectedIds]);

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

  const claimLegacyMutation = useMutation({
    mutationFn: async (force: boolean) => apiRequest("/api/tenant/contacts/claim-legacy", "POST", { force }),
    onSuccess: async (result: any) => {
      toast({ title: "Legacy claim complete", description: `Claimed ${result?.claimed || 0} contact link(s).` });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts-diagnostics"] });
    },
    onError: (error: any) => toast({ title: "Claim failed", description: error?.message || "Could not claim legacy contacts.", variant: "destructive" }),
  });

  const forceClaimMutation = useMutation({
    mutationFn: async () => apiRequest("/api/tenant/contacts/force-claim", "POST", {}),
    onSuccess: async (result: any) => {
      toast({ title: "Force claim complete", description: `Claimed ${result?.claimed || 0} contact link(s).` });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-contacts-diagnostics"] });
    },
    onError: (error: any) => toast({ title: "Force claim failed", description: error?.message || "Could not force claim contacts.", variant: "destructive" }),
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
        description: `Rows ${result?.totalRows ?? 0} â€¢ created ${result?.createdContacts ?? 0} â€¢ linked ${result?.linkedExisting ?? 0} â€¢ errors ${Array.isArray(result?.errors) ? result.errors.length : 0}`,
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

  const toggleSelectPage = (checked: boolean) => {
    if (checked) {
      setSelectedIds(uniqueIds([...selectedIds, ...contactIdsOnPage]));
      return;
    }
    setSelectedIds(selectedIds.filter((id) => !contactIdsOnPage.includes(id)));
  };

  const selectedCount = selectAllMatching ? total : selectedIds.length;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-[1600px] mx-auto">
        <Card className="bg-gray-900 border-gray-800 mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Admin Contacts</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const result = await diagnosticsQuery.refetch();
                  if (result.error) {
                    toast({ title: "Diagnostics failed", description: String((result.error as any)?.message || result.error), variant: "destructive" });
                  }
                }}
                disabled={diagnosticsQuery.isFetching}
              >
                {diagnosticsQuery.isFetching ? "Running..." : "Diagnostics"}
              </Button>
              <Button variant="outline" onClick={() => claimLegacyMutation.mutate(false)} disabled={claimLegacyMutation.isPending}>
                Claim Legacy
              </Button>
              <Button variant="secondary" onClick={() => forceClaimMutation.mutate()} disabled={forceClaimMutation.isPending}>
                Force Claim
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {diagnosticsQuery.data ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <DiagStat label="All contacts" value={diagnosticsQuery.data.totals?.contactsTotal} />
                <DiagStat label="Current tenant" value={diagnosticsQuery.data.totals?.tenantContactsTotal} />
                <DiagStat label="Orphan (me)" value={diagnosticsQuery.data.totals?.orphanContactsCreatedByMe} />
                <DiagStat label="Wrong tenant (me)" value={diagnosticsQuery.data.totals?.wrongTenantLinksCreatedByMe} />
                <DiagStat label="Staging pending" value={diagnosticsQuery.data.totals?.stagingRowsPending} />
              </div>
            ) : (
              <div className="text-sm text-gray-400">Run diagnostics to locate imported contacts and tenant distribution.</div>
            )}
            {csvImportResult ? (
              <div className="rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-200 mt-4">
                <div className="text-gray-400 mb-2">Last CSV import</div>
                <pre className="whitespace-pre-wrap break-all">{JSON.stringify(csvImportResult, null, 2)}</pre>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="imports">Imports</TabsTrigger>
            <TabsTrigger value="capture">Capture</TabsTrigger>
            <TabsTrigger value="segments">Segments</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          </TabsList>

          <TabsContent value="contacts">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr,420px] gap-6 mt-4">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="space-y-3">
                  <CardTitle>Contacts</CardTitle>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    <Input value={search} onChange={(event) => { setOffset(0); setSearch(event.target.value); }} placeholder="Search name / phone / email" className="bg-gray-950 border-gray-700 md:col-span-2" />
                    <Select value={status} onChange={(value) => { setOffset(0); setStatus(value); }} options={[["all", "Status"], ["lead", "Lead"], ["warm", "Warm"], ["customer", "Customer"], ["vip", "VIP"], ["dnc", "DNC"]]} />
                    <Select value={consent} onChange={(value) => { setOffset(0); setConsent(value); }} options={[["all", "Consent"], ["unknown", "Unknown"], ["opt_in", "Opt-in"], ["opt_out", "Opt-out"]]} />
                    <Select value={hasWhatsapp} onChange={(value) => { setOffset(0); setHasWhatsapp(value); }} options={[["all", "WhatsApp"], ["yes", "Has WhatsApp"], ["no", "No WhatsApp"]]} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <Select
                      value={source}
                      onChange={(value) => {
                        setOffset(0);
                        setSource(value);
                      }}
                      options={[["all", "All sources"], ...sourceOptions.map((item) => [item, item] as [string, string])]}
                    />
                    <div className="md:col-span-3 flex items-center gap-3 text-xs text-gray-400">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={isPageFullySelected} onCheckedChange={(checked) => toggleSelectPage(Boolean(checked))} />
                        <span>Select page</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox checked={selectAllMatching} onCheckedChange={(checked) => setSelectAllMatching(Boolean(checked))} />
                        <span>Select all results ({total})</span>
                      </div>
                      <Badge>{selectedCount} selected</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-400 border-b border-gray-800">
                      <tr>
                        <th className="text-left py-2 w-8"></th>
                        <th className="text-left py-2">Name</th>
                        <th className="text-left py-2">Phone</th>
                        <th className="text-left py-2">Email</th>
                        <th className="text-left py-2">Source</th>
                        <th className="text-left py-2">Consent</th>
                        <th className="text-left py-2">Last Interaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((item) => (
                        <tr
                          key={item.id}
                          className={`border-b border-gray-900 hover:bg-gray-800/50 ${selectedContact?.id === item.id ? "bg-sky-500/10" : ""}`}
                        >
                          <td className="py-2">
                            <Checkbox
                              checked={selectedIds.includes(item.id)}
                              onCheckedChange={(checked) =>
                                setSelectedIds((prev) => (checked ? uniqueIds([...prev, item.id]) : prev.filter((id) => id !== item.id)))
                              }
                            />
                          </td>
                          <td className="py-2 cursor-pointer" onClick={() => { setSelectedContact(item); syncEditor(item); }}>
                            <div className="font-medium">{item.displayName}</div>
                            <div className="text-xs text-gray-400">{item.company || "—"} {item.jobTitle ? `• ${item.jobTitle}` : ""}</div>
                          </td>
                          <td className="py-2">
                            {item.primaryPhoneE164 || "—"} {item.hasWhatsapp ? <Badge className="ml-2">WA</Badge> : null}
                          </td>
                          <td className="py-2">{item.primaryEmail || "—"}</td>
                          <td className="py-2">{item.sourceSystem || item.source || "—"}</td>
                          <td className="py-2">
                            <Badge variant={item.isDnc ? "destructive" : "outline"}>{item.consentStatus}</Badge>
                          </td>
                          <td className="py-2">{asDate(item.lastInteractionAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
                    <div>Total: {total}</div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={!contactsQuery.data?.hasMore} onClick={() => setOffset(offset + limit)}>
                        Next
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle>{selectedContact ? `Contact #${selectedContact.id}` : "Contact Profile"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedContact ? (
                    <>
                      <Input value={editor.displayName} onChange={(event) => setEditor((prev) => ({ ...prev, displayName: event.target.value }))} placeholder="Name" className="bg-gray-950 border-gray-700" />
                      <Input value={editor.company} onChange={(event) => setEditor((prev) => ({ ...prev, company: event.target.value }))} placeholder="Company" className="bg-gray-950 border-gray-700" />
                      <Input value={editor.jobTitle} onChange={(event) => setEditor((prev) => ({ ...prev, jobTitle: event.target.value }))} placeholder="Job title" className="bg-gray-950 border-gray-700" />
                      <Input value={editor.emails} onChange={(event) => setEditor((prev) => ({ ...prev, emails: event.target.value }))} placeholder="Emails (comma separated)" className="bg-gray-950 border-gray-700" />
                      <Input value={editor.phones} onChange={(event) => setEditor((prev) => ({ ...prev, phones: event.target.value }))} placeholder="Phones (comma separated)" className="bg-gray-950 border-gray-700" />
                      <Input value={editor.tags} onChange={(event) => setEditor((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Tags (comma separated)" className="bg-gray-950 border-gray-700" />
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={editor.status} onChange={(value) => setEditor((prev) => ({ ...prev, status: value }))} options={[["lead", "Lead"], ["warm", "Warm"], ["customer", "Customer"], ["vip", "VIP"], ["dnc", "DNC"]]} />
                        <Select value={editor.consentStatus} onChange={(value) => setEditor((prev) => ({ ...prev, consentStatus: value }))} options={[["unknown", "Unknown"], ["opt_in", "Opt-in"], ["opt_out", "Opt-out"]]} />
                      </div>
                      <Textarea value={editor.notes} onChange={(event) => setEditor((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" className="bg-gray-950 border-gray-700 min-h-[120px]" />
                      <div className="flex gap-2 flex-wrap">
                        <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save"}</Button>
                        <Button variant="destructive" onClick={() => dncMutation.mutate()} disabled={dncMutation.isPending}>Mark DNC</Button>
                      </div>
                      <div className="pt-3 border-t border-gray-800">
                        <div className="text-xs text-gray-400 mb-2">Merge suggestions</div>
                        <div className="space-y-2">
                          {(mergeSuggestionsQuery.data?.items || []).map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between rounded border border-gray-800 p-2 text-xs">
                              <div>
                                <div className="font-medium">{item.display_name}</div>
                                <div className="text-gray-400">{item.primary_email || item.primary_phone_e164 || "No primary identity"}</div>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => mergeMutation.mutate(Number(item.id))} disabled={mergeMutation.isPending}>
                                Merge
                              </Button>
                            </div>
                          ))}
                          {!(mergeSuggestionsQuery.data?.items || []).length ? <div className="text-xs text-gray-500">No likely duplicates.</div> : null}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-400">Select a contact row to edit profile, tags, consent, and merge duplicates.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="imports">
            <Card className="bg-gray-900 border-gray-800 mt-4">
              <CardHeader>
                <CardTitle>Import from CSV</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} className="bg-gray-950 border-gray-700" />
                <Button onClick={() => csvImportMutation.mutate()} disabled={!csvFile || csvImportMutation.isPending}>
                  {csvImportMutation.isPending ? "Importing..." : "Import CSV"}
                </Button>
                {csvFile ? (
                  <div className="text-xs text-gray-400">
                    Selected file: <span className="text-gray-200">{csvFile.name}</span> ({Math.round(csvFile.size / 1024)} KB)
                  </div>
                ) : null}
                <div className="text-xs text-gray-400">Import creates canonical contacts and links them to your tenant so they are visible immediately.</div>
                {activeImport ? (
                  <div className="rounded border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-blue-200">
                        Active batch #{activeImport.id}
                        {activeImport.fileName ? ` • ${activeImport.fileName}` : ""}
                      </div>
                      <Badge className={importStatusClass(String(activeImport.status || ""))}>{String(activeImport.status || "running")}</Badge>
                    </div>
                    <div className="h-2 rounded bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, asNumber(activeImport.progressPct, 0)))}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-gray-300">
                      <div>Processed: {asNumber(activeImport.processedRows, 0)} / {asNumber(activeImport.totalRows, 0)}</div>
                      <div>Created: {asNumber(activeImport.createdContacts, 0)}</div>
                      <div>Linked: {asNumber(activeImport.linkedExisting, 0)}</div>
                      <div>Errors: {asNumber(activeImport.errorCount, 0)}</div>
                    </div>
                    {activeImport.runningForSeconds != null ? (
                      <div className="text-[11px] text-gray-400">Running for {formatDuration(activeImport.runningForSeconds)}</div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800 mt-4">
              <CardHeader>
                <CardTitle>Import Batches</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Number(importsQuery.data?.staleFailed || 0) > 0 ? (
                  <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
                    Auto-marked {Number(importsQuery.data?.staleFailed || 0)} stale running import batch(es) as failed.
                  </div>
                ) : null}
                {(importsQuery.data?.items || []).map((batch: any) => (
                  <div key={batch.id} className="flex items-center justify-between border border-gray-800 rounded p-3 text-sm">
                    <div>
                      <div className="font-medium">Batch #{batch.id} • {batch.source}</div>
                      <div className="text-xs text-gray-400">{batch.status} • {asDate(batch.created_at)} • mode={batch.mode}</div>
                      <div className="mt-2 h-2 rounded bg-gray-800 overflow-hidden">
                        <div
                          className={`h-full transition-all ${String(batch.status || "").toLowerCase() === "failed" ? "bg-red-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.max(0, Math.min(100, asNumber(batch.progressPct, 0)))}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-gray-400">
                        {asNumber(batch.processedRows, 0)}/{asNumber(batch.totalRows, 0)} processed • created {asNumber(batch.createdContacts, 0)} • linked {asNumber(batch.linkedExisting, 0)} • errors {asNumber(batch.errorCount, 0)}
                        {batch.runningForSeconds != null ? ` • running ${formatDuration(batch.runningForSeconds)}` : ""}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => rollbackMutation.mutate(Number(batch.id))}
                      disabled={
                        rollbackMutation.isPending ||
                        String(batch.status || "").toLowerCase() === "rolled_back" ||
                        String(batch.status || "").toLowerCase() === "running" ||
                        String(batch.status || "").toLowerCase() === "queued"
                      }
                    >
                      Rollback
                    </Button>
                  </div>
                ))}
                {!(importsQuery.data?.items || []).length ? <div className="text-sm text-gray-400">No import history yet.</div> : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="capture">
            <Card className="bg-gray-900 border-gray-800 mt-4">
              <CardHeader>
                <CardTitle>Business Card Capture</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Image</Label>
                    <Input type="file" accept="image/*" onChange={(event) => setCaptureFile(event.target.files?.[0] || null)} className="bg-gray-950 border-gray-700" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <Input value={captureTags} onChange={(event) => setCaptureTags(event.target.value)} placeholder="business_card,event_2026" className="bg-gray-950 border-gray-700" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={captureSave} onCheckedChange={(checked) => setCaptureSave(Boolean(checked))} />
                  <Label>Save/merge into Contacts immediately</Label>
                </div>
                <Button onClick={() => captureMutation.mutate()} disabled={captureMutation.isPending || !captureFile}>
                  {captureMutation.isPending ? "Extracting..." : "Extract contact(s)"}
                </Button>
                {captureResult ? (
                  <div className="rounded border border-gray-800 bg-gray-950 p-3 text-sm">
                    <div className="text-xs text-gray-400 mb-2">Extraction result</div>
                    <pre className="whitespace-pre-wrap break-all text-xs text-gray-200">{JSON.stringify(captureResult, null, 2)}</pre>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="segments">
            <Card className="bg-gray-900 border-gray-800 mt-4">
              <CardHeader>
                <CardTitle>Segments</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-300 space-y-2">
                <div>Segmenting uses tags + source + consent + status filters.</div>
                <div>Current working set: <Badge>{total}</Badge> contacts.</div>
                <div className="text-xs text-gray-400">Use Contacts filters, then switch to Campaigns to prepare approval-gated outreach.</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campaigns">
            <Card className="bg-gray-900 border-gray-800 mt-4">
              <CardHeader>
                <CardTitle>Campaigns (Approval Gated)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="text-gray-300">Selected audience: <Badge>{selectedCount}</Badge> contacts</div>
                <div className="text-gray-300">Approval rule is enforced: sends are blocked unless a campaign is explicitly approved.</div>
                <Button disabled>Start Outreach (Approval Required)</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function uniqueIds(values: number[]) {
  return Array.from(new Set(values));
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
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm">
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
    <div className="rounded border border-gray-800 bg-gray-950 p-2">
      <div className="text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-100 mt-1">{String(value ?? "—")}</div>
    </div>
  );
}
