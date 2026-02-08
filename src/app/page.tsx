"use client";

import { useState, useCallback } from "react";
import type { Movement, MovementFilters } from "@/lib/types";
import { useMovements } from "@/hooks/useMovements";
import { useNotifications } from "@/hooks/useNotifications";
import FilterBar from "@/components/FilterBar";
import StatusBanner from "@/components/StatusBanner";
import LiveBoard from "@/components/LiveBoard";
import CorridorView from "@/components/CorridorView";
import MapView from "@/components/MapView";
import MovementDetails from "@/components/MovementDetails";
import FeedStatusPanel from "@/components/FeedStatusPanel";
import NextTrainWidget from "@/components/NextTrainWidget";
import ETACountdown from "@/components/ETACountdown";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import SpotterLog from "@/components/SpotterLog";
import NetworkMap from "@/components/NetworkMap";

type ViewTab = "live-board" | "corridor" | "map" | "network" | "spotter" | "analytics";

const TAB_CONFIG: { id: ViewTab; label: string; icon: string }[] = [
  { id: "live-board", label: "Live Board", icon: "📋" },
  { id: "corridor", label: "Corridor", icon: "🛤️" },
  { id: "map", label: "Map", icon: "🗺️" },
  { id: "network", label: "Network", icon: "🌐" },
  { id: "spotter", label: "Spotter", icon: "📷" },
  { id: "analytics", label: "Analytics", icon: "📊" },
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

  const notifications = useNotifications(data?.movements || []);

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

        {/* Alert Controls + Clock */}
        <div className="flex items-center gap-3">
          {/* Push notification toggle */}
          <button
            onClick={notifications.togglePush}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              notifications.pushEnabled
                ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-muted)]"
            }`}
            title="Push notifications — alert 1 min before train passes your location"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="hidden sm:inline">Alerts</span>
          </button>

          {/* Sound mode toggle */}
          <button
            onClick={notifications.toggleSound}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              notifications.soundEnabled
                ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-muted)]"
            }`}
            title="Sound mode — audio announcement 1 min before train passes"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494m0 0A8.001 8.001 0 014 12m8 5.747A8.001 8.001 0 0020 12M9.879 16.121A3 3 0 1012.015 8" />
            </svg>
            <span className="hidden sm:inline">Sound</span>
          </button>

          <div className="hidden md:block text-right">
            <LiveClock />
          </div>
        </div>
      </header>

      {/* Next Train Sticky Widget */}
      {data && (
        <NextTrainWidget movements={data.movements} />
      )}

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
              <>
                <ETACountdown movements={data.movements} />
                <LiveBoard
                  movements={data.movements}
                  onSelectMovement={handleSelectMovement}
                />
              </>
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
            {activeTab === "network" && (
              <div className="p-4">
                <NetworkMap />
              </div>
            )}
            {activeTab === "spotter" && (
              <SpotterLog movements={data.movements} />
            )}
            {activeTab === "analytics" && (
              <AnalyticsDashboard filters={filters} />
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
