/*
  Compare campaign sources end-to-end.
  Usage: npm run diff:campaigns
  Outputs:
    - Count and samples from DB (/api/projects)
    - Mapping size (/api/campaign-mapping)
    - Google Sheet rows (if enabled)
    - Join diagnostics: percent matched by id/title, examples of unmatched
*/
import 'dotenv/config'

type APIProject = { id: string; name: string; isActive: boolean; originalId?: string; status?: string }

async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' as any })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json() as any
}

async function main() {
  const base = process.env.VERIFY_BASE_URL || 'http://localhost:5000'
  console.log('Base:', base)

  const projects = await fetchJson<APIProject[]>(`${base}/api/projects`)
  const mappingResponse = await fetchJson<any>(`${base}/api/campaign-mapping`)
  const mapping = mappingResponse?.mapping || {}
  const sheetRows: Array<{campaign:string;campaign_id:string;status?:string}> = mappingResponse?.rows || []

  console.log('\nDB projects:', projects.length)
  console.table(projects.slice(0,5))
  console.log('Mapping size:', Object.keys(mapping).length)
  console.log('Sheet rows:', sheetRows.length)

  // Build helpers
  const statusById = new Map(sheetRows.map(r => [r.campaign_id, r.status || '']))
  const statusByTitle = new Map(sheetRows.map(r => [r.campaign, r.status || '']))

  // Evaluate joins
  let byIdMatches = 0, byTitleMatches = 0
  const unmatched: APIProject[] = []
  for (const p of projects) {
    const resolved = mapping[p.name] || p.name
    const s1 = statusById.get(p.name)
    const s2 = statusByTitle.get(resolved)
    if (s1) byIdMatches++
    else if (s2) byTitleMatches++
    else unmatched.push(p)
  }

  const pct = (n:number, d:number) => d===0? '0%': `${((n/d)*100).toFixed(1)}%`
  console.log('\nJoin coverage:')
  console.table({
    by_campaign_id: `${byIdMatches}/${projects.length} (${pct(byIdMatches, projects.length)})`,
    by_resolved_title: `${byTitleMatches}/${projects.length} (${pct(byTitleMatches, projects.length)})`,
    unmatched: unmatched.length
  })

  if (unmatched.length > 0) {
    console.log('\nUnmatched samples (first 10):')
    const rows = unmatched.slice(0,10).map(p => ({
      project_name: p.name,
      resolved: mapping[p.name] || p.name,
    }))
    console.table(rows)
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('diff-campaign-sources failed:', err)
  process.exit(1)
})


