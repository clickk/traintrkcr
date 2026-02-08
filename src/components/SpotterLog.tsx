"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import type { Movement } from "@/lib/types";
import { useConsistHistory, type ConsistRecord } from "@/hooks/useConsistHistory";
import { getSunPosition } from "@/lib/sun-position";
import { useWeather, windDirectionLabel } from "@/hooks/useWeather";
import { WATCH_POINT } from "@/lib/stations";

interface SpotterLogProps {
  movements: Movement[];
}

export default function SpotterLog({ movements }: SpotterLogProps) {
  const { records, totalSightings, uniqueConsists, clearHistory } =
    useConsistHistory(movements);
  const { weather } = useWeather();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sunInfo = useMemo(
    () => getSunPosition(WATCH_POINT.lat, WATCH_POINT.lng),
    []
  );

  // Active consists in current movements
  const activeConsists = useMemo(() => {
    const active = new Map<string, Movement>();
    for (const m of movements) {
      if (m.vehiclePosition?.vehicleId) {
        active.set(m.vehiclePosition.vehicleId, m);
      }
    }
    return active;
  }, [movements]);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Unique Consists" value={String(uniqueConsists)} icon="🚆" />
        <StatCard label="Total Sightings" value={String(totalSightings)} icon="👁" />
        <StatCard
          label="Active Now"
          value={String(activeConsists.size)}
          icon="📡"
          highlight
        />
      </div>

      {/* Current conditions banner */}
      <div className="px-4 py-3 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            {/* Sun */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-lg">
                {sunInfo.isUp ? (sunInfo.goldenHour ? "🌅" : "☀️") : "🌙"}
              </span>
              <div>
                <span className="font-medium">{sunInfo.elevation}° elev</span>
                <span className="text-[var(--color-text-muted)]"> · {sunInfo.azimuth}° az</span>
              </div>
            </div>

            {/* Weather */}
            {weather && (
              <div className="flex items-center gap-2 text-sm">
                <span>{weather.temperature}°C</span>
                <span className="text-[var(--color-text-muted)]">
                  💨 {weather.windSpeed}km/h {windDirectionLabel(weather.windDirection)}
                </span>
                <span className="text-[var(--color-text-muted)]">
                  ☁️ {weather.cloudCover}%
                </span>
              </div>
            )}
          </div>

          <div className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            sunInfo.newcastleSideLight === "good" || sunInfo.sydneySideLight === "good"
              ? "bg-green-500/20 text-green-400"
              : sunInfo.newcastleSideLight === "ok" || sunInfo.sydneySideLight === "ok"
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-red-500/20 text-red-400"
          }`}>
            {sunInfo.recommendation}
          </div>
        </div>
      </div>

      {/* Consist History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Consist History
          </h3>
          {records.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {records.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-muted)]">
            <div className="text-3xl mb-2">📋</div>
            <div className="text-sm">No consists spotted yet</div>
            <div className="text-xs mt-1">
              Consists are logged automatically when live vehicle data is received
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((record) => {
              const isActive = activeConsists.has(record.vehicleId);
              const isExpanded = expandedId === record.vehicleId;

              return (
                <div
                  key={record.vehicleId}
                  className={`rounded-xl border transition-colors ${
                    isActive
                      ? "bg-green-500/5 border-green-500/30"
                      : "bg-[var(--color-surface)] border-[var(--color-border)]"
                  }`}
                >
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : record.vehicleId)
                    }
                    className="w-full text-left px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-live" />
                        )}
                        <span className="text-sm font-bold text-blue-400">
                          {record.consistLength}-car
                        </span>
                        <span className="text-xs font-mono text-[var(--color-text-muted)]">
                          {record.carNumbers.slice(0, 3).join(" · ")}
                          {record.carNumbers.length > 3 && " …"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {record.sightings}x seen
                        </span>
                        <svg
                          className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2">
                      {/* All car numbers */}
                      <div className="flex flex-wrap gap-1">
                        {record.carNumbers.map((car, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono px-1.5 py-0.5 bg-[var(--color-surface-2)] rounded border border-[var(--color-border)]"
                          >
                            {car}
                          </span>
                        ))}
                      </div>

                      {/* Service history */}
                      {record.services.length > 0 && (
                        <div>
                          <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1">
                            Services observed
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {record.services.map((svc, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20"
                              >
                                {svc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-4 text-[10px] text-[var(--color-text-muted)]">
                        <span>
                          First: {format(new Date(record.firstSeen), "dd MMM HH:mm")}
                        </span>
                        <span>
                          Last: {format(new Date(record.lastSeen), "dd MMM HH:mm")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`px-4 py-3 rounded-xl border ${
        highlight
          ? "bg-green-500/10 border-green-500/30"
          : "bg-[var(--color-surface)] border-[var(--color-border)]"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold font-mono tabular-nums">{value}</div>
    </div>
  );
}
