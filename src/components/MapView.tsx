"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { Movement } from "@/lib/types";
import { format } from "date-fns";
import { CORRIDOR_CENTER, WATCH_POINT } from "@/lib/stations";
import {
  RAIL_PATH,
  CARDIFF_TRACK_POS,
  KOTARA_TRACK_POS,
  WATCH_POINT_TRACK_POS,
  CARDIFF_DISTANCE,
  KOTARA_DISTANCE,
  TOTAL_PATH_LENGTH,
  interpolateOnPath,
} from "@/lib/rail-geometry";

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
  showWeather?: boolean;
}

// ─── RainViewer radar hook ──────────────────────────────────────────────────

interface RadarFrame {
  path: string;
  time: number;
}

function useRainRadar(enabled: boolean) {
  const [radarUrl, setRadarUrl] = useState<string | null>(null);
  const [radarTime, setRadarTime] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRadarUrl(null);
      setRadarTime(null);
      return;
    }

    async function fetchRadar() {
      try {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
        if (!res.ok) return;
        const data = await res.json();
        const host: string = data.host || "https://tilecache.rainviewer.com";
        const frames: RadarFrame[] = data.radar?.past || [];
        if (frames.length === 0) return;
        const latest = frames[frames.length - 1];
        // Tile URL: {host}{path}/{size}/{z}/{x}/{y}/{color}/{options}.png
        // color=6 (original), options=1_1 (smooth + snow)
        const url = `${host}${latest.path}/256/{z}/{x}/{y}/6/1_1.png`;
        setRadarUrl(url);
        setRadarTime(
          new Date(latest.time * 1000).toLocaleTimeString("en-AU", {
            timeZone: "Australia/Sydney",
            hour: "2-digit",
            minute: "2-digit",
          })
        );
      } catch {
        // Silently fail — radar is non-critical
      }
    }

    fetchRadar();
    const interval = setInterval(fetchRadar, 5 * 60 * 1000); // Refresh every 5 min
    return () => clearInterval(interval);
  }, [enabled]);

  return { radarUrl, radarTime };
}

function formatTime(isoString?: string): string {
  if (!isoString) return "--:--";
  return format(new Date(isoString), "HH:mm");
}

// ─── Estimate position along the corridor ───────────────────────────────────

function estimatePositionT(movement: Movement, now: number): number | null {
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

  // For towards-newcastle: Cardiff first (south), then Kotara (north)
  // For towards-sydney: Kotara first (north), then Cardiff (south)
  const entryTime = isTowardsNewcastle ? cardiffTime : kotaraTime;
  const exitTime = isTowardsNewcastle ? kotaraTime : cardiffTime;
  const entryDist = isTowardsNewcastle ? CARDIFF_DISTANCE : KOTARA_DISTANCE;
  const exitDist = isTowardsNewcastle ? KOTARA_DISTANCE : CARDIFF_DISTANCE;

  // Approach/departure padding: ~3 min before entry, ~3 min after exit
  const APPROACH_MS = 3 * 60 * 1000;
  const approachStart = entryTime - APPROACH_MS;
  const departureEnd = exitTime + APPROACH_MS;

  if (now < approachStart || now > departureEnd) return null;

  // Approaching station
  if (now < entryTime) {
    const approachProgress = (now - approachStart) / APPROACH_MS;
    const approachStartDist = isTowardsNewcastle ? 0 : TOTAL_PATH_LENGTH;
    const dist =
      approachStartDist + (entryDist - approachStartDist) * approachProgress;
    return dist / TOTAL_PATH_LENGTH;
  }

  // Between stations
  if (now <= exitTime) {
    const corridorProgress =
      exitTime === entryTime
        ? 1
        : (now - entryTime) / (exitTime - entryTime);
    const dist = entryDist + (exitDist - entryDist) * corridorProgress;
    return dist / TOTAL_PATH_LENGTH;
  }

  // Departing
  const departProgress = (now - exitTime) / APPROACH_MS;
  const departEndDist = isTowardsNewcastle ? TOTAL_PATH_LENGTH : 0;
  const dist = exitDist + (departEndDist - exitDist) * departProgress;
  return dist / TOTAL_PATH_LENGTH;
}

// ─── Animated positions hook ────────────────────────────────────────────────

interface EstimatedPosition {
  movement: Movement;
  lat: number;
  lng: number;
  isLive: boolean;
}

function useAnimatedPositions(movements: Movement[]): EstimatedPosition[] {
  const [positions, setPositions] = useState<EstimatedPosition[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(0 as unknown as ReturnType<typeof setTimeout>);

  const update = useCallback(() => {
    const now = Date.now();
    const result: EstimatedPosition[] = [];

    for (const m of movements) {
      if (m.status === "cancelled" || m.status === "completed") continue;

      // Real GTFS-RT vehicle position takes priority
      if (m.vehiclePosition) {
        result.push({
          movement: m,
          lat: m.vehiclePosition.lat,
          lng: m.vehiclePosition.lng,
          isLive: true,
        });
        continue;
      }

      // Estimate position along the real rail geometry
      const t = estimatePositionT(m, now);
      if (t !== null) {
        const [lat, lng] = interpolateOnPath(t);
        result.push({ movement: m, lat, lng, isLive: false });
      }
    }

    setPositions(result);
  }, [movements]);

  useEffect(() => {
    update();
    const tick = () => {
      update();
      timerRef.current = setTimeout(tick, 500);
    };
    timerRef.current = setTimeout(tick, 500);
    return () => clearTimeout(timerRef.current);
  }, [update]);

  return positions;
}

// ─── Map Component ──────────────────────────────────────────────────────────

function MapViewInner({ movements, onSelectMovement, showWeather = false }: MapViewProps) {
  const [leafletReady, setLeafletReady] = useState(false);
  const [weatherOn, setWeatherOn] = useState(showWeather);
  const { radarUrl, radarTime } = useRainRadar(weatherOn);
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
          iconRetinaUrl:
            "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl:
            "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl:
            "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });

        setLeafletReady(true);
      } catch (err) {
        console.error("Failed to load Leaflet:", err);
      }
    }
    loadLeaflet();
  }, []);

  if (
    !leafletReady ||
    !MapContainer ||
    !TileLayer ||
    !CircleMarker ||
    !Polyline ||
    !Popup
  ) {
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

  function trainColor(m: Movement, isLive: boolean): string {
    if (m.serviceType === "freight") return "#a855f7";
    if (m.status === "delayed") return "#f59e0b";
    if (isLive) return "#22c55e";
    return "#60a5fa";
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

        {/* Rain radar overlay */}
        {weatherOn && radarUrl && (
          <TL
            url={radarUrl}
            attribution='<a href="https://www.rainviewer.com/">RainViewer</a>'
            opacity={0.45}
            zIndex={400}
          />
        )}

        {/* Real rail corridor geometry */}
        <PL
          positions={RAIL_PATH}
          pathOptions={{
            color: "#475569",
            weight: 5,
            opacity: 0.5,
          }}
        />
        {/* Brighter centre stroke */}
        <PL
          positions={RAIL_PATH}
          pathOptions={{
            color: "#64748b",
            weight: 2,
            opacity: 0.7,
          }}
        />

        {/* Cardiff Station marker */}
        <CM
          center={CARDIFF_TRACK_POS}
          radius={10}
          pathOptions={{
            fillColor: "#3b82f6",
            fillOpacity: 0.9,
            color: "#93c5fd",
            weight: 3,
          }}
        >
          <PP>
            <div className="text-gray-900">
              <strong>Cardiff Station</strong>
              <br />
              <span className="text-xs">
                {
                  movements.filter((m) => m.cardiffCall?.stopsHere).length
                }{" "}
                stopping services
              </span>
            </div>
          </PP>
        </CM>

        {/* Kotara Station marker */}
        <CM
          center={KOTARA_TRACK_POS}
          radius={10}
          pathOptions={{
            fillColor: "#22c55e",
            fillOpacity: 0.9,
            color: "#86efac",
            weight: 3,
          }}
        >
          <PP>
            <div className="text-gray-900">
              <strong>Kotara Station</strong>
              <br />
              <span className="text-xs">
                {
                  movements.filter((m) => m.kotaraCall?.stopsHere).length
                }{" "}
                stopping services
              </span>
            </div>
          </PP>
        </CM>

        {/* User watch point */}
        <CM
          center={WATCH_POINT_TRACK_POS}
          radius={8}
          pathOptions={{
            fillColor: "#f97316",
            fillOpacity: 0.9,
            color: "#fdba74",
            weight: 3,
          }}
        >
          <PP>
            <div className="text-gray-900">
              <strong>📍 My Location</strong>
              <br />
              <span className="text-xs">
                32°56&apos;38.6&quot;S 151°41&apos;30.9&quot;E
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
              fillColor: trainColor(ep.movement, ep.isLive),
              fillOpacity: 0.95,
              color: ep.isLive ? "#ffffff" : "#94a3b8",
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
                {ep.movement.delayMinutes != null &&
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
                  {ep.isLive ? "Live GPS position" : "Estimated from timetable"}
                </span>
              </div>
            </PP>
          </CM>
        ))}
      </MC>

      {/* Weather toggle */}
      <button
        onClick={() => setWeatherOn((w) => !w)}
        className={`absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          weatherOn
            ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
            : "bg-[var(--color-surface)]/90 border-[var(--color-border)] text-[var(--color-text-muted)]"
        } backdrop-blur-sm`}
        title="Toggle rain radar overlay"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
        Rain
        {weatherOn && radarTime && (
          <span className="text-[10px] text-cyan-300/70">{radarTime}</span>
        )}
      </button>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[var(--color-border)] rounded-lg px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-1.5">
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
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            My Location
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full bg-green-400"
              style={{ border: "2px solid #fff" }}
            />
            Live GPS
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full bg-blue-400"
              style={{ border: "1.5px dashed #94a3b8" }}
            />
            Estimated
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            Freight
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            Delayed
          </div>
          {weatherOn && (
            <div className="flex items-center gap-2 text-xs text-cyan-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/40" />
              Rain Radar
            </div>
          )}
        </div>
      </div>

      {/* Sidebar: trains in corridor */}
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
                    {formatTime(
                      ep.movement.estimatedTime || ep.movement.scheduledTime
                    )}
                  </span>
                  <span className="text-[11px] truncate text-[var(--color-text-muted)]">
                    {ep.movement.direction === "towards-newcastle" ? "↑" : "↓"}{" "}
                    {ep.movement.destination}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] ml-5 mt-0.5">
                  {ep.isLive ? "● Live" : "◌ Estimated"} ·{" "}
                  {ep.movement.operator}
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
export default function MapView(props: MapViewProps & { showWeather?: boolean }) {
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
