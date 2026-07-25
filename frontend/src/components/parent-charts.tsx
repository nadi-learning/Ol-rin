// Parent-dashboard charts (Recharts trend + a GitHub-style contribution heatmap).
// The two headline stories: PROGRESS (monthly mastery, outcome) and ACTIVITY
// (daily practice, effort). Colours are validated colourblind-safe (dataviz
// skill): solid green #3f9d63 + practising amber #d9a521 (CVD ΔE 10.3), with
// direct value labels for the low-contrast relief the validator requires.
import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SOLID = "#3f9d63";
const PRACTISING = "#d9a521";
const INK = "#15162b";
const MUTED = "#6b6f80";

export type ChartTrendPoint = {
  period: string;
  label: string;
  covered: number;
  solid: number;
  live: boolean;
};
export type ChartActivityDay = { date: string; count: number };

// ── Progress trend — stacked bars, solid (secured) + practising (covered but
// not yet solid) = total taught that month. Shows both coverage AND mastery
// growing. The current month is the live point (brighter, ● now). ──
function TrendTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as {
    label: string;
    solid: number;
    practising: number;
    covered: number;
    live: boolean;
  };
  return (
    <div className="pdash-charttip">
      <div className="pdash-charttip-title">
        {d.label}
        {d.live ? " · now" : ""}
      </div>
      <div className="pdash-charttip-row">
        <span className="pdash-charttip-dot" style={{ background: SOLID }} />
        {d.solid} solid
      </div>
      <div className="pdash-charttip-row">
        <span className="pdash-charttip-dot" style={{ background: PRACTISING }} />
        {d.practising} practising
      </div>
      <div className="pdash-charttip-total">{d.covered} taught in total</div>
    </div>
  );
}

export function ProgressTrend({ trend }: { trend: ChartTrendPoint[] }) {
  const data = trend.map((t) => ({
    label: t.label,
    solid: t.solid,
    practising: Math.max(0, t.covered - t.solid),
    covered: t.covered,
    live: t.live,
  }));

  return (
    <div className="pdash-chart">
      <ResponsiveContainer width="100%" height={216}>
        <BarChart
          data={data}
          margin={{ top: 26, right: 6, bottom: 2, left: 6 }}
          barCategoryGap="30%"
        >
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: MUTED }}
            dy={2}
          />
          <YAxis hide domain={[0, "dataMax + 2"]} />
          <Tooltip
            content={<TrendTip />}
            cursor={{ fill: "rgba(20,22,43,0.05)" }}
          />
          <Bar dataKey="solid" stackId="a" fill={SOLID} radius={[0, 0, 3, 3]}>
            {data.map((d, i) => (
              <Cell key={i} fillOpacity={d.live ? 1 : 0.86} />
            ))}
            <LabelList
              dataKey="solid"
              position="inside"
              fill="#fff"
              fontSize={12}
              fontWeight={700}
              formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")}
            />
          </Bar>
          <Bar dataKey="practising" stackId="a" fill={PRACTISING} radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fillOpacity={d.live ? 1 : 0.86} />
            ))}
            <LabelList
              dataKey="covered"
              position="top"
              fill={INK}
              fontSize={12}
              fontWeight={700}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="pdash-chart-legend">
        <span className="pdash-legend-item">
          <span className="pdash-legend-swatch" style={{ background: SOLID }} />
          solid
        </span>
        <span className="pdash-legend-item">
          <span
            className="pdash-legend-swatch"
            style={{ background: PRACTISING }}
          />
          practising
        </span>
        <span className="pdash-legend-note">bar height = topics taught</span>
      </div>
    </div>
  );
}

// ── Contribution heatmap — GitHub-style daily practice grid over the window.
// Sequential green ramp (empty → dense); native title tooltips per cell. ──
const RAMP = ["#e9ebf0", "#bfe3cb", "#84cc9c", "#4fae72", "#2f9757"];
function bucket(c: number): number {
  if (!c) return 0;
  if (c <= 1) return 1;
  if (c <= 2) return 2;
  if (c <= 4) return 3;
  return 4;
}
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function ContributionHeatmap({
  daily,
  days,
}: {
  daily: ChartActivityDay[];
  days: number;
}) {
  const counts = new Map(daily.map((d) => [d.date, d.count]));

  // Custom hover tooltip — themed, instant, anchored just above the hovered box.
  // Replaces the native `title` (slow, OS-styled). Shows the date + effort, and
  // still names the date on empty days.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{
    day: string;
    sub: string;
    left: number;
    top: number;
  } | null>(null);

  const showTip = (
    e: ReactMouseEvent<HTMLSpanElement>,
    date: Date,
    count: number,
  ) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cr = e.currentTarget.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    setTip({
      day: date.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      sub: count > 0 ? `${count} ${count === 1 ? "question" : "questions"}` : "no practice",
      left: cr.left - wr.left + cr.width / 2,
      top: cr.top - wr.top,
    });
  };

  // Build the day range ending today, padded back to a Sunday so weeks align.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  start.setDate(start.getDate() - start.getDay()); // back to Sunday

  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Columns of weeks; each week is 7 day-cells (Sun..Sat).
  const weeks: { date: Date; count: number }[][] = [];
  const cur = new Date(start);
  while (cur <= today) {
    const week: { date: Date; count: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(cur);
      week.push({ date: d, count: d <= today ? counts.get(iso(d)) ?? 0 : -1 });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  // Month labels: place a label on the first week whose Sunday starts a new month.
  const monthCols: { col: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((w, col) => {
    const m = w[0]!.date.getMonth();
    if (m !== lastMonth) {
      monthCols.push({ col, label: MONTHS[m]! });
      lastMonth = m;
    }
  });

  const total = daily.reduce((a, d) => a + d.count, 0);
  const activeDays = daily.length;

  return (
    <div className="pdash-heatmap" ref={wrapRef}>
      {tip && (
        <div
          className="pdash-heatmap-tip"
          style={{ left: tip.left, top: tip.top }}
        >
          <span className="pdash-heatmap-tip-day">{tip.day}</span>
          <span className="pdash-heatmap-tip-sub">{tip.sub}</span>
        </div>
      )}
      <div className="pdash-heatmap-scroll">
        <div
          className="pdash-heatmap-months"
          style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
        >
          {monthCols.map((mc) => (
            <span
              key={mc.col}
              className="pdash-heatmap-month"
              style={{ gridColumn: mc.col + 1 }}
            >
              {mc.label}
            </span>
          ))}
        </div>
        <div
          className="pdash-heatmap-grid"
          style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
        >
          {weeks.map((week, ci) => (
            <div key={ci} className="pdash-heatmap-week">
              {week.map((cell, ri) =>
                cell.count < 0 ? (
                  <span key={ri} className="pdash-heatmap-cell is-empty" />
                ) : (
                  <span
                    key={ri}
                    className="pdash-heatmap-cell"
                    style={{ background: RAMP[bucket(cell.count)] }}
                    onMouseEnter={(e) => showTip(e, cell.date, cell.count)}
                    onMouseLeave={() => setTip(null)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="pdash-heatmap-foot">
        <span className="pdash-heatmap-summary">
          {activeDays} active days · {total} questions
        </span>
        <span className="pdash-heatmap-legend">
          Less
          {RAMP.map((c, i) => (
            <span
              key={i}
              className="pdash-heatmap-cell"
              style={{ background: c }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
