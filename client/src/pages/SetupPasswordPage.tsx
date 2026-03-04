import { FormEvent, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useSession } from "@/lib/session";
import { getSetupPasswordErrorMessage, resolveSetupPasswordPostSetupPath } from "@/lib/setupPasswordPolicy";

function readTokenFromLocation() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return String(params.get("token") || "").trim();
}

type SetupPasswordError = Error & {
  status?: number;
  code?: string;
};

async function submitSetupPassword(input: { token: string; password: string }) {
  const response = await fetch(resolveApiUrl("/api/auth/setup-password"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const raw = await response.text().catch(() => "");
  let payload: any = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = new Error(String(payload?.message || raw || "Invalid or expired setup link.")) as SetupPasswordError;
    error.status = response.status;
    if (typeof payload?.code === "string") {
      error.code = payload.code;
    }
    throw error;
  }

  return payload;
}

export default function SetupPasswordPage() {
  const { toast } = useToast();
  const { login } = useSession();
  const [, setLocation] = useLocation();
  const token = useMemo(() => readTokenFromLocation(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const setupMutation = useMutation({
    mutationFn: async () =>
      submitSetupPassword({ token, password }),
    onSuccess: (payload: any) => {
      if (payload?.token && payload?.user) {
        login(payload.token, payload.user);
      }

      const locationHost = typeof window !== "undefined" ? window.location.host : "";
      const sessionToken = typeof window !== "undefined" ? localStorage.getItem("ece_session") : null;
      const postSetup = resolveSetupPasswordPostSetupPath({
        serverTenantKey: payload?.tenantKey,
        serverRedirect: payload?.redirect,
        host: locationHost,
        sessionToken,
      });

      toast({ title: "Password set", description: "Your account is ready." });
      setLocation(postSetup.redirect);
    },
    onError: (error: any) => {
      const setupError = error as SetupPasswordError;
      toast({
        title: "Unable to set password",
        description: getSetupPasswordErrorMessage({
          code: setupError?.code,
          fallbackMessage: setupError?.message,
        }),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      toast({ title: "Invalid link", description: "Missing setup token.", variant: "destructive" });
      return;
    }
    if (password.length < 10) {
      toast({ title: "Password too short", description: "Use at least 10 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setupMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090d16] p-4">
      <Card className="w-full max-w-md border-white/10 bg-[#0f1729]">
        <CardHeader>
          <CardTitle className="text-white">Set your password</CardTitle>
          <CardDescription>Create your first password to activate this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="setup-password">New password</Label>
              <Input
                id="setup-password"
                type="password"
                value={password}
                minLength={10}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 10 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-password-confirm">Confirm password</Label>
              <Input
                id="setup-password-confirm"
                type="password"
                value={confirmPassword}
                minLength={10}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-amber-500 text-black hover:bg-amber-600"
              disabled={setupMutation.isPending || !token}
            >
              {setupMutation.isPending ? "Saving..." : "Set Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
