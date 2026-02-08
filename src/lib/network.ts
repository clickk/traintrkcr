/**
 * Network-wide vehicle position fetcher.
 *
 * Pulls ALL live vehicle positions from TfNSW GTFS-RT feeds
 * (Sydney Trains + Metro) and returns them for map display.
 *
 * Coverage: ~500km radius from the Hunter Valley to the South Coast,
 * Blue Mountains to the coast — every electrified/diesel rail service.
 */

import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { WATCH_POINT } from "./stations";

const TFNSW_BASE = "https://api.transport.nsw.gov.au";

const FEEDS = [
  {
    name: "Sydney Trains & NSW TrainLink Intercity",
    url: `${TFNSW_BASE}/v2/gtfs/vehiclepos/sydneytrains`,
    network: "sydneytrains",
  },
  {
    name: "Sydney Metro",
    url: `${TFNSW_BASE}/v2/gtfs/vehiclepos/metro`,
    network: "metro",
  },
];

// 500 km radius in degrees (rough: 1° lat ≈ 111 km)
const RADIUS_DEG = 500 / 111;

export interface NetworkVehicle {
  id: string;
  tripId: string;
  routeId: string;
  routePrefix: string;       // e.g. "CCN", "BMT", "T1"
  network: string;            // "sydneytrains" or "metro"
  label: string;              // e.g. "08:17 Central to Parramatta"
  lat: number;
  lng: number;
  bearing: number;
  speed: number;
  vehicleId: string;          // raw vehicle descriptor ID
  carNumbers: string[];       // individual car numbers
  consistLength: number;      // number of cars
  occupancyStatus: number;
  distanceFromWatchKm: number;
  timestamp: string;
}

export interface NetworkResponse {
  vehicles: NetworkVehicle[];
  feedStatuses: { name: string; status: string; count: number; error?: string }[];
  timestamp: string;
  totalAcrossFeeds: number;
}

function toLong(val: unknown): number | undefined {
  if (val == null) return undefined;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return undefined;
}

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

// Route prefix to human-readable line name
const ROUTE_NAMES: Record<string, string> = {
  T1: "T1 North Shore & Western",
  T2: "T2 Inner West & Leppington",
  T3: "T3 Bankstown",
  T4: "T4 Eastern Suburbs & Illawarra",
  T5: "T5 Cumberland",
  T6: "T6 Lidcombe–Bankstown",
  T7: "T7 Olympic Park",
  T8: "T8 Airport & South",
  T9: "T9 Northern",
  CCN: "Central Coast & Newcastle",
  BMT: "Blue Mountains",
  SHL: "Southern Highlands",
  SCO: "South Coast",
  HUN: "Hunter",
  IWL: "Inner West",
  APS: "Airport & South",
  CMB: "Cumberland",
  WST: "Western",
  ESI: "East Hills & Illawarra",
  NTH: "Northern",
  NSN: "North Shore",
  CTY: "City Circle",
  OLY: "Olympic Park",
  RTTA: "Intercity",
  SMNW: "Metro Northwest",
  SMB: "Metro Bankstown",
};

export function getLineName(routeId: string): string {
  const prefix = routeId.split("_")[0];
  return ROUTE_NAMES[prefix] || prefix;
}

export function getLineColor(routeId: string): string {
  const prefix = routeId.split("_")[0];
  const colors: Record<string, string> = {
    T1: "#f99d1c", // yellow
    T2: "#0098cd", // blue
    T3: "#f37021", // orange
    T4: "#005aa3", // dark blue
    T5: "#c4258f", // purple
    T6: "#7d3f21", // brown (placeholder)
    T7: "#6f818e", // grey
    T8: "#00954c", // green
    T9: "#d11f2f", // red
    CCN: "#d11f2f", // red
    BMT: "#f99d1c", // yellow
    SHL: "#005aa3", // dark blue
    SCO: "#005aa3", // dark blue
    HUN: "#d11f2f", // red
    IWL: "#0098cd", // blue
    APS: "#00954c", // green
    CMB: "#c4258f", // purple
    WST: "#f99d1c", // yellow
    ESI: "#005aa3", // dark blue
    NTH: "#d11f2f", // red
    NSN: "#f99d1c", // yellow
    CTY: "#6f818e", // grey
    OLY: "#6f818e", // grey
    RTTA: "#f37021", // orange
    SMNW: "#009b77", // teal (Metro)
    SMB: "#009b77",  // teal (Metro)
  };
  return colors[prefix] || "#60a5fa";
}

export async function fetchNetworkVehicles(): Promise<NetworkResponse> {
  const apiKey = process.env.TFNSW_API_KEY;
  if (!apiKey) {
    return {
      vehicles: [],
      feedStatuses: [{ name: "All", status: "error", count: 0, error: "TFNSW_API_KEY not set" }],
      timestamp: new Date().toISOString(),
      totalAcrossFeeds: 0,
    };
  }

  const vehicles: NetworkVehicle[] = [];
  const feedStatuses: NetworkResponse["feedStatuses"] = [];
  let totalAcrossFeeds = 0;

  const headers = {
    Authorization: `apikey ${apiKey}`,
    Accept: "application/x-google-protobuf",
  };

  await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers,
          next: { revalidate: 15 },
        });

        if (!res.ok) {
          feedStatuses.push({
            name: feed.name,
            status: "error",
            count: 0,
            error: `HTTP ${res.status}`,
          });
          return;
        }

        const buf = await res.arrayBuffer();
        const decoded = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
          new Uint8Array(buf)
        );

        let count = 0;
        for (const entity of decoded.entity) {
          const vp = entity.vehicle;
          if (!vp?.position || !vp.trip?.tripId) continue;

          const lat = vp.position.latitude;
          const lng = vp.position.longitude;

          // Quick bounding box check before expensive haversine
          if (
            Math.abs(lat - WATCH_POINT.lat) > RADIUS_DEG ||
            Math.abs(lng - WATCH_POINT.lng) > RADIUS_DEG * 1.5
          ) continue;

          const distKm = haversineKm(WATCH_POINT.lat, WATCH_POINT.lng, lat, lng);
          if (distKm > 500) continue;

          const rawVehicleId = vp.vehicle?.id ?? "";
          const carNumbers = rawVehicleId ? rawVehicleId.split(".") : [];
          const routeId = vp.trip.routeId ?? "";
          const timestamp = toLong(vp.timestamp);

          vehicles.push({
            id: entity.id,
            tripId: vp.trip.tripId,
            routeId,
            routePrefix: routeId.split("_")[0],
            network: feed.network,
            label: vp.vehicle?.label ?? "",
            lat,
            lng,
            bearing: vp.position.bearing ?? 0,
            speed: vp.position.speed ?? 0,
            vehicleId: rawVehicleId,
            carNumbers,
            consistLength: carNumbers.length || 1,
            occupancyStatus: vp.occupancyStatus ?? 0,
            distanceFromWatchKm: Math.round(distKm * 10) / 10,
            timestamp: timestamp
              ? new Date(timestamp * 1000).toISOString()
              : new Date().toISOString(),
          });
          count++;
        }

        totalAcrossFeeds += decoded.entity.length;
        feedStatuses.push({
          name: feed.name,
          status: "online",
          count,
        });
      } catch (err) {
        feedStatuses.push({
          name: feed.name,
          status: "error",
          count: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );

  // Sort by distance from watch point
  vehicles.sort((a, b) => a.distanceFromWatchKm - b.distanceFromWatchKm);

  return {
    vehicles,
    feedStatuses,
    timestamp: new Date().toISOString(),
    totalAcrossFeeds,
  };
}
