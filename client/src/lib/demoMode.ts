const DEMO_MODE_STORAGE_KEY = "ece_demo_mode";

function getDemoFlagFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("demo");
  } catch {
    return null;
  }
}

function getModeFlagFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("mode");
  } catch {
    return null;
  }
}

export function setDemoModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) {
    localStorage.setItem(DEMO_MODE_STORAGE_KEY, "true");
    return;
  }
  localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
}

export function syncDemoModeFromUrl(): void {
  if (typeof window === "undefined") return;
  const flag = getDemoFlagFromUrl();
  const mode = getModeFlagFromUrl();
  if (typeof mode === "string" && mode.trim().toLowerCase() === "demo") {
    setDemoModeEnabled(true);
    return;
  }
  if (flag === "1" || flag === "true" || flag === "yes") {
    setDemoModeEnabled(true);
    return;
  }
  if (
    (typeof mode === "string" && ["live", "prod", "production", "normal"].includes(mode.trim().toLowerCase())) ||
    flag === "0" ||
    flag === "false" ||
    flag === "no"
  ) {
    setDemoModeEnabled(false);
  }
}

export function isDemoModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const mode = getModeFlagFromUrl();
  if (typeof mode === "string" && mode.trim().toLowerCase() === "demo") return true;
  const flag = getDemoFlagFromUrl();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "true";
}

export function getDemoModeHeaders(): Record<string, string> {
  return isDemoModeEnabled() ? { "x-demo-mode": "1" } : {};
}
