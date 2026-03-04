import type { SearchItem, SearchProvider } from "./types";

export class BingProvider implements SearchProvider {
  provider = "bing";

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<SearchItem[]> {
    if (!this.apiKey) return [];
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=10&mkt=en-US`;
    const response = await fetch(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
      },
    });
    if (!response.ok) return [];
    const json = await response.json();
    const values = Array.isArray(json?.webPages?.value) ? json.webPages.value : [];
    return values.map((item: any) => ({
      title: String(item?.name || "").trim(),
      snippet: String(item?.snippet || "").trim(),
      url: String(item?.url || "").trim(),
      outlet: (() => {
        try {
          return new URL(String(item?.url || "")).hostname;
        } catch {
          return "";
        }
      })(),
      publishedAt: item?.dateLastCrawled || null,
      raw: item,
    }));
  }
}
