## Recent Updates

### Fix: Average call duration showing 0
- Removed an extra division by 60 on the UI:
  - `web/src/app/dashboard/agent/[agentId]/page.tsx`: `avgDuration` now computed as `gz / completed`.
  - `web/src/app/dashboard/campaign/[campaignId]/page.tsx`: display uses `(gz / completed).toFixed(2)`.
- Normalized CSV loader units so durations aggregate correctly across sources:
  - `server/storage.ts`: treat `GZ/h` from CSV as hours and convert to minutes where appropriate.
- Verified backend external storage already aggregates talk time in hours; frontend uses minutes for averages.

### Fix: Campaign call table copy-to-clipboard error
- Added missing `copied` state in campaign `CallRow` to prevent `ReferenceError: copied is not defined` and show feedback on click.

### Navigation and state persistence
- Standardized “Back” behavior on detailed pages to prioritize `history.back()` and fall back to a URL with preserved filters.
- Moved “Change period” button on the agent detail page into the filter controls for consistency.
- Persisted filters and selections via `sessionStorage` on dashboard search/results pages and agent/campaign lists.

### New: /stats page (self‑contained analytics)
- Route: `web/src/app/stats/page.tsx` (client page; dynamic rendering).
- Filters: date‑range with inline calendars and compare toggle.
- KPI summary card row backed by Express API:
  - Primary source: aggregated KPIs with week‑over‑week comparison.
  - Fallback: aggregate from `storage.getAgentStatistics` when KPI source is empty.
- Implemented and proxied new stats endpoints in Express (`server/routes.ts`) and Next.js rewrites (`web/next.config.ts`):
  - `GET /api/stats/summary`: total calls, reach rate, positives, avg duration (min), conversion rate, with comparison and trend.
  - `GET /api/stats/heatmap`: success rate by weekday × hour (Cyprus time), using call details across agents and active campaigns.
  - `GET /api/stats/positive-mix`: distribution of positive outcomes with share of all positives.
  - `GET /api/stats/agent-improvement`: week‑over‑week success‑rate deltas per agent, sorted by improvement.
  - `GET /api/stats/efficiency`: avg talk time positive vs other; notes effect (with/without notes success rate, and lift).
  - `GET /api/stats/campaign-effectiveness`: per‑campaign success rate and lift vs overall period average.
  - `GET /api/stats/targets-progress`: actual positives vs configured targets (if targets exist), with % progress.
- All endpoints include short TTL in‑memory caching to keep the UI responsive.

### Proxy/infra
- Added `/api/stats/*` to Next.js rewrites so all stats calls are forwarded to Express in dev/prod.
- Kept authentication protections unchanged; stats endpoints are covered by existing middleware and session handling.

### UX polish & resilience
- Restored a JSX comment delimiter that had caused a parsing error in the campaign page.
- Hardened transcription error handling and loading states on detail rows.
- Various minor text internationalization updates via `useLanguage`/`t()` on detailed pages.

### Notes
- Large periods on /stats rely on the optimized external aggregation; the summary auto‑falls back to statistics aggregation when needed.
- Heatmap/efficiency computations use real call details filtered by date range and account for Cyprus time (+3h) where relevant.


