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
    <div data-testid="exportunity-delivery-hub" className="relative min-h-screen overflow-hidden bg-[#F7F8FA] text-[#07111F]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="pointer-events-none absolute -left-40 top-24 h-96 w-96 rounded-full bg-[#F5A623]/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-sky-300/15 blur-3xl" />

      <header className="relative z-20 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3">
            <img src="/tenants/exportunity/official/logo-long-light.png" alt="Exportunity" className="h-9 w-auto max-w-[190px] object-contain" />
            <span className="hidden border-l border-slate-200 pl-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">
              Global Trade Network
            </span>
          </Link>
          <Button asChild variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to network
            </Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8A5700]">GTN fulfilment network</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">Delivery partner operations</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
            Apply to join the delivery network or open the authorized operating workspace for dispatch, evidence, and performance.
          </p>
          {session.isAuthenticated ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">Signed in as {session.user?.email}</p>
          ) : null}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <span className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-[#FFF0C7] text-[#8A5700]">
                <UserPlus className="h-5 w-5" />
              </span>
              <CardTitle className="text-lg font-black text-slate-950">Apply as a delivery partner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <p>Submit your operating profile, complete identity review, and receive a governed partner decision.</p>
              <Button asChild className="w-full bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]">
                <Link href="/apply/delivery">Start application</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <span className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <CardTitle className="text-lg font-black text-slate-950">Authorized delivery workspace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <p>Manage dispatch, delivery evidence, wallet records, and performance from one operating workspace.</p>
              <Button asChild={session.isAuthenticated && (isAdmin || isDelivery)} className="w-full bg-emerald-700 font-black text-white hover:bg-emerald-800" disabled={!session.isAuthenticated || (!isAdmin && !isDelivery)}>
                {session.isAuthenticated && (isAdmin || isDelivery) ? (
                  <Link href="/delivery/admin">
                    <Truck className="mr-2 h-4 w-4" />
                    Open workspace
                  </Link>
                ) : (
                  <span>
                    <Truck className="mr-2 h-4 w-4" />
                    Authorized accounts only
                  </span>
                )}
              </Button>
              {!session.isAuthenticated ? (
                <p className="text-xs text-slate-500">Sign in before opening the operating workspace.</p>
              ) : !isAdmin && !isDelivery ? (
                <p className="text-xs text-slate-500">This account does not have delivery operations access.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

