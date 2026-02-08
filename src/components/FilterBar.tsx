"use client";

import type {
  MovementFilters,
  StationFilter,
  DirectionFilter,
  TypeFilter,
  StatusFilter,
  TimeWindow,
} from "@/lib/types";

interface FilterBarProps {
  filters: MovementFilters;
  onChange: (filters: MovementFilters) => void;
  onRefresh: () => void;
  lastRefresh: Date | null;
  loading: boolean;
}

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

const STATION_OPTIONS: FilterOption<StationFilter>[] = [
  { value: "both", label: "Both Stations" },
  { value: "cardiff", label: "Cardiff" },
  { value: "kotara", label: "Kotara" },
];

const DIRECTION_OPTIONS: FilterOption<DirectionFilter>[] = [
  { value: "both", label: "Both Directions" },
  { value: "towards-newcastle", label: "To Newcastle" },
  { value: "towards-sydney", label: "To Sydney" },
];

const TYPE_OPTIONS: FilterOption<TypeFilter>[] = [
  { value: "all", label: "All Types" },
  { value: "passenger", label: "Passenger" },
  { value: "freight", label: "Freight" },
];

const STATUS_OPTIONS: FilterOption<StatusFilter>[] = [
  { value: "all", label: "All Status" },
  { value: "scheduled", label: "Scheduled" },
  { value: "live", label: "Live" },
  { value: "delayed", label: "Delayed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
];

const TIME_OPTIONS: FilterOption<TimeWindow>[] = [
  { value: "now", label: "Now" },
  { value: "next-2h", label: "Next 2 Hours" },
  { value: "today", label: "Today" },
];

function SelectFilter<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 focus:border-[var(--color-accent)] appearance-none cursor-pointer"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238899aa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundPosition: "right 8px center",
          backgroundRepeat: "no-repeat",
          paddingRight: "28px",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function FilterBar({
  filters,
  onChange,
  onRefresh,
  lastRefresh,
  loading,
}: FilterBarProps) {
  const update = (partial: Partial<MovementFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
      <SelectFilter
        label="Station"
        options={STATION_OPTIONS}
        value={filters.station}
        onChange={(v) => update({ station: v })}
      />
      <SelectFilter
        label="Direction"
        options={DIRECTION_OPTIONS}
        value={filters.direction}
        onChange={(v) => update({ direction: v })}
      />
      <SelectFilter
        label="Type"
        options={TYPE_OPTIONS}
        value={filters.type}
        onChange={(v) => update({ type: v })}
      />
      <SelectFilter
        label="Status"
        options={STATUS_OPTIONS}
        value={filters.status}
        onChange={(v) => update({ status: v })}
      />
      <SelectFilter
        label="Time"
        options={TIME_OPTIONS}
        value={filters.timeWindow}
        onChange={(v) => update({ timeWindow: v })}
      />

      <div className="flex items-center gap-3 ml-auto">
        {lastRefresh && (
          <span className="text-[10px] text-[var(--color-text-muted)]">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          title="Refresh now"
        >
          <svg
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>
    </div>
  );
}
