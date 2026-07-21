
import { useMemo } from "react";
import type { ActivityItem } from "@/lib/ai-api";

export type { ActivityItem };

function Spinner() {
  return (
    <svg
      className="animate-activity-spin h-3 w-3 text-foreground-lighter"
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Checkmark() {
  return (
    <svg className="h-3 w-3 text-emerald-400" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const isDone = item.status === "done";

  return (
    <div
      className={`animate-activity-in flex items-center gap-2 h-7 text-xs transition-colors duration-200 ${
        isDone ? "text-foreground-lighter" : "text-foreground"
      }`}
    >
      {item.kind === "delegation" ? (
        <>
          <svg className="h-3 w-3 text-emerald-400 shrink-0" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-medium truncate">{item.agentName}</span>
          <span className="flex-1" />
          {isDone && item.durationMs != null && (
            <span className="text-foreground-muted tabular-nums shrink-0">{item.durationMs}ms</span>
          )}
          {isDone ? <Checkmark /> : <Spinner />}
        </>
      ) : (
        <>
          <svg className="h-3 w-3 text-amber-400/80 shrink-0" viewBox="0 0 16 16" fill="none">
            <path d="M8 2l1.5 4.5H14l-3.5 2.5 1.5 4.5L8 11l-4 2.5 1.5-4.5L2 6.5h4.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="font-mono truncate">{item.toolName}</span>
          <span className="flex-1" />
          {isDone && item.durationMs != null && (
            <span className="text-foreground-muted tabular-nums shrink-0">{item.durationMs}ms</span>
          )}
          {isDone ? <Checkmark /> : <Spinner />}
        </>
      )}
    </div>
  );
}

export function StreamingActivityFeed({ items }: { items: ActivityItem[] }) {
  const anyRunning = items.some((i) => i.status === "running");

  const { topLevel, nested } = useMemo(() => {
    const top: ActivityItem[] = [];
    const nest = new Map<string, ActivityItem[]>();
    for (const item of items) {
      if (item.parentDelegationId) {
        const list = nest.get(item.parentDelegationId) || [];
        list.push(item);
        nest.set(item.parentDelegationId, list);
      } else {
        top.push(item);
      }
    }
    return { topLevel: top, nested: nest };
  }, [items]);

  const summaryText = useMemo(() => {
    const delegations = items.filter((i) => i.kind === "delegation").length;
    const tools = items.filter((i) => i.kind === "tool").length;
    const parts: string[] = [];
    if (delegations > 0) parts.push(`${delegations} agent${delegations !== 1 ? "s" : ""}`);
    if (tools > 0) parts.push(`${tools} tool call${tools !== 1 ? "s" : ""}`);
    return parts.join(", ");
  }, [items]);

  return (
    <div className="w-full mb-2 rounded-xl border border-default bg-surface-100 px-3 py-2.5 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1 text-xs">
        {anyRunning ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-foreground-light font-medium">Working...</span>
          </>
        ) : (
          <>
            <span className="inline-flex rounded-full h-2 w-2 bg-emerald-400/60" />
            <span className="text-foreground-lighter">{summaryText}</span>
          </>
        )}
      </div>

      {/* Item list */}
      <div className="space-y-0">
        {topLevel.map((item) => (
          <div key={item.id}>
            <ActivityRow item={item} />
            {nested.get(item.id) && (
              <div className="ml-4 border-l border-muted pl-2">
                {nested.get(item.id)!.map((child) => (
                  <ActivityRow key={child.id} item={child} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
