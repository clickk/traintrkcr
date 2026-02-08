import { NextResponse } from "next/server";
import { fetchNetworkVehicles } from "@/lib/network";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchNetworkVehicles();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        vehicles: [],
        feedStatuses: [{ name: "All", status: "error", count: 0, error: String(err) }],
        timestamp: new Date().toISOString(),
        totalAcrossFeeds: 0,
      },
      { status: 500 }
    );
  }
}
