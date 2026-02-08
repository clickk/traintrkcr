"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
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
  getBearingAtT,
  getBearingAtPosition,
  estimateSpeed,
} from "@/lib/rail-geometry";
import { getSunPosition, type SunInfo } from "@/lib/sun-position";
import { useWeather, windDirectionLabel, type WeatherData } from "@/hooks/useWeather";

// Dynamic import for Leaflet (SSR-incompatible)
let L: typeof import("leaflet") | null = null;
let MapContainer: typeof import("react-leaflet").MapContainer | null = null;
let TileLayer: typeof import("react-leaflet").TileLayer | null = null;
let Popup: typeof import("react-leaflet").Popup | null = null;
let Polyline: typeof import("react-leaflet").Polyline | null = null;
let CircleMarker: typeof import("react-leaflet").CircleMarker | null = null;
let Marker: typeof import("react-leaflet").Marker | null = null;

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
    const interval = setInterval(fetchRadar, 5 * 60 * 1000);
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

  const entryTime = isTowardsNewcastle ? cardiffTime : kotaraTime;
  const exitTime = isTowardsNewcastle ? kotaraTime : cardiffTime;
  const entryDist = isTowardsNewcastle ? CARDIFF_DISTANCE : KOTARA_DISTANCE;
  const exitDist = isTowardsNewcastle ? KOTARA_DISTANCE : CARDIFF_DISTANCE;

  const APPROACH_MS = 3 * 60 * 1000;
  const approachStart = entryTime - APPROACH_MS;
  const departureEnd = exitTime + APPROACH_MS;

  if (now < approachStart || now > departureEnd) return null;

  if (now < entryTime) {
    const approachProgress = (now - approachStart) / APPROACH_MS;
    const approachStartDist = isTowardsNewcastle ? 0 : TOTAL_PATH_LENGTH;
    const dist =
      approachStartDist + (entryDist - approachStartDist) * approachProgress;
    return dist / TOTAL_PATH_LENGTH;
  }

  if (now <= exitTime) {
    const corridorProgress =
      exitTime === entryTime
        ? 1
        : (now - entryTime) / (exitTime - entryTime);
    const dist = entryDist + (exitDist - entryDist) * corridorProgress;
    return dist / TOTAL_PATH_LENGTH;
  }

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
  bearing: number;
  speedKmh: number | null;
  tValue: number | null; // normalised track position
}

// Store previous positions for speed calculation
const prevPositions = new Map<string, { lat: number; lng: number; time: number }>();

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
        const bearing = getBearingAtPosition(
          m.vehiclePosition.lat,
          m.vehiclePosition.lng,
          m.direction
        );

        // Speed from position change
        let speedKmh: number | null = m.vehiclePosition.estimatedSpeedKmh ?? null;
        const prev = prevPositions.get(m.id);
        if (prev && now - prev.time > 5000) {
          const est = estimateSpeed(
            prev.lat, prev.lng, prev.time,
            m.vehiclePosition.lat, m.vehiclePosition.lng, now
          );
          if (est > 0 && est < 200) speedKmh = est;
        }
        prevPositions.set(m.id, {
          lat: m.vehiclePosition.lat,
          lng: m.vehiclePosition.lng,
          time: now,
        });

        result.push({
          movement: m,
          lat: m.vehiclePosition.lat,
          lng: m.vehiclePosition.lng,
          isLive: true,
          bearing,
          speedKmh,
          tValue: null,
        });
        continue;
      }

      // Estimate position along the real rail geometry
      const t = estimatePositionT(m, now);
      if (t !== null) {
        const [lat, lng] = interpolateOnPath(t);
        const bearing = getBearingAtT(t, m.direction);

        // Speed from estimated position changes
        let speedKmh: number | null = null;
        const prev = prevPositions.get(m.id);
        if (prev && now - prev.time > 2000) {
          const est = estimateSpeed(prev.lat, prev.lng, prev.time, lat, lng, now);
          if (est > 0 && est < 200) speedKmh = est;
        }
        prevPositions.set(m.id, { lat, lng, time: now });

        result.push({ movement: m, lat, lng, isLive: false, bearing, speedKmh, tValue: t });
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

// ─── Arrow icon factory ─────────────────────────────────────────────────────

function createArrowIcon(
  color: string,
  bearing: number,
  isLive: boolean,
  isFreight: boolean,
  consistLength?: number
): import("leaflet").DivIcon | null {
  if (!L) return null;

  const size = isFreight ? 28 : 24;
  const borderColor = isLive ? "#ffffff" : "#94a3b8";
  const borderWidth = isLive ? 2 : 1.5;
  const dashStyle = isLive ? "" : "stroke-dasharray: 3 2;";

  // Small label for consist length
  const lengthLabel = consistLength
    ? `<text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="8" font-weight="bold" font-family="monospace">${consistLength}</text>`
    : "";

  const html = `
    <div style="transform: rotate(${bearing}deg); width: ${size}px; height: ${size}px;">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <polygon
          points="${size / 2},2 ${size - 3},${size - 4} ${size / 2},${size - 8} 3,${size - 4}"
          fill="${color}" fill-opacity="0.95"
          stroke="${borderColor}" stroke-width="${borderWidth}"
          ${dashStyle ? `style="${dashStyle}"` : ""}
        />
        ${lengthLabel}
      </svg>
    </div>
  `;

  return L.divIcon({
    html,
    className: "train-arrow-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ─── Weather/Sun Panel ──────────────────────────────────────────────────────

function WeatherSunPanel({
  weather,
  sunInfo,
}: {
  weather: WeatherData | null;
  sunInfo: SunInfo;
}) {
  if (!weather) return null;

  const sunIcon = sunInfo.isUp
    ? sunInfo.goldenHour
      ? "🌅"
      : "☀️"
    : sunInfo.blueHour
      ? "🌆"
      : "🌙";

  const lightColor =
    sunInfo.newcastleSideLight === "good" || sunInfo.sydneySideLight === "good"
      ? "text-green-400"
      : sunInfo.newcastleSideLight === "ok" || sunInfo.sydneySideLight === "ok"
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="absolute top-14 left-4 z-[1000] bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[var(--color-border)] rounded-lg px-3 py-2 space-y-1.5 max-w-[200px]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
        Conditions
      </div>

      {/* Weather */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-base">{weatherIcon(weather.weatherCode)}</span>
        <div>
          <span className="font-semibold">{weather.temperature}°C</span>
          <span className="text-[var(--color-text-muted)]"> feels {weather.feelsLike}°</span>
        </div>
      </div>
      <div className="text-[11px] text-[var(--color-text-muted)]">
        {weather.description}
      </div>
      <div className="flex gap-3 text-[11px] text-[var(--color-text-muted)]">
        <span>💨 {weather.windSpeed}km/h {windDirectionLabel(weather.windDirection)}</span>
      </div>
      <div className="flex gap-3 text-[11px] text-[var(--color-text-muted)]">
        <span>☁️ {weather.cloudCover}%</span>
        <span>👁 {weather.visibility.toFixed(0)}km</span>
      </div>

      {/* Sun position */}
      <div className="border-t border-[var(--color-border)] pt-1.5 mt-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-base">{sunIcon}</span>
          <div>
            <span className="font-semibold">{sunInfo.elevation}°</span>
            <span className="text-[var(--color-text-muted)]"> elev · {sunInfo.azimuth}° az</span>
          </div>
        </div>
        <div className={`text-[11px] mt-0.5 ${lightColor}`}>
          {sunInfo.recommendation}
        </div>
        <div className="flex gap-2 text-[10px] text-[var(--color-text-muted)] mt-0.5">
          <span>↑N: {sunInfo.newcastleSideLight}</span>
          <span>↓S: {sunInfo.sydneySideLight}</span>
        </div>
      </div>
    </div>
  );
}

function weatherIcon(code: number): string {
  if (code === 0 || code === 1) return "☀️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code >= 45 && code <= 48) return "🌫️";
  if (code >= 51 && code <= 55) return "🌦️";
  if (code >= 61 && code <= 65) return "🌧️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}

// ─── Map Component ──────────────────────────────────────────────────────────

function MapViewInner({ movements, onSelectMovement, showWeather = false }: MapViewProps) {
  const [leafletReady, setLeafletReady] = useState(false);
  const [weatherOn, setWeatherOn] = useState(showWeather);
  const [conditionsOn, setConditionsOn] = useState(true);
  const { radarUrl, radarTime } = useRainRadar(weatherOn);
  const { weather } = useWeather();
  const estimatedPositions = useAnimatedPositions(movements);

  // Sun position — updates every minute
  const [sunInfo, setSunInfo] = useState<SunInfo>(() =>
    getSunPosition(WATCH_POINT.lat, WATCH_POINT.lng)
  );
  useEffect(() => {
    const update = () => setSunInfo(getSunPosition(WATCH_POINT.lat, WATCH_POINT.lng));
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

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
        Marker = rl.Marker;

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
    !Popup ||
    !Marker
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
  const MK = Marker;

  function trainColor(m: Movement, isLive: boolean): string {
    if (m.serviceType === "freight") return "#a855f7";
    if (m.status === "delayed") return "#f59e0b";
    if (isLive) return "#22c55e";
    return "#60a5fa";
  }

  return (
    <div className="flex flex-col lg:flex-row h-[500px] lg:h-[600px] rounded-xl overflow-hidden border border-[var(--color-border)]">
      {/* Map — 70% on desktop, full on mobile */}
      <div className="relative flex-1 lg:w-[70%] h-full">
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
              <strong>My Location</strong>
              <br />
              <span className="text-xs">
                32&deg;56&apos;38.6&quot;S 151&deg;41&apos;30.9&quot;E
              </span>
            </div>
          </PP>
        </CM>

        {/* Train positions — arrow markers with direction */}
        {estimatedPositions.map((ep) => {
          const icon = createArrowIcon(
            trainColor(ep.movement, ep.isLive),
            ep.bearing,
            ep.isLive,
            ep.movement.serviceType === "freight",
            ep.movement.vehiclePosition?.consistLength
          );
          if (!icon) return null;

          const vp = ep.movement.vehiclePosition;
          const setId = vp?.carNumbers
            ? vp.carNumbers.length <= 4
              ? vp.carNumbers.join("·")
              : `${vp.carNumbers[0]}·${vp.carNumbers[1]}...${vp.carNumbers[vp.carNumbers.length - 1]}`
            : null;

          return (
            <MK
              key={ep.movement.id}
              position={[ep.lat, ep.lng]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectMovement(ep.movement),
              }}
            >
              <PP>
                <div className="text-gray-900 min-w-[220px]">
                  <div className="flex items-center justify-between mb-1">
                    <strong>
                      {ep.movement.serviceType === "freight" ? "🚂" : "🚆"}{" "}
                      {ep.movement.runId || ep.movement.tripId?.substring(0, 12)}
                    </strong>
                    {ep.speedKmh !== null && (
                      <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                        {ep.speedKmh} km/h
                      </span>
                    )}
                  </div>
                  <span className="text-xs">
                    {ep.movement.direction === "towards-newcastle" ? "⬆ Northbound" : "⬇ Southbound"}{" "}
                    · {ep.movement.destination}
                  </span>
                  <br />
                  <span className="text-xs">{ep.movement.operator}</span>
                  {vp?.consistLength && (
                    <>
                      <br />
                      <span className="text-xs font-medium">
                        {vp.consistLength}-car consist
                      </span>
                    </>
                  )}
                  {setId && (
                    <>
                      <br />
                      <span className="text-[10px] text-gray-600 font-mono">
                        Cars: {setId}
                      </span>
                    </>
                  )}
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
            </MK>
          );
        })}
      </MC>

      {/* Top controls row */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
        {/* Rain toggle */}
        <button
          onClick={() => setWeatherOn((w) => !w)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
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

        {/* Conditions toggle */}
        <button
          onClick={() => setConditionsOn((c) => !c)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            conditionsOn
              ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
              : "bg-[var(--color-surface)]/90 border-[var(--color-border)] text-[var(--color-text-muted)]"
          } backdrop-blur-sm`}
          title="Toggle weather & sun conditions"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          Photo
        </button>
      </div>

      {/* Weather & Sun Panel */}
      {conditionsOn && <WeatherSunPanel weather={weather} sunInfo={sunInfo} />}

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
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14">
              <polygon points="7,1 12,11 7,8 2,11" fill="#22c55e" stroke="#fff" strokeWidth="1.5" />
            </svg>
            Live GPS (arrow = direction)
          </div>
          <div className="flex items-center gap-2 text-xs">
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14">
              <polygon points="7,1 12,11 7,8 2,11" fill="#60a5fa" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 1" />
            </svg>
            Estimated
          </div>
          <div className="flex items-center gap-2 text-xs">
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14">
              <polygon points="7,1 12,11 7,8 2,11" fill="#a855f7" stroke="#fff" strokeWidth="1" />
            </svg>
            Freight
          </div>
          <div className="flex items-center gap-2 text-xs">
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14">
              <polygon points="7,1 12,11 7,8 2,11" fill="#f59e0b" stroke="#fff" strokeWidth="1" />
            </svg>
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

      </div>{/* end map wrapper */}

      {/* Sidebar — 30% on desktop, hidden on mobile (shown as overlay on small screens) */}
      <div className="hidden lg:flex lg:w-[30%] flex-col h-full overflow-y-auto bg-[var(--color-surface)] border-l border-[var(--color-border)]">
        <div className="px-4 py-3 border-b border-[var(--color-border)] shrink-0">
          <div className="text-sm font-semibold">
            In Corridor ({estimatedPositions.length})
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {estimatedPositions.length === 0 ? (
            <div className="text-xs text-[var(--color-text-muted)] text-center py-6 italic">
              No trains in corridor right now
            </div>
          ) : (
            estimatedPositions.map((ep) => {
              const vp = ep.movement.vehiclePosition;
              return (
                <button
                  key={ep.movement.id}
                  onClick={() => onSelectMovement(ep.movement)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--color-surface-2)] transition-colors border border-transparent hover:border-[var(--color-border)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {ep.movement.direction === "towards-newcastle" ? "⬆" : "⬇"}
                    </span>
                    <span className="text-sm font-mono font-bold tabular-nums">
                      {formatTime(
                        ep.movement.estimatedTime || ep.movement.scheduledTime
                      )}
                    </span>
                    <span className="text-xs truncate text-[var(--color-text-muted)] flex-1">
                      {ep.movement.destination}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-6 mt-1">
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      {ep.isLive ? "● Live" : "◌ Est"} · {ep.movement.operator}
                    </span>
                    {ep.speedKmh !== null && (
                      <span className="text-[11px] font-mono text-emerald-400">
                        {ep.speedKmh}km/h
                      </span>
                    )}
                  </div>
                  {vp?.consistLength && (
                    <div className="flex items-center gap-2 ml-6 mt-0.5">
                      <span className="text-[11px] text-blue-400 font-medium">
                        {vp.consistLength}-car
                      </span>
                      {vp.carNumbers && vp.carNumbers.length <= 6 && (
                        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                          [{vp.carNumbers.slice(0, 3).join("·")}{vp.carNumbers.length > 3 ? "…" : ""}]
                        </span>
                      )}
                    </div>
                  )}
                  {ep.movement.delayMinutes != null && ep.movement.delayMinutes > 0 && (
                    <div className="ml-6 mt-0.5">
                      <span className="text-[11px] text-amber-400 font-medium">
                        +{ep.movement.delayMinutes} min late
                      </span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Mobile-only overlay sidebar (small screens) */}
      <div className="lg:hidden absolute top-4 right-4 z-[1000] w-64 max-h-[calc(100%-2rem)] overflow-y-auto bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[var(--color-border)] rounded-lg">
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
                    {ep.movement.direction === "towards-newcastle" ? "⬆" : "⬇"}
                  </span>
                  <span className="text-xs font-mono font-bold tabular-nums">
                    {formatTime(
                      ep.movement.estimatedTime || ep.movement.scheduledTime
                    )}
                  </span>
                  <span className="text-[11px] truncate text-[var(--color-text-muted)]">
                    {ep.movement.destination}
                  </span>
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
