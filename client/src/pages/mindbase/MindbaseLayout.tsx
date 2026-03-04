import type { ReactNode } from "react";
import { useLocation, Link } from "wouter";

import MindbaseLogo from "@/components/branding/MindbaseLogo";
import { Button } from "@/components/ui/button";
import { mindbasePath } from "./routing";

type MindbaseLayoutProps = {
  children: ReactNode;
};

const NAV_ITEMS = [
  { label: "Explore", href: "/discover" },
  { label: "Build", href: "/build/chat" },
  { label: "Workspaces", href: "/workspaces" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs/API", href: "/docs/api" },
];

function isActivePath(currentPath: string, href: string) {
  if (href === "/") return currentPath === "/" || currentPath === "/mindbase";
  if (href.endsWith("/build/chat")) {
    return (
      currentPath === href ||
      currentPath.startsWith(href.replace("/chat", "/")) ||
      currentPath.endsWith("/studio")
    );
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function MindbaseLayout({ children }: MindbaseLayoutProps) {
  const [location] = useLocation();

  return (
    <div
      className="min-h-screen bg-[var(--bg)] text-[var(--text)]"
      style={{ fontFamily: "Roboto, system-ui, -apple-system, Segoe UI, sans-serif" }}
    >
      <header className="border-b border-[var(--border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href={mindbasePath("/")}>
            <a className="inline-flex items-center gap-3">
              <MindbaseLogo />
            </a>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const href = mindbasePath(item.href);
              const active = isActivePath(location, href);
              return (
                <Link key={item.href} href={href}>
                  <a
                    className={`rounded-md border-b-2 px-3 py-2 text-sm transition ${
                      active
                        ? "border-[var(--primary)] text-[var(--primary)] font-semibold"
                        : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {item.label}
                  </a>
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="hidden border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--chipBg)] hover:text-[var(--text)] md:inline-flex"
            >
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="bg-[var(--primary)] text-white hover:bg-[var(--primaryHover)]">
              <Link href={mindbasePath("/build/chat")}>Build</Link>
            </Button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
