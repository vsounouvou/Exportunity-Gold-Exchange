import { LogOut, UserCircle2 } from "lucide-react";
import { useLocation } from "wouter";

import { TenantSwitcher } from "@/components/TenantSwitcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";

type AppProTopBarProps = {
  subtitle?: string;
  homeHref?: string;
};

function initialsOf(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "U";
  const parts = text.split(/\s+/g).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

export function AppProTopBar({ subtitle, homeHref = "/pro/operations" }: AppProTopBarProps) {
  const [, setLocation] = useLocation();
  const { user, logout } = useSession();
  const { tenant } = useTenant();
  const includeTenantSwitcher = __BUILD_INCLUDE_OTHER_TENANT_UI__;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 text-[#07111F] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-3 rounded-lg px-2 py-1 text-left hover:bg-slate-50"
          onClick={() => setLocation(homeHref)}
          aria-label="Open Operations Center"
          data-testid="app-pro-home-logo"
        >
          <img src="/tenants/exportunity/official/favicon-64.png" alt="" className="h-8 w-8 rounded-lg object-contain" />
          <div>
            <div className="text-sm font-black leading-none text-slate-950">{tenant?.name || "Exportunity"}</div>
            <div className="mt-1 text-[11px] font-bold leading-none text-slate-500">{subtitle || "GTN Operations"}</div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {includeTenantSwitcher ? (
            <TenantSwitcher />
          ) : (
            <span className="hidden rounded-full border border-[#F5A623]/35 bg-[#FFF8E8] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#8A5700] sm:inline-flex">
              GTN workspace
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 rounded-full border-slate-200 bg-white px-3 text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8] hover:text-slate-950"
                data-testid="app-pro-account-menu"
              >
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#F5A623]/20 text-[11px] font-black text-[#8A5700]">
                  {initialsOf(user?.displayName)}
                </span>
                <span className="max-w-[120px] truncate text-xs">{user?.displayName || "Account"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-slate-200 bg-white text-slate-800">
              <DropdownMenuLabel className="text-[11px] text-slate-500">Account</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-100" />
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setLocation("/pro/account")}>
                <UserCircle2 className="h-4 w-4" />
                Account
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-100" />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-red-700 focus:text-red-800"
                onClick={() => {
                  logout();
                  setLocation("/pro/login?next=%2Fpro");
                }}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
