import crypto from "crypto";

function normalizeKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

function escapeXml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pickPalette(key: string) {
  const hash = crypto.createHash("sha1").update(key || "agent").digest();
  const hue = hash[0] % 360;
  const hue2 = (hue + 24 + (hash[1] % 20)) % 360;
  const fgHue = (hue + 190) % 360;

  return {
    gradA: `hsl(${hue} 70% 42%)`,
    gradB: `hsl(${hue2} 75% 48%)`,
    fg: `hsl(${fgHue} 15% 96%)`,
    shadow: `rgba(0,0,0,0.18)`,
  };
}

function deriveInitials(key: string) {
  const tokens = key
    .split(/[_\-.]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 2);
  const initials = tokens.map((t) => t.slice(0, 1).toUpperCase()).join("");
  return initials || "AI";
}

export function renderAgentAvatarSvg(input: { agentKey: string; size?: number; label?: string | null }) {
  const agentKey = normalizeKey(input.agentKey);
  const sizeRaw = Number(input.size ?? 128);
  const size = Number.isFinite(sizeRaw) ? Math.max(64, Math.min(512, Math.trunc(sizeRaw))) : 128;
  const palette = pickPalette(agentKey);
  const label = String(input.label || "").trim() || deriveInitials(agentKey);
  const safeLabel = escapeXml(label.slice(0, 3));
  const id = crypto.createHash("md5").update(agentKey).digest("hex").slice(0, 10);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128" role="img" aria-label="${escapeXml(agentKey || "agent")}">
  <defs>
    <linearGradient id="grad-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.gradA}" />
      <stop offset="100%" stop-color="${palette.gradB}" />
    </linearGradient>
    <filter id="shadow-${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${palette.shadow}" />
    </filter>
  </defs>

  <circle cx="64" cy="64" r="62" fill="url(#grad-${id})" />
  <circle cx="64" cy="64" r="54" fill="rgba(255,255,255,0.10)" />

  <!-- stylized head + shoulders -->
  <g filter="url(#shadow-${id})" opacity="0.98">
    <circle cx="64" cy="54" r="20" fill="${palette.fg}" opacity="0.92" />
    <path d="M28 110c6-20 22-34 36-34s30 14 36 34" fill="${palette.fg}" opacity="0.88" />
  </g>

  <!-- initials badge -->
  <g>
    <circle cx="96" cy="96" r="18" fill="rgba(17,24,39,0.45)" />
    <text x="96" y="101" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="white">${safeLabel}</text>
  </g>
</svg>`;
}

