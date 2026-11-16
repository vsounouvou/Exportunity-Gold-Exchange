// Valid JavaScript as well as TypeScript: the contract can run without a build.
const LOGIN_PATHS = new Set(["/admin", "/admin/login", "/login", "/register", "/auth", "/pro/login", "/app/login"]);

export function normalizeWorkspaceNext(value = "") {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const path = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
    if (path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) return null;
    if (path.split("/").some((part) => part === "." || part === "..")) return null;
    if (LOGIN_PATHS.has(path.replace(/\/+$/, "").toLowerCase() || "/")) return null;
    return raw;
  } catch {
    return null;
  }
}

export function workspaceEntry(location = "", fallback = "/pro/tassi", mustChangePassword = false) {
  if (mustChangePassword) return "/admin/password";
  try {
    const query = location.includes("?") ? location.slice(location.indexOf("?") + 1).split("#", 1)[0] : "";
    for (const part of query.split("&")) {
      const split = part.indexOf("=");
      const key = decodeURIComponent((split < 0 ? part : part.slice(0, split)).replace(/\+/g, " "));
      if (key !== "next") continue;
      const value = decodeURIComponent((split < 0 ? "" : part.slice(split + 1)).replace(/\+/g, " "));
      return normalizeWorkspaceNext(value) || fallback;
    }
  } catch {
    // Malformed return URLs use the existing fallback.
  }
  return fallback;
}

// This chooses a screen only. Server-side permissions remain unchanged.
export function workspaceDefault(tenantKey = "", roles = "", permissions = "", currentMode = "", fallback = "/pro/operations") {
  const labels = (roles + "|" + currentMode).toLowerCase().replace(/[_-]+/g, " ").split("|").map((role) => role.trim());
  const staff = ["admin", "super admin", "platform admin", "tenant admin", "chairman", "chairman assistant", "terminal assistant", "operator", "agent operator", "staff", "employee", "agent"];
  const allowed = labels.some((role) => staff.includes(role)) || permissions.split("|").some((permission) => ["*", "admin:*", "view_admin_dashboard"].includes(permission));
  return tenantKey === "exportunity" && allowed ? "/pro/tassi" : fallback;
}

export function workspaceLoginUrl(destination = "", loginPath = "/pro/login") {
  const next = normalizeWorkspaceNext(destination);
  return next ? loginPath + "?next=" + encodeURIComponent(next) : loginPath;
}
