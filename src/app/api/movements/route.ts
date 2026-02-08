import { NextRequest, NextResponse } from "next/server";
import { getCorridorMovements } from "@/lib/corridor";
import type {
  MovementFilters,
  StationFilter,
  DirectionFilter,
  TypeFilter,
  StatusFilter,
  TimeWindow,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const filters: MovementFilters = {
    station: (searchParams.get("station") as StationFilter) || "both",
    direction: (searchParams.get("direction") as DirectionFilter) || "both",
    type: (searchParams.get("type") as TypeFilter) || "all",
    status: (searchParams.get("status") as StatusFilter) || "all",
    timeWindow: (searchParams.get("timeWindow") as TimeWindow) || "now",
  };

  try {
    const response = await getCorridorMovements(filters);
    return NextResponse.json(response);
  } catch (err) {
    console.error("Error fetching corridor movements:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch corridor movements",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
