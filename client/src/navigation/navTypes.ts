export type NavNode = {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  children?: NavNode[];
  badge?: string | number;
  adminOnly?: boolean;
  alwaysVisible?: boolean;
};

