import { isMindbaseHost } from "@/lib/hostMode";

export function mindbasePath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (isMindbaseHost()) return normalized;
  if (normalized === "/") return "/mindbase";
  if (normalized.startsWith("/mindbase")) return normalized;
  return `/mindbase${normalized}`;
}
