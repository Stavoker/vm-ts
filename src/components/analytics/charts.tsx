"use client";

import { useState } from "react";
import { formatNumber, formatPercent } from "@/lib/analytics/format";
import type { TimeseriesPoint } from "@/lib/analytics/types";
import { EmptyState } from "@/components/ui/primitives";

export type ChartMetricKey = "sessions" | "activeUsers" | "newUsers" | "pageViews" | "bounceRate" | "engagementRate";

export const CHART_METRICS: { key: ChartMetricKey; label: string; rate?: boolean }[] = [
  { key: "sessions", label: "Sessions" },
  { key: "activeUsers", label: "Active Users" },
  { key: "newUsers", label: "New Users" },
  { key: "pageViews", label: "Page Views" },
  { key: "bounceRate", label: "Bounce Rate", rate: true },
  { key: "engagementRate", label: "Engagement Rate", rate: true },
];

const COLORS: Record<ChartMetricKey, string> = {
  sessions: "#1d1d1f",
  activeUsers: "#0071e3",
  newUsers: "#8944ab",
  pageViews: "#248a3d",
  bounceRate: "#d70015",
  engagementRate: "#c77d00",
};

type LineChartProps = {
  points: TimeseriesPoint[];
  metrics: ChartMetricKey[];
};

export function TrafficLineChart({ points, metrics }: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 800;
  const height = 280;
  const pad = { top: 20, right: 52, bottom: 40, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const countMetrics = metrics.filter((key) => !isRate(key));
  const rateMetrics = metrics.filter(isRate);
  const maxCount = Math.max(1, ...points.flatMap((point) => countMetrics.map((key) => Number(point[key]) || 0)));

  const xAt = (index: number) => {
    if (points.length <= 1) return pad.left + innerW / 2;
    return pad.left + (index / (points.length - 1)) * innerW;
  };
  const yCount = (value: number) => pad.top + innerH - (value / maxCount) * innerH;
  const yRate = (value: number) => pad.top + innerH - value * innerH;

  const paths = metrics.map((key) => {
    const line = points
      .map((point, index) => {
        const y = isRate(key) ? yRate(Number(point[key]) || 0) : yCount(Number(point[key]) || 0);
        return `${index === 0 ? "M" : "L"} ${xAt(index)} ${y}`;
      })
      .join(" ");
    return { key, line };
  });

  if (points.length === 0) {
    return <EmptyState title="No analytics data for selected period" />;
  }

  const active = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[280px] w-full"
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = pad.top + innerH * (1 - tick);
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(60,60,67,0.12)" />
              {countMetrics.length > 0 ? (
                <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#6e6e73">
                  {formatNumber(maxCount * tick)}
                </text>
              ) : null}
              {rateMetrics.length > 0 ? (
                <text x={width - pad.right + 8} y={y + 3} fontSize="10" fill="#6e6e73">
                  {formatPercent(tick)}
                </text>
              ) : null}
            </g>
          );
        })}
        {paths.map((path) => (
          <path key={path.key} d={path.line} fill="none" stroke={COLORS[path.key]} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {points.map((point, index) => (
          <rect
            key={point.key}
            x={xAt(index) - innerW / Math.max(points.length, 1) / 2}
            y={pad.top}
            width={Math.max(8, innerW / Math.max(points.length, 1))}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
        {hover != null ? (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={pad.top + innerH} stroke="rgba(60,60,67,0.28)" strokeDasharray="3 3" />
        ) : null}
        {points.map((point, index) => {
          if (points.length > 24 && index % Math.ceil(points.length / 8) !== 0) return null;
          return (
            <text key={`l-${point.key}`} x={xAt(index)} y={height - 12} textAnchor="middle" fontSize="10" fill="#6e6e73">
              {point.label}
            </text>
          );
        })}
      </svg>
      {active ? (
        <div className="pointer-events-none absolute right-4 top-4 rounded-[14px] border border-[var(--border)] bg-white/92 px-3 py-2.5 text-xs shadow-[var(--shadow)] backdrop-blur">
          <div className="font-semibold text-[var(--text)]">{active.label}</div>
          {metrics.map((key) => (
            <div key={key} className="mt-1 flex justify-between gap-4 text-[var(--muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLORS[key] }} />
                {CHART_METRICS.find((item) => item.key === key)?.label}
              </span>
              <span className="tabular-nums text-[var(--text)]">
                {isRate(key) ? formatPercent(Number(active[key])) : formatNumber(Number(active[key]))}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isRate(key: ChartMetricKey): boolean {
  return key === "bounceRate" || key === "engagementRate";
}

export function HorizontalBars({
  rows,
}: {
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <EmptyState title="No analytics data for selected period" />;
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[140px_1fr_64px] items-center gap-2 text-sm">
          <div className="truncate text-[var(--muted)]">{row.label}</div>
          <div className="h-2 rounded-full bg-[#f2f2f7]">
            <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
          <div className="text-right tabular-nums text-[var(--text)]">{formatNumber(row.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function DeviceBars({
  rows,
}: {
  rows: { label: string; users: number; sessions: number; bounceRate: number; engagementRate: number }[];
}) {
  if (rows.length === 0) return <EmptyState title="No analytics data for selected period" />;
  const max = Math.max(1, ...rows.map((row) => row.sessions));
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label} className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <div className="text-sm font-semibold capitalize text-[var(--text)]">{row.label}</div>
          <div className="mt-3 h-2 rounded-full bg-[#f2f2f7]">
            <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${(row.sessions / max) * 100}%` }} />
          </div>
          <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
            <div>Users {formatNumber(row.users)}</div>
            <div>Sessions {formatNumber(row.sessions)}</div>
            <div>Bounce {formatPercent(row.bounceRate)}</div>
            <div>Engagement {formatPercent(row.engagementRate)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
