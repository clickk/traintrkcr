"use client";

import { format } from "date-fns";
import { useEffect, useState, useRef, useCallback } from "react";
import type { Movement, ServiceAlert } from "@/lib/types";
import ConfidenceBadge from "./ConfidenceBadge";
import { getConsistInfo } from "@/lib/consist-images";
import { WATCH_POINT } from "@/lib/stations";

interface MovementDetailsProps {
  movement: Movement;
  onClose: () => void;
  alerts?: ServiceAlert[];
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

/** Haversine distance in km */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format seconds as Xm Ys */
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Arriving now";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m`;
  }
  return `${mins}m ${secs}s`;
}

/** Cause label to human-friendly + icon */
function causeInfo(cause: string): { label: string; icon: string } {
  switch (cause) {
    case "MAINTENANCE": return { label: "Planned maintenance", icon: "🔧" };
    case "CONSTRUCTION": return { label: "Construction work", icon: "🏗️" };
    case "WEATHER": return { label: "Weather conditions", icon: "🌧️" };
    case "ACCIDENT": return { label: "Accident", icon: "⚠️" };
    case "TECHNICAL_PROBLEM": return { label: "Technical issue", icon: "⚡" };
    case "STRIKE": return { label: "Industrial action", icon: "✊" };
    case "POLICE_ACTIVITY": return { label: "Police activity", icon: "🚔" };
    case "MEDICAL_EMERGENCY": return { label: "Medical emergency", icon: "🚑" };
    case "DEMONSTRATION": return { label: "Demonstration", icon: "📢" };
    case "HOLIDAY": return { label: "Holiday schedule", icon: "📅" };
    default: return { label: cause.replace(/_/g, " ").toLowerCase(), icon: "ℹ️" };
  }
}

function effectLabel(effect: string): string {
  switch (effect) {
    case "NO_SERVICE": return "No service";
    case "REDUCED_SERVICE": return "Reduced service";
    case "SIGNIFICANT_DELAYS": return "Significant delays";
    case "MODIFIED_SERVICE": return "Modified service";
    case "DETOUR": return "Detour in effect";
    case "ADDITIONAL_SERVICE": return "Additional service";
    case "STOP_MOVED": return "Stop relocated";
    default: return effect.replace(/_/g, " ").toLowerCase();
  }
}

// ─── Mini Map Component (dynamic Leaflet) ───────────────────────────────────

function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;

      if (cancelled || !mapRef.current) return;

      // Don't recreate if already initialized
      if (mapInstanceRef.current) {
        // Just update marker position
        const map = mapInstanceRef.current as import("leaflet").Map;
        const marker = markerRef.current as import("leaflet").Marker;
        map.setView([lat, lng], map.getZoom());
        marker.setLatLng([lat, lng]);
        return;
      }

      const map = L.map(mapRef.current, {
        center: [lat, lng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Watch point marker
      L.circleMarker([WATCH_POINT.lat, WATCH_POINT.lng], {
        radius: 5,
        color: "#f59e0b",
        fillColor: "#f59e0b",
        fillOpacity: 0.4,
        weight: 1,
      }).addTo(map).bindTooltip("Watch point", { permanent: false, direction: "top" });

      // Train position — pulsing dot
      const trainIcon = L.divIcon({
        className: "train-live-dot",
        html: `<div style="position:relative;width:16px;height:16px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.3;animation:pulse-ring 1.5s ease-out infinite;"></div>
          <div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid #fff;"></div>
        </div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = L.marker([lat, lng], { icon: trainIcon }).addTo(map);
      marker.bindTooltip("Train position", { permanent: false, direction: "top" });

      // Draw line from train to watch point
      L.polyline(
        [[lat, lng], [WATCH_POINT.lat, WATCH_POINT.lng]],
        { color: "#6366f1", weight: 2, dashArray: "6,4", opacity: 0.6 }
      ).addTo(map);

      // Fit to show both points
      const bounds = L.latLngBounds([
        [lat, lng],
        [WATCH_POINT.lat, WATCH_POINT.lng],
      ]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });

      mapInstanceRef.current = map;
      markerRef.current = marker;
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as import("leaflet").Map).remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapRef}
      className="w-full h-48 rounded-lg overflow-hidden border border-[var(--color-border)]"
      style={{ zIndex: 0 }}
    />
  );
}

// ─── ETA Countdown Hook ─────────────────────────────────────────────────────

function useETACountdown(movement: Movement) {
  const [countdown, setCountdown] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  const compute = useCallback(() => {
    const vp = movement.vehiclePosition;
    if (!vp) {
      setCountdown(null);
      setDistanceKm(null);
      return;
    }

    const dist = haversineKm(vp.lat, vp.lng, WATCH_POINT.lat, WATCH_POINT.lng);
    setDistanceKm(Math.round(dist * 100) / 100);

    // Method 1: Use speed from vehicle data or estimated speed
    const speedKmh = vp.estimatedSpeedKmh || (vp.speed ? vp.speed * 3.6 : 0);

    if (speedKmh > 5 && dist > 0.05) {
      // ETA from speed
      const etaSeconds = (dist / speedKmh) * 3600;
      setCountdown(formatCountdown(etaSeconds));
      return;
    }

    // Method 2: Use scheduled/estimated stop times
    // Find the next corridor stop time
    const wpTime = getEstimatedWatchPointTime(movement);
    if (wpTime) {
      const now = Date.now();
      const diffSec = (wpTime - now) / 1000;
      if (diffSec > 0) {
        setCountdown(formatCountdown(diffSec));
        return;
      } else if (diffSec > -120) {
        setCountdown("Passing now");
        return;
      }
    }

    // If stopped or very slow and close
    if (dist < 0.1) {
      setCountdown("At watch point");
    } else {
      setCountdown(null);
    }
  }, [movement]);

  useEffect(() => {
    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [compute]);

  return { countdown, distanceKm };
}

/**
 * Estimate the time the train will pass the watch point based on
 * scheduled/estimated times at corridor stops.
 */
function getEstimatedWatchPointTime(movement: Movement): number | null {
  // Watch point is between Cardiff and Kotara
  const cardiffTime = movement.cardiffCall
    ? new Date(
        movement.cardiffCall.estimatedDeparture ||
        movement.cardiffCall.scheduledDeparture ||
        movement.cardiffCall.estimatedArrival ||
        movement.cardiffCall.scheduledArrival || ""
      ).getTime()
    : NaN;

  const kotaraTime = movement.kotaraCall
    ? new Date(
        movement.kotaraCall.estimatedArrival ||
        movement.kotaraCall.scheduledArrival ||
        movement.kotaraCall.estimatedDeparture ||
        movement.kotaraCall.scheduledDeparture || ""
      ).getTime()
    : NaN;

  if (movement.direction === "towards-newcastle") {
    // Cardiff → watch → Kotara
    // Watch point is ~70% of the way between Cardiff and Kotara
    if (!isNaN(cardiffTime) && !isNaN(kotaraTime)) {
      return cardiffTime + (kotaraTime - cardiffTime) * 0.7;
    }
    if (!isNaN(kotaraTime)) return kotaraTime - 60000; // ~1 min before Kotara
    if (!isNaN(cardiffTime)) return cardiffTime + 120000; // ~2 min after Cardiff
  } else {
    // Kotara → watch → Cardiff
    // Watch point is ~30% of the way from Kotara to Cardiff
    if (!isNaN(kotaraTime) && !isNaN(cardiffTime)) {
      return kotaraTime + (cardiffTime - kotaraTime) * 0.3;
    }
    if (!isNaN(cardiffTime)) return cardiffTime - 60000;
    if (!isNaN(kotaraTime)) return kotaraTime + 60000;
  }

  return null;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function MovementDetails({
  movement,
  onClose,
  alerts = [],
}: MovementDetailsProps) {
  const consistInfo = getConsistInfo(movement.consistType);
  const vp = movement.vehiclePosition;
  const { countdown, distanceKm } = useETACountdown(movement);

  // Match alerts to this movement
  const movementAlerts = alerts.filter((a) => {
    if (!a.isActive) return false;
    if (movement.tripId && a.tripIds.includes(movement.tripId)) return true;
    if (movement.routeId && a.routeIds.some((rid) => movement.routeId!.startsWith(rid.split("_")[0]))) return true;
    return false;
  });

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

          {/* ETA badge */}
          {countdown && (
            <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-indigo-500/15 border border-indigo-500/30 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <div>
                <div className="text-[10px] text-indigo-300 uppercase tracking-wider">ETA to watch point</div>
                <div className="text-lg font-bold text-indigo-300 tabular-nums">{countdown}</div>
              </div>
              {distanceKm != null && (
                <div className="text-xs text-indigo-400/70 ml-2">{distanceKm} km</div>
              )}
            </div>
          )}

          {/* Origin → Destination */}
          <div className="hidden lg:flex items-center gap-3 px-4 py-2 bg-[var(--color-surface-2)] rounded-xl">
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

        {/* ETA badge (mobile) */}
        {countdown && (
          <div className="md:hidden flex items-center gap-2 mx-6 mt-4 px-3 py-2 bg-indigo-500/15 border border-indigo-500/30 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <div>
              <div className="text-[10px] text-indigo-300 uppercase tracking-wider">ETA to watch point</div>
              <div className="text-lg font-bold text-indigo-300 tabular-nums">{countdown}</div>
            </div>
            {distanceKm != null && (
              <div className="text-xs text-indigo-400/70 ml-2">{distanceKm} km</div>
            )}
          </div>
        )}

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

            {/* Service Alerts / Delay Reasons */}
            {movementAlerts.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-orange-400 font-medium mb-2">
                  Service Alerts & Delay Causes
                </h3>
                <div className="space-y-2">
                  {movementAlerts.map((alert) => {
                    const ci = causeInfo(alert.cause);
                    return (
                      <div
                        key={alert.id}
                        className="px-4 py-3 bg-orange-500/10 border border-orange-500/20 rounded-xl"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span>{ci.icon}</span>
                          <span className="text-sm font-medium text-orange-300">
                            {ci.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                            {effectLabel(alert.effect)}
                          </span>
                        </div>
                        <div className="text-sm text-orange-200/80">{alert.header}</div>
                        {alert.description && alert.description !== alert.header && (
                          <div className="text-xs text-orange-200/60 mt-1 line-clamp-3">
                            {alert.description}
                          </div>
                        )}
                        {alert.activePeriods.length > 0 && (
                          <div className="text-[10px] text-orange-400/60 mt-1.5">
                            {alert.activePeriods.map((p, i) => (
                              <span key={i}>
                                {format(new Date(p.start), "dd MMM HH:mm")}
                                {" → "}
                                {p.end ? format(new Date(p.end), "dd MMM HH:mm") : "ongoing"}
                                {i < alert.activePeriods.length - 1 ? " · " : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
            <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[var(--color-surface-2)] rounded-xl">
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

            {/* ── Live Position Map ──────────────────────── */}
            {vp && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-3">
                  Live Position
                </h3>
                <MiniMap lat={vp.lat} lng={vp.lng} />
                <div className="grid grid-cols-2 gap-3 mt-3 px-3 py-3 bg-[var(--color-surface-2)] rounded-lg">
                  <DetailField label="Latitude" value={vp.lat.toFixed(6)} />
                  <DetailField label="Longitude" value={vp.lng.toFixed(6)} />
                  {distanceKm != null && (
                    <DetailField label="Distance to Watch" value={`${distanceKm} km`} />
                  )}
                  {vp.estimatedSpeedKmh != null && (
                    <DetailField label="Est. Speed" value={`${vp.estimatedSpeedKmh} km/h`} />
                  )}
                  {vp.bearing != null && vp.bearing !== 0 && (
                    <DetailField label="Bearing" value={`${Math.round(vp.bearing)}°`} />
                  )}
                  <DetailField label="Position Time" value={formatDateTime(vp.timestamp)} />
                </div>
              </div>
            )}

            {/* ETA panel (when no live position, use schedule-based) */}
            {!vp && countdown && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-3">
                  Estimated Arrival
                </h3>
                <div className="flex items-center gap-3 px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <div className="w-3 h-3 rounded-full bg-indigo-400 animate-pulse" />
                  <div>
                    <div className="text-xs text-indigo-300">ETA to watch point (schedule-based)</div>
                    <div className="text-xl font-bold text-indigo-300 tabular-nums">{countdown}</div>
                  </div>
                </div>
              </div>
            )}

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
