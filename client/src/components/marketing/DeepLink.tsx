import type { ReactNode } from "react";
import { Link } from "wouter";

import { useLocale } from "@/contexts/LocaleContext";
import { useSession } from "@/lib/session";
import { resolveDeepLinkPath, resolveInvestOpportunityDetailPath, type DeepLinkKey } from "@/marketing/deepLinks";

function deriveCountryFromNavigator(): string | null {
  if (typeof navigator === "undefined") return null;
  const lang = String(navigator.language || "").trim();
  const region = lang.split("-")[1]?.toUpperCase() || "";
  return region && /^[A-Z]{2}$/.test(region) ? region : null;
}

export function useDeepLinkHref(key: DeepLinkKey, opts?: { query?: Record<string, any> }) {
  const { language, currency } = useLocale();
  const session = useSession();
  const country = deriveCountryFromNavigator();

  return resolveDeepLinkPath(
    key,
    { language, currency, country, query: opts?.query },
    { isAuthenticated: session.isAuthenticated && !session.isGuest },
  );
}

export function useInvestOpportunityDetailHref(slug: string, opts?: { query?: Record<string, any> }) {
  const { language, currency } = useLocale();
  const session = useSession();
  const country = deriveCountryFromNavigator();
  return resolveInvestOpportunityDetailPath(
    slug,
    { language, currency, country, query: opts?.query },
    { isAuthenticated: session.isAuthenticated && !session.isGuest },
  );
}

export function DeepLink({
  linkKey,
  query,
  children,
  className,
}: {
  linkKey: DeepLinkKey;
  query?: Record<string, any>;
  className?: string;
  children: ReactNode;
}) {
  const href = useDeepLinkHref(linkKey, { query });
  return (
    <Link href={href}>
      <a className={className} data-link-key={linkKey}>
        {children}
      </a>
    </Link>
  );
}

export function DeepLinkButton({
  linkKey,
  query,
  children,
  className,
}: {
  linkKey: DeepLinkKey;
  query?: Record<string, any>;
  className?: string;
  children: ReactNode;
}) {
  const href = useDeepLinkHref(linkKey, { query });
  return (
    <Link href={href}>
      <a className={className} data-link-key={linkKey}>
        {children}
      </a>
    </Link>
  );
}

export function InvestOpportunityLink({
  slug,
  query,
  children,
  className,
}: {
  slug: string;
  query?: Record<string, any>;
  className?: string;
  children: ReactNode;
}) {
  const href = useInvestOpportunityDetailHref(slug, { query });
  return (
    <Link href={href}>
      <a className={className} data-link-key="os.invest.opportunities" data-opportunity-slug={slug}>
        {children}
      </a>
    </Link>
  );
}
