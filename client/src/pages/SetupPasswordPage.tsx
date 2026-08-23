import { FormEvent, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";

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
    <div
      data-testid="exportunity-setup-password-page"
      className="relative min-h-screen overflow-hidden bg-[#F7F8FA] text-[#07111F]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="pointer-events-none absolute -left-40 top-24 h-96 w-96 rounded-full bg-[#F5A623]/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-sky-300/15 blur-3xl" />

      <header className="relative z-10 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3">
            <img
              src="/tenants/exportunity/official/logo-long-light.png"
              alt="Exportunity"
              className="h-9 w-auto max-w-[190px] object-contain"
            />
            <span className="hidden border-l border-slate-200 pl-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">
              Global Trade Network
            </span>
          </Link>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">
            Secure account activation
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,470px)] lg:py-16">
        <section className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F5A623]/35 bg-[#FFF8E8] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#8A5700]">
            <KeyRound className="h-3.5 w-3.5" />
            Account access
          </div>
          <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-5xl">
            Activate your Exportunity workspace.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
            Create the password for your approved account, then continue to the same Global Trade Network workspace and records linked to your invitation.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
              <h2 className="mt-3 text-sm font-black">Invitation-bound</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">The setup token is validated by the server before access is activated.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              <h2 className="mt-3 text-sm font-black">Existing records preserved</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Activation does not create a parallel account or discard your application history.</p>
            </div>
          </div>
        </section>

        <Card className="rounded-[28px] border-slate-200 bg-white p-2 shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
          <div className="rounded-[22px] border border-slate-100">
            <CardHeader className="pb-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#07111F] text-[#F5A623]">
                <KeyRound className="h-5 w-5" />
              </div>
              <CardTitle className="pt-3 text-2xl font-black tracking-tight text-[#07111F]">Set your password</CardTitle>
              <CardDescription className="leading-6 text-slate-500">
                Use at least 10 characters. Your invitation determines the workspace opened after activation.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-7">
              <form className="space-y-5" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="setup-password" className="font-bold text-slate-700">New password</Label>
                  <Input
                    id="setup-password"
                    type="password"
                    value={password}
                    minLength={10}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 10 characters"
                    autoComplete="new-password"
                    className="h-11 border-slate-200 bg-slate-50 text-[#07111F] focus-visible:ring-[#F5A623]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-password-confirm" className="font-bold text-slate-700">Confirm password</Label>
                  <Input
                    id="setup-password-confirm"
                    type="password"
                    value={confirmPassword}
                    minLength={10}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    className="h-11 border-slate-200 bg-slate-50 text-[#07111F] focus-visible:ring-[#F5A623]"
                  />
                </div>
                {!token ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-800">
                    This activation link is missing its setup token. Request a fresh invitation before continuing.
                  </div>
                ) : null}
                <Button
                  type="submit"
                  className="h-12 w-full bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
                  disabled={setupMutation.isPending || !token}
                >
                  {setupMutation.isPending ? "Activating…" : "Activate account"}
                  {!setupMutation.isPending ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                </Button>
              </form>
            </CardContent>
          </div>
        </Card>
      </main>
    </div>
  );
}
