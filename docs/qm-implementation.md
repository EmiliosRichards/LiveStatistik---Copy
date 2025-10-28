# Quality Management (QM) View – Implementation Notes

This document describes how we ingest the monthly QM Excel, normalize it, and surface it in the dashboard as a new "QM" view.

## Scope
- Source: Excel workbook (SharePoint or local), with monthly sheets named like `Abschlüsse 10.2025`, `Abschlüsse 11.2025`, etc.
- Goal: Show per–agent, per–campaign targets vs performance with a daily breakdown and notes.
- Outputs: API that returns normalized rows; dashboard table using our global table styles.

## Data source and sheet structure
- Typical book sheets observed:
  - `Agenten Projekte`, `Partnerprojekte`, multiple `Abschlüsse <MM.YYYY>` sheets, and others.
- The monthly sheet (e.g. `Abschlüsse 10.2025`) is the primary data source.
- Columns observed in sample:
  - Fixed labels: `Projekt`, `Agent`, `Soll` (target), `Perf` (score/average), `Notizen` (free text)
  - Ratio column: a single-space header (equals `Perf / Soll` in the sample)
  - Daily columns: numeric or coded columns `1..31` (one per day of the month)
  - Other placeholders: `__EMPTY`, `__EMPTY_1`, … from the Excel export

### Semantics used
- `Soll` – numeric monthly target (per agent + campaign)
- `Perf` – performance metric (decimal); not necessarily a sum. In sample, `Perf / Soll` ≈ ratio shown under the space header
- Daily columns `1..31` – numeric (count-like) or code markers:
  - Numeric values contribute to an `achievedSum` (our derived metric)
  - Codes observed: `K`, `U`, `F`, `…` – treated as day status markers (e.g., Krank/Vacation/etc.) and do not add to `achievedSum`
- `Notizen` – optional notes per row

## Normalization (server-side)
We normalize each Excel row into the following shape (example interface):

```ts
export type QmDailyCell = {
  day: number;                  // 1..31
  value?: number;               // numeric, if present
  code?: string;                // e.g., 'K','U','F' if non-numeric
};

export type QmRow = {
  sheet: string;                // e.g. 'Abschlüsse 10.2025'
  projectName: string;          // Excel 'Projekt'
  agentName: string;            // Excel 'Agent'
  targetSoll: number | null;    // Excel 'Soll'
  perfScore: number | null;     // Excel 'Perf'
  attainmentProvided: number | null; // Excel space header; ratio in [0..1]
  achievedSum: number;          // derived: sum of daily numeric values
  notes?: string | null;        // Excel 'Notizen'
  daily: QmDailyCell[];         // 31 entries (some may be empty)
};
```

Derivations:
- `achievedSum = sum(number(cell) for day in 1..31)` – ignores codes and blanks
- `attainmentProvided` is kept as-is (if present). We can also compute an explicit attainment: `achievedSum / targetSoll` if desired.

## Ad-hoc inspection tool
To quickly inspect the workbook during development we provide `tools/fetch-qm-excel.ts`.

Usage (PowerShell):
- Public/direct link (if truly anonymous):
```
npm run qm:fetch -- "<sharepoint-link>"
```
- If authentication required (403), either:
  - Provide cookies in the same terminal session:
```
$env:SHAREPOINT_COOKIE="FedAuth=...; rtFa=..."
npm run qm:fetch -- "<sharepoint-link>"
```
  - Download locally and run on the file:
```
npm run qm:fetch -- "C:\\path\\to\\file.xlsx"
```

The tool prints:
- All sheet names
- Chosen monthly sheet (prefers names matching `absch|abschluss|abschlüsse`)
- Columns detected
- A sample of ~50 normalized rows (agent, campaign, target, perf, notes, daily/raw)

## API design (planned)
Endpoint: `GET /api/qm`

Query params (proposed):
- `month`: `YYYY-MM` – picks `Abschlüsse <MM.YYYY>` sheet (or latest if omitted)
- `sheet`: sheet name override (if specific naming doesn’t match the pattern)

Behavior:
- Load workbook from a configured source (SharePoint direct link, cached file, or local path)
- Pick sheet per `month`/`sheet`
- Normalize to `QmRow[]` as above
- Return small, chart/table-ready JSON
- Cache in-memory for 1–5 minutes per (sheet) to keep the page fast

Security:
- If SharePoint is not anonymous, fetching requires auth. We will either:
  - Accept a server-side cookie/token via env vars, or
  - Preferably integrate with Microsoft Graph/SharePoint API using an app registration (future)

## UI – QM view in dashboard
- New section/tab: `QM`
- Table columns:
  - Agent, Campaign, Soll (target), Achieved (sum of daily numbers), Perf, Attainment %, Notes
- Row details/expander:
  - Daily breakdown (1..31), visual markers for codes (K/U/…)
- Filters/sorting:
  - Filter by agent/campaign
  - Select month (maps to sheet)
- Style:
  - Use our global table styles/utilities, consistent with Agent detailed page

## Edge cases & handling
- Empty/placeholder columns (`__EMPTY*`): ignored
- Localized number formats: the parser treats the Excel numbers as numeric; strings fall back to codes
- Codes (e.g., `K`, `U`, `F`): stored as `code`; not counted in `achievedSum`
- Ratio column with NBSP header: Excel sometimes exports a single NBSP as a header; we map it to `attainmentProvided`

## Operations
- Development: use the tool to sanity–check incoming workbooks
- Configuration: set an env var for SharePoint URL or mount a file path in production
- Caching: short TTL (e.g., 60s–300s) to avoid repeated parsing under load

## Future improvements
- Replace cookie-based access with Microsoft Graph API (client credentials) and store the driveItem ID
- Persist monthly snapshot into DB to allow historical queries without re-reading Excel
- Add trend charts per agent/campaign; export CSV from the QM view
- Add code legend (K/U/F/…) with totals

## Quick checklist
- [ ] Add `/api/qm` endpoint with caching
- [ ] Wire month/sheet picker logic
- [ ] Implement `QmRow` normalization with robust code parsing
- [ ] Create `QM` dashboard tab using existing table styles
- [ ] Add filters and row expander with daily breakdown
- [ ] Configure SharePoint source (public link or Graph auth)
