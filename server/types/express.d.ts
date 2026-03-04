declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: number;
        key: string;
        name: string;
        domains?: string[] | null;
        themeConfig?: Record<string, unknown> | null;
        featureFlags?: Record<string, boolean> | null;
      };
      tenant_id?: number;
    }
  }
}

export {};
