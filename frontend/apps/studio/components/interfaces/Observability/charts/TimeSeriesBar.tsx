import { useMemo } from "react"
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart as RechartComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import dayjs from "dayjs"

import type { TimeBucket } from "@/data/observability/types"

// Stacked bar time series with optional overlay line (e.g. p95 latency). The
// caller provides the buckets already aggregated (bucket -> per-series count).

export interface SeriesDef {
  /** Data key inside each bucket (e.g. "completed", "failed"). */
  key: string
  /** Legend label. Defaults to `key`. */
  label?: string
  /** Hex color (arbitrary Tailwind-canonical values — see Radix remap memo). */
  color: string
  /** If present, this series is rendered as a line rather than a stacked bar. */
  kind?: "bar" | "line"
  /** Optional right-axis binding for an overlay line (p95 ms, etc). */
  yAxisId?: "left" | "right"
}

interface TimeSeriesBarProps {
  data: TimeBucket[]
  series: SeriesDef[]
  /** Date format for XAxis ticks. Default: "MMM D" for >=24h ranges, "HH:mm" for shorter. */
  xAxisFormat?: string
  /** Right-axis label (only shown if any series uses yAxisId="right"). */
  rightAxisLabel?: string
  /** Height in px. Default 220. */
  height?: number
  emptyMessage?: string
}

export function TimeSeriesBar({
  data,
  series,
  xAxisFormat = "MMM D HH:mm",
  rightAxisLabel,
  height = 220,
  emptyMessage = "No data in selected range",
}: TimeSeriesBarProps) {
  const formattedData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        _label: dayjs(d.bucket).format(xAxisFormat),
      })),
    [data, xAxisFormat],
  )

  const hasRightAxis = series.some((s) => s.yAxisId === "right")

  if (!data.length) {
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
        <RechartComposedChart data={formattedData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border-stronger" />
          <XAxis
            dataKey="_label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--foreground-muted))", fontSize: 11 }}
          />
          <YAxis
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--foreground-muted))", fontSize: 11 }}
            width={36}
          />
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--foreground-muted))", fontSize: 11 }}
              width={44}
              label={
                rightAxisLabel
                  ? {
                      value: rightAxisLabel,
                      angle: -90,
                      position: "insideRight",
                      fill: "hsl(var(--foreground-muted))",
                      fontSize: 10,
                    }
                  : undefined
              }
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--background-surface-200))",
              borderColor: "hsl(var(--border-default))",
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) =>
            s.kind === "line" ? (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                yAxisId={s.yAxisId ?? "left"}
              />
            ) : (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label ?? s.key}
                fill={s.color}
                stackId="bars"
                yAxisId={s.yAxisId ?? "left"}
                radius={[2, 2, 0, 0]}
              />
            ),
          )}
        </RechartComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
