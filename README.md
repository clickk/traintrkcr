# TRAINTRCKR — Cardiff · Kotara Corridor

Live train timetable and movement tracking for the Cardiff–Kotara corridor on the Newcastle line, New South Wales, Australia.

Shows every train movement that passes through or stops at Cardiff and Kotara stations, including passenger and freight, with clear status, direction, timing, and confidence labelling.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your API keys (see "API Keys" section below)
cp .env.example .env.local
# Edit .env.local with your keys

# 3. Run the development server
npm run dev

# 4. Open http://localhost:3000
```

The app works immediately with scheduled timetable data even without API keys. Realtime updates and enhanced freight data require API keys.

---

## Features

### Views

| View | Description |
|------|-------------|
| **Live Board** | Departures/arrivals for Cardiff and Kotara, split by direction, showing scheduled time, estimated time, platform, service type, operator, stops pattern, and disruption flags |
| **Corridor View** | Single timeline of all movements between Cardiff and Kotara with progress indicators and stopping/passing status |
| **Map View** | Leaflet map of the corridor with live vehicle positions (when available), station markers, and movement sidebar |
| **Movement Details** | Full detail modal showing trip ID, run ID, service name, origin, destination, consist type, last update time, data source, and confidence level |

### Filters

- **Station**: Cardiff, Kotara, or Both
- **Direction**: Towards Newcastle, Towards Sydney, or Both
- **Type**: Passenger, Freight, or All
- **Status**: Scheduled, Live, Delayed, Cancelled, Completed, or All
- **Time Window**: Now (±15 min/+1h), Next 2 Hours, Today

### Confidence Labelling

Every movement displays a confidence badge explaining the data source:

| Level | Badge | Meaning |
|-------|-------|---------|
| **Confirmed Live** | 🟢 | Live vehicle position confirmed from GTFS-RT Vehicle Positions |
| **Confirmed Updated** | 🔵 | Times updated from GTFS-RT Trip Updates (delays, cancellations) |
| **Scheduled Only** | ⚪ | From GTFS static timetable only — no realtime data available |
| **Estimated Freight** | 🟣 | Modelled from known corridor freight patterns — not real-time |

---

## Data Sources & Endpoints

### Passenger Services (Transport for NSW Open Data)

| Dataset | Endpoint | Purpose |
|---------|----------|---------|
| **GTFS Static Timetables** | `https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains` | Baseline schedule, stop patterns, route info |
| **GTFS-RT Trip Updates** | `https://api.transport.nsw.gov.au/v2/gtfs/realtime/sydneytrains` | Realtime delays, cancellations, stop time changes |
| **GTFS-RT Vehicle Positions** | `https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/sydneytrains` | Live train locations |

All TfNSW endpoints require an API key sent as `Authorization: apikey {key}`.

Source: [opendata.transport.nsw.gov.au](https://opendata.transport.nsw.gov.au/)

### Freight Services

| Source | Purpose | Status |
|--------|---------|--------|
| **ARTC Developer Portal** | Live/planned freight movements on the Hunter corridor | Optional — requires API key from [developer.artc.com.au](https://developer.artc.com.au/) |
| **data.infrastructure.gov.au** | Historical freight train movement data from ARTC | Reference dataset |
| **Modelled patterns** | Estimated freight based on published corridor capacity | Default fallback |

#### Freight Coverage Limitations

> **Important**: Live freight running data is generally NOT publicly available in real-time. ARTC's public data is typically historical or planned, not live operational data.

The app handles freight as follows:

1. **If ARTC API key is configured**: Attempts to fetch freight movements from the ARTC developer portal. The actual data availability depends on ARTC's current API offerings.
2. **If no ARTC API key**: Falls back to modelled freight patterns based on:
   - Known Hunter Valley coal chain volumes (~6 coal trains/day through corridor)
   - Intermodal freight patterns (~3/day)
   - Seasonal grain traffic (~1/day)
3. **All freight movements are clearly labelled** as "Estimated Freight" with an explanation of the data source.
4. **Actual freight times may vary significantly** from estimates. For confirmed freight times, contact ARTC or the freight operator directly.

---

## API Keys

### TfNSW Open Data API Key (Recommended)

1. Register at [opendata.transport.nsw.gov.au](https://opendata.transport.nsw.gov.au/)
2. Create an application in the developer portal
3. Subscribe to:
   - Public Transport - Timetables - For Realtime GTFS
   - Public Transport - Realtime Trip Update
   - Public Transport - Realtime Vehicle Positions v2
4. Copy your API key
5. Add to `.env.local`:
   ```
   TFNSW_API_KEY=your_key_here
   ```

### ARTC API Key (Optional)

1. Register at [developer.artc.com.au](https://developer.artc.com.au/)
2. Subscribe to available freight data products
3. Copy your subscription key
4. Add to `.env.local`:
   ```
   ARTC_API_KEY=your_key_here
   ```

**Without API keys**: The app runs on generated schedule data that matches published NSW TrainLink timetable patterns. It works fully but without live delay/cancellation updates.

---

## Architecture

```
src/
├── app/
│   ├── layout.tsx              # Root layout with Leaflet CSS
│   ├── page.tsx                # Main page with tabs, filters, state
│   ├── globals.css             # Dark theme, animations, Leaflet overrides
│   └── api/
│       └── movements/
│           └── route.ts        # GET /api/movements — unified movement endpoint
├── components/
│   ├── LiveBoard.tsx           # Station departure boards
│   ├── CorridorView.tsx        # Timeline view with progress indicators
│   ├── MapView.tsx             # Leaflet map (dynamic import, SSR-safe)
│   ├── MovementDetails.tsx     # Detail modal
│   ├── MovementCard.tsx        # Individual movement display
│   ├── FilterBar.tsx           # Filter controls
│   ├── StatusBanner.tsx        # Degradation/fallback warnings
│   ├── ConfidenceBadge.tsx     # Confidence level indicator
│   └── FeedStatusPanel.tsx     # Data feed status footer
├── hooks/
│   └── useMovements.ts         # Data fetching + auto-refresh hook
└── lib/
    ├── types.ts                # Shared TypeScript types
    ├── stations.ts             # Cardiff & Kotara station config
    ├── corridor.ts             # Movement aggregation & filtering
    ├── tfnsw/
    │   ├── client.ts           # TfNSW API client (auth, fetch)
    │   ├── gtfs-static.ts      # Schedule generation from timetable patterns
    │   ├── gtfs-realtime.ts    # GTFS-RT processing & merging
    │   └── types.ts            # GTFS-specific types
    └── freight/
        ├── artc-client.ts      # ARTC freight data adapter
        └── types.ts            # Freight-specific types
```

### Data Flow

```
TfNSW GTFS Static ──┐
                     ├──→ Corridor Aggregator ──→ /api/movements ──→ useMovements hook ──→ UI
TfNSW GTFS-RT ──────┤                                                    ↑
                     │                                              Auto-refresh
ARTC / Modelled ─────┘                                              (20 seconds)
```

### Key Design Decisions

- **Server-side data aggregation**: All API calls to external services happen server-side via Next.js API routes. The client only calls `/api/movements`.
- **Graceful degradation**: If realtime feeds fail, the app falls back to static schedule data and displays a prominent banner explaining why.
- **Modular adapters**: Each data source has its own adapter in `src/lib/`. New sources can be added without modifying existing code.
- **SSR-safe map**: Leaflet is dynamically imported client-side only to avoid SSR issues.

---

## Running & Testing Locally

### Development

```bash
npm run dev
# Opens at http://localhost:3000
```

### Production Build

```bash
npm run build
npm start
```

### Verification Checklist

- [ ] Open the app — next departures from Cardiff and Kotara are visible
- [ ] Time window "Now" shows upcoming movements with scheduled times
- [ ] Toggle to "Freight" — freight movements appear with purple "Estimated Freight" badges
- [ ] Toggle to "Passenger" — only passenger services shown
- [ ] Toggle to "All" — both types visible
- [ ] Click any movement — detail modal shows trip ID, run ID, operator, confidence, and data source
- [ ] Corridor view shows timeline with all movements sorted chronologically
- [ ] Map view shows Cardiff and Kotara station markers with corridor rail line
- [ ] If no API key is set, a fallback banner appears explaining scheduled-only mode
- [ ] Auto-refresh updates data every ~20 seconds (watch the "Updated" timestamp)
- [ ] Feed status footer shows status of all data feeds

---

## Tech Stack

- **Next.js 16** — React framework with App Router and API routes
- **TypeScript** — Type-safe throughout
- **Tailwind CSS 4** — Utility-first styling with dark theme
- **Leaflet + React-Leaflet** — Interactive corridor map
- **gtfs-realtime-bindings** — Protocol Buffer parsing for GTFS-RT feeds
- **date-fns** — Date/time utilities

---

## Station Identification

The app uses the following TfNSW GTFS stop IDs:

| Station | Stop ID | Notes |
|---------|---------|-------|
| Cardiff | 225521 | Parent station; platform IDs follow TfNSW convention |
| Kotara | 225421 | Parent station; platform IDs follow TfNSW convention |

These IDs are configured in `src/lib/stations.ts` and should be validated against the current GTFS `stops.txt` file if the feed changes.

---

## Licence

This project uses publicly available data from Transport for NSW and ARTC. Usage of TfNSW data is subject to the [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. ARTC data usage is subject to ARTC's developer portal terms.
