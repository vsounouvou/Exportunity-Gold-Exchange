import type { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

export function MobileSafeArea({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("md:hidden pt-[var(--safe-top)] pb-[var(--safe-bottom)]", className)}>{children}</div>;
}

export function MobileBottomNavSpacer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-mobile-bottom-nav-spacer
      className={cn("md:hidden shrink-0", className)}
      style={{ height: "calc(96px + env(safe-area-inset-bottom, 0px))" }}
    />
  );
}

export function MobileSection({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <section className={cn("md:hidden px-3 py-3", className)}>{children}</section>;
}

export function MobileStickyAwareContainer({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn("md:hidden pb-[calc(96px+env(safe-area-inset-bottom,0px))]", className)}
      style={{ minHeight: "100dvh" }}
    >
      {children}
    </div>
  );
}

export function MobileCardCompact({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-white/10 bg-[#08101d]/95 shadow-[0_16px_40px_rgba(2,6,23,0.28)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
