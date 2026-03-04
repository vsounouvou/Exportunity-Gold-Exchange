import { Link } from "wouter";
import { Truck, ShieldCheck, UserPlus, ArrowLeft } from "lucide-react";

import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DeliveryHubPage() {
  const session = useSession();
  const isDelivery = session.user?.roles?.includes("delivery");
  const isAdmin = session.user?.roles?.includes("admin");

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="text-xs text-white/50">
            {session.isAuthenticated ? `Signed in as ${session.user?.email}` : "Not signed in"}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-lg font-semibold">Delivery</div>
          <div className="text-xs text-white/50">
            Apply to become a delivery partner, or open the delivery admin portal (authorized users).
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-amber-400" />
                Apply as Delivery Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-3">
              <div>
                Submit your application, verify your identity, and get onboarded as a delivery partner.
              </div>
              <Link href="/apply/delivery">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black w-full">
                  Start Application
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Delivery Admin Portal
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-3">
              <div>Manage delivery operations, dispatch, and performance.</div>
              <Link href="/delivery/admin">
                <Button
                  className="bg-emerald-500 hover:bg-emerald-600 text-black w-full"
                  disabled={!session.isAuthenticated || (!isAdmin && !isDelivery)}
                  title={
                    session.isAuthenticated && (isAdmin || isDelivery)
                      ? "Open"
                      : "Sign in with an authorized account to access"
                  }
                >
                  <Truck className="h-4 w-4 mr-2" />
                  Open Portal
                </Button>
              </Link>
              {!session.isAuthenticated ? (
                <div className="text-xs text-white/40">
                  Sign in to access the admin portal.
                </div>
              ) : (!isAdmin && !isDelivery) ? (
                <div className="text-xs text-white/40">
                  Your account doesn’t have delivery admin access.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

