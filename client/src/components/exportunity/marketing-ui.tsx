import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function setMarketingPageMetadata({
  title,
  description,
  image,
}: {
  title: string;
  description: string;
  image?: string | null;
}) {
  if (typeof document === "undefined") return;

  document.title = title;

  const ensureMeta = (selector: string, attrs: Record<string, string>, content: string) => {
    let el = document.head.querySelector(selector) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement("meta");
      Object.entries(attrs).forEach(([key, value]) => el?.setAttribute(key, value));
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  };

  ensureMeta('meta[name="description"]', { name: "description" }, description);
  ensureMeta('meta[property="og:title"]', { property: "og:title" }, title);
  ensureMeta('meta[property="og:description"]', { property: "og:description" }, description);
  if (image) ensureMeta('meta[property="og:image"]', { property: "og:image" }, image);
}

export function MarketingContainer({ className, children, ...props }: ComponentPropsWithoutRef<"section">) {
  return (
    <section {...props} className={cn("mx-auto w-full max-w-7xl px-4 md:px-8", className)}>
      {children}
    </section>
  );
}

export function MarketingKicker({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold tracking-[0.24em] text-sky-200/75">{children}</div>;
}

export function MarketingTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h1
      className={cn(
        "text-balance text-3xl font-semibold leading-tight text-white sm:text-4xl md:text-5xl lg:text-6xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function MarketingLead({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("max-w-3xl text-base leading-relaxed text-white/75 md:text-lg", className)}>{children}</p>;
}

export function HeroPanel({
  image,
  imageAlt,
  className,
  children,
}: {
  image?: string | null;
  imageAlt?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-6 md:p-10", className)}>
      {image ? (
        <>
          <img src={image} alt={imageAlt || "Hero"} className="absolute inset-0 h-full w-full object-cover opacity-30" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050913] via-[#050913]/85 to-[#050913]/55" />
        </>
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.18),transparent_35%)]" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm", className)}>{children}</div>;
}

export function MediaThumb({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return <div className={cn("aspect-video w-full rounded-xl bg-white/5", className)} aria-hidden />;
  }
  return <img src={src} alt={alt} loading="lazy" className={cn("aspect-video w-full rounded-xl object-cover", className)} />;
}
