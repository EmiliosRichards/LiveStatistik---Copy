#!/usr/bin/env tsx
import 'dotenv/config'

import { externalPool } from '../../server/external-db'

async function main() {
  console.log('[DB Connectivity] Checking external database connection...')
  const cfg = {
    host: process.env.EXTERNAL_DB_HOST,
    db: process.env.EXTERNAL_DB_DATABASE,
    user: process.env.EXTERNAL_DB_USER,
    hasPass: !!process.env.EXTERNAL_DB_PASSWORD,
  }
  console.log('ENV summary:', cfg)

  if (!externalPool) {
    console.error('External DB pool not configured. Set EXTERNAL_DB_* vars.')
    process.exit(1)
  }

  const client = await externalPool.connect()
  try {
    const res = await client.query('SELECT NOW() as now')
    console.log('Connected. NOW() =', res.rows?.[0]?.now)
  } finally {
    client.release()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })


