"use client";

import { useState, useCallback } from "react";
import type { Movement, MovementFilters } from "@/lib/types";
import { useMovements } from "@/hooks/useMovements";
import FilterBar from "@/components/FilterBar";
import StatusBanner from "@/components/StatusBanner";
import LiveBoard from "@/components/LiveBoard";
import CorridorView from "@/components/CorridorView";
import MapView from "@/components/MapView";
import MovementDetails from "@/components/MovementDetails";
import FeedStatusPanel from "@/components/FeedStatusPanel";

type ViewTab = "live-board" | "corridor" | "map";

const TAB_CONFIG: { id: ViewTab; label: string; icon: string }[] = [
  { id: "live-board", label: "Live Board", icon: "📋" },
  { id: "corridor", label: "Corridor", icon: "🛤️" },
  { id: "map", label: "Map", icon: "🗺️" },
];

const DEFAULT_FILTERS: MovementFilters = {
  station: "both",
  direction: "both",
  type: "all",
  status: "all",
  timeWindow: "now",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<ViewTab>("live-board");
  const [filters, setFilters] = useState<MovementFilters>(DEFAULT_FILTERS);
  const [selectedMovement, setSelectedMovement] = useState<Movement | null>(
    null
  );

  const { data, loading, error, lastRefresh, refresh } =
    useMovements(filters);

  const handleSelectMovement = useCallback((movement: Movement) => {
    setSelectedMovement(movement);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedMovement(null);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* App Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg
              className="w-7 h-7 text-[var(--color-accent)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="4" y="3" width="16" height="14" rx="2" />
              <path d="M4 10h16" />
              <circle cx="8" cy="20" r="1" />
              <circle cx="16" cy="20" r="1" />
              <path d="M8 17v2" />
              <path d="M16 17v2" />
            </svg>
            <div>
              <h1 className="text-lg font-bold tracking-tight">TRAINTRCKR</h1>
              <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest">
                Cardiff · Kotara Corridor
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-[var(--color-surface-2)] rounded-lg p-1">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-3)]"
              }`}
            >
              <span className="text-sm">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Clock */}
        <div className="hidden md:block text-right">
          <LiveClock />
        </div>
      </header>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onRefresh={refresh}
        lastRefresh={lastRefresh}
        loading={loading}
      />

      {/* Main Content */}
      <main className="flex-1">
        {error && !data && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="text-red-400 text-lg font-medium mb-2">
                Failed to load movements
              </div>
              <div className="text-sm text-[var(--color-text-muted)] mb-4">
                {error}
              </div>
              <button
                onClick={refresh}
                className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading corridor movements...
            </div>
          </div>
        )}

        {data && (
          <>
            {activeTab === "live-board" && (
              <LiveBoard
                movements={data.movements}
                onSelectMovement={handleSelectMovement}
              />
            )}
            {activeTab === "corridor" && (
              <CorridorView
                movements={data.movements}
                onSelectMovement={handleSelectMovement}
              />
            )}
            {activeTab === "map" && (
              <div className="p-4">
                <MapView
                  movements={data.movements}
                  onSelectMovement={handleSelectMovement}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Status Banners — bottom of page */}
      {data && (
        <div className="px-4 pb-2">
          <StatusBanner
            fallbackActive={data.fallbackActive}
            fallbackReason={data.fallbackReason}
            feeds={data.feeds}
            lastRefresh={lastRefresh}
          />
        </div>
      )}

      {/* Feed Status Footer */}
      {data && <FeedStatusPanel feeds={data.feeds} />}

      {/* Movement Details Modal */}
      {selectedMovement && (
        <MovementDetails
          movement={selectedMovement}
          onClose={handleCloseDetails}
        />
      )}
    </div>
  );
}

/**
 * Live clock component showing current time in AEST.
 */
function LiveClock() {
  const [time, setTime] = useState(new Date());

  // Update every second
  if (typeof window !== "undefined") {
    setTimeout(() => setTime(new Date()), 1000);
  }

  return (
    <div>
      <div className="text-lg font-mono font-bold tabular-nums">
        {time.toLocaleTimeString("en-AU", {
          timeZone: "Australia/Sydney",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)] uppercase">
        AEST
      </div>
    </div>
  );
}
