import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

type SwUpdateDetail = { registration: ServiceWorkerRegistration };

function isSwUpdateEvent(event: Event): event is CustomEvent<SwUpdateDetail> {
  return event.type === "bdo-sw-update";
}

export default function ServiceWorkerUpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [pendingReload, setPendingReload] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      if (!isSwUpdateEvent(event)) return;
      const next = event.detail?.registration;
      if (next) setRegistration(next);
    };

    window.addEventListener("bdo-sw-update", handler as EventListener);
    return () => window.removeEventListener("bdo-sw-update", handler as EventListener);
  }, []);

  useEffect(() => {
    if (!pendingReload) return;
    if (!("serviceWorker" in navigator)) return;

    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    const fallback = window.setTimeout(() => window.location.reload(), 4000);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.clearTimeout(fallback);
    };
  }, [pendingReload]);

  const hasWaiting = useMemo(() => {
    return !!registration?.waiting;
  }, [registration]);

  if (!registration) return null;

  return (
    <div className="pointer-events-none fixed top-0 inset-x-0 z-[9999] pt-safe px-3">
      <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl text-white px-4 py-3 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">New version available</div>
            <div className="text-[11px] text-white/60 truncate">
              Refresh to load the latest updates.
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
              onClick={() => setRegistration(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
              onClick={() => {
                setPendingReload(true);
                if (hasWaiting) {
                  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
                  return;
                }
                registration.update().catch(() => undefined);
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
