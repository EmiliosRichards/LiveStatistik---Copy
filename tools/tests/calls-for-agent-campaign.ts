#!/usr/bin/env tsx
import 'dotenv/config'

import { externalPool, getAgentCallDetails } from '../../server/external-db'

async function main() {
  if (!externalPool) { console.error('External DB not configured'); process.exit(1) }

  const agent = (process.argv[2] || '').trim()
  const campaignId = (process.argv[3] || '').trim()
  const dateFrom = (process.argv[4] || '').trim() || undefined
  const dateTo = (process.argv[5] || '').trim() || undefined

  if (!agent || !campaignId) {
    console.log('Usage: tsx tools/tests/calls-for-agent-campaign.ts <agentLogin> <campaignId> [dateFrom yyyy-mm-dd] [dateTo yyyy-mm-dd]')
    process.exit(1)
  }

  console.log('[CallsForAgentCampaign] agent=', agent, 'campaignId=', campaignId, 'dateFrom=', dateFrom, 'dateTo=', dateTo)
  const rows = await getAgentCallDetails(agent, campaignId, dateFrom, dateTo, 0)
  console.log('Rows:', rows.length)
  console.dir(rows.slice(0, 5), { depth: null })
}

main().catch((e) => { console.error(e); process.exit(1) })


