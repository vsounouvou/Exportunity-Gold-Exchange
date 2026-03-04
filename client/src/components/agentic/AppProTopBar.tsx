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

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-gray-950/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/5"
          onClick={() => setLocation(homeHref)}
          aria-label="Open Operations Center"
          data-testid="app-pro-home-logo"
        >
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700" />
          <div>
            <div className="text-sm font-semibold leading-none text-white">{tenant?.name || "Company"}</div>
            <div className="mt-1 text-[11px] leading-none text-white/55">{subtitle || "Exportunity Pro"}</div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <TenantSwitcher />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 rounded-full border-white/15 bg-white/5 px-3 text-white hover:bg-white/10"
                data-testid="app-pro-account-menu"
              >
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-200">
                  {initialsOf(user?.displayName)}
                </span>
                <span className="max-w-[120px] truncate text-xs">{user?.displayName || "Account"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-white/10 bg-gray-950 text-white">
              <DropdownMenuLabel className="text-[11px] text-white/70">Account</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setLocation("/pro/account")}>
                <UserCircle2 className="h-4 w-4" />
                Account
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-red-200 focus:text-red-100"
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
