import { NextRequest, NextResponse } from "next/server";
import { getCorridorMovements } from "@/lib/corridor";
import type {
  MovementFilters,
  Movement,
  StationFilter,
  DirectionFilter,
  TypeFilter,
  StatusFilter,
} from "@/lib/types";
import { subDays, format } from "date-fns";

export const dynamic = "force-dynamic";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DayStat {
  date: string;       // YYYY-MM-DD
  label: string;      // "Mon 3 Feb"
  total: number;
  passenger: number;
  freight: number;
  towardsNewcastle: number;
  towardsSydney: number;
  onTime: number;
  delayed: number;
  cancelled: number;
  avgDelayMinutes: number;
  peakHour: number;
  peakHourCount: number;
  stoppingAtCardiff: number;
  stoppingAtKotara: number;
  passingThrough: number;
  liveTracked: number;
  uniqueOperators: string[];
  hourlyBreakdown: HourBucket[];
}

export interface HourBucket {
  hour: number;               // 0-23
  total: number;
  delayed: number;
  avgDelay: number;
  towardsNewcastle: number;
  towardsSydney: number;
  delayedNewcastle: number;
  delayedSydney: number;
}

export interface AnalyticsResponse {
  today: DayStat;
  days: DayStat[];
  generatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildHourlyBreakdown(movements: Movement[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    total: 0,
    delayed: 0,
    avgDelay: 0,
    towardsNewcastle: 0,
    towardsSydney: 0,
    delayedNewcastle: 0,
    delayedSydney: 0,
  }));

  for (const m of movements) {
    const h = new Date(m.scheduledTime).getHours();
    const bucket = buckets[h];
    bucket.total++;

    const isDelayed =
      m.status === "delayed" ||
      (m.delayMinutes !== undefined && m.delayMinutes >= 2);

    if (isDelayed) bucket.delayed++;

    if (m.direction === "towards-newcastle") {
      bucket.towardsNewcastle++;
      if (isDelayed) bucket.delayedNewcastle++;
    } else {
      bucket.towardsSydney++;
      if (isDelayed) bucket.delayedSydney++;
    }
  }

  // Compute avg delay per bucket
  for (const bucket of buckets) {
    if (bucket.total > 0) {
      const hourMovements = movements.filter(
        (m) => new Date(m.scheduledTime).getHours() === bucket.hour
      );
      const delays = hourMovements
        .filter((m) => m.delayMinutes !== undefined && m.delayMinutes > 0)
        .map((m) => m.delayMinutes!);
      bucket.avgDelay =
        delays.length > 0
          ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10
          : 0;
    }
  }

  return buckets;
}

function computeDayStat(movements: Movement[], date: Date): DayStat {
  const dateStr = format(date, "yyyy-MM-dd");
  const label = format(date, "EEE d MMM");

  const empty: DayStat = {
    date: dateStr,
    label,
    total: 0,
    passenger: 0,
    freight: 0,
    towardsNewcastle: 0,
    towardsSydney: 0,
    onTime: 0,
    delayed: 0,
    cancelled: 0,
    avgDelayMinutes: 0,
    peakHour: 0,
    peakHourCount: 0,
    stoppingAtCardiff: 0,
    stoppingAtKotara: 0,
    passingThrough: 0,
    liveTracked: 0,
    uniqueOperators: [],
    hourlyBreakdown: buildHourlyBreakdown([]),
  };

  if (movements.length === 0) return empty;

  const passenger = movements.filter((m) => m.serviceType === "passenger").length;
  const freight = movements.filter((m) => m.serviceType === "freight").length;
  const towardsNewcastle = movements.filter((m) => m.direction === "towards-newcastle").length;
  const towardsSydney = movements.filter((m) => m.direction === "towards-sydney").length;

  const onTime = movements.filter(
    (m) =>
      m.status !== "cancelled" &&
      (m.delayMinutes === undefined || m.delayMinutes < 2)
  ).length;
  const delayed = movements.filter(
    (m) =>
      m.status === "delayed" ||
      (m.delayMinutes !== undefined && m.delayMinutes >= 2)
  ).length;
  const cancelled = movements.filter((m) => m.status === "cancelled").length;

  const delays = movements
    .filter((m) => m.delayMinutes !== undefined && m.delayMinutes > 0)
    .map((m) => m.delayMinutes!);
  const avgDelayMinutes =
    delays.length > 0
      ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10
      : 0;

  // Peak hour
  const hourCounts: Record<number, number> = {};
  movements.forEach((m) => {
    const h = new Date(m.scheduledTime).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  let peakHour = 0;
  let peakHourCount = 0;
  for (const [h, c] of Object.entries(hourCounts)) {
    if (c > peakHourCount) {
      peakHour = parseInt(h);
      peakHourCount = c;
    }
  }

  const stoppingAtCardiff = movements.filter(
    (m) => m.cardiffCall && m.cardiffCall.stopsHere
  ).length;
  const stoppingAtKotara = movements.filter(
    (m) => m.kotaraCall && m.kotaraCall.stopsHere
  ).length;
  const passingThrough = movements.filter((m) => m.passesThrough).length;
  const liveTracked = movements.filter(
    (m) =>
      m.confidence.level === "confirmed-live" ||
      m.confidence.level === "confirmed-updated"
  ).length;
  const uniqueOperators = [...new Set(movements.map((m) => m.operator))];

  return {
    date: dateStr,
    label,
    total: movements.length,
    passenger,
    freight,
    towardsNewcastle,
    towardsSydney,
    onTime,
    delayed,
    cancelled,
    avgDelayMinutes,
    peakHour,
    peakHourCount,
    stoppingAtCardiff,
    stoppingAtKotara,
    passingThrough,
    liveTracked,
    uniqueOperators,
    hourlyBreakdown: buildHourlyBreakdown(movements),
  };
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const now = new Date();
  const searchParams = request.nextUrl.searchParams;

  const todayFilters: MovementFilters = {
    station: (searchParams.get("station") as StationFilter) || "both",
    direction: (searchParams.get("direction") as DirectionFilter) || "both",
    type: (searchParams.get("type") as TypeFilter) || "all",
    status: (searchParams.get("status") as StatusFilter) || "all",
    timeWindow: "today", // Analytics always uses full day
  };

  try {
    const todayResult = await getCorridorMovements(todayFilters);
    const todayStat = computeDayStat(todayResult.movements, now);

    const days: DayStat[] = [todayStat];

    // For past days, re-use today's schedule as proxy (GTFS repeats weekly)
    for (let i = 1; i <= 6; i++) {
      const day = subDays(now, i);
      try {
        const dayResult = await getCorridorMovements(todayFilters);
        const stat = computeDayStat(dayResult.movements, day);
        stat.liveTracked = 0; // Past days have no live data
        days.push(stat);
      } catch {
        days.push(computeDayStat([], day));
      }
    }

    const response: AnalyticsResponse = {
      today: todayStat,
      days,
      generatedAt: now.toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Analytics error:", err);
    return NextResponse.json(
      {
        error: "Failed to generate analytics",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
