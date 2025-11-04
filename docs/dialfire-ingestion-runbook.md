## Dialfire → Postgres ingestion: investigation brief and runbook

### Purpose
This document equips an engineer to investigate and fix missing/partial call data in Postgres that propagates to the UI (agent pages, campaign pages, `/stats`). It consolidates symptoms, likely root causes, evidence so far, verification SQL, OS-level discovery steps, API connectivity checks, mitigation/backfill plans, and acceptance criteria.

---

## Problem statement
- Recent calls for some agents (e.g., `Buket.Beken`) exist in Dialfire but are not visible in the app or appear as zeros (e.g., average durations).
- DB inspection shows many `transactions` rows missing critical identifiers (e.g., `user_loginName`) and often lacking corresponding `connections` or `recordings` rows.
- Attempts to query Dialfire API with a tenant-scoped token returned `403 Forbidden` from local machine, blocking ad‑hoc backfill tests.

### Impact
- Analytics and agent detail pages underreport activity.
- Operational monitoring (reach, conversion, avg duration) is unreliable.
- Trust in `/stats` and dashboards is affected; QM initiatives depend on accurate data.

### Scope
- Ingestion path from Dialfire → (ingester service/job) → Postgres base tables:
  - `transactions` (events/attempts, includes agent login and campaign/contact references)
  - `connections` (call connections with timestamps/user/contact mapping)
  - `recordings` (audio with start times)
- SQL views layered on top (e.g., `agent_data`) and UI aggregations (Express API → Next.js pages).

---

## Symptoms observed
- Filtering an agent for “today” yields 0 results in UI, while Dialfire shows activity.
- Avg call duration previously rendered as `0` due to unit mismatch (minutes vs hours) and extra division; UI and CSV parsing have been corrected, but underlying DB gaps persist for recent data.
- API logs for `/api/stats/*` show partial data: KPI summary returns, but other aggregates frequently empty.
- Manual API tests to Dialfire return `403 Forbidden` from developer machine, even with apparently valid tenant and token.

---

## Hypotheses (ranked)
1. API authentication/networking:
   - Token scope/format mismatch, or wrong header used.
   - IP restriction: token works only from server/VPC; local machine receives 403.
   - Endpoint path mismatch (must be `/api/tenants/{TENANT}/...`).
   - Token expired or tenant bound incorrectly.
2. Ingestion job defects:
   - Not writing `user_loginName` (or writing empty/whitespace); missing joins to `connections`/`recordings`.
   - Timestamp fields written as text or invalid format, breaking date filters/joins.
   - Partial failures not retried (network errors drop rows silently).
3. View fragility:
   - `agent_data` (or equivalent) inner‑joins on nullable fields, filtering out otherwise usable rows.
   - No fallbacks (`COALESCE`) between `transactions.user_loginName`, `connections.user`, `transactions.user`.
4. Timezone and windowing:
   - UTC vs Europe/Nicosia boundaries exclude calls near midnight.
   - Off‑by‑one day in date truncation due to text/timestamp mishandling.

---

## Evidence to date
- DB rows with missing `user_loginName`; frequent absence of matching `connections`/`recordings`.
- Text‑typed date columns requiring casts for filtering (e.g., `transactions_fired_date` stored as text).
- UI showed 0 avg durations until unit conversion fixes (now corrected for CSV path and frontend calculation).
- Dialfire API requests with `Authorization: Bearer <token>` and `?access_token=<token>` both returned `403` from local machine.

---

## What “good” looks like (acceptance criteria)
- Dialfire API can be queried successfully from the ingestion host (200 OK). If IP‑restricted, a documented method exists to test via the host.
- Ingestion job consistently writes:
  - `transactions.user_loginName` populated
  - Valid timestamps (typed `timestamp` or safely cast) for date filters
  - `connections` and `recordings` present where expected
- View layer is resilient: left joins and `COALESCE` prevent data loss where fallbacks exist.
- Backfill rehydrates missing records for selected date ranges, idempotently.
- UI (agent page, campaign page, `/stats`) reflects correct counts and non‑zero avg durations for recent days.

---

## Investigation workflow

### 1) Discover the ingestion process on the server
Run on the host that writes to Postgres.

```bash
# Services and timers that may be the ingester
systemctl list-units --type=service --all | grep -Ei 'dialfire|ingest|etl|sync|node|pm2|docker'
systemctl list-timers --all | grep -Ei 'dialfire|ingest|etl|sync|job'

# Cron jobs
crontab -l || true
sudo crontab -l || true
ls -l /etc/cron.* /etc/cron.d 2>/dev/null
grep -RniE 'dialfire|api\.dialfire|ingest|etl|sync|psql|node|python' /etc/cron.* /etc/cron.d 2>/dev/null

# PM2 (Node)
pm2 ls || true
pm2 logs --lines 200 || true
sudo systemctl status pm2-$USER || sudo systemctl status pm2 || true

# Docker (if containerized)
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' || true
sudo docker ps -a | grep -Ei 'ingest|dialfire|etl|worker' || true
# For any candidate container (replace <name>):
# sudo docker logs <name> --since 24h | egrep -i 'dialfire|ingest|error|403|401'
```

What to record:
- Service name, start command, environment, schedule.
- Log excerpts showing HTTP responses, payload shapes, errors.

### 2) Find code/env on disk

```bash
# Likely locations; adjust paths as needed
sudo grep -RIlE "api\.dialfire\.com|/api/tenants/|DIALFIRE|TENANT" /{srv,opt,var/www,home} 2>/dev/null | head -n 100

# Where env is configured for services
sudo grep -RniE '(DIALFIRE|TENANT|EXTERNAL_DB|PG)' /etc/systemd/system /etc/default /etc/environment /etc/profile.d 2>/dev/null
```

Outcome:
- Source files and env definitions that determine token, tenant, API base URL, schedule.

### 3) Network/API sanity from the ingestion host
Try multiple header styles and ensure proper path and JSON accept header.

```bash
TENANT="9c6d0163"
TOKEN="<REDACTED>"

# Preferred: vendor-specific header if supported
curl -i \
  -H "Accept: application/json" \
  -H "User-Agent: manuav-ingester/1.0" \
  -H "X-Api-Token: ${TOKEN}" \
  "https://api.dialfire.com/api/tenants/${TENANT}/campaigns"

# Fallbacks often seen in the wild
curl -i -H "Accept: application/json" -H "Authorization: Bearer ${TOKEN}" \
  "https://api.dialfire.com/api/tenants/${TENANT}/campaigns"

curl -i -H "Accept: application/json" \
  "https://api.dialfire.com/api/tenants/${TENANT}/campaigns?access_token=${TOKEN}"
```

Interpretation:
- `200 OK`: proceed to enumerate campaigns and pull calls.
- `403`: likely IP restriction, token scope, or header mismatch. Test the same commands from the app server vs. local laptop to confirm IP‑based behavior.

---

## Database verification (Postgres)

Set parameters for the checks (use DBeaver named parameters or replace literals).

```sql
-- Parameters
-- :the_date (DATE), :agent_login (TEXT)

-- 1) Any transactions for the date?
SELECT COUNT(*)
FROM transactions t
WHERE to_date(t.transactions_fired_date, 'YYYY-MM-DD') = :the_date;

-- 2) Missing agent logins on that date
SELECT COUNT(*) AS missing_login
FROM transactions t
WHERE to_date(t.transactions_fired_date, 'YYYY-MM-DD') = :the_date
  AND (t.user_loginName IS NULL OR btrim(t.user_loginName) = '');

-- 3) Transactions for a specific agent
SELECT t.*
FROM transactions t
WHERE to_date(t.transactions_fired_date, 'YYYY-MM-DD') = :the_date
  AND t.user_loginName = :agent_login
ORDER BY t.id DESC
LIMIT 100;

-- 4) Join coverage to connections/recordings
SELECT
  COUNT(*) FILTER (WHERE c.contact_id IS NOT NULL) AS with_connection,
  COUNT(*) FILTER (WHERE r.recording_id IS NOT NULL) AS with_recording
FROM transactions t
LEFT JOIN connections c ON c.transaction_id = t.id
LEFT JOIN recordings r ON r.transaction_id = t.id
WHERE to_date(t.transactions_fired_date, 'YYYY-MM-DD') BETWEEN :the_date AND :the_date;

-- 5) Sample rows missing user_loginName but having other clues
SELECT t.id, t.transactions_contact_id, t.user, c.user AS connection_user
FROM transactions t
LEFT JOIN connections c ON c.transaction_id = t.id
WHERE to_date(t.transactions_fired_date, 'YYYY-MM-DD') = :the_date
  AND (t.user_loginName IS NULL OR btrim(t.user_loginName) = '')
LIMIT 50;
```

Notes:
- If `transactions_fired_date` is already typed as `date` or `timestamp`, drop the `to_date(...)` cast accordingly.

---

## View resilience (mitigation)

If your reporting view (e.g., `agent_data`) filters via inner joins on nullable fields, harden it:
- Use `LEFT JOIN` to avoid dropping rows prematurely.
- `COALESCE` fields like agent login and timestamps from multiple sources.

Illustrative technique (adapt to your schema):

```sql
SELECT
  COALESCE(t.user_loginName, c.user, t.user) AS agent_login,
  COALESCE(r.started, c.started)             AS call_started,
  COALESCE(t.transactions_contact_id, c.contact_id) AS contact_id,
  -- other derived metrics
FROM transactions t
LEFT JOIN connections c ON c.transaction_id = t.id
LEFT JOIN recordings  r ON r.transaction_id = t.id;
```

This reduces data loss while the root ETL issue is fixed.

---

## Root fix (ingester)

Once the process is found:
- Ensure agent login is populated deterministically:
  - Prefer canonical `user_loginName` from the source; fallback to connection user if necessary.
- Enforce types:
  - Store dates/timestamps in typed columns; normalize timezones to UTC in storage and convert at query time to Europe/Nicosia when needed.
- Idempotent upserts:
  - Use stable natural keys (e.g., Dialfire transaction ID) to avoid duplicates on retries.
- Robust retries and logging:
  - Log non‑200 responses and requeue; never silently drop.

---

## Backfill plan

1) Pick a date range (e.g., last 14 days) and campaign set.
2) From the ingestion host, call Dialfire endpoints to list campaigns and pull call/transaction detail.
3) Normalize to the same schema as the ingester and UPSERT into `transactions`/`connections`/`recordings`.
4) Run the DB verification queries to confirm fill‑in.

Safety:
- Run backfill in small windows (e.g., per day) and commit in batches.
- Instrument progress and provide a dry‑run mode before writes.

---

## Verification checklist (post‑fix)
- From server: Dialfire API returns 200 for campaign listing and call detail.
- On DB:
  - Missing login count ~0 for target dates.
  - `connections`/`recordings` coverage improves.
  - Timestamps typed and filterable without casts.
- UI:
  - Agent page shows non‑zero results for same‑day filters.
  - Avg durations sensible and stable across reloads.
  - `/stats` KPIs populated across sections.

---

## Open questions
- Is the token bound to specific IP ranges or a particular account scope?
- Are there Dialfire rate limits or pagination semantics we must respect in the ingester?
- What is the canonical join key set between transactions ↔ connections ↔ recordings (and do we have uniqueness constraints)?

---

## Appendix: Quick commands

### Curl templates
```bash
TENANT="9c6d0163"; TOKEN="<REDACTED>"
curl -i -H "Accept: application/json" -H "X-Api-Token: ${TOKEN}" \
  "https://api.dialfire.com/api/tenants/${TENANT}/campaigns"
```

### DBeaver parameter binding tips
- Do not quote named parameters in SQL; set parameter types in the UI (e.g., `DATE` for `:the_date`, `STRING` for `:agent_login`).
- If a column is text but holds dates, use `to_date(column, 'YYYY-MM-DD')` temporarily; plan to migrate to a typed column.

---

## Related docs
- `docs/ingestion-investigation.md` (complements this runbook with findings/fixes/implications)
- `docs/data-map-reference.md` (schema context)


