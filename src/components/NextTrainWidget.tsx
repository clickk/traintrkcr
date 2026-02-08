"use client";

import { useState, useEffect, useMemo } from "react";
import type { Movement } from "@/lib/types";
import {
  WATCH_POINT_DISTANCE,
  CARDIFF_DISTANCE,
  KOTARA_DISTANCE,
} from "@/lib/rail-geometry";

interface NextTrainWidgetProps {
  movements: Movement[];
}

interface NextTrainInfo {
  movement: Movement;
  minutesAway: number;
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
    return `${h}h ${rm}m`;
  }
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "--:--";
  return new Date(isoString).toLocaleTimeString("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NextTrainWidget({ movements }: NextTrainWidgetProps) {
  const [, setTick] = useState(0);

  // Tick every second for countdown
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const nextTrains = useMemo(() => {
    const now = Date.now();
    const upcoming: (NextTrainInfo & { direction: string })[] = [];

    for (const m of movements) {
      if (m.status === "cancelled" || m.status === "completed") continue;
      const secs = estimateSecondsToWatchPoint(m);
      if (secs === null || secs < -30) continue; // Skip if already well past

      upcoming.push({
        movement: m,
        minutesAway: secs / 60,
        secondsAway: secs,
        direction: m.direction,
      });
    }

    // Sort by soonest
    upcoming.sort((a, b) => a.secondsAway - b.secondsAway);

    // Get next in each direction that hasn't passed yet
    const nextNewcastle = upcoming.find(
      (t) => t.direction === "towards-newcastle" && t.secondsAway > -10
    );
    const nextSydney = upcoming.find(
      (t) => t.direction === "towards-sydney" && t.secondsAway > -10
    );

    return { nextNewcastle, nextSydney };
  }, [movements]);

  // Recompute actual seconds live
  const liveNewcastle = nextTrains.nextNewcastle
    ? estimateSecondsToWatchPoint(nextTrains.nextNewcastle.movement)
    : null;
  const liveSydney = nextTrains.nextSydney
    ? estimateSecondsToWatchPoint(nextTrains.nextSydney.movement)
    : null;

  if (!nextTrains.nextNewcastle && !nextTrains.nextSydney) return null;

  return (
    <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-2">
      <div className="flex items-center justify-center gap-6 max-w-3xl mx-auto">
        {/* Next towards Newcastle */}
        <NextTrainPill
          label="Newcastle"
          arrow="&uarr;"
          info={nextTrains.nextNewcastle}
          liveSeconds={liveNewcastle}
          accentColor="text-blue-400"
          bgColor="bg-blue-500/10"
          borderColor="border-blue-500/20"
        />

        <div className="w-px h-8 bg-[var(--color-border)]" />

        {/* Next towards Sydney */}
        <NextTrainPill
          label="Sydney"
          arrow="&darr;"
          info={nextTrains.nextSydney}
          liveSeconds={liveSydney}
          accentColor="text-emerald-400"
          bgColor="bg-emerald-500/10"
          borderColor="border-emerald-500/20"
        />
      </div>
    </div>
  );
}

function NextTrainPill({
  label,
  arrow,
  info,
  liveSeconds,
  accentColor,
  bgColor,
  borderColor,
}: {
  label: string;
  arrow: string;
  info?: NextTrainInfo;
  liveSeconds: number | null;
  accentColor: string;
  bgColor: string;
  borderColor: string;
}) {
  if (!info) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span dangerouslySetInnerHTML={{ __html: arrow }} />
        <span>{label}</span>
        <span className="italic">No upcoming</span>
      </div>
    );
  }

  const secs = liveSeconds ?? info.secondsAway;
  const isImminent = secs > 0 && secs <= 60;
  const isPassing = secs <= 0 && secs > -30;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border ${bgColor} ${borderColor} ${
        isImminent || isPassing ? "animate-pulse-live" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`text-sm font-bold ${accentColor}`}
          dangerouslySetInnerHTML={{ __html: arrow }}
        />
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-text-muted)]">
          {formatTime(info.movement.estimatedTime || info.movement.scheduledTime)}
        </span>
        <span className={`text-sm font-mono font-bold tabular-nums ${accentColor}`}>
          {isPassing ? (
            <span className="text-amber-400">PASSING</span>
          ) : (
            formatCountdown(Math.max(0, secs))
          )}
        </span>
      </div>

      <div className="hidden sm:flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--color-text-muted)] truncate max-w-[120px]">
          {info.movement.serviceType === "freight" ? "Freight" : info.movement.operator}
        </span>
        {info.movement.delayMinutes != null && info.movement.delayMinutes > 0 && (
          <span className="text-[10px] font-semibold text-amber-400">
            +{info.movement.delayMinutes}m
          </span>
        )}
      </div>
    </div>
  );
}
