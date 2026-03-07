type RawNewsItem = {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
};

type CachedNews = {
  expiresAt: number;
  items: RawNewsItem[];
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const cacheByTenant = new Map<string, CachedNews>();

const FEEDS: Array<{ source: string; url: string }> = [
  { source: "World Gold Council", url: "https://www.gold.org/rss.xml" },
  { source: "Kitco News", url: "https://www.kitco.com/rss/news" },
  { source: "Mining Weekly", url: "https://www.miningweekly.com/page/rss-feeds" },
];

const FALLBACK_ITEMS: RawNewsItem[] = [
  {
    title: "Gold ecosystem updates are temporarily unavailable",
    source: "Bourse de l'Or",
    url: "https://boursedelor.com",
    publishedAt: null,
    summary: "Feed sources are being refreshed. Please check again shortly.",
  },
];

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTag(block: string, tag: string): string | null {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(rx);
  if (!match?.[1]) return null;
  const decoded = stripHtml(decodeEntities(match[1]));
  return decoded || null;
}

function parseRss(xml: string, source: string): RawNewsItem[] {
  const itemMatches = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi));
  const items = itemMatches
    .map((match) => {
      const block = match[0];
      const title = pickTag(block, "title");
      const url = pickTag(block, "link");
      const publishedAt = pickTag(block, "pubDate");
      const summary = pickTag(block, "description");
      if (!title || !url) return null;
      return {
        title,
        source,
        url,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        summary,
      } as RawNewsItem;
    })
    .filter((item): item is RawNewsItem => Boolean(item));

  if (items.length) return items;

  const entryMatches = Array.from(xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi));
  return entryMatches
    .map((match) => {
      const block = match[0];
      const title = pickTag(block, "title");
      const publishedAt = pickTag(block, "updated") || pickTag(block, "published");
      const summary = pickTag(block, "summary") || pickTag(block, "content");
      const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      const url = linkMatch?.[1] ? decodeEntities(linkMatch[1]) : null;
      if (!title || !url) return null;
      return {
        title,
        source,
        url,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        summary,
      } as RawNewsItem;
    })
    .filter((item): item is RawNewsItem => Boolean(item));
}

function rankItem(item: RawNewsItem): number {
  const text = `${item.title} ${item.summary || ""}`.toLowerCase();
  let score = 0;
  if (text.includes("gold")) score += 3;
  if (text.includes("uae") || text.includes("dubai")) score += 2;
  if (text.includes("africa") || text.includes("mining")) score += 2;
  return score;
}

async function fetchFeed(source: string, url: string): Promise<RawNewsItem[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Exportunity-NewsBot/1.0",
      Accept: "application/rss+xml, application/atom+xml, text/xml, */*",
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const xml = await res.text();
  if (!xml || xml.length < 20) return [];
  return parseRss(xml, source);
}

export async function getGoldNewsItems(tenantId: string): Promise<RawNewsItem[]> {
  const now = Date.now();
  const cached = cacheByTenant.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.items;

  const all = (
    await Promise.all(
      FEEDS.map(async (feed) => {
        try {
          return await fetchFeed(feed.source, feed.url);
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  const dedup = new Map<string, RawNewsItem>();
  for (const item of all) {
    const key = `${item.url}|${item.title}`.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, item);
  }

  const sorted = Array.from(dedup.values())
    .sort((a, b) => {
      const score = rankItem(b) - rankItem(a);
      if (score !== 0) return score;
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    })
    .slice(0, 24);

  const finalItems = sorted.length ? sorted : FALLBACK_ITEMS;
  cacheByTenant.set(tenantId, { expiresAt: now + CACHE_TTL_MS, items: finalItems });
  return finalItems;
}
