import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const kpiSchema = z.object({
  kpiName: z.string().min(1, "KPI name is required"),
  kpiValue: z.string().min(1, "Current value is required"),
  target: z.string().optional(),
  period: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
  category: z.enum([
    "revenue",
    "leads",
    "deals",
    "meetings",
    "actions",
    "autonomous_tasks",
    "ai_cost",
    "efficiency",
    "other",
  ]),
});

type KPIFormValues = z.infer<typeof kpiSchema>;

interface AddKPIDialogProps {
  companyId: number;
  existingKPI?: any;
  trigger?: React.ReactNode;
}

export function AddKPIDialog({ companyId, existingKPI, trigger }: AddKPIDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<KPIFormValues>({
    resolver: zodResolver(kpiSchema),
    defaultValues: existingKPI
      ? {
          kpiName: existingKPI.kpiName || "",
          kpiValue: existingKPI.kpiValue?.toString() || "",
          target: existingKPI.target?.toString() || "",
          period: existingKPI.period || "monthly",
          category: existingKPI.category || "other",
        }
      : {
          kpiName: "",
          kpiValue: "",
          target: "",
          period: "monthly",
          category: "other",
        },
  });

  const mutation = useMutation({
    mutationFn: async (data: KPIFormValues) => {
      const payload = {
        kpiName: data.kpiName,
        kpiValue: parseFloat(data.kpiValue),
        target: data.target ? parseFloat(data.target) : null,
        period: data.period,
        category: data.category,
      };

      if (existingKPI) {
        return apiRequest(`/api/companies/${companyId}/kpis/${existingKPI.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        return apiRequest(`/api/companies/${companyId}/kpis`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId] });
      toast({
        title: "Success",
        description: existingKPI ? "KPI updated successfully" : "KPI added successfully",
      });
      setOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save KPI",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: KPIFormValues) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline" size="sm">{existingKPI ? "Edit KPI" : "Add KPI"}</Button>}
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle>{existingKPI ? "Edit KPI" : "Add New KPI"}</DialogTitle>
          <DialogDescription>
            {existingKPI
              ? "Update the key performance indicator details"
              : "Add a new key performance indicator to track"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="kpiName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>KPI Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Monthly Revenue, New Leads, Customer Satisfaction"
                      {...field}
                      className="bg-gray-800 border-gray-700"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-gray-800 border-gray-700">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="revenue">Revenue</SelectItem>
                        <SelectItem value="leads">Leads</SelectItem>
                        <SelectItem value="deals">Deals</SelectItem>
                        <SelectItem value="meetings">Meetings</SelectItem>
                        <SelectItem value="actions">Actions</SelectItem>
                        <SelectItem value="autonomous_tasks">Autonomous Tasks</SelectItem>
                        <SelectItem value="ai_cost">AI Cost</SelectItem>
                        <SelectItem value="efficiency">Efficiency</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-gray-800 border-gray-700">
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
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
                name="kpiValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Value</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        {...field}
                        className="bg-gray-800 border-gray-700"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        {...field}
                        className="bg-gray-800 border-gray-700"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : existingKPI ? "Update KPI" : "Add KPI"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
