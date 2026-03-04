import type { SearchItem, SearchProvider } from "./types";

export class SerpApiProvider implements SearchProvider {
  provider = "serpapi";

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<SearchItem[]> {
    if (!this.apiKey) return [];
    const url = `https://serpapi.com/search.json?engine=google&num=10&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const json = await response.json();
    const organic = Array.isArray(json?.organic_results) ? json.organic_results : [];
    return organic.map((item: any) => ({
      title: String(item?.title || "").trim(),
      snippet: String(item?.snippet || "").trim(),
      url: String(item?.link || "").trim(),
      outlet: String(item?.source || "").trim(),
      publishedAt: item?.date || null,
      raw: item,
    }));
  }
}
