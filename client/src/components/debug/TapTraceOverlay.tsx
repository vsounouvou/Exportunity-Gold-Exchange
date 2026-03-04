import { useEffect, useState } from "react";

type TapTraceEventType = "pointerdown" | "click";

type TapTraceEntry = {
  id: number;
  type: TapTraceEventType;
  route: string;
  x: number;
  y: number;
  target: string;
  composedPath: string[];
  topElement: string;
  createdAt: string;
};

const MAX_TRACE_ENTRIES = 24;

function describeElement(node: Element | null | undefined) {
  if (!node) return "none";
  const tag = node.tagName.toLowerCase();
  const id = node.id ? `#${node.id}` : "";
  const classes =
    typeof node.className === "string" && node.className.trim()
      ? `.${node.className.trim().split(/\s+/).slice(0, 2).join(".")}`
      : "";
  return `${tag}${id}${classes}`;
}

function describePathNode(node: EventTarget | null | undefined) {
  if (!node) return "null";
  if (node instanceof Element) return describeElement(node);
  if (node === window) return "window";
  if (node === document) return "document";
  return Object.prototype.toString.call(node);
}

function isPointEvent(event: Event): event is PointerEvent | MouseEvent {
  return "clientX" in event && "clientY" in event;
}

export function TapTraceOverlay() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TapTraceEntry[]>([]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const onTapEvent = (type: TapTraceEventType) => (event: Event) => {
      if (!isPointEvent(event)) return;
      const x = Math.round(event.clientX);
      const y = Math.round(event.clientY);
      const target = event.target instanceof Element ? describeElement(event.target) : describePathNode(event.target);
      const composedPath = event
        .composedPath()
        .slice(0, 8)
        .map((node) => describePathNode(node));
      const topElement = describeElement(document.elementFromPoint(x, y));
      const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const entry: TapTraceEntry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        type,
        route,
        x,
        y,
        target,
        composedPath,
        topElement,
        createdAt: new Date().toISOString(),
      };

      console.info(`[tap-trace:${type}]`, entry);
      setEntries((current) => [entry, ...current].slice(0, MAX_TRACE_ENTRIES));
    };

    const pointerListener = onTapEvent("pointerdown");
    const clickListener = onTapEvent("click");
    window.addEventListener("pointerdown", pointerListener, true);
    window.addEventListener("click", clickListener, true);
    return () => {
      window.removeEventListener("pointerdown", pointerListener, true);
      window.removeEventListener("click", clickListener, true);
    };
  }, []);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-[200] md:bottom-3">
      <div className="pointer-events-auto flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="tap-trace-toggle"
          className="rounded-full border border-cyan-300/40 bg-slate-900/95 px-3 py-1.5 text-xs font-semibold text-cyan-100 shadow-lg hover:bg-slate-800"
          onClick={() => setOpen((current) => !current)}
        >
          Tap Trace {open ? "Hide" : "Show"}
        </button>
        {open ? (
          <button
            type="button"
            className="rounded-full border border-white/20 bg-black/80 px-2.5 py-1.5 text-xs text-white/85 hover:bg-black"
            onClick={() => setEntries([])}
          >
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 max-h-[60vh] w-[min(95vw,540px)] overflow-auto rounded-xl border border-cyan-300/25 bg-black/90 p-3 text-xs text-cyan-50 shadow-2xl">
          <div className="mb-2 font-semibold">Tap Trace Events</div>
          {entries.length === 0 ? <div className="text-cyan-100/70">No events yet. Tap anywhere to inspect routing.</div> : null}
          {entries.map((entry) => (
            <div key={entry.id} className="mb-2 rounded-lg border border-cyan-300/15 bg-white/5 p-2">
              <div>
                <span className="font-semibold">{entry.type}</span> | {entry.route} | ({entry.x}, {entry.y})
              </div>
              <div>target: {entry.target}</div>
              <div>top: {entry.topElement}</div>
              <div>path: {entry.composedPath.join(" > ")}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
