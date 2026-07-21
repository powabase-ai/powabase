import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import type { StatusCount } from "@/data/observability/types"

// Categorical donut showing counts by status. Colors are provided by the
// caller because status semantics differ per domain (extraction vs index
// vs workflow). Fallback palette rotates through canonical hex values
// (see Radix-remap memory note — Tailwind names `red/amber/etc` are unsafe).

const DEFAULT_PALETTE = [
  "#34d399", // emerald-400  (success)
  "#fbbf24", // amber-400    (pending)
  "#60a5fa", // blue-400     (in-progress)
  "#fb923c", // orange-400   (attention-required)
  "#f87171", // red-400      (failed)
  "#a1a1aa", // zinc-400     (cancelled / other)
]

export interface StatusDonutProps {
  data: StatusCount[]
  colors?: Record<string, string>
  height?: number
  emptyMessage?: string
  /** Outer circle size; donut thickness is derived. Default 90. */
  size?: number
}

export function StatusDonut({
  data,
  colors,
  height = 220,
  emptyMessage = "No data",
  size = 90,
}: StatusDonutProps) {
  if (!data.length || data.every((d) => d.count === 0)) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-default bg-surface-100"
        style={{ height }}
      >
        <span className="text-sm text-foreground-muted">{emptyMessage}</span>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="status"
            outerRadius={size}
            innerRadius={size * 0.55}
            paddingAngle={1.5}
          >
            {data.map((d, i) => (
              <Cell
                key={d.status}
                fill={colors?.[d.status] ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                stroke="hsl(var(--background-surface-100))"
                strokeWidth={1}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--background-surface-200))",
              borderColor: "hsl(var(--border-default))",
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value: number, name: string) => [`${value}`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" height={24} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
