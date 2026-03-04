import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Crown, Plus, Edit2, Trash2, Check, Star, Zap,
  ArrowLeft, Loader2, Store, Truck, Shield
} from "lucide-react";
import { Link } from "wouter";

interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  pricePerMonth: string;
  pricePerYear?: string;
  features: string[];
  entitlements: Record<string, any>;
  isActive: boolean;
  targetRole: string;
  sortOrder: number;
  trialDays: number;
  createdAt: string;
}

const DEFAULT_PLANS: Partial<SubscriptionPlan>[] = [
  {
    name: "Shop Starter",
    description: "Perfect for new shop owners getting started",
    pricePerMonth: "29.00",
    pricePerYear: "290.00",
    features: [
      "List up to 10 products",
      "Basic analytics dashboard",
      "Email support",
      "Standard visibility"
    ],
    entitlements: { maxProducts: 10, analytics: "basic", support: "email" },
    targetRole: "shop_owner",
    trialDays: 14
  },
  {
    name: "Shop Professional",
    description: "For established businesses scaling up",
    pricePerMonth: "79.00",
    pricePerYear: "790.00",
    features: [
      "List up to 100 products",
      "Advanced analytics & reports",
      "Priority support",
      "Featured listings",
      "Custom shop branding"
    ],
    entitlements: { maxProducts: 100, analytics: "advanced", support: "priority", featured: true },
    targetRole: "shop_owner",
    trialDays: 7
  },
  {
    name: "Shop Enterprise",
    description: "For high-volume traders and exporters",
    pricePerMonth: "199.00",
    pricePerYear: "1990.00",
    features: [
      "Unlimited products",
      "Real-time analytics",
      "24/7 dedicated support",
      "Premium placement",
      "API access",
      "Bulk import/export"
    ],
    entitlements: { maxProducts: -1, analytics: "realtime", support: "dedicated", premium: true, api: true },
    targetRole: "shop_owner",
    trialDays: 0
  },
  {
    name: "Delivery Basic",
    description: "Start delivering on the platform",
    pricePerMonth: "0.00",
    features: [
      "Access to delivery assignments",
      "Basic route optimization",
      "Standard commission rate"
    ],
    entitlements: { commissionRate: 0.15, routeOptimization: "basic" },
    targetRole: "delivery_agent",
    trialDays: 0
  },
  {
    name: "Delivery Pro",
    description: "Maximize your delivery earnings",
    pricePerMonth: "49.00",
    features: [
      "Priority assignment access",
      "Advanced route optimization",
      "Reduced commission rate",
      "Earnings analytics",
      "Priority support"
    ],
    entitlements: { commissionRate: 0.10, routeOptimization: "advanced", priorityAccess: true },
    targetRole: "delivery_agent",
    trialDays: 7
  }
];

export default function SubscriptionPlansPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    pricePerMonth: "",
    pricePerYear: "",
    features: "",
    targetRole: "shop_owner",
    trialDays: 0
  });

  const { data: plans, isLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/admin/subscription-plans']
  });

  const createPlanMutation = useMutation({
    mutationFn: async (planData: Partial<SubscriptionPlan>) => {
      return await apiRequest('/api/admin/subscription-plans', {
        method: 'POST',
        body: JSON.stringify(planData)
      });
    },
    onSuccess: () => {
      toast({ title: "Plan created", description: "The subscription plan has been created." });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-plans'] });
      setIsCreating(false);
      resetForm();
    }
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SubscriptionPlan> }) => {
      return await apiRequest(`/api/admin/subscription-plans/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({ title: "Plan updated", description: "The subscription plan has been updated." });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-plans'] });
      setEditingPlan(null);
      resetForm();
    }
  });

  const seedPlansMutation = useMutation({
    mutationFn: async () => {
      for (const plan of DEFAULT_PLANS) {
        await apiRequest('/api/admin/subscription-plans', {
          method: 'POST',
          body: JSON.stringify({
            ...plan,
            isActive: true,
            sortOrder: DEFAULT_PLANS.indexOf(plan)
          })
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Plans seeded", description: "Default subscription plans have been created." });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-plans'] });
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      pricePerMonth: "",
      pricePerYear: "",
      features: "",
      targetRole: "shop_owner",
      trialDays: 0
    });
  };

  const handleSubmit = () => {
    const featuresArray = formData.features.split('\n').filter(f => f.trim());
    
    const planData = {
      name: formData.name,
      description: formData.description,
      pricePerMonth: formData.pricePerMonth,
      pricePerYear: formData.pricePerYear || undefined,
      features: featuresArray,
      targetRole: formData.targetRole,
      trialDays: formData.trialDays,
      isActive: true
    };

    if (editingPlan) {
      updatePlanMutation.mutate({ id: editingPlan.id, data: planData });
    } else {
      createPlanMutation.mutate(planData);
    }
  };

  const openEditDialog = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || "",
      pricePerMonth: plan.pricePerMonth,
      pricePerYear: plan.pricePerYear || "",
      features: (plan.features || []).join('\n'),
      targetRole: plan.targetRole || "shop_owner",
      trialDays: plan.trialDays || 0
    });
  };

  const getPlanIcon = (role: string, index: number) => {
    if (role === 'delivery_agent') return Truck;
    if (index === 2) return Crown;
    if (index === 1) return Star;
    return Store;
  };

  const getPlanColor = (role: string, index: number) => {
    if (role === 'delivery_agent') return 'purple';
    if (index === 2) return 'amber';
    if (index === 1) return 'blue';
    return 'green';
  };

  const shopPlans = plans?.filter(p => p.targetRole === 'shop_owner') || [];
  const deliveryPlans = plans?.filter(p => p.targetRole === 'delivery_agent') || [];

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 pb-20">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Crown className="h-6 w-6 text-amber-500" />
              Subscription Plans
            </h1>
            <p className="text-sm text-gray-400">Manage pricing and features for shop owners and delivery agents</p>
          </div>
          <div className="flex gap-2">
            {(!plans || plans.length === 0) && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-10"
                onClick={() => seedPlansMutation.mutate()}
                disabled={seedPlansMutation.isPending}
              >
                {seedPlansMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Seed Default Plans
              </Button>
            )}
            <Dialog open={isCreating} onOpenChange={setIsCreating}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-10 bg-amber-500 hover:bg-amber-600">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Plan
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-800 max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Subscription Plan</DialogTitle>
                  <DialogDescription>Add a new subscription tier for your platform.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-gray-300">Plan Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                      placeholder="e.g., Professional Plan"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                      placeholder="Brief description of the plan"
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-300">Monthly Price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.pricePerMonth}
                        onChange={(e) => setFormData({ ...formData, pricePerMonth: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white mt-1"
                        placeholder="29.00"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300">Yearly Price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.pricePerYear}
                        onChange={(e) => setFormData({ ...formData, pricePerYear: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white mt-1"
                        placeholder="290.00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-300">Target Role</Label>
                      <select
                        value={formData.targetRole}
                        onChange={(e) => setFormData({ ...formData, targetRole: e.target.value })}
                        className="w-full bg-gray-800 border-gray-700 text-white rounded-md h-10 px-3 mt-1"
                      >
                        <option value="shop_owner">Shop Owner</option>
                        <option value="delivery_agent">Delivery Agent</option>
                        <option value="buyer">Buyer</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-gray-300">Trial Days</Label>
                      <Input
                        type="number"
                        value={formData.trialDays}
                        onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 0 })}
                        className="bg-gray-800 border-gray-700 text-white mt-1"
                        placeholder="14"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-300">Features (one per line)</Label>
                    <Textarea
                      value={formData.features}
                      onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                      placeholder="List up to 100 products&#10;Priority support&#10;Advanced analytics"
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button 
                    onClick={handleSubmit}
                    disabled={createPlanMutation.isPending}
                    className="bg-amber-500 hover:bg-amber-600"
                  >
                    {createPlanMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : "Create Plan"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : (
          <div className="space-y-8">
            {shopPlans.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Store className="h-5 w-5 text-green-500" />
                  Shop Owner Plans
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                  {shopPlans.map((plan, idx) => {
                    const Icon = getPlanIcon(plan.targetRole, idx);
                    const color = getPlanColor(plan.targetRole, idx);
                    return (
                      <Card 
                        key={plan.id} 
                        className={`bg-gray-900 border-gray-800 relative overflow-hidden ${
                          idx === 1 ? 'border-blue-500/50 ring-1 ring-blue-500/30' : ''
                        }`}
                      >
                        {idx === 1 && (
                          <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs px-2 py-1 rounded-bl">
                            Popular
                          </div>
                        )}
                        <CardHeader className="pb-2">
                          <div className={`h-10 w-10 rounded-lg bg-${color}-500/20 flex items-center justify-center mb-2`}>
                            <Icon className={`h-5 w-5 text-${color}-400`} />
                          </div>
                          <CardTitle className="text-white text-lg">{plan.name}</CardTitle>
                          <CardDescription className="text-sm">{plan.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="mb-4">
                            <span className="text-3xl font-bold text-white">${plan.pricePerMonth}</span>
                            <span className="text-gray-400">/month</span>
                            {plan.trialDays > 0 && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {plan.trialDays} day trial
                              </Badge>
                            )}
                          </div>
                          <ul className="space-y-2">
                            {(plan.features || []).map((feature, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                                <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                        <CardFooter className="pt-0">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full h-9"
                            onClick={() => openEditDialog(plan)}
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit Plan
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {deliveryPlans.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-purple-500" />
                  Delivery Agent Plans
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {deliveryPlans.map((plan, idx) => (
                    <Card key={plan.id} className="bg-gray-900 border-gray-800">
                      <CardHeader className="pb-2">
                        <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center mb-2">
                          <Truck className="h-5 w-5 text-purple-400" />
                        </div>
                        <CardTitle className="text-white text-lg">{plan.name}</CardTitle>
                        <CardDescription className="text-sm">{plan.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4">
                          {parseFloat(plan.pricePerMonth) === 0 ? (
                            <span className="text-3xl font-bold text-white">Free</span>
                          ) : (
                            <>
                              <span className="text-3xl font-bold text-white">${plan.pricePerMonth}</span>
                              <span className="text-gray-400">/month</span>
                            </>
                          )}
                          {plan.trialDays > 0 && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {plan.trialDays} day trial
                            </Badge>
                          )}
                        </div>
                        <ul className="space-y-2">
                          {(plan.features || []).map((feature, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                              <Check className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full h-9"
                          onClick={() => openEditDialog(plan)}
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit Plan
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {(!plans || plans.length === 0) && (
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="p-8 text-center">
                  <Crown className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No Subscription Plans</h3>
                  <p className="text-gray-400 mb-4">Get started by seeding the default plans or creating your own.</p>
                  <div className="flex gap-2 justify-center">
                    <Button 
                      variant="outline"
                      onClick={() => seedPlansMutation.mutate()}
                      disabled={seedPlansMutation.isPending}
                    >
                      {seedPlansMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Zap className="h-4 w-4 mr-2" />
                      )}
                      Seed Default Plans
                    </Button>
                    <Button className="bg-amber-500 hover:bg-amber-600" onClick={() => setIsCreating(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Plan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
          <DialogContent className="bg-gray-900 border-gray-800 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white">Edit Subscription Plan</DialogTitle>
              <DialogDescription>Modify the plan details and features.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-gray-300">Plan Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-gray-300">Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300">Monthly Price ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.pricePerMonth}
                    onChange={(e) => setFormData({ ...formData, pricePerMonth: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-300">Trial Days</Label>
                  <Input
                    type="number"
                    value={formData.trialDays}
                    onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 0 })}
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-gray-300">Features (one per line)</Label>
                <Textarea
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPlan(null)}>Cancel</Button>
              <Button 
                onClick={handleSubmit}
                disabled={updatePlanMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {updatePlanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
