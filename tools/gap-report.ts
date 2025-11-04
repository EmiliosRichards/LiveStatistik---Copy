import 'dotenv/config'
import { externalPool } from '../server/external-db'

type Row = Record<string, any>

function getArg(name: string): string | undefined {
  const p = `--${name}=`
  return process.argv.slice(2).find(a => a.startsWith(p))?.slice(p.length)
}

function today(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

async function q(sql: string, params: any[] = []): Promise<Row[]> {
  if (!externalPool) throw new Error('External DB not configured (EXTERNAL_DB_* envs)')
  const client = await externalPool.connect()
  try {
    const res = await client.query(sql, params)
    return res.rows as Row[]
  } finally {
    client.release()
  }
}

async function run() {
  const dateFrom = getArg('from') || daysAgo(7)
  const dateTo = getArg('to') || today()
  console.log(`\n🔎 Gap report for ${dateFrom} → ${dateTo}`)

  const rows = await q(
    `WITH base AS (
       SELECT t.id, t.fired::date AS day,
              (t."user_loginName" IS NULL OR TRIM(t."user_loginName")='') AS missing_login
       FROM public.transactions t
       WHERE t.fired ~ '^\\d{4}-\\d{2}-\\d{2}'
         AND t.fired::date BETWEEN $1 AND $2
     ),
     joined AS (
       SELECT b.*, (c.transaction_id IS NULL) AS no_connection,
              (COALESCE(NULLIF(r.started,''), NULLIF(c.started,'')) IS NULL) AS no_start
       FROM base b
       LEFT JOIN public.connections c ON c.transaction_id = b.id
       LEFT JOIN public.recordings  r ON r.connection_id   = c.id
     )
     SELECT day,
            COUNT(*)::int AS tx_total,
            SUM(CASE WHEN missing_login THEN 1 ELSE 0 END)::int AS tx_missing_login,
            SUM(CASE WHEN no_connection THEN 1 ELSE 0 END)::int AS tx_no_connection,
            SUM(CASE WHEN (NOT no_connection) AND no_start THEN 1 ELSE 0 END)::int AS tx_missing_start
     FROM joined
     GROUP BY day
     ORDER BY day;`,
    [dateFrom, dateTo]
  )

  console.table(rows)
  const totals = rows.reduce(
    (a, r) => {
      a.tx_total += r.tx_total || 0
      a.tx_missing_login += r.tx_missing_login || 0
      a.tx_no_connection += r.tx_no_connection || 0
      a.tx_missing_start += r.tx_missing_start || 0
      return a
    },
    { tx_total: 0, tx_missing_login: 0, tx_no_connection: 0, tx_missing_start: 0 }
  )
  console.log('\nTotals:')
  console.table([totals])

  console.log('\nTip: use this date range to backfill from Dialfire API.')
}

run().catch(err => {
  console.error('❌ Gap report failed:', err?.message || err)
  process.exit(1)
})


