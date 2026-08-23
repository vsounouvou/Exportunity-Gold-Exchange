import type { Agent } from "@db/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";

type OrgChartTreeProps = {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
};

function buildChildrenMap(agents: Agent[]) {
  const map = new Map<number, Agent[]>();
  for (const agent of agents) {
    const managerId = agent.managerId ?? 0;
    const list = map.get(managerId) ?? [];
    list.push(agent);
    map.set(managerId, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}

function safeNodeKey(agent: Agent) {
  return `${agent.id}`;
}

export function OrgChartTree({ agents, onAgentClick }: OrgChartTreeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    isPanning: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  }>({
    isPanning: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const [isPanning, setIsPanning] = useState(false);

  const agentIdSet = useMemo(() => new Set(agents.map((a) => a.id)), [agents]);
  const childrenMap = useMemo(() => buildChildrenMap(agents), [agents]);
  const roots = useMemo(() => {
    return agents
      .filter((a) => a.managerId == null || !agentIdSet.has(a.managerId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, agentIdSet]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const frame = window.requestAnimationFrame(() => {
      container.scrollLeft = Math.max(0, (container.scrollWidth - container.clientWidth) / 2);
      container.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [agents]);

  const visited = new Set<number>();

  const renderNode = (agent: Agent) => {
    if (visited.has(agent.id)) return null;
    visited.add(agent.id);

    const children = childrenMap.get(agent.id) ?? [];
    const avatarSrc = agent.avatarUrl || agent.avatar || "";

    return (
      <li key={safeNodeKey(agent)}>
        <button
          type="button"
          onClick={() => onAgentClick(agent)}
          title={`Open and edit ${agent.name}`}
          className="inline-flex w-[250px] max-w-[250px] flex-col gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-foreground shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
        >
          <div className="flex min-w-0 items-center gap-2">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="h-9 w-9 flex-none rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-900">
                {agent.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{agent.name}</div>
              <div className="truncate text-xs text-muted-foreground">{agent.role}</div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                agent.status === "active"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {agent.status}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>{children.length} {children.length === 1 ? "report" : "reports"}</span>
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
              <Pencil className="h-3 w-3" /> Edit
            </span>
          </div>
        </button>
        {children.length > 0 && (
          <ul>
            {children.map((child) => renderNode(child))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div
      ref={containerRef}
      className="org-tree max-h-[70vh] overflow-auto rounded-md border border-border bg-card p-4"
      style={{ cursor: isPanning ? "grabbing" : "grab", touchAction: "none" }}
      onPointerDown={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("button")) return;
        const el = containerRef.current;
        if (!el) return;
        panRef.current.isPanning = true;
        panRef.current.pointerId = e.pointerId;
        panRef.current.startX = e.clientX;
        panRef.current.startY = e.clientY;
        panRef.current.scrollLeft = el.scrollLeft;
        panRef.current.scrollTop = el.scrollTop;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        setIsPanning(true);
      }}
      onPointerMove={(e) => {
        const el = containerRef.current;
        if (!el) return;
        if (!panRef.current.isPanning) return;
        if (panRef.current.pointerId !== e.pointerId) return;
        const dx = e.clientX - panRef.current.startX;
        const dy = e.clientY - panRef.current.startY;
        el.scrollLeft = panRef.current.scrollLeft - dx;
        el.scrollTop = panRef.current.scrollTop - dy;
      }}
      onPointerUp={(e) => {
        const el = containerRef.current;
        if (!el) return;
        if (panRef.current.pointerId === e.pointerId) {
          panRef.current.isPanning = false;
          panRef.current.pointerId = null;
          try {
            el.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          setIsPanning(false);
        }
      }}
      onPointerCancel={() => {
        panRef.current.isPanning = false;
        panRef.current.pointerId = null;
        setIsPanning(false);
      }}
      onPointerLeave={() => {
        panRef.current.isPanning = false;
        panRef.current.pointerId = null;
        setIsPanning(false);
      }}
    >
      <style>{`
        .org-tree ul {
          padding-top: 20px;
          position: relative;
          display: inline-flex;
          justify-content: flex-start;
          gap: 8px;
          width: max-content;
          min-width: 100%;
        }
        .org-tree li {
          list-style-type: none;
          text-align: center;
          position: relative;
          padding: 20px 6px 0 6px;
        }
        .org-tree li::before,
        .org-tree li::after {
          content: '';
          position: absolute;
          top: 0;
          width: 50%;
          height: 20px;
          border-top: 1px solid hsl(var(--border));
        }
        .org-tree li::before {
          right: 50%;
        }
        .org-tree li::after {
          left: 50%;
          border-left: 1px solid hsl(var(--border));
        }
        .org-tree li:only-child::before,
        .org-tree li:only-child::after {
          display: none;
        }
        .org-tree li:only-child {
          padding-top: 0;
        }
        .org-tree li:first-child::before {
          border-top: none;
        }
        .org-tree li:last-child::after {
          border-top: none;
        }
        .org-tree ul ul::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          width: 0;
          height: 20px;
          border-left: 1px solid hsl(var(--border));
        }
      `}</style>

      {roots.length === 0 ? (
        <div className="text-sm text-muted-foreground">No top-level agents found.</div>
      ) : (
        <div className="w-max min-w-full">
          <ul>{roots.map((root) => renderNode(root))}</ul>
        </div>
      )}
    </div>
  );
}
