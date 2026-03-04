import rawSiteConfig from "../../../../content/marketing/site.json";

export type MarketingSection = {
  title: string;
  description: string;
};

export type MarketingCta = {
  label: string;
  href: string;
};

export type MarketingTimelineEntry = {
  year: string;
  label: string;
  details: string;
};

export type MarketingSiteConfig = {
  brandName: string;
  tagline: string;
  oneLiner?: string;
  primaryCTAs: MarketingCta[];
  platformLink: string;
  memberLoginLink: string;
  mission?: string;
  pillars?: MarketingSection[];
  products?: string[];
  timeline?: MarketingTimelineEntry[];
  trustPillars?: string[];
  images?: {
    hero?: string;
    journey?: string;
    solutions?: string;
    platform?: string;
    contact?: string;
    invest?: string;
  };
  invest?: {
    headline?: string;
    subtext?: string;
    disclaimer?: string;
    trustStrip?: string[];
    opportunitiesHeadline?: string;
    opportunitiesLead?: string;
  };
  sections: {
    aiManagedOperations: MarketingSection;
    multiTenantPlatform: MarketingSection;
    goldAndCommodities: MarketingSection;
    communicationsStack: MarketingSection;
    complianceModules: MarketingSection;
  };
};

const marketingSiteConfig = rawSiteConfig as MarketingSiteConfig;

export default marketingSiteConfig;
