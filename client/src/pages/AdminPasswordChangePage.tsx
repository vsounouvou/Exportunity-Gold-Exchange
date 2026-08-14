import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { BrandLockup } from "@pkg/branding";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordFormData = z.infer<typeof passwordSchema>;

export function AdminPasswordChangePage() {
  const { toast } = useToast();
  const { user, token, login, isAuthenticated, isGuest } = useSession();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated || isGuest) {
      setLocation("/admin");
    }
  }, [isAuthenticated, isGuest, setLocation]);

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      if (!token) {
        throw new Error("Missing session token");
      }
      return await apiRequest("/api/ece/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    onSuccess: () => {
      if (token && user) {
        login(token, { ...user, mustChangePassword: false });
      }
      toast({
        title: "Password updated",
        description: "Your password has been updated. Continue to the dashboard.",
      });
      setLocation("/admin/dashboard");
    },
    onError: (error: any) => {
      toast({
        title: "Password update failed",
        description: error.message || "Unable to update password",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: PasswordFormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-6 text-slate-950">
      <Card className="w-full max-w-md border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.12)]">
        <CardHeader className="text-center space-y-3">
          <BrandLockup subtitle="Admin Console" />
          <CardTitle className="text-2xl text-slate-950">Secure your administrator account</CardTitle>
          <CardDescription className="text-slate-600">
            Replace the initial setup password before returning to the Operations Center.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700">Current password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter current password"
                        className="border-slate-300 bg-white text-slate-950"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700">New password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Create a new password"
                        className="border-slate-300 bg-white text-slate-950"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700">Confirm new password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Confirm new password"
                        className="border-slate-300 bg-white text-slate-950"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Updating..." : "Update password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
