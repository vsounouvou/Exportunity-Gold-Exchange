import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Users, Search, Filter, Plus, Edit2, Trash2, 
  UserPlus, Shield, Store, Truck, Target, MessageSquare,
  CheckCircle2, XCircle, Clock, TrendingUp, ChevronRight,
  Mail, Phone, MapPin, Calendar, MoreVertical, Eye
} from "lucide-react";

interface User {
  id: number;
  displayName: string;
  email: string;
  role: string;
  createdAt: string;
  phoneNumber?: string;
}

interface ShopApplication {
  id: number;
  userId: number;
  status: string;
  aiScore?: number;
  aiDecision?: string;
  createdAt: string;
  user?: User;
  applicationData?: Record<string, any>;
}

interface DeliveryApplication {
  id: number;
  userId: number;
  status: string;
  aiScore?: number;
  aiDecision?: string;
  createdAt: string;
  user?: User;
  applicationData?: Record<string, any>;
}

interface Lead {
  id: number;
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  source: string;
  status: string;
  score: number;
  createdAt: string;
}

export default function AdminUserManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userDetailsOpen, setUserDetailsOpen] = useState(false);

  const { data: stats } = useQuery<{
    totalUsers: number;
    shopApplications: number;
    deliveryApplications: number;
    totalLeads: number;
  }>({
    queryKey: ['/api/admin/stats']
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<{
    users: User[];
    pagination: { total: number; page: number; pages: number };
  }>({
    queryKey: ['/api/admin/users']
  });

  const { data: shopAppsData } = useQuery<{
    applications: ShopApplication[];
    pagination: { total: number };
  }>({
    queryKey: ['/api/admin/applications/shop']
  });

  const { data: deliveryAppsData } = useQuery<{
    applications: DeliveryApplication[];
    pagination: { total: number };
  }>({
    queryKey: ['/api/admin/applications/delivery']
  });

  const { data: leadsData } = useQuery<{
    leads: Lead[];
    pagination: { total: number };
  }>({
    queryKey: ['/api/admin/leads']
  });

  const { data: roles } = useQuery<Array<{ id: number; name: string; description: string }>>({
    queryKey: ['/api/admin/roles']
  });

  const { data: plans } = useQuery<Array<{ id: number; name: string; pricePerMonth: string }>>({
    queryKey: ['/api/admin/subscription-plans']
  });

  const approveApplicationMutation = useMutation({
    mutationFn: async ({ type, id, decision }: { type: 'shop' | 'delivery'; id: number; decision: string }) => {
      return await apiRequest(`/api/admin/applications/${type}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: decision === 'approved' ? 'approved' : 'rejected',
          manualDecision: decision,
          decidedAt: new Date().toISOString()
        })
      });
    },
    onSuccess: (_, { type }) => {
      toast({ title: "Application updated", description: "The decision has been recorded." });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/applications/${type}`] });
    }
  });

  const filteredUsers = usersData?.users?.filter(user =>
    user.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'submitted':
      case 'under_review': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'in_progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getLeadStatusColor = (status: string) => {
    switch (status) {
      case 'converted': return 'bg-green-500/20 text-green-400';
      case 'responded': return 'bg-blue-500/20 text-blue-400';
      case 'contacted': return 'bg-yellow-500/20 text-yellow-400';
      case 'disqualified': return 'bg-red-500/20 text-red-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 pb-20">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Users className="h-6 w-6 text-amber-500" />
              User Management
            </h1>
            <p className="text-sm text-gray-400">Manage users, applications, and leads</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-10">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button size="sm" className="h-10 bg-amber-500 hover:bg-amber-600">
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Total Users</p>
                  <p className="text-xl md:text-2xl font-bold text-white">{stats?.totalUsers || 0}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Shop Apps</p>
                  <p className="text-xl md:text-2xl font-bold text-white">{stats?.shopApplications || 0}</p>
                </div>
                <Store className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Delivery Apps</p>
                  <p className="text-xl md:text-2xl font-bold text-white">{stats?.deliveryApplications || 0}</p>
                </div>
                <Truck className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Total Leads</p>
                  <p className="text-xl md:text-2xl font-bold text-white">{stats?.totalLeads || 0}</p>
                </div>
                <Target className="h-8 w-8 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-gray-800 h-11 mb-4">
            <TabsTrigger value="users" className="text-xs sm:text-sm h-10">Users</TabsTrigger>
            <TabsTrigger value="shop" className="text-xs sm:text-sm h-10">Shops</TabsTrigger>
            <TabsTrigger value="delivery" className="text-xs sm:text-sm h-10">Delivery</TabsTrigger>
            <TabsTrigger value="leads" className="text-xs sm:text-sm h-10">Leads</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-gray-800 border-gray-700 text-white h-11"
                />
              </div>
            </div>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-0">
                <ScrollArea className="h-[400px] md:h-[500px]">
                  <div className="divide-y divide-gray-800">
                    {usersLoading ? (
                      <div className="p-8 text-center text-gray-400">Loading users...</div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="p-8 text-center text-gray-400">No users found</div>
                    ) : (
                      filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-4 hover:bg-gray-800/50 cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedUser(user);
                            setUserDetailsOpen(true);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-blue-500/20 text-blue-400">
                                {user.displayName?.charAt(0)?.toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-white">{user.displayName}</p>
                              <p className="text-xs text-gray-400">{user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {user.role}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-gray-500" />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shop" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="p-4">
                <CardTitle className="text-base text-white">Shop Owner Applications</CardTitle>
                <CardDescription>Review and approve shop owner requests</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-gray-800">
                    {shopAppsData?.applications?.length === 0 ? (
                      <div className="p-8 text-center text-gray-400">No applications yet</div>
                    ) : (
                      shopAppsData?.applications?.map((app) => (
                        <div key={app.id} className="p-4 hover:bg-gray-800/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4 text-green-500" />
                              <span className="text-sm font-medium text-white">
                                {app.user?.displayName || `User #${app.userId}`}
                              </span>
                            </div>
                            <Badge className={getStatusColor(app.status)}>
                              {app.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>AI Score: {app.aiScore || 'N/A'}</span>
                            <span>{new Date(app.createdAt).toLocaleDateString()}</span>
                          </div>
                          {app.status === 'submitted' && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                className="h-9 bg-green-600 hover:bg-green-700"
                                onClick={() => approveApplicationMutation.mutate({ type: 'shop', id: app.id, decision: 'approved' })}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 text-red-400 border-red-500/30"
                                onClick={() => approveApplicationMutation.mutate({ type: 'shop', id: app.id, decision: 'rejected' })}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="p-4">
                <CardTitle className="text-base text-white">Delivery Agent Applications</CardTitle>
                <CardDescription>Review delivery agent requests</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-gray-800">
                    {deliveryAppsData?.applications?.length === 0 ? (
                      <div className="p-8 text-center text-gray-400">No applications yet</div>
                    ) : (
                      deliveryAppsData?.applications?.map((app) => (
                        <div key={app.id} className="p-4 hover:bg-gray-800/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Truck className="h-4 w-4 text-purple-500" />
                              <span className="text-sm font-medium text-white">
                                {app.user?.displayName || `User #${app.userId}`}
                              </span>
                            </div>
                            <Badge className={getStatusColor(app.status)}>
                              {app.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>AI Score: {app.aiScore || 'N/A'}</span>
                            <span>{new Date(app.createdAt).toLocaleDateString()}</span>
                          </div>
                          {app.status === 'submitted' && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                className="h-9 bg-green-600 hover:bg-green-700"
                                onClick={() => approveApplicationMutation.mutate({ type: 'delivery', id: app.id, decision: 'approved' })}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 text-red-400 border-red-500/30"
                                onClick={() => approveApplicationMutation.mutate({ type: 'delivery', id: app.id, decision: 'rejected' })}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <Button size="sm" className="h-10 bg-amber-500 hover:bg-amber-600">
                <Plus className="h-4 w-4 mr-2" />
                Add Lead
              </Button>
            </div>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="p-4">
                <CardTitle className="text-base text-white">Lead Pipeline</CardTitle>
                <CardDescription>Manage and track potential clients</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-gray-800">
                    {leadsData?.leads?.length === 0 ? (
                      <div className="p-8 text-center text-gray-400">No leads yet. Start a campaign to generate leads.</div>
                    ) : (
                      leadsData?.leads?.map((lead) => (
                        <div key={lead.id} className="p-4 hover:bg-gray-800/50">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium text-white">{lead.companyName || lead.contactName || 'Unknown'}</p>
                              <p className="text-xs text-gray-400">{lead.contactEmail}</p>
                            </div>
                            <Badge className={getLeadStatusColor(lead.status)}>
                              {lead.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{lead.source}</Badge>
                              <span>Score: {lead.score}</span>
                            </div>
                            <Button size="sm" variant="ghost" className="h-8">
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Sheet open={userDetailsOpen} onOpenChange={setUserDetailsOpen}>
          <SheetContent className="bg-gray-900 border-gray-800 w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="text-white">User Details</SheetTitle>
              <SheetDescription>View and manage user information</SheetDescription>
            </SheetHeader>
            {selectedUser && (
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-blue-500/20 text-blue-400 text-xl">
                      {selectedUser.displayName?.charAt(0)?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-lg font-medium text-white">{selectedUser.displayName}</p>
                    <Badge variant="outline">{selectedUser.role}</Badge>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-300">{selectedUser.email}</span>
                  </div>
                  {selectedUser.phoneNumber && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-300">{selectedUser.phoneNumber}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-300">
                      Joined {new Date(selectedUser.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-400">Assign Role</p>
                  <Select>
                    <SelectTrigger className="bg-gray-800 border-gray-700 h-11">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {roles?.map((role) => (
                        <SelectItem key={role.id} value={String(role.id)}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1 h-11" variant="outline">
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button className="flex-1 h-11 bg-red-600 hover:bg-red-700">
                    <Shield className="h-4 w-4 mr-2" />
                    Suspend
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
