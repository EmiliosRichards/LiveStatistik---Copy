# Teamleiter Live-Statistik

## Overview

A full-stack, real-time dashboard designed for team leaders to monitor call-center performance. The project provides a comprehensive overview of agent and project statistics, including call outcomes, KPIs, and campaign management. The system supports filtering by agent, project, date, and time, and offers drill-down capabilities for detailed analytics.

The business vision is to empower team leaders with immediate, actionable insights into call center operations, enabling data-driven decisions to optimize performance and improve efficiency. This tool aims to enhance productivity, identify training needs, and streamline campaign management for improved customer engagement and operational excellence.

## User Preferences

I prefer iterative development with clear, concise communication. Please ask before making any major architectural changes or introducing new dependencies. When implementing features, prioritize modularity and maintainability. Ensure all new code adheres to the existing TypeScript and styling conventions. I prefer to be informed about the high-level plan and then given updates on progress. Do not make changes to the `client/` folder.

## System Architecture

The application uses a micro-frontend-like architecture with a **Next.js 15 (Turbopack) frontend** (`web/`) running on port 5000, which proxies API requests to an **Express backend** (`server/`) on port 5001. Both are written in TypeScript.

**UI/UX Decisions:**
- The frontend is built with React 19 and styled using Tailwind CSS.
- The dashboard features agent/project filtering, date/time window selection (Cyprus time), call outcome drill-downs, and campaign management.
- KPI calculations use a rolling 7-day comparison for accurate trend analysis.
- Internationalization is supported with English and German translations.

**Technical Implementations:**
- **Authentication:** NextAuth is used for authentication, supporting Azure AD and optional guest access. User roles (Admin, Member, Guest) control feature access and are displayed in the header.
- **Data Model:** Shared types and Zod validation are defined in `shared/schema.ts` for consistency between frontend and backend.
- **Time Zone Handling:** UI time filters are interpreted as Cyprus time. Backend conversions handle UTC for database queries and Cyprus time for display.

**System Design Choices:**
- **Backend Entry:** `server/index.ts` handles API setup, including JSON parsing, request logging, optional preview Basic Auth, health checks, and error handling.
- **Data Layer:** An `ExternalStorage` implementation in `server/external-storage.ts` uses an in-memory cache for agents and projects loaded from the external Postgres database. Optimized SQL queries are used for statistics aggregation and KPI retrieval, with a 5-minute cache for KPIs.
- **API Endpoints:** A well-defined API surface (`server/routes.ts`) provides endpoints for agents, projects, statistics, call details, KPIs, project targets, environment status, and optional transcription services.
- **Development & Production:** In development, Vite serves the client; in production, a built client is served. Production builds disable TypeScript and ESLint checks for faster deployment.

## External Dependencies

- **Postgres Database:** External read-only Postgres database for core data using the `pg` library.
- **NextAuth:** For authentication, integrated with Azure AD.
- **Google Sheets:** Used for campaign metadata and status management.
- **Dialfire API:** Optional integration for campaign title mapping and connectivity checks (requires `DIALFIRE_API_TOKEN`).
- **Transcription API:** Optional integration for audio transcription (requires `TRANSCRIPTION_API_KEY`).
- **Drizzle (Optional):** Configured for potential future use with an internal database, specifically with Neon.

## Recent Changes

### Agent & Campaign Page UI Improvements (October 29, 2025)
- **Archive Toggle on Agent Detail Page**:
  - Added toggle button to show/hide archived campaigns (hidden by default)
  - Displays count badge showing number of archived campaigns
  - Aesthetic design with Archive icon and state-based styling
  - Filters campaign list based on toggle state
  - Full English/German translation support
- **Date Range Filter on Campaign Detail Page**:
  - Added consistent date range filter using same components as agent page
  - Includes InlineCalendar component with quick date selection (Today, This Week, This Month)
  - Displays selected date range below "Back to Campaigns" link
  - Full German translation support for all labels
  - Maintains consistency across agent and campaign views
- **Loading State UX Improvement**:
  - Fixed issue where "No calls found" message would briefly appear before loading state
  - Ensured clean loading state is enforced when waiting for data to appear
  - Loading state now initialized to `true` to prevent flash of empty state
  - Proper loading state management when no agents are selected
  - Comprehensive error handling prevents infinite loading on API failures
- **UI Cleanup**:
  - Removed duplicate date range display from campaign detail page header
  - Date range now only shown in filter indicators section for cleaner layout
- **Files Modified**: `web/src/app/dashboard/agent/[agentId]/page.tsx`, `web/src/app/dashboard/campaign/[campaignId]/page.tsx`, `web/src/locales/en.json`, `web/src/locales/de.json`

### QM (Quality Management) Feature (October 29, 2025)
- **New Feature**: Added comprehensive Quality Management dashboard for monthly target tracking
- **Backend**: 
  - Created `server/qm-parser.ts` to parse Excel workbooks with monthly performance data (supports SharePoint URLs and local files)
  - Added `/api/qm` endpoint with caching (configurable via `QM_EXCEL_PATH` or `QM_EXCEL_URL` environment variables)
  - Handles numeric values and status codes (K/U/F) with daily breakdowns (days 1-31)
- **Frontend**:
  - Created `/dashboard/qm` page with filterable table showing agent/campaign performance vs. targets
  - Features: month selector, agent/campaign filters, expandable rows for daily breakdown
  - Color-coded attainment percentages (green ≥100%, yellow ≥80%, red <80%)
  - Added navigation link in dashboard sidebar with clipboard icon
- **Types**: Added `QmRow` and `QmDailyCell` types to `shared/schema.ts`
- **Translations**: Full English and German support for all QM interface elements
- **Files**: `server/qm-parser.ts`, `server/routes.ts`, `web/src/app/dashboard/qm/page.tsx`, `shared/schema.ts`

### Logo Rendering Fix (October 28, 2025)
- **Issue**: Manuav logo not rendering on signin page in production deployment (broken image icon)
- **Solution**: Replaced regular `<img>` tag with Next.js `<Image>` component for reliable production asset loading
- **Benefits**: Automatic image optimization, better caching, consistent rendering across development and production
- **File**: `web/src/app/signin/page.tsx`

### Deployment Fixes (October 28, 2025)
- **Port configuration**: Removed extra port definition from `.replit` (Autoscale requires single external port)
- **Shell script**: Fixed `start-prod.sh` to properly export environment variables before `exec` command
- **Cache warmer**: Delayed cache warming to 90 seconds in production to prevent startup timeout
- **Azure AD**: Made authentication provider conditional to handle "NA" placeholder credentials gracefully