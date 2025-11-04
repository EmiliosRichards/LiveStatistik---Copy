import 'dotenv/config'
import { externalPool } from '../server/external-db'

type Row = Record<string, any>

function getCliArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(prefix)) return a.slice(prefix.length)
  }
  return fallback
}

async function query(sql: string, params: any[] = []): Promise<Row[]> {
  if (!externalPool) throw new Error('External DB is not configured (EXTERNAL_DB_* envs)')
  const client = await externalPool.connect()
  try {
    const res = await client.query(sql, params)
    return res.rows as Row[]
  } finally {
    client.release()
  }
}

function today(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

async function run() {
  const date = getCliArg('date', today())!
  console.log(`\n🔎 Ingestion audit (dry-run) for date ${date}`)

  // 1) Totals and missing user_loginName
  const [totals] = await query(
    `SELECT 
       COUNT(*)::int AS tx_total,
       SUM(CASE WHEN t."user_loginName" IS NULL OR TRIM(t."user_loginName")='' THEN 1 ELSE 0 END)::int AS tx_missing_login
     FROM public.transactions t
     WHERE t.fired ~ '^\\d{4}-\\d{2}-\\d{2}' AND t.fired::date = $1`,
    [date]
  )
  console.log(`• transactions: total=${totals?.tx_total || 0}, missing user_loginName=${totals?.tx_missing_login || 0}`)

  // 2) Join coverage from missing-login transactions to connections
  const [joinCov] = await query(
    `WITH day_tx AS (
       SELECT t.id
       FROM public.transactions t
       WHERE t.fired ~ '^\\d{4}-\\d{2}-\\d{2}' AND t.fired::date = $1
         AND (t."user_loginName" IS NULL OR TRIM(t."user_loginName")='')
     )
     SELECT 
       COUNT(*)::int AS missing_rows,
       SUM(CASE WHEN c.transaction_id IS NULL THEN 1 ELSE 0 END)::int AS no_connections,
       SUM(CASE WHEN c."user" IS NOT NULL AND TRIM(c."user")<>'' THEN 1 ELSE 0 END)::int AS have_conn_user
     FROM day_tx dt
     LEFT JOIN public.connections c ON c.transaction_id = dt.id`,
    [date]
  )
  console.log(`• missing-login rows: ${joinCov?.missing_rows || 0}, with connections.user present=${joinCov?.have_conn_user || 0}, without connection=${joinCov?.no_connections || 0}`)

  // 3) Campaign attribution availability via contact_id (recordings or connections)
  const [campCov] = await query(
    `WITH day_tx AS (
       SELECT t.id
       FROM public.transactions t
       WHERE t.fired ~ '^\\d{4}-\\d{2}-\\d{2}' AND t.fired::date = $1
         AND (t."user_loginName" IS NULL OR TRIM(t."user_loginName")='')
     )
     SELECT 
       SUM(CASE WHEN r.contact_id IS NOT NULL AND TRIM(r.contact_id)<>'' THEN 1 ELSE 0 END)::int AS have_rec_contact,
       SUM(CASE WHEN c.contact_id IS NOT NULL AND TRIM(c.contact_id)<>'' THEN 1 ELSE 0 END)::int AS have_conn_contact,
       SUM(CASE WHEN COALESCE(NULLIF(r.started,''), NULLIF(c.started,'')) IS NOT NULL THEN 1 ELSE 0 END)::int AS have_any_start
     FROM day_tx dt
     LEFT JOIN public.connections c ON c.transaction_id = dt.id
     LEFT JOIN public.recordings  r ON r.connection_id   = c.id`,
    [date]
  )
  console.log(`• attribution availability (contact_id): recordings=${campCov?.have_rec_contact || 0}, connections=${campCov?.have_conn_contact || 0}`)
  console.log(`• time availability (start): rows with r.started or c.started present=${campCov?.have_any_start || 0}`)

  // 4) Sample rows that would be recoverable by view fallbacks
  const sample = await query(
    `WITH day_tx AS (
       SELECT t.id
       FROM public.transactions t
       WHERE t.fired ~ '^\\d{4}-\\d{2}-\\d{2}' AND t.fired::date = $1
         AND (t."user_loginName" IS NULL OR TRIM(t."user_loginName")='')
     )
     SELECT dt.id AS tx_id, c."user" AS conn_user, c.started AS conn_started, r.started AS rec_started,
            r.contact_id AS rec_contact_id, c.contact_id AS conn_contact_id
     FROM day_tx dt
     LEFT JOIN public.connections c ON c.transaction_id = dt.id
     LEFT JOIN public.recordings  r ON r.connection_id   = c.id
     WHERE (c."user" IS NOT NULL AND TRIM(c."user")<>'')
        OR (COALESCE(NULLIF(r.started,''), NULLIF(c.started,'')) IS NOT NULL)
        OR (COALESCE(NULLIF(r.contact_id,''), NULLIF(c.contact_id,'')) IS NOT NULL)
     ORDER BY COALESCE(r.started, c.started) DESC NULLS LAST
     LIMIT 10`,
    [date]
  )
  if (sample.length) {
    console.log('\n• sample (recoverable by fallbacks):')
    sample.forEach((r, i) => {
      console.log(`  #${i + 1} tx=${r.tx_id} user=${r.conn_user || ''} start=${r.rec_started || r.conn_started || ''} contact=${r.rec_contact_id || r.conn_contact_id || ''}`)
    })
  } else {
    console.log('\n• sample: none')
  }

  // 5) Print safe DDL backup plan for the view
  console.log('\nDDL (backup plan):')
  console.log('  BEGIN;')
  console.log('  ALTER VIEW public.agent_data RENAME TO agent_data_backup;')
  console.log('  -- then CREATE OR REPLACE VIEW public.agent_data AS ... (hardened)')
  console.log('  COMMIT;')

  console.log('\n✅ Dry-run finished. No data was modified.')
}

run().catch(err => {
  console.error('❌ Audit failed:', err?.message || err)
  process.exit(1)
})


