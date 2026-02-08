"use client";

import { useState, useEffect } from "react";
import type { Movement } from "@/lib/types";
import {
  WATCH_POINT_DISTANCE,
  CARDIFF_DISTANCE,
  KOTARA_DISTANCE,
} from "@/lib/rail-geometry";

interface ETACountdownProps {
  movements: Movement[];
  maxItems?: number;
}

interface ETAEntry {
  movement: Movement;
  secondsAway: number;
}

function estimateSecondsToWatchPoint(movement: Movement): number | null {
  const cardiffTime = movement.cardiffCall
    ? new Date(
        movement.cardiffCall.estimatedDeparture ||
          movement.cardiffCall.scheduledDeparture ||
          ""
      ).getTime()
    : null;
  const kotaraTime = movement.kotaraCall
    ? new Date(
        movement.kotaraCall.estimatedDeparture ||
          movement.kotaraCall.scheduledDeparture ||
          ""
      ).getTime()
    : null;

  if (!cardiffTime || !kotaraTime) return null;
  if (isNaN(cardiffTime) || isNaN(kotaraTime)) return null;

  const isTowardsNewcastle = movement.direction === "towards-newcastle";
  const entryTime = isTowardsNewcastle ? cardiffTime : kotaraTime;
  const exitTime = isTowardsNewcastle ? kotaraTime : cardiffTime;
  const entryDist = isTowardsNewcastle ? CARDIFF_DISTANCE : KOTARA_DISTANCE;
  const exitDist = isTowardsNewcastle ? KOTARA_DISTANCE : CARDIFF_DISTANCE;

  if (exitTime === entryTime) return null;

  const watchDist = WATCH_POINT_DISTANCE;
  const watchTime =
    entryTime +
    ((watchDist - entryDist) / (exitDist - entryDist)) * (exitTime - entryTime);

  return (watchTime - Date.now()) / 1000;
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "NOW";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  if (m > 59) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m ${s.toString().padStart(2, "0")}s`;
  }
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "--:--";
  return new Date(isoString).toLocaleTimeString("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ETACountdown({
  movements,
  maxItems = 6,
}: ETACountdownProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Compute live ETAs
  const entries: ETAEntry[] = [];
  for (const m of movements) {
    if (m.status === "cancelled" || m.status === "completed") continue;
    const secs = estimateSecondsToWatchPoint(m);
    if (secs === null) continue;
    if (secs < -30) continue; // Already passed
    entries.push({ movement: m, secondsAway: secs });
  }

  entries.sort((a, b) => a.secondsAway - b.secondsAway);
  const visible = entries.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-3">
          ETA at My Location
        </h3>
        <div className="text-sm text-[var(--color-text-muted)] italic text-center py-6">
          No upcoming trains near your location
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-3">
        ETA at My Location
      </h3>
      <div className="space-y-2">
        {visible.map((entry) => {
          const secs = estimateSecondsToWatchPoint(entry.movement) ?? entry.secondsAway;
          const isImminent = secs > 0 && secs <= 60;
          const isPassing = secs <= 0;
          const m = entry.movement;

          return (
            <div
              key={m.id}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${
                isPassing
                  ? "bg-amber-500/15 border-amber-500/30 animate-pulse-live"
                  : isImminent
                  ? "bg-red-500/10 border-red-500/25 animate-pulse-live"
                  : secs < 300
                  ? "bg-[var(--color-surface-2)] border-[var(--color-border)]"
                  : "bg-[var(--color-surface)] border-[var(--color-border)]"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg">
                  {m.serviceType === "freight" ? "🚂" : "🚆"}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">
                      {m.direction === "towards-newcastle" ? "↑" : "↓"}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {m.destination}
                    </span>
                    {m.delayMinutes != null && m.delayMinutes > 0 && (
                      <span className="text-[10px] font-semibold text-amber-400 shrink-0">
                        +{m.delayMinutes}m late
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    {m.operator} · Sched{" "}
                    {formatTime(m.scheduledTime)}
                    {m.estimatedTime && m.estimatedTime !== m.scheduledTime && (
                      <span className="text-amber-400">
                        {" "}
                        Est {formatTime(m.estimatedTime)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0 ml-3">
                <div
                  className={`text-lg font-mono font-bold tabular-nums ${
                    isPassing
                      ? "text-amber-400"
                      : isImminent
                      ? "text-red-400"
                      : secs < 300
                      ? "text-blue-400"
                      : "text-[var(--color-text)]"
                  }`}
                >
                  {formatCountdown(Math.max(0, secs))}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)]">
                  {isPassing ? "at location" : "to location"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
