import { useMemo } from "react";
import { Redirect, useLocation } from "wouter";

import { useSession } from "@/lib/session";

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

export default function AuthGatePage() {
  const session = useSession();
  const [location] = useLocation();

  const next = useMemo(() => parseNextFromLocation(location) || "/app", [location]);

  if (session.isAuthenticated && !session.isGuest) {
    return <Redirect to={next} />;
  }

  return <Redirect to={`/login?next=${encodeURIComponent(next)}`} />;
}
