	import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
	import { nanoid } from "nanoid";
	import { apiRequest } from "./queryClient";
	import { resolveApiUrl } from "./runtimeConfig";
	import { getDemoModeHeaders } from "./demoMode";

export type UserRole =
  | "buyer"
  | "seller"
  | "shop_owner"
  | "admin"
  | "delivery"
  | "chairman_assistant"
  // ECE & commodity roles (stored as JSON in `ece_users.roles`)
  | "supplier"
  | "shareholder"
  | "investor"
  | "verified_investor"
  | "operator"
  | "mine_operator"
  | "mine_owner"
  | "authorized_gold_buyer"
  | "jewelry_manufacturer"
  | "jewelry_reseller"
  | "machinery_manufacturer"
  | "machinery_reseller"
  | "bureau_achat_user"
  | "neighborhood_contributor"
  | "creator"
  | "client";
export type Permission =
  | "*"
  | "manage_products"
  | "view_financials"
  | "manage_users"
  | "view_admin_dashboard"
  | "manage_orders"
  | "manage_shop"
  | "manage_media"
  | "view_media"
  | "manage_strategy_feedback"
  | "view_strategy_feedback";
export type BuyerType = "wholesale" | "retail";

export interface User {
  id: number;
  email: string;
  displayName: string;
  roles: UserRole[];
  permissions: Permission[];
  currentMode: UserRole;
  buyerType?: BuyerType;
  verificationLevel?: "NONE" | "BASIC_VERIFIED" | "GOLD_VERIFIED";
  mustChangePassword?: boolean;
}

export interface SessionState {
  isGuest: boolean;
  isAuthenticated: boolean;
  user: User | null;
  guestSessionId: string;
  token: string | null;
}

interface SessionContextValue extends SessionState {
  login: (token: string, user: User) => void;
  logout: () => void;
  switchMode: (mode: UserRole) => Promise<void>;
  setBuyerType: (buyerType: BuyerType) => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  hasPermission: (permission: Permission) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function getOrCreateGuestSessionId(): string {
  const existing = localStorage.getItem("ece_guest_session");
  if (existing) return existing;
  
  const newId = nanoid();
  localStorage.setItem("ece_guest_session", newId);
  return newId;
}

function getStoredSession(): { token: string | null; user: User | null } {
  const token = localStorage.getItem("ece_session");
  const userStr = localStorage.getItem("ece_user");
  
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr) as User;
      return { token, user };
    } catch {
      return { token: null, user: null };
    }
  }
  
  return { token: null, user: null };
}

function normalizeRoleLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJwtPayload(token: string | null) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length < 2) return null;
  const payloadRaw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  try {
    const decoded = JSON.parse(atob(payloadRaw));
    return decoded && typeof decoded === "object" ? decoded : null;
  } catch {
    return null;
  }
}

function isMindbaseJwtToken(token: string | null) {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload !== "object") return false;
  const issuer = String((payload as any).iss || "").trim().toLowerCase();
  const audience = String((payload as any).aud || "").trim().toLowerCase();
  const kind = String((payload as any).kind || "").trim().toLowerCase();
  return issuer === "mindbase" || audience === "mindbase-api" || kind === "access";
}

	export function SessionProvider({ children }: { children: ReactNode }) {
	  const [session, setSession] = useState<SessionState>(() => {
	    const guestSessionId = getOrCreateGuestSessionId();
	    const { token, user } = getStoredSession();
    
    return {
      isGuest: !user,
      isAuthenticated: !!user,
      user,
      guestSessionId,
	      token
	    };
	  });
	
	  const login = useCallback((token: string, user: User) => {
	    localStorage.setItem("ece_session", token);
	    localStorage.setItem("ece_user", JSON.stringify(user));
	    
	    setSession(prev => ({
	      ...prev,
	      isGuest: false,
	      isAuthenticated: true,
	      user,
	      token
	    }));
	  }, []);
	
	  const logout = useCallback(() => {
	    localStorage.removeItem("ece_session");
	    localStorage.removeItem("ece_user");
	    
	    setSession(prev => ({
	      ...prev,
	      isGuest: true,
	      isAuthenticated: false,
	      user: null,
	      token: null
	    }));
	  }, []);
	
	  useEffect(() => {
	    let cancelled = false;
	
	    const validate = async () => {
	      const token = session.token;
	      if (!token || !session.user) return;
	
	      try {
	        const headers = new Headers();
	        headers.set("Authorization", `Bearer ${token}`);
	        const demoHeaders = getDemoModeHeaders();
	        for (const [key, value] of Object.entries(demoHeaders)) {
	          headers.set(key, value);
	        }
	
	        const authMeEndpoint = isMindbaseJwtToken(token) ? "/api/mindbase/auth/me" : "/api/ece/auth/me";
	        const res = await fetch(resolveApiUrl(authMeEndpoint), { headers, credentials: "include" });
	        if (cancelled) return;
	
	        if (res.status === 401) {
	          logout();
	          return;
	        }
	
	        if (res.ok) {
            const payload = (await res.json()) as any;
            const me = authMeEndpoint === "/api/mindbase/auth/me"
              ? ({
                  ...(session.user || {}),
                  id: Number(payload?.user?.id || session.user?.id || 0),
                  email: String(payload?.user?.email || session.user?.email || ""),
                  displayName: String(payload?.user?.display_name || payload?.user?.displayName || session.user?.displayName || "User"),
                  roles: Array.isArray(payload?.user?.roles)
                    ? (payload.user.roles.map((entry: unknown) => String(entry || "")) as UserRole[])
                    : (session.user?.roles || []),
                } as User)
              : (payload as User);
	          localStorage.setItem("ece_user", JSON.stringify(me));
	          setSession((prev) => ({
	            ...prev,
	            isGuest: false,
	            isAuthenticated: true,
	            user: me,
	            token,
	          }));
	        }
	      } catch {
	        // Network errors should not forcibly sign users out.
	      }
	    };
	
	    validate();
	
	    return () => {
	      cancelled = true;
	    };
	  }, [logout, session.token]);
	
	  const switchMode = async (mode: UserRole) => {
	    if (!session.user || !session.token) return;
	    
    try {
      await apiRequest("/api/ece/auth/switch-mode", {
        method: "POST",
        body: JSON.stringify({ mode }),
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      });
      
      const updatedUser = { ...session.user, currentMode: mode };
      localStorage.setItem("ece_user", JSON.stringify(updatedUser));
      setSession(prev => ({
        ...prev,
        user: updatedUser
      }));
    } catch (error) {
      console.error("Failed to switch mode:", error);
    }
  };

  const setBuyerType = async (buyerType: BuyerType) => {
    if (!session.user) return;

    const updatedUser = { ...session.user, buyerType };

    // Always update local state/storage so UI stays responsive.
    localStorage.setItem("ece_user", JSON.stringify(updatedUser));
    setSession(prev => ({ ...prev, user: updatedUser }));

    if (!session.token) return;

    try {
      await apiRequest("/api/ece/auth/buyer-type", {
        method: "POST",
        body: JSON.stringify({ buyerType }),
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      });
    } catch (error) {
      console.error("Failed to set buyer type:", error);
    }
  };

  const hasRole = (role: UserRole): boolean => {
    const roles = session.user?.roles || [];
    if (role === "admin") {
      const normalized = roles.map((r) => normalizeRoleLabel(String(r)));
      const isChairmanAssistant =
        normalized.includes("chairman assistant") || normalized.includes("chairmans assistant");
      const perms = session.user?.permissions || [];
      return roles.includes("admin") || isChairmanAssistant || perms.includes("*");
    }
    return roles.includes(role) || false;
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!session.user?.permissions) return false;
    return session.user.permissions.includes("*") || session.user.permissions.includes(permission);
  };

  return (
    <SessionContext.Provider value={{ 
      ...session, 
      login, 
      logout, 
      switchMode, 
      setBuyerType,
      hasRole, 
      hasPermission 
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}

export function useRequireAuth() {
  const session = useSession();
  return {
    isAuthenticated: session.isAuthenticated,
    requireAuth: (action: string) => {
      if (!session.isAuthenticated) {
        return { allowed: false, action };
      }
      return { allowed: true };
    }
  };
}
