import { type ReactNode } from "react";

export type MobileNavKey =
  | "chats"
  | "actions"
  | "home"
  | "browse"
  | "map"
  | "wallet"
  | "vault"
  | "buy"
  | "pro"
  | "threads"
  | "operations"
  | "money"
  | "orders"
  | "inbox"
  | "shop"
  | "agents"
  | "tasks"
  | "me"
  | "account"
  | "data"
  | "equipment"
  | "email";

type MobileNavItem = {
  key: MobileNavKey;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  badge?: string | number;
  primary?: boolean;
};

type MobileBottomNavProps = {
  items: MobileNavItem[];
  activeKey?: MobileNavKey;
  topSlot?: ReactNode;
  theme?: "dark" | "gtn";
};

export function MobileBottomNav({ items, activeKey, topSlot, theme = "dark" }: MobileBottomNavProps) {
  const gridCols =
    items.length === 2
      ? "grid-cols-2"
      : items.length === 4
      ? "grid-cols-4"
      : items.length === 5
        ? "grid-cols-5"
        : items.length === 3
          ? "grid-cols-3"
          : "grid-cols-4";

  return (
    <div
      className="fixed inset-x-0 bottom-0 md:hidden"
      style={{ zIndex: "var(--layer-bottom-nav)" }}
      data-mobile-nav
    >
      {topSlot ? (
        <div className={theme === "gtn" ? "border-t border-slate-200 bg-white/95 px-4 pb-2 pt-2 backdrop-blur-xl" : "border-t border-white/10 bg-black/80 px-4 pb-2 pt-2 backdrop-blur-xl"}>
          {topSlot}
        </div>
      ) : null}
      <nav className={theme === "gtn" ? "border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.10)] backdrop-blur-xl" : "border-t border-white/10 bg-black/90 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2 shadow-2xl"}>
        <div className={`grid ${gridCols} gap-1`}>
          {items.map((item) => {
            const isActive = item.key === activeKey;
            const isPrimary = item.primary === true;
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onPress}
                disabled={item.disabled}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                data-testid={`mobile-nav-${item.key}`}
                className={`relative flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[10px] font-medium transition-colors ${
                  theme === "gtn"
                    ? isPrimary
                      ? "border border-[#F5A623]/30 bg-[#FFF8E8] text-[#8A5700] hover:bg-[#FFF1CF]"
                      : isActive
                        ? "bg-slate-100 text-slate-950"
                        : "text-slate-500"
                    : isPrimary
                      ? "bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
                      : isActive
                        ? "text-amber-300"
                        : "text-white/60"
                } ${item.disabled ? "opacity-40" : theme === "gtn" ? "hover:bg-slate-50 hover:text-slate-950" : "hover:bg-white/5 hover:text-white"} ${isPrimary && theme !== "gtn" ? "border border-amber-500/25" : ""}`}
              >
                <span className="relative flex items-center justify-center">
                  {item.icon}
                  {item.badge ? (
                    <span className="absolute -top-1.5 -right-2 rounded-full bg-amber-500 px-1 text-[8px] font-semibold text-black">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
