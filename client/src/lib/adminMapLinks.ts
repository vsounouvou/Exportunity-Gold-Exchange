type ExtraParamValue = string | number | boolean | null | undefined;

export function buildAdminMapIconsPath(options?: {
  tenantKey?: string | null;
  focusStyleKey?: string | null;
  focusCategory?: string | null;
  extraParams?: Record<string, ExtraParamValue>;
}) {
  const url = new URL("/admin/map-icons", "http://localhost");

  if (options?.tenantKey) {
    url.searchParams.set("tenantKey", String(options.tenantKey).trim());
  }
  if (options?.focusStyleKey) {
    url.searchParams.set("style", String(options.focusStyleKey).trim());
  }
  if (options?.focusCategory) {
    url.searchParams.set("category", String(options.focusCategory).trim());
  }

  for (const [key, value] of Object.entries(options?.extraParams || {})) {
    if (value == null || value === false || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return `${url.pathname}${url.search}`;
}

export function openAdminMapIconsWindow(options?: {
  tenantKey?: string | null;
  focusStyleKey?: string | null;
  focusCategory?: string | null;
  extraParams?: Record<string, ExtraParamValue>;
  target?: "_blank" | "_self";
}) {
  if (typeof window === "undefined") return false;
  const path = buildAdminMapIconsPath(options);
  if (!path) return false;
  window.open(path, options?.target || "_blank", "noreferrer");
  return true;
}
