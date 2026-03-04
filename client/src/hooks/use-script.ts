import { useEffect, useState } from "react";

type ScriptStatus = "idle" | "loading" | "ready" | "error";

export function useScript(src: string | null | undefined) {
  const [status, setStatus] = useState<ScriptStatus>(() => (src ? "loading" : "idle"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;

    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing?.dataset?.loaded === "true") {
      setStatus("ready");
      setError(null);
      return;
    }

    setStatus("loading");

    const script = existing ?? document.createElement("script");
    script.src = src;
    script.async = true;

    const handleLoad = () => {
      script.dataset.loaded = "true";
      script.dataset.error = "";
      if (cancelled) return;
      setError(null);
      setStatus("ready");
    };

    const handleError = () => {
      script.dataset.error = "true";
      if (cancelled) return;
      setError(`Failed to load script: ${src}`);
      setStatus("error");
    };

    // Use `{ once: true }` and do not remove listeners on cleanup:
    // if the component unmounts before the script finishes loading, we still want to
    // mark `data-loaded="true"` on the script element so future mounts see it as ready.
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [src]);

  return { status, error };
}
