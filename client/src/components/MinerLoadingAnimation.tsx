import { useMemo } from "react";
import { cn } from "@/lib/utils";

function getReducedMotionPreference() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MinerLoadingAnimation({ className }: { className?: string }) {
  const reducedMotion = useMemo(() => getReducedMotionPreference(), []);

  return (
    <svg
      viewBox="0 0 240 140"
      role="img"
      aria-label="Loading"
      className={cn("block", className)}
    >
      <defs>
        <linearGradient id="minerGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="minerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fbbf24" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 0.9 0 0 0  0 0 0.2 0 0  0 0 0 0.8 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background vignette */}
      <rect x="0" y="0" width="240" height="140" fill="transparent" />

      {/* Ground */}
      <path
        d="M10 118 C 50 108, 95 126, 140 118 C 175 112, 200 114, 230 118 L230 132 L10 132 Z"
        fill="#0b1220"
        opacity="0.85"
      />

      {/* Rock */}
      <g>
        <ellipse cx="178" cy="96" rx="38" ry="28" fill="#0f172a" opacity="0.9" />
        <path
          d="M145 104 C 150 78, 175 65, 200 72 C 225 79, 232 106, 210 119 C 188 132, 154 126, 145 104 Z"
          fill="#111827"
          opacity="0.95"
        />
        <path
          d="M164 98 C 170 90, 182 88, 191 93 C 200 98, 199 110, 190 114 C 181 118, 168 113, 164 98 Z"
          fill="#0b1220"
          opacity="0.9"
        />
      </g>

      {/* Gold glow */}
      <g filter="url(#softGlow)">
        <circle cx="192" cy="78" r="22" fill="url(#minerGlow)" />
        <path
          d="M182 88 L188 76 L200 80 L195 94 Z"
          fill="url(#minerGold)"
          opacity="0.95"
        />
        <path
          d="M168 103 L173 93 L184 96 L179 109 Z"
          fill="url(#minerGold)"
          opacity="0.85"
        />
      </g>

      {/* Miner (stylized) */}
      <g transform="translate(22 18)">
        {/* body */}
        <circle cx="42" cy="34" r="12" fill="#e5e7eb" opacity="0.9" />
        <path
          d="M34 44 C 32 58, 33 74, 44 84 C 55 74, 56 58, 54 44 Z"
          fill="#e5e7eb"
          opacity="0.15"
        />
        <path
          d="M32 48 C 28 62, 32 78, 44 90 C 56 78, 60 62, 56 48 Z"
          fill="#94a3b8"
          opacity="0.25"
        />

        {/* legs */}
        <path d="M40 86 L34 108" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" opacity="0.55" />
        <path d="M50 86 L56 108" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" opacity="0.55" />

        {/* arm */}
        <path d="M56 56 L78 48" stroke="#cbd5e1" strokeWidth="6" strokeLinecap="round" opacity="0.55" />

        {/* pickaxe group (swing) */}
        <g transform="translate(78 48)">
          {!reducedMotion ? (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-32 0 0; 22 0 0; -32 0 0"
              dur="1.25s"
              repeatCount="indefinite"
            />
          ) : null}

          <g transform="translate(-78 -48)">
            {/* handle */}
            <path d="M78 48 L118 18" stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
            {/* head */}
            <path d="M112 22 C 120 18, 128 16, 136 20" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" opacity="0.95" />
          </g>
        </g>
      </g>

      {/* Sparkles at impact point */}
      <g>
        <circle cx="165" cy="62" r="0" fill="#fbbf24" opacity="0">
          {!reducedMotion ? (
            <>
              <animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.55;0.65;1" dur="1.25s" repeatCount="indefinite" />
              <animate attributeName="r" values="0;0;3.5;0" keyTimes="0;0.55;0.65;1" dur="1.25s" repeatCount="indefinite" />
            </>
          ) : null}
        </circle>
        <circle cx="176" cy="54" r="0" fill="#fde68a" opacity="0">
          {!reducedMotion ? (
            <>
              <animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.6;0.7;1" dur="1.25s" repeatCount="indefinite" />
              <animate attributeName="r" values="0;0;2.6;0" keyTimes="0;0.6;0.7;1" dur="1.25s" repeatCount="indefinite" />
            </>
          ) : null}
        </circle>
        <circle cx="156" cy="54" r="0" fill="#f59e0b" opacity="0">
          {!reducedMotion ? (
            <>
              <animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.63;0.73;1" dur="1.25s" repeatCount="indefinite" />
              <animate attributeName="r" values="0;0;2.2;0" keyTimes="0;0.63;0.73;1" dur="1.25s" repeatCount="indefinite" />
            </>
          ) : null}
        </circle>
      </g>
    </svg>
  );
}
