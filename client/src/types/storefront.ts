export type StoreProduct = {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  price: number;
  currency: string;
  media: string[];
  badges: string[];
  collectionId: number | null;
  creatorId: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
  tenantId: number;
  status: string;
  slug: string;
};

export type StoreCollection = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number | null;
};
