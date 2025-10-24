#!/usr/bin/env tsx
import 'dotenv/config'
import { externalPool } from '../server/external-db'

type IndexSuggestion = {
  table: string
  name: string
  sql: string
  reason: string
  kind: 'btree' | 'btree_expr'
}

type ColumnInfo = { column_name: string; data_type: string }

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

async function tableExists(table: string): Promise<boolean> {
  if (!externalPool) return false
  const client = await externalPool.connect()
  try {
    const res = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [table]
    )
    return res.rowCount > 0
  } finally {
    client.release()
  }
}

async function relationKind(relname: string): Promise<'table'|'view'|'matview'|'other'> {
  if (!externalPool) return 'other'
  const client = await externalPool.connect()
  try {
    const res = await client.query(
      `SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1`,
      [relname]
    )
    const kind = res.rows?.[0]?.relkind
    if (kind === 'r') return 'table'
    if (kind === 'v') return 'view'
    if (kind === 'm') return 'matview'
    return 'other'
  } finally {
    client.release()
  }
}

async function getViewDef(relname: string): Promise<string|undefined> {
  if (!externalPool) return undefined
  const client = await externalPool.connect()
  try {
    const res = await client.query(`SELECT pg_get_viewdef($1::regclass, true) AS def`, [relname])
    return res.rows?.[0]?.def
  } finally {
    client.release()
  }
}

async function columnsOf(table: string): Promise<Set<string>> {
  if (!externalPool) return new Set()
  const client = await externalPool.connect()
  try {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [table]
    )
    return new Set((res.rows || []).map((r: any) => String(r.column_name)))
  } finally {
    client.release()
  }
}

async function columnsDetail(table: string): Promise<ColumnInfo[]> {
  if (!externalPool) return []
  const client = await externalPool.connect()
  try {
    const res = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [table]
    )
    return res.rows as ColumnInfo[]
  } finally {
    client.release()
  }
}

async function existingIndexes(table: string): Promise<string[]> {
  if (!externalPool) return []
  const client = await externalPool.connect()
  try {
    const res = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=$1`,
      [table]
    )
    return (res.rows || []).map((r: any) => String(r.indexdef))
  } finally {
    client.release()
  }
}

function hasIndexCovering(indexDefs: string[], pattern: RegExp): boolean {
  return indexDefs.some(def => pattern.test(def))
}

function resolveColumn(existing: Set<string>, alternatives: string[]): string | null {
  // Try exact matches ignoring case
  const lowerToActual = new Map<string, string>()
  for (const c of existing) lowerToActual.set(c.toLowerCase(), c)
  for (const alt of alternatives) {
    const actual = lowerToActual.get(alt.toLowerCase())
    if (actual) return actual
  }
  // Try relaxed matching: remove non-alphanumerics
  function relax(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }
  const relaxedMap = new Map<string, string>()
  for (const c of existing) relaxedMap.set(relax(c), c)
  for (const alt of alternatives) {
    const actual = relaxedMap.get(relax(alt))
    if (actual) return actual
  }
  return null
}

// Helpers to compare against existing index definitions without fragile regex
function normalizeDef(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').replace(/"/g, '')
}

function hasIndexWithColumns(indexDefs: string[], columnsInOrder: string[]): boolean {
  const wanted = '(' + columnsInOrder.map(c => c.toLowerCase().replace(/[^a-z0-9_]/g, '')).join(',') + ')'
  return indexDefs.some(def => normalizeDef(def).includes(wanted))
}

function hasIndexWithExpr(indexDefs: string[], expr: string): boolean {
  const wanted = normalizeDef(expr)
  return indexDefs.some(def => normalizeDef(def).includes(wanted))
}

async function suggestIndexes(): Promise<IndexSuggestion[]> {
  if (!externalPool) throw new Error('External DB not configured (EXTERNAL_DB_*)')

  const suggestions: IndexSuggestion[] = []

  // 1) agent_data is a VIEW; index underlying base tables instead
  const agentDataKind = await relationKind('public.agent_data')
  const agentDataView = agentDataKind !== 'table' ? await getViewDef('public.agent_data') : undefined

  // Base tables we see in the repo/screenshot
  const baseTables = ['transactions', 'contacts', 'connections', 'recordings', 'campaign_state_reference_data', 'campaign_agent_reference_data']

  for (const tbl of baseTables) {
    if (!(await tableExists(tbl))) continue
    const kindThis = await relationKind(tbl)
    // Only emit runnable CREATE INDEX for real tables; skip views/materialized views
    if (kindThis !== 'table') {
      continue
    }
    const cols = await columnsOf(tbl)
    const idx = await existingIndexes(tbl)

    // transactions: heavy filters by user + date, and joins by contacts_id
    if (tbl === 'transactions') {
      const loginCol = resolveColumn(cols, ['transactions_user_login', 'user_loginname', 'user_login', 'user'])
      const dateCol = resolveColumn(cols, ['transactions_fired_date', 'fired', 'created_date', 'entry_date', 'date'])
      const contactCol = resolveColumn(cols, ['contacts_id', 'contact_id'])
      const statusCol = resolveColumn(cols, ['transactions_status', 'status'])
      const detailCol = resolveColumn(cols, ['transactions_status_detail', 'status_detail'])

      if (loginCol && dateCol) {
        if (!hasIndexWithColumns(idx, [loginCol, dateCol])) {
          suggestions.push({
            table: tbl,
            name: 'idx_transactions_user_date',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_date ON public.transactions (${quoteIdent(loginCol)}, ${quoteIdent(dateCol)});`,
            reason: 'Filters by agent and date range across KPIs, stats, outcomes',
            kind: 'btree'
          })
        }
        if (!hasIndexWithColumns(idx, [dateCol])) {
          suggestions.push({
            table: tbl,
            name: 'idx_transactions_date',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_date ON public.transactions (${quoteIdent(dateCol)});`,
            reason: 'Date-only filters (year/month aggregations)',
            kind: 'btree'
          })
        }
      }
      if (loginCol) {
        if (!hasIndexWithExpr(idx, `lower(btrim(${loginCol}))`)) {
          suggestions.push({
            table: tbl,
            name: 'idx_transactions_login_norm',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_login_norm ON public.transactions ((lower(btrim(${quoteIdent(loginCol)}))));`,
            reason: 'Call-details uses LOWER(TRIM(login))',
            kind: 'btree_expr'
          })
        }
      }
      if (contactCol && dateCol) {
        if (!hasIndexWithColumns(idx, [contactCol, dateCol])) {
          suggestions.push({
            table: tbl,
            name: 'idx_transactions_contact_date',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_contact_date ON public.transactions (${quoteIdent(contactCol)}, ${quoteIdent(dateCol)});`,
            reason: 'Joins to contacts + date windows (backing agent_data view)',
            kind: 'btree'
          })
        }
      }
      if (statusCol && !hasIndexWithColumns(idx, [statusCol])) {
        suggestions.push({
          table: tbl,
          name: 'idx_transactions_status',
          sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status ON public.transactions (${quoteIdent(statusCol)});`,
          reason: 'Outcome distribution groups on status',
          kind: 'btree'
        })
      }
      if (detailCol && !hasIndexWithColumns(idx, [detailCol])) {
        suggestions.push({
          table: tbl,
          name: 'idx_transactions_status_detail',
          sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status_detail ON public.transactions (${quoteIdent(detailCol)});`,
          reason: 'Outcome distribution bins by status_detail',
          kind: 'btree'
        })
      }
    }

    // contacts: campaign filters and joins by id
    if (tbl === 'contacts') {
      const campaignCol = resolveColumn(cols, ['campaign_id', 'contacts_campaign_id', '$campaign_id'])
      const idCol = resolveColumn(cols, ['id'])
      if (campaignCol) {
        if (!hasIndexWithColumns(idx, [campaignCol])) {
          suggestions.push({
            table: tbl,
            name: 'idx_contacts_campaign',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_campaign ON public.contacts (${quoteIdent(campaignCol)});`,
            reason: 'Project filters by campaign',
            kind: 'btree'
          })
        }
        if (!hasIndexWithExpr(idx, `btrim(${campaignCol})`)) {
          suggestions.push({
            table: tbl,
            name: 'idx_contacts_campaign_trim',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_campaign_trim ON public.contacts ((btrim(${quoteIdent(campaignCol)})));`,
            reason: 'Call-details uses TRIM(campaign id)',
            kind: 'btree_expr'
          })
        }
      }
      if (idCol && campaignCol) {
        if (!hasIndexWithColumns(idx, [idCol, campaignCol])) {
          suggestions.push({
            table: tbl,
            name: 'idx_contacts_id_campaign',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_id_campaign ON public.contacts (${quoteIdent(idCol)}, ${quoteIdent(campaignCol)});`,
            reason: 'Join/filter by contact + campaign',
            kind: 'btree'
          })
        }
      }
    }

    // recordings: join by transaction id and sort by started
    if (tbl === 'recordings') {
      const txIdCol = resolveColumn(cols, ['transaction_id', 'transactions_id'])
      const connIdCol = resolveColumn(cols, ['connection_id'])
      if (txIdCol) {
        if (!hasIndexWithColumns(idx, [txIdCol])) {
          suggestions.push({
            table: tbl,
            name: 'idx_recordings_tx',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recordings_tx ON public.recordings (${quoteIdent(txIdCol)});`,
            reason: 'Join from agent_data to recordings by transaction',
            kind: 'btree'
          })
        }
      } else if (connIdCol) {
        if (!hasIndexWithColumns(idx, [connIdCol])) {
          suggestions.push({
            table: tbl,
            name: 'idx_recordings_connection',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recordings_connection ON public.recordings (${quoteIdent(connIdCol)});`,
            reason: 'Join from connections to recordings by connection_id',
            kind: 'btree'
          })
        }
      }
      const startedCol = resolveColumn(cols, ['started', 'start_time', 'recordings_started'])
      if (startedCol) {
        if (!hasIndexWithExpr(idx, `(${startedCol} desc)`)) {
          suggestions.push({
            table: tbl,
            name: 'idx_recordings_started_desc',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recordings_started_desc ON public.recordings (${quoteIdent(startedCol)} DESC);`,
            reason: 'Call lists order by started DESC',
            kind: 'btree'
          })
        }
      }
    }

    // connections: join by transaction id
    if (tbl === 'connections') {
      const txIdCol = cols.has('transaction_id') ? 'transaction_id' : (cols.has('transactions_id') ? 'transactions_id' : null)
      if (txIdCol) {
        if (!hasIndexWithColumns(idx, [txIdCol])) {
          suggestions.push({
            table: tbl,
            name: 'idx_connections_tx',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_connections_tx ON public.connections (${txIdCol});`,
            reason: 'Backs join from agent_data to connections by transaction',
            kind: 'btree'
          })
        }
      }
    }

    // campaign_state_reference_data: lookups by campaign + status/detail
    if (tbl === 'campaign_state_reference_data') {
      if (cols.has('contacts_campaign_id') && cols.has('transactions_status_detail')) {
        if (!hasIndexCovering(idx, /\(contacts_campaign_id,\s*transactions_status_detail\)/i)) {
          suggestions.push({
            table: tbl,
            name: 'idx_csr_campaign_detail',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csr_campaign_detail ON public.campaign_state_reference_data (contacts_campaign_id, transactions_status_detail);`,
            reason: 'getOutcomeStatus and state reference queries',
            kind: 'btree'
          })
        }
      }
      if (cols.has('contacts_campaign_id') && cols.has('transactions_status')) {
        if (!hasIndexCovering(idx, /\(contacts_campaign_id,\s*transactions_status\)/i)) {
          suggestions.push({
            table: tbl,
            name: 'idx_csr_campaign_status',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csr_campaign_status ON public.campaign_state_reference_data (contacts_campaign_id, transactions_status);`,
            reason: 'State enumeration per campaign',
            kind: 'btree'
          })
        }
      }
    }

    // campaign_agent_reference_data: queries by campaign and agent login
    if (tbl === 'campaign_agent_reference_data') {
      if (cols.has('contacts_campaign_id') && cols.has('transactions_user_login')) {
        if (!hasIndexCovering(idx, /\(contacts_campaign_id,\s*transactions_user_login\)/i)) {
          suggestions.push({
            table: tbl,
            name: 'idx_car_campaign_agent',
            sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_car_campaign_agent ON public.campaign_agent_reference_data (contacts_campaign_id, transactions_user_login);`,
            reason: 'Find agents per campaign quickly',
            kind: 'btree'
          })
        }
      }
    }
  }

  // Print quick note if agent_data is a view
  if (agentDataKind === 'view') {
    console.log('Note: public.agent_data is a VIEW; indexes must be added to base tables (transactions, contacts, recordings, connections).')
    if (agentDataView) {
      console.log('\nagent_data definition (truncated):')
      console.log(agentDataView.slice(0, 800) + (agentDataView.length > 800 ? ' ...' : ''))
    }
  }

  return suggestions
}

async function main() {
  console.log('Analyzing index suggestions for external DB...')
  // Print a quick schema snapshot to avoid human lookup
  const overviewTables = ['transactions', 'contacts', 'connections', 'recordings', 'campaign_state_reference_data', 'campaign_agent_reference_data']
  for (const t of overviewTables) {
    const exists = await tableExists(t)
    if (!exists) continue
    const kind = await relationKind(t)
    const cols = await columnsDetail(t)
    console.log(`\n[${t}] (${kind}) columns:`)
    if (cols.length === 0) console.log('  (no columns found)')
    for (const c of cols) {
      console.log(`  - ${c.column_name} :: ${c.data_type}`)
    }
  }
  const suggestions = await suggestIndexes()
  if (suggestions.length === 0) {
    console.log('No new suggestions. Existing indexes likely cover current queries.')
    return
  }
  console.log(`\nSuggested indexes (${suggestions.length}):`)
  for (const s of suggestions) {
    console.log(`\n-- ${s.table}: ${s.reason}`)
    console.log(s.sql)
  }
  console.log('\nRun the above CREATE INDEX CONCURRENTLY statements on your Postgres server.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })


