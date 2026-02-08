"use client";

import type { FeedStatus } from "@/lib/types";

interface StatusBannerProps {
  fallbackActive: boolean;
  fallbackReason?: string;
  feeds: FeedStatus[];
  lastRefresh: Date | null;
}

export default function StatusBanner({
  fallbackActive,
  fallbackReason,
  feeds,
  lastRefresh,
}: StatusBannerProps) {
  const offlineFeeds = feeds.filter((f) => f.status === "offline");
  const degradedFeeds = feeds.filter((f) => f.status === "degraded");

  if (!fallbackActive && offlineFeeds.length === 0 && degradedFeeds.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {fallbackActive && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <svg
            className="w-5 h-5 text-amber-400 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-400">
              Realtime Data Unavailable
            </p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              {fallbackReason ||
                "Showing scheduled times only. Realtime updates will resume when feeds are restored."}
            </p>
          </div>
        </div>
      )}

      {degradedFeeds.map((feed) => (
        <div
          key={feed.name}
          className="flex items-start gap-3 px-4 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-lg"
        >
          <svg
            className="w-4 h-4 text-purple-400 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-xs font-medium text-purple-400">
              {feed.name}: Degraded
            </p>
            {feed.error && (
              <p className="text-xs text-purple-400/70 mt-0.5">{feed.error}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
