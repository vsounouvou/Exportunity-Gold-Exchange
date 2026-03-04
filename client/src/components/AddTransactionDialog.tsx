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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const transactionSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  type: z.enum(["sale", "subscription", "service", "commission", "refund", "adjustment", "other"]),
  source: z.string().optional(),
  description: z.string().optional(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

interface AddTransactionDialogProps {
  companyId: number;
  existingTransaction?: any;
  trigger?: React.ReactNode;
}

export function AddTransactionDialog({ companyId, existingTransaction, trigger }: AddTransactionDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: existingTransaction
      ? {
          amount: existingTransaction.amount?.toString() || "",
          type: existingTransaction.type || "sale",
          source: existingTransaction.source || "",
          description: existingTransaction.description || "",
        }
      : {
          amount: "",
          type: "sale",
          source: "",
          description: "",
        },
  });

  const mutation = useMutation({
    mutationFn: async (data: TransactionFormValues) => {
      const payload = {
        amount: parseFloat(data.amount),
        type: data.type,
        source: data.source || null,
        description: data.description || null,
      };

      if (existingTransaction) {
        return apiRequest(`/api/companies/${companyId}/transactions/${existingTransaction.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        return apiRequest(`/api/companies/${companyId}/transactions`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId] });
      toast({
        title: "Success",
        description: existingTransaction ? "Transaction updated successfully" : "Transaction added successfully",
      });
      setOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || (existingTransaction ? "Failed to update transaction" : "Failed to add transaction"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TransactionFormValues) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline" size="sm">{existingTransaction ? "Edit Transaction" : "Add Transaction"}</Button>}
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle>{existingTransaction ? "Edit Transaction" : "Add Revenue Transaction"}</DialogTitle>
          <DialogDescription>
            {existingTransaction
              ? "Update the revenue transaction details"
              : "Record a new revenue transaction for this company"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
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
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-gray-800 border-gray-700">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="sale">Sale</SelectItem>
                        <SelectItem value="subscription">Subscription</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                        <SelectItem value="commission">Commission</SelectItem>
                        <SelectItem value="refund">Refund</SelectItem>
                        <SelectItem value="adjustment">Adjustment</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Client name, platform, campaign"
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add additional details about this transaction"
                      {...field}
                      className="bg-gray-800 border-gray-700"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                {mutation.isPending ? "Saving..." : existingTransaction ? "Update Transaction" : "Add Transaction"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
