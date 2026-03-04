export type SeedDescriptor = {
  key: string;
  title: string;
  count: number;
};

export type TenantSeedPlan = {
  categories: string[];
  demoContent: SeedDescriptor[];
};
