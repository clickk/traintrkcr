"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { WATCH_POINT } from "@/lib/stations";
import {
  type NetworkVehicle,
  type NetworkResponse,
  getLineName,
  getLineColor,
} from "@/lib/network";

// Dynamic Leaflet imports
let L: typeof import("leaflet") | null = null;
let MapContainer: typeof import("react-leaflet").MapContainer | null = null;
let TileLayer: typeof import("react-leaflet").TileLayer | null = null;
let Popup: typeof import("react-leaflet").Popup | null = null;
let CircleMarker: typeof import("react-leaflet").CircleMarker | null = null;
let Marker: typeof import("react-leaflet").Marker | null = null;

interface NetworkMapProps {
  onSelectVehicle?: (vehicle: NetworkVehicle) => void;
}

// ─── Data fetching hook ─────────────────────────────────────────────────────

function useNetworkData() {
  const [data, setData] = useState<NetworkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/network");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: NetworkResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}

// ─── Arrow icon ─────────────────────────────────────────────────────────────

function createNetworkArrowIcon(
  color: string,
  consistLength: number,
  isMetro: boolean,
): import("leaflet").DivIcon | null {
  if (!L) return null;

  const size = 18;
  const label = consistLength > 1 ? consistLength.toString() : "";

  const html = `
    <div style="width:${size}px;height:${size}px;">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        ${isMetro
          ? `<rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="3" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1"/>`
          : `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1.5}" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.2"/>`
        }
        ${label ? `<text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="8" font-weight="bold" font-family="monospace">${label}</text>` : ""}
      </svg>
    </div>
  `;

  return L.divIcon({
    html,
    className: "network-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ─── Vehicle detail panel ───────────────────────────────────────────────────

function VehicleDetail({ vehicle, onClose }: { vehicle: NetworkVehicle; onClose: () => void }) {
  const color = getLineColor(vehicle.routeId);
  const lineName = getLineName(vehicle.routeId);

  return (
    <div className="absolute bottom-4 left-4 right-4 lg:left-auto lg:right-auto lg:bottom-4 lg:left-1/2 lg:-translate-x-1/2 z-[1000] max-w-md w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-sm font-bold">{lineName}</span>
            <span className="text-xs text-[var(--color-text-muted)]">{vehicle.routeId}</span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">{vehicle.label}</div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-[var(--color-surface-2)] rounded-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="px-2 py-1.5 bg-[var(--color-surface-2)] rounded-lg">
          <div className="text-lg font-bold font-mono">{vehicle.consistLength}</div>
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Cars</div>
        </div>
        <div className="px-2 py-1.5 bg-[var(--color-surface-2)] rounded-lg">
          <div className="text-lg font-bold font-mono">{vehicle.distanceFromWatchKm}</div>
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase">km away</div>
        </div>
        <div className="px-2 py-1.5 bg-[var(--color-surface-2)] rounded-lg">
          <div className="text-lg font-bold font-mono">
            {vehicle.occupancyStatus === 0 ? "-" : ["", "Low", "Med", "High", "Full", "Full"][vehicle.occupancyStatus] || "-"}
          </div>
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Load</div>
        </div>
      </div>

      {vehicle.carNumbers.length > 1 && (
        <div className="mt-3">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1">Car Numbers</div>
          <div className="flex flex-wrap gap-1">
            {vehicle.carNumbers.map((car, i) => (
              <span
                key={i}
                className="text-[10px] font-mono px-1.5 py-0.5 bg-[var(--color-surface-2)] rounded border border-[var(--color-border)]"
              >
                {car}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
        <span>{vehicle.lat.toFixed(4)}, {vehicle.lng.toFixed(4)}</span>
        <span>Trip: {vehicle.tripId.substring(0, 25)}</span>
      </div>
    </div>
  );
}

// ─── Stats bar ──────────────────────────────────────────────────────────────

function NetworkStats({ data }: { data: NetworkResponse }) {
  // Count by route prefix
  const byLine = new Map<string, number>();
  for (const v of data.vehicles) {
    const prefix = v.routePrefix;
    byLine.set(prefix, (byLine.get(prefix) || 0) + 1);
  }
  const sorted = [...byLine.entries()].sort((a, b) => b[1] - a[1]);

  const totalCars = data.vehicles.reduce((sum, v) => sum + v.consistLength, 0);

  return (
    <div className="flex items-center gap-4 px-4 py-2 overflow-x-auto text-xs">
      <div className="shrink-0 font-semibold">
        {data.vehicles.length} trains · {totalCars} cars
      </div>
      <div className="h-4 border-l border-[var(--color-border)]" />
      <div className="flex items-center gap-2 shrink-0">
        {sorted.slice(0, 12).map(([prefix, count]) => (
          <span
            key={prefix}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: getLineColor(prefix + "_x") + "20" }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getLineColor(prefix + "_x") }}
            />
            <span className="font-mono font-medium">{prefix}</span>
            <span className="text-[var(--color-text-muted)]">{count}</span>
          </span>
        ))}
        {sorted.length > 12 && (
          <span className="text-[var(--color-text-muted)]">+{sorted.length - 12} more</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Map Component ─────────────────────────────────────────────────────

function NetworkMapInner({ onSelectVehicle }: NetworkMapProps) {
  const [leafletReady, setLeafletReady] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<NetworkVehicle | null>(null);
  const { data, loading, error, refresh } = useNetworkData();

  useEffect(() => {
    async function loadLeaflet() {
      try {
        const leaflet = await import("leaflet");
        const rl = await import("react-leaflet");
        L = leaflet.default || leaflet;
        MapContainer = rl.MapContainer;
        TileLayer = rl.TileLayer;
        Popup = rl.Popup;
        CircleMarker = rl.CircleMarker;
        Marker = rl.Marker;

        delete (L.Icon.Default.prototype as any)._getIconUrl;
        setLeafletReady(true);
      } catch (err) {
        console.error("Failed to load Leaflet:", err);
      }
    }
    loadLeaflet();
  }, []);

  const handleVehicleClick = useCallback(
    (v: NetworkVehicle) => {
      setSelectedVehicle(v);
      onSelectVehicle?.(v);
    },
    [onSelectVehicle]
  );

  if (!leafletReady || !MapContainer || !TileLayer || !Marker || !CircleMarker || !Popup) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-[var(--color-surface)]">
        <div className="text-[var(--color-text-muted)]">Loading network map...</div>
      </div>
    );
  }

  const MC = MapContainer;
  const TL = TileLayer;
  const MK = Marker;
  const CM = CircleMarker;
  const PP = Popup;

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      {/* Stats bar */}
      {data && <NetworkStats data={data} />}

      <div className="flex-1 relative rounded-xl overflow-hidden border border-[var(--color-border)]">
        <MC
          center={[WATCH_POINT.lat, WATCH_POINT.lng]}
          zoom={8}
          className="h-full w-full"
          zoomControl={true}
        >
          <TL
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {/* OpenRailwayMap overlay for rail lines */}
          <TL
            url="https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
            attribution='<a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
            opacity={0.6}
            zIndex={400}
          />

          {/* Watch point */}
          <CM
            center={[WATCH_POINT.lat, WATCH_POINT.lng]}
            radius={6}
            pathOptions={{
              fillColor: "#f97316",
              fillOpacity: 0.9,
              color: "#fdba74",
              weight: 2,
            }}
          >
            <PP>
              <div className="text-gray-900">
                <strong>My Location</strong>
                <br />
                <span className="text-xs">Watch point</span>
              </div>
            </PP>
          </CM>

          {/* All vehicles */}
          {data?.vehicles.map((v) => {
            const color = getLineColor(v.routeId);
            const icon = createNetworkArrowIcon(
              color,
              v.consistLength,
              v.network === "metro"
            );
            if (!icon) return null;

            return (
              <MK
                key={v.id}
                position={[v.lat, v.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => handleVehicleClick(v),
                }}
              >
                <PP>
                  <div className="text-gray-900 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <strong className="text-sm">{getLineName(v.routeId)}</strong>
                    </div>
                    <div className="text-xs">{v.label}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {v.consistLength}-car · {v.distanceFromWatchKm}km away
                    </div>
                    {v.carNumbers.length > 1 && (
                      <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                        {v.carNumbers.slice(0, 4).join(" · ")}
                        {v.carNumbers.length > 4 ? " …" : ""}
                      </div>
                    )}
                  </div>
                </PP>
              </MK>
            );
          })}
        </MC>

        {/* Loading overlay */}
        {loading && !data && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/80 z-[1000]">
            <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading network data...
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && !data && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/80 z-[1000]">
            <div className="text-center">
              <div className="text-red-400 text-sm mb-2">Failed to load network data</div>
              <div className="text-xs text-[var(--color-text-muted)] mb-3">{error}</div>
              <button
                onClick={refresh}
                className="px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-xs"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Feed status badges */}
        {data && (
          <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-1">
            {data.feedStatuses.map((f) => (
              <div
                key={f.name}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium backdrop-blur-sm ${
                  f.status === "online"
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${f.status === "online" ? "bg-green-400" : "bg-red-400"}`} />
                {f.name}: {f.count}
              </div>
            ))}
            <div className="px-2 py-1 rounded-md text-[10px] bg-[var(--color-surface)]/80 text-[var(--color-text-muted)] backdrop-blur-sm border border-[var(--color-border)]">
              500km radius · updated {new Date(data.timestamp).toLocaleTimeString("en-AU", {
                timeZone: "Australia/Sydney",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 right-4 z-[1000] bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[var(--color-border)] rounded-lg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-1.5">
            Lines
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {[
              ["CCN", "Newcastle"],
              ["BMT", "Blue Mtns"],
              ["SCO", "South Coast"],
              ["SHL", "Highlands"],
              ["T1", "North Shore"],
              ["T2", "Inner West"],
              ["T4", "Eastern Sub"],
              ["T8", "Airport"],
              ["SMNW", "Metro"],
            ].map(([code, name]) => (
              <div key={code} className="flex items-center gap-1.5 text-[10px]">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getLineColor(code + "_x") }}
                />
                {name}
              </div>
            ))}
          </div>
        </div>

        {/* Selected vehicle detail */}
        {selectedVehicle && (
          <VehicleDetail
            vehicle={selectedVehicle}
            onClose={() => setSelectedVehicle(null)}
          />
        )}
      </div>
    </div>
  );
}

// SSR wrapper
export default function NetworkMap(props: NetworkMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
        <div className="text-[var(--color-text-muted)]">Loading network map...</div>
      </div>
    );
  }

  return <NetworkMapInner {...props} />;
}
