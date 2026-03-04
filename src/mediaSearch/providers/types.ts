export type SearchItem = {
  title: string;
  snippet: string;
  url: string;
  outlet?: string;
  publishedAt?: string | null;
  raw?: unknown;
};

export interface SearchProvider {
  provider: string;
  search(query: string): Promise<SearchItem[]>;
}
