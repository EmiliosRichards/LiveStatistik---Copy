### Dialfire → Postgres ingestion investigation (2025-10-29)

#### Summary
- **Symptom**: Agent-specific data (e.g., Buket.Beken) missing for today, while other agents show fresh rows. App dashboards reflect gaps.
- **Finding**: A large share of today’s `transactions` rows have an empty `user_loginName`, and many have no matching `connections`/`recordings`. The `public.agent_data` view depends on `t."user_loginName"` and joins through `recordings` to reach `contacts` (campaign), so these rows are excluded from agent-filtered queries.
- **Impact**: Agent dashboards and stats undercount for affected agents; campaign attribution can be missing when joins fail.
- **Fix direction**: Harden the view with fallbacks, optionally backfill today’s rows, and fix the upstream ETL so `user_loginName` and joins are consistently populated.

---

### Evidence (SQL and observations)

1) Latest data overall is fresh today
```sql
SELECT
  MAX(recordings_started::timestamp) AS latest_recording_utc,
  MAX(transactions_fired_date::date) AS latest_day
FROM public.agent_data;
-- result: latest_day = 2025-10-29
```

2) For agent Buket.Beken, latest in view is stale
```sql
SELECT 'Buket.Beken' AS agent,
       MAX(recordings_started::timestamp) AS latest_recording_utc
FROM public.agent_data
WHERE transactions_user_login = 'Buket.Beken';
-- result: latest ~ 2025-10-10
```

3) Today’s activity by login from `transactions` (guarded cast)
```sql
WITH t AS (
  SELECT LOWER(TRIM("user_loginName")) AS login
  FROM public.transactions
  WHERE fired ~ '^\d{4}-\d{2}-\d{2}' AND fired::date = CURRENT_DATE
)
SELECT login, COUNT(*) AS calls
FROM t
GROUP BY login
ORDER BY calls DESC;
-- result: no rows for 'buket%'
```

4) Today’s rows with missing login
```sql
SELECT COUNT(*)
FROM public.transactions
WHERE fired ~ '^\d{4}-\d{2}-\d{2}'
  AND fired::date = CURRENT_DATE
  AND ("user_loginName" IS NULL OR TRIM("user_loginName") = '');
-- result: ~860 rows
```

5) Transactions lacking a connection today
```sql
WITH d AS (
  SELECT t.id
  FROM public.transactions t
  WHERE t.fired ~ '^\d{4}-\d{2}-\d{2}' AND t.fired::date = CURRENT_DATE
)
SELECT
  SUM(CASE WHEN c.transaction_id IS NULL THEN 1 ELSE 0 END) AS tx_without_connection,
  COUNT(*) AS tx_total
FROM d
LEFT JOIN public.connections c ON c.transaction_id = d.id;
-- result: tx_without_connection ~ 913 of ~1658 total
```

6) View definition we rely on (`public.agent_data`)
```sql
SELECT pg_get_viewdef('public.agent_data'::regclass, true);
-- key points in current view:
--   transactions_user_login = t."user_loginName"
--   recordings/contact/campaign joined via recordings → contacts
--   r.started used for time, no fallback to c.started
```

Interpretation:
- Many transactions today either have empty `user_loginName` or do not join to `connections`/`recordings`. Because the view filters and attributes via these fields, agent/day rows are missing even though total daily data exists.

---

### Root cause
- **Upstream ingestion/ETL** is writing transactions with empty `user_loginName` for a subset of calls and/or failing to persist matching `connections`/`recordings` rows. The view depends on those fields for agent attribution and campaign joins.
- **Data quality**: Some time fields in base tables contain non-timestamp strings (e.g., causing cast errors without guards). We used regex guards to query reliably.

---

### Immediate mitigations (database-side)

1) Harden the view with safe fallbacks
- Fall back to `connections."user"` when `t."user_loginName"` is null/empty
- Fall back to `COALESCE(r.started, c.started)` for start times
- Fall back to `COALESCE(r.contact_id, c.contact_id)` to reach contacts/campaign

Proposed replacement (idempotent structure):
```sql
BEGIN;

ALTER VIEW public.agent_data RENAME TO agent_data_backup;

CREATE OR REPLACE VIEW public.agent_data AS
SELECT
  to_char(
    CASE WHEN t.fired::text ~ '^\d{4}-\d{2}-\d{2}' THEN t.fired::date END::timestamptz,
    'YYYY-MM-DD'
  ) AS transactions_fired_date,
  to_char(
    COALESCE(NULLIF(r.started,''), NULLIF(c.started,''))::timestamp,
    'HH24:MI'
  ) AS recordings_start_time,
  c.duration AS connections_duration,
  COALESCE(NULLIF(t."user_loginName",''), NULLIF(c."user",'')) AS transactions_user_login,
  t.status AS transactions_status,
  t.status_detail AS transactions_status_detail,
  t.pause_time_sec AS transactions_pause_time_sec,
  t.edit_time_sec AS transactions_edit_time_sec,
  t.wrapup_time_sec AS transactions_wrapup_time_sec,
  t.wait_time_sec AS transactions_wait_time_sec,
  COALESCE(NULLIF(r.started,''), NULLIF(c.started,'')) AS recordings_started,
  r.stopped AS recordings_stopped,
  r.location AS recordings_location,
  c.phone AS connections_phone,
  COALESCE(r.contact_id, c.contact_id) AS contacts_id,
  co."$campaign_id" AS contacts_campaign_id,
  co.firma AS contacts_firma,
  co.notiz AS contacts_notiz,
  concat_ws(' ', co."Geprüfte_Anrede", co."AP_Vorname", co."AP_Nachname") AS contacts_full_name,
  t.id AS transaction_id
FROM public.transactions t
LEFT JOIN public.connections c ON c.transaction_id::text = t.id::text
LEFT JOIN public.recordings  r ON r.connection_id::text   = c.id::text
LEFT JOIN public.contacts    co ON co."$id"::text         = COALESCE(r.contact_id, c.contact_id)::text
WHERE t.fired IS NOT NULL;

COMMIT;
```

2) Optional one-off backfill for “today” (to unblock dashboards immediately)
```sql
UPDATE public.transactions t
SET "user_loginName" = c."user"
FROM public.connections c
WHERE c.transaction_id = t.id
  AND t.fired ~ '^\d{4}-\d{2}-\d{2}' AND t.fired::date = CURRENT_DATE
  AND (t."user_loginName" IS NULL OR TRIM(t."user_loginName") = '')
  AND c."user" IS NOT NULL AND TRIM(c."user") <> '';
```

Verification after change:
```sql
SELECT COUNT(*) AS rows_found, MAX(recordings_started::timestamp) AS latest
FROM public.agent_data
WHERE transactions_fired_date::date = CURRENT_DATE
  AND LOWER(TRIM(transactions_user_login)) = 'buket.beken';
```

---

### Root fix (application/ETL side)
Actions to make the DB robust long-term:
- Ensure the ingestion job always writes `transactions.user_loginName` (and/or writes `connections."user"` reliably so the view fallback still works).
- Ensure `connections` and `recordings` rows are created for each relevant transaction_id, including `contact_id` for campaign attribution.
- Validate Dialfire API credentials reachability from the host (avoid silent 40x/5xx):
  ```bash
  export DIALFIRE_TOKEN=...; export TENANT=9c6d0163
  curl -s -H "Authorization: Bearer $DIALFIRE_TOKEN" "https://api.dialfire.com/v2/$TENANT/campaigns" | head
  ```
- Locate the ingestion job on the host (systemd/cron/PM2/Docker) and inspect logs:
  ```bash
  sudo systemctl list-timers --all | grep -Ei 'sync|ingest|dialfire|etl'
  sudo systemctl list-units --type=service --all | grep -Ei 'dialfire|ingest|etl|worker|pm2|node|python'
  crontab -l; sudo crontab -l; sudo ls -l /etc/cron.* /etc/cron.d
  sudo grep -RIlE 'api\.dialfire\.com|DIALFIRE|transactions|connections|recordings' /{srv,opt,var/www,home} 2>/dev/null | head -50
  sudo journalctl -u <service> --since '2 days ago'
  ```

Acceptance criteria for the ETL fix:
- 0 rows with empty `transactions.user_loginName` for business hours; exceptions understood and bounded.
- `transactions` ↔ `connections` ↔ `recordings` join rate near 100% for call rows.
- Post-fix Buket’s (and other agents’) calls appear same day in `public.agent_data` and in the app.

---

### Are campaigns being missed?
Check base vs. view coverage for the last 60 days:
```sql
WITH base AS (
  SELECT DISTINCT co."$campaign_id" AS campaign_id
  FROM public.connections c
  JOIN public.recordings  r ON r.connection_id = c.id
  JOIN public.contacts    co ON co."$id"       = COALESCE(r.contact_id, c.contact_id)
  WHERE COALESCE(r.started, c.started) ~ '^\d{4}-\d{2}-\d{2}'
    AND COALESCE(r.started::date, c.started::date) >= CURRENT_DATE - INTERVAL '60 days'
),
in_view AS (
  SELECT DISTINCT contacts_campaign_id AS campaign_id
  FROM public.agent_data
  WHERE transactions_fired_date::date >= CURRENT_DATE - INTERVAL '60 days'
)
SELECT b.campaign_id
FROM base b
LEFT JOIN in_view v ON v.campaign_id = b.campaign_id
WHERE v.campaign_id IS NULL;
```
- Expectation after the hardened view: empty or small, explainable set.

---

### What this means for the app
- Agent and campaign pages rely on `public.agent_data`. Missing `user_loginName` and broken joins hide valid work from dashboards.
- Hardening the view restores visibility even when upstream has occasional gaps, but the ETL fix is necessary to prevent reoccurrence and to keep attribution accurate.

---

### Next steps (operational plan)
1) Apply the hardened view in production (low risk, reversible via `agent_data_backup`).
2) Optionally run the one-day backfill for `user_loginName` to restore today’s dashboards immediately.
3) Locate and fix the ingestion job on the server:
   - verify credentials, error handling, and that user, connection, recording rows are persisted consistently.
   - add logging for rows skipped or missing keys.
4) Add monitoring/alerts:
   - daily check: count of empty `user_loginName`; broken joins rate; latest timestamps per agent.
   - expose a simple health endpoint/report for the app.
5) Validate campaign coverage with the 60-day base-vs-view check and reconcile any remaining gaps.

---

### Appendix: quick query pack
- Who made calls today by login:
```sql
WITH t AS (
  SELECT LOWER(TRIM("user_loginName")) AS login
  FROM public.transactions
  WHERE fired ~ '^\d{4}-\d{2}-\d{2}' AND fired::date = CURRENT_DATE
)
SELECT login, COUNT(*) FROM t GROUP BY 1 ORDER BY 2 DESC;
```

- Today’s null user count:
```sql
SELECT COUNT(*) FROM public.transactions
WHERE fired ~ '^\d{4}-\d{2}-\d{2}' AND fired::date = CURRENT_DATE
  AND ("user_loginName" IS NULL OR TRIM("user_loginName") = '');
```

- Latest per agent in view (spot-check):
```sql
SELECT transactions_user_login, MAX(recordings_started::timestamp) AS latest
FROM public.agent_data
WHERE transactions_fired_date::date = CURRENT_DATE
GROUP BY 1 ORDER BY 2 DESC;
```


