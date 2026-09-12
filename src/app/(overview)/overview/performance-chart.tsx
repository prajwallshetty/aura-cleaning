"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface ChartPoint {
  label: string;
  orders: number;
  revenue: number;
  completed: number;
}

/**
 * Three measures on three different scales share one plot, so each series is
 * drawn as a share of its own peak for the period. That keeps a single honest
 * axis — never two y-scales — while the tooltip reports the real numbers.
 */
export interface SeriesConfig {
  key: "orders" | "revenue" | "completed";
  label: string;
  color: string;
  format: (value: number) => string;
}

export const SERIES: SeriesConfig[] = [
  {
    key: "orders",
    label: "Orders",
    color: "var(--ov-series-orders)",
    format: (value) => `${Math.round(value)} orders`,
  },
  {
    key: "revenue",
    label: "Revenue",
    color: "var(--ov-series-revenue)",
    format: (value) => formatCurrency(value),
  },
  {
    key: "completed",
    label: "Completed",
    color: "var(--ov-series-completed)",
    format: (value) => `${Math.round(value)} completed`,
  },
];

interface PerformanceChartProps {
  points: ChartPoint[];
  /** Hidden when the viewer may not see money. */
  showRevenue: boolean;
  className?: string;
}

interface PlotPoint extends ChartPoint {
  ordersPct: number;
  revenuePct: number;
  completedPct: number;
}

export function PerformanceChart({
  points,
  showRevenue,
  className,
}: PerformanceChartProps) {
  const [hovering, setHovering] = useState(false);
  const [plotWidth, setPlotWidth] = useState(0);

  const series = useMemo(
    () => SERIES.filter((entry) => entry.key !== "revenue" || showRevenue),
    [showRevenue],
  );

  const { data, peakIndex, peakLabel } = useMemo(() => {
    const peaks = {
      orders: Math.max(1, ...points.map((point) => point.orders)),
      revenue: Math.max(1, ...points.map((point) => point.revenue)),
      completed: Math.max(1, ...points.map((point) => point.completed)),
    };

    const plotted: PlotPoint[] = points.map((point) => ({
      ...point,
      ordersPct: (point.orders / peaks.orders) * 100,
      revenuePct: (point.revenue / peaks.revenue) * 100,
      completedPct: (point.completed / peaks.completed) * 100,
    }));

    // The bubble at rest sits on the busiest point of the period.
    let best = 0;
    plotted.forEach((point, index) => {
      if (point.orders > plotted[best].orders) best = index;
    });

    return {
      data: plotted,
      peakIndex: best,
      peakLabel: plotted[best]?.label ?? "",
    };
  }, [points]);

  const highlightedPoint = data[peakIndex];

  if (points.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[190px] items-center justify-center rounded-2xl border border-dashed border-[#e3e5ec] text-sm text-[#8b91a3]",
          className,
        )}
      >
        No trading activity in this period.
      </div>
    );
  }

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      {/* Halftone field behind the curves, fading at the edges like the print
          reference it is modelled on. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 inset-y-4 rounded-2xl opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle, #ced3e0 1px, transparent 1.1px)",
          backgroundSize: "9px 9px",
          maskImage:
            "radial-gradient(120% 80% at 55% 50%, #000 20%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(120% 80% at 55% 50%, #000 20%, transparent 78%)",
        }}
      />

      <div
        className="h-full min-h-[190px] w-full"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          onResize={(width) => setPlotWidth(width)}
        >
          <LineChart data={data} margin={{ top: 46, right: 16, left: 16, bottom: 6 }}>
            <CartesianGrid stroke="transparent" />
            <XAxis dataKey="label" hide />
            <YAxis domain={[-12, 118]} hide />

            <Tooltip
              cursor={{ stroke: "#c9cede", strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as PlotPoint;
                return (
                  <div className="rounded-xl border border-[#e8eaf0] bg-white/95 px-3 py-2 shadow-[0_10px_30px_-12px_rgba(24,30,54,0.35)] backdrop-blur">
                    <p className="mb-1 text-[11px] font-semibold text-[#20263a]">
                      {point.label}
                    </p>
                    <ul className="space-y-0.5">
                      {series.map((entry) => (
                        <li
                          key={entry.key}
                          className="flex items-center gap-2 text-[11px]"
                        >
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                            aria-hidden
                          />
                          <span className="text-[#787f94]">{entry.label}</span>
                          <span className="ml-auto font-medium text-[#20263a] tabular-nums">
                            {entry.format(point[entry.key])}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }}
            />

            {series.map((entry) => (
              <Line
                key={entry.key}
                type="monotone"
                dataKey={`${entry.key}Pct`}
                name={entry.label}
                stroke={entry.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                activeDot={{
                  r: 4.5,
                  strokeWidth: 2,
                  stroke: "#ffffff",
                  fill: entry.color,
                }}
              />
            ))}

            {/* The resting callout, pinned to the busiest point. */}
            {!hovering && highlightedPoint ? (
              <ReferenceDot
                x={highlightedPoint.label}
                y={highlightedPoint.ordersPct}
                r={5}
                fill="#ffffff"
                stroke="var(--ov-series-orders)"
                strokeWidth={2}
                label={
                  <PeakCallout
                    label={peakLabel}
                    orders={highlightedPoint.orders}
                    plotWidth={plotWidth}
                  />
                }
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** SVG pill drawn above the peak marker, mirroring the reference's callout. */
function PeakCallout(props: {
  label: string;
  orders: number;
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  /** Plot width, supplied so the pill can be kept inside the frame. */
  plotWidth?: number;
}) {
  const { label, orders, viewBox } = props;
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;

  const caption = `${orders} orders · busiest`;
  const width = Math.max(118, Math.max(label.length, caption.length) * 6.1 + 26);
  const height = 42;

  // Keep the pill inside the plot area rather than letting it clip at an edge.
  const plotWidth = props.plotWidth ?? 0;
  const half = width / 2;
  const centre = plotWidth
    ? Math.min(Math.max(x, half + 4), plotWidth - half - 4)
    : x;
  const left = centre - half;
  const top = Math.max(2, y - height - 18);

  return (
    <g pointerEvents="none">
      <line
        x1={x}
        y1={y - 6}
        x2={centre}
        y2={top + height}
        stroke="#ced3e0"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        rx={13}
        fill="#ffffff"
        stroke="#eceef4"
        strokeWidth={1}
      />
      <text
        x={centre}
        y={top + 17}
        textAnchor="middle"
        fontSize={11.5}
        fontWeight={600}
        fill="#20263a"
      >
        {label}
      </text>
      <text
        x={centre}
        y={top + 31}
        textAnchor="middle"
        fontSize={10.5}
        fill="#8b91a3"
      >
        {caption}
      </text>
    </g>
  );
}
