export function appendQueryParamsToUrl(
  url: string,
  params: Record<string, string | null | undefined>,
): string {
  const raw = String(url || "").trim();
  if (!raw) return raw;

  try {
    const parsed = new URL(raw);
    for (const [key, value] of Object.entries(params)) {
      const k = String(key || "").trim();
      if (!k) continue;
      if (value == null || String(value).trim() === "") {
        parsed.searchParams.delete(k);
        continue;
      }
      parsed.searchParams.set(k, String(value));
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

