"use client";

import { format, differenceInMinutes } from "date-fns";
import type { Movement } from "@/lib/types";
import ConfidenceBadge from "./ConfidenceBadge";

interface MovementCardProps {
  movement: Movement;
  onSelect: (movement: Movement) => void;
  compact?: boolean;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "--:--";
  return format(new Date(isoString), "HH:mm");
}

function getStatusColor(status: Movement["status"]): string {
  switch (status) {
    case "live":
      return "text-green-400";
    case "delayed":
      return "text-amber-400";
    case "cancelled":
      return "text-red-400";
    case "completed":
      return "text-slate-500";
    default:
      return "text-slate-400";
  }
}

function getStatusBg(status: Movement["status"]): string {
  switch (status) {
    case "live":
      return "border-green-500/20";
    case "delayed":
      return "border-amber-500/20";
    case "cancelled":
      return "border-red-500/20";
    default:
      return "border-[var(--color-border)]";
  }
}

function getTypeIcon(type: Movement["serviceType"]): string {
  return type === "freight" ? "🚂" : "🚆";
}

function getDirectionArrow(direction: Movement["direction"]): string {
  return direction === "towards-newcastle" ? "↑" : "↓";
}

export default function MovementCard({
  movement,
  onSelect,
  compact = false,
}: MovementCardProps) {
  const primaryCall =
    movement.direction === "towards-newcastle"
      ? movement.cardiffCall
      : movement.kotaraCall;

  const secondaryCall =
    movement.direction === "towards-newcastle"
      ? movement.kotaraCall
      : movement.cardiffCall;

  const scheduledTime = primaryCall?.scheduledDeparture || movement.scheduledTime;
  const estimatedTime =
    primaryCall?.estimatedDeparture || movement.estimatedTime;

  const isDelayed =
    movement.delayMinutes !== undefined && movement.delayMinutes > 0;
  const isCancelled = movement.status === "cancelled";

  if (compact) {
    return (
      <button
        onClick={() => onSelect(movement)}
        className={`w-full text-left px-3 py-2 bg-[var(--color-surface-2)] border ${getStatusBg(movement.status)} rounded-lg hover:bg-[var(--color-surface-3)] transition-colors animate-slide-in`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">{getTypeIcon(movement.serviceType)}</span>
            <span className={`text-lg font-mono font-bold tabular-nums ${isCancelled ? "line-through text-red-400" : "text-[var(--color-text)]"}`}>
              {formatTime(scheduledTime)}
            </span>
            {estimatedTime && estimatedTime !== scheduledTime && (
              <span className={`text-sm font-mono font-semibold ${isDelayed ? "text-amber-400" : "text-green-400"}`}>
                {formatTime(estimatedTime)}
              </span>
            )}
            {isDelayed && (
              <span className="text-xs text-amber-400 font-medium">
                +{movement.delayMinutes}m
              </span>
            )}
          </div>
          <ConfidenceBadge confidence={movement.confidence} compact />
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-muted)]">
          <span className="font-medium">{getDirectionArrow(movement.direction)}</span>
          <span className="truncate">{movement.destination}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{movement.operator}</span>
          {movement.passesThrough && (
            <>
              <span className="shrink-0">·</span>
              <span className="text-[var(--color-text-muted)] italic">passes through</span>
            </>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelect(movement)}
      className={`w-full text-left px-4 py-3 bg-[var(--color-surface-2)] border ${getStatusBg(movement.status)} rounded-xl hover:bg-[var(--color-surface-3)] transition-colors animate-slide-in`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="text-xl">{getTypeIcon(movement.serviceType)}</span>
            <span className={`text-[10px] font-bold uppercase mt-0.5 ${getStatusColor(movement.status)}`}>
              {movement.status}
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-xl font-mono font-bold tabular-nums ${isCancelled ? "line-through text-red-400/60" : "text-[var(--color-text)]"}`}
              >
                {formatTime(scheduledTime)}
              </span>
              {estimatedTime && estimatedTime !== scheduledTime && (
                <span
                  className={`text-base font-mono font-semibold ${isDelayed ? "text-amber-400" : "text-green-400"}`}
                >
                  → {formatTime(estimatedTime)}
                </span>
              )}
              {isDelayed && (
                <span className="px-1.5 py-0.5 text-xs font-bold bg-amber-400/10 text-amber-400 rounded">
                  +{movement.delayMinutes} min late
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-sm font-medium text-[var(--color-text)]">
                {getDirectionArrow(movement.direction)} {movement.destination}
              </span>
            </div>
          </div>
        </div>
        <ConfidenceBadge confidence={movement.confidence} compact />
      </div>

      {/* Details row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-[var(--color-text-muted)]">
        <span>{movement.operator}</span>
        <span className="text-[var(--color-border)]">|</span>
        <span>{movement.serviceName}</span>
        {movement.consistType && (
          <>
            <span className="text-[var(--color-border)]">|</span>
            <span>{movement.consistType}</span>
          </>
        )}
        {movement.passesThrough && (
          <>
            <span className="text-[var(--color-border)]">|</span>
            <span className="italic text-purple-400">Passes through corridor</span>
          </>
        )}
      </div>

      {/* Corridor stops */}
      <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-[var(--color-border)]/50">
        {movement.cardiffCall && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <div>
              <span className="text-xs font-medium">Cardiff</span>
              <span className="text-xs text-[var(--color-text-muted)] ml-1.5">
                {movement.cardiffCall.stopsHere ? "stops" : "passes"}{" "}
                {formatTime(movement.cardiffCall.estimatedDeparture || movement.cardiffCall.scheduledDeparture)}
              </span>
            </div>
          </div>
        )}
        <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
        {movement.kotaraCall && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <div>
              <span className="text-xs font-medium">Kotara</span>
              <span className="text-xs text-[var(--color-text-muted)] ml-1.5">
                {movement.kotaraCall.stopsHere ? "stops" : "passes"}{" "}
                {formatTime(movement.kotaraCall.estimatedDeparture || movement.kotaraCall.scheduledDeparture)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Disruptions */}
      {movement.disruptions.length > 0 && (
        <div className="mt-2">
          {movement.disruptions.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs text-red-400"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
              </svg>
              {d}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
