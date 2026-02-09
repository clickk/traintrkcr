/**
 * GTFS Static Schedule Data Adapter
 *
 * Parses the real TfNSW GTFS static ZIP to extract scheduled movements
 * for the Cardiff–Kotara corridor. Falls back to a hardcoded timetable
 * if the ZIP cannot be fetched/parsed.
 *
 * The GTFS ZIP is cached in memory with a 6-hour TTL to avoid
 * re-downloading on every request.
 */

import { addMinutes, startOfDay, addDays, format } from "date-fns";
import { CARDIFF, KOTARA, getAllStopIds, inferDirection } from "../stations";
import type {
  Movement,
  StopCall,
  Direction,
  ConfidenceInfo,
} from "../types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedTrip {
  tripId: string;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  serviceId: string;
  directionId: string;
  headsign: string;
}

interface ParsedStopTime {
  tripId: string;
  stopId: string;
  arrival: string;   // HH:MM:SS
  departure: string; // HH:MM:SS
  sequence: number;
}

interface ParsedSchedule {
  trips: Map<string, ParsedTrip>;
  stopTimes: Map<string, ParsedStopTime[]>; // tripId -> stops at Cardiff/Kotara
  activeServiceIds: Set<string>;
  fetchedAt: number;
}

// ─── In-memory cache ────────────────────────────────────────────────────────

let cachedSchedule: ParsedSchedule | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function isCacheValid(): boolean {
  if (!cachedSchedule) return false;
  return Date.now() - cachedSchedule.fetchedAt < CACHE_TTL_MS;
}

// ─── CSV Parser (lightweight, no external deps) ─────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);
  return { headers, rows };
}

// ─── GTFS ZIP Fetching & Parsing ────────────────────────────────────────────

async function fetchAndParseGTFS(): Promise<ParsedSchedule | null> {
  const apiKey = process.env.TFNSW_API_KEY;
  if (!apiKey) {
    console.warn("TFNSW_API_KEY not set — cannot fetch GTFS static");
    return null;
  }

  try {
    console.log("[GTFS] Fetching static schedule ZIP from TfNSW...");
    const response = await fetch(
      "https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains",
      {
        headers: {
          Authorization: `apikey ${apiKey}`,
          Accept: "application/zip",
        },
      }
    );

    if (!response.ok) {
      console.error(`[GTFS] Static fetch failed: ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`[GTFS] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB ZIP`);

    // Use Node.js built-in zlib to decompress (via child_process for ZIP)
    const { execSync } = await import("child_process");
    const fs = await import("fs");
    const tmpDir = "/tmp/gtfs-traintrckr";

    // Write ZIP and extract needed files
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(`${tmpDir}/gtfs.zip`, buffer);
    execSync(
      `cd ${tmpDir} && unzip -o gtfs.zip stops.txt stop_times.txt trips.txt routes.txt calendar.txt 2>/dev/null || true`,
      { timeout: 30000 }
    );

    // Parse calendar.txt → active service IDs for today
    const calText = fs.readFileSync(`${tmpDir}/calendar.txt`, "utf8");
    const cal = parseCSV(calText);
    const now = new Date();
    const todayStr = format(now, "yyyyMMdd");
    const dayName = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][now.getDay()];
    const dayIdx = cal.headers.indexOf(dayName);
    const startIdx = cal.headers.indexOf("start_date");
    const endIdx = cal.headers.indexOf("end_date");
    const sidIdx = cal.headers.indexOf("service_id");

    const activeServiceIds = new Set<string>();
    for (const row of cal.rows) {
      const sid = row[sidIdx];
      const start = row[startIdx];
      const end = row[endIdx];
      const active = row[dayIdx];
      if (active === "1" && start <= todayStr && end >= todayStr) {
        activeServiceIds.add(sid);
      }
    }
    console.log(`[GTFS] Active service IDs for ${dayName}: ${activeServiceIds.size}`);

    // Parse routes.txt → route info
    const routesText = fs.readFileSync(`${tmpDir}/routes.txt`, "utf8");
    const routes = parseCSV(routesText);
    const routeMap = new Map<string, { shortName: string; longName: string }>();
    const rIdIdx = routes.headers.indexOf("route_id");
    const rSnIdx = routes.headers.indexOf("route_short_name");
    const rLnIdx = routes.headers.indexOf("route_long_name");
    for (const row of routes.rows) {
      routeMap.set(row[rIdIdx], {
        shortName: row[rSnIdx] || "",
        longName: row[rLnIdx] || "",
      });
    }

    // Parse trips.txt → trip details
    const tripsText = fs.readFileSync(`${tmpDir}/trips.txt`, "utf8");
    const tripsCSV = parseCSV(tripsText);
    const tRouteIdx = tripsCSV.headers.indexOf("route_id");
    const tServiceIdx = tripsCSV.headers.indexOf("service_id");
    const tTripIdx = tripsCSV.headers.indexOf("trip_id");
    const tDirIdx = tripsCSV.headers.indexOf("direction_id");
    const tHeadsignIdx = tripsCSV.headers.indexOf("trip_headsign");

    const trips = new Map<string, ParsedTrip>();
    const corridorRoutes = new Set<string>();

    for (const row of tripsCSV.rows) {
      const routeId = row[tRouteIdx];
      const serviceId = row[tServiceIdx];
      const tripId = row[tTripIdx];

      if (!activeServiceIds.has(serviceId)) continue;
      // Include CCN (Central Coast & Newcastle) and HUN (Hunter) routes
      if (!routeId?.startsWith("CCN") && !routeId?.startsWith("HUN")) continue;

      const routeInfo = routeMap.get(routeId);
      trips.set(tripId, {
        tripId,
        routeId,
        routeShortName: routeInfo?.shortName || routeId,
        routeLongName: routeInfo?.longName || "",
        serviceId,
        directionId: row[tDirIdx] || "0",
        headsign: row[tHeadsignIdx] || "",
      });
      corridorRoutes.add(routeId);
    }
    console.log(`[GTFS] Active CCN/HUN trips: ${trips.size}`);

    // Parse stop_times.txt → corridor stop times
    const corridorStopIds = new Set(getAllStopIds());
    const stText = fs.readFileSync(`${tmpDir}/stop_times.txt`, "utf8");
    const st = parseCSV(stText);
    const stTripIdx = st.headers.indexOf("trip_id");
    const stStopIdx = st.headers.indexOf("stop_id");
    const stArrIdx = st.headers.indexOf("arrival_time");
    const stDepIdx = st.headers.indexOf("departure_time");
    const stSeqIdx = st.headers.indexOf("stop_sequence");

    const stopTimes = new Map<string, ParsedStopTime[]>();
    for (const row of st.rows) {
      const tripId = row[stTripIdx];
      if (!trips.has(tripId)) continue;

      const stopId = row[stStopIdx];
      if (!corridorStopIds.has(stopId)) continue;

      if (!stopTimes.has(tripId)) stopTimes.set(tripId, []);
      stopTimes.get(tripId)!.push({
        tripId,
        stopId,
        arrival: row[stArrIdx],
        departure: row[stDepIdx],
        sequence: parseInt(row[stSeqIdx]) || 0,
      });
    }
    console.log(`[GTFS] Trips with Cardiff/Kotara stops: ${stopTimes.size}`);

    return {
      trips,
      stopTimes,
      activeServiceIds,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.error("[GTFS] Failed to fetch/parse GTFS static:", err);
    return null;
  }
}

// ─── Convert GTFS time to Date ──────────────────────────────────────────────

/**
 * GTFS times can exceed 24:00:00 (e.g. "25:30:00" = 1:30am next day).
 */
function gtfsTimeToDate(gtfsTime: string, dayStart: Date): Date {
  const parts = gtfsTime.split(":");
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const seconds = parseInt(parts[2] || "0");

  const result = new Date(dayStart);
  result.setHours(0, 0, 0, 0);
  result.setTime(result.getTime() + (hours * 3600 + minutes * 60 + seconds) * 1000);
  return result;
}

// ─── Build Movements from GTFS data ────────────────────────────────────────

function buildMovementsFromGTFS(
  schedule: ParsedSchedule,
  dayStart: Date
): Movement[] {
  const movements: Movement[] = [];

  const cardiffStopIds = new Set(CARDIFF.stopIds);
  const kotaraStopIds = new Set(KOTARA.stopIds);

  for (const [tripId, stopEntries] of schedule.stopTimes) {
    const trip = schedule.trips.get(tripId);
    if (!trip) continue;

    let cardiffEntry: ParsedStopTime | undefined;
    let kotaraEntry: ParsedStopTime | undefined;

    for (const st of stopEntries) {
      if (cardiffStopIds.has(st.stopId)) cardiffEntry = st;
      if (kotaraStopIds.has(st.stopId)) kotaraEntry = st;
    }

    if (!cardiffEntry && !kotaraEntry) continue;

    // Determine direction from stop sequence
    let direction: Direction;
    if (cardiffEntry && kotaraEntry) {
      direction = cardiffEntry.sequence < kotaraEntry.sequence
        ? "towards-newcastle"
        : "towards-sydney";
    } else {
      // Infer from GTFS direction_id: 0 = towards Newcastle, 1 = towards Sydney
      direction = trip.directionId === "1" ? "towards-sydney" : "towards-newcastle";
    }

    // Build stop calls
    const cardiffCall: StopCall | undefined = cardiffEntry
      ? {
          stopId: cardiffEntry.stopId,
          stopName: "Cardiff",
          scheduledArrival: gtfsTimeToDate(cardiffEntry.arrival, dayStart).toISOString(),
          scheduledDeparture: gtfsTimeToDate(cardiffEntry.departure, dayStart).toISOString(),
          platform: cardiffEntry.stopId === "2285361" ? "1" : cardiffEntry.stopId === "2285362" ? "2" : undefined,
          stopSequence: cardiffEntry.sequence,
          stopsHere: true,
        }
      : undefined;

    const kotaraCall: StopCall | undefined = kotaraEntry
      ? {
          stopId: kotaraEntry.stopId,
          stopName: "Kotara",
          scheduledArrival: gtfsTimeToDate(kotaraEntry.arrival, dayStart).toISOString(),
          scheduledDeparture: gtfsTimeToDate(kotaraEntry.departure, dayStart).toISOString(),
          platform: kotaraEntry.stopId === "2289341" ? "1" : kotaraEntry.stopId === "2289342" ? "2" : undefined,
          stopSequence: kotaraEntry.sequence,
          stopsHere: true,
        }
      : undefined;

    const stops: StopCall[] = [];
    if (cardiffCall) stops.push(cardiffCall);
    if (kotaraCall) stops.push(kotaraCall);
    stops.sort((a, b) => a.stopSequence - b.stopSequence);

    // Primary time for sorting
    const primaryTime =
      direction === "towards-newcastle"
        ? cardiffCall?.scheduledDeparture || kotaraCall?.scheduledDeparture
        : kotaraCall?.scheduledDeparture || cardiffCall?.scheduledDeparture;

    if (!primaryTime) continue;

    // Skip "Empty Train" services
    if (trip.headsign.toLowerCase().includes("empty train")) continue;

    // Determine consist type from route
    // CCN line now primarily uses Waratahs (A/B sets); Oscars still run but less common
    // HUN (Hunter) line uses Endeavour diesel railcars
    // Route suffixes: _1a/_1b/_1c = towards Newcastle, _2a/_2b = towards Sydney
    let consistType: string;
    if (trip.routeId.startsWith("HUN")) {
      consistType = "Endeavour";
    } else {
      // Default to Waratah for CCN — most common consist on the Newcastle line now
      consistType = "Waratah";
    }

    // Determine origin/destination
    const origin = direction === "towards-newcastle" ? "Central" : "Newcastle Interchange";
    const destination = trip.headsign || (direction === "towards-newcastle" ? "Newcastle Interchange" : "Central");

    const confidence: ConfidenceInfo = {
      level: "scheduled",
      reason: "From TfNSW GTFS static timetable",
      sources: ["tfnsw-gtfs-static"],
      lastUpdated: new Date().toISOString(),
    };

    movements.push({
      id: `sched-${tripId}`,
      tripId,
      runId: tripId.split(".")[0], // e.g. "N671" from "N671.1346..."
      routeId: trip.routeId,
      serviceName: `${trip.routeShortName} ${trip.routeLongName}`,
      operator: trip.routeId.startsWith("HUN") ? "NSW TrainLink" : "NSW TrainLink",
      serviceType: "passenger",
      direction,
      origin,
      destination,
      consistType,
      status: "scheduled",
      stops,
      cardiffCall,
      kotaraCall,
      passesThrough: false,
      confidence,
      disruptions: [],
      scheduledTime: primaryTime,
    });
  }

  return movements;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get scheduled movements for a time window.
 * First tries to use real GTFS data, falls back to a hardcoded schedule.
 */
export async function getScheduledMovementsAsync(
  from: Date,
  to: Date
): Promise<Movement[]> {
  // Try to fetch/use cached GTFS data
  if (!isCacheValid()) {
    const parsed = await fetchAndParseGTFS();
    if (parsed) {
      cachedSchedule = parsed;
    }
  }

  let movements: Movement[];

  if (cachedSchedule) {
    const dayStart = startOfDay(from);
    movements = buildMovementsFromGTFS(cachedSchedule, dayStart);

    // If window crosses midnight, include next day too
    if (to.getDate() !== from.getDate()) {
      const nextDayStart = addDays(dayStart, 1);
      const nextDayMovements = buildMovementsFromGTFS(cachedSchedule, nextDayStart);
      movements = [...movements, ...nextDayMovements];
    }

    // If the GTFS data has no services for today (calendar doesn't cover
    // this date — common when TfNSW publishes the next week's schedule
    // before the current week ends), try re-fetching once to see if a
    // newer ZIP is available. If still no luck, fall back to the
    // hardcoded timetable so the app isn't empty.
    if (movements.length === 0) {
      console.warn("[GTFS] No services found for today — re-fetching ZIP in case a newer one is available");
      const reParsed = await fetchAndParseGTFS();
      if (reParsed) {
        cachedSchedule = reParsed;
        movements = buildMovementsFromGTFS(reParsed, dayStart);
      }

      if (movements.length === 0) {
        console.warn("[GTFS] Still no services after re-fetch — using fallback schedule");
        movements = generateFallbackSchedule(from, to);
      }
    }
  } else {
    // Fallback to hardcoded schedule
    console.warn("[GTFS] Using fallback hardcoded schedule");
    movements = generateFallbackSchedule(from, to);
  }

  // Filter to time window
  return movements.filter((m) => {
    const t = new Date(m.scheduledTime);
    return t >= from && t <= to;
  });
}

/**
 * Synchronous wrapper — returns fallback schedule immediately,
 * then real GTFS data will be used on subsequent calls once cached.
 */
export function getScheduledMovements(from: Date, to: Date): Movement[] {
  // If we have cached data, use it synchronously
  if (cachedSchedule && isCacheValid()) {
    const dayStart = startOfDay(from);
    let movements = buildMovementsFromGTFS(cachedSchedule, dayStart);

    if (to.getDate() !== from.getDate()) {
      const nextDayStart = addDays(dayStart, 1);
      const nextDayMovements = buildMovementsFromGTFS(cachedSchedule, nextDayStart);
      movements = [...movements, ...nextDayMovements];
    }

    return movements.filter((m) => {
      const t = new Date(m.scheduledTime);
      return t >= from && t <= to;
    });
  }

  // Otherwise return fallback (and trigger async fetch for next time)
  fetchAndParseGTFS().then((parsed) => {
    if (parsed) cachedSchedule = parsed;
  });

  return generateFallbackSchedule(from, to);
}

// ─── Fallback Hardcoded Schedule ────────────────────────────────────────────

function generateFallbackSchedule(from: Date, to: Date): Movement[] {
  const dayStart = startOfDay(from);
  const movements: Movement[] = [];

  // Simplified timetable based on typical Sunday pattern
  const services = [
    // Towards Newcastle (dir 0)
    { h: 4, m: 25, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 5, m: 28, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 6, m: 30, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 7, m: 35, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 8, m: 27, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 9, m: 38, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 10, m: 42, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 11, m: 34, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 12, m: 57, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 13, m: 34, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 14, m: 42, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 15, m: 34, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 16, m: 42, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 17, m: 34, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 18, m: 42, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 19, m: 34, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 20, m: 42, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 21, m: 34, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    { h: 22, m: 42, dir: "towards-newcastle" as Direction, dest: "Newcastle Interchange" },
    // Towards Sydney (dir 1)
    { h: 5, m: 11, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 6, m: 3, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 7, m: 11, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 8, m: 3, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 9, m: 10, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 10, m: 3, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 11, m: 12, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 12, m: 3, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 13, m: 9, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 14, m: 3, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 15, m: 12, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 16, m: 3, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 17, m: 12, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 18, m: 16, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 19, m: 10, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 19, m: 48, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 20, m: 48, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 22, m: 16, dir: "towards-sydney" as Direction, dest: "Central" },
    { h: 23, m: 56, dir: "towards-sydney" as Direction, dest: "Gosford" },
  ];

  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const cardiffTime = new Date(dayStart);
    cardiffTime.setHours(s.h, s.m, 0, 0);

    const kotaraTime = s.dir === "towards-newcastle"
      ? addMinutes(cardiffTime, 4)
      : addMinutes(cardiffTime, -4);

    const cardiffCall: StopCall = {
      stopId: CARDIFF.platformIds[0],
      stopName: "Cardiff",
      scheduledArrival: addMinutes(cardiffTime, -1).toISOString(),
      scheduledDeparture: cardiffTime.toISOString(),
      stopSequence: s.dir === "towards-newcastle" ? 20 : 22,
      stopsHere: true,
    };

    const kotaraCall: StopCall = {
      stopId: KOTARA.platformIds[0],
      stopName: "Kotara",
      scheduledArrival: addMinutes(kotaraTime, -1).toISOString(),
      scheduledDeparture: kotaraTime.toISOString(),
      stopSequence: s.dir === "towards-newcastle" ? 21 : 21,
      stopsHere: true,
    };

    const stops = s.dir === "towards-newcastle"
      ? [cardiffCall, kotaraCall]
      : [kotaraCall, cardiffCall];

    const primaryTime = s.dir === "towards-newcastle"
      ? cardiffTime.toISOString()
      : kotaraTime.toISOString();

    movements.push({
      id: `fallback-${i}`,
      tripId: `fallback-${s.dir}-${s.h}-${s.m}`,
      runId: `FB${String(s.h).padStart(2, "0")}${String(s.m).padStart(2, "0")}`,
      routeId: "CCN_1a",
      serviceName: "CCN Central Coast & Newcastle Line",
      operator: "NSW TrainLink",
      serviceType: "passenger",
      direction: s.dir,
      origin: s.dir === "towards-newcastle" ? "Central" : "Newcastle Interchange",
      destination: s.dest,
      consistType: "Oscar",
      status: "scheduled",
      stops,
      cardiffCall,
      kotaraCall,
      passesThrough: false,
      confidence: {
        level: "scheduled",
        reason: "Fallback schedule — GTFS data not yet loaded",
        sources: ["tfnsw-gtfs-static"],
        lastUpdated: new Date().toISOString(),
      },
      disruptions: [],
      scheduledTime: primaryTime,
    });
  }

  return movements.filter((m) => {
    const t = new Date(m.scheduledTime);
    return t >= from && t <= to;
  });
}
