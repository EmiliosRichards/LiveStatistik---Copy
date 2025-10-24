# Teamleiter Live-Statistik

## Overview

A full-stack, real-time(ish) dashboard for team leaders to monitor call-center performance. The **Next.js app** (`web/`) serves as the main frontend on port 5000, proxying API requests to the **Express backend** (`server/`) running on port 5001. The backend aggregates live data from a read-only external Postgres database. The UI supports agent/project filtering, date and time windows (Cyprus time), call outcome drill-downs, campaign management, and detailed analytics.

**Note:** The `client/` directory contains the legacy React SPA and is no longer actively developed.

## Stack at a glance

- **Frontend**: Next.js 15 (Turbopack) + TypeScript, React 19, Tailwind CSS, NextAuth
- **Backend**: Express + TypeScript on port 5001, serves API endpoints
- **Architecture**: Next.js proxies `/api/*` requests to Express backend via rewrites in `next.config.ts`
- **Data model**: Shared types and Zod validation in `shared/schema.ts`
- **Data source**: External read-only Postgres via `pg`, optimized SQL queries
- **Campaign management**: Google Sheets integration for campaign metadata and status
- **Legacy**: React SPA in `client/` (no longer active)

## Run the app

Prerequisites: Node.js ≥ 20

- Install deps:
```bash
npm install
```
- Configure environment (see “Environment variables”). In Replit, add secrets accordingly.
- Development (runs both Express backend on 5001 and Next.js on 5000):
```bash
bash start-all.sh
```
- Build client and bundle server:
```bash
npm run build
```
- Production start (serves API + built client on `PORT`, default 5000):
```bash
npm start
```

## Environment variables

Required for external read-only database:
- `EXTERNAL_DB_HOST`
- `EXTERNAL_DB_DATABASE`
- `EXTERNAL_DB_USER`
- `EXTERNAL_DB_PASSWORD`

Optional/conditional:
- `PORT`: Server port (defaults to 5000)
- `DIALFIRE_API_TOKEN`: Enables Dialfire campaign title mapping/connectivity checks
- `TRANSCRIPTION_API_KEY`: Enables transcription endpoints
- `PREVIEW_BASIC_AUTH=1`, `PREVIEW_USER`, `PREVIEW_PASS`: Basic Auth gate for preview environments
- `DATABASE_URL`: Neon/Drizzle (only used if switching to internal DB mode)

## Architecture

### Backend
- Entry: `server/index.ts` sets up JSON parsing, request logging for `/api/*`, optional preview Basic Auth, health check, error handling, and either Vite middleware (dev) or static serving (prod).
- Routes: `server/routes.ts` defines all REST endpoints. Core storage is injected via `server/storage.ts` which currently exports an `ExternalStorage` instance.
- Dev tooling: `server/vite.ts` wires Vite middleware; prod serves `dist/public`.

### Data layer
- `server/external-db.ts`: `pg` Pool to external Postgres (read-only). Queries use parameterized SQL and `DISTINCT ON` for deduplication and limits for performance. Includes:
  - `getAgentDataForStatistics()` — fetches raw records for detailed statistics
  - `getAggregatedKpis()` — DB-level aggregation using SQL COUNT/SUM/AVG for KPIs (2 weeks of data)
- `server/external-storage.ts`: In-memory maps of Agents/Projects (loaded from external DB). Implements `IStorage` against external DB data for:
  - Agents/projects discovery (unique logins/campaigns)
  - Statistics aggregation (single optimized query for selected agents/projects/date range/time filters)
  - Call details (agent+campaign with date/time filters, mapping to internal `CallDetails` and a deterministic `groupId`)
  - Project targets (kept in-memory)
  - KPI aggregation with 5-minute cache (`getAggregatedKpisWithCache()`)
- `shared/schema.ts`: Drizzle tables and Zod schemas shared with the client; includes `statisticsFilterSchema`, outcome categorization, and types used on the frontend.

### Frontend
- Entry: `client/src/main.tsx` → `client/src/App.tsx` (QueryClient, Toaster, Tooltip, Wouter routes)
- Main page: `client/src/pages/dashboard.tsx`
  - Manual search flow: users select agents/projects and a date range, then click "Statistiken suchen" to load `/api/statistics`
  - Auto-refresh (when enabled): ~10s interval while filters are clean; manual refresh button available
  - Call details: fetched on demand via `/api/call-details/:agentId/:projectId` with optional date/time filters; data is grouped by computed `groupId`
  - Notifications: Shows deltas for outcomes detected “today” only; initial loads are muted to avoid noise
- i18n: `client/src/i18n.ts` with `en.json` and `de.json` translations

## Time zone model

- Time filters in the UI are interpreted as Cyprus time (Europe/Nicosia).
- For DB queries, times are converted to UTC (−3h) before filtering; for call-details display/filtering, server converts timestamps to Cyprus time (+3h) before applying `timeFrom/timeTo` comparisons.

## API surface (selected)

- Agents & projects
  - `GET /api/agents`
  - `PATCH /api/agents/:id/status`
  - `GET /api/projects`
  - `POST /api/projects-for-agents` (filter by selected agents)
  - `POST /api/projects-with-calls` (optimized discovery for date/time window)

- Statistics & details
  - `POST /api/statistics` — body validated by `statisticsFilterSchema`
  - `GET /api/call-details/:agentId/:projectId` — query: `dateFrom`, `dateTo`, `timeFrom`, `timeTo`
  - `GET /api/kpis` — optimized aggregated KPIs with week-over-week comparison, 5-minute cache; query param: `?refresh=true` to bypass cache

- Project targets (in-memory persistence)
  - `GET /api/project-targets`
  - `POST /api/project-targets`

- Environment/infra
  - `GET /api/healthz`
  - `GET /api/database-status` — tests connectivity to external DB
  - `GET /api/dialfire-status` — tests Dialfire API (requires `DIALFIRE_API_TOKEN`)
  - `GET /api/campaign-mapping` — maps Dialfire campaign IDs → titles (cached)

- Transcription (optional; requires `TRANSCRIPTION_API_KEY`)
  - `POST /api/transcribe` — submit audio URL
  - `GET /api/transcribe/:audioFileId/status`

## Data flow (statistics)

1) Frontend sends `POST /api/statistics` with agents, optional projects, `dateFrom/dateTo` and optional `timeFrom/timeTo`.
2) Backend resolves agent IDs → logins and project IDs → campaign IDs, then runs a single optimized external DB query.
3) Results are aggregated into daily `AgentStatistics` per agent/project:
   - `anzahl` (total), `abgeschlossen` (success + declined), `erfolgreich` (success only)
   - Time metrics converted to hours: `wartezeit` (sec), `gespraechszeit` (ms), `nachbearbeitungszeit` (sec), `vorbereitungszeit` (sec), and derived `arbeitszeit`
   - Outcome breakdown by `transactions_status_detail`

## Development notes

- Path aliases (see `vite.config.ts`): `@` → `client/src`, `@shared` → `shared`, `@assets` → `attached_assets`
- In dev, Vite serves the client via middleware; in prod, the built client is served from `dist/public`.
- Drizzle is configured (Neon) but not used by default. If you switch to `DatabaseStorage`, ensure `DATABASE_URL` is set and run migrations with Drizzle Kit.

### Drizzle (optional)

- Type-check/build:
```bash
npm run check
```
- Push schema (if using internal DB mode):
```bash
npm run db:push
```

## Troubleshooting

- **External DB connectivity**: Check `/api/database-status`. If failing, the UI shows a database warning (footer). Ensure network allowlist (e.g., `pg_hba.conf`) includes current server IPs. The UI provides suggested ranges in German.
- **Dialfire mapping**: Without `DIALFIRE_API_TOKEN`, project names may appear as raw IDs; status endpoint will show disconnected.
- **Long requests**: Statistics have a 5-minute timeout; call-details 10 seconds. Narrow the date/time window if needed.
- **Preview auth**: If `PREVIEW_BASIC_AUTH=1`, configure `PREVIEW_USER`/`PREVIEW_PASS` to access the app.

## Security

- App is intended for internal use. No end-user auth by default (optional preview Basic Auth). External database access is read-only.

## Code style

- TypeScript across server and client. Shared Zod/Drizzle types in `shared`. Prefer descriptive names, early returns, and minimal deep nesting.