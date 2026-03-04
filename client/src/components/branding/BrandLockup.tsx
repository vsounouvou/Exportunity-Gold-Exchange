import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { useTenantBrand } from "@/lib/tenant";

export function BrandLockup({
  className,
  markClassName,
  nameClassName,
  subtitle,
  subtitleClassName,
}: {
  className?: string;
  markClassName?: string;
  nameClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
}) {
  const brand = useTenantBrand();
  const resolvedSubtitle = subtitle ?? brand.subtitle ?? brand.tagline;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
        <BrandMark title={brand.name} className={cn("h-4 w-4 text-amber-400", markClassName)} />
      </div>
      <div className="min-w-0">
        <div className={cn("text-sm font-semibold tracking-tight text-white leading-tight truncate", nameClassName)}>
          {brand.name}
        </div>
        {resolvedSubtitle ? (
          <div className={cn("text-[10px] text-white/60 tracking-wide truncate", subtitleClassName)}>
            {resolvedSubtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
