#!/usr/bin/env node

// Standalone CLI to query local Express API and print stats
// Usage examples:
//   node tools/search-cli.mjs --from 2025-09-01 --to 2025-09-05 --agents a1,a2 --view overview
//   node tools/search-cli.mjs --from 2025-09-01 --to 2025-09-05 --agents a1 --view details

import process from 'process'

const API = process.env.EXPRESS_BASE_URL || 'http://localhost:5000'

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    const next = argv[i + 1]
    if (key.startsWith('--')) {
      const k = key.slice(2)
      if (!next || next.startsWith('--')) {
        args[k] = true
      } else {
        args[k] = next
        i++
      }
    }
  }
  // Fallback: positional args [from, to, agentNames]
  if (!args.from && argv[2] && !String(argv[2]).startsWith('--')) args.from = argv[2]
  if (!args.to && argv[3] && !String(argv[3]).startsWith('--')) args.to = argv[3]
  if (!args.agents && !args.agentNames && argv[4] && !String(argv[4]).startsWith('--')) args.agentNames = argv[4]
  if (!args.view && argv[5] && !String(argv[5]).startsWith('--')) args.view = argv[5]
  return args
}

function printHelp() {
  console.log(`Usage: node tools/search-cli.mjs --from YYYY-MM-DD --to YYYY-MM-DD --agents ID1,ID2 [--projects PID1,PID2] [--view overview|details]`)
  console.log(`Env: EXPRESS_BASE_URL to override API base (default ${API})`)
}

function tab(str, n = 2) {
  return ' '.repeat(n) + str
}

function toFixed(n, d = 2) {
  return Number(n || 0).toFixed(d)
}

async function main() {
  const args = parseArgs(process.argv)
  const hasAgents = !!(args.agents || args.agentNames || args['agent-names'])
  if (args.help || !args.from || !args.to || !hasAgents) {
    printHelp()
    console.log('\nYou can specify agents by ID with --agents, or by login names with --agentNames.')
    console.log('Examples:')
    console.log('  node tools/search-cli.mjs --from 2025-07-23 --to 2025-10-23 --agentNames Alisha.Rzepka --view details')
    console.log('  node tools/search-cli.mjs 2025-07-23 2025-10-23 Alisha.Rzepka')
    process.exit(args.help ? 0 : 1)
  }

  const view = (String(args.view || '').toLowerCase() === 'overview' ? 'overview' : 'details')
  let agentIds = args.agents ? args.agents.split(',').map(s => s.trim()).filter(Boolean) : []
  const agentNames = args.agentNames || args['agent-names']
    ? String(args.agentNames || args['agent-names']).split(',').map(s => s.trim()).filter(Boolean)
    : []
  const projectIds = args.projects ? args.projects.split(',').map(s => s.trim()).filter(Boolean) : undefined

  const body = {
    agentIds,
    projectIds,
    dateFrom: args.from,
    dateTo: args.to,
  }

  // Resolve agent names to IDs if provided
  if (agentIds.length === 0 && agentNames.length > 0) {
    const agentsRes = await fetch(`${API}/api/agents`)
    if (!agentsRes.ok) {
      console.error(`Failed to load agents list: ${agentsRes.status} ${agentsRes.statusText}`)
      process.exit(2)
    }
    const agents = await agentsRes.json()
    const nameToId = new Map()
    agents.forEach((a) => nameToId.set(String(a.name).toLowerCase(), a.id))
    const resolved = []
    for (const nm of agentNames) {
      const id = nameToId.get(nm.toLowerCase())
      if (!id) {
        console.error(`Agent not found: ${nm}`)
        process.exit(2)
      }
      resolved.push(id)
    }
    body.agentIds = resolved
    agentIds = resolved
  }

  if (!body.agentIds || body.agentIds.length === 0) {
    console.error('No agents specified. Use --agents ID1,ID2 or --agentNames name1,name2')
    process.exit(1)
  }

  const res = await fetch(`${API}/api/statistics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    console.error(`Request failed: ${res.status} ${res.statusText}`)
    process.exit(2)
  }
  const stats = await res.json()

  // Build id -> name maps
  const agentsRes = await fetch(`${API}/api/agents`)
  const agents = await agentsRes.json()
  const agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]))

  const projectsRes = await fetch(`${API}/api/projects`)
  const projects = await projectsRes.json()
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]))

  if (view === 'overview') {
    // Aggregate per agent
    const byAgent = new Map()
    for (const s of stats) {
      const a = byAgent.get(s.agentId) || { anzahl: 0, abgeschlossen: 0, erfolgreich: 0, gz: 0 }
      a.anzahl += s.anzahl
      a.abgeschlossen += s.abgeschlossen
      a.erfolgreich += s.erfolgreich
      a.gz += s.gespraechszeit
      byAgent.set(s.agentId, a)
    }
    console.log(`Overview (${args.from} to ${args.to})`)
    for (const [aid, agg] of byAgent.entries()) {
      const name = agentMap[aid] || aid
      const reach = agg.anzahl > 0 ? (agg.abgeschlossen / agg.anzahl) * 100 : 0
      // gz is hours. Average duration per completed call in minutes = (GZ_hours / completed) * 60
      const avg = agg.abgeschlossen > 0 ? (agg.gz / agg.abgeschlossen) * 60 : 0
      console.log(`- ${name}`)
      console.log(tab(`Total Calls: ${agg.anzahl}`))
      console.log(tab(`Reach %: ${toFixed(reach, 1)}`))
      console.log(tab(`Positive Outcomes: ${agg.erfolgreich}`))
      console.log(tab(`Avg Duration (min): ${toFixed(avg, 2)}`))
    }
  } else {
    // Details per agent+project
    console.log(`Details (${args.from} to ${args.to})`)
    const byKey = new Map()
    for (const s of stats) {
      const k = `${s.agentId}-${s.projectId}`
      const agg = byKey.get(k) || { anzahl: 0, abgeschlossen: 0, erfolgreich: 0, wz: 0, gz: 0, nbz: 0, vbz: 0, az: 0 }
      agg.anzahl += s.anzahl
      agg.abgeschlossen += s.abgeschlossen
      agg.erfolgreich += s.erfolgreich
      agg.wz += s.wartezeit
      agg.gz += s.gespraechszeit
      agg.nbz += s.nachbearbeitungszeit
      agg.vbz += s.vorbereitungszeit
      agg.az += s.arbeitszeit
      byKey.set(k, agg)
    }
    for (const [key, agg] of byKey.entries()) {
      const [aid, pid] = key.split('-')
      const aname = agentMap[aid] || aid
      const pname = projectMap[pid] || pid
      const erfolgH = agg.erfolgreich / 7.5
      console.log(`- ${aname} | ${pname}`)
      console.log(tab(`Anzahl: ${agg.anzahl}`))
      console.log(tab(`abgeschlossen: ${agg.abgeschlossen}`))
      console.log(tab(`erfolgreich: ${agg.erfolgreich}`))
      console.log(tab(`WZ (h): ${toFixed(agg.wz)}`))
      console.log(tab(`GZ (h): ${toFixed(agg.gz)}`))
      console.log(tab(`NBZ (h): ${toFixed(agg.nbz)}`))
      console.log(tab(`VBZ (h): ${toFixed(agg.vbz)}`))
      console.log(tab(`Erfolg/h: ${toFixed(erfolgH)}`))
      console.log(tab(`AZ (h): ${toFixed(agg.az)}`))
    }
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(3)
})


