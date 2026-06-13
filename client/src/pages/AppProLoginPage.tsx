import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";
import { useLocale } from "@/contexts/LocaleContext";

type PasswordLoginResponse = {
  token: string;
  user: any;
};

function normalizeNext(value: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  return raw;
}

function parseNextFromLocation(location: string) {
  const idx = location.indexOf("?");
  if (idx === -1) return null;
  try {
    const params = new URLSearchParams(location.slice(idx + 1));
    return normalizeNext(params.get("next"));
  } catch {
    return null;
  }
}

function getAppProLoginCopy(language: string) {
  if (language === "ar") {
    return {
      title: "تسجيل دخول المساحة المهنية",
      description: "وصول مخصص للحسابات المهنية الموثقة والعمليات المعتمدة.",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      submit: "تسجيل الدخول",
      submitting: "جار تسجيل الدخول...",
      missingEmail: "أدخل بريدك الإلكتروني.",
      missingPassword: "أدخل كلمة المرور.",
      invalidResponse: "استجابة غير صالحة.",
      successTitle: "تم تسجيل الدخول",
      successDescription: "مرحباً بك.",
      errorTitle: "تعذر تسجيل الدخول",
      invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    };
  }

  if (language === "en") {
    return {
      title: "Professional Space sign-in",
      description: "Reserved access for verified professional accounts and approved gold operations.",
      email: "Email",
      password: "Password",
      submit: "Sign in",
      submitting: "Signing in...",
      missingEmail: "Enter your email.",
      missingPassword: "Enter your password.",
      invalidResponse: "Invalid response.",
      successTitle: "Signed in",
      successDescription: "Welcome.",
      errorTitle: "Sign-in failed",
      invalidCredentials: "Invalid email or password.",
    };
  }

  return {
    title: "Connexion Espace Pro",
    description: "Accès réservé aux comptes professionnels vérifiés et aux opérations autorisées.",
    email: "Email",
    password: "Mot de passe",
    submit: "Se connecter",
    submitting: "Connexion...",
    missingEmail: "Entrez votre email.",
    missingPassword: "Entrez votre mot de passe.",
    invalidResponse: "Réponse invalide.",
    successTitle: "Connecté",
    successDescription: "Bienvenue.",
    errorTitle: "Connexion impossible",
    invalidCredentials: "Email ou mot de passe invalide.",
  };
}

export default function AppProLoginPage() {
  const session = useSession();
  const { brand } = useTenant();
  const { language } = useLocale();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const next = useMemo(() => parseNextFromLocation(location) || "/pro", [location]);
  const copy = useMemo(() => getAppProLoginCopy(language), [language]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (session.isAuthenticated && !session.isGuest) {
      setLocation(next);
    }
  }, [next, session.isAuthenticated, session.isGuest, setLocation]);

  const passwordLoginMutation = useMutation({
    mutationFn: async () => {
      const cleanedEmail = email.trim().toLowerCase();
      const cleanedPassword = password;
      if (!cleanedEmail) throw new Error(copy.missingEmail);
      if (!cleanedPassword) throw new Error(copy.missingPassword);
      const res = (await apiRequest("/api/ece/auth/login", "POST", {
        email: cleanedEmail,
        password: cleanedPassword,
      })) as PasswordLoginResponse;
      if (!res?.token || !res?.user) throw new Error(copy.invalidResponse);
      return res;
    },
    onSuccess: (res) => {
      session.login(res.token, res.user);
      toast({ title: copy.successTitle, description: copy.successDescription });
      setLocation(next);
    },
    onError: (error: any) => {
      toast({
        title: copy.errorTitle,
        description: String(error?.message || copy.invalidCredentials),
        variant: "destructive",
      });
    },
  });

  if (session.isAuthenticated && !session.isGuest) {
    return <Redirect to={next} />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0B0D] p-4 text-white">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-60"
        style={{ backgroundImage: "url('/tenants/bdo/official/banners/bdo-banner-certification.jpg')" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_12%,rgba(212,175,55,0.18),transparent_32%),linear-gradient(135deg,rgba(11,11,13,0.96),rgba(13,27,42,0.9)_48%,rgba(11,11,13,0.98))]" />
      <Card className="relative w-full max-w-md border-[#D4AF37]/25 bg-[#0B0B0D]/86 shadow-[0_24px_80px_rgba(0,0,0,0.52)] backdrop-blur-xl">
        <CardHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#E8C873]">{brand.name}</div>
          <CardTitle className="font-['Cinzel'] text-white">{copy.title}</CardTitle>
          <CardDescription className="text-[#F5F3EC]/68">
            {copy.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-[#F5F3EC]/82">{copy.email}</div>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35"
              disabled={passwordLoginMutation.isPending}
              inputMode="email"
              aria-label={copy.email}
              data-testid="app-pro-email"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-[#F5F3EC]/82">{copy.password}</div>
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35"
              disabled={passwordLoginMutation.isPending}
              aria-label={copy.password}
              data-testid="app-pro-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") passwordLoginMutation.mutate();
              }}
            />
          </div>

          <Button
            className="w-full bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873] font-semibold"
            onClick={() => passwordLoginMutation.mutate()}
            disabled={passwordLoginMutation.isPending}
            data-testid="app-pro-login-submit"
          >
            {passwordLoginMutation.isPending ? copy.submitting : copy.submit}
          </Button>

          {passwordLoginMutation.error ? (
            <div className="text-sm text-rose-200">{String((passwordLoginMutation.error as any)?.message || "Erreur")}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
