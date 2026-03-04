import { useCallback, useEffect, useState } from "react";
import { Link, Redirect } from "wouter";

type HitInfo = {
  route: string;
  x: number;
  y: number;
  element: string;
  pointerEvents: string;
  zIndex: string;
  rect: { left: number; top: number; width: number; height: number } | null;
};

function describeElement(node: Element | null | undefined) {
  if (!node) return "none";
  const tag = node.tagName.toLowerCase();
  const id = node.id ? `#${node.id}` : "";
  const classes =
    typeof node.className === "string" && node.className.trim()
      ? `.${node.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
  return `${tag}${id}${classes}`;
}

export default function DebugHitTestPage() {
  const [frozen, setFrozen] = useState(false);
  const [hitInfo, setHitInfo] = useState<HitInfo>({
    route: "",
    x: 0,
    y: 0,
    element: "none",
    pointerEvents: "auto",
    zIndex: "auto",
    rect: null,
  });

  const inspectAt = useCallback((x: number, y: number) => {
    const topElement = document.elementFromPoint(x, y);
    const style = topElement ? window.getComputedStyle(topElement) : null;
    const rect = topElement ? topElement.getBoundingClientRect() : null;
    setHitInfo({
      route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      x: Math.round(x),
      y: Math.round(y),
      element: describeElement(topElement),
      pointerEvents: style?.pointerEvents || "auto",
      zIndex: style?.zIndex || "auto",
      rect: rect
        ? {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
        : null,
    });
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (frozen) return;
      inspectAt(event.clientX, event.clientY);
    };

    const onPointerDown = (event: PointerEvent) => {
      inspectAt(event.clientX, event.clientY);
    };

    const onClick = (event: MouseEvent) => {
      inspectAt(event.clientX, event.clientY);
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [frozen, inspectAt]);

  if (!import.meta.env.DEV) return <Redirect to="/app" />;

  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Debug Hit Test</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
              onClick={() => setFrozen((current) => !current)}
            >
              {frozen ? "Resume" : "Freeze"}
            </button>
            <Link href="/app">
              <a className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">Back to app</a>
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm" data-testid="hit-test-info">
          <div>Route: {hitInfo.route || "(unknown)"}</div>
          <div>
            Pointer: ({hitInfo.x}, {hitInfo.y})
          </div>
          <div>Top element: {hitInfo.element}</div>
          <div>
            pointer-events: {hitInfo.pointerEvents} | z-index: {hitInfo.zIndex}
          </div>
          <div>
            Bounds:{" "}
            {hitInfo.rect
              ? `${hitInfo.rect.left}, ${hitInfo.rect.top}, ${hitInfo.rect.width}x${hitInfo.rect.height}`
              : "none"}
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-0 z-[150]">
        <div className="absolute left-0 right-0 h-px bg-cyan-300/70" style={{ top: `${hitInfo.y}px` }} />
        <div className="absolute top-0 bottom-0 w-px bg-cyan-300/70" style={{ left: `${hitInfo.x}px` }} />
        {hitInfo.rect ? (
          <div
            className="absolute border-2 border-red-400/90 bg-red-400/10"
            style={{
              left: `${hitInfo.rect.left}px`,
              top: `${hitInfo.rect.top}px`,
              width: `${hitInfo.rect.width}px`,
              height: `${hitInfo.rect.height}px`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

