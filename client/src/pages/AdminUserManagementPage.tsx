import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, KeyRound, Mail, Network, Phone, Search, ShieldCheck, UserRound, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type TenantUser = {
  id: number;
  displayName: string;
  email: string;
  phone: string | null;
  roles: string[];
  currentMode: string | null;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

type UserDraft = {
  displayName: string;
  email: string;
  phone: string;
  roles: string[];
  isActive: boolean;
};

function draftFromUser(user: TenantUser): UserDraft {
  return {
    displayName: user.displayName || "",
    email: user.email || "",
    phone: user.phone || "",
    roles: Array.isArray(user.roles) && user.roles.length ? user.roles : [user.currentMode || "user"],
    isActive: user.isActive !== false,
  };
}

function isApprovalRole(role: string) {
  return ["admin", "super_admin", "platform_admin", "chairman", "owner"].includes(role.toLowerCase());
}

export default function AdminUserManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [setupLink, setSetupLink] = useState("");

  const usersQuery = useQuery<{
    users: TenantUser[];
    pagination: { total: number; page: number; pages: number };
  }>({
    queryKey: ["/api/admin/users?limit=200"],
  });

  const rolesQuery = useQuery<Array<{ id: number; name: string; description?: string }>>({
    queryKey: ["/api/admin/roles"],
  });

  const users = usersQuery.data?.users || [];
  const roleOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...(rolesQuery.data || []).map((role) => role.name),
          ...users.flatMap((user) => (Array.isArray(user.roles) ? user.roles : [])),
        ]),
      )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [rolesQuery.data, users],
  );

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.displayName, user.email, user.phone || "", ...(user.roles || [])]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [searchQuery, users]);

  useEffect(() => {
    if (!selectedUser) {
      setDraft(null);
      setSetupLink("");
      return;
    }
    setDraft(draftFromUser(selectedUser));
    setSetupLink("");
  }, [selectedUser]);

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, payload }: { userId: number; payload: UserDraft }) =>
      apiRequest(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: payload.displayName.trim(),
          email: payload.email.trim(),
          phone: payload.phone.trim() || null,
          roles: payload.roles,
          isActive: payload.isActive,
        }),
      }),
    onSuccess: async (updated: TenantUser) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users?limit=200"] });
      setSelectedUser(updated);
      toast({ title: "Access updated", description: `${updated.displayName}'s identity and roles are saved.` });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message || "The user could not be updated.",
        variant: "destructive",
      });
    },
  });

  const setupLinkMutation = useMutation({
    mutationFn: async (userId: number) =>
      apiRequest(`/api/admin/users/${userId}/regenerate-setup-link`, { method: "POST" }),
    onSuccess: (result: { setupLink: string }) => {
      setSetupLink(result.setupLink || "");
      toast({ title: "Secure setup link created", description: "The link expires in 24 hours." });
    },
    onError: (error: any) => {
      toast({
        title: "Link creation failed",
        description: error?.message || "A setup link could not be created.",
        variant: "destructive",
      });
    },
  });

  const activeCount = users.filter((user) => user.isActive).length;
  const approvalOwners = users.filter((user) => (user.roles || []).some(isApprovalRole)).length;
  const verifiedCount = users.filter((user) => user.emailVerified).length;
  const overviewCards: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: "Tenant users", value: usersQuery.data?.pagination.total || users.length, icon: Users },
    { label: "Active access", value: activeCount, icon: CheckCircle2 },
    { label: "Approval owners", value: approvalOwners, icon: ShieldCheck },
    { label: "Verified email", value: verifiedCount, icon: Mail },
  ];

  const toggleRole = (role: string, enabled: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const nextRoles = enabled
        ? Array.from(new Set([...current.roles, role]))
        : current.roles.filter((item) => item !== role);
      return { ...current, roles: nextRoles };
    });
  };

  return (
    <div className="exportunity-operations-light min-h-full bg-[#f7f8fa] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
              <ShieldCheck className="h-4 w-4" /> Human oversight
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">People & access</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Manage the real people who can approve decisions, supervise agents, and operate Exportunity.
            </p>
          </div>
          <Button asChild variant="outline" className="border-slate-300 bg-white text-slate-800">
            <Link href="/agents">
              <Network className="mr-2 h-4 w-4" /> View organization
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {overviewCards.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="border-slate-200 bg-white shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
                </div>
                <Icon className="h-6 w-6 text-amber-600" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base text-slate-950">Authorized people</CardTitle>
                <p className="mt-1 text-sm text-slate-500">Only users assigned to this tenant are shown.</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search people or roles"
                  className="border-slate-300 bg-white pl-9 text-slate-950 placeholder:text-slate-400"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[min(560px,65vh)]">
              {usersQuery.isLoading ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading authorized people...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No authorized people match this search.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-amber-50/60"
                      onClick={() => setSelectedUser(user)}
                    >
                      <Avatar className="h-10 w-10 border border-slate-200">
                        <AvatarFallback className="bg-slate-100 font-semibold text-slate-700">
                          {(user.displayName || user.email).slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-950">{user.displayName}</span>
                          <Badge className={user.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                            {user.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                      <div className="hidden max-w-[45%] flex-wrap justify-end gap-1 sm:flex">
                        {(user.roles || []).slice(0, 3).map((role) => (
                          <Badge key={role} variant="outline" className="border-slate-300 bg-white text-slate-600">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Sheet open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="w-full overflow-y-auto border-slate-200 bg-white text-slate-950 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-slate-950">Edit person & access</SheetTitle>
            <SheetDescription className="text-slate-500">
              Identity, status, roles, and secure account setup for this tenant.
            </SheetDescription>
          </SheetHeader>

          {selectedUser && draft ? (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <Avatar className="h-12 w-12 border border-slate-200">
                  <AvatarFallback className="bg-white font-semibold text-slate-700">
                    {(draft.displayName || draft.email).slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{draft.displayName || "Unnamed user"}</p>
                  <p className="truncate text-sm text-slate-500">{draft.email}</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="person-name" className="text-slate-700">Name</Label>
                  <Input
                    id="person-name"
                    value={draft.displayName}
                    onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                    className="border-slate-300 bg-white text-slate-950"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="person-email" className="text-slate-700">Professional email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="person-email"
                      type="email"
                      value={draft.email}
                      onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                      className="border-slate-300 bg-white pl-9 text-slate-950"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="person-phone" className="text-slate-700">Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="person-phone"
                      value={draft.phone}
                      onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                      className="border-slate-300 bg-white pl-9 text-slate-950"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Roles</p>
                  <p className="text-xs text-slate-500">Roles determine what this person can see and approve.</p>
                </div>
                <div className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
                  {roleOptions.map((role) => {
                    const checked = draft.roles.includes(role);
                    return (
                      <label key={role} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-50">
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleRole(role, value === true)} />
                        <span className="text-sm text-slate-700">{role}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-md border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Account active</p>
                  <p className="text-xs text-slate-500">Inactive users cannot sign in.</p>
                </div>
                <Checkbox checked={draft.isActive} onCheckedChange={(value) => setDraft({ ...draft, isActive: value === true })} />
              </label>

              <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-amber-700" />
                  <p className="text-sm font-semibold text-slate-950">Secure account setup</p>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  Generate a one-time setup link after confirming the recipient. The link expires in 24 hours.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-300 bg-white text-slate-800"
                  disabled={!draft.isActive || setupLinkMutation.isPending}
                  onClick={() => setupLinkMutation.mutate(selectedUser.id)}
                >
                  <KeyRound className="mr-2 h-4 w-4" /> Generate setup link
                </Button>
                {setupLink ? (
                  <div className="space-y-2">
                    <Input readOnly value={setupLink} className="border-slate-300 bg-white text-xs text-slate-700" />
                    <Button
                      type="button"
                      size="sm"
                      className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                      onClick={async () => {
                        await navigator.clipboard.writeText(setupLink);
                        toast({ title: "Setup link copied" });
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy link
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <Button variant="outline" className="border-slate-300 bg-white text-slate-800" onClick={() => setSelectedUser(null)}>
                  Cancel
                </Button>
                <Button
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                  disabled={
                    updateUserMutation.isPending ||
                    !draft.displayName.trim() ||
                    !draft.email.includes("@") ||
                    draft.roles.length === 0
                  }
                  onClick={() => updateUserMutation.mutate({ userId: selectedUser.id, payload: draft })}
                >
                  <UserRound className="mr-2 h-4 w-4" /> Save access
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
