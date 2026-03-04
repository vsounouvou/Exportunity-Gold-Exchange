import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, FileText, Target, Settings, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveApiUrl } from "@/lib/runtimeConfig";

const formSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  description: z.string().optional(),
  logo: z.string().optional(),
  country: z.string().default("US"),
  legalType: z.enum(["LLC", "FZ-LLC", "SA", "SARL", "FZE", "Inc", "Corp", "LTD", "Other"]).default("LLC"),
  registrationNumber: z.string().optional(),
  registrationDate: z.string().optional(),
  primarySector: z.enum(["trade_export", "gold_metals", "education", "logistics", "construction", "architecture", "technology", "retail", "media", "agriculture", "real_estate", "other"]).default("technology"),
  secondarySector: z.enum(["trade_export", "gold_metals", "education", "logistics", "construction", "architecture", "technology", "retail", "media", "agriculture", "real_estate", "other"]).optional(),
  industryTags: z.array(z.string()).default([]),
  vision: z.string().optional(),
  currentGoals: z.array(z.string()).default([]),
  dailyCashBurnTarget: z.coerce.number().min(0).default(50),
  tokenUsageLimit: z.coerce.number().min(0).default(1000000),
  autonomyLevel: z.enum(["low", "medium", "high", "full"]).default("medium"),
  riskAppetite: z.enum(["conservative", "moderate", "bold"]).default("moderate"),
  creativity: z.enum(["low", "medium", "high"]).default("medium"),
  strictness: z.enum(["relaxed", "balanced", "strict"]).default("balanced"),
  themeColor: z.string().default("#3B82F6"),
});

type FormValues = z.infer<typeof formSchema>;

const SECTORS = [
  { value: "trade_export", label: "Trade & Export" },
  { value: "gold_metals", label: "Gold & Metals" },
  { value: "education", label: "Education" },
  { value: "logistics", label: "Logistics" },
  { value: "construction", label: "Construction" },
  { value: "architecture", label: "Architecture" },
  { value: "technology", label: "Technology" },
  { value: "retail", label: "Retail" },
  { value: "media", label: "Media" },
  { value: "agriculture", label: "Agriculture" },
  { value: "real_estate", label: "Real Estate" },
  { value: "other", label: "Other" }
];

const COUNTRIES = [
  "US", "UK", "CA", "DE", "FR", "JP", "CN", "IN", "AU", "SG", "AE", "SA"
];

const LEGAL_TYPES = [
  "LLC", "FZ-LLC", "SA", "SARL", "FZE", "Inc", "Corp", "LTD", "Other"
];

interface CreateCompanyDialogEnhancedProps {
  trigger?: React.ReactNode;
}

export function CreateCompanyDialogEnhanced({ trigger }: CreateCompanyDialogEnhancedProps) {
  const [open, setOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("basic");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      logo: "",
      country: "US",
      legalType: "LLC",
      registrationNumber: "",
      registrationDate: "",
      primarySector: "technology",
      secondarySector: undefined,
      industryTags: [],
      vision: "",
      currentGoals: [],
      dailyCashBurnTarget: 50,
      tokenUsageLimit: 1000000,
      autonomyLevel: "medium",
      riskAppetite: "moderate",
      creativity: "medium",
      strictness: "balanced",
      themeColor: "#3B82F6",
    },
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const response = await fetch(resolveApiUrl("/api/companies"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create company");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({
        title: "Success",
        description: "Company created successfully with all settings configured",
      });
      form.reset();
      setOpen(false);
      setCurrentTab("basic");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create company",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    createCompanyMutation.mutate(data);
  };

  const tabs = [
    { value: "basic", label: "Basic Info", icon: Building2 },
    { value: "legal", label: "Legal", icon: FileText },
    { value: "vision", label: "Vision & Goals", icon: Target },
    { value: "ai", label: "AI Settings", icon: Settings },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create Company
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] bg-gray-900 border-gray-800 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-2xl">Create New Company</DialogTitle>
          <DialogDescription className="text-gray-400">
            Set up your company with comprehensive business and AI settings
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-gray-800">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger 
                      key={tab.value} 
                      value={tab.value}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">Company Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Acme Corporation"
                          {...field}
                          className="bg-gray-800 border-gray-700 text-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description of your company's mission and activities"
                          {...field}
                          className="bg-gray-800 border-gray-700 text-white resize-none"
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="primarySector"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Primary Sector</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SECTORS.map(sector => (
                              <SelectItem key={sector.value} value={sector.value}>
                                {sector.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="secondarySector"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Secondary Sector</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue placeholder="Optional" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SECTORS.map(sector => (
                              <SelectItem key={sector.value} value={sector.value}>
                                {sector.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="themeColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">Theme Color</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="color"
                            {...field}
                            className="bg-gray-800 border-gray-700 h-10 w-20"
                          />
                        </FormControl>
                        <span className="text-gray-400 text-sm">{field.value}</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              {/* Legal Info Tab */}
              <TabsContent value="legal" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Country</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COUNTRIES.map(country => (
                              <SelectItem key={country} value={country}>{country}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="legalType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Legal Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {LEGAL_TYPES.map(type => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="registrationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Registration Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Optional"
                            {...field}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          Business registration ID
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="registrationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Registration Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* Vision & Goals Tab */}
              <TabsContent value="vision" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="vision"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">Vision Statement</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Your company's long-term vision and aspirations"
                          {...field}
                          className="bg-gray-800 border-gray-700 text-white resize-none"
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500">
                        Define your company's purpose and future direction
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dailyCashBurnTarget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Daily Cash Burn Target ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="50"
                            {...field}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          Target daily operating costs
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tokenUsageLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Token Usage Limit</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="1000000"
                            {...field}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          Monthly AI token budget
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* AI Settings Tab */}
              <TabsContent value="ai" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="autonomyLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Autonomy Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low - Requires approval</SelectItem>
                            <SelectItem value="medium">Medium - Balanced control</SelectItem>
                            <SelectItem value="high">High - Maximum freedom</SelectItem>
                            <SelectItem value="full">Full - Complete autonomy</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs text-gray-500">
                          How much freedom agents have
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="riskAppetite"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Risk Appetite</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="conservative">Conservative</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="bold">Bold</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs text-gray-500">
                          Willingness to take risks
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="creativity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Creativity Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low - Stick to proven methods</SelectItem>
                            <SelectItem value="medium">Medium - Balanced approach</SelectItem>
                            <SelectItem value="high">High - Innovative thinking</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs text-gray-500">
                          How creative agents should be
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="strictness"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Strictness</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="relaxed">Relaxed</SelectItem>
                            <SelectItem value="balanced">Balanced</SelectItem>
                            <SelectItem value="strict">Strict</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs text-gray-500">
                          How strictly to follow rules
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-between items-center pt-4 border-t border-gray-800">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <CheckCircle2 className="h-4 w-4" />
                {currentTab === "basic" && "Fill in basic company information"}
                {currentTab === "legal" && "Add legal details (optional)"}
                {currentTab === "vision" && "Define vision and budgets"}
                {currentTab === "ai" && "Configure AI agent behavior"}
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={createCompanyMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createCompanyMutation.isPending}
                  className="gap-2"
                >
                  <Building2 className="h-4 w-4" />
                  {createCompanyMutation.isPending ? "Creating..." : "Create Company"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
