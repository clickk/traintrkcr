"use client";

import { useState, useEffect } from "react";
import type { MovementFilters } from "@/lib/types";

// ─── Types (mirrors API route) ──────────────────────────────────────────────

interface HourBucket {
  hour: number;
  total: number;
  delayed: number;
  avgDelay: number;
  towardsNewcastle: number;
  towardsSydney: number;
  delayedNewcastle: number;
  delayedSydney: number;
}

interface DayStat {
  date: string;
  label: string;
  total: number;
  passenger: number;
  freight: number;
  towardsNewcastle: number;
  towardsSydney: number;
  onTime: number;
  delayed: number;
  cancelled: number;
  avgDelayMinutes: number;
  peakHour: number;
  peakHourCount: number;
  stoppingAtCardiff: number;
  stoppingAtKotara: number;
  passingThrough: number;
  liveTracked: number;
  uniqueOperators: string[];
  hourlyBreakdown: HourBucket[];
}

interface AnalyticsResponse {
  today: DayStat;
  days: DayStat[];
  generatedAt: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface AnalyticsDashboardProps {
  filters: MovementFilters;
}

export default function AnalyticsDashboard({ filters }: AnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          station: filters.station,
          direction: filters.direction,
          type: filters.type,
          status: filters.status,
        });
        const res = await fetch(`/api/analytics?${params}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const json: AnalyticsResponse = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filters.station, filters.direction, filters.type, filters.status]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-muted)]">
        <svg className="w-5 h-5 animate-spin mr-2" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading analytics...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        {error || "No data"}
      </div>
    );
  }

  const { today, days } = data;

  const activeFilters: string[] = [];
  if (filters.station !== "both") activeFilters.push(filters.station === "cardiff" ? "Cardiff only" : "Kotara only");
  if (filters.direction !== "both") activeFilters.push(filters.direction === "towards-newcastle" ? "To Newcastle" : "To Sydney");
  if (filters.type !== "all") activeFilters.push(filters.type === "passenger" ? "Passenger only" : "Freight only");
  if (filters.status !== "all") activeFilters.push(filters.status.charAt(0).toUpperCase() + filters.status.slice(1) + " only");

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">
      {/* Active filter badges */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
            Filtered:
          </span>
          {activeFilters.map((f) => (
            <span
              key={f}
              className="px-2 py-0.5 bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 text-[var(--color-accent)] rounded-full text-[10px] font-medium"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* ─── Today's Summary ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
          Today — {today.label}
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Total Movements"
            value={today.total}
            icon="🚆"
          />
          <StatCard
            label="On Time"
            value={today.total > 0 ? `${Math.round((today.onTime / today.total) * 100)}%` : "—"}
            sub={`${today.onTime} of ${today.total}`}
            color={today.total > 0 && today.onTime / today.total >= 0.9 ? "text-green-400" : "text-amber-400"}
          />
          <StatCard
            label="Delayed"
            value={today.delayed}
            sub={today.avgDelayMinutes > 0 ? `Avg ${today.avgDelayMinutes}m` : undefined}
            color={today.delayed > 0 ? "text-amber-400" : "text-green-400"}
          />
          <StatCard
            label="Cancelled"
            value={today.cancelled}
            color={today.cancelled > 0 ? "text-red-400" : "text-green-400"}
          />
          <StatCard
            label="Passenger"
            value={today.passenger}
            sub={`${today.freight} freight`}
            icon="👤"
          />
          <StatCard
            label="Peak Hour"
            value={today.peakHourCount > 0 ? `${String(today.peakHour).padStart(2, "0")}:00` : "—"}
            sub={today.peakHourCount > 0 ? `${today.peakHourCount} movements` : undefined}
          />
        </div>

        {/* Direction + Station split */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <MiniStat label="To Newcastle" value={today.towardsNewcastle} icon="↑" />
          <MiniStat label="To Sydney" value={today.towardsSydney} icon="↓" />
          <MiniStat label="Stop @ Cardiff" value={today.stoppingAtCardiff} />
          <MiniStat label="Stop @ Kotara" value={today.stoppingAtKotara} />
        </div>

        {/* Live tracking bar */}
        {today.total > 0 && (
          <div className="mt-3 px-3 py-2 bg-[var(--color-surface-2)] rounded-lg">
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-1">
              <span>Tracking confidence</span>
              <span>
                {today.liveTracked} live · {today.total - today.liveTracked - today.cancelled} scheduled · {today.cancelled} cancelled
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-[var(--color-surface-3)] flex">
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${(today.liveTracked / today.total) * 100}%` }}
              />
              <div
                className="bg-blue-500 transition-all"
                style={{
                  width: `${((today.total - today.liveTracked - today.cancelled) / today.total) * 100}%`,
                }}
              />
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${(today.cancelled / today.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ─── Delay Heatmap ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
          Delay Heatmap — Today by Hour
        </h2>
        <DelayHeatmap hourly={today.hourlyBreakdown} />
      </section>

      {/* ─── 7-Day History ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
          Last 7 Days
        </h2>

        {/* Mini bar chart */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          {/* Chart */}
          <div className="p-4">
            <WeekChart days={days} />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Day</th>
                  <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Total</th>
                  <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Pass.</th>
                  <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Freight</th>
                  <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">On Time</th>
                  <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Delayed</th>
                  <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Avg Delay</th>
                  <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Peak</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day, i) => {
                  const onTimePct = day.total > 0 ? Math.round((day.onTime / day.total) * 100) : 0;
                  return (
                    <tr
                      key={day.date}
                      className={`border-t border-[var(--color-border)] ${
                        i === 0 ? "bg-[var(--color-accent)]/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-medium">
                        {day.label}
                        {i === 0 && (
                          <span className="ml-1.5 text-[10px] text-[var(--color-accent)] font-bold">
                            TODAY
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-2 font-mono tabular-nums">{day.total}</td>
                      <td className="text-right px-3 py-2 font-mono tabular-nums text-blue-400">{day.passenger}</td>
                      <td className="text-right px-3 py-2 font-mono tabular-nums text-purple-400">{day.freight}</td>
                      <td className="text-right px-3 py-2 font-mono tabular-nums">
                        <span className={onTimePct >= 90 ? "text-green-400" : onTimePct >= 75 ? "text-amber-400" : "text-red-400"}>
                          {onTimePct}%
                        </span>
                      </td>
                      <td className="text-right px-3 py-2 font-mono tabular-nums text-amber-400">
                        {day.delayed}
                      </td>
                      <td className="text-right px-3 py-2 font-mono tabular-nums">
                        {day.avgDelayMinutes > 0 ? `${day.avgDelayMinutes}m` : "—"}
                      </td>
                      <td className="text-right px-3 py-2 font-mono tabular-nums text-[var(--color-text-muted)]">
                        {day.peakHourCount > 0
                          ? `${String(day.peakHour).padStart(2, "0")}:00 (${day.peakHourCount})`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── Operators ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
          Operators
        </h2>
        <div className="flex flex-wrap gap-2">
          {today.uniqueOperators.map((op) => (
            <span
              key={op}
              className="px-3 py-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-full text-xs font-medium"
            >
              {op}
            </span>
          ))}
        </div>
      </section>

      <div className="text-[10px] text-[var(--color-text-muted)] text-center pb-4">
        Analytics generated at{" "}
        {new Date(data.generatedAt).toLocaleTimeString("en-AU", {
          timeZone: "Australia/Sydney",
        })}{" "}
        AEST · Past days use schedule proxy (GTFS static repeats weekly)
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: string;
  color?: string;
}) {
  return (
    <div className="px-3 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-1">
        {icon && <span className="mr-1">{icon}</span>}
        {label}
      </div>
      <div className={`text-2xl font-bold font-mono tabular-nums ${color || ""}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
      {icon && <span className="text-sm font-bold text-[var(--color-accent)]">{icon}</span>}
      <div>
        <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">{label}</div>
        <div className="text-sm font-bold font-mono tabular-nums">{value}</div>
      </div>
    </div>
  );
}

// ─── Delay Heatmap ──────────────────────────────────────────────────────────

function DelayHeatmap({ hourly }: { hourly: HourBucket[] }) {
  const maxDelayed = Math.max(1, ...hourly.map((h) => h.delayed));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 overflow-x-auto">
      {/* Direction labels */}
      <div className="grid grid-cols-[auto_1fr] gap-3">
        {/* Row: Towards Newcastle */}
        <div className="flex items-center text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium whitespace-nowrap">
          ↑ Newcastle
        </div>
        <div className="flex gap-[2px]">
          {hourly.map((h) => {
            const intensity = maxDelayed > 0 ? h.delayedNewcastle / maxDelayed : 0;
            return (
              <div
                key={`nc-${h.hour}`}
                className="flex-1 min-w-[18px] h-8 rounded-sm relative group cursor-default"
                style={{
                  backgroundColor:
                    h.delayedNewcastle === 0
                      ? "var(--color-surface-2)"
                      : `rgba(245, 158, 11, ${0.15 + intensity * 0.75})`,
                }}
                title={`${String(h.hour).padStart(2, "0")}:00 — ${h.delayedNewcastle} delayed to Newcastle`}
              >
                {h.delayedNewcastle > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-amber-200">
                    {h.delayedNewcastle}
                  </span>
                )}
                {/* Tooltip */}
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[10px] whitespace-nowrap shadow-xl">
                  <div className="font-bold">{String(h.hour).padStart(2, "0")}:00</div>
                  <div>{h.towardsNewcastle} trains ↑ · {h.delayedNewcastle} delayed</div>
                  {h.avgDelay > 0 && <div>Avg delay: {h.avgDelay}m</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Row: Towards Sydney */}
        <div className="flex items-center text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium whitespace-nowrap">
          ↓ Sydney
        </div>
        <div className="flex gap-[2px]">
          {hourly.map((h) => {
            const intensity = maxDelayed > 0 ? h.delayedSydney / maxDelayed : 0;
            return (
              <div
                key={`sy-${h.hour}`}
                className="flex-1 min-w-[18px] h-8 rounded-sm relative group cursor-default"
                style={{
                  backgroundColor:
                    h.delayedSydney === 0
                      ? "var(--color-surface-2)"
                      : `rgba(239, 68, 68, ${0.15 + intensity * 0.75})`,
                }}
                title={`${String(h.hour).padStart(2, "0")}:00 — ${h.delayedSydney} delayed to Sydney`}
              >
                {h.delayedSydney > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-red-200">
                    {h.delayedSydney}
                  </span>
                )}
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[10px] whitespace-nowrap shadow-xl">
                  <div className="font-bold">{String(h.hour).padStart(2, "0")}:00</div>
                  <div>{h.towardsSydney} trains ↓ · {h.delayedSydney} delayed</div>
                  {h.avgDelay > 0 && <div>Avg delay: {h.avgDelay}m</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hour labels */}
        <div />
        <div className="flex gap-[2px]">
          {hourly.map((h) => (
            <div
              key={`lbl-${h.hour}`}
              className="flex-1 min-w-[18px] text-center text-[8px] text-[var(--color-text-muted)] tabular-nums"
            >
              {h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : ""}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--color-text-muted)]">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--color-surface-2)" }} />
          No delays
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(245, 158, 11, 0.4)" }} />
          Some delays (↑)
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.4)" }} />
          Some delays (↓)
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(245, 158, 11, 0.9)" }} />
          Peak delays
        </div>
      </div>
    </div>
  );
}

// ─── Week Chart ─────────────────────────────────────────────────────────────

function WeekChart({ days }: { days: DayStat[] }) {
  const maxTotal = Math.max(1, ...days.map((d) => d.total));
  // Reverse so oldest is on the left
  const reversed = [...days].reverse();

  return (
    <div className="flex items-end gap-2 h-32">
      {reversed.map((day, i) => {
        const isToday = i === reversed.length - 1;
        const heightPct = (day.total / maxTotal) * 100;
        const passengerPct = day.total > 0 ? (day.passenger / day.total) * 100 : 0;
        const delayPct = day.total > 0 ? (day.delayed / day.total) * 100 : 0;

        return (
          <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
            {/* Bar */}
            <div className="w-full flex flex-col items-center relative group">
              <div
                className={`w-full rounded-t-md transition-all relative overflow-hidden ${
                  isToday ? "ring-1 ring-[var(--color-accent)]" : ""
                }`}
                style={{ height: `${Math.max(4, heightPct)}%`, minHeight: "4px" }}
              >
                {/* Passenger portion */}
                <div
                  className="absolute bottom-0 left-0 right-0 bg-blue-500/60"
                  style={{ height: `${passengerPct}%` }}
                />
                {/* Freight portion */}
                <div
                  className="absolute top-0 left-0 right-0 bg-purple-500/60"
                  style={{ height: `${100 - passengerPct}%` }}
                />
                {/* Delay overlay */}
                {delayPct > 0 && (
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-amber-500/40"
                    style={{ height: `${delayPct}%` }}
                  />
                )}
              </div>

              {/* Hover tooltip */}
              <div className="hidden group-hover:block absolute bottom-full mb-1 z-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[10px] whitespace-nowrap shadow-xl">
                <div className="font-bold">{day.label}</div>
                <div>{day.total} total · {day.passenger} pass · {day.freight} freight</div>
                <div>{day.delayed} delayed · {day.cancelled} cancelled</div>
              </div>
            </div>

            {/* Label */}
            <div className={`text-[9px] tabular-nums ${isToday ? "text-[var(--color-accent)] font-bold" : "text-[var(--color-text-muted)]"}`}>
              {day.label.split(" ")[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
