import { useEffect, useMemo } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type JoinRole = "seller" | "miner" | "delivery" | "investor";

function normalizeJoinRole(raw: string | undefined | null): JoinRole | null {
  const role = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z_-]/g, "");
  if (role === "seller" || role === "delivery" || role === "investor" || role === "miner") return role;
  return null;
}

function roomForJoinRole(role: JoinRole) {
  if (role === "seller") return "sales";
  if (role === "miner") return "production";
  if (role === "delivery") return "delivery";
  return "investor";
}

export default function AppProJoinPage(props: { params: { role?: string } }) {
  const session = useSession();
  const [location, setLocation] = useLocation();

  const joinRole = useMemo(() => normalizeJoinRole(props?.params?.role), [props?.params?.role]);
  const nextRoom = joinRole ? roomForJoinRole(joinRole) : "support";

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!joinRole) throw new Error("Invalid role");
      return await apiRequest("/api/ece/onboarding/join-role", "POST", { role: joinRole });
    },
    onSuccess: (res: any) => {
      // Keep local session user in sync with server-side roles/mode.
      if (session.token && res?.user) {
        session.login(session.token, res.user);
      }
      if (joinRole === "miner") {
        setLocation("/pro/mine");
      } else {
        setLocation(`/pro/operations/${encodeURIComponent(nextRoom)}`);
      }
    },
  });

  useEffect(() => {
    if (!joinRole) return;
    if (!session.isAuthenticated || session.isGuest) return;
    if (joinMutation.isPending || joinMutation.isSuccess) return;
    joinMutation.mutate();
  }, [joinMutation, joinRole, session.isAuthenticated, session.isGuest]);

  if (!joinRole) {
    return <Redirect to="/app" />;
  }

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F7F8FA] p-4 text-[#07111F]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
      <Card className="relative w-full max-w-md border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
        <CardContent className="p-6 space-y-3">
          <img src="/tenants/exportunity/official/logo-long-light.png" alt="Exportunity" className="h-9 w-auto max-w-[190px] object-contain" />
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9A6200]">Global Trade Network</div>
          <div className="text-lg font-black">Activation…</div>
          <div className="text-sm text-slate-600">Préparation de votre espace opérationnel.</div>
          {joinMutation.error ? (
            <div className="text-sm text-rose-700">{String((joinMutation.error as any)?.message || "Erreur")}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
