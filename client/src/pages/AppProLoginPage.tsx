import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

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

export default function AppProLoginPage() {
  const session = useSession();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const next = useMemo(() => parseNextFromLocation(location) || "/pro", [location]);

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
      if (!cleanedEmail) throw new Error("Entrez votre email.");
      if (!cleanedPassword) throw new Error("Entrez votre mot de passe.");
      const res = (await apiRequest("/api/ece/auth/login", "POST", {
        email: cleanedEmail,
        password: cleanedPassword,
      })) as PasswordLoginResponse;
      if (!res?.token || !res?.user) throw new Error("Réponse invalide.");
      return res;
    },
    onSuccess: (res) => {
      session.login(res.token, res.user);
      toast({ title: "Connecté", description: "Bienvenue." });
      setLocation(next);
    },
    onError: (error: any) => {
      toast({
        title: "Connexion impossible",
        description: String(error?.message || "Email ou mot de passe invalide."),
        variant: "destructive",
      });
    },
  });

  if (session.isAuthenticated && !session.isGuest) {
    return <Redirect to={next} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Connexion - Espace Pro</CardTitle>
          <CardDescription className="text-white/60">Connexion par email et mot de passe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-white/80">Email</div>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
              disabled={passwordLoginMutation.isPending}
              inputMode="email"
              aria-label="Email"
              data-testid="app-pro-email"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-white/80">Mot de passe</div>
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
              disabled={passwordLoginMutation.isPending}
              aria-label="Password"
              data-testid="app-pro-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") passwordLoginMutation.mutate();
              }}
            />
          </div>

          <Button
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            onClick={() => passwordLoginMutation.mutate()}
            disabled={passwordLoginMutation.isPending}
            data-testid="app-pro-login-submit"
          >
            {passwordLoginMutation.isPending ? "Connexion..." : "Se connecter"}
          </Button>

          {passwordLoginMutation.error ? (
            <div className="text-sm text-rose-200">{String((passwordLoginMutation.error as any)?.message || "Erreur")}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

