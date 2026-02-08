"use client";

import type { Movement } from "@/lib/types";
import MovementCard from "./MovementCard";

interface LiveBoardProps {
  movements: Movement[];
  onSelectMovement: (movement: Movement) => void;
}

export default function LiveBoard({
  movements,
  onSelectMovement,
}: LiveBoardProps) {
  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-sm font-semibold">Cardiff</span>
            </div>
            <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-sm font-semibold">Kotara</span>
            </div>
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">
            {movements.length} movement{movements.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* All movements in chronological order */}
        <div className="px-4 py-3">
          {movements.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-8 text-center italic">
              No movements for the selected filters
            </p>
          ) : (
            <div className="space-y-2">
              {movements.map((m) => (
                <MovementCard
                  key={m.id}
                  movement={m}
                  onSelect={onSelectMovement}
                  compact={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
