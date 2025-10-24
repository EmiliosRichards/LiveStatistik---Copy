#!/usr/bin/env tsx
import 'dotenv/config'

import { storage } from '../../server/storage'

async function main() {
  const agentLogins = process.argv.slice(2)
  const dateFrom = process.env.TEST_DATE_FROM || undefined
  const dateTo = process.env.TEST_DATE_TO || undefined
  if (agentLogins.length === 0) {
    console.log('Usage: tsx tools/tests/stats-for-agents.ts <Agent.Login> [more Agent.Login...]')
    console.log('Optionally set TEST_DATE_FROM, TEST_DATE_TO (yyyy-mm-dd)')
    process.exit(1)
  }

  // Ensure storage initialized and agents/projects loaded
  const allAgents = await storage.getAllAgents()
  const mapLoginToId = new Map<string, string>()
  allAgents.forEach(a => mapLoginToId.set(a.name, a.id))

  const agentIds = agentLogins.map(a => mapLoginToId.get(a)).filter(Boolean) as string[]
  console.log('Resolved agent IDs:', agentIds.length, agentIds)

  const stats = await storage.getAgentStatistics({ agentIds, dateFrom, dateTo })
  console.log('Stats rows:', stats.length)
  console.dir(stats.slice(0, 5), { depth: null })
}

main().catch((e) => { console.error(e); process.exit(1) })


