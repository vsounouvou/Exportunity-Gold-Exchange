import { useState, useEffect } from "react";
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
import { getTenantDefaultRoute } from "@/lib/tenantPolicy";
import { Loader2, Bot, Users, BarChart3, Zap, ArrowLeft } from "lucide-react";
import { BrandLockup } from "@pkg/branding";
import { useTenant } from "@/lib/tenant";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

type LoginFormData = z.infer<typeof loginSchema>;

export function AdminLoginPage() {
  const { brand, tenant } = useTenant();
  const { toast } = useToast();
  const { login, isAuthenticated, isGuest, user } = useSession();
  const [, setLocation] = useLocation();
  const defaultRoute = tenant.key === "mindbase" ? "/admin/mindbase" : getTenantDefaultRoute(tenant.key);

  useEffect(() => {
    if (isAuthenticated && !isGuest) {
      setLocation(user?.mustChangePassword ? "/admin/password" : defaultRoute);
    }
  }, [defaultRoute, isAuthenticated, isGuest, setLocation, user]);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      return await apiRequest("/api/ece/auth/login", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: (data) => {
      login(data.token, data.user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${data.user.displayName}`
      });
      setLocation(data.user.mustChangePassword ? "/admin/password" : defaultRoute);
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const features = [
    { icon: Bot, title: "Operations Center", description: "Coordinate your AI agents" },
    { icon: Users, title: "Multi-Agent Meetings", description: "Run automated discussions" },
    { icon: BarChart3, title: "Performance Analytics", description: "Track agent efficiency" },
    { icon: Zap, title: "Task Automation", description: "Delegate work to agents" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-amber-900/20 to-gray-900 p-12 flex-col justify-between">
        <div>
          <button 
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-12"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Marketplace
          </button>
          
          <div className="flex items-center gap-3 mb-8">
            <BrandLockup subtitle="Console d’administration" />
          </div>
          
          <h2 className="text-4xl font-bold text-white mb-4">
            Manage Your AI<br />Agent Workforce
          </h2>
          <p className="text-gray-400 text-lg mb-12">
            Access the command center for your autonomous AI agents. 
            Monitor conversations, manage tasks, and optimize performance.
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <feature.icon className="h-8 w-8 text-amber-500 mb-3" />
                <h3 className="text-white font-medium mb-1">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
        
        <p className="text-gray-500 text-sm">
          {brand.name} — Console d’administration
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-gray-900 border-gray-800">
          <CardHeader className="text-center space-y-4">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
              <BrandLockup subtitle="Console d’administration" />
            </div>
            <CardTitle className="text-2xl text-white">Sign In</CardTitle>
            <CardDescription className="text-gray-400">
              Enter your credentials to access the admin dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="admin@example.com"
                          className="bg-gray-800 border-gray-700 text-white"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">Password</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="Enter your password"
                          className="bg-gray-800 border-gray-700 text-white"
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
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In to Dashboard"
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-4 text-center text-xs text-gray-400">
              <button
                type="button"
                onClick={() => setLocation("/admin/password")}
                className="underline underline-offset-2 hover:text-white"
              >
                Need to change password?
              </button>
              <span className="mx-2 text-gray-600">|</span>
              <button
                type="button"
                onClick={() => setLocation("/setup-password")}
                className="underline underline-offset-2 hover:text-white"
              >
                Have a setup link?
              </button>
            </div>
            
            <div className="mt-6 pt-6 border-t border-gray-800">
              <button 
                onClick={() => setLocation("/")}
                className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="inline h-4 w-4 mr-1" />
                Return to Public Marketplace
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
