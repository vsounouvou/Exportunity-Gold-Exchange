import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useTenantBrand } from "@/lib/tenant";

export function InstitutionFooter({ className }: { className?: string }) {
  const brand = useTenantBrand();
  return (
    <footer className={cn("border-t border-white/10 bg-black/40 backdrop-blur", className)}>
      <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/70">
          <span className="font-semibold text-white">{brand.name}</span>
          <span className="text-white/50"> — {brand.tagline}</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/60">
          <Link href="/cadre-conformite" className="hover:text-white">
            Cadre & conformité
          </Link>
          <Link href="/terms" className="hover:text-white">
            Conditions
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Confidentialité
          </Link>
        </div>
      </div>
    </footer>
  );
}
