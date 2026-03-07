function markControllerReloadedOnce() {
  const key = "ece_sw_controllerchange_reload_once";
  if (sessionStorage.getItem(key) === "1") return false;
  sessionStorage.setItem(key, "1");
  return true;
}

function attachControllerChangeReload() {
  const onControllerChange = () => {
    if (!markControllerReloadedOnce()) return;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
}

function triggerSkipWaiting(registration: ServiceWorkerRegistration) {
  const waiting = registration.waiting;
  if (!waiting) return;
  waiting.postMessage({ type: "SKIP_WAITING" });
}

function notifyUpdate(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(new CustomEvent("bdo-sw-update", { detail: { registration } }));
}

export function registerServiceWorkerWithAutoUpgrade() {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        attachControllerChangeReload();

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
          triggerSkipWaiting(registration);
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              notifyUpdate(registration);
              triggerSkipWaiting(registration);
            }
          });
        });
      })
      .catch(() => {
        // PWA support is optional.
      });
  });
}
