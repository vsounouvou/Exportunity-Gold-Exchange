import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Store, 
  Search, 
  MapPin, 
  Phone, 
  Mail, 
  Star, 
  Package,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Plus,
  Loader2
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface Seller {
  id: number;
  userId: number;
  shopName: string;
  slug: string;
  description: string | null;
  phoneNumber: string | null;
  email: string | null;
  productionType: string | null;
  status: string;
  isProducer: boolean;
  isDemo: boolean;
  walletBalance: string;
  totalSales: string;
  rating: string;
  reviewCount: number;
  createdAt: string;
  approvedAt: string | null;
}

interface SellerStats {
  sellers: { total: number; approved: number; pending: number };
  products: { total: number; active: number };
  orders: { total: number; completed: number };
  revenue: { total: number };
}

export default function SellerListPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: sellers = [], isLoading: sellersLoading } = useQuery<Seller[]>({
    queryKey: ['/api/marketplace/sellers'],
  });

  const { data: stats } = useQuery<SellerStats>({
    queryKey: ['/api/marketplace/admin/stats'],
  });

  const approveMutation = useMutation({
    mutationFn: async (sellerId: number) => {
      return apiRequest(`/api/marketplace/sellers/${sellerId}/approve`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sellers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/stats'] });
      toast({ title: "Seller approved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to approve seller", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (sellerId: number) => {
      return apiRequest(`/api/marketplace/sellers/${sellerId}/reject`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sellers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/stats'] });
      toast({ title: "Seller rejected" });
    },
    onError: () => {
      toast({ title: "Failed to reject seller", variant: "destructive" });
    },
  });

  const filteredSellers = sellers.filter(seller => {
    const matchesSearch = seller.shopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      seller.productionType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      seller.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || seller.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      case 'suspended':
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Suspended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (sellersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace Sellers</h1>
          <p className="text-gray-400">Manage producer accounts and shop approvals</p>
        </div>
        <Link href="/seller-dashboard">
          <Button className="bg-amber-500 hover:bg-amber-600 text-black">
            <Plus className="h-4 w-4 mr-2" />
            Create Seller Account
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Store className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats?.sellers.total || sellers.length}</p>
                <p className="text-xs text-gray-400">Total Sellers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats?.sellers.approved || sellers.filter(s => s.status === 'approved').length}</p>
                <p className="text-xs text-gray-400">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats?.sellers.pending || sellers.filter(s => s.status === 'pending').length}</p>
                <p className="text-xs text-gray-400">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Package className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats?.products.total || 0}</p>
                <p className="text-xs text-gray-400">Total Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search sellers by name, type, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full md:w-auto">
              <TabsList className="bg-gray-800">
                <TabsTrigger value="all" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">All</TabsTrigger>
                <TabsTrigger value="approved" className="data-[state=active]:bg-green-500 data-[state=active]:text-black">Approved</TabsTrigger>
                <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black">Pending</TabsTrigger>
                <TabsTrigger value="rejected" className="data-[state=active]:bg-red-500 data-[state=active]:text-black">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {filteredSellers.length === 0 ? (
            <div className="text-center py-12">
              <Store className="h-12 w-12 mx-auto text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-gray-400">No sellers found</h3>
              <p className="text-gray-500 text-sm mt-1">
                {searchTerm || statusFilter !== "all" 
                  ? "Try adjusting your search or filter" 
                  : "No sellers have registered yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSellers.map((seller) => (
                <div
                  key={seller.id}
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-gray-800/50 border border-gray-700 gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-amber-500/20 rounded-lg">
                      <Store className="h-6 w-6 text-amber-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{seller.shopName}</h3>
                        {getStatusBadge(seller.status)}
                        {seller.isDemo && (
                          <Badge variant="outline" className="text-purple-400 border-purple-400/30">Demo</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">{seller.productionType || 'Producer'}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        {seller.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {seller.email}
                          </span>
                        )}
                        {seller.phoneNumber && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {seller.phoneNumber}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-400" /> 
                          {seller.rating || '0'} ({seller.reviewCount || 0} reviews)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right mr-4">
                      <p className="text-sm text-gray-400">Total Sales</p>
                      <p className="font-semibold text-white">XOF {Number(seller.totalSales || 0).toLocaleString()}</p>
                    </div>

                    {seller.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-500/30 text-green-400 hover:bg-green-500/20"
                          onClick={() => approveMutation.mutate(seller.id)}
                          disabled={approveMutation.isPending}
                        >
                          <ThumbsUp className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                          onClick={() => rejectMutation.mutate(seller.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <ThumbsDown className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}

                    <Link href={`/marketplace/sellers/${seller.id}`}>
                      <Button size="sm" variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
