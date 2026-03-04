import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  title = "Brand",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      className={cn("h-5 w-5", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <rect x="4" y="11" width="4" height="9" rx="1.2" fill="currentColor" />
      <rect x="10" y="7" width="4" height="13" rx="1.2" fill="currentColor" />
      <rect x="16" y="4" width="4" height="16" rx="1.2" fill="currentColor" />
    </svg>
  );
}
