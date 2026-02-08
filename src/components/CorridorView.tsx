"use client";

import { format, differenceInMinutes } from "date-fns";
import type { Movement } from "@/lib/types";
import ConfidenceBadge from "./ConfidenceBadge";

interface CorridorViewProps {
  movements: Movement[];
  onSelectMovement: (movement: Movement) => void;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "--:--";
  return format(new Date(isoString), "HH:mm");
}

function getStatusDot(status: Movement["status"]): string {
  switch (status) {
    case "live":
      return "bg-green-400";
    case "delayed":
      return "bg-amber-400";
    case "cancelled":
      return "bg-red-400";
    case "completed":
      return "bg-slate-600";
    default:
      return "bg-slate-400";
  }
}

function getTypeBorder(type: Movement["serviceType"]): string {
  return type === "freight"
    ? "border-l-purple-500"
    : "border-l-blue-500";
}

export default function CorridorView({
  movements,
  onSelectMovement,
}: CorridorViewProps) {
  const now = new Date();

  // Group movements by time blocks (15 min intervals)
  const timeBlocks = new Map<string, Movement[]>();
  for (const m of movements) {
    const time = new Date(m.estimatedTime || m.scheduledTime);
    const blockKey = `${format(time, "HH")}:${Math.floor(time.getMinutes() / 15) * 15 === 0 ? "00" : String(Math.floor(time.getMinutes() / 15) * 15)}`;
    if (!timeBlocks.has(blockKey)) {
      timeBlocks.set(blockKey, []);
    }
    timeBlocks.get(blockKey)!.push(m);
  }

  return (
    <div className="p-4">
      <div className="max-w-4xl mx-auto">
        {/* Corridor Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-400" />
              <span className="text-sm font-medium">Cardiff</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-16 h-0.5 bg-[var(--color-border)]" />
              <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <div className="w-16 h-0.5 bg-[var(--color-border)]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className="text-sm font-medium">Kotara</span>
            </div>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {movements.length} movements
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Central timeline line */}
          <div className="absolute left-[120px] top-0 bottom-0 w-px bg-[var(--color-border)]" />

          {movements.length === 0 ? (
            <div className="text-center py-12 text-[var(--color-text-muted)]">
              No movements to display for the selected filters
            </div>
          ) : (
            <div className="space-y-1">
              {movements.map((movement, idx) => {
                const time = new Date(
                  movement.estimatedTime || movement.scheduledTime
                );
                const isNowish =
                  Math.abs(differenceInMinutes(time, now)) <= 5;

                return (
                  <button
                    key={movement.id}
                    onClick={() => onSelectMovement(movement)}
                    className={`w-full text-left flex items-center gap-0 hover:bg-[var(--color-surface-2)]/50 rounded-lg transition-colors py-1.5 px-2 group animate-slide-in ${
                      movement.status === "cancelled" ? "opacity-50" : ""
                    }`}
                  >
                    {/* Time column */}
                    <div className="w-[100px] text-right pr-4 shrink-0">
                      <span
                        className={`text-sm font-mono tabular-nums ${
                          movement.status === "cancelled"
                            ? "line-through text-red-400/60"
                            : isNowish
                            ? "text-[var(--color-accent)] font-bold"
                            : "text-[var(--color-text)]"
                        }`}
                      >
                        {formatTime(
                          movement.estimatedTime || movement.scheduledTime
                        )}
                      </span>
                      {movement.estimatedTime &&
                        movement.estimatedTime !== movement.scheduledTime && (
                          <div className="text-[10px] text-[var(--color-text-muted)] line-through">
                            {formatTime(movement.scheduledTime)}
                          </div>
                        )}
                    </div>

                    {/* Timeline dot */}
                    <div className="relative w-[40px] flex justify-center shrink-0">
                      <span
                        className={`w-3 h-3 rounded-full border-2 border-[var(--color-bg)] ${getStatusDot(
                          movement.status
                        )} ${
                          movement.status === "live"
                            ? "animate-pulse-live"
                            : ""
                        } z-10`}
                      />
                    </div>

                    {/* Movement info */}
                    <div
                      className={`flex-1 flex items-center gap-3 pl-3 py-1.5 border-l-2 ${getTypeBorder(
                        movement.serviceType
                      )} group-hover:bg-[var(--color-surface-2)] rounded-r-lg px-3`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">
                            {movement.serviceType === "freight" ? "🚂" : "🚆"}
                          </span>
                          <span className="text-sm font-medium truncate">
                            {movement.direction === "towards-newcastle"
                              ? "↑"
                              : "↓"}{" "}
                            {movement.destination}
                          </span>
                          {movement.delayMinutes !== undefined &&
                            movement.delayMinutes > 0 && (
                              <span className="text-xs text-amber-400 font-medium shrink-0">
                                +{movement.delayMinutes}m
                              </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                          <span>{movement.operator}</span>
                          <span>·</span>
                          <span>
                            {movement.passesThrough
                              ? "Passes through"
                              : `Stops at ${[
                                  movement.cardiffCall?.stopsHere
                                    ? "Cardiff"
                                    : null,
                                  movement.kotaraCall?.stopsHere
                                    ? "Kotara"
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" & ")}`}
                          </span>
                        </div>
                      </div>

                      {/* Corridor progress visualization */}
                      <div className="hidden sm:flex items-center gap-1 shrink-0">
                        <CorridorProgress movement={movement} />
                      </div>

                      <ConfidenceBadge
                        confidence={movement.confidence}
                        compact
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CorridorProgress({ movement }: { movement: Movement }) {
  const cardiffTime =
    movement.cardiffCall?.estimatedDeparture ||
    movement.cardiffCall?.scheduledDeparture;
  const kotaraTime =
    movement.kotaraCall?.estimatedDeparture ||
    movement.kotaraCall?.scheduledDeparture;

  const now = Date.now();
  let progress = 0; // 0 = before Cardiff, 50 = between, 100 = past Kotara

  if (cardiffTime && kotaraTime) {
    const cTime = new Date(cardiffTime).getTime();
    const kTime = new Date(kotaraTime).getTime();

    if (movement.direction === "towards-newcastle") {
      if (now < cTime) progress = 0;
      else if (now > kTime) progress = 100;
      else progress = ((now - cTime) / (kTime - cTime)) * 100;
    } else {
      if (now < kTime) progress = 0;
      else if (now > cTime) progress = 100;
      else progress = ((now - kTime) / (cTime - kTime)) * 100;
    }
  }

  const isActive = movement.status === "live";

  return (
    <div className="flex items-center gap-1 w-20">
      {/* Cardiff dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          movement.cardiffCall?.stopsHere ? "bg-blue-400" : "bg-slate-600"
        }`}
      />
      {/* Track */}
      <div className="flex-1 h-1 bg-[var(--color-border)] rounded-full relative overflow-hidden">
        {isActive && (
          <div
            className="absolute top-0 left-0 h-full bg-green-400 rounded-full transition-all duration-1000"
            style={{ width: `${Math.max(5, Math.min(95, progress))}%` }}
          />
        )}
      </div>
      {/* Kotara dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          movement.kotaraCall?.stopsHere ? "bg-emerald-400" : "bg-slate-600"
        }`}
      />
    </div>
  );
}
