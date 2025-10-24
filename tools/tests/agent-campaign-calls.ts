#!/usr/bin/env tsx
import 'dotenv/config'

import { getUniqueAgents, getCampaignAgentReference, getAgentCallDetails, externalPool } from '../../server/external-db'

async function fetchCampaignMapping(): Promise<Record<string,string>> {
  try {
    const base = process.env.API_BASE || 'http://localhost:5000'
    const res = await fetch(`${base}/api/campaign-mapping`)
    if (!res.ok) throw new Error(`mapping http ${res.status}`)
    const data = await res.json() as any
    return data?.mapping || {}
  } catch (e) {
    console.warn('[mapping] failed to fetch via API, returning empty map')
    return {}
  }
}

async function main() {
  if (!externalPool) { console.error('External DB not configured'); process.exit(1) }

  const agentLogin = (process.argv[2] || '').trim()
  const titleLike = (process.argv[3] || '').trim() // optional title substring
  if (!agentLogin) {
    console.log('Usage: tsx tools/tests/agent-campaign-calls.ts <Agent.Login> [campaignTitleSubstring]')
    process.exit(1)
  }

  const agents = await getUniqueAgents()
  if (!agents.includes(agentLogin)) {
    console.error('Agent not found in external DB:', agentLogin)
    console.log('Known agents (first 20):', agents.slice(0,20))
    process.exit(1)
  }

  const mapping = await fetchCampaignMapping()

  const ref = await getCampaignAgentReference()
  const campaignIds = new Set<string>()
  ref.forEach(r => { if (r.transactions_user_login === agentLogin) campaignIds.add(r.contacts_campaign_id) })

  console.log(`[Agent] ${agentLogin} → ${campaignIds.size} campaign IDs`)

  const resolveTitle = (id: string) => mapping[id] || id
  const all = Array.from(campaignIds)
  const filtered = titleLike
    ? all.filter(id => resolveTitle(id).toLowerCase().includes(titleLike.toLowerCase()))
    : all
  console.log(`[Filter] titleLike='${titleLike || '(none)'}' → ${filtered.length} IDs`)

  for (const id of filtered.slice(0, 10)) { // cap for output
    const rows = await getAgentCallDetails(agentLogin, id, undefined, undefined, 0)
    console.log(`- ${id} | ${resolveTitle(id)} → ${rows.length} rows`)
    if (rows.length > 0) {
      console.dir(rows.slice(0,3), { depth: null })
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })


