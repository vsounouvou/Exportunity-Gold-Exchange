import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  shareholderName: z.string().min(1, "Shareholder name is required"),
  shareholderType: z.enum(["individual", "corporate", "institutional", "government"]),
  sharePercentage: z.coerce.number().min(0.01, "Must be at least 0.01%").max(100, "Cannot exceed 100%"),
  investmentAmount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddShareholderDialogProps {
  companyId: number;
  trigger?: React.ReactNode;
  existingShareholder?: {
    id: number;
    shareholderName: string;
    shareholderType: string;
    sharePercentage: number;
    investmentAmount?: string;
    notes?: string;
  };
  onSuccess?: () => void;
}

export function AddShareholderDialog({ 
  companyId, 
  trigger,
  existingShareholder,
  onSuccess
}: AddShareholderDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isEditing = !!existingShareholder;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      shareholderName: existingShareholder?.shareholderName || "",
      shareholderType: (existingShareholder?.shareholderType as any) || "individual",
      sharePercentage: existingShareholder?.sharePercentage || 0,
      investmentAmount: existingShareholder?.investmentAmount 
        ? parseFloat(existingShareholder.investmentAmount) 
        : undefined,
      notes: existingShareholder?.notes || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const url = isEditing 
        ? `/api/companies/${companyId}/shareholders/${existingShareholder.id}`
        : `/api/companies/${companyId}/shareholders`;
      
      const response = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `Failed to ${isEditing ? 'update' : 'create'} shareholder`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId] });
      toast({
        title: "Success",
        description: `Shareholder ${isEditing ? 'updated' : 'added'} successfully`,
      });
      setOpen(false);
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button>{isEditing ? 'Edit Shareholder' : 'Add Shareholder'}</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Shareholder' : 'Add Shareholder'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Update shareholder information and ownership percentage.'
              : 'Add a new shareholder and define their ownership stake.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="shareholderName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shareholder Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., John Smith or ABC Corporation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="shareholderType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shareholder Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="corporate">Corporate</SelectItem>
                      <SelectItem value="institutional">Institutional</SelectItem>
                      <SelectItem value="government">Government</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sharePercentage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ownership Percentage (%)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01"
                      min="0.01"
                      max="100"
                      placeholder="e.g., 25.5" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="investmentAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Investment Amount (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01"
                      min="0"
                      placeholder="e.g., 100000" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Additional information" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? 'Update Shareholder' : 'Add Shareholder'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
