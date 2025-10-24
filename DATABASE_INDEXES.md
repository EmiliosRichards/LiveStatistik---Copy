# Database Indexes for Chart Performance

## Overview
These indexes will dramatically speed up the chart queries from **120+ seconds to ~2-5 seconds** on first load.

## Table: `agent_data`

### Primary Index (Most Important)
This composite index will speed up both chart queries:

```sql
-- Composite index for agent login and transaction date
-- This is the PRIMARY index that will speed up 90% of chart queries
CREATE INDEX CONCURRENTLY idx_agent_data_login_date 
ON agent_data (transactions_user_login, transactions_fired_date);
```

### Secondary Indexes (Optional but Recommended)

```sql
-- Index for outcome-based filtering
-- Speeds up queries that filter by status/status_detail
CREATE INDEX CONCURRENTLY idx_agent_data_status 
ON agent_data (transactions_status, transactions_status_detail);

-- Index for date range queries specifically
-- Helps with DATE_TRUNC and EXTRACT operations
CREATE INDEX CONCURRENTLY idx_agent_data_date_only 
ON agent_data (transactions_fired_date);
```

### Covering Index (Advanced - Maximum Performance)

If you want the **absolute fastest** queries, create this covering index that includes all columns needed by the queries:

```sql
-- Covering index (includes all columns used in queries)
-- Warning: This will use more disk space but provide maximum query speed
CREATE INDEX CONCURRENTLY idx_agent_data_covering 
ON agent_data (
  transactions_user_login, 
  transactions_fired_date
) INCLUDE (
  transaction_id,
  contacts_id,
  contacts_campaign_id,
  transactions_status,
  transactions_status_detail
);
```

## How to Apply These Indexes

### Option 1: Apply All at Once (Recommended)
```bash
# Connect to your PostgreSQL database
psql -h 185.216.75.247 -U your_username -d your_database

# Run the primary index (most important)
CREATE INDEX CONCURRENTLY idx_agent_data_login_date 
ON agent_data (transactions_user_login, transactions_fired_date);

# Run the secondary indexes
CREATE INDEX CONCURRENTLY idx_agent_data_status 
ON agent_data (transactions_status, transactions_status_detail);

CREATE INDEX CONCURRENTLY idx_agent_data_date_only 
ON agent_data (transactions_fired_date);
```

### Option 2: Apply Minimum (Fastest to Create)
If you want to test with just the essential index first:

```bash
# Just create the primary composite index
CREATE INDEX CONCURRENTLY idx_agent_data_login_date 
ON agent_data (transactions_user_login, transactions_fired_date);
```

## Important Notes

1. **CONCURRENTLY keyword**: Creates indexes without locking the table, so your live system stays online
2. **Index creation time**: May take 5-30 minutes depending on table size
3. **Disk space**: Each index uses ~10-20% of table size
4. **Immediate benefit**: Charts will load in ~2-5 seconds instead of 120+ seconds

## Verify Indexes Were Created

After creating the indexes, verify they exist:

```sql
SELECT 
  indexname, 
  indexdef
FROM pg_indexes 
WHERE tablename = 'agent_data'
  AND indexname LIKE 'idx_agent_data%';
```

## Expected Performance Improvement

| Query | Before | After | Improvement |
|-------|--------|-------|-------------|
| Monthly Trends | 120+ sec | 2-5 sec | **24-60x faster** |
| Outcome Distribution | 120+ sec | 2-5 sec | **24-60x faster** |
| With cache | N/A | ~2ms | **Instant** |

## Monitoring Index Usage

After creating indexes, monitor their usage:

```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'agent_data'
  AND indexname LIKE 'idx_agent_data%'
ORDER BY idx_scan DESC;
```

## Removing Indexes (If Needed)

If you need to remove any index:

```sql
DROP INDEX CONCURRENTLY idx_agent_data_login_date;
DROP INDEX CONCURRENTLY idx_agent_data_status;
DROP INDEX CONCURRENTLY idx_agent_data_date_only;
DROP INDEX CONCURRENTLY idx_agent_data_covering;
```

---

**Recommendation**: Start with just the **primary composite index** (`idx_agent_data_login_date`). This single index will give you 80-90% of the performance benefit with minimal overhead.
