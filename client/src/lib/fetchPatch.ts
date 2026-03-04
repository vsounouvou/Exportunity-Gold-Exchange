import { resolveApiUrl } from "./runtimeConfig";

export function installApiFetchPatch() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return originalFetch(resolveApiUrl(input), init);
    }

    if (input instanceof Request) {
      const url = new URL(input.url);
      const pathnameAndQuery = `${url.pathname}${url.search}`;
      const rewritten = resolveApiUrl(pathnameAndQuery);
      if (rewritten === pathnameAndQuery) return originalFetch(input, init);
      return originalFetch(new Request(rewritten, input), init);
    }

    return originalFetch(input, init);
  };
}

