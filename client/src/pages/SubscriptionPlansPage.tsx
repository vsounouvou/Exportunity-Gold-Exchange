import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Crown, Plus, Edit2, Check, Star,
  Loader2, Store, Truck
} from "lucide-react";

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

function isZeroPrice(value: string) {
  return /^[-+]?0+(?:\.0+)?$/.test(value.trim());
}

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

  const getPlanIcon = (plan: SubscriptionPlan) => {
    if (plan.targetRole === 'delivery_agent') return Truck;
    if (plan.entitlements?.premium === true) return Crown;
    if (plan.entitlements?.featured === true) return Star;
    return Store;
  };

  const shopPlans = plans?.filter(p => p.targetRole === 'shop_owner') || [];
  const deliveryPlans = plans?.filter(p => p.targetRole === 'delivery_agent') || [];

  return (
    <div
      data-testid="exportunity-subscription-plans-workspace"
      className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] p-4 pb-20 text-[#07111F] md:p-6"
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN commercial governance</p>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-slate-950 md:text-2xl">
              <Crown className="h-6 w-6 text-[#F5A623]" />
              Subscription plan registry
            </h1>
            <p className="text-sm text-slate-500">Manage stored pricing, entitlements, and eligibility for shop owners and delivery agents</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isCreating} onOpenChange={setIsCreating}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-10 bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Plan
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg border-slate-200 bg-white text-slate-950">
                <DialogHeader>
                  <DialogTitle className="text-slate-950">Create subscription plan</DialogTitle>
                  <DialogDescription>Add a new subscription tier for your platform.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-700">Plan name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="mt-1 border-slate-200 bg-white text-slate-950"
                      placeholder="e.g., Professional Plan"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-700">Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="mt-1 border-slate-200 bg-white text-slate-950"
                      placeholder="Brief description of the plan"
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-700">Monthly price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.pricePerMonth}
                        onChange={(e) => setFormData({ ...formData, pricePerMonth: e.target.value })}
                        className="mt-1 border-slate-200 bg-white text-slate-950"
                        placeholder="29.00"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700">Yearly price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.pricePerYear}
                        onChange={(e) => setFormData({ ...formData, pricePerYear: e.target.value })}
                        className="mt-1 border-slate-200 bg-white text-slate-950"
                        placeholder="290.00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-700">Target role</Label>
                      <select
                        value={formData.targetRole}
                        onChange={(e) => setFormData({ ...formData, targetRole: e.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-950"
                      >
                        <option value="shop_owner">Shop Owner</option>
                        <option value="delivery_agent">Delivery Agent</option>
                        <option value="buyer">Buyer</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-slate-700">Trial days</Label>
                      <Input
                        type="number"
                        value={formData.trialDays}
                        onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 0 })}
                        className="mt-1 border-slate-200 bg-white text-slate-950"
                        placeholder="14"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-700">Features (one per line)</Label>
                    <Textarea
                      value={formData.features}
                      onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                      className="mt-1 border-slate-200 bg-white text-slate-950"
                      placeholder="List up to 100 products&#10;Priority support&#10;Advanced analytics"
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button 
                    onClick={handleSubmit}
                    disabled={createPlanMutation.isPending}
                    className="bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]"
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
            <Loader2 className="h-8 w-8 animate-spin text-[#F5A623]" />
          </div>
        ) : (
          <div className="space-y-8">
            {shopPlans.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-950">
                  <Store className="h-5 w-5 text-[#8A5700]" />
                  Shop owner plans
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                  {shopPlans.map((plan) => {
                    const Icon = getPlanIcon(plan);
                    const planLabel = plan.entitlements?.premium === true
                      ? "Premium"
                      : plan.entitlements?.featured === true
                        ? "Featured"
                        : null;
                    return (
                      <Card 
                        key={plan.id} 
                        className="relative overflow-hidden border-slate-200 bg-white text-slate-950 shadow-sm"
                      >
                        {planLabel && (
                          <div className="absolute right-0 top-0 rounded-bl bg-[#07111F] px-2 py-1 text-xs font-bold text-white">
                            {planLabel}
                          </div>
                        )}
                        <CardHeader className="pb-2">
                          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF0C7]">
                            <Icon className="h-5 w-5 text-[#8A5700]" />
                          </div>
                          <CardTitle className="text-lg text-slate-950">{plan.name}</CardTitle>
                          <CardDescription className="text-sm text-slate-500">{plan.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="mb-4">
                            <span className="text-3xl font-black text-slate-950">{plan.pricePerMonth}</span>
                            <span className="text-slate-500"> / month</span>
                            {plan.trialDays > 0 && (
                              <Badge variant="outline" className="ml-2 border-slate-200 bg-white text-xs text-slate-700 hover:bg-white">
                                {plan.trialDays} day trial
                              </Badge>
                            )}
                          </div>
                          <ul className="space-y-2">
                            {(plan.features || []).map((feature, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                        <CardFooter className="pt-0">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-9 w-full border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
                            onClick={() => openEditDialog(plan)}
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit plan
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
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-950">
                  <Truck className="h-5 w-5 text-[#8A5700]" />
                  Delivery agent plans
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {deliveryPlans.map((plan) => (
                    <Card key={plan.id} className="border-slate-200 bg-white text-slate-950 shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF0C7]">
                          <Truck className="h-5 w-5 text-[#8A5700]" />
                        </div>
                        <CardTitle className="text-lg text-slate-950">{plan.name}</CardTitle>
                        <CardDescription className="text-sm text-slate-500">{plan.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4">
                          {isZeroPrice(plan.pricePerMonth) ? (
                            <span className="text-3xl font-black text-slate-950">Free</span>
                          ) : (
                            <>
                              <span className="text-3xl font-black text-slate-950">{plan.pricePerMonth}</span>
                              <span className="text-slate-500"> / month</span>
                            </>
                          )}
                          {plan.trialDays > 0 && (
                            <Badge variant="outline" className="ml-2 border-slate-200 bg-white text-xs text-slate-700 hover:bg-white">
                              {plan.trialDays} day trial
                            </Badge>
                          )}
                        </div>
                        <ul className="space-y-2">
                          {(plan.features || []).map((feature, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-9 w-full border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
                          onClick={() => openEditDialog(plan)}
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit plan
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {(!plans || plans.length === 0) && (
              <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
                <CardContent className="p-8 text-center">
                  <Crown className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                  <h3 className="mb-2 text-lg font-bold text-slate-950">No subscription plans</h3>
                  <p className="mb-4 text-slate-500">Create the first governed plan when its pricing and entitlements are approved.</p>
                  <div className="flex justify-center">
                    <Button className="bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]" onClick={() => setIsCreating(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create plan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
          <DialogContent className="max-w-lg border-slate-200 bg-white text-slate-950">
            <DialogHeader>
              <DialogTitle className="text-slate-950">Edit subscription plan</DialogTitle>
              <DialogDescription>Modify the plan details and features.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-700">Plan name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 border-slate-200 bg-white text-slate-950"
                />
              </div>
              <div>
                <Label className="text-slate-700">Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 border-slate-200 bg-white text-slate-950"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-700">Monthly price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.pricePerMonth}
                    onChange={(e) => setFormData({ ...formData, pricePerMonth: e.target.value })}
                    className="mt-1 border-slate-200 bg-white text-slate-950"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">Yearly price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.pricePerYear}
                    onChange={(e) => setFormData({ ...formData, pricePerYear: e.target.value })}
                    className="mt-1 border-slate-200 bg-white text-slate-950"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-700">Target role</Label>
                  <select
                    value={formData.targetRole}
                    onChange={(e) => setFormData({ ...formData, targetRole: e.target.value })}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-950"
                  >
                    <option value="shop_owner">Shop Owner</option>
                    <option value="delivery_agent">Delivery Agent</option>
                  </select>
                </div>
                <div>
                  <Label className="text-slate-700">Trial days</Label>
                  <Input
                    type="number"
                    value={formData.trialDays}
                    onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 0 })}
                    className="mt-1 border-slate-200 bg-white text-slate-950"
                  />
                </div>
              </div>
              <div>
                <Label className="text-slate-700">Features (one per line)</Label>
                <Textarea
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  className="mt-1 border-slate-200 bg-white text-slate-950"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => setEditingPlan(null)}>Cancel</Button>
              <Button 
                onClick={handleSubmit}
                disabled={updatePlanMutation.isPending}
                className="bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]"
              >
                {updatePlanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
