"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { Movement } from "@/lib/types";
import { format } from "date-fns";
import { CARDIFF, KOTARA, CORRIDOR_CENTER } from "@/lib/stations";

// Dynamic import for Leaflet (SSR-incompatible)
let L: typeof import("leaflet") | null = null;
let MapContainer: typeof import("react-leaflet").MapContainer | null = null;
let TileLayer: typeof import("react-leaflet").TileLayer | null = null;
let Popup: typeof import("react-leaflet").Popup | null = null;
let Polyline: typeof import("react-leaflet").Polyline | null = null;
let CircleMarker: typeof import("react-leaflet").CircleMarker | null = null;

interface MapViewProps {
  movements: Movement[];
  onSelectMovement: (movement: Movement) => void;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "--:--";
  return format(new Date(isoString), "HH:mm");
}

// ─── Rail path with more intermediate points for smooth interpolation ────────
// Cardiff is south/west, Kotara is north/east on the Main North line.
// Path runs roughly SW→NE. These points trace the actual rail corridor.
const RAIL_PATH: [number, number][] = [
  // Approach from south (before Cardiff)
  [-32.9520, 151.6610],
  [-32.9500, 151.6640],
  [-32.9485, 151.6660],
  // Cardiff station
  [CARDIFF.lat, CARDIFF.lng],
  // Between Cardiff and Kotara
  [-32.9458, 151.6705],
  [-32.9448, 151.6735],
  [-32.9438, 151.6760],
  [-32.9425, 151.6790],
  [-32.9415, 151.6820],
  [-32.9405, 151.6850],
  // Kotara station
  [KOTARA.lat, KOTARA.lng],
  // Continue north (after Kotara)
  [-32.9385, 151.6905],
  [-32.9370, 151.6930],
  [-32.9355, 151.6955],
];

// Cardiff is at index 3, Kotara at index 10 in RAIL_PATH
const CARDIFF_PATH_INDEX = 3;
const KOTARA_PATH_INDEX = 10;

// ─── Path interpolation utilities ───────────────────────────────────────────

/** Cumulative distances along the rail path (in arbitrary units). */
function computeCumulativeDistances(path: [number, number][]): number[] {
  const distances = [0];
  for (let i = 1; i < path.length; i++) {
    const [lat1, lng1] = path[i - 1];
    const [lat2, lng2] = path[i];
    const d = Math.sqrt((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2);
    distances.push(distances[i - 1] + d);
  }
  return distances;
}

const CUMULATIVE = computeCumulativeDistances(RAIL_PATH);
const TOTAL_LENGTH = CUMULATIVE[CUMULATIVE.length - 1];
const CARDIFF_DISTANCE = CUMULATIVE[CARDIFF_PATH_INDEX];
const KOTARA_DISTANCE = CUMULATIVE[KOTARA_PATH_INDEX];

/** Interpolate a position along the rail path given a normalised t (0..1 over full path). */
function interpolateOnPath(t: number): [number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const targetDist = clamped * TOTAL_LENGTH;

  // Find the segment
  for (let i = 1; i < CUMULATIVE.length; i++) {
    if (CUMULATIVE[i] >= targetDist) {
      const segStart = CUMULATIVE[i - 1];
      const segEnd = CUMULATIVE[i];
      const segT = segEnd === segStart ? 0 : (targetDist - segStart) / (segEnd - segStart);
      const [lat1, lng1] = RAIL_PATH[i - 1];
      const [lat2, lng2] = RAIL_PATH[i];
      return [lat1 + (lat2 - lat1) * segT, lng1 + (lng2 - lng1) * segT];
    }
  }
  return RAIL_PATH[RAIL_PATH.length - 1];
}

/**
 * Estimate where a movement currently is on the corridor based on
 * scheduled/estimated times at Cardiff and Kotara.
 *
 * Returns a normalised t value (0..1 along full path) or null if
 * the movement isn't currently in the corridor window.
 */
function estimatePositionT(movement: Movement, now: number): number | null {
  // Get corridor entry/exit times
  const cardiffTime = movement.cardiffCall
    ? new Date(
        movement.cardiffCall.estimatedDeparture ||
          movement.cardiffCall.scheduledDeparture ||
          movement.cardiffCall.estimatedArrival ||
          movement.cardiffCall.scheduledArrival ||
          ""
      ).getTime()
    : null;

  const kotaraTime = movement.kotaraCall
    ? new Date(
        movement.kotaraCall.estimatedDeparture ||
          movement.kotaraCall.scheduledDeparture ||
          movement.kotaraCall.estimatedArrival ||
          movement.kotaraCall.scheduledArrival ||
          ""
      ).getTime()
    : null;

  if (!cardiffTime || !kotaraTime) return null;
  if (isNaN(cardiffTime) || isNaN(kotaraTime)) return null;

  const isTowardsNewcastle = movement.direction === "towards-newcastle";

  // For towards-newcastle: Cardiff first, then Kotara
  // For towards-sydney: Kotara first, then Cardiff
  const entryTime = isTowardsNewcastle ? cardiffTime : kotaraTime;
  const exitTime = isTowardsNewcastle ? kotaraTime : cardiffTime;
  const entryDist = isTowardsNewcastle ? CARDIFF_DISTANCE : KOTARA_DISTANCE;
  const exitDist = isTowardsNewcastle ? KOTARA_DISTANCE : CARDIFF_DISTANCE;

  // Add approach/departure padding: ~3 min before entry, ~3 min after exit
  const APPROACH_MS = 3 * 60 * 1000;
  const approachStart = entryTime - APPROACH_MS;
  const departureEnd = exitTime + APPROACH_MS;

  if (now < approachStart || now > departureEnd) return null;

  // Approaching
  if (now < entryTime) {
    const approachProgress = (now - approachStart) / APPROACH_MS;
    const approachStartDist = isTowardsNewcastle ? 0 : TOTAL_LENGTH;
    const dist = approachStartDist + (entryDist - approachStartDist) * approachProgress;
    return dist / TOTAL_LENGTH;
  }

  // Between stations
  if (now <= exitTime) {
    const corridorProgress = exitTime === entryTime ? 1 : (now - entryTime) / (exitTime - entryTime);
    const dist = entryDist + (exitDist - entryDist) * corridorProgress;
    return dist / TOTAL_LENGTH;
  }

  // Departing
  const departProgress = (now - exitTime) / APPROACH_MS;
  const departEndDist = isTowardsNewcastle ? TOTAL_LENGTH : 0;
  const dist = exitDist + (departEndDist - exitDist) * departProgress;
  return dist / TOTAL_LENGTH;
}

// ─── Animated positions hook ────────────────────────────────────────────────

interface EstimatedPosition {
  movement: Movement;
  lat: number;
  lng: number;
  isLive: boolean; // true if from GTFS-RT vehicle position, false if estimated
}

function useAnimatedPositions(movements: Movement[]): EstimatedPosition[] {
  const [positions, setPositions] = useState<EstimatedPosition[]>([]);
  const animFrameRef = useRef<number>(0);

  const update = useCallback(() => {
    const now = Date.now();
    const newPositions: EstimatedPosition[] = [];

    for (const m of movements) {
      if (m.status === "cancelled" || m.status === "completed") continue;

      // If we have a real vehicle position, use it
      if (m.vehiclePosition) {
        newPositions.push({
          movement: m,
          lat: m.vehiclePosition.lat,
          lng: m.vehiclePosition.lng,
          isLive: true,
        });
        continue;
      }

      // Otherwise estimate position along rail path
      const t = estimatePositionT(m, now);
      if (t !== null) {
        const [lat, lng] = interpolateOnPath(t);
        newPositions.push({
          movement: m,
          lat,
          lng,
          isLive: false,
        });
      }
    }

    setPositions(newPositions);
  }, [movements]);

  useEffect(() => {
    // Update immediately
    update();

    // Then animate at ~2fps (smooth enough, low CPU)
    const tick = () => {
      update();
      animFrameRef.current = window.setTimeout(tick, 500);
    };
    animFrameRef.current = window.setTimeout(tick, 500);

    return () => {
      if (animFrameRef.current) clearTimeout(animFrameRef.current);
    };
  }, [update]);

  return positions;
}

// ─── Map Component ──────────────────────────────────────────────────────────

function MapViewInner({ movements, onSelectMovement }: MapViewProps) {
  const [leafletReady, setLeafletReady] = useState(false);
  const estimatedPositions = useAnimatedPositions(movements);

  useEffect(() => {
    async function loadLeaflet() {
      try {
        const leaflet = await import("leaflet");
        const rl = await import("react-leaflet");
        L = leaflet.default || leaflet;
        MapContainer = rl.MapContainer;
        TileLayer = rl.TileLayer;
        Popup = rl.Popup;
        Polyline = rl.Polyline;
        CircleMarker = rl.CircleMarker;

        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });

        setLeafletReady(true);
      } catch (err) {
        console.error("Failed to load Leaflet:", err);
      }
    }
    loadLeaflet();
  }, []);

  if (!leafletReady || !MapContainer || !TileLayer || !CircleMarker || !Polyline || !Popup) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-[var(--color-surface)]">
        <div className="text-[var(--color-text-muted)]">Loading map...</div>
      </div>
    );
  }

  const MC = MapContainer;
  const TL = TileLayer;
  const CM = CircleMarker;
  const PL = Polyline;
  const PP = Popup;

  function getTrainColor(m: Movement, isLive: boolean): string {
    if (m.serviceType === "freight") return "#a855f7";
    if (m.status === "delayed") return "#f59e0b";
    if (isLive) return "#22c55e";
    return "#60a5fa"; // estimated passenger = blue
  }

  function getTrainBorder(isLive: boolean): string {
    return isLive ? "#ffffff" : "#94a3b8";
  }

  return (
    <div className="relative h-[500px] lg:h-[600px] rounded-xl overflow-hidden border border-[var(--color-border)]">
      <MC
        center={[CORRIDOR_CENTER.lat, CORRIDOR_CENTER.lng]}
        zoom={14}
        className="h-full w-full"
        zoomControl={true}
      >
        <TL
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Full rail corridor line */}
        <PL
          positions={RAIL_PATH}
          pathOptions={{
            color: "#4a5568",
            weight: 4,
            dashArray: "8 4",
            opacity: 0.6,
          }}
        />

        {/* Cardiff Station */}
        <CM
          center={[CARDIFF.lat, CARDIFF.lng]}
          radius={10}
          pathOptions={{
            fillColor: "#3b82f6",
            fillOpacity: 0.9,
            color: "#60a5fa",
            weight: 3,
          }}
        >
          <PP>
            <div className="text-gray-900">
              <strong>Cardiff Station</strong>
              <br />
              <span className="text-xs">
                {movements.filter((m) => m.cardiffCall?.stopsHere).length} stopping services
              </span>
            </div>
          </PP>
        </CM>

        {/* Kotara Station */}
        <CM
          center={[KOTARA.lat, KOTARA.lng]}
          radius={10}
          pathOptions={{
            fillColor: "#22c55e",
            fillOpacity: 0.9,
            color: "#4ade80",
            weight: 3,
          }}
        >
          <PP>
            <div className="text-gray-900">
              <strong>Kotara Station</strong>
              <br />
              <span className="text-xs">
                {movements.filter((m) => m.kotaraCall?.stopsHere).length} stopping services
              </span>
            </div>
          </PP>
        </CM>

        {/* Train positions — live + estimated */}
        {estimatedPositions.map((ep) => (
          <CM
            key={ep.movement.id}
            center={[ep.lat, ep.lng]}
            radius={ep.isLive ? 7 : 6}
            pathOptions={{
              fillColor: getTrainColor(ep.movement, ep.isLive),
              fillOpacity: 0.9,
              color: getTrainBorder(ep.isLive),
              weight: ep.isLive ? 2.5 : 1.5,
              dashArray: ep.isLive ? undefined : "3 2",
            }}
            eventHandlers={{
              click: () => onSelectMovement(ep.movement),
            }}
          >
            <PP>
              <div className="text-gray-900 min-w-[200px]">
                <strong>
                  {ep.movement.serviceType === "freight" ? "🚂" : "🚆"}{" "}
                  {ep.movement.runId || ep.movement.tripId}
                </strong>
                <br />
                <span className="text-xs">
                  {ep.movement.direction === "towards-newcastle" ? "↑" : "↓"}{" "}
                  {ep.movement.destination}
                </span>
                <br />
                <span className="text-xs">{ep.movement.operator}</span>
                {ep.movement.delayMinutes !== undefined &&
                  ep.movement.delayMinutes > 0 && (
                    <>
                      <br />
                      <span className="text-xs text-amber-600 font-semibold">
                        +{ep.movement.delayMinutes} min late
                      </span>
                    </>
                  )}
                <br />
                <span className="text-[10px] text-gray-500 italic">
                  {ep.isLive ? "Live position" : "Estimated position"}
                </span>
              </div>
            </PP>
          </CM>
        ))}
      </MC>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[var(--color-border)] rounded-lg px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-1">
          Legend
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            Cardiff Station
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            Kotara Station
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 border border-white" style={{ borderWidth: 2 }} />
            Live position
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 border border-slate-400" style={{ borderWidth: 1, borderStyle: "dashed" }} />
            Estimated position
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            Freight
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            Delayed
          </div>
        </div>
      </div>

      {/* Sidebar: movements in corridor now */}
      <div className="absolute top-4 right-4 z-[1000] w-64 max-h-[calc(100%-2rem)] overflow-y-auto bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[var(--color-border)] rounded-lg">
        <div className="px-3 py-2 border-b border-[var(--color-border)]">
          <div className="text-xs font-medium">
            In Corridor ({estimatedPositions.length})
          </div>
        </div>
        <div className="p-2 space-y-1">
          {estimatedPositions.length === 0 ? (
            <div className="text-[11px] text-[var(--color-text-muted)] text-center py-3 italic">
              No trains in corridor right now
            </div>
          ) : (
            estimatedPositions.map((ep) => (
              <button
                key={ep.movement.id}
                onClick={() => onSelectMovement(ep.movement)}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-2)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">
                    {ep.movement.serviceType === "freight" ? "🚂" : "🚆"}
                  </span>
                  <span className="text-xs font-mono font-bold tabular-nums">
                    {formatTime(ep.movement.estimatedTime || ep.movement.scheduledTime)}
                  </span>
                  <span className="text-[11px] truncate text-[var(--color-text-muted)]">
                    {ep.movement.direction === "towards-newcastle" ? "↑" : "↓"}{" "}
                    {ep.movement.destination}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] ml-5 mt-0.5">
                  {ep.isLive ? "● Live" : "◌ Estimated"} · {ep.movement.operator}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// SSR wrapper
export default function MapView(props: MapViewProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
        <div className="text-[var(--color-text-muted)]">Loading map...</div>
      </div>
    );
  }

  return <MapViewInner {...props} />;
}
