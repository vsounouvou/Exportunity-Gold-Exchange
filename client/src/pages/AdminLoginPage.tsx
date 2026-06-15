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
  const useLightAdminShell = !isBdoTenant;
  const copy = isBdoTenant
    ? bdoCopy[bdoLanguage]
    : {
        back: "Back to Marketplace",
        subtitle: "Operations console",
        headline: "Run Exportunity operations",
        intro:
          "Manage marketplace orders, PME Exchange leads, supplier outreach, Google Places imports, Twilio messages, and business agents from one readable back office.",
        signIn: "Sign In",
        description: "Enter your credentials to access the Exportunity operations center",
        submit: "Open Operations Center",
        submitting: "Signing in...",
        returnHome: "Return to Public Marketplace",
        success: "Welcome back!",
        failure: "Login failed",
        emailPlaceholder: "admin@exportunity.net",
        passwordLabel: "Password",
        passwordPlaceholder: "Enter your password",
        changePassword: "Need to change password?",
        setupLink: "Have a setup link?",
        features: [
          { icon: BarChart3, title: "Commerce cockpit", description: "Track orders, shops, suppliers, and PME leads" },
          { icon: Users, title: "PME Exchange", description: "Review verified sellers, outreach, and onboarding" },
          { icon: Bot, title: "Business agents", description: "Coordinate Tassi, sourcing, finance, and operations agents" },
          { icon: Zap, title: "Integrations", description: "Monitor Google Places, Twilio, tasks, and automations" },
        ],
      };

  useEffect(() => {
    if (isAuthenticated && !isGuest) {
      setLocation(user?.mustChangePassword ? "/admin/password" : defaultRoute);
    }
  }, [defaultRoute, isAuthenticated, isGuest, setLocation, user]);

  useEffect(() => {
    if (!useLightAdminShell) return;
    const previousBackground = document.body.style.background;
    const previousColor = document.body.style.color;
    document.body.style.background = "#F7F8FA";
    document.body.style.color = "#111827";
    return () => {
      document.body.style.background = previousBackground;
      document.body.style.color = previousColor;
    };
  }, [useLightAdminShell]);

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
    <div className={useLightAdminShell ? "flex min-h-screen w-full bg-[#F7F8FA] text-slate-950" : "min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex"}>
      <div className={useLightAdminShell ? "hidden lg:flex lg:w-1/2 flex-col justify-between border-r border-slate-200 bg-white p-12" : "hidden lg:flex lg:w-1/2 bg-gradient-to-br from-amber-900/20 to-gray-900 p-12 flex-col justify-between"}>
        <div>
          <button 
            onClick={() => setLocation("/")}
            className={useLightAdminShell ? "mb-12 flex items-center gap-2 text-slate-600 transition-colors hover:text-slate-950" : "flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-12"}
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.back}
          </button>
          
          <div className="flex items-center gap-3 mb-8">
            <BrandLockup subtitle={copy.subtitle} />
          </div>
          
          <h2 className={useLightAdminShell ? "mb-4 text-4xl font-bold tracking-tight text-slate-950" : "text-4xl font-bold text-white mb-4"}>
            {copy.headline}
          </h2>
          <p className={useLightAdminShell ? "mb-12 max-w-xl text-lg leading-relaxed text-slate-600" : "text-gray-400 text-lg mb-12"}>
            {copy.intro}
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <div key={i} className={useLightAdminShell ? "rounded-2xl border border-slate-200 bg-[#F7F8FA] p-4 shadow-[0_12px_30px_rgba(15,23,42,.06)]" : "bg-gray-800/50 border border-gray-700 rounded-lg p-4"}>
                <feature.icon className="h-8 w-8 text-amber-500 mb-3" />
                <h3 className={useLightAdminShell ? "mb-1 font-semibold text-slate-950" : "text-white font-medium mb-1"}>{feature.title}</h3>
                <p className={useLightAdminShell ? "text-sm text-slate-600" : "text-gray-400 text-sm"}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
        
        <p className={useLightAdminShell ? "text-sm font-semibold text-slate-500" : "text-gray-500 text-sm"}>
          {brand.name} - {copy.subtitle}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className={useLightAdminShell ? "w-full max-w-md border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,.12)]" : "w-full max-w-md bg-gray-900 border-gray-800"}>
          <CardHeader className="text-center space-y-4">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
              <BrandLockup subtitle={copy.subtitle} />
            </div>
            <CardTitle className={useLightAdminShell ? "text-2xl text-slate-950" : "text-2xl text-white"}>{copy.signIn}</CardTitle>
            <CardDescription className={useLightAdminShell ? "text-slate-600" : "text-gray-400"}>
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
                      <FormLabel className={useLightAdminShell ? "text-slate-700" : "text-gray-300"}>Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder={copy.emailPlaceholder}
                          className={useLightAdminShell ? "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 focus-visible:ring-[#F5A623]" : "bg-gray-800 border-gray-700 text-white"}
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
                        <FormLabel className={useLightAdminShell ? "text-slate-700" : "text-gray-300"}>{copy.passwordLabel}</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder={copy.passwordPlaceholder}
                          className={useLightAdminShell ? "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 focus-visible:ring-[#F5A623]" : "bg-gray-800 border-gray-700 text-white"}
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

            <div className={useLightAdminShell ? "mt-4 text-center text-xs text-slate-600" : "mt-4 text-center text-xs text-gray-400"}>
              <button
                type="button"
                onClick={() => setLocation("/admin/password")}
                className={useLightAdminShell ? "underline underline-offset-2 hover:text-slate-950" : "underline underline-offset-2 hover:text-white"}
              >
                {copy.changePassword}
              </button>
              <span className={useLightAdminShell ? "mx-2 text-slate-300" : "mx-2 text-gray-600"}>|</span>
              <button
                type="button"
                onClick={() => setLocation("/setup-password")}
                className={useLightAdminShell ? "underline underline-offset-2 hover:text-slate-950" : "underline underline-offset-2 hover:text-white"}
              >
                {copy.setupLink}
              </button>
            </div>
            
            <div className={useLightAdminShell ? "mt-6 border-t border-slate-200 pt-6" : "mt-6 pt-6 border-t border-gray-800"}>
              <button 
                onClick={() => setLocation("/")}
                className={useLightAdminShell ? "w-full text-center text-sm font-semibold text-slate-600 transition-colors hover:text-slate-950" : "w-full text-center text-sm text-gray-400 hover:text-white transition-colors"}
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
