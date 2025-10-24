#!/usr/bin/env tsx
import 'dotenv/config'

import { getUniqueAgents, getCampaignAgentReference, externalPool } from '../../server/external-db'

async function main() {
  console.log('[CampaignsForAgents] Start')
  if (!externalPool) { console.error('External DB not configured'); process.exit(1) }

  const limitArg = Number(process.argv[2] || '5')
  console.log('Sampling first N agents from external DB:', limitArg)

  const agents = await getUniqueAgents()
  console.log('Total agents in external DB:', agents.length)
  const sampleAgents = agents.slice(0, limitArg)
  console.log('Sample agents:', sampleAgents)

  const ref = await getCampaignAgentReference()
  console.log('Reference rows:', ref.length)

  const map = new Map<string, Set<string>>()
  sampleAgents.forEach(a => map.set(a, new Set()))
  ref.forEach(r => { if (map.has(r.transactions_user_login)) map.get(r.transactions_user_login)!.add(r.contacts_campaign_id) })

  const report = Array.from(map.entries()).map(([agent, set]) => ({ agent, campaigns: Array.from(set).sort() }))
  console.log('Agents -> Campaign IDs:')
  report.forEach(r => console.log(`- ${r.agent}: ${r.campaigns.length} campaigns`))
  console.dir(report.slice(0, 3), { depth: null })
}

main().catch((e) => { console.error(e); process.exit(1) })


