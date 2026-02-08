"use client";

import { useEffect, useState } from "react";
import type { Movement } from "@/lib/types";
import ConfidenceBadge from "./ConfidenceBadge";
import { format } from "date-fns";
import { CARDIFF, KOTARA, CORRIDOR_CENTER, CORRIDOR_BOUNDS } from "@/lib/stations";

// Dynamic import for Leaflet (SSR-incompatible)
let L: typeof import("leaflet") | null = null;
let MapContainer: typeof import("react-leaflet").MapContainer | null = null;
let TileLayer: typeof import("react-leaflet").TileLayer | null = null;
let Marker: typeof import("react-leaflet").Marker | null = null;
let Popup: typeof import("react-leaflet").Popup | null = null;
let Polyline: typeof import("react-leaflet").Polyline | null = null;
let CircleMarker: typeof import("react-leaflet").CircleMarker | null = null;
let useMap: typeof import("react-leaflet").useMap | null = null;

interface MapViewProps {
  movements: Movement[];
  onSelectMovement: (movement: Movement) => void;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "--:--";
  return format(new Date(isoString), "HH:mm");
}

function MapViewInner({
  movements,
  onSelectMovement,
}: MapViewProps) {
  const [mapReady, setMapReady] = useState(false);
  const [leafletModules, setLeafletModules] = useState<boolean>(false);

  useEffect(() => {
    // Dynamically import Leaflet modules (not SSR compatible)
    async function loadLeaflet() {
      try {
        const leaflet = await import("leaflet");
        const rl = await import("react-leaflet");
        L = leaflet.default || leaflet;
        MapContainer = rl.MapContainer;
        TileLayer = rl.TileLayer;
        Marker = rl.Marker;
        Popup = rl.Popup;
        Polyline = rl.Polyline;
        CircleMarker = rl.CircleMarker;
        useMap = rl.useMap;

        // Fix Leaflet default icon issue
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });

        setLeafletModules(true);
      } catch (err) {
        console.error("Failed to load Leaflet:", err);
      }
    }
    loadLeaflet();
  }, []);

  if (!leafletModules || !MapContainer || !TileLayer || !CircleMarker || !Polyline || !Popup) {
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

  // Corridor rail line (approximate path)
  const railPath: [number, number][] = [
    [CARDIFF.lat, CARDIFF.lng],
    [-32.9448, 151.6735],
    [-32.9425, 151.6790],
    [KOTARA.lat, KOTARA.lng],
  ];

  // Movements with vehicle positions
  const liveMovements = movements.filter((m) => m.vehiclePosition);

  // Movements without positions but with estimated corridor positions
  const estimatedMovements = movements.filter(
    (m) => !m.vehiclePosition && m.status === "live"
  );

  return (
    <div className="relative h-[500px] lg:h-[600px] rounded-xl overflow-hidden border border-[var(--color-border)]">
      <MC
        center={[CORRIDOR_CENTER.lat, CORRIDOR_CENTER.lng]}
        zoom={15}
        className="h-full w-full"
        zoomControl={true}
      >
        <TL
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Rail corridor line */}
        <PL
          positions={railPath}
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

        {/* Live vehicle positions */}
        {liveMovements.map((m) => (
          <CM
            key={m.id}
            center={[m.vehiclePosition!.lat, m.vehiclePosition!.lng]}
            radius={7}
            pathOptions={{
              fillColor:
                m.serviceType === "freight"
                  ? "#a855f7"
                  : m.status === "delayed"
                  ? "#f59e0b"
                  : "#22c55e",
              fillOpacity: 0.9,
              color: "#fff",
              weight: 2,
            }}
            eventHandlers={{
              click: () => onSelectMovement(m),
            }}
          >
            <PP>
              <div className="text-gray-900 min-w-[180px]">
                <strong>
                  {m.serviceType === "freight" ? "🚂" : "🚆"} {m.runId || m.tripId}
                </strong>
                <br />
                <span className="text-xs">
                  {m.direction === "towards-newcastle" ? "↑" : "↓"}{" "}
                  {m.destination}
                </span>
                <br />
                <span className="text-xs">{m.operator}</span>
                {m.delayMinutes !== undefined && m.delayMinutes > 0 && (
                  <>
                    <br />
                    <span className="text-xs text-amber-600 font-semibold">
                      +{m.delayMinutes} min late
                    </span>
                  </>
                )}
              </div>
            </PP>
          </CM>
        ))}
      </MC>

      {/* Overlay legend */}
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
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            Live passenger train
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            Freight movement
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            Delayed
          </div>
        </div>
      </div>

      {/* Sidebar: upcoming movements */}
      <div className="absolute top-4 right-4 z-[1000] w-64 max-h-[calc(100%-2rem)] overflow-y-auto bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[var(--color-border)] rounded-lg">
        <div className="px-3 py-2 border-b border-[var(--color-border)]">
          <div className="text-xs font-medium">Upcoming Movements</div>
        </div>
        <div className="p-2 space-y-1">
          {movements.slice(0, 8).map((m) => (
            <button
              key={m.id}
              onClick={() => onSelectMovement(m)}
              className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">
                  {m.serviceType === "freight" ? "🚂" : "🚆"}
                </span>
                <span className="text-xs font-mono font-bold tabular-nums">
                  {formatTime(m.estimatedTime || m.scheduledTime)}
                </span>
                <span className="text-[11px] truncate text-[var(--color-text-muted)]">
                  {m.direction === "towards-newcastle" ? "↑" : "↓"}{" "}
                  {m.destination}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Wrap in a client-only check to avoid SSR issues with Leaflet
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
