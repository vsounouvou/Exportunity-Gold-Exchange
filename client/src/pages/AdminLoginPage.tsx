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
import { useLocale } from "@/contexts/LocaleContext";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

type LoginFormData = z.infer<typeof loginSchema>;

export function AdminLoginPage() {
  const { brand, tenant } = useTenant();
  const { language } = useLocale();
  const { toast } = useToast();
  const { login, isAuthenticated, isGuest, user } = useSession();
  const [, setLocation] = useLocation();
  const defaultRoute = tenant.key === "mindbase" ? "/admin/mindbase" : getTenantDefaultRoute(tenant.key);
  const isBdoTenant = tenant.key === "bdo";
  const bdoCopy = {
    fr: {
      back: "Retour au site",
      subtitle: "Console d'administration",
      headline: "Piloter LA BOURSE DE L'OR",
      intro:
        "Accedez aux commandes, paiements, produits, pieces certifiees, controles KYC/KYB, operations wholesale et agents de suivi.",
      signIn: "Se connecter",
      description: "Connectez-vous avec votre compte admin.",
      submit: "Acceder a la console",
      submitting: "Connexion...",
      returnHome: "Retour au site public",
      success: "Connexion reussie",
      failure: "Connexion impossible",
      emailPlaceholder: "admin@boursedelor.com",
      passwordLabel: "Mot de passe",
      passwordPlaceholder: "Entrez votre mot de passe",
      changePassword: "Changer le mot de passe ?",
      setupLink: "J'ai un lien d'activation",
      features: [
        { icon: BarChart3, title: "Commandes & paiements", description: "Suivre ventes, paniers et paiements" },
        { icon: Users, title: "KYC / KYB", description: "Controler acheteurs, vendeurs et partenaires" },
        { icon: Bot, title: "Agents operationnels", description: "Escalade humaine pour les decisions sensibles" },
        { icon: Zap, title: "Wholesale & pieces", description: "Piloter marche de gros et pieces certifiees" },
      ],
    },
    en: {
      back: "Back to site",
      subtitle: "Administration console",
      headline: "Operate LA BOURSE DE L'OR",
      intro:
        "Access gold orders, online payment follow-up, certified products, KYC/KYB controls, wholesale operations, and human escalation agents.",
      signIn: "Sign in",
      description: "Sign in with your administrator account.",
      submit: "Access the console",
      submitting: "Signing in...",
      returnHome: "Return to public site",
      success: "Login successful",
      failure: "Login failed",
      emailPlaceholder: "admin@boursedelor.com",
      passwordLabel: "Password",
      passwordPlaceholder: "Enter your password",
      changePassword: "Need to change password?",
      setupLink: "I have a setup link",
      features: [
        { icon: BarChart3, title: "Gold orders & payments", description: "Track sales, carts, and payment status" },
        { icon: Users, title: "KYC / KYB", description: "Review buyers, sellers, and partners" },
        { icon: Bot, title: "Operations agents", description: "Escalate sensitive decisions to humans" },
        { icon: Zap, title: "Wholesale & certified pieces", description: "Operate the wholesale market and certified products" },
      ],
    },
    ar: {
      back: "العودة إلى الموقع",
      subtitle: "لوحة الإدارة",
      headline: "إدارة LA BOURSE DE L'OR",
      intro:
        "إدارة طلبات الذهب، متابعة الدفع الإلكتروني، المنتجات الموثقة، مراجعات KYC/KYB، عمليات الجملة، ووكلاء التصعيد البشري.",
      signIn: "تسجيل الدخول",
      description: "سجل الدخول بحساب الإدارة.",
      submit: "الدخول إلى اللوحة",
      submitting: "جار تسجيل الدخول...",
      returnHome: "العودة إلى الموقع العام",
      success: "تم تسجيل الدخول",
      failure: "تعذر تسجيل الدخول",
      emailPlaceholder: "admin@boursedelor.com",
      passwordLabel: "كلمة المرور",
      passwordPlaceholder: "أدخل كلمة المرور",
      changePassword: "هل تحتاج إلى تغيير كلمة المرور؟",
      setupLink: "لدي رابط تفعيل",
      features: [
        { icon: BarChart3, title: "طلبات الذهب والدفع", description: "متابعة المبيعات والسلالات وحالة الدفع" },
        { icon: Users, title: "KYC / KYB", description: "مراجعة المشترين والبائعين والشركاء" },
        { icon: Bot, title: "وكلاء العمليات", description: "تصعيد القرارات الحساسة إلى مراجعة بشرية" },
        { icon: Zap, title: "الجملة والقطع الموثقة", description: "إدارة سوق الجملة والمنتجات الموثقة" },
      ],
    },
  };
  const bdoLanguage = language === "en" || language === "ar" ? language : "fr";
  const copy = isBdoTenant
    ? bdoCopy[bdoLanguage]
    : {
        back: "Back to Marketplace",
        subtitle: "Console d'administration",
        headline: "Manage Your AI Agent Workforce",
        intro:
          "Access the command center for your autonomous AI agents. Monitor conversations, manage tasks, and optimize performance.",
        signIn: "Sign In",
        description: "Enter your credentials to access the admin dashboard",
        submit: "Sign In to Dashboard",
        submitting: "Signing in...",
        returnHome: "Return to Public Marketplace",
        success: "Welcome back!",
        failure: "Login failed",
        emailPlaceholder: "admin@example.com",
        passwordLabel: "Password",
        passwordPlaceholder: "Enter your password",
        changePassword: "Need to change password?",
        setupLink: "Have a setup link?",
        features: [
          { icon: Bot, title: "Operations Center", description: "Coordinate your AI agents" },
          { icon: Users, title: "Multi-Agent Meetings", description: "Run automated discussions" },
          { icon: BarChart3, title: "Performance Analytics", description: "Track agent efficiency" },
          { icon: Zap, title: "Task Automation", description: "Delegate work to agents" },
        ],
      };

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
        title: copy.success,
        description: `Logged in as ${data.user.displayName}`
      });
      setLocation(data.user.mustChangePassword ? "/admin/password" : defaultRoute);
    },
    onError: (error: any) => {
      toast({
        title: copy.failure,
        description: error.message || "Invalid email or password",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const features = copy.features;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-amber-900/20 to-gray-900 p-12 flex-col justify-between">
        <div>
          <button 
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-12"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.back}
          </button>
          
          <div className="flex items-center gap-3 mb-8">
            <BrandLockup subtitle={copy.subtitle} />
          </div>
          
          <h2 className="text-4xl font-bold text-white mb-4">
            {copy.headline}
          </h2>
          <p className="text-gray-400 text-lg mb-12">
            {copy.intro}
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
          {brand.name} - {copy.subtitle}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-gray-900 border-gray-800">
          <CardHeader className="text-center space-y-4">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
              <BrandLockup subtitle={copy.subtitle} />
            </div>
            <CardTitle className="text-2xl text-white">{copy.signIn}</CardTitle>
            <CardDescription className="text-gray-400">
              {copy.description}
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
                          placeholder={copy.emailPlaceholder}
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
                        <FormLabel className="text-gray-300">{copy.passwordLabel}</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder={copy.passwordPlaceholder}
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
                      {copy.submitting}
                    </>
                  ) : (
                    copy.submit
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
                {copy.changePassword}
              </button>
              <span className="mx-2 text-gray-600">|</span>
              <button
                type="button"
                onClick={() => setLocation("/setup-password")}
                className="underline underline-offset-2 hover:text-white"
              >
                {copy.setupLink}
              </button>
            </div>
            
            <div className="mt-6 pt-6 border-t border-gray-800">
              <button 
                onClick={() => setLocation("/")}
                className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="inline h-4 w-4 mr-1" />
                {copy.returnHome}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
