import type { SearchItem, SearchProvider } from "./types";

export class GoogleCseProvider implements SearchProvider {
  provider = "gcs";

  constructor(
    private readonly apiKey: string,
    private readonly cx: string,
  ) {}

  async search(query: string): Promise<SearchItem[]> {
    if (!this.apiKey || !this.cx) return [];
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(this.apiKey)}&cx=${encodeURIComponent(this.cx)}&num=10&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const json = await response.json();
    const values = Array.isArray(json?.items) ? json.items : [];
    return values.map((item: any) => ({
      title: String(item?.title || "").trim(),
      snippet: String(item?.snippet || "").trim(),
      url: String(item?.link || "").trim(),
      outlet: String(item?.displayLink || "").trim(),
      raw: item,
    }));
  }
}
