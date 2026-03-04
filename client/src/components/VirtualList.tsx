import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

type VirtualListProps<T> = {
  items: T[];
  itemHeight: number;
  overscan?: number;
  className?: string;
  style?: CSSProperties;
  getKey?: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
};

export function VirtualList<T>(props: VirtualListProps<T>) {
  const { items, itemHeight, overscan = 6, className, style, getKey, renderItem } = props;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => setViewportHeight(el.clientHeight || 0);
    update();

    const onResize = () => update();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const totalHeight = items.length * itemHeight;

  const range = useMemo(() => {
    const startIndex = Math.max(Math.floor(scrollTop / itemHeight) - overscan, 0);
    const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
    const endIndex = Math.min(startIndex + visibleCount, items.length);
    return { startIndex, endIndex };
  }, [items.length, itemHeight, overscan, scrollTop, viewportHeight]);

  const visibleItems = useMemo(() => items.slice(range.startIndex, range.endIndex), [items, range.endIndex, range.startIndex]);

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{ overflow: "auto", position: "relative", ...style }}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map((item, i) => {
          const index = range.startIndex + i;
          const key = getKey ? getKey(item, index) : String(index);
          return (
            <div
              key={key}
              style={{
                position: "absolute",
                top: index * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
