"use client";

import { format } from "date-fns";
import type { Movement } from "@/lib/types";
import ConfidenceBadge from "./ConfidenceBadge";
import { getConsistInfo } from "@/lib/consist-images";

interface MovementDetailsProps {
  movement: Movement;
  onClose: () => void;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "--:--";
  return format(new Date(isoString), "HH:mm:ss");
}

function formatDateTime(isoString?: string): string {
  if (!isoString) return "N/A";
  return format(new Date(isoString), "dd MMM yyyy HH:mm:ss");
}

function occupancyLabel(status: number): string {
  switch (status) {
    case 0: return "Empty";
    case 1: return "Many seats";
    case 2: return "Few seats";
    case 3: return "Standing only";
    case 4: return "Crushed";
    case 5: return "Full";
    default: return "Unknown";
  }
}

export default function MovementDetails({
  movement,
  onClose,
}: MovementDetailsProps) {
  const consistInfo = getConsistInfo(movement.consistType);
  const vp = movement.vehiclePosition;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[80vw] max-h-[85vh] overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[var(--color-surface)] border-b border-[var(--color-border)] rounded-t-2xl">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-[var(--color-text)]">
                  {movement.runId || movement.tripId?.split(".")[0] || "Movement"}
                </h2>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    movement.status === "live"
                      ? "bg-green-500/20 text-green-400"
                      : movement.status === "delayed"
                        ? "bg-amber-500/20 text-amber-400"
                        : movement.status === "cancelled"
                          ? "bg-red-500/20 text-red-400"
                          : movement.status === "completed"
                            ? "bg-slate-500/20 text-slate-400"
                            : "bg-blue-500/20 text-blue-400"
                  }`}
                >
                  {movement.status.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                {movement.serviceName}
              </p>
            </div>
          </div>

          {/* Origin → Destination */}
          <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-[var(--color-surface-2)] rounded-xl">
            <div className="text-right">
              <div className="text-[10px] text-[var(--color-text-muted)]">From</div>
              <div className="text-sm font-semibold">{movement.origin}</div>
            </div>
            <svg className="w-5 h-5 text-[var(--color-text-muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)]">To</div>
              <div className="text-sm font-semibold">{movement.destination}</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--color-surface-2)] rounded-lg transition-colors"
            aria-label="Close details"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-0">
          {/* ── Left Column ─────────────────────────────── */}
          <div className="px-6 py-5 space-y-5 lg:border-r border-[var(--color-border)]">
            {/* Delay banner */}
            {movement.delayMinutes !== undefined && movement.delayMinutes > 0 && (
              <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <div className="text-sm font-medium text-amber-400">
                  Delayed by {movement.delayMinutes} minute{movement.delayMinutes !== 1 ? "s" : ""}
                </div>
                <div className="text-xs text-amber-400/70 mt-0.5">
                  Scheduled: {formatTime(movement.scheduledTime)} → Estimated: {formatTime(movement.estimatedTime)}
                </div>
              </div>
            )}

            {/* Identity grid */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-3">
                Service Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Trip ID" value={movement.tripId || "N/A"} />
                <DetailField label="Run ID" value={movement.runId || "N/A"} />
                <DetailField label="Route ID" value={movement.routeId || "N/A"} />
                <DetailField label="Direction" value={movement.direction === "towards-newcastle" ? "Towards Newcastle" : "Towards Sydney"} />
                <DetailField label="Service Type" value={movement.serviceType === "passenger" ? "Passenger" : "Freight"} />
                <DetailField label="Operator" value={movement.operator} />
              </div>
            </div>

            {/* Consist type + photo */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-3">
                Consist
              </h3>
              <div className="flex gap-4">
                {consistInfo && (
                  <div className="w-32 h-20 rounded-lg overflow-hidden border border-[var(--color-border)] shrink-0">
                    <img
                      src={consistInfo.imageUrl}
                      alt={consistInfo.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-medium">
                    {consistInfo?.name || movement.consistType || "Unknown"}
                  </div>
                  {vp?.consistLength && (
                    <div className="text-sm text-blue-400 font-medium">
                      {vp.consistLength}-car consist
                    </div>
                  )}
                  {vp?.occupancyStatus != null && vp.occupancyStatus > 0 && (
                    <div className="text-xs text-[var(--color-text-muted)]">
                      Occupancy: {occupancyLabel(vp.occupancyStatus)}
                    </div>
                  )}
                  {consistInfo && (
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      {consistInfo.attribution}
                    </div>
                  )}
                </div>
              </div>

              {/* Car numbers */}
              {vp?.carNumbers && vp.carNumbers.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1.5">Car Numbers</div>
                  <div className="flex flex-wrap gap-1">
                    {vp.carNumbers.map((car, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-mono px-2 py-0.5 bg-[var(--color-surface-2)] rounded border border-[var(--color-border)]"
                      >
                        {car}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confidence */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-2">
                Data Confidence
              </h3>
              <ConfidenceBadge confidence={movement.confidence} showReason />
              <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                Sources: {movement.confidence.sources.join(", ")}
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                Last updated: {formatDateTime(movement.confidence.lastUpdated)}
              </div>
            </div>

            {/* Disruptions */}
            {movement.disruptions.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-red-400 font-medium mb-2">
                  Disruptions
                </h3>
                <div className="space-y-1.5">
                  {movement.disruptions.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400"
                    >
                      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                      </svg>
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right Column ────────────────────────────── */}
          <div className="px-6 py-5 space-y-5">
            {/* Origin → Destination (mobile only) */}
            <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[var(--color-surface-2)] rounded-xl">
              <div className="text-center flex-1">
                <div className="text-xs text-[var(--color-text-muted)]">From</div>
                <div className="text-sm font-semibold">{movement.origin}</div>
              </div>
              <svg className="w-5 h-5 text-[var(--color-text-muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <div className="text-center flex-1">
                <div className="text-xs text-[var(--color-text-muted)]">To</div>
                <div className="text-sm font-semibold">{movement.destination}</div>
              </div>
            </div>

            {/* Corridor Stops */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-3">
                Corridor Stops
              </h3>
              <div className="space-y-2">
                {movement.stops.map((stop, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2.5 bg-[var(--color-surface-2)] rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${stop.stopsHere ? "bg-blue-400" : "bg-slate-600"}`}
                      />
                      <div>
                        <span className="text-sm font-medium">{stop.stopName}</span>
                        <span className="text-xs text-[var(--color-text-muted)] ml-2">
                          {stop.stopsHere ? "Stops" : "Passes through"}
                        </span>
                        {stop.platform && (
                          <span className="text-xs text-blue-400 ml-2">
                            Plt {stop.platform}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono tabular-nums">
                        {formatTime(stop.scheduledDeparture || stop.scheduledArrival)}
                      </div>
                      {(stop.estimatedDeparture || stop.estimatedArrival) && (
                        <div className="text-xs font-mono text-amber-400">
                          Est: {formatTime(stop.estimatedDeparture || stop.estimatedArrival)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Vehicle Position */}
            {vp && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-3">
                  Live Position
                </h3>
                <div className="grid grid-cols-2 gap-3 px-3 py-3 bg-[var(--color-surface-2)] rounded-lg">
                  <DetailField
                    label="Latitude"
                    value={vp.lat.toFixed(6)}
                  />
                  <DetailField
                    label="Longitude"
                    value={vp.lng.toFixed(6)}
                  />
                  {vp.estimatedSpeedKmh != null && (
                    <DetailField
                      label="Est. Speed"
                      value={`${vp.estimatedSpeedKmh} km/h`}
                    />
                  )}
                  {vp.bearing != null && vp.bearing !== 0 && (
                    <DetailField
                      label="Bearing"
                      value={`${Math.round(vp.bearing)}°`}
                    />
                  )}
                  <DetailField
                    label="Position Time"
                    value={formatDateTime(vp.timestamp)}
                  />
                  <DetailField
                    label="Source"
                    value={vp.source}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
        {label}
      </div>
      <div className="text-sm text-[var(--color-text)] font-mono break-all">
        {value}
      </div>
    </div>
  );
}
