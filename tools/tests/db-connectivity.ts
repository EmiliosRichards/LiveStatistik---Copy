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

  // Low-level socket test for quick diagnosis
  const net = await import('net')
  await new Promise<void>((resolve, reject) => {
    const sock = new net.Socket()
    const host = process.env.EXTERNAL_DB_HOST || '127.0.0.1'
    const port = 5432
    sock.setTimeout(3000)
    sock.once('connect', () => { console.log(`[TCP] Connected to ${host}:${port}`); sock.destroy(); resolve() })
    sock.once('timeout', () => { reject(new Error(`[TCP] Timeout connecting to ${host}:${port}`)) })
    sock.once('error', (e) => { reject(new Error(`[TCP] Error: ${(e as any).code || e}`)) })
    sock.connect(port, host)
  }).catch((e) => { console.error(String(e)); })

  const client = await externalPool.connect()
  try {
    const res = await client.query('SELECT NOW() as now')
    console.log('Connected. NOW() =', res.rows?.[0]?.now)
    const who = await client.query('SELECT inet_server_addr()::text AS addr, inet_server_port() AS port, version()')
    console.log('Server:', who.rows?.[0])
  } finally {
    client.release()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })


