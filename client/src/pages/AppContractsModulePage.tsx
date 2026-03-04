import { Redirect, useLocation } from "wouter";

import { useSession } from "@/lib/session";
import ContractsPage from "@/pages/ContractsPage";

export default function AppContractsModulePage() {
  const session = useSession();
  const [location] = useLocation();

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  return <ContractsPage />;
}
