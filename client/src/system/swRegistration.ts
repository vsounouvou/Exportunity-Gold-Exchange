function notifyUpdate(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(new CustomEvent("bdo-sw-update", { detail: { registration } }));
}

export function shouldReloadOnControllerChange(_wasControlledAtRegistration: boolean) {
  return false;
}

export function registerServiceWorkerWithAutoUpgrade() {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        const triggerUpdateCheck = () => {
          try {
            if (document.visibilityState && document.visibilityState !== "visible") return;
          } catch {
            // ignore
          }
          registration.update().catch(() => undefined);
        };

        triggerUpdateCheck();
        window.addEventListener("focus", triggerUpdateCheck);
        document.addEventListener("visibilitychange", triggerUpdateCheck);
        window.setInterval(triggerUpdateCheck, 2 * 60 * 1000);

        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdate(registration);
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              notifyUpdate(registration);
            }
          });
        });
      })
      .catch(() => {
        // PWA support is optional.
      });
  });
}
