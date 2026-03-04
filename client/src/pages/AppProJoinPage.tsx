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
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/5 border-white/10">
        <CardContent className="p-6 space-y-3">
          <div className="text-lg font-semibold">Activation…</div>
          <div className="text-sm text-white/70">Je prépare tes conversations.</div>
          {joinMutation.error ? (
            <div className="text-sm text-rose-200">{String((joinMutation.error as any)?.message || "Erreur")}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
