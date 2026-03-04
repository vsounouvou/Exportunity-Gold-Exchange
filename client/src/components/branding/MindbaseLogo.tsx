type MindbaseLogoProps = {
  className?: string;
  compact?: boolean;
};

export default function MindbaseLogo({ className, compact = false }: MindbaseLogoProps) {
  return (
    <div className={className ? className : "inline-flex items-center gap-2"}>
      <svg
        width={compact ? 24 : 30}
        height={compact ? 24 : 30}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="6" y="6" width="52" height="52" rx="14" fill="#007BFF" />
        <path
          d="M19 44V20h8.8l4.9 9.5 4.9-9.5H46v24h-6.7V30.8l-5.4 10.1h-2.8l-5.4-10.1V44H19Z"
          fill="white"
        />
      </svg>
      {!compact ? (
        <span className="text-base font-semibold leading-none text-slate-900">
          MindBase
        </span>
      ) : null}
    </div>
  );
}
